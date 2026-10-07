import {
  and,
  eq,
  essayVersions,
  inArray,
  planItems,
  scholarshipApplications,
  scholarships,
  sweepRuns,
} from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type ApplicationStage, type MatchReason, SCAM_FLAG_TEXT } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { RETIRED_TEXT, UNDER_REVIEW_TEXT, getBoard, saveScholarship, updateApplication } from "./board";
import { makeParentOf, makeStudent, setShare, setup } from "./testkit";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

const reasons: MatchReason[] = [
  { code: "county", text: "You live in Maple County", sensitive: false },
  { code: "first_gen", text: "You'd be the first in your family to go to college", sensitive: true },
];

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
});

async function app(
  stage: ApplicationStage,
  o: { deadline?: string | null; amountMaxUsd?: number; outcomeUsd?: number } = {},
) {
  const listing = await factories.scholarship(ctx.deps.db, {
    name: `${stage} listing`,
    deadline: o.deadline === undefined ? "2026-11-20" : o.deadline,
    amountMaxUsd: o.amountMaxUsd ?? 1000,
    requirements: {
      essays: [{ prompt: "Tell us about a service moment.", wordLimit: 500 }],
      recommendations: 0,
      transcript: false,
      serviceHours: null,
      other: [],
    },
  });
  const [row] = await ctx.deps.db
    .insert(scholarshipApplications)
    .values({
      ownerId: student.user.id,
      scholarshipId: listing.id,
      stage,
      matchReasons: reasons,
      outcomeUsd: o.outcomeUsd,
    })
    .returning();
  if (!row) throw new Error("no application");
  return { listing, row };
}

