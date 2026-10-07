# Plan 02: Domain schemas (Agent B)

`@scholarcrew/domain` holds every shared type as a Zod 4 schema plus its inferred TypeScript type. Every other package imports names from here. Nothing in this package does I/O.

Read `00-overview.md` sections 3 (conventions), 8 (data model), 9 (contracts), and 10 (API surface) first. Every schema name used there is defined below.

**Files:**

- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/vitest.config.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/common.ts`, `src/common.test.ts`
- Create: `packages/domain/src/identity.ts`
- Create: `packages/domain/src/billing.ts`
- Create: `packages/domain/src/documents.ts`
- Create: `packages/domain/src/memory.ts`, `src/memory.test.ts`
- Create: `packages/domain/src/family.ts`, `src/family.test.ts`
- Create: `packages/domain/src/scholarships.ts`, `src/scholarships.test.ts`
- Create: `packages/domain/src/geo.ts`, `src/geo.test.ts`
- Create: `packages/domain/src/colleges.ts`
- Create: `packages/domain/src/profile.ts`, `src/profile.test.ts`
- Create: `packages/domain/src/essays.ts`
- Create: `packages/domain/src/prep.ts`
- Create: `packages/domain/src/impact.ts`, `src/impact.test.ts`
- Create: `packages/domain/src/money.ts`, `src/money.test.ts`
- Create: `packages/domain/src/aid.ts`
- Create: `packages/domain/src/plan.ts`
- Create: `packages/domain/src/helpers.ts`
- Create: `packages/domain/src/crew.ts`, `src/crew.test.ts`
- Create: `packages/domain/src/catalog.ts`, `src/catalog.test.ts`
- Create: `packages/domain/src/notifications.ts`
- Create: `packages/domain/src/extension.ts`
- Create: `packages/domain/src/jobs.ts`, `src/jobs.test.ts`
- Create: `packages/domain/src/safety.ts`, `src/safety.test.ts`

File import order (no cycles): `common` ← `identity`, `billing`, `documents`, `memory`, `family`, `essays`, `prep`, `impact`, `money`, `aid`, `plan`, `notifications` ← `scholarships` (memory) ← `geo` (scholarships) ← `colleges` (scholarships) ← `profile` (identity, billing, family, memory) ← `helpers` (impact, plan, colleges) ← `crew` (colleges, essays, memory, money, plan, scholarships) ← `catalog` (scholarships, colleges) ← `extension` (impact) ← `jobs` (common).

## Tasks

### B1: Package scaffold and common primitives

- [ ] **Step 1: Create the package files**

`packages/domain/package.json`:

```json
{
  "name": "@scholarcrew/domain",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "zod": "^4.0.0" },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

`packages/domain/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src"]
}
```

`packages/domain/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
```

Run: `pnpm install`
Expected: workspace links `@scholarcrew/domain`, installs `zod` 4.x.

- [ ] **Step 2: Write the failing test**

`packages/domain/src/common.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AppError,
  HttpUrl,
  AwardYear,
  DEFAULT_SHARED,
  ERROR_STATUS,
  IsoDate,
  IsoDateTime,
  SHARE_CATEGORIES,
  USState,
  Usd,
  awardYearFor,
  isAppError,
  notFound,
  pageOf,
} from "./common";

describe("AppError", () => {
  it("maps each code to its HTTP status", () => {
    expect(new AppError("not_found", "x").status).toBe(404);
    expect(new AppError("limit_reached", "x").status).toBe(402);
    expect(new AppError("rate_limited", "x").status).toBe(429);
    expect(ERROR_STATUS.invalid_input).toBe(400);
  });

  it("is recognized by isAppError and helpers", () => {
    const e = notFound("Scholarship not found");
    expect(isAppError(e)).toBe(true);
    expect(e.code).toBe("not_found");
    expect(e.message).toBe("Scholarship not found");
    expect(isAppError(new Error("plain"))).toBe(false);
  });
});

describe("primitives", () => {
  it("accepts calendar dates and ISO instants only", () => {
    expect(IsoDate.safeParse("2026-10-15").success).toBe(true);
    expect(IsoDate.safeParse("10/15/2026").success).toBe(false);
    expect(IsoDateTime.safeParse("2026-10-06T15:00:00.000Z").success).toBe(true);
    expect(IsoDateTime.safeParse("2026-10-06").success).toBe(false);
  });

  it("keeps money as whole non-negative dollars", () => {
    expect(Usd.safeParse(9200).success).toBe(true);
    expect(Usd.safeParse(9200.5).success).toBe(false);
    expect(Usd.safeParse(-1).success).toBe(false);
  });

  it("knows US state codes including DC and PR", () => {
    expect(USState.safeParse("TX").success).toBe(true);
    expect(USState.safeParse("DC").success).toBe(true);
    expect(USState.safeParse("PR").success).toBe(true);
    expect(USState.safeParse("ZZ").success).toBe(false);
  });

  it("shares the low-risk categories by default only", () => {
    expect(SHARE_CATEGORIES).toHaveLength(9);
    expect(DEFAULT_SHARED.deadlines).toBe(true);
    expect(DEFAULT_SHARED.activities).toBe(true);
    expect(DEFAULT_SHARED.essays).toBe(false);
    expect(DEFAULT_SHARED.chats).toBe(false);
    expect(DEFAULT_SHARED.sensitive).toBe(false);
  });

  it("builds page schemas", () => {
    const P = pageOf(z.string());
    expect(P.parse({ items: ["a"], page: 1, pageSize: 20, total: 1 }).items).toEqual(["a"]);
    expect(P.safeParse({ items: [], page: 0, pageSize: 20, total: 0 }).success).toBe(false);
  });

  it("maps a season to the award year it pays for (R3V-7)", () => {
    expect(awardYearFor("2026-27")).toBe("2027-28");
    expect(awardYearFor("2099-00")).toBe("2100-01");
    expect(AwardYear.safeParse(awardYearFor("2026-27")).success).toBe(true);
  });
});

describe("HttpUrl", () => {
  it("accepts HTTP(S) and refuses executable schemes", () => {
    expect(HttpUrl.safeParse("https://example.org/apply").success).toBe(true);
    for (const url of ["javascript:alert(1)", "data:text/html,x", "ftp://example.org"]) expect(HttpUrl.safeParse(url).success).toBe(false);
  });
});

```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: FAIL with `Failed to resolve import "./common"`.

- [ ] **Step 4: Write the implementation**

`packages/domain/src/common.ts`:

```ts
import { z } from "zod";

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
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
  "NY", "NC", "ND", "OH", "OK", "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA",
  "WA", "WV", "WI", "WY",
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): package scaffold and common primitives"
```

### B2: Identity, billing, documents, memory

- [ ] **Step 1: Write the failing test**

`packages/domain/src/memory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSensitiveFactKey, containsSensitiveTerm, SENSITIVE_KINDS, FactInput, FactKey, PROFILE_FACT_KEYS, SensitiveFactInput, SensitiveFactValues, NO_SENSITIVE } from "./memory";

describe("PROFILE_FACT_KEYS", () => {
  it("lists the eight profile-backed fact keys, all valid fact keys (R2I-1)", () => {
    expect(PROFILE_FACT_KEYS).toHaveLength(8);
    expect(new Set(PROFILE_FACT_KEYS).size).toBe(8);
    for (const k of PROFILE_FACT_KEYS) expect(FactKey.safeParse(k).success).toBe(true);
  });
});

describe("FactInput", () => {
  it("accepts snake_case keys and simple values with defaults", () => {
    const f = FactInput.parse({ key: "intended_major", value: "mechanical engineering" });
    expect(f.visibility).toBe("crew");
    expect(f.source).toBe("user_stated");
    expect(f.sourceRef).toBeNull();
  });

  it("rejects camelCase keys and objects as values", () => {
    expect(FactInput.safeParse({ key: "intendedMajor", value: "x" }).success).toBe(false);
    expect(FactInput.safeParse({ key: "a_b", value: { nested: true } }).success).toBe(false);
  });
});

describe("SensitiveFactInput", () => {
  it("requires an income range value shape for income_range", () => {
    expect(SensitiveFactInput.safeParse({ kind: "income_range", enabled: true, value: "48_75k" }).success).toBe(true);
    expect(SensitiveFactInput.safeParse({ kind: "income_range", enabled: true, value: ["a"] }).success).toBe(false);
  });

  it("requires a list for heritage and religion", () => {
    expect(SensitiveFactInput.safeParse({ kind: "heritage", enabled: true, value: ["Mexican American"] }).success).toBe(true);
    expect(SensitiveFactInput.safeParse({ kind: "heritage", enabled: true, value: "48_75k" }).success).toBe(false);
  });

  it("forbids values on yes/no kinds", () => {
    expect(SensitiveFactInput.safeParse({ kind: "first_gen", enabled: true }).success).toBe(true);
    expect(SensitiveFactInput.safeParse({ kind: "first_gen", enabled: true, value: ["x"] }).success).toBe(false);
  });
});

describe("SensitiveFactValues", () => {
  it("has an all-off constant", () => {
    expect(SensitiveFactValues.parse(NO_SENSITIVE)).toEqual(NO_SENSITIVE);
    expect(NO_SENSITIVE.incomeRange).toBeNull();
  });
});

describe("canonical sensitive terms", () => {
  it("covers every kind and sensitive token run without prefix false positives", () => {
    for (const key of [...SENSITIVE_KINDS, "family_income", "household_income", "religious_affiliation", "is_first_generation", "health_condition", "undocumented", "lgbtq"]) expect(isSensitiveFactKey(key), key).toBe(true);
    for (const key of ["first_choice_college", "intended_majors", "family_size"]) expect(isSensitiveFactKey(key), key).toBe(false);
    expect(containsSensitiveTerm("first-generation, foster care")).toBe(true);
  });
});

```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: FAIL with `Failed to resolve import "./memory"`.

- [ ] **Step 3: Write the implementation**

`packages/domain/src/identity.ts`:

```ts
import { z } from "zod";
import { type HelperScope, Id, IsoDateTime, Role } from "./common";

export const UserStatus = z.enum(["active", "blocked_underage", "deleted"]);
export type UserStatus = z.infer<typeof UserStatus>;

export const User = z.strictObject({
  id: Id,
  email: z.email(),
  displayName: z.string(),
  role: Role,
  birthYear: z.number().int().nullable(),
  timeZone: z.string(),
  status: UserStatus,
  createdAt: IsoDateTime,
});
export type User = z.infer<typeof User>;

export const MagicLinkRequest = z.strictObject({ email: z.email().max(254) });
export type MagicLinkRequest = z.infer<typeof MagicLinkRequest>;

export type UserActor = { kind: "user"; userId: string; role: Role };
export type HelperActor = { kind: "helper"; helperLinkId: string; studentId: string; scope: HelperScope[] };
export type SystemActor = { kind: "system"; reason: string };
export type PublicActor = { kind: "public" };
export type Actor = UserActor | HelperActor | SystemActor | PublicActor;

export const userActor = (userId: string, role: Role): UserActor => ({ kind: "user", userId, role });
export const systemActor = (reason: string): SystemActor => ({ kind: "system", reason });
export const PUBLIC_ACTOR: PublicActor = { kind: "public" };
```

`packages/domain/src/billing.ts`:

```ts
import { z } from "zod";
import { IsoDateTime } from "./common";

export const PlanId = z.enum(["free", "family", "season_pass"]);
export type PlanId = z.infer<typeof PlanId>;

export const SubscriptionStatus = z.enum(["active", "past_due", "canceled", "expired"]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const PLAN_LIMITS: Record<PlanId, { crewRequestsPerMonth: number }> = {
  free: { crewRequestsPerMonth: 20 },
  family: { crewRequestsPerMonth: 300 },
  season_pass: { crewRequestsPerMonth: 300 },
};

export const Subscription = z.strictObject({
  plan: PlanId,
  status: SubscriptionStatus,
  currentPeriodEnd: IsoDateTime.nullable(),
  managedByStripe: z.boolean(),
  sponsor: z.string().nullable(),
});
export type Subscription = z.infer<typeof Subscription>;

export const UsageSummary = z.strictObject({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  crewRequests: z.number().int().min(0),
  limit: z.number().int().min(0),
  costMicros: z.number().int().min(0),
});
export type UsageSummary = z.infer<typeof UsageSummary>;

export const CheckoutInput = z.strictObject({ plan: z.enum(["family", "season_pass"]) });
export type CheckoutInput = z.infer<typeof CheckoutInput>;

export const BillingView = z.strictObject({ subscription: Subscription, usage: UsageSummary });
export type BillingView = z.infer<typeof BillingView>;

export const SponsorCodeInput = z.strictObject({ code: z.string().min(4).max(40) });
export type SponsorCodeInput = z.infer<typeof SponsorCodeInput>;
```

`packages/domain/src/documents.ts`:

