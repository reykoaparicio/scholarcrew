import { z } from "zod";
import { CollegeListEntry } from "./colleges";
import { HelperScope, Id, IsoDate, IsoDateTime } from "./common";
import { Activity } from "./impact";
import { Deadline } from "./plan";

export const HelperRole = z.enum(["recommender", "counselor", "mentor"]);
export type HelperRole = z.infer<typeof HelperRole>;

export const HelperLink = z.strictObject({
  id: Id,
  label: z.string(),
  helperRole: HelperRole,
  scope: z.array(HelperScope),
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime,
  revokedAt: IsoDateTime.nullable(),
  lastUsedAt: IsoDateTime.nullable(),
});
export type HelperLink = z.infer<typeof HelperLink>;

export const HelperLinkInput = z.strictObject({
  label: z.string().min(1).max(80),
  helperRole: HelperRole,
  scope: z.array(HelperScope).min(1).max(5),
  expiresInDays: z.number().int().min(1).max(90).default(30),
});
export type HelperLinkInput = z.infer<typeof HelperLinkInput>;

export const HelperLinkCreated = z.strictObject({ link: HelperLink, url: z.string() });
export type HelperLinkCreated = z.infer<typeof HelperLinkCreated>;

export const HelperView = z.strictObject({
  studentName: z.string(),
  helperRole: HelperRole,
  label: z.string(),
  expiresAt: IsoDateTime,
  activities: z.array(Activity).nullable(),
  stories: z.array(z.strictObject({ title: z.string(), summary: z.string() })).nullable(),
  deadlines: z.array(Deadline).nullable(),
  colleges: z.array(CollegeListEntry).nullable(),
  scholarships: z
    .array(z.strictObject({ name: z.string(), deadline: z.string().nullable(), stage: z.string() }))
    .nullable(),
  /** The recommendation request behind this link (D38). Both null for links not made by `requestRecommendation`. */
  request: z.strictObject({ message: z.string().nullable(), dueDate: IsoDate.nullable() }),
});
export type HelperView = z.infer<typeof HelperView>;
