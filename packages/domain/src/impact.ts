import { z } from "zod";
import { Id, IsoDate, IsoDateTime } from "./common";

export const VerificationStatus = z.enum(["self_reported", "requested", "verified", "declined"]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const ServiceLog = z.strictObject({
  id: Id,
  organization: z.string(),
  activity: z.string(),
  servedOn: IsoDate,
  minutes: z.number().int(),
  supervisorName: z.string(),
  supervisorEmail: z.string(),
  verification: VerificationStatus,
  /** When the supervisor link stops working; null when no link was sent (R2P-10). */
  verificationExpiresAt: IsoDateTime.nullable(),
  verifiedAt: IsoDateTime.nullable(),
  verifierNote: z.string(),
  reflection: z.string(),
  createdAt: IsoDateTime,
});
export type ServiceLog = z.infer<typeof ServiceLog>;

export const ServiceLogInput = z.strictObject({
  organization: z.string().min(1).max(200),
  activity: z.string().min(1).max(200),
  servedOn: IsoDate,
  minutes: z.number().int().min(1).max(1440),
  supervisorName: z.string().max(120).default(""),
  supervisorEmail: z.union([z.email().max(254), z.literal("")]).default(""),
  reflection: z.string().max(2000).default(""),
});
export type ServiceLogInput = z.infer<typeof ServiceLogInput>;

export const ServiceLogPatch = z.strictObject({
  organization: z.string().min(1).max(200).optional(),
  activity: z.string().min(1).max(200).optional(),
  servedOn: IsoDate.optional(),
  minutes: z.number().int().min(1).max(1440).optional(),
  supervisorName: z.string().max(120).optional(),
  supervisorEmail: z.union([z.email().max(254), z.literal("")]).optional(),
  reflection: z.string().max(2000).optional(),
});
export type ServiceLogPatch = z.infer<typeof ServiceLogPatch>;

export const VerificationRequestView = z.strictObject({
  studentFirstName: z.string(),
  organization: z.string(),
  activity: z.string(),
  servedOn: IsoDate,
  minutes: z.number().int(),
  expiresAt: IsoDateTime,
});
export type VerificationRequestView = z.infer<typeof VerificationRequestView>;

export const VerificationSubmitInput = z.strictObject({
  confirmed: z.boolean(),
  note: z.string().max(500).default(""),
});
export type VerificationSubmitInput = z.infer<typeof VerificationSubmitInput>;

const codePoints150 = z.string().refine((s) => [...s].length <= 150, "150 characters max");

export const Activity = z.strictObject({
  id: Id,
  position: z.number().int().min(1).max(10),
  name: z.string(),
  role: z.string(),
  organization: z.string(),
  description: z.string(),
  hoursPerWeek: z.number().int(),
  weeksPerYear: z.number().int(),
  grades: z.array(z.number().int()),
  category: z.string(),
});
export type Activity = z.infer<typeof Activity>;

export const ActivityInput = z.strictObject({
  position: z.number().int().min(1).max(10),
  name: z.string().min(1).max(100),
  role: z.string().max(50).default(""),
  organization: z.string().max(100).default(""),
  description: codePoints150.default(""),
  hoursPerWeek: z.number().int().min(0).max(80).default(0),
  weeksPerYear: z.number().int().min(0).max(52).default(0),
  grades: z.array(z.number().int().min(9).max(13)).max(5).default([]),
  category: z.string().max(60).default(""),
});
export type ActivityInput = z.infer<typeof ActivityInput>;

export const RequirementProgress = z.strictObject({
  scholarshipId: Id,
  scholarshipName: z.string(),
  requiredHours: z.number().int(),
  verifiedHours: z.number().min(0),
  totalHours: z.number().min(0),
});
export type RequirementProgress = z.infer<typeof RequirementProgress>;
