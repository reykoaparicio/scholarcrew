import { and, applicationItems, asc, collegeList, eq, essays } from "@scholarcrew/db";
import { type Actor, type ApplicationItem, type ApplicationItemPatch, notFound } from "@scholarcrew/domain";
import { assertOwner } from "../access";
import { assertReadable, firstRow, requireUser } from "../scholarships/common";
import { type CoreDeps, requireUuid } from "../shared";
import { toApplicationItem } from "./mappers";

export async function listApplicationItems(deps: CoreDeps, actor: Actor, entryId: string): Promise<ApplicationItem[]> {
  requireUuid(entryId, "College list entry not found");
  const [entry] = await deps.db
    .select({ ownerId: collegeList.ownerId })
    .from(collegeList)
    .where(eq(collegeList.id, entryId));
  if (!entry) throw notFound("College list entry not found");
  await assertReadable(deps, actor, entry.ownerId, "colleges");
  const rows = await deps.db
    .select()
    .from(applicationItems)
    .where(eq(applicationItems.collegeListId, entryId))
    .orderBy(asc(applicationItems.kind), asc(applicationItems.label));
  return rows.map(toApplicationItem);
}

export async function updateApplicationItem(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  p: ApplicationItemPatch,
): Promise<ApplicationItem> {
  requireUser(actor);
  requireUuid(id, "Application item not found");
  const [item] = await deps.db.select().from(applicationItems).where(eq(applicationItems.id, id));
  if (!item) throw notFound("Application item not found");
  assertOwner(actor, item.ownerId);
  if (p.essayId) {
    const [essay] = await deps.db
      .select({ id: essays.id })
      .from(essays)
      .where(and(eq(essays.id, p.essayId), eq(essays.ownerId, item.ownerId)));
    if (!essay) throw notFound("Essay not found");
  }
  const set: Partial<typeof applicationItems.$inferInsert> = { updatedAt: deps.clock.now() };
  if (p.status !== undefined) set.status = p.status;
  if (p.essayId !== undefined) set.essayId = p.essayId;
  const row = firstRow(
    await deps.db
      .update(applicationItems)
      .set(set)
      .where(and(eq(applicationItems.id, id), eq(applicationItems.ownerId, item.ownerId)))
      .returning(),
    "application item",
  );
  return toApplicationItem(row);
}
