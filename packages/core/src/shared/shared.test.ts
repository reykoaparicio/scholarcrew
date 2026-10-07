import { parseKeyring } from "../crypto";

import { devOutbox, eq } from "@scholarcrew/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  calendarShort,
  createFakeStripeGateway,
  createTestDeps,
  currentAwardYear,
  currentSeason,
  devOutboxEmailSender,
  errorLabel,
  fixedClock,
  instantInZone,
  isUuid,
  localTimeParts,
  monthKey,
  nextMonthStartUtc,
  resendEmailSender,
  safeTimeZone,
  systemClock,
  toIso,
  toIsoOrNull,
  todayIn,
} from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clocks", () => {
  it("fixedClock returns the set instant and can move", () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-10-06T15:00:00.000Z");
    clock.set("2026-10-07T00:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });

  it("systemClock reads the real time", () => {
    const before = Date.now();
    expect(systemClock().now().getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("dates", () => {
  it("follows the season: the award year of currentSeason, rolling on August 1 (R3V-7)", () => {
    expect(currentAwardYear(new Date("2026-07-31T23:59:59.000Z"))).toBe("2026-27");
    expect(currentAwardYear(new Date("2026-08-01T00:00:00.000Z"))).toBe("2027-28");
    expect(currentAwardYear(new Date("2026-08-15T12:00:00.000Z"))).toBe("2027-28");
    expect(currentAwardYear(new Date("2026-10-06T15:00:00.000Z"))).toBe("2027-28");
  });

  it("rolls the season on August 1", () => {
    expect(currentSeason(new Date("2026-10-06T15:00:00.000Z"))).toBe("2026-27");
    expect(currentSeason(new Date("2026-07-31T23:59:59.000Z"))).toBe("2025-26");
    expect(currentSeason(new Date("2026-08-01T00:00:00.000Z"))).toBe("2026-27");
    expect(currentSeason(new Date("2099-09-01T00:00:00.000Z"))).toBe("2099-00");
  });

  it("formats instants and months", () => {
    const d = new Date("2026-10-06T15:00:00.000Z");
    expect(toIso(d)).toBe("2026-10-06T15:00:00.000Z");
    expect(toIsoOrNull(null)).toBeNull();
    expect(toIsoOrNull(d)).toBe("2026-10-06T15:00:00.000Z");
    expect(monthKey(d)).toBe("2026-10");
    expect(addDays(d, 1).toISOString()).toBe("2026-10-07T15:00:00.000Z");
  });

  it("reads local wall-clock time in a time zone", () => {
    expect(localTimeParts(new Date("2026-10-06T15:00:00.000Z"), "America/Chicago")).toEqual({
      hour: 10,
      minute: 0,
      second: 0,
    });
    expect(localTimeParts(new Date("2026-10-07T03:30:00.000Z"), "America/Chicago").hour).toBe(22);
  });

  it("recognizes uuids", () => {
    expect(isUuid("6f1c2a0e-9b7d-4c1e-8f00-1a2b3c4d5e6f")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("reads today in a time zone (R3V-9)", () => {
    expect(todayIn(new Date("2026-10-07T03:00:00.000Z"), "America/Chicago")).toBe("2026-10-06");
    expect(todayIn(new Date("2026-10-07T03:00:00.000Z"), "UTC")).toBe("2026-10-07");
  });

  it("writes message dates like the web screens (R3E-8)", () => {
    expect(calendarShort("2026-10-15")).toBe("Oct 15");
    expect(calendarShort("2027-01-01")).toBe("Jan 1");
    expect(instantInZone(new Date("2026-10-21T01:00:00.000Z"), "America/Chicago")).toBe("Oct 20, 2026, 8:00 PM CDT");
    expect(instantInZone(new Date("2026-12-01T15:30:00.000Z"), "America/New_York")).toBe("Dec 1, 2026, 10:30 AM EST");
  });
});

describe("email senders", () => {
  it("devOutboxEmailSender writes the message to dev_outbox", async () => {
    const deps = createTestDeps();
    await devOutboxEmailSender(deps.db).send({ to: "Maya@Example.test", subject: "Hi", text: "Body" });
    const rows = await deps.db.select().from(devOutbox).where(eq(devOutbox.to, "maya@example.test"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject).toBe("Hi");
  });

  it("resendEmailSender posts to the Resend API", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await resendEmailSender("re_key", "ScholarCrew <crew@scholarcrew.example>").send({
      to: "maya@example.test",
      subject: "Hi",
      text: "Body",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", {
      method: "POST",
      signal: expect.any(AbortSignal),
      headers: { authorization: "Bearer re_key", "content-type": "application/json" },
      body: JSON.stringify({
        from: "ScholarCrew <crew@scholarcrew.example>",
        to: ["maya@example.test"],
        subject: "Hi",
        text: "Body",
      }),
    });
  });

  it("flattens newlines in subjects for both senders (R3E-10)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await resendEmailSender("re_key", "x@example.test").send({
      to: "a@example.test",
      subject: "Maya\r\ninvited you",
      text: "t",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body)).subject).toBe("Maya invited you");
    const deps = createTestDeps();
    await devOutboxEmailSender(deps.db).send({ to: "b@example.test", subject: "Maya\ninvited\r\n\nyou", text: "t" });
    const [row] = await deps.db.select().from(devOutbox).where(eq(devOutbox.to, "b@example.test"));
    expect(row?.subject).toBe("Maya invited you");
  });

  it("throws internal when Resend rejects the message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad", { status: 422 })),
    );
    await expect(
      resendEmailSender("re_key", "x@example.test").send({ to: "a@example.test", subject: "s", text: "t" }),
    ).rejects.toMatchObject({ code: "internal" });
  });
});

