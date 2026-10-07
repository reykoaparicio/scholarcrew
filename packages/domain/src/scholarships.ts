import { z } from "zod";
import { HttpUrl, Id, IsoDate, IsoDateTime, USState, Usd } from "./common";
import { IncomeRange } from "./memory";

export const CatalogStatus = z.enum(["draft", "published", "stale", "retired", "flagged"]);
export type CatalogStatus = z.infer<typeof CatalogStatus>;

export const ListingVisibility = z.enum(["public", "submitter_only"]);
export type ListingVisibility = z.infer<typeof ListingVisibility>;

export const ScamFlag = z.enum([
  "application_fee",
  "guaranteed_award",
  "bank_or_card_request",
  "ssn_request",
  "sweepstakes",
  "unsolicited_winner",
  "pay_for_info",
]);
export type ScamFlag = z.infer<typeof ScamFlag>;
export const SCAM_FLAG_TEXT: Record<ScamFlag, string> = {
  application_fee: "Charges a fee to apply. Real scholarships don't charge you to apply.",
  guaranteed_award: "Promises a guaranteed award.",
  bank_or_card_request: "Asks for a bank account or card number.",
  ssn_request: "Asks for a Social Security number up front.",
  sweepstakes: "Works like a sweepstakes or marketing list.",
  unsolicited_winner: "Says you won something you never applied for.",
  pay_for_info: "Sells scholarship information you can get free.",
};

export const LocalArea = z.strictObject({
  national: z.boolean(),
  state: USState.nullable(),
  counties: z.array(z.string().min(1).max(100)).max(50).default([]),
  cities: z.array(z.string().min(1).max(100)).max(50).default([]),
});
export type LocalArea = z.infer<typeof LocalArea>;

export const EligibilityRule = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("state_in"), states: z.array(USState).min(1) }),
  z.strictObject({ type: z.literal("county_in"), state: USState, counties: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ type: z.literal("city_in"), state: USState, cities: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ type: z.literal("class_year_in"), years: z.array(z.number().int().min(2020).max(2040)).min(1) }),
  z.strictObject({ type: z.literal("gpa_min"), min: z.number().min(0).max(5) }),
  z.strictObject({ type: z.literal("major_any"), majors: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ type: z.literal("interest_any"), interests: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ type: z.literal("first_gen") }),
  z.strictObject({ type: z.literal("income_max"), maxRange: IncomeRange }),
  z.strictObject({ type: z.literal("heritage_any"), values: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ type: z.literal("disability") }),
  z.strictObject({ type: z.literal("religion_any"), values: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ type: z.literal("military_family") }),
  z.strictObject({ type: z.literal("foster_care") }),
  z.strictObject({ type: z.literal("citizenship_required") }),
  z.strictObject({ type: z.literal("test_min"), test: z.enum(["ACT", "SAT"]), min: z.number().int().min(1) }),
  z.strictObject({ type: z.literal("service_hours_min"), hours: z.number().int().min(1) }),
  z.strictObject({ type: z.literal("custom"), text: z.string().min(1).max(300) }),
]);
export type EligibilityRule = z.infer<typeof EligibilityRule>;
export type EligibilityRuleType = EligibilityRule["type"];

export const SENSITIVE_RULE_TYPES = [
  "first_gen",
  "income_max",
  "heritage_any",
  "disability",
  "religion_any",
  "military_family",
  "foster_care",
] as const;

export const EssayRequirement = z.strictObject({
  prompt: z.string().min(1).max(4000),
  wordLimit: z.number().int().min(1).max(5000).nullable(),
});
export type EssayRequirement = z.infer<typeof EssayRequirement>;

export const ScholarshipRequirements = z.strictObject({
  essays: z.array(EssayRequirement).max(10),
  recommendations: z.number().int().min(0).max(10),
  transcript: z.boolean(),
  serviceHours: z.number().int().min(1).nullable(),
  other: z.array(z.string().max(200)).max(10),
});
export type ScholarshipRequirements = z.infer<typeof ScholarshipRequirements>;

