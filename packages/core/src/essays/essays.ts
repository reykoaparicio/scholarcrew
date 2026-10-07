import {
  and,
  asc,
  colleges,
  desc,
  eq,
  essayComments,
  essayVersions,
  essays,
  isNull,
  scholarships,
} from "@scholarcrew/db";
import {
  type Actor,
  type Essay,
  type EssayInput,
  type EssayPatch,
  type EssayVersion,
  type EssayWithBody,
  type SaveVersionInput,
  conflict,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { countWords } from "@scholarcrew/engines";
import { assertOwner } from "../access";
import { assertReadable, firstRow, requireUser } from "../scholarships/common";
import { type CoreDeps, requireUuid } from "../shared";
import { type EssayRow, toEssay, toEssayComment, toEssayVersion } from "./mappers";

const STALE_SAVE = "This essay changed since you opened it. Reload to get the latest version, then save again.";

export async function loadEssay(deps: CoreDeps, id: string): Promise<EssayRow> {
  requireUuid(id, "Essay not found");
  const [row] = await deps.db.select().from(essays).where(eq(essays.id, id));
  if (!row) throw notFound("Essay not found");
  return row;
}

export async function targetLabelFor(deps: CoreDeps, row: EssayRow, actor: Actor): Promise<string | null> {
  if (row.targetType === "college" && row.targetCollegeId) {
    const [c] = await deps.db
      .select({ name: colleges.name })
      .from(colleges)
      .where(eq(colleges.id, row.targetCollegeId));
    return c?.name ?? null;
  }
  if (row.targetType === "scholarship" && row.targetScholarshipId) {
    if (
      !(actor.kind === "user" && actor.userId === row.ownerId) &&
      (await privateScholarshipIds(deps.db, row.ownerId)).has(row.targetScholarshipId)
    )
      return "A private scholarship";
    const [s] = await deps.db
      .select({ name: scholarships.name })
      .from(scholarships)
      .where(eq(scholarships.id, row.targetScholarshipId));
    return s?.name ?? null;
  }
  return null;
}

export async function listEssays(deps: CoreDeps, actor: Actor, ownerId: string): Promise<Essay[]> {
  await assertReadable(deps, actor, ownerId, "essays");
  const rows = await deps.db
    .select({ essay: essays, latestWordCount: essayVersions.wordCount })
    .from(essays)
    .leftJoin(
      essayVersions,
      and(eq(essayVersions.essayId, essays.id), eq(essayVersions.version, essays.currentVersion)),
    )
    .where(eq(essays.ownerId, ownerId))
    .orderBy(desc(essays.updatedAt));
  return rows.map((r) => toEssay(r.essay, r.latestWordCount));
}

import { privateScholarshipIds } from "../scholarships/matching";
import { visibleListingWhere } from "../scholarships/search";

export async function createEssay(deps: CoreDeps, actor: Actor, i: EssayInput): Promise<Essay> {
  const user = requireUser(actor);
  const targetCollegeId = i.targetType === "college" ? i.targetCollegeId : null;
  const targetScholarshipId = i.targetType === "scholarship" ? i.targetScholarshipId : null;
  if (i.targetType === "college") {
    if (!targetCollegeId) throw invalidInput("Pick the college this essay is for.");
    const [c] = await deps.db.select({ id: colleges.id }).from(colleges).where(eq(colleges.id, targetCollegeId));
    if (!c) throw notFound("College not found");
  }
  if (i.targetType === "scholarship") {
    if (!targetScholarshipId) throw invalidInput("Pick the scholarship this essay is for.");
    const [s] = await deps.db
      .select({ id: scholarships.id })
      .from(scholarships)
      .where(and(eq(scholarships.id, targetScholarshipId), visibleListingWhere(user)));
    if (!s) throw notFound("Scholarship not found");
  }
  const row = firstRow(
    await deps.db
      .insert(essays)
      .values({
        ownerId: user.userId,
        title: i.title.trim(),
        prompt: i.prompt,
        wordLimit: i.wordLimit,
        charLimit: i.charLimit,
        targetType: i.targetType,
        targetCollegeId,
        targetScholarshipId,
      })
      .returning(),
    "essay",
  );
  return toEssay(row, null);
}

export async function getEssay(deps: CoreDeps, actor: Actor, id: string): Promise<EssayWithBody> {
  const row = await loadEssay(deps, id);
  await assertReadable(deps, actor, row.ownerId, "essays");
  const [latest] =
    row.currentVersion > 0
      ? await deps.db
          .select()
          .from(essayVersions)
          .where(and(eq(essayVersions.essayId, id), eq(essayVersions.version, row.currentVersion)))
      : [];
  const comments = await deps.db
    .select()
    .from(essayComments)
    .where(and(eq(essayComments.essayId, id), isNull(essayComments.resolvedAt)))
    .orderBy(asc(essayComments.createdAt));
  return {
    ...toEssay(row, latest?.wordCount ?? null),
    body: latest?.body ?? "",
    wordCount: latest?.wordCount ?? 0,
    comments: comments.map(toEssayComment),
    targetLabel: await targetLabelFor(deps, row, actor),
  };
}

export async function saveVersion(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  i: SaveVersionInput,
): Promise<EssayVersion> {
  requireUser(actor);
  const row = await loadEssay(deps, id);
  assertOwner(actor, row.ownerId);
  if (i.baseVersion !== row.currentVersion) throw conflict(STALE_SAVE);
  const next = i.baseVersion + 1;
  return deps.db.transaction(async (tx) => {
    const bumped = await tx
      .update(essays)
      .set({ currentVersion: next, updatedAt: deps.clock.now() })
      .where(and(eq(essays.id, id), eq(essays.currentVersion, i.baseVersion)))
      .returning({ id: essays.id });
    if (bumped.length === 0) throw conflict(STALE_SAVE);
    const version = firstRow(
      await tx
        .insert(essayVersions)
        .values({ essayId: id, version: next, body: i.body, wordCount: countWords(i.body), authorId: row.ownerId })
        .returning(),
      "essay version",
    );
    return toEssayVersion(version);
  });
}

export async function listVersions(deps: CoreDeps, actor: Actor, id: string): Promise<EssayVersion[]> {
  const row = await loadEssay(deps, id);
  await assertReadable(deps, actor, row.ownerId, "essays");
  const rows = await deps.db
    .select()
    .from(essayVersions)
    .where(eq(essayVersions.essayId, id))
    .orderBy(desc(essayVersions.version));
  return rows.map(toEssayVersion);
}

/** Owner edits to title, prompt, or status (R2P-14). `EssayPatch` guarantees at least one key. */
export async function updateEssay(deps: CoreDeps, actor: Actor, id: string, p: EssayPatch): Promise<Essay> {
  requireUser(actor);
  const row = await loadEssay(deps, id);
  assertOwner(actor, row.ownerId);
  const set: Partial<typeof essays.$inferInsert> = { updatedAt: deps.clock.now() };
  if (p.title !== undefined) set.title = p.title.trim();
  if (p.prompt !== undefined) set.prompt = p.prompt;
  if (p.status !== undefined) set.status = p.status;
  const updated = firstRow(
    await deps.db
      .update(essays)
      .set(set)
      .where(and(eq(essays.id, id), eq(essays.ownerId, row.ownerId)))
      .returning(),
    "essay",
  );
  const [latest] =
    updated.currentVersion > 0
      ? await deps.db
          .select({ wordCount: essayVersions.wordCount })
          .from(essayVersions)
          .where(and(eq(essayVersions.essayId, id), eq(essayVersions.version, updated.currentVersion)))
      : [];
  return toEssay(updated, latest?.wordCount ?? null);
}
