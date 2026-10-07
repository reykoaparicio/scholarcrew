import { type Page, expect } from "@playwright/test";
import { latestEmail, linkFrom } from "./users";

/** Plan 06's invite email: "<inviter> invited you to their family on ScholarCrew". */
export const INVITE_SUBJECT = /invited you to their family on ScholarCrew$/;
const JOIN_PATH = /\/family\/join\?token=[A-Za-z0-9_-]+/;

/** Plan 16's invite form on /family. Creates the family on the student's first invite. */
export async function inviteFromFamilyPage(page: Page, parentEmail: string): Promise<void> {
  await page.goto("/family");
  await expect(page.getByRole("heading", { level: 1, name: "Family" })).toBeVisible();
  await page.getByLabel("Invite a parent by email", { exact: true }).fill(parentEmail);
  await page.getByRole("button", { name: "Send invite", exact: true }).click();
  await expect(page.getByText(parentEmail, { exact: true })).toBeVisible();
}

/** The /family/join?token=… path from the newest invite email. Read it before signing in (the sign-in email comes next). */
export async function inviteLinkFor(page: Page, email: string): Promise<string> {
  const message = await latestEmail(page, email, INVITE_SUBJECT);
  return linkFrom(message.text, JOIN_PATH);
}

/** D37 signed out: plan 18's InvitePreview names the inviter and role before any account exists. */
export async function previewInviteSignedOut(page: Page, joinPath: string, inviterFirstName: string): Promise<void> {
  await page.goto(joinPath);
  await expect(page.getByRole("heading", { level: 1, name: "You've been invited to a family" })).toBeVisible();
  await expect(page.getByText(`${inviterFirstName} invited you to join as a parent.`, { exact: false })).toBeVisible();
  // PublicChrome's header has its own "Sign in" link, so look inside <main>.
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
}

/** Plan 18's /family/join card: "Accept invite", then /family. */
export async function acceptInvite(page: Page, joinPath: string): Promise<void> {
  await page.goto(joinPath);
  await expect(page.getByRole("heading", { level: 1, name: "Join your family on ScholarCrew" })).toBeVisible();
  await page.getByRole("button", { name: "Accept invite", exact: true }).click();
  await page.waitForURL(/\/family$/);
}
