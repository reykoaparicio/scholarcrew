import { z } from "zod";
import { AwardYear, HttpUrl, Id, IsoDate, IsoDateTime, USState, Usd } from "./common";

export const CostSource = z.enum(["scorecard", "calculator", "offer"]);
export type CostSource = z.infer<typeof CostSource>;

export const CostSummary = z.strictObject({
  collegeId: z.string(),
  collegeName: z.string(),
  source: CostSource,
  sourceLabel: z.string(),
  costOfAttendanceUsd: Usd,
  freeMoneyUsd: Usd,
  gapUsd: Usd,
  pendingUsd: Usd,
  gapIfPendingWinUsd: Usd,
  isEstimate: z.boolean(),
  budgetUsd: Usd.nullable(),
  gapAfterBudgetUsd: Usd.nullable(),
});
export type CostSummary = z.infer<typeof CostSummary>;

export const CalculatorResultInput = z.strictObject({
  collegeId: z.string().min(1).max(12),
  costOfAttendanceUsd: Usd.max(200_000),
  grantsUsd: Usd.max(200_000),
});
export type CalculatorResultInput = z.infer<typeof CalculatorResultInput>;

export const OfferStatus = z.enum(["uploaded", "parsing", "needs_review", "confirmed", "failed"]);
export type OfferStatus = z.infer<typeof OfferStatus>;

export const OFFER_LINE_CATEGORIES = [
  "grant",
  "scholarship",
  "work_study",
  "loan_federal_subsidized",
  "loan_federal_unsubsidized",
  "loan_parent_plus",
  "loan_private",
  "other",
] as const;
export const OfferLineCategory = z.enum(OFFER_LINE_CATEGORIES);
export type OfferLineCategory = z.infer<typeof OfferLineCategory>;
export const FREE_CATEGORIES: OfferLineCategory[] = ["grant", "scholarship"];
export const LOAN_CATEGORIES: OfferLineCategory[] = [
  "loan_federal_subsidized",
  "loan_federal_unsubsidized",
  "loan_parent_plus",
  "loan_private",
];

export const Offer = z.strictObject({
  id: Id,
  collegeId: z.string(),
  collegeName: z.string(),
  awardYear: AwardYear,
  documentId: Id.nullable(),
  status: OfferStatus,
  costOfAttendanceUsd: Usd.nullable(),
  createdAt: IsoDateTime,
  confirmedAt: IsoDateTime.nullable(),
  /** Newest `offer_parse` crew job for this offer, so the UI can follow its events (D31). */
  parseJobId: Id.nullable(),
});
export type Offer = z.infer<typeof Offer>;

export const OfferLine = z.strictObject({
  id: Id,
  offerId: Id,
  position: z.number().int().min(0),
  label: z.string(),
  amountUsd: Usd,
  category: OfferLineCategory,
  renewable: z.boolean(),
  renewalCondition: z.string(),
  page: z.number().int().nullable(),
  citedText: z.string(),
  userCorrected: z.boolean(),
});
export type OfferLine = z.infer<typeof OfferLine>;

export const OfferWithLines = Offer.extend({ lines: z.array(OfferLine) });
export type OfferWithLines = z.infer<typeof OfferWithLines>;

export const CreateOfferInput = z.strictObject({
  collegeId: z.string().min(1).max(12),
  documentId: Id,
  awardYear: AwardYear,
});
export type CreateOfferInput = z.infer<typeof CreateOfferInput>;

export const OfferLinePatch = z.strictObject({
  label: z.string().min(1).max(120).optional(),
  amountUsd: Usd.max(200_000).optional(),
  category: OfferLineCategory.optional(),
  renewable: z.boolean().optional(),
});
export type OfferLinePatch = z.infer<typeof OfferLinePatch>;