describe("getBoard", () => {
  it("groups cards into columns with progress, reuse story, flagged scams, and totals", async () => {
    const { db } = ctx.deps;
    await app("matched", { deadline: "2026-10-20", amountMaxUsd: 1000 });
    await app("planned", { deadline: "2026-10-28", amountMaxUsd: 2000 });
    const drafting = await app("drafting", { deadline: "2026-11-10", amountMaxUsd: 3000 });
    await app("submitted", { amountMaxUsd: 1500 });
    await app("won", { outcomeUsd: 1200 });
    await app("lost");
    await app("skipped", { deadline: null });
    await factories.story(db, student.user.id, { title: "Library nights", themes: ["service"] });
    const essay = await factories.essay(db, student.user.id, {
      targetType: "scholarship",
      targetScholarshipId: drafting.listing.id,
      wordLimit: 500,
      currentVersion: 1,
    });
    await db
      .insert(essayVersions)
      .values({ essayId: essay.id, version: 1, body: "draft", wordCount: 250, authorId: student.user.id });
    const scam = await factories.scholarship(db, { name: "Scam", scamFlags: ["application_fee", "sweepstakes"] });
    await db.insert(sweepRuns).values({
      ownerId: student.user.id,
      ranAt: new Date("2026-10-04T14:00:00.000Z"),
      newMatches: 0,
      totalUsd: 0,
      reuseCount: 0,
      hiddenScams: 1,
      hiddenScholarshipIds: [scam.id],
    });

    const board = await getBoard(ctx.deps, student.actor, student.user.id);
    expect(board.matched.map((c) => c.application.stage)).toEqual(["matched"]);
    expect(board.working.map((c) => c.application.stage)).toEqual(["planned", "drafting"]);
    expect(board.submitted).toHaveLength(1);
    expect(board.won).toHaveLength(1);
    expect(board.lostOrSkipped.map((c) => c.application.stage)).toEqual(["lost", "skipped"]);
    expect(board.working[0]?.progress).toBeNull();
    expect(board.working[1]).toMatchObject({ progress: 0.5, reuseStoryTitle: "Library nights", daysUntilDeadline: 35 });
    expect(board.matched[0]?.reasons).toHaveLength(2);
    expect(board.flagged).toEqual([
      { scholarship: expect.objectContaining({ id: scam.id }), reason: SCAM_FLAG_TEXT.application_fee },
    ]);
    expect(board.totals).toEqual({ inPlayUsd: 7500, wonUsd: 1200, dueThisMonth: 2 });
  });

  it("strips sensitive reasons for parents and enforces the scholarships share", async () => {
    await app("matched");
    const parent = await makeParentOf(ctx.deps, student.user.id);
    const board = await getBoard(ctx.deps, parent.actor, student.user.id);
    expect(board.matched).toEqual([]);
    expect(board.privateCount).toBe(1);
    expect(board.totals.inPlayUsd).toBe(0);
    await setShare(ctx.deps, student.user.id, "scholarships", false);
    await expect(getBoard(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    const other = await makeStudent(ctx.deps);
    await expect(getBoard(ctx.deps, other.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("withholds private cards even with sensitive sharing enabled", async () => {
    await app("matched");
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await setShare(ctx.deps, student.user.id, "sensitive", true);
    const shared = await getBoard(ctx.deps, parent.actor, student.user.id);
    expect(shared.matched).toEqual([]);
    expect(shared.privateCount).toBe(1);
    expect(shared.totals.inPlayUsd).toBe(0);
    await setShare(ctx.deps, student.user.id, "sensitive", false);
    const hidden = await getBoard(ctx.deps, parent.actor, student.user.id);
    expect(hidden.matched).toEqual([]);
  });

  it("moves open cards on retired, under-review, or scam-flagged listings to flagged and out of the totals (R2P-4)", async () => {
    const { db } = ctx.deps;
    const live = await app("planned", { deadline: "2026-10-28", amountMaxUsd: 2000 });
    const retired = await app("planned", { deadline: "2026-10-20", amountMaxUsd: 5000 });
    const review = await app("drafting", { deadline: "2026-10-21", amountMaxUsd: 4000 });
    const scam = await app("matched", { deadline: "2026-10-22", amountMaxUsd: 3000 });
    const history = await app("submitted", { amountMaxUsd: 1500 });
    await db
      .update(scholarships)
      .set({ status: "retired" })
      .where(inArray(scholarships.id, [retired.listing.id, history.listing.id]));
    await db.update(scholarships).set({ status: "flagged" }).where(eq(scholarships.id, review.listing.id));
    await db
      .update(scholarships)
      .set({ scamFlags: ["application_fee"] })
      .where(eq(scholarships.id, scam.listing.id));
    await db.insert(sweepRuns).values({
      ownerId: student.user.id,
      ranAt: new Date("2026-10-04T14:00:00.000Z"),
      newMatches: 0,
      totalUsd: 0,
      reuseCount: 0,
      hiddenScams: 1,
      hiddenScholarshipIds: [scam.listing.id],
    });

    const board = await getBoard(ctx.deps, student.actor, student.user.id);
    expect(board.matched).toEqual([]);
    expect(board.working.map((c) => c.scholarship.id)).toEqual([live.listing.id]);
    expect(board.submitted.map((c) => c.scholarship.id)).toEqual([history.listing.id]);
    expect(board.flagged.map((f) => [f.scholarship.id, f.reason])).toEqual([
      [retired.listing.id, RETIRED_TEXT],
      [review.listing.id, UNDER_REVIEW_TEXT],
      [scam.listing.id, SCAM_FLAG_TEXT.application_fee],
    ]);
    expect(board.totals).toEqual({ inPlayUsd: 3500, wonUsd: 0, dueThisMonth: 1 });
  });

  it("leaves past-due open cards out of inPlayUsd but keeps submitted ones (R3V-6)", async () => {
    const pastPlanned = await app("planned", { deadline: "2026-10-05", amountMaxUsd: 4000 });
    await app("drafting", { deadline: "2026-10-06", amountMaxUsd: 2000 });
    await app("planned", { deadline: null, amountMaxUsd: 300 });
    await app("submitted", { deadline: "2026-10-05", amountMaxUsd: 1500 });
    const board = await getBoard(ctx.deps, student.actor, student.user.id);
    expect(board.working.map((c) => c.scholarship.id)).toContain(pastPlanned.listing.id);
    expect(board.totals.inPlayUsd).toBe(2000 + 300 + 1500);
  });

  it("ranks the matched column by value per hour, not deadline, for every reader (R2P-5)", async () => {
    const soonSmall = await app("matched", { deadline: "2026-10-20", amountMaxUsd: 500 });
    const lateLarge = await app("matched", { deadline: "2026-11-20", amountMaxUsd: 5000 });
    const order = [lateLarge.listing.id, soonSmall.listing.id];
    expect((await getBoard(ctx.deps, student.actor, student.user.id)).matched.map((c) => c.scholarship.id)).toEqual(
      order,
    );
    const parent = await makeParentOf(ctx.deps, student.user.id);
    expect((await getBoard(ctx.deps, parent.actor, student.user.id)).matched).toEqual([]); // These fixture cards carry sensitive reasons.
  });
});

describe("saveScholarship", () => {
  it("creates or upgrades to planned and never moves later stages back", async () => {
    const listing = await factories.scholarship(ctx.deps.db);
    const first = await saveScholarship(ctx.deps, student.actor, { scholarshipId: listing.id });
    expect(first.stage).toBe("planned");
    expect((await saveScholarship(ctx.deps, student.actor, { scholarshipId: listing.id })).id).toBe(first.id);
    const matched = await app("matched");
    expect((await saveScholarship(ctx.deps, student.actor, { scholarshipId: matched.listing.id })).stage).toBe(
      "planned",
    );
    const drafting = await app("drafting");
    expect((await saveScholarship(ctx.deps, student.actor, { scholarshipId: drafting.listing.id })).stage).toBe(
      "drafting",
    );
  });

  it("writes match reasons and fit when saving from search, keeping reasons a sweep already stored (R2P-3)", async () => {
    const maya = await makeStudent(ctx.deps, { state: "TX", county: "Maple" });
    const listing = await factories.scholarship(ctx.deps.db, {
      localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
      eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
    });
    const saved = await saveScholarship(ctx.deps, maya.actor, { scholarshipId: listing.id });
    expect(saved.matchReasons.map((r) => r.code)).toContain("local_county");
    expect(saved.fitScore).toBeGreaterThan(0);
    const board = await getBoard(ctx.deps, maya.actor, maya.user.id);
    expect(board.working[0]?.reasons.map((r) => r.code)).toContain("local_county");
    const cedar = await factories.scholarship(ctx.deps.db, {
      eligibility: [{ type: "county_in", state: "TX", counties: ["Cedar"] }],
    });
    expect(await saveScholarship(ctx.deps, maya.actor, { scholarshipId: cedar.id })).toMatchObject({
      matchReasons: [],
      fitScore: 0,
    });
    const swept = await app("matched");
    const upgraded = await saveScholarship(ctx.deps, student.actor, { scholarshipId: swept.listing.id });
    expect(upgraded.stage).toBe("planned");
    expect(upgraded.matchReasons).toEqual(reasons);
  });

  it("rejects listings the student can't see", async () => {
    const other = await makeStudent(ctx.deps);
    const hidden = await factories.scholarship(ctx.deps.db, {
      status: "draft",
      visibility: "submitter_only",
      submittedById: other.user.id,
    });
    await expect(saveScholarship(ctx.deps, student.actor, { scholarshipId: hidden.id })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("updateApplication", () => {
  it("records a win with the listing amount by default and adds one thank-you plan item", async () => {
    const { row } = await app("submitted", { amountMaxUsd: 2000 });
    const won = await updateApplication(ctx.deps, student.actor, row.id, { stage: "won" });
    expect(won).toMatchObject({ stage: "won", outcomeUsd: 2000, outcomeAt: "2026-10-06T15:00:00.000Z" });
    await updateApplication(ctx.deps, student.actor, row.id, { stage: "won", thankYouSent: true });
    const items = await ctx.deps.db
      .select()
      .from(planItems)
      .where(and(eq(planItems.ownerId, student.user.id), eq(planItems.kind, "thank_you")));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Send a thank-you note to Test Foundation",
      minutes: 15,
      weekStart: "2026-10-05",
      refId: row.id,
    });
  });

  it("keeps an explicit outcome amount and stamps submittedAt", async () => {
    const a = await app("drafting", { amountMaxUsd: 2000 });
    const submitted = await updateApplication(ctx.deps, student.actor, a.row.id, { stage: "submitted" });
    expect(submitted.submittedAt).toBe("2026-10-06T15:00:00.000Z");
    const won = await updateApplication(ctx.deps, student.actor, a.row.id, { stage: "won", outcomeUsd: 800 });
    expect(won.outcomeUsd).toBe(800);
  });

  it("is owner only", async () => {
    const { row } = await app("matched");
    const other = await makeStudent(ctx.deps);
    const parent = await makeParentOf(ctx.deps, student.user.id);
    for (const actor of [other.actor, parent.actor]) {
      await expect(updateApplication(ctx.deps, actor, row.id, { stage: "skipped" })).rejects.toMatchObject({
        code: "not_found",
      });
    }
  });
});
