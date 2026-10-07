import { z } from "zod";
import { Id } from "./common";
import type { JobKind } from "./crew";

export const JOB_NAMES = [
  "crew.request",
  "essay.review",
  "offer.parse",
  "appeal.outline",
  "plan.weekly",
  "plan.weekly.fanout",
  "prep.retake",
  "sweep.weekly",
  "sweep.student",
  "reminders.deadlines",
  "digest.weekly",
  "notify.email",
  "notify.sms",
  "catalog.research",
  "catalog.extract",
  "catalog.recheck",
  "catalog.recheck.collect",
  "account.export",
  "account.purge",
  "maintenance.purge",
] as const;
export type JobName = (typeof JOB_NAMES)[number];
export const QUEUE_EXPIRE_SECONDS: Record<JobName, number> = Object.fromEntries(
  JOB_NAMES.map((name) => [
    name,
    name === "catalog.research" ? 2400 : name === "crew.request" || name === "plan.weekly" ? 1200 : 900,
  ]),
) as Record<JobName, number>;
export const JOB_KIND_QUEUE: Record<JobKind, JobName> = {
  crew_request: "crew.request",
  weekly_plan: "plan.weekly",
  essay_review: "essay.review",
  offer_parse: "offer.parse",
  appeal_outline: "appeal.outline",
  retake_analysis: "prep.retake",
};

const empty = z.strictObject({});

export const JobPayloadSchemas = {
  "crew.request": z.strictObject({ jobId: Id }),
  "essay.review": z.strictObject({ jobId: Id, essayId: Id }),
  "offer.parse": z.strictObject({ jobId: Id, offerId: Id }),
  "appeal.outline": z.strictObject({ jobId: Id, offerId: Id }),
  /** `source` defaults to "user": a missing value counts against the monthly allowance (R2C-5). */
  "plan.weekly": z.strictObject({ jobId: Id, ownerId: Id, source: z.enum(["user", "system"]).optional() }),
  "plan.weekly.fanout": empty,
  "prep.retake": z.strictObject({ jobId: Id, test: z.enum(["ACT", "SAT"]), targetComposite: z.number().int() }),
  "sweep.weekly": empty,
  "sweep.student": z.strictObject({ studentId: Id }),
  "reminders.deadlines": empty,
  "digest.weekly": empty,
  "notify.email": z.strictObject({ notificationId: Id }),
  "notify.sms": z.strictObject({ notificationId: Id }),
  "catalog.research": z.strictObject({ state: z.string().length(2), county: z.string().nullable() }),
  "catalog.extract": z.strictObject({ taskId: Id }),
  "catalog.recheck": empty,
  "catalog.recheck.collect": empty,
  "account.export": z.strictObject({ exportId: Id }),
  "account.purge": empty,
  "maintenance.purge": empty,
} satisfies Record<JobName, z.ZodType>;

export type JobPayload<N extends JobName> = z.infer<(typeof JobPayloadSchemas)[N]>;
