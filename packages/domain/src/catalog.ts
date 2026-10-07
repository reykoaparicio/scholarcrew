import { z } from "zod";
import { CollegeControl, NetPriceByIncome } from "./colleges";
import { HttpUrl, Id, IsoDate, IsoDateTime, Usd } from "./common";
import {
  CatalogStatus,
  EligibilityRule,
  LocalArea,
  ReportReason,
  ScamFlag,
  ScholarshipRequirements,
} from "./scholarships";

export const CatalogTaskKind = z.enum(["research_candidate", "user_submission", "report", "recheck_changed", "import"]);
export type CatalogTaskKind = z.infer<typeof CatalogTaskKind>;

export const CatalogTaskStatus = z.enum(["open", "in_review", "resolved", "rejected"]);
export type CatalogTaskStatus = z.infer<typeof CatalogTaskStatus>;

/** What the extraction model returns for one scholarship page. Every field must be supported by a quote. */
export const ListingDraft = z.strictObject({
  name: z.string().min(1).max(200),
  provider: z.string().min(1).max(200),
  url: HttpUrl,
  amountMinUsd: Usd.nullable(),
  amountMaxUsd: Usd.nullable(),
  renewable: z.boolean().nullable(),
  deadline: IsoDate.nullable(),
  applicationFeeUsd: Usd.nullable(),
  localArea: LocalArea,
  eligibility: z.array(EligibilityRule).max(20),
  requirements: ScholarshipRequirements,
  fieldQuotes: z.array(z.strictObject({ field: z.string().max(40), quote: z.string().min(1).max(400) })).max(30),
});
export type ListingDraft = z.infer<typeof ListingDraft>;

export const VerificationIssueCode = z.enum([
  "missing_field",
  "deadline_past",
  "amount_invalid",
  "quote_not_found",
  "scam_signal",
  "domain_not_allowed",
]);
export type VerificationIssueCode = z.infer<typeof VerificationIssueCode>;

export const VerificationReport = z.strictObject({
  ok: z.boolean(),
  issues: z.array(z.strictObject({ code: VerificationIssueCode, field: z.string().nullable(), message: z.string() })),
  scamFlags: z.array(ScamFlag),
});
export type VerificationReport = z.infer<typeof VerificationReport>;

export const CatalogTaskPayload = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("research_candidate"),
    url: HttpUrl,
    title: z.string(),
    snippet: z.string(),
    state: z.string(),
    county: z.string().nullable(),
    draft: ListingDraft.nullable(),
    report: VerificationReport.nullable(),
  }),
  z.strictObject({
    type: z.literal("user_submission"),
    url: HttpUrl,
    name: z.string(),
    notes: z.string(),
    submittedById: Id.nullable(),
    /** Set by catalog extraction once the page is read (plan 11 K6). */
    draft: ListingDraft.nullable().optional(),
    report: VerificationReport.nullable().optional(),
  }),
  z.strictObject({ type: z.literal("report"), reportId: Id, reason: ReportReason, details: z.string() }),
  z.strictObject({
    type: z.literal("recheck_changed"),
    url: HttpUrl,
    before: ListingDraft.nullable(),
    after: ListingDraft.nullable(),
    report: VerificationReport.nullable(),
  }),
  z.strictObject({ type: z.literal("import"), summary: z.string() }),
]);
export type CatalogTaskPayload = z.infer<typeof CatalogTaskPayload>;

export const CatalogTask = z.strictObject({
  id: Id,
  kind: CatalogTaskKind,
  status: CatalogTaskStatus,
  scholarshipId: Id.nullable(),
  payload: CatalogTaskPayload,
  createdById: Id.nullable(),
  resolvedById: Id.nullable(),
  resolutionNote: z.string(),
  createdAt: IsoDateTime,
  resolvedAt: IsoDateTime.nullable(),
});
export type CatalogTask = z.infer<typeof CatalogTask>;

