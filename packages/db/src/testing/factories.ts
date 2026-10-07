import { randomUUID } from "node:crypto";
import { DEFAULT_SHARED, SHARE_CATEGORIES } from "@scholarcrew/domain";
import type { Db } from "../client";
import {
  colleges,
  conversations,
  essays,
  families,
  familyMembers,
  profiles,
  scholarships,
  shareSettings,
  stories,
  users,
} from "../schema";

type User = typeof users.$inferSelect;
type Profile = typeof profiles.$inferSelect;
type StudentOptions = { email?: string; state?: string; county?: string; classYear?: number; gpaX100?: number };

export interface Factories {
  user(db: Db, o?: Partial<typeof users.$inferInsert>): Promise<User>;
  student(db: Db, o?: StudentOptions): Promise<{ user: User; profile: Profile }>;
  parent(db: Db, o?: { email?: string }): Promise<User>;
  admin(db: Db): Promise<User>;
  family(db: Db, o: { studentIds: string[]; parentIds: string[] }): Promise<typeof families.$inferSelect>;
  scholarship(db: Db, o?: Partial<typeof scholarships.$inferInsert>): Promise<typeof scholarships.$inferSelect>;
  college(db: Db, o?: Partial<typeof colleges.$inferInsert>): Promise<typeof colleges.$inferSelect>;
  essay(db: Db, ownerId: string, o?: Partial<typeof essays.$inferInsert>): Promise<typeof essays.$inferSelect>;
  story(db: Db, ownerId: string, o?: Partial<typeof stories.$inferInsert>): Promise<typeof stories.$inferSelect>;
  conversation(
    db: Db,
    ownerId: string,
    o?: Partial<typeof conversations.$inferInsert>,
  ): Promise<typeof conversations.$inferSelect>;
}

let counter = 0;

function nextNumber(): number {
  counter += 1;
  return counter;
}

function uniqueTag(): string {
  return `${nextNumber()}-${randomUUID().slice(0, 8)}`;
}

function first<T>(rows: T[], table: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`Insert into ${table} returned no row`);
  return row;
}

async function user(db: Db, o: Partial<typeof users.$inferInsert> = {}): Promise<User> {
  const email = (o.email ?? `user-${uniqueTag()}@example.test`).toLowerCase();
  return first(
    await db
      .insert(users)
      .values({ displayName: "Test User", ...o, email })
      .returning(),
    "users",
  );
}

async function student(db: Db, o: StudentOptions = {}): Promise<{ user: User; profile: Profile }> {
  const created = await user(db, {
    email: o.email ?? `student-${uniqueTag()}@example.test`,
    displayName: "Test Student",
    role: "student",
    birthYear: 2009,
  });
  const profile = first(
    await db
      .insert(profiles)
      .values({
        userId: created.id,
        classYear: o.classYear ?? 2027,
        highSchool: "Maple High School",
        state: o.state ?? "TX",
        county: o.county ?? "Maple",
        gpaUnweightedX100: o.gpaX100 ?? 372,
        onboardingCompletedAt: new Date(),
      })
      .returning(),
    "profiles",
  );
  return { user: created, profile };
}

async function parent(db: Db, o: { email?: string } = {}): Promise<User> {
  return user(db, {
    email: o.email ?? `parent-${uniqueTag()}@example.test`,
    displayName: "Test Parent",
    role: "parent",
    birthYear: 1980,
  });
}

async function admin(db: Db): Promise<User> {
  return user(db, { email: `admin-${uniqueTag()}@example.test`, displayName: "Test Admin", role: "admin" });
}

