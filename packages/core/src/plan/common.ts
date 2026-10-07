import { type DbOrTx, and, eq, familyMembers, inArray, type planItems, users } from "@scholarcrew/db";
import type { AppPlan, AppStatus, ApplicationStage, CollegeDeadlines, IsoDate, PlanItem } from "@scholarcrew/domain";
import { weekStartFor } from "@scholarcrew/engines";
import { toIso, toIsoOrNull } from "../shared";

export const DEFAULT_TIME_ZONE = "America/Chicago";

// R3V-5/R3V-8/R3V-9: `APP_PLAN_LABELS` comes from `@scholarcrew/domain`, `formatUsd` from `@scholarcrew/engines`,
// and `todayIn` from `../shared`; this file keeps no copies.

/** Saved scholarships the student is still working on. */
export const OPEN_APP_STAGES: ApplicationStage[] = ["matched", "planned", "drafting"];

/** College list entries that still have an application deadline ahead. */
export const ACTIVE_LIST_STATUSES: AppStatus[] = ["researching", "applying"];

export function addIsoDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
export function mondayOf(date: IsoDate): IsoDate {
  return weekStartFor(new Date(`${date}T12:00:00.000Z`), "UTC");
}

export function planDeadline(deadlines: CollegeDeadlines, plan: AppPlan): IsoDate | null {
  if (plan === "rolling") return null;
  return deadlines[plan] ?? null;
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "there";
}

export async function userTimeZone(db: DbOrTx, userId: string): Promise<string> {
  const [row] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, userId));
  return row?.timeZone ?? DEFAULT_TIME_ZONE;
}

/** Families where `studentId` is the student member. */
export async function studentFamilyIds(db: DbOrTx, studentId: string): Promise<string[]> {
  const rows = await db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, studentId), eq(familyMembers.memberRole, "student")));
  return rows.map((r) => r.familyId);
}

/** Parent members of the student's families. */
export async function parentsOf(db: DbOrTx, studentId: string): Promise<Array<{ familyId: string; userId: string }>> {
  const familyIds = await studentFamilyIds(db, studentId);
  if (familyIds.length === 0) return [];
  return db
    .select({ familyId: familyMembers.familyId, userId: familyMembers.userId })
    .from(familyMembers)
    .where(and(inArray(familyMembers.familyId, familyIds), eq(familyMembers.memberRole, "parent")));
}

export async function isParentOf(db: DbOrTx, parentId: string, studentId: string): Promise<boolean> {
  return (await parentsOf(db, studentId)).some((p) => p.userId === parentId);
}

export function toPlanItem(row: typeof planItems.$inferSelect): PlanItem {
  return {
    id: row.id,
    weekStart: row.weekStart,
    title: row.title,
    kind: row.kind,
    refType: row.refType,
    refId: row.refId,
    minutes: row.minutes,
    valueUsd: row.valueUsd,
    dueOn: row.dueOn,
    status: row.status,
    contributors: row.contributors,
    priority: row.priority,
    createdAt: toIso(row.createdAt),
    completedAt: toIsoOrNull(row.completedAt),
  };
}
