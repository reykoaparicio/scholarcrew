import { aidChecklistItems, aidDeadlines, and, eq, familyTasks } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { FAFSA_STEPS, systemActor, userActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { updateTask } from "../family";
import { AWARD_YEAR, NOW, listCollege, makeDeps, makeParentOf, makeStateU, makeStudent } from "../plan/testkit";
import { ensureChecklists, getAidChecklists, listAidDeadlines, updateAidItem } from "./index";

const SYSTEM = systemActor("test");

async function setup() {
  const { deps } = makeDeps();
  const student = await makeStudent(deps);
  const css = await factories.college(deps.db, {
    id: "200001",
    name: "Northgate University",
    cssProfileRequired: true,
    aidPriorityDate: "2026-11-15",
  });
  const plain = await makeStateU(deps);
  await listCollege(deps, student.user.id, css.id, { plan: "EA" });
  await listCollege(deps, student.user.id, plain.id, { plan: "EA", minutesAfter: 1 });
  return { deps, ...student, css, plain };
}

describe("ensureChecklists", () => {
  it("creates FAFSA items, CSS items for CSS colleges, and parent tasks once", async () => {
    const { deps, user, actor, css } = await setup();
    const { parent } = await makeParentOf(deps, user.id);
    await expect(ensureChecklists(deps, actor, user.id)).rejects.toMatchObject({ code: "forbidden" });
    await ensureChecklists(deps, SYSTEM, user.id);
    await ensureChecklists(deps, SYSTEM, user.id);
    const items = await deps.db.select().from(aidChecklistItems).where(eq(aidChecklistItems.ownerId, user.id));
    expect(items.filter((i) => i.program === "fafsa")).toHaveLength(7);
    const cssItems = items.filter((i) => i.program === "css");
    expect(cssItems).toHaveLength(3);
    expect(
      cssItems.every((i) => i.collegeId === css.id && i.dueOn === "2026-11-15" && i.awardYear === AWARD_YEAR),
    ).toBe(true);
    const tasks = await deps.db.select().from(familyTasks).where(eq(familyTasks.assigneeId, parent.id));
    expect(tasks.map((t) => t.kind).sort()).toEqual(["css_contributor", "fafsa_contributor", "fafsa_contributor"]);
    // R2I-5: the stored title is the plain step; 06 listTasks adds the college name for viewers who may read colleges.
    const cssParentItem = cssItems.find((i) => i.assignee === "parent");
    expect(tasks.find((t) => t.kind === "css_contributor")).toMatchObject({
      title: "Enter household finances on the CSS Profile",
      detail: `CSS Profile ${AWARD_YEAR}`,
      dueOn: "2026-11-15",
      studentId: user.id,
      aidItemId: cssParentItem?.id,
    });
    // R2I-6: every parent task points at its checklist item.
    const parentItemIds = items
      .filter((i) => i.assignee === "parent")
      .map((i) => i.id)
      .sort();
    expect(tasks.map((t) => t.aidItemId).sort()).toEqual(parentItemIds);
  });

  it("reads a parent step as done once the parent finishes the family task (R2I-6)", async () => {
    const { deps, user, actor } = await setup();
    const { parent, actor: parentActor } = await makeParentOf(deps, user.id);
    await ensureChecklists(deps, SYSTEM, user.id);
    const consent = (await getAidChecklists(deps, actor, user.id))[0]?.items.find(
      (i) => i.key === "contributor_consent",
    );
    if (!consent) throw new Error("consent step missing");
    const [task] = await deps.db
      .select()
      .from(familyTasks)
      .where(and(eq(familyTasks.assigneeId, parent.id), eq(familyTasks.aidItemId, consent.id)));
    if (!task) throw new Error("linked task missing");
    await updateTask(deps, parentActor, task.id, { status: "done" });
    const fafsa = (await getAidChecklists(deps, actor, user.id))[0];
    expect(fafsa?.items.find((i) => i.id === consent.id)).toMatchObject({ status: "done", completedAt: NOW });
    expect(fafsa?.doneCount).toBe(1);
    await ensureChecklists(deps, SYSTEM, user.id);
    expect(await deps.db.select().from(familyTasks).where(eq(familyTasks.assigneeId, parent.id))).toHaveLength(3);
  });
});

describe("getAidChecklists", () => {
  it("returns FAFSA plus one CSS checklist per listed CSS college", async () => {
    const { deps, user, actor } = await setup();
    const { actor: parent } = await makeParentOf(deps, user.id);
    const { actor: other } = await makeStudent(deps);
    const lists = await getAidChecklists(deps, actor, user.id);
    expect(lists.map((l) => [l.program, l.awardYear, l.collegeName, l.totalCount, l.doneCount])).toEqual([
      ["fafsa", AWARD_YEAR, null, 7, 0],
      ["css", AWARD_YEAR, "Northgate University", 3, 0],
    ]);
    expect(lists[0]?.items.map((i) => i.key)).toEqual(FAFSA_STEPS.map((s) => s.key));
    expect(await getAidChecklists(deps, parent, user.id)).toHaveLength(2);
    await expect(getAidChecklists(deps, other, user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("updateAidItem", () => {
  it("lets the student finish any item and a parent finish parent steps", async () => {
    const { deps, user, actor } = await setup();
    const { actor: parent } = await makeParentOf(deps, user.id);
    const outsider = userActor((await factories.parent(deps.db)).id, "parent");
    const fafsa = (await getAidChecklists(deps, actor, user.id))[0]?.items ?? [];
    const studentStep = fafsa.find((i) => i.assignee === "student");
    const parentStep = fafsa.find((i) => i.assignee === "parent");
    if (!studentStep || !parentStep) throw new Error("missing steps");
    expect(await updateAidItem(deps, actor, studentStep.id, { status: "done" })).toMatchObject({
      status: "done",
      completedAt: NOW,
    });
    expect(await updateAidItem(deps, parent, parentStep.id, { status: "done" })).toMatchObject({ status: "done" });
    await expect(updateAidItem(deps, parent, studentStep.id, { status: "todo" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(updateAidItem(deps, outsider, parentStep.id, { status: "todo" })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await updateAidItem(deps, actor, studentStep.id, { status: "todo" })).toMatchObject({ completedAt: null });
    expect((await getAidChecklists(deps, actor, user.id))[0]?.doneCount).toBe(1);
  });
});

describe("listAidDeadlines", () => {
  it("lists federal and the student's state deadlines for the award year", async () => {
    const { deps, user, actor } = await setup();
    const base = { sourceUrl: "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines", verifiedAt: new Date(NOW) };
    await deps.db.insert(aidDeadlines).values([
      { ...base, awardYear: AWARD_YEAR, state: null, program: "FAFSA", deadline: "2028-06-30" },
      { ...base, awardYear: AWARD_YEAR, state: "TX", program: "Texas TASFA priority", deadline: "2027-01-15" },
      { ...base, awardYear: AWARD_YEAR, state: "CA", program: "Cal Grant", deadline: "2027-03-02" },
      { ...base, awardYear: "2026-27", state: "TX", program: "Last year", deadline: "2026-01-15" },
    ]);
    const list = await listAidDeadlines(deps, actor, user.id);
    expect(list.map((d) => [d.program, d.state, d.deadline])).toEqual([
      ["Texas TASFA priority", "TX", "2027-01-15"],
      ["FAFSA", null, "2028-06-30"],
    ]);
  });
});
