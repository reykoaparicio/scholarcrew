import { eq, sponsorCodes, subscriptions, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { type FakeStripeGateway, createTestDeps, fixedClock } from "../shared";
import {
  applyStripeEvent,
  createCheckout,
  createPortal,
  parseStripeWebhook,
  planFor,
  redeemSponsorCode,
  seasonPassEnd,
} from "./index";
import { ownSubscription } from "./plans";

let eventNumber = 0;
const event = (type: string, object: Record<string, unknown>) => ({
  id: `evt_${++eventNumber}`,
  created: 1791298800,
  type,
  data: { object: { payment_status: "paid", ...object } },
});

describe("checkout and portal", () => {
  it("creates a subscription checkout for Family and a payment for the season pass", async () => {
    const deps = createTestDeps();
    const fake = deps.stripe as FakeStripeGateway;
    const parent = await factories.parent(deps.db);
    expect(await createCheckout(deps, actorOf(parent), { plan: "family" })).toEqual({
      url: "https://checkout.stripe.test/session/1",
    });
    expect(fake.checkouts[0]).toEqual({
      customerEmail: parent.email,
      priceId: "price_family_test",
      mode: "subscription",
      successUrl: "http://localhost:3000/settings?billing=success",
      cancelUrl: "http://localhost:3000/settings?billing=cancel",
      clientReferenceId: parent.id,
    });
    await createCheckout(deps, actorOf(parent), { plan: "season_pass" });
    expect(fake.checkouts[1]).toMatchObject({ priceId: "price_season_test", mode: "payment" });
  });

  it("refuses checkout when already paid or when billing is off", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await expect(
      createCheckout(createTestDeps({ stripe: null }), actorOf(parent), { plan: "family" }),
    ).rejects.toMatchObject({
      code: "internal",
    });
    await deps.db.insert(subscriptions).values({ ownerId: parent.id, plan: "family", status: "active" });
    await expect(createCheckout(deps, actorOf(parent), { plan: "family" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("opens the customer portal only for Stripe customers", async () => {
    const deps = createTestDeps();
    const fake = deps.stripe as FakeStripeGateway;
    const parent = await factories.parent(deps.db);
    await expect(createPortal(deps, actorOf(parent))).rejects.toMatchObject({ code: "invalid_input" });
    await deps.db.insert(subscriptions).values({ ownerId: parent.id, plan: "family", stripeCustomerId: "cus_1" });
    expect((await createPortal(deps, actorOf(parent))).url).toBe("https://billing.stripe.test/portal/1");
    expect(fake.portals[0]).toEqual({ customerId: "cus_1", returnUrl: "http://localhost:3000/settings" });
  });
});

describe("applyStripeEvent", () => {
  it("activates the Family plan from a completed subscription checkout", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("checkout.session.completed", {
        client_reference_id: parent.id,
        mode: "subscription",
        customer: "cus_1",
        subscription: "sub_1",
      }),
    );
    const [row] = await deps.db.select().from(subscriptions).where(eq(subscriptions.ownerId, parent.id));
    expect(row).toMatchObject({
      plan: "family",
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
    expect(row).not.toHaveProperty("familyId");
    expect(await planFor(deps, parent.id)).toBe("family");
  });

  it("runs a season pass until May 31 of the season's second year", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("checkout.session.completed", { client_reference_id: user.id, mode: "payment", customer: "cus_2" }),
    );
    const [row] = await deps.db.select().from(subscriptions).where(eq(subscriptions.ownerId, user.id));
    expect(row?.currentPeriodEnd?.toISOString()).toBe("2027-05-31T23:59:59.000Z");
    expect(await planFor(deps, user.id)).toBe("season_pass");
    clock.set("2027-06-01T00:00:00.000Z");
    expect(await planFor(deps, user.id)).toBe("free");
    expect(seasonPassEnd(new Date("2027-06-15T00:00:00.000Z")).toISOString()).toBe("2028-05-31T23:59:59.000Z");
  });

  it("tracks subscription updates, failed payments, and cancellations", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await deps.db.insert(subscriptions).values({
      ownerId: parent.id,
      plan: "family",
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
    const status = async () =>
      (await deps.db.select().from(subscriptions).where(eq(subscriptions.ownerId, parent.id)))[0];
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("customer.subscription.updated", {
        id: "sub_1",
        status: "past_due",
        items: { data: [{ current_period_end: 1793923200 }] },
      }),
    );
    expect(await status()).toMatchObject({
      status: "past_due",
      currentPeriodEnd: new Date("2026-11-06T00:00:00.000Z"),
    });
    expect(await planFor(deps, parent.id)).toBe("free");
    await applyStripeEvent(deps, SYSTEM, event("customer.subscription.updated", { id: "sub_1", status: "active" }));
    expect((await status())?.status).toBe("active");
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_1" } } }),
    );
    expect((await status())?.status).toBe("past_due");
    await applyStripeEvent(deps, SYSTEM, event("customer.subscription.deleted", { id: "sub_1" }));
    expect((await status())?.status).toBe("canceled");
  });

  it.each([
    ["customer.subscription.deleted", { id: "sub_early" }, "canceled"],
    ["customer.subscription.updated", { id: "sub_early", status: "past_due" }, "past_due"],
    ["invoice.payment_failed", { subscription: "sub_early" }, "past_due"],
  ])("retries an early %s event until checkout associates the subscription", async (type, object, status) => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    const early = { ...event(type, object), created: 1791298900 };
    await expect(applyStripeEvent(deps, SYSTEM, early)).rejects.toMatchObject({ code: "internal" });
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("checkout.session.completed", {
        client_reference_id: parent.id,
        mode: "subscription",
        customer: "cus_early",
        subscription: "sub_early",
      }),
    );
    await applyStripeEvent(deps, SYSTEM, early);
    expect((await ownSubscription(deps.db, parent.id))?.status).toBe(status);
    // The same delivery is now acknowledged idempotently.
    await applyStripeEvent(deps, SYSTEM, early);
    expect((await ownSubscription(deps.db, parent.id))?.status).toBe(status);
  });

  it("acknowledges lifecycle events for a checkout refused on an inactive account", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await deps.db.update(users).set({ status: "deleted" }).where(eq(users.id, parent.id));
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("checkout.session.completed", {
        client_reference_id: parent.id,
        mode: "subscription",
        subscription: "sub_refused",
      }),
    );
    await expect(
      applyStripeEvent(
        deps,
        SYSTEM,
        event("customer.subscription.deleted", {
          id: "sub_refused",
        }),
      ),
    ).resolves.toBeUndefined();
    expect(await ownSubscription(deps.db, parent.id)).toBeUndefined();
    expect((deps.stripe as FakeStripeGateway).canceled).toEqual(["sub_refused"]);
  });

  it("ignores unknown events and unknown users, and is system-only", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await applyStripeEvent(deps, SYSTEM, event("customer.created", { id: "cus_9" }));
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("checkout.session.completed", {
        client_reference_id: "6f1c2a0e-9b7d-4c1e-8f00-1a2b3c4d5e6f",
        mode: "subscription",
      }),
    );
    expect(await deps.db.select().from(subscriptions)).toHaveLength(0);
    await expect(applyStripeEvent(deps, actorOf(parent), event("customer.created", {}))).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("parseStripeWebhook", () => {
  it("verifies the signature", () => {
    const payload = JSON.stringify({
      id: "evt_1",
      created: 1791298800,
      object: "event",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1" } },
    });
    const header = new Stripe("sk_test_signing").webhooks.generateTestHeaderString({ payload, secret: "whsec_test" });
    expect(parseStripeWebhook(payload, header, "whsec_test", "")).toEqual({
      id: "evt_1",
      created: 1791298800,
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1" } },
    });
    let code: string | undefined;
    try {
      parseStripeWebhook(payload, "t=1,v1=bad", "whsec_test", "");
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("invalid_input");
  });
});

describe("redeemSponsorCode", () => {
  it("grants the sponsored plan to a student once", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await deps.db.insert(sponsorCodes).values({
      code: "MAPLE-2026",
      sponsorName: "Maple ISD",
      plan: "family",
      seatsTotal: 2,
      expiresAt: new Date("2027-06-01T00:00:00.000Z"),
    });
    expect(await redeemSponsorCode(deps, actorOf(user), " MAPLE-2026 ")).toMatchObject({
      plan: "family",
      sponsor: "Maple ISD",
      managedByStripe: false,
    });
    const [code] = await deps.db.select().from(sponsorCodes);
    expect(code?.seatsUsed).toBe(1);
    await expect(redeemSponsorCode(deps, actorOf(user), "MAPLE-2026")).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses full, expired, and unknown codes, and non-students", async () => {
    const deps = createTestDeps();
    const { user: a } = await factories.student(deps.db);
    const { user: b } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await deps.db.insert(sponsorCodes).values([
      {
        code: "ONE-SEAT",
        sponsorName: "Lions Club",
        plan: "family",
        seatsTotal: 1,
        expiresAt: new Date("2027-06-01T00:00:00.000Z"),
      },
      {
        code: "OLD-CODE",
        sponsorName: "Lions Club",
        plan: "family",
        seatsTotal: 9,
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    await redeemSponsorCode(deps, actorOf(a), "ONE-SEAT");
    await expect(redeemSponsorCode(deps, actorOf(b), "ONE-SEAT")).rejects.toMatchObject({ code: "limit_reached" });
    await expect(redeemSponsorCode(deps, actorOf(b), "OLD-CODE")).rejects.toMatchObject({ code: "not_found" });
    await expect(redeemSponsorCode(deps, actorOf(b), "NOPE-CODE")).rejects.toMatchObject({ code: "not_found" });
    await expect(redeemSponsorCode(deps, actorOf(parent), "ONE-SEAT")).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("round 4 Stripe ordering and payment", () => {
  it("deduplicates ids, requires payment, and keeps canceled subscriptions canceled", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    const checkout = event("checkout.session.completed", {
      client_reference_id: parent.id,
      mode: "subscription",
      subscription: "sub_r4",
      customer: "cus_r4",
      payment_status: "unpaid",
    });
    await applyStripeEvent(deps, SYSTEM, checkout);
    expect((await ownSubscription(deps.db, parent.id))?.stripeSubscriptionId).not.toBe("sub_r4");
    const paid = {
      ...checkout,
      id: "evt_r4_paid",
      type: "checkout.session.async_payment_succeeded",
      data: { object: { ...checkout.data.object, payment_status: "paid" } },
    };
    await applyStripeEvent(deps, SYSTEM, paid);
    await applyStripeEvent(deps, SYSTEM, paid);
    await applyStripeEvent(deps, SYSTEM, {
      ...event("customer.subscription.deleted", { id: "sub_r4" }),
      created: paid.created + 10,
    });
    await applyStripeEvent(deps, SYSTEM, {
      ...event("customer.subscription.updated", { id: "sub_r4", status: "active" }),
      created: paid.created - 10,
    });
    await applyStripeEvent(deps, SYSTEM, { ...paid, id: "evt_r4_replay", created: paid.created + 20 });
    expect((await ownSubscription(deps.db, parent.id))?.status).toBe("canceled");
  });
  it("refuses checkout and sponsor replacement of a non-canceled Stripe subscription", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await deps.db
      .insert(subscriptions)
      .values({ ownerId: user.id, status: "past_due", stripeSubscriptionId: "sub_due" });
    await expect(createCheckout(deps, actorOf(user), { plan: "family" })).rejects.toMatchObject({ code: "conflict" });
    await deps.db.insert(sponsorCodes).values({
      code: "R4-CODE",
      sponsorName: "Test",
      plan: "family",
      seatsTotal: 1,
      expiresAt: new Date("2027-06-01"),
    });
    await expect(redeemSponsorCode(deps, actorOf(user), "R4-CODE")).rejects.toMatchObject({ code: "conflict" });
  });
  it("cancels the first live subscription before granting a second or a pass", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("checkout.session.completed", {
        client_reference_id: parent.id,
        mode: "subscription",
        subscription: "sub_first",
      }),
    );
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("checkout.session.completed", {
        client_reference_id: parent.id,
        mode: "subscription",
        subscription: "sub_second",
      }),
    );
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("checkout.session.completed", { client_reference_id: parent.id, mode: "payment" }),
    );
    expect((deps.stripe as FakeStripeGateway).canceled).toEqual(["sub_first", "sub_second"]);
    for (const id of ["sub_first", "sub_second"]) {
      await expect(
        applyStripeEvent(deps, SYSTEM, event("customer.subscription.deleted", { id })),
      ).resolves.toBeUndefined();
    }
    expect(await ownSubscription(deps.db, parent.id)).toMatchObject({
      plan: "season_pass",
      status: "active",
      stripeSubscriptionId: null,
    });
  });
});
