import { expect, test } from "@playwright/test";
import type { EssayComment, EssayVersion, EssayWithBody } from "@scholarcrew/domain";
import { countWords } from "@scholarcrew/engines";
import { apiOk } from "../support/api";
import { DEMO_QUILL_BODY, DRAFT_ONE, DRAFT_TWO, createEssayViaUi, quillProblems, saveDraft } from "../support/essays";
import { signUpStudent } from "../support/onboarding";

test("flow 3: Essay Studio saves drafts as versions, and Quill's comments only quote the student (ES-01..ES-04, ES-09)", async ({
  browser,
}) => {
  const s = await signUpStudent(browser, "essay");
  const essayId = await createEssayViaUi(s.page, {
    title: "Robotics essay",
    prompt: "Tell us about a time you solved a problem with other people.",
    wordLimit: 650,
  });
  const created = await apiOk<EssayWithBody>(s.page, "GET", `/essays/${essayId}`);
  expect(created).toMatchObject({ title: "Robotics essay", wordLimit: 650, targetType: "general", currentVersion: 0 });
  await expect(s.page.getByRole("heading", { level: 1, name: "Robotics essay" })).toBeVisible();
  await expect(s.page.getByText("Quill coaches · you write")).toBeVisible();

  await saveDraft(s.page, DRAFT_ONE, 1);
  await saveDraft(s.page, DRAFT_TWO, 2);
  const versions = await apiOk<EssayVersion[]>(s.page, "GET", `/essays/${essayId}/versions`);
  expect(versions.map((v) => v.version).sort((a, b) => a - b)).toEqual([1, 2]);
  expect(versions.find((v) => v.version === 1)?.body).toBe(DRAFT_ONE);
  expect(versions.find((v) => v.version === 2)?.wordCount).toBe(countWords(DRAFT_TWO));

  await s.page.getByRole("button", { name: "Draft history", exact: true }).click();
  const history = s.page.getByRole("dialog", { name: "Draft history" });
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await expect(history.getByText(/^Draft 2 · /)).toBeVisible();
  await history.getByRole("button", { name: "Close" }).click();

  await s.page.getByRole("button", { name: "Ask Quill", exact: true }).click();
  const first = s.page.getByRole("article", { name: "Comment 1", exact: true });
  await expect(first).toBeVisible({ timeout: 90_000 });
  await expect(first).toContainText(DEMO_QUILL_BODY);
  await expect(s.page.getByText("It won't write paragraphs for you", { exact: false })).toBeVisible();

  const comments = await apiOk<EssayComment[]>(s.page, "GET", `/essays/${essayId}/comments`);
  const quill = comments.filter((c) => c.author === "quill");
  expect(quill.length).toBeGreaterThanOrEqual(1);
  expect(quill.length).toBeLessThanOrEqual(5);
  expect(quillProblems(quill, DRAFT_TWO)).toEqual([]);
  expect(quill[0]?.quote).toBe(
    "When our robot died at regionals, I learned that a team can rebuild faster than it can blame.",
  );
  expect(quill.every((c) => c.version === 2)).toBe(true);

  // The review only adds comments; the draft is the student's, unchanged.
  const after = await apiOk<EssayWithBody>(s.page, "GET", `/essays/${essayId}`);
  expect(after.body).toBe(DRAFT_TWO);
  expect(after.currentVersion).toBe(2);
  await s.context.close();
});
