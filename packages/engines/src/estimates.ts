import type { College, IncomeRange, LoanEstimate, ScholarshipApplication } from "@scholarcrew/domain";

/**
 * Standard amortized payment: P·r / (1 − (1 + r)^−n), r = pct / 1200, n = 12 · years.
 * monthlyUsd is rounded to whole dollars; totalInterestUsd uses the unrounded payment so 0% loans show $0.
 */
export function estimateLoanPayment(input: {
  principalUsd: number;
  annualRatePct: number;
  years: number;
}): LoanEstimate {
  const { principalUsd, annualRatePct, years } = input;
  const n = 12 * years;
  const r = annualRatePct / 1200;
  let exactMonthly = 0;
  if (principalUsd > 0 && n > 0) {
    if (r === 0) {
      exactMonthly = principalUsd / n;
    } else {
      exactMonthly = (principalUsd * r) / (1 - (1 + r) ** -n);
    }
  }
  return {
    label: `${years}-year standard plan`,
    principalUsd,
    annualRatePct,
    years,
    monthlyUsd: Math.round(exactMonthly),
    totalInterestUsd: Math.max(0, Math.round(exactMonthly * n - principalUsd)),
  };
}

/** Scorecard net price for the income band, else the overall average. Null when a number is missing. */
export function estimateNetPrice(
  college: Pick<College, "costOfAttendanceUsd" | "netPriceByIncome">,
  incomeRange: IncomeRange | null,
): { netPriceUsd: number; costOfAttendanceUsd: number; freeMoneyUsd: number; isEstimate: true } | null {
  const bands = college.netPriceByIncome;
  const net = (incomeRange ? bands[incomeRange] : null) ?? bands.overall;
  const coa = college.costOfAttendanceUsd;
  if (net === null || coa === null) return null;
  return { netPriceUsd: net, costOfAttendanceUsd: coa, freeMoneyUsd: Math.max(0, coa - net), isEstimate: true };
}

/** Year 0 (first year) counts every won award; later years count renewable ones only. */
export function wonScholarshipsForYear(
  apps: Array<Pick<ScholarshipApplication, "stage" | "outcomeUsd" | "outcomeRenewable">>,
  yearIndex: number,
): number {
  if (yearIndex < 0) return 0;
  let total = 0;
  for (const app of apps) {
    if (app.stage !== "won" || app.outcomeUsd === null) continue;
    if (yearIndex >= 1 && app.outcomeRenewable !== true) continue;
    total += app.outcomeUsd;
  }
  return total;
}
