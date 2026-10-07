import { runRetakeExplanation } from "@scholarcrew/agents/specialists";
import { computeRetake } from "@scholarcrew/core/prep";
import { JobPayloads } from "@scholarcrew/jobs";
import { type JobContext, NO_RETRY, type WorkerDeps } from "../types";
import { SYSTEM, runCrewJob } from "./shared";

/** PR-03: the dollar values come from computeRetake (code); Prep only explains them. */
export async function handlePrepRetake(deps: WorkerDeps, data: unknown, ctx: JobContext = NO_RETRY): Promise<void> {
  const { jobId, test, targetComposite } = JobPayloads["prep.retake"].parse(data);
  await runCrewJob(deps, { name: "prep.retake", jobId, ctx, crewRequest: true }, async ({ ownerId, base }) => {
    const analysis = await computeRetake(deps.core, SYSTEM, ownerId, { test, targetComposite });
    const reply = await runRetakeExplanation(base, { ownerId, analysis });
    return { reply, status: reply.needsInput ? "needs_input" : "ready", safety: reply.safety };
  });
}
