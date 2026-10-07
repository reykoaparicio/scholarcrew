import { and, asc, crewJobs, eq, essayComments, essayVersions, essays, isNull } from "@scholarcrew/db";
import {
  type Actor,
  type CrewJob,
  type EssayComment,
  type QuillCommentDraft,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertOwner } from "../access";
import { assertCrewAllowance } from "../billing";
import { assertReadable, firstRow, requireSystem, requireUser } from "../scholarships/common";
import { toCrewJob } from "../scholarships/mappers";
import { type CoreDeps, requireUuid } from "../shared";
import { loadEssay } from "./essays";
import { toEssayComment } from "./mappers";
import { occurrenceIndex } from "./quotes";

export async function requestReview(deps: CoreDeps, actor: Actor, id: string): Promise<CrewJob> {
  requireUser(actor);
  const essay = await loadEssay(deps, id);
  assertOwner(actor, essay.ownerId);
  if (essay.currentVersion === 0) throw invalidInput("Save a draft before asking Quill to review it.");
  const now = deps.clock.now();
  const job = await deps.db.transaction(async (tx) => {
    await assertCrewAllowance(deps, essay.ownerId, tx);
    return firstRow(
      await tx
        .insert(crewJobs)
        .values({
          ownerId: essay.ownerId,
          kind: "essay_review",
          status: "queued",
          refId: id,
          usageMonth: now.toISOString().slice(0, 7),
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
      "crew job",
    );
  });
  await deps.jobs.enqueue("essay.review", { jobId: job.id, essayId: id });
  return toCrewJob(job);
}

export async function listComments(deps: CoreDeps, actor: Actor, id: string): Promise<EssayComment[]> {
  const essay = await loadEssay(deps, id);
  await assertReadable(deps, actor, essay.ownerId, "essays");
  const rows = await deps.db
    .select()
    .from(essayComments)
    .where(eq(essayComments.essayId, id))
    .orderBy(asc(essayComments.createdAt));
  return rows.map(toEssayComment);
}

export async function resolveComment(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  requireUser(actor);
  requireUuid(id, "Comment not found");
  const [row] = await deps.db
    .select({ ownerId: essays.ownerId })
    .from(essayComments)
    .innerJoin(essays, eq(essays.id, essayComments.essayId))
    .where(eq(essayComments.id, id));
  if (!row) throw notFound("Comment not found");
  assertOwner(actor, row.ownerId);
  await deps.db
    .update(essayComments)
    .set({ resolvedAt: deps.clock.now() })
    .where(and(eq(essayComments.id, id), isNull(essayComments.resolvedAt)));
}

export async function saveQuillComments(
  deps: CoreDeps,
  system: Actor,
  i: { essayId: string; ownerId: string; version: number; jobId: string; comments: QuillCommentDraft[] },
): Promise<EssayComment[]> {
  requireSystem(system);
  const [owned] = await deps.db
    .select({ id: essays.id })
    .from(essays)
    .where(and(eq(essays.id, i.essayId), eq(essays.ownerId, i.ownerId)));
  if (!owned) throw notFound("Essay not found");
  const [version] = await deps.db
    .select({ body: essayVersions.body })
    .from(essayVersions)
    .where(and(eq(essayVersions.essayId, i.essayId), eq(essayVersions.version, i.version)));
  if (!version) throw notFound("Essay version not found");
  const existing = await deps.db
    .select()
    .from(essayComments)
    .where(and(eq(essayComments.essayId, i.essayId), eq(essayComments.jobId, i.jobId)))
    .orderBy(asc(essayComments.createdAt));
  if (existing.length > 0) return existing.map(toEssayComment);
  const kept = i.comments.filter((c) => occurrenceIndex(version.body, c.quote, c.occurrence) >= 0);
  if (kept.length === 0) return [];
  const rows = await deps.db
    .insert(essayComments)
    .values(
      kept.map((c) => ({
        essayId: i.essayId,
        version: i.version,
        author: "quill" as const,
        kind: c.kind,
        quote: c.quote,
        occurrence: c.occurrence,
        body: c.body,
        jobId: i.jobId,
      })),
    )
    .returning();
  return rows.map(toEssayComment);
}
