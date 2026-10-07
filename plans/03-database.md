# Plan 03: Database (Agent C)

`@scholarcrew/db` holds the Drizzle schema for every table in `00-overview.md` section 8, the generated migrations, the database client, the test helpers every Postgres-backed package uses, and a dev seed built from the fictional mockup data. It implements the storage side of SE-01 (every owner key references `users` and cascades on delete, so account purge removes a person's data), SE-02 (`bytea` columns for AES-256-GCM ciphertext, IVs, and tags), and SE-07 (expiry columns on sessions, magic links, facts, chats, helper links, verifications, and exports), and it's the storage behind every other feature ID. Prerequisites: plans 01 and 02 are done, `.env` exists (copied from `.env.example`), and Docker is running.

Rules this plan follows on top of section 8:

- Every foreign key to `users` cascades on delete, except the three section 8 marks `set null` (`families.createdById`, `scholarships.submittedById`, `catalogReports.reporterId`). That covers non-owner keys like `familyTasks.assigneeId` and `essayVersions.authorId`, so deleting a user never fails on a dangling reference.
- Column types are exactly section 8. A few `text`/`text[]` columns get a narrower TypeScript type with `$type<T>()` from `@scholarcrew/domain` (no SQL change): `scholarships.scamFlags` (`ScamFlag[]`), `helperLinks.scope` (`HelperScope[]`), `apiTokens.scopes` (`ApiTokenScope[]`), `planItems.contributors` (`CrewRole[]`), `crewJobs.safety` (`SafetyFlag`).
- The `exports` table is exported as `exportsTable`; no module declares or imports a binding named `exports`.
- Paths are resolved with `fileURLToPath(import.meta.url)` plus `node:path`, never `new URL("...", import.meta.url)`, because webpack (Next.js) treats that pattern as an asset import.
- `runMigrations` holds a Postgres advisory lock while it migrates, so two packages' Vitest `globalSetup` can't migrate the test database at the same time.

Public surface (section 9.1, plus extras marked +):

- `@scholarcrew/db`: `schema` namespace, every table and enum by name, `Db`, `Tx`, `DbOrTx`, `createDb`, `runMigrations`, the drizzle operators `and, or, eq, ne, gt, gte, lt, lte, inArray, isNull, isNotNull, desc, asc, sql, ilike, count`, + `pgErrorCode(e)` (SQLSTATE even when drizzle wraps the driver error).
- `@scholarcrew/db/testing`: `getTestDb`, `resetDb`, `setupTestDatabase`, `factories`, `testDatabaseUrl`, + `closeTestDb`, `TABLE_NAMES`, `parseEnvFile`, `resolveTestDatabaseUrl`, `DEFAULT_TEST_DATABASE_URL`, `Factories` type.
- `@scholarcrew/db/seed`: `seedDev`, + `SEED_EMAILS`, `SEED_TOKENS`.

Other packages wire the test database like this (their own files, shown for reference):

```ts
// <package>/test/global-setup.ts
import { setupTestDatabase } from "@scholarcrew/db/testing";
export default setupTestDatabase;
```

## Files

- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/vitest.config.ts`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/drizzle/**` (gen: `pnpm --filter @scholarcrew/db generate`, never hand-written)
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/migrate.ts`
- Create: `packages/db/src/errors.ts`
- Create: `packages/db/src/cli/migrate.ts`
- Create: `packages/db/src/cli/seed.ts`
- Create: `packages/db/src/schema/columns.ts`
- Create: `packages/db/src/schema/enums.ts`
- Create: `packages/db/src/schema/identity.ts`
- Create: `packages/db/src/schema/memory.ts`
- Create: `packages/db/src/schema/family.ts`
- Create: `packages/db/src/schema/catalog.ts`
- Create: `packages/db/src/schema/pipeline.ts` (includes `storyUses`, next to `essays`, to avoid a `memory` ↔ `pipeline` import cycle)
- Create: `packages/db/src/schema/crew.ts`
- Create: `packages/db/src/schema/ops.ts`
- Create: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/schema/expected.ts`
- Create: `packages/db/src/testing/env.ts`
- Create: `packages/db/src/testing/db.ts`
- Create: `packages/db/src/testing/setup.ts`
- Create: `packages/db/src/testing/factories.ts`
- Create: `packages/db/src/testing/index.ts`
- Create: `packages/db/src/seed/util.ts`
- Create: `packages/db/src/seed/people.ts`
- Create: `packages/db/src/seed/catalog.ts`
- Create: `packages/db/src/seed/records.ts`
- Create: `packages/db/src/seed/index.ts`
- Modify: `packages/db/vitest.config.ts` (C5, whole file: adds `globalSetup`)
- Modify: `packages/db/src/schema/family.ts` (C4: imports `aidChecklistItems` and adds `familyTasks.aidItemId` plus `family_tasks_aid_item_assignee_uq`, R2I-6)
- Create: `packages/db/src/seed/aid.ts` (C7: marked sample `aidRules` and `aidDeadlines`, R2P-1)
- Modify: `packages/db/src/testing/index.ts` (C6, whole file: adds `factories`)
- Modify: `packages/db/src/index.ts` (C6, whole file: adds `pgErrorCode`)
- Test: `packages/db/src/testing/env.test.ts`
- Test: `packages/db/src/schema/enums.test.ts`
- Test: `packages/db/src/schema/tables.test.ts`
- Test: `packages/db/src/schema/index.test.ts`
- Test: `packages/db/src/migrate.test.ts`
- Test: `packages/db/src/testing/factories.test.ts`
- Test: `packages/db/src/schema/constraints.test.ts`
- Test: `packages/db/src/seed/seed.test.ts`

## Tasks

### C1: Package scaffold and test database URL

- [ ] **Step 1: Create the package files**

`packages/db/package.json`:

```json
{
  "name": "@scholarcrew/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing/index.ts",
    "./seed": "./src/seed/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "generate": "drizzle-kit generate",
    "migrate": "tsx --env-file-if-exists=../../.env src/cli/migrate.ts",
    "migrate:test": "tsx --env-file-if-exists=../../.env src/cli/migrate.ts --test",
    "seed": "tsx --env-file-if-exists=../../.env src/cli/seed.ts"
  },
  "dependencies": {
    "@scholarcrew/domain": "workspace:*",
    "drizzle-orm": "^0.44.0",
    "postgres": "^3.4.7"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "drizzle-kit": "^0.31.0",
    "tsx": "^4.20.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

`packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "drizzle.config.ts", "vitest.config.ts"]
}
```

`packages/db/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
```

Run: `pnpm install`
Expected: the workspace links `@scholarcrew/domain` into `packages/db/node_modules` and installs `drizzle-orm` 0.44.x, `postgres` 3.4.x, and `drizzle-kit` 0.31.x. Exit 0.

- [ ] **Step 2: Write the failing test**

`packages/db/src/testing/env.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_TEST_DATABASE_URL, parseEnvFile, resolveTestDatabaseUrl, testDatabaseUrl } from "./env";

const saved = process.env.TEST_DATABASE_URL;

afterEach(() => {
  if (saved === undefined) Reflect.deleteProperty(process.env, "TEST_DATABASE_URL");
  else process.env.TEST_DATABASE_URL = saved;
});

describe("parseEnvFile", () => {
  it("reads KEY=VALUE lines and skips comments and blank lines", () => {
    const text = ["# local settings", "", "DATABASE_URL=postgres://a@localhost/x", "  APP_URL = http://localhost:3000  "].join(
      "\n",
    );
    expect(parseEnvFile(text)).toEqual({
      DATABASE_URL: "postgres://a@localhost/x",
      APP_URL: "http://localhost:3000",
    });
  });

  it("strips matching quotes and keeps = inside values", () => {
    const text = ['EMAIL_FROM="ScholarCrew <crew@scholarcrew.example>"', "TOKEN=a=b=c", "NAME='Maple'", "BROKEN"].join("\r\n");
    expect(parseEnvFile(text)).toEqual({
      EMAIL_FROM: "ScholarCrew <crew@scholarcrew.example>",
      TOKEN: "a=b=c",
      NAME: "Maple",
    });
  });
});

describe("resolveTestDatabaseUrl", () => {
  it("prefers TEST_DATABASE_URL from the environment", () => {
    const fileText = "TEST_DATABASE_URL=postgres://file/db";
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: "postgres://env/db" }, fileText)).toBe("postgres://env/db");
  });

  it("falls back to the repo-root .env file", () => {
    expect(resolveTestDatabaseUrl({}, "DATABASE_URL=x\nTEST_DATABASE_URL=postgres://file/db\n")).toBe("postgres://file/db");
  });

  it("falls back to the local docker default", () => {
    expect(resolveTestDatabaseUrl({}, null)).toBe(DEFAULT_TEST_DATABASE_URL);
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: "" }, "OTHER=1")).toBe(DEFAULT_TEST_DATABASE_URL);
    expect(DEFAULT_TEST_DATABASE_URL).toBe("postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew_test");
  });
});

