import { applicationItems, collegeList, eq, offers } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { MAX_COLLEGE_LIST } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setShare, setup } from "../scholarships/testkit";
import { addCollege, archiveSeason, getCollegeList, removeCollege, updateCollegeEntry } from "./list";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
});

async function fullCollege() {
  return factories.college(ctx.deps.db, {
    id: "200001",
    name: "Maple State University",
    testPolicy: "required",
    cssProfileRequired: true,
    deadlines: { ED: null, EA: "2026-11-01", REA: null, RD: "2027-01-15", rolling: false },
    requirements: {
      supplements: [
        { prompt: "Why Maple State?", wordLimit: 250 },
        { prompt: "Describe a community you belong to.", wordLimit: 300 },
      ],
      teacherRecs: 2,
      counselorRec: true,
      applicationFeeUsd: 50,
      feeWaiverAvailable: true,
      portfolio: false,
      interview: "none",
    },
  });
}

const itemsOf = (entryId: string) =>
  ctx.deps.db.select().from(applicationItems).where(eq(applicationItems.collegeListId, entryId));

describe("addCollege", () => {
  it("creates the entry and one item per requirement, due on the plan deadline", async () => {
    await fullCollege();
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200001", fit: "target", plan: "EA" });
    expect(entry).toMatchObject({
      collegeId: "200001",
      season: "2026-27",
      deadline: "2026-11-01",
      itemsDone: 0,
      itemsTotal: 10,
      gapUsd: null,
      testPolicy: "required",
      college: { name: "Maple State University" },
    });
    const items = await itemsOf(entry.id);
    expect(items.map((i) => i.kind).sort()).toEqual([
      "counselor_rec",
      "css_profile",
      "fee_or_waiver",
      "form",
      "supplement",
      "supplement",
      "teacher_rec",
      "teacher_rec",
      "test_scores",
      "transcript",
    ]);
    expect(
      items
        .filter((i) => i.kind === "teacher_rec")
        .map((i) => i.label)
        .sort(),
    ).toEqual(["Teacher recommendation 1", "Teacher recommendation 2"]);
    expect(items.every((i) => i.dueOn === "2026-11-01")).toBe(true);
  });

  it("uses no deadline for rolling plans and only the needed items", async () => {
    await factories.college(ctx.deps.db, { id: "200002" });
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200002", fit: "likely", plan: "rolling" });
    expect(entry.deadline).toBeNull();
    const items = await itemsOf(entry.id);
    expect(items.map((i) => i.kind).sort()).toEqual([
      "counselor_rec",
      "fee_or_waiver",
      "form",
      "teacher_rec",
      "transcript",
    ]);
    expect(items.every((i) => i.dueOn === null)).toBe(true);
  });

  it("rejects duplicates, unknown colleges, and a 26th active college", async () => {
    await fullCollege();
    await addCollege(ctx.deps, student.actor, { collegeId: "200001", fit: "target", plan: "RD" });
    await expect(
      addCollege(ctx.deps, student.actor, { collegeId: "200001", fit: "reach", plan: "EA" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      addCollege(ctx.deps, student.actor, { collegeId: "999999", fit: "reach", plan: "RD" }),
    ).rejects.toMatchObject({ code: "not_found" });
    for (let n = 1; n < MAX_COLLEGE_LIST; n += 1) {
      const c = await factories.college(ctx.deps.db, { id: String(300000 + n) });
      await ctx.deps.db
        .insert(collegeList)
        .values({ ownerId: student.user.id, collegeId: c.id, fit: "target", plan: "RD", season: "2026-27" });
    }
    const extra = await factories.college(ctx.deps.db, { id: "399999" });
    await expect(
      addCollege(ctx.deps, student.actor, { collegeId: extra.id, fit: "likely", plan: "RD" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect((await archiveSeason(ctx.deps, student.actor)).archived).toBe(MAX_COLLEGE_LIST);
    expect(
      (await addCollege(ctx.deps, student.actor, { collegeId: extra.id, fit: "likely", plan: "RD" })).id,
    ).toBeTruthy();
  });
});

describe("getCollegeList", () => {
  it("lists active entries with item progress and excludes archived entries", async () => {
    await fullCollege();
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200001", fit: "target", plan: "EA" });
    const [first, second] = await itemsOf(entry.id);
    if (!first || !second) throw new Error("items missing");
    await ctx.deps.db.update(applicationItems).set({ status: "done" }).where(eq(applicationItems.id, first.id));
    await ctx.deps.db.update(applicationItems).set({ status: "not_needed" }).where(eq(applicationItems.id, second.id));
    const old = await factories.college(ctx.deps.db, { id: "200009" });
    await ctx.deps.db.insert(collegeList).values({
      ownerId: student.user.id,
      collegeId: old.id,
      fit: "reach",
      plan: "RD",
      season: "2025-26",
      archivedAt: new Date("2026-08-01"),
    });
    const list = await getCollegeList(ctx.deps, student.actor, student.user.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: entry.id, itemsDone: 1, itemsTotal: 9 });
  });

  it("follows the colleges share for parents and hides other students' lists", async () => {
    await fullCollege();
    await addCollege(ctx.deps, student.actor, { collegeId: "200001", fit: "target", plan: "EA" });
    const parent = await makeParentOf(ctx.deps, student.user.id);
    expect(await getCollegeList(ctx.deps, parent.actor, student.user.id)).toHaveLength(1);
    await setShare(ctx.deps, student.user.id, "colleges", false);
    await expect(getCollegeList(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    const other = await makeStudent(ctx.deps);
    await expect(getCollegeList(ctx.deps, other.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("updateCollegeEntry, removeCollege, archiveSeason", () => {
  it("moves item due dates with the plan, deletes with items, and archives the season", async () => {
    await fullCollege();
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200001", fit: "target", plan: "EA" });
    const updated = await updateCollegeEntry(ctx.deps, student.actor, entry.id, { plan: "RD", status: "applying" });
    expect(updated).toMatchObject({ plan: "RD", status: "applying", deadline: "2027-01-15" });
    expect((await itemsOf(entry.id)).every((i) => i.dueOn === "2027-01-15")).toBe(true);

    const other = await makeStudent(ctx.deps);
    await expect(updateCollegeEntry(ctx.deps, other.actor, entry.id, { fit: "reach" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(removeCollege(ctx.deps, other.actor, entry.id)).rejects.toMatchObject({ code: "not_found" });

    const [thisYear, nextYear, theirs] = await ctx.deps.db
      .insert(offers)
      .values([
        { ownerId: student.user.id, collegeId: "200001", awardYear: "2027-28" },
        { ownerId: student.user.id, collegeId: "200001", awardYear: "2028-29" },
        { ownerId: other.user.id, collegeId: "200001", awardYear: "2027-28" },
      ])
      .returning();
    expect(await archiveSeason(ctx.deps, student.actor)).toEqual({ archived: 1 });
    expect(await getCollegeList(ctx.deps, student.actor, student.user.id)).toEqual([]);
    const offerRows = await ctx.deps.db.select().from(offers);
    const archivedAt = (id: string | undefined) => offerRows.find((o) => o.id === id)?.archivedAt ?? null;
    expect(archivedAt(thisYear?.id)).toEqual(new Date("2026-10-06T15:00:00.000Z"));
    expect(archivedAt(nextYear?.id)).toBeNull();
    expect(archivedAt(theirs?.id)).toBeNull();
    expect(await archiveSeason(ctx.deps, student.actor)).toEqual({ archived: 0 });

    await removeCollege(ctx.deps, student.actor, entry.id);
    expect(await itemsOf(entry.id)).toEqual([]);
  });
});
