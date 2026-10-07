import { and, collegeList, eq, planItems, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { systemActor } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setup } from "../scholarships/testkit";
import * as prepModule from "./index";
import {
  acceptStudyPlan,
  addTestScore,
  computeRetake,
  deleteTestScore,
  getSuperscores,
  listTestScores,
  requestRetakeAnalysis,
} from "./prep";

const system = systemActor("test");
let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps, { gpaX100: 372 });
});

describe("test scores", () => {
  it("adds, lists newest first, superscores official sections, and deletes", async () => {
    const a = await addTestScore(ctx.deps, student.actor, {
      test: "ACT",
      takenOn: "2026-04-11",
      official: true,
      composite: 27,
      sections: { english: 29, math: 25, reading: 28, science: 26 },
    });
    await addTestScore(ctx.deps, student.actor, {
      test: "ACT",
      takenOn: "2026-06-13",
      official: true,
      composite: 28,
      sections: { english: 27, math: 29, reading: 27, science: 28 },
    });
    expect((await listTestScores(ctx.deps, student.actor, student.user.id)).map((s) => s.takenOn)).toEqual([
      "2026-06-13",
      "2026-04-11",
    ]);
    const [act] = await getSuperscores(ctx.deps, student.actor, student.user.id);
    expect(act).toMatchObject({ test: "ACT", sections: { english: 29, math: 29, reading: 28, science: 28 } });
    await deleteTestScore(ctx.deps, student.actor, a.id);
    expect(await listTestScores(ctx.deps, student.actor, student.user.id)).toHaveLength(1);
  });

  it("is owner only, even for parents", async () => {
    const s = await addTestScore(ctx.deps, student.actor, {
      test: "SAT",
      takenOn: "2026-05-02",
      official: true,
      composite: 1350,
      sections: {},
    });
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await expect(listTestScores(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getSuperscores(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteTestScore(ctx.deps, parent.actor, s.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await listTestScores(ctx.deps, system, student.user.id)).toHaveLength(1);
  });
});

describe("retake analysis", () => {
  it("queues a retake_analysis job and enqueues prep.retake", async () => {
    const college = await factories.college(ctx.deps.db, {
      id: "200001",
      meritTiers: [{ label: "Merit", minGpa: 3, minAct: 30, minSat: null, annualUsd: 3000, renewalGpa: 3 }],
    });
    await ctx.deps.db
      .insert(collegeList)
      .values({ ownerId: student.user.id, collegeId: college.id, fit: "target", plan: "RD", season: "2026-27" });
    const job = await requestRetakeAnalysis(ctx.deps, student.actor, { test: "ACT", targetComposite: 30 });
    expect(job).toMatchObject({ kind: "retake_analysis", status: "queued", refId: "ACT" });
    expect(ctx.deps.jobs.sent).toEqual([
      { name: "prep.retake", payload: { jobId: job.id, test: "ACT", targetComposite: 30 } },
    ]);
    await ctx.deps.db.insert(usageCounters).values({ userId: student.user.id, month: "2026-10", crewRequests: 20 });
    await expect(
      requestRetakeAnalysis(ctx.deps, student.actor, { test: "ACT", targetComposite: 31 }),
    ).rejects.toMatchObject({ code: "limit_reached" });
  });

  it("computes the dollar difference over the current college list", async () => {
    const college = await factories.college(ctx.deps.db, {
      id: "200001",
      name: "Maple State University",
      meritTiers: [
        { label: "Scholars", minGpa: 3.5, minAct: 27, minSat: null, annualUsd: 3000, renewalGpa: 3.0 },
        { label: "Presidential", minGpa: 3.5, minAct: 30, minSat: null, annualUsd: 6000, renewalGpa: 3.25 },
      ],
    });
    const archived = await factories.college(ctx.deps.db, { id: "200009" });
    await ctx.deps.db.insert(collegeList).values([
      { ownerId: student.user.id, collegeId: college.id, fit: "target", plan: "RD", season: "2026-27" },
      {
        ownerId: student.user.id,
        collegeId: archived.id,
        fit: "target",
        plan: "RD",
        season: "2025-26",
        archivedAt: ctx.deps.clock.now(),
      },
    ]);
    await addTestScore(ctx.deps, student.actor, {
      test: "ACT",
      takenOn: "2026-06-13",
      official: true,
      composite: 28,
      sections: {},
    });
    const analysis = await computeRetake(ctx.deps, system, student.user.id, { test: "ACT", targetComposite: 30 });
    expect(analysis).toMatchObject({
      test: "ACT",
      currentComposite: 28,
      targetComposite: 30,
      totalFourYearDeltaUsd: 12000,
    });
    expect(analysis.rows.map((r) => r.collegeId)).toEqual(["200001"]);
    await expect(
      computeRetake(ctx.deps, student.actor, student.user.id, { test: "ACT", targetComposite: 30 }),
    ).rejects.toThrow();
  });
});

describe("acceptStudyPlan", () => {
  it("adds test_prep plan items credited to Prep", async () => {
    const items = await acceptStudyPlan(ctx.deps, student.actor, {
      sessions: [
        { title: "ACT math: functions", minutes: 45, weekStart: "2026-10-05", dueOn: "2026-10-10" },
        { title: "ACT practice test", minutes: 180, weekStart: "2026-10-12", dueOn: null },
      ],
    });
    expect(items.map((i) => [i.kind, i.weekStart, i.contributors])).toEqual([
      ["test_prep", "2026-10-05", ["prep"]],
      ["test_prep", "2026-10-12", ["prep"]],
    ]);
    const rows = await ctx.deps.db
      .select()
      .from(planItems)
      .where(and(eq(planItems.ownerId, student.user.id), eq(planItems.kind, "test_prep")));
    expect(rows).toHaveLength(2);
  });
});

describe("prep index", () => {
  it("exports exactly the contract names", () => {
    expect(Object.keys(prepModule).sort()).toEqual([
      "acceptStudyPlan",
      "addTestScore",
      "computeRetake",
      "deleteTestScore",
      "getSuperscores",
      "listTestScores",
      "requestRetakeAnalysis",
    ]);
  });
});
