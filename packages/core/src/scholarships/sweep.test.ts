import { and, eq, notifications, profiles, scholarshipApplications, sweepRuns } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { systemActor } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { lastSweep, runSweep } from "./sweep";
import { makeParentOf, makeStudent, setup } from "./testkit";

const system = systemActor("test");
let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

const essayReq = (prompt: string) => ({
  essays: [{ prompt, wordLimit: 400 }],
  recommendations: 0,
  transcript: false,
  serviceHours: null,
  other: [],
});

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps, { state: "TX", county: "Maple" });
});

async function seed() {
  const { db } = ctx.deps;
  const a = await factories.scholarship(db, { name: "A", amountMaxUsd: 1000 });
  const b = await factories.scholarship(db, {
    name: "B",
    amountMaxUsd: 2500,
    requirements: essayReq("A service moment"),
  });
  const scam = await factories.scholarship(db, { name: "Scam", scamFlags: ["application_fee"] });
  await factories.scholarship(db, {
    name: "Ineligible scam",
    scamFlags: ["sweepstakes"],
    eligibility: [{ type: "gpa_min", min: 3.9 }],
  });
  await factories.story(db, student.user.id, { themes: ["service"] });
  return { a, b, scam };
}

describe("runSweep", () => {
  it("adds matched applications, counts hidden scams, records the run, and notifies once", async () => {
    const { scam } = await seed();
    const result = await runSweep(ctx.deps, system, student.user.id);
    expect(result).toEqual({
      studentId: student.user.id,
      ranAt: "2026-10-06T15:00:00.000Z",
      newMatches: 2,
      totalUsd: 3500,
      reuseCount: 1,
      hiddenScams: 1,
    });
    const apps = await ctx.deps.db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.ownerId, student.user.id));
    expect(apps).toHaveLength(2);
    expect(apps.every((x) => x.stage === "matched")).toBe(true);
    const runs = await ctx.deps.db.select().from(sweepRuns).where(eq(sweepRuns.ownerId, student.user.id));
    expect(runs[0]?.hiddenScholarshipIds).toEqual([scam.id]);
    const notes = await ctx.deps.db.select().from(notifications).where(eq(notifications.userId, student.user.id));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: "new_matches", dedupeKey: `sweep:${student.user.id}:2026-10-06` });
  });

  it("is idempotent: a second run adds nothing and sends no second notification", async () => {
    await seed();
    await runSweep(ctx.deps, system, student.user.id);
    const again = await runSweep(ctx.deps, system, student.user.id);
    expect(again).toMatchObject({ newMatches: 0, totalUsd: 0, reuseCount: 0, hiddenScams: 1 });
    const apps = await ctx.deps.db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.ownerId, student.user.id));
    expect(apps).toHaveLength(2);
    const notes = await ctx.deps.db.select().from(notifications).where(eq(notifications.userId, student.user.id));
    expect(notes).toHaveLength(1);
    expect(await ctx.deps.db.select().from(sweepRuns).where(eq(sweepRuns.ownerId, student.user.id))).toHaveLength(1);
  });

  it("keeps existing applications and notifies again the next week", async () => {
    const { a } = await seed();
    await ctx.deps.db
      .insert(scholarshipApplications)
      .values({ ownerId: student.user.id, scholarshipId: a.id, stage: "planned" });
    expect((await runSweep(ctx.deps, system, student.user.id)).newMatches).toBe(1);
    const [saved] = await ctx.deps.db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.scholarshipId, a.id));
    expect(saved?.stage).toBe("planned");
    ctx.clock.set("2026-10-13T15:00:00.000Z");
    await factories.scholarship(ctx.deps.db, { name: "C" });
    expect((await runSweep(ctx.deps, system, student.user.id)).newMatches).toBe(1);
    const notes = await ctx.deps.db.select().from(notifications).where(eq(notifications.userId, student.user.id));
    expect(notes.map((n) => n.dedupeKey).sort()).toEqual([
      `sweep:${student.user.id}:2026-10-06`,
      `sweep:${student.user.id}:2026-10-13`,
    ]);
  });

  it("notifies for an onboarding sweep and the Sunday sweep of the same week (R2P-21)", async () => {
    await seed();
    ctx.clock.set("2026-10-07T15:00:00.000Z"); // Wednesday, 10:00 in Chicago
    expect((await runSweep(ctx.deps, system, student.user.id)).newMatches).toBe(2);
    await factories.scholarship(ctx.deps.db, { name: "C" });
    ctx.clock.set("2026-10-11T14:00:00.000Z"); // Sunday, 09:00 in Chicago, the same Monday-start week
    expect((await runSweep(ctx.deps, system, student.user.id)).newMatches).toBe(1);
    const notes = await ctx.deps.db.select().from(notifications).where(eq(notifications.userId, student.user.id));
    expect(notes.map((n) => n.dedupeKey).sort()).toEqual([
      `sweep:${student.user.id}:2026-10-07`,
      `sweep:${student.user.id}:2026-10-11`,
    ]);
  });

  it("refreshes reasons and fit on open applications saved before the profile changed (R2P-3)", async () => {
    const { db } = ctx.deps;
    const cedar = { national: false, state: "TX" as const, counties: ["Cedar"], cities: [] };
    const listing = await factories.scholarship(db, {
      name: "Cedar Rotary",
      localArea: cedar,
      eligibility: [{ type: "county_in", state: "TX", counties: ["Cedar"] }],
    });
    const past = await factories.scholarship(db, {
      name: "Cedar Old",
      localArea: cedar,
      eligibility: [{ type: "county_in", state: "TX", counties: ["Cedar"] }],
    });
    await db.insert(scholarshipApplications).values([
      { ownerId: student.user.id, scholarshipId: listing.id, stage: "planned" },
      { ownerId: student.user.id, scholarshipId: past.id, stage: "submitted" },
    ]);
    await db.update(profiles).set({ county: "Cedar" }).where(eq(profiles.userId, student.user.id));
    await runSweep(ctx.deps, system, student.user.id);
    const [saved] = await db
      .select()
      .from(scholarshipApplications)
      .where(
        and(
          eq(scholarshipApplications.ownerId, student.user.id),
          eq(scholarshipApplications.scholarshipId, listing.id),
        ),
      );
    expect(saved?.stage).toBe("planned");
    expect(saved?.matchReasons.map((r) => r.code)).toContain("local_county");
    expect(saved?.fitScore).toBeGreaterThan(0);
    const [submitted] = await db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.scholarshipId, past.id));
    expect(submitted).toMatchObject({ stage: "submitted", matchReasons: [], fitScore: 0 });
  });

  it("is system only", async () => {
    await expect(runSweep(ctx.deps, student.actor, student.user.id)).rejects.toThrow();
  });
});

describe("lastSweep", () => {
  it("returns the newest run for the owner and sharing parents, null before any run", async () => {
    expect(await lastSweep(ctx.deps, student.actor, student.user.id)).toBeNull();
    await seed();
    await runSweep(ctx.deps, system, student.user.id);
    ctx.clock.set("2026-10-07T15:00:00.000Z");
    await runSweep(ctx.deps, system, student.user.id);
    expect(await lastSweep(ctx.deps, student.actor, student.user.id)).toEqual({
      ranAt: "2026-10-07T15:00:00.000Z",
      newMatches: 0,
      totalUsd: 0,
      reuseCount: 0,
      hiddenScams: 1,
    });
    const parent = await makeParentOf(ctx.deps, student.user.id);
    expect((await lastSweep(ctx.deps, parent.actor, student.user.id))?.hiddenScams).toBe(1);
    const other = await makeStudent(ctx.deps);
    await expect(lastSweep(ctx.deps, other.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
