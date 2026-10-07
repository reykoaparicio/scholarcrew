import { type Page, expect } from "@playwright/test";
import { checkIntegrity } from "@scholarcrew/agents";
import type { Essay, EssayComment } from "@scholarcrew/domain";
import { countWords } from "@scholarcrew/engines";
import { apiOk } from "./api";

export const DRAFT_ONE = "When our robot died at regionals, I froze. Then I made a list of every broken part.";
export const DRAFT_TWO =
  "When our robot died at regionals, I learned that a team can rebuild faster than it can blame. I made a list of every broken part and gave each person one thing to fix.";
/** Plan 12's demo Quill comment body. */
export const DEMO_QUILL_BODY =
  "What were you feeling right at this moment? One concrete detail here would help a reader picture it.";
/** Plan 10's MAX_COMMENT_WORDS. */
const MAX_COMMENT_WORDS = 60;

/** POST /essays directly, for specs where the essay is only setup (family, isolation). */
export async function createEssay(page: Page, o: { title: string; prompt: string; wordLimit: number }): Promise<Essay> {
  return apiOk<Essay>(page, "POST", "/essays", {
    title: o.title,
    prompt: o.prompt,
    wordLimit: o.wordLimit,
    charLimit: null,
    targetType: "general",
    targetCollegeId: null,
    targetScholarshipId: null,
  });
}

/** ES-01 through plan 17's "Start a new essay" form on /essays (D47). Leaves the page in Essay Studio; returns the essay id. */
export async function createEssayViaUi(
  page: Page,
  o: { title: string; prompt: string; wordLimit: number },
): Promise<string> {
  await page.goto("/essays");
  await expect(page.getByRole("heading", { level: 1, name: "Essays", exact: true })).toBeVisible();
  const form = page.getByRole("form", { name: "New essay" });
  await form.getByLabel("Title", { exact: true }).fill(o.title);
  await form.getByLabel("Prompt", { exact: true }).fill(o.prompt);
  await form.getByLabel("Word limit (optional)", { exact: true }).fill(String(o.wordLimit));
  await expect(form.getByLabel("For", { exact: true })).toHaveValue("general");
  await form.getByRole("button", { name: "Create essay", exact: true }).click();
  await page.waitForURL(/\/essays\/[0-9a-f-]{36}$/);
  const id = new URL(page.url()).pathname.split("/")[2];
  if (!id) throw new Error(`No essay id in ${page.url()}`);
  return id;
}

/** Types the whole draft into "Your draft", saves, and waits for "Draft N saved". */
export async function saveDraft(page: Page, text: string, version: number): Promise<void> {
  await page.getByRole("textbox", { name: "Your draft" }).fill(text);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText(`Draft ${version} saved`)).toBeVisible();
}

/** ES-09 from the outside: quotes are the student's own words, and bodies never carry more than 25 new words in a row. */
export function quillProblems(comments: EssayComment[], draft: string): string[] {
  const problems: string[] = [];
  for (const [i, c] of comments.entries()) {
    const n = i + 1;
    if (!draft.includes(c.quote)) problems.push(`Comment ${n} quotes text that isn't in the draft: "${c.quote}"`);
    const integrity = checkIntegrity(c.body, [draft]);
    if (!integrity.ok) problems.push(`Comment ${n} has ${integrity.longestNewRun} new words in a row`);
    const words = countWords(c.body);
    if (words > MAX_COMMENT_WORDS) problems.push(`Comment ${n} is ${words} words`);
  }
  return problems;
}
