import { z } from "zod";
import { HttpUrl, Id, IsoDate, IsoDateTime, Usd } from "./common";
import { EssayRequirement } from "./scholarships";

export const CollegeControl = z.enum(["public", "private_nonprofit", "private_forprofit"]);
export type CollegeControl = z.infer<typeof CollegeControl>;

export const TestPolicy = z.enum(["required", "optional", "blind", "unknown"]);
export type TestPolicy = z.infer<typeof TestPolicy>;

export const OutsidePolicy = z.enum(["added_on_top", "reduces_loans_first", "may_reduce_grant", "unknown"]);
export type OutsidePolicy = z.infer<typeof OutsidePolicy>;
export const OUTSIDE_POLICY_TEXT: Record<OutsidePolicy, string> = {
  added_on_top: "Added on top of your aid",
  reduces_loans_first: "Lowers loans first",
  may_reduce_grant: "May lower the school's own grant",
  unknown: "Unconfirmed: ask the aid office",
};

const nullableUsd = Usd.nullable().default(null);
export const NetPriceByIncome = z.strictObject({
  overall: nullableUsd,
  under_30k: nullableUsd,
  "30_48k": nullableUsd,
  "48_75k": nullableUsd,
  "75_110k": nullableUsd,
  over_110k: nullableUsd,
});
export type NetPriceByIncome = z.infer<typeof NetPriceByIncome>;

export const MeritTier = z.strictObject({
  label: z.string().min(1).max(80),
  minGpa: z.number().min(0).max(5).nullable(),
  minAct: z.number().int().min(1).max(36).nullable(),
  minSat: z.number().int().min(400).max(1600).nullable(),
  annualUsd: Usd,
  renewalGpa: z.number().min(0).max(5).nullable(),
});
export type MeritTier = z.infer<typeof MeritTier>;

export const CollegeDeadlines = z.strictObject({
  ED: IsoDate.nullable().default(null),
  EA: IsoDate.nullable().default(null),
  REA: IsoDate.nullable().default(null),
  RD: IsoDate.nullable().default(null),
  rolling: z.boolean(),
});
export type CollegeDeadlines = z.infer<typeof CollegeDeadlines>;

export const CollegeRequirements = z.strictObject({
  supplements: z.array(EssayRequirement).max(10).default([]),
  teacherRecs: z.number().int().min(0).max(5).default(0),
  counselorRec: z.boolean().default(false),
  applicationFeeUsd: Usd.nullable().default(null),
  feeWaiverAvailable: z.boolean().default(false),
  portfolio: z.boolean().default(false),
  interview: z.enum(["required", "optional", "none"]).default("none"),
});
export type CollegeRequirements = z.infer<typeof CollegeRequirements>;

export const College = z.strictObject({
  id: z.string().min(1).max(12),
  name: z.string(),
  state: z.string(),
  city: z.string(),
  control: CollegeControl,
  admitRate: z.number().min(0).max(1).nullable(),
  costOfAttendanceUsd: Usd.nullable(),
  netPriceByIncome: NetPriceByIncome,
  testPolicy: TestPolicy,
  superscore: z.boolean().nullable(),
  cssProfileRequired: z.boolean(),
  outsidePolicy: OutsidePolicy,
  meritTiers: z.array(MeritTier),
  deadlines: CollegeDeadlines,
  requirements: CollegeRequirements,
  aidPriorityDate: IsoDate.nullable(),
  sourceUrl: HttpUrl,
  verifiedAt: IsoDateTime.nullable(),
});
export type College = z.infer<typeof College>;

export const CollegeSummary = College.pick({
  id: true,
  name: true,
  state: true,
  city: true,
  control: true,
  admitRate: true,
  costOfAttendanceUsd: true,
  testPolicy: true,
});
export type CollegeSummary = z.infer<typeof CollegeSummary>;

export const CollegeQuery = z.strictObject({
  q: z.string().max(100).optional(),
  state: z.string().length(2).optional(),
  control: CollegeControl.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});
export type CollegeQuery = z.infer<typeof CollegeQuery>;