```ts
import { z } from "zod";
import { Id, IsoDateTime } from "./common";

export const DocumentKind = z.enum(["award_letter", "transcript", "score_report", "essay", "resume", "other"]);
export type DocumentKind = z.infer<typeof DocumentKind>;

export const ParseStatus = z.enum(["none", "queued", "parsing", "parsed", "failed"]);
export type ParseStatus = z.infer<typeof ParseStatus>;

export const ALLOWED_UPLOAD_MIMES = ["application/pdf", "text/plain", "image/png", "image/jpeg"] as const;
export const UploadMime = z.enum(ALLOWED_UPLOAD_MIMES);
export type UploadMime = z.infer<typeof UploadMime>;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const DocumentMeta = z.strictObject({
  id: Id,
  kind: DocumentKind,
  filename: z.string().min(1).max(255),
  mime: UploadMime,
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  parseStatus: ParseStatus,
  uploadedAt: IsoDateTime,
});
export type DocumentMeta = z.infer<typeof DocumentMeta>;

export const ExportStatus = z.enum(["queued", "ready", "failed"]);
export type ExportStatus = z.infer<typeof ExportStatus>;

export const ExportRecord = z.strictObject({
  id: Id,
  status: ExportStatus,
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime.nullable(),
  downloadUrl: z.string().nullable(),
});
export type ExportRecord = z.infer<typeof ExportRecord>;
```

`packages/domain/src/memory.ts`:

```ts
import { z } from "zod";
import { Id, IsoDateTime } from "./common";

export const FactSource = z.enum(["user_stated", "document", "parent_shared", "crew_inferred", "system"]);
export type FactSource = z.infer<typeof FactSource>;

export const FactVisibility = z.enum(["crew", "crew_family", "scout_only", "private"]);
export type FactVisibility = z.infer<typeof FactVisibility>;

export const FactStatus = z.enum(["confirmed", "candidate", "rejected"]);
export type FactStatus = z.infer<typeof FactStatus>;

export const FactKey = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, "Use snake_case");
export const FactValue = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
  z.array(z.string().max(100)).max(20),
]);
export type FactValue = z.infer<typeof FactValue>;

/**
 * Fact keys backed by a `profiles` column (R2I-1). Core memory writes on these keys update the
 * matching column in the same transaction; the worker port and the Memory screen use the list to
 * give `scout_only` and `private` meaning for profile facts (R2I-10).
 */
export const PROFILE_FACT_KEYS = [
  "class_year",
  "high_school",
  "state",
  "county",
  "city",
  "gpa_unweighted",
  "intended_majors",
  "interests",
] as const;
export type ProfileFactKey = (typeof PROFILE_FACT_KEYS)[number];

export const MemoryFact = z.strictObject({
  id: Id,
  key: FactKey,
  value: FactValue,
  valueText: z.string(),
  source: FactSource,
  sourceRef: z.string().nullable(),
  visibility: FactVisibility,
  status: FactStatus,
  createdAt: IsoDateTime,
  confirmedAt: IsoDateTime.nullable(),
  expiresAt: IsoDateTime.nullable(),
});
export type MemoryFact = z.infer<typeof MemoryFact>;

export const FactInput = z.strictObject({
  key: FactKey,
  value: FactValue,
  visibility: FactVisibility.default("crew"),
  source: FactSource.default("user_stated"),
  sourceRef: z.string().max(200).nullable().default(null),
});
export type FactInput = z.infer<typeof FactInput>;

export const FactPatch = z.strictObject({
  value: FactValue.optional(),
  visibility: FactVisibility.optional(),
});
export type FactPatch = z.infer<typeof FactPatch>;

export const Decision = z.strictObject({
  id: Id,
  summary: z.string(),
  rationale: z.string(),
  decidedAt: IsoDateTime,
  sourceMessageId: Id.nullable(),
});
export type Decision = z.infer<typeof Decision>;

export const DecisionInput = z.strictObject({
  summary: z.string().min(1).max(200),
  rationale: z.string().max(500).default(""),
});
export type DecisionInput = z.infer<typeof DecisionInput>;

export const IncomeRange = z.enum(["under_30k", "30_48k", "48_75k", "75_110k", "over_110k"]);
export type IncomeRange = z.infer<typeof IncomeRange>;
export const INCOME_RANGE_LABELS: Record<IncomeRange, string> = {
  under_30k: "Under $30k",
  "30_48k": "$30k–48k",
  "48_75k": "$48k–75k",
  "75_110k": "$75k–110k",
  over_110k: "Over $110k",
};

export const SENSITIVE_KINDS = [
  "first_gen",
  "income_range",
  "heritage",
  "disability",
  "religion",
  "military_family",
  "foster_care",
  "noncitizen_filter",
] as const;
export const SENSITIVE_FACT_KEYS = [...SENSITIVE_KINDS, "first_generation", "firstgen", "income", "salary", "wages", "earnings", "heritage", "ethnicity", "ethnic", "race", "racial", "nationality", "religion", "religious", "faith", "disability", "disabled", "health", "medical", "diagnosis", "iep", "citizen", "citizenship", "noncitizen", "immigration", "immigrant", "undocumented", "daca", "visa", "green_card", "gender", "sex", "sexual", "sexuality", "lgbt", "lgbtq", "transgender", "military", "veteran", "foster", "orphan"] as const;

function sensitiveTokens(text: string): boolean {
  const tokens = text.toLowerCase().split(/[_\-\s.]+/);
  return SENSITIVE_FACT_KEYS.some((term) => {
    const needle = term.split(/[_\-\s.]+/);
    return tokens.some((_, start) => needle.every((token, offset) => tokens[start + offset] === token));
  });
}
export function isSensitiveFactKey(key: string): boolean { return sensitiveTokens(key); }
export function containsSensitiveTerm(text: string): boolean {
  return sensitiveTokens(text.replace(/[^\p{L}\p{N}_\-\s.]/gu, " "));
}

export const SensitiveKind = z.enum(SENSITIVE_KINDS);
export type SensitiveKind = z.infer<typeof SensitiveKind>;

const LIST_KINDS: SensitiveKind[] = ["heritage", "religion"];

export const SensitiveFactInput = z
  .strictObject({
    kind: SensitiveKind,
    enabled: z.boolean(),
    value: z.union([IncomeRange, z.array(z.string().min(1).max(60)).max(5)]).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.value === null) return;
    if (v.kind === "income_range" && typeof v.value !== "string") {
      ctx.addIssue({ code: "custom", message: "income_range takes an income range", path: ["value"] });
    } else if (LIST_KINDS.includes(v.kind) && !Array.isArray(v.value)) {
      ctx.addIssue({ code: "custom", message: `${v.kind} takes a list`, path: ["value"] });
    } else if (v.kind !== "income_range" && !LIST_KINDS.includes(v.kind)) {
      ctx.addIssue({ code: "custom", message: `${v.kind} takes no value`, path: ["value"] });
    }
  });
export type SensitiveFactInput = z.infer<typeof SensitiveFactInput>;

export const SensitiveFactSummary = z.strictObject({
  kind: SensitiveKind,
  enabled: z.boolean(),
  hasValue: z.boolean(),
  displayValue: z.string().nullable(),
  sharedByParent: z.boolean(),
});
export type SensitiveFactSummary = z.infer<typeof SensitiveFactSummary>;

/** What the matcher sees. Disabled kinds read as false / null / []. Never sent to a model. */
export const SensitiveFactValues = z.strictObject({
  firstGen: z.boolean(),
  incomeRange: IncomeRange.nullable(),
  heritage: z.array(z.string()),
  disability: z.boolean(),
  religion: z.array(z.string()),
  militaryFamily: z.boolean(),
  fosterCare: z.boolean(),
  noncitizenFilter: z.boolean(),
});
export type SensitiveFactValues = z.infer<typeof SensitiveFactValues>;

export const NO_SENSITIVE: SensitiveFactValues = {
  firstGen: false,
  incomeRange: null,
  heritage: [],
  disability: false,
  religion: [],
  militaryFamily: false,
  fosterCare: false,
  noncitizenFilter: false,
};

export const ShareIncomeInput = z.strictObject({ studentId: Id, range: IncomeRange });
export type ShareIncomeInput = z.infer<typeof ShareIncomeInput>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: PASS (common 8, memory 7).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src
git commit -m "feat(domain): identity, billing, documents, memory schemas"
```

### B3: Family, scholarships, and geo

- [ ] **Step 1: Write the failing tests**

`packages/domain/src/family.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ShareSettingsInput, InviteInput, FamilyBudgetInput } from "./family";

describe("family inputs", () => {
  it("accepts a partial category map", () => {
    const v = ShareSettingsInput.parse({ categories: { essays: true } });
    expect(v.categories.essays).toBe(true);
    expect(v.categories.chats).toBeUndefined();
  });

  it("rejects unknown categories", () => {
    expect(ShareSettingsInput.safeParse({ categories: { diary: true } }).success).toBe(false);
  });

  it("validates invite email and budget bounds", () => {
    expect(InviteInput.safeParse({ email: "dana@example.com" }).success).toBe(true);
    expect(InviteInput.safeParse({ email: "nope" }).success).toBe(false);
    expect(FamilyBudgetInput.safeParse({ annualUsd: 4600 }).success).toBe(true);
    expect(FamilyBudgetInput.safeParse({ annualUsd: -5 }).success).toBe(false);
  });
});
```

`packages/domain/src/scholarships.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hasSensitiveReason, EligibilityRule, LocalArea, ScholarshipQuery, ScholarshipQueryParams, SENSITIVE_RULE_TYPES } from "./scholarships";

describe("EligibilityRule", () => {
  it("parses each rule shape by type", () => {
    expect(EligibilityRule.parse({ type: "county_in", state: "TX", counties: ["Maple"] }).type).toBe("county_in");
    expect(EligibilityRule.parse({ type: "gpa_min", min: 3.0 }).type).toBe("gpa_min");
    expect(EligibilityRule.parse({ type: "income_max", maxRange: "48_75k" }).type).toBe("income_max");
    expect(EligibilityRule.parse({ type: "custom", text: "Child of a credit union member" }).type).toBe("custom");
  });

  it("rejects an unknown rule type", () => {
    expect(EligibilityRule.safeParse({ type: "zodiac_sign", sign: "leo" }).success).toBe(false);
  });

  it("marks sensitive rule types", () => {
    expect(SENSITIVE_RULE_TYPES).toContain("first_gen");
    expect(SENSITIVE_RULE_TYPES).not.toContain("gpa_min");
  });
});

describe("LocalArea and query params", () => {
  it("defaults lists", () => {
    expect(LocalArea.parse({ national: true, state: null })).toEqual({ national: true, state: null, counties: [], cities: [] });
  });

  it("coerces URL query strings", () => {
    const q = ScholarshipQueryParams.parse({ q: "nursing", local: "true", minUsd: "500", page: "2" });
    expect(q).toMatchObject({ q: "nursing", local: true, minUsd: 500, page: 2, pageSize: 20 });
  });

  it("carries the optional excludeScams flag (D39)", () => {
    expect(ScholarshipQueryParams.parse({ excludeScams: "true" }).excludeScams).toBe(true);
    expect(ScholarshipQuery.parse({ excludeScams: true }).excludeScams).toBe(true);
    expect(ScholarshipQuery.parse({}).excludeScams).toBeUndefined();
    expect(ScholarshipQuery.safeParse({ excludeScams: "yes" }).success).toBe(false);
  });

  it("carries the optional openOn date (F-18-3)", () => {
    expect(ScholarshipQueryParams.parse({ openOn: "2026-10-06" }).openOn).toBe("2026-10-06");
    expect(ScholarshipQuery.parse({ openOn: "2026-10-06" }).openOn).toBe("2026-10-06");
    expect(ScholarshipQuery.parse({}).openOn).toBeUndefined();
    expect(ScholarshipQuery.safeParse({ openOn: "10/06/2026" }).success).toBe(false);
    expect(ScholarshipQueryParams.safeParse({ openOn: "today" }).success).toBe(false);
  });
});

describe("private match reasons", () => {
  it("flags any private reason and leaves ordinary reasons public", () => {
    expect(hasSensitiveReason([{ code: "religion_any", text: "Matches a private detail you chose to use", sensitive: true }])).toBe(true);
    expect(hasSensitiveReason([{ code: "gpa", text: "Meets GPA", sensitive: false }])).toBe(false);
    expect(hasSensitiveReason([])).toBe(false);
  });
});

```

`packages/domain/src/geo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { US_STATES } from "./common";
import { localLabel, STATE_NAMES } from "./geo";

describe("geo labels", () => {
  it("names every state code", () => {
    expect(Object.keys(STATE_NAMES).sort()).toEqual([...US_STATES].sort());
    expect(STATE_NAMES.TX).toBe("Texas");
    expect(STATE_NAMES.DC).toBe("District of Columbia");
  });

  it("labels national, state, county, and city listings", () => {
    expect(localLabel({ national: true, state: null, counties: [], cities: [] })).toBe("National");
    expect(localLabel({ national: false, state: null, counties: [], cities: [] })).toBe("National");
    expect(localLabel({ national: false, state: "TX", counties: [], cities: [] })).toBe("Texas");
    expect(localLabel({ national: false, state: "TX", counties: ["Maple"], cities: [] })).toBe("Maple County, TX");
    expect(localLabel({ national: false, state: "TX", counties: ["Maple County"], cities: [] })).toBe("Maple County, TX");
    expect(localLabel({ national: false, state: "TX", counties: [], cities: ["Cedar Park"] })).toBe("Cedar Park, TX");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: FAIL with `Failed to resolve import "./family"`, `"./scholarships"`, and `"./geo"`.

- [ ] **Step 3: Write the implementation**

`packages/domain/src/family.ts`:

```ts
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
```

`packages/domain/src/scholarships.ts`:

```ts
import { z } from "zod";
import { HttpUrl, Id, IsoDate, IsoDateTime, USState, Usd } from "./common";
import { IncomeRange } from "./memory";

export const CatalogStatus = z.enum(["draft", "published", "stale", "retired", "flagged"]);
export type CatalogStatus = z.infer<typeof CatalogStatus>;

