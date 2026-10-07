import { aidChecklistItems, eq, familyTasks, notifications } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { DEFAULT_SHARED } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf, latestEmail, tokenIn } from "../../test/helpers";
import { canRead } from "../access";
import { shareIncomeRangeToStudent } from "../memory";
import { createTestDeps } from "../shared";
import {
  acceptInvite,
  createTask,
  getBudget,
  getShareSettings,
  invite,
  listTasks,
  revokeInvite,
  setBudget,
  updateShareSettings,
  updateTask,
} from "./index";

async function setup() {
  const deps = createTestDeps();
  const { user: student } = await factories.student(deps.db);
  const parent = await factories.parent(deps.db);
  const parent2 = await factories.parent(deps.db);
  const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id, parent2.id] });
  const outsider = await factories.parent(deps.db);
  return { deps, student, parent, parent2, family, outsider };
}

describe("share settings", () => {
  it("lets members read the student's settings with defaults", async () => {
    const { deps, student, parent, family, outsider } = await setup();
    const own = await getShareSettings(deps, actorOf(student), student.id);
    expect(own).toEqual({ studentId: student.id, familyId: family.id, categories: DEFAULT_SHARED });
    expect(await getShareSettings(deps, actorOf(parent), student.id)).toEqual(own);
    await expect(getShareSettings(deps, actorOf(outsider), student.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("lets only the student edit them, and parents see the change on the next request", async () => {
    const { deps, student, parent } = await setup();
    const next = await updateShareSettings(deps, actorOf(student), { categories: { essays: true, costs: false } });
    expect(next.categories.essays).toBe(true);
    expect(next.categories.costs).toBe(false);
    expect(await canRead(deps, actorOf(parent), student.id, "essays")).toBe(true);
    expect(await canRead(deps, actorOf(parent), student.id, "costs")).toBe(false);
    await expect(updateShareSettings(deps, actorOf(parent), { categories: { chats: true } })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("family budget", () => {
  it("parents share it and members read it", async () => {
    const { deps, student, parent, outsider } = await setup();
    const budget = await setBudget(deps, actorOf(parent), { annualUsd: 4600 });
    expect(budget).toMatchObject({ annualUsd: 4600, sharedById: parent.id, updatedAt: "2026-10-06T15:00:00.000Z" });
    expect(await getBudget(deps, actorOf(student))).toEqual(budget);
    expect(await getBudget(deps, actorOf(outsider))).toBeNull();
    await expect(setBudget(deps, actorOf(student), { annualUsd: 1 })).rejects.toMatchObject({ code: "forbidden" });
    await expect(setBudget(deps, actorOf(parent), { annualUsd: -5 })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("completes the parent's share_budget task", async () => {
    const { deps, student, parent, family } = await setup();
    await createTask(deps, SYSTEM, {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "share_budget",
      title: "Share a yearly budget",
    });
    await setBudget(deps, actorOf(parent), { annualUsd: 4600 });
    expect((await listTasks(deps, actorOf(parent)))[0]?.status).toBe("done");
  });
});

describe("family tasks", () => {
  it("createTask is system-only and checks the assignee", async () => {
    const { deps, student, parent, family, outsider } = await setup();
    const input = {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "fafsa_contributor" as const,
      title: "Create your StudentAid.gov account",
    };
    await expect(createTask(deps, actorOf(student), input)).rejects.toMatchObject({ code: "forbidden" });
    await expect(createTask(deps, SYSTEM, { ...input, assigneeId: outsider.id })).rejects.toMatchObject({
      code: "invalid_input",
    });
    const task = await createTask(deps, SYSTEM, { ...input, dueOn: "2026-10-31" });
    expect(task).toMatchObject({ assigneeName: "Test Parent", status: "todo", detail: "", dueOn: "2026-10-31" });
  });

  it("lets the assignee or the student update a task", async () => {
    const { deps, student, parent, parent2, family, outsider } = await setup();
    const task = await createTask(deps, SYSTEM, {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "review_costs",
      title: "Review costs",
    });
    await expect(updateTask(deps, actorOf(parent2), task.id, { status: "done" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(updateTask(deps, actorOf(outsider), task.id, { status: "done" })).rejects.toMatchObject({
      code: "not_found",
    });
    const done = await updateTask(deps, actorOf(parent), task.id, { status: "done" });
    expect(done.completedAt).toBe("2026-10-06T15:00:00.000Z");
    const reopened = await updateTask(deps, actorOf(student), task.id, { status: "todo" });
    expect(reopened).toMatchObject({ status: "todo", completedAt: null });
  });

  it("lists family tasks to members only", async () => {
    const { deps, student, parent, parent2, family, outsider } = await setup();
    await createTask(deps, SYSTEM, {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "custom",
      title: "Gather tax documents",
    });
    expect(await listTasks(deps, actorOf(parent2))).toHaveLength(1);
    expect(await listTasks(deps, actorOf(outsider))).toEqual([]);
  });

  it("a joining parent's share tasks close when they share (R2I-7)", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const dana = await factories.user(deps.db, { email: "dana@example.test" });
    await invite(deps, actorOf(student), { email: "dana@example.test" });
    await acceptInvite(deps, actorOf(dana), { token: tokenIn((await latestEmail(deps.db, "dana@example.test")).text) });
    const statusOf = async (kind: string) =>
      (await listTasks(deps, actorOf(dana))).find((t) => t.kind === kind)?.status;
    expect((await listTasks(deps, actorOf(dana))).map((t) => t.kind).sort()).toEqual([
      "share_budget",
      "share_income_range",
    ]);
    await setBudget(deps, actorOf(dana), { annualUsd: 4600 });
    expect(await statusOf("share_budget")).toBe("done");
    await shareIncomeRangeToStudent(deps, actorOf(dana), { studentId: student.id, range: "30_48k" });
    expect(await statusOf("share_income_range")).toBe("done");
  });

  it("createTask notifies the assignee once and links an aid item once (R2I-6, R2I-15)", async () => {
    const { deps, student, parent, family } = await setup();
    const [item] = await deps.db
      .insert(aidChecklistItems)
      .values({
        ownerId: student.id,
        awardYear: "2027-28",
        program: "fafsa",
        key: "parent_fsa_id",
        title: "Create your StudentAid.gov account",
        assignee: "parent",
      })
      .returning();
    const input = {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "fafsa_contributor" as const,
      title: "Create your StudentAid.gov account",
      detail: "FAFSA 2027-28",
      aidItemId: item?.id,
    };
    const first = await createTask(deps, SYSTEM, input);
    const again = await createTask(deps, SYSTEM, input);
    expect(again.id).toBe(first.id);
    expect(await deps.db.select().from(familyTasks)).toHaveLength(1);
    const notes = await deps.db.select().from(notifications).where(eq(notifications.userId, parent.id));
    expect(notes.map((n) => [n.kind, n.title, n.link, n.dedupeKey])).toEqual([
      ["family", "New family task: Create your StudentAid.gov account", "/family", `family-task:${first.id}`],
    ]);
  });

  it("an aid-linked task reads and writes the aid item's status (R2I-6)", async () => {
    const { deps, student, parent, family } = await setup();
    const itemRow = (key: string) => ({
      ownerId: student.id,
      awardYear: "2027-28",
      program: "fafsa" as const,
      key,
      title: key,
      assignee: "parent" as const,
    });
    const [a, b] = await deps.db
      .insert(aidChecklistItems)
      .values([itemRow("parent_fsa_id"), itemRow("parent_sign")])
      .returning();
    const base = {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "fafsa_contributor" as const,
    };
    const ta = await createTask(deps, SYSTEM, { ...base, title: "parent_fsa_id", aidItemId: a?.id });
    const tb = await createTask(deps, SYSTEM, { ...base, title: "parent_sign", aidItemId: b?.id });
    expect((await updateTask(deps, actorOf(parent), ta.id, { status: "done" })).status).toBe("done");
    const [itemA] = await deps.db
      .select()
      .from(aidChecklistItems)
      .where(eq(aidChecklistItems.id, a?.id ?? ""));
    expect(itemA).toMatchObject({ status: "done", completedAt: new Date("2026-10-06T15:00:00.000Z") });
    const [taskA] = await deps.db.select().from(familyTasks).where(eq(familyTasks.id, ta.id));
    expect(taskA?.status).toBe("todo");
    await deps.db
      .update(aidChecklistItems)
      .set({ status: "done" })
      .where(eq(aidChecklistItems.id, b?.id ?? ""));
    const listed = await listTasks(deps, actorOf(student));
    expect(listed.find((t) => t.id === tb.id)?.status).toBe("done");
  });

  it("adds the college name to a CSS task only for viewers who may read colleges (R2I-5)", async () => {
    const { deps, student, parent, family } = await setup();
    const college = await factories.college(deps.db, { name: "Northgate University", cssProfileRequired: true });
    const [item] = await deps.db
      .insert(aidChecklistItems)
      .values({
        ownerId: student.id,
        awardYear: "2027-28",
        program: "css",
        collegeId: college.id,
        key: "parent_css",
        title: "Fill in the parent section",
        assignee: "parent",
      })
      .returning();
    await createTask(deps, SYSTEM, {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "css_contributor",
      title: "Fill in the parent section",
      detail: "CSS Profile 2027-28",
      aidItemId: item?.id,
    });
    const titleFor = async (viewer: typeof parent) => (await listTasks(deps, actorOf(viewer)))[0]?.title;
    await updateShareSettings(deps, actorOf(student), { categories: { colleges: false } });
    expect(await titleFor(parent)).toBe("Fill in the parent section");
    expect(await titleFor(student)).toBe("Fill in the parent section (Northgate University)");
    await updateShareSettings(deps, actorOf(student), { categories: { colleges: true } });
    expect(await titleFor(parent)).toBe("Fill in the parent section (Northgate University)");
  });

  it("names a nameless assignee by role instead of leaving it empty (R3V-14)", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const nameless = await factories.user(deps.db, { role: "parent", displayName: "  " });
    const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [nameless.id] });
    const task = await createTask(deps, SYSTEM, {
      familyId: family.id,
      assigneeId: nameless.id,
      studentId: student.id,
      kind: "custom",
      title: "Gather tax documents",
    });
    expect(task.assigneeName).toBe("Your family member");
    expect((await listTasks(deps, actorOf(student)))[0]?.assigneeName).toBe("Your family member");
  });
});
