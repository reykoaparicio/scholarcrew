import { and, crewJobs, eq, gt, isNotNull, planItems, profiles, users } from "@scholarcrew/db";
import {
  type Actor,
  type CrewJob,
  IsoDate,
  type PlanItem,
  PlanItemInput,
  PlanItemPatch,
  type WeekPlan,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { prioritizePlanItems, weekStartFor } from "@scholarcrew/engines";
import { assertCanRead, assertOwner, assertSystem, assertUser } from "../access";
import { assertCrewAllowance } from "../billing";
import { insertJob } from "../crew/jobs";
import { type CoreDeps, isUuid, one, requireUuid } from "../shared";
import { mondayOf, toPlanItem, userTimeZone } from "./common";

/** The week's items in priority order. No access check. */
export async function loadWeekPlan(deps: CoreDeps, ownerId: string, weekStart?: IsoDate): Promise<WeekPlan> {
  const now = deps.clock.now();
  const timeZone = await userTimeZone(deps.db, ownerId);
  const week = weekStart ? mondayOf(weekStart) : weekStartFor(now, timeZone);
  const rows = await deps.db
    .select()
    .from(planItems)
    .where(and(eq(planItems.ownerId, ownerId), eq(planItems.weekStart, week)));
  const items = prioritizePlanItems(rows.map(toPlanItem), now, timeZone);
  return {
    weekStart: week,
    items,
    totalMinutes: items.reduce((sum, i) => sum + i.minutes, 0),
    doneCount: items.filter((i) => i.status === "done").length,
  };
}

export async function getWeekPlan(
  deps: CoreDeps,
  actor: Actor,
  studentId: string,
  weekStart?: IsoDate,
): Promise<WeekPlan> {
  await assertCanRead(deps, actor, studentId, "deadlines");
  if (weekStart !== undefined && !IsoDate.safeParse(weekStart).success) {
    throw invalidInput("Use a YYYY-MM-DD week start");
  }
  return loadWeekPlan(deps, studentId, weekStart);
}

export async function addPlanItem(deps: CoreDeps, actor: Actor, i: PlanItemInput): Promise<PlanItem> {
  assertUser(actor);
  const parsed = PlanItemInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the plan item and try again", parsed.error.issues);
  const v = parsed.data;
  const now = deps.clock.now();
  const weekStart = v.weekStart ? mondayOf(v.weekStart) : weekStartFor(now, await userTimeZone(deps.db, actor.userId));
  // One item per thing per week: a crew card for work already planned (by "Plan my week" or an earlier card)
  // returns that item instead of listing it twice.
  if (v.refType !== null && v.refId !== null) {
    const [existing] = await deps.db
      .select()
      .from(planItems)
      .where(
        and(
          eq(planItems.ownerId, actor.userId),
          eq(planItems.weekStart, weekStart),
          eq(planItems.refType, v.refType),
          eq(planItems.refId, v.refId),
        ),
      )
      .limit(1);
    if (existing) {
      if (!existing.generated) return toPlanItem(existing);
      // The student chose it, so regenerating the week no longer replaces it (R2C-4).
      const kept = one(
        await deps.db.update(planItems).set({ generated: false }).where(eq(planItems.id, existing.id)).returning(),
        "plan_items keep",
      );
      return toPlanItem(kept);
    }
  }
  const row = one(
    await deps.db
      .insert(planItems)
      .values({
        ownerId: actor.userId,
        weekStart,
        title: v.title,
        kind: v.kind,
        refType: v.refType,
        refId: v.refId,
        minutes: v.minutes,
        valueUsd: v.valueUsd,
        dueOn: v.dueOn,
        contributors: v.contributors,
        createdAt: now,
      })
      .returning(),
    "plan_items insert",
  );
  return toPlanItem(row);
}

export async function updatePlanItem(deps: CoreDeps, actor: Actor, id: string, p: PlanItemPatch): Promise<PlanItem> {
  assertUser(actor);
  requireUuid(id, "Plan item not found");
  const parsed = PlanItemPatch.safeParse(p);
  if (!parsed.success) throw invalidInput("Check the plan item and try again", parsed.error.issues);
  const [row] = await deps.db.select().from(planItems).where(eq(planItems.id, id));
  if (!row) throw notFound("Plan item not found");
  assertOwner(actor, row.ownerId);
  const set: Partial<typeof planItems.$inferInsert> = {};
  if (parsed.data.status !== undefined) {
    set.status = parsed.data.status;
    set.completedAt = parsed.data.status === "done" ? deps.clock.now() : null;
  }
  if (parsed.data.weekStart !== undefined) set.weekStart = mondayOf(parsed.data.weekStart);
  if (Object.keys(set).length === 0) return toPlanItem(row);
  const updated = one(
    await deps.db.update(planItems).set(set).where(eq(planItems.id, id)).returning(),
    "plan_items update",
  );
  return toPlanItem(updated);
}

export async function requestWeeklyPlan(deps: CoreDeps, actor: Actor): Promise<CrewJob> {
  assertUser(actor);
  await assertCrewAllowance(deps, actor.userId);
  const job = await insertJob(deps.db, { ownerId: actor.userId, kind: "weekly_plan", now: deps.clock.now() });
  await deps.jobs.enqueue("plan.weekly", { jobId: job.id, ownerId: actor.userId });
  return job;
}

/** A `weekly_plan` job this recent means the Monday fan-out (or the student) already asked. */
const SYSTEM_PLAN_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/**
 * R2C-5: the Monday `plan.weekly.fanout` calls this per student. System only, no allowance check (the worker
 * runs it with `crewRequest: false`). Returns null for anyone who isn't an active, onboarded student, and when
 * a `weekly_plan` job was created in the last 12 hours, so fan-out retries don't double up.
 */
export async function startWeeklyPlan(deps: CoreDeps, system: Actor, ownerId: string): Promise<CrewJob | null> {
  assertSystem(system);
  if (!isUuid(ownerId)) return null;
  const [student] = await deps.db
    .select({ id: users.id })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        eq(users.id, ownerId),
        eq(users.role, "student"),
        eq(users.status, "active"),
        isNotNull(profiles.onboardingCompletedAt),
      ),
    );
  if (!student) return null;
  const now = deps.clock.now();
  const [recent] = await deps.db
    .select({ id: crewJobs.id })
    .from(crewJobs)
    .where(
      and(
        eq(crewJobs.ownerId, ownerId),
        eq(crewJobs.kind, "weekly_plan"),
        gt(crewJobs.createdAt, new Date(now.getTime() - SYSTEM_PLAN_COOLDOWN_MS)),
      ),
    )
    .limit(1);
  if (recent) return null;
  const job = await insertJob(deps.db, { ownerId, kind: "weekly_plan", now });
  await deps.jobs.enqueue("plan.weekly", { jobId: job.id, ownerId, source: "system" });
  return job;
}

