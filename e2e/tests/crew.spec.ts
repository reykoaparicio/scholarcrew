import { expect } from "@playwright/test";
import type { ActionReceipt, CrewJob, Message } from "@scholarcrew/domain";
import { adminSession, isoDaysFromNow, publishScholarship, uniqueListingName } from "../support/admin";
import { api, apiOk } from "../support/api";
import { crewMessages, openMyCrew, planItemCount, replyWithCard, sendFromComposer, waitForJob } from "../support/crew";
import { expireJobLease, setUsage } from "../support/db";
import { test } from "../support/fixtures";
import { sendJob } from "../support/jobs";
import { signUpStudent } from "../support/onboarding";

test("flow 2: a crew request returns a reply with an action card, and applying it twice changes nothing (CR-01, CR-05)", async ({
  browser,
  adminState,
}) => {
  const admin = await adminSession(browser, adminState);
  const listing = await publishScholarship(admin.page, {
    name: uniqueListingName("Prairie Robotics Award"),
    amountUsd: 1500,
    deadline: isoDaysFromNow(21),
  });
  await admin.context.close();

  const s = await signUpStudent(browser, "crew");
  await apiOk(s.page, "POST", "/scholarship-applications", { scholarshipId: listing.id });

  const conversationId = await openMyCrew(s.page);
  await sendFromComposer(s.page, "I have 2 hours this weekend. What should I work on?");
  const reply = s.page.getByRole("article", { name: "Reply from Compass" });
  await expect(reply).toBeVisible({ timeout: 90_000 });
  const card = reply.getByRole("button", { name: "Add to this week", exact: true });
  await expect(card).toBeEnabled();
  await card.click();
  await expect(reply.getByRole("button", { name: "Added to your week", exact: true })).toBeDisabled();

  const message = replyWithCard(await crewMessages(s.page, conversationId), "next-deadline");
  expect(message.appliedCardIds).toContain("next-deadline");
  const added = message.reply?.actionCards.find((c) => c.id === "next-deadline");
  const title = added?.kind === "add_plan_item" ? added.item.title : "";
  expect(title).toMatch(/^Work on /);
  const before = await planItemCount(s.page, title);
  expect(before).toBeGreaterThanOrEqual(1);

  const second = await apiOk<ActionReceipt>(s.page, "POST", "/actions/apply", {
    messageId: message.id,
    cardId: "next-deadline",
  });
  const third = await apiOk<ActionReceipt>(s.page, "POST", "/actions/apply", {
    messageId: message.id,
    cardId: "next-deadline",
  });
  expect(third).toEqual(second);
  expect(second.messageId).toBe(message.id);
  expect(await planItemCount(s.page, title)).toBe(before);

  await s.page.reload();
  await expect(s.page.getByRole("button", { name: "Added to your week", exact: true }).first()).toBeDisabled();
  await s.context.close();
});

test("CR-09: crisis messages bypass exhausted usage and a full send bucket", async ({ browser }) => {
  const student = await signUpStudent(browser, "crisis-limit");
  const roomId = await openMyCrew(student.page);
  const month = new Date().toISOString().slice(0, 7);
  await setUsage(student.me.user.id, month, 20);
  await sendFromComposer(student.page, "I want to kill myself");
  await expect(student.page.getByText(/988/).first()).toBeVisible();
  await expect(student.page.getByRole("link", { name: "See plans" })).toHaveCount(0);
  expect((await apiOk<{ usage: { crewRequests: number } }>(student.page, "GET", "/billing")).usage.crewRequests).toBe(
    20,
  );
  // Normal requests still consume the rate bucket before the exhausted allowance rejects them.
  for (let n = 0; n < 30; n += 1)
    await api(student.page, "POST", `/conversations/${roomId}/messages`, { body: "Check my deadlines" });
  const crisis = await api<{ job: CrewJob }>(student.page, "POST", `/conversations/${roomId}/messages`, {
    body: "I want to kill myself",
  });
  expect(crisis.status).toBe(202);
  expect(crisis.body.job).toMatchObject({ status: "ready", safety: "crisis" });
  expect((await apiOk<{ usage: { crewRequests: number } }>(student.page, "GET", "/billing")).usage.crewRequests).toBe(
    20,
  );
  await student.context.close();
});

test("WK-06: an ask link only fills the composer", async ({ browser }) => {
  const student = await signUpStudent(browser, "prefill");
  const posts: string[] = [];
  student.page.on("request", (request) => {
    if (request.method() === "POST" && /\/messages$/.test(new URL(request.url()).pathname)) posts.push(request.url());
  });
  await student.page.goto("/crew?ask=hello");
  await expect(student.page.getByRole("textbox", { name: "Message your crew" })).toHaveValue("hello");
  await student.page.waitForTimeout(2_000);
  expect(posts).toEqual([]);
  await student.context.close();
});

test("a duplicated queue delivery adds no second reply or usage charge", async ({ browser }) => {
  const student = await signUpStudent(browser, "duplicate-delivery");
  const roomId = await openMyCrew(student.page);
  const before = await apiOk<{ usage: { crewRequests: number } }>(student.page, "GET", "/billing");
  const result = await apiOk<{ message: Message; job: CrewJob }>(
    student.page,
    "POST",
    `/conversations/${roomId}/messages`,
    { body: "How should I get started?" },
  );
  await waitForJob(student.page, result.job.id);
  const repliesBeforeRetry = (await crewMessages(student.page, roomId)).filter(
    (message) => message.authorKind === "crew",
  );
  await sendJob("crew.request", { jobId: result.job.id });
  await student.page.waitForTimeout(5_000);
  expect((await crewMessages(student.page, roomId)).filter((message) => message.authorKind === "crew")).toEqual(
    repliesBeforeRetry,
  );
  expect((await apiOk<{ usage: { crewRequests: number } }>(student.page, "GET", "/billing")).usage.crewRequests).toBe(
    before.usage.crewRequests + 1,
  );
  await student.context.close();
});

test("maintenance fails an abandoned lease and links the failure notice to its room", async ({ browser }) => {
  const student = await signUpStudent(browser, "stale-lease");
  const roomId = await openMyCrew(student.page);
  const result = await apiOk<{ job: CrewJob }>(student.page, "POST", `/conversations/${roomId}/messages`, {
    body: "How do I begin?",
  });
  await waitForJob(student.page, result.job.id);
  await expireJobLease(result.job.id);
  await sendJob("maintenance.purge", {});
  await expect
    .poll(async () => (await apiOk<CrewJob>(student.page, "GET", `/jobs/${result.job.id}`)).status)
    .toBe("failed");
  await student.page.reload();
  await student.page.getByRole("button", { name: /Notifications/ }).click();
  await student.page.getByRole("button", { name: /My Crew didn't finish/ }).click();
  await expect(student.page).toHaveURL(`/crew/${roomId}`);
  await student.context.close();
});
