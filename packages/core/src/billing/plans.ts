import {
  type DbOrTx,
  and,
  count,
  crewJobs,
  desc,
  eq,
  familyMembers,
  gt,
  inArray,
  ne,
  sponsorCodes,
  sponsorRedemptions,
  sql,
  subscriptions,
  usageCounters,
  users,
} from "@scholarcrew/db";
import {
  type Actor,
  AppError,
  PLAN_LIMITS,
  type PlanId,
  type Subscription,
  type UsageSummary,
} from "@scholarcrew/domain";
import { assertSystem, assertUser, familyIdsFor } from "../access";
import {
  type CoreDeps,
  addMinutes,
  instantInZone,
  monthKey,
  nextMonthStartUtc,
  safeTimeZone,
  toIsoOrNull,
} from "../shared";

export type SubscriptionRow = typeof subscriptions.$inferSelect;

export async function ownSubscription(db: DbOrTx, userId: string): Promise<SubscriptionRow | undefined> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.ownerId, userId)).limit(1);
  return row;
}

export function isPaidAndLive(row: SubscriptionRow, now: Date): boolean {
  return (
    row.plan !== "free" && row.status === "active" && (row.currentPeriodEnd === null || row.currentPeriodEnd > now)
  );
}

/** The user's own live paid plan, else a live paid plan of a parent in the same family, else free. */
export async function planFor(deps: CoreDeps, userId: string): Promise<PlanId> {
  const now = deps.clock.now();
  const own = await ownSubscription(deps.db, userId);
  if (own && isPaidAndLive(own, now)) return own.plan;
  const familyIds = await familyIdsFor(deps, userId);
  if (familyIds.length === 0) return "free";
  const rows = await deps.db
    .select({ sub: subscriptions })
    .from(subscriptions)
    .innerJoin(familyMembers, eq(familyMembers.userId, subscriptions.ownerId))
    .where(
      and(
        inArray(familyMembers.familyId, familyIds),
        eq(familyMembers.memberRole, "parent"),
        ne(subscriptions.plan, "free"),
      ),
    );
  const live = rows.map((r) => r.sub).find((s) => isPaidAndLive(s, now));
  return live ? live.plan : "free";
}

async function sponsorName(db: DbOrTx, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: sponsorCodes.sponsorName })
    .from(sponsorRedemptions)
    .innerJoin(sponsorCodes, eq(sponsorCodes.code, sponsorRedemptions.code))
    .where(eq(sponsorRedemptions.userId, userId))
    .orderBy(desc(sponsorRedemptions.redeemedAt))
    .limit(1);
  return row?.name ?? null;
}

export async function getSubscription(deps: CoreDeps, actor: Actor): Promise<Subscription> {
  assertUser(actor);
  const now = deps.clock.now();
  const own = await ownSubscription(deps.db, actor.userId);
  const managedByStripe = Boolean(own?.stripeCustomerId || own?.stripeSubscriptionId);
  if (own && isPaidAndLive(own, now)) {
    return {
      plan: own.plan,
      status: own.status,
      currentPeriodEnd: toIsoOrNull(own.currentPeriodEnd),
      managedByStripe,
      sponsor: managedByStripe ? null : await sponsorName(deps.db, actor.userId),
    };
  }
  const covered = await planFor(deps, actor.userId);
  if (covered !== "free") {
    return { plan: covered, status: "active", currentPeriodEnd: null, managedByStripe: false, sponsor: null };
  }
  if (own && own.plan !== "free") {
    return {
      plan: "free",
      status: own.status === "active" ? "expired" : own.status,
      currentPeriodEnd: toIsoOrNull(own.currentPeriodEnd),
      managedByStripe,
      sponsor: null,
    };
  }
  return { plan: "free", status: "active", currentPeriodEnd: null, managedByStripe, sponsor: null };
}

async function counterFor(
  db: DbOrTx,
  userId: string,
  month: string,
): Promise<{ crewRequests: number; costMicros: number }> {
  const [row] = await db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.month, month)));
  return { crewRequests: row?.crewRequests ?? 0, costMicros: row?.costMicros ?? 0 };
}

export async function getUsage(deps: CoreDeps, actor: Actor): Promise<UsageSummary> {
  assertUser(actor);
  const month = monthKey(deps.clock.now());
  const counter = await counterFor(deps.db, actor.userId, month);
  const plan = await planFor(deps, actor.userId);
  return { month, ...counter, limit: PLAN_LIMITS[plan].crewRequestsPerMonth };
}

const IN_FLIGHT_WINDOW_MINUTES = 60;

/**
 * Jobs that will bill when they finish: queued or working, created in the last hour (a stuck job stops
 * holding allowance after that). Offer parsing is excluded. Pending weekly plans reserve a slot too;
 * system plans release that reservation on completion without consuming a monthly request.
 */
async function inFlightCrewJobs(db: DbOrTx, userId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(crewJobs)
    .where(
      and(
        eq(crewJobs.ownerId, userId),
        inArray(crewJobs.status, ["queued", "working"]),
        ne(crewJobs.kind, "offer_parse"),
        eq(crewJobs.usageMonth, monthKey(now)),
        gt(crewJobs.createdAt, addMinutes(now, -IN_FLIGHT_WINDOW_MINUTES)),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Throws limit_reached once this month's crew requests plus in-flight jobs reach the plan allowance
 * (R2C-8). Manual features don't call it.
 */
export async function assertCrewAllowance(deps: CoreDeps, userId: string, tx?: DbOrTx): Promise<void> {
  if (!tx) return deps.db.transaction((locked) => assertCrewAllowance(deps, userId, locked));
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`crew-allowance:${userId}`}))`);
  const now = deps.clock.now();
  const month = monthKey(now);
  const { crewRequests } = await counterFor(tx, userId, month);
  const used = crewRequests + (await inFlightCrewJobs(tx, userId, now));
  const limit = PLAN_LIMITS[await planFor(deps, userId)].crewRequestsPerMonth;
  if (used >= limit) {
    const [user] = await tx.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, userId));
    const reset = instantInZone(nextMonthStartUtc(now), safeTimeZone(user?.timeZone ?? "UTC"));
    throw new AppError(
      "limit_reached",
      `You've used all ${limit} crew requests this month. Manual tools still work, and the count resets ${reset}.`,
      { limit, used },
    );
  }
}

export async function recordUsage(
  deps: CoreDeps,
  system: Actor,
  i: { userId: string; costMicros: number; crewRequest: boolean },
): Promise<void> {
  assertSystem(system);
  await addUsage(deps.db, { ...i, month: monthKey(deps.clock.now()) });
}

export async function addUsage(
  db: DbOrTx,
  i: { userId: string; month: string; costMicros: number; crewRequest: boolean },
): Promise<void> {
  const month = i.month;
  const requests = i.crewRequest ? 1 : 0;
  const cost = Math.max(0, Math.round(i.costMicros));
  await db
    .insert(usageCounters)
    .values({ userId: i.userId, month, crewRequests: requests, costMicros: cost })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.month],
      set: {
        crewRequests: sql`${usageCounters.crewRequests} + ${requests}`,
        costMicros: sql`${usageCounters.costMicros} + ${cost}`,
      },
    });
}