/** What the offer parser (Aid) returns for one letter line. */
export const ParsedOfferLine = z.strictObject({
  label: z.string().min(1).max(120),
  amountUsd: Usd.max(200_000),
  category: OfferLineCategory,
  renewable: z.boolean(),
  renewalCondition: z.string().max(200),
  page: z.number().int().min(1).nullable(),
  citedText: z.string().max(300),
});
export type ParsedOfferLine = z.infer<typeof ParsedOfferLine>;

export const ParsedOffer = z.strictObject({
  costOfAttendanceUsd: Usd.max(200_000).nullable(),
  awardYear: AwardYear.nullable(),
  lines: z.array(ParsedOfferLine).max(40),
});
export type ParsedOffer = z.infer<typeof ParsedOffer>;

export const OfferColumn = z.strictObject({
  offerId: z.string(),
  collegeId: z.string(),
  collegeName: z.string(),
  costOfAttendanceUsd: Usd,
  freeMoneyUsd: Usd,
  workStudyUsd: Usd,
  loansUsd: Usd,
  letterSaysOweUsd: Usd,
  reallyCostsUsd: Usd,
  fourYearUsd: Usd,
  oneTimeFreeUsd: Usd,
  warnings: z.array(z.string()),
});
export type OfferColumn = z.infer<typeof OfferColumn>;

export const OfferComparison = z.strictObject({
  columns: z.array(OfferColumn),
  lowestFourYearOfferId: z.string().nullable(),
  assumptions: z.array(z.string()),
});
export type OfferComparison = z.infer<typeof OfferComparison>;

export const LoanEstimate = z.strictObject({
  label: z.string(),
  principalUsd: Usd,
  annualRatePct: z.number().min(0).max(30),
  years: z.number().int().min(1).max(30),
  monthlyUsd: Usd,
  totalInterestUsd: Usd,
});
export type LoanEstimate = z.infer<typeof LoanEstimate>;

export const PublicOfferInput = z.strictObject({
  offers: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(120),
        costOfAttendanceUsd: Usd.max(200_000),
        lines: z
          .array(
            z.strictObject({
              label: z.string().min(1).max(120),
              amountUsd: Usd.max(200_000),
              category: OfferLineCategory,
              renewable: z.boolean(),
            }),
          )
          .max(30),
      }),
    )
    .min(1)
    .max(4),
});
export type PublicOfferInput = z.infer<typeof PublicOfferInput>;

/**
 * Aid rules and deadlines maintained by admins at /admin/aid (R2P-1). Dev data comes from the
 * marked sample seed in plan 03. Rates are percentages (6.39 means 6.39%).
 */
export const FederalLoanRates = z.strictObject({
  subsidized: z.number().min(0).max(30),
  unsubsidized: z.number().min(0).max(30),
  parent_plus: z.number().min(0).max(30),
});
export type FederalLoanRates = z.infer<typeof FederalLoanRates>;

export const AidRuleKey = z.enum(["federal_loan_rates"]);
export type AidRuleKey = z.infer<typeof AidRuleKey>;

export const AidRule = z.strictObject({
  id: Id,
  awardYear: AwardYear,
  key: AidRuleKey,
  value: FederalLoanRates,
  sourceUrl: HttpUrl,
  verifiedAt: IsoDateTime,
});
export type AidRule = z.infer<typeof AidRule>;

export const AidRuleInput = z.strictObject({
  awardYear: AwardYear,
  key: AidRuleKey,
  value: FederalLoanRates,
  sourceUrl: HttpUrl,
});
export type AidRuleInput = z.infer<typeof AidRuleInput>;

/** Insert when `id` is missing, update otherwise. `state: null` is a federal deadline. */
export const AidDeadlineInput = z.strictObject({
  id: Id.optional(),
  awardYear: AwardYear,
  state: USState.nullable(),
  program: z.string().trim().min(1).max(80),
  deadline: IsoDate.nullable(),
  note: z.string().max(300).default(""),
  sourceUrl: HttpUrl,
});
export type AidDeadlineInput = z.infer<typeof AidDeadlineInput>;
