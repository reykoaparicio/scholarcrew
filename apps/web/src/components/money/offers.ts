import { usd } from "@/lib/format";
import type { CostSummary, OfferColumn, OfferLine, OfferLineCategory, OfferStatus } from "@scholarcrew/domain";

export const CATEGORY_LABEL: Record<OfferLineCategory, string> = {
  grant: "Grant (free)",
  scholarship: "Scholarship (free)",
  work_study: "Work-study (you earn it)",
  loan_federal_subsidized: "Federal subsidized loan",
  loan_federal_unsubsidized: "Federal unsubsidized loan",
  loan_parent_plus: "Parent PLUS loan",
  loan_private: "Private loan",
  other: "Other",
};

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  uploaded: "Uploaded",
  parsing: "Aid is reading it",
  needs_review: "Ready for your review",
  confirmed: "Confirmed",
  failed: "Couldn't read it",
};

// R3V-8: free money is 02's `FREE_CATEGORIES` (imported where it's used), not a copy here.
export const WORK: OfferLineCategory[] = ["work_study"];
export const LOANS: OfferLineCategory[] = [
  "loan_federal_subsidized",
  "loan_federal_unsubsidized",
  "loan_parent_plus",
  "loan_private",
];

/** One shared axis for every bar, rounded up to the next $20k. */
export function axisMaxFor(columns: Array<Pick<OfferColumn, "costOfAttendanceUsd">>): number {
  const max = Math.max(0, ...columns.map((c) => c.costOfAttendanceUsd));
  return Math.max(20000, Math.ceil(max / 20000) * 20000);
}

/** The words after each bar: one-time grants make later years cost more. */
export function endParts(c: Pick<OfferColumn, "reallyCostsUsd" | "oneTimeFreeUsd">): { amount: string; rest: string } {
  if (c.oneTimeFreeUsd > 0) {
    return {
      amount: usd(c.reallyCostsUsd),
      rest: `this year, then ${usd(c.reallyCostsUsd + c.oneTimeFreeUsd)} a year after`,
    };
  }
  return { amount: usd(c.reallyCostsUsd), rest: "really costs you" };
}

/** MO-07: the first letter page behind a group of lines, with the cited text. */
export function pageChip(
  lines: Array<Pick<OfferLine, "category" | "page" | "citedText">>,
  categories: OfferLineCategory[],
): { label: string; citedText: string } | null {
  const hit = lines
    .filter((l) => categories.includes(l.category) && l.page !== null)
    .sort((a, b) => (a.page ?? 0) - (b.page ?? 0))[0];
  return hit && hit.page !== null ? { label: `p.${hit.page}`, citedText: hit.citedText } : null;
}

export function sourceLine(c: Pick<CostSummary, "sourceLabel" | "isEstimate">): string {
  return c.isEstimate ? `${c.sourceLabel} · estimate` : c.sourceLabel;
}

export function pendingLine(c: Pick<CostSummary, "pendingUsd" | "gapIfPendingWinUsd">): string | null {
  if (c.pendingUsd <= 0) return null;
  return `${usd(c.pendingUsd)} in pending applications · gap ${usd(c.gapIfPendingWinUsd)} if they come through`;
}

/** MO-10: the parent's shared yearly budget and what's left after it. */
export function budgetLine(c: Pick<CostSummary, "budgetUsd" | "gapAfterBudgetUsd">): string | null {
  if (c.budgetUsd === null) return null;
  const after = c.gapAfterBudgetUsd ?? 0;
  return `Family budget ${usd(c.budgetUsd)}/yr · ${after > 0 ? `${usd(after)} left after it` : "covers the gap"}`;
}
