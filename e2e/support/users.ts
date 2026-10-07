import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";
import { BASE_URL } from "./env";

export const SIGN_IN_SUBJECT = /^Your ScholarCrew sign-in link$/;
export const VERIFY_LINK = /https?:\/\/\S+\/api\/v1\/auth\/verify\?token=[A-Za-z0-9_-]+/;

let counter = 0;

/** Short and unique per call and per run. */
export function uniqueTag(): string {
  counter += 1;
  return `${Date.now().toString(36)}${process.pid.toString(36)}${counter}`;
}

export function uniqueEmail(label: string): string {
  return `${label}-${uniqueTag()}@e2e.example.test`;
}

/** A private address per browser context, so plan 06's per-IP sign-in limit never trips. */
export function uniqueIp(): string {
  counter += 1;
  const a = (process.pid % 250) + 1;
  const b = Math.floor(Math.random() * 250) + 1;
  const c = (counter % 250) + 1;
  return `10.${a}.${b}.${c}`;
}

export interface Session {
  context: BrowserContext;
  page: Page;
  email: string;
  ip: string;
}

/** A fresh browser context (no cookies) with its own X-Forwarded-For. */
export async function newSession(
  browser: Browser,
  label: string,
  email: string = uniqueEmail(label),
): Promise<Session> {
  const ip = uniqueIp();
  const context = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { "x-forwarded-for": ip } });
  const page = await context.newPage();
  return { context, page, email: email.toLowerCase(), ip };
}

export interface OutboxEmail {
  subject: string;
  text: string;
}

/** Polls GET /api/v1/dev/outbox/latest?to= until the newest email to `to` has a matching subject. */
export async function latestEmail(page: Page, to: string, subject: RegExp, timeoutMs = 15_000): Promise<OutboxEmail> {
  const last: { email: OutboxEmail | null } = { email: null };
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/v1/dev/outbox/latest?to=${encodeURIComponent(to)}`);
        if (res.status() !== 200) return `outbox returned ${res.status()}`;
        last.email = (await res.json()) as OutboxEmail;
        return last.email.subject;
      },
      { message: `No email to ${to} matching ${subject}`, timeout: timeoutMs, intervals: [250] },
    )
    .toMatch(subject);
  if (!last.email) throw new Error(`No email to ${to} matching ${subject}`);
  return last.email;
}

export function linkFrom(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match) throw new Error(`No link matching ${pattern} in: ${text}`);
  return match[0];
}

/** Flow 1 step 1: the /sign-in page, the check-email page, then the emailed link. */
export async function signInViaUi(s: Session): Promise<void> {
  await s.page.goto("/sign-in");
  await expect(s.page.getByRole("heading", { level: 1, name: "Sign in or create an account" })).toBeVisible();
  await s.page.getByLabel("Email", { exact: true }).fill(s.email);
  await s.page.getByRole("button", { name: "Email me a sign-in link" }).click();
  // Plan 18 keeps the address out of the URL (sessionStorage sc_signin_email) and shows it on the page.
  await expect(s.page).toHaveURL(/\/sign-in\/check-email$/);
  await expect(s.page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
  await expect(s.page.getByText(s.email, { exact: true })).toBeVisible();
  const email = await latestEmail(s.page, s.email, SIGN_IN_SUBJECT);
  await s.page.goto(linkFrom(email.text, VERIFY_LINK));
}

/** Same link, without the sign-in pages: POST /auth/magic-link, then open the emailed link. */
export async function signIn(s: Session): Promise<void> {
  const res = await s.page.request.post("/api/v1/auth/magic-link", {
    headers: { Origin: BASE_URL },
    data: { email: s.email },
  });
  expect(res.status(), "POST /api/v1/auth/magic-link").toBe(204);
  const email = await latestEmail(s.page, s.email, SIGN_IN_SUBJECT);
  await s.page.goto(linkFrom(email.text, VERIFY_LINK));
}
