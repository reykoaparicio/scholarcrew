import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";
import { type EligibilityRule, type Scholarship, awardYearFor } from "@scholarcrew/domain";
import { apiOk } from "./api";
import { BASE_URL } from "./env";
import { type Session, newSession, signIn, uniqueIp, uniqueTag } from "./users";

/** Plan 03 seedDev's admin (gap G1: no other way to get an admin in e2e). */
export const SEED_ADMIN_EMAIL = "admin@example.com";

/** Cookies from one admin sign-in, as Playwright's storageState. */
export type AdminState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/**
 * Signs the seeded admin in once and keeps the session cookie. Admins land on /admin/tasks: verify sends them
 * to /week, the (app) layout sends admins to /admin. support/fixtures.ts calls this once per Playwright worker.
 */
export async function signInAdminState(browser: Browser): Promise<AdminState> {
  const s = await newSession(browser, "admin", SEED_ADMIN_EMAIL);
  await signIn(s);
  await expect(s.page).toHaveURL(/\/admin\/tasks/);
  const state = await s.context.storageState();
  await s.context.close();
  return state;
}

/** A fresh admin context from the saved sign-in, with its own X-Forwarded-For, already on /admin/tasks. */
export async function adminSession(browser: Browser, state: AdminState): Promise<Session> {
  const ip = uniqueIp();
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: state,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await context.newPage();
  await page.goto("/admin/tasks");
  await expect(page).toHaveURL(/\/admin\/tasks/);
  return { context, page, email: SEED_ADMIN_EMAIL, ip };
}

export function isoDaysFromNow(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Plan 06's currentSeason (packages/core/src/shared/dates.ts, Aug 1 rollover): 2026-10-06 is "2026-27".
 * Copied, not imported: @scholarcrew/core/shared also loads the test deps, email senders, and the Stripe fake.
 */
export function seasonOn(now: Date): string {
  const y = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * Plan 06's currentAwardYear (R3V-7): the award year of the current season, through 02's awardYearFor.
 * Aug 1 rollover, like seasonOn: 2026-07-31 is "2026-27", 2026-08-01 and 2026-10-06 are "2027-28".
 */
export function awardYearOn(now: Date): string {
  return awardYearFor(seasonOn(now));
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uniqueListingName(base: string): string {
  return `${base} ${uniqueTag()}`;
}

export interface ListingInput {
  name: string;
  amountUsd: number;
  deadline: string;
  eligibility?: EligibilityRule[];
}

/** POST /admin/scholarships (a draft), then POST /admin/scholarships/:id/status to publish it. Texas, public. */
export async function publishScholarship(admin: Page, o: ListingInput): Promise<Scholarship> {
  const slug = slugify(o.name);
  const url = `https://example.org/e2e/${slug}`;
  const created = await apiOk<Scholarship>(admin, "POST", "/admin/scholarships", {
    id: null,
    slug,
    name: o.name,
    provider: "E2E Community Foundation",
    url,
    sourceUrl: url,
    amountMinUsd: o.amountUsd,
    amountMaxUsd: o.amountUsd,
    renewable: false,
    renewalTerms: "",
    deadline: o.deadline,
    cycle: seasonOn(new Date()),
    localArea: { national: false, state: "TX", counties: [], cities: [] },
    eligibility: o.eligibility ?? [{ type: "state_in", states: ["TX"] }],
    requirements: {
      essays: [{ prompt: "Tell us about a project you led.", wordLimit: 300 }],
      recommendations: 0,
      transcript: false,
      serviceHours: null,
      other: [],
    },
    estMinutes: 45,
    scamFlags: [],
  });
  return apiOk<Scholarship>(admin, "POST", `/admin/scholarships/${created.id}/status`, {
    status: "published",
    note: "Checked against the sponsor page.",
  });
}
