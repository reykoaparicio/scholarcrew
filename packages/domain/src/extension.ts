import { z } from "zod";
import { HttpUrl, Id, IsoDateTime } from "./common";
import { Activity } from "./impact";

export const ApiTokenScope = z.enum(["autofill", "save_page"]);
export type ApiTokenScope = z.infer<typeof ApiTokenScope>;

export const ApiToken = z.strictObject({
  expiresAt: IsoDateTime,
  id: Id,
  label: z.string(),
  scopes: z.array(ApiTokenScope),
  createdAt: IsoDateTime,
  lastUsedAt: IsoDateTime.nullable(),
  revokedAt: IsoDateTime.nullable(),
});
export type ApiToken = z.infer<typeof ApiToken>;

export const ApiTokenInput = z.strictObject({
  label: z.string().min(1).max(60),
  scopes: z.array(ApiTokenScope).min(1).max(2).default(["autofill", "save_page"]),
});
export type ApiTokenInput = z.infer<typeof ApiTokenInput>;

export const ApiTokenCreated = z.strictObject({ token: ApiToken, secret: z.string() });
export type ApiTokenCreated = z.infer<typeof ApiTokenCreated>;

export const AutofillProfile = z.strictObject({
  displayName: z.string(),
  email: z.email(),
  highSchool: z.string(),
  classYear: z.number().int().nullable(),
  city: z.string(),
  state: z.string(),
  gpa: z.number().nullable(),
  intendedMajors: z.array(z.string()),
  activities: z.array(Activity),
});
export type AutofillProfile = z.infer<typeof AutofillProfile>;

export const SavePageInput = z.strictObject({
  url: HttpUrl,
  title: z.string().min(1).max(200),
  selectedText: z.string().max(2000).default(""),
});
export type SavePageInput = z.infer<typeof SavePageInput>;
