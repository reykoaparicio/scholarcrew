import { expect, test } from "@playwright/test";
import type { CollegeListEntry, MeResponse, ThisWeekView } from "@scholarcrew/domain";
import { apiOk } from "../support/api";
import { setCollegeSeason } from "../support/db";
import { RILEY, STATE_U, completeOnboardingUi } from "../support/onboarding";
import { newSession, signInViaUi } from "../support/users";

test("flow 1: sign in, five onboarding steps, then This week fills in (ON-01..ON-06, WK-01)", async ({ browser }) => {
  const s = await newSession(browser, "onboard");
  await signInViaUi(s);
  await expect(s.page).toHaveURL(/\/onboarding$/);

  await completeOnboardingUi(s.page, RILEY, [STATE_U.name]);
  await expect(s.page).toHaveURL(/\/week$/);
  await expect(s.page.getByRole("heading", { level: 1 })).toContainText(`${RILEY.displayName}.`);

  // "Your crew is working" (if the jobs haven't finished yet) gives way to Compass's first plan.
  // The checkboxes are PlanList's, inside the "This week" card (plan 16's Card is a <section> with an h2).
  const planCard = s.page.locator("section", {
    has: s.page.getByRole("heading", { level: 2, name: "This week", exact: true }),
  });
  await expect
    .poll(
      async () => {
        await s.page.reload();
        return planCard.getByRole("checkbox").count();
      },
      { timeout: 150_000, intervals: [5_000] },
    )
    .toBeGreaterThanOrEqual(2);
  await expect(s.page.getByRole("heading", { name: "Your crew is working", exact: true })).toBeHidden();
  await expect(s.page.getByRole("heading", { level: 2, name: "This week", exact: true })).toBeVisible();
  // R2C-5: a student viewing their own week can ask for a new plan (plan 16's PlanWeekButton).
  await expect(s.page.getByRole("button", { name: "Plan my week", exact: true })).toBeVisible();

  const view = await apiOk<ThisWeekView>(s.page, "GET", "/plan/this-week");
  expect(view.plan.items.length).toBeGreaterThanOrEqual(2);
  const me = await apiOk<MeResponse>(s.page, "GET", "/me");
  expect(me.onboardingComplete).toBe(true);
  expect(me.profile?.state).toBe("TX");
  const list = await apiOk<CollegeListEntry[]>(s.page, "GET", "/college-list");
  expect(list.map((e) => e.collegeId)).toEqual([STATE_U.id]);
  const entry = list[0];
  if (!entry) throw new Error("Expected college entry");
  await setCollegeSeason(entry.id, "2025-26");
  await s.page.goto("/colleges");
  await expect(s.page.getByText(STATE_U.name, { exact: true }).first()).toBeVisible();
  const afterRollover = await apiOk<ThisWeekView>(s.page, "GET", "/plan/this-week");
  expect(afterRollover.gap?.collegeId).toBe(STATE_U.id);
  await s.context.close();
});
