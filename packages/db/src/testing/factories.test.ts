import { DEFAULT_SHARED } from "@scholarcrew/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { familyMembers, shareSettings } from "../schema";
import { closeTestDb, getTestDb, resetDb } from "./db";
import { factories } from "./factories";

const db = getTestDb();

beforeEach(() => resetDb(db));
afterAll(() => closeTestDb());

describe("factories", () => {
  it("user() lowercases the email and makes each default email unique", async () => {
    const named = await factories.user(db, { email: "Jordan.R@Example.com" });
    const a = await factories.user(db);
    const b = await factories.user(db);
    expect(named.email).toBe("jordan.r@example.com");
    expect(named.role).toBe("student");
    expect(a.email).not.toBe(b.email);
  });

  it("student() creates a user and an onboarded TX, Maple, 2027, 3.72 profile", async () => {
    const { user, profile } = await factories.student(db);
    expect(user.role).toBe("student");
    expect(profile).toMatchObject({
      userId: user.id,
      state: "TX",
      county: "Maple",
      classYear: 2027,
      gpaUnweightedX100: 372,
    });
    expect(profile.onboardingCompletedAt).toBeInstanceOf(Date);
  });

  it("student() applies overrides", async () => {
    const { user, profile } = await factories.student(db, {
      email: "kai@example.com",
      state: "CA",
      county: "Alameda",
      classYear: 2028,
      gpaX100: 390,
    });
    expect(user.email).toBe("kai@example.com");
    expect(profile).toMatchObject({ state: "CA", county: "Alameda", classYear: 2028, gpaUnweightedX100: 390 });
  });

  it("parent() and admin() set their roles", async () => {
    const parent = await factories.parent(db, { email: "dana@example.com" });
    const admin = await factories.admin(db);
    expect(parent).toMatchObject({ email: "dana@example.com", role: "parent" });
    expect(admin.role).toBe("admin");
  });

  it("family() links members and writes DEFAULT_SHARED for each student", async () => {
    const first = await factories.student(db);
    const second = await factories.student(db);
    const parent = await factories.parent(db);
    const family = await factories.family(db, { studentIds: [first.user.id, second.user.id], parentIds: [parent.id] });
    expect(family.createdById).toBe(first.user.id);
    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, family.id));
    expect(members.map((m) => m.memberRole).sort()).toEqual(["parent", "student", "student"]);
    const mine = await db.select().from(shareSettings).where(eq(shareSettings.studentId, first.user.id));
    expect(Object.fromEntries(mine.map((row) => [row.category, row.enabled]))).toEqual(DEFAULT_SHARED);
    const all = await db.select().from(shareSettings).where(eq(shareSettings.familyId, family.id));
    expect(all).toHaveLength(18);
  });

  it("scholarship(), college(), essay(), story(), and conversation() insert usable rows", async () => {
    const { user } = await factories.student(db);
    const listing = await factories.scholarship(db, { amountMaxUsd: 2500 });
    const college = await factories.college(db, { name: "State U" });
    const essay = await factories.essay(db, user.id, { title: "Rotary essay" });
    const story = await factories.story(db, user.id);
    const conversation = await factories.conversation(db, user.id, { room: "temporary" });
    expect(listing).toMatchObject({ status: "published", visibility: "public", amountMaxUsd: 2500 });
    expect(listing.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(listing.verifiedAt).toBeInstanceOf(Date);
    expect(college.id).toMatch(/^\d{6}$/);
    expect(college.name).toBe("State U");
    expect(essay).toMatchObject({ ownerId: user.id, title: "Rotary essay", currentVersion: 0, status: "drafting" });
    expect(story.ownerId).toBe(user.id);
    expect(conversation).toMatchObject({ ownerId: user.id, room: "temporary" });
  });
});
