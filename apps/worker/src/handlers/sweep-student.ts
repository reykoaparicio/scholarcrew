import { runSweep } from "@scholarcrew/core/scholarships";
import { eq, users } from "@scholarcrew/db";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/** One student's sweep (SC-10, and ON-06's first sweep). Core dedupes matches and the weekly notification. */
export async function handleSweepStudent(deps: WorkerDeps, data: unknown): Promise<void> {
  const { studentId } = JobPayloads["sweep.student"].parse(data);
  const [user] = await deps.core.db
    .select({ role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, studentId));
  if (!user || user.role !== "student" || user.status !== "active") {
    log("info", "sweep.skipped", { studentId });
    return;
  }
  const result = await runSweep(deps.core, SYSTEM, studentId);
  log("info", "sweep.student", { studentId, newMatches: result.newMatches });
}
