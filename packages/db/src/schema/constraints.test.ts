import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pgErrorCode } from "../errors";
import { closeTestDb, getTestDb, resetDb } from "../testing/db";
import { factories } from "../testing/factories";
import {
  aidChecklistItems,
  blobs,
  conversations,
  essayVersions,
  essays,
  families,
  familyTasks,
  memoryFacts,
  notifications,
  planItems,
  profiles,
  scholarshipApplications,
  scholarships,
  stories,
  users,
} from "./index";

const db = getTestDb();

beforeEach(() => resetDb(db));
afterAll(() => closeTestDb());

async function errorCodeOf(query: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await query;
    return undefined;
  } catch (e) {
    return pgErrorCode(e);
  }
}

async function rowCount(table: PgTable): Promise<number> {
  const [row] = await db.select({ n: count() }).from(table);
  return row?.n ?? 0;
}

function one<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("expected a row");
  return row;
}

describe("constraints", () => {
  it("rejects a second application for the same student and scholarship", async () => {
    const { user } = await factories.student(db);
    const other = await factories.student(db);
    const listing = await factories.scholarship(db);
    await db.insert(scholarshipApplications).values({ ownerId: user.id, scholarshipId: listing.id });
    const duplicate = db.insert(scholarshipApplications).values({ ownerId: user.id, scholarshipId: listing.id });
    expect(await errorCodeOf(duplicate)).toBe("23505");
    const rows = await db
      .insert(scholarshipApplications)
      .values({ ownerId: other.user.id, scholarshipId: listing.id })
      .returning();
    expect(rows).toHaveLength(1);
  });

  it("deletes a user's profile, facts, essays, versions, and conversations with the user", async () => {
    const { user } = await factories.student(db);
    const essay = await factories.essay(db, user.id);
    await db
      .insert(essayVersions)
      .values({ essayId: essay.id, version: 1, body: "First draft", wordCount: 2, authorId: user.id });
    await db
      .insert(memoryFacts)
      .values({ ownerId: user.id, key: "intended_major", value: "mechanical engineering", source: "user_stated" });
    await factories.conversation(db, user.id);
    const owned = [profiles, memoryFacts, essays, essayVersions, conversations];
    for (const table of owned) expect(await rowCount(table)).toBe(1);
    await db.delete(users).where(eq(users.id, user.id));
    for (const table of owned) expect(await rowCount(table)).toBe(0);
  });

  it("keeps a family and clears createdById when its creator is deleted", async () => {
    const { user } = await factories.student(db);
    const parent = await factories.parent(db);
    const family = await factories.family(db, { studentIds: [user.id], parentIds: [parent.id] });
    await db.delete(users).where(eq(users.id, user.id));
    const row = one(await db.select().from(families).where(eq(families.id, family.id)));
    expect(row.createdById).toBeNull();
  });

  it("treats a null collegeId as equal in the aid checklist key", async () => {
    const { user } = await factories.student(db);
    const item: typeof aidChecklistItems.$inferInsert = {
      ownerId: user.id,
      awardYear: "2027-28",
      program: "fafsa",
      collegeId: null,
      key: "submit",
      title: "Submit the FAFSA",
      assignee: "student",
    };
    await db.insert(aidChecklistItems).values(item);
    expect(await errorCodeOf(db.insert(aidChecklistItems).values(item))).toBe("23505");
    expect(await db.insert(aidChecklistItems).values(item).onConflictDoNothing().returning()).toEqual([]);
    const perCollege = await db
      .insert(aidChecklistItems)
      .values({ ...item, collegeId: "990004" })
      .returning();
    expect(perCollege).toHaveLength(1);
  });

  it("returns [] from onConflictDoNothing when a notification dedupeKey exists", async () => {
    const { user } = await factories.student(db);
    const notice: typeof notifications.$inferInsert = {
      userId: user.id,
      kind: "deadline",
      title: "Rotary Club of Eastside is due in 7 days",
      body: "Due Oct 30.",
      link: "/scholarships",
      dedupeKey: `deadline:${user.id}:rotary:7`,
    };
    const firstTry = await db
      .insert(notifications)
      .values(notice)
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning();
    const secondTry = await db
      .insert(notifications)
      .values(notice)
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning();
    expect(firstTry).toHaveLength(1);
    expect(secondTry).toEqual([]);
    expect(await rowCount(notifications)).toBe(1);
  });

  it("round-trips bytea columns as Buffers", async () => {
    const ciphertext = Buffer.from([0, 1, 2, 250, 255]);
    const inserted = one(
      await db
        .insert(blobs)
        .values({ ciphertext, iv: Buffer.alloc(12, 7), tag: Buffer.alloc(16, 9) })
        .returning(),
    );
    const read = one(await db.select().from(blobs).where(eq(blobs.id, inserted.id)));
    expect(Buffer.isBuffer(read.ciphertext)).toBe(true);
    expect(read.ciphertext.equals(ciphertext)).toBe(true);
    expect(read.iv.equals(Buffer.alloc(12, 7))).toBe(true);
    expect(read.tag).toHaveLength(16);
  });

  it("reads dates as YYYY-MM-DD strings and timestamps as Dates", async () => {
    const { user } = await factories.student(db);
    const item = one(
      await db
        .insert(planItems)
        .values({
          ownerId: user.id,
          weekStart: "2026-10-05",
          title: "Upload your transcript",
          kind: "custom",
          minutes: 5,
          dueOn: "2026-10-09",
        })
        .returning(),
    );
    expect(item.weekStart).toBe("2026-10-05");
    expect(item.dueOn).toBe("2026-10-09");
    expect(item.createdAt).toBeInstanceOf(Date);
    expect(item.contributors).toEqual([]);
    expect(item.generated).toBe(false);
  });

  it("allows one family task per aid item and assignee and drops it with the item (R2I-6)", async () => {
    const { user } = await factories.student(db);
    const parent = await factories.parent(db);
    const family = await factories.family(db, { studentIds: [user.id], parentIds: [parent.id] });
    const item = one(
      await db
        .insert(aidChecklistItems)
        .values({
          ownerId: user.id,
          awardYear: "2027-28",
          program: "fafsa",
          key: "contributor_consent",
          title: "Give consent to share federal tax information",
          assignee: "parent",
        })
        .returning(),
    );
    const task: typeof familyTasks.$inferInsert = {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: user.id,
      kind: "fafsa_contributor",
      title: item.title,
      detail: "FAFSA 2027-28",
      aidItemId: item.id,
    };
    await db.insert(familyTasks).values(task);
    expect(await errorCodeOf(db.insert(familyTasks).values(task))).toBe("23505");
    expect(await db.insert(familyTasks).values(task).onConflictDoNothing().returning()).toEqual([]);
    const custom = { ...task, kind: "custom" as const, title: "Call the aid office", aidItemId: null };
    await db.insert(familyTasks).values([custom, custom]);
    expect(await rowCount(familyTasks)).toBe(3);
    await db.delete(aidChecklistItems).where(eq(aidChecklistItems.id, item.id));
    expect(await rowCount(familyTasks)).toBe(2);
  });

  it("defaults text arrays, jsonb lists, and catalog fields", async () => {
    const { user } = await factories.student(db);
    const story = one(
      await db
        .insert(stories)
        .values({ ownerId: user.id, title: "Night shift at the bakery", moment: "Closing alone on a Friday night." })
        .returning(),
    );
    const listing = one(
      await db
        .insert(scholarships)
        .values({
          slug: "defaults-check",
          name: "Defaults Check Award",
          provider: "Test Foundation",
          url: "https://example.org/defaults",
          sourceUrl: "https://example.org/defaults",
          amountMinUsd: 500,
          amountMaxUsd: 500,
          cycle: "2026-27",
          localArea: { national: true, state: null, counties: [], cities: [] },
          requirements: { essays: [], recommendations: 0, transcript: false, serviceHours: null, other: [] },
        })
        .returning(),
    );
    expect(story.themes).toEqual([]);
    expect(listing).toMatchObject({
      eligibility: [],
      scamFlags: [],
      status: "draft",
      visibility: "public",
      estMinutes: 60,
      renewable: false,
    });
  });
});
