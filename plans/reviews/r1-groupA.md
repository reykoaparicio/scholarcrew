# Review round 1, group A (plans 01, 02, 03, 05)

Focus: data flow and compile-level correctness. Reviewed in full: 00-overview, 21 §1–3, review-log, 01, 02, 03, 05. Consumers in 04–20 were checked by grep for every name these plans export.

## What I checked by script (no defects unless listed below)

- Every `import { … } from "@scholarcrew/domain"` in plans 03–20 resolves to one of the 289 names 02 exports.
- Every import from `@scholarcrew/db`, `@scholarcrew/db/testing`, `@scholarcrew/db/seed`, and `@scholarcrew/jobs` resolves to a name those plans export. The only miss is `exportsTable` (see 03-H1).
- 03 tables vs §8: all 59 tables, every column name, every index and unique. 03 pg enums vs §8 and vs the 02 Zod enums: all 49 match value-for-value and in order.
- Every `<table>.<column>` reference and all 259 `.insert(t).values({…})` / `.update(t).set({…})` sites in 04–20: no unknown columns.
- Every `jobs.enqueue(name, payload)` in 06–14 matches `JobPayloadSchemas[name]` keys. The `sent` assertions that include `opts` (06 notify, 12 catalog.extract) match 05's `{ name, payload, opts }`.
- Every literal UUID in the plans passes Zod 4 `z.uuid()` (RFC version and variant nibbles).
- `process.env` reads in 02–20 only use §4 keys, plus `NODE_ENV` (03, 13) and `VITEST` (13).
- No plan outside the group creates or modifies files under `packages/domain|db|jobs`, `scripts/`, `.github/`, or the root config files.

---

## 03-database.md

### 03-H1 (high): the exports table is exported as `exports`, not `exportsTable` (review-log D3, still open)

- Location: rules line 9 ("The `exports` table is declared as `exportsTable` and exported under the name `exports`"). Also C4 `ops.ts`: `const exportsTable = pgTable("exports", …)` and `export { exportsTable as exports };`, and the Review Checklist's last item.
- Detail: §8 now says the TypeScript name is `exportsTable` ("never import a binding named `exports`"). 16-web-shell-core line 8236 has `import { desc, documents, eq, exportsTable } from "@scholarcrew/db"`, which fails to compile against 03 as written. 06 works around it with `exports as exportsTable` (06 lines 12, 5824, 6080, 6212, 6403–6404).
- Fix: in `ops.ts`, write `export const exportsTable = pgTable("exports", { … });` and delete the alias line and its comment. Change rule line 9 to "The `exports` table is exported as `exportsTable`; no module declares or imports a binding named `exports`." Nothing else in 03 changes: `TABLE_NAMES` uses `getTableName`, so `resetDb` and the seed are unaffected. Consumer follow-up: in 06, replace every `exports as exportsTable,` with `exportsTable,` and drop the D3 note at lines 12 and 6403–6404.

### 03-M1 (medium): `offers` has no `archivedAt` (review-log D1, still open)

- Location: C4 `pipeline.ts`, `export const offers = pgTable("offers", { … confirmedAt: ts("confirmed_at") })`.
- Detail: ME-07 (New season) archives offers, and D1 says to add `archivedAt ts?`. Neither 03 nor §8 has the column. 07 `archiveSeason` and 08 `listOffers`/`compareMyOffers` can't filter archived offers until it exists.
- Fix: add `archivedAt: ts("archived_at"),` after `confirmedAt` in `offers`. Add `· archivedAt ts?` to the §8 `offers` line in 00. C5 generates the only migration, so regenerating it before the C5 commit is enough. The `expected.ts` and test counts don't change. Follow-ups: 07 sets `offers.archivedAt` for the season's award year, and 08 filters `isNull(offers.archivedAt)`.

### 03-M2 (medium): db scripts crash without a `.env` file (review-log D12, still open)

- Location: C1 `packages/db/package.json`: `"migrate": "tsx --env-file=../../.env src/cli/migrate.ts"`, plus `migrate:test` and `seed`.
- Detail: §3 now requires `--env-file-if-exists`. With the current flag, `pnpm db:migrate` fails on any host that injects env vars and has no `.env` file.
- Fix: in all three scripts, replace `--env-file=../../.env` with `--env-file-if-exists=../../.env`.

---

## 05-jobs.md

### 05-H1 (high, verify against installed pg-boss): `singletonKey` alone probably doesn't dedupe on pg-boss 10 "standard" queues

