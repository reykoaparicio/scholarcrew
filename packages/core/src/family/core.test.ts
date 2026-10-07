import {
  eq,
  families,
  familyBudgets,
  familyInvites,
  familyTasks,
  notifications,
  shareSettings,
  users,
} from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { Actor, InviteInput } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { actorOf, latestEmail, tokenIn } from "../../test/helpers";
import { canRead } from "../access";
import { type CoreDeps, createTestDeps, fixedClock } from "../shared";
import { acceptInvite, getFamily, invite, leaveFamily, previewInvite, removeMember, revokeInvite } from "./core";

async function inviteToken(deps: CoreDeps, from: Actor, email: string): Promise<string> {
  await invite(deps, from, { email });
  return tokenIn((await latestEmail(deps.db, email)).text);
}

describe("invite", () => {
  it("creates the family on a student's first invite with default share settings", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    await invite(deps, actorOf(student), { email: "Dana@Example.test" });
    const mail = await latestEmail(deps.db, "dana@example.test");
    expect(mail.subject).toBe("Test Student invited you to their family on ScholarCrew");
    expect(mail.text).toContain("http://localhost:3000/family/join?token=");
    const view = await getFamily(deps, actorOf(student));
    expect(view).toMatchObject({ name: "Test Student's family", myRole: "student" });
    expect(view?.members.map((m) => m.memberRole)).toEqual(["student"]);
    expect(view?.pendingInvites).toEqual([
      { id: expect.any(String), email: "dana@example.test", expiresAt: "2026-10-13T15:00:00.000Z" },
    ]);
    expect(await deps.db.select().from(shareSettings).where(eq(shareSettings.studentId, student.id))).toHaveLength(9);
  });

  it("doesn't let a parent without a family start one", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await expect(invite(deps, actorOf(parent), { email: "kid@example.test" })).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("caps a family at 4 parents, counting pending invites", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parents = [await factories.parent(deps.db), await factories.parent(deps.db), await factories.parent(deps.db)];
    await factories.family(deps.db, { studentIds: [student.id], parentIds: parents.map((p) => p.id) });
    await invite(deps, actorOf(student), { email: "p4@example.test" });
    await expect(invite(deps, actorOf(student), { email: "p5@example.test" })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("refuses a parent's invite even when they are already in the family", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await expect(invite(deps, actorOf(parent), { email: "grandma@example.test" })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("acceptInvite", () => {
  it("adds a new account as a parent member and sets its role", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const dana = await factories.user(deps.db, { email: "dana@example.test" });
    const token = await inviteToken(deps, actorOf(student), "dana@example.test");
    const view = await acceptInvite(deps, actorOf(dana), { token });
    expect(view.myRole).toBe("parent");
    expect(view.members).toHaveLength(2);
    expect(view.pendingInvites).toEqual([]);
    const [row] = await deps.db.select().from(users).where(eq(users.id, dana.id));
    expect(row?.role).toBe("parent");
    const [inv] = await deps.db.select().from(familyInvites);
    expect(inv?.acceptedById).toBe(dana.id);
  });

  it("rejects a different email or an expired link", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user: student } = await factories.student(deps.db);
    const dana = await factories.user(deps.db, { email: "dana@example.test" });
    const eve = await factories.user(deps.db, { email: "eve@example.test" });
    const token = await inviteToken(deps, actorOf(student), "dana@example.test");
    await expect(acceptInvite(deps, actorOf(eve), { token })).rejects.toMatchObject({ code: "not_found" });
    clock.set("2026-10-13T15:00:01.000Z");
    await expect(acceptInvite(deps, actorOf(dana), { token })).rejects.toMatchObject({ code: "not_found" });
  });

  it("works once and refuses people already in a family", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const { user: otherStudent } = await factories.student(deps.db);
    const dana = await factories.user(deps.db, { email: "dana@example.test" });
    const busy = await factories.parent(deps.db, { email: "busy@example.test" });
    await factories.family(deps.db, { studentIds: [otherStudent.id], parentIds: [busy.id] });
    const token = await inviteToken(deps, actorOf(student), "dana@example.test");
    await acceptInvite(deps, actorOf(dana), { token });
    await expect(acceptInvite(deps, actorOf(dana), { token })).rejects.toMatchObject({ code: "not_found" });
    const busyToken = await inviteToken(deps, actorOf(student), "busy@example.test");
    await expect(acceptInvite(deps, actorOf(busy), { token: busyToken })).rejects.toMatchObject({ code: "conflict" });
  });

  it("keeps the student role for someone who finished student onboarding", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const { user: sibling } = await factories.student(deps.db, { email: "sib@example.test" });
    const token = await inviteToken(deps, actorOf(student), "sib@example.test");
    const view = await acceptInvite(deps, actorOf(sibling), { token });
    expect(view.myRole).toBe("parent");
    const [row] = await deps.db.select().from(users).where(eq(users.id, sibling.id));
    expect(row?.role).toBe("student");
  });

  it("refuses an invite body carrying a student role", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    await expect(
      invite(deps, actorOf(student), { email: "sib@example.test", memberRole: "student" } as unknown as InviteInput),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("notifies the inviter and gives a joining parent the share tasks (R2I-7, R2I-15)", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const dana = await factories.user(deps.db, { email: "dana@example.test", displayName: "Dana Ruiz" });
    const token = await inviteToken(deps, actorOf(student), "dana@example.test");
    await acceptInvite(deps, actorOf(dana), { token });
    const [inv] = await deps.db.select().from(familyInvites);
    const toStudent = await deps.db.select().from(notifications).where(eq(notifications.userId, student.id));
    expect(toStudent).toEqual([
      expect.objectContaining({
        kind: "family",
        title: "Dana joined your family",
        body: "",
        link: "/family",
        dedupeKey: `family-joined:${inv?.id}`,
      }),
    ]);
    const tasks = await deps.db.select().from(familyTasks).where(eq(familyTasks.assigneeId, dana.id));
    expect(tasks.map((t) => [t.kind, t.studentId, t.title]).sort()).toEqual([
      ["share_budget", student.id, "Share a yearly budget for college"],
      ["share_income_range", student.id, "Share an income range for scholarship matching"],
    ]);
    const toDana = await deps.db.select().from(notifications).where(eq(notifications.userId, dana.id));
    expect(toDana.map((n) => n.title).sort()).toEqual([
      "New family task: Share a yearly budget for college",
      "New family task: Share an income range for scholarship matching",
    ]);
    expect(deps.jobs.sent.filter((j) => j.name === "notify.email")).toEqual([]);
  });
});

describe("previewInvite", () => {
  it("shows the inviter's first name, role, and expiry, and hides used or expired invites", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user: student } = await factories.student(deps.db);
    const dana = await factories.user(deps.db, { email: "dana@example.test" });
    const token = await inviteToken(deps, actorOf(student), "dana@example.test");
    expect(await previewInvite(deps, token)).toEqual({
      inviterFirstName: "Test",
      memberRole: "parent",
      expiresAt: "2026-10-13T15:00:00.000Z",
    });
    await expect(previewInvite(deps, "not-a-real-token")).rejects.toMatchObject({ code: "not_found" });
    clock.set("2026-10-13T15:00:01.000Z");
    await expect(previewInvite(deps, token)).rejects.toMatchObject({ code: "not_found" });
    clock.set("2026-10-06T15:00:00.000Z");
    await acceptInvite(deps, actorOf(dana), { token });
    await expect(previewInvite(deps, token)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("leaving and removing", () => {
  it("lets a student remove a parent, ending access at once", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await expect(removeMember(deps, actorOf(parent), student.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await canRead(deps, actorOf(parent), student.id, "costs")).toBe(true);
    await removeMember(deps, actorOf(student), parent.id);
    expect(await getFamily(deps, actorOf(parent))).toBeNull();
    expect(await canRead(deps, actorOf(parent), student.id, "costs")).toBe(false);
  });

  it("leaving removes the member and deletes an empty family", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await leaveFamily(deps, actorOf(parent));
    expect(await getFamily(deps, actorOf(parent))).toBeNull();
    await leaveFamily(deps, actorOf(student));
    expect(await deps.db.select().from(families).where(eq(families.id, family.id))).toHaveLength(0);
    expect(await deps.db.select().from(shareSettings).where(eq(shareSettings.studentId, student.id))).toHaveLength(0);
    await expect(leaveFamily(deps, actorOf(student))).rejects.toMatchObject({ code: "not_found" });
  });

  it("returns null for someone outside any family", async () => {
    const deps = createTestDeps();
    const outsider = await factories.parent(deps.db);
    expect(await getFamily(deps, actorOf(outsider))).toBeNull();
  });

  async function withBudgetAndTasks() {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    const parent2 = await factories.parent(deps.db);
    const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id, parent2.id] });
    await deps.db.insert(familyBudgets).values({ familyId: family.id, annualUsd: 4600, sharedById: parent.id });
    const task = (assigneeId: string, title: string) => ({
      familyId: family.id,
      assigneeId,
      studentId: student.id,
      kind: "custom" as const,
      title,
    });
    await deps.db
      .insert(familyTasks)
      .values([task(parent.id, "Gather tax documents"), task(parent2.id, "Call the aid office")]);
    const left = async () => ({
      budgets: await deps.db.select().from(familyBudgets).where(eq(familyBudgets.familyId, family.id)),
      tasks: (await deps.db.select().from(familyTasks).where(eq(familyTasks.familyId, family.id))).map((t) => t.title),
    });
    return { deps, student, parent, parent2, family, left };
  }

  it("removing a parent deletes the budget they shared and their tasks (R2I-14)", async () => {
    const { deps, student, parent, left } = await withBudgetAndTasks();
    await removeMember(deps, actorOf(student), parent.id);
    expect(await left()).toEqual({ budgets: [], tasks: ["Call the aid office"] });
  });

  it("a parent leaving deletes the budget they shared and their tasks", async () => {
    const { deps, parent, family, left } = await withBudgetAndTasks();
    await leaveFamily(deps, actorOf(parent));
    expect(await left()).toEqual({ budgets: [], tasks: ["Call the aid office"] });
    expect(await deps.db.select().from(families).where(eq(families.id, family.id))).toHaveLength(1);
  });

  it("the last student leaving deletes the family even with parents left", async () => {
    const { deps, student, parent, family } = await withBudgetAndTasks();
    await leaveFamily(deps, actorOf(student));
    expect(await deps.db.select().from(families).where(eq(families.id, family.id))).toHaveLength(0);
    expect(await deps.db.select().from(familyTasks)).toHaveLength(0);
    expect(await getFamily(deps, actorOf(parent))).toBeNull();
  });
});

describe("revoking invitations", () => {
  it("lets only the student revoke a pending invite", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    const token = await inviteToken(deps, actorOf(student), "new@example.test");
    const [row] = await deps.db.select().from(familyInvites);
    if (!row) throw new Error("expected invite");
    await expect(revokeInvite(deps, actorOf(parent), row.id)).rejects.toMatchObject({ code: "not_found" });
    await revokeInvite(deps, actorOf(student), row.id);
    await expect(previewInvite(deps, token)).rejects.toMatchObject({ code: "not_found" });
  });
});
