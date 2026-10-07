import {
  type DbOrTx,
  activities,
  and,
  asc,
  eq,
  inArray,
  scholarshipApplications,
  scholarships,
  serviceLogs,
} from "@scholarcrew/db";
import { type Activity, type ActivityInput, type Actor, type RequirementProgress, notFound } from "@scholarcrew/domain";
import { assertOwner, canRead } from "../access";
import { assertReadable, firstRow, hoursFromMinutes, requireUser } from "../scholarships/common";
import { privateScholarshipIds } from "../scholarships/matching";
import { liveListingWhere } from "../scholarships/search";
import { type CoreDeps, requireUuid } from "../shared";
import { toActivity } from "./mappers";

/** No access check: used by listActivities and the helper view. */
export async function loadActivities(db: DbOrTx, ownerId: string): Promise<Activity[]> {
  const rows = await db
    .select()
    .from(activities)
    .where(eq(activities.ownerId, ownerId))
    .orderBy(asc(activities.position));
  return rows.map(toActivity);
}

export async function listActivities(deps: CoreDeps, actor: Actor, ownerId: string): Promise<Activity[]> {
  await assertReadable(deps, actor, ownerId, "activities");
  return loadActivities(deps.db, ownerId);
}

export async function upsertActivity(deps: CoreDeps, actor: Actor, i: ActivityInput): Promise<Activity> {
  const user = requireUser(actor);
  const values = {
    name: i.name.trim(),
    role: i.role.trim(),
    organization: i.organization.trim(),
    description: i.description,
    hoursPerWeek: i.hoursPerWeek,
    weeksPerYear: i.weeksPerYear,
    grades: i.grades,
    category: i.category.trim(),
  };
  const row = firstRow(
    await deps.db
      .insert(activities)
      .values({ ownerId: user.userId, position: i.position, ...values })
      .onConflictDoUpdate({
        target: [activities.ownerId, activities.position],
        set: { ...values, updatedAt: deps.clock.now() },
      })
      .returning(),
    "activity",
  );
  return toActivity(row);
}

export async function deleteActivity(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  requireUser(actor);
  requireUuid(id, "Activity not found");
  const [row] = await deps.db.select({ ownerId: activities.ownerId }).from(activities).where(eq(activities.id, id));
  if (!row) throw notFound("Activity not found");
  assertOwner(actor, row.ownerId);
  await deps.db.delete(activities).where(and(eq(activities.id, id), eq(activities.ownerId, row.ownerId)));
}

export async function getRequirementProgress(
  deps: CoreDeps,
  actor: Actor,
  ownerId: string,
): Promise<RequirementProgress[]> {
  await assertReadable(deps, actor, ownerId, "activities");
  const open = await deps.db
    .select({ id: scholarships.id, name: scholarships.name, requirements: scholarships.requirements })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(
      and(
        eq(scholarshipApplications.ownerId, ownerId),
        inArray(scholarshipApplications.stage, ["matched", "planned", "drafting", "submitted"]),
        // Retired, under-review, and scam-flagged listings leave the requirement list (R2P-4).
        liveListingWhere(scholarshipApplications.ownerId),
      ),
    )
    .orderBy(asc(scholarships.name));
  const own = actor.kind === "system" || (actor.kind === "user" && actor.userId === ownerId);
  const privateIds = own ? new Set<string>() : await privateScholarshipIds(deps.db, ownerId);
  const namesShared = own || (await canRead(deps, actor, ownerId, "scholarships"));
  const needing = open.filter((s) => s.requirements.serviceHours !== null && !privateIds.has(s.id));
  if (needing.length === 0) return [];
  const logs = await deps.db
    .select({ minutes: serviceLogs.minutes, verification: serviceLogs.verification })
    .from(serviceLogs)
    .where(eq(serviceLogs.ownerId, ownerId));
  const verified = logs.filter((l) => l.verification === "verified").reduce((s, l) => s + l.minutes, 0);
  const total = logs.filter((l) => l.verification !== "declined").reduce((s, l) => s + l.minutes, 0);
  return needing.map((s) => ({
    scholarshipId: s.id,
    scholarshipName: namesShared ? s.name : "A saved scholarship",
    requiredHours: s.requirements.serviceHours ?? 0,
    verifiedHours: hoursFromMinutes(verified),
    totalHours: hoursFromMinutes(total),
  }));
}
