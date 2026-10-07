import {
  and,
  asc,
  colleges,
  desc,
  eq,
  essays,
  inArray,
  isNull,
  scholarships,
  stories,
  storyUses,
} from "@scholarcrew/db";
import {
  type Actor,
  type LinkStoryInput,
  type Story,
  type StoryInput,
  type StoryPatch,
  type StoryReuseCheck,
  type StoryUse,
  notFound,
} from "@scholarcrew/domain";
import { assertOwner, canRead } from "../access";
import { assertReadable, firstRow, requireUser } from "../scholarships/common";
import { type CoreDeps, requireUuid, toIso } from "../shared";
import { toStory, toStoryUse } from "./mappers";

async function usesFor(deps: CoreDeps, storyIds: string[]): Promise<Map<string, Story["uses"]>> {
  const map = new Map<string, Story["uses"]>();
  if (storyIds.length === 0) return map;
  const rows = await deps.db
    .select({
      storyId: storyUses.storyId,
      essayId: storyUses.essayId,
      essayTitle: essays.title,
      collegeId: storyUses.collegeId,
      scholarshipId: storyUses.scholarshipId,
      usedAt: storyUses.usedAt,
    })
    .from(storyUses)
    .innerJoin(essays, eq(essays.id, storyUses.essayId))
    .where(inArray(storyUses.storyId, storyIds))
    .orderBy(asc(storyUses.usedAt));
  for (const r of rows) {
    const list = map.get(r.storyId) ?? [];
    list.push({
      essayId: r.essayId,
      essayTitle: r.essayTitle,
      collegeId: r.collegeId,
      scholarshipId: r.scholarshipId,
      usedAt: toIso(r.usedAt),
    });
    map.set(r.storyId, list);
  }
  return map;
}

async function ownedStory(deps: CoreDeps, actor: Actor, id: string) {
  requireUuid(id, "Story not found");
  const [row] = await deps.db.select().from(stories).where(eq(stories.id, id));
  if (!row) throw notFound("Story not found");
  assertOwner(actor, row.ownerId);
  return row;
}

async function withUses(deps: CoreDeps, row: typeof stories.$inferSelect): Promise<Story> {
  const uses = await usesFor(deps, [row.id]);
  return toStory(row, uses.get(row.id) ?? []);
}

export async function listStories(deps: CoreDeps, actor: Actor, ownerId: string): Promise<Story[]> {
  await assertReadable(deps, actor, ownerId, "stories");
  const rows = await deps.db
    .select()
    .from(stories)
    .where(and(eq(stories.ownerId, ownerId), isNull(stories.archivedAt)))
    .orderBy(desc(stories.updatedAt));
  const uses = await usesFor(
    deps,
    rows.map((r) => r.id),
  );
  const canSeeEssay = actor.kind === "system" || (await canRead(deps, actor, ownerId, "essays"));
  return rows.map((r) =>
    toStory(
      r,
      (uses.get(r.id) ?? []).map((use) => ({
        ...use,
        essayTitle: canSeeEssay ? use.essayTitle : "",
      })),
    ),
  );
}

export async function createStory(deps: CoreDeps, actor: Actor, i: StoryInput): Promise<Story> {
  const user = requireUser(actor);
  const row = firstRow(
    await deps.db
      .insert(stories)
      .values({
        ownerId: user.userId,
        title: i.title.trim(),
        moment: i.moment,
        themes: i.themes.map((t) => t.trim()).filter((t) => t !== ""),
        evidence: i.evidence,
        summary: i.summary,
      })
      .returning(),
    "story",
  );
  return toStory(row, []);
}

export async function updateStory(deps: CoreDeps, actor: Actor, id: string, p: StoryPatch): Promise<Story> {
  requireUser(actor);
  await ownedStory(deps, actor, id);
  const set: Partial<typeof stories.$inferInsert> = { updatedAt: deps.clock.now() };
  if (p.title !== undefined) set.title = p.title.trim();
  if (p.moment !== undefined) set.moment = p.moment;
  if (p.themes !== undefined) set.themes = p.themes.map((t) => t.trim()).filter((t) => t !== "");
  if (p.evidence !== undefined) set.evidence = p.evidence;
  if (p.summary !== undefined) set.summary = p.summary;
  const row = firstRow(
    await deps.db
      .update(stories)
      .set(set)
      .where(and(eq(stories.id, id), eq(stories.ownerId, actor.kind === "user" ? actor.userId : "")))
      .returning(),
    "story",
  );
  return withUses(deps, row);
}

export async function archiveStory(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  requireUser(actor);
  await ownedStory(deps, actor, id);
  await deps.db
    .update(stories)
    .set({ archivedAt: deps.clock.now() })
    .where(
      and(
        eq(stories.id, id),
        eq(stories.ownerId, actor.kind === "user" ? actor.userId : ""),
        isNull(stories.archivedAt),
      ),
    );
}

export async function linkStory(deps: CoreDeps, actor: Actor, i: LinkStoryInput): Promise<StoryUse> {
  requireUser(actor);
  const story = await ownedStory(deps, actor, i.storyId);
  const [essay] = await deps.db
    .select()
    .from(essays)
    .where(and(eq(essays.id, i.essayId), eq(essays.ownerId, story.ownerId)));
  if (!essay) throw notFound("Essay not found");
  const pair = and(eq(storyUses.storyId, story.id), eq(storyUses.essayId, essay.id));
  const [existing] = await deps.db.select().from(storyUses).where(pair);
  if (existing) return toStoryUse(existing);
  await deps.db
    .insert(storyUses)
    .values({
      storyId: story.id,
      essayId: essay.id,
      collegeId: essay.targetType === "college" ? essay.targetCollegeId : null,
      scholarshipId: essay.targetType === "scholarship" ? essay.targetScholarshipId : null,
      usedAt: deps.clock.now(),
    })
    .onConflictDoNothing({ target: [storyUses.storyId, storyUses.essayId] });
  return toStoryUse(firstRow(await deps.db.select().from(storyUses).where(pair), "story use"));
}

export async function checkStoryReuse(
  deps: CoreDeps,
  actor: Actor,
  i: { storyId: string; collegeId?: string; scholarshipId?: string },
): Promise<StoryReuseCheck> {
  const story = await ownedStory(deps, actor, i.storyId);
  const uses = await deps.db.select().from(storyUses).where(eq(storyUses.storyId, story.id));
  const hit = uses.find(
    (u) =>
      (i.collegeId !== undefined && u.collegeId === i.collegeId) ||
      (i.scholarshipId !== undefined && u.scholarshipId === i.scholarshipId),
  );
  let name: string | null = null;
  if (hit?.collegeId && hit.collegeId === i.collegeId) {
    const [c] = await deps.db.select({ name: colleges.name }).from(colleges).where(eq(colleges.id, hit.collegeId));
    name = c?.name ?? "this college";
  } else if (hit?.scholarshipId) {
    const [s] = await deps.db
      .select({ name: scholarships.name })
      .from(scholarships)
      .where(eq(scholarships.id, hit.scholarshipId));
    name = s?.name ?? "this scholarship";
  }
  return {
    storyId: story.id,
    alreadyUsedForTarget: hit !== undefined,
    priorUses: uses.length,
    message: name ? `You've already used this story for ${name}.` : null,
  };
}