export const ListingVisibility = z.enum(["public", "submitter_only"]);
export type ListingVisibility = z.infer<typeof ListingVisibility>;

export const ScamFlag = z.enum([
  "application_fee",
  "guaranteed_award",
  "bank_or_card_request",
  "ssn_request",
  "sweepstakes",
  "unsolicited_winner",
  "pay_for_info",
]);
export type ScamFlag = z.infer<typeof ScamFlag>;
export const SCAM_FLAG_TEXT: Record<ScamFlag, string> = {
  application_fee: "Charges a fee to apply. Real scholarships don't charge you to apply.",
  guaranteed_award: "Promises a guaranteed award.",
  bank_or_card_request: "Asks for a bank account or card number.",
  ssn_request: "Asks for a Social Security number up front.",
  sweepstakes: "Works like a sweepstakes or marketing list.",
  unsolicited_winner: "Says you won something you never applied for.",
  pay_for_info: "Sells scholarship information you can get free.",
};

export const LocalArea = z.strictObject({
  national: z.boolean(),
  state: USState.nullable(),
  counties: z.array(z.string().min(1).max(100)).max(50).default([]),
  cities: z.array(z.string().min(1).max(100)).max(50).default([]),
});
export type LocalArea = z.infer<typeof LocalArea>;

export const EligibilityRule = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("state_in"), states: z.array(USState).min(1) }),
  z.strictObject({ type: z.literal("county_in"), state: USState, counties: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ type: z.literal("city_in"), state: USState, cities: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ type: z.literal("class_year_in"), years: z.array(z.number().int().min(2020).max(2040)).min(1) }),
  z.strictObject({ type: z.literal("gpa_min"), min: z.number().min(0).max(5) }),
  z.strictObject({ type: z.literal("major_any"), majors: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ type: z.literal("interest_any"), interests: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ type: z.literal("first_gen") }),
  z.strictObject({ type: z.literal("income_max"), maxRange: IncomeRange }),
  z.strictObject({ type: z.literal("heritage_any"), values: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ type: z.literal("disability") }),
  z.strictObject({ type: z.literal("religion_any"), values: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ type: z.literal("military_family") }),
  z.strictObject({ type: z.literal("foster_care") }),
  z.strictObject({ type: z.literal("citizenship_required") }),
  z.strictObject({ type: z.literal("test_min"), test: z.enum(["ACT", "SAT"]), min: z.number().int().min(1) }),
  z.strictObject({ type: z.literal("service_hours_min"), hours: z.number().int().min(1) }),
  z.strictObject({ type: z.literal("custom"), text: z.string().min(1).max(300) }),
]);
export type EligibilityRule = z.infer<typeof EligibilityRule>;
export type EligibilityRuleType = EligibilityRule["type"];

export const SENSITIVE_RULE_TYPES = [
  "first_gen",
  "income_max",
  "heritage_any",
  "disability",
  "religion_any",
  "military_family",
  "foster_care",
] as const;

export const EssayRequirement = z.strictObject({
  prompt: z.string().min(1).max(4000),
  wordLimit: z.number().int().min(1).max(5000).nullable(),
});
export type EssayRequirement = z.infer<typeof EssayRequirement>;

export const ScholarshipRequirements = z.strictObject({
  essays: z.array(EssayRequirement).max(10),
  recommendations: z.number().int().min(0).max(10),
  transcript: z.boolean(),
  serviceHours: z.number().int().min(1).nullable(),
  other: z.array(z.string().max(200)).max(10),
});
export type ScholarshipRequirements = z.infer<typeof ScholarshipRequirements>;