/**
 * Swaps the crew's open items for the week. Only rows this function inserted (`generated = true`) are
 * replaced (R2C-4): items the student added, applied from an action card, or accepted from a study plan stay,
 * whatever their contributors, and done or skipped items stay too.
 */
export async function replaceGeneratedPlan(
  deps: CoreDeps,
  system: Actor,
  i: { ownerId: string; weekStart: IsoDate; items: PlanItemInput[] },
): Promise<WeekPlan> {
  assertSystem(system);
  requireUuid(i.ownerId, "Student not found");
  if (!IsoDate.safeParse(i.weekStart).success) throw invalidInput("Use a YYYY-MM-DD week start");
  const week = mondayOf(i.weekStart);
  const items = i.items.map((raw, idx) => {
    const parsed = PlanItemInput.safeParse(raw);
    if (!parsed.success) throw invalidInput(`Plan item ${idx + 1} is invalid`, parsed.error.issues);
    return parsed.data;
  });
  const now = deps.clock.now();
  await deps.db.transaction(async (tx) => {
    await tx
      .delete(planItems)
      .where(
        and(
          eq(planItems.ownerId, i.ownerId),
          eq(planItems.weekStart, week),
          eq(planItems.status, "todo"),
          eq(planItems.generated, true),
        ),
      );
    // Items that stayed (student-added, applied from a card, done, or skipped) aren't planned a second time.
    const kept = await tx
      .select({ refType: planItems.refType, refId: planItems.refId })
      .from(planItems)
      .where(and(eq(planItems.ownerId, i.ownerId), eq(planItems.weekStart, week)));
    const keptRefs = new Set(kept.flatMap((k) => (k.refType && k.refId ? [`${k.refType}:${k.refId}`] : [])));
    const fresh = items.filter((v) => !(v.refType && v.refId && keptRefs.has(`${v.refType}:${v.refId}`)));
    if (fresh.length === 0) return;
    await tx.insert(planItems).values(
      fresh.map((v, idx) => ({
        ownerId: i.ownerId,
        weekStart: week,
        title: v.title,
        kind: v.kind,
        refType: v.refType,
        refId: v.refId,
        minutes: v.minutes,
        valueUsd: v.valueUsd,
        dueOn: v.dueOn,
        contributors: v.contributors.length > 0 ? v.contributors : ["compass" as const],
        priority: fresh.length - idx,
        generated: true,
        createdAt: now,
      })),
    );
  });
  return loadWeekPlan(deps, i.ownerId, week);
}
