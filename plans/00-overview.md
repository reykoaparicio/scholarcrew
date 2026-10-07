# ScholarCrew implementation plan

ScholarCrew is a React + TypeScript website where a student (and, if invited, their parents) gets a crew of AI specialists that plans scholarships, essays, applications, and the cost of college. This plan builds the whole product described in [`docs/product/features.md`](../docs/product/features.md): releases R1, R2, and R3.

Read this file first. Every numbered plan file depends on the conventions, ownership rules, and contracts below. When a plan file and this overview disagree, this overview wins and the plan file is fixed.

## 1. Architecture in one page

```
Browser (React 19 / Next.js 15 app router)
  student · parent · helper links · public pages · admin console
        │  HTTPS: /api/v1/* JSON (cookie session) and server components
        ▼
apps/web  ── route handlers + server components ── call @scholarcrew/core services
        │                                             with an Actor (who is asking)
        │ enqueue jobs (pg-boss)                       │
        ▼                                             ▼
apps/worker ── job handlers ── @scholarcrew/agents (Compass + specialists)
        │                       @scholarcrew/catalog (research, extract, verify, recheck)
        │                       @scholarcrew/core (system actor)
        ▼
PostgreSQL 16 (all state: users, memory, catalog, jobs via pg-boss schema, blobs)
Anthropic API (claude-opus-5-5, server-side fallbacks on) · Stripe · Resend (email)
```

- `@scholarcrew/domain`: Zod schemas and types shared by everything. No runtime dependencies besides `zod`.
- `@scholarcrew/db`: Drizzle schema for every table, migrations, the DB client, and test utilities.
- `@scholarcrew/engines`: pure calculators (Ledger money math, eligibility matcher, deadlines, limits, merit tiers, superscores, scam rules, ranking).
- `@scholarcrew/jobs`: job names, payload schemas, and the pg-boss client.
- `@scholarcrew/core`: business services. Every exported service takes `(deps, actor, input)` and enforces authorization.
- `@scholarcrew/agents`: the model client, the agent loop, Compass, specialists, guards. Talks to data only through a `CrewDataPort` interface it defines; it never imports `core` or `db`.
- `@scholarcrew/catalog`: catalog pipeline (research with web search, extraction, verification rules, batch re-checks, Scorecard CSV import).
- `@scholarcrew/ui`: design tokens and React components ported from the concept mockups in `design/mockups/source/`.
- `apps/web`: Next.js app: pages, API routes, middleware.
- `apps/worker`: pg-boss consumers and cron schedules.
- `apps/extension`: Chrome MV3 extension (R3).
- `e2e/`, `evals/`: Playwright flows and model evals.

## 2. Stack and pinned versions

Use exactly these ranges. Do not add other runtime dependencies without updating this table first.

| Package | Range | Used by |
|---|---|---|
| node | 22 LTS (`.nvmrc` = `22`) | all |
| pnpm | `10.33.0` (`packageManager`) | all |
| turbo | `^2.5.0` | root |
| typescript | `^5.8.3` | all |
| @biomejs/biome | `1.9.4` (exact) | root |
| vitest | `^3.2.4` | all packages |
| tsx | `^4.20.0` | worker, scripts |
| @types/node | `^22.15.0` | all |
| zod | `^4.0.0` | domain and everything that validates |
| drizzle-orm | `^0.44.0` | db, core, worker |
| drizzle-kit | `^0.31.0` (dev) | db |
| postgres | `^3.4.7` | db |
| pg-boss | `^10.1.0` | jobs, worker |
| @anthropic-ai/sdk | `^0.110.0` | agents, catalog |
| next | `^15.5.0` | web |
| react, react-dom | `^19.1.0` | web, ui |
| @types/react, @types/react-dom | `^19.1.0` | web, ui |
| @testing-library/react | `^16.3.0` (dev) | ui, web |
| @testing-library/dom | `^10.4.0` (dev) | ui, web |
| jsdom | `^26.1.0` (dev) | ui, web |
| stripe | `^18.0.0` | core (billing) |
| @playwright/test | `^1.55.0` (dev) | e2e |
| esbuild | `^0.25.0` (dev) | extension |
| @types/chrome | `^0.0.326` (dev) | extension |

Email goes through Resend's REST API with `fetch` (no SDK). SMS (R3) goes through Twilio's REST API with `fetch`. CSV parsing, HTML-to-text, and Markdown export are small in-repo functions with tests; no libraries.

## 3. Conventions every plan follows

**Modules.** Every package is ESM (`"type": "module"`). Internal packages are source-only: `exports` point at `.ts` files under `src/`, and consumers (Next.js via `transpilePackages`, the worker via `tsx`, Vitest) compile them. Imports inside a package are relative without extensions (`moduleResolution: "Bundler"`). Cross-package imports use the package name and declared subpath exports only.

**TypeScript.** `tsconfig.base.json` sets `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes: false`, `isolatedModules`, `skipLibCheck`, `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `resolveJsonModule`, `verbatimModuleSyntax: false`. Each package has `tsconfig.json` extending it and a `typecheck` script `tsc --noEmit`.

**Lint and format.** Biome 1.9.4 with the root `biome.json` from plan 01. `pnpm lint` runs `biome check .`. Fix with `pnpm format`.

**Tests.** Vitest in every package (`vitest run`). Tests live next to code as `*.test.ts(x)`. Packages that touch Postgres (`db`, `core`, `jobs`, `worker`, `web` API tests) set `fileParallelism: false` and use `TEST_DATABASE_URL`. The DB test helpers in `@scholarcrew/db/testing` (plan 03) migrate the test database once per run (Vitest `globalSetup`) and truncate all tables in `beforeEach` through `resetDb()`.

**Schemas.** Every domain type is a Zod schema with an inferred type of the same name, defined in `@scholarcrew/domain`:

```ts
export const Story = z.strictObject({ /* fields */ });
export type Story = z.infer<typeof Story>;
```

Zod 4 idioms only: `z.uuid()`, `z.email()`, `z.url()`, `z.iso.date()`, `z.iso.datetime()`, `z.strictObject()`, `z.toJSONSchema()`.

**IDs.** UUID strings. The DB default is `gen_random_uuid()`. College IDs are the IPEDS unit ID as a string.

**Money.** Integer whole US dollars everywhere. Field names end in `Usd` (`amountUsd`). Costs per year unless the name says otherwise (`fourYearUsd`). Model cost is integer micro-dollars (`costMicros`).

**Dates.** Calendar dates are `IsoDate` strings (`YYYY-MM-DD`). Instants are `IsoDateTime` strings in the domain and API, `Date` objects only inside `db` and `core` internals. Every repository/service maps rows to domain objects with ISO strings. A student's week starts Monday in their `timeZone` (default `America/Chicago`).

**GPA and rates.** Stored as integers: `gpaX100` (3.72 → 372), `admitRateX1000` (45.2% → 452). Domain objects expose numbers (`gpa: 3.72`).

**Errors.** Services throw `AppError` from `@scholarcrew/domain` with a code. The API maps codes to statuses and returns `{ "error": { "code", "message", "details"? } }`.

| code | HTTP |
|---|---|
| `unauthenticated` | 401 |
| `forbidden` | 403 |
| `not_found` | 404 |
| `invalid_input` | 400 |
| `conflict` | 409 |
| `limit_reached` | 402 |
| `rate_limited` | 429 |
| `internal` | 500 |

429 responses carry `Retry-After` in seconds.

Request bodies are capped (plan 13's `body()` and `readBytesCapped`): JSON 256 KB (`JSON_BODY_LIMIT`), JSON on `auth: "none"` routes 64 KB (`PUBLIC_BODY_LIMIT`), uploads 10 MB, the CSV import 5 MB. Over the cap, declared or chunked, the API answers 413 with code `invalid_input` (`PayloadTooLargeError`; no new error code).

**Authorization.** Every `core` service function signature is `(deps: CoreDeps, actor: Actor, ...args)`. The first thing it does is an access check from `core/access` (plan 06). Not-yours objects return `not_found`, never `forbidden`, so IDs can't be probed. Only `SystemActor` (worker) skips ownership checks, and only for the functions marked "system" below.

**Model calls.** Only `packages/agents/src/model/` and `packages/catalog/src/anthropic.ts` import `@anthropic-ai/sdk` (catalog needs server tools and batches); catalog reuses the agents model client for extraction. Model ID `claude-opus-5-5`. Every request goes through `client.beta.messages.create` with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`. Effort is always set explicitly. No `thinking` parameter (thinking is always on for this model). No forced `tool_choice`. Responses are read by block `type`. `stop_reason: "refusal"` is handled before reading content. Tool-use loops append to `messages` and never edit earlier entries.

**Secrets and logging.** Read config from `process.env` only in `apps/web/src/server/deps.ts`, `apps/worker/src/deps.ts`, and test setup files. One exception (D17): `apps/web/next.config.ts` may load the repo-root `.env` into `process.env` when `NODE_ENV === "development"` (`next dev`), because Next only reads `.env` files from `apps/web`; it never does so under `next build`, `next start`, or Vitest. Never log tokens, essay bodies, sensitive facts, or document bytes. Driver errors log code, constraint, and table only through `errorLabel`; other messages mask email addresses and long digit sequences. The logger is `console` with JSON lines: `console.log(JSON.stringify({ level, msg, ...fields }))`.

**Lockfile.** `pnpm-lock.yaml` is generated. Never hand-edit it. When parallel plans finish a phase, the integrator runs `pnpm install` once and commits the lockfile with the phase.

**Scripts.** Root `package.json` scripts (plan 01): `build` → `turbo run build`, `typecheck` → `turbo run typecheck`, `test` → `turbo run test --concurrency=1` (packages share one test database, so their suites run one at a time), `lint` → `biome check .`, `format` → `biome check --write .`, `dev` → `turbo run dev`, `db:up` → `docker compose up -d db`, `db:wait` → `pnpm --filter @scholarcrew/scripts wait-for-db`, `db:generate` → `pnpm --filter @scholarcrew/db generate`, `db:migrate` → `pnpm --filter @scholarcrew/db migrate`, `db:migrate:test` → `pnpm --filter @scholarcrew/db migrate:test`, `db:seed` → `pnpm --filter @scholarcrew/db seed`, `e2e` → `pnpm --filter @scholarcrew/e2e e2e`, `evals` → `pnpm --filter @scholarcrew/evals evals`. Package scripts: every package has `test` and `typecheck`; `@scholarcrew/db` also has `generate`, `migrate`, `migrate:test`, `seed`; `apps/web` has `dev`, `build`, `start`; `apps/worker` has `dev` and `start`. Scripts that need env vars run Node with `--env-file-if-exists=../../.env` (Node 22.9+; tsx forwards it), so hosts that inject env vars without a `.env` file still work. The e2e and evals packages deliberately have no `test` script so `pnpm test` never runs them.

**Commits.** Each TDD task ends with a commit `feat(<package>): <what>` or `test(<package>): <what>`. The repository is initialized in plan 01.

## 4. Environment variables

Plan 01 writes `.env.example` with exactly these keys.

| Key | Example | Used by |
|---|---|---|
| `DATABASE_URL` | `postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew` | web, worker, scripts |
| `TEST_DATABASE_URL` | `postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew_test` | tests |
| `APP_URL` | `http://localhost:3000` | web, worker (links in email) |
| `ENCRYPTION_KEY` | 64 hex chars (32 bytes), fallback key id 1 | core (AES-256-GCM) |
| `ENCRYPTION_KEYS` | `<id>:<64 hex>[,<id>:<64 hex>…]`; first encrypts, all decrypt | web, worker, core; overrides `ENCRYPTION_KEY` |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | worker |
| `SCHOLARCREW_FAKE_MODEL` | `0` or `1` | worker (use scripted model client) |
| `RESEND_API_KEY` | empty in dev | worker, web (email) |
| `EMAIL_FROM` | `ScholarCrew <crew@scholarcrew.example>` | email |
| `STRIPE_SECRET_KEY` | empty in dev | core billing |
| `STRIPE_WEBHOOK_SECRET` | empty in dev | web webhook |
| `STRIPE_PRICE_FAMILY` | `price_...` | billing |
| `STRIPE_PRICE_SEASON` | `price_...` | billing |
| `ENABLE_DEV_ROUTES` | `1` in dev/e2e, unset in prod | web (`/api/v1/dev/*`) |
| `CATALOG_ALLOWED_DOMAINS` | comma list or empty | catalog research |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | empty in dev | worker SMS (R3) |

When `RESEND_API_KEY` is empty, the email sender writes messages to the `dev_outbox` table (plan 03) instead of sending. E2E reads magic links from `GET /api/v1/dev/outbox/latest?to=`.

## 5. Repository tree and file ownership

Every path below belongs to exactly one plan. A plan may only create or modify paths it owns. Paths marked `(gen)` are generated by a command in the owning plan, not written by hand.

```
scholarcrew/
├─ package.json                        01
├─ pnpm-workspace.yaml                 01
├─ turbo.json                          01
├─ tsconfig.base.json                  01
├─ biome.json                          01
├─ .gitignore  .nvmrc  .env.example    01
├─ docker-compose.yml                  01
├─ README.md                           01
├─ scripts/**                          01  (workspace package @scholarcrew/scripts: check-env, wait-for-db, create-test-db.sql)
├─ .github/workflows/ci.yml            01
├─ pnpm-lock.yaml                      (gen, integrator)
├─ packages/
│  ├─ domain/**                        02
│  ├─ db/**                            03  (drizzle/ migrations are (gen))
│  ├─ engines/**                       04
│  ├─ jobs/**                          05
│  ├─ core/
│  │  ├─ package.json tsconfig.json vitest.config.ts test/**          06
│  │  ├─ src/shared/**  access/**  auth/**  crypto/**  audit/**  ratelimit/**
│  │  │   profile/**  memory/**  family/**  helpers/**  notifications/**
│  │  │   billing/**  documents/**  account/**  apitokens/**            06
│  │  ├─ src/scholarships/**  colleges/**  essays/**  prep/**  impact/**
│  │  │   helperview/**                                               07
│  │  └─ src/money/**  aid/**  plan/**  crew/**  admin/**               08
│  ├─ agents/
│  │  ├─ package.json tsconfig.json vitest.config.ts                  09
│  │  ├─ src/index.ts  model/**  loop/**  compass/**  guards/**
│  │  │   context/**  calculators/**  testing/**                       09
│  │  └─ src/specialists/**                                            10
│  ├─ catalog/**                       11
│  └─ ui/**                            15
├─ apps/
│  ├─ worker/**                        12
│  ├─ web/
│  │  ├─ package.json tsconfig.json next.config.ts vitest.config.ts
│  │  │   next-env.d.ts test/**                                        13
│  │  ├─ src/middleware.ts  src/server/**                             13
│  │  ├─ src/app/api/v1/{auth,me,profile,onboarding,facts,decisions,
│  │  │   sensitive-facts,family,helper-links,notifications,
│  │  │   notification-prefs,billing,documents,account,dev}/**
│  │  │   src/app/api/v1/extension/tokens/**                           13
│  │  ├─ src/app/api/v1/{scholarships,scholarship-applications,matches,
│  │  │   colleges,college-list,application-items,recommenders,essays,
│  │  │   essay-comments,stories,test-scores,prep,service-logs,activities,
│  │  │   verify-hours,costs,offers,offer-lines,aid,plan,plan-items,
│  │  │   conversations,jobs,actions,public,admin,helper-view}/**
│  │  │   src/app/api/v1/extension/{autofill-profile,save-page}/**     14
│  │  ├─ src/app/layout.tsx  src/app/globals.css  src/app/not-found.tsx
│  │  │   src/app/(app)/layout.tsx, error.tsx, loading.tsx
│  │  │   src/app/(app)/{week,crew,onboarding,settings,memory,family}/**
│  │  │   src/components/{shell,week,crew,onboarding,settings,memory,family}/**
│  │  │   src/lib/**                                                    16
│  │  ├─ src/app/(app)/{scholarships,essays,colleges,money,prep,impact}/**
│  │  │   src/components/{scholarships,essays,colleges,money,prep,impact}/** 17
│  │  └─ src/app/(public)/**  src/app/(admin)/**  src/app/h/**  src/app/sitemap.ts  src/app/robots.ts
│  │      src/app/verify-hours/**  src/app/sign-in/**  src/app/family/join/**
│  │      src/components/{public,admin,auth}/**                          18
│  └─ extension/**                     20
├─ e2e/**                              19  (workspace package @scholarcrew/e2e, script "e2e")
├─ evals/**                            19  (workspace package @scholarcrew/evals, script "evals")
├─ docs/**  design/**  plans/**        (planning artifacts, not code)
```

## 6. Agent teams