export const Scholarship = z.strictObject({
  id: Id,
  slug: z.string(),
  name: z.string(),
  provider: z.string(),
  url: HttpUrl,
  sourceUrl: HttpUrl,
  amountMinUsd: Usd,
  amountMaxUsd: Usd,
  renewable: z.boolean(),
  renewalTerms: z.string(),
  deadline: IsoDate.nullable(),
  cycle: z.string(),
  localArea: LocalArea,
  eligibility: z.array(EligibilityRule),
  requirements: ScholarshipRequirements,
  status: CatalogStatus,
  visibility: ListingVisibility,
  submittedById: Id.nullable(),
  scamFlags: z.array(ScamFlag),
  estMinutes: z.number().int(),
  verifiedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Scholarship = z.infer<typeof Scholarship>;

export const ScholarshipSummary = z.strictObject({
  id: Id,
  slug: z.string(),
  name: z.string(),
  provider: z.string(),
  amountMinUsd: Usd,
  amountMaxUsd: Usd,
  renewable: z.boolean(),
  deadline: IsoDate.nullable(),
  localLabel: z.string(),
  status: CatalogStatus,
  verifiedAt: IsoDateTime.nullable(),
  scamFlags: z.array(ScamFlag),
  unverified: z.boolean(),
  estMinutes: z.number().int(),
});
export type ScholarshipSummary = z.infer<typeof ScholarshipSummary>;

export const ApplicationStage = z.enum(["matched", "planned", "drafting", "submitted", "won", "lost", "skipped"]);
export type ApplicationStage = z.infer<typeof ApplicationStage>;

/** The one label per stage that every screen shows (R3V-8). `planned` and `drafting` read the same to the student. */
export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
  matched: "Matched",
  planned: "Working on",
  drafting: "Working on",
  submitted: "Submitted",
  won: "Won",
  lost: "Didn't win",
  skipped: "Skipped",
};

export const MatchReason = z.strictObject({
  code: z.string().max(40),
  text: z.string().max(140),
  sensitive: z.boolean(),
});
export type MatchReason = z.infer<typeof MatchReason>;
export function hasSensitiveReason(reasons: MatchReason[]): boolean { return reasons.some((reason) => reason.sensitive); }

export const ScholarshipApplication = z.strictObject({
  id: Id,
  scholarshipId: Id,
  stage: ApplicationStage,
  matchReasons: z.array(MatchReason),
  fitScore: z.number().int().min(0).max(100),
  estMinutes: z.number().int(),
  submittedAt: IsoDateTime.nullable(),
  outcomeUsd: Usd.nullable(),
  outcomeRenewable: z.boolean().nullable(),
  outcomeAt: IsoDateTime.nullable(),
  thankYouSent: z.boolean(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ScholarshipApplication = z.infer<typeof ScholarshipApplication>;

export const ScholarshipDetail = Scholarship.extend({
  application: ScholarshipApplication.nullable(),
  stale: z.boolean(),
});
export type ScholarshipDetail = z.infer<typeof ScholarshipDetail>;

export const ApplicationPatch = z.strictObject({
  stage: ApplicationStage.optional(),
  outcomeUsd: Usd.nullable().optional(),
  outcomeRenewable: z.boolean().nullable().optional(),
  thankYouSent: z.boolean().optional(),
});
export type ApplicationPatch = z.infer<typeof ApplicationPatch>;

export const Match = z.strictObject({
  scholarship: ScholarshipSummary,
  fitScore: z.number().int().min(0).max(100),
  valuePerHour: z.number().min(0),
  estMinutes: z.number().int(),
  reasons: z.array(MatchReason),
  unknowns: z.array(z.string()),
  reuseStoryIds: z.array(Id),
  daysUntilDeadline: z.number().int().nullable(),
  applicationId: Id.nullable(),
  stage: ApplicationStage.nullable(),
});
export type Match = z.infer<typeof Match>;

export const BoardCard = z.strictObject({
  application: ScholarshipApplication,
  scholarship: ScholarshipSummary,
  reasons: z.array(MatchReason),
  reuseStoryTitle: z.string().nullable(),
  progress: z.number().min(0).max(1).nullable(),
  daysUntilDeadline: z.number().int().nullable(),
});
export type BoardCard = z.infer<typeof BoardCard>;

export const Board = z.strictObject({
  privateCount: z.number().int().min(0),
  matched: z.array(BoardCard),
  working: z.array(BoardCard),
  submitted: z.array(BoardCard),
  won: z.array(BoardCard),
  lostOrSkipped: z.array(BoardCard),
  flagged: z.array(z.strictObject({ scholarship: ScholarshipSummary, reason: z.string() })),
  totals: z.strictObject({
    inPlayUsd: Usd,
    wonUsd: Usd,
    dueThisMonth: z.number().int().min(0),
  }),
});
export type Board = z.infer<typeof Board>;

export const ScholarshipQuery = z.strictObject({
  q: z.string().max(100).optional(),
  state: USState.optional(),
  local: z.boolean().optional(),
  renewable: z.boolean().optional(),
  minUsd: Usd.optional(),
  deadlineBefore: IsoDate.optional(),
  /** Keep only listings still open on this date: `deadline >= openOn` or no deadline, in SQL (F-18-3). Results stay deadline ascending, nulls last. */
  openOn: IsoDate.optional(),
  /** Drop scam-flagged listings in SQL (D39). Public-actor searches always do. */
  excludeScams: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});
export type ScholarshipQuery = z.infer<typeof ScholarshipQuery>;

/** Same fields as ScholarshipQuery, parsed from URL search params. Unknown params are stripped. */
export const ScholarshipQueryParams = z.object({
  q: z.string().max(100).optional(),
  state: USState.optional(),
  local: z.stringbool().optional(),
  renewable: z.stringbool().optional(),
  minUsd: z.coerce.number().int().min(0).optional(),
  deadlineBefore: IsoDate.optional(),
  openOn: IsoDate.optional(),
  excludeScams: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const LocalSubmissionInput = z.strictObject({
  url: HttpUrl,
  name: z.string().min(1).max(200),
  notes: z.string().max(1000).default(""),
});
export type LocalSubmissionInput = z.infer<typeof LocalSubmissionInput>;

export const ReportReason = z.enum(["wrong_deadline", "dead_link", "scam", "wrong_amount", "other"]);
export type ReportReason = z.infer<typeof ReportReason>;

export const ReportInput = z.strictObject({
  scholarshipId: Id,
  reason: ReportReason,
  details: z.string().max(1000).default(""),
});
export type ReportInput = z.infer<typeof ReportInput>;

export const SweepSummary = z.strictObject({
  ranAt: IsoDateTime,
  newMatches: z.number().int().min(0),
  totalUsd: Usd,
  reuseCount: z.number().int().min(0),
  hiddenScams: z.number().int().min(0),
});
export type SweepSummary = z.infer<typeof SweepSummary>;

export const SweepResult = SweepSummary.extend({ studentId: Id });
export type SweepResult = z.infer<typeof SweepResult>;
```

`packages/domain/src/geo.ts` (shared by core 07 and web 18, D41):

```ts
import type { USState } from "./common";
import type { LocalArea } from "./scholarships";

export const STATE_NAMES: Record<USState, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** "National", "Texas", "Maple County, TX", or "Cedar Park, TX". */
export function localLabel(area: LocalArea): string {
  if (area.national || area.state === null) return "National";
  const county = area.counties[0];
  if (county) return `${county.replace(/\s+county$/i, "")} County, ${area.state}`;
  const city = area.cities[0];
  if (city) return `${city}, ${area.state}`;
  return STATE_NAMES[area.state];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: PASS (family 3, scholarships 7, geo 2 added).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src
git commit -m "feat(domain): family, scholarship, and geo schemas"
```

### B4: Colleges and profile

- [ ] **Step 1: Write the failing test**

`packages/domain/src/profile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CollegeDeadlines, NetPriceByIncome, RecRequestPatch } from "./colleges";
import { OnboardingInput, ProfilePatch } from "./profile";

const valid = {
  displayName: "Jordan",
  birthYear: 2009,
  classYear: 2027,
  highSchool: "Maple High School",
  state: "TX",
  county: "Maple",
  gpaUnweighted: 3.72,
  intendedMajors: ["Mechanical engineering"],
  interests: ["robotics"],
};

describe("OnboardingInput", () => {
  it("applies defaults", () => {
    const v = OnboardingInput.parse(valid);
    expect(v.city).toBe("");
    expect(v.timeZone).toBe("America/Chicago");
    expect(v.collegeIds).toEqual([]);
    expect(v.sensitive).toEqual([]);
  });

  it("rejects bad GPA and state", () => {
    expect(OnboardingInput.safeParse({ ...valid, gpaUnweighted: 5.5 }).success).toBe(false);
    expect(OnboardingInput.safeParse({ ...valid, state: "XX" }).success).toBe(false);
  });

  it("caps the starter college list at 15", () => {
    const ids = Array.from({ length: 16 }, (_, i) => String(100000 + i));
    expect(OnboardingInput.safeParse({ ...valid, collegeIds: ids }).success).toBe(false);
  });
});

describe("ProfilePatch", () => {
  it("accepts empty state to clear it", () => {
    expect(ProfilePatch.safeParse({ state: "" }).success).toBe(true);
  });

  it("accepts IANA time zones and rejects unknown ones", () => {
    expect(ProfilePatch.safeParse({ timeZone: "America/New_York" }).success).toBe(true);
    expect(ProfilePatch.safeParse({ timeZone: "Mars/Base" }).success).toBe(false);
    expect(OnboardingInput.safeParse({ ...valid, timeZone: "Mars/Base" }).success).toBe(false);
  });

  it("trims display names and refuses control characters (R3E-10)", () => {
    expect(ProfilePatch.parse({ displayName: "  Maya " }).displayName).toBe("Maya");
    expect(ProfilePatch.safeParse({ displayName: "Maya\nLopez" }).success).toBe(false);
    expect(ProfilePatch.safeParse({ displayName: "   " }).success).toBe(false);
    expect(OnboardingInput.safeParse({ ...valid, displayName: "Maya\r\nLopez" }).success).toBe(false);
    expect(OnboardingInput.parse({ ...valid, displayName: " Maya López " }).displayName).toBe("Maya López");
  });
});

describe("college shapes", () => {
  it("fills null deadlines and income bands", () => {
    expect(CollegeDeadlines.parse({ rolling: false })).toEqual({ ED: null, EA: null, REA: null, RD: null, rolling: false });
    expect(NetPriceByIncome.parse({ overall: 12000 }).under_30k).toBeNull();
  });

  it("moves a recommendation past requested, never back to it (R2P-11)", () => {
    for (const status of ["confirmed", "submitted", "declined"]) {
      expect(RecRequestPatch.safeParse({ status }).success).toBe(true);
    }
    expect(RecRequestPatch.safeParse({ status: "requested" }).success).toBe(false);
    expect(RecRequestPatch.safeParse({ status: "draft" }).success).toBe(false);
    expect(RecRequestPatch.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: FAIL with `Failed to resolve import "./profile"`.

- [ ] **Step 3: Write the implementation**

`packages/domain/src/colleges.ts`:

```ts
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
```

`packages/domain/src/profile.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: PASS (profile 8 added).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src
git commit -m "feat(domain): college and profile schemas"
```

### B5: Essays, prep, impact

- [ ] **Step 1: Write the failing test**

`packages/domain/src/impact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Essay, EssayPatch, QuillCommentDraft, SaveVersionInput } from "./essays";
import { ActivityInput, ServiceLog, ServiceLogInput } from "./impact";
import { TestScoreInput } from "./prep";

const activity = {
  position: 1,
  name: "Robotics team",
  role: "Build lead",
  organization: "Maple High",
  description: "Lead a 12-person build team; run monthly STEM nights for elementary students at the public library.",
  hoursPerWeek: 8,
  weeksPerYear: 30,
  grades: [10, 11, 12],
  category: "STEM",
};

describe("ActivityInput", () => {
  it("allows 150 characters counted as code points", () => {
    expect(ActivityInput.safeParse({ ...activity, description: "é".repeat(150) }).success).toBe(true);
    expect(ActivityInput.safeParse({ ...activity, description: "é".repeat(151) }).success).toBe(false);
  });

  it("limits positions to 1..10", () => {
    expect(ActivityInput.safeParse({ ...activity, position: 11 }).success).toBe(false);
  });
});

describe("ServiceLogInput", () => {
  it("allows an empty supervisor email and caps minutes at one day", () => {
    const base = { organization: "Library", activity: "STEM night", servedOn: "2026-09-12", minutes: 120 };
    expect(ServiceLogInput.parse(base).supervisorEmail).toBe("");
    expect(ServiceLogInput.safeParse({ ...base, minutes: 1441 }).success).toBe(false);
  });
});

describe("ServiceLog", () => {
  it("carries the supervisor link expiry, null or a timestamp (R2P-10)", () => {
    const log = {
      id: "00000000-0000-4000-8000-000000000000",
      organization: "Library",
      activity: "STEM night",
      servedOn: "2026-09-12",
      minutes: 120,
      supervisorName: "Ms. Ruiz",
      supervisorEmail: "ruiz@example.org",
      verification: "self_reported",
      verificationExpiresAt: null,
      verifiedAt: null,
      verifierNote: "",
      reflection: "",
      createdAt: "2026-09-12T20:00:00.000Z",
    };
    expect(ServiceLog.safeParse(log).success).toBe(true);
    expect(ServiceLog.safeParse({ ...log, verification: "requested", verificationExpiresAt: "2026-09-26T20:00:00.000Z" }).success).toBe(true);
    const { verificationExpiresAt: _omit, ...missing } = log;
    expect(ServiceLog.safeParse(missing).success).toBe(false);
  });
});

describe("TestScoreInput", () => {
  it("checks the composite range per test", () => {
    const base = { takenOn: "2026-09-12", official: true, sections: {} };
    expect(TestScoreInput.safeParse({ ...base, test: "ACT", composite: 27 }).success).toBe(true);
    expect(TestScoreInput.safeParse({ ...base, test: "ACT", composite: 37 }).success).toBe(false);
    expect(TestScoreInput.safeParse({ ...base, test: "SAT", composite: 1350 }).success).toBe(true);
    expect(TestScoreInput.safeParse({ ...base, test: "SAT", composite: 300 }).success).toBe(false);
  });
});

describe("essay inputs", () => {
  it("requires a base version for optimistic saves", () => {
    expect(SaveVersionInput.safeParse({ body: "Hi" }).success).toBe(false);
    expect(SaveVersionInput.safeParse({ body: "Hi", baseVersion: 0 }).success).toBe(true);
  });

  it("bounds Quill comment drafts", () => {
    expect(QuillCommentDraft.safeParse({ quote: "30 kids came", occurrence: 1, kind: "question", body: "What changed for one kid?" }).success).toBe(true);
    expect(QuillCommentDraft.safeParse({ quote: "", occurrence: 1, kind: "question", body: "x" }).success).toBe(false);
  });

  it("carries the latest word count, null before the first save (D34)", () => {
    const essay = {
      id: "00000000-0000-4000-8000-000000000000",
      title: "Why nursing",
      prompt: "Why this major?",
      wordLimit: 650,
      charLimit: null,
      targetType: "general",
      targetCollegeId: null,
      targetScholarshipId: null,
      currentVersion: 0,
      latestWordCount: null,
      status: "drafting",
      createdAt: "2026-10-06T15:00:00.000Z",
      updatedAt: "2026-10-06T15:00:00.000Z",
    };
    expect(Essay.safeParse(essay).success).toBe(true);
    expect(Essay.safeParse({ ...essay, currentVersion: 2, latestWordCount: 412 }).success).toBe(true);
    expect(Essay.safeParse({ ...essay, latestWordCount: -1 }).success).toBe(false);
    expect(Essay.safeParse({ ...essay, latestWordCount: undefined }).success).toBe(false);
  });

  it("requires at least one key in an essay patch (R2P-14)", () => {
    expect(EssayPatch.safeParse({}).success).toBe(false);
    expect(EssayPatch.safeParse({ status: "ready" }).success).toBe(true);
    expect(EssayPatch.safeParse({ title: "Why nursing, take two" }).success).toBe(true);
    expect(EssayPatch.safeParse({ title: "" }).success).toBe(false);
    expect(EssayPatch.safeParse({ status: "done" }).success).toBe(false);
    expect(EssayPatch.safeParse({ wordLimit: 500 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: FAIL with `Failed to resolve import "./impact"`.

- [ ] **Step 3: Write the implementation**

`packages/domain/src/essays.ts`:

```ts
import { z } from "zod";
import { Id, IsoDateTime } from "./common";

export const EssayTarget = z.enum(["college", "scholarship", "general"]);
export type EssayTarget = z.infer<typeof EssayTarget>;

export const EssayStatus = z.enum(["drafting", "ready", "submitted"]);
export type EssayStatus = z.infer<typeof EssayStatus>;

export const Essay = z.strictObject({
  id: Id,
  title: z.string(),
  prompt: z.string(),
  wordLimit: z.number().int().nullable(),
  charLimit: z.number().int().nullable(),
  targetType: EssayTarget,
  targetCollegeId: z.string().nullable(),
  targetScholarshipId: Id.nullable(),
  currentVersion: z.number().int().min(0),
  /** Word count of version `currentVersion`, null before the first save (D34). */
  latestWordCount: z.number().int().min(0).nullable(),
  status: EssayStatus,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Essay = z.infer<typeof Essay>;

export const EssayInput = z.strictObject({
  title: z.string().min(1).max(200),
  prompt: z.string().max(4000),
  wordLimit: z.number().int().min(1).max(5000).nullable().default(null),
  charLimit: z.number().int().min(1).max(20000).nullable().default(null),
  targetType: EssayTarget.default("general"),
  targetCollegeId: z.string().max(12).nullable().default(null),
  targetScholarshipId: Id.nullable().default(null),
});
export type EssayInput = z.infer<typeof EssayInput>;

/** Owner edits to an essay's title, prompt, or status; at least one key (R2P-14). */
export const EssayPatch = z
  .strictObject({
    title: EssayInput.shape.title.optional(),
    prompt: EssayInput.shape.prompt.optional(),
    status: EssayStatus.optional(),
  })
  .refine((p) => p.title !== undefined || p.prompt !== undefined || p.status !== undefined, {
    message: "Change at least one field",
  });
export type EssayPatch = z.infer<typeof EssayPatch>;

export const CommentAuthor = z.enum(["quill", "helper", "user"]);
export type CommentAuthor = z.infer<typeof CommentAuthor>;

export const CommentKind = z.enum(["question", "structure", "clarity", "prompt_fit", "word_budget"]);
export type CommentKind = z.infer<typeof CommentKind>;

export const EssayComment = z.strictObject({
  id: Id,
  essayId: Id,
  version: z.number().int(),
  author: CommentAuthor,
  kind: CommentKind,
  quote: z.string(),
  occurrence: z.number().int().min(1),
  body: z.string(),
  resolvedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type EssayComment = z.infer<typeof EssayComment>;

/** What Quill submits for one comment. The integrity guard checks `body`. */
export const QuillCommentDraft = z.strictObject({
  quote: z.string().min(1).max(400),
  occurrence: z.number().int().min(1).max(20),
  kind: CommentKind,
  body: z.string().min(1).max(400),
});
export type QuillCommentDraft = z.infer<typeof QuillCommentDraft>;

export const EssayWithBody = Essay.extend({
  body: z.string(),
  wordCount: z.number().int().min(0),
  comments: z.array(EssayComment),
  targetLabel: z.string().nullable(),
});
export type EssayWithBody = z.infer<typeof EssayWithBody>;

export const EssayVersion = z.strictObject({
  id: Id,
  essayId: Id,
  version: z.number().int().min(1),
  body: z.string(),
  wordCount: z.number().int().min(0),
  authorId: Id,
  createdAt: IsoDateTime,
});
export type EssayVersion = z.infer<typeof EssayVersion>;

export const SaveVersionInput = z.strictObject({
  body: z.string().max(50_000),
  baseVersion: z.number().int().min(0),
});
export type SaveVersionInput = z.infer<typeof SaveVersionInput>;

export const Story = z.strictObject({
  id: Id,
  title: z.string(),
  moment: z.string(),
  themes: z.array(z.string()),
  evidence: z.string(),
  summary: z.string(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  archivedAt: IsoDateTime.nullable(),
  uses: z.array(
    z.strictObject({
      essayId: Id,
      essayTitle: z.string(),
      collegeId: z.string().nullable(),
      scholarshipId: Id.nullable(),
      usedAt: IsoDateTime,
    }),
  ),
});
export type Story = z.infer<typeof Story>;

export const StoryInput = z.strictObject({
  title: z.string().min(1).max(120),
  moment: z.string().min(1).max(4000),
  themes: z.array(z.string().min(1).max(40)).max(8).default([]),
  evidence: z.string().max(2000).default(""),
  summary: z.string().max(400).default(""),
});
export type StoryInput = z.infer<typeof StoryInput>;

export const StoryPatch = z.strictObject({
  title: z.string().min(1).max(120).optional(),
  moment: z.string().min(1).max(4000).optional(),
  themes: z.array(z.string().min(1).max(40)).max(8).optional(),
  evidence: z.string().max(2000).optional(),
  summary: z.string().max(400).optional(),
});
export type StoryPatch = z.infer<typeof StoryPatch>;

export const StoryUse = z.strictObject({
  id: Id,
  storyId: Id,
  essayId: Id,
  collegeId: z.string().nullable(),
  scholarshipId: Id.nullable(),
  usedAt: IsoDateTime,
});
export type StoryUse = z.infer<typeof StoryUse>;

export const LinkStoryInput = z.strictObject({ storyId: Id, essayId: Id });
export type LinkStoryInput = z.infer<typeof LinkStoryInput>;

export const StoryReuseCheckInput = z.strictObject({
  storyId: Id,
  collegeId: z.string().max(12).optional(),
  scholarshipId: Id.optional(),
});
export type StoryReuseCheckInput = z.infer<typeof StoryReuseCheckInput>;

export const StoryReuseCheck = z.strictObject({
  storyId: Id,
  alreadyUsedForTarget: z.boolean(),
  priorUses: z.number().int().min(0),
  message: z.string().nullable(),
});
export type StoryReuseCheck = z.infer<typeof StoryReuseCheck>;
```

`packages/domain/src/prep.ts`:

```ts
import { z } from "zod";
import { Id, IsoDate, IsoDateTime, Usd } from "./common";

export const TestKind = z.enum(["ACT", "SAT", "PSAT"]);
export type TestKind = z.infer<typeof TestKind>;

export const COMPOSITE_RANGE: Record<TestKind, { min: number; max: number }> = {
  ACT: { min: 1, max: 36 },
  SAT: { min: 400, max: 1600 },
  PSAT: { min: 320, max: 1520 },
};

export const TestScore = z.strictObject({
  id: Id,
  test: TestKind,
  takenOn: IsoDate,
  official: z.boolean(),
  composite: z.number().int(),
  sections: z.record(z.string(), z.number().int()),
  createdAt: IsoDateTime,
});
export type TestScore = z.infer<typeof TestScore>;

export const TestScoreInput = z
  .strictObject({
    test: TestKind,
    takenOn: IsoDate,
    official: z.boolean(),
    composite: z.number().int(),
    sections: z.record(z.string().min(1).max(30), z.number().int().min(0).max(800)),
  })
  .refine((v) => v.composite >= COMPOSITE_RANGE[v.test].min && v.composite <= COMPOSITE_RANGE[v.test].max, {
    message: "Composite out of range for this test",
    path: ["composite"],
  });
export type TestScoreInput = z.infer<typeof TestScoreInput>;

export const Superscore = z.strictObject({
  test: TestKind,
  composite: z.number().int(),
  sections: z.record(z.string(), z.number().int()),
  fromDates: z.array(IsoDate),
});
export type Superscore = z.infer<typeof Superscore>;

export const RetakeAnalysisInput = z.strictObject({
  test: z.enum(["ACT", "SAT"]),
  targetComposite: z.number().int().min(1).max(1600),
});
export type RetakeAnalysisInput = z.infer<typeof RetakeAnalysisInput>;

export const RetakeAnalysis = z.strictObject({
  test: z.enum(["ACT", "SAT"]),
  currentComposite: z.number().int().nullable(),
  targetComposite: z.number().int(),
  rows: z.array(
    z.strictObject({
      collegeId: z.string(),
      collegeName: z.string(),
      currentTierLabel: z.string().nullable(),
      targetTierLabel: z.string().nullable(),
      annualDeltaUsd: Usd,
      fourYearDeltaUsd: Usd,
    }),
  ),
  totalFourYearDeltaUsd: Usd,
});
export type RetakeAnalysis = z.infer<typeof RetakeAnalysis>;

export const StudySession = z.strictObject({
  title: z.string().min(1).max(120),
  minutes: z.number().int().min(10).max(240),
  weekStart: IsoDate,
  dueOn: IsoDate.nullable(),
});
export type StudySession = z.infer<typeof StudySession>;

export const StudyPlanInput = z.strictObject({ sessions: z.array(StudySession).min(1).max(40) });
export type StudyPlanInput = z.infer<typeof StudyPlanInput>;
```

`packages/domain/src/impact.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: PASS (impact file 9 tests added).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src
git commit -m "feat(domain): essays, prep, impact schemas"
```

### B6: Money, aid, plan

- [ ] **Step 1: Write the failing test**

`packages/domain/src/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AidDeadlineInput, AidRuleInput, CreateOfferInput, FREE_CATEGORIES, LOAN_CATEGORIES, Offer, ParsedOffer, PublicOfferInput } from "./money";
import { PlanItemInput, Reminder } from "./plan";

describe("money schemas", () => {
  it("splits categories into free money and loans", () => {
    expect(FREE_CATEGORIES).toEqual(["grant", "scholarship"]);
    expect(LOAN_CATEGORIES).toContain("loan_parent_plus");
    expect(LOAN_CATEGORIES).not.toContain("work_study");
  });

  it("limits the public tool to 4 offers", () => {
    const offer = { name: "State U", costOfAttendanceUsd: 27800, lines: [] };
    expect(PublicOfferInput.safeParse({ offers: [offer] }).success).toBe(true);
    expect(PublicOfferInput.safeParse({ offers: [offer, offer, offer, offer, offer] }).success).toBe(false);
    expect(PublicOfferInput.safeParse({ offers: [] }).success).toBe(false);
  });

  it("validates award year shape", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(CreateOfferInput.safeParse({ collegeId: "123456", documentId: id, awardYear: "2027-28" }).success).toBe(true);
    expect(CreateOfferInput.safeParse({ collegeId: "123456", documentId: id, awardYear: "2027" }).success).toBe(false);
  });

  it("parses model offer output with nullable fields", () => {
    const v = ParsedOffer.parse({
      costOfAttendanceUsd: 27800,
      awardYear: null,
      lines: [{ label: "State U Merit", amountUsd: 3000, category: "scholarship", renewable: true, renewalCondition: "3.0 GPA", page: 1, citedText: "State U Merit Award $3,000" }],
    });
    expect(v.lines[0]?.category).toBe("scholarship");
  });

  it("carries the offer's parse job id, or null (D31)", () => {
    const offer = {
      id: "00000000-0000-4000-8000-000000000000",
      collegeId: "123456",
      collegeName: "State U",
      awardYear: "2027-28",
      documentId: null,
      status: "parsing",
      costOfAttendanceUsd: null,
      createdAt: "2026-10-06T15:00:00.000Z",
      confirmedAt: null,
      parseJobId: "00000000-0000-4000-8000-000000000001",
    };
    expect(Offer.safeParse(offer).success).toBe(true);
    expect(Offer.safeParse({ ...offer, parseJobId: null }).success).toBe(true);
    expect(Offer.safeParse({ ...offer, parseJobId: undefined }).success).toBe(false);
    expect(Offer.safeParse({ ...offer, parseJobId: "job-1" }).success).toBe(false);
  });
});

describe("aid rule and deadline inputs (R2P-1)", () => {
  const sourceUrl = "https://studentaid.gov/understand-aid/types/loans/interest-rates";

  it("bounds loan rates at 30 percent", () => {
    const value = { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 };
    expect(AidRuleInput.safeParse({ awardYear: "2027-28", key: "federal_loan_rates", value, sourceUrl }).success).toBe(true);
    expect(AidRuleInput.safeParse({ awardYear: "2027-28", key: "federal_loan_rates", value: { ...value, parent_plus: 31 }, sourceUrl }).success).toBe(false);
    expect(AidRuleInput.safeParse({ awardYear: "2027-28", key: "pell_max", value, sourceUrl }).success).toBe(false);
    expect(AidRuleInput.safeParse({ awardYear: "2027-28", key: "federal_loan_rates", value, sourceUrl: "not a url" }).success).toBe(false);
  });

  it("takes a federal or state deadline with an optional id", () => {
    const base = { awardYear: "2027-28", program: "FAFSA", deadline: "2028-06-30", sourceUrl: "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines" };
    expect(AidDeadlineInput.parse({ ...base, state: null }).note).toBe("");
    expect(AidDeadlineInput.safeParse({ ...base, state: "TX", id: "00000000-0000-4000-8000-000000000000" }).success).toBe(true);
    expect(AidDeadlineInput.safeParse({ ...base, state: "ZZ" }).success).toBe(false);
    expect(AidDeadlineInput.safeParse({ ...base, state: null, program: "   " }).success).toBe(false);
  });
});

describe("PlanItemInput", () => {
  it("requires explicit nullable fields", () => {
    const v = PlanItemInput.parse({ title: "Ask Ms. Patel", kind: "recommendation", minutes: 10 });
    expect(v).toMatchObject({ refType: null, refId: null, valueUsd: null, dueOn: null, contributors: [], weekStart: null });
  });
});

describe("Reminder", () => {
  it("allows the 30-day renewal offset next to 7, 3, and 1 (D2)", () => {
    const base = {
      userId: "00000000-0000-4000-8000-000000000000",
      title: "Hill Country STEM Award renewal is coming up",
      dueOn: "2027-05-01",
      refType: "scholarship_application",
      refId: "00000000-0000-4000-8000-000000000001",
      dedupeKey: "renewal:00000000-0000-4000-8000-000000000001:2027",
    };
    for (const offset of [30, 7, 3, 1]) expect(Reminder.safeParse({ ...base, offset }).success).toBe(true);
    expect(Reminder.safeParse({ ...base, offset: 14 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: FAIL with `Failed to resolve import "./money"`.

- [ ] **Step 3: Write the implementation**

`packages/domain/src/money.ts`:

```ts
import { z } from "zod";
import { HttpUrl, AwardYear, Id, IsoDate, IsoDateTime, USState, Usd } from "./common";

export const CostSource = z.enum(["scorecard", "calculator", "offer"]);
export type CostSource = z.infer<typeof CostSource>;

export const CostSummary = z.strictObject({
  collegeId: z.string(),
  collegeName: z.string(),
  source: CostSource,
  sourceLabel: z.string(),
  costOfAttendanceUsd: Usd,
  freeMoneyUsd: Usd,
  gapUsd: Usd,
  pendingUsd: Usd,
  gapIfPendingWinUsd: Usd,
  isEstimate: z.boolean(),
  budgetUsd: Usd.nullable(),
  gapAfterBudgetUsd: Usd.nullable(),
});
export type CostSummary = z.infer<typeof CostSummary>;

export const CalculatorResultInput = z.strictObject({
  collegeId: z.string().min(1).max(12),
  costOfAttendanceUsd: Usd.max(200_000),
  grantsUsd: Usd.max(200_000),
});
export type CalculatorResultInput = z.infer<typeof CalculatorResultInput>;

export const OfferStatus = z.enum(["uploaded", "parsing", "needs_review", "confirmed", "failed"]);
export type OfferStatus = z.infer<typeof OfferStatus>;

export const OFFER_LINE_CATEGORIES = [
  "grant",
  "scholarship",
  "work_study",
  "loan_federal_subsidized",
  "loan_federal_unsubsidized",
  "loan_parent_plus",
  "loan_private",
  "other",
] as const;
export const OfferLineCategory = z.enum(OFFER_LINE_CATEGORIES);
export type OfferLineCategory = z.infer<typeof OfferLineCategory>;
export const FREE_CATEGORIES: OfferLineCategory[] = ["grant", "scholarship"];
export const LOAN_CATEGORIES: OfferLineCategory[] = [
  "loan_federal_subsidized",
  "loan_federal_unsubsidized",
  "loan_parent_plus",
  "loan_private",
];

export const Offer = z.strictObject({
  id: Id,
  collegeId: z.string(),
  collegeName: z.string(),
  awardYear: AwardYear,
  documentId: Id.nullable(),
  status: OfferStatus,
  costOfAttendanceUsd: Usd.nullable(),
  createdAt: IsoDateTime,
  confirmedAt: IsoDateTime.nullable(),
  /** Newest `offer_parse` crew job for this offer, so the UI can follow its events (D31). */
  parseJobId: Id.nullable(),
});
export type Offer = z.infer<typeof Offer>;

export const OfferLine = z.strictObject({
  id: Id,
  offerId: Id,
  position: z.number().int().min(0),
  label: z.string(),
  amountUsd: Usd,
  category: OfferLineCategory,
  renewable: z.boolean(),
  renewalCondition: z.string(),
  page: z.number().int().nullable(),
  citedText: z.string(),
  userCorrected: z.boolean(),
});
export type OfferLine = z.infer<typeof OfferLine>;

export const OfferWithLines = Offer.extend({ lines: z.array(OfferLine) });
export type OfferWithLines = z.infer<typeof OfferWithLines>;

export const CreateOfferInput = z.strictObject({
  collegeId: z.string().min(1).max(12),
  documentId: Id,
  awardYear: AwardYear,
});
export type CreateOfferInput = z.infer<typeof CreateOfferInput>;

export const OfferLinePatch = z.strictObject({
  label: z.string().min(1).max(120).optional(),
  amountUsd: Usd.max(200_000).optional(),
  category: OfferLineCategory.optional(),
  renewable: z.boolean().optional(),
});
export type OfferLinePatch = z.infer<typeof OfferLinePatch>;

/** What the offer parser (Aid) returns for one letter line. */
export const ParsedOfferLine = z.strictObject({
  label: z.string().min(1).max(120),
  amountUsd: Usd.max(200_000),
  category: OfferLineCategory,
  renewable: z.boolean(),
  renewalCondition: z.string().max(200),
  page: z.number().int().min(1).nullable(),
  citedText: z.string().max(300),
});
export type ParsedOfferLine = z.infer<typeof ParsedOfferLine>;

export const ParsedOffer = z.strictObject({
  costOfAttendanceUsd: Usd.max(200_000).nullable(),
  awardYear: AwardYear.nullable(),
  lines: z.array(ParsedOfferLine).max(40),
});
export type ParsedOffer = z.infer<typeof ParsedOffer>;

export const OfferColumn = z.strictObject({
  offerId: z.string(),
  collegeId: z.string(),
  collegeName: z.string(),
  costOfAttendanceUsd: Usd,
  freeMoneyUsd: Usd,
  workStudyUsd: Usd,
  loansUsd: Usd,
  letterSaysOweUsd: Usd,
  reallyCostsUsd: Usd,
  fourYearUsd: Usd,
  oneTimeFreeUsd: Usd,
  warnings: z.array(z.string()),
});
export type OfferColumn = z.infer<typeof OfferColumn>;

export const OfferComparison = z.strictObject({
  columns: z.array(OfferColumn),
  lowestFourYearOfferId: z.string().nullable(),
  assumptions: z.array(z.string()),
});
export type OfferComparison = z.infer<typeof OfferComparison>;

export const LoanEstimate = z.strictObject({
  label: z.string(),
  principalUsd: Usd,
  annualRatePct: z.number().min(0).max(30),
  years: z.number().int().min(1).max(30),
  monthlyUsd: Usd,
  totalInterestUsd: Usd,
});
export type LoanEstimate = z.infer<typeof LoanEstimate>;

export const PublicOfferInput = z.strictObject({
  offers: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(120),
        costOfAttendanceUsd: Usd.max(200_000),
        lines: z
          .array(
            z.strictObject({
              label: z.string().min(1).max(120),
              amountUsd: Usd.max(200_000),
              category: OfferLineCategory,
              renewable: z.boolean(),
            }),
          )
          .max(30),
      }),
    )
    .min(1)
    .max(4),
});
export type PublicOfferInput = z.infer<typeof PublicOfferInput>;

/**
 * Aid rules and deadlines maintained by admins at /admin/aid (R2P-1). Dev data comes from the
 * marked sample seed in plan 03. Rates are percentages (6.39 means 6.39%).
 */
export const FederalLoanRates = z.strictObject({
  subsidized: z.number().min(0).max(30),
  unsubsidized: z.number().min(0).max(30),
  parent_plus: z.number().min(0).max(30),
});
export type FederalLoanRates = z.infer<typeof FederalLoanRates>;

export const AidRuleKey = z.enum(["federal_loan_rates"]);
export type AidRuleKey = z.infer<typeof AidRuleKey>;

export const AidRule = z.strictObject({
  id: Id,
  awardYear: AwardYear,
  key: AidRuleKey,
  value: FederalLoanRates,
  sourceUrl: HttpUrl,
  verifiedAt: IsoDateTime,
});
export type AidRule = z.infer<typeof AidRule>;

export const AidRuleInput = z.strictObject({
  awardYear: AwardYear,
  key: AidRuleKey,
  value: FederalLoanRates,
  sourceUrl: HttpUrl,
});
export type AidRuleInput = z.infer<typeof AidRuleInput>;

/** Insert when `id` is missing, update otherwise. `state: null` is a federal deadline. */
export const AidDeadlineInput = z.strictObject({
  id: Id.optional(),
  awardYear: AwardYear,
  state: USState.nullable(),
  program: z.string().trim().min(1).max(80),
  deadline: IsoDate.nullable(),
  note: z.string().max(300).default(""),
  sourceUrl: HttpUrl,
});
export type AidDeadlineInput = z.infer<typeof AidDeadlineInput>;
```

`packages/domain/src/aid.ts`:

```ts
import { z } from "zod";
import { HttpUrl, AwardYear, Id, IsoDate, IsoDateTime, TaskStatus } from "./common";

export const AidProgram = z.enum(["fafsa", "css"]);
export type AidProgram = z.infer<typeof AidProgram>;

export const AssigneeKind = z.enum(["student", "parent"]);
export type AssigneeKind = z.infer<typeof AssigneeKind>;

export const AidChecklistItem = z.strictObject({
  id: Id,
  awardYear: AwardYear,
  program: AidProgram,
  collegeId: z.string().nullable(),
  key: z.string(),
  title: z.string(),
  assignee: AssigneeKind,
  status: TaskStatus,
  dueOn: IsoDate.nullable(),
  completedAt: IsoDateTime.nullable(),
});
export type AidChecklistItem = z.infer<typeof AidChecklistItem>;

export const AidChecklist = z.strictObject({
  program: AidProgram,
  awardYear: AwardYear,
  collegeId: z.string().nullable(),
  collegeName: z.string().nullable(),
  items: z.array(AidChecklistItem),
  doneCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
});
export type AidChecklist = z.infer<typeof AidChecklist>;

export const AidChecklistPatch = z.strictObject({ status: TaskStatus });
export type AidChecklistPatch = z.infer<typeof AidChecklistPatch>;

export const AidDeadline = z.strictObject({
  id: Id,
  awardYear: AwardYear,
  state: z.string().nullable(),
  program: z.string(),
  deadline: IsoDate.nullable(),
  note: z.string(),
  sourceUrl: HttpUrl,
  verifiedAt: IsoDateTime,
});
export type AidDeadline = z.infer<typeof AidDeadline>;

/** FAFSA steps for one award year. `assignee: "parent"` steps also become family tasks. */
export const FAFSA_STEPS: Array<{ key: string; title: string; assignee: "student" | "parent" }> = [
  { key: "studentaid_account", title: "Create your StudentAid.gov account", assignee: "student" },
  { key: "invite_contributors", title: "Add your parent as a contributor on the FAFSA", assignee: "student" },
  { key: "contributor_account", title: "Create a StudentAid.gov account and add your info as a contributor", assignee: "parent" },
  { key: "contributor_consent", title: "Give consent to share federal tax information", assignee: "parent" },
  { key: "student_sections", title: "Fill in your sections and list your colleges", assignee: "student" },
  { key: "submit", title: "Submit the FAFSA", assignee: "student" },
  { key: "review_summary", title: "Review your FAFSA Submission Summary", assignee: "student" },
];

export const CSS_STEPS: Array<{ key: string; title: string; assignee: "student" | "parent" }> = [
  { key: "css_account", title: "Create a College Board account for the CSS Profile", assignee: "student" },
  { key: "css_parent_info", title: "Enter household finances on the CSS Profile", assignee: "parent" },
  { key: "css_submit", title: "Submit the CSS Profile to this college", assignee: "student" },
];
```

`packages/domain/src/plan.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: PASS (money file 9 tests added).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src
git commit -m "feat(domain): money, aid, plan schemas"
```

### B7: Helpers, crew, catalog

- [ ] **Step 1: Write the failing tests**

`packages/domain/src/crew.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ActionCard, CrewReply, CrewRequestInput, SpecialistResult, ThisWeekView } from "./crew";
import { HelperView } from "./helpers";

const reply = {
  text: "Start with the Hill Country STEM Award.",
  contributors: ["compass", "scout", "quill"],
  question: null,
  actionCards: [
    {
      kind: "add_plan_item",
      id: "hill-country",
      label: "Add to my weekend",
      item: { title: "Hill Country STEM Award", kind: "scholarship", refType: "scholarship", refId: null, minutes: 30, valueUsd: 1000, dueOn: "2026-10-15", contributors: ["scout"], weekStart: null },
    },
  ],
  receipt: [{ kind: "catalog", label: "Hill Country listing", refId: null, sourceUrl: "https://example.org/hc", verifiedAt: "2026-10-02T15:00:00.000Z" }],
  safety: null,
  needsInput: false,
};

describe("CrewReply", () => {
  it("parses a full reply", () => {
    expect(CrewReply.parse(reply).actionCards).toHaveLength(1);
  });

  it("rejects unknown keys and more than 4 action cards", () => {
    expect(CrewReply.safeParse({ ...reply, extra: 1 }).success).toBe(false);
    const cards = Array.from({ length: 5 }, (_, i) => ({ kind: "open_link", id: `c${i}`, label: "Open", href: "/week" }));
    expect(CrewReply.safeParse({ ...reply, actionCards: cards }).success).toBe(false);
  });

  it("requires at least one contributor", () => {
    expect(CrewReply.safeParse({ ...reply, contributors: [] }).success).toBe(false);
  });
});

describe("ActionCard", () => {
  it("only allows internal links", () => {
    expect(ActionCard.safeParse({ kind: "open_link", id: "a", label: "Open", href: "/scholarships/rotary" }).success).toBe(true);
    expect(ActionCard.safeParse({ kind: "open_link", id: "a", label: "Open", href: "https://evil.example" }).success).toBe(false);
    expect(ActionCard.safeParse({ kind: "open_link", id: "a", label: "Open", href: "//evil.example" }).success).toBe(false);
  });

  it("restricts card ids", () => {
    expect(ActionCard.safeParse({ kind: "open_link", id: "Bad Id!", label: "Open", href: "/week" }).success).toBe(false);
  });
});

describe("SpecialistResult", () => {
  it("parses a specialist hand-off", () => {
    const r = SpecialistResult.parse({
      role: "scout",
      summary: "3 matches due within 3 weeks.",
      proposedActions: [{ title: "Hill Country STEM Award", minutes: 30, dueOn: "2026-10-15", valueUsd: 1000, refType: "scholarship", refId: null }],
      factsUsed: [{ claim: "Deadline Oct 15", source: "catalog", refId: null, verifiedAt: null }],
      uncertainty: [],
      needsPermission: [],
    });
    expect(r.role).toBe("scout");
  });

  it("does not accept compass as a specialist", () => {
    expect(SpecialistResult.safeParse({ role: "compass", summary: "", proposedActions: [], factsUsed: [], uncertainty: [], needsPermission: [] }).success).toBe(false);
  });
});

describe("ThisWeekView", () => {
  it("allows an empty week", () => {
    expect(
      ThisWeekView.safeParse({
        greetingName: "Jordan",
        weekStart: "2026-10-05",
        nextStep: null,
        plan: { weekStart: "2026-10-05", items: [], totalMinutes: 0, doneCount: 0 },
        gap: null,
        deadlines: [],
        sweep: null,
        crewWorking: true,
      }).success,
    ).toBe(true);
  });
});

describe("HelperView", () => {
  it("always carries the recommendation request note and due date (D38)", () => {
    const view = {
      studentName: "Jordan",
      helperRole: "recommender",
      label: "Recommendation for Ms. Patel",
      expiresAt: "2026-11-05T15:00:00.000Z",
      activities: null,
      stories: [{ title: "STEM nights", summary: "Ran monthly STEM nights at the library." }],
      deadlines: null,
      colleges: null,
      scholarships: null,
      request: { message: "Please mention robotics.", dueDate: "2027-01-15" },
    };
    expect(HelperView.safeParse(view).success).toBe(true);
    expect(HelperView.safeParse({ ...view, request: { message: null, dueDate: null } }).success).toBe(true);
    expect(HelperView.safeParse({ ...view, request: { message: null, dueDate: "Jan 15" } }).success).toBe(false);
    expect(HelperView.safeParse({ ...view, request: undefined }).success).toBe(false);
  });
});

describe("CrewRequestInput", () => {
  const input = {
    jobId: "00000000-0000-4000-8000-000000000000",
    ownerId: "00000000-0000-4000-8000-000000000001",
    conversationId: "00000000-0000-4000-8000-000000000002",
    room: "family",
    roomRef: null,
    audience: "family",
    requester: { role: "parent", firstName: "Maria" },
    userText: "How are things going?",
    history: [
      { author: "user", speaker: "student", text: "I finished the FAFSA." },
      { author: "crew", speaker: "crew", text: "Nice work." },
    ],
    mentions: [],
  };

  it("parses a parent requester and speaker-labeled history (D42, R2C-1)", () => {
    const v = CrewRequestInput.parse(input);
    expect(v.requester).toEqual({ role: "parent", firstName: "Maria" });
    expect(v.history.map((h) => h.speaker)).toEqual(["student", "crew"]);
    expect(CrewRequestInput.safeParse({ ...input, requester: { role: "parent", firstName: "" } }).success).toBe(true);
    expect(CrewRequestInput.safeParse({ ...input, requester: { role: "admin", firstName: "A" } }).success).toBe(false);
    const { requester: _omit, ...noRequester } = input;
    expect(CrewRequestInput.safeParse(noRequester).success).toBe(false);
  });

  it("rejects a history line with no speaker", () => {
    expect(CrewRequestInput.safeParse({ ...input, history: [{ author: "user", text: "Hi" }] }).success).toBe(false);
    expect(CrewRequestInput.safeParse({ ...input, history: [{ author: "user", speaker: "helper", text: "Hi" }] }).success).toBe(false);
  });
});

describe("internal links", () => {
  it("refuses slash and backslash authority tricks", () => {
    for (const href of ["//evil.example", "/\\evil.example", "/\\\\evil.example"]) {
      expect(ActionCard.safeParse({ kind: "open_link", id: "bad", label: "Open", href }).success).toBe(false);
    }
  });
});

```

`packages/domain/src/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CatalogTaskPayload, ListingDraft, ScholarshipUpsertInput } from "./catalog";

const draft = {
  name: "Rotary Club of Eastside Scholarship",
  provider: "Rotary Club of Eastside",
  url: "https://example.org/rotary",
  amountMinUsd: 2500,
  amountMaxUsd: 2500,
  renewable: false,
  deadline: "2026-10-30",
  applicationFeeUsd: null,
  localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
  eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
  requirements: { essays: [{ prompt: "Describe a time you served your community.", wordLimit: 500 }], recommendations: 0, transcript: false, serviceHours: null, other: [] },
  fieldQuotes: [{ field: "deadline", quote: "Applications are due October 30, 2026." }],
};

describe("catalog schemas", () => {
  it("parses a listing draft", () => {
    expect(ListingDraft.parse(draft).fieldQuotes).toHaveLength(1);
  });

  it("parses task payloads by type", () => {
    const p = CatalogTaskPayload.parse({ type: "user_submission", url: "https://example.org/x", name: "X Award", notes: "", submittedById: "00000000-0000-4000-8000-000000000000" });
    expect(p.type).toBe("user_submission");
  });

  it("accepts a user_submission payload with or without the extracted draft and report", () => {
    const base = { type: "user_submission", url: "https://example.org/x", name: "X Award", notes: "", submittedById: "00000000-0000-4000-8000-000000000000" };
    const bare = CatalogTaskPayload.parse(base);
    expect(bare.type === "user_submission" && bare.draft).toBeUndefined();
    const report = { ok: true, issues: [], scamFlags: [] };
    const full = CatalogTaskPayload.parse({ ...base, draft, report });
    expect(full.type === "user_submission" && full.draft?.name).toBe(draft.name);
    expect(full.type === "user_submission" && full.report?.ok).toBe(true);
    expect(CatalogTaskPayload.parse({ ...base, draft: null, report: null })).toMatchObject({ draft: null, report: null });
  });

  it("requires min amount not above max", () => {
    const base = {
      id: null,
      slug: "rotary-eastside",
      name: draft.name,
      provider: draft.provider,
      url: draft.url,
      sourceUrl: draft.url,
      amountMinUsd: 3000,
      amountMaxUsd: 2500,
      renewable: false,
      renewalTerms: "",
      deadline: "2026-10-30",
      cycle: "2026-27",
      localArea: draft.localArea,
      eligibility: draft.eligibility,
      requirements: draft.requirements,
      estMinutes: 45,
      scamFlags: [],
    };
    expect(ScholarshipUpsertInput.safeParse(base).success).toBe(false);
    expect(ScholarshipUpsertInput.safeParse({ ...base, amountMinUsd: 2500 }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: FAIL with `Failed to resolve import "./crew"`, `"./helpers"`, and `"./catalog"`.

- [ ] **Step 3: Write the implementation**

`packages/domain/src/helpers.ts`:

```ts
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
  scholarships: z.array(z.strictObject({ name: z.string(), deadline: z.string().nullable(), stage: z.string() })).nullable(),
  /** The recommendation request behind this link (D38). Both null for links not made by `requestRecommendation`. */
  request: z.strictObject({ message: z.string().nullable(), dueDate: IsoDate.nullable() }),
});
export type HelperView = z.infer<typeof HelperView>;
```

`packages/domain/src/crew.ts`:

```ts
import { ShareCategory } from "./common";
import { z } from "zod";
import { AppPlan, Fit } from "./colleges";
import { HttpUrl, CrewRole, Id, IsoDate, IsoDateTime, SpecialistRole, Usd } from "./common";
import { EssayInput } from "./essays";
import { DecisionInput, FactInput } from "./memory";
import { CostSummary } from "./money";
import { Deadline, PlanItem, PlanItemInput, WeekPlan } from "./plan";
import { SweepSummary } from "./scholarships";

export const RoomKind = z.enum(["my_crew", "family", "temporary", "scholarship", "college", "essay"]);
export type RoomKind = z.infer<typeof RoomKind>;

export const Conversation = z.strictObject({
  id: Id,
  room: RoomKind,
  roomRefId: z.string().nullable(),
  familyId: Id.nullable(),
  title: z.string(),
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime.nullable(),
  lastMessageAt: IsoDateTime.nullable(),
});
export type Conversation = z.infer<typeof Conversation>;

export const ConversationInput = z.strictObject({
  room: RoomKind,
  roomRefId: z.string().max(64).nullable().default(null),
  familyId: Id.nullable().default(null),
  title: z.string().max(120).default(""),
});
export type ConversationInput = z.infer<typeof ConversationInput>;

export const CardId = z.string().regex(/^[a-z0-9_-]{1,32}$/);
const CardLabel = z.string().min(1).max(80);
/** Internal app paths only: starts with "/" but not "//". */
export const InternalHref = z.string().max(300).regex(/^\/(?![\/\\])[^\s\\]*$/);

export const ActionCard = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("add_plan_item"), id: CardId, label: CardLabel, item: PlanItemInput }),
  z.strictObject({ kind: z.literal("save_scholarship"), id: CardId, label: CardLabel, scholarshipId: Id }),
  z.strictObject({ kind: z.literal("add_college"), id: CardId, label: CardLabel, collegeId: z.string().min(1).max(12), fit: Fit, plan: AppPlan }),
  z.strictObject({ kind: z.literal("start_essay"), id: CardId, label: CardLabel, essay: EssayInput }),
  z.strictObject({ kind: z.literal("open_link"), id: CardId, label: CardLabel, href: InternalHref }),
  z.strictObject({ kind: z.literal("record_decision"), id: CardId, label: CardLabel, decision: DecisionInput }),
  z.strictObject({ kind: z.literal("confirm_fact"), id: CardId, label: CardLabel, fact: FactInput }),
]);
export type ActionCard = z.infer<typeof ActionCard>;
export type ActionCardKind = ActionCard["kind"];

export const ReceiptItem = z.strictObject({
  kind: z.enum(["fact", "record", "catalog", "calculation"]),
  label: z.string().min(1).max(140),
  refId: z.string().max(64).nullable(),
  sourceUrl: HttpUrl.nullable(),
  verifiedAt: IsoDateTime.nullable(),
});
export type ReceiptItem = z.infer<typeof ReceiptItem>;

export const SafetyFlag = z.enum(["crisis", "refusal", "limit", "partial"]);
export type SafetyFlag = z.infer<typeof SafetyFlag>;

export const CrewReply = z.strictObject({
  text: z.string().min(1).max(2000),
  contributors: z.array(CrewRole).min(1).max(8),
  question: z.string().max(300).nullable(),
  actionCards: z.array(ActionCard).max(4),
  receipt: z.array(ReceiptItem).max(12),
  safety: SafetyFlag.nullable(),
  needsInput: z.boolean(),
});
export type CrewReply = z.infer<typeof CrewReply>;

export const ProposedAction = z.strictObject({
  title: z.string().min(1).max(120),
  minutes: z.number().int().min(0).max(600),
  dueOn: IsoDate.nullable(),
  valueUsd: Usd.nullable(),
  refType: z.string().max(40).nullable(),
  refId: z.string().max(64).nullable(),
});
export type ProposedAction = z.infer<typeof ProposedAction>;

export const FactUsed = z.strictObject({
  claim: z.string().min(1).max(200),
  source: z.enum(["profile", "record", "catalog", "calculation", "document"]),
  refId: z.string().max(64).nullable(),
  verifiedAt: IsoDateTime.nullable(),
});
export type FactUsed = z.infer<typeof FactUsed>;

export const SpecialistResult = z.strictObject({
  role: SpecialistRole,
  summary: z.string().max(1200),
  proposedActions: z.array(ProposedAction).max(6),
  factsUsed: z.array(FactUsed).max(12),
  uncertainty: z.array(z.string().max(200)).max(6),
  needsPermission: z.array(z.string().max(120)).max(4),
});
export type SpecialistResult = z.infer<typeof SpecialistResult>;

export const MessageAuthor = z.enum(["user", "crew"]);
export type MessageAuthor = z.infer<typeof MessageAuthor>;

/** Who said a history line, as Compass labels it (D42, R2C-1). */
export const CrewSpeaker = z.enum(["student", "parent", "crew"]);
export type CrewSpeaker = z.infer<typeof CrewSpeaker>;

/** Who asked the current request. `firstName` may be "" when the account has no name. */
export const CrewRequester = z.strictObject({ role: z.enum(["student", "parent"]), firstName: z.string().max(60) });
export type CrewRequester = z.infer<typeof CrewRequester>;

export const Message = z.strictObject({
  id: Id,
  conversationId: Id,
  authorKind: MessageAuthor,
  authorUserId: Id.nullable(),
  body: z.string(),
  reply: CrewReply.nullable(),
  createdAt: IsoDateTime,
  appliedCardIds: z.array(z.string()),
  sharedCategories: z.array(ShareCategory).nullable(),
});
export type Message = z.infer<typeof Message>;

export const SendMessageInput = z.strictObject({ body: z.string().trim().min(1).max(4000) });
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const JobKind = z.enum(["crew_request", "weekly_plan", "essay_review", "offer_parse", "appeal_outline", "retake_analysis"]);
export type JobKind = z.infer<typeof JobKind>;

export const JobStatus = z.enum(["queued", "working", "ready", "needs_input", "failed"]);
export type JobStatus = z.infer<typeof JobStatus>;
export const TERMINAL_JOB_STATUSES: JobStatus[] = ["ready", "needs_input", "failed"];

export const ProgressEvent = z.strictObject({
  at: IsoDateTime,
  role: z.union([CrewRole, z.literal("system")]),
  text: z.string().max(200),
});
export type ProgressEvent = z.infer<typeof ProgressEvent>;

export const CrewJob = z.strictObject({
  id: Id,
  kind: JobKind,
  status: JobStatus,
  conversationId: Id.nullable(),
  requestMessageId: Id.nullable(),
  resultMessageId: Id.nullable(),
  refId: z.string().nullable(),
  progress: z.array(ProgressEvent),
  error: z.string().nullable(),
  safety: SafetyFlag.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type CrewJob = z.infer<typeof CrewJob>;

export const ApplyActionInput = z.strictObject({ messageId: Id, cardId: CardId });
export type ApplyActionInput = z.infer<typeof ApplyActionInput>;

export const ActionReceipt = z.strictObject({
  id: Id,
  messageId: Id,
  cardId: z.string(),
  appliedAt: IsoDateTime,
  result: z.record(z.string(), z.unknown()),
});
export type ActionReceipt = z.infer<typeof ActionReceipt>;

export const AgentRunRecord = z.strictObject({
  jobId: Id.nullable(),
  userId: Id.nullable(),
  role: z.string(),
  model: z.string(),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cacheReadTokens: z.number().int().min(0),
  cacheWriteTokens: z.number().int().min(0),
  stopReason: z.string(),
  costMicros: z.number().int().min(0),
  durationMs: z.number().int().min(0),
});
export type AgentRunRecord = z.infer<typeof AgentRunRecord>;

/** Everything Compass and specialists see about the student up front. Built by the CrewDataPort. */
export const ContextSnapshot = z.strictObject({
  privateMatchCount: z.number().int().min(0),
  ownerId: Id,
  displayName: z.string(),
  today: IsoDate,
  timeZone: z.string(),
  audience: z.enum(["crew", "family"]),
  room: RoomKind,
  roomRef: z.strictObject({ type: z.string(), id: z.string() }).nullable(),
  profile: z.strictObject({
    classYear: z.number().int().nullable(),
    state: z.string(),
    county: z.string(),
    gpa: z.number().nullable(),
    intendedMajors: z.array(z.string()),
    interests: z.array(z.string()),
  }),
  facts: z.array(z.strictObject({ id: Id, key: z.string(), value: z.string(), source: z.string() })),
  decisions: z.array(z.strictObject({ id: Id, summary: z.string(), decidedAt: IsoDateTime })),
  weekPlan: WeekPlan,
  deadlines: z.array(Deadline),
  colleges: z.array(z.strictObject({ id: z.string(), name: z.string(), fit: Fit, plan: AppPlan })),
  enabledSpecialists: z.array(SpecialistRole),
});
export type ContextSnapshot = z.infer<typeof ContextSnapshot>;

export const CrewRequestInput = z.strictObject({
  jobId: Id,
  ownerId: Id,
  conversationId: Id,
  room: RoomKind,
  roomRef: z.strictObject({ type: z.string(), id: z.string() }).nullable(),
  audience: z.enum(["crew", "family"]),
  /** Who sent this request; a parent in a family room is not the student (D42, R2C-1). */
  requester: CrewRequester,
  userText: z.string().min(1).max(4000),
  history: z.array(z.strictObject({ author: MessageAuthor, speaker: CrewSpeaker, text: z.string() })).max(10),
  mentions: z.array(CrewRole),
});
export type CrewRequestInput = z.infer<typeof CrewRequestInput>;

export const CrewRunResult = z.strictObject({
  reply: CrewReply,
  status: z.enum(["ready", "needs_input", "failed"]),
  safety: SafetyFlag.nullable(),
  consulted: z.array(SpecialistRole),
});
export type CrewRunResult = z.infer<typeof CrewRunResult>;

export const ThisWeekView = z.strictObject({
  greetingName: z.string(),
  weekStart: IsoDate,
  nextStep: PlanItem.nullable(),
  plan: WeekPlan,
  gap: CostSummary.nullable(),
  deadlines: z.array(Deadline).max(4),
  sweep: SweepSummary.nullable(),
  crewWorking: z.boolean(),
});
export type ThisWeekView = z.infer<typeof ThisWeekView>;

/** Parse "@Scout what's due" → ["scout"]. Case-insensitive, only known names. */
export function parseMentions(text: string): CrewRole[] {
  const found = new Set<CrewRole>();
  for (const m of text.matchAll(/@([A-Za-z]+)/g)) {
    const name = m[1]?.toLowerCase();
    const parsed = CrewRole.safeParse(name);
    if (parsed.success) found.add(parsed.data);
  }
  return [...found];
}
```

`packages/domain/src/catalog.ts`:

```ts
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
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(120),
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

export const ResolveReportInput = z.strictObject({ status: z.enum(["resolved", "rejected"]), note: z.string().max(1000) });
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: PASS (crew 11, catalog 4 added).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src
git commit -m "feat(domain): helper, crew, catalog schemas"
```

### B8: Notifications, extension, jobs, index

- [ ] **Step 1: Write the failing test**

`packages/domain/src/jobs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as domain from "./index";
import { QUEUE_EXPIRE_SECONDS, JOB_KIND_QUEUE, JOB_NAMES, JobPayloadSchemas } from "./jobs";

describe("job payloads", () => {
  it("has a payload schema for every job name and nothing else", () => {
    expect(JOB_NAMES).toHaveLength(20);
    expect(Object.keys(JobPayloadSchemas).sort()).toEqual([...JOB_NAMES].sort());
    expect(JOB_NAMES.indexOf("plan.weekly.fanout")).toBe(JOB_NAMES.indexOf("plan.weekly") + 1);
    expect(JOB_NAMES.indexOf("notify.sms")).toBe(JOB_NAMES.indexOf("notify.email") + 1);
  });

  it("validates payloads", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(JobPayloadSchemas["crew.request"].safeParse({ jobId: id }).success).toBe(true);
    expect(JobPayloadSchemas["crew.request"].safeParse({}).success).toBe(false);
    expect(JobPayloadSchemas["sweep.weekly"].safeParse({}).success).toBe(true);
    expect(JobPayloadSchemas["catalog.research"].safeParse({ state: "TX", county: null }).success).toBe(true);
  });

  it("takes plan.weekly with or without a source, and the fan-out and SMS payloads (R2C-5, R2I-9)", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(JobPayloadSchemas["plan.weekly"].parse({ jobId: id, ownerId: id }).source).toBeUndefined();
    expect(JobPayloadSchemas["plan.weekly"].parse({ jobId: id, ownerId: id, source: "system" }).source).toBe("system");
    expect(JobPayloadSchemas["plan.weekly"].safeParse({ jobId: id, ownerId: id, source: "cron" }).success).toBe(false);
    expect(JobPayloadSchemas["plan.weekly.fanout"].safeParse({}).success).toBe(true);
    expect(JobPayloadSchemas["plan.weekly.fanout"].safeParse({ ownerId: id }).success).toBe(false);
    expect(JobPayloadSchemas["notify.sms"].safeParse({ notificationId: id }).success).toBe(true);
    expect(JobPayloadSchemas["notify.sms"].safeParse({}).success).toBe(false);
  });
});

describe("index", () => {
  it("re-exports every module", () => {
    for (const name of ["AppError", "User", "Profile", "MemoryFact", "FamilyView", "Scholarship", "College", "Essay", "TestScore", "ServiceLog", "OfferComparison", "AidChecklist", "PlanItem", "HelperView", "CrewReply", "CatalogTask", "Notification", "Subscription", "DocumentMeta", "AutofillProfile", "JobPayloadSchemas", "parseMentions", "STATE_NAMES", "localLabel", "CrewSpeaker", "CrewRequester", "PROFILE_FACT_KEYS", "FederalLoanRates", "AidRuleKey", "AidRule", "AidRuleInput", "AidDeadlineInput", "RecRequestPatch", "EssayPatch", "awardYearFor", "DisplayName", "APP_PLAN_LABELS", "APPLICATION_STAGE_LABELS"]) {
      expect(domain).toHaveProperty(name);
    }
    expect(domain.APP_PLAN_LABELS.RD).toBe("Regular Decision");
    expect(domain.APPLICATION_STAGE_LABELS.lost).toBe("Didn't win");
    expect(Object.keys(domain.APP_PLAN_LABELS).sort()).toEqual([...domain.AppPlan.options].sort());
    expect(Object.keys(domain.APPLICATION_STAGE_LABELS).sort()).toEqual([...domain.ApplicationStage.options].sort());
  });

  it("parses mentions", () => {
    expect(domain.parseMentions("@Ledger how much? cc @scout and @Nobody")).toEqual(["ledger", "scout"]);
  });
});

describe("queue expiry contracts", () => {
  it("covers every queue and crew kind", () => {
    expect(Object.keys(QUEUE_EXPIRE_SECONDS).sort()).toEqual([...JOB_NAMES].sort());
    expect(QUEUE_EXPIRE_SECONDS["crew.request"]).toBe(1200);
    expect(QUEUE_EXPIRE_SECONDS["catalog.research"]).toBe(2400);
    expect(QUEUE_EXPIRE_SECONDS["essay.review"]).toBe(900);
    expect(Object.keys(JOB_KIND_QUEUE)).toHaveLength(6);
    expect(JOB_KIND_QUEUE.offer_parse).toBe("offer.parse");
  });
});

```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scholarcrew/domain test`
Expected: FAIL with `Failed to resolve import "./index"`.

- [ ] **Step 3: Write the implementation**

`packages/domain/src/notifications.ts`:

```ts
import { z } from "zod";
import { Id, IsoDateTime } from "./common";

export const NotificationKind = z.enum(["new_matches", "deadline", "job_ready", "family", "digest", "system"]);
export type NotificationKind = z.infer<typeof NotificationKind>;

export const Notification = z.strictObject({
  id: Id,
  kind: NotificationKind,
  title: z.string(),
  body: z.string(),
  link: z.string(),
  createdAt: IsoDateTime,
  readAt: IsoDateTime.nullable(),
});
export type Notification = z.infer<typeof Notification>;

export const NotificationPrefs = z.strictObject({
  digestDay: z.number().int().min(0).max(6),
  digestHour: z.number().int().min(0).max(23),
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  phoneSet: z.boolean(),
  quietStartHour: z.number().int().min(0).max(23),
  quietEndHour: z.number().int().min(0).max(23),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

export const NotificationPrefsPatch = z.strictObject({
  digestDay: z.number().int().min(0).max(6).optional(),
  digestHour: z.number().int().min(0).max(23).optional(),
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/).nullable().optional(),
  quietStartHour: z.number().int().min(0).max(23).optional(),
  quietEndHour: z.number().int().min(0).max(23).optional(),
});
export type NotificationPrefsPatch = z.infer<typeof NotificationPrefsPatch>;
```

`packages/domain/src/extension.ts`:

```ts
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
```

`packages/domain/src/jobs.ts`:

```ts
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
  JOB_NAMES.map((name) => [name, name === "catalog.research" ? 2400 : name === "crew.request" || name === "plan.weekly" ? 1200 : 900]),
) as Record<JobName, number>;
export const JOB_KIND_QUEUE: Record<JobKind, JobName> = {
  crew_request: "crew.request", weekly_plan: "plan.weekly", essay_review: "essay.review",
  offer_parse: "offer.parse", appeal_outline: "appeal.outline", retake_analysis: "prep.retake",
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
```

`packages/domain/src/safety.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CrewReply } from "./crew";
import { CRISIS_REPLY, detectCrisis } from "./safety";

describe("crisis keyword floor", () => {
  it("catches normalized English and Spanish danger phrases", () => {
    for (const text of ["kms", "unalive", "don't want to be here anymore", "don't wanna to be alive anymore", "want to hurt myself", "wanna to kill myself", "going to kill myself", "overdose", "overdosing", "quiero morir", "quiero morirme", "me quiero matar", "me quiero morir", "matarme", "suicidarme", "suicidio", "suicidarse", "no quiero vivir", "no quiero seguir viviendo", "no quiero estar aquí", "hacerme daño", "lastimarme", "quitarme la vida", "acabar con mi vida", "kill my self", "kill\u200bmyself"]) {
      expect(detectCrisis(text), text).toBe(true);
    }
  });
  it("keeps hyperbole out and provides a valid bilingual reply", () => {
    for (const text of ["kill me now", "me muero de risa", "this essay is killing me", "I could die laughing"]) expect(detectCrisis(text)).toBe(false);
    expect(CrewReply.safeParse(CRISIS_REPLY).success).toBe(true);
    expect(CRISIS_REPLY.text).toContain("988");
    expect(CRISIS_REPLY.text).toContain("En español");
  });
});
```

`packages/domain/src/safety.ts`:

```ts
import type { CrewReply } from "./crew";

/** Phrases that mean the student may be in danger. Hyperbole like "this essay is killing me" doesn't match. */
export const CRISIS_PATTERNS: RegExp[] = [
  /\bkill(?:ing)? ?myself\b/,
  /\bend(?:ing)? my (?:own )?life\b/,
  /\bend it all\b/,
  /\btake my (?:own )?life\b/,
  /\bsuicid(?:e|al)\b/,
  /\bwants? to die\b/,
  /\bwanna die\b/,
  /\bhurt(?:ing)? myself\b/,
  /\bcut(?:ting)? myself\b/,
  /\bself[- ]?harm/,
  /\bno reason to live\b/,
  /\bdon'?t want to (?:live|be alive|exist)\b/,
  /\bbetter off dead\b/,
  /\bbetter off without me\b/,
  /\bkms\b/, /\bunalive\b/, /\bdon'?t (?:want|wanna) to be (?:here|alive) anymore\b/,
  /\b(?:want|wanna|going) to (?:hurt|kill) myself\b/, /\boverdos(?:e|ing)\b/,
  /\bquiero morir(?:me)?\b/, /\bme quiero (?:matar|morir)\b/, /\bmatarme\b/,
  /\bsuicid(?:e|al|arme|io|arse)\b/, /\bno quiero (?:vivir|seguir viviendo|estar aqui)\b/,
  /\bhacerme dano\b/, /\blastimarme\b/, /\bquitarme la vida\b/, /\bacabar con mi vida\b/,
];

export function normalizeForCrisis(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[‘’]/g, "'")
    .replace(/\p{Cf}/gu, "").normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ").replace(/\bmy self\b/g, "myself");
}
export function detectCrisis(text: string): boolean {
  return CRISIS_PATTERNS.some((pattern) => pattern.test(normalizeForCrisis(text)));
}

/** Reviewed copy. Sent instead of planning; no specialists run (CR-09). */
export const CRISIS_REPLY: CrewReply = {
  text: "I'm really glad you told me. If you're thinking about hurting yourself, please call or text 988 to reach the 988 Suicide & Crisis Lifeline. It's free and open 24/7. If you're in danger right now, call 911. En español: llama o envía un mensaje de texto al 988. I'm here when you want to get back to your plans.",
  contributors: ["compass"],
  question: null,
  actionCards: [],
  receipt: [],
  safety: "crisis",
  needsInput: false,
};
```

`detectCrisis` is a keyword floor, not a clinical classifier. It runs before limits; Compass also hands off indirect crisis messages. Writing artifacts are not checked.

`packages/domain/src/index.ts`:

```ts
export * from "./common";
export * from "./identity";
export * from "./billing";
export * from "./documents";
export * from "./memory";
export * from "./family";
export * from "./scholarships";
export * from "./geo";
export * from "./colleges";
export * from "./profile";
export * from "./essays";
export * from "./prep";
export * from "./impact";
export * from "./money";
export * from "./aid";
export * from "./plan";
export * from "./helpers";
export * from "./crew";
export * from "./catalog";
export * from "./notifications";
export * from "./extension";
export * from "./jobs";
export * from "./safety";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scholarcrew/domain test && pnpm --filter @scholarcrew/domain typecheck`
Expected: PASS (all domain tests), and `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src
git commit -m "feat(domain): notifications, extension, jobs, index"
```

## Success Criteria

- [ ] `pnpm --filter @scholarcrew/domain typecheck` exits 0.
- [ ] `pnpm --filter @scholarcrew/domain test` exits 0 with every test in `src/*.test.ts` passing.
- [ ] `pnpm lint` reports no errors under `packages/domain`.
- [ ] `grep -rn "zod/v3\|z.string().uuid()\|z.string().email()" packages/domain/src` prints nothing (Zod 4 idioms only).

## Testing Requirements

- Command: `pnpm --filter @scholarcrew/domain test`
- Expected: 12 test files, all passing. The jobs test proves `JobPayloadSchemas` and `JOB_NAMES` stay in sync; the crew test proves the model-facing `CrewReply`, `ActionCard`, and `SpecialistResult` schemas reject extra keys and external links. The profile test proves `ProfilePatch` and `OnboardingInput` reject a time zone `Intl` doesn't know (`Mars/Base`). Round 1 additions: the geo test proves `STATE_NAMES` covers every `US_STATES` code and `localLabel` formats national, state, county, and city areas (D41); the scholarships test covers `excludeScams` (D39) and the `openOn` date (F-18-3); the impact test covers `Essay.latestWordCount` (D34); the money test covers `Offer.parseJobId` (D31) and the 30-day `Reminder.offset` (D2); the crew test covers `HelperView.request` (D38); the catalog test covers the optional `draft` and `report` on the `user_submission` payload (plan 11 K6). Round 2 additions (9 new test cases): the crew test parses a parent `requester` and rejects a history line with no `speaker` (R2C-1); the jobs test pins `JOB_NAMES` at 20 names (adds `plan.weekly.fanout` and `notify.sms`) and covers `plan.weekly` with and without `source` (R2C-5, R2I-9); the memory test pins `PROFILE_FACT_KEYS` at 8 (R2I-1); the money test rejects a 31% loan rate in `AidRuleInput` and covers `AidDeadlineInput` (R2P-1); the impact test covers `ServiceLog.verificationExpiresAt` null and set (R2P-10) and rejects an empty `EssayPatch` (R2P-14); the profile test rejects `"requested"` in `RecRequestPatch` (R2P-11); the index test lists every new export. Round 3 additions (2 new test cases): the common test maps a season to its award year with `awardYearFor` (R3V-7, moved from 07 G8); the profile test trims `DisplayName` and refuses `"Maya\nLopez"` in `ProfilePatch` and `OnboardingInput` (R3E-10); the index test lists `awardYearFor`, `DisplayName`, `APP_PLAN_LABELS`, and `APPLICATION_STAGE_LABELS` and checks both label maps cover their enums (R3V-8), with no new case. Per-file counts after round 4: common 9, memory 8, family 3, scholarships 8, geo 2, profile 8, impact 9, money 9, crew 12, catalog 4, jobs 6, safety 2 (80 tests).

Round 4 additionally proves bilingual crisis normalization and hyperbole exclusions, canonical sensitive key/value detection, HTTP-only URLs, backslash-safe internal links, private reason detection, and queue expiry coverage.

## Review Checklist

- [ ] Every schema name referenced in `00-overview.md` sections 9 and 10 exists and is exported from `src/index.ts`.
- [ ] Model-produced schemas (`CrewReply`, `SpecialistResult`, `QuillCommentDraft`, `ParsedOffer`, `ListingDraft`, `PlanItemInput`, `EssayInput`, `FactInput`, `DecisionInput`) use `nullable` + `default` instead of bare `optional`, so the strict JSON schema marks every property required.
- [ ] No file imports from a file later in the import order listed at the top.
- [ ] Money fields are integers ending in `Usd`; GPA and rates are numbers in the domain and `X100`/`X1000` integers only in the DB.
- [ ] Every user-supplied `timeZone` input uses `TimeZone` from `common.ts`, so `Intl` can't throw `RangeError` later.
- [ ] `HelperScope` excludes essays, chats, costs, and sensitive.
