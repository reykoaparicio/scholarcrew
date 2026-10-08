import { z } from "zod";

// Shared schemas run under strict browser CSP: avoid Zod's dynamic-code capability probe.
z.config({ jitless: true });

export const HttpUrl = z.url({ protocol: /^https?$/ }).max(2000);
export type HttpUrl = z.infer<typeof HttpUrl>;

export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

export const IsoDate = z.iso.date();
export type IsoDate = z.infer<typeof IsoDate>;

export const IsoDateTime = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** Whole US dollars, never negative. */
export const Usd = z.number().int().min(0).max(10_000_000);
export type Usd = z.infer<typeof Usd>;

export const AwardYear = z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-YY");
export type AwardYear = z.infer<typeof AwardYear>;

/**
 * The award year a season's applications pay for: "2026-27" → "2027-28", "2099-00" → "2100-01".
 * The one season-to-award-year map (R3V-7): 06 `currentAwardYear`, 07 `archiveSeason`, and 19 use it.
 */
export function awardYearFor(season: string): AwardYear {
  const start = Number.parseInt(season.slice(0, 4), 10) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** An IANA zone that Intl accepts. A bad zone would make every later date calculation throw RangeError. */
export const TimeZone = z
  .string()
  .min(3)
  .max(60)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone");
export type TimeZone = z.infer<typeof TimeZone>;

export const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "PR",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;
export const USState = z.enum(US_STATES);
export type USState = z.infer<typeof USState>;

export const Role = z.enum(["student", "parent", "admin"]);
export type Role = z.infer<typeof Role>;

export const SHARE_CATEGORIES = [
  "deadlines",
  "colleges",
  "costs",
  "scholarships",
  "activities",
  "essays",
  "chats",
  "stories",
  "sensitive",
] as const;
export const ShareCategory = z.enum(SHARE_CATEGORIES);
export type ShareCategory = z.infer<typeof ShareCategory>;

export const DEFAULT_SHARED: Record<ShareCategory, boolean> = {
  deadlines: true,
  colleges: true,
  costs: true,
  scholarships: true,
  activities: true,
  essays: false,
  chats: false,
  stories: false,
  sensitive: false,
};

/** Categories a helper link may expose. Never essays, chats, costs, or sensitive facts. */
export const HELPER_SCOPES = ["deadlines", "colleges", "activities", "stories", "scholarships"] as const;
export const HelperScope = z.enum(HELPER_SCOPES);
export type HelperScope = z.infer<typeof HelperScope>;

export const CREW_ROLES = ["compass", "scout", "atlas", "quill", "aid", "ledger", "prep", "impact"] as const;
export const CrewRole = z.enum(CREW_ROLES);
export type CrewRole = z.infer<typeof CrewRole>;

export const SPECIALIST_ROLES = ["scout", "atlas", "quill", "aid", "ledger", "prep", "impact"] as const;
export const SpecialistRole = z.enum(SPECIALIST_ROLES);
export type SpecialistRole = z.infer<typeof SpecialistRole>;

export const CREW_NAMES: Record<CrewRole, string> = {
  compass: "Compass",
  scout: "Scout",
  atlas: "Atlas",
  quill: "Quill",
  aid: "Aid",
  ledger: "Ledger",
  prep: "Prep",
  impact: "Impact",
};

export const Effort = z.enum(["low", "medium", "high"]);
export type Effort = z.infer<typeof Effort>;

export const ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "invalid_input",
  "conflict",
  "limit_reached",
  "rate_limited",
  "internal",
] as const;
export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  conflict: 409,
  limit_reached: 402,
  rate_limited: 429,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
export const notFound = (message = "Not found") => new AppError("not_found", message);
export const forbidden = (message = "Forbidden") => new AppError("forbidden", message);
export const unauthenticated = (message = "Sign in required") => new AppError("unauthenticated", message);
export const invalidInput = (message: string, details?: unknown) => new AppError("invalid_input", message, details);
export const conflict = (message: string) => new AppError("conflict", message);

export const ErrorBody = z.strictObject({
  error: z.strictObject({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export function pageOf<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  });
}
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

export const TaskStatus = z.enum(["todo", "done", "skipped"]);
export type TaskStatus = z.infer<typeof TaskStatus>;