async function family(db: Db, o: { studentIds: string[]; parentIds: string[] }): Promise<typeof families.$inferSelect> {
  const created = first(
    await db
      .insert(families)
      .values({ createdById: o.studentIds[0] ?? o.parentIds[0] ?? null })
      .returning(),
    "families",
  );
  const members: Array<typeof familyMembers.$inferInsert> = [
    ...o.studentIds.map((userId) => ({ familyId: created.id, userId, memberRole: "student" as const })),
    ...o.parentIds.map((userId) => ({ familyId: created.id, userId, memberRole: "parent" as const })),
  ];
  if (members.length > 0) await db.insert(familyMembers).values(members);
  const shares = o.studentIds.flatMap((studentId) =>
    SHARE_CATEGORIES.map((category) => ({
      studentId,
      familyId: created.id,
      category,
      enabled: DEFAULT_SHARED[category],
    })),
  );
  if (shares.length > 0) await db.insert(shareSettings).values(shares);
  return created;
}

async function scholarship(
  db: Db,
  o: Partial<typeof scholarships.$inferInsert> = {},
): Promise<typeof scholarships.$inferSelect> {
  const slug = o.slug ?? `test-scholarship-${uniqueTag()}`;
  const url = `https://example.org/scholarships/${slug}`;
  return first(
    await db
      .insert(scholarships)
      .values({
        name: "Test Scholarship",
        provider: "Test Foundation",
        url,
        sourceUrl: url,
        amountMinUsd: 1000,
        amountMaxUsd: 1000,
        deadline: "2026-11-15",
        cycle: "2026-27",
        localArea: { national: true, state: null, counties: [], cities: [] },
        eligibility: [],
        requirements: { essays: [], recommendations: 0, transcript: false, serviceHours: null, other: [] },
        status: "published",
        verifiedAt: new Date(),
        ...o,
        slug,
      })
      .returning(),
    "scholarships",
  );
}

async function college(db: Db, o: Partial<typeof colleges.$inferInsert> = {}): Promise<typeof colleges.$inferSelect> {
  const id = o.id ?? String(800000 + nextNumber());
  return first(
    await db
      .insert(colleges)
      .values({
        name: `Test College ${id}`,
        state: "TX",
        city: "Testville",
        control: "public",
        admitRateX1000: 600,
        costOfAttendanceUsd: 30000,
        netPriceByIncome: {
          overall: 15000,
          under_30k: null,
          "30_48k": null,
          "48_75k": null,
          "75_110k": null,
          over_110k: null,
        },
        testPolicy: "optional",
        deadlines: { ED: null, EA: null, REA: null, RD: "2027-01-15", rolling: false },
        requirements: {
          supplements: [],
          teacherRecs: 1,
          counselorRec: true,
          applicationFeeUsd: 50,
          feeWaiverAvailable: true,
          portfolio: false,
          interview: "none",
        },
        sourceUrl: `https://example.org/colleges/${id}`,
        verifiedAt: new Date(),
        ...o,
        id,
      })
      .returning(),
    "colleges",
  );
}

async function essay(
  db: Db,
  ownerId: string,
  o: Partial<typeof essays.$inferInsert> = {},
): Promise<typeof essays.$inferSelect> {
  return first(
    await db
      .insert(essays)
      .values({
        title: "Test Essay",
        prompt: "Tell us about a time you helped someone.",
        wordLimit: 500,
        ...o,
        ownerId,
      })
      .returning(),
    "essays",
  );
}

async function story(
  db: Db,
  ownerId: string,
  o: Partial<typeof stories.$inferInsert> = {},
): Promise<typeof stories.$inferSelect> {
  return first(
    await db
      .insert(stories)
      .values({
        title: "Test Story",
        moment: "The first library STEM night, 30 kids came and we had one extension cord.",
        themes: ["service"],
        ...o,
        ownerId,
      })
      .returning(),
    "stories",
  );
}

async function conversation(
  db: Db,
  ownerId: string,
  o: Partial<typeof conversations.$inferInsert> = {},
): Promise<typeof conversations.$inferSelect> {
  return first(
    await db
      .insert(conversations)
      .values({ room: "my_crew", ...o, ownerId })
      .returning(),
    "conversations",
  );
}

/** Test data builders. Defaults are fictional; every email is unique per call. */
export const factories: Factories = {
  user,
  student,
  parent,
  admin,
  family,
  scholarship,
  college,
  essay,
  story,
  conversation,
};