| Plan | Agent | Owns | Depends on |
|---|---|---|---|
| [01-foundation](01-foundation.md) | A: Foundation | root files, `scripts/`, CI | none |
| [02-domain](02-domain.md) | B: Domain | `packages/domain/**` | 01 |
| [03-database](03-database.md) | C: Database | `packages/db/**` | 02 |
| [04-engines](04-engines.md) | D: Engines | `packages/engines/**` | 02 |
| [05-jobs](05-jobs.md) | E: Jobs | `packages/jobs/**` | 02, 03 (integration tests) |
| [06-core-identity](06-core-identity.md) | F: Core identity | `packages/core` package files + identity modules | 03, 04, 05 |
| [07-core-records](07-core-records.md) | G: Core records | scholarships, colleges, essays, prep, impact, helperview | 06 |
| [08-core-planning](08-core-planning.md) | H: Core planning | money, aid, plan, crew, admin | 07 |
| [09-agents-runtime](09-agents-runtime.md) | I: Agent runtime | `packages/agents` package files + runtime | 02, 04 |
| [10-specialists](10-specialists.md) | J: Specialists | `packages/agents/src/specialists/**` | 09 |
| [11-catalog](11-catalog.md) | K: Catalog | `packages/catalog/**` | 03, 09 |
| [12-worker](12-worker.md) | L: Worker | `apps/worker/**` | 05, 08, 10, 11 |
| [13-api-identity](13-api-identity.md) | M: API identity | web package files, `src/server`, middleware, identity routes | 05, 06 |
| [14-api-pipeline](14-api-pipeline.md) | N: API pipeline | pipeline, crew, public, admin, extension data routes | 08, 11, 13 |
| [15-ui-kit](15-ui-kit.md) | O: UI kit | `packages/ui/**` | 02 |
| [16-web-shell-core](16-web-shell-core.md) | P: Web shell | layouts, lib, shell, week, crew, onboarding, settings, memory, family | 13, 15 |
| [17-web-pipeline](17-web-pipeline.md) | Q: Web pipeline | scholarships, essays, colleges, money, prep, impact screens | 14, 16 |
| [18-web-public-admin](18-web-public-admin.md) | R: Public + admin | public site, auth pages, helper view, hours verification, admin | 14, 16 |
| [19-e2e-evals](19-e2e-evals.md) | S: E2E + evals | `e2e/**`, `evals/**` | 12, 17, 18 |
| [20-extension](20-extension.md) | T: Extension | `apps/extension/**` | 14 |
| [21-review-harness](21-review-harness.md) | U: Review | none (process) | all |

## 7. Execution phases

```
Phase 1  01
Phase 2  02
Phase 3  03 ∥ 04 ∥ 15
Phase 4  05 ∥ 09
Phase 5  06
Phase 6  07 ∥ 10 ∥ 11 ∥ 13
Phase 7  08
Phase 8  12 ∥ 14 ∥ 16
Phase 9  17 ∥ 18 ∥ 20
Phase 10 19
Phase 11 final verification (section 13)
```

Each phase completes its gates before the next begins. Plan 05 follows 03 because its integration tests import DB testing utilities; 06 follows 05. This ordering covers test dependencies as well as production imports. Plans 16 and 14 can run in parallel: 16 tests mock the API and depend on 13 server helpers, while the integrator tests both after phase 8.

Why each edge exists:

- 03, 04, 05, 15 import domain schemas from 02 (15 uses CrewRole, CREW_NAMES, JobStatus). 05's integration test (E4) also needs 03's `testDatabaseUrl()`.
- 06 uses tables and test factories from 03, calculators from 04, and `JobsClient` from 05.
- 07 uses `access`, `crypto`, `audit`, `memory` (matcher input), `notifications` from 06.
- 08 uses 07's modules (scholarships, colleges, essays, prep) and 06's `billing` allowance helpers.
- 09 uses calculators from 04 (exposed to Compass as tools) and domain contracts from 02.
- 10 builds specialists on 09's runtime.
- 11 reuses `createModelClient` from 09 and writes to tables from 03.
- 12 builds the `CrewDataPort` adapter over 07/08 services, runs 09/10, and runs 11 jobs.
- 13 creates the web package and server helpers over 06; 14 adds routes over 07/08 and 11's CSV parser.
- 16 needs 13's `src/server` helpers and 15's components. 17 and 18 need 16's layouts and `src/lib/api.ts`, and 14's routes.
- 19 runs the whole stack. 20 calls extension routes from 13 and 14.

## 8. Data model (contract for plan 03)

Plan 03 implements every table below in `packages/db/src/schema/*.ts` with these exact TypeScript property names (Drizzle maps them to snake_case columns). Every `ownerId`/`userId` foreign key to `users` uses `onDelete: "cascade"` unless noted. Every table has the indexes listed. All enums are `pgEnum` with the listed values, named `<name>_enum` in SQL. `createdAt`/`updatedAt` are `timestamptz NOT NULL DEFAULT now()`.

### Enums

| Enum | Values |
|---|---|
| role | student, parent, admin |
| user_status | active, blocked_underage, deleted |
| fact_source | user_stated, document, parent_shared, crew_inferred, system |
| fact_visibility | crew, crew_family, scout_only, private |
| fact_status | confirmed, candidate, rejected |
| sensitive_kind | first_gen, income_range, heritage, disability, religion, military_family, foster_care, noncitizen_filter |
| family_member_role | student, parent |
| share_category | deadlines, colleges, costs, scholarships, activities, essays, chats, stories, sensitive |
| family_task_kind | fafsa_contributor, css_contributor, share_income_range, share_budget, review_costs, custom |
| task_status | todo, done, skipped |
| helper_role | recommender, counselor, mentor |
| catalog_status | draft, published, stale, retired, flagged |
| listing_visibility | public, submitter_only |
| college_control | public, private_nonprofit, private_forprofit |
| test_policy | required, optional, blind, unknown |
| outside_policy | added_on_top, reduces_loans_first, may_reduce_grant, unknown |
| catalog_task_kind | research_candidate, user_submission, report, recheck_changed, import |
| catalog_task_status | open, in_review, resolved, rejected |
| report_reason | wrong_deadline, dead_link, scam, wrong_amount, other |
| report_status | open, resolved, rejected |
| fit | reach, target, likely |
| app_plan | ED, EA, REA, RD, rolling |
| app_status | researching, applying, submitted, admitted, waitlisted, denied, enrolled, withdrawn |
| app_item_kind | form, transcript, counselor_rec, teacher_rec, supplement, test_scores, portfolio, interview, fee_or_waiver, css_profile |
| item_status | todo, in_progress, done, not_needed |
| rec_status | draft, requested, confirmed, submitted, declined |
| app_stage | matched, planned, drafting, submitted, won, lost, skipped |
| essay_target | college, scholarship, general |
| essay_status | drafting, ready, submitted |
| comment_author | quill, helper, user |
| comment_kind | question, structure, clarity, prompt_fit, word_budget |
| test_kind | ACT, SAT, PSAT |
| verification_status | self_reported, requested, verified, declined |
| cost_source | scorecard, calculator, offer |
| document_kind | award_letter, transcript, score_report, essay, resume, other |
| parse_status | none, queued, parsing, parsed, failed |
| offer_status | uploaded, parsing, needs_review, confirmed, failed |
| offer_line_category | grant, scholarship, work_study, loan_federal_subsidized, loan_federal_unsubsidized, loan_parent_plus, loan_private, other |
| aid_program | fafsa, css |
| assignee_kind | student, parent |
| room_kind | my_crew, family, temporary, scholarship, college, essay |
| message_author | user, crew |
| job_kind | crew_request, weekly_plan, essay_review, offer_parse, appeal_outline, retake_analysis |
| job_status | queued, working, ready, needs_input, failed |
| plan_item_kind | scholarship, essay, application, aid, test_prep, service, recommendation, thank_you, custom |
| notification_kind | new_matches, deadline, job_ready, family, digest, system |
| plan_id | free, family, season_pass |
| subscription_status | active, past_due, canceled, expired |
| export_status | queued, ready, failed |

### Tables

Types: `uuid`, `text`, `int` (integer), `bool`, `date` (`date`, mode string), `ts` (`timestamptz`, mode date), `jsonb<T>` (`jsonb` typed with `$type<T>()` where `T` is the named domain type), `text[]`, `bytea` (custom type over `Buffer`). `pk` = primary key, `fk(t)` = references `t.id`, `?` = nullable, `= v` = default.

**Identity and access** (`schema/identity.ts`)

- `users`: id uuid pk = random · email text unique (stored lowercase) · displayName text = '' · role role = student · birthYear int? · timeZone text = 'America/Chicago' · status user_status = active · createdAt · deletedAt ts?
- `sessions`: id uuid pk · userId fk(users) · tokenHash text unique · userAgent text = '' · createdAt · lastSeenAt ts = now · expiresAt ts. Index userId.
- `magicLinks`: id uuid pk · email text · tokenHash text unique · createdAt · expiresAt ts · usedAt ts?. Index email.
- `apiTokens`: id uuid pk · userId fk(users) · tokenHash text unique · scopes text[] · label text = '' · createdAt · expiresAt ts · lastUsedAt ts? · revokedAt ts?
- `rateLimits`: key text pk · windowStart ts · count int
- `auditEvents`: id uuid pk · actorId uuid? (no fk) · actorKind text · action text · entityType text · entityId text · meta jsonb<Record<string, unknown>> = {} · createdAt. Indexes (entityType, entityId), actorId, createdAt.
- `devOutbox`: id uuid pk · to text · subject text · text text · createdAt. Index to.

**Profile and memory** (`schema/memory.ts`)

- `profiles`: userId uuid pk fk(users) · classYear int? · highSchool text = '' · state text = '' (2-letter) · county text = '' · city text = '' · gpaUnweightedX100 int? · gpaWeightedX100 int? · intendedMajors text[] = {} · interests text[] = {} · onboardingCompletedAt ts? · updatedAt
- `memoryFacts`: id uuid pk · ownerId fk(users) · key text · value jsonb<unknown> · source fact_source · sourceRef text? · visibility fact_visibility = crew · status fact_status = confirmed · supersededById uuid? · createdAt · confirmedAt ts? · expiresAt ts?. Index (ownerId, status). Partial unique `memory_facts_current_uq (ownerId, key)` where confirmed and not superseded.
- `sensitiveFacts`: ownerId fk(users) · kind sensitive_kind · enabled bool = false · ciphertext bytea? · iv bytea? · tag bytea? · keyId smallint = 1 · sharedByUserId uuid? · updatedAt. pk (ownerId, kind).
- `decisions`: id uuid pk · ownerId fk(users) · summary text · rationale text = '' · sourceMessageId uuid? · decidedAt ts = now
- `stories`: id uuid pk · ownerId fk(users) · title text · moment text · themes text[] = {} · evidence text = '' · summary text = '' · createdAt · updatedAt · archivedAt ts?. Index ownerId.
- `storyUses`: id uuid pk · storyId fk(stories) cascade · essayId fk(essays) cascade · collegeId text? · scholarshipId uuid? · usedAt ts = now. Unique (storyId, essayId).

**Family and helpers** (`schema/family.ts`)

- `families`: id uuid pk · name text = 'Family' · createdById uuid? fk(users) set null · createdAt
- `familyMembers`: familyId fk(families) cascade · userId fk(users) · memberRole family_member_role · joinedAt ts = now. pk (familyId, userId). Unique userId (`family_members_user_uq`).
- `familyInvites`: id uuid pk · familyId fk(families) cascade · email text · memberRole family_member_role = parent · invitedById uuid fk(users) · tokenHash text unique · createdAt · expiresAt ts · acceptedAt ts? · acceptedById uuid?
- `shareSettings`: studentId fk(users) · familyId fk(families) cascade · category share_category · enabled bool. pk (studentId, familyId, category).
- `familyBudgets`: familyId uuid pk fk(families) cascade · annualUsd int · sharedById uuid fk(users) · updatedAt
- `familyTasks`: id uuid pk · familyId fk(families) cascade · assigneeId fk(users) · studentId fk(users) · kind family_task_kind · title text · detail text = '' · status task_status = todo · dueOn date? · createdAt · completedAt ts? · aidItemId uuid? fk(aidChecklistItems) cascade. Index (familyId, status). Unique (aidItemId, assigneeId) as `family_tasks_aid_item_assignee_uq` (R2I-6; nulls distinct, so tasks with no aid item are unaffected).
- `helperLinks`: id uuid pk · studentId fk(users) · label text · helperRole helper_role · scope text[] (HelperScope values: deadlines, colleges, activities, stories, scholarships) · tokenHash text unique · createdAt · expiresAt ts · revokedAt ts? · lastUsedAt ts?

**Catalog** (`schema/catalog.ts`)

- `scholarships`: id uuid pk · slug text unique · name text · provider text · url text · sourceUrl text · amountMinUsd int · amountMaxUsd int · renewable bool = false · renewalTerms text = '' · deadline date? · cycle text · localArea jsonb<LocalArea> · eligibility jsonb<EligibilityRule[]> = [] · requirements jsonb<ScholarshipRequirements> · status catalog_status = draft · visibility listing_visibility = public · submittedById uuid? fk(users) set null · scamFlags text[] = {} · estMinutes int = 60 · verifiedAt ts? · verifiedById uuid? · createdAt · updatedAt. Indexes status, deadline, visibility.
- `scholarshipSources`: id uuid pk · scholarshipId fk(scholarships) cascade · url text · fetchedAt ts · contentHash text · excerpt text = ''
- `colleges`: id text pk · name text · state text · city text · control college_control · admitRateX1000 int? · costOfAttendanceUsd int? · netPriceByIncome jsonb<NetPriceByIncome> · testPolicy test_policy = unknown · superscore bool? · cssProfileRequired bool = false · outsidePolicy outside_policy = unknown · meritTiers jsonb<MeritTier[]> = [] · deadlines jsonb<CollegeDeadlines> · requirements jsonb<CollegeRequirements> · aidPriorityDate date? · sourceUrl text = '' · verifiedAt ts? · updatedAt. Indexes state, name.
- `aidRules`: id uuid pk · awardYear text · key text · value jsonb<unknown> · sourceUrl text · verifiedAt ts. Unique (awardYear, key).
- `aidDeadlines`: id uuid pk · awardYear text · state text? (null = federal) · program text · deadline date? · note text = '' · sourceUrl text · verifiedAt ts
- `catalogTasks`: id uuid pk · kind catalog_task_kind · status catalog_task_status = open · scholarshipId uuid? fk(scholarships) set null · payload jsonb<CatalogTaskPayload> · createdById uuid? · resolvedById uuid? · resolutionNote text = '' · createdAt · resolvedAt ts?. Index (status, kind). Partial unique `catalog_tasks_open_recheck_uq (scholarshipId)` for open/in-review recheck_changed tasks.
- `catalogReports`: id uuid pk · scholarshipId fk(scholarships) cascade · reporterId uuid? fk(users) set null · reason report_reason · details text = '' · status report_status = open · createdAt · resolvedAt ts?
- `recheckBatches`: id uuid pk · anthropicBatchId text unique · scholarshipIds uuid[] (stored as text[]) · status text = 'in_progress' · createdAt · collectedAt ts?

**Pipeline** (`schema/pipeline.ts`)

