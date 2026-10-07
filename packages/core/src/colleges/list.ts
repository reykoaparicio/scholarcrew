import {
  type DbOrTx,
  aidChecklistItems,
  and,
  applicationItems,
  asc,
  collegeList,
  colleges,
  count,
  eq,
  inArray,
  isNull,
  lte,
  offers,
  pgErrorCode,
} from "@scholarcrew/db";
import {
  type Actor,
  type AppPlan,
  type ApplicationItemKind,
  type CollegeListEntry,
  type CollegeListInput,
  type CollegeListPatch,
  MAX_COLLEGE_LIST,
  awardYearFor,
  conflict,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import type { SQL } from "drizzle-orm";
import { assertOwner } from "../access";
import { assertReadable, requireUser } from "../scholarships/common";
import { type CoreDeps, currentSeason, requireUuid, toIso } from "../shared";
import { type CollegeRow, deadlineFor, toCollegeSummary } from "./mappers";

/** Entries matching `where`, with item counts. No access check. */
export async function loadEntries(db: DbOrTx, where: SQL): Promise<CollegeListEntry[]> {
  const rows = await db
    .select({ entry: collegeList, college: colleges })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .where(where)
    .orderBy(asc(collegeList.createdAt), asc(colleges.name));
  if (rows.length === 0) return [];
  const counts = await db
    .select({ entryId: applicationItems.collegeListId, status: applicationItems.status, n: count() })
    .from(applicationItems)
    .where(
      inArray(
        applicationItems.collegeListId,
        rows.map((r) => r.entry.id),
      ),
    )
    .groupBy(applicationItems.collegeListId, applicationItems.status);
  return rows.map(({ entry, college }) => {
    const mine = counts.filter((c) => c.entryId === entry.id);
    return {
      id: entry.id,
      collegeId: entry.collegeId,
      college: toCollegeSummary(college),
      fit: entry.fit,
      plan: entry.plan,
      status: entry.status,
      season: entry.season,
      deadline: deadlineFor(college.deadlines, entry.plan),
      itemsDone: mine.filter((c) => c.status === "done").reduce((s, c) => s + c.n, 0),
      itemsTotal: mine.filter((c) => c.status !== "not_needed").reduce((s, c) => s + c.n, 0),
      gapUsd: null,
      outsidePolicy: college.outsidePolicy,
      testPolicy: college.testPolicy,
      createdAt: toIso(entry.createdAt),
    };
  });
}

export function activeListWhere(ownerId: string): SQL {
  return and(eq(collegeList.ownerId, ownerId), isNull(collegeList.archivedAt)) as SQL;
}

function short(text: string): string {
  const t = text.trim();
  return t.length > 60 ? `${t.slice(0, 57)}...` : t;
}

/** Application items the catalog requirements call for. */
export function buildItems(college: CollegeRow, plan: AppPlan) {
  const dueOn = deadlineFor(college.deadlines, plan);
  const r = college.requirements;
  const items: Array<{ kind: ApplicationItemKind; label: string }> = [
    { kind: "form", label: "Application form" },
    { kind: "transcript", label: "Official transcript" },
  ];
  if (r.counselorRec) items.push({ kind: "counselor_rec", label: "Counselor recommendation" });
  for (let n = 1; n <= r.teacherRecs; n += 1) items.push({ kind: "teacher_rec", label: `Teacher recommendation ${n}` });
  for (const [idx, s] of r.supplements.entries()) {
    items.push({ kind: "supplement", label: `Supplement ${idx + 1}: ${short(s.prompt)}` });
  }
  if (college.testPolicy === "required") items.push({ kind: "test_scores", label: "Send test scores" });
  const fee = r.applicationFeeUsd ?? 0;
  if (fee > 0 || r.feeWaiverAvailable) {
    items.push({
      kind: "fee_or_waiver",
      label: fee > 0 ? `Pay the $${fee} fee or request a waiver` : "Request a fee waiver",
    });
  }
  if (college.cssProfileRequired) items.push({ kind: "css_profile", label: "CSS Profile" });
  return items.map((i) => ({ ...i, dueOn }));
}

export async function getCollegeList(deps: CoreDeps, actor: Actor, studentId: string): Promise<CollegeListEntry[]> {
  await assertReadable(deps, actor, studentId, "colleges");
  return loadEntries(deps.db, activeListWhere(studentId));
}

export async function addCollege(deps: CoreDeps, actor: Actor, i: CollegeListInput): Promise<CollegeListEntry> {
  const user = requireUser(actor);
  const [college] = await deps.db.select().from(colleges).where(eq(colleges.id, i.collegeId));
  if (!college) throw notFound("College not found");
  const season = currentSeason(deps.clock.now());
  const [active] = await deps.db.select({ n: count() }).from(collegeList).where(activeListWhere(user.userId));
  if ((active?.n ?? 0) >= MAX_COLLEGE_LIST) {
    throw invalidInput(`Your list holds up to ${MAX_COLLEGE_LIST} colleges. Remove one to add another.`);
  }
  const dup = await deps.db
    .select({ id: collegeList.id })
    .from(collegeList)
    .where(
      and(eq(collegeList.ownerId, user.userId), eq(collegeList.collegeId, college.id), isNull(collegeList.archivedAt)),
    );
  if (dup.length > 0) throw conflict("That college is already on your list.");
  try {
    return await deps.db.transaction(async (tx) => {
      const [entry] = await tx
        .insert(collegeList)
        .values({ ownerId: user.userId, collegeId: college.id, fit: i.fit, plan: i.plan, season })
        .returning();
      if (!entry) throw new Error("college list insert returned no row");
      await tx
        .insert(applicationItems)
        .values(
          buildItems(college, i.plan).map((item) => ({ ...item, ownerId: user.userId, collegeListId: entry.id })),
        );
      const [created] = await loadEntries(tx, eq(collegeList.id, entry.id));
      if (!created) throw new Error("college list entry missing after insert");
      return created;
    });
  } catch (e) {
    if (pgErrorCode(e) === "23505") throw conflict("That college is already on your list.");
    throw e;
  }
}

async function ownedEntry(deps: CoreDeps, actor: Actor, id: string) {
  requireUuid(id, "College list entry not found");
  const [entry] = await deps.db.select().from(collegeList).where(eq(collegeList.id, id));
  if (!entry) throw notFound("College list entry not found");
  assertOwner(actor, entry.ownerId);
  return entry;
}

export async function updateCollegeEntry(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  p: CollegeListPatch,
): Promise<CollegeListEntry> {
  requireUser(actor);
  const entry = await ownedEntry(deps, actor, id);
  return deps.db.transaction(async (tx) => {
    await tx
      .update(collegeList)
      .set({ fit: p.fit ?? entry.fit, plan: p.plan ?? entry.plan, status: p.status ?? entry.status })
      .where(and(eq(collegeList.id, id), eq(collegeList.ownerId, entry.ownerId)));
    if (p.plan && p.plan !== entry.plan) {
      const [college] = await tx.select().from(colleges).where(eq(colleges.id, entry.collegeId));
      const dueOn = college ? deadlineFor(college.deadlines, p.plan) : null;
      await tx.update(applicationItems).set({ dueOn }).where(eq(applicationItems.collegeListId, id));
    }
    const [updated] = await loadEntries(tx, eq(collegeList.id, id));
    if (!updated) throw notFound("College list entry not found");
    return updated;
  });
}

export async function removeCollege(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  requireUser(actor);
  const entry = await ownedEntry(deps, actor, id);
  await deps.db.transaction(async (tx) => {
    await tx.delete(collegeList).where(and(eq(collegeList.id, id), eq(collegeList.ownerId, entry.ownerId)));
    const [other] = await tx
      .select({ id: collegeList.id })
      .from(collegeList)
      .where(and(activeListWhere(entry.ownerId), eq(collegeList.collegeId, entry.collegeId)))
      .limit(1);
    if (!other)
      await tx
        .delete(aidChecklistItems)
        .where(
          and(
            eq(aidChecklistItems.ownerId, entry.ownerId),
            eq(aidChecklistItems.collegeId, entry.collegeId),
            eq(aidChecklistItems.program, "css"),
          ),
        );
  });
}

/** ME-07: archives the active college list and the offers for this season's award year and earlier (`awardYearFor` is 02's, R3V-7). */
export async function archiveSeason(deps: CoreDeps, actor: Actor): Promise<{ archived: number }> {
  const user = requireUser(actor);
  const now = deps.clock.now();
  const awardYear = awardYearFor(currentSeason(now));
  return deps.db.transaction(async (tx) => {
    const rows = await tx
      .update(collegeList)
      .set({ archivedAt: now })
      .where(and(eq(collegeList.ownerId, user.userId), isNull(collegeList.archivedAt)))
      .returning({ id: collegeList.id });
    // "YYYY-YY" award years sort as strings, so lte also catches older unarchived offers.
    await tx
      .update(offers)
      .set({ archivedAt: now })
      .where(and(eq(offers.ownerId, user.userId), lte(offers.awardYear, awardYear), isNull(offers.archivedAt)));
    return { archived: rows.length };
  });
}