describe("createTestDeps", () => {
  it("wires the test defaults", async () => {
    const deps = createTestDeps();
    expect(deps.clock.now().toISOString()).toBe("2026-10-06T15:00:00.000Z");
    expect(deps.config).toEqual({
      appUrl: "http://localhost:3000",
      keyring: parseKeyring({ ENCRYPTION_KEY: "07".repeat(32) }),
      sessionDays: 30,
      stripePriceFamily: "price_family_test",
      stripePriceSeason: "price_season_test",
      stripeWebhookSecret: "whsec_test",
    });
    await deps.jobs.enqueue("sweep.weekly", {});
    expect(deps.jobs.sent).toEqual([{ name: "sweep.weekly", payload: {} }]);
  });

  it("accepts overrides", () => {
    const deps = createTestDeps({ clock: fixedClock("2027-01-01T00:00:00.000Z"), stripe: null });
    expect(deps.clock.now().getUTCFullYear()).toBe(2027);
    expect(deps.stripe).toBeNull();
  });
});

describe("createFakeStripeGateway", () => {
  it("records checkout sessions, portal sessions, and cancellations", async () => {
    const fake = createFakeStripeGateway();
    const checkout = await fake.createCheckoutSession({
      customerEmail: "maya@example.test",
      priceId: "price_family_test",
      mode: "subscription",
      successUrl: "http://localhost:3000/settings?billing=success",
      cancelUrl: "http://localhost:3000/settings?billing=cancel",
      clientReferenceId: "u1",
    });
    const portal = await fake.createPortalSession({ customerId: "cus_1", returnUrl: "http://localhost:3000/settings" });
    expect(checkout.url).toBe("https://checkout.stripe.test/session/1");
    expect(portal.url).toBe("https://billing.stripe.test/portal/1");
    expect(fake.checkouts[0]?.priceId).toBe("price_family_test");
    expect(fake.portals[0]?.customerId).toBe("cus_1");
    await fake.cancelSubscription("sub_1");
    expect(fake.canceled).toEqual(["sub_1"]);
  });
});

describe("safe driver logs", () => {
  it("includes only safe driver fields", () => {
    const label = errorLabel({
      code: "23505",
      constraint: "users_email_unique",
      table: "users",
      message: "Key (email)=(private@example.test) already exists",
    });
    expect(label).toContain("23505");
    expect(label).not.toContain("@");
  });
});
