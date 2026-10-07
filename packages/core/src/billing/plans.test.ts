import { crewJobs, subscriptions, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { addMinutes, createTestDeps, fixedClock } from "../shared";
import { assertCrewAllowance, getSubscription, getUsage, planFor, recordUsage } from "./plans";

describe("plans", () => {
  it("puts a new user on free with 20 crew requests", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    expect(await planFor(deps, user.id)).toBe("free");
    expect(await getSubscription(deps, actorOf(user))).toEqual({
      plan: "free",
      status: "active",
      currentPeriodEnd: null,
      managedByStripe: false,
      sponsor: null,
    });
    expect(await getUsage(deps, actorOf(user))).toEqual({
      month: "2026-10",
      crewRequests: 0,
      limit: 20,
      costMicros: 0,
    });
  });

  it("covers students in a paying parent's family only", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await deps.db.insert(subscriptions).values({
      ownerId: parent.id,
      plan: "family",
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
    expect(await planFor(deps, parent.id)).toBe("family");
    expect(await planFor(deps, student.id)).toBe("family");
    expect(await planFor(deps, other.id)).toBe("free");
    expect(await getSubscription(deps, actorOf(student))).toMatchObject({ plan: "family", managedByStripe: false });
    expect(await getSubscription(deps, actorOf(parent))).toMatchObject({ plan: "family", managedByStripe: true });
    expect((await getUsage(deps, actorOf(student))).limit).toBe(300);
  });

  it("ignores past-due parent plans", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await deps.db.insert(subscriptions).values({ ownerId: parent.id, plan: "family", status: "past_due" });
    expect(await planFor(deps, student.id)).toBe("free");
  });

  it("falls back to free when a season pass has ended", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await deps.db.insert(subscriptions).values({
      ownerId: user.id,
      plan: "season_pass",
      status: "active",
      currentPeriodEnd: new Date("2026-05-31T23:59:59.000Z"),
    });
    expect(await planFor(deps, user.id)).toBe("free");
    expect(await getSubscription(deps, actorOf(user))).toMatchObject({ plan: "free", status: "expired" });
  });
});

describe("usage", () => {
  it("throws limit_reached at the monthly allowance", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await deps.db.insert(usageCounters).values({ userId: user.id, month: "2026-10", crewRequests: 19 });
    await expect(assertCrewAllowance(deps, user.id)).resolves.toBeUndefined();
    await recordUsage(deps, SYSTEM, { userId: user.id, costMicros: 1200, crewRequest: true });
    await expect(assertCrewAllowance(deps, user.id)).rejects.toMatchObject({
      code: "limit_reached",
      details: { limit: 20, used: 20 },
    });
  });

  it("counts recent queued and working jobs toward the allowance (R2C-8)", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const now = deps.clock.now();
    await deps.db.insert(usageCounters).values({ userId: user.id, month: "2026-10", crewRequests: 19 });
    const job = (
      kind: "crew_request" | "offer_parse" | "weekly_plan",
      createdAt: Date,
      status: "queued" | "working" | "ready" = "queued",
    ) => ({
      ownerId: user.id,
      usageMonth: "2026-10",
      kind,
      status,
      createdAt,
      updatedAt: createdAt,
    });
    await deps.db
      .insert(crewJobs)
      .values([
        job("offer_parse", now),
        job("weekly_plan", now, "ready"),
        job("crew_request", addMinutes(now, -120)),
        job("crew_request", now, "ready"),
      ]);
    await expect(assertCrewAllowance(deps, user.id)).resolves.toBeUndefined();
    await deps.db.insert(crewJobs).values(job("weekly_plan", addMinutes(now, -5), "working"));
    await expect(assertCrewAllowance(deps, user.id)).rejects.toMatchObject({
      code: "limit_reached",
      details: { limit: 20, used: 20 },
    });
  });

  it("is system-only to record and adds up per month", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    await expect(
      recordUsage(deps, actorOf(user), { userId: user.id, costMicros: 1, crewRequest: true }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    await recordUsage(deps, SYSTEM, { userId: user.id, costMicros: 1500, crewRequest: true });
    await recordUsage(deps, SYSTEM, { userId: user.id, costMicros: 500, crewRequest: false });
    expect(await getUsage(deps, actorOf(user))).toMatchObject({ crewRequests: 1, costMicros: 2000 });
    clock.set("2026-11-01T00:00:00.000Z");
    expect(await getUsage(deps, actorOf(user))).toMatchObject({ month: "2026-11", crewRequests: 0, costMicros: 0 });
  });
});
