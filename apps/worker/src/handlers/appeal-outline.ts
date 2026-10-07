import { runAppealOutline } from "@scholarcrew/agents/specialists";
import { JobPayloads } from "@scholarcrew/jobs";
import { type JobContext, NO_RETRY, type WorkerDeps } from "../types";
import { runCrewJob } from "./shared";

/** MO-08: Aid's appeal outline. The student writes the letter. */
export async function handleAppealOutline(deps: WorkerDeps, data: unknown, ctx: JobContext = NO_RETRY): Promise<void> {
  const { jobId, offerId } = JobPayloads["appeal.outline"].parse(data);
  await runCrewJob(deps, { name: "appeal.outline", jobId, ctx, crewRequest: true }, async ({ ownerId, base }) => {
    const reply = await runAppealOutline(base, { ownerId, offerId });
    return { reply, status: reply.needsInput ? "needs_input" : "ready", safety: reply.safety };
  });
}
