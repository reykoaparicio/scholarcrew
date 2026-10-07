import { expect, test } from "@playwright/test";
import type { CollegeListEntry, Conversation, Essay, FamilyView, MeResponse } from "@scholarcrew/domain";
import { apiOk } from "../support/api";
import { api } from "../support/api";
import { seedPrivateAward } from "../support/db";
import { createEssay } from "../support/essays";
import { acceptInvite, inviteFromFamilyPage, inviteLinkFor, previewInviteSignedOut } from "../support/family";
import { RILEY, STATE_U, signUpStudent } from "../support/onboarding";
import { newSession, signIn } from "../support/users";

test("flow 5: a parent joins from the invite and sees shared categories, never essays unless shared (FA-01..FA-04)", async ({
  browser,
}) => {
  const student = await signUpStudent(browser, "family-student", { collegeIds: [STATE_U.id] });
  const essay = await createEssay(student.page, { title: "Private essay", prompt: "Who are you?", wordLimit: 650 });
  const parent = await newSession(browser, "family-parent");
  await inviteFromFamilyPage(student.page, parent.email);

  const joinPath = await inviteLinkFor(parent.page, parent.email);
  await previewInviteSignedOut(parent.page, joinPath, RILEY.displayName);
  await signIn(parent);
  await acceptInvite(parent.page, joinPath);

  // Parent view (plan 16): private space card; the sidebar has Crew chats but no Essays or Story Bank yet.
  await expect(parent.page.getByRole("heading", { name: "Your private space" })).toBeVisible();
  const nav = parent.page.getByRole("navigation", { name: "Main", exact: true });
  await expect(nav.getByRole("link", { name: "Crew chats", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Colleges", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Essays", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Story Bank", exact: true })).toHaveCount(0);

  // Shared by default: colleges and deadlines.
  const sid = student.me.user.id;
  const privateId = await seedPrivateAward(sid);
  const privateBoard = await apiOk<{ working: unknown[]; privateCount: number }>(
    parent.page,
    "GET",
    `/scholarship-applications?studentId=${sid}`,
  );
  expect(privateBoard.privateCount).toBeGreaterThanOrEqual(1);
  expect(JSON.stringify(await apiOk(student.page, "GET", "/scholarship-applications"))).toContain(privateId);
  expect(JSON.stringify(privateBoard)).not.toContain(privateId);
  expect(JSON.stringify(privateBoard)).not.toContain("PRIVATE_E2E_AWARD");
  const colleges = await api<CollegeListEntry[]>(parent.page, "GET", `/college-list?studentId=${sid}`);
  expect(colleges.status).toBe(200);
  expect(colleges.body.map((e) => e.collegeId)).toContain(STATE_U.id);
  expect((await api(parent.page, "GET", `/plan/this-week?studentId=${sid}`)).status).toBe(200);

  // Private by default: essays and stories look like they don't exist.
  expect((await api(parent.page, "GET", `/essays?studentId=${sid}`)).status).toBe(404);
  expect((await api(parent.page, "GET", `/essays/${essay.id}`)).status).toBe(404);
  expect((await api(parent.page, "GET", `/stories?studentId=${sid}`)).status).toBe(404);
  await parent.page.goto("/essays");
  await expect(parent.page.getByText(/isn't sharing essays right now/)).toBeVisible();

  // The student shares essays; the parent can read them but still can't write.
  await student.page.goto("/family");
  const essaysSwitch = student.page.getByRole("switch", { name: "Essays and drafts", exact: true });
  await expect(essaysSwitch).not.toBeChecked();
  const saved = student.page.waitForResponse(
    (r) => r.url().includes("/api/v1/family/share-settings") && r.request().method() === "PUT",
  );
  await essaysSwitch.click();
  expect((await saved).status()).toBe(200);
  await expect(essaysSwitch).toBeChecked();
  const shared = await api<Essay[]>(parent.page, "GET", `/essays?studentId=${sid}`);
  expect(shared.status).toBe(200);
  expect(shared.body.map((e) => e.id)).toContain(essay.id);
  const write = await api(parent.page, "POST", `/essays/${essay.id}/versions`, {
    body: "Parent text.",
    baseVersion: 0,
  });
  expect(write.status).toBe(404);
  // The (app) layout reads share settings per request, so the next page load adds Essays to the parent's nav.
  await parent.page.goto("/week");
  await expect(nav.getByRole("link", { name: "Essays", exact: true })).toHaveAttribute("href", "/essays");
  // R2C-5: "Plan my week" is for the student only, never for parents.
  await expect(parent.page.getByRole("button", { name: "Plan my week", exact: true })).toHaveCount(0);

  // Student-only family administration and strict role input.
  expect(
    (await api(student.page, "POST", "/family/invites", { email: "bad-role@example.org", memberRole: "student" }))
      .status,
  ).toBe(400);
  expect((await api(parent.page, "POST", "/family/invites", { email: "unapproved@example.org" })).status).toBe(403);
  await apiOk(student.page, "PUT", "/family/share-settings", { categories: { essays: false } });
  expect((await api(parent.page, "GET", `/essays/${essay.id}`)).status).toBe(404);
  const family = await apiOk<FamilyView>(student.page, "GET", "/family");
  const room = await apiOk<Conversation>(parent.page, "POST", "/conversations", {
    room: "family",
    familyId: family.id,
    title: "Family",
  });
  const parentMe = await apiOk<MeResponse>(parent.page, "GET", "/me");
  await apiOk(student.page, "DELETE", `/family/members/${parentMe.user.id}`);
  expect((await api(parent.page, "GET", `/conversations/${room.id}/messages`)).status).toBe(404);
  // A student leaving invalidates the parent's access to that student's family room too.
  await inviteFromFamilyPage(student.page, parent.email);
  await acceptInvite(parent.page, await inviteLinkFor(parent.page, parent.email));
  const second = await apiOk<Conversation>(parent.page, "POST", "/conversations", {
    room: "family",
    familyId: family.id,
    title: "Again",
  });
  await apiOk(student.page, "POST", "/family/leave");
  expect((await api(parent.page, "GET", `/conversations/${second.id}/messages`)).status).toBe(404);
  await student.context.close();
  await parent.context.close();
});
