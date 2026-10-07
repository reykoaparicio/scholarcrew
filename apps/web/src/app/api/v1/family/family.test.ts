import { createTask } from "@scholarcrew/core/family";
import { TEST_NOW } from "@scholarcrew/core/shared";
import { rateLimits } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import {
  type FamilyBudget,
  type FamilyTask,
  type FamilyView,
  type ShareSettings,
  systemActor,
} from "@scholarcrew/domain";
import {
  NO_PARAMS,
  latestEmail,
  params,
  readJson,
  request,
  signIn,
  signedInParent,
  signedInStudent,
  tokenFrom,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as getBudget, PUT as putBudget } from "./budget/route";
import { DELETE as revokeInvite } from "./invites/[id]/route";
import { POST as accept } from "./invites/accept/route";
import { GET as preview } from "./invites/preview/route";
import { POST as invite } from "./invites/route";
import { POST as leave } from "./leave/route";
import { DELETE as removeMember } from "./members/[userId]/route";
import { GET as getFamily } from "./route";
import { GET as getShares, PUT as putShares } from "./share-settings/route";
import { PATCH as patchTask } from "./tasks/[id]/route";
import { GET as listTasks } from "./tasks/route";

const deps = useTestDeps();

async function familyOfTwo() {
  const student = await signedInStudent(deps().db);
  const parent = await signedInParent(deps().db);
  const family = await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
  return { student, parent, family };
}

const post = (path: string, cookie: string, body?: unknown) => request(path, { method: "POST", cookie, body });

describe("invites", () => {
  it("invites a parent by email and the parent joins", async () => {
    const student = await signedInStudent(deps().db);
    const parent = await signedInParent(deps().db, { email: "rosa@example.test" });
    expect(
      (await invite(post("/family/invites", student.cookie, { email: "rosa@example.test" }), NO_PARAMS)).status,
    ).toBe(204);
    const mail = await latestEmail(deps().db, "rosa@example.test");
    expect(mail.text).toContain("http://localhost:3000/family/join?token=");
    const joined = await accept(
      post("/family/invites/accept", parent.cookie, { token: tokenFrom(mail.text) }),
      NO_PARAMS,
    );
    expect(joined.status).toBe(200);
    const view = await readJson<FamilyView>(joined);
    expect(view.myRole).toBe("parent");
    expect(view.members).toHaveLength(2);
    const studentView = await readJson<FamilyView>(
      await getFamily(request("/family", { cookie: student.cookie }), NO_PARAMS),
    );
    expect(studentView.members.map((m) => m.memberRole).sort()).toEqual(["parent", "student"]);
  });

  it("reserves invites and pending-invite cancellation to the student", async () => {
    const { student, parent } = await familyOfTwo();
    expect(
      (await invite(post("/family/invites", parent.cookie, { email: "new@example.test" }), NO_PARAMS)).status,
    ).toBe(403);
    expect(
      (
        await invite(
          post("/family/invites", student.cookie, { email: "new@example.test", memberRole: "student" }),
          NO_PARAMS,
        )
      ).status,
    ).toBe(400);
    await invite(post("/family/invites", student.cookie, { email: "new@example.test" }), NO_PARAMS);
    const family = await readJson<FamilyView>(
      await getFamily(request("/family", { cookie: student.cookie }), NO_PARAMS),
    );
    const pending = family.pendingInvites[0];
    if (!pending) throw new Error("Expected pending invite");
    const path = `/family/invites/${pending.id}`;
    expect(
      (await revokeInvite(request(path, { method: "DELETE", cookie: parent.cookie }), params({ id: pending.id })))
        .status,
    ).toBe(404);
    expect(
      (await revokeInvite(request(path, { method: "DELETE", cookie: student.cookie }), params({ id: pending.id })))
        .status,
    ).toBe(204);
    const after = await readJson<FamilyView>(
      await getFamily(request("/family", { cookie: student.cookie }), NO_PARAMS),
    );
    expect(after.pendingInvites).toEqual([]);
  });

  it("rejects bad invites and bad tokens", async () => {
    const student = await signedInStudent(deps().db);
    const parent = await signedInParent(deps().db);
    expect(
      (await invite(post("/family/invites", student.cookie, { email: student.user.email }), NO_PARAMS)).status,
    ).toBe(400);
    expect((await invite(post("/family/invites", student.cookie, { email: "nope" }), NO_PARAMS)).status).toBe(400);
    expect((await accept(post("/family/invites/accept", parent.cookie, { token: "x" }), NO_PARAMS)).status).toBe(400);
    const unknown = { token: "A".repeat(43) };
    expect((await accept(post("/family/invites/accept", parent.cookie, unknown), NO_PARAMS)).status).toBe(404);
  });

  it("limits invites to 20 a day per user (SE-04)", async () => {
    const student = await signedInStudent(deps().db);
    const statuses: number[] = [];
    for (let i = 1; i <= 21; i += 1) {
      const res = await invite(post("/family/invites", student.cookie, { email: `p${i}@example.test` }), NO_PARAMS);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 4)).toEqual([204, 204, 204, 204]);
    expect(statuses.slice(0, 20)).not.toContain(429);
    expect(statuses[20]).toBe(429);
  });

  it("previews an invite without a session and hides the invitee's email (D37)", async () => {
    const student = await signedInStudent(deps().db);
    const parent = await signedInParent(deps().db, { email: "rosa@example.test" });
    await invite(post("/family/invites", student.cookie, { email: "rosa@example.test" }), NO_PARAMS);
    const token = tokenFrom((await latestEmail(deps().db, "rosa@example.test")).text);
    const peek = (t: string, ip = "203.0.113.40") =>
      preview(request(`/family/invites/preview?token=${t}`, { headers: { "x-forwarded-for": ip } }), NO_PARAMS);
    const res = await peek(token);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      inviterFirstName: "Test",
      memberRole: "parent",
      expiresAt: "2026-10-13T15:00:00.000Z",
    });
    expect(text).not.toContain("rosa@example.test");
    expect((await peek("A".repeat(43))).status).toBe(404);
    expect((await peek("")).status).toBe(400);
    await accept(post("/family/invites/accept", parent.cookie, { token }), NO_PARAMS);
    expect((await peek(token)).status).toBe(404);
    await deps()
      .db.insert(rateLimits)
      .values({ key: "family.invite-preview:203.0.113.41", windowStart: new Date(TEST_NOW), count: 30 });
    expect((await peek(token, "203.0.113.41")).status).toBe(429);
  });
});