export const Scholarship = z.strictObject({
  id: Id,
  slug: z.string(),
  name: z.string(),
  provider: z.string(),
  url: HttpUrl,
  sourceUrl: HttpUrl,
  amountMinUsd: Usd,
  amountMaxUsd: Usd,
  renewable: z.boolean(),
  renewalTerms: z.string(),
  deadline: IsoDate.nullable(),
  cycle: z.string(),
  localArea: LocalArea,
  eligibility: z.array(EligibilityRule),
  requirements: ScholarshipRequirements,
  status: CatalogStatus,
  visibility: ListingVisibility,
  submittedById: Id.nullable(),
  scamFlags: z.array(ScamFlag),
  estMinutes: z.number().int(),
  verifiedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Scholarship = z.infer<typeof Scholarship>;

export const ScholarshipSummary = z.strictObject({
  id: Id,
  slug: z.string(),
  name: z.string(),
  provider: z.string(),
  amountMinUsd: Usd,
  amountMaxUsd: Usd,
  renewable: z.boolean(),
  deadline: IsoDate.nullable(),
  localLabel: z.string(),
  status: CatalogStatus,
  verifiedAt: IsoDateTime.nullable(),
  scamFlags: z.array(ScamFlag),
  unverified: z.boolean(),
  estMinutes: z.number().int(),
});
export type ScholarshipSummary = z.infer<typeof ScholarshipSummary>;

export const ApplicationStage = z.enum(["matched", "planned", "drafting", "submitted", "won", "lost", "skipped"]);
export type ApplicationStage = z.infer<typeof ApplicationStage>;

/** The one label per stage that every screen shows (R3V-8). `planned` and `drafting` read the same to the student. */
export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
  matched: "Matched",
  planned: "Working on",
  drafting: "Working on",
  submitted: "Submitted",
  won: "Won",
  lost: "Didn't win",
  skipped: "Skipped",
};

export const MatchReason = z.strictObject({
  code: z.string().max(40),
  text: z.string().max(140),
  sensitive: z.boolean(),
});
export type MatchReason = z.infer<typeof MatchReason>;
export function hasSensitiveReason(reasons: MatchReason[]): boolean {
  return reasons.some((reason) => reason.sensitive);
}

export const ScholarshipApplication = z.strictObject({
  id: Id,
  scholarshipId: Id,
  stage: ApplicationStage,
  matchReasons: z.array(MatchReason),
  fitScore: z.number().int().min(0).max(100),
  estMinutes: z.number().int(),
  submittedAt: IsoDateTime.nullable(),
  outcomeUsd: Usd.nullable(),
  outcomeRenewable: z.boolean().nullable(),
  outcomeAt: IsoDateTime.nullable(),
  thankYouSent: z.boolean(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ScholarshipApplication = z.infer<typeof ScholarshipApplication>;

export const ScholarshipDetail = Scholarship.extend({
  application: ScholarshipApplication.nullable(),
  stale: z.boolean(),
});
export type ScholarshipDetail = z.infer<typeof ScholarshipDetail>;

export const ApplicationPatch = z.strictObject({
  stage: ApplicationStage.optional(),
  outcomeUsd: Usd.nullable().optional(),
  outcomeRenewable: z.boolean().nullable().optional(),
  thankYouSent: z.boolean().optional(),
});
export type ApplicationPatch = z.infer<typeof ApplicationPatch>;

export const Match = z.strictObject({
  scholarship: ScholarshipSummary,
  fitScore: z.number().int().min(0).max(100),
  valuePerHour: z.number().min(0),
  estMinutes: z.number().int(),
  reasons: z.array(MatchReason),
  unknowns: z.array(z.string()),
  reuseStoryIds: z.array(Id),
  daysUntilDeadline: z.number().int().nullable(),
  applicationId: Id.nullable(),
  stage: ApplicationStage.nullable(),
});
export type Match = z.infer<typeof Match>;

export const BoardCard = z.strictObject({
  application: ScholarshipApplication,
  scholarship: ScholarshipSummary,
  reasons: z.array(MatchReason),
  reuseStoryTitle: z.string().nullable(),
  progress: z.number().min(0).max(1).nullable(),
  daysUntilDeadline: z.number().int().nullable(),
});
export type BoardCard = z.infer<typeof BoardCard>;

export const Board = z.strictObject({
  privateCount: z.number().int().min(0),
  matched: z.array(BoardCard),
  working: z.array(BoardCard),
  submitted: z.array(BoardCard),
  won: z.array(BoardCard),
  lostOrSkipped: z.array(BoardCard),
  flagged: z.array(z.strictObject({ scholarship: ScholarshipSummary, reason: z.string() })),
  totals: z.strictObject({
    inPlayUsd: Usd,
    wonUsd: Usd,
    dueThisMonth: z.number().int().min(0),
  }),
});
export type Board = z.infer<typeof Board>;

export const ScholarshipQuery = z.strictObject({
  q: z.string().max(100).optional(),
  state: USState.optional(),
  local: z.boolean().optional(),
  renewable: z.boolean().optional(),
  minUsd: Usd.optional(),
  deadlineBefore: IsoDate.optional(),
  /** Keep only listings still open on this date: `deadline >= openOn` or no deadline, in SQL (F-18-3). Results stay deadline ascending, nulls last. */
  openOn: IsoDate.optional(),
  /** Drop scam-flagged listings in SQL (D39). Public-actor searches always do. */
  excludeScams: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});
export type ScholarshipQuery = z.infer<typeof ScholarshipQuery>;

/** Same fields as ScholarshipQuery, parsed from URL search params. Unknown params are stripped. */
export const ScholarshipQueryParams = z.object({
  q: z.string().max(100).optional(),
  state: USState.optional(),
  local: z.stringbool().optional(),
  renewable: z.stringbool().optional(),
  minUsd: z.coerce.number().int().min(0).optional(),
  deadlineBefore: IsoDate.optional(),
  openOn: IsoDate.optional(),
  excludeScams: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const LocalSubmissionInput = z.strictObject({
  url: HttpUrl,
  name: z.string().min(1).max(200),
  notes: z.string().max(1000).default(""),
});
export type LocalSubmissionInput = z.infer<typeof LocalSubmissionInput>;

export const ReportReason = z.enum(["wrong_deadline", "dead_link", "scam", "wrong_amount", "other"]);
export type ReportReason = z.infer<typeof ReportReason>;

export const ReportInput = z.strictObject({
  scholarshipId: Id,
  reason: ReportReason,
  details: z.string().max(1000).default(""),
});
export type ReportInput = z.infer<typeof ReportInput>;

export const SweepSummary = z.strictObject({
  ranAt: IsoDateTime,
  newMatches: z.number().int().min(0),
  totalUsd: Usd,
  reuseCount: z.number().int().min(0),
  hiddenScams: z.number().int().min(0),
});
export type SweepSummary = z.infer<typeof SweepSummary>;

export const SweepResult = SweepSummary.extend({ studentId: Id });
export type SweepResult = z.infer<typeof SweepResult>;