- Location: E4 `pgboss.integration.test.ts`: `expect(await jobs.enqueue("sweep.student", { studentId }, { singletonKey })).toBeNull();`. Also the consumer note "It returns `null` when pg-boss drops a duplicate `singletonKey`", and `queues.ts`, which calls `boss.createQueue(name)` with the default policy.
- Detail: pg-boss 10 moved deduplication into queue policies. As far as I can tell, its unique indexes are partial on `policy = 'short' | 'singleton' | 'stately'` (key `COALESCE(singleton_key,'')`), plus a throttle index that only applies when `singleton_on IS NOT NULL`, meaning `singletonSeconds` is set. On a default (`standard`) queue, a second send with the same `singletonKey` and no `singletonSeconds` would return a new id. That would fail the E4 test (the gate goes red) and break the contract that 12 relies on (`catalog.extract` keyed by `taskId`). The policy indexes also treat a null key as `''`, so putting every queue on `short` would collapse unrelated unkeyed jobs (for example `notify.email`) into one.
- Fix:
  1. Confirm the behavior against the installed pg-boss 10.x at E4 Step 5.
  2. If it holds, add `const QUEUE_POLICIES: Partial<Record<JobName, "short">> = { "catalog.extract": "short" };` to `queues.ts` and call `boss.createQueue(name, { name, policy: QUEUE_POLICIES[name] ?? "standard" })`.
  3. In `client.ts`, throw `AppError("invalid_input")` when `opts.singletonKey` is missing for a `short` queue, so unkeyed sends can't collide.
  4. Point the E4 dedupe test at `catalog.extract` (`{ taskId }`) instead of `sweep.student`, and keep the different-key case.
  5. Reword the consumer note: "`null` means a job with the same key is already queued (only on queues listed in `QUEUE_POLICIES`)."
  6. Tell 07 (D18: its `submitLocalScholarship` enqueue of `catalog.extract`) to pass `singletonKey: \`catalog.extract:${taskId}\``.

---

## 01-foundation.md

### 01-M1 (medium): scripts package uses `--env-file` (review-log D12, still open)

- Location: A4 `scripts/package.json`: `"check-env": "tsx --env-file=../.env src/check-env-cli.ts"` and `"wait-for-db": "tsx --env-file=../.env src/wait-for-db.ts"`. Also A6 README: "The scripts load it with Node's `--env-file` flag, which fails when the file is missing." Also A7 CI step "Create .env for scripts that pass --env-file".
- Fix: change both scripts to `--env-file-if-exists=../.env`. Change the README sentence to "The scripts load it with Node's `--env-file-if-exists` flag, so hosts that inject env vars without a `.env` file still work." The CI `cp .env.example .env` steps can stay; renaming them to "Create .env for local-style scripts" is optional.

### 01-M2 (medium): `checkEnv` always requires `TEST_DATABASE_URL` (review-log D12, still open)

- Location: A4 `check-env.ts`: `const REQUIRED = ["DATABASE_URL", "TEST_DATABASE_URL", "APP_URL", "ENCRYPTION_KEY"] as const;`
- Detail: production hosts have no test database, so `check-env` fails there.
- Fix: replace the `REQUIRED` filter with this:
  ```ts
  const required = env.NODE_ENV === "production" ? REQUIRED.filter((k) => k !== "TEST_DATABASE_URL") : REQUIRED;
  const missing: string[] = required.filter((name) => !present(env[name]));
  ```
  Add a test: `expect(checkEnv({ ...valid, TEST_DATABASE_URL: undefined, NODE_ENV: "production" })).toEqual({ ok: true, missing: [], problems: [] })`. Then bump the counts in 01-L1 by one more test.

### 01-L1 (low): expected test counts are off by one from A4 on

- Location: A4 Step 5: "`Tests 12 passed (12)`". A5 Step 4: "`Tests 17 passed (17)`". A7 Step 2: "`Tests 1 failed | 17 passed (18)`". A7 Step 4, Success Criteria, and Testing Requirements: "18 tests". Testing Requirements: "`repo-config.test.ts` (3)".
- Detail: check-env has 10 tests and the A4 repo-config has 3, so A4 is 13. retry adds 5, so A5 is 18. A7 adds the CI test, so repo-config has 4 and the total is 19.
- Fix: A4 → 13. A5 → 18. A7 Step 2 → `1 failed | 18 passed (19)`. A7 Step 4, Success Criteria, and Testing Requirements → 19 tests. Testing Requirements → `repo-config.test.ts` (4). Add one more everywhere if the 01-M2 test goes in.

