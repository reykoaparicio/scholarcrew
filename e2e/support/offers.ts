import type { OfferColumn, OfferLineCategory } from "@scholarcrew/domain";
import { compareOffers } from "@scholarcrew/engines";

export interface DemoLine {
  label: string;
  amountUsd: number;
  category: OfferLineCategory;
  renewable: boolean;
}

/** Plan 12's DEMO_OFFER, line for line. */
export const DEMO_OFFER_COA = 27_800;
export const DEMO_OFFER_LINES: DemoLine[] = [
  { label: "Federal Pell Grant", amountUsd: 7_395, category: "grant", renewable: true },
  { label: "State U Opportunity Grant", amountUsd: 8_205, category: "grant", renewable: true },
  { label: "State U Merit Award", amountUsd: 3_000, category: "scholarship", renewable: true },
  { label: "Federal Work-Study", amountUsd: 2_000, category: "work_study", renewable: false },
  { label: "Direct Subsidized Loan", amountUsd: 3_500, category: "loan_federal_subsidized", renewable: false },
  { label: "Direct Unsubsidized Loan", amountUsd: 2_000, category: "loan_federal_unsubsidized", renewable: false },
];

/** Any PDF bytes work: the demo parser never reads them, but the worker checks the mime type. */
export const PDF_LETTER = "%PDF-1.4\n% ScholarCrew e2e award letter\n";

/** What Ledger should show for the demo letter, computed by plan 04's engine. */
export function expectedDemoColumn(offerId: string, collegeId: string, collegeName: string): OfferColumn {
  const result = compareOffers([
    {
      offerId,
      collegeId,
      collegeName,
      costOfAttendanceUsd: DEMO_OFFER_COA,
      lines: DEMO_OFFER_LINES.map((l) => ({ amountUsd: l.amountUsd, category: l.category, renewable: l.renewable })),
    },
  ]);
  const column = result.columns[0];
  if (!column) throw new Error("compareOffers returned no column");
  return column;
}

/** Plan 16's usd(): "$9,200". */
export function usd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}
