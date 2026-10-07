import { z } from "zod";
import { Id, IsoDate, IsoDateTime, ShareCategory, TaskStatus, Usd } from "./common";

export const FamilyMemberRole = z.enum(["student", "parent"]);
export type FamilyMemberRole = z.infer<typeof FamilyMemberRole>;

export const FamilyView = z.strictObject({
  id: Id,
  name: z.string(),
  myRole: FamilyMemberRole,
  members: z.array(
    z.strictObject({
      userId: Id,
      displayName: z.string(),
      email: z.email(),
      memberRole: FamilyMemberRole,
      joinedAt: IsoDateTime,
    }),
  ),
  pendingInvites: z.array(z.strictObject({ id: Id, email: z.email(), expiresAt: IsoDateTime })),
});
export type FamilyView = z.infer<typeof FamilyView>;

export const InviteInput = z.strictObject({ email: z.email().max(254) });
export type InviteInput = z.infer<typeof InviteInput>;

export const AcceptInviteInput = z.strictObject({ token: z.string().min(20).max(200) });
export type AcceptInviteInput = z.infer<typeof AcceptInviteInput>;

export const ShareSettings = z.strictObject({
  studentId: Id,
  familyId: Id,
  categories: z.record(ShareCategory, z.boolean()),
});
export type ShareSettings = z.infer<typeof ShareSettings>;

export const ShareSettingsInput = z.strictObject({
  categories: z.partialRecord(ShareCategory, z.boolean()),
});
export type ShareSettingsInput = z.infer<typeof ShareSettingsInput>;

export const FamilyBudget = z.strictObject({
  familyId: Id,
  annualUsd: Usd,
  sharedById: Id,
  updatedAt: IsoDateTime,
});
export type FamilyBudget = z.infer<typeof FamilyBudget>;

export const FamilyBudgetInput = z.strictObject({ annualUsd: Usd.max(500_000) });
export type FamilyBudgetInput = z.infer<typeof FamilyBudgetInput>;

export const FamilyTaskKind = z.enum([
  "fafsa_contributor",
  "css_contributor",
  "share_income_range",
  "share_budget",
  "review_costs",
  "custom",
]);
export type FamilyTaskKind = z.infer<typeof FamilyTaskKind>;

export const FamilyTask = z.strictObject({
  id: Id,
  familyId: Id,
  assigneeId: Id,
  assigneeName: z.string(),
  studentId: Id,
  kind: FamilyTaskKind,
  title: z.string(),
  detail: z.string(),
  status: TaskStatus,
  dueOn: IsoDate.nullable(),
  createdAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
});
export type FamilyTask = z.infer<typeof FamilyTask>;

export const FamilyTaskPatch = z.strictObject({ status: TaskStatus });
export type FamilyTaskPatch = z.infer<typeof FamilyTaskPatch>;