---

## 02-domain.md

### 02-M1 (medium): `timeZone` accepts any string, and a bad zone later throws in every date calculation

- Location: B4 `ProfilePatch.timeZone: z.string().min(3).max(60).optional()` and `OnboardingInput.timeZone: z.string().min(3).max(60).default("America/Chicago")`.
- Detail: the stored zone feeds `weekStartFor`, `daysUntil`, and `reminderOffsetsDue` (04), which use `Intl`. Saving `"Mars/Base"` through `PATCH /profile` makes `/week`, digests, and reminders throw `RangeError` (500) for that user from then on.
- Fix: in `common.ts`, add
  ```ts
  export const TimeZone = z.string().min(3).max(60).refine((tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } }, "Unknown time zone");
  ```
  Then use `TimeZone.optional()` in `ProfilePatch` and `TimeZone.default("America/Chicago")` in `OnboardingInput`. Add a `profile.test.ts` case where `{ ...valid, timeZone: "Mars/Base" }` fails, and bump the B4 count to 6.

### 02-L1 (low): B5 test count

- Location: B5 Step 4: "PASS (impact file 7 tests added)".
- Detail: `impact.test.ts` has 6 tests (ActivityInput 2, ServiceLogInput 1, TestScoreInput 1, essay inputs 2).
- Fix: change it to "6 tests added".

### 02-L2 (low): test file count

- Location: Testing Requirements: "Expected: 9 test files".
- Detail: there are 10 test files: common, memory, family, scholarships, profile, impact, money, crew, catalog, and jobs.
- Fix: change it to "10 test files".

### 02-L3 (low): the import-order line doesn't match the code

- Location: "File import order (no cycles): … ← `colleges` (memory, scholarships) … ← `crew` (plan, essays, memory, colleges) … ← `jobs` (prep)".
- Detail: `colleges.ts` imports only `common` and `scholarships`. `crew.ts` also imports `money` and `scholarships`. `jobs.ts` imports only `common`. There's no cycle, but the checklist item "No file imports from a file later in the import order" is checked against this line.
- Fix: change it to `colleges` (scholarships), `crew` (colleges, essays, memory, money, plan, scholarships), and `jobs` (common).

---

## 00-overview.md (contract text, raised by group A plans)

### 00-L1 (low): §9.3 doesn't show the accepted D6 extensions

- Location: §9.3: `export function createPgBoss(url: string): PgBoss;` and `createMemoryJobsClient(): JobsClient & { sent: Array<{ name: JobName; payload: unknown }> }`.
- Detail: 05 (D6, accepted) adds `opts?: { role?: "worker" | "sender"; schema?: string }`, `sent[].opts`, and `clear()`. 13 calls `createPgBoss(url, { role: "sender" })`, and 08 and 12 call `jobs.clear()`, so §9.3 as written doesn't cover what consumers use.
- Fix: change §9.3 to `createPgBoss(url: string, opts?: { role?: "worker" | "sender"; schema?: string }): PgBoss` and `createMemoryJobsClient(): JobsClient & { sent: Array<{ name: JobName; payload: unknown; opts: { singletonKey?: string; startAfterSeconds?: number } | undefined }>; clear(): void }`.

---

## Consumer mismatches (names a consumer uses that group A doesn't export)

| Consumer | Location | Name used | Plan that should change |
|---|---|---|---|
| 16-web-shell-core | line 8236, `src/lib/owned.ts` | `exportsTable` from `@scholarcrew/db` | 03 (03-H1). 06 then drops its alias. `owned.ts` itself is due for deletion under D27. |

No other mismatches found.

## Review-log D-items that apply to group A

| D-item | Plan | Status | Issue above |
|---|---|---|---|
| D1 | 03 | Open: `offers` has no `archivedAt` | 03-M1 |
| D3 | 03 | Open: still exported as `exports` | 03-H1 |
| D6 | 05 | Accepted, nothing to change in 05; §9.3 text not updated | 00-L1 |
| D12 | 01 | Open: `--env-file`, and `TEST_DATABASE_URL` is always required | 01-M1, 01-M2 |
| D12 | 03 | Open: `--env-file` in migrate, migrate:test, seed | 03-M2 |

## Counts

| Plan | High | Medium | Low |
|---|---|---|---|
| 01 | 0 | 2 | 1 |
| 02 | 0 | 1 | 3 |
| 03 | 1 | 2 | 0 |
| 05 | 1 | 0 | 0 |
| 00 (contract text) | 0 | 0 | 1 |