describe("share settings", () => {
  it("lets the student edit, the parent read, and everyone else get 404", async () => {
    const { student, parent } = await familyOfTwo();
    const mine = await readJson<ShareSettings>(
      await getShares(request("/family/share-settings", { cookie: student.cookie }), NO_PARAMS),
    );
    expect(mine.categories.essays).toBe(false);
    expect(mine.categories.deadlines).toBe(true);
    const put = (cookie: string) =>
      putShares(
        request("/family/share-settings", { method: "PUT", cookie, body: { categories: { essays: true } } }),
        NO_PARAMS,
      );
    expect((await readJson<ShareSettings>(await put(student.cookie))).categories.essays).toBe(true);
    const path = `/family/share-settings?studentId=${student.user.id}`;
    const parentView = await readJson<ShareSettings>(
      await getShares(request(path, { cookie: parent.cookie }), NO_PARAMS),
    );
    expect(parentView.categories.essays).toBe(true);
    expect((await put(parent.cookie)).status).toBe(404);
    const stranger = await signIn(deps().db, (await factories.parent(deps().db)).id);
    expect((await getShares(request(path, { cookie: stranger }), NO_PARAMS)).status).toBe(404);
    expect(
      (await getShares(request("/family/share-settings?studentId=nope", { cookie: parent.cookie }), NO_PARAMS)).status,
    ).toBe(400);
  });
});

describe("budget and tasks", () => {
  it("lets a parent share the budget and the student read it", async () => {
    const { student, parent } = await familyOfTwo();
    const put = (cookie: string, annualUsd: number) =>
      putBudget(request("/family/budget", { method: "PUT", cookie, body: { annualUsd } }), NO_PARAMS);
    const shared = await put(parent.cookie, 12000);
    expect(shared.status).toBe(200);
    expect((await readJson<FamilyBudget>(shared)).annualUsd).toBe(12000);
    const read = await readJson<FamilyBudget>(
      await getBudget(request("/family/budget", { cookie: student.cookie }), NO_PARAMS),
    );
    expect(read.annualUsd).toBe(12000);
    expect((await put(student.cookie, 9000)).status).toBe(403);
    expect((await put(parent.cookie, -5)).status).toBe(400);
  });

  it("lists family tasks and lets the assignee finish one", async () => {
    const { student, parent, family } = await familyOfTwo();
    const task = await createTask(deps(), systemActor("test"), {
      familyId: family.id,
      assigneeId: parent.user.id,
      studentId: student.user.id,
      kind: "fafsa_contributor",
      title: "Create your StudentAid.gov account",
    });
    const list = await readJson<FamilyTask[]>(
      await listTasks(request("/family/tasks", { cookie: parent.cookie }), NO_PARAMS),
    );
    expect(list.map((t) => t.id)).toEqual([task.id]);
    const done = await patchTask(
      request(`/family/tasks/${task.id}`, { method: "PATCH", cookie: parent.cookie, body: { status: "done" } }),
      params({ id: task.id }),
    );
    expect((await readJson<FamilyTask>(done)).status).toBe("done");
    const missing = "00000000-0000-4000-8000-000000000000";
    const res = await patchTask(
      request(`/family/tasks/${missing}`, { method: "PATCH", cookie: parent.cookie, body: { status: "done" } }),
      params({ id: missing }),
    );
    expect(res.status).toBe(404);
  });
});

describe("membership", () => {
  it("lets the student remove a parent, and members leave", async () => {
    const { student, parent } = await familyOfTwo();
    const removed = await removeMember(
      request(`/family/members/${parent.user.id}`, { method: "DELETE", cookie: student.cookie }),
      params({ userId: parent.user.id }),
    );
    expect(removed.status).toBe(204);
    expect(
      await readJson<FamilyView | null>(await getFamily(request("/family", { cookie: parent.cookie }), NO_PARAMS)),
    ).toBeNull();
    expect((await leave(post("/family/leave", student.cookie), NO_PARAMS)).status).toBe(204);
    expect(
      await readJson<FamilyView | null>(await getFamily(request("/family", { cookie: student.cookie }), NO_PARAMS)),
    ).toBeNull();
  });
});
