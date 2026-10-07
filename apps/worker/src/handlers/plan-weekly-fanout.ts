import { startWeeklyPlan } from "@scholarcrew/core/plan";
import { and, eq, isNotNull, profiles, users } from "@scholarcrew/db";
import { JobPayloads } from "@scholarcrew/jobs";
import { errorLabel, log } from "../log";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/**
 * R2C-5 (WK-01, WK-02): the Monday 11:00 UTC fan-out (00 §9.3 SCHEDULES), Monday morning in every US zone.
 * Same student query as sweep.weekly (L10). startWeeklyPlan skips parents, unfinished students, and owners with a
 * weekly_plan job in the last 12 hours, so a retried fan-out queues nothing new. One student's failure is logged
 * and the loop continues.
 */
export async function handlePlanWeeklyFanout(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["plan.weekly.fanout"].parse(data);
  const rows = await deps.core.db
    .select({ id: users.id })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(users.role, "student"), eq(users.status, "active"), isNotNull(profiles.onboardingCompletedAt)));
  let started = 0;
  for (const row of rows) {
    try {
      if (await startWeeklyPlan(deps.core, SYSTEM, row.id)) started += 1;
    } catch (e) {
      log("error", "plan.weekly.fanout_failed", { studentId: row.id, error: errorLabel(e) });
    }
  }
  log("info", "plan.weekly.fanout", { candidates: rows.length, started });
}
