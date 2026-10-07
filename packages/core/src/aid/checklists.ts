import {
  aidChecklistItems,
  aidDeadlines,
  and,
  asc,
  collegeList,
  colleges,
  eq,
  familyTasks,
  inArray,
  isNull,
  or,
  profiles,
} from "@scholarcrew/db";
import {
  type Actor,
  type AidChecklist,
  type AidChecklistItem,
  AidChecklistPatch,
  type AidDeadline,
  type AidProgram,
  CSS_STEPS,
  FAFSA_STEPS,
  invalidInput,
  notFound,
  systemActor,
} from "@scholarcrew/domain";
import { assertCanRead, assertSystem, assertUser } from "../access";
import { createTask } from "../family";
import { isParentOf, parentsOf } from "../plan/common";
import { type CoreDeps, currentAwardYear, currentSeason, one, requireUuid, toIso, toIsoOrNull } from "../shared";

type ItemRow = typeof aidChecklistItems.$inferSelect;
type CollegeRow = typeof colleges.$inferSelect;

const AID_SYSTEM = systemActor("aid.checklists");

function toItem(row: ItemRow): AidChecklistItem {
  return {
    id: row.id,
    awardYear: row.awardYear,
    program: row.program,
    collegeId: row.collegeId,
    key: row.key,
    title: row.title,
    assignee: row.assignee,
    status: row.status,
    dueOn: row.dueOn,
    completedAt: toIsoOrNull(row.completedAt),
  };
}

/** Also used by the admin aid editor (H12). */
export function toAidDeadline(row: typeof aidDeadlines.$inferSelect): AidDeadline {
  return {
    id: row.id,
    awardYear: row.awardYear,
    state: row.state,
    program: row.program,
    deadline: row.deadline,
    note: row.note,
    sourceUrl: row.sourceUrl,
    verifiedAt: toIso(row.verifiedAt),
  };
}

/** Current-season listed colleges that require the CSS Profile, oldest first. */
export async function cssColleges(deps: CoreDeps, studentId: string): Promise<CollegeRow[]> {
  const rows = await deps.db
    .select({ college: colleges })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .where(
      and(eq(collegeList.ownerId, studentId), isNull(collegeList.archivedAt), eq(colleges.cssProfileRequired, true)),
    )
    .orderBy(asc(collegeList.createdAt));
  return rows.map((r) => r.college);
}

/** Federal deadlines plus the student's state for the current award year, soonest first (no date last). */
export async function loadAidDeadlines(deps: CoreDeps, studentId: string): Promise<AidDeadline[]> {
  const [profile] = await deps.db
    .select({ state: profiles.state })
    .from(profiles)
    .where(eq(profiles.userId, studentId));
  const state = profile?.state ?? "";
  const awardYear = currentAwardYear(deps.clock.now());
  const scope = state ? or(isNull(aidDeadlines.state), eq(aidDeadlines.state, state)) : isNull(aidDeadlines.state);
  const rows = await deps.db
    .select()
    .from(aidDeadlines)
    .where(and(eq(aidDeadlines.awardYear, awardYear), scope))
    .orderBy(asc(aidDeadlines.deadline), asc(aidDeadlines.program));
  return rows.map(toAidDeadline);
}

