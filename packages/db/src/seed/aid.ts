import type { FederalLoanRates } from "@scholarcrew/domain";
import { and, inArray } from "drizzle-orm";
import type { DbOrTx } from "../client";
import { aidDeadlines, aidRules } from "../schema";
import { at } from "./util";

export const SAMPLE_AID_YEARS = ["2026-27", "2027-28"] as const;
export const SAMPLE_AID_NOTE = "Sample data for development. Check the source before relying on it.";
const SAMPLE_PROGRAMS = ["FAFSA", "TEXAS Grant priority"];
const VERIFIED_AT = at("2026-10-01T15:00:00.000Z");

// SAMPLE DATA for development: not verified rates or deadlines for these award years.
// The published 2025-26 federal rates, reused as samples. Admins maintain real values at /admin/aid.
const SAMPLE_LOAN_RATES: FederalLoanRates = { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 };

/** "2027-28" → [2027, 2028]. */
function calendarYears(awardYear: string): [number, number] {
  const first = Number(awardYear.slice(0, 4));
  return [first, first + 1];
}

/** Upserts the sample loan-rate rules and replaces the sample deadlines, so a second run adds no rows. */
export async function seedAid(db: DbOrTx): Promise<void> {
  for (const awardYear of SAMPLE_AID_YEARS) {
    // SAMPLE DATA for development: not verified rates or deadlines for these award years.
    const rule = {
      awardYear,
      key: "federal_loan_rates",
      value: SAMPLE_LOAN_RATES,
      sourceUrl: "https://studentaid.gov/understand-aid/types/loans/interest-rates",
      verifiedAt: VERIFIED_AT,
    };
    await db
      .insert(aidRules)
      .values(rule)
      .onConflictDoUpdate({
        target: [aidRules.awardYear, aidRules.key],
        set: { value: rule.value, sourceUrl: rule.sourceUrl, verifiedAt: rule.verifiedAt },
      });
  }

  await db
    .delete(aidDeadlines)
    .where(and(inArray(aidDeadlines.awardYear, [...SAMPLE_AID_YEARS]), inArray(aidDeadlines.program, SAMPLE_PROGRAMS)));
  await db.insert(aidDeadlines).values(
    SAMPLE_AID_YEARS.flatMap((awardYear) => {
      const [first, second] = calendarYears(awardYear);
      // SAMPLE DATA for development: not verified rates or deadlines for these award years.
      return [
        {
          awardYear,
          state: null,
          program: "FAFSA",
          deadline: `${second}-06-30`,
          note: SAMPLE_AID_NOTE,
          sourceUrl: "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines",
          verifiedAt: VERIFIED_AT,
        },
        {
          awardYear,
          state: "TX",
          program: "TEXAS Grant priority",
          deadline: `${first}-01-15`,
          note: SAMPLE_AID_NOTE,
          sourceUrl: "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines",
          verifiedAt: VERIFIED_AT,
        },
      ];
    }),
  );
}
