import { z } from "zod";
import { PlanId } from "./billing";
import { Id, IsoDateTime, TimeZone, USState } from "./common";
import { FamilyMemberRole } from "./family";
import { User } from "./identity";
import { SensitiveFactInput } from "./memory";

export const Gpa = z.number().min(0).max(5);

/** A person's name as other people see it, including in email subjects. Control characters (`\p{Cc}`, so `\r`, `\n`, tab) are refused (R3E-10). */
export const DisplayName = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[^\p{Cc}]*$/u, "Use letters, spaces, and punctuation");

export const Profile = z.strictObject({
  userId: Id,
  classYear: z.number().int().nullable(),
  highSchool: z.string(),
  state: z.string(),
  county: z.string(),
  city: z.string(),
  gpaUnweighted: Gpa.nullable(),
  gpaWeighted: z.number().min(0).max(6).nullable(),
  intendedMajors: z.array(z.string()),
  interests: z.array(z.string()),
  onboardingCompletedAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
});
export type Profile = z.infer<typeof Profile>;

export const ProfilePatch = z.strictObject({
  displayName: DisplayName.optional(),
  classYear: z.number().int().min(2020).max(2040).nullable().optional(),
  highSchool: z.string().max(200).optional(),
  state: z.union([USState, z.literal("")]).optional(),
  county: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  gpaUnweighted: Gpa.nullable().optional(),
  gpaWeighted: z.number().min(0).max(6).nullable().optional(),
  intendedMajors: z.array(z.string().min(1).max(80)).max(5).optional(),
  interests: z.array(z.string().min(1).max(60)).max(10).optional(),
  timeZone: TimeZone.optional(),
});
export type ProfilePatch = z.infer<typeof ProfilePatch>;

export const OnboardingInput = z.strictObject({
  displayName: DisplayName,
  birthYear: z.number().int().min(1900).max(2030),
  classYear: z.number().int().min(2020).max(2040),
  highSchool: z.string().min(1).max(200),
  state: USState,
  county: z.string().min(1).max(100),
  city: z.string().max(100).default(""),
  gpaUnweighted: Gpa.nullable(),
  intendedMajors: z.array(z.string().min(1).max(80)).max(5),
  interests: z.array(z.string().min(1).max(60)).max(10),
  timeZone: TimeZone.default("America/Chicago"),
  collegeIds: z.array(z.string().min(1).max(12)).max(15).default([]),
  sensitive: z.array(SensitiveFactInput).max(8).default([]),
});
export type OnboardingInput = z.infer<typeof OnboardingInput>;

export const MeResponse = z.strictObject({
  user: User,
  profile: Profile.nullable(),
  onboardingComplete: z.boolean(),
  family: z.strictObject({ id: Id, role: FamilyMemberRole }).nullable(),
  plan: PlanId,
});
export type MeResponse = z.infer<typeof MeResponse>;
