import {
  type DbOrTx,
  activities,
  and,
  asc,
  collegeList,
  colleges,
  crewJobs,
  eq,
  inArray,
  isNull,
  profiles,
  sessions,
  users,
} from "@scholarcrew/db";
import {
  type Activity,
  type Actor,
  AppError,
  type AutofillProfile,
  type FactValue,
  type IsoDate,
  type MeResponse,
  OnboardingInput,
  type Profile,
  ProfilePatch,
  conflict,
  invalidInput,
  unauthenticated,
} from "@scholarcrew/domain";
import { assertOwner, assertRole, assertUser } from "../access";
import { recordAudit } from "../audit";
import { planFor } from "../billing";
import { membershipOf } from "../family/core";
import { writeConfirmedFact } from "../memory/facts";
import { writeSensitiveFact } from "../memory/sensitive";
import {
  type CoreDeps,
  currentSeason,
  isValidTimeZone,
  monthKey,
  one,
  requireUuid,
  toIso,
  toIsoOrNull,
  toUser,
  todayIn,
} from "../shared";

type ProfileRow = typeof profiles.$inferSelect;

const MIN_AGE = 13;

/**
 * ID-03, R3V-13: the rule is "the student's local year minus birth year is under 13". `today` is the
 * student's calendar date (`todayIn(now, timeZone)`), so Dec 31 evening in Chicago is still that year.
 * A birth year alone can't tell a 12-year-old from a 13-year-old in the same year; round 4 decides.
 */
export function isUnderMinAge(birthYear: number, today: IsoDate): boolean {
  return Number(today.slice(0, 4)) - birthYear < MIN_AGE;
}

const toGpa = (x100: number | null): number | null => (x100 === null ? null : x100 / 100);
const toX100 = (gpa: number | null): number | null => (gpa === null ? null : Math.round(gpa * 100));