export async function ensureChecklists(deps: CoreDeps, system: Actor, studentId: string): Promise<void> {
  assertSystem(system);
  requireUuid(studentId, "Student not found");
  const awardYear = currentAwardYear(deps.clock.now());
  const css = await cssColleges(deps, studentId);
  const rows = [
    ...FAFSA_STEPS.map((s) => ({
      ownerId: studentId,
      awardYear,
      program: "fafsa" as const,
      collegeId: null,
      key: s.key,
      title: s.title,
      assignee: s.assignee,
      dueOn: null,
    })),
    ...css.flatMap((c) =>
      CSS_STEPS.map((s) => ({
        ownerId: studentId,
        awardYear,
        program: "css" as const,
        collegeId: c.id,
        key: s.key,
        title: s.title,
        assignee: s.assignee,
        dueOn: c.aidPriorityDate,
      })),
    ),
  ];
  await deps.db.insert(aidChecklistItems).values(rows).onConflictDoNothing();

  const parents = await parentsOf(deps.db, studentId);
  if (parents.length === 0) return;
  // R2I-6: the checklist item is the only status. Each parent gets one task per parent-assigned item, linked by
  // `aidItemId`; 06 reads and writes the task's status through that item. R2I-5: the title is the plain step
  // title, so a parent without the `colleges` share never sees a college name (06 listTasks adds it when allowed).
  const cssIds = new Set(css.map((c) => c.id));
  const parentItems = (
    await deps.db
      .select()
      .from(aidChecklistItems)
      .where(
        and(
          eq(aidChecklistItems.ownerId, studentId),
          eq(aidChecklistItems.awardYear, awardYear),
          eq(aidChecklistItems.assignee, "parent"),
        ),
      )
  ).filter((item) => item.program === "fafsa" || (item.collegeId !== null && cssIds.has(item.collegeId)));
  if (parentItems.length === 0) return;
  const linked = await deps.db
    .select({ aidItemId: familyTasks.aidItemId, assigneeId: familyTasks.assigneeId })
    .from(familyTasks)
    .where(
      and(
        eq(familyTasks.studentId, studentId),
        inArray(
          familyTasks.aidItemId,
          parentItems.map((item) => item.id),
        ),
      ),
    );
  for (const p of parents) {
    for (const item of parentItems) {
      if (linked.some((l) => l.aidItemId === item.id && l.assigneeId === p.userId)) continue;
      // createTask inserts with onConflictDoNothing on (aidItemId, assigneeId), so a racing call is harmless.
      await createTask(deps, system, {
        familyId: p.familyId,
        assigneeId: p.userId,
        studentId,
        kind: item.program === "fafsa" ? "fafsa_contributor" : "css_contributor",
        title: item.title,
        detail: item.program === "fafsa" ? `FAFSA ${awardYear}` : `CSS Profile ${awardYear}`,
        dueOn: item.dueOn,
        aidItemId: item.id,
      });
    }
  }
}

function checklist(
  program: AidProgram,
  awardYear: string,
  college: CollegeRow | null,
  steps: Array<{ key: string }>,
  rows: ItemRow[],
): AidChecklist {
  const order = (key: string) => steps.findIndex((s) => s.key === key);
  const items = [...rows].sort((a, b) => order(a.key) - order(b.key)).map(toItem);
  return {
    program,
    awardYear,
    collegeId: college?.id ?? null,
    collegeName: college?.name ?? null,
    items,
    doneCount: items.filter((i) => i.status === "done").length,
    totalCount: items.length,
  };
}

export async function getAidChecklists(deps: CoreDeps, actor: Actor, studentId: string): Promise<AidChecklist[]> {
  await assertCanRead(deps, actor, studentId, "deadlines");
  await ensureChecklists(deps, AID_SYSTEM, studentId);
  const awardYear = currentAwardYear(deps.clock.now());
  const rows = await deps.db
    .select()
    .from(aidChecklistItems)
    .where(and(eq(aidChecklistItems.ownerId, studentId), eq(aidChecklistItems.awardYear, awardYear)));
  const css = await cssColleges(deps, studentId);
  return [
    checklist(
      "fafsa",
      awardYear,
      null,
      FAFSA_STEPS,
      rows.filter((r) => r.program === "fafsa"),
    ),
    ...css.map((c) =>
      checklist(
        "css",
        awardYear,
        c,
        CSS_STEPS,
        rows.filter((r) => r.program === "css" && r.collegeId === c.id),
      ),
    ),
  ];
}

/** The student updates any item; a parent in the student's family updates items assigned to a parent. */
export async function updateAidItem(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  p: AidChecklistPatch,
): Promise<AidChecklistItem> {
  assertUser(actor);
  requireUuid(id, "Checklist item not found");
  const parsed = AidChecklistPatch.safeParse(p);
  if (!parsed.success) throw invalidInput("Check the status and try again", parsed.error.issues);
  const [row] = await deps.db.select().from(aidChecklistItems).where(eq(aidChecklistItems.id, id));
  if (!row) throw notFound("Checklist item not found");
  const allowed =
    row.ownerId === actor.userId ||
    (row.assignee === "parent" && (await isParentOf(deps.db, actor.userId, row.ownerId)));
  if (!allowed) throw notFound("Checklist item not found");
  const status = parsed.data.status;
  const updated = one(
    await deps.db
      .update(aidChecklistItems)
      .set({ status, completedAt: status === "done" ? deps.clock.now() : null })
      .where(eq(aidChecklistItems.id, id))
      .returning(),
    "aid_checklist_items update",
  );
  return toItem(updated);
}

export async function listAidDeadlines(deps: CoreDeps, actor: Actor, studentId: string): Promise<AidDeadline[]> {
  await assertCanRead(deps, actor, studentId, "deadlines");
  return loadAidDeadlines(deps, studentId);
}
