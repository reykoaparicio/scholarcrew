import { scholarshipApplications, serviceLogs, testScores } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { systemActor } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { setSensitiveFact } from "../memory";
import { buildMatcherProfile, listMatches, reusableStoryIds } from "./matching";
import { makeParentOf, makeStudent, setShare, setup } from "./testkit";

const system = systemActor("test");
let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps, { state: "TX", county: "Maple", gpaX100: 372 });
});

describe("buildMatcherProfile", () => {
  it("uses the best official scores, verified hours, and enabled sensitive facts", async () => {
    const ownerId = student.user.id;
    await ctx.deps.db.insert(testScores).values([
      { ownerId, test: "ACT", takenOn: "2026-04-11", official: true, composite: 27, sections: {} },
      { ownerId, test: "ACT", takenOn: "2026-06-13", official: true, composite: 30, sections: {} },
      { ownerId, test: "ACT", takenOn: "2026-07-01", official: false, composite: 33, sections: {} },
    ]);
    await ctx.deps.db.insert(serviceLogs).values([
      {
        ownerId,
        organization: "Library",
        activity: "STEM night",
        servedOn: "2026-09-12",
        minutes: 90,
        verification: "verified",
      },
      { ownerId, organization: "Library", activity: "Setup", servedOn: "2026-09-13", minutes: 60 },
    ]);
    await setSensitiveFact(ctx.deps, student.actor, { kind: "first_gen", enabled: true, value: null });
    const p = await buildMatcherProfile(ctx.deps, system, ownerId);
    expect(p).toMatchObject({ state: "TX", county: "Maple", gpa: 3.72, act: 30, sat: null, serviceHours: 1.5 });
    expect(p.sensitive.firstGen).toBe(true);
  });

  it("is system only", async () => {
    await expect(buildMatcherProfile(ctx.deps, student.actor, student.user.id)).rejects.toThrow();
  });
});

describe("reusableStoryIds", () => {
  it("matches story themes inside essay prompts, ignoring case", () => {
    const list = [
      { id: "a", themes: ["Service"] },
      { id: "b", themes: ["robotics"] },
    ];
    expect(reusableStoryIds(list, ["Describe a SERVICE project."])).toEqual(["a"]);
    expect(reusableStoryIds(list, [])).toEqual([]);
  });
});

describe("listMatches", () => {
  async function seed() {
    const { db } = ctx.deps;
    const maple = await factories.scholarship(db, {
      name: "Maple Rotary",
      localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
      eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
      requirements: {
        essays: [{ prompt: "Describe a time you led a service project.", wordLimit: 500 }],
        recommendations: 0,
        transcript: false,
        serviceHours: null,
        other: [],
      },
      amountMaxUsd: 2000,
      deadline: "2026-11-01",
    });
    const firstGen = await factories.scholarship(db, { name: "First Gen Award", eligibility: [{ type: "first_gen" }] });
    await factories.scholarship(db, { name: "Rolling Award", deadline: null });
    await factories.scholarship(db, { name: "Past Deadline", deadline: "2026-10-01" });
    await factories.scholarship(db, { name: "High GPA", eligibility: [{ type: "gpa_min", min: 3.9 }] });
    await factories.scholarship(db, { name: "Scam Award", scamFlags: ["guaranteed_award"] });
    await factories.scholarship(db, { name: "Draft Award", status: "draft" });
    const story = await factories.story(db, student.user.id, { title: "Library nights", themes: ["Service"] });
    await factories.story(db, student.user.id, { themes: ["led"], archivedAt: new Date() });
    await setSensitiveFact(ctx.deps, student.actor, { kind: "first_gen", enabled: true, value: null });
    return { maple, firstGen, story };
  }

  it("returns eligible, open, scam-free listings with scores, reuse stories, and application state", async () => {
    const { maple, story } = await seed();
    const [app] = await ctx.deps.db
      .insert(scholarshipApplications)
      .values({ ownerId: student.user.id, scholarshipId: maple.id, stage: "planned" })
      .returning();
    const { matches } = await listMatches(ctx.deps, student.actor, student.user.id);
    expect(matches.map((m) => m.scholarship.name).sort()).toEqual(["First Gen Award", "Maple Rotary", "Rolling Award"]);
    const m = matches.find((x) => x.scholarship.id === maple.id);
    expect(m).toMatchObject({
      reuseStoryIds: [story.id],
      daysUntilDeadline: 26,
      applicationId: app?.id,
      stage: "planned",
    });
    expect(m?.reasons.length).toBeGreaterThan(0);
    expect(matches.find((x) => x.scholarship.name === "Rolling Award")).toMatchObject({
      daysUntilDeadline: null,
      applicationId: null,
      stage: null,
    });
    const gen = matches.find((x) => x.scholarship.name === "First Gen Award");
    expect(gen?.reasons.some((r) => r.sensitive)).toBe(true);
  });

  it("withholds sensitive matches for parents and the family audience", async () => {
    await seed();
    const parent = await makeParentOf(ctx.deps, student.user.id);
    for (const list of [
      await listMatches(ctx.deps, parent.actor, student.user.id),
      await listMatches(ctx.deps, parent.actor, student.user.id, { audience: "crew" }),
      await listMatches(ctx.deps, student.actor, student.user.id, { audience: "family" }),
      await listMatches(ctx.deps, system, student.user.id, { audience: "family" }),
    ]) {
      expect(list.privateCount).toBe(1);
      expect(list.matches).toHaveLength(2);
      expect(list.matches.flatMap((m) => m.reasons).every((r) => !r.sensitive)).toBe(true);
    }
  });

  it("withholds sensitive matches even when the sensitive category is shared", async () => {
    await seed();
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await setShare(ctx.deps, student.user.id, "sensitive", true);
    const forParent = await listMatches(ctx.deps, parent.actor, student.user.id);
    expect(forParent.privateCount).toBe(1);
    expect(forParent.matches.some((m) => m.scholarship.name === "First Gen Award")).toBe(false);
    for (const list of [
      await listMatches(ctx.deps, parent.actor, student.user.id, { audience: "family" }),
      await listMatches(ctx.deps, system, student.user.id, { audience: "family" }),
    ]) {
      expect(list.privateCount).toBe(1);
      expect(list.matches).toHaveLength(2);
      expect(list.matches.flatMap((m) => m.reasons).every((r) => !r.sensitive)).toBe(true);
    }
    await setShare(ctx.deps, student.user.id, "sensitive", false);
    const off = await listMatches(ctx.deps, parent.actor, student.user.id);
    expect(off.matches.flatMap((m) => m.reasons).every((r) => !r.sensitive)).toBe(true);
  });

  it("needs the scholarships share for parents and the family audience", async () => {
    await seed();
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await setShare(ctx.deps, student.user.id, "scholarships", false);
    await expect(listMatches(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await listMatches(ctx.deps, system, student.user.id, { audience: "family" })).matches).toHaveLength(2); // Port gates live grants.
    expect((await listMatches(ctx.deps, system, student.user.id)).matches).toHaveLength(3);
  });

  it("hides another student's matches as not_found", async () => {
    const other = await makeStudent(ctx.deps);
    await expect(listMatches(ctx.deps, other.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
