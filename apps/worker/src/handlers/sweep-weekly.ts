import { and, eq, isNotNull, profiles, users } from "@scholarcrew/db";
import { weekStartFor } from "@scholarcrew/engines";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import { safeTimeZone } from "../time";
import type { WorkerDeps } from "../types";

export function sweepKey(studentId: string, weekStart: string): string {
  return `sweep:${studentId}:${weekStart}`;
}

/**
 * SC-10: the Sunday fan-out. One sweep.student per active, onboarded student per week (in their time zone).
 * `sweep.student` is a standard queue (06's onboarding enqueue sends no key), so the singleton key doesn't dedupe:
 * a retried sweep.weekly can queue a student twice. That's accepted: runSweep is idempotent per student and week
 * (a second run adds no matches and sends no second notification; the sweep.student test runs it twice).
 */
export async function handleSweepWeekly(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["sweep.weekly"].parse(data);
  const now = deps.core.clock.now();
  const rows = await deps.core.db
    .select({ id: users.id, timeZone: users.timeZone })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(users.role, "student"), eq(users.status, "active"), isNotNull(profiles.onboardingCompletedAt)));
  let queued = 0;
  for (const row of rows) {
    const weekStart = weekStartFor(now, safeTimeZone(row.timeZone));
    const id = await deps.core.jobs.enqueue(
      "sweep.student",
      { studentId: row.id },
      { singletonKey: sweepKey(row.id, weekStart) },
    );
    if (id) queued += 1;
  }
  log("info", "sweep.weekly", { students: rows.length, queued });
}
