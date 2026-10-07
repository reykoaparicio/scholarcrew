import { z } from "zod";
import { CrewRole, Id, IsoDate, IsoDateTime, TaskStatus, Usd } from "./common";

export const PlanItemKind = z.enum([
  "scholarship",
  "essay",
  "application",
  "aid",
  "test_prep",
  "service",
  "recommendation",
  "thank_you",
  "custom",
]);
export type PlanItemKind = z.infer<typeof PlanItemKind>;

export const PlanItem = z.strictObject({
  id: Id,
  weekStart: IsoDate,
  title: z.string(),
  kind: PlanItemKind,
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  minutes: z.number().int(),
  valueUsd: Usd.nullable(),
  dueOn: IsoDate.nullable(),
  status: TaskStatus,
  contributors: z.array(CrewRole),
  priority: z.number().int(),
  createdAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
});
export type PlanItem = z.infer<typeof PlanItem>;

export const PlanItemInput = z.strictObject({
  title: z.string().min(1).max(120),
  kind: PlanItemKind,
  refType: z.string().max(40).nullable().default(null),
  refId: z.string().max(64).nullable().default(null),
  minutes: z.number().int().min(0).max(600),
  valueUsd: Usd.nullable().default(null),
  dueOn: IsoDate.nullable().default(null),
  contributors: z.array(CrewRole).max(4).default([]),
  weekStart: IsoDate.nullable().default(null),
});
export type PlanItemInput = z.infer<typeof PlanItemInput>;

export const PlanItemPatch = z.strictObject({
  status: TaskStatus.optional(),
  weekStart: IsoDate.optional(),
});
export type PlanItemPatch = z.infer<typeof PlanItemPatch>;

export const WeekPlan = z.strictObject({
  weekStart: IsoDate,
  items: z.array(PlanItem),
  totalMinutes: z.number().int().min(0),
  doneCount: z.number().int().min(0),
});
export type WeekPlan = z.infer<typeof WeekPlan>;

export const DeadlineKind = z.enum(["scholarship", "application", "aid", "essay", "custom"]);
export type DeadlineKind = z.infer<typeof DeadlineKind>;

export const Deadline = z.strictObject({
  kind: DeadlineKind,
  title: z.string(),
  dueOn: IsoDate,
  daysLeft: z.number().int(),
  refType: z.string(),
  refId: z.string(),
  valueUsd: Usd.nullable(),
  warning: z.boolean(),
});
export type Deadline = z.infer<typeof Deadline>;

export const Digest = z.strictObject({
  userId: Id,
  email: z.email(),
  subject: z.string(),
  text: z.string(),
  weekStart: IsoDate,
});
export type Digest = z.infer<typeof Digest>;

export const Reminder = z.strictObject({
  userId: Id,
  title: z.string(),
  dueOn: IsoDate,
  /** Days before `dueOn`. 30 is the renewal reminder for a won renewable award (SC-11, D2). */
  offset: z.union([z.literal(30), z.literal(7), z.literal(3), z.literal(1)]),
  refType: z.string(),
  refId: z.string(),
  dedupeKey: z.string(),
});
export type Reminder = z.infer<typeof Reminder>;
