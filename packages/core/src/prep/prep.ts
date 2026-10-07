import {
  and,
  collegeList,
  colleges,
  crewJobs,
  desc,
  eq,
  isNull,
  planItems,
  profiles,
  testScores,
} from "@scholarcrew/db";
import {
  type Actor,
  type CrewJob,
  type PlanItem,
  type RetakeAnalysis,
  type RetakeAnalysisInput,
  type StudySession,
  type Superscore,
  type TestScore,
  type TestScoreInput,
  invalidInput,
  notFound,
  systemActor,
} from "@scholarcrew/domain";
import { retakeAnalysis, superscore } from "@scholarcrew/engines";
import { assertOwner } from "../access";
import { assertCrewAllowance } from "../billing";
import { assertOwnerOrSystem, firstRow, requireSystem, requireUser } from "../scholarships/common";
import { toCrewJob, toPlanItem } from "../scholarships/mappers";
import { type CoreDeps, currentSeason, requireUuid, toIso } from "../shared";

function toTestScore(row: typeof testScores.$inferSelect): TestScore {
  return {
    id: row.id,
    test: row.test,
    takenOn: row.takenOn,
    official: row.official,
    composite: row.composite,
    sections: row.sections,
    createdAt: toIso(row.createdAt),
  };
}

async function loadScores(deps: CoreDeps, ownerId: string): Promise<TestScore[]> {
  const rows = await deps.db
    .select()
    .from(testScores)
    .where(eq(testScores.ownerId, ownerId))
    .orderBy(desc(testScores.takenOn), desc(testScores.createdAt));
  return rows.map(toTestScore);
}

export async function listTestScores(deps: CoreDeps, actor: Actor, ownerId: string): Promise<TestScore[]> {
  assertOwnerOrSystem(actor, ownerId);
  return loadScores(deps, ownerId);
}

export async function addTestScore(deps: CoreDeps, actor: Actor, i: TestScoreInput): Promise<TestScore> {
  const user = requireUser(actor);
  const row = firstRow(
    await deps.db
      .insert(testScores)
      .values({
        ownerId: user.userId,
        test: i.test,
        takenOn: i.takenOn,
        official: i.official,
        composite: i.composite,
        sections: i.sections,
      })
      .returning(),
    "test score",
  );
  return toTestScore(row);
}

export async function deleteTestScore(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  requireUser(actor);
  requireUuid(id, "Test score not found");
  const [row] = await deps.db.select({ ownerId: testScores.ownerId }).from(testScores).where(eq(testScores.id, id));
  if (!row) throw notFound("Test score not found");
  assertOwner(actor, row.ownerId);
  await deps.db.delete(testScores).where(and(eq(testScores.id, id), eq(testScores.ownerId, row.ownerId)));
}

export async function getSuperscores(deps: CoreDeps, actor: Actor, ownerId: string): Promise<Superscore[]> {
  assertOwnerOrSystem(actor, ownerId);
  return superscore(await loadScores(deps, ownerId));
}

export async function requestRetakeAnalysis(deps: CoreDeps, actor: Actor, i: RetakeAnalysisInput): Promise<CrewJob> {
  const user = requireUser(actor);
  const analysis = await computeRetake(deps, systemActor("retake-precheck"), user.userId, i);
  if (analysis.rows.length === 0) throw invalidInput("Add colleges with merit scholarships first.");
  if (analysis.totalFourYearDeltaUsd === 0) throw invalidInput("Pick a target above your best score.");
  const now = deps.clock.now();
  const job = await deps.db.transaction(async (tx) => {
    await assertCrewAllowance(deps, user.userId, tx);
    return firstRow(
      await tx
        .insert(crewJobs)
        .values({
          ownerId: user.userId,
          kind: "retake_analysis",
          status: "queued",
          refId: i.test,
          usageMonth: now.toISOString().slice(0, 7),
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
      "crew job",
    );
  });
  await deps.jobs.enqueue("prep.retake", { jobId: job.id, test: i.test, targetComposite: i.targetComposite });
  return toCrewJob(job);
}

export async function computeRetake(
  deps: CoreDeps,
  system: Actor,
  ownerId: string,
  i: RetakeAnalysisInput,
): Promise<RetakeAnalysis> {
  requireSystem(system);
  const list = await deps.db
    .select({ id: colleges.id, name: colleges.name, meritTiers: colleges.meritTiers })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .where(and(eq(collegeList.ownerId, ownerId), isNull(collegeList.archivedAt)))
    .orderBy(colleges.name);
  const [profile] = await deps.db
    .select({ gpaX100: profiles.gpaUnweightedX100 })
    .from(profiles)
    .where(eq(profiles.userId, ownerId));
  const official = (await loadScores(deps, ownerId)).filter((s) => s.official);
  const best = (test: "ACT" | "SAT") => {
    const values = official.filter((s) => s.test === test).map((s) => s.composite);
    return values.length > 0 ? Math.max(...values) : null;
  };
  const gpaX100 = profile?.gpaX100 ?? null;
  return retakeAnalysis({
    colleges: list,
    gpa: gpaX100 === null ? null : gpaX100 / 100,
    currentAct: best("ACT"),
    currentSat: best("SAT"),
    target: { test: i.test, composite: i.targetComposite },
  });
}

export async function acceptStudyPlan(
  deps: CoreDeps,
  actor: Actor,
  i: { sessions: StudySession[] },
): Promise<PlanItem[]> {
  const user = requireUser(actor);
  if (i.sessions.length === 0) return [];
  const rows = await deps.db
    .insert(planItems)
    .values(
      i.sessions.map((s) => ({
        ownerId: user.userId,
        weekStart: s.weekStart,
        title: s.title,
        kind: "test_prep" as const,
        refType: "prep",
        minutes: s.minutes,
        dueOn: s.dueOn,
        contributors: ["prep" as const],
      })),
    )
    .returning();
  return rows.map(toPlanItem).sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.title.localeCompare(b.title));
}