- `collegeList`: id uuid pk · ownerId fk(users) · collegeId text fk(colleges) · fit fit · plan app_plan · status app_status = researching · season text · archivedAt ts? · createdAt. Partial unique `college_list_owner_college_active_uq (ownerId, collegeId)` where archivedAt is null; season is a label, never a read filter.
- `applicationItems`: id uuid pk · ownerId fk(users) · collegeListId fk(collegeList) cascade · kind app_item_kind · label text · status item_status = todo · dueOn date? · essayId uuid? · createdAt · updatedAt
- `recommenders`: id uuid pk · ownerId fk(users) · name text · email text · relationship text = '' · createdAt
- `recRequests`: id uuid pk · ownerId fk(users) · recommenderId fk(recommenders) cascade · collegeListId uuid? fk(collegeList) set null · scholarshipApplicationId uuid? fk(scholarshipApplications) set null · helperLinkId uuid? · message text = '' · status rec_status = draft · requestedAt ts? · updatedAt
- `scholarshipApplications`: id uuid pk · ownerId fk(users) · scholarshipId fk(scholarships) cascade · stage app_stage = matched · matchReasons jsonb<MatchReason[]> = [] · fitScore int = 0 · estMinutes int = 60 · submittedAt ts? · outcomeUsd int? · outcomeRenewable bool? · outcomeAt ts? · thankYouSent bool = false · createdAt · updatedAt. Unique (ownerId, scholarshipId).
- `essays`: id uuid pk · ownerId fk(users) · title text · prompt text · wordLimit int? · charLimit int? · targetType essay_target = general · targetCollegeId text? · targetScholarshipId uuid? · currentVersion int = 0 · status essay_status = drafting · createdAt · updatedAt
- `essayVersions`: id uuid pk · essayId fk(essays) cascade · version int · body text · wordCount int · authorId uuid fk(users) · createdAt. Unique (essayId, version).
- `essayComments`: id uuid pk · essayId fk(essays) cascade · version int · author comment_author · kind comment_kind · quote text · occurrence int = 1 · body text · jobId uuid? · resolvedAt ts? · createdAt
- `testScores`: id uuid pk · ownerId fk(users) · test test_kind · takenOn date · official bool · composite int · sections jsonb<Record<string, number>> · createdAt
- `activities`: id uuid pk · ownerId fk(users) · position int · name text · role text = '' · organization text = '' · description text = '' · hoursPerWeek int = 0 · weeksPerYear int = 0 · grades int[] = {} · category text = '' · createdAt · updatedAt. Unique (ownerId, position).
- `serviceLogs`: id uuid pk · ownerId fk(users) · organization text · activity text · servedOn date · minutes int · supervisorName text = '' · supervisorEmail text = '' · verification verification_status = self_reported · verificationTokenHash text? unique · verificationExpiresAt ts? · verifiedAt ts? · verifierNote text = '' · reflection text = '' · createdAt
- `costEstimates`: id uuid pk · ownerId fk(users) · collegeId text fk(colleges) · source cost_source · costOfAttendanceUsd int · freeMoneyUsd int · netPriceUsd int · inputs jsonb<Record<string, unknown>> = {} · computedAt ts = now. Unique (ownerId, collegeId, source).
- `blobs`: id uuid pk · ciphertext bytea · iv bytea · tag bytea · keyId smallint = 1 · createdAt
- `documents`: id uuid pk · ownerId fk(users) · kind document_kind · filename text · mime text · sizeBytes int · blobId uuid fk(blobs) · parseStatus parse_status = none · uploadedAt ts = now
- `offers`: id uuid pk · ownerId fk(users) · collegeId text fk(colleges) · awardYear text · documentId uuid? fk(documents) set null · status offer_status = uploaded · costOfAttendanceUsd int? · createdAt · confirmedAt ts? · archivedAt ts?
- `offerLines`: id uuid pk · offerId fk(offers) cascade · position int · label text · amountUsd int · category offer_line_category · renewable bool = false · renewalCondition text = '' · page int? · citedText text = '' · userCorrected bool = false
- `aidChecklistItems`: id uuid pk · ownerId fk(users) · awardYear text · program aid_program · collegeId text? · key text · title text · assignee assignee_kind · status task_status = todo · dueOn date? · completedAt ts?. Unique (ownerId, awardYear, program, key, collegeId) with `nulls not distinct`.
- `sweepRuns`: id uuid pk · ownerId fk(users) · ranAt ts = now · newMatches int · totalUsd int · reuseCount int · hiddenScams int · hiddenScholarshipIds text[] = {}. Index (ownerId, ranAt).
- `planItems`: id uuid pk · ownerId fk(users) · weekStart date · title text · kind plan_item_kind · refType text? · refId text? · minutes int · valueUsd int? · dueOn date? · status task_status = todo · contributors text[] = {} · priority int = 0 · generated bool = false · createdAt · completedAt ts?. Index (ownerId, weekStart).

**Crew** (`schema/crew.ts`)

- `conversations`: id uuid pk · ownerId fk(users) · room room_kind · roomRefId text? · familyId uuid? fk(families) cascade · title text = '' · createdAt · expiresAt ts? · archivedAt ts?. Index (ownerId, room).
- `messages`: id uuid pk · conversationId fk(conversations) cascade · authorKind message_author · authorUserId uuid? · body text · reply jsonb<CrewReply>? · sharedCategories text[]? · createdAt. Index (conversationId, createdAt).
- `crewJobs`: id uuid pk · ownerId fk(users) · kind job_kind · status job_status = queued · conversationId uuid? · requestMessageId uuid? · resultMessageId uuid? · refId text? · progress jsonb<ProgressEvent[]> = [] · error text? · safety text? · costMicros int = 0 · attempt int = 0 · leaseToken uuid? · leaseExpiresAt ts? · usageMonth text (`YYYY-MM`, insertion month UTC) · createdAt · updatedAt. Index (ownerId, createdAt).
- `agentRuns`: id uuid pk · jobId uuid? fk(crewJobs) set null · userId uuid? · role text · model text · inputTokens int · outputTokens int · cacheReadTokens int · cacheWriteTokens int · stopReason text · costMicros int · durationMs int · createdAt
- `actionReceipts`: id uuid pk · ownerId fk(users) · messageId fk(messages) cascade · cardId text · appliedAt ts = now · result jsonb<Record<string, unknown>> = {}. Unique (messageId, cardId).

**Notifications, billing, exports** (`schema/ops.ts`)

- `stripeEvents` (`stripe_events`): id text pk · type text · receivedAt ts = now; event insert and application share one transaction.

- `notifications`: id uuid pk · userId fk(users) · kind notification_kind · title text · body text · link text = '' · dedupeKey text unique · createdAt · readAt ts? · emailedAt ts? · smsSentAt ts?. Index (userId, createdAt).
- `notificationPrefs`: userId uuid pk fk(users) · digestDay int = 0 (0 = Sunday) · digestHour int = 16 · emailEnabled bool = true · smsEnabled bool = false · phoneCiphertext bytea? · phoneIv bytea? · phoneTag bytea? · phoneKeyId smallint = 1 · quietStartHour int = 21 · quietEndHour int = 7 · updatedAt
- `subscriptions`: id uuid pk · ownerId fk(users) unique · plan plan_id = free · status subscription_status = active · stripeCustomerId text? · stripeSubscriptionId text? · stripeEventAt ts? · currentPeriodEnd ts? · createdAt · updatedAt
- `usageCounters`: userId fk(users) · month text (`YYYY-MM`) · crewRequests int = 0 · costMicros int = 0. pk (userId, month).
- `sponsorCodes`: code text pk · sponsorName text · plan plan_id · seatsTotal int · seatsUsed int = 0 · expiresAt ts
- `sponsorRedemptions`: code text fk(sponsorCodes.code) cascade · userId fk(users) · redeemedAt ts = now. pk (code, userId).
- `exports` (TypeScript name `exportsTable`; never import a binding named `exports`): id uuid pk · userId fk(users) · status export_status = queued · blobId uuid? · createdAt · expiresAt ts?

## 9. Package contracts

These are the public surfaces each plan must export, with exact names. Input and output types are domain schemas from plan 02 unless written inline.

### 9.1 `@scholarcrew/db` (plan 03)

```ts
// "@scholarcrew/db"
export * as schema from "./schema";               // every table and enum in section 8
export { users, sessions, magicLinks, /* ...every table by its section 8 name; the exports table as exportsTable */ } from "./schema";
export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
export function createDb(url: string, opts?: { max?: number }): { db: Db; close(): Promise<void> };
export function runMigrations(url: string): Promise<void>;   // applies packages/db/drizzle
export { and, or, eq, ne, gt, gte, lt, lte, inArray, isNull, isNotNull, desc, asc, sql, ilike, count } from "drizzle-orm";

// "@scholarcrew/db/testing"
export function getTestDb(): Db;                   // singleton over TEST_DATABASE_URL
export function resetDb(db: Db): Promise<void>;    // TRUNCATE every table RESTART IDENTITY CASCADE
export function setupTestDatabase(): Promise<void>; // Vitest globalSetup: migrate TEST_DATABASE_URL
export const factories: {
  user(db: Db, o?: Partial<typeof users.$inferInsert>): Promise<typeof users.$inferSelect>;
  student(db: Db, o?: { email?: string; state?: string; county?: string; classYear?: number; gpaX100?: number }):
    Promise<{ user: typeof users.$inferSelect; profile: typeof profiles.$inferSelect }>;
  parent(db: Db, o?: { email?: string }): Promise<typeof users.$inferSelect>;
  admin(db: Db): Promise<typeof users.$inferSelect>;
  family(db: Db, o: { studentIds: string[]; parentIds: string[] }): Promise<typeof families.$inferSelect>;
  scholarship(db: Db, o?: Partial<typeof scholarships.$inferInsert>): Promise<typeof scholarships.$inferSelect>;
  college(db: Db, o?: Partial<typeof colleges.$inferInsert>): Promise<typeof colleges.$inferSelect>;
  essay(db: Db, ownerId: string, o?: Partial<typeof essays.$inferInsert>): Promise<typeof essays.$inferSelect>;
  story(db: Db, ownerId: string, o?: Partial<typeof stories.$inferInsert>): Promise<typeof stories.$inferSelect>;
  conversation(db: Db, ownerId: string, o?: Partial<typeof conversations.$inferInsert>): Promise<typeof conversations.$inferSelect>;
};
// "@scholarcrew/db/seed": export function seedDev(db: Db): Promise<void>  (fictional sample data from the mockups,
//   plus 2 aidRules and 4 aidDeadlines rows marked as unverified SAMPLE DATA (R2P-1); real values are maintained at /admin/aid)
```

### 9.2 `@scholarcrew/engines` (plan 04)

All functions are pure and synchronous.

```ts
// money (Ledger)
export function computeGap(input: { costOfAttendanceUsd: number; freeMoneyUsd: number; pendingUsd: number }):
  { gapUsd: number; gapIfPendingWinUsd: number };
export function categorizeOfferLine(category: OfferLineCategory): "free" | "work_study" | "loan" | "other";
export function compareOffers(offers: Array<{ offerId: string; collegeId: string; collegeName: string;
  costOfAttendanceUsd: number; lines: Array<Pick<OfferLine, "amountUsd" | "category" | "renewable">> }>): OfferComparison;
export function computePublicOffers(input: PublicOfferInput): OfferComparison;
export function estimateLoanPayment(input: { principalUsd: number; annualRatePct: number; years: number }): LoanEstimate;
export function estimateNetPrice(college: Pick<College, "costOfAttendanceUsd" | "netPriceByIncome">, incomeRange: IncomeRange | null):
  { netPriceUsd: number; costOfAttendanceUsd: number; freeMoneyUsd: number; isEstimate: true } | null;
export function wonScholarshipsForYear(apps: Array<Pick<ScholarshipApplication, "stage" | "outcomeUsd" | "outcomeRenewable">>, yearIndex: number): number;

// eligibility (matcher)
export type MatcherProfile = { state: string; county: string; city: string; classYear: number | null; gpa: number | null;
  intendedMajors: string[]; interests: string[]; act: number | null; sat: number | null; serviceHours: number;
  sensitive: SensitiveFactValues };
export function evaluateEligibility(rules: EligibilityRule[], localArea: LocalArea, p: MatcherProfile):
  { eligible: boolean; reasons: MatchReason[]; unknowns: string[] };
export function scoreMatch(input: { amountMaxUsd: number; estMinutes: number; reasonsCount: number; unknownsCount: number;
  daysUntilDeadline: number | null; reusableStories: number }): { fitScore: number; valuePerHour: number };
export function rankMatches<T extends { fitScore: number; valuePerHour: number; daysUntilDeadline: number | null }>(m: T[]): T[];

// scams
export function detectScamSignals(text: string, listing: { amountMaxUsd: number; requiresFee?: boolean }): ScamFlag[];

// deadlines and weeks
export function weekStartFor(now: Date, timeZone: string): IsoDate;                      // Monday
export function daysUntil(due: IsoDate, now: Date, timeZone: string): number;            // calendar days, can be negative
export function reminderOffsetsDue(due: IsoDate, now: Date, timeZone: string): Array<7 | 3 | 1>; // offsets due today
export function isWarning(daysLeft: number): boolean;                                     // 0..14 inclusive

// formatting (R3V-5): the one money formatter for core and agents; 07, 08, and 10 import it
export function formatUsd(n: number): string;   // Intl en-US USD, 0 fraction digits, Math.round: 12.5 → "$13", -500 → "-$500"

// limits
export function countWords(text: string): number;
export function countChars(text: string): number;           // Unicode code points
export function limitState(count: number, limit: number | null): "ok" | "near" | "over"; // near at >= 90%

// merit and tests
export function meritTierFor(tiers: MeritTier[], gpa: number | null, act: number | null, sat: number | null): MeritTier | null;
export function retakeAnalysis(input: { colleges: Array<Pick<College, "id" | "name" | "meritTiers">>; gpa: number | null;
  currentAct: number | null; currentSat: number | null; target: { test: "ACT" | "SAT"; composite: number } }): RetakeAnalysis;
export function superscore(scores: TestScore[]): Superscore[];

// plan ranking
export function prioritizePlanItems(items: PlanItem[], now: Date, timeZone: string): PlanItem[];
```

### 9.3 `@scholarcrew/jobs` (plan 05)

```ts
export const JOB_NAMES = ["crew.request", "essay.review", "offer.parse", "appeal.outline", "plan.weekly",
  "plan.weekly.fanout", "prep.retake", "sweep.weekly", "sweep.student", "reminders.deadlines", "digest.weekly",
  "notify.email", "notify.sms", "catalog.research", "catalog.extract", "catalog.recheck", "catalog.recheck.collect",
  "account.export", "account.purge", "maintenance.purge"] as const;   // 20 names (R2C-5, R2I-9)
// Payloads of note: "plan.weekly" { jobId, ownerId, source?: "user" | "system" } (missing = "user"; "system" plans
// don't count against the monthly allowance) · "plan.weekly.fanout" {} · "notify.sms" { notificationId }.
export type JobName = (typeof JOB_NAMES)[number];
export const JobPayloads: { [K in JobName]: z.ZodType };   // from @scholarcrew/domain jobs.ts
export type JobPayload<N extends JobName> = z.infer<(typeof JobPayloads)[N]>;
export interface JobsClient {
  // Throws AppError("invalid_input") for a bad name or payload, or a missing singletonKey on a "short" queue.
  // null = a job with the same singletonKey is already queued (only on "short" queues: catalog.extract).
  enqueue<N extends JobName>(name: N, payload: JobPayload<N>, opts?: { singletonKey?: string; startAfterSeconds?: number }): Promise<string | null>;
}
export function createPgBoss(url: string, opts?: { role?: "worker" | "sender"; schema?: string }): PgBoss; // schema defaults to "pgboss"; "sender" turns off supervise and schedule
export function createJobsClient(boss: PgBoss): JobsClient;    // validates payload with JobPayloads[name]
export function ensureQueues(boss: PgBoss): Promise<void>;     // createQueue for every JOB_NAMES entry; catalog.extract uses policy "short", the rest "standard"
export function createMemoryJobsClient(): JobsClient & {
  sent: Array<{ name: JobName; payload: unknown; opts: { singletonKey?: string; startAfterSeconds?: number } | undefined }>;
  clear(): void;
};
export const SCHEDULES: Array<{ name: JobName; cron: string; tz: "UTC" }>;
```

`SCHEDULES`: `sweep.weekly` `0 14 * * 0` · `plan.weekly.fanout` `0 11 * * 1` (Monday 11:00 UTC, Monday morning in every US zone) · `reminders.deadlines` `0 * * * *` · `digest.weekly` `5 * * * *` · `catalog.recheck` `0 8 * * *` · `catalog.recheck.collect` `*/30 * * * *` · `account.purge` `30 3 * * *` · `maintenance.purge` `*/10 * * * *`. `plan.weekly.fanout` and `notify.sms` are `standard` queues.

### 9.4 `@scholarcrew/core` (plans 06, 07, 08)

```ts
// "@scholarcrew/core/shared" (06)
export interface Clock { now(): Date }
export interface Keyring { primary: { id: number; key: Buffer }; byId: Map<number, Buffer> }
export interface Sealed { ciphertext: Buffer; iv: Buffer; tag: Buffer; keyId: number }
export interface EmailSender { send(m: { to: string; subject: string; text: string }, o?: { idempotencyKey?: string }): Promise<void> }
export interface SmsSender { send(m: { to: string; text: string }): Promise<void> }   // R2I-9; passed to deliverSms, not in CoreDeps
export interface StripeGateway {
  createCheckoutSession(i: { customerEmail: string; priceId: string; mode: "subscription" | "payment"; successUrl: string; cancelUrl: string; clientReferenceId: string }, o?: { idempotencyKey?: string }): Promise<{ url: string }>;
  createPortalSession(i: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;   // account deletion (D13)
}
export interface CoreConfig { appUrl: string; keyring: Keyring; sessionDays: number;
  stripePriceFamily: string; stripePriceSeason: string; stripeWebhookSecret: string }
export interface CoreDeps { db: Db; jobs: JobsClient; clock: Clock; email: EmailSender; config: CoreConfig; stripe: StripeGateway | null }
export function systemClock(): Clock;
export function fixedClock(iso: string): Clock & { set(iso: string): void };
export function devOutboxEmailSender(db: Db): EmailSender;
export function resendEmailSender(apiKey: string, from: string): EmailSender;
export function createTestDeps(o?: Partial<CoreDeps>): CoreDeps & { jobs: ReturnType<typeof createMemoryJobsClient> };
export function currentAwardYear(now: Date): string;   // Aug 1 rollover: the award year of currentSeason(now) (02 awardYearFor, R3V-7); 2026-08-15 → "2027-28"; always called with deps.clock.now()
export function currentSeason(now: Date): string;      // Aug 1 rollover: 2026-10-06 → "2026-27"
export function toIso(d: Date): IsoDateTime;           // also toIsoOrNull
export function todayIn(now: Date, timeZone: string): IsoDate;   // the one core "today" (R3V-9); 07, 08, and 12 import it
export function calendarShort(d: IsoDate): string;     // messages (R3E-8): "2026-10-15" → "Oct 15", formatted in UTC like 16 dateShort
export function safeTimeZone(zone: string): string;
export function nextMonthStartUtc(now: Date): Date;
export function errorLabel(error: unknown): string;
export function instantInZone(d: Date, timeZone: string): string; // messages (R3E-8): "Oct 20, 2026, 8:00 PM CDT" (\u202f becomes a plain space)
// Both email senders send subject.replace(/[\r\n]+/g, " ") (R3E-10).
```

