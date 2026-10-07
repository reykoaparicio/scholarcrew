import { type Browser, type Page, expect } from "@playwright/test";
import type { MeResponse, ThisWeekView } from "@scholarcrew/domain";
import { apiOk } from "./api";
import { type Session, newSession, signIn } from "./users";

export interface StudentProfile {
  displayName: string;
  birthYear: number;
  classYear: number;
  highSchool: string;
  state: string;
  county: string;
  city: string;
  gpa: string;
  majors: string[];
  interests: string[];
}

/** A fictional student. Born 2009, so the 13+ age gate passes in any year this suite runs. */
export const RILEY: StudentProfile = {
  displayName: "Riley",
  birthYear: 2009,
  classYear: 2027,
  highSchool: "Maple High School",
  state: "TX",
  county: "Maple",
  city: "Eastside",
  gpa: "3.6",
  majors: ["Mechanical engineering"],
  interests: ["robotics", "tutoring"],
};

/** Seeded by plan 03's seedDev. */
export const STATE_U = { id: "990001", name: "State U" } as const;

/** Plan 16 step 3 switch names; every one starts off (ON-03). */
export const OPT_IN_SWITCHES = [
  "First in my family to go to college",
  "Household income range",
  "Heritage or ethnicity",
  "Disability",
  "Religion",
  "Military family",
  "Foster care",
  "Only show scholarships open to non-citizens",
] as const;

/** Walks plan 16's five steps on /onboarding and waits for /week. */
export async function completeOnboardingUi(page: Page, p: StudentProfile, collegeNames: string[]): Promise<void> {
  await expect(page.getByText("Step 1 of 5 · About you")).toBeVisible();
  await page.getByLabel("What should we call you?", { exact: true }).fill(p.displayName);
  await page.getByLabel("Birth year", { exact: true }).fill(String(p.birthYear));
  await page.getByLabel("High school graduation year", { exact: true }).fill(String(p.classYear));
  await page.getByLabel("High school", { exact: true }).fill(p.highSchool);
  await page.getByLabel("State", { exact: true }).selectOption(p.state);
  await page.getByLabel("County", { exact: true }).fill(p.county);
  await page.getByLabel("City (optional)", { exact: true }).fill(p.city);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Grades and interests" })).toBeVisible();
  await page.getByLabel("Unweighted GPA (optional)", { exact: true }).fill(p.gpa);
  await page.getByLabel("Intended majors", { exact: true }).fill(p.majors.join(", "));
  await page.getByLabel("Interests", { exact: true }).fill(p.interests.join(", "));
  await page.getByRole("button", { name: "Continue to opt-ins" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Choose what the matcher can use" })).toBeVisible();
  for (const name of OPT_IN_SWITCHES) {
    await expect(page.getByRole("switch", { name, exact: true })).not.toBeChecked();
  }
  await page.getByRole("button", { name: "Continue to uploads" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Starter uploads" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to colleges" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Colleges and family" })).toBeVisible();
  for (const name of collegeNames) {
    await page.getByLabel("Search colleges", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: `Add ${name}`, exact: true }).click();
    await expect(page.getByRole("button", { name: `Remove ${name}`, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL(/\/week$/);
}

/** POST /api/v1/onboarding with RILEY's answers. The page must be on an app page. */
export async function onboardViaApi(
  page: Page,
  o: { displayName?: string; collegeIds?: string[] } = {},
): Promise<MeResponse> {
  return apiOk<MeResponse>(page, "POST", "/onboarding", {
    displayName: o.displayName ?? RILEY.displayName,
    birthYear: RILEY.birthYear,
    classYear: RILEY.classYear,
    highSchool: RILEY.highSchool,
    state: RILEY.state,
    county: RILEY.county,
    city: RILEY.city,
    gpaUnweighted: Number(RILEY.gpa),
    intendedMajors: RILEY.majors,
    interests: RILEY.interests,
    timeZone: "America/Chicago",
    collegeIds: o.collegeIds ?? [],
    sensitive: [],
  });
}

export interface Student extends Session {
  me: MeResponse;
}

/**
 * Onboarding queues the first plan.weekly (a weekly_plan crew job) and sweep.student. Waits until no crew job is
 * queued or working, so a spec's own plan items can't race the first plan's replaceGeneratedPlan.
 */
export async function waitForFirstPlan(page: Page): Promise<void> {
  await expect
    .poll(async () => (await apiOk<ThisWeekView>(page, "GET", "/plan/this-week")).crewWorking, {
      message: "The onboarding plan.weekly job didn't finish",
      timeout: 120_000,
      intervals: [1_000],
    })
    .toBe(false);
}

/** A signed-in student who finished onboarding through the API and whose first plan is done. The page is left on /onboarding's URL. */
export async function signUpStudent(
  browser: Browser,
  label: string,
  o: { displayName?: string; collegeIds?: string[] } = {},
): Promise<Student> {
  const s = await newSession(browser, label);
  await signIn(s);
  await expect(s.page).toHaveURL(/\/onboarding$/);
  const me = await onboardViaApi(s.page, o);
  expect(me.onboardingComplete).toBe(true);
  await waitForFirstPlan(s.page);
  return { ...s, me };
}