export const CatalogTaskResolution = z.strictObject({
  status: z.enum(["resolved", "rejected"]),
  note: z.string().max(1000),
  publishScholarshipId: Id.nullable().default(null),
});
export type CatalogTaskResolution = z.infer<typeof CatalogTaskResolution>;

export const ScholarshipUpsertInput = z
  .strictObject({
    id: Id.nullable(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .min(3)
      .max(120),
    name: z.string().min(1).max(200),
    provider: z.string().min(1).max(200),
    url: HttpUrl,
    sourceUrl: HttpUrl,
    amountMinUsd: Usd,
    amountMaxUsd: Usd,
    renewable: z.boolean(),
    renewalTerms: z.string().max(500),
    deadline: IsoDate.nullable(),
    cycle: z.string().regex(/^\d{4}-\d{2}$/),
    localArea: LocalArea,
    eligibility: z.array(EligibilityRule).max(20),
    requirements: ScholarshipRequirements,
    estMinutes: z.number().int().min(5).max(600),
    scamFlags: z.array(ScamFlag),
  })
  .refine((v) => v.amountMinUsd <= v.amountMaxUsd, { message: "Minimum is above maximum", path: ["amountMinUsd"] });
export type ScholarshipUpsertInput = z.infer<typeof ScholarshipUpsertInput>;

export const ScholarshipStatusInput = z.strictObject({ status: CatalogStatus, note: z.string().max(1000).default("") });
export type ScholarshipStatusInput = z.infer<typeof ScholarshipStatusInput>;

export const ReportStatus = z.enum(["open", "resolved", "rejected"]);
export type ReportStatus = z.infer<typeof ReportStatus>;

export const CatalogReport = z.strictObject({
  id: Id,
  scholarshipId: Id,
  scholarshipName: z.string(),
  reporterId: Id.nullable(),
  reason: ReportReason,
  details: z.string(),
  status: ReportStatus,
  createdAt: IsoDateTime,
  resolvedAt: IsoDateTime.nullable(),
});
export type CatalogReport = z.infer<typeof CatalogReport>;

export const ResolveReportInput = z.strictObject({
  status: z.enum(["resolved", "rejected"]),
  note: z.string().max(1000),
});
export type ResolveReportInput = z.infer<typeof ResolveReportInput>;

export const CollegeImportRow = z.strictObject({
  id: z.string().regex(/^\d{6}$/),
  name: z.string().min(1),
  state: z.string().length(2),
  city: z.string(),
  control: CollegeControl,
  admitRate: z.number().min(0).max(1).nullable(),
  costOfAttendanceUsd: Usd.nullable(),
  netPriceByIncome: NetPriceByIncome,
});
export type CollegeImportRow = z.infer<typeof CollegeImportRow>;

export const ImportResult = z.strictObject({
  inserted: z.number().int().min(0),
  updated: z.number().int().min(0),
  skipped: z.number().int().min(0),
  errors: z.array(z.strictObject({ line: z.number().int(), message: z.string() })),
});
export type ImportResult = z.infer<typeof ImportResult>;

export const AuditEvent = z.strictObject({
  id: Id,
  actorId: Id.nullable(),
  actorKind: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  meta: z.record(z.string(), z.unknown()),
  createdAt: IsoDateTime,
});
export type AuditEvent = z.infer<typeof AuditEvent>;

export const AuditQuery = z.strictObject({
  actorId: Id.optional(),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(64).optional(),
  action: z.string().max(60).optional(),
  page: z.number().int().min(1).default(1),
});
export type AuditQuery = z.infer<typeof AuditQuery>;

export const AuditQueryParams = z.object({
  actorId: Id.optional(),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(64).optional(),
  action: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const ResearchInput = z.strictObject({ state: z.string().length(2), county: z.string().max(100).optional() });
export type ResearchInput = z.infer<typeof ResearchInput>;