function toProfile(row: ProfileRow): Profile {
  return {
    userId: row.userId,
    classYear: row.classYear,
    highSchool: row.highSchool,
    state: row.state,
    county: row.county,
    city: row.city,
    gpaUnweighted: toGpa(row.gpaUnweightedX100),
    gpaWeighted: toGpa(row.gpaWeightedX100),
    intendedMajors: row.intendedMajors,
    interests: row.interests,
    onboardingCompletedAt: toIsoOrNull(row.onboardingCompletedAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toActivity(row: typeof activities.$inferSelect): Activity {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    role: row.role,
    organization: row.organization,
    description: row.description,
    hoursPerWeek: row.hoursPerWeek,
    weeksPerYear: row.weeksPerYear,
    grades: row.grades,
    category: row.category,
  };
}

/** The profile row, created empty when it's missing (accounts made outside verifyMagicLink). */
async function profileRow(db: DbOrTx, userId: string): Promise<ProfileRow> {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (row) return row;
  await db.insert(profiles).values({ userId }).onConflictDoNothing();
  return one(await db.select().from(profiles).where(eq(profiles.userId, userId)), "profiles select");
}

type FactFields = {
  classYear?: number | null;
  highSchool?: string;
  state?: string;
  county?: string;
  city?: string;
  gpaUnweighted?: number | null;
  intendedMajors?: string[];
  interests?: string[];
};

/** ON-01: each saved profile value becomes a user_stated fact. Empty values are skipped. */
function profileFacts(p: FactFields): Array<[string, FactValue]> {
  const out: Array<[string, FactValue]> = [];
  if (p.classYear !== undefined && p.classYear !== null) out.push(["class_year", p.classYear]);
  if (p.highSchool) out.push(["high_school", p.highSchool]);
  if (p.state) out.push(["state", p.state]);
  if (p.county) out.push(["county", p.county]);
  if (p.city) out.push(["city", p.city]);
  if (p.gpaUnweighted !== undefined && p.gpaUnweighted !== null) out.push(["gpa_unweighted", p.gpaUnweighted]);
  if (p.intendedMajors && p.intendedMajors.length > 0) out.push(["intended_majors", p.intendedMajors]);
  if (p.interests && p.interests.length > 0) out.push(["interests", p.interests]);
  return out;
}

async function writeProfileFacts(
  db: DbOrTx,
  ownerId: string,
  p: FactFields,
  sourceRef: string,
  now: Date,
): Promise<void> {
  for (const [key, value] of profileFacts(p)) {
    await writeConfirmedFact(db, ownerId, { key, value, source: "user_stated", sourceRef }, now);
  }
}

export async function getMe(deps: CoreDeps, actor: Actor): Promise<MeResponse> {
  assertUser(actor);
  const [user] = await deps.db.select().from(users).where(eq(users.id, actor.userId)).limit(1);
  if (!user || user.status !== "active") throw unauthenticated();
  const [profile] = await deps.db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  const membership = await membershipOf(deps.db, user.id);
  return {
    user: toUser(user),
    profile: profile ? toProfile(profile) : null,
    // Only students go through onboarding; parents and admins never see it.
    onboardingComplete: user.role !== "student" || Boolean(profile?.onboardingCompletedAt),
    family: membership ? { id: membership.familyId, role: membership.memberRole } : null,
    plan: await planFor(deps, user.id),
  };
}

export async function getProfile(deps: CoreDeps, actor: Actor, userId: string): Promise<Profile> {
  requireUuid(userId, "Profile not found");
  assertOwner(actor, userId);
  return toProfile(await profileRow(deps.db, userId));
}

export async function updateProfile(deps: CoreDeps, actor: Actor, patch: ProfilePatch): Promise<Profile> {
  assertUser(actor);
  const parsed = ProfilePatch.safeParse(patch);
  if (!parsed.success) throw invalidInput("Check your profile and try again", parsed.error.issues);
  const p = parsed.data;
  if (p.timeZone !== undefined && !isValidTimeZone(p.timeZone)) throw invalidInput("Unknown time zone");
  const now = deps.clock.now();
  const userId = actor.userId;
  const row = await deps.db.transaction(async (tx) => {
    const userSet: { displayName?: string; timeZone?: string } = {};
    if (p.displayName !== undefined) userSet.displayName = p.displayName;
    if (p.timeZone !== undefined) userSet.timeZone = p.timeZone;
    if (Object.keys(userSet).length > 0) await tx.update(users).set(userSet).where(eq(users.id, userId));
    await profileRow(tx, userId);
    const updated = one(
      await tx
        .update(profiles)
        .set({
          classYear: p.classYear,
          highSchool: p.highSchool,
          state: p.state,
          county: p.county,
          city: p.city,
          gpaUnweightedX100: p.gpaUnweighted === undefined ? undefined : toX100(p.gpaUnweighted),
          gpaWeightedX100: p.gpaWeighted === undefined ? undefined : toX100(p.gpaWeighted),
          intendedMajors: p.intendedMajors,
          interests: p.interests,
          updatedAt: now,
        })
        .where(eq(profiles.userId, userId))
        .returning(),
      "profiles update",
    );
    await writeProfileFacts(tx, userId, p, "profile", now);
    return updated;
  });
  return toProfile(row);
}

/**
 * ID-03 age gate, then ON-01/03/04/06: profile, facts, sensitive opt-ins, starter college list
 * (unknown college ids are skipped), and the first weekly plan and sweep jobs.
 */
export async function completeOnboarding(deps: CoreDeps, actor: Actor, i: OnboardingInput): Promise<MeResponse> {
  assertRole(actor, "student");
  const parsed = OnboardingInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check your answers and try again", parsed.error.issues);
  const input = parsed.data;
  const now = deps.clock.now();
  const userId = actor.userId;
  // The zone check runs first: the age gate reads the year in the student's zone (R3V-13).
  if (!isValidTimeZone(input.timeZone)) throw invalidInput("Unknown time zone");
  if (isUnderMinAge(input.birthYear, todayIn(now, input.timeZone))) {
    // R2I-17: deletedAt starts the purge clock, so the whole account is gone within 7 days.
    await deps.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ status: "blocked_underage", birthYear: input.birthYear, deletedAt: now })
        .where(eq(users.id, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    });
    await recordAudit(deps, { actor, action: "blocked_underage", entityType: "user", entityId: userId });
    // R3A-17: the reason tells this refusal apart from a CSRF or role 403, so 16 blocks only on it.
    throw new AppError("forbidden", "ScholarCrew is for students 13 and older", { reason: "underage" });
  }
  const existing = await profileRow(deps.db, userId);
  if (existing.onboardingCompletedAt) throw conflict("Onboarding is already complete");
  const season = currentSeason(now);
  const jobId = await deps.db.transaction(async (tx) => {
    const claimed = await tx
      .update(profiles)
      .set({ onboardingCompletedAt: now })
      .where(and(eq(profiles.userId, userId), isNull(profiles.onboardingCompletedAt)))
      .returning();
    if (!claimed.length) throw conflict("Onboarding is already complete");
    await tx
      .update(users)
      .set({ displayName: input.displayName, birthYear: input.birthYear, timeZone: input.timeZone })
      .where(eq(users.id, userId));
    await tx
      .update(profiles)
      .set({
        classYear: input.classYear,
        highSchool: input.highSchool,
        state: input.state,
        county: input.county,
        city: input.city,
        gpaUnweightedX100: toX100(input.gpaUnweighted),
        intendedMajors: input.intendedMajors,
        interests: input.interests,
        onboardingCompletedAt: now,
        updatedAt: now,
      })
      .where(eq(profiles.userId, userId));
    await writeProfileFacts(tx, userId, input, "onboarding", now);
    for (const s of input.sensitive) {
      await writeSensitiveFact(tx, deps.config.keyring, userId, s, null, now);
    }
    const ids = [...new Set(input.collegeIds)];
    if (ids.length > 0) {
      const known = await tx.select({ id: colleges.id }).from(colleges).where(inArray(colleges.id, ids));
      if (known.length > 0) {
        await tx
          .insert(collegeList)
          .values(
            known.map((c) => ({
              ownerId: userId,
              collegeId: c.id,
              fit: "target" as const,
              plan: "RD" as const,
              season,
              createdAt: now,
            })),
          )
          .onConflictDoNothing();
      }
    }
    const job = one(
      await tx
        .insert(crewJobs)
        .values({
          ownerId: userId,
          usageMonth: monthKey(now),
          kind: "weekly_plan",
          status: "queued",
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: crewJobs.id }),
      "crew_jobs insert",
    );
    return job.id;
  });
  await deps.jobs.enqueue("plan.weekly", { jobId, ownerId: userId });
  await deps.jobs.enqueue("sweep.student", { studentId: userId });
  await recordAudit(deps, { actor, action: "onboarding_completed", entityType: "user", entityId: userId });
  return getMe(deps, actor);
}

/** EX-01: values the extension may propose for a form. The student reviews each one. */
export async function getAutofillProfile(deps: CoreDeps, actor: Actor): Promise<AutofillProfile> {
  assertUser(actor);
  const [user] = await deps.db.select().from(users).where(eq(users.id, actor.userId)).limit(1);
  if (!user || user.status !== "active") throw unauthenticated();
  const profile = await profileRow(deps.db, user.id);
  const rows = await deps.db
    .select()
    .from(activities)
    .where(eq(activities.ownerId, user.id))
    .orderBy(asc(activities.position));
  return {
    displayName: user.displayName,
    email: user.email,
    highSchool: profile.highSchool,
    classYear: profile.classYear,
    city: profile.city,
    state: profile.state,
    gpa: toGpa(profile.gpaUnweightedX100),
    intendedMajors: profile.intendedMajors,
    activities: rows.map(toActivity),
  };
}