export const CollegeQueryParams = z.object({
  q: z.string().max(100).optional(),
  state: z.string().length(2).optional(),
  control: CollegeControl.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const Fit = z.enum(["reach", "target", "likely"]);
export type Fit = z.infer<typeof Fit>;

export const AppPlan = z.enum(["ED", "EA", "REA", "RD", "rolling"]);
export type AppPlan = z.infer<typeof AppPlan>;

/** The one label per plan that every screen and deadline title uses (R3V-8). */
export const APP_PLAN_LABELS: Record<AppPlan, string> = {
  ED: "Early Decision",
  EA: "Early Action",
  REA: "Restrictive Early Action",
  RD: "Regular Decision",
  rolling: "Rolling admission",
};

export const AppStatus = z.enum([
  "researching",
  "applying",
  "submitted",
  "admitted",
  "waitlisted",
  "denied",
  "enrolled",
  "withdrawn",
]);
export type AppStatus = z.infer<typeof AppStatus>;

export const CollegeListEntry = z.strictObject({
  id: Id,
  collegeId: z.string(),
  college: CollegeSummary,
  fit: Fit,
  plan: AppPlan,
  status: AppStatus,
  season: z.string(),
  deadline: IsoDate.nullable(),
  itemsDone: z.number().int().min(0),
  itemsTotal: z.number().int().min(0),
  gapUsd: Usd.nullable(),
  outsidePolicy: OutsidePolicy,
  testPolicy: TestPolicy,
  createdAt: IsoDateTime,
});
export type CollegeListEntry = z.infer<typeof CollegeListEntry>;

export const MAX_COLLEGE_LIST = 25;

export const CollegeListInput = z.strictObject({
  collegeId: z.string().min(1).max(12),
  fit: Fit,
  plan: AppPlan,
});
export type CollegeListInput = z.infer<typeof CollegeListInput>;

export const CollegeListPatch = z.strictObject({
  fit: Fit.optional(),
  plan: AppPlan.optional(),
  status: AppStatus.optional(),
});
export type CollegeListPatch = z.infer<typeof CollegeListPatch>;

export const ApplicationItemKind = z.enum([
  "form",
  "transcript",
  "counselor_rec",
  "teacher_rec",
  "supplement",
  "test_scores",
  "portfolio",
  "interview",
  "fee_or_waiver",
  "css_profile",
]);
export type ApplicationItemKind = z.infer<typeof ApplicationItemKind>;

export const ItemStatus = z.enum(["todo", "in_progress", "done", "not_needed"]);
export type ItemStatus = z.infer<typeof ItemStatus>;

export const ApplicationItem = z.strictObject({
  id: Id,
  collegeListId: Id,
  kind: ApplicationItemKind,
  label: z.string(),
  status: ItemStatus,
  dueOn: IsoDate.nullable(),
  essayId: Id.nullable(),
  updatedAt: IsoDateTime,
});
export type ApplicationItem = z.infer<typeof ApplicationItem>;

export const ApplicationItemPatch = z.strictObject({
  status: ItemStatus.optional(),
  essayId: Id.nullable().optional(),
});
export type ApplicationItemPatch = z.infer<typeof ApplicationItemPatch>;

export const Recommender = z.strictObject({
  id: Id,
  name: z.string(),
  email: z.email(),
  relationship: z.string(),
  createdAt: IsoDateTime,
});
export type Recommender = z.infer<typeof Recommender>;

export const RecommenderInput = z.strictObject({
  name: z.string().min(1).max(120),
  email: z.email().max(254),
  relationship: z.string().max(120).default(""),
});
export type RecommenderInput = z.infer<typeof RecommenderInput>;

export const RecStatus = z.enum(["draft", "requested", "confirmed", "submitted", "declined"]);
export type RecStatus = z.infer<typeof RecStatus>;

export const RecRequest = z.strictObject({
  id: Id,
  recommenderId: Id,
  collegeListId: Id.nullable(),
  scholarshipApplicationId: Id.nullable(),
  helperLinkId: Id.nullable(),
  status: RecStatus,
  requestedAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
});
export type RecRequest = z.infer<typeof RecRequest>;

export const RecRequestInput = z.strictObject({
  recommenderId: Id,
  collegeListId: Id.nullable().default(null),
  scholarshipApplicationId: Id.nullable().default(null),
  message: z.string().max(1000).default(""),
});
export type RecRequestInput = z.infer<typeof RecRequestInput>;

/** Student-set status after the request goes out (R2P-11). `requested` is set only by `requestRecommendation`. */
export const RecRequestPatch = z.strictObject({ status: z.enum(["confirmed", "submitted", "declined"]) });
export type RecRequestPatch = z.infer<typeof RecRequestPatch>;
