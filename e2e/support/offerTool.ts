import { type Locator, type Page, expect } from "@playwright/test";
import type { OfferLineCategory, PublicOfferInput } from "@scholarcrew/domain";

/** Two schools, one renewable and one year-1-only grant, so the four-year numbers differ from 4 x year 1. */
export const TOOL_INPUT: PublicOfferInput = {
  offers: [
    {
      name: "State U",
      costOfAttendanceUsd: 27_800,
      lines: [
        { label: "Pell Grant", amountUsd: 7_395, category: "grant", renewable: true },
        { label: "Direct Subsidized Loan", amountUsd: 3_500, category: "loan_federal_subsidized", renewable: false },
      ],
    },
    {
      name: "Riverside College",
      costOfAttendanceUsd: 31_200,
      lines: [
        { label: "Riverside Welcome Grant", amountUsd: 6_000, category: "grant", renewable: false },
        { label: "Riverside Merit Scholarship", amountUsd: 12_000, category: "scholarship", renewable: true },
      ],
    },
  ],
};

/** Plan 18's "Line type" option labels. */
const LINE_TYPE_LABELS: Record<OfferLineCategory, string> = {
  grant: "Grant",
  scholarship: "Scholarship",
  work_study: "Work-study",
  loan_federal_subsidized: "Federal loan (subsidized)",
  loan_federal_unsubsidized: "Federal loan (unsubsidized)",
  loan_parent_plus: "Parent PLUS loan",
  loan_private: "Private loan",
  other: "Other",
};

async function setSwitch(toggle: Locator, on: boolean): Promise<void> {
  const checked = (await toggle.getAttribute("aria-checked")) === "true";
  if (checked !== on) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", on ? "true" : "false");
}

/** The tool starts with two schools of one empty line each (plan 18). */
export async function fillOfferTool(page: Page, input: PublicOfferInput): Promise<void> {
  for (const [i, school] of input.offers.entries()) {
    const n = i + 1;
    if (n > 2) await page.getByRole("button", { name: "Add a school", exact: true }).click();
    const group = page.getByRole("group", { name: `School ${n}`, exact: true });
    await group.getByLabel("School name", { exact: true }).fill(school.name);
    await group.getByLabel("Cost of attendance per year", { exact: true }).fill(String(school.costOfAttendanceUsd));
    for (const [j, line] of school.lines.entries()) {
      if (j > 0) await group.getByRole("button", { name: "Add a line", exact: true }).click();
      await group
        .getByLabel("Line type", { exact: true })
        .nth(j)
        .selectOption({ label: LINE_TYPE_LABELS[line.category] });
      await group.getByLabel("Label", { exact: true }).nth(j).fill(line.label);
      await group.getByLabel("Amount", { exact: true }).nth(j).fill(String(line.amountUsd));
      await setSwitch(group.getByRole("switch", { name: "Renews each year", exact: true }).nth(j), line.renewable);
    }
  }
}
