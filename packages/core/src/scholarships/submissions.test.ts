import { catalogReports, catalogTasks, eq, scholarshipApplications, scholarships } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { PUBLIC_ACTOR } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { getBoard } from "./board";
import * as scholarshipsModule from "./index";
import { getScholarship, searchScholarships } from "./search";
import { reportListing, submitLocalScholarship } from "./submissions";
import { makeStudent, setup } from "./testkit";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps, { state: "TX", county: "Maple" });
});

describe("submitLocalScholarship", () => {
  it("creates an unverified draft only the submitter can see, plus a review task", async () => {
    const input = {
      url: "https://maplerotary.example.org/award",
      name: "Maple Rotary STEM Award",
      notes: "Flyer at school",
    };
    const summary = await submitLocalScholarship(ctx.deps, student.actor, input);
    expect(summary).toMatchObject({
      name: "Maple Rotary STEM Award",
      provider: "Unknown",
      amountMinUsd: 0,
      amountMaxUsd: 0,
      deadline: null,
      status: "draft",
      unverified: true,
      localLabel: "Maple County, TX",
    });
    expect(summary.slug).toMatch(/^maple-rotary-stem-award-[0-9a-f]{8}$/);
    const [row] = await ctx.deps.db.select().from(scholarships).where(eq(scholarships.id, summary.id));
    expect(row).toMatchObject({ visibility: "submitter_only", submittedById: student.user.id, cycle: "2026-27" });
    const tasks = await ctx.deps.db.select().from(catalogTasks).where(eq(catalogTasks.scholarshipId, summary.id));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ kind: "user_submission", status: "open", createdById: student.user.id });
    expect(tasks[0]?.payload).toEqual({ type: "user_submission", ...input, submittedById: student.user.id });
    expect(ctx.deps.jobs.sent).toEqual([
      {
        name: "catalog.extract",
        payload: { taskId: tasks[0]?.id },
        opts: { singletonKey: `catalog.extract:${tasks[0]?.id}` },
      },
    ]);

    const mine = await searchScholarships(ctx.deps, student.actor, { page: 1, pageSize: 20 });
    expect(mine.items.map((s) => s.id)).toContain(summary.id);
    const other = await makeStudent(ctx.deps);
    await expect(getScholarship(ctx.deps, other.actor, summary.slug)).rejects.toMatchObject({ code: "not_found" });
    const again = await submitLocalScholarship(ctx.deps, student.actor, input);
    expect(again.slug).not.toBe(summary.slug);
  });

  it("puts the submission on the submitter's board as one planned application (R2C-12)", async () => {
    const input = { url: "https://maplerotary.example.org/award", name: "Maple Rotary STEM Award", notes: "" };
    const summary = await submitLocalScholarship(ctx.deps, student.actor, input);
    const apps = await ctx.deps.db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.scholarshipId, summary.id));
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ ownerId: student.user.id, stage: "planned", estMinutes: summary.estMinutes });
    const board = await getBoard(ctx.deps, student.actor, student.user.id);
    expect(board.working.map((c) => c.scholarship.id)).toEqual([summary.id]);
    expect(board.flagged).toEqual([]);
  });

  it("requires a signed-in user", async () => {
    await expect(
      submitLocalScholarship(ctx.deps, PUBLIC_ACTOR, { url: "https://x.example.org", name: "X", notes: "" }),
    ).rejects.toThrow();
  });
});

describe("reportListing", () => {
  it("records the report and opens an admin task", async () => {
    const listing = await factories.scholarship(ctx.deps.db);
    await reportListing(ctx.deps, student.actor, { scholarshipId: listing.id, reason: "dead_link", details: "404" });
    const [report] = await ctx.deps.db
      .select()
      .from(catalogReports)
      .where(eq(catalogReports.scholarshipId, listing.id));
    expect(report).toMatchObject({ reporterId: student.user.id, reason: "dead_link", details: "404", status: "open" });
    const [task] = await ctx.deps.db.select().from(catalogTasks).where(eq(catalogTasks.scholarshipId, listing.id));
    expect(task).toMatchObject({ kind: "report", status: "open" });
    expect(task?.payload).toEqual({ type: "report", reportId: report?.id, reason: "dead_link", details: "404" });
  });

  it("returns not_found for listings the user can't see", async () => {
    const retired = await factories.scholarship(ctx.deps.db, { status: "retired" });
    await expect(
      reportListing(ctx.deps, student.actor, { scholarshipId: retired.id, reason: "scam", details: "" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("scholarships index", () => {
  it("exports exactly the contract names", () => {
    expect(Object.keys(scholarshipsModule).sort()).toEqual([
      "buildMatcherProfile",
      "getBoard",
      "getScholarship",
      "lastSweep",
      "listMatches",
      "liveListingWhere",
      "privateScholarshipIds",
      "reportListing",
      "runSweep",
      "saveScholarship",
      "searchScholarships",
      "submitLocalScholarship",
      "updateApplication",
    ]);
  });
});
