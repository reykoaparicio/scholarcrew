import { DEFAULT_SHARED, SHARE_CATEGORIES } from "@scholarcrew/domain";
import { inArray } from "drizzle-orm";
import type { DbOrTx } from "../client";
import {
  families,
  familyBudgets,
  familyMembers,
  notificationPrefs,
  profiles,
  shareSettings,
  subscriptions,
  users,
} from "../schema";
import { at, daysFromNow, one } from "./util";

export const SEED_EMAILS = {
  jordan: "jordan@example.com",
  dana: "dana@example.com",
  admin: "admin@example.com",
} as const;

export interface SeedPeople {
  jordanId: string;
  danaId: string;
  adminId: string;
  familyId: string;
}

/** Deletes the seed users and their families. Everything they own cascades. */
export async function removeSeedPeople(db: DbOrTx): Promise<void> {
  const seeded = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, Object.values(SEED_EMAILS)));
  const ids = seeded.map((row) => row.id);
  if (ids.length === 0) return;
  const memberships = await db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(inArray(familyMembers.userId, ids));
  const familyIds = [...new Set(memberships.map((row) => row.familyId))];
  if (familyIds.length > 0) await db.delete(families).where(inArray(families.id, familyIds));
  await db.delete(users).where(inArray(users.id, ids));
}

export async function seedPeople(db: DbOrTx): Promise<SeedPeople> {
  const jordan = one(
    await db
      .insert(users)
      .values({
        email: SEED_EMAILS.jordan,
        displayName: "Jordan R.",
        role: "student",
        birthYear: 2009,
        createdAt: at("2026-10-01T15:00:00.000Z"),
      })
      .returning(),
    "users",
  );
  const dana = one(
    await db
      .insert(users)
      .values({
        email: SEED_EMAILS.dana,
        displayName: "Dana",
        role: "parent",
        birthYear: 1981,
        createdAt: at("2026-10-02T01:00:00.000Z"),
      })
      .returning(),
    "users",
  );
  const admin = one(
    await db
      .insert(users)
      .values({
        email: SEED_EMAILS.admin,
        displayName: "Admin",
        role: "admin",
        createdAt: at("2026-09-01T15:00:00.000Z"),
      })
      .returning(),
    "users",
  );

  await db.insert(profiles).values({
    userId: jordan.id,
    classYear: 2027,
    highSchool: "Maple High School",
    state: "TX",
    county: "Maple",
    city: "Eastside",
    gpaUnweightedX100: 372,
    gpaWeightedX100: 405,
    intendedMajors: ["Mechanical engineering"],
    interests: ["robotics", "programming", "teaching"],
    onboardingCompletedAt: at("2026-10-01T15:20:00.000Z"),
  });

  const family = one(
    await db
      .insert(families)
      .values({ name: "Jordan and Dana", createdById: jordan.id, createdAt: at("2026-10-01T16:00:00.000Z") })
      .returning(),
    "families",
  );
  await db.insert(familyMembers).values([
    { familyId: family.id, userId: jordan.id, memberRole: "student", joinedAt: at("2026-10-01T16:00:00.000Z") },
    { familyId: family.id, userId: dana.id, memberRole: "parent", joinedAt: at("2026-10-02T01:05:00.000Z") },
  ]);
  await db.insert(shareSettings).values(
    SHARE_CATEGORIES.map((category) => ({
      studentId: jordan.id,
      familyId: family.id,
      category,
      enabled: DEFAULT_SHARED[category],
    })),
  );
  await db.insert(familyBudgets).values({ familyId: family.id, annualUsd: 4600, sharedById: dana.id });
  await db.insert(notificationPrefs).values([{ userId: jordan.id }, { userId: dana.id }]);
  await db.insert(subscriptions).values({
    ownerId: dana.id,
    plan: "family",
    status: "active",
    currentPeriodEnd: daysFromNow(30),
  });

  return { jordanId: jordan.id, danaId: dana.id, adminId: admin.id, familyId: family.id };
}
