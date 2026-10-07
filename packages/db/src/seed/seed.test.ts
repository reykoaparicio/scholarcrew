import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  aidChecklistItems,
  aidDeadlines,
  aidRules,
  colleges,
  conversations,
  costEstimates,
  essayVersions,
  essays,
  familyMembers,
  familyTasks,
  messages,
  planItems,
  profiles,
  scholarshipApplications,
  scholarships,
  sweepRuns,
  users,
} from "../schema";
import { TABLE_NAMES, closeTestDb, getTestDb, resetDb } from "../testing/db";
import { SEED_EMAILS, seedDev } from "./index";

const db = getTestDb();

beforeEach(() => resetDb(db));
afterAll(() => closeTestDb());

function one<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`missing ${what}`);
  return row;
}

async function rowCounts(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    TABLE_NAMES.map(async (name) => {
      const rows = await db.execute(sql.raw(`select count(*)::int as n from "${name}"`));
      return [name, Number(rows[0]?.n)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function jordan() {
  return one(await db.select().from(users).where(eq(users.email, SEED_EMAILS.jordan)), "Jordan");
}

describe("seedDev", () => {
  it("creates Jordan, Dana, and an admin, plus Jordan's profile", async () => {
    await seedDev(db);
    const people = await db
      .select()
      .from(users)
      .where(inArray(users.email, Object.values(SEED_EMAILS)));
    expect(people.map((p) => `${p.email}:${p.role}:${p.displayName}`).sort()).toEqual([
      "admin@example.com:admin:Admin",
      "dana@example.com:parent:Dana",
      "jordan@example.com:student:Jordan R.",
    ]);
    const j = await jordan();
    const profile = one(await db.select().from(profiles).where(eq(profiles.userId, j.id)), "profile");
    expect(profile).toMatchObject({
      state: "TX",
      county: "Maple",
      classYear: 2027,
      gpaUnweightedX100: 372,
      highSchool: "Maple High School",
    });
  });

  it("runs twice without errors or duplicate rows", async () => {
    await seedDev(db);
    const once = await rowCounts();
    await seedDev(db);
    expect(await rowCounts()).toEqual(once);
    expect(once.users).toBe(3);
    expect(once.families).toBe(1);
    expect(once.colleges).toBe(6);
  });

  it("seeds the six mockup colleges with their numbers and Jordan's gaps", async () => {
    await seedDev(db);
    const rows = await db.select().from(colleges);
    expect(rows).toHaveLength(6);
    expect(rows.every((c) => /^99\d{4}$/.test(c.id))).toBe(true);
    const byName = Object.fromEntries(rows.map((c) => [c.name, c]));
    const stateU = byName["State U"];
    expect(stateU).toMatchObject({
      costOfAttendanceUsd: 27800,
      testPolicy: "optional",
      outsidePolicy: "added_on_top",
      aidPriorityDate: "2026-12-01",
    });
    expect(stateU?.meritTiers).toEqual([
      { label: "State U Merit Award", minGpa: 3.5, minAct: null, minSat: null, annualUsd: 3000, renewalGpa: 3 },
    ]);
    expect(stateU?.deadlines.EA).toBe("2026-11-01");
    expect(byName["Riverside College"]?.costOfAttendanceUsd).toBe(31200);
    expect(byName["Riverside College"]?.deadlines.rolling).toBe(true);
    expect(byName["Bay Tech"]?.outsidePolicy).toBe("may_reduce_grant");
    expect(byName["Bay Tech"]?.deadlines.EA).toBe("2026-11-15");
    expect(byName["Northgate University"]).toMatchObject({
      costOfAttendanceUsd: 68400,
      testPolicy: "required",
      cssProfileRequired: true,
      outsidePolicy: "reduces_loans_first",
    });
    expect(byName["Northgate University"]?.deadlines.RD).toBe("2027-01-05");
    expect(byName["Central State"]?.deadlines.rolling).toBe(true);
    expect(byName["Lakeshore University"]?.outsidePolicy).toBe("unknown");
    const j = await jordan();
    const gaps = await db.select().from(costEstimates).where(eq(costEstimates.ownerId, j.id));
    expect(Object.fromEntries(gaps.map((g) => [g.collegeId, g.netPriceUsd]))).toEqual({
      "990001": 9200,
      "990002": 6800,
      "990003": 11900,
      "990004": 12800,
      "990005": 5900,
      "990006": 21300,
    });
  });

  it("seeds every application stage, a hidden scam listing, and Sunday's sweep", async () => {
    await seedDev(db);
    const j = await jordan();
    const board = await db
      .select({ stage: scholarshipApplications.stage, amountUsd: scholarships.amountMaxUsd })
      .from(scholarshipApplications)
      .innerJoin(scholarships, eq(scholarshipApplications.scholarshipId, scholarships.id))
      .where(eq(scholarshipApplications.ownerId, j.id));
    expect([...new Set(board.map((r) => r.stage))].sort()).toEqual([
      "drafting",
      "lost",
      "matched",
      "planned",
      "skipped",
      "submitted",
      "won",
    ]);
    const open = ["matched", "planned", "drafting", "submitted"];
    expect(board.filter((r) => open.includes(r.stage)).reduce((sum, r) => sum + r.amountUsd, 0)).toBe(12250);
    const flagged = await db.select().from(scholarships).where(eq(scholarships.status, "flagged"));
    expect(flagged.map((s) => [s.name, s.scamFlags])).toEqual([["Golden Future Scholars Award", ["application_fee"]]]);
    const sweep = one(await db.select().from(sweepRuns).where(eq(sweepRuns.ownerId, j.id)), "sweep");
    expect(sweep).toMatchObject({
      newMatches: 3,
      totalUsd: 7500,
      reuseCount: 2,
      hiddenScams: 1,
      hiddenScholarshipIds: [flagged[0]?.id],
    });
  });

  it("seeds the Rotary draft, the week of Oct 5, the family, the aid checklist, and crew replies", async () => {
    await seedDev(db);
    const j = await jordan();
    const rotary = one(
      await db
        .select()
        .from(essays)
        .where(and(eq(essays.ownerId, j.id), eq(essays.title, "Rotary Club of Eastside essay"))),
      "Rotary essay",
    );
    expect(rotary).toMatchObject({ currentVersion: 2, wordLimit: 500, targetType: "scholarship", status: "drafting" });
    const versions = await db.select().from(essayVersions).where(eq(essayVersions.essayId, rotary.id));
    expect(versions.map((v) => `${v.version}:${v.wordCount}`).sort()).toEqual(["1:79", "2:142"]);
    const week = await db
      .select()
      .from(planItems)
      .where(and(eq(planItems.ownerId, j.id), eq(planItems.weekStart, "2026-10-05")));
    expect(week).toHaveLength(5);
    expect(week.every((i) => i.generated)).toBe(true);
    expect(week.filter((i) => i.status === "done").map((i) => i.title)).toEqual(["Upload your transcript"]);
    expect(week.filter((i) => i.status === "todo").reduce((sum, i) => sum + i.minutes, 0)).toBe(135);
    // Award years are written "2027-28" with a hyphen, like the AwardYear schema (R3V-12).
    expect(week.map((i) => i.title)).toContain("Start the 2027-28 FAFSA with Dana");
    expect(week.some((i) => /\d{4}–\d{2}/.test(i.title))).toBe(false);
    expect(await db.select().from(familyMembers).where(eq(familyMembers.userId, j.id))).toHaveLength(1);
    const aidItems = await db.select().from(aidChecklistItems).where(eq(aidChecklistItems.ownerId, j.id));
    expect(aidItems).toHaveLength(10);
    const linked = await db
      .select()
      .from(familyTasks)
      .where(and(eq(familyTasks.studentId, j.id), isNotNull(familyTasks.aidItemId)));
    const parentItems = aidItems.filter((i) => i.assignee === "parent");
    expect(linked.map((t) => t.aidItemId).sort()).toEqual(parentItems.map((i) => i.id).sort());
    expect(linked.map((t) => `${t.kind}:${t.detail}`).sort()).toEqual([
      "css_contributor:CSS Profile 2027-28",
      "fafsa_contributor:FAFSA 2027-28",
      "fafsa_contributor:FAFSA 2027-28",
    ]);
    const replies = await db
      .select({ reply: messages.reply })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(and(eq(conversations.ownerId, j.id), eq(messages.authorKind, "crew")));
    expect(replies).toHaveLength(2);
    expect(replies.every((m) => m.reply?.contributors.includes("compass") === true)).toBe(true);
  });

  it("seeds sample aid rules and deadlines, each marked as sample data (R2P-1)", async () => {
    await seedDev(db);
    const rules = await db.select().from(aidRules);
    expect(rules.map((r) => `${r.awardYear}:${r.key}`).sort()).toEqual([
      "2026-27:federal_loan_rates",
      "2027-28:federal_loan_rates",
    ]);
    expect(rules[0]?.value).toEqual({ subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 });
    const deadlines = await db.select().from(aidDeadlines);
    expect(deadlines.map((d) => `${d.awardYear}:${d.state ?? "federal"}:${d.program}:${d.deadline}`).sort()).toEqual([
      "2026-27:TX:TEXAS Grant priority:2026-01-15",
      "2026-27:federal:FAFSA:2027-06-30",
      "2027-28:TX:TEXAS Grant priority:2027-01-15",
      "2027-28:federal:FAFSA:2028-06-30",
    ]);
    expect(deadlines.every((d) => d.note.startsWith("Sample data"))).toBe(true);
    expect(deadlines.every((d) => d.sourceUrl === "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines")).toBe(
      true,
    );
  });
});
