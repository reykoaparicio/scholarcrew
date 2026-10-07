import { createHmac } from "node:crypto";
import { setDepsForTests } from "@/server/deps";
import { sponsorCodes, subscriptions } from "@scholarcrew/db";
import type { BillingView, Subscription } from "@scholarcrew/domain";
import { NO_PARAMS, errorOf, fakeStripe, readJson, request, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { POST as checkout } from "./checkout/route";
import { POST as portal } from "./portal/route";
import { GET as getBilling } from "./route";
import { POST as redeem } from "./sponsor-code/route";
import { POST as webhook } from "./webhook/route";

const deps = useTestDeps();

function stripeSignature(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
}

function webhookRequest(payload: string, signature?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["stripe-signature"] = signature;
  return request("/billing/webhook", { method: "POST", origin: null, body: payload, headers });
}

function checkoutCompleted(userId: string): string {
  return JSON.stringify({
    id: "evt_test_1",
    created: 1791298800,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        mode: "subscription",
        payment_status: "paid",
        client_reference_id: userId,
        customer: "cus_test_1",
        subscription: "sub_test_1",
      },
    },
  });
}

async function billing(cookie: string): Promise<BillingView> {
  return readJson<BillingView>(await getBilling(request("/billing", { cookie }), NO_PARAMS));
}

describe("GET /billing", () => {
  it("returns the subscription and this month's usage", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const view = await billing(cookie);
    expect(view.subscription).toMatchObject({ plan: "free", status: "active", managedByStripe: false });
    expect(view.usage).toEqual({ month: "2026-10", crewRequests: 0, limit: 20, costMicros: 0 });
  });
});

describe("checkout and portal", () => {
  it("starts Stripe Checkout with the plan's price (BI-02, BI-03)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const start = (plan: string) =>
      checkout(request("/billing/checkout", { method: "POST", cookie, body: { plan } }), NO_PARAMS);
    const family = await start("family");
    expect(await family.json()).toEqual({ url: "https://checkout.stripe.test/session/1" });
    await start("season_pass");
    const calls = fakeStripe(deps()).checkouts;
    expect(calls[0]).toMatchObject({
      priceId: "price_family_test",
      mode: "subscription",
      clientReferenceId: user.id,
      customerEmail: user.email,
      successUrl: "http://localhost:3000/settings?billing=success",
    });
    expect(calls[1]).toMatchObject({ priceId: "price_season_test", mode: "payment" });
    expect((await start("free")).status).toBe(400);
  });

  it("explains when billing isn't configured", async () => {
    const { cookie } = await signedInStudent(deps().db);
    setDepsForTests({ ...deps(), stripe: null });
    const res = await checkout(
      request("/billing/checkout", { method: "POST", cookie, body: { plan: "family" } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(500);
    expect(await errorOf(res)).toEqual({ code: "internal", message: "Billing isn't set up" });
  });

  it("opens the customer portal only for Stripe customers (BI-04)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const open = () => portal(request("/billing/portal", { method: "POST", cookie }), NO_PARAMS);
    expect((await open()).status).toBe(400);
    await deps()
      .db.insert(subscriptions)
      .values({ ownerId: user.id, plan: "family", status: "active", stripeCustomerId: "cus_1" });
    expect(await (await open()).json()).toEqual({ url: "https://billing.stripe.test/portal/1" });
    expect(fakeStripe(deps()).portals[0]?.customerId).toBe("cus_1");
  });
});

describe("POST /billing/webhook", () => {
  it("rejects missing and bad signatures with 400", async () => {
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "ping", data: { object: {} } });
    expect((await webhook(webhookRequest(payload), NO_PARAMS)).status).toBe(400);
    const bad = await webhook(webhookRequest(payload, "t=1,v1=deadbeef"), NO_PARAMS);
    expect(bad.status).toBe(400);
    expect((await errorOf(bad)).code).toBe("invalid_input");
  });

  it("applies a signed checkout.session.completed event", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const payload = checkoutCompleted(user.id);
    const res = await webhook(webhookRequest(payload, stripeSignature(payload, "whsec_test")), NO_PARAMS);
    expect(res.status).toBe(204);
    expect((await billing(cookie)).subscription).toMatchObject({
      plan: "family",
      status: "active",
      managedByStripe: true,
    });
  });

  it("doesn't exist while STRIPE_WEBHOOK_SECRET is empty, so events signed with an empty key do nothing", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    setDepsForTests({ ...deps(), config: { ...deps().config, stripeWebhookSecret: "" } });
    const payload = checkoutCompleted(user.id);
    const res = await webhook(webhookRequest(payload, stripeSignature(payload, "")), NO_PARAMS);
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe("not_found");
    expect((await billing(cookie)).subscription).toMatchObject({ plan: "free", managedByStripe: false });
  });
});

describe("POST /billing/sponsor-code", () => {
  it("grants the sponsor's plan once (BI-05)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    await deps()
      .db.insert(sponsorCodes)
      .values({
        code: "MAPLE-2026",
        sponsorName: "Maple ISD",
        plan: "family",
        seatsTotal: 5,
        expiresAt: new Date("2027-06-01T00:00:00.000Z"),
      });
    const use = (code: string, c = cookie) =>
      redeem(request("/billing/sponsor-code", { method: "POST", cookie: c, body: { code } }), NO_PARAMS);
    const res = await use("MAPLE-2026");
    expect(res.status).toBe(200);
    expect((await readJson<Subscription>(res)).plan).toBe("family");
    expect((await use("MAPLE-2026")).status).toBe(409);
    const other = await signedInStudent(deps().db);
    expect((await use("NOPE-1234", other.cookie)).status).toBe(404);
  });

  it("limits code guesses to 10 an hour (SE-04)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await redeem(
        request("/billing/sponsor-code", { method: "POST", cookie, body: { code: `GUESS-${i}` } }),
        NO_PARAMS,
      );
      statuses.push(res.status);
    }
    expect(statuses).toEqual([404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 429]);
  });
});