describe("testDatabaseUrl", () => {
  it("returns TEST_DATABASE_URL from the process when it's set", () => {
    process.env.TEST_DATABASE_URL = "postgres://u:p@db:5432/from_process";
    expect(testDatabaseUrl()).toBe("postgres://u:p@db:5432/from_process");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @scholarcrew/db test`
Expected: FAIL with `Failed to resolve import "./env" from "src/testing/env.test.ts". Does the file exist?`

- [ ] **Step 4: Write the implementation**

`packages/db/src/testing/env.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_TEST_DATABASE_URL = "postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew_test";

/** packages/db/src/testing → repo root. */
const ROOT_ENV_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.env");

/** Minimal .env parser: KEY=VALUE lines, # comments, optional matching quotes. No dotenv dependency. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quote = value.charAt(0);
    if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function resolveTestDatabaseUrl(env: Record<string, string | undefined>, envFileText: string | null): string {
  const fromEnv = env.TEST_DATABASE_URL;
  if (fromEnv) return fromEnv;
  if (envFileText !== null) {
    const fromFile = parseEnvFile(envFileText).TEST_DATABASE_URL;
    if (fromFile) return fromFile;
  }
  return DEFAULT_TEST_DATABASE_URL;
}

/** TEST_DATABASE_URL from the process, else from the repo-root .env, else the local docker default. */
export function testDatabaseUrl(): string {
  const fromEnv = process.env.TEST_DATABASE_URL;
  if (fromEnv) return fromEnv;
  const fileText = existsSync(ROOT_ENV_FILE) ? readFileSync(ROOT_ENV_FILE, "utf8") : null;
  return resolveTestDatabaseUrl({}, fileText);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec biome check --write packages/db && pnpm --filter @scholarcrew/db typecheck && pnpm --filter @scholarcrew/db test`
Expected: biome exits 0; `tsc --noEmit` prints nothing; PASS, `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): package scaffold and test database URL resolution"
```

### C2: Enums

- [ ] **Step 1: Write the failing test**

`packages/db/src/schema/enums.test.ts`:

```ts
import {
  AidProgram,
  AppPlan,
  AppStatus,
  ApplicationItemKind,
  ApplicationStage,
  AssigneeKind,
  CatalogStatus,
  CatalogTaskKind,
  CatalogTaskStatus,
  CollegeControl,
  CommentAuthor,
  CommentKind,
  CostSource,
  DocumentKind,
  EssayStatus,
  EssayTarget,
  ExportStatus,
  FactSource,
  FactStatus,
  FactVisibility,
  FamilyMemberRole,
  FamilyTaskKind,
  Fit,
  HelperRole,
  ItemStatus,
  JobKind,
  JobStatus,
  ListingVisibility,
  MessageAuthor,
  NotificationKind,
  OfferLineCategory,
  OfferStatus,
  OutsidePolicy,
  ParseStatus,
  PlanId,
  PlanItemKind,
  RecStatus,
  ReportReason,
  ReportStatus,
  Role,
  RoomKind,
  SensitiveKind,
  ShareCategory,
  SubscriptionStatus,
  TaskStatus,
  TestKind,
  TestPolicy,
  UserStatus,
  VerificationStatus,
} from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import * as enums from "./enums";

type DbEnum = { enumName: string; enumValues: readonly string[] };
type DomainEnum = { options: readonly string[] };

const PAIRS: Array<[string, DbEnum, DomainEnum]> = [
  ["role", enums.roleEnum, Role],
  ["user_status", enums.userStatusEnum, UserStatus],
  ["fact_source", enums.factSourceEnum, FactSource],
  ["fact_visibility", enums.factVisibilityEnum, FactVisibility],
  ["fact_status", enums.factStatusEnum, FactStatus],
  ["sensitive_kind", enums.sensitiveKindEnum, SensitiveKind],
  ["family_member_role", enums.familyMemberRoleEnum, FamilyMemberRole],
  ["share_category", enums.shareCategoryEnum, ShareCategory],
  ["family_task_kind", enums.familyTaskKindEnum, FamilyTaskKind],
  ["task_status", enums.taskStatusEnum, TaskStatus],
  ["helper_role", enums.helperRoleEnum, HelperRole],
  ["catalog_status", enums.catalogStatusEnum, CatalogStatus],
  ["listing_visibility", enums.listingVisibilityEnum, ListingVisibility],
  ["college_control", enums.collegeControlEnum, CollegeControl],
  ["test_policy", enums.testPolicyEnum, TestPolicy],
  ["outside_policy", enums.outsidePolicyEnum, OutsidePolicy],
  ["catalog_task_kind", enums.catalogTaskKindEnum, CatalogTaskKind],
  ["catalog_task_status", enums.catalogTaskStatusEnum, CatalogTaskStatus],
  ["report_reason", enums.reportReasonEnum, ReportReason],
  ["report_status", enums.reportStatusEnum, ReportStatus],
  ["fit", enums.fitEnum, Fit],
  ["app_plan", enums.appPlanEnum, AppPlan],
  ["app_status", enums.appStatusEnum, AppStatus],
  ["app_item_kind", enums.appItemKindEnum, ApplicationItemKind],
  ["item_status", enums.itemStatusEnum, ItemStatus],
  ["rec_status", enums.recStatusEnum, RecStatus],
  ["app_stage", enums.appStageEnum, ApplicationStage],
  ["essay_target", enums.essayTargetEnum, EssayTarget],
  ["essay_status", enums.essayStatusEnum, EssayStatus],
  ["comment_author", enums.commentAuthorEnum, CommentAuthor],
  ["comment_kind", enums.commentKindEnum, CommentKind],
  ["test_kind", enums.testKindEnum, TestKind],
  ["verification_status", enums.verificationStatusEnum, VerificationStatus],
  ["cost_source", enums.costSourceEnum, CostSource],
  ["document_kind", enums.documentKindEnum, DocumentKind],
  ["parse_status", enums.parseStatusEnum, ParseStatus],
  ["offer_status", enums.offerStatusEnum, OfferStatus],
  ["offer_line_category", enums.offerLineCategoryEnum, OfferLineCategory],
  ["aid_program", enums.aidProgramEnum, AidProgram],
  ["assignee_kind", enums.assigneeKindEnum, AssigneeKind],
  ["room_kind", enums.roomKindEnum, RoomKind],
  ["message_author", enums.messageAuthorEnum, MessageAuthor],
  ["job_kind", enums.jobKindEnum, JobKind],
  ["job_status", enums.jobStatusEnum, JobStatus],
  ["plan_item_kind", enums.planItemKindEnum, PlanItemKind],
  ["notification_kind", enums.notificationKindEnum, NotificationKind],
  ["plan_id", enums.planIdEnum, PlanId],
  ["subscription_status", enums.subscriptionStatusEnum, SubscriptionStatus],
  ["export_status", enums.exportStatusEnum, ExportStatus],
];

describe("pg enums", () => {
  it.each(PAIRS)("%s_enum matches the domain enum", (name, dbEnum, domainEnum) => {
    expect(dbEnum.enumName).toBe(`${name}_enum`);
    expect([...dbEnum.enumValues]).toEqual([...domainEnum.options]);
  });

  it("covers all 49 section 8 enums and nothing else", () => {
    expect(PAIRS).toHaveLength(49);
    expect(new Set(PAIRS.map(([name]) => name)).size).toBe(49);
    expect(Object.keys(enums)).toHaveLength(49);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @scholarcrew/db test`
Expected: FAIL with `Failed to resolve import "./enums" from "src/schema/enums.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/db/src/schema/enums.ts`:

```ts
import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role_enum", ["student", "parent", "admin"]);
export const userStatusEnum = pgEnum("user_status_enum", ["active", "blocked_underage", "deleted"]);
export const factSourceEnum = pgEnum("fact_source_enum", [
  "user_stated",
  "document",
  "parent_shared",
  "crew_inferred",
  "system",
]);
export const factVisibilityEnum = pgEnum("fact_visibility_enum", ["crew", "crew_family", "scout_only", "private"]);
export const factStatusEnum = pgEnum("fact_status_enum", ["confirmed", "candidate", "rejected"]);
export const sensitiveKindEnum = pgEnum("sensitive_kind_enum", [
  "first_gen",
  "income_range",
  "heritage",
  "disability",
  "religion",
  "military_family",
  "foster_care",
  "noncitizen_filter",
]);
export const familyMemberRoleEnum = pgEnum("family_member_role_enum", ["student", "parent"]);
export const shareCategoryEnum = pgEnum("share_category_enum", [
  "deadlines",
  "colleges",
  "costs",
  "scholarships",
  "activities",
  "essays",
  "chats",
  "stories",
  "sensitive",
]);
export const familyTaskKindEnum = pgEnum("family_task_kind_enum", [
  "fafsa_contributor",
  "css_contributor",
  "share_income_range",
  "share_budget",
  "review_costs",
  "custom",
]);
export const taskStatusEnum = pgEnum("task_status_enum", ["todo", "done", "skipped"]);
export const helperRoleEnum = pgEnum("helper_role_enum", ["recommender", "counselor", "mentor"]);
export const catalogStatusEnum = pgEnum("catalog_status_enum", ["draft", "published", "stale", "retired", "flagged"]);
export const listingVisibilityEnum = pgEnum("listing_visibility_enum", ["public", "submitter_only"]);
export const collegeControlEnum = pgEnum("college_control_enum", ["public", "private_nonprofit", "private_forprofit"]);
export const testPolicyEnum = pgEnum("test_policy_enum", ["required", "optional", "blind", "unknown"]);
export const outsidePolicyEnum = pgEnum("outside_policy_enum", [
  "added_on_top",
  "reduces_loans_first",
  "may_reduce_grant",
  "unknown",
]);
export const catalogTaskKindEnum = pgEnum("catalog_task_kind_enum", [
  "research_candidate",
  "user_submission",
  "report",
  "recheck_changed",
  "import",
]);
export const catalogTaskStatusEnum = pgEnum("catalog_task_status_enum", ["open", "in_review", "resolved", "rejected"]);
export const reportReasonEnum = pgEnum("report_reason_enum", [
  "wrong_deadline",
  "dead_link",
  "scam",
  "wrong_amount",
  "other",
]);
export const reportStatusEnum = pgEnum("report_status_enum", ["open", "resolved", "rejected"]);
export const fitEnum = pgEnum("fit_enum", ["reach", "target", "likely"]);
export const appPlanEnum = pgEnum("app_plan_enum", ["ED", "EA", "REA", "RD", "rolling"]);
export const appStatusEnum = pgEnum("app_status_enum", [
  "researching",
  "applying",
  "submitted",
  "admitted",
  "waitlisted",
  "denied",
  "enrolled",
  "withdrawn",
]);
export const appItemKindEnum = pgEnum("app_item_kind_enum", [
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
export const itemStatusEnum = pgEnum("item_status_enum", ["todo", "in_progress", "done", "not_needed"]);
export const recStatusEnum = pgEnum("rec_status_enum", ["draft", "requested", "confirmed", "submitted", "declined"]);
export const appStageEnum = pgEnum("app_stage_enum", [
  "matched",
  "planned",
  "drafting",
  "submitted",
  "won",
  "lost",
  "skipped",
]);
export const essayTargetEnum = pgEnum("essay_target_enum", ["college", "scholarship", "general"]);
export const essayStatusEnum = pgEnum("essay_status_enum", ["drafting", "ready", "submitted"]);
export const commentAuthorEnum = pgEnum("comment_author_enum", ["quill", "helper", "user"]);
export const commentKindEnum = pgEnum("comment_kind_enum", [
  "question",
  "structure",
  "clarity",
  "prompt_fit",
  "word_budget",
]);
export const testKindEnum = pgEnum("test_kind_enum", ["ACT", "SAT", "PSAT"]);
export const verificationStatusEnum = pgEnum("verification_status_enum", [
  "self_reported",
  "requested",
  "verified",
  "declined",
]);
export const costSourceEnum = pgEnum("cost_source_enum", ["scorecard", "calculator", "offer"]);
export const documentKindEnum = pgEnum("document_kind_enum", [
  "award_letter",
  "transcript",
  "score_report",
  "essay",
  "resume",
  "other",
]);
export const parseStatusEnum = pgEnum("parse_status_enum", ["none", "queued", "parsing", "parsed", "failed"]);
export const offerStatusEnum = pgEnum("offer_status_enum", ["uploaded", "parsing", "needs_review", "confirmed", "failed"]);
export const offerLineCategoryEnum = pgEnum("offer_line_category_enum", [
  "grant",
  "scholarship",
  "work_study",
  "loan_federal_subsidized",
  "loan_federal_unsubsidized",
  "loan_parent_plus",
  "loan_private",
  "other",
]);
export const aidProgramEnum = pgEnum("aid_program_enum", ["fafsa", "css"]);
export const assigneeKindEnum = pgEnum("assignee_kind_enum", ["student", "parent"]);
export const roomKindEnum = pgEnum("room_kind_enum", ["my_crew", "family", "temporary", "scholarship", "college", "essay"]);
export const messageAuthorEnum = pgEnum("message_author_enum", ["user", "crew"]);
export const jobKindEnum = pgEnum("job_kind_enum", [
  "crew_request",
  "weekly_plan",
  "essay_review",
  "offer_parse",
  "appeal_outline",
  "retake_analysis",
]);
export const jobStatusEnum = pgEnum("job_status_enum", ["queued", "working", "ready", "needs_input", "failed"]);
export const planItemKindEnum = pgEnum("plan_item_kind_enum", [
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
export const notificationKindEnum = pgEnum("notification_kind_enum", [
  "new_matches",
  "deadline",
  "job_ready",
  "family",
  "digest",
  "system",
]);
export const planIdEnum = pgEnum("plan_id_enum", ["free", "family", "season_pass"]);
export const subscriptionStatusEnum = pgEnum("subscription_status_enum", ["active", "past_due", "canceled", "expired"]);
export const exportStatusEnum = pgEnum("export_status_enum", ["queued", "ready", "failed"]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec biome check --write packages/db && pnpm --filter @scholarcrew/db typecheck && pnpm --filter @scholarcrew/db test`
Expected: PASS, `Test Files 2 passed (2)`, `Tests 56 passed (56)`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema
git commit -m "feat(db): pg enums matching the domain enums"
```

### C3: Identity, memory, family, and catalog tables

- [ ] **Step 1: Write the failing test**

`packages/db/src/schema/tables.test.ts`:

```ts
import { type PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as catalog from "./catalog";
import * as family from "./family";
import * as identity from "./identity";
import * as memory from "./memory";

function onDeleteOf(table: PgTable, column: string): string | undefined {
  return getTableConfig(table).foreignKeys.find((fk) => fk.reference().columns[0]?.name === column)?.onDelete;
}

describe("identity, memory, family, and catalog tables", () => {
  it("use the section 8 SQL names", () => {
    const all = { ...identity, ...memory, ...family, ...catalog };
    const names = Object.fromEntries(Object.entries(all).map(([key, table]) => [key, getTableConfig(table).name]));
    expect(names).toEqual({
      users: "users",
      sessions: "sessions",
      magicLinks: "magic_links",
      apiTokens: "api_tokens",
      rateLimits: "rate_limits",
      auditEvents: "audit_events",
      devOutbox: "dev_outbox",
      profiles: "profiles",
      memoryFacts: "memory_facts",
      sensitiveFacts: "sensitive_facts",
      decisions: "decisions",
      stories: "stories",
      families: "families",
      familyMembers: "family_members",
      familyInvites: "family_invites",
      shareSettings: "share_settings",
      familyBudgets: "family_budgets",
      familyTasks: "family_tasks",
      helperLinks: "helper_links",
      scholarships: "scholarships",
      scholarshipSources: "scholarship_sources",
      colleges: "colleges",
      aidRules: "aid_rules",
      aidDeadlines: "aid_deadlines",
      catalogTasks: "catalog_tasks",
      catalogReports: "catalog_reports",
      recheckBatches: "recheck_batches",
    });
  });

  it("maps users to snake_case columns with the section 8 defaults", () => {
    const columns = getTableConfig(identity.users).columns;
    expect(columns.map((c) => c.name)).toEqual([
      "id",
      "email",
      "display_name",
      "role",
      "birth_year",
      "time_zone",
      "status",
      "created_at",
      "deleted_at",
    ]);
    const byName = Object.fromEntries(columns.map((c) => [c.name, c]));
    expect(byName.email?.isUnique).toBe(true);
    expect(byName.email?.notNull).toBe(true);
    expect(byName.birth_year?.notNull).toBe(false);
    expect(byName.role?.default).toBe("student");
    expect(byName.time_zone?.default).toBe("America/Chicago");
    expect(byName.status?.default).toBe("active");
  });

  it("keys sensitive facts on (owner_id, kind) and stores ciphertext as bytea", () => {
    const config = getTableConfig(memory.sensitiveFacts);
    expect(config.primaryKeys[0]?.columns.map((c) => c.name)).toEqual(["owner_id", "kind"]);
    const types = Object.fromEntries(config.columns.map((c) => [c.name, c.getSQLType()]));
    expect(types).toMatchObject({ ciphertext: "bytea", iv: "bytea", tag: "bytea", kind: "sensitive_kind_enum" });
  });

  it("sets null on creator and submitter keys and cascades owner keys", () => {
    expect(onDeleteOf(family.families, "created_by_id")).toBe("set null");
    expect(onDeleteOf(catalog.scholarships, "submitted_by_id")).toBe("set null");
    expect(onDeleteOf(catalog.catalogReports, "reporter_id")).toBe("set null");
    expect(onDeleteOf(family.familyMembers, "family_id")).toBe("cascade");
    expect(onDeleteOf(family.familyMembers, "user_id")).toBe("cascade");
    expect(onDeleteOf(memory.memoryFacts, "owner_id")).toBe("cascade");
    expect(onDeleteOf(identity.sessions, "user_id")).toBe("cascade");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @scholarcrew/db test`
Expected: FAIL with `Failed to resolve import "./catalog" from "src/schema/tables.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/db/src/schema/columns.ts`:

```ts
import { sql } from "drizzle-orm";
import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

/** bytea over Buffer. postgres-js sends Buffers as bytea and parses bytea back into Buffers. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** timestamptz, read as a Date. */
export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const uuidPk = () => uuid("id").primaryKey().defaultRandom();
export const createdAt = () => ts("created_at").notNull().defaultNow();
export const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const emptyTextArray = () => sql`'{}'::text[]`;
export const emptyIntArray = () => sql`'{}'::integer[]`;
export const emptyJsonArray = () => sql`'[]'::jsonb`;
export const emptyJsonObject = () => sql`'{}'::jsonb`;
```

`packages/db/src/schema/identity.ts`:

```ts
import type { ApiTokenScope } from "@scholarcrew/domain";
import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, emptyJsonObject, ts, uuidPk } from "./columns";
import { roleEnum, userStatusEnum } from "./enums";

export const users = pgTable("users", {
  id: uuidPk(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  role: roleEnum("role").notNull().default("student"),
  birthYear: integer("birth_year"),
  timeZone: text("time_zone").notNull().default("America/Chicago"),
  status: userStatusEnum("status").notNull().default("active"),
  createdAt: createdAt(),
  deletedAt: ts("deleted_at"),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuidPk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const magicLinks = pgTable(
  "magic_links",
  {
    id: uuidPk(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
  },
  (t) => [index("magic_links_email_idx").on(t.email)],
);

export const apiTokens = pgTable("api_tokens", {
  id: uuidPk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  scopes: text("scopes").array().$type<ApiTokenScope[]>().notNull(),
  label: text("label").notNull().default(""),
  createdAt: createdAt(),
  lastUsedAt: ts("last_used_at"),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuidPk(),
    actorId: uuid("actor_id"),
    actorKind: text("actor_kind").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(emptyJsonObject()),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_events_entity_idx").on(t.entityType, t.entityId),
    index("audit_events_actor_id_idx").on(t.actorId),
    index("audit_events_created_at_idx").on(t.createdAt),
  ],
);

export const devOutbox = pgTable(
  "dev_outbox",
  {
    id: uuidPk(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("dev_outbox_to_idx").on(t.to)],
);
```

`packages/db/src/schema/memory.ts`:

```ts
import { sql } from "drizzle-orm";

import { smallint, uniqueIndex, boolean, index, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { bytea, createdAt, emptyTextArray, ts, updatedAt, uuidPk } from "./columns";
import { factSourceEnum, factStatusEnum, factVisibilityEnum, sensitiveKindEnum } from "./enums";
import { users } from "./identity";

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  classYear: integer("class_year"),
  highSchool: text("high_school").notNull().default(""),
  state: text("state").notNull().default(""),
  county: text("county").notNull().default(""),
  city: text("city").notNull().default(""),
  gpaUnweightedX100: integer("gpa_unweighted_x100"),
  gpaWeightedX100: integer("gpa_weighted_x100"),
  intendedMajors: text("intended_majors").array().notNull().default(emptyTextArray()),
  interests: text("interests").array().notNull().default(emptyTextArray()),
  onboardingCompletedAt: ts("onboarding_completed_at"),
  updatedAt: updatedAt(),
});

export const memoryFacts = pgTable(
  "memory_facts",
  {
    id: uuidPk(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    source: factSourceEnum("source").notNull(),
    sourceRef: text("source_ref"),
    visibility: factVisibilityEnum("visibility").notNull().default("crew"),
    status: factStatusEnum("status").notNull().default("confirmed"),
    supersededById: uuid("superseded_by_id"),
    createdAt: createdAt(),
    confirmedAt: ts("confirmed_at"),
    expiresAt: ts("expires_at"),
  },
  (t) => [index("memory_facts_owner_status_idx").on(t.ownerId, t.status), uniqueIndex("memory_facts_current_uq").on(t.ownerId, t.key).where(sql`${t.status} = 'confirmed' and ${t.supersededById} is null`)],
);

export const sensitiveFacts = pgTable(
  "sensitive_facts",
  {
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: sensitiveKindEnum("kind").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    ciphertext: bytea("ciphertext"),
    iv: bytea("iv"),
    tag: bytea("tag"),
    keyId: smallint("key_id").notNull().default(1),
    sharedByUserId: uuid("shared_by_user_id"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.kind] })],
);

export const decisions = pgTable("decisions", {
  id: uuidPk(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  rationale: text("rationale").notNull().default(""),
  sourceMessageId: uuid("source_message_id"),
  decidedAt: ts("decided_at").notNull().defaultNow(),
});

export const stories = pgTable(
  "stories",
  {
    id: uuidPk(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    moment: text("moment").notNull(),
    themes: text("themes").array().notNull().default(emptyTextArray()),
    evidence: text("evidence").notNull().default(""),
    summary: text("summary").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("stories_owner_id_idx").on(t.ownerId)],
);
```

`packages/db/src/schema/family.ts`:

```ts
import type { HelperScope } from "@scholarcrew/domain";
import { uniqueIndex, boolean, date, index, integer, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, ts, updatedAt, uuidPk } from "./columns";
import { familyMemberRoleEnum, familyTaskKindEnum, helperRoleEnum, shareCategoryEnum, taskStatusEnum } from "./enums";
import { users } from "./identity";

export const families = pgTable("families", {
  id: uuidPk(),
  name: text("name").notNull().default("Family"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const familyMembers = pgTable(
  "family_members",
  {
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memberRole: familyMemberRoleEnum("member_role").notNull(),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.familyId, t.userId] }), uniqueIndex("family_members_user_uq").on(t.userId)],
);

export const familyInvites = pgTable("family_invites", {
  id: uuidPk(),
  familyId: uuid("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  memberRole: familyMemberRoleEnum("member_role").notNull().default("parent"),
  invitedById: uuid("invited_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: createdAt(),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  acceptedById: uuid("accepted_by_id"),
});

export const shareSettings = pgTable(
  "share_settings",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    category: shareCategoryEnum("category").notNull(),
    enabled: boolean("enabled").notNull(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.familyId, t.category] })],
);

export const familyBudgets = pgTable("family_budgets", {
  familyId: uuid("family_id")
    .primaryKey()
    .references(() => families.id, { onDelete: "cascade" }),
  annualUsd: integer("annual_usd").notNull(),
  sharedById: uuid("shared_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  updatedAt: updatedAt(),
});

export const familyTasks = pgTable(
  "family_tasks",
  {
    id: uuidPk(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: familyTaskKindEnum("kind").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    status: taskStatusEnum("status").notNull().default("todo"),
    dueOn: date("due_on", { mode: "string" }),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("family_tasks_family_status_idx").on(t.familyId, t.status)],
);

export const helperLinks = pgTable("helper_links", {
  id: uuidPk(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  helperRole: helperRoleEnum("helper_role").notNull(),
  scope: text("scope").array().$type<HelperScope[]>().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: createdAt(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
  lastUsedAt: ts("last_used_at"),
});
```

`packages/db/src/schema/catalog.ts`:

```ts
import { sql } from "drizzle-orm";

import type {
  CatalogTaskPayload,
  CollegeDeadlines,
  CollegeRequirements,
  EligibilityRule,
  LocalArea,
  MeritTier,
  NetPriceByIncome,
  ScamFlag,
  ScholarshipRequirements,
} from "@scholarcrew/domain";
import { uniqueIndex, boolean, date, index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, emptyJsonArray, emptyTextArray, ts, updatedAt, uuidPk } from "./columns";
import {
  catalogStatusEnum,
  catalogTaskKindEnum,
  catalogTaskStatusEnum,
  collegeControlEnum,
  listingVisibilityEnum,
  outsidePolicyEnum,
  reportReasonEnum,
  reportStatusEnum,
  testPolicyEnum,
} from "./enums";
import { users } from "./identity";

export const scholarships = pgTable(
  "scholarships",
  {
    id: uuidPk(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    url: text("url").notNull(),
    sourceUrl: text("source_url").notNull(),
    amountMinUsd: integer("amount_min_usd").notNull(),
    amountMaxUsd: integer("amount_max_usd").notNull(),
    renewable: boolean("renewable").notNull().default(false),
    renewalTerms: text("renewal_terms").notNull().default(""),
    deadline: date("deadline", { mode: "string" }),
    cycle: text("cycle").notNull(),
    localArea: jsonb("local_area").$type<LocalArea>().notNull(),
    eligibility: jsonb("eligibility").$type<EligibilityRule[]>().notNull().default(emptyJsonArray()),
    requirements: jsonb("requirements").$type<ScholarshipRequirements>().notNull(),
    status: catalogStatusEnum("status").notNull().default("draft"),
    visibility: listingVisibilityEnum("visibility").notNull().default("public"),
    submittedById: uuid("submitted_by_id").references(() => users.id, { onDelete: "set null" }),
    scamFlags: text("scam_flags").array().$type<ScamFlag[]>().notNull().default(emptyTextArray()),
    estMinutes: integer("est_minutes").notNull().default(60),
    verifiedAt: ts("verified_at"),
    verifiedById: uuid("verified_by_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("scholarships_status_idx").on(t.status),
    index("scholarships_deadline_idx").on(t.deadline),
    index("scholarships_visibility_idx").on(t.visibility),
  ],
);

export const scholarshipSources = pgTable("scholarship_sources", {
  id: uuidPk(),
  scholarshipId: uuid("scholarship_id")
    .notNull()
    .references(() => scholarships.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  fetchedAt: ts("fetched_at").notNull(),
  contentHash: text("content_hash").notNull(),
  excerpt: text("excerpt").notNull().default(""),
});

export const colleges = pgTable(
  "colleges",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    state: text("state").notNull(),
    city: text("city").notNull(),
    control: collegeControlEnum("control").notNull(),
    admitRateX1000: integer("admit_rate_x1000"),
    costOfAttendanceUsd: integer("cost_of_attendance_usd"),
    netPriceByIncome: jsonb("net_price_by_income").$type<NetPriceByIncome>().notNull(),
    testPolicy: testPolicyEnum("test_policy").notNull().default("unknown"),
    superscore: boolean("superscore"),
    cssProfileRequired: boolean("css_profile_required").notNull().default(false),
    outsidePolicy: outsidePolicyEnum("outside_policy").notNull().default("unknown"),
    meritTiers: jsonb("merit_tiers").$type<MeritTier[]>().notNull().default(emptyJsonArray()),
    deadlines: jsonb("deadlines").$type<CollegeDeadlines>().notNull(),
    requirements: jsonb("requirements").$type<CollegeRequirements>().notNull(),
    aidPriorityDate: date("aid_priority_date", { mode: "string" }),
    sourceUrl: text("source_url").notNull().default(""),
    verifiedAt: ts("verified_at"),
    updatedAt: updatedAt(),
  },
  (t) => [index("colleges_state_idx").on(t.state), index("colleges_name_idx").on(t.name)],
);

export const aidRules = pgTable(
  "aid_rules",
  {
    id: uuidPk(),
    awardYear: text("award_year").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    sourceUrl: text("source_url").notNull(),
    verifiedAt: ts("verified_at").notNull(),
  },
  (t) => [unique("aid_rules_award_year_key_uq").on(t.awardYear, t.key)],
);

export const aidDeadlines = pgTable("aid_deadlines", {
  id: uuidPk(),
  awardYear: text("award_year").notNull(),
  state: text("state"),
  program: text("program").notNull(),
  deadline: date("deadline", { mode: "string" }),
  note: text("note").notNull().default(""),
  sourceUrl: text("source_url").notNull(),
  verifiedAt: ts("verified_at").notNull(),
});

export const catalogTasks = pgTable(
  "catalog_tasks",
  {
    id: uuidPk(),
    kind: catalogTaskKindEnum("kind").notNull(),
    status: catalogTaskStatusEnum("status").notNull().default("open"),
    scholarshipId: uuid("scholarship_id").references(() => scholarships.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<CatalogTaskPayload>().notNull(),
    createdById: uuid("created_by_id"),
    resolvedById: uuid("resolved_by_id"),
    resolutionNote: text("resolution_note").notNull().default(""),
    createdAt: createdAt(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [index("catalog_tasks_status_kind_idx").on(t.status, t.kind), uniqueIndex("catalog_tasks_open_recheck_uq").on(t.scholarshipId).where(sql`${t.kind} = 'recheck_changed' and ${t.status} in ('open', 'in_review')`)],
);

export const catalogReports = pgTable("catalog_reports", {
  id: uuidPk(),
  scholarshipId: uuid("scholarship_id")
    .notNull()
    .references(() => scholarships.id, { onDelete: "cascade" }),
  reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
  reason: reportReasonEnum("reason").notNull(),
  details: text("details").notNull().default(""),
  status: reportStatusEnum("status").notNull().default("open"),
  createdAt: createdAt(),
  resolvedAt: ts("resolved_at"),
});

export const recheckBatches = pgTable("recheck_batches", {
  id: uuidPk(),
  anthropicBatchId: text("anthropic_batch_id").notNull().unique(),
  scholarshipIds: text("scholarship_ids").array().notNull(),
  status: text("status").$type<"in_progress" | "collecting" | "collected" | "failed">().notNull().default("in_progress"),
  createdAt: createdAt(),
  collectedAt: ts("collected_at"),
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec biome check --write packages/db && pnpm --filter @scholarcrew/db typecheck && pnpm --filter @scholarcrew/db test`
Expected: PASS, `Test Files 3 passed (3)`, `Tests 60 passed (60)`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema
git commit -m "feat(db): identity, memory, family, and catalog tables"
```

### C4: Pipeline, crew, and ops tables and the schema index

- [ ] **Step 1: Write the failing test**

`packages/db/src/schema/index.test.ts`:

```ts
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { EXPECTED_ENUMS, EXPECTED_TABLES } from "./expected";
import * as schema from "./index";

const TABLES = (Object.values(schema) as unknown[]).filter((value): value is PgTable => is(value, PgTable));
const SET_NULL_USER_KEYS = new Set(["families.created_by_id", "scholarships.submitted_by_id", "catalog_reports.reporter_id"]);

describe("schema index", () => {
  it("exports every section 8 table once", () => {
    expect(EXPECTED_TABLES).toHaveLength(60);
    expect(EXPECTED_ENUMS).toHaveLength(49);
    expect(TABLES.map((table) => getTableConfig(table).name).sort()).toEqual(EXPECTED_TABLES);
    expect(getTableConfig(schema.exportsTable).name).toBe("exports");
    expect("exports" in schema).toBe(false);
  });

  it("cascades every foreign key to users except the three set-null keys", () => {
    const seen: string[] = [];
    for (const table of TABLES) {
      const config = getTableConfig(table);
      for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        if (ref.foreignTable !== schema.users) continue;
        const key = `${config.name}.${ref.columns[0]?.name}`;
        seen.push(key);
        expect(fk.onDelete, key).toBe(SET_NULL_USER_KEYS.has(key) ? "set null" : "cascade");
      }
    }
    expect(seen).toHaveLength(42);
  });

  it("makes the aid checklist key unique with nulls not distinct", () => {
    const [constraint] = getTableConfig(schema.aidChecklistItems).uniqueConstraints;
    expect(constraint?.nullsNotDistinct).toBe(true);
    expect(constraint?.columns.map((c) => c.name)).toEqual(["owner_id", "award_year", "program", "key", "college_id"]);
  });

  it("keeps story uses unique per story and essay and cascades from both", () => {
    const config = getTableConfig(schema.storyUses);
    expect(config.uniqueConstraints[0]?.columns.map((c) => c.name)).toEqual(["story_id", "essay_id"]);
    const actions = config.foreignKeys
      .map((fk) => `${getTableConfig(fk.reference().foreignTable).name}:${fk.onDelete}`)
      .sort();
    expect(actions).toEqual(["essays:cascade", "stories:cascade"]);
  });

  it("stores the recommendation note as text not null default '' (D38)", () => {
    const columns = getTableConfig(schema.recRequests).columns;
    const message = columns.find((c) => c.name === "message");
    expect(message?.getSQLType()).toBe("text");
    expect(message?.notNull).toBe(true);
    expect(message?.default).toBe("");
    expect(columns.map((c) => c.name)).toEqual([
      "id",
      "owner_id",
      "recommender_id",
      "college_list_id",
      "scholarship_application_id",
      "helper_link_id",
      "message",
      "status",
      "requested_at",
      "updated_at",
    ]);
  });

  it("marks generated plan items with bool not null default false (R2C-4)", () => {
    const generated = getTableConfig(schema.planItems).columns.find((c) => c.name === "generated");
    expect(generated?.getSQLType()).toBe("boolean");
    expect(generated?.notNull).toBe(true);
    expect(generated?.default).toBe(false);
  });

  it("links family tasks to an aid checklist item, cascading, one per assignee (R2I-6)", () => {
    const config = getTableConfig(schema.familyTasks);
    const aidItem = config.columns.find((c) => c.name === "aid_item_id");
    expect(aidItem?.getSQLType()).toBe("uuid");
    expect(aidItem?.notNull).toBe(false);
    const fk = config.foreignKeys.find((f) => f.reference().columns[0]?.name === "aid_item_id");
    expect(fk && getTableConfig(fk.reference().foreignTable).name).toBe("aid_checklist_items");
    expect(fk?.onDelete).toBe("cascade");
    const uq = config.uniqueConstraints.find((u) => u.name === "family_tasks_aid_item_assignee_uq");
    expect(uq?.columns.map((c) => c.name)).toEqual(["aid_item_id", "assignee_id"]);
    expect(uq?.nullsNotDistinct).toBe(false);
  });

  it("adds a nullable sms_sent_at timestamp to notifications (R2I-9)", () => {
    const smsSentAt = getTableConfig(schema.notifications).columns.find((c) => c.name === "sms_sent_at");
    expect(smsSentAt?.getSQLType()).toBe("timestamp with time zone");
    expect(smsSentAt?.notNull).toBe(false);
  });

  it("has no family_id on subscriptions (R2I-19)", () => {
    expect(getTableConfig(schema.subscriptions).columns.map((c) => c.name)).not.toContain("family_id");
  });
});

describe("round 4 schema invariants", () => {
  it("defines lease, encryption, token expiry, Stripe ordering, and share-provenance columns", () => {
    for (const [table, columns] of [
      [schema.crewJobs, ["attempt", "lease_token", "lease_expires_at", "usage_month"]],
      [schema.apiTokens, ["expires_at"]], [schema.messages, ["shared_categories"]],
      [schema.subscriptions, ["stripe_event_at"]], [schema.stripeEvents, ["id", "type", "received_at"]],
      [schema.sensitiveFacts, ["key_id"]], [schema.blobs, ["key_id"]], [schema.notificationPrefs, ["phone_key_id"]],
    ] as const) {
      const names = getTableConfig(table).columns.map((column) => column.name);
      for (const name of columns) expect(names).toContain(name);
    }
    expect(schema.crewJobs.usageMonth.notNull).toBe(true);
    expect(schema.apiTokens.expiresAt.notNull).toBe(true);
    expect(schema.crewJobs.attempt.default).toBe(0);
    expect(schema.sensitiveFacts.keyId.default).toBe(1);
    expect(schema.blobs.keyId.default).toBe(1);
    expect(schema.notificationPrefs.phoneKeyId.default).toBe(1);
  });
  it("enforces current facts, one family, active colleges, and open recheck uniqueness", () => {
    for (const [table, name, partial] of [
      [schema.familyMembers, "family_members_user_uq", false],
      [schema.memoryFacts, "memory_facts_current_uq", true],
      [schema.collegeList, "college_list_owner_college_active_uq", true],
      [schema.catalogTasks, "catalog_tasks_open_recheck_uq", true],
    ] as const) {
      const index = getTableConfig(table).indexes.find((entry) => entry.config.name === name);
      expect(index?.config.unique).toBe(true);
      expect(Boolean(index?.config.where)).toBe(partial);
    }
    expect(getTableConfig(schema.collegeList).uniqueConstraints.map((entry) => entry.name)).not.toContain("college_list_owner_college_season_uq");
  });
  it("nulls recommendation targets when their applications disappear", () => {
    const fks = getTableConfig(schema.recRequests).foreignKeys;
    for (const name of ["college_list_id", "scholarship_application_id"]) {
      expect(fks.find((fk) => fk.reference().columns[0]?.name === name)?.onDelete).toBe("set null");
    }
  });
});

```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @scholarcrew/db test`
Expected: FAIL with `Failed to resolve import "./expected" from "src/schema/index.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/db/src/schema/pipeline.ts`:

```ts
import { sql } from "drizzle-orm";

import type { CrewRole, MatchReason } from "@scholarcrew/domain";
import { smallint, uniqueIndex, type AnyPgColumn, boolean, date, index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { colleges, scholarships } from "./catalog";
import {
  bytea,
  createdAt,
  emptyIntArray,
  emptyJsonArray,
  emptyJsonObject,
  emptyTextArray,
  ts,
  updatedAt,
  uuidPk,
} from "./columns";
import {
  aidProgramEnum,
  appItemKindEnum,
  appPlanEnum,
  appStageEnum,
  appStatusEnum,
  assigneeKindEnum,
  commentAuthorEnum,
  commentKindEnum,
  costSourceEnum,
  documentKindEnum,
  essayStatusEnum,
  essayTargetEnum,
  fitEnum,
  itemStatusEnum,
  offerLineCategoryEnum,
  offerStatusEnum,
  parseStatusEnum,
  planItemKindEnum,
  recStatusEnum,
  taskStatusEnum,
  testKindEnum,
  verificationStatusEnum,
} from "./enums";
import { users } from "./identity";
import { stories } from "./memory";

const ownerRef = () =>
  uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

export const collegeList = pgTable(
  "college_list",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    collegeId: text("college_id")
      .notNull()
      .references(() => colleges.id),
    fit: fitEnum("fit").notNull(),
    plan: appPlanEnum("plan").notNull(),
    status: appStatusEnum("status").notNull().default("researching"),
    season: text("season").notNull(),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("college_list_owner_college_active_uq").on(t.ownerId, t.collegeId).where(sql`${t.archivedAt} is null`)],
);

export const applicationItems = pgTable("application_items", {
  id: uuidPk(),
  ownerId: ownerRef(),
  collegeListId: uuid("college_list_id")
    .notNull()
    .references(() => collegeList.id, { onDelete: "cascade" }),
  kind: appItemKindEnum("kind").notNull(),
  label: text("label").notNull(),
  status: itemStatusEnum("status").notNull().default("todo"),
  dueOn: date("due_on", { mode: "string" }),
  essayId: uuid("essay_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const recommenders = pgTable("recommenders", {
  id: uuidPk(),
  ownerId: ownerRef(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  relationship: text("relationship").notNull().default(""),
  createdAt: createdAt(),
});

export const recRequests = pgTable("rec_requests", {
  id: uuidPk(),
  ownerId: ownerRef(),
  recommenderId: uuid("recommender_id")
    .notNull()
    .references(() => recommenders.id, { onDelete: "cascade" }),
  collegeListId: uuid("college_list_id").references(() => collegeList.id, { onDelete: "set null" }),
  scholarshipApplicationId: uuid("scholarship_application_id").references((): AnyPgColumn => scholarshipApplications.id, { onDelete: "set null" }),
  helperLinkId: uuid("helper_link_id"),
  /** The student's note to the recommender, shown on the helper view (D38). */
  message: text("message").notNull().default(""),
  status: recStatusEnum("status").notNull().default("draft"),
  requestedAt: ts("requested_at"),
  updatedAt: updatedAt(),
});

export const scholarshipApplications = pgTable(
  "scholarship_applications",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    scholarshipId: uuid("scholarship_id")
      .notNull()
      .references(() => scholarships.id, { onDelete: "cascade" }),
    stage: appStageEnum("stage").notNull().default("matched"),
    matchReasons: jsonb("match_reasons").$type<MatchReason[]>().notNull().default(emptyJsonArray()),
    fitScore: integer("fit_score").notNull().default(0),
    estMinutes: integer("est_minutes").notNull().default(60),
    submittedAt: ts("submitted_at"),
    outcomeUsd: integer("outcome_usd"),
    outcomeRenewable: boolean("outcome_renewable"),
    outcomeAt: ts("outcome_at"),
    thankYouSent: boolean("thank_you_sent").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("scholarship_applications_owner_scholarship_uq").on(t.ownerId, t.scholarshipId)],
);

export const essays = pgTable("essays", {
  id: uuidPk(),
  ownerId: ownerRef(),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  wordLimit: integer("word_limit"),
  charLimit: integer("char_limit"),
  targetType: essayTargetEnum("target_type").notNull().default("general"),
  targetCollegeId: text("target_college_id"),
  targetScholarshipId: uuid("target_scholarship_id"),
  currentVersion: integer("current_version").notNull().default(0),
  status: essayStatusEnum("status").notNull().default("drafting"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const essayVersions = pgTable(
  "essay_versions",
  {
    id: uuidPk(),
    essayId: uuid("essay_id")
      .notNull()
      .references(() => essays.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    wordCount: integer("word_count").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [unique("essay_versions_essay_version_uq").on(t.essayId, t.version)],
);

export const essayComments = pgTable("essay_comments", {
  id: uuidPk(),
  essayId: uuid("essay_id")
    .notNull()
    .references(() => essays.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  author: commentAuthorEnum("author").notNull(),
  kind: commentKindEnum("kind").notNull(),
  quote: text("quote").notNull(),
  occurrence: integer("occurrence").notNull().default(1),
  body: text("body").notNull(),
  jobId: uuid("job_id"),
  resolvedAt: ts("resolved_at"),
  createdAt: createdAt(),
});

/** Lives here, next to essays, so memory.ts never imports pipeline.ts. */
export const storyUses = pgTable(
  "story_uses",
  {
    id: uuidPk(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    essayId: uuid("essay_id")
      .notNull()
      .references(() => essays.id, { onDelete: "cascade" }),
    collegeId: text("college_id"),
    scholarshipId: uuid("scholarship_id"),
    usedAt: ts("used_at").notNull().defaultNow(),
  },
  (t) => [unique("story_uses_story_essay_uq").on(t.storyId, t.essayId)],
);

export const testScores = pgTable("test_scores", {
  id: uuidPk(),
  ownerId: ownerRef(),
  test: testKindEnum("test").notNull(),
  takenOn: date("taken_on", { mode: "string" }).notNull(),
  official: boolean("official").notNull(),
  composite: integer("composite").notNull(),
  sections: jsonb("sections").$type<Record<string, number>>().notNull(),
  createdAt: createdAt(),
});

export const activities = pgTable(
  "activities",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default(""),
    organization: text("organization").notNull().default(""),
    description: text("description").notNull().default(""),
    hoursPerWeek: integer("hours_per_week").notNull().default(0),
    weeksPerYear: integer("weeks_per_year").notNull().default(0),
    grades: integer("grades").array().notNull().default(emptyIntArray()),
    category: text("category").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("activities_owner_position_uq").on(t.ownerId, t.position)],
);

export const serviceLogs = pgTable("service_logs", {
  id: uuidPk(),
  ownerId: ownerRef(),
  organization: text("organization").notNull(),
  activity: text("activity").notNull(),
  servedOn: date("served_on", { mode: "string" }).notNull(),
  minutes: integer("minutes").notNull(),
  supervisorName: text("supervisor_name").notNull().default(""),
  supervisorEmail: text("supervisor_email").notNull().default(""),
  verification: verificationStatusEnum("verification").notNull().default("self_reported"),
  verificationTokenHash: text("verification_token_hash").unique(),
  verificationExpiresAt: ts("verification_expires_at"),
  verifiedAt: ts("verified_at"),
  verifierNote: text("verifier_note").notNull().default(""),
  reflection: text("reflection").notNull().default(""),
  createdAt: createdAt(),
});

export const costEstimates = pgTable(
  "cost_estimates",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    collegeId: text("college_id")
      .notNull()
      .references(() => colleges.id),
    source: costSourceEnum("source").notNull(),
    costOfAttendanceUsd: integer("cost_of_attendance_usd").notNull(),
    freeMoneyUsd: integer("free_money_usd").notNull(),
    netPriceUsd: integer("net_price_usd").notNull(),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default(emptyJsonObject()),
    computedAt: ts("computed_at").notNull().defaultNow(),
  },
  (t) => [unique("cost_estimates_owner_college_source_uq").on(t.ownerId, t.collegeId, t.source)],
);

export const blobs = pgTable("blobs", {
  id: uuidPk(),
  ciphertext: bytea("ciphertext").notNull(),
  iv: bytea("iv").notNull(),
  tag: bytea("tag").notNull(),
  keyId: smallint("key_id").notNull().default(1),
  createdAt: createdAt(),
});

export const documents = pgTable("documents", {
  id: uuidPk(),
  ownerId: ownerRef(),
  kind: documentKindEnum("kind").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  blobId: uuid("blob_id")
    .notNull()
    .references(() => blobs.id),
  parseStatus: parseStatusEnum("parse_status").notNull().default("none"),
  uploadedAt: ts("uploaded_at").notNull().defaultNow(),
});

export const offers = pgTable("offers", {
  id: uuidPk(),
  ownerId: ownerRef(),
  collegeId: text("college_id")
    .notNull()
    .references(() => colleges.id),
  awardYear: text("award_year").notNull(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  status: offerStatusEnum("status").notNull().default("uploaded"),
  costOfAttendanceUsd: integer("cost_of_attendance_usd"),
  createdAt: createdAt(),
  confirmedAt: ts("confirmed_at"),
  archivedAt: ts("archived_at"),
});

export const offerLines = pgTable("offer_lines", {
  id: uuidPk(),
  offerId: uuid("offer_id")
    .notNull()
    .references(() => offers.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  label: text("label").notNull(),
  amountUsd: integer("amount_usd").notNull(),
  category: offerLineCategoryEnum("category").notNull(),
  renewable: boolean("renewable").notNull().default(false),
  renewalCondition: text("renewal_condition").notNull().default(""),
  page: integer("page"),
  citedText: text("cited_text").notNull().default(""),
  userCorrected: boolean("user_corrected").notNull().default(false),
});

export const aidChecklistItems = pgTable(
  "aid_checklist_items",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    awardYear: text("award_year").notNull(),
    program: aidProgramEnum("program").notNull(),
    collegeId: text("college_id"),
    key: text("key").notNull(),
    title: text("title").notNull(),
    assignee: assigneeKindEnum("assignee").notNull(),
    status: taskStatusEnum("status").notNull().default("todo"),
    dueOn: date("due_on", { mode: "string" }),
    completedAt: ts("completed_at"),
  },
  (t) => [
    unique("aid_checklist_items_uq").on(t.ownerId, t.awardYear, t.program, t.key, t.collegeId).nullsNotDistinct(),
  ],
);

export const sweepRuns = pgTable(
  "sweep_runs",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    ranAt: ts("ran_at").notNull().defaultNow(),
    newMatches: integer("new_matches").notNull(),
    totalUsd: integer("total_usd").notNull(),
    reuseCount: integer("reuse_count").notNull(),
    hiddenScams: integer("hidden_scams").notNull(),
    hiddenScholarshipIds: text("hidden_scholarship_ids").array().notNull().default(emptyTextArray()),
  },
  (t) => [index("sweep_runs_owner_ran_at_idx").on(t.ownerId, t.ranAt)],
);

export const planItems = pgTable(
  "plan_items",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    title: text("title").notNull(),
    kind: planItemKindEnum("kind").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    minutes: integer("minutes").notNull(),
    valueUsd: integer("value_usd"),
    dueOn: date("due_on", { mode: "string" }),
    status: taskStatusEnum("status").notNull().default("todo"),
    contributors: text("contributors").array().$type<CrewRole[]>().notNull().default(emptyTextArray()),
    priority: integer("priority").notNull().default(0),
    /** True only for rows `replaceGeneratedPlan` wrote; a regenerate deletes only these (R2C-4). */
    generated: boolean("generated").notNull().default(false),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("plan_items_owner_week_idx").on(t.ownerId, t.weekStart)],
);
```

Modify `packages/db/src/schema/family.ts` (R2I-6). `familyTasks.aidItemId` points at `aidChecklistItems`, which lives in `pipeline.ts`, so the column is added here in C4 once that file exists. `pipeline.ts` never imports `family.ts`, so this adds no import cycle. Change the imports at the top of the file to:

```ts
import type { HelperScope } from "@scholarcrew/domain";
import { boolean, date, index, integer, pgTable, primaryKey, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, ts, updatedAt, uuidPk } from "./columns";
import { familyMemberRoleEnum, familyTaskKindEnum, helperRoleEnum, shareCategoryEnum, taskStatusEnum } from "./enums";
import { users } from "./identity";
import { aidChecklistItems } from "./pipeline";
```

and replace the whole `familyTasks` table with:

```ts
export const familyTasks = pgTable(
  "family_tasks",
  {
    id: uuidPk(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: familyTaskKindEnum("kind").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    status: taskStatusEnum("status").notNull().default("todo"),
    dueOn: date("due_on", { mode: "string" }),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
    /**
     * Set for FAFSA/CSS contributor tasks (R2I-6). The linked `aidChecklistItems` row owns status and
     * completedAt; core reads and writes those through the item, never this row.
     */
    aidItemId: uuid("aid_item_id").references(() => aidChecklistItems.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("family_tasks_family_status_idx").on(t.familyId, t.status),
    // Default nulls-distinct: any number of non-aid tasks per assignee, one task per (aid item, assignee).
    unique("family_tasks_aid_item_assignee_uq").on(t.aidItemId, t.assigneeId),
  ],
);
```

`packages/db/src/schema/crew.ts`:

```ts
import type { ShareCategory, CrewReply, ProgressEvent, SafetyFlag } from "@scholarcrew/domain";
import { index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, emptyJsonArray, emptyJsonObject, ts, updatedAt, uuidPk } from "./columns";
import { jobKindEnum, jobStatusEnum, messageAuthorEnum, roomKindEnum } from "./enums";
import { families } from "./family";
import { users } from "./identity";

export const conversations = pgTable(
  "conversations",
  {
    id: uuidPk(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    room: roomKindEnum("room").notNull(),
    roomRefId: text("room_ref_id"),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    createdAt: createdAt(),
    expiresAt: ts("expires_at"),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("conversations_owner_room_idx").on(t.ownerId, t.room)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuidPk(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    authorKind: messageAuthorEnum("author_kind").notNull(),
    authorUserId: uuid("author_user_id"),
    body: text("body").notNull(),
    reply: jsonb("reply").$type<CrewReply>(),
    sharedCategories: text("shared_categories").array().$type<ShareCategory[]>(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_created_idx").on(t.conversationId, t.createdAt)],
);

export const crewJobs = pgTable(
  "crew_jobs",
  {
    id: uuidPk(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: jobKindEnum("kind").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    conversationId: uuid("conversation_id"),
    requestMessageId: uuid("request_message_id"),
    resultMessageId: uuid("result_message_id"),
    refId: text("ref_id"),
    progress: jsonb("progress").$type<ProgressEvent[]>().notNull().default(emptyJsonArray()),
    error: text("error"),
    safety: text("safety").$type<SafetyFlag>(),
    costMicros: integer("cost_micros").notNull().default(0),
    attempt: integer("attempt").notNull().default(0),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: ts("lease_expires_at"),
    usageMonth: text("usage_month").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("crew_jobs_owner_created_idx").on(t.ownerId, t.createdAt)],
);

export const agentRuns = pgTable("agent_runs", {
  id: uuidPk(),
  jobId: uuid("job_id").references(() => crewJobs.id, { onDelete: "set null" }),
  userId: uuid("user_id"),
  role: text("role").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull(),
  cacheWriteTokens: integer("cache_write_tokens").notNull(),
  stopReason: text("stop_reason").notNull(),
  costMicros: integer("cost_micros").notNull(),
  durationMs: integer("duration_ms").notNull(),
  createdAt: createdAt(),
});

export const actionReceipts = pgTable(
  "action_receipts",
  {
    id: uuidPk(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull(),
    appliedAt: ts("applied_at").notNull().defaultNow(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default(emptyJsonObject()),
  },
  (t) => [unique("action_receipts_message_card_uq").on(t.messageId, t.cardId)],
);
```

`packages/db/src/schema/ops.ts`:

```ts
import { smallint, boolean, index, integer, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { bytea, createdAt, ts, updatedAt, uuidPk } from "./columns";
import { exportStatusEnum, notificationKindEnum, planIdEnum, subscriptionStatusEnum } from "./enums";
import { users } from "./identity";

export const notifications = pgTable(
  "notifications",
  {
    id: uuidPk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link").notNull().default(""),
    dedupeKey: text("dedupe_key").notNull().unique(),
    createdAt: createdAt(),
    readAt: ts("read_at"),
    emailedAt: ts("emailed_at"),
    /** Claimed by `deliverSms` before sending, reset to null if the send fails (R2I-9). */
    smsSentAt: ts("sms_sent_at"),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)],
);

export const notificationPrefs = pgTable("notification_prefs", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  digestDay: integer("digest_day").notNull().default(0),
  digestHour: integer("digest_hour").notNull().default(16),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  phoneCiphertext: bytea("phone_ciphertext"),
  phoneIv: bytea("phone_iv"),
  phoneTag: bytea("phone_tag"),
  phoneKeyId: smallint("phone_key_id").notNull().default(1),
  quietStartHour: integer("quiet_start_hour").notNull().default(21),
  quietEndHour: integer("quiet_end_hour").notNull().default(7),
  updatedAt: updatedAt(),
});

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: ts("received_at").notNull().defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuidPk(),
  ownerId: uuid("owner_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  plan: planIdEnum("plan").notNull().default("free"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeEventAt: ts("stripe_event_at"),
  currentPeriodEnd: ts("current_period_end"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const usageCounters = pgTable(
  "usage_counters",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    crewRequests: integer("crew_requests").notNull().default(0),
    costMicros: integer("cost_micros").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.month] })],
);

export const sponsorCodes = pgTable("sponsor_codes", {
  code: text("code").primaryKey(),
  sponsorName: text("sponsor_name").notNull(),
  plan: planIdEnum("plan").notNull(),
  seatsTotal: integer("seats_total").notNull(),
  seatsUsed: integer("seats_used").notNull().default(0),
  expiresAt: ts("expires_at").notNull(),
});

export const sponsorRedemptions = pgTable(
  "sponsor_redemptions",
  {
    code: text("code")
      .notNull()
      .references(() => sponsorCodes.code, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redeemedAt: ts("redeemed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.code, t.userId] })],
);

/** SQL table `exports`; the TypeScript name is `exportsTable` so no module binds `exports`. */
export const exportsTable = pgTable("exports", {
  id: uuidPk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: exportStatusEnum("status").notNull().default("queued"),
  blobId: uuid("blob_id"),
  createdAt: createdAt(),
  expiresAt: ts("expires_at"),
});
```

`packages/db/src/schema/index.ts`:

```ts
export * from "./enums";
export * from "./identity";
export * from "./memory";
export * from "./family";
export * from "./catalog";
export * from "./pipeline";
export * from "./crew";
export * from "./ops";
```

`packages/db/src/schema/expected.ts`:

```ts
/** Section 8 of plans/00-overview.md as SQL names. Tests hold the schema and the migrated database to these lists. */
export const EXPECTED_TABLES: string[] = [
  "users",
  "sessions",
  "magic_links",
  "api_tokens",
  "rate_limits",
  "audit_events",
  "dev_outbox",
  "profiles",
  "memory_facts",
  "sensitive_facts",
  "decisions",
  "stories",
  "story_uses",
  "families",
  "family_members",
  "family_invites",
  "share_settings",
  "family_budgets",
  "family_tasks",
  "helper_links",
  "scholarships",
  "scholarship_sources",
  "colleges",
  "aid_rules",
  "aid_deadlines",
  "catalog_tasks",
  "catalog_reports",
  "recheck_batches",
  "college_list",
  "application_items",
  "recommenders",
  "rec_requests",
  "scholarship_applications",
  "essays",
  "essay_versions",
  "essay_comments",
  "test_scores",
  "activities",
  "service_logs",
  "cost_estimates",
  "blobs",
  "documents",
  "offers",
  "offer_lines",
  "aid_checklist_items",
  "sweep_runs",
  "plan_items",
  "conversations",
  "messages",
  "crew_jobs",
  "agent_runs",
  "action_receipts",
  "notifications",
  "notification_prefs",
  "stripe_events",
  "subscriptions",
  "usage_counters",
  "sponsor_codes",
  "sponsor_redemptions",
  "exports",
].sort();

export const EXPECTED_ENUMS: string[] = [
  "role_enum",
  "user_status_enum",
  "fact_source_enum",
  "fact_visibility_enum",
  "fact_status_enum",
  "sensitive_kind_enum",
  "family_member_role_enum",
  "share_category_enum",
  "family_task_kind_enum",
  "task_status_enum",
  "helper_role_enum",
  "catalog_status_enum",
  "listing_visibility_enum",
  "college_control_enum",
  "test_policy_enum",
  "outside_policy_enum",
  "catalog_task_kind_enum",
  "catalog_task_status_enum",
  "report_reason_enum",
  "report_status_enum",
  "fit_enum",
  "app_plan_enum",
  "app_status_enum",
  "app_item_kind_enum",
  "item_status_enum",
  "rec_status_enum",
  "app_stage_enum",
  "essay_target_enum",
  "essay_status_enum",
  "comment_author_enum",
  "comment_kind_enum",
  "test_kind_enum",
  "verification_status_enum",
  "cost_source_enum",
  "document_kind_enum",
  "parse_status_enum",
  "offer_status_enum",
  "offer_line_category_enum",
  "aid_program_enum",
  "assignee_kind_enum",
  "room_kind_enum",
  "message_author_enum",
  "job_kind_enum",
  "job_status_enum",
  "plan_item_kind_enum",
  "notification_kind_enum",
  "plan_id_enum",
  "subscription_status_enum",
  "export_status_enum",
].sort();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec biome check --write packages/db && pnpm --filter @scholarcrew/db typecheck && pnpm --filter @scholarcrew/db test`
Expected: PASS, `Test Files 4 passed (4)`, `Tests 72 passed (72)`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema
git commit -m "feat(db): pipeline, crew, and ops tables and the schema index"
```

### C5: Client, migrations, and test database helpers

- [ ] **Step 1: Write the failing test**

`packages/db/src/migrate.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";
import { devOutbox, families, users } from "./schema";
import { EXPECTED_ENUMS, EXPECTED_TABLES } from "./schema/expected";
import { TABLE_NAMES, closeTestDb, getTestDb, resetDb } from "./testing/db";
import { testDatabaseUrl } from "./testing/env";

const db = getTestDb();

beforeEach(() => resetDb(db));
afterAll(() => closeTestDb());

function column(rows: Iterable<Record<string, unknown>>, key: string): string[] {
  return Array.from(rows, (row) => String(row[key])).sort();
}

describe("migrations", () => {
  it("create every section 8 table", async () => {
    const rows = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    expect(column(rows, "table_name")).toEqual(EXPECTED_TABLES);
  });

  it("create every section 8 enum", async () => {
    const rows = await db.execute(
      sql`select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typtype = 'e' and n.nspname = 'public'`,
    );
    expect(column(rows, "typname")).toEqual(EXPECTED_ENUMS);
  });

  it("can run again when nothing changed", async () => {
    await expect(runMigrations(testDatabaseUrl())).resolves.toBeUndefined();
  });

  it("gives offers a nullable archived_at timestamptz", async () => {
    const rows = await db.execute(
      sql`select data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'offers' and column_name = 'archived_at'`,
    );
    expect(Array.from(rows)).toEqual([{ data_type: "timestamp with time zone", is_nullable: "YES" }]);
  });

  it("gives rec_requests a message text column, not null, default '' (D38)", async () => {
    const rows = await db.execute(
      sql`select data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'rec_requests' and column_name = 'message'`,
    );
    expect(Array.from(rows)).toEqual([{ data_type: "text", is_nullable: "NO", column_default: "''::text" }]);
  });

  it("applies the round 2 column changes (R2C-4, R2I-6, R2I-9, R2I-19)", async () => {
    const rows = await db.execute(
      sql`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
          where table_schema = 'public' and (
            (table_name = 'plan_items' and column_name = 'generated') or
            (table_name = 'family_tasks' and column_name = 'aid_item_id') or
            (table_name = 'notifications' and column_name = 'sms_sent_at') or
            (table_name = 'subscriptions' and column_name = 'family_id'))
          order by table_name`,
    );
    expect(Array.from(rows)).toEqual([
      { table_name: "family_tasks", column_name: "aid_item_id", data_type: "uuid", is_nullable: "YES", column_default: null },
      { table_name: "notifications", column_name: "sms_sent_at", data_type: "timestamp with time zone", is_nullable: "YES", column_default: null },
      { table_name: "plan_items", column_name: "generated", data_type: "boolean", is_nullable: "NO", column_default: "false" },
    ]);
    const constraints = await db.execute(
      sql`select conname, contype::text as contype, case when contype = 'f' then confdeltype::text end as on_delete from pg_constraint
          where conrelid = 'family_tasks'::regclass and conname in ('family_tasks_aid_item_assignee_uq', 'family_tasks_aid_item_id_aid_checklist_items_id_fk')
          order by conname`,
    );
    expect(Array.from(constraints)).toEqual([
      { conname: "family_tasks_aid_item_assignee_uq", contype: "u", on_delete: null },
      { conname: "family_tasks_aid_item_id_aid_checklist_items_id_fk", contype: "f", on_delete: "c" },
    ]);
  });
});

describe("resetDb", () => {
  it("empties every schema table", async () => {
    const [user] = await db.insert(users).values({ email: "reset@example.test" }).returning();
    await db.insert(families).values({ createdById: user?.id ?? null });
    await db.insert(devOutbox).values({ to: "reset@example.test", subject: "Sign in", text: "Your link" });
    await resetDb(db);
    const counts = await Promise.all(
      TABLE_NAMES.map(async (name) => {
        const rows = await db.execute(sql.raw(`select count(*)::int as n from "${name}"`));
        return Number(rows[0]?.n);
      }),
    );
    expect(TABLE_NAMES).toEqual(EXPECTED_TABLES);
    expect(counts.every((n) => n === 0)).toBe(true);
  });

  it("leaves drizzle's migrations table alone", async () => {
    const rows = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @scholarcrew/db test`
Expected: FAIL with `Failed to resolve import "./migrate" from "src/migrate.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/db/src/client.ts`:

```ts
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

/** One postgres-js pool and a typed drizzle client over every table. Call close() on shutdown. */
export function createDb(url: string, opts: { max?: number } = {}): { db: Db; close(): Promise<void> } {
  const client = postgres(url, { max: opts.max ?? 10, onnotice: () => undefined });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}
```

`packages/db/src/migrate.ts`:

```ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** packages/db/drizzle, resolved from this file so it works from any package's cwd. */
export const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

/** Any constant works; every process that migrates uses the same one. */
const MIGRATION_LOCK_KEY = 7_340_211;

/** Applies packages/db/drizzle to `url`. An advisory lock keeps parallel test runs from migrating at once. */
export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await client`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    await client`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
  } finally {
    await client.end({ timeout: 5 });
  }
}
```

`packages/db/src/index.ts`:

```ts
export * as schema from "./schema";
export * from "./schema";
export { createDb } from "./client";
export type { Db, DbOrTx, Tx } from "./client";
export { runMigrations } from "./migrate";
export type { SQL, AnyColumn } from "drizzle-orm";
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
```

`packages/db/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew",
  },
});
```

`packages/db/src/cli/migrate.ts`:

```ts
import { runMigrations } from "../migrate";
import { testDatabaseUrl } from "../testing/env";

const target = process.argv.includes("--test") ? "test" : "dev";
const url = target === "test" ? testDatabaseUrl() : process.env.DATABASE_URL;
if (!url) {
  console.error(JSON.stringify({ level: "error", msg: "DATABASE_URL is not set", target }));
  process.exit(1);
}

await runMigrations(url);
console.log(JSON.stringify({ level: "info", msg: "migrations applied", target }));
```

`packages/db/src/testing/db.ts`:

```ts
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { type Db, createDb } from "../client";
import * as schema from "../schema";
import { testDatabaseUrl } from "./env";

/** Every schema table, sorted. Never drizzle.__drizzle_migrations, never the pgboss schema. */
export const TABLE_NAMES: string[] = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableName(table))
  .sort();

let instance: { db: Db; close(): Promise<void> } | null = null;

/** One shared client per test process over TEST_DATABASE_URL. */
export function getTestDb(): Db {
  if (!instance) instance = createDb(testDatabaseUrl(), { max: 4 });
  return instance.db;
}

export async function closeTestDb(): Promise<void> {
  const current = instance;
  instance = null;
  if (current) await current.close();
}

/** Empties every schema table. Call it in beforeEach. */
export async function resetDb(db: Db): Promise<void> {
  const list = TABLE_NAMES.map((name) => `"${name}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`));
}
```

`packages/db/src/testing/setup.ts`:

```ts
import { runMigrations } from "../migrate";
import { testDatabaseUrl } from "./env";

/** Vitest globalSetup: migrates TEST_DATABASE_URL once per run. */
export async function setupTestDatabase(): Promise<void> {
  await runMigrations(testDatabaseUrl());
}

export default setupTestDatabase;
```

`packages/db/src/testing/index.ts`:

```ts
export { TABLE_NAMES, closeTestDb, getTestDb, resetDb } from "./db";
export { DEFAULT_TEST_DATABASE_URL, parseEnvFile, resolveTestDatabaseUrl, testDatabaseUrl } from "./env";
export { setupTestDatabase } from "./setup";
```

Modify `packages/db/vitest.config.ts` (whole file):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./src/testing/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
```

Generate the migration (never hand-write it):

Run: `pnpm --filter @scholarcrew/db generate`
Expected: drizzle-kit lists 60 tables and prints `[✓] Your SQL migration file ➜ drizzle/0000_<name>.sql`. It creates `packages/db/drizzle/0000_<name>.sql`, `packages/db/drizzle/meta/0000_snapshot.json`, and `packages/db/drizzle/meta/_journal.json`.

Run: `grep -c 'CREATE TABLE' packages/db/drizzle/0000_*.sql && grep -c 'CREATE TYPE' packages/db/drizzle/0000_*.sql && grep -c 'NULLS NOT DISTINCT' packages/db/drizzle/0000_*.sql`
Expected: `60`, `49`, `1`.

Run: `grep -c "\"message\" text DEFAULT '' NOT NULL" packages/db/drizzle/0000_*.sql`
Expected: `1` (the `rec_requests.message` column, D38; no other table has a `message` column with that default).

Run: `pnpm db:up && pnpm db:wait && pnpm db:migrate:test`
Expected: the `db` container is running, `db:wait` exits 0, and the last line is `{"level":"info","msg":"migrations applied","target":"test"}`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec biome check --write packages/db && pnpm --filter @scholarcrew/db typecheck && pnpm --filter @scholarcrew/db test`
Expected: PASS, `Test Files 5 passed (5)`, `Tests 80 passed (80)`.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): client, generated migration, and test database helpers"
```

### C6: Factories, error codes, and constraint behavior

- [ ] **Step 1: Write the failing tests**

`packages/db/src/testing/factories.test.ts`:

```ts
import { DEFAULT_SHARED } from "@scholarcrew/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { familyMembers, shareSettings } from "../schema";
import { closeTestDb, getTestDb, resetDb } from "./db";
import { factories } from "./factories";

const db = getTestDb();

beforeEach(() => resetDb(db));
afterAll(() => closeTestDb());

describe("factories", () => {
  it("user() lowercases the email and makes each default email unique", async () => {
    const named = await factories.user(db, { email: "Jordan.R@Example.com" });
    const a = await factories.user(db);
    const b = await factories.user(db);
    expect(named.email).toBe("jordan.r@example.com");
    expect(named.role).toBe("student");
    expect(a.email).not.toBe(b.email);
  });

  it("student() creates a user and an onboarded TX, Maple, 2027, 3.72 profile", async () => {
    const { user, profile } = await factories.student(db);
    expect(user.role).toBe("student");
    expect(profile).toMatchObject({ userId: user.id, state: "TX", county: "Maple", classYear: 2027, gpaUnweightedX100: 372 });
    expect(profile.onboardingCompletedAt).toBeInstanceOf(Date);
  });

  it("student() applies overrides", async () => {
    const { user, profile } = await factories.student(db, {
      email: "kai@example.com",
      state: "CA",
      county: "Alameda",
      classYear: 2028,
      gpaX100: 390,
    });
    expect(user.email).toBe("kai@example.com");
    expect(profile).toMatchObject({ state: "CA", county: "Alameda", classYear: 2028, gpaUnweightedX100: 390 });
  });

  it("parent() and admin() set their roles", async () => {
    const parent = await factories.parent(db, { email: "dana@example.com" });
    const admin = await factories.admin(db);
    expect(parent).toMatchObject({ email: "dana@example.com", role: "parent" });
    expect(admin.role).toBe("admin");
  });

  it("family() links members and writes DEFAULT_SHARED for each student", async () => {
    const first = await factories.student(db);
    const second = await factories.student(db);
    const parent = await factories.parent(db);
    const family = await factories.family(db, { studentIds: [first.user.id, second.user.id], parentIds: [parent.id] });
    expect(family.createdById).toBe(first.user.id);
    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, family.id));
    expect(members.map((m) => m.memberRole).sort()).toEqual(["parent", "student", "student"]);
    const mine = await db.select().from(shareSettings).where(eq(shareSettings.studentId, first.user.id));
    expect(Object.fromEntries(mine.map((row) => [row.category, row.enabled]))).toEqual(DEFAULT_SHARED);
    const all = await db.select().from(shareSettings).where(eq(shareSettings.familyId, family.id));
    expect(all).toHaveLength(18);
  });

  it("scholarship(), college(), essay(), story(), and conversation() insert usable rows", async () => {
    const { user } = await factories.student(db);
    const listing = await factories.scholarship(db, { amountMaxUsd: 2500 });
    const college = await factories.college(db, { name: "State U" });
    const essay = await factories.essay(db, user.id, { title: "Rotary essay" });
    const story = await factories.story(db, user.id);
    const conversation = await factories.conversation(db, user.id, { room: "temporary" });
    expect(listing).toMatchObject({ status: "published", visibility: "public", amountMaxUsd: 2500 });
    expect(listing.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(listing.verifiedAt).toBeInstanceOf(Date);
    expect(college.id).toMatch(/^\d{6}$/);
    expect(college.name).toBe("State U");
    expect(essay).toMatchObject({ ownerId: user.id, title: "Rotary essay", currentVersion: 0, status: "drafting" });
    expect(story.ownerId).toBe(user.id);
    expect(conversation).toMatchObject({ ownerId: user.id, room: "temporary" });
  });
});
```

`packages/db/src/schema/constraints.test.ts`:

```ts
import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pgErrorCode } from "../errors";
import { closeTestDb, getTestDb, resetDb } from "../testing/db";
import { factories } from "../testing/factories";
import {
  aidChecklistItems,
  blobs,
  conversations,
  essayVersions,
  essays,
  families,
  familyTasks,
  memoryFacts,
  notifications,
  planItems,
  profiles,
  scholarshipApplications,
  scholarships,
  stories,
  users,
} from "./index";

const db = getTestDb();

beforeEach(() => resetDb(db));
afterAll(() => closeTestDb());

async function errorCodeOf(query: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await query;
    return undefined;
  } catch (e) {
    return pgErrorCode(e);
  }
}

async function rowCount(table: PgTable): Promise<number> {
  const [row] = await db.select({ n: count() }).from(table);
  return row?.n ?? 0;
}

function one<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("expected a row");
  return row;
}

describe("constraints", () => {
  it("rejects a second application for the same student and scholarship", async () => {
    const { user } = await factories.student(db);
    const other = await factories.student(db);
    const listing = await factories.scholarship(db);
    await db.insert(scholarshipApplications).values({ ownerId: user.id, scholarshipId: listing.id });
    const duplicate = db.insert(scholarshipApplications).values({ ownerId: user.id, scholarshipId: listing.id });
    expect(await errorCodeOf(duplicate)).toBe("23505");
    const rows = await db
      .insert(scholarshipApplications)
      .values({ ownerId: other.user.id, scholarshipId: listing.id })
      .returning();
    expect(rows).toHaveLength(1);
  });

  it("deletes a user's profile, facts, essays, versions, and conversations with the user", async () => {
    const { user } = await factories.student(db);
    const essay = await factories.essay(db, user.id);
    await db
      .insert(essayVersions)
      .values({ essayId: essay.id, version: 1, body: "First draft", wordCount: 2, authorId: user.id });
    await db
      .insert(memoryFacts)
      .values({ ownerId: user.id, key: "intended_major", value: "mechanical engineering", source: "user_stated" });
    await factories.conversation(db, user.id);
    const owned = [profiles, memoryFacts, essays, essayVersions, conversations];
    for (const table of owned) expect(await rowCount(table)).toBe(1);
    await db.delete(users).where(eq(users.id, user.id));
    for (const table of owned) expect(await rowCount(table)).toBe(0);
  });

  it("keeps a family and clears createdById when its creator is deleted", async () => {
    const { user } = await factories.student(db);
    const parent = await factories.parent(db);
    const family = await factories.family(db, { studentIds: [user.id], parentIds: [parent.id] });
    await db.delete(users).where(eq(users.id, user.id));
    const row = one(await db.select().from(families).where(eq(families.id, family.id)));
    expect(row.createdById).toBeNull();
  });

  it("treats a null collegeId as equal in the aid checklist key", async () => {
    const { user } = await factories.student(db);
    const item: typeof aidChecklistItems.$inferInsert = {
      ownerId: user.id,
      awardYear: "2027-28",
      program: "fafsa",
      collegeId: null,
      key: "submit",
      title: "Submit the FAFSA",
      assignee: "student",
    };
    await db.insert(aidChecklistItems).values(item);
    expect(await errorCodeOf(db.insert(aidChecklistItems).values(item))).toBe("23505");
    expect(await db.insert(aidChecklistItems).values(item).onConflictDoNothing().returning()).toEqual([]);
    const perCollege = await db
      .insert(aidChecklistItems)
      .values({ ...item, collegeId: "990004" })
      .returning();
    expect(perCollege).toHaveLength(1);
  });

  it("returns [] from onConflictDoNothing when a notification dedupeKey exists", async () => {
    const { user } = await factories.student(db);
    const notice: typeof notifications.$inferInsert = {
      userId: user.id,
      kind: "deadline",
      title: "Rotary Club of Eastside is due in 7 days",
      body: "Due Oct 30.",
      link: "/scholarships",
      dedupeKey: `deadline:${user.id}:rotary:7`,
    };
    const firstTry = await db
      .insert(notifications)
      .values(notice)
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning();
    const secondTry = await db
      .insert(notifications)
      .values(notice)
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning();
    expect(firstTry).toHaveLength(1);
    expect(secondTry).toEqual([]);
    expect(await rowCount(notifications)).toBe(1);
  });

  it("round-trips bytea columns as Buffers", async () => {
    const ciphertext = Buffer.from([0, 1, 2, 250, 255]);
    const inserted = one(
      await db
        .insert(blobs)
        .values({ ciphertext, iv: Buffer.alloc(12, 7), tag: Buffer.alloc(16, 9) })
        .returning(),
    );
    const read = one(await db.select().from(blobs).where(eq(blobs.id, inserted.id)));
    expect(Buffer.isBuffer(read.ciphertext)).toBe(true);
    expect(read.ciphertext.equals(ciphertext)).toBe(true);
    expect(read.iv.equals(Buffer.alloc(12, 7))).toBe(true);
    expect(read.tag).toHaveLength(16);
  });

  it("reads dates as YYYY-MM-DD strings and timestamps as Dates", async () => {
    const { user } = await factories.student(db);
    const item = one(
      await db
        .insert(planItems)
        .values({
          ownerId: user.id,
          weekStart: "2026-10-05",
          title: "Upload your transcript",
          kind: "custom",
          minutes: 5,
          dueOn: "2026-10-09",
        })
        .returning(),
    );
    expect(item.weekStart).toBe("2026-10-05");
    expect(item.dueOn).toBe("2026-10-09");
    expect(item.createdAt).toBeInstanceOf(Date);
    expect(item.contributors).toEqual([]);
    expect(item.generated).toBe(false);
  });

  it("allows one family task per aid item and assignee and drops it with the item (R2I-6)", async () => {
    const { user } = await factories.student(db);
    const parent = await factories.parent(db);
    const family = await factories.family(db, { studentIds: [user.id], parentIds: [parent.id] });
    const item = one(
      await db
        .insert(aidChecklistItems)
        .values({ ownerId: user.id, awardYear: "2027-28", program: "fafsa", key: "contributor_consent", title: "Give consent to share federal tax information", assignee: "parent" })
        .returning(),
    );
    const task: typeof familyTasks.$inferInsert = {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: user.id,
      kind: "fafsa_contributor",
      title: item.title,
      detail: "FAFSA 2027-28",
      aidItemId: item.id,
    };
    await db.insert(familyTasks).values(task);
    expect(await errorCodeOf(db.insert(familyTasks).values(task))).toBe("23505");
    expect(await db.insert(familyTasks).values(task).onConflictDoNothing().returning()).toEqual([]);
    const custom = { ...task, kind: "custom" as const, title: "Call the aid office", aidItemId: null };
    await db.insert(familyTasks).values([custom, custom]);
    expect(await rowCount(familyTasks)).toBe(3);
    await db.delete(aidChecklistItems).where(eq(aidChecklistItems.id, item.id));
    expect(await rowCount(familyTasks)).toBe(2);
  });

  it("defaults text arrays, jsonb lists, and catalog fields", async () => {
    const { user } = await factories.student(db);
    const story = one(
      await db
        .insert(stories)
        .values({ ownerId: user.id, title: "Night shift at the bakery", moment: "Closing alone on a Friday night." })
        .returning(),
    );
    const listing = one(
      await db
        .insert(scholarships)
        .values({
          slug: "defaults-check",
          name: "Defaults Check Award",
          provider: "Test Foundation",
          url: "https://example.org/defaults",
          sourceUrl: "https://example.org/defaults",
          amountMinUsd: 500,
          amountMaxUsd: 500,
          cycle: "2026-27",
          localArea: { national: true, state: null, counties: [], cities: [] },
          requirements: { essays: [], recommendations: 0, transcript: false, serviceHours: null, other: [] },
        })
        .returning(),
    );
    expect(story.themes).toEqual([]);
    expect(listing).toMatchObject({
      eligibility: [],
      scamFlags: [],
      status: "draft",
      visibility: "public",
      estMinutes: 60,
      renewable: false,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @scholarcrew/db test`
Expected: FAIL with `Failed to resolve import "./factories" from "src/testing/factories.test.ts"` and `Failed to resolve import "../errors" from "src/schema/constraints.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/db/src/errors.ts`:

```ts
/**
 * Postgres SQLSTATE of a failed query ("23505" for a unique violation), or undefined.
 * drizzle 0.44 wraps driver errors in DrizzleQueryError with the PostgresError as `cause`, so this walks the chain.
 */
export function pgErrorCode(e: unknown): string | undefined {
  let current: unknown = e;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}
```

`packages/db/src/testing/factories.ts`:

```ts
import { randomUUID } from "node:crypto";
import { DEFAULT_SHARED, SHARE_CATEGORIES } from "@scholarcrew/domain";
import type { Db } from "../client";
import {
  colleges,
  conversations,
  essays,
  families,
  familyMembers,
  profiles,
  scholarships,
  shareSettings,
  stories,
  users,
} from "../schema";

type User = typeof users.$inferSelect;
type Profile = typeof profiles.$inferSelect;
type StudentOptions = { email?: string; state?: string; county?: string; classYear?: number; gpaX100?: number };

export interface Factories {
  user(db: Db, o?: Partial<typeof users.$inferInsert>): Promise<User>;
  student(db: Db, o?: StudentOptions): Promise<{ user: User; profile: Profile }>;
  parent(db: Db, o?: { email?: string }): Promise<User>;
  admin(db: Db): Promise<User>;
  family(db: Db, o: { studentIds: string[]; parentIds: string[] }): Promise<typeof families.$inferSelect>;
  scholarship(db: Db, o?: Partial<typeof scholarships.$inferInsert>): Promise<typeof scholarships.$inferSelect>;
  college(db: Db, o?: Partial<typeof colleges.$inferInsert>): Promise<typeof colleges.$inferSelect>;
  essay(db: Db, ownerId: string, o?: Partial<typeof essays.$inferInsert>): Promise<typeof essays.$inferSelect>;
  story(db: Db, ownerId: string, o?: Partial<typeof stories.$inferInsert>): Promise<typeof stories.$inferSelect>;
  conversation(
    db: Db,
    ownerId: string,
    o?: Partial<typeof conversations.$inferInsert>,
  ): Promise<typeof conversations.$inferSelect>;
}

let counter = 0;

function nextNumber(): number {
  counter += 1;
  return counter;
}

function uniqueTag(): string {
  return `${nextNumber()}-${randomUUID().slice(0, 8)}`;
}

function first<T>(rows: T[], table: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`Insert into ${table} returned no row`);
  return row;
}

async function user(db: Db, o: Partial<typeof users.$inferInsert> = {}): Promise<User> {
  const email = (o.email ?? `user-${uniqueTag()}@example.test`).toLowerCase();
  return first(
    await db
      .insert(users)
      .values({ displayName: "Test User", ...o, email })
      .returning(),
    "users",
  );
}

async function student(db: Db, o: StudentOptions = {}): Promise<{ user: User; profile: Profile }> {
  const created = await user(db, {
    email: o.email ?? `student-${uniqueTag()}@example.test`,
    displayName: "Test Student",
    role: "student",
    birthYear: 2009,
  });
  const profile = first(
    await db
      .insert(profiles)
      .values({
        userId: created.id,
        classYear: o.classYear ?? 2027,
        highSchool: "Maple High School",
        state: o.state ?? "TX",
        county: o.county ?? "Maple",
        gpaUnweightedX100: o.gpaX100 ?? 372,
        onboardingCompletedAt: new Date(),
      })
      .returning(),
    "profiles",
  );
  return { user: created, profile };
}

async function parent(db: Db, o: { email?: string } = {}): Promise<User> {
  return user(db, {
    email: o.email ?? `parent-${uniqueTag()}@example.test`,
    displayName: "Test Parent",
    role: "parent",
    birthYear: 1980,
  });
}

async function admin(db: Db): Promise<User> {
  return user(db, { email: `admin-${uniqueTag()}@example.test`, displayName: "Test Admin", role: "admin" });
}

async function family(
  db: Db,
  o: { studentIds: string[]; parentIds: string[] },
): Promise<typeof families.$inferSelect> {
  const created = first(
    await db
      .insert(families)
      .values({ createdById: o.studentIds[0] ?? o.parentIds[0] ?? null })
      .returning(),
    "families",
  );
  const members: Array<typeof familyMembers.$inferInsert> = [
    ...o.studentIds.map((userId) => ({ familyId: created.id, userId, memberRole: "student" as const })),
    ...o.parentIds.map((userId) => ({ familyId: created.id, userId, memberRole: "parent" as const })),
  ];
  if (members.length > 0) await db.insert(familyMembers).values(members);
  const shares = o.studentIds.flatMap((studentId) =>
    SHARE_CATEGORIES.map((category) => ({
      studentId,
      familyId: created.id,
      category,
      enabled: DEFAULT_SHARED[category],
    })),
  );
  if (shares.length > 0) await db.insert(shareSettings).values(shares);
  return created;
}

async function scholarship(
  db: Db,
  o: Partial<typeof scholarships.$inferInsert> = {},
): Promise<typeof scholarships.$inferSelect> {
  const slug = o.slug ?? `test-scholarship-${uniqueTag()}`;
  const url = `https://example.org/scholarships/${slug}`;
  return first(
    await db
      .insert(scholarships)
      .values({
        name: "Test Scholarship",
        provider: "Test Foundation",
        url,
        sourceUrl: url,
        amountMinUsd: 1000,
        amountMaxUsd: 1000,
        deadline: "2026-11-15",
        cycle: "2026-27",
        localArea: { national: true, state: null, counties: [], cities: [] },
        eligibility: [],
        requirements: { essays: [], recommendations: 0, transcript: false, serviceHours: null, other: [] },
        status: "published",
        verifiedAt: new Date(),
        ...o,
        slug,
      })
      .returning(),
    "scholarships",
  );
}

async function college(db: Db, o: Partial<typeof colleges.$inferInsert> = {}): Promise<typeof colleges.$inferSelect> {
  const id = o.id ?? String(800000 + nextNumber());
  return first(
    await db
      .insert(colleges)
      .values({
        name: `Test College ${id}`,
        state: "TX",
        city: "Testville",
        control: "public",
        admitRateX1000: 600,
        costOfAttendanceUsd: 30000,
        netPriceByIncome: {
          overall: 15000,
          under_30k: null,
          "30_48k": null,
          "48_75k": null,
          "75_110k": null,
          over_110k: null,
        },
        testPolicy: "optional",
        deadlines: { ED: null, EA: null, REA: null, RD: "2027-01-15", rolling: false },
        requirements: {
          supplements: [],
          teacherRecs: 1,
          counselorRec: true,
          applicationFeeUsd: 50,
          feeWaiverAvailable: true,
          portfolio: false,
          interview: "none",
        },
        sourceUrl: `https://example.org/colleges/${id}`,
        verifiedAt: new Date(),
        ...o,
        id,
      })
      .returning(),
    "colleges",
  );
}

async function essay(
  db: Db,
  ownerId: string,
  o: Partial<typeof essays.$inferInsert> = {},
): Promise<typeof essays.$inferSelect> {
  return first(
    await db
      .insert(essays)
      .values({ title: "Test Essay", prompt: "Tell us about a time you helped someone.", wordLimit: 500, ...o, ownerId })
      .returning(),
    "essays",
  );
}

async function story(
  db: Db,
  ownerId: string,
  o: Partial<typeof stories.$inferInsert> = {},
): Promise<typeof stories.$inferSelect> {
  return first(
    await db
      .insert(stories)
      .values({
        title: "Test Story",
        moment: "The first library STEM night, 30 kids came and we had one extension cord.",
        themes: ["service"],
        ...o,
        ownerId,
      })
      .returning(),
    "stories",
  );
}

async function conversation(
  db: Db,
  ownerId: string,
  o: Partial<typeof conversations.$inferInsert> = {},
): Promise<typeof conversations.$inferSelect> {
  return first(
    await db
      .insert(conversations)
      .values({ room: "my_crew", ...o, ownerId })
      .returning(),
    "conversations",
  );
}

/** Test data builders. Defaults are fictional; every email is unique per call. */
export const factories: Factories = {
  user,
  student,
  parent,
  admin,
  family,
  scholarship,
  college,
  essay,
  story,
  conversation,
};
```

Modify `packages/db/src/testing/index.ts` (whole file):

```ts
export { TABLE_NAMES, closeTestDb, getTestDb, resetDb } from "./db";
export { DEFAULT_TEST_DATABASE_URL, parseEnvFile, resolveTestDatabaseUrl, testDatabaseUrl } from "./env";
export { factories } from "./factories";
export type { Factories } from "./factories";
export { setupTestDatabase } from "./setup";
```

Modify `packages/db/src/index.ts` (whole file):

```ts
export * as schema from "./schema";
export * from "./schema";
export { createDb } from "./client";
export type { Db, DbOrTx, Tx } from "./client";
export { pgErrorCode } from "./errors";
export { runMigrations } from "./migrate";
export type { SQL, AnyColumn } from "drizzle-orm";
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec biome check --write packages/db && pnpm --filter @scholarcrew/db typecheck && pnpm --filter @scholarcrew/db test`
Expected: PASS, `Test Files 7 passed (7)`, `Tests 95 passed (95)`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): test factories, pg error codes, and constraint tests"
```

### C7: Dev seed from the mockups

Every person, school, IPEDS-like id (`99xxxx`, outside the real IPEDS range), scholarship, amount, and quote below is fictional and comes from `design/mockups/source/*.html`. Sensitive facts aren't seeded because their encryption lives in core (plan 06) and needs `ENCRYPTION_KEY`; award letters aren't seeded because the offers mockup is a spring view.

- [ ] **Step 1: Write the failing test**

`packages/db/src/seed/seed.test.ts`:

```ts
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  aidChecklistItems,
  aidDeadlines,
  aidRules,
  colleges,
  conversations,
  costEstimates,
  essayVersions,
  essays,
  familyMembers,
  familyTasks,
  messages,
  planItems,
  profiles,
  scholarshipApplications,
  scholarships,
  sweepRuns,
  users,
} from "../schema";
import { TABLE_NAMES, closeTestDb, getTestDb, resetDb } from "../testing/db";
import { SEED_EMAILS, seedDev } from "./index";

const db = getTestDb();

beforeEach(() => resetDb(db));
afterAll(() => closeTestDb());

function one<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`missing ${what}`);
  return row;
}

async function rowCounts(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    TABLE_NAMES.map(async (name) => {
      const rows = await db.execute(sql.raw(`select count(*)::int as n from "${name}"`));
      return [name, Number(rows[0]?.n)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function jordan() {
  return one(await db.select().from(users).where(eq(users.email, SEED_EMAILS.jordan)), "Jordan");
}

describe("seedDev", () => {
  it("creates Jordan, Dana, and an admin, plus Jordan's profile", async () => {
    await seedDev(db);
    const people = await db.select().from(users).where(inArray(users.email, Object.values(SEED_EMAILS)));
    expect(people.map((p) => `${p.email}:${p.role}:${p.displayName}`).sort()).toEqual([
      "admin@example.com:admin:Admin",
      "dana@example.com:parent:Dana",
      "jordan@example.com:student:Jordan R.",
    ]);
    const j = await jordan();
    const profile = one(await db.select().from(profiles).where(eq(profiles.userId, j.id)), "profile");
    expect(profile).toMatchObject({
      state: "TX",
      county: "Maple",
      classYear: 2027,
      gpaUnweightedX100: 372,
      highSchool: "Maple High School",
    });
  });

  it("runs twice without errors or duplicate rows", async () => {
    await seedDev(db);
    const once = await rowCounts();
    await seedDev(db);
    expect(await rowCounts()).toEqual(once);
    expect(once.users).toBe(3);
    expect(once.families).toBe(1);
    expect(once.colleges).toBe(6);
  });

  it("seeds the six mockup colleges with their numbers and Jordan's gaps", async () => {
    await seedDev(db);
    const rows = await db.select().from(colleges);
    expect(rows).toHaveLength(6);
    expect(rows.every((c) => /^99\d{4}$/.test(c.id))).toBe(true);
    const byName = Object.fromEntries(rows.map((c) => [c.name, c]));
    const stateU = byName["State U"];
    expect(stateU).toMatchObject({
      costOfAttendanceUsd: 27800,
      testPolicy: "optional",
      outsidePolicy: "added_on_top",
      aidPriorityDate: "2026-12-01",
    });
    expect(stateU?.meritTiers).toEqual([
      { label: "State U Merit Award", minGpa: 3.5, minAct: null, minSat: null, annualUsd: 3000, renewalGpa: 3 },
    ]);
    expect(stateU?.deadlines.EA).toBe("2026-11-01");
    expect(byName["Riverside College"]?.costOfAttendanceUsd).toBe(31200);
    expect(byName["Riverside College"]?.deadlines.rolling).toBe(true);
    expect(byName["Bay Tech"]?.outsidePolicy).toBe("may_reduce_grant");
    expect(byName["Bay Tech"]?.deadlines.EA).toBe("2026-11-15");
    expect(byName["Northgate University"]).toMatchObject({
      costOfAttendanceUsd: 68400,
      testPolicy: "required",
      cssProfileRequired: true,
      outsidePolicy: "reduces_loans_first",
    });
    expect(byName["Northgate University"]?.deadlines.RD).toBe("2027-01-05");
    expect(byName["Central State"]?.deadlines.rolling).toBe(true);
    expect(byName["Lakeshore University"]?.outsidePolicy).toBe("unknown");
    const j = await jordan();
    const gaps = await db.select().from(costEstimates).where(eq(costEstimates.ownerId, j.id));
    expect(Object.fromEntries(gaps.map((g) => [g.collegeId, g.netPriceUsd]))).toEqual({
      "990001": 9200,
      "990002": 6800,
      "990003": 11900,
      "990004": 12800,
      "990005": 5900,
      "990006": 21300,
    });
  });

  it("seeds every application stage, a hidden scam listing, and Sunday's sweep", async () => {
    await seedDev(db);
    const j = await jordan();
    const board = await db
      .select({ stage: scholarshipApplications.stage, amountUsd: scholarships.amountMaxUsd })
      .from(scholarshipApplications)
      .innerJoin(scholarships, eq(scholarshipApplications.scholarshipId, scholarships.id))
      .where(eq(scholarshipApplications.ownerId, j.id));
    expect([...new Set(board.map((r) => r.stage))].sort()).toEqual([
      "drafting",
      "lost",
      "matched",
      "planned",
      "skipped",
      "submitted",
      "won",
    ]);
    const open = ["matched", "planned", "drafting", "submitted"];
    expect(board.filter((r) => open.includes(r.stage)).reduce((sum, r) => sum + r.amountUsd, 0)).toBe(12250);
    const flagged = await db.select().from(scholarships).where(eq(scholarships.status, "flagged"));
    expect(flagged.map((s) => [s.name, s.scamFlags])).toEqual([["Golden Future Scholars Award", ["application_fee"]]]);
    const sweep = one(await db.select().from(sweepRuns).where(eq(sweepRuns.ownerId, j.id)), "sweep");
    expect(sweep).toMatchObject({
      newMatches: 3,
      totalUsd: 7500,
      reuseCount: 2,
      hiddenScams: 1,
      hiddenScholarshipIds: [flagged[0]?.id],
    });
  });

  it("seeds the Rotary draft, the week of Oct 5, the family, the aid checklist, and crew replies", async () => {
    await seedDev(db);
    const j = await jordan();
    const rotary = one(
      await db
        .select()
        .from(essays)
        .where(and(eq(essays.ownerId, j.id), eq(essays.title, "Rotary Club of Eastside essay"))),
      "Rotary essay",
    );
    expect(rotary).toMatchObject({ currentVersion: 2, wordLimit: 500, targetType: "scholarship", status: "drafting" });
    const versions = await db.select().from(essayVersions).where(eq(essayVersions.essayId, rotary.id));
    expect(versions.map((v) => `${v.version}:${v.wordCount}`).sort()).toEqual(["1:79", "2:142"]);
    const week = await db
      .select()
      .from(planItems)
      .where(and(eq(planItems.ownerId, j.id), eq(planItems.weekStart, "2026-10-05")));
    expect(week).toHaveLength(5);
    expect(week.every((i) => i.generated)).toBe(true);
    expect(week.filter((i) => i.status === "done").map((i) => i.title)).toEqual(["Upload your transcript"]);
    expect(week.filter((i) => i.status === "todo").reduce((sum, i) => sum + i.minutes, 0)).toBe(135);
    // Award years are written "2027-28" with a hyphen, like the AwardYear schema (R3V-12).
    expect(week.map((i) => i.title)).toContain("Start the 2027-28 FAFSA with Dana");
    expect(week.some((i) => /\d{4}–\d{2}/.test(i.title))).toBe(false);
    expect(await db.select().from(familyMembers).where(eq(familyMembers.userId, j.id))).toHaveLength(1);
    const aidItems = await db.select().from(aidChecklistItems).where(eq(aidChecklistItems.ownerId, j.id));
    expect(aidItems).toHaveLength(10);
    const linked = await db.select().from(familyTasks).where(and(eq(familyTasks.studentId, j.id), isNotNull(familyTasks.aidItemId)));
    const parentItems = aidItems.filter((i) => i.assignee === "parent");
    expect(linked.map((t) => t.aidItemId).sort()).toEqual(parentItems.map((i) => i.id).sort());
    expect(linked.map((t) => `${t.kind}:${t.detail}`).sort()).toEqual([
      "css_contributor:CSS Profile 2027-28",
      "fafsa_contributor:FAFSA 2027-28",
      "fafsa_contributor:FAFSA 2027-28",
    ]);
    const replies = await db
      .select({ reply: messages.reply })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(and(eq(conversations.ownerId, j.id), eq(messages.authorKind, "crew")));
    expect(replies).toHaveLength(2);
    expect(replies.every((m) => m.reply?.contributors.includes("compass") === true)).toBe(true);
  });

  it("seeds sample aid rules and deadlines, each marked as sample data (R2P-1)", async () => {
    await seedDev(db);
    const rules = await db.select().from(aidRules);
    expect(rules.map((r) => `${r.awardYear}:${r.key}`).sort()).toEqual(["2026-27:federal_loan_rates", "2027-28:federal_loan_rates"]);
    expect(rules[0]?.value).toEqual({ subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 });
    const deadlines = await db.select().from(aidDeadlines);
    expect(deadlines.map((d) => `${d.awardYear}:${d.state ?? "federal"}:${d.program}:${d.deadline}`).sort()).toEqual([
      "2026-27:TX:TEXAS Grant priority:2026-01-15",
      "2026-27:federal:FAFSA:2027-06-30",
      "2027-28:TX:TEXAS Grant priority:2027-01-15",
      "2027-28:federal:FAFSA:2028-06-30",
    ]);
    expect(deadlines.every((d) => d.note.startsWith("Sample data"))).toBe(true);
    expect(deadlines.every((d) => d.sourceUrl === "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @scholarcrew/db test`
Expected: FAIL with `Failed to resolve import "./index" from "src/seed/seed.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/db/src/seed/util.ts`:

```ts
import { createHash } from "node:crypto";

/** Fixed dev-only tokens so the seeded helper links and hours-verification request can be opened locally. */
export const SEED_TOKENS = {
  patelHelperLink: "seed-helper-link-patel".padEnd(43, "0"),
  okaforHelperLink: "seed-helper-link-okafor".padEnd(43, "0"),
  riveraVerification: "seed-verify-hours-rivera".padEnd(43, "0"),
} as const;

export const at = (iso: string): Date => new Date(iso);

export const daysFromNow = (days: number): Date => new Date(Date.now() + days * 86_400_000);

/** Same hashing as core's sha256Hex, so the tokens above resolve. */
export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

export function one<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`Seed insert into ${what} returned no row`);
  return row;
}
```

`packages/db/src/seed/people.ts`:

```ts
import { DEFAULT_SHARED, SHARE_CATEGORIES } from "@scholarcrew/domain";
import { inArray } from "drizzle-orm";
import type { DbOrTx } from "../client";
import {
  families,
  familyBudgets,
  familyMembers,
  notificationPrefs,
  profiles,
  shareSettings,
  subscriptions,
  users,
} from "../schema";
import { at, daysFromNow, one } from "./util";

export const SEED_EMAILS = {
  jordan: "jordan@example.com",
  dana: "dana@example.com",
  admin: "admin@example.com",
} as const;

export interface SeedPeople {
  jordanId: string;
  danaId: string;
  adminId: string;
  familyId: string;
}

/** Deletes the seed users and their families. Everything they own cascades. */
export async function removeSeedPeople(db: DbOrTx): Promise<void> {
  const seeded = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, Object.values(SEED_EMAILS)));
  const ids = seeded.map((row) => row.id);
  if (ids.length === 0) return;
  const memberships = await db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(inArray(familyMembers.userId, ids));
  const familyIds = [...new Set(memberships.map((row) => row.familyId))];
  if (familyIds.length > 0) await db.delete(families).where(inArray(families.id, familyIds));
  await db.delete(users).where(inArray(users.id, ids));
}

export async function seedPeople(db: DbOrTx): Promise<SeedPeople> {
  const jordan = one(
    await db
      .insert(users)
      .values({
        email: SEED_EMAILS.jordan,
        displayName: "Jordan R.",
        role: "student",
        birthYear: 2009,
        createdAt: at("2026-10-01T15:00:00.000Z"),
      })
      .returning(),
    "users",
  );
  const dana = one(
    await db
      .insert(users)
      .values({
        email: SEED_EMAILS.dana,
        displayName: "Dana",
        role: "parent",
        birthYear: 1981,
        createdAt: at("2026-10-02T01:00:00.000Z"),
      })
      .returning(),
    "users",
  );
  const admin = one(
    await db
      .insert(users)
      .values({ email: SEED_EMAILS.admin, displayName: "Admin", role: "admin", createdAt: at("2026-09-01T15:00:00.000Z") })
      .returning(),
    "users",
  );

  await db.insert(profiles).values({
    userId: jordan.id,
    classYear: 2027,
    highSchool: "Maple High School",
    state: "TX",
    county: "Maple",
    city: "Eastside",
    gpaUnweightedX100: 372,
    gpaWeightedX100: 405,
    intendedMajors: ["Mechanical engineering"],
    interests: ["robotics", "programming", "teaching"],
    onboardingCompletedAt: at("2026-10-01T15:20:00.000Z"),
  });

  const family = one(
    await db
      .insert(families)
      .values({ name: "Jordan and Dana", createdById: jordan.id, createdAt: at("2026-10-01T16:00:00.000Z") })
      .returning(),
    "families",
  );
  await db.insert(familyMembers).values([
    { familyId: family.id, userId: jordan.id, memberRole: "student", joinedAt: at("2026-10-01T16:00:00.000Z") },
    { familyId: family.id, userId: dana.id, memberRole: "parent", joinedAt: at("2026-10-02T01:05:00.000Z") },
  ]);
  await db.insert(shareSettings).values(
    SHARE_CATEGORIES.map((category) => ({
      studentId: jordan.id,
      familyId: family.id,
      category,
      enabled: DEFAULT_SHARED[category],
    })),
  );
  await db.insert(familyBudgets).values({ familyId: family.id, annualUsd: 4600, sharedById: dana.id });
  await db.insert(notificationPrefs).values([{ userId: jordan.id }, { userId: dana.id }]);
  await db.insert(subscriptions).values({
    ownerId: dana.id,
    plan: "family",
    status: "active",
    currentPeriodEnd: daysFromNow(30),
  });

  return { jordanId: jordan.id, danaId: dana.id, adminId: admin.id, familyId: family.id };
}
```

`packages/db/src/seed/catalog.ts`:

```ts
import type { LocalArea, ScholarshipRequirements } from "@scholarcrew/domain";
import { inArray } from "drizzle-orm";
import type { DbOrTx } from "../client";
import { catalogReports, catalogTasks, colleges, scholarships } from "../schema";
import type { SeedPeople } from "./people";
import { at, one } from "./util";

type NewCollege = typeof colleges.$inferInsert;
type NewScholarship = typeof scholarships.$inferInsert;

export type CollegeKey = "stateU" | "riverside" | "bayTech" | "northgate" | "centralState" | "lakeshore";
export type ScholarshipKey =
  | "hillCountry"
  | "rotary"
  | "loneStar"
  | "firstGen"
  | "codingForGood"
  | "eastsidePta"
  | "farmBureau"
  | "mapleLibrary"
  | "bluebonnet"
  | "pecanValley"
  | "goldenFuture";

export interface SeedCatalog {
  collegeIds: Record<CollegeKey, string>;
  collegeCosts: Record<CollegeKey, { costOfAttendanceUsd: number; gapUsd: number }>;
  scholarshipIds: Record<ScholarshipKey, string>;
}

interface CollegeSeed {
  gapUsd: number;
  row: NewCollege;
}

/** The 48_75k band equals the mockup's yearly gap for Jordan's family; the overall figure is a bit higher. */
function college(gapUsd: number, row: Omit<NewCollege, "netPriceByIncome">): CollegeSeed {
  return {
    gapUsd,
    row: {
      ...row,
      netPriceByIncome: {
        overall: gapUsd + 1500,
        under_30k: null,
        "30_48k": null,
        "48_75k": gapUsd,
        "75_110k": null,
        over_110k: null,
      },
    },
  };
}

const COLLEGES: Record<CollegeKey, CollegeSeed> = {
  stateU: college(9200, {
    id: "990001",
    name: "State U",
    state: "TX",
    city: "Lone Oak",
    control: "public",
    admitRateX1000: 640,
    costOfAttendanceUsd: 27800,
    testPolicy: "optional",
    superscore: true,
    cssProfileRequired: false,
    outsidePolicy: "added_on_top",
    meritTiers: [{ label: "State U Merit Award", minGpa: 3.5, minAct: null, minSat: null, annualUsd: 3000, renewalGpa: 3 }],
    deadlines: { ED: null, EA: "2026-11-01", REA: null, RD: "2027-01-15", rolling: false },
    requirements: {
      supplements: [{ prompt: "Why State U? Tell us how you would use our engineering programs.", wordLimit: 250 }],
      teacherRecs: 1,
      counselorRec: true,
      applicationFeeUsd: 60,
      feeWaiverAvailable: true,
      portfolio: false,
      interview: "none",
    },
    aidPriorityDate: "2026-12-01",
    sourceUrl: "https://example.org/state-u/admissions",
    verifiedAt: at("2026-09-30T15:00:00.000Z"),
  }),
  riverside: college(6800, {
    id: "990002",
    name: "Riverside College",
    state: "TX",
    city: "Riverside",
    control: "private_nonprofit",
    admitRateX1000: 780,
    costOfAttendanceUsd: 31200,
    testPolicy: "blind",
    superscore: null,
    cssProfileRequired: false,
    outsidePolicy: "added_on_top",
    meritTiers: [],
    deadlines: { ED: null, EA: null, REA: null, RD: null, rolling: true },
    requirements: {
      supplements: [],
      teacherRecs: 1,
      counselorRec: true,
      applicationFeeUsd: 0,
      feeWaiverAvailable: false,
      portfolio: false,
      interview: "optional",
    },
    aidPriorityDate: "2027-02-15",
    sourceUrl: "https://example.org/riverside/admissions",
    verifiedAt: at("2026-09-20T15:00:00.000Z"),
  }),
  bayTech: college(11900, {
    id: "990003",
    name: "Bay Tech",
    state: "TX",
    city: "Port Bayou",
    control: "public",
    admitRateX1000: 520,
    costOfAttendanceUsd: 29500,
    testPolicy: "optional",
    superscore: true,
    cssProfileRequired: false,
    outsidePolicy: "may_reduce_grant",
    meritTiers: [
      { label: "Bay Tech Dean's Award", minGpa: 3.5, minAct: 29, minSat: 1350, annualUsd: 2000, renewalGpa: 3.25 },
    ],
    deadlines: { ED: null, EA: "2026-11-15", REA: null, RD: "2027-01-15", rolling: false },
    requirements: {
      supplements: [{ prompt: "What problem would you like to solve at Bay Tech?", wordLimit: 300 }],
      teacherRecs: 1,
      counselorRec: true,
      applicationFeeUsd: 50,
      feeWaiverAvailable: true,
      portfolio: false,
      interview: "none",
    },
    aidPriorityDate: "2027-01-15",
    sourceUrl: "https://example.org/bay-tech/admissions",
    verifiedAt: at("2026-09-28T15:00:00.000Z"),
  }),
  northgate: college(12800, {
    id: "990004",
    name: "Northgate University",
    state: "IL",
    city: "Northgate",
    control: "private_nonprofit",
    admitRateX1000: 180,
    costOfAttendanceUsd: 68400,
    testPolicy: "required",
    superscore: true,
    cssProfileRequired: true,
    outsidePolicy: "reduces_loans_first",
    meritTiers: [],
    deadlines: { ED: "2026-11-01", EA: null, REA: null, RD: "2027-01-05", rolling: false },
    requirements: {
      supplements: [{ prompt: "Why Northgate?", wordLimit: 250 }],
      teacherRecs: 2,
      counselorRec: true,
      applicationFeeUsd: 80,
      feeWaiverAvailable: true,
      portfolio: false,
      interview: "optional",
    },
    aidPriorityDate: "2027-02-01",
    sourceUrl: "https://example.org/northgate/admissions",
    verifiedAt: at("2026-09-25T15:00:00.000Z"),
  }),
  centralState: college(5900, {
    id: "990005",
    name: "Central State",
    state: "TX",
    city: "Midland Springs",
    control: "public",
    admitRateX1000: 850,
    costOfAttendanceUsd: 22400,
    testPolicy: "blind",
    superscore: null,
    cssProfileRequired: false,
    outsidePolicy: "added_on_top",
    meritTiers: [
      { label: "Central State Achievement Award", minGpa: 3.25, minAct: null, minSat: null, annualUsd: 1500, renewalGpa: 2.75 },
    ],
    deadlines: { ED: null, EA: null, REA: null, RD: null, rolling: true },
    requirements: {
      supplements: [],
      teacherRecs: 0,
      counselorRec: true,
      applicationFeeUsd: 40,
      feeWaiverAvailable: true,
      portfolio: false,
      interview: "none",
    },
    aidPriorityDate: "2027-01-15",
    sourceUrl: "https://example.org/central-state/admissions",
    verifiedAt: at("2026-09-22T15:00:00.000Z"),
  }),
  lakeshore: college(21300, {
    id: "990006",
    name: "Lakeshore University",
    state: "MI",
    city: "Lakeshore",
    control: "private_nonprofit",
    admitRateX1000: 210,
    costOfAttendanceUsd: 61500,
    testPolicy: "required",
    superscore: false,
    cssProfileRequired: false,
    outsidePolicy: "unknown",
    meritTiers: [],
    deadlines: { ED: null, EA: null, REA: null, RD: "2027-01-15", rolling: false },
    requirements: {
      supplements: [{ prompt: "Describe a community you belong to.", wordLimit: 300 }],
      teacherRecs: 1,
      counselorRec: true,
      applicationFeeUsd: 75,
      feeWaiverAvailable: true,
      portfolio: false,
      interview: "none",
    },
    aidPriorityDate: "2027-02-15",
    sourceUrl: "https://example.org/lakeshore/admissions",
    verifiedAt: at("2026-09-18T15:00:00.000Z"),
  }),
};

const NATIONAL: LocalArea = { national: true, state: null, counties: [], cities: [] };
const TEXAS: LocalArea = { national: false, state: "TX", counties: [], cities: [] };
const MAPLE: LocalArea = { national: false, state: "TX", counties: ["Maple"], cities: [] };
const EASTSIDE: LocalArea = { national: false, state: "TX", counties: ["Maple"], cities: ["Eastside"] };

function requirements(essays: ScholarshipRequirements["essays"], other: string[] = []): ScholarshipRequirements {
  return { essays, recommendations: 0, transcript: false, serviceHours: null, other };
}

function listing(slug: string, fields: Omit<NewScholarship, "slug" | "url" | "sourceUrl" | "cycle">): NewScholarship {
  const url = `https://example.org/scholarships/${slug}`;
  return { status: "published", ...fields, slug, url, sourceUrl: url, cycle: "2026-27" };
}

const LISTINGS: Record<ScholarshipKey, NewScholarship> = {
  hillCountry: listing("hill-country-stem-award", {
    name: "Hill Country STEM Award",
    provider: "Hill Country STEM Foundation",
    amountMinUsd: 1000,
    amountMaxUsd: 1000,
    deadline: "2026-10-15",
    localArea: TEXAS,
    eligibility: [
      { type: "state_in", states: ["TX"] },
      { type: "class_year_in", years: [2027] },
      { type: "interest_any", interests: ["robotics", "engineering", "programming"] },
    ],
    requirements: requirements([
      { prompt: "Describe a STEM project you led.", wordLimit: 150 },
      { prompt: "How will you use STEM to help your community?", wordLimit: 150 },
    ]),
    estMinutes: 60,
    verifiedAt: at("2026-10-02T15:00:00.000Z"),
  }),
  rotary: listing("rotary-club-of-eastside", {
    name: "Rotary Club of Eastside Scholarship",
    provider: "Rotary Club of Eastside",
    amountMinUsd: 2500,
    amountMaxUsd: 2500,
    deadline: "2026-10-30",
    localArea: EASTSIDE,
    eligibility: [
      { type: "county_in", state: "TX", counties: ["Maple"] },
      { type: "class_year_in", years: [2027] },
    ],
    requirements: requirements(
      [{ prompt: "Describe a time you used your skills to serve your community.", wordLimit: 500 }],
      ["Upload the essay as a PDF"],
    ),
    estMinutes: 45,
    verifiedAt: at("2026-10-02T15:00:00.000Z"),
  }),
  loneStar: listing("lone-star-credit-union-award", {
    name: "Lone Star Credit Union Award",
    provider: "Lone Star Credit Union",
    amountMinUsd: 1500,
    amountMaxUsd: 1500,
    deadline: "2026-11-20",
    localArea: MAPLE,
    eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
    requirements: requirements([{ prompt: "How has your community shaped your plans after high school?", wordLimit: 300 }]),
    estMinutes: 45,
    verifiedAt: at("2026-10-02T15:00:00.000Z"),
  }),
  firstGen: listing("first-gen-futures-scholarship", {
    name: "First-Gen Futures Scholarship",
    provider: "First-Gen Futures Fund",
    amountMinUsd: 5000,
    amountMaxUsd: 5000,
    renewable: true,
    renewalTerms: "Renews each year with a 2.5 GPA and full-time enrollment.",
    deadline: "2026-12-01",
    localArea: NATIONAL,
    eligibility: [{ type: "first_gen" }, { type: "class_year_in", years: [2027] }],
    requirements: requirements([
      { prompt: "What does being the first in your family to go to college mean to you?", wordLimit: 400 },
      { prompt: "Describe a challenge you worked through and what you learned.", wordLimit: 400 },
    ]),
    estMinutes: 120,
    verifiedAt: at("2026-09-28T15:00:00.000Z"),
  }),
  codingForGood: listing("coding-for-good-award", {
    name: "Coding for Good Award",
    provider: "Coding for Good",
    amountMinUsd: 1000,
    amountMaxUsd: 1000,
    deadline: "2026-11-08",
    localArea: NATIONAL,
    eligibility: [{ type: "interest_any", interests: ["robotics", "programming", "coding"] }],
    requirements: requirements([{ prompt: "Share a project link and tell us who it helps.", wordLimit: 200 }], ["Project link"]),
    estMinutes: 40,
    verifiedAt: at("2026-10-01T15:00:00.000Z"),
  }),
  eastsidePta: listing("eastside-pta-senior-award", {
    name: "Eastside PTA Senior Award",
    provider: "Eastside PTA Council",
    amountMinUsd: 500,
    amountMaxUsd: 500,
    deadline: "2026-09-30",
    localArea: EASTSIDE,
    eligibility: [
      { type: "city_in", state: "TX", cities: ["Eastside"] },
      { type: "class_year_in", years: [2027] },
    ],
    requirements: requirements([{ prompt: "Tell us about a teacher who changed how you learn.", wordLimit: 250 }]),
    estMinutes: 45,
    verifiedAt: at("2026-09-15T15:00:00.000Z"),
  }),
  farmBureau: listing("maple-county-farm-bureau-award", {
    name: "Maple County Farm Bureau Award",
    provider: "Maple County Farm Bureau",
    amountMinUsd: 750,
    amountMaxUsd: 750,
    deadline: "2026-09-25",
    localArea: MAPLE,
    eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
    requirements: requirements([{ prompt: "What does agriculture mean to Maple County's future?", wordLimit: 300 }]),
    estMinutes: 60,
    verifiedAt: at("2026-09-10T15:00:00.000Z"),
  }),
  mapleLibrary: listing("maple-library-essay-prize", {
    name: "Maple Library Essay Prize",
    provider: "Friends of the Maple Public Library",
    amountMinUsd: 1000,
    amountMaxUsd: 1000,
    deadline: "2026-08-15",
    localArea: MAPLE,
    eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
    requirements: requirements([{ prompt: "Write about a time work taught you something school couldn't.", wordLimit: 400 }]),
    estMinutes: 60,
    verifiedAt: at("2026-08-01T15:00:00.000Z"),
  }),
  bluebonnet: listing("bluebonnet-youth-leadership-award", {
    name: "Bluebonnet Youth Leadership Award",
    provider: "Bluebonnet Leadership Council",
    amountMinUsd: 750,
    amountMaxUsd: 750,
    deadline: "2026-09-01",
    localArea: TEXAS,
    eligibility: [{ type: "state_in", states: ["TX"] }],
    requirements: requirements([{ prompt: "Describe a time you led a group through a setback.", wordLimit: 300 }]),
    estMinutes: 60,
    verifiedAt: at("2026-08-15T15:00:00.000Z"),
  }),
  pecanValley: listing("pecan-valley-arts-scholarship", {
    name: "Pecan Valley Arts Scholarship",
    provider: "Pecan Valley Arts Council",
    amountMinUsd: 500,
    amountMaxUsd: 500,
    deadline: "2026-11-30",
    localArea: MAPLE,
    eligibility: [
      { type: "county_in", state: "TX", counties: ["Maple"] },
      { type: "interest_any", interests: ["visual art"] },
    ],
    requirements: requirements([], ["Portfolio of five pieces"]),
    estMinutes: 90,
    verifiedAt: at("2026-09-20T15:00:00.000Z"),
  }),
  goldenFuture: listing("golden-future-scholars-award", {
    name: "Golden Future Scholars Award",
    provider: "Golden Future Scholars",
    amountMinUsd: 10000,
    amountMaxUsd: 10000,
    deadline: "2026-12-31",
    localArea: NATIONAL,
    eligibility: [],
    requirements: requirements([], ['Pay a $25 "processing fee" to apply']),
    status: "flagged",
    scamFlags: ["application_fee"],
    estMinutes: 15,
    verifiedAt: null,
  }),
};

/** Upserts colleges by id and scholarships by slug, then replaces the seeded scam report and its admin task. */
export async function seedCatalog(db: DbOrTx, people: SeedPeople): Promise<SeedCatalog> {
  const collegeIds = {} as Record<CollegeKey, string>;
  const collegeCosts = {} as SeedCatalog["collegeCosts"];
  for (const [key, seed] of Object.entries(COLLEGES) as Array<[CollegeKey, CollegeSeed]>) {
    await db
      .insert(colleges)
      .values(seed.row)
      .onConflictDoUpdate({ target: colleges.id, set: { ...seed.row, updatedAt: new Date() } });
    collegeIds[key] = seed.row.id;
    collegeCosts[key] = { costOfAttendanceUsd: seed.row.costOfAttendanceUsd ?? 0, gapUsd: seed.gapUsd };
  }

  const scholarshipIds = {} as Record<ScholarshipKey, string>;
  for (const [key, entry] of Object.entries(LISTINGS) as Array<[ScholarshipKey, NewScholarship]>) {
    const values = { ...entry, verifiedById: entry.verifiedAt ? people.adminId : null };
    const row = one(
      await db
        .insert(scholarships)
        .values(values)
        .onConflictDoUpdate({ target: scholarships.slug, set: { ...values, updatedAt: new Date() } })
        .returning({ id: scholarships.id }),
      "scholarships",
    );
    scholarshipIds[key] = row.id;
  }

  const seededIds = Object.values(scholarshipIds);
  await db.delete(catalogTasks).where(inArray(catalogTasks.scholarshipId, seededIds));
  await db.delete(catalogReports).where(inArray(catalogReports.scholarshipId, seededIds));
  const report = one(
    await db
      .insert(catalogReports)
      .values({
        scholarshipId: scholarshipIds.goldenFuture,
        reporterId: people.jordanId,
        reason: "scam",
        details: 'Asks for a $25 "processing fee" before you can apply.',
        createdAt: at("2026-10-04T14:30:00.000Z"),
      })
      .returning(),
    "catalog_reports",
  );
  await db.insert(catalogTasks).values({
    kind: "report",
    scholarshipId: scholarshipIds.goldenFuture,
    payload: { type: "report", reportId: report.id, reason: "scam", details: report.details },
    createdById: people.jordanId,
    createdAt: at("2026-10-04T14:30:00.000Z"),
  });

  return { collegeIds, collegeCosts, scholarshipIds };
}
```

`packages/db/src/seed/aid.ts` (R2P-1):

```ts
import type { FederalLoanRates } from "@scholarcrew/domain";
import { and, inArray } from "drizzle-orm";
import type { DbOrTx } from "../client";
import { aidDeadlines, aidRules } from "../schema";
import { at } from "./util";

export const SAMPLE_AID_YEARS = ["2026-27", "2027-28"] as const;
export const SAMPLE_AID_NOTE = "Sample data for development. Check the source before relying on it.";
const SAMPLE_PROGRAMS = ["FAFSA", "TEXAS Grant priority"];
const VERIFIED_AT = at("2026-10-01T15:00:00.000Z");

// SAMPLE DATA for development: not verified rates or deadlines for these award years.
// The published 2025-26 federal rates, reused as samples. Admins maintain real values at /admin/aid.
const SAMPLE_LOAN_RATES: FederalLoanRates = { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 };

/** "2027-28" → [2027, 2028]. */
function calendarYears(awardYear: string): [number, number] {
  const first = Number(awardYear.slice(0, 4));
  return [first, first + 1];
}

/** Upserts the sample loan-rate rules and replaces the sample deadlines, so a second run adds no rows. */
export async function seedAid(db: DbOrTx): Promise<void> {
  for (const awardYear of SAMPLE_AID_YEARS) {
    // SAMPLE DATA for development: not verified rates or deadlines for these award years.
    const rule = {
      awardYear,
      key: "federal_loan_rates",
      value: SAMPLE_LOAN_RATES,
      sourceUrl: "https://studentaid.gov/understand-aid/types/loans/interest-rates",
      verifiedAt: VERIFIED_AT,
    };
    await db
      .insert(aidRules)
      .values(rule)
      .onConflictDoUpdate({ target: [aidRules.awardYear, aidRules.key], set: { value: rule.value, sourceUrl: rule.sourceUrl, verifiedAt: rule.verifiedAt } });
  }

  await db
    .delete(aidDeadlines)
    .where(and(inArray(aidDeadlines.awardYear, [...SAMPLE_AID_YEARS]), inArray(aidDeadlines.program, SAMPLE_PROGRAMS)));
  await db.insert(aidDeadlines).values(
    SAMPLE_AID_YEARS.flatMap((awardYear) => {
      const [first, second] = calendarYears(awardYear);
      // SAMPLE DATA for development: not verified rates or deadlines for these award years.
      return [
        {
          awardYear,
          state: null,
          program: "FAFSA",
          deadline: `${second}-06-30`,
          note: SAMPLE_AID_NOTE,
          sourceUrl: "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines",
          verifiedAt: VERIFIED_AT,
        },
        {
          awardYear,
          state: "TX",
          program: "TEXAS Grant priority",
          deadline: `${first}-01-15`,
          note: SAMPLE_AID_NOTE,
          sourceUrl: "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines",
          verifiedAt: VERIFIED_AT,
        },
      ];
    }),
  );
}
```

`packages/db/src/seed/records.ts`:

```ts
import { CSS_STEPS, type CrewReply, FAFSA_STEPS, type ProgressEvent } from "@scholarcrew/domain";
import type { DbOrTx } from "../client";
import {
  activities,
  aidChecklistItems,
  applicationItems,
  collegeList,
  conversations,
  costEstimates,
  crewJobs,
  decisions,
  essayComments,
  essayVersions,
  essays,
  familyTasks,
  helperLinks,
  memoryFacts,
  messages,
  notifications,
  planItems,
  recRequests,
  recommenders,
  scholarshipApplications,
  serviceLogs,
  stories,
  storyUses,
  sweepRuns,
  testScores,
} from "../schema";
import type { CollegeKey, SeedCatalog } from "./catalog";
import type { SeedPeople } from "./people";
import { SEED_TOKENS, at, daysFromNow, one, sha256Hex } from "./util";

type NewEntry = typeof collegeList.$inferInsert;
type NewItem = typeof applicationItems.$inferInsert;
type NewAidItem = typeof aidChecklistItems.$inferInsert;
type ItemSpec = [kind: NewItem["kind"], label: string, status: NonNullable<NewItem["status"]>];

interface ListSpec {
  college: CollegeKey;
  fit: NewEntry["fit"];
  plan: NewEntry["plan"];
  status: NonNullable<NewEntry["status"]>;
  dueOn: string | null;
  items: ItemSpec[];
}

interface StoryIds {
  roboticsId: string;
  bakeryId: string;
}

interface EssayIds {
  hillCountry: string;
  stateU: string;
  rotary: string;
  library: string;
}

const paragraphs = (...lines: string[]): string => lines.join("\n\n");

const ROTARY_OPENING = [
  "I have always been passionate about robotics. In ninth grade I joined our school's robotics team, and by junior year I was the build lead. But the moment I'm proudest of didn't happen at a competition.",
  "Last spring, our librarian asked if the team could run a STEM night for elementary students. I said yes before I knew what I was signing up for. The first night, 30 kids came, and we had four robots and one extension cord.",
];
/** 79 words. */
const ROTARY_DRAFT_1 = paragraphs(...ROTARY_OPENING);
/** 142 words, the draft in the Essay Studio mockup. */
const ROTARY_DRAFT_2 = paragraphs(
  ...ROTARY_OPENING,
  "We kept going every other Thursday. I learned how to explain a motor controller to a nine-year-old, which is harder than building one. By May, some of the kids were building their own sensors and teaching their parents how they worked.",
  "Robotics taught me engineering, but the library nights taught me that knowing something is only half of it. The other half is",
);
/** 58 words: answer 1 done, answer 2 started. */
const HILL_COUNTRY_DRAFT = paragraphs(
  "Our robotics team's arm kept dropping game pieces, so I rebuilt the gripper with a second servo and a foam pad cut from an old yoga mat. I ran 40 test picks before regionals, and we finished with the best pickup rate in our bracket.",
  "Every other Thursday I help run STEM nights at the Maple Public Library.",
);
/** 57 words. */
const LIBRARY_ESSAY = paragraphs(
  "At 5 a.m. the bakery is quiet except for the mixer. I started working the early shift at sixteen, and the first thing I learned was that bread doesn't wait for you to be ready. Neither do customers. The job taught me to show up early, plan ahead, and own my mistakes when a batch didn't rise.",
);

const COLLEGE_LIST: ListSpec[] = [
  {
    college: "stateU",
    fit: "target",
    plan: "EA",
    status: "applying",
    dueOn: "2026-11-01",
    items: [
      ["form", "Application form", "done"],
      ["transcript", "Transcript", "done"],
      ["counselor_rec", "Counselor recommendation · Mr. Okafor", "done"],
      ["supplement", "Supplement · 250 words", "in_progress"],
      ["teacher_rec", "Teacher recommendation · Ms. Patel", "todo"],
    ],
  },
  {
    college: "riverside",
    fit: "likely",
    plan: "rolling",
    status: "submitted",
    dueOn: null,
    items: [
      ["form", "Application form", "done"],
      ["transcript", "Transcript", "done"],
      ["counselor_rec", "Counselor recommendation · Mr. Okafor", "done"],
      ["fee_or_waiver", "Fee waiver", "done"],
    ],
  },
  {
    college: "bayTech",
    fit: "target",
    plan: "EA",
    status: "applying",
    dueOn: "2026-11-15",
    items: [
      ["form", "Application form", "done"],
      ["transcript", "Transcript", "done"],
      ["counselor_rec", "Counselor recommendation", "todo"],
      ["supplement", "Supplement · 300 words", "todo"],
      ["teacher_rec", "Teacher recommendation", "todo"],
    ],
  },
  {
    college: "northgate",
    fit: "reach",
    plan: "RD",
    status: "applying",
    dueOn: "2027-01-05",
    items: [
      ["form", "Application form", "done"],
      ["transcript", "Transcript", "todo"],
      ["counselor_rec", "Counselor recommendation", "todo"],
      ["teacher_rec", "Two teacher recommendations", "todo"],
      ["supplement", "Supplement · Why Northgate?", "todo"],
      ["css_profile", "CSS Profile", "todo"],
    ],
  },
  {
    college: "centralState",
    fit: "likely",
    plan: "rolling",
    status: "applying",
    dueOn: null,
    items: [
      ["form", "Application form", "done"],
      ["transcript", "Transcript", "done"],
      ["counselor_rec", "Counselor recommendation", "done"],
      ["fee_or_waiver", "Fee waiver", "done"],
    ],
  },
  {
    college: "lakeshore",
    fit: "reach",
    plan: "RD",
    status: "researching",
    dueOn: "2027-01-15",
    items: [
      ["form", "Application form", "todo"],
      ["transcript", "Transcript", "todo"],
      ["counselor_rec", "Counselor recommendation", "todo"],
      ["teacher_rec", "Teacher recommendation", "todo"],
      ["supplement", "Supplement · 300 words", "todo"],
      ["test_scores", "Send test scores", "todo"],
    ],
  },
];

async function seedMemory(db: DbOrTx, people: SeedPeople): Promise<StoryIds> {
  const ownerId = people.jordanId;
  const oct1 = at("2026-10-01T15:10:00.000Z");
  const guessedAt = at("2026-10-04T18:00:00.000Z");
  const guessExpires = at("2026-11-03T18:00:00.000Z");
  await db.insert(memoryFacts).values([
    { ownerId, key: "class_year", value: 2027, source: "user_stated", createdAt: oct1, confirmedAt: oct1 },
    { ownerId, key: "high_school", value: "Maple High School", source: "user_stated", createdAt: oct1, confirmedAt: oct1 },
    {
      ownerId,
      key: "gpa_unweighted",
      value: 3.72,
      source: "document",
      sourceRef: "transcript upload",
      createdAt: at("2026-09-12T20:00:00.000Z"),
      confirmedAt: at("2026-09-12T20:00:00.000Z"),
    },
    {
      ownerId,
      key: "act_composite",
      value: 27,
      source: "document",
      sourceRef: "score report",
      visibility: "crew_family",
      createdAt: at("2026-09-30T15:00:00.000Z"),
      confirmedAt: at("2026-09-30T15:00:00.000Z"),
    },
    {
      ownerId,
      key: "intended_major",
      value: "mechanical engineering",
      source: "user_stated",
      sourceRef: "crew message",
      createdAt: at("2026-10-02T23:00:00.000Z"),
      confirmedAt: at("2026-10-02T23:00:00.000Z"),
    },
    {
      ownerId,
      key: "home_county",
      value: "Maple",
      source: "user_stated",
      visibility: "scout_only",
      createdAt: oct1,
      confirmedAt: oct1,
    },
    {
      ownerId,
      key: "parent_employer",
      value: "Maple County Schools",
      source: "parent_shared",
      sourceRef: people.danaId,
      visibility: "scout_only",
      createdAt: at("2026-10-03T01:30:00.000Z"),
      confirmedAt: at("2026-10-03T01:30:00.000Z"),
    },
    {
      ownerId,
      key: "possible_major",
      value: "nursing",
      source: "crew_inferred",
      status: "candidate",
      createdAt: guessedAt,
      expiresAt: guessExpires,
    },
    {
      ownerId,
      key: "distance_preference",
      value: "within 3 hours of home",
      source: "crew_inferred",
      status: "candidate",
      createdAt: guessedAt,
      expiresAt: guessExpires,
    },
  ]);

  await db.insert(decisions).values([
    {
      ownerId,
      summary: "Skip Early Decision at Northgate: compare aid offers first.",
      rationale: "Early Decision is binding, and Northgate's aid is need-based.",
      decidedAt: at("2026-10-03T22:00:00.000Z"),
    },
    {
      ownerId,
      summary: "Keep the list at 6 schools: 2 likely, 2 target, 2 reach.",
      decidedAt: at("2026-09-29T22:00:00.000Z"),
    },
  ]);

  const robotics = one(
    await db
      .insert(stories)
      .values({
        ownerId,
        title: "Robotics → library STEM nights",
        moment:
          "Last spring the librarian asked our robotics team to run a STEM night. The first night 30 kids came, and we had four robots and one extension cord.",
        themes: ["service", "teaching", "leadership"],
        evidence: "Ran STEM nights every other Thursday from February to May.",
        summary: "Turned robotics skills into library STEM nights for elementary kids.",
        createdAt: oct1,
      })
      .returning(),
    "stories",
  );
  const bakery = one(
    await db
      .insert(stories)
      .values({
        ownerId,
        title: "Night shift at the bakery",
        moment: "I open Sunrise Bakery at 5 a.m. on weekends. The first month I ruined a whole batch and had to tell the owner.",
        themes: ["work", "responsibility"],
        summary: "Weekend early shifts taught me to plan ahead and own mistakes.",
        createdAt: oct1,
      })
      .returning(),
    "stories",
  );
  await db.insert(stories).values([
    {
      ownerId,
      title: "Translating at the clinic",
      moment: "At the Maple Community Clinic I translate between Spanish and English for families at the front desk.",
      themes: ["family", "language", "care"],
      createdAt: oct1,
    },
    {
      ownerId,
      title: "Losing the regional final",
      moment: "Our robot lost the regional final by two points after our arm jammed in the last ten seconds.",
      themes: ["setback", "teamwork"],
      createdAt: oct1,
    },
  ]);
  return { roboticsId: robotics.id, bakeryId: bakery.id };
}

async function seedEssays(db: DbOrTx, people: SeedPeople, catalog: SeedCatalog, story: StoryIds): Promise<EssayIds> {
  const ownerId = people.jordanId;
  const s = catalog.scholarshipIds;
  const hill = one(
    await db
      .insert(essays)
      .values({
        ownerId,
        title: "Hill Country STEM Award answers",
        prompt: "Describe a STEM project you led. How will you use STEM to help your community? (150 words each)",
        wordLimit: 150,
        targetType: "scholarship",
        targetScholarshipId: s.hillCountry,
        currentVersion: 1,
        createdAt: at("2026-10-03T17:00:00.000Z"),
      })
      .returning(),
    "essays",
  );
  const stateU = one(
    await db
      .insert(essays)
      .values({
        ownerId,
        title: "State U supplement",
        prompt: "Why State U? Tell us how you would use our engineering programs.",
        wordLimit: 250,
        targetType: "college",
        targetCollegeId: catalog.collegeIds.stateU,
        createdAt: at("2026-09-30T20:00:00.000Z"),
      })
      .returning(),
    "essays",
  );
  const rotary = one(
    await db
      .insert(essays)
      .values({
        ownerId,
        title: "Rotary Club of Eastside essay",
        prompt: "Describe a time you used your skills to serve your community.",
        wordLimit: 500,
        targetType: "scholarship",
        targetScholarshipId: s.rotary,
        currentVersion: 2,
        createdAt: at("2026-10-04T19:30:00.000Z"),
      })
      .returning(),
    "essays",
  );
  const library = one(
    await db
      .insert(essays)
      .values({
        ownerId,
        title: "Maple Library Essay Prize",
        prompt: "Write about a time work taught you something school couldn't.",
        wordLimit: 400,
        targetType: "scholarship",
        targetScholarshipId: s.mapleLibrary,
        currentVersion: 1,
        status: "submitted",
        createdAt: at("2026-08-08T18:00:00.000Z"),
      })
      .returning(),
    "essays",
  );

  await db.insert(essayVersions).values([
    {
      essayId: hill.id,
      version: 1,
      body: HILL_COUNTRY_DRAFT,
      wordCount: 58,
      authorId: ownerId,
      createdAt: at("2026-10-03T17:10:00.000Z"),
    },
    {
      essayId: rotary.id,
      version: 1,
      body: ROTARY_DRAFT_1,
      wordCount: 79,
      authorId: ownerId,
      createdAt: at("2026-10-04T20:00:00.000Z"),
    },
    {
      essayId: rotary.id,
      version: 2,
      body: ROTARY_DRAFT_2,
      wordCount: 142,
      authorId: ownerId,
      createdAt: at("2026-10-06T21:58:00.000Z"),
    },
    {
      essayId: library.id,
      version: 1,
      body: LIBRARY_ESSAY,
      wordCount: 57,
      authorId: ownerId,
      createdAt: at("2026-08-10T18:00:00.000Z"),
    },
  ]);

  const reviewedAt = at("2026-10-06T22:00:00.000Z");
  await db.insert(essayComments).values([
    {
      essayId: rotary.id,
      version: 2,
      author: "quill",
      kind: "structure",
      quote: "I have always been passionate about robotics.",
      body: "This tells the reader you're passionate. Can you open inside the room instead? What did the first STEM night look and sound like?",
      createdAt: reviewedAt,
    },
    {
      essayId: rotary.id,
      version: 2,
      author: "quill",
      kind: "question",
      quote: "30 kids came",
      body: "That's a headcount. What changed for one of those kids? One kid's moment will carry more than the number.",
      createdAt: reviewedAt,
    },
    {
      essayId: rotary.id,
      version: 2,
      author: "quill",
      kind: "prompt_fit",
      quote: "By May, some of the kids were building their own sensors and teaching their parents how they worked.",
      body: "This is your strongest line. Rotary asks how you served your community: who were these nights for, and what did those families need?",
      createdAt: reviewedAt,
    },
  ]);

  await db.insert(storyUses).values([
    { storyId: story.roboticsId, essayId: hill.id, scholarshipId: s.hillCountry, usedAt: at("2026-10-03T17:10:00.000Z") },
    {
      storyId: story.roboticsId,
      essayId: stateU.id,
      collegeId: catalog.collegeIds.stateU,
      usedAt: at("2026-09-30T20:00:00.000Z"),
    },
    { storyId: story.roboticsId, essayId: rotary.id, scholarshipId: s.rotary, usedAt: at("2026-10-04T20:00:00.000Z") },
    { storyId: story.bakeryId, essayId: library.id, scholarshipId: s.mapleLibrary, usedAt: at("2026-08-10T18:00:00.000Z") },
  ]);

  return { hillCountry: hill.id, stateU: stateU.id, rotary: rotary.id, library: library.id };
}

async function seedCollegeList(
  db: DbOrTx,
  people: SeedPeople,
  catalog: SeedCatalog,
  stateUEssayId: string,
): Promise<Record<CollegeKey, string>> {
  const ownerId = people.jordanId;
  const entryIds = {} as Record<CollegeKey, string>;
  for (const spec of COLLEGE_LIST) {
    const entry = one(
      await db
        .insert(collegeList)
        .values({
          ownerId,
          collegeId: catalog.collegeIds[spec.college],
          fit: spec.fit,
          plan: spec.plan,
          status: spec.status,
          season: "2026-27",
          createdAt: at("2026-09-29T19:00:00.000Z"),
        })
        .returning(),
      "college_list",
    );
    entryIds[spec.college] = entry.id;
    await db.insert(applicationItems).values(
      spec.items.map(
        ([kind, label, status]): NewItem => ({
          ownerId,
          collegeListId: entry.id,
          kind,
          label,
          status,
          dueOn: spec.dueOn,
          essayId: spec.college === "stateU" && kind === "supplement" ? stateUEssayId : null,
        }),
      ),
    );
  }
  return entryIds;
}

async function seedHelpers(db: DbOrTx, people: SeedPeople, entryIds: Record<CollegeKey, string>): Promise<string> {
  const ownerId = people.jordanId;
  const patel = one(
    await db
      .insert(recommenders)
      .values({ ownerId, name: "Ms. Patel", email: "patel@example.com", relationship: "Physics teacher" })
      .returning(),
    "recommenders",
  );
  const okafor = one(
    await db
      .insert(recommenders)
      .values({ ownerId, name: "Mr. Okafor", email: "okafor@example.com", relationship: "School counselor" })
      .returning(),
    "recommenders",
  );
  await db.insert(recRequests).values([
    {
      ownerId,
      recommenderId: okafor.id,
      collegeListId: entryIds.stateU,
      status: "confirmed",
      requestedAt: at("2026-09-28T15:00:00.000Z"),
    },
    { ownerId, recommenderId: patel.id, collegeListId: entryIds.stateU, status: "draft" },
  ]);
  await db.insert(helperLinks).values([
    {
      studentId: ownerId,
      label: "Ms. Patel",
      helperRole: "recommender",
      scope: ["activities", "stories"],
      tokenHash: sha256Hex(SEED_TOKENS.patelHelperLink),
      expiresAt: daysFromNow(30),
    },
    {
      studentId: ownerId,
      label: "Mr. Okafor",
      helperRole: "counselor",
      scope: ["deadlines", "colleges"],
      tokenHash: sha256Hex(SEED_TOKENS.okaforHelperLink),
      expiresAt: daysFromNow(30),
    },
  ]);
  return patel.id;
}

async function seedApplications(db: DbOrTx, people: SeedPeople, catalog: SeedCatalog): Promise<void> {
  const ownerId = people.jordanId;
  const s = catalog.scholarshipIds;
  const maple = { code: "county", text: "You live in Maple County", sensitive: false };
  await db.insert(scholarshipApplications).values([
    { ownerId, scholarshipId: s.loneStar, stage: "matched", fitScore: 82, estMinutes: 45, matchReasons: [maple] },
    {
      ownerId,
      scholarshipId: s.firstGen,
      stage: "matched",
      fitScore: 78,
      estMinutes: 120,
      matchReasons: [{ code: "first_gen", text: "Matches a private detail you chose to use", sensitive: true }],
    },
    {
      ownerId,
      scholarshipId: s.codingForGood,
      stage: "matched",
      fitScore: 74,
      estMinutes: 40,
      matchReasons: [{ code: "interest", text: "Robotics and programming", sensitive: false }],
    },
    {
      ownerId,
      scholarshipId: s.hillCountry,
      stage: "drafting",
      fitScore: 90,
      estMinutes: 30,
      matchReasons: [{ code: "interest", text: "Robotics and engineering", sensitive: false }],
    },
    { ownerId, scholarshipId: s.rotary, stage: "planned", fitScore: 88, estMinutes: 45, matchReasons: [maple] },
    {
      ownerId,
      scholarshipId: s.eastsidePta,
      stage: "submitted",
      fitScore: 70,
      estMinutes: 45,
      submittedAt: at("2026-09-28T23:00:00.000Z"),
    },
    {
      ownerId,
      scholarshipId: s.farmBureau,
      stage: "submitted",
      fitScore: 72,
      estMinutes: 60,
      matchReasons: [maple],
      submittedAt: at("2026-09-20T22:00:00.000Z"),
    },
    {
      ownerId,
      scholarshipId: s.mapleLibrary,
      stage: "won",
      fitScore: 85,
      estMinutes: 60,
      matchReasons: [maple],
      submittedAt: at("2026-08-10T18:30:00.000Z"),
      outcomeUsd: 1000,
      outcomeRenewable: false,
      outcomeAt: at("2026-09-05T15:00:00.000Z"),
      thankYouSent: true,
    },
    {
      ownerId,
      scholarshipId: s.bluebonnet,
      stage: "lost",
      fitScore: 60,
      estMinutes: 60,
      submittedAt: at("2026-08-28T18:00:00.000Z"),
      outcomeAt: at("2026-09-22T15:00:00.000Z"),
    },
    { ownerId, scholarshipId: s.pecanValley, stage: "skipped", fitScore: 20, estMinutes: 90 },
  ]);
}

async function seedActivity(db: DbOrTx, people: SeedPeople): Promise<void> {
  const ownerId = people.jordanId;
  await db.insert(testScores).values({
    ownerId,
    test: "ACT",
    takenOn: "2026-09-12",
    official: true,
    composite: 27,
    sections: { english: 27, math: 28, reading: 26, science: 27 },
    createdAt: at("2026-09-30T15:00:00.000Z"),
  });
  await db.insert(activities).values([
    {
      ownerId,
      position: 1,
      name: "Robotics team",
      role: "Build lead",
      organization: "Maple High School",
      description:
        "Lead a 12-person build team; run STEM nights for elementary students at the public library every other week.",
      hoursPerWeek: 8,
      weeksPerYear: 30,
      grades: [9, 10, 11],
      category: "STEM",
    },
    {
      ownerId,
      position: 2,
      name: "Sunrise Bakery",
      role: "Counter and prep",
      organization: "Sunrise Bakery",
      description: "Open the shop at 5 a.m. on weekends; prep dough, run the register, and train new hires.",
      hoursPerWeek: 12,
      weeksPerYear: 40,
      grades: [10, 11],
      category: "Work",
    },
    {
      ownerId,
      position: 3,
      name: "Clinic interpreter",
      role: "Volunteer",
      organization: "Maple Community Clinic",
      description: "Interpret Spanish and English for families at the front desk.",
      hoursPerWeek: 3,
      weeksPerYear: 20,
      grades: [11],
      category: "Community service",
    },
  ]);
  await db.insert(serviceLogs).values([
    {
      ownerId,
      organization: "Maple Public Library",
      activity: "STEM night for elementary students",
      servedOn: "2026-09-24",
      minutes: 120,
      supervisorName: "Ms. Rivera",
      supervisorEmail: "rivera@example.com",
      verification: "verified",
      verifiedAt: at("2026-09-26T18:00:00.000Z"),
      verifierNote: "Jordan ran the robot station all evening.",
      reflection: "One kid finally got her line follower working and ran to get her mom.",
    },
    {
      ownerId,
      organization: "Maple Public Library",
      activity: "STEM night for elementary students",
      servedOn: "2026-10-01",
      minutes: 120,
      supervisorName: "Ms. Rivera",
      supervisorEmail: "rivera@example.com",
      verification: "requested",
      verificationTokenHash: sha256Hex(SEED_TOKENS.riveraVerification),
      verificationExpiresAt: daysFromNow(14),
    },
  ]);
}

async function seedMoneyAndAid(db: DbOrTx, people: SeedPeople, catalog: SeedCatalog): Promise<void> {
  const ownerId = people.jordanId;
  const keys = Object.keys(catalog.collegeCosts) as CollegeKey[];
  await db.insert(costEstimates).values(
    keys.map((key): typeof costEstimates.$inferInsert => {
      const cost = catalog.collegeCosts[key];
      return {
        ownerId,
        collegeId: catalog.collegeIds[key],
        source: "scorecard",
        costOfAttendanceUsd: cost.costOfAttendanceUsd,
        freeMoneyUsd: cost.costOfAttendanceUsd - cost.gapUsd,
        netPriceUsd: cost.gapUsd,
        inputs: { incomeRange: "48_75k", sample: true },
        computedAt: at("2026-10-04T14:00:00.000Z"),
      };
    }),
  );

  const fafsaDone: Record<string, Date> = {
    studentaid_account: at("2026-10-04T16:40:00.000Z"),
    invite_contributors: at("2026-10-04T17:05:00.000Z"),
  };
  const aidItems: NewAidItem[] = [
    ...FAFSA_STEPS.map((step): NewAidItem => {
      const doneAt = fafsaDone[step.key];
      return {
        ownerId,
        awardYear: "2027-28",
        program: "fafsa",
        collegeId: null,
        key: step.key,
        title: step.title,
        assignee: step.assignee,
        status: doneAt ? "done" : "todo",
        dueOn: step.key === "submit" ? "2026-12-01" : null,
        completedAt: doneAt ?? null,
      };
    }),
    ...CSS_STEPS.map(
      (step): NewAidItem => ({
        ownerId,
        awardYear: "2027-28",
        program: "css",
        collegeId: catalog.collegeIds.northgate,
        key: step.key,
        title: step.title,
        assignee: step.assignee,
        dueOn: step.key === "css_submit" ? "2027-01-05" : null,
      }),
    ),
  ];
  const items = await db.insert(aidChecklistItems).values(aidItems).returning();

  // Parent steps are linked tasks (R2I-6): the aid item owns the status, so the seed sets none here. Same
  // title, detail, and due date that plan 08's ensureChecklists writes, so it finds these and adds nothing.
  const contributorTasks = items
    .filter((item) => item.assignee === "parent")
    .map(
      (item): typeof familyTasks.$inferInsert => ({
        familyId: people.familyId,
        assigneeId: people.danaId,
        studentId: ownerId,
        kind: item.program === "fafsa" ? "fafsa_contributor" : "css_contributor",
        title: item.title,
        detail: item.program === "fafsa" ? `FAFSA ${item.awardYear}` : `CSS Profile ${item.awardYear}`,
        dueOn: item.dueOn,
        aidItemId: item.id,
        createdAt: at("2026-10-04T17:05:00.000Z"),
      }),
    );

  await db.insert(familyTasks).values([
    ...contributorTasks,
    {
      familyId: people.familyId,
      assigneeId: people.danaId,
      studentId: ownerId,
      kind: "share_income_range",
      title: "Share household income range for matching",
      detail: "A range only, no documents.",
      status: "done",
      createdAt: at("2026-10-02T02:00:00.000Z"),
      completedAt: at("2026-10-03T01:30:00.000Z"),
    },
    {
      familyId: people.familyId,
      assigneeId: people.danaId,
      studentId: ownerId,
      kind: "review_costs",
      title: "Look over State U costs before Nov 1",
      detail: "Ledger will walk you through the estimate.",
      dueOn: "2026-11-01",
      createdAt: at("2026-10-05T14:00:00.000Z"),
    },
  ]);
}

async function seedWeek(
  db: DbOrTx,
  people: SeedPeople,
  catalog: SeedCatalog,
  refs: { essayIds: EssayIds; patelId: string },
): Promise<void> {
  const ownerId = people.jordanId;
  const s = catalog.scholarshipIds;
  await db.insert(sweepRuns).values({
    ownerId,
    ranAt: at("2026-10-04T14:00:00.000Z"),
    newMatches: 3,
    totalUsd: 7500,
    reuseCount: 2,
    hiddenScams: 1,
    hiddenScholarshipIds: [s.goldenFuture],
  });
  const weekStart = "2026-10-05";
  const plannedAt = at("2026-10-05T05:00:00.000Z");
  // The seeded week stands in for a crew-generated plan, so "Plan my week" replaces it in dev (R2C-4).
  await db.insert(planItems).values([
    {
      ownerId,
      weekStart,
      title: "Hill Country STEM Award: two short answers",
      kind: "scholarship",
      refType: "scholarship",
      refId: s.hillCountry,
      minutes: 30,
      valueUsd: 1000,
      dueOn: "2026-10-15",
      contributors: ["scout", "quill"],
      generated: true,
      createdAt: plannedAt,
    },
    {
      ownerId,
      weekStart,
      title: "State U supplement: first draft",
      kind: "essay",
      refType: "essay",
      refId: refs.essayIds.stateU,
      minutes: 60,
      dueOn: "2026-11-01",
      contributors: ["atlas", "quill"],
      generated: true,
      createdAt: plannedAt,
    },
    {
      ownerId,
      weekStart,
      title: "Ask Ms. Patel for a recommendation",
      kind: "recommendation",
      refType: "recommender",
      refId: refs.patelId,
      minutes: 10,
      contributors: ["atlas"],
      generated: true,
      createdAt: plannedAt,
    },
    {
      ownerId,
      weekStart,
      title: "Start the 2027-28 FAFSA with Dana",
      kind: "aid",
      refType: "aid",
      minutes: 35,
      dueOn: "2026-12-01",
      contributors: ["aid"],
      generated: true,
      createdAt: plannedAt,
    },
    {
      ownerId,
      weekStart,
      title: "Upload your transcript",
      kind: "custom",
      minutes: 5,
      status: "done",
      contributors: ["compass"],
      generated: true,
      createdAt: plannedAt,
      completedAt: at("2026-10-05T22:00:00.000Z"),
    },
  ]);
}

async function crewExchange(
  db: DbOrTx,
  i: {
    ownerId: string;
    conversationId: string;
    askedById: string;
    question: string;
    reply: CrewReply;
    askedAt: Date;
    progress: ProgressEvent[];
  },
): Promise<void> {
  const request = one(
    await db
      .insert(messages)
      .values({
        conversationId: i.conversationId,
        authorKind: "user",
        authorUserId: i.askedById,
        body: i.question,
        createdAt: i.askedAt,
      })
      .returning(),
    "messages",
  );
  const answeredAt = new Date(i.askedAt.getTime() + 40_000);
  const answer = one(
    await db
      .insert(messages)
      .values({
        conversationId: i.conversationId,
        authorKind: "crew",
        body: i.reply.text,
        reply: i.reply,
        createdAt: answeredAt,
      })
      .returning(),
    "messages",
  );
  await db.insert(crewJobs).values({
    usageMonth: "2026-10",
    ownerId: i.ownerId,
    kind: "crew_request",
    status: "ready",
    conversationId: i.conversationId,
    requestMessageId: request.id,
    resultMessageId: answer.id,
    progress: i.progress,
    createdAt: i.askedAt,
    updatedAt: answeredAt,
  });
}

async function seedCrew(
  db: DbOrTx,
  people: SeedPeople,
  catalog: SeedCatalog,
  refs: { essayIds: EssayIds; roboticsId: string },
): Promise<void> {
  const ownerId = people.jordanId;
  const s = catalog.scholarshipIds;
  const weekend = one(
    await db
      .insert(conversations)
      .values({ ownerId, room: "my_crew", title: "Weekend plan", createdAt: at("2026-10-03T15:58:00.000Z") })
      .returning(),
    "conversations",
  );
  const weekendReply: CrewReply = {
    text: "Start with the Hill Country STEM Award. It's due Thursday, and your robotics story already answers both questions. Then get a first draft of the State U supplement down, since Early Action closes Nov 1. Rotary can wait until next weekend.",
    contributors: ["compass", "atlas", "scout", "quill"],
    question: null,
    actionCards: [
      {
        kind: "add_plan_item",
        id: "hill-country-weekend",
        label: "Add Hill Country to my weekend",
        item: {
          title: "Hill Country STEM Award: two short answers",
          kind: "scholarship",
          refType: "scholarship",
          refId: s.hillCountry,
          minutes: 30,
          valueUsd: 1000,
          dueOn: "2026-10-15",
          contributors: ["scout", "quill"],
          weekStart: "2026-10-05",
        },
      },
      {
        kind: "open_link",
        id: "open-hill-country",
        label: "Open Hill Country answers",
        href: `/essays/${refs.essayIds.hillCountry}`,
      },
    ],
    receipt: [
      { kind: "fact", label: "Profile: GPA 3.72, Maple County", refId: null, sourceUrl: null, verifiedAt: null },
      {
        kind: "catalog",
        label: "Hill Country listing, verified Oct 2",
        refId: s.hillCountry,
        sourceUrl: "https://example.org/scholarships/hill-country-stem-award",
        verifiedAt: "2026-10-02T15:00:00.000Z",
      },
      {
        kind: "catalog",
        label: "State U requirements, verified Sep 30",
        refId: catalog.collegeIds.stateU,
        sourceUrl: "https://example.org/state-u/admissions",
        verifiedAt: "2026-09-30T15:00:00.000Z",
      },
      {
        kind: "record",
        label: 'Story Bank: "Robotics → library STEM nights"',
        refId: refs.roboticsId,
        sourceUrl: null,
        verifiedAt: null,
      },
    ],
    safety: null,
    needsInput: false,
  };
  await crewExchange(db, {
    ownerId,
    conversationId: weekend.id,
    askedById: ownerId,
    question: "I have 2 hours this weekend. What should I work on?",
    reply: weekendReply,
    askedAt: at("2026-10-03T16:00:00.000Z"),
    progress: [
      { at: "2026-10-03T16:00:02.000Z", role: "compass", text: "Asking Atlas, Scout, and Quill" },
      { at: "2026-10-03T16:00:20.000Z", role: "scout", text: "Checked deadlines for the next 4 weeks" },
      { at: "2026-10-03T16:00:35.000Z", role: "quill", text: "Matched your robotics story to both questions" },
    ],
  });

  const familyRoom = one(
    await db
      .insert(conversations)
      .values({
        ownerId,
        room: "family",
        familyId: people.familyId,
        title: "Family room",
        createdAt: at("2026-10-04T00:59:00.000Z"),
      })
      .returning(),
    "conversations",
  );
  const northgateReply: CrewReply = {
    text: "Northgate's estimated year-1 cost is $12,800, which is $8,200 more than the $4,600-a-year family budget you shared. Its aid is need-based, so the real number arrives with the offer in March.",
    contributors: ["compass", "ledger"],
    question: null,
    actionCards: [{ kind: "open_link", id: "compare-costs", label: "Compare all costs", href: "/money" }],
    receipt: [
      {
        kind: "calculation",
        label: "Year-1 gap at Northgate: $68,400 to attend minus $55,600 estimated free money",
        refId: catalog.collegeIds.northgate,
        sourceUrl: null,
        verifiedAt: null,
      },
      {
        kind: "record",
        label: "Family budget: $4,600 a year, shared by Dana",
        refId: null,
        sourceUrl: null,
        verifiedAt: null,
      },
    ],
    safety: null,
    needsInput: false,
  };
  await crewExchange(db, {
    ownerId,
    conversationId: familyRoom.id,
    askedById: people.danaId,
    question: "Is Northgate realistic for us?",
    reply: northgateReply,
    askedAt: at("2026-10-04T01:00:00.000Z"),
    progress: [{ at: "2026-10-04T01:00:05.000Z", role: "ledger", text: "Compared Northgate's estimate with the shared budget" }],
  });

  await db.insert(notifications).values([
    {
      userId: ownerId,
      kind: "new_matches",
      title: "3 new matches worth $7,500",
      body: "2 reuse your essays. 1 was hidden for charging a fee.",
      link: "/scholarships",
      dedupeKey: "seed:jordan:sweep:2026-10-04",
      createdAt: at("2026-10-04T14:01:00.000Z"),
    },
    {
      userId: ownerId,
      kind: "job_ready",
      title: "Your crew planned your weekend",
      body: "Start with the Hill Country STEM Award.",
      link: `/crew/${weekend.id}`,
      dedupeKey: "seed:jordan:job:weekend-plan",
      createdAt: at("2026-10-03T16:00:40.000Z"),
      readAt: at("2026-10-03T16:05:00.000Z"),
    },
    {
      userId: people.danaId,
      kind: "family",
      title: "Jordan added you as a FAFSA contributor",
      body: "Add your info from your own StudentAid.gov account.",
      link: "/family",
      dedupeKey: "seed:dana:fafsa-contributor",
      createdAt: at("2026-10-04T17:05:00.000Z"),
    },
  ]);
}

/** Jordan's records: memory, essays, colleges, helpers, applications, activity, money, this week, and crew chats. */
export async function seedRecords(db: DbOrTx, people: SeedPeople, catalog: SeedCatalog): Promise<void> {
  const storyIds = await seedMemory(db, people);
  const essayIds = await seedEssays(db, people, catalog, storyIds);
  const entryIds = await seedCollegeList(db, people, catalog, essayIds.stateU);
  const patelId = await seedHelpers(db, people, entryIds);
  await seedApplications(db, people, catalog);
  await seedActivity(db, people);
  await seedMoneyAndAid(db, people, catalog);
  await seedWeek(db, people, catalog, { essayIds, patelId });
  await seedCrew(db, people, catalog, { essayIds, roboticsId: storyIds.roboticsId });
}
```

`packages/db/src/seed/index.ts`:

```ts
import type { Db } from "../client";
import { seedAid } from "./aid";
import { seedCatalog } from "./catalog";
import { removeSeedPeople, seedPeople } from "./people";
import { seedRecords } from "./records";

export { SEED_EMAILS } from "./people";
export { SEED_TOKENS } from "./util";

/**
 * Loads the fictional sample data from design/mockups/source into a dev database: Jordan (student), Dana (parent),
 * an admin, six colleges, the mockup scholarships, and Jordan's records for the week of Oct 5, 2026, plus sample
 * aid rules and deadlines that are marked unverified (R2P-1).
 * Nothing here is real. Safe to run again: it deletes the seed users (their rows cascade) and upserts catalog rows.
 */
export async function seedDev(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await removeSeedPeople(tx);
    const people = await seedPeople(tx);
    const catalog = await seedCatalog(tx, people);
    await seedAid(tx);
    await seedRecords(tx, people, catalog);
  });
}
```

`packages/db/src/cli/seed.ts`:

```ts
import { createDb } from "../client";
import { SEED_EMAILS, seedDev } from "../seed";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(JSON.stringify({ level: "error", msg: "DATABASE_URL is not set" }));
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error(JSON.stringify({ level: "error", msg: "Refusing to seed with NODE_ENV=production" }));
  process.exit(1);
}

const { db, close } = createDb(url, { max: 1 });
try {
  await seedDev(db);
  console.log(JSON.stringify({ level: "info", msg: "seeded fictional sample data", users: Object.values(SEED_EMAILS) }));
} finally {
  await close();
}
```

- [ ] **Step 4: Run the test to verify it passes, then seed the dev database**

Run: `pnpm exec biome check --write packages/db && pnpm --filter @scholarcrew/db typecheck && pnpm --filter @scholarcrew/db test`
Expected: PASS, `Test Files 8 passed (8)`, `Tests 101 passed (101)`.

Run: `pnpm db:migrate && pnpm db:seed && pnpm db:seed`
Expected: `{"level":"info","msg":"migrations applied","target":"dev"}`, then `{"level":"info","msg":"seeded fictional sample data","users":["jordan@example.com","dana@example.com","admin@example.com"]}` twice. Exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): idempotent dev seed from the fictional mockup data"
```

## Success Criteria

Every command exits 0 from the repo root, with the database container running (`pnpm db:up && pnpm db:wait`):

- [ ] `pnpm --filter @scholarcrew/db typecheck` prints nothing.
- [ ] `pnpm --filter @scholarcrew/db test` reports `Test Files 8 passed (8)` and `Tests 101 passed (101)`.
- [ ] `pnpm lint` reports no errors.
- [ ] `pnpm db:migrate && pnpm db:migrate:test && pnpm db:seed` prints the three JSON lines from C5 and C7.
- [ ] `pnpm --filter @scholarcrew/db generate` prints `No schema changes, nothing to migrate` and `git status --porcelain packages/db/drizzle` prints nothing (the committed migration matches the schema).
- [ ] `grep -rn "new URL(" packages/db/src` prints nothing.

## Testing Requirements

Command: `pnpm --filter @scholarcrew/db test` (Vitest, `fileParallelism: false`, `globalSetup` = `src/testing/setup.ts`, which migrates `TEST_DATABASE_URL` once).

Expected: 8 files, 101 tests, 0 failed. What they prove:

- `env.test.ts` (6): `testDatabaseUrl()` prefers `process.env.TEST_DATABASE_URL`, then the repo-root `.env`, then the local default; the `.env` parser handles comments, quotes, `\r\n`, and `=` inside values.
- `enums.test.ts` (50): all 49 section 8 enums exist as `<name>_enum` with exactly the values of the matching `@scholarcrew/domain` enum, in order.
- `tables.test.ts` (4) and `index.test.ts` (12): all 60 tables exist with section 8 SQL names; `users` columns and defaults; `sensitive_facts` is keyed on `(owner_id, kind)` with `bytea` ciphertext (SE-02); all 42 foreign keys to `users` cascade except the three `set null` keys (SE-01); the aid checklist unique is `NULLS NOT DISTINCT`; `story_uses` is unique per `(story_id, essay_id)` and cascades from both sides; `rec_requests.message` is `text NOT NULL DEFAULT ''` (D38). Round 2: `plan_items.generated` is `boolean NOT NULL DEFAULT false` (R2C-4); `family_tasks.aid_item_id` is a nullable uuid FK to `aid_checklist_items` with cascade, plus the nulls-distinct `family_tasks_aid_item_assignee_uq` (R2I-6); `notifications.sms_sent_at` is a nullable timestamptz (R2I-9); `subscriptions` has no `family_id` (R2I-19).
- `migrate.test.ts` (8): the generated migration creates every table and enum in Postgres, `offers.archived_at` is a nullable `timestamptz` (ME-07), `rec_requests.message` is `text`, not null, default `''` (D38), the four round 2 column changes and the `family_tasks` unique and cascade FK exist in the migrated database, re-running is a no-op, `resetDb` empties every table and leaves `drizzle.__drizzle_migrations` alone.
- `factories.test.ts` (6): every factory inserts usable rows with the section 9.1 defaults (student TX/Maple/2027/372, family share settings from `DEFAULT_SHARED`), emails are lowercase and unique.
- `constraints.test.ts` (9): duplicate `(ownerId, scholarshipId)` applications fail with `23505`; deleting a user removes their profile, facts, essays, versions, and conversations (SE-01); deleting a family's creator keeps the family with `createdById` null; a duplicate aid item with a null `collegeId` fails and `onConflictDoNothing` returns `[]`; a second family task for the same `(aidItemId, assigneeId)` fails, any number of unlinked tasks are fine, and deleting the aid item deletes its task (R2I-6); a notification `dedupeKey` conflict returns `[]`; `bytea` round-trips Buffers; dates read back as `YYYY-MM-DD` strings and instants as `Date`, and a new plan item has `generated = false`; array and jsonb defaults are empty.
- `seed.test.ts` (6): `seedDev` creates Jordan, Dana, and an admin; running it twice leaves every table's row count unchanged; the six colleges carry the mockup numbers and Jordan's gaps; every application stage is present with $12,250 in play; the scam listing is flagged and hidden in Sunday's sweep; the Rotary draft has versions 1 (79 words) and 2 (142 words); the week of 2026-10-05 has 5 items totaling 135 open minutes, and its FAFSA title writes the award year with a hyphen (R3V-12); Dana's three contributor tasks are linked to the parent aid items (R2I-6); both seeded crew replies are stored as `CrewReply` JSON with `compass` among the contributors; 2 sample `aidRules` and 4 sample `aidDeadlines` rows exist and every deadline note starts with "Sample data" (R2P-1).

Round 4 schema tests pin every new lease, key id, share-provenance, expiry and Stripe-order column, all four uniqueness indexes, and both recommendation target delete actions.

## Review Checklist

- [ ] Every table, column, enum, index, unique, primary key, and foreign key in `00-overview.md` section 8 is present with the exact TypeScript property name and snake_case SQL name; `src/schema/expected.ts` matches section 8.
- [ ] Every FK to `users` cascades except `families.createdById`, `scholarships.submittedById`, and `catalogReports.reporterId` (`set null`). FKs not owned by a user (`collegeList.collegeId`, `costEstimates.collegeId`, `offers.collegeId`, `documents.blobId`) keep the default `no action`.
- [ ] `jsonb` columns use `$type<T>()` with types imported from `@scholarcrew/domain` via `import type`; no domain type is redefined in this package.
- [ ] `packages/db/drizzle/**` comes only from `pnpm --filter @scholarcrew/db generate` and contains one `NULLS NOT DISTINCT` constraint.
- [ ] `resetDb` truncates only tables found through `is(x, PgTable)` + `getTableName`, so it never touches `drizzle.__drizzle_migrations` or the `pgboss` schema.
- [ ] `@scholarcrew/db`, `/testing`, and `/seed` export exactly the section 9.1 names (plus the extras listed under Files); `factories` matches the section 9.1 signatures.
- [ ] Only `src/testing/env.ts`, `src/cli/*.ts`, and `drizzle.config.ts` read `process.env`; no code logs a database URL, token, or essay body.
- [ ] Seed data is fictional, uses `99xxxx` college ids, creates no sensitive facts, and is idempotent (second run leaves all row counts equal).
- [ ] No `new URL(..., import.meta.url)` in `packages/db/src`. The `exports` table is exported only as `exportsTable`; no module declares or exports a binding named `exports`.
- [ ] `offers.archivedAt` (`archived_at timestamptz`, nullable) exists for ME-07 New season.
- [ ] Round 2: `planItems.generated`, `familyTasks.aidItemId` (with `family_tasks_aid_item_assignee_uq`), and `notifications.smsSentAt` exist; `subscriptions` has no `familyId`; every seeded `aidRules`/`aidDeadlines` row sits under the `// SAMPLE DATA for development: not verified rates or deadlines for these award years.` comment.
- [ ] `migrate`, `migrate:test`, and `seed` scripts use `--env-file-if-exists=../../.env`.