`Actor` (from domain): `{ kind: "user"; userId; role } | { kind: "helper"; helperLinkId; studentId; scope: HelperScope[] } | { kind: "system"; reason: string } | { kind: "public" }`.

Plan 06 modules (each is a subpath export `@scholarcrew/core/<module>`; plan 06's `package.json` declares the subpath exports for every module of plans 06, 07, and 08 up front):

| Module | Exports |
|---|---|
| access | `assertUser(actor)`, `assertRole(actor, ...roles)`, `assertAdmin(actor)`, `assertSystem(actor)`, `isOwner(actor, ownerId)`, `getShareGrants(deps, studentId, viewerUserId): Promise<ShareCategory[]>` (a category with no row uses `DEFAULT_SHARED`), `canRead(deps, actor, ownerId, category): Promise<boolean>`, `assertCanRead(deps, actor, ownerId, category): Promise<void>` (throws not_found), `assertOwner(actor, ownerId)` (throws not_found), `familyIdsFor(deps, userId): Promise<string[]>` |
| crypto | `parseKeyring(env): Keyring`, `assertProductionKeyring(keyring): void`, `encrypt(keyring: Keyring, plaintext: Buffer): Sealed & { keyId: number }`, `decrypt(keyring, parts: Sealed & { keyId: number }): Buffer`, `reencryptAll(deps, system, o: { batch: number }): Promise<number>`, `randomToken(bytes?: number): string` (base64url, default 32), `sha256Hex(s: string): string` |
| audit | `recordAudit(deps, e: { actor: Actor; action: string; entityType: string; entityId: string; meta?: Record<string, unknown> }): Promise<void>` |
| ratelimit | `consumeRateLimit(deps, i: { key: string; limit: number; windowSeconds: number }): Promise<void>` (throws `rate_limited` with `details.retryAfterSeconds`, the seconds left in the window, and the message `Too many requests. Try again in <waitText(s)>.`; 13 copies it into `Retry-After`, R3A-11), `waitText(seconds): string` ("a minute", "<n> minutes", "<n> hour(s)") |
| auth | `requestMagicLink(deps, i: { email: string; ip: string }): Promise<void>`, `verifyMagicLink(deps, i: { token: string; userAgent: string }): Promise<{ sessionToken: string; user: User; isNew: boolean }>` (a new account is a `parent` when a live parent invite exists for the email, else a `student`), `getSessionUser(deps, sessionToken: string): Promise<User \| null>`, `signOut(deps, sessionToken: string): Promise<void>`, `signOutEverywhere(deps, actor): Promise<void>`, `SESSION_COOKIE = "sc_session"` |
| profile | `getMe(deps, actor): Promise<MeResponse>`, `getProfile(deps, actor, userId): Promise<Profile>`, `updateProfile(deps, actor, patch: ProfilePatch): Promise<Profile>`, `completeOnboarding(deps, actor, i: OnboardingInput): Promise<MeResponse>` (age gate on the student's local year, `isUnderMinAge(birthYear, todayIn(now, timeZone))` (R3V-13), refusing with `forbidden` and `details: { reason: "underage" }` (R3A-17); writes profile, facts, sensitive facts, starter `collegeList` rows with fit `target` and plan `RD`; inserts a `weekly_plan` crew job and enqueues `plan.weekly` and `sweep.student`), `getAutofillProfile(deps, actor): Promise<AutofillProfile>` |
| memory | `listFacts(deps, actor, ownerId)`, `createFact(deps, actor, i: FactInput)`, `updateFact(deps, actor, id, p: FactPatch)`, `forgetFact(deps, actor, id)`, `confirmCandidate(deps, actor, id)`, `rejectCandidate(deps, actor, id)`, `createCandidate(deps, system, ownerId, i: FactInput)` (returns the existing row when a current fact or live candidate has the same key and value), `listDecisions(deps, actor, ownerId)`, `recordDecision(deps, actor, i: DecisionInput, sourceMessageId?: string \| null)`, `deleteDecision(deps, actor, id)`, `listSensitiveFacts(deps, actor): Promise<SensitiveFactSummary[]>`, `setSensitiveFact(deps, actor, i: SensitiveFactInput): Promise<SensitiveFactSummary>`, `shareIncomeRangeToStudent(deps, actor /*parent*/, i: { studentId: string; range: IncomeRange }): Promise<void>`, `readSensitiveForMatcher(deps, system, ownerId): Promise<SensitiveFactValues>`, `crewVisibleFacts(deps, system, ownerId, audience: "crew" \| "family"): Promise<MemoryFact[]>`. Writes on the `PROFILE_FACT_KEYS` keys (`createFact`, `updateFact`, `confirmCandidate`, `forgetFact`) update the matching `profiles` column in the same transaction and reject values the column can't hold; a confirmed fact retires live candidates for its key |
| family | `getFamily(deps, actor): Promise<FamilyView \| null>`, `invite(deps, actor, i: InviteInput): Promise<void>` (student-only; every invite is parent; creates the family on first invite), `revokeInvite(deps, actor, inviteId): Promise<void>`, `acceptInvite(deps, actor, i: AcceptInviteInput): Promise<FamilyView>`, `previewInvite(deps, token: string): Promise<{ inviterFirstName: string; memberRole: FamilyMemberRole; expiresAt: IsoDateTime }>` (no actor; not_found when unknown, expired, or used), `removeMember(deps, actor, userId)`, `leaveFamily(deps, actor)`, `getShareSettings(deps, actor, studentId): Promise<ShareSettings>`, `updateShareSettings(deps, actor, i: ShareSettingsInput): Promise<ShareSettings>`, `getBudget(deps, actor): Promise<FamilyBudget \| null>`, `setBudget(deps, actor, i: FamilyBudgetInput): Promise<FamilyBudget>`, `listTasks(deps, actor): Promise<FamilyTask[]>` (an aid-linked task's status comes from its aid checklist item; a CSS task shows its college name only to the student or a viewer granted `colleges`; a nameless assignee reads "Your family member" or "Your student", R3V-14), `updateTask(deps, actor, id, p: FamilyTaskPatch): Promise<FamilyTask>` (an aid-linked task writes the item's status), `createTask(deps, system, i: { familyId; assigneeId; studentId; kind; title; detail?; dueOn?; aidItemId?: string \| null }): Promise<FamilyTask>` (with `aidItemId`, once per item and assignee; a new task notifies the assignee). `acceptInvite` gives a joining parent `share_budget` and `share_income_range` tasks and notifies the inviter; removing or leaving deletes the member's budget and tasks, and a family with no student left is deleted |
| helpers | `createHelperLink(deps, actor, i: HelperLinkInput): Promise<HelperLinkCreated>`, `listHelperLinks(deps, actor)`, `revokeHelperLink(deps, actor, id)`, `resolveHelperToken(deps, token): Promise<HelperActor \| null>` (the view itself is `helperview.getHelperView`, plan 07) |
| notifications | `notify(deps, system, i: { userId; kind; title; body; link?; dedupeKey; email?: boolean; sms?: boolean }): Promise<Notification \| null>` (null when dedupeKey exists; `sms` enqueues `notify.sms` only when the user has `smsEnabled` and a phone), `listNotifications(deps, actor)`, `markRead(deps, actor, id)`, `getPrefs(deps, actor)`, `updatePrefs(deps, actor, p: NotificationPrefsPatch)`, `deliverEmail(deps, system, notificationId): Promise<void>` (respects prefs and quiet hours), `deliverSms(deps, system, notificationId, sms: SmsSender): Promise<void>` (title and link only, once via `smsSentAt`, after quiet hours; only the title is shortened, so the link and "Reply STOP to opt out." always fit in 300 characters (R3E-7); only a definite rejected send resets the claim; ambiguous timeouts/network failures retain it and log maybe_sent), `retractNotification(deps, system, id): Promise<void>` (deletes the row) |
| billing | `getSubscription(deps, actor): Promise<Subscription>`, `getUsage(deps, actor): Promise<UsageSummary>`, `createCheckout(deps, actor, i: CheckoutInput): Promise<{ url: string }>`, `createPortal(deps, actor): Promise<{ url: string }>`, `applyStripeEvent(deps, system, e: { id: string; created: number; type: string; data: { object: Record<string, unknown> } }): Promise<void>`, `assertCrewAllowance(deps, userId, tx?: DbOrTx): Promise<void>` (throws limit_reached; counts this month's requests plus the user's queued or working jobs from the last hour, except `offer_parse` and `weekly_plan`), `addUsage(tx: DbOrTx, i: { userId; month; costMicros; crewRequest: boolean }): Promise<void>`, `recordUsage(deps, system, i: { userId; costMicros; crewRequest: boolean }): Promise<void>`, `redeemSponsorCode(deps, actor, code: string): Promise<Subscription>`, `planFor(deps, userId): Promise<PlanId>`, `createStripeGateway(secretKey: string): StripeGateway`, `parseStripeWebhook(rawBody: string, signature: string, secret: string, secretKey: string): { id: string; created: number; type: string; data: { object: Record<string, unknown> } }` (throws invalid_input on a bad signature) |
| documents | `uploadDocument(deps, actor, i: { kind: DocumentKind; filename: string; mime: string; bytes: Buffer }): Promise<DocumentMeta>`, `getDocument(deps, actor, id): Promise<DocumentMeta>`, `listDocuments(deps, actor): Promise<DocumentMeta[]>` (own uploads, newest first), `readDocumentBytes(deps, actor, id): Promise<{ meta: DocumentMeta; bytes: Buffer }>` (owner or system), `deleteDocument(deps, actor, id)`, `putBlob(deps, bytes): Promise<string>`, `getBlob(deps, blobId): Promise<Buffer>` |
| account | `requestExport(deps, actor): Promise<ExportRecord>`, `buildExport(deps, system, exportId, o: { lastAttempt: boolean }): Promise<void>` (lists uploaded files in the Markdown, adds the student's `shareSettings` and `familyTasks` with "Sharing with family" and "Family tasks" sections and fact dates on the student's calendar (R3E-11, R3E-8), and notifies `export:<exportId>`), `getExport(deps, actor, id): Promise<{ record: ExportRecord; bytes: Buffer \| null }>`, `latestExport(deps, actor): Promise<ExportRecord \| null>` (newest unexpired), `deleteAccount(deps, actor): Promise<void>` (cancels any non-canceled Stripe subscription first; removes the user's family-room messages, the crew replies and jobs they started, family tasks, and open invites; a family with no student left is deleted), `purgeDeletedAccounts(deps, system): Promise<number>` (deleted and blocked under-13 accounts 6 days after `deletedAt`, so within 7 days with the daily run; removes owned data and catalog submission identifiers; anonymous audit and usage ids remain), `purgeExpired(deps, system): Promise<{ magicLinks: number; temporaryChats: number; exports: number; sessions: number }>` |
| apitokens | `createApiToken(deps, actor, i: { label: string; scopes: ApiTokenScope[] }): Promise<ApiTokenCreated>`, `listApiTokens(deps, actor)`, `revokeApiToken(deps, actor, id)`, `resolveApiToken(deps, bearer: string): Promise<{ actor: UserActor; scopes: ApiTokenScope[] } \| null>` |

Plan 07 modules:

| Module | Exports |
|---|---|
| scholarships | `searchScholarships(deps, actor, q: ScholarshipQuery): Promise<Page<ScholarshipSummary>>` (actor may be public; scam-flagged listings dropped in SQL when `q.excludeScams` or the actor is public; `q.local` from a non-user actor is invalid_input; `q.openOn` keeps only `deadline is null or deadline >= openOn`, in SQL; order is always deadline ascending, nulls last, then name), `getScholarship(deps, actor, idOrSlug): Promise<ScholarshipDetail>` (scam-flagged listings are not_found for the public actor; signed-in users see them with their flags), `buildMatcherProfile(deps, system, ownerId): Promise<MatcherProfile>`, `listMatches(deps, actor, studentId, o?: { audience?: "crew" \| "family" }): Promise<{ matches: Match[]; privateCount: number }>` (private matches are owner-only; family and model reads receive only their count), `getBoard(deps, actor, studentId): Promise<Board>` (open cards whose listing fails `liveListingWhere` go to `flagged` with `SCAM_FLAG_TEXT`, "This listing was retired", or "This listing is under review" and leave the totals; an open card adds to `inPlayUsd` only while its listing is undated or due today or later in the student's zone, and a submitted card always does (R3V-6); `matched` is ordered by `rankMatches` value per hour; private matches are omitted for every non-owner; Board includes privateCount), `saveScholarship(deps, actor, i: { scholarshipId: string }): Promise<ScholarshipApplication>` (writes `matchReasons` and `fitScore` from the matcher; on conflict only when the row has none), `updateApplication(deps, actor, id, p: ApplicationPatch): Promise<ScholarshipApplication>`, `submitLocalScholarship(deps, actor, i: LocalSubmissionInput): Promise<ScholarshipSummary>` (also inserts a `planned` application for the submitter in the same transaction; enqueues `catalog.extract` `{ taskId }`, key `catalog.extract:<taskId>`), `reportListing(deps, actor, i: ReportInput): Promise<void>`, `runSweep(deps, system, studentId): Promise<SweepResult>` (refreshes reasons and fit on open `matched`/`planned`/`drafting` applications; notice key `sweep:<studentId>:<today in the student's zone>`), `lastSweep(deps, actor, studentId): Promise<SweepSummary \| null>`, `liveListingWhere(ownerId: string \| AnyPgColumn): SQL` (no scam flags, and public `published`/`stale` or the owner's own `submitter_only` `draft`/`published`/`stale`; 08 adds it to deadline, reminder, and pending-money queries over open applications) |
| colleges | `searchColleges(deps, actor, q: CollegeQuery): Promise<Page<CollegeSummary>>`, `getCollege(deps, actor, id): Promise<College>`, `getCollegeList(deps, actor, studentId): Promise<CollegeListEntry[]>`, `addCollege(deps, actor, i: CollegeListInput): Promise<CollegeListEntry>`, `updateCollegeEntry(deps, actor, id, p: CollegeListPatch)`, `removeCollege(deps, actor, id)`, `listApplicationItems(deps, actor, entryId): Promise<ApplicationItem[]>`, `updateApplicationItem(deps, actor, id, p: ApplicationItemPatch)`, `listRecommenders(deps, actor)`, `addRecommender(deps, actor, i: RecommenderInput)`, `requestRecommendation(deps, actor, i: RecRequestInput): Promise<RecRequest>`, `listRecRequests(deps, actor): Promise<RecRequest[]>` (newest first, with `helperLinkId`), `updateRecRequest(deps, actor, id, p: RecRequestPatch): Promise<RecRequest>` (owner only; sets `status` and `updatedAt`), `archiveSeason(deps, actor): Promise<{ archived: number }>` (also sets `offers.archivedAt` for the season's award year, 02 `awardYearFor(season)`, and earlier) |
| essays | `listEssays(deps, actor, ownerId)`, `createEssay(deps, actor, i: EssayInput)`, `getEssay(deps, actor, id): Promise<EssayWithBody>`, `updateEssay(deps, actor, id, p: EssayPatch): Promise<Essay>` (owner only; title, prompt, status; sets `updatedAt`), `saveVersion(deps, actor, id, i: SaveVersionInput): Promise<EssayVersion>`, `listVersions(deps, actor, id)`, `requestReview(deps, actor, id): Promise<CrewJob>`, `listComments(deps, actor, id)`, `resolveComment(deps, actor, id)`, `saveQuillComments(deps, system, i: { essayId; ownerId; version; jobId; comments: QuillCommentDraft[] }): Promise<EssayComment[]>`, `listStories(deps, actor, ownerId)`, `createStory(deps, actor, i: StoryInput)`, `updateStory(deps, actor, id, p: StoryPatch)`, `archiveStory(deps, actor, id)`, `linkStory(deps, actor, i: LinkStoryInput): Promise<StoryUse>`, `checkStoryReuse(deps, actor, i: { storyId; collegeId?: string; scholarshipId?: string }): Promise<StoryReuseCheck>` |
| prep | `listTestScores(deps, actor, ownerId)`, `addTestScore(deps, actor, i: TestScoreInput)`, `deleteTestScore(deps, actor, id)`, `getSuperscores(deps, actor, ownerId): Promise<Superscore[]>`, `requestRetakeAnalysis(deps, actor, i: RetakeAnalysisInput): Promise<CrewJob>`, `computeRetake(deps, system, ownerId, i: RetakeAnalysisInput): Promise<RetakeAnalysis>`, `acceptStudyPlan(deps, actor, i: { sessions: StudySession[] }): Promise<PlanItem[]>` |
| impact | `listServiceLogs(deps, actor, ownerId)`, `addServiceLog(deps, actor, i: ServiceLogInput)`, `updateServiceLog(deps, actor, id, p: ServiceLogPatch)`, `deleteServiceLog(deps, actor, id)`, `requestVerification(deps, actor, id): Promise<ServiceLog>` (the email writes the service date with `calendarShort` and the expiry with `instantInZone` in the student's zone, R3E-8), `getVerificationRequest(deps, token): Promise<VerificationRequestView \| null>`, `submitVerification(deps, token, i: VerificationSubmitInput): Promise<void>`, `listActivities(deps, actor, ownerId)`, `upsertActivity(deps, actor, i: ActivityInput)`, `deleteActivity(deps, actor, id)`, `getRequirementProgress(deps, actor, ownerId): Promise<RequirementProgress[]>` (open applications on listings that pass `liveListingWhere`; every `ServiceLog` carries `verificationExpiresAt`) |
| helperview | `getHelperView(deps, actor: HelperActor): Promise<HelperView>` (sections only for the link's scope) |

Plan 08 modules:

| Module | Exports |
|---|---|
| money | `getCosts(deps, actor, studentId): Promise<CostSummary[]>` (per college: confirmed unarchived offer, then calculator result, then Scorecard; pending money counts only applications whose listing passes `liveListingWhere`, and `planned`/`drafting` ones only while the listing is undated or due today or later in the student's zone, while `submitted` always counts (R3V-6)), `setCalculatorResult(deps, actor, i: CalculatorResultInput): Promise<CostSummary>`, `listOffers(deps, actor, studentId): Promise<OfferWithLines[]>` (skips archived offers; every `Offer` carries `parseJobId`), `createOffer(deps, actor, i: CreateOfferInput): Promise<OfferWithLines>` (enqueues `offer.parse`), `getOffer(deps, actor, id)`, `costsFor(deps, ownerId, o: { viewer: "owner" \| "other" }): Promise<CostSummary[]>`, `saveParsedOffer(deps, system, i: { offerId; ownerId; costOfAttendanceUsd; lines: ParsedOfferLine[]; awardYear?: AwardYear })` (`awardYear` is stored only when valid and within one year of `currentAwardYear(now)`), `markOfferFailed(deps, system, i: { offerId; ownerId; error: string }): Promise<{ changed: boolean }>`, `updateOfferLine(deps, actor, id, p: OfferLinePatch)`, `confirmOffer(deps, actor, id)` (also creates one `review_costs` family task per parent granted costs who doesn't have one for the student), `deleteOffer(deps, actor, id): Promise<void>` (owner only; a confirmed offer is `conflict`; lines cascade, the document stays), `compareMyOffers(deps, actor, studentId): Promise<OfferComparison>` (confirmed, unarchived offers; offers with no known cost of attendance are left out with an assumption line, and the outside-scholarships line is always added), `requestAppealOutline(deps, actor, offerId): Promise<CrewJob>`, `loanEstimates(deps, actor, offerId): Promise<LoanEstimate[]>`, `publicOfferTool(i: PublicOfferInput): OfferComparison` |
| aid | `getAidChecklists(deps, actor, studentId): Promise<AidChecklist[]>` (FAFSA plus one CSS checklist per listed college that requires it), `updateAidItem(deps, actor, id, p: AidChecklistPatch)`, `ensureChecklists(deps, system, studentId): Promise<void>` (creates FAFSA items and CSS items for colleges that require CSS, and one family task per parent per parent-assigned item, linked by `aidItemId` and titled with the plain step title; the item holds the status), `listAidDeadlines(deps, actor, studentId): Promise<AidDeadline[]>` |
| plan | `getThisWeek(deps, actor, studentId): Promise<ThisWeekView>`, `getWeekPlan(deps, actor, studentId, weekStart?: IsoDate): Promise<WeekPlan>`, `addPlanItem(deps, actor, i: PlanItemInput): Promise<PlanItem>`, `updatePlanItem(deps, actor, id, p: PlanItemPatch): Promise<PlanItem>`, `requestWeeklyPlan(deps, actor): Promise<CrewJob>`, `startWeeklyPlan(deps, system, ownerId): Promise<CrewJob \| null>` (for `plan.weekly.fanout`: active onboarded students only, no allowance check, null when a `weekly_plan` job was created in the last 12 hours; enqueues `plan.weekly { jobId, ownerId, source: "system" }`), `replaceGeneratedPlan(deps, system, i: { ownerId; weekStart; items: PlanItemInput[] }): Promise<WeekPlan>` (replaces only `generated` todo items for the week and inserts with `generated: true`), `listUpcomingDeadlines(deps, actor, studentId, limit: number): Promise<Deadline[]>` (saved scholarships only when the listing passes `liveListingWhere`), `buildWeeklyDigest(deps, system, userId): Promise<Digest \| null>` (due dates as `calendarShort`, "Oct 15", R3E-8), `findDueReminders(deps, system): Promise<Reminder[]>` (7/3/1-day deadline reminders on live listings plus `offset: 30` renewal reminders for won renewable awards, key `renewal:<applicationId>:<year>`) |
| crew | `listConversations(deps, actor)`, `createConversation(deps, actor, i: ConversationInput): Promise<Conversation>`, `getMessages(deps, actor, conversationId, o?: { before?: string; limit?: number }): Promise<Message[]>` (newest 50 by default, max 100; before is a message id; returned oldest first), `sendMessage(deps, actor, conversationId, i: SendMessageInput): Promise<{ message: Message; job: CrewJob }>`, `getJob(deps, actor, id): Promise<CrewJob>`, `listJobs(deps, actor, o?: { active?: boolean; limit?: number }): Promise<CrewJob[]>` (own jobs plus jobs the actor requested in a family room they still belong to, newest first; active = queued or working; limit 1..50, default 20), `applyActionCard(deps, actor, i: ApplyActionInput): Promise<ActionReceipt>` (claims the receipt first, so a card runs once under concurrent applies; a fresh pending claim is `conflict`; refuses `confirm_fact` and `record_decision` in temporary rooms; `record_decision` stores the message id), `startJob(deps, system, id, o: { leaseSeconds: number }): Promise<{ job: CrewJob; leaseToken: string } \| null>`, `releaseJob(deps, system, id, leaseToken): Promise<void>`, `reapStaleJobs(deps, system): Promise<{ jobs: number; exports: number }>`, `appendProgress(deps, system, id, e: ProgressEvent)`, `completeJob(deps, system, i: { jobId; leaseToken: string; usage?: { costMicros: number; crewRequest: boolean }; sharedCategories?: ShareCategory[]; reply: CrewReply \| null; status: "ready" \| "needs_input" \| "failed"; error?: string; safety?: SafetyFlag }): Promise<{ job: CrewJob; completed: boolean }>` (a room-less reply reuses the owner's newest live `my_crew` room with the kind's title; appeal and retake notices link to `/crew/<conversationId>`), `recordAgentRun(deps, system, r: AgentRunRecord, o?: { leaseToken?: string })`, `createJob(deps, actor, i: { kind: JobKind; refId?: string; conversationId?: string }): Promise<CrewJob>` |
| admin | `listCatalogTasks(deps, actor, f: { status?: CatalogTaskStatus; kind?: CatalogTaskKind })`, `resolveCatalogTask(deps, actor, id, r: CatalogTaskResolution)` (rejecting a `recheck_changed` task restores a `stale` listing to `published` with a fresh verification), `createCatalogTask(deps, system, i: { kind; payload; scholarshipId?; createdById? })`, `upsertScholarship(deps, actor, i: ScholarshipUpsertInput): Promise<Scholarship>`, `setScholarshipStatus(deps, actor, id, status: CatalogStatus, note?: string)`, `getScholarshipForAdmin(deps, actor, id): Promise<Scholarship>` (any status), `listScholarships(deps, actor, f: { status?: CatalogStatus; q?: string; page: number }): Promise<Page<Scholarship>>` (50 per page), `getCatalogTask(deps, actor, id): Promise<CatalogTask>`, `listReports(deps, actor, status?)`, `resolveReport(deps, actor, id, i: { status: "resolved" \| "rejected"; note: string })`, `importColleges(deps, actor, rows: CollegeImportRow[]): Promise<ImportResult>`, `searchAudit(deps, actor, q: AuditQuery): Promise<Page<AuditEvent>>`, `enqueueResearch(deps, actor, i: { state: string; county?: string }): Promise<void>`, `listAidRules(deps, actor, f: { awardYear?: string }): Promise<AidRule[]>` (skips rows whose value fails `FederalLoanRates`), `upsertAidRule(deps, actor, i: AidRuleInput): Promise<AidRule>` (on `(awardYear, key)`, `verifiedAt = now`), `listAidDeadlinesForAdmin(deps, actor, f: { awardYear?: string }): Promise<AidDeadline[]>`, `upsertAidDeadline(deps, actor, i: AidDeadlineInput): Promise<AidDeadline>` (insert without `id`, update with it; unknown `id` is `not_found`), `deleteAidDeadline(deps, actor, id): Promise<void>` (the three aid writes are audited as `aid_rule_upserted`, `aid_deadline_upserted`, `aid_deadline_deleted`) |

### 9.5 `@scholarcrew/agents` (plans 09 and 10)

```ts
// "@scholarcrew/agents" (09)
export const MODEL_ID = "claude-opus-5-5";
export interface ToolDef<I = unknown> { name: string; description: string; input: z.ZodType<I>; strict?: boolean; run(input: I): Promise<unknown> }   // strict defaults to true; false leaves the strict key out (submit tools, R3E-3)
export interface ModelUsage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costMicros: number }
export interface ModelTurn { content: Anthropic.Beta.BetaContentBlock[]; stopReason: string; usage: ModelUsage; model: string; durationMs: number }
export interface ModelRequest { role: string; system: string; messages: Anthropic.Beta.BetaMessageParam[];
  tools: ToolDef[]; effort: Effort; maxTokens: number }
export interface ModelClient { turn(req: ModelRequest): Promise<ModelTurn>;
  extract<T>(req: { role: string; system: string; content: Anthropic.Beta.BetaContentBlockParam[]; schema: z.ZodType<T>; effort: Effort; maxTokens: number }): Promise<{ value: T | null; refused: boolean; usage: ModelUsage }> }
export function createModelClient(o: { apiKey?: string }): ModelClient;
export function costMicros(u: Omit<ModelUsage, "costMicros">): number;   // 4/20/0.2/5 micro-dollars per token
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown>;
export const STRICT_UNION_LIMIT = 16;   // union-typed (anyOf or type-array) nodes allowed across one request's strict schemas (R3E-3; see §14)
export function countStrictUnions(params: MessageCreateParams): number;   // strict tools plus output_config.format.schema; 09, 10, and 11 tests assert <= STRICT_UNION_LIMIT
export function buildExtractParams<T>(req: { role: string; system: string; content: Anthropic.Beta.BetaContentBlockParam[]; schema: z.ZodType<T>; effort: Effort; maxTokens: number }): MessageCreateParams;   // what extract() sends; plan 11's union-count test uses it
// MessageCreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming & { fallbacks: "default" } (§14)
export interface UsageLike { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }
export function usageOf(u: UsageLike): ModelUsage;   // SDK usage (beta or batch) → ModelUsage with costMicros; plan 11 uses it

export interface LoopLimits { maxModelRounds: number; maxToolCalls: number; deadlineMs: number }
export interface LoopResult<T> { output: T | null; reason: "submitted" | "refused" | "limit" | "no_submit" | "invalid_submit"; turns: ModelTurn[] }   // invalid_submit: a second submit input failed its Zod schema (R3E-3)
export function runAgentLoop<T>(model: ModelClient, i: { role: string; system: string; userContent: Anthropic.Beta.BetaContentBlockParam[];
  tools: ToolDef[]; submit: { name: string; description: string; schema: z.ZodType<T> }; effort: Effort; maxTokens: number;
  limits: LoopLimits; onTurn?: (t: ModelTurn) => void; now?: () => number }): Promise<LoopResult<T>>;

export interface CrewDataPort {
  liveGrants(): Promise<ShareCategory[]>;
  usedCategories(): ShareCategory[];
  snapshot(ownerId: string, room: RoomKind, audience: "crew" | "family"): Promise<ContextSnapshot>;
  matches(ownerId: string, audience: "crew" | "family"): Promise<{ matches: Match[]; privateCount: number }>;
  searchScholarships(q: ScholarshipQuery): Promise<ScholarshipSummary[]>;
  scholarship(idOrSlug: string): Promise<ScholarshipDetail | null>;
  collegeList(ownerId: string): Promise<CollegeListEntry[]>;
  college(id: string): Promise<College | null>;
  applicationItems(ownerId: string): Promise<ApplicationItem[]>;
  stories(ownerId: string): Promise<Story[]>;
  story(ownerId: string, storyId: string): Promise<Story | null>;
  essay(ownerId: string, essayId: string): Promise<EssayWithBody | null>;
  costs(ownerId: string): Promise<CostSummary[]>;
  offers(ownerId: string): Promise<OfferComparison>;
  aidChecklist(ownerId: string): Promise<AidChecklist[]>;
  testScores(ownerId: string): Promise<TestScore[]>;
  activities(ownerId: string): Promise<Activity[]>;
  serviceProgress(ownerId: string): Promise<RequirementProgress[]>;
  weekPlan(ownerId: string): Promise<WeekPlan>;
  deadlines(ownerId: string): Promise<Deadline[]>;
}
export type ConsultFn = (i: { role: SpecialistRole; question: string; ownerId: string;
  audience: "crew" | "family"; context: ContextSnapshot; onStudentTexts?: (texts: string[]) => void }) => Promise<SpecialistResult>;
export interface AgentDeps { model: ModelClient; port: CrewDataPort; consult: ConsultFn; now: () => Date;
  onProgress?: (e: ProgressEvent) => Promise<void>; onUsage?: (role: string, t: ModelTurn) => Promise<void> }
// onUsage: 09 and 10 attach a .catch to every call and log "agents.usage_failed", so a rejected write never
// becomes an unhandled rejection or fails a finished result. Implementations should still not reject.
// port: the worker builds one per job with the job's audience (plan 12 L5). A family-bound port returns empty for
// every read whose share category is off, never returns test scores, and aid checklists follow `deadlines`.
// Snapshot profile fields follow each profile fact's visibility (R2I-10), and collegeList fills gapUsd from costs.
export function boundedRetryFetch(fetchImpl?: typeof globalThis.fetch, now?: () => number): typeof globalThis.fetch;
export const MODEL_TIMEOUT_MS: number;
export const MODEL_MAX_RETRIES: number;
export const MODEL_MAX_RETRY_WAIT_MS: number;
export const COMPASS_LIMITS: LoopLimits;      // { maxModelRounds: 3, maxToolCalls: 8, deadlineMs: 120_000 }
export const SPECIALIST_LIMITS: LoopLimits;   // { maxModelRounds: 3, maxToolCalls: 6, deadlineMs: 45_000 }
export function runCrewRequest(deps: AgentDeps, i: CrewRequestInput): Promise<CrewRunResult>;
export function runWeeklyPlan(deps: AgentDeps, i: { ownerId: string; weekStart: IsoDate }): Promise<{ items: PlanItemInput[]; reply: CrewReply | null }>;
// guards
export function detectCrisis(text: string): boolean;
export function checkIntegrity(text: string, studentTexts: string[]): { ok: boolean; longestNewRun: number };
export function checkSources(reply: CrewReply, known: KnownSources): { ok: boolean; problems: string[] };
export function checkPrivacy(reply: CrewReply, audience: "crew" | "family", allowed?: ShareCategory[]): { ok: boolean; problems: string[] };   // allowed defaults to FAMILY_DEFAULT_ALLOWED (D14)
export function wrapUntrusted(label: string, text: string): Anthropic.Beta.BetaTextBlockParam;
export const CRISIS_REPLY: CrewReply;
// "@scholarcrew/agents/testing" (09)
export function createScriptedModelClient(script: ScriptedTurn[] | ((req: ModelRequest) => ScriptedTurn)): ModelClient & { requests: ModelRequest[] };
export function createFakePort(o?: Partial<FakePortData>): CrewDataPort;
// "@scholarcrew/agents/specialists" (10)
export interface SpecialistDef { role: SpecialistRole; system: string; effort: Effort;
  tools(port: CrewDataPort, ownerId: string, audience: "crew" | "family"): ToolDef[] }
export const SPECIALISTS: Record<SpecialistRole, SpecialistDef>;
export function consultSpecialist(deps: Omit<AgentDeps, "consult">, i: Parameters<ConsultFn>[0]): Promise<SpecialistResult>;
export function makeConsult(deps: Omit<AgentDeps, "consult">): ConsultFn;      // (i) => consultSpecialist(deps, i)
export function runEssayReview(deps: Omit<AgentDeps, "consult">, i: { ownerId: string; essayId: string; version: number; body: string; context?: Pick<EssayWithBody, "prompt" | "wordLimit" | "charLimit" | "targetLabel"> }): Promise<{ comments: QuillCommentDraft[]; refused: boolean }>;
export function runOfferParse(deps: Omit<AgentDeps, "consult">, i: { ownerId: string; pdfBase64: string; collegeName: string }): Promise<{ parsed: ParsedOffer | null; refused: boolean }>;
export function runAppealOutline(deps: Omit<AgentDeps, "consult">, i: { ownerId: string; offerId: string }): Promise<CrewReply>;
export function runRetakeExplanation(deps: Omit<AgentDeps, "consult">, i: { ownerId: string; analysis: RetakeAnalysis }): Promise<CrewReply>;
```

How the two plans connect: plan 09 never imports `./specialists`. Compass reaches specialists only through the injected `AgentDeps.consult`, so plan 09 compiles and tests on its own with a fake `consult`. Plan 10 imports the runtime from `../loop`, `../model`, `../guards`, `../context` and exports `makeConsult`. The worker (plan 12) wires them: `const base = { model, port, now, onProgress, onUsage }; runCrewRequest({ ...base, consult: makeConsult(base) }, input)`, with `port = createCrewDataPort(core, { audience: input.audience })`. `CrewRequestInput.requester` (`{ role: "student" | "parent"; firstName }`) says who asked, and each `history` line carries a `speaker` (`student`, `parent`, or `crew`); 12 `loadCrewInput` fills both from `users`, and 09 `buildContextBlocks(snapshot, history, userText, mentions, requester)` serializes history as JSON objects with `speaker` and `text` inside an untrusted block and prefixes a parent's request with `"<firstName> (parent) asks: "` (D42). In a `temporary` room Compass drops `confirm_fact` and `record_decision` cards (D22). `consultSpecialist` drops `factsUsed` and `proposedActions` refs that didn't appear in the context or one of that run's tool results, so Compass's `KnownSources` only learns refs a specialist actually saw (CR-04).

Compass (09) gets one `consult_<role>` tool per enabled specialist, calculator tools over plan 04 (`ledger_gap`, `ledger_compare_offers`, `ledger_loan_payment`, `count_words`, `days_until`), and the `submit_reply` tool whose input schema is `CrewReply`. Specialists (10) get read-only data tools over the port and the `submit_result` tool whose input schema is `SpecialistResult`. Every agent finishes by calling its submit tool; `runAgentLoop` returns that tool's validated input as `output`. Submit tools are sent without `strict`. The loop validates their input with the domain Zod schema, allows one retry, then ends with `invalid_submit`. Every other tool is sent with `strict: true` and an `input_schema` from `toStrictJsonSchema`. The retry appends the assistant `tool_use` turn and one `is_error` `tool_result` (`Invalid <name> input. <issues>`, the first 10 issues as `path: message`, capped at 2,000 characters) and never edits earlier turns; check-hook retries are counted separately. On `invalid_submit`, `runCrewRequest` returns status `failed` with `OUT_OF_TIME_TEXT` and `safety: "partial"` (12 completes it without counting the request), `runWeeklyPlan` returns `{ items: [], reply: null }`, and a specialist consult returns `COULDNT_FINISH_SUMMARY` with an uncertainty line. Receipt items of kind `fact`, `record`, and `calculation` carry `sourceUrl: null` and `verifiedAt: null`; only catalog items (and a `record` that cites a known listing, with that listing's exact values) carry a link and a verified date (R3E-4).

Bounds (AG-01): Compass uses `COMPASS_LIMITS` and at most 4 `consult_*` calls per request (extra calls return an error tool result telling it to submit). Specialists use `SPECIALIST_LIMITS`. A specialist has no `consult_*` tools, so it can't call another specialist (AG-02).

Efforts (AG-05): Compass `medium`, specialists `medium`, Quill essay review `high`, offer parse `high`, catalog extraction `low`, weekly plan `medium`.

### 9.6 `@scholarcrew/catalog` (plan 11)

```ts
export interface CatalogDeps { db: Db; model: ModelClient; fetchPage(url: string): Promise<{ status: number; text: string; contentType: string; finalUrl?: string }>;
  anthropicBatches: BatchGateway; researcher: Researcher; now: () => Date; allowedDomains: string[];
  onUsage?: (role: "catalog", t: ModelTurn) => Promise<void> }   // D20: one call per extraction, research turn, and batch item (batch at half cost); failures are logged, never thrown
export interface Researcher { findCandidates(i: { state: string; county?: string; allowedDomains: string[] }):
  Promise<Array<{ url: string; title: string; snippet: string }>> }
export interface BatchGateway { create(requests: Array<{ customId: string; system: string; userText: string; schema: Record<string, unknown> }>): Promise<{ batchId: string }>;
  results(batchId: string): Promise<{ ended: boolean; items: Array<{ customId: string; json: unknown | null; usage?: ModelUsage | null }> }> }   // throws BatchNotFoundError when the API no longer has the batch
export class BatchNotFoundError extends Error { readonly batchId: string }
export function htmlToText(html: string): string;
export function parseCsv(text: string): string[][];
export function parseScorecardCsv(text: string): CollegeImportRow[];
export function parseScorecardCsvWithErrors(text: string): { rows: CollegeImportRow[]; lines: number[]; errors: Array<{ line: number; message: string }> };  // plan 14's import route uses this; lines[k] is the CSV line of rows[k] (header = 1), so the route remaps importColleges errors with parsed.lines[e.line - 1] (R2C-13)
export function extractForTask(deps: CatalogDeps, taskId: string): Promise<VerificationReport | null>;   // worker handler for "catalog.extract": open research_candidate and user_submission tasks (D18); null for anything else
// "@scholarcrew/catalog/testing": fake Researcher, BatchGateway, fetchPage, and an extract-only ModelClient
// "@scholarcrew/catalog/csv": parseCsv, parseScorecardCsv, parseScorecardCsvWithErrors, type ScorecardError; imports only @scholarcrew/domain, so no @anthropic-ai/sdk (D-14-4, plan 14's import route)
export function researchCandidates(deps: CatalogDeps, i: { state: string; county?: string }): Promise<{ created: number; taskIds: string[] }>;  // creates catalogTasks(research_candidate), skips known URLs
export function extractListing(deps: CatalogDeps, i: { url: string; pageText: string }): Promise<ListingDraft | null>;
export function verifyDraft(draft: ListingDraft, pageText: string, now: Date): VerificationReport;
export function startRecheck(deps: CatalogDeps): Promise<{ batchId: string | null; count: number }>;
export function collectRecheck(deps: CatalogDeps): Promise<{ changed: number; unchanged: number; failed: number }>;
export function createAnthropicBatchGateway(apiKey?: string): BatchGateway;          // src/anthropic.ts
export function createAnthropicResearcher(apiKey?: string, onUsage?: CatalogDeps["onUsage"]): Researcher;   // src/anthropic.ts: web_search + web_fetch server tools, strict submit tool, pause_turn handling, usage per turn
export function createFetchPage(): CatalogDeps["fetchPage"];   // 10s timeout, 2 MB cap, text/html or text/plain only; manual redirects (max 5) with every hop's host and resolved addresses checked (SE-06)
```

### 9.7 Web server helpers (plan 13)

```ts
// apps/web/src/server/deps.ts
export function getDeps(): CoreDeps;                      // singleton; reads env; pg-boss send-only client
export function devRoutesEnabled(): boolean;             // /api/v1/dev/* routes: ENABLE_DEV_ROUTES=1 and NODE_ENV !== "production"
// apps/web/src/server/http.ts
export type RouteAuth = "user" | "admin" | "optional" | "none" | "bearer";
export interface RouteCtx<P> { req: Request; params: P; actor: Actor; deps: CoreDeps; ip: string; url: URL;
  scopes: ApiTokenScope[] }                               // API token scopes when auth is "bearer"; [] otherwise
export function route<P = Record<string, never>>(opts: { auth: RouteAuth; csrf?: boolean; rate?: { key: string; limit: number; windowSeconds: number };
  cors?: "extension" },                                   // CORS headers for chrome-extension:// origins only (D11, D16)
  handler: (ctx: RouteCtx<P>) => Promise<Response | unknown>): (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;
export function json(data: unknown, status?: number): Response;
export async function body<T>(req: Request, schema: z.ZodType<T>, maxBytes?: number): Promise<T>;    // throws AppError invalid_input; maxBytes defaults to JSON_BODY_LIMIT
export function query<T>(url: URL, schema: z.ZodType<T>): T;
export function errorResponse(e: unknown): Response;
export const JSON_BODY_LIMIT: number;                     // 256 * 1024
export const PUBLIC_BODY_LIMIT: number;                   // 64 * 1024, for JSON on auth "none" routes
export class PayloadTooLargeError extends AppError {}     // code invalid_input, status 413
export async function readBytesCapped(req: Request, maxBytes: number, message?: string): Promise<Uint8Array<ArrayBuffer>>;  // refuses a declared Content-Length over the cap, cancels a chunked stream past it
export async function readTextCapped(req: Request, maxBytes: number, message?: string): Promise<string>;  // UTF-8 of readBytesCapped (Stripe webhook, CSV import)
export function studentIdParam(ctx: { actor: Actor; url: URL }): string;  // optional ?studentId= (D23); defaults to the caller
export function clientIp(req: Request): string;          // right-most X-Forwarded-For hop, else X-Real-IP, else "unknown"
export function requireScope(ctx: { scopes: ApiTokenScope[] }, scope: ApiTokenScope): void;  // throws forbidden
export function fileResponse(bytes: Buffer, contentType: string, filename: string): Response;  // attachment, no-store, nosniff
export function extensionPreflight(req: Request): Response;  // OPTIONS handler: 204, CORS headers only for chrome-extension:// origins
// apps/web/src/server/session.ts
export async function getPageActor(): Promise<UserActor | null>;         // reads cookie via next/headers
export async function requirePageActor(roles?: Role[]): Promise<UserActor>; // redirects to /sign-in
export function sessionCookie(token: string, maxAgeDays: number): string; // Set-Cookie value
export function clearSessionCookie(): string;
```

`route` returns 204 when the handler returns `undefined`, wraps other values in `json()`, enforces `Origin === APP_URL` for non-GET requests when `csrf !== false` and auth is cookie-based, and maps errors with `errorResponse`. Bearer routes skip the Origin check; `cors: "extension"` routes also export `OPTIONS = extensionPreflight`. Plan 13 also exports `setDepsForTests`/`resetDepsForTests` (tests only), `buildDeps`, `createLazyJobsClient`, and `stripeSecretKey` from `deps.ts`, and `parseCookie` from `cookies.ts`; none changes a name above. Every route file sets `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`.

### 9.8 Web client helpers (plan 16)

```ts
// apps/web/src/lib/api.ts
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>; // throws ApiError
export class ApiError extends Error { code: string; status: number }
export function isLimit(e: unknown): boolean;      // 402 limit_reached; show a "See plans" link to /settings (CR-10, BI-02)
// apps/web/src/lib/sse.ts
export function useJobStream(jobId: string | null, opts?: { pollMs?: number; maxMs?: number }): { job: CrewJob | null; error: string | null };
  // follows /jobs/:id/events; after `end` without a terminal status, or an error while reconnecting, polls GET /jobs/:id
  // (every pollMs, default 3000) until terminal; error on a CLOSED stream, when polling fails, or after maxMs (15 min)
// apps/web/src/components/crew/Thread.tsx (props for 17's context rooms and read-only views; D35)
export function Thread(p: { conversation: Conversation | null; messages: Message[]; prefill?; chips?; compact?;
  readOnlyCards?; authors?; placeholder?; emptyText?; timeZone?;
  openRoom?: { room: "scholarship" | "college" | "essay"; roomRefId: string };  // lazy room, created on first send
  readOnly?: boolean }): JSX.Element;
// apps/web/src/lib/format.ts
export function usd(n: number): string;            // "$9,200"
export function dateShort(d: IsoDate): string;     // "Oct 15"
export function daysLabel(n: number): string;      // "9 days", "today", "1 day", "3 days ago"
```

### 9.9 `@scholarcrew/ui` (plan 15)

Components (each in `src/components/<Name>/<Name>.tsx` with a CSS module and a test), all exported from `@scholarcrew/ui`, plus `@scholarcrew/ui/tokens.css`:

`AppShell` (props: `nav: NavItem[]`, `activeKey`, `crew: CrewRosterItem[]`, `user: { name; subtitle }`, `topbar: ReactNode`, `children`, `className?` on the outer frame, `mobileNav?: ReactNode` phone tab bar that replaces the sidebar under 640px), `Topbar`, `Card` (`title?`, `aside?`, `padding?: "md" | "lg"`), `Button` (`variant: "primary" | "soft" | "line" | "white" | "glass"`, `size?: "sm" | "md"`, `icon?`, `href?`, `type?`, `onClick?`, `disabled?`), `Badge` (`tone: "good" | "warn" | "crit" | "neutral" | "navy"`, `icon?`), `StatusPill` (`status: JobStatus | "on"`), `Chip` (`active?`, `onClick?`, `dot?: CrewRole`), `CrewDot` (`role: CrewRole`), `Who` (`role: CrewRole`, `size?`), `Eyebrow`, `HeroNumber`, `Toggle` (`checked`, `onChange`, `label`), `Progress` (`value: 0..1`), `GapBar` (`freeUsd`, `gapUsd`, legend labels), `OfferBars` (`rows: { label; sub; freeUsd; costUsd; endLabel }[]`, `axisMaxUsd`), `Table` (`columns`, `rows`), `Kanban` (`columns: { key; title; count; children }[]`), `Tag`, `EmptyState`, `Field`, `TextInput`, `TextArea`, `Select`, `Modal` (`open`, `title`, `onClose`, `footer?`; traps Tab, closes on Escape while focused, returns focus to the opener), `Icon` (`name` from the mockup icon set). `CREW_COLORS: Record<CrewRole, string>` uses the validated palette from `design/mockups/source/styles.css`.

## 10. API surface (contract for plans 13 and 14)

All paths are under `/api/v1`. Bodies and responses are JSON validated with the named domain schema. Auth: `user` (any signed-in user; the service enforces role), `admin`, `none` (public), `bearer` (extension API token). Owner column says which plan writes the route file. Creates return 201 (`json(x, 201)`), job starts return 202 (`json(job, 202)`), `undefined` returns 204, and everything else returns 200.

Read routes that take a `studentId` (matches, the board, the college list, essays, stories, test scores, superscores, service logs and progress, activities, costs, offers and the comparison, aid checklists and deadlines, the week plan, This Week, and family share settings) accept an optional `?studentId=` so a parent reads a student's shared data; it defaults to the caller (D23, plan 13's `studentIdParam`). Request bodies are read through a byte cap: JSON 256 KB, 64 KB on `none` routes, uploads 10 MB plus multipart overhead, the CSV import 5 MB. Past the cap the route answers 413 with code `invalid_input`, whether or not `Content-Length` was sent.

| Method and path | Auth | Core call | Request | Response | Owner |
|---|---|---|---|---|---|
| POST /auth/magic-link | none (rate 5/15min per IP and per email) | auth.requestMagicLink | MagicLinkRequest | 204 | 13 |
| GET /auth/verify?token= | none | auth.verifyMagicLink | query token | 303 to `/onboarding` (student who hasn't onboarded) or `/week`, sets cookie (a new account with a pending parent invite is a parent, so it lands on `/week`; R2I-2) | 13 |
| POST /auth/sign-out-all | user (Origin check) | auth.signOutEverywhere | none | 204, clears cookie and revokes sessions/tokens | 13 |
| POST /auth/sign-out | optional (Origin check) | auth.signOut | none | 204, always clears cookie | 13 |
| GET /me | user | profile.getMe | none | MeResponse | 13 |
| GET /profile · PATCH /profile | user | profile.getProfile · updateProfile | — · ProfilePatch | Profile | 13 |
| POST /onboarding | user | profile.completeOnboarding | OnboardingInput | MeResponse | 13 |
| GET /facts · POST /facts | user | memory.listFacts · createFact | — · FactInput | MemoryFact[] · MemoryFact | 13 |
| PATCH /facts/:id · DELETE /facts/:id | user | memory.updateFact · forgetFact | FactPatch | MemoryFact · 204 | 13 |
| POST /facts/:id/confirm · POST /facts/:id/reject | user | memory.confirmCandidate · rejectCandidate | none | MemoryFact | 13 |
| GET /decisions · POST /decisions · DELETE /decisions/:id | user | memory.* | DecisionInput | Decision[] · Decision · 204 | 13 |
| GET /sensitive-facts · PUT /sensitive-facts | user | memory.listSensitiveFacts · setSensitiveFact | SensitiveFactInput | SensitiveFactSummary[] · SensitiveFactSummary | 13 |
| POST /sensitive-facts/share-income | user (parent) | memory.shareIncomeRangeToStudent | { studentId, range } | 204 | 13 |
| GET /family | user | family.getFamily | none | FamilyView or null | 13 |
| POST /family/invites · POST /family/invites/accept | user | family.invite · acceptInvite | InviteInput (parent only) · AcceptInviteInput | 204 · FamilyView | 13 |
| DELETE /family/invites/:id | user, student only | family.revokeInvite | none | 204 or 404 | 13 |
| GET /family/invites/preview?token= | none (rate 30/hour per IP) | family.previewInvite | query token | { inviterFirstName, memberRole, expiresAt } or 404 (D37) | 13 |
| DELETE /family/members/:userId · POST /family/leave | user | family.removeMember · leaveFamily | none | 204 | 13 |
| GET /family/share-settings?studentId= · PUT /family/share-settings | user | family.getShareSettings · updateShareSettings | ShareSettingsInput | ShareSettings | 13 |
| GET /family/budget · PUT /family/budget | user | family.getBudget · setBudget | FamilyBudgetInput | FamilyBudget or null · FamilyBudget | 13 |
| GET /family/tasks · PATCH /family/tasks/:id | user | family.listTasks · updateTask | FamilyTaskPatch | FamilyTask[] · FamilyTask | 13 |
| GET /helper-links · POST /helper-links · DELETE /helper-links/:id | user | helpers.* | HelperLinkInput | HelperLink[] · HelperLinkCreated · 204 | 13 |
| GET /notifications · POST /notifications/:id/read | user | notifications.listNotifications · markRead | none | Notification[] · 204 | 13 |
| GET /notification-prefs · PATCH /notification-prefs | user | notifications.getPrefs · updatePrefs | NotificationPrefsPatch | NotificationPrefs | 13 |
| GET /billing · POST /billing/checkout · POST /billing/portal | user | billing.getSubscription+getUsage · createCheckout · createPortal | CheckoutInput | BillingView · { url } | 13 |
| POST /billing/webhook | none (Stripe signature; 404 while STRIPE_WEBHOOK_SECRET is empty) | billing.applyStripeEvent | raw body | 204 | 13 |
| POST /billing/sponsor-code | user | billing.redeemSponsorCode | { code } | Subscription | 13 |
| GET /documents · POST /documents (multipart: kind, file) · GET /documents/:id · GET /documents/:id/download · DELETE /documents/:id | user (upload rate 20/hour) | documents.listDocuments · uploadDocument · getDocument · readDocumentBytes · deleteDocument | form data | DocumentMeta[] (own, newest first; D27) · DocumentMeta · bytes · 204 | 13 |
| POST /account/export · GET /account/exports/latest · GET /account/exports/:id?format=json\|md · DELETE /account | user | account.requestExport · latestExport · getExport · deleteAccount | none | ExportRecord · ExportRecord or null (D27) · file (JSON by default, `text/markdown` with `format=md`, 400 for another format; R3E-11) · 204 | 13 |
| POST /extension/tokens · GET /extension/tokens · DELETE /extension/tokens/:id | user | apitokens.* | { label } | ApiTokenCreated · ApiToken[] · 204 | 13 |
| GET /extension/autofill-profile | bearer (scope autofill) | profile.getAutofillProfile | none | AutofillProfile | 14 |
| POST /extension/save-page | bearer (scope save_page; shared scholarships.local 10/day) | scholarships.submitLocalScholarship (also puts it on the board as `planned`; R2C-12) | SavePageInput | ScholarshipSummary | 14 |
| GET /dev/outbox/latest?to= | none, only when ENABLE_DEV_ROUTES=1 | db read | none | { subject, text } or 404 | 13 |
| GET /scholarships?q&state&local&renewable&minUsd&deadlineBefore&openOn&excludeScams&page&pageSize | optional | scholarships.searchScholarships | ScholarshipQuery (`pageSize` 1–50, default 20) | Page\<ScholarshipSummary\> | 14 |
| GET /scholarships/:idOrSlug | optional | scholarships.getScholarship | none | ScholarshipDetail | 14 |
| POST /scholarships/local · POST /scholarships/:idOrSlug/report | user (local shares scholarships.local 10/day) | submitLocalScholarship (also puts it on the board as `planned`; R2C-12) · getScholarship + reportListing (a slug resolves to the id) | LocalSubmissionInput · ReportInput | ScholarshipSummary · 204 | 14 |
| GET /matches | user | scholarships.listMatches | none | { matches, privateCount } | 14 |
| GET /scholarship-applications · POST /scholarship-applications · PATCH /scholarship-applications/:id | user | getBoard · saveScholarship · updateApplication | { scholarshipId } · ApplicationPatch | Board · ScholarshipApplication | 14 |
| GET /colleges?q&state&control&page · GET /colleges/:id | user | colleges.searchColleges · getCollege | CollegeQuery | Page\<CollegeSummary\> · College | 14 |
| GET /college-list · POST /college-list · PATCH /college-list/:id · DELETE /college-list/:id | user | colleges.* | CollegeListInput · CollegeListPatch | CollegeListEntry[] · CollegeListEntry · 204 | 14 |
| GET /college-list/:id/items · PATCH /application-items/:id | user | listApplicationItems · updateApplicationItem | ApplicationItemPatch | ApplicationItem[] · ApplicationItem | 14 |
| POST /college-list/archive-season | user | colleges.archiveSeason | none | { archived } | 14 |
| GET /recommenders · POST /recommenders · POST /recommenders/requests | user | colleges.* | RecommenderInput · RecRequestInput | Recommender[] · Recommender · RecRequest | 14 |
| GET /recommendations | user | colleges.listRecRequests | none | RecRequest[] (own, newest first, with helperLinkId; D33) | 14 |
| PATCH /recommendations/:id | user | colleges.updateRecRequest | RecRequestPatch | RecRequest | 14 |
| GET /essays · POST /essays · GET /essays/:id · PATCH /essays/:id | user | essays.* (PATCH is updateEssay) | EssayInput · EssayPatch | Essay[] · Essay · EssayWithBody · Essay | 14 |
| POST /essays/:id/versions · GET /essays/:id/versions | user | saveVersion · listVersions | SaveVersionInput | EssayVersion · EssayVersion[] | 14 |
| POST /essays/:id/review · GET /essays/:id/comments · POST /essay-comments/:id/resolve | user (review counts toward allowance) | requestReview · listComments · resolveComment | none | CrewJob · EssayComment[] · 204 | 14 |
| GET /stories · POST /stories · PATCH /stories/:id · DELETE /stories/:id | user | essays.listStories · createStory · updateStory · archiveStory | StoryInput · StoryPatch | Story[] · Story · 204 | 14 |
| POST /stories/link · POST /stories/reuse-check | user | linkStory · checkStoryReuse | LinkStoryInput · { storyId, collegeId?, scholarshipId? } | StoryUse · StoryReuseCheck | 14 |
| GET /test-scores · POST /test-scores · DELETE /test-scores/:id · GET /prep/superscores | user | prep.* | TestScoreInput | TestScore[] · TestScore · 204 · Superscore[] | 14 |
| POST /prep/retake · POST /prep/study-plan | user | requestRetakeAnalysis · acceptStudyPlan | RetakeAnalysisInput · { sessions } | CrewJob · PlanItem[] | 14 |
| GET /service-logs · POST /service-logs · PATCH /service-logs/:id · DELETE /service-logs/:id · POST /service-logs/:id/verify | user | impact.* | ServiceLogInput · ServiceLogPatch | ServiceLog[] · ServiceLog · 204 | 14 |
| GET /verify-hours/:token · POST /verify-hours/:token | none (rate 10/hour per IP) | getVerificationRequest · submitVerification | VerificationSubmitInput | VerificationRequestView · 204 | 14 |
| GET /activities · PUT /activities · DELETE /activities/:id · GET /service-logs/progress | user | impact.* | ActivityInput | Activity[] · Activity · 204 · RequirementProgress[] | 14 |
| GET /costs · PUT /costs/calculator | user | money.getCosts · setCalculatorResult | CalculatorResultInput | CostSummary[] · CostSummary | 14 |
| GET /offers · POST /offers · GET /offers/:id · POST /offers/:id/confirm · GET /offers/compare · POST /offers/:id/appeal · GET /offers/:id/loans | user | money.* | CreateOfferInput | OfferWithLines[] · OfferWithLines (every Offer carries `parseJobId`; D31) · OfferComparison · CrewJob · LoanEstimate[] | 14 |
| DELETE /offers/:id | user | money.deleteOffer | none | 204 (409 `conflict` for a confirmed offer; R2P-8) | 14 |
| PATCH /offer-lines/:id | user | money.updateOfferLine | OfferLinePatch | OfferLine | 14 |
| POST /public/offer-tool | none (rate 30/hour per IP) | money.publicOfferTool | PublicOfferInput | OfferComparison | 14 |
| GET /aid/checklists · PATCH /aid/items/:id · GET /aid/deadlines | user | aid.getAidChecklists · updateAidItem · listAidDeadlines | AidChecklistPatch | AidChecklist[] · AidChecklistItem · AidDeadline[] | 14 |
| GET /plan/this-week · GET /plan?week= · POST /plan-items · PATCH /plan-items/:id · POST /plan/regenerate | user (regenerate counts toward the allowance; the Monday `plan.weekly.fanout` plans don't) | plan.* | PlanItemInput · PlanItemPatch | ThisWeekView · WeekPlan · PlanItem · CrewJob | 14 |
| GET /conversations · POST /conversations · GET /conversations/:id/messages?before=&limit= · POST /conversations/:id/messages | user (normal sends 30/10min; crisis before limits) | crew.* | ConversationInput · SendMessageInput | Conversation[] · Conversation · Message[] · { message, job } | 14 |
| GET /jobs?active&limit | user | crew.listJobs | query `active` (stringbool), `limit` 1..50 | CrewJob[] (own, newest first; D28) | 14 |
| GET /jobs/:id · GET /jobs/:id/events (SSE) | user | crew.getJob | none | CrewJob · `text/event-stream` | 14 |
| POST /actions/apply | user | crew.applyActionCard | ApplyActionInput | ActionReceipt (409 `conflict` while another apply of the card is running; 400 for memory cards in temporary rooms) | 14 |
| GET /admin/catalog-tasks · GET /admin/catalog-tasks/:id · POST /admin/catalog-tasks/:id/resolve | admin | listCatalogTasks · getCatalogTask (D36) · resolveCatalogTask | CatalogTaskResolution | CatalogTask[] · CatalogTask · CatalogTask | 14 |
| GET /admin/scholarships?status&q&page · GET /admin/scholarships/:id | admin | admin.listScholarships · getScholarshipForAdmin (any status; D36) | query | Page\<Scholarship\> (50 per page) · Scholarship | 14 |
| POST /admin/scholarships · PATCH /admin/scholarships/:id · POST /admin/scholarships/:id/status | admin | upsertScholarship · setScholarshipStatus | ScholarshipUpsertInput · { status, note } | Scholarship | 14 |
| GET /admin/reports · POST /admin/reports/:id/resolve | admin | listReports · resolveReport | { status, note } | CatalogReport[] · CatalogReport | 14 |
| POST /admin/colleges/import (text/csv body) | admin | catalog.parseScorecardCsvWithErrors + admin.importColleges (import errors remapped through `lines` to CSV line numbers; R2C-13) | CSV | ImportResult | 14 |
| GET /admin/audit | admin | admin.searchAudit | AuditQuery | Page\<AuditEvent\> | 14 |
| POST /admin/research | admin | admin.enqueueResearch | { state, county? } | 204 | 14 |
| GET /admin/aid-rules?awardYear · PUT /admin/aid-rules · GET /admin/aid-deadlines?awardYear · PUT /admin/aid-deadlines · DELETE /admin/aid-deadlines/:id | admin | admin.listAidRules · upsertAidRule · listAidDeadlinesForAdmin · upsertAidDeadline · deleteAidDeadline | AidRuleInput · AidDeadlineInput | AidRule[] · AidRule · AidDeadline[] · AidDeadline · 204 | 14 |
| GET /helper-view/:token | none (rate 60/hour per IP) | helpers.resolveHelperToken + helperview.getHelperView | none | HelperView or 404 | 14 |

SSE format for `/jobs/:id/events`: the handler polls `crew.getJob` every 1000 ms for up to 130 s and writes `event: job\ndata: <CrewJob JSON>\n\n` whenever `status` or `progress.length` changes, then `event: end\ndata: {}\n\n` on a terminal status (`ready`, `needs_input`, `failed`) or timeout. While nothing changes, the stream writes a `: ping` comment every 15 s; `EventSource` ignores it. The response sets `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, and `X-Accel-Buffering: no`, and sends no `Content-Encoding` (R3E-1, R3E-2).

## 11. Pages (contract for plans 16, 17, 18)

| Route | Screen | Plan | Mockup |
|---|---|---|---|
| `/week` | This Week (desktop; phone layout in `19_Mobile_This_Week.png`); students also get "Plan my week" (R2C-5) | 16 | `design/mockups/screens/01_This_Week.png` |
| `/crew`, `/crew/[conversationId]` | Crew chat | 16 | `02_Crew.png` |
| `/onboarding` | Onboarding steps | 16 | `09_Onboarding.png` |
| `/settings` | Account, notifications, billing, extension tokens | 16 | `13_Settings.png` |
| `/memory` | What your crew remembers | 16 | `07_Memory.png` |
| `/family` | Family | 16 | `08_Family.png` |
| `/scholarships`, `/scholarships/[slug]` | Board and detail | 17 | `03_Scholarships.png`, `10_Scholarship_Detail.png` |
| `/essays`, `/essays/[id]`, `/essays/stories` | Essay list, Essay Studio, Story Bank | 17 | `04_Essay_Studio.png` |
| `/colleges`, `/colleges/[entryId]` | College list and detail | 17 | `05_Colleges.png` |
| `/money`, `/money/offers`, `/money/offers/[id]` | Costs, compare offers, offer review | 17 | `06_Compare_Offers.png` |
| `/prep` | Test plan | 17 | `11_Prep.png` |
| `/impact` | Service hours and activities | 17 | `12_Impact.png` |
| `/` | Landing | 18 | `15_Landing.png` |
| `/directory`, `/directory/[state]`, `/directory/s/[slug]` | Public scholarship directory | 18 | `16_Directory.png` |
| `/offer-tool` | Public offer tool | 18 | — |
| `/privacy`, `/terms`, `/ai-policy` | Legal | 18 | — |
| `/sign-in`, `/sign-in/check-email` | Sign in | 18 | `14_Sign_In.png` |
| `/h/[token]` | Helper view | 18 | `17_Helper_View.png` |
| `/family/join` | Accept a family invite | 18 | — |
| `/verify-hours/[token]` | Supervisor confirmation | 18 | — |
| `/admin`, `/admin/tasks`, `/admin/scholarships`, `/admin/scholarships/new`, `/admin/scholarships/[id]`, `/admin/reports`, `/admin/colleges`, `/admin/aid`, `/admin/audit` | Admin console (`/admin/aid`: federal loan rates and aid deadlines per award year, R2P-1) | 18 | `18_Admin_Review.png` |

## 12. Feature coverage map

Every feature ID in `docs/product/features.md` maps to the plans that implement it. Reviewers use this table for the completeness rounds.

| Area | Features | Plans |
|---|---|---|
| ID | ID-01, ID-02 | 06 (auth), 13 (routes, middleware), 18 (sign-in pages) |
| ID | ID-03 | 06 (profile.completeOnboarding), 16 (onboarding step) |
| ID | ID-04 | 06 (access), 13 (route auth), 16/17/18 (page guards) |
| ID | ID-05 | 06 (account), 12 (purge job), 16 (settings) |
| ID | ID-06 | 13 (`route` origin check) |
| ON | ON-01..ON-06 | 06 (profile, documents), 07 (colleges), 08 (plan), 16 (onboarding), 12 (first sweep and plan jobs) |
| WK | WK-01..WK-06 | 08 (plan.getThisWeek, startWeeklyPlan), 04 (prioritize, deadlines), 05 (`plan.weekly.fanout` Monday schedule), 12 (`plan.weekly.fanout` handler), 16 (week screen, Plan my week) |
| CR | CR-01..CR-07, CR-10, CR-11 | 08 (crew), 06 (billing allowance), 09 (runtime, guards), 10 (specialists), 12 (crew.request), 14 (routes, SSE), 16 (crew screen) |
| CR | CR-08 | 08 (crew rooms), 09 (snapshot by room, `roomRef` in consult questions), 10 (Scout and Atlas look up the named id first), 12 (port snapshot by room), 17 (context panels) |
| CR | CR-09 | 09 (detectCrisis, CRISIS_REPLY), 12 |
| SC | SC-01..SC-11 | 04 (matcher, scams, ranking), 07 (scholarships), 12 (sweep), 14, 17 |
| ES | ES-01..ES-09 | 04 (limits), 07 (essays), 09 (integrity guard), 10 (Quill), 12 (essay.review), 14, 17 |
| CO | CO-01..CO-08 | 07 (colleges), 10 (Atlas), 14, 17, 11 (CSV import) |
| MO | MO-01..MO-11 | 03 (sample loan-rate seed), 04 (Ledger), 08 (money, admin aid rules), 09 (Ledger calculator tools), 10 (runOfferParse, runAppealOutline, Aid), 12 (offer.parse, appeal.outline), 14 (incl. admin aid routes), 17, 18 (offer tool, `/admin/aid`) |
| AID | AID-01..AID-05 | 03 (sample aid deadline seed), 08 (aid, admin aid deadlines), 10 (Aid), 14 (incl. admin aid routes), 17, 18 (`/admin/aid`) |
| PR | PR-01..PR-05 | 04 (superscore, retake), 07 (prep), 10 (Prep), 12 (prep.retake), 14, 17 |
| IM | IM-01..IM-06 | 04 (limits), 07 (impact), 10 (Impact), 14, 17, 18 (verify-hours page) |
| ME | ME-01..ME-09 | 06 (memory, account), 07 (colleges.archiveSeason), 16 (memory screen) |
| FA | FA-01..FA-07 | 06 (family, access), 08 (crew family room, aid-linked family tasks, `review_costs` tasks), 09 and 12 (parent requester in family rooms, D42), 16 (family screen), 18 (join page), 19 (family privacy evals) |
| HL | HL-01..HL-04 | 06 (helpers), 07 (helperview), 13/14 (routes), 16 (helper links in settings), 18 (helper view page) |
| NO | NO-01..NO-05 | 03 (`notifications.smsSentAt`), 06 (notifications, deliverSms), 08 (plan digest and reminders), 12 (jobs; `notify.sms` with Twilio for NO-05), 16 (bell, settings), 18 (privacy page names Twilio) |
| BI | BI-01..BI-05 | 06 (billing), 13 (routes, webhook), 16 (settings) |
| PU | PU-01..PU-04 | 07 (`searchScholarships` with `openOn`), 14 (public route), 18 |
| AD | AD-01..AD-05 | 08 (admin), 11 (CSV), 14 (routes), 18 (admin pages) |
| CA | CA-01..CA-06 | 11 (pipeline), 12 (jobs), 08 (admin tasks; a rejected re-check restores a stale listing), 18 (review queue: submission drafts, keep or retire re-checks) |
| AG | AG-01..AG-07 | 09, 10, 08 (recordAgentRun), 06 (usage) |
| AG | AG-08 | 19 (evals) |
| SE | SE-01 | 06 (access), every core module, 19 (isolation tests) |
| SE | SE-02..SE-07 | 06 (crypto, audit, ratelimit, account), 13/14 (rate limits on routes), 15/16/18 (no trackers; no third-party assets), 09 (wrapUntrusted), 12 (purge) |
| EX | EX-01, EX-02 | 06 (apitokens, getAutofillProfile), 07 (a saved page lands on the board as planned), 13 (token routes), 14 (extension data routes), 16 (token settings), 20 |

## 13. Verification suite

At each phase boundary run the owning plans' package gates and the milestone checks below for packages that now exist. Run the full suite only after phase 10. Every applicable command must exit 0; do not claim a skipped future check passed.

```bash
pnpm install
docker compose up -d db
pnpm db:wait
pnpm db:migrate          # dev database
pnpm db:migrate:test     # test database
pnpm lint                # biome check .  → "Checked N files ... No fixes applied." and no errors
pnpm typecheck           # turbo run typecheck → every package "tsc --noEmit" passes
pnpm test                # turbo run test --concurrency=1 → every package "vitest run" passes, 0 failed
pnpm --filter @scholarcrew/web build     # next build completes (from phase 9 on)
pnpm --filter @scholarcrew/extension build   # writes apps/extension/dist with manifest.json (from phase 9 on)
pnpm e2e                 # playwright test → all passed (phase 10 on)
```

Milestone availability:

| Completed phase | Additional applicable checks |
|---|---|
| 1–2 | install, lint, typecheck, and unit tests for completed packages; DB up/wait from phase 1 |
| 3 | DB generate/migrate/migrate:test and database/engine/UI gates |
| 4–7 | Completed package gates plus root typecheck/test; UI tests use API fakes |
| 8 | API/worker/shell integration checks; web build waits until root/public routes in 18 exist |
| 9 | Production web and extension builds; production CSP/hydration and SSE checks |
| 10 | Full E2E and scripted eval checks; run real-model safety evals before release |

Plans add their own package-scoped gates in their Success Criteria sections. Fixed test counts are a planning aid; assertions and zero failures are the gate, and the implementer records actual discovered totals.


## 14. Library notes

Plans are written without network access to package registries, so these notes pin the API shapes every plan uses. If an installed version differs, fix the call site in the owning plan's files and note it in that plan's commit; don't change the contract.

**Drizzle 0.44 with postgres-js**

```ts
import { pgTable, pgEnum, uuid, text, integer, boolean, timestamp, date, jsonb, primaryKey, index,
  uniqueIndex, unique, customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const roleEnum = pgEnum("role_enum", ["student", "parent", "admin"]);
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("users_created_idx").on(t.createdAt)]);
// date columns: date("due_on", { mode: "string" }); arrays: text("themes").array().notNull().default(sql`'{}'::text[]`)
// jsonb: jsonb("eligibility").$type<EligibilityRule[]>().notNull().default(sql`'[]'::jsonb`)
// fk: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" })
// composite pk: (t) => [primaryKey({ columns: [t.ownerId, t.kind] })]
// nulls-not-distinct unique: (t) => [unique("aid_items_uq").on(t.ownerId, t.awardYear, t.program, t.key, t.collegeId).nullsNotDistinct()]
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
const client = postgres(url, { max: 10 });
const db = drizzle(client, { schema });
import { migrate } from "drizzle-orm/postgres-js/migrator";
await migrate(db, { migrationsFolder });
// queries
await db.select().from(t).where(and(eq(t.ownerId, id), isNull(t.archivedAt))).orderBy(desc(t.createdAt)).limit(20);
await db.select({ n: count() }).from(t).where(eq(t.ownerId, id));
await db.insert(t).values(v).returning();
await db.insert(t).values(v).onConflictDoUpdate({ target: [t.ownerId, t.kind], set: { enabled: v.enabled } }).returning();
await db.insert(t).values(v).onConflictDoNothing({ target: t.dedupeKey }).returning();   // [] when it already existed
await db.update(t).set(p).where(eq(t.id, id)).returning();
await db.delete(t).where(eq(t.id, id));
await db.transaction(async (tx) => { /* use tx like db */ });
```

`drizzle.config.ts` (drizzle-kit 0.31): `export default defineConfig({ dialect: "postgresql", schema: "./src/schema/index.ts", out: "./drizzle", dbCredentials: { url: process.env.DATABASE_URL! } })`. Generate with `drizzle-kit generate`.

**pg-boss 10**

```ts
import PgBoss from "pg-boss";
const boss = new PgBoss({ connectionString: url, schema: "pgboss" });
boss.on("error", (e) => console.error(JSON.stringify({ level: "error", msg: "pgboss", error: errorLabel(e) })));
await boss.start();
await boss.createQueue("crew.request");                 // required before send/work
const id = await boss.send("crew.request", { jobId }, { singletonKey, startAfter: 30, retryLimit: 2, retryDelay: 30, expireInSeconds: QUEUE_EXPIRE_SECONDS["crew.request"] });
await boss.work("crew.request", { batchSize: 1 }, async ([job]) => { /* job.id, job.data */ });   // handler gets an array
await boss.schedule("sweep.weekly", "0 14 * * 0", {}, { tz: "UTC" });
await boss.stop({ graceful: true, timeout: 30_000 });
```

The web app only sends jobs; it calls `boss.start()` once per process with `supervise: false, schedule: false` options so it never runs maintenance or cron.

**Next.js 15 (app router)**

- Route handler: `export async function GET(req: Request, ctx: { params: Promise<{ id: string }> })`. Params are a promise.
- Page: `export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> })`.
- `import { cookies, headers } from "next/headers"; const store = await cookies(); store.get("sc_session")?.value`.
- `import { redirect, notFound } from "next/navigation"`. Client components: `"use client"`, `useRouter().refresh()`.
- `src/middleware.ts` runs on the edge runtime: no Node APIs, no DB. It issues a request nonce and forwards CSP and `x-nonce` on request headers, sends CSP on responses, and checks cookie presence. Page and route handlers validate the actual session. Nonce-bearing pages render dynamically, including public pages; never cache their HTML across requests. Validate nonce hydration under `next start` on public, authenticated, and admin pages.
- `next.config.ts`: `const config: NextConfig = { transpilePackages: ["@scholarcrew/ui", "@scholarcrew/domain", "@scholarcrew/core", "@scholarcrew/engines", "@scholarcrew/jobs", "@scholarcrew/db", "@scholarcrew/catalog", "@scholarcrew/agents"], serverExternalPackages: ["pg-boss", "postgres"] }`.
- CSS Modules: `import styles from "./Card.module.css"`.
- Route handlers are unit-tested by importing `GET`/`POST` and calling them with `new Request("http://localhost:3000/api/v1/...", init)` and `{ params: Promise.resolve({ id }) }`. They read the session cookie from `req.headers.get("cookie")`, not from `next/headers`, so they run under plain Vitest.
- SSE sends `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`, and a `: ping` every 15 s. At execution, verify events arrive unbuffered under `next start`.

**Vitest 3**

`defineConfig({ test: { include: ["src/**/*.test.ts"], environment: "node", globalSetup: ["./test/global-setup.ts"], setupFiles: ["./test/setup.ts"], fileParallelism: false, testTimeout: 20_000 } })`. UI tests use `environment: "jsdom"` and `@testing-library/react`.

**Biome 1.9.4** (`biome.json`)

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignore": ["**/drizzle/**", "**/.next/**", "**/dist/**", "design/**", "plans/**", "docs/**"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 120 },
  "organizeImports": { "enabled": true },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "double", "trailingCommas": "all", "semicolons": "always" } }
}
```

**Turbo 2** (`turbo.json`): `{ "$schema": "https://turbo.build/schema.json", "tasks": { "build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] }, "typecheck": {}, "test": { "cache": false }, "lint": {} } }`.

**Anthropic TypeScript SDK 0.110** (only `packages/agents/src/model/**` (plan 09) and `packages/catalog/src/anthropic.ts` (plan 11) import it)

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey, timeout: MODEL_TIMEOUT_MS, maxRetries: MODEL_MAX_RETRIES, fetch: boundedRetryFetch() });
type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming & { fallbacks: "default" };
const params: Params = {
  model: "claude-opus-5-5",
  max_tokens: 16000,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  system: [{ type: "text", text: stableSystemPrompt, cache_control: { type: "ephemeral" } }],
  messages,                                         // Anthropic.Beta.BetaMessageParam[]
  tools: [{ name, description, input_schema, strict: true }],
  output_config: { effort: "medium" },              // add format: { type: "json_schema", schema } for extraction calls without tools
};
const res = await client.beta.messages.create(params);
// res.stop_reason: "end_turn" | "tool_use" | "max_tokens" | "pause_turn" | "refusal" | ...
// res.content: Anthropic.Beta.BetaContentBlock[]; narrow by block.type ("text", "tool_use", "thinking", "fallback", server tool blocks)
// res.usage: input_tokens, output_tokens, cache_read_input_tokens (nullable), cache_creation_input_tokens (nullable)
```

- No `thinking` parameter (Opus 5.5 always thinks; sending `disabled` or `budget_tokens` is a 400). No `tool_choice` other than the default `auto`. No assistant prefill.
- Tool loop: append `{ role: "assistant", content: res.content }` then `{ role: "user", content: toolResults }` with one `tool_result` per `tool_use` (`{ type: "tool_result", tool_use_id, content: JSON.stringify(result), is_error? }`). Never edit or delete earlier messages. On `pause_turn`, append the assistant content and call again.
- Strict tools need `additionalProperties: false` and every property in `required`; `toStrictJsonSchema` (plan 09) post-processes `z.toJSONSchema(schema)` to guarantee that and drops `$schema`. Submit tools (`submit_reply`, `submit_plan`, `submit_result`, `submit_comments`) are sent without `strict` and validated in code (§9.5); every other tool is strict.
- Verify strict-mode schema limits against current Anthropic docs at execution. The plan assumes at most 16 union-typed (`anyOf` or type-array) parameters across a request's strict schemas, and 09's `strictBudget.test.ts` enforces it (10's definitions and offer-parse tests and 11's extraction test check their own requests). If the documented limit differs, change `STRICT_UNION_LIMIT` in 09 `model/schema.ts` and rerun those tests.
- PDF input: `{ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title }`.
- Server tools for catalog research: `{ type: "web_search_20260209", name: "web_search", allowed_callers: ["direct"], max_uses: 8, allowed_domains? }`, `{ type: "web_fetch_20260209", name: "web_fetch", allowed_callers: ["direct"], max_uses: 8, max_content_tokens: 20000, allowed_domains? }`.
- Batches (no `fallbacks` here, it's rejected): `client.messages.batches.create({ requests: [{ custom_id, params: { model, max_tokens, system, messages, output_config } }] })`, `client.messages.batches.retrieve(id)` (`processing_status === "ended"`), `for await (const r of await client.messages.batches.results(id))` with `r.result.type === "succeeded"` → `r.result.message`.
- Errors: `Anthropic.RateLimitError`, `Anthropic.APIError` (has `status`). Never match on message text.
- Pricing for `costMicros`: input 4, output 20, cache read 0.2, cache write 5 micro-dollars per token.

### Integration rules from round 4

- `QUEUE_EXPIRE_SECONDS` is 1,200 for crew.request and plan.weekly, 2,400 for catalog.research, and 900 otherwise; `JOB_KIND_QUEUE` maps the six user job kinds. Each expiry must exceed the calculated worst case by 120 seconds (12 expiry.test.ts). Model constants are `MODEL_TIMEOUT_MS = 120_000`, `MODEL_MAX_RETRIES = 1`, and `MODEL_MAX_RETRY_WAIT_MS = 60_000`.
- Crisis detection lives in domain and is re-exported by agents. Core answers crisis messages before rate or allowance checks, inserting a ready, zero-cost job without queueing specialists. URL parameters only prefill the composer.
- Family replies persist their used share categories; revoked categories produce a stub for non-owners and are omitted from model history. Private sensitive matches never enter model tools or snapshots; only their count does. Net-price numbers retain the documented income inference risk.
- Shared dates/log helpers include `safeTimeZone`, `nextMonthStartUtc`, and `errorLabel`; model tools include Quill-only `get_story`. `safeHref` and `internalHref` belong to 16 lib/format and are reused by 17/18.
- `boundedRetryFetch` clamps provider retry waits to 60 seconds, including date-valued Retry-After; the pinned SDK otherwise accepts unbounded date waits. Catalog server tools explicitly set `allowed_callers: ["direct"]`.
- Verify SDK timeout/retry semantics and catalog `web_fetch` allowed_domains/max_content_tokens against the provider documentation when installing pinned dependencies. Production rejects placeholder keys and missing Resend configuration.

## 15. Status

| Plan | Status |
|---|---|
| 01 | reviewed through round 5; ready to implement |
| 02 | reviewed through round 5; ready to implement |
| 03 | reviewed through round 5; ready to implement |
| 04 | reviewed through round 5; ready to implement |
| 05 | reviewed through round 5; ready to implement |
| 06 | reviewed through round 5; ready to implement |
| 07 | reviewed through round 5; ready to implement |
| 08 | reviewed through round 5; ready to implement |
| 09 | reviewed through round 5; ready to implement |
| 10 | reviewed through round 5; ready to implement |
| 11 | reviewed through round 5; ready to implement |
| 12 | reviewed through round 5; ready to implement |
| 13 | reviewed through round 5; ready to implement |
| 14 | reviewed through round 5; ready to implement |
| 15 | reviewed through round 5; ready to implement |
| 16 | reviewed through round 5; ready to implement |
| 17 | reviewed through round 5; ready to implement |
| 18 | reviewed through round 5; ready to implement |
| 19 | reviewed through round 5; ready to implement |
| 20 | reviewed through round 5; ready to implement |
| 21 | reviewed through round 5; ready to implement |
