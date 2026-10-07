import { runEssayReview } from "@scholarcrew/agents/specialists";
import { getEssay, saveQuillComments } from "@scholarcrew/core/essays";
import { and, eq, essays } from "@scholarcrew/db";
import type { CrewReply } from "@scholarcrew/domain";
import { JobPayloads } from "@scholarcrew/jobs";
import { type JobContext, NO_RETRY, type WorkerDeps } from "../types";
import { FAILED_TEXT, SYSTEM, runCrewJob } from "./shared";

export function reviewReply(essayId: string, title: string, count: number, refused: boolean): CrewReply {
  const name = title.trim() ? `"${title.trim().slice(0, 120)}"` : "your essay";
  let text = `Quill left ${count} ${count === 1 ? "comment" : "comments"} on ${name}.`;
  if (refused) text = `Quill couldn't review ${name} this time.`;
  else if (count === 0) text = `Quill read ${name} and didn't leave comments this time.`;
  return {
    text,
    contributors: ["quill"],
    question: null,
    actionCards: [{ kind: "open_link", id: "open-essay", label: "Open the essay", href: `/essays/${essayId}` }],
    receipt: [],
    safety: refused ? "refusal" : null,
    needsInput: false,
  };
}

/** ES-04: Quill reviews the current version; core keeps only comments whose quote is in that version. */
export async function handleEssayReview(deps: WorkerDeps, data: unknown, ctx: JobContext = NO_RETRY): Promise<void> {
  const { jobId, essayId } = JobPayloads["essay.review"].parse(data);
  await runCrewJob(deps, { name: "essay.review", jobId, ctx, crewRequest: true }, async ({ job, ownerId, base }) => {
    if (job.refId !== essayId) return { reply: null, status: "failed", error: FAILED_TEXT };
    const [owned] = await deps.core.db
      .select({ id: essays.id })
      .from(essays)
      .where(and(eq(essays.id, essayId), eq(essays.ownerId, ownerId)));
    if (!owned) return { reply: null, status: "failed", error: FAILED_TEXT };
    const essay = await getEssay(deps.core, SYSTEM, essayId);

    const { comments, refused } = await runEssayReview(base, {
      ownerId,
      essayId,
      version: essay.currentVersion,
      body: essay.body,
      context: {
        prompt: essay.prompt,
        wordLimit: essay.wordLimit,
        charLimit: essay.charLimit,
        targetLabel: essay.targetLabel,
      },
    });
    const saved =
      comments.length > 0 && essay.currentVersion > 0
        ? await saveQuillComments(deps.core, SYSTEM, {
            ownerId,
            essayId,
            version: essay.currentVersion,
            jobId,
            comments,
          })
        : [];
    return {
      reply: reviewReply(essayId, essay.title, saved.length, refused),
      status: "ready",
      safety: refused ? "refusal" : null,
    };
  });
}
