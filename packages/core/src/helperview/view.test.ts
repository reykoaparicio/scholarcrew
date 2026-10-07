import { activities, collegeList, eq, helperLinks, scholarshipApplications } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { HelperActor, HelperScope } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { addCollege } from "../colleges/list";
import { addRecommender, requestRecommendation } from "../colleges/recommenders";
import { createHelperLink } from "../helpers";
import { makeStudent, setup } from "../scholarships/testkit";
import * as helperviewModule from "./index";
import { getHelperView } from "./view";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
  const { db } = ctx.deps;
  const ownerId = student.user.id;
  await db.insert(activities).values({ ownerId, position: 1, name: "Robotics team", role: "Build lead" });
  await factories.story(db, ownerId, { title: "Library STEM nights", summary: "Started monthly STEM nights." });
  await factories.story(db, ownerId, { title: "Archived", archivedAt: new Date() });
  await factories.college(db, { id: "200002", name: "Cedar College" });
  await addCollege(ctx.deps, student.actor, { collegeId: "200002", fit: "target", plan: "RD" });
  const soon = await factories.scholarship(db, { name: "Maple Rotary", deadline: "2026-10-15", amountMaxUsd: 2000 });
  const past = await factories.scholarship(db, { name: "Past Award", deadline: "2026-10-01" });
  const matched = await factories.scholarship(db, { name: "Only Matched", deadline: "2026-10-20" });
  await db.insert(scholarshipApplications).values([
    { ownerId, scholarshipId: soon.id, stage: "planned" },
    { ownerId, scholarshipId: past.id, stage: "drafting" },
    { ownerId, scholarshipId: matched.id, stage: "matched" },
  ]);
});

async function helper(scope: HelperScope[], claimed: HelperScope[] = scope): Promise<HelperActor> {
  const created = await createHelperLink(ctx.deps, student.actor, {
    label: "Ms. Patel",
    helperRole: "counselor",
    scope,
    expiresInDays: 30,
  });
  return { kind: "helper", helperLinkId: created.link.id, studentId: student.user.id, scope: claimed };
}

describe("getHelperView", () => {
  it("shows a recommender only activities and story titles with summaries", async () => {
    const view = await getHelperView(ctx.deps, await helper(["activities", "stories"]));
    expect(view).toMatchObject({ studentName: "Test Student", label: "Ms. Patel", helperRole: "counselor" });
    expect(view.request).toEqual({ message: null, dueDate: null });
    expect(view.activities?.map((a) => a.name)).toEqual(["Robotics team"]);
    expect(view.stories).toEqual([{ title: "Library STEM nights", summary: "Started monthly STEM nights." }]);
    expect(view.deadlines).toBeNull();
    expect(view.colleges).toBeNull();
    expect(view.scholarships).toBeNull();
  });

  it("shows a counselor upcoming deadlines and the college list", async () => {
    const view = await getHelperView(ctx.deps, await helper(["deadlines", "colleges"]));
    expect(view.activities).toBeNull();
    expect(view.stories).toBeNull();
    expect(view.scholarships).toBeNull();
    expect(view.colleges?.map((c) => c.college.name)).toEqual(["Cedar College"]);
    expect(view.deadlines?.map((d) => [d.kind, d.title, d.dueOn, d.daysLeft, d.warning])).toEqual([
      ["scholarship", "Maple Rotary", "2026-10-15", 9, true],
      ["application", "Cedar College (RD)", "2027-01-15", 101, false],
    ]);
    const [rotary] = await ctx.deps.db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.stage, "planned"));
    expect(view.deadlines?.[0]).toMatchObject({ refType: "scholarship", refId: rotary?.scholarshipId });
  });

  it("shows a recommender the student's note and the target's due date", async () => {
    const rec = await addRecommender(ctx.deps, student.actor, {
      name: "Ms. Patel",
      email: "patel@school.example",
      relationship: "",
    });
    const [entry] = await ctx.deps.db.select().from(collegeList).where(eq(collegeList.ownerId, student.user.id));
    const request = await requestRecommendation(ctx.deps, student.actor, {
      recommenderId: rec.id,
      collegeListId: entry?.id ?? null,
      scholarshipApplicationId: null,
      message: "  Please mention robotics.  ",
    });
    const view = await getHelperView(ctx.deps, {
      kind: "helper",
      helperLinkId: request.helperLinkId ?? "",
      studentId: student.user.id,
      scope: ["activities", "stories"],
    });
    expect(view.helperRole).toBe("recommender");
    expect(view.request).toEqual({ message: "Please mention robotics.", dueDate: "2027-01-15" });
  });

  it("lists saved scholarships with stage, never bare matches", async () => {
    const view = await getHelperView(ctx.deps, await helper(["scholarships"]));
    expect(view.scholarships).toEqual([
      { name: "Past Award", deadline: "2026-10-01", stage: "drafting" },
      { name: "Maple Rotary", deadline: "2026-10-15", stage: "planned" },
    ]);
  });

  it("never widens past the stored scope and rejects revoked or expired links", async () => {
    const narrow = await helper(["activities"], ["activities", "colleges", "stories"]);
    const view = await getHelperView(ctx.deps, narrow);
    expect(view.colleges).toBeNull();
    expect(view.stories).toBeNull();
    ctx.clock.set("2026-11-06T15:00:00.000Z");
    await expect(getHelperView(ctx.deps, narrow)).rejects.toMatchObject({ code: "not_found" });
    ctx.clock.set("2026-10-06T15:00:00.000Z");
    await ctx.deps.db.update(helperLinks).set({ revokedAt: new Date() }).where(eq(helperLinks.id, narrow.helperLinkId));
    await expect(getHelperView(ctx.deps, narrow)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("private helper listings", () => {
  it("withholds private saved awards and their deadlines", async () => {
    const listing = await factories.scholarship(ctx.deps.db, {
      name: "Private heritage award",
      deadline: "2026-10-15",
    });
    await ctx.deps.db.insert(scholarshipApplications).values({
      ownerId: student.user.id,
      scholarshipId: listing.id,
      stage: "planned",
      matchReasons: [{ code: "heritage", text: "Heritage criterion matched", sensitive: true }],
    });
    const view = await getHelperView(ctx.deps, await helper(["scholarships", "deadlines"]));
    expect(JSON.stringify(view)).not.toContain("Private heritage award");
    expect(view.deadlines?.some((d) => d.refId === listing.id)).toBe(false);
  });
});

describe("helperview index", () => {
  it("exports exactly the contract names", () => {
    expect(Object.keys(helperviewModule)).toEqual(["getHelperView"]);
  });
});
