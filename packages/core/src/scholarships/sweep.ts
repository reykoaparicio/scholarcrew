import { and, desc, eq, inArray, scholarshipApplications, sweepRuns } from "@scholarcrew/db";
import type { Actor, Match, SweepResult, SweepSummary } from "@scholarcrew/domain";
import { formatUsd } from "@scholarcrew/engines";
import { notify } from "../notifications";
import { type CoreDeps, toIso, todayIn } from "../shared";
import { assertReadable, firstRow, requireSystem } from "./common";
import { evaluateForStudent } from "./matching";

const OPEN_STAGES = ["matched", "planned", "drafting"] as const;

function toSweepSummary(row: typeof sweepRuns.$inferSelect): SweepSummary {
  return {
    ranAt: toIso(row.ranAt),
    newMatches: row.newMatches,
    totalUsd: row.totalUsd,
    reuseCount: row.reuseCount,
    hiddenScams: row.hiddenScams,
  };
}

export async function runSweep(deps: CoreDeps, system: Actor, studentId: string): Promise<SweepResult> {
  const sys = requireSystem(system);
  const { matches, scamIds, timeZone } = await evaluateForStudent(deps, studentId);
  const fresh = matches.filter((m) => m.applicationId === null);
  let added: Match[] = [];
  if (fresh.length > 0) {
    const rows = await deps.db
      .insert(scholarshipApplications)
      .values(
        fresh.map((m) => ({
          ownerId: studentId,
          scholarshipId: m.scholarship.id,
          stage: "matched" as const,
          matchReasons: m.reasons,
          fitScore: m.fitScore,
          estMinutes: m.estMinutes,
        })),
      )
      .onConflictDoNothing({ target: [scholarshipApplications.ownerId, scholarshipApplications.scholarshipId] })
      .returning({ scholarshipId: scholarshipApplications.scholarshipId });
    const ids = new Set(rows.map((r) => r.scholarshipId));
    added = fresh.filter((m) => ids.has(m.scholarship.id));
  }
  // Saved or older cards catch up with the current profile (R2P-3). Submitted and later stages keep their reasons.
  const open: readonly string[] = OPEN_STAGES;
  const refresh = matches.filter((m) => m.applicationId !== null && m.stage !== null && open.includes(m.stage));
  if (refresh.length > 0) {
    await deps.db.transaction(async (tx) => {
      for (const m of refresh) {
        if (!m.applicationId) continue;
        await tx
          .update(scholarshipApplications)
          .set({ matchReasons: m.reasons, fitScore: m.fitScore })
          .where(
            and(
              eq(scholarshipApplications.id, m.applicationId),
              inArray(scholarshipApplications.stage, [...OPEN_STAGES]),
            ),
          );
      }
    });
  }
  const totalUsd = added.reduce((sum, m) => sum + m.scholarship.amountMaxUsd, 0);
  const now = deps.clock.now();
  const [prior] = await deps.db
    .select()
    .from(sweepRuns)
    .where(eq(sweepRuns.ownerId, studentId))
    .orderBy(desc(sweepRuns.ranAt))
    .limit(1);
  if (added.length === 0 && prior && todayIn(prior.ranAt, timeZone) === todayIn(now, timeZone))
    return { studentId, ranAt: toIso(now), newMatches: 0, totalUsd: 0, reuseCount: 0, hiddenScams: scamIds.length };
  const run = firstRow(
    await deps.db
      .insert(sweepRuns)
      .values({
        ownerId: studentId,
        ranAt: now,
        newMatches: added.length,
        totalUsd,
        reuseCount: added.filter((m) => m.reuseStoryIds.length > 0).length,
        hiddenScams: scamIds.length,
        hiddenScholarshipIds: scamIds,
      })
      .returning(),
    "sweep run",
  );
  if (added.length > 0) {
    await notify(deps, sys, {
      userId: studentId,
      kind: "new_matches",
      title: added.length === 1 ? "1 new scholarship match" : `${added.length} new scholarship matches`,
      body: `Worth up to ${formatUsd(totalUsd)} in total. Open your board to review them.`,
      link: "/scholarships",
      // Keyed by sweep day in the student's zone, so the signup week's Sunday sweep can still notify (R2P-21).
      dedupeKey: `sweep:${studentId}:${todayIn(now, timeZone)}`,
      email: true,
    });
  }
  return { studentId, ...toSweepSummary(run) };
}

export async function lastSweep(deps: CoreDeps, actor: Actor, studentId: string): Promise<SweepSummary | null> {
  await assertReadable(deps, actor, studentId, "scholarships");
  const [row] = await deps.db
    .select()
    .from(sweepRuns)
    .where(eq(sweepRuns.ownerId, studentId))
    .orderBy(desc(sweepRuns.ranAt))
    .limit(1);
  return row ? toSweepSummary(row) : null;
}
