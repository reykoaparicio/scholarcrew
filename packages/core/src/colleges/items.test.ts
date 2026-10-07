import { eq, helperLinks, recRequests } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setup } from "../scholarships/testkit";
import * as collegesModule from "./index";
import { listApplicationItems, updateApplicationItem } from "./items";
import { addCollege } from "./list";
import {
  addRecommender,
  listRecRequests,
  listRecommenders,
  requestRecommendation,
  updateRecRequest,
} from "./recommenders";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
  await factories.college(ctx.deps.db, { id: "200002", name: "Cedar College" });
});

describe("application items", () => {
  it("lists items in requirement order and lets the owner update status and essay links", async () => {
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200002", fit: "target", plan: "RD" });
    const items = await listApplicationItems(ctx.deps, student.actor, entry.id);
    expect(items.map((i) => i.kind)).toEqual(["form", "transcript", "counselor_rec", "teacher_rec", "fee_or_waiver"]);
    const essay = await factories.essay(ctx.deps.db, student.user.id);
    const form = items[0];
    if (!form) throw new Error("no items");
    const updated = await updateApplicationItem(ctx.deps, student.actor, form.id, {
      status: "done",
      essayId: essay.id,
    });
    expect(updated).toMatchObject({ status: "done", essayId: essay.id });
    const parent = await makeParentOf(ctx.deps, student.user.id);
    expect(await listApplicationItems(ctx.deps, parent.actor, entry.id)).toHaveLength(5);
    await expect(updateApplicationItem(ctx.deps, parent.actor, form.id, { status: "todo" })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("rejects another student's essay and another student's items", async () => {
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200002", fit: "target", plan: "RD" });
    const [item] = await listApplicationItems(ctx.deps, student.actor, entry.id);
    if (!item) throw new Error("no items");
    const other = await makeStudent(ctx.deps);
    const theirEssay = await factories.essay(ctx.deps.db, other.user.id);
    await expect(
      updateApplicationItem(ctx.deps, student.actor, item.id, { essayId: theirEssay.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(listApplicationItems(ctx.deps, other.actor, entry.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("recommenders", () => {
  it("adds and lists the student's own recommenders only", async () => {
    await addRecommender(ctx.deps, student.actor, {
      name: "Ms. Patel",
      email: "Patel@School.example",
      relationship: "AP Physics",
    });
    const list = await listRecommenders(ctx.deps, student.actor);
    expect(list).toEqual([expect.objectContaining({ name: "Ms. Patel", email: "patel@school.example" })]);
    const other = await makeStudent(ctx.deps);
    expect(await listRecommenders(ctx.deps, other.actor)).toEqual([]);
  });

  it("creates a scoped helper link, records the request, and emails the recommender", async () => {
    const rec = await addRecommender(ctx.deps, student.actor, {
      name: "Ms. Patel",
      email: "patel@school.example",
      relationship: "",
    });
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200002", fit: "target", plan: "RD" });
    const request = await requestRecommendation(ctx.deps, student.actor, {
      recommenderId: rec.id,
      collegeListId: entry.id,
      scholarshipApplicationId: null,
      message: "Thanks for considering it!",
    });
    expect(request).toMatchObject({
      status: "requested",
      requestedAt: "2026-10-06T15:00:00.000Z",
      collegeListId: entry.id,
    });
    const [link] = await ctx.deps.db.select().from(helperLinks).where(eq(helperLinks.studentId, student.user.id));
    expect(link).toMatchObject({
      id: request.helperLinkId,
      helperRole: "recommender",
      label: "Recommendation for Ms. Patel",
    });
    expect([...(link?.scope ?? [])].sort()).toEqual(["activities", "stories"]);
    expect(ctx.mails).toHaveLength(1);
    expect(ctx.mails[0]?.to).toBe("patel@school.example");
    expect(ctx.mails[0]?.text).toContain("Thanks for considering it!");
    expect(ctx.mails[0]?.text).toContain("Cedar College");
    expect(ctx.mails[0]?.text).toMatch(/https?:\/\/\S+/);
  });

  it("returns not_found for someone else's recommender or entry", async () => {
    const other = await makeStudent(ctx.deps);
    const theirs = await addRecommender(ctx.deps, other.actor, {
      name: "Mr. Lee",
      email: "lee@school.example",
      relationship: "",
    });
    const mine = await addRecommender(ctx.deps, student.actor, {
      name: "Ms. Patel",
      email: "patel@school.example",
      relationship: "",
    });
    const theirEntry = await addCollege(ctx.deps, other.actor, { collegeId: "200002", fit: "target", plan: "RD" });
    const base = { collegeListId: null, scholarshipApplicationId: null, message: "" };
    await expect(
      requestRecommendation(ctx.deps, student.actor, { ...base, recommenderId: theirs.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      requestRecommendation(ctx.deps, student.actor, { ...base, recommenderId: mine.id, collegeListId: theirEntry.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await ctx.deps.db.select().from(recRequests)).toEqual([]);
  });

  it("lists the student's own requests newest first, with their helper link ids", async () => {
    const rec = await addRecommender(ctx.deps, student.actor, {
      name: "Ms. Patel",
      email: "patel@school.example",
      relationship: "",
    });
    const base = { recommenderId: rec.id, collegeListId: null, scholarshipApplicationId: null, message: "" };
    const first = await requestRecommendation(ctx.deps, student.actor, base);
    ctx.clock.set("2026-10-07T15:00:00.000Z");
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200002", fit: "target", plan: "RD" });
    const second = await requestRecommendation(ctx.deps, student.actor, { ...base, collegeListId: entry.id });
    const list = await listRecRequests(ctx.deps, student.actor);
    expect(list.map((r) => r.id)).toEqual([second.id, first.id]);
    expect(list[0]?.helperLinkId).toBe(second.helperLinkId);
    expect(second.helperLinkId).not.toBe(first.helperLinkId);
    const other = await makeStudent(ctx.deps);
    expect(await listRecRequests(ctx.deps, other.actor)).toEqual([]);
  });

  it("lets only the owner move a request's status and stamps updatedAt (R2P-11)", async () => {
    const rec = await addRecommender(ctx.deps, student.actor, {
      name: "Ms. Patel",
      email: "patel@school.example",
      relationship: "",
    });
    const request = await requestRecommendation(ctx.deps, student.actor, {
      recommenderId: rec.id,
      collegeListId: null,
      scholarshipApplicationId: null,
      message: "",
    });
    ctx.clock.set("2026-10-09T15:00:00.000Z");
    const agreed = await updateRecRequest(ctx.deps, student.actor, request.id, { status: "confirmed" });
    expect(agreed).toMatchObject({
      id: request.id,
      status: "confirmed",
      requestedAt: "2026-10-06T15:00:00.000Z",
      updatedAt: "2026-10-09T15:00:00.000Z",
    });
    expect((await updateRecRequest(ctx.deps, student.actor, request.id, { status: "submitted" })).status).toBe(
      "submitted",
    );
    expect((await listRecRequests(ctx.deps, student.actor))[0]?.status).toBe("submitted");
    const parent = await makeParentOf(ctx.deps, student.user.id);
    const other = await makeStudent(ctx.deps);
    for (const actor of [parent.actor, other.actor]) {
      await expect(updateRecRequest(ctx.deps, actor, request.id, { status: "declined" })).rejects.toMatchObject({
        code: "not_found",
      });
    }
    await expect(updateRecRequest(ctx.deps, student.actor, "not-a-uuid", { status: "declined" })).rejects.toMatchObject(
      {
        code: "not_found",
      },
    );
  });
});

describe("colleges index", () => {
  it("exports exactly the contract names", () => {
    expect(Object.keys(collegesModule).sort()).toEqual([
      "addCollege",
      "addRecommender",
      "archiveSeason",
      "getCollege",
      "getCollegeList",
      "listApplicationItems",
      "listRecRequests",
      "listRecommenders",
      "removeCollege",
      "requestRecommendation",
      "searchColleges",
      "updateApplicationItem",
      "updateCollegeEntry",
      "updateRecRequest",
    ]);
  });
});
