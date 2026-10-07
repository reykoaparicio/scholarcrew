import { runWeeklyPlan } from "@scholarcrew/agents";
import { makeConsult } from "@scholarcrew/agents/specialists";
import { ensureChecklists } from "@scholarcrew/core/aid";
import { replaceGeneratedPlan } from "@scholarcrew/core/plan";
import { eq, users } from "@scholarcrew/db";
import { weekStartFor } from "@scholarcrew/engines";
import { JobPayloads } from "@scholarcrew/jobs";
import { DEFAULT_TIME_ZONE, safeTimeZone } from "../time";
import { type JobContext, NO_RETRY, type WorkerDeps } from "../types";
import { SYSTEM, runCrewJob } from "./shared";

export const PLAN_FAILED_TEXT = "Compass couldn't finish your plan this time. Try again in a minute.";

/**
 * ON-06 and the weekly plan button. Aid checklists are ensured first so the plan sees aid deadlines.
 * The job's owner (crewJobs.ownerId) is used; the payload's ownerId is only a hint.
 */
export async function handlePlanWeekly(deps: WorkerDeps, data: unknown, ctx: JobContext = NO_RETRY): Promise<void> {
  const { jobId, source } = JobPayloads["plan.weekly"].parse(data);
  // R2C-5: a system plan (Monday fan-out) records its cost but doesn't count against the monthly allowance.
  // A missing source means "user".
  const crewRequest = source !== "system";
  await runCrewJob(deps, { name: "plan.weekly", jobId, ctx, crewRequest }, async ({ ownerId, base }) => {
    await ensureChecklists(deps.core, SYSTEM, ownerId);
    const [user] = await deps.core.db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, ownerId));
    const weekStart = weekStartFor(deps.core.clock.now(), safeTimeZone(user?.timeZone ?? DEFAULT_TIME_ZONE));
    const { items, reply } = await runWeeklyPlan({ ...base, consult: makeConsult(base) }, { ownerId, weekStart });
    if (items.length > 0) await replaceGeneratedPlan(deps.core, SYSTEM, { ownerId, weekStart, items });
    if (!reply) return { reply: null, status: "failed", error: PLAN_FAILED_TEXT };
    return { reply, status: reply.needsInput ? "needs_input" : "ready", safety: reply.safety };
  });
}
