import { IsoDate, OfferLineCategory, Usd } from "@scholarcrew/domain";
import {
  compareOffers,
  computeGap,
  countChars,
  countWords,
  daysUntil,
  estimateLoanPayment,
} from "@scholarcrew/engines";
import { z } from "zod";
import type { ToolDef } from "../model/types";

export interface CalculatorOptions {
  now: () => Date;
  timeZone: string;
  /** Called once per calculation; returns the "calc:<n>" id the reply cites in its receipt. */
  register: (toolName: string) => string;
}

export const CALCULATOR_NAMES = [
  "ledger_gap",
  "ledger_compare_offers",
  "ledger_loan_payment",
  "count_words",
  "days_until",
] as const;

const GapInput = z.strictObject({ costOfAttendanceUsd: Usd, freeMoneyUsd: Usd, pendingUsd: Usd });

const CompareInput = z.strictObject({
  offers: z
    .array(
      z.strictObject({
        offerId: z.string().min(1).max(64),
        collegeId: z.string().min(1).max(12),
        collegeName: z.string().min(1).max(200),
        costOfAttendanceUsd: Usd,
        lines: z.array(z.strictObject({ amountUsd: Usd, category: OfferLineCategory, renewable: z.boolean() })).max(40),
      }),
    )
    .min(1)
    .max(4),
});

const LoanInput = z.strictObject({
  principalUsd: Usd,
  annualRatePct: z.number().min(0).max(30),
  years: z.number().int().min(1).max(30),
});

const WordsInput = z.strictObject({ text: z.string().max(50_000) });
const DaysInput = z.strictObject({ date: IsoDate });

/** Money and count math for Compass (product rule 4: the model explains, code computes). */
export function createCalculatorTools(o: CalculatorOptions): ToolDef[] {
  const gap: ToolDef<z.infer<typeof GapInput>> = {
    name: "ledger_gap",
    description:
      "Ledger's gap math: cost of attendance minus free money, and the gap if pending applications win. Use it for any gap you state.",
    input: GapInput,
    run: async (i) => ({ calcId: o.register("ledger_gap"), ...computeGap(i) }),
  };
  const compare: ToolDef<z.infer<typeof CompareInput>> = {
    name: "ledger_compare_offers",
    description:
      "Ledger's award-letter comparison: free money, loans, work-study, what each school really costs, and the four-year total.",
    input: CompareInput,
    run: async (i) => ({ calcId: o.register("ledger_compare_offers"), ...compareOffers(i.offers) }),
  };
  const loan: ToolDef<z.infer<typeof LoanInput>> = {
    name: "ledger_loan_payment",
    description:
      "Ledger's loan estimate: monthly payment and total interest for a principal, annual rate, and term in years.",
    input: LoanInput,
    run: async (i) => ({ calcId: o.register("ledger_loan_payment"), ...estimateLoanPayment(i) }),
  };
  const words: ToolDef<z.infer<typeof WordsInput>> = {
    name: "count_words",
    description: "Count the words and characters in a piece of text, for essay and form limits.",
    input: WordsInput,
    run: async (i) => ({ calcId: o.register("count_words"), words: countWords(i.text), chars: countChars(i.text) }),
  };
  const days: ToolDef<z.infer<typeof DaysInput>> = {
    name: "days_until",
    description:
      "Calendar days from today until a date (YYYY-MM-DD) in the student's time zone. Negative means it has passed.",
    input: DaysInput,
    run: async (i) => ({ calcId: o.register("days_until"), days: daysUntil(i.date, o.now(), o.timeZone) }),
  };
  return [gap, compare, loan, words, days];
}
