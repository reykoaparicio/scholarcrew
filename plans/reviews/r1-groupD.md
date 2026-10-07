# Review round 1, group D (plans 13, 14)

Focus: contract and consistency. Read in full: 13-api-identity, 14-api-pipeline. Checked against 00-overview (§3, §9.1–9.7, §10, §12), 21 (§1–3), review-log D1–D35, docs/api/openapi.yaml (every path these plans own), and the producer plans by grep: 02-domain, 03-database, 05-jobs, 06/07/08 core, 11-catalog.

Severity: high = breaks the build or a contract; medium = wrong behavior or a real security gap; low = unclear, cosmetic, or a weak test/gate.

---

## 13-api-identity.md

### What I checked (no defect unless listed)

- Every import in 13 resolves to an exported name with a matching signature: domain (`AppError` with `status`/`details`, `isAppError`, `notFound`, `forbidden`, `unauthenticated`, `invalidInput`, `userActor`, `systemActor`, `PUBLIC_ACTOR`, `ErrorBody`, `MAX_UPLOAD_BYTES`, `DocumentKind`, all the input schemas), `@scholarcrew/db` (`createDb(url, { max })` → `{ db, close }`, `desc`, `eq`, tables), `@scholarcrew/db/testing` (`testDatabaseUrl`, `getTestDb`, `resetDb`, `setupTestDatabase`, `factories.user/student/parent/admin/family` shapes), `@scholarcrew/jobs` (`createPgBoss(url, { role: "sender" })`, `ensureQueues`, `createJobsClient`, `createMemoryJobsClient().sent`, `JobName`, `JobPayload`), `@scholarcrew/core/shared` (`TEST_NOW`, `FakeStripeGateway`, `createTestDeps` config values `price_family_test`/`whsec_test`, fake Stripe URLs), and every 06 service function (auth, profile, memory, family, helpers, notifications, billing, documents, account, apitokens, access, crypto).
- All 42 route files exist for the 13-owned rows of §10; methods, auth modes, and success codes match openapi (`201` for creates, `204` for `undefined`, `303` for verify). Request schemas match openapi, including the `InviteInput` + `memberRole` extension.
- Next.js 15: route files export only method handlers plus `runtime`/`dynamic`; params are awaited inside `route()`; only `session.ts` uses `next/headers` and awaits `cookies()`; `middleware.ts` imports only `next/server` and the import-free `protected.ts` and reads only `req.cookies`.
- `route()`: Origin check before auth on cookie routes for every non-GET/HEAD/OPTIONS method; bearer and public routes skip it (D11). Admin deny is `404 not_found`. Rate limits key by user id or IP.
- Magic link: single use (06 marks `usedAt` in the same UPDATE that checks it), and the M7 test proves a reused link redirects to `/sign-in?error=link` without a cookie. Session cookie is `HttpOnly; Secure; SameSite=Lax`. Sign out deletes the server-side session.
- Webhook reads the raw body with `req.text()` before `parseStripeWebhook`; a missing or bad signature returns 400.
- Test counts add up per task (14 → 34 → 37 → 41 → 50 → 58 → 65 → 72 → 77 → 85 → 91 → 96), and each test file imports and calls the routes its task creates.

### D-13-1 (medium): uploads without `Content-Length` are buffered with no size limit

- Location: M13 `documents/route.ts`, `const declared = Number(req.headers.get("content-length") ?? "0")` and `form = await req.formData()`. Also the comment "from `File.size` before the bytes are read", and the Review Checklist line "Uploads check `Content-Length` and `File.size` … before calling `arrayBuffer()`".
- Problem: a chunked request has no `Content-Length`, so `declared` is 0 and the check passes. `req.formData()` then reads the whole body into memory before `file.size` is checked, so a signed-in user can push an arbitrarily large body (20 a hour) and exhaust the web process's memory. Next.js route handlers have no default body limit. The `File.size` check runs after the bytes are already buffered, so the comment is wrong. The M13 oversize test builds its `Request` from `FormData`, which has no `content-length` header in undici, so it only exercises the `File.size` path, not the declared-length rejection.
- Fix: before `formData()`, require a length and cap the stream:
  ```ts
  const raw = req.headers.get("content-length");
  if (raw === null) throw invalidInput("Send the file with a Content-Length header");
  const declared = Number(raw);
  if (!Number.isFinite(declared) || declared > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) throw invalidInput(TOO_BIG);
  ```
  As defense in depth (a client can lie about the length), wrap `req.body` in a `TransformStream` that counts bytes and errors past `MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES`, then parse with `new Response(capped, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData()`. Add two tests: a request with `content-length: String(MAX_UPLOAD_BYTES + 70_000)` gets 400 `Files can be up to 10 MB` with no `documents` row, and a request with no `content-length` gets 400. In `request()` test helper calls, pass the header explicitly with `headers: { "content-length": … }`. Update the comment and the checklist line.

### D-13-2 (medium): the webhook doesn't refuse to run when `STRIPE_WEBHOOK_SECRET` is empty

- Location: M12 `billing/webhook/route.ts`: `parseStripeWebhook(raw, signature, deps.config.stripeWebhookSecret, stripeSecretKey())`; M3 `buildDeps` reads `stripeWebhookSecret: read(env, "STRIPE_WEBHOOK_SECRET")` with an empty default; §4 says the key is "empty in dev".
- Problem: with an empty secret, the route still calls `stripe.webhooks.constructEvent(raw, sig, "")`. HMAC-SHA256 accepts an empty key, so if the SDK doesn't reject an empty secret itself, anyone can sign a `checkout.session.completed` event with key `""` and give any `client_reference_id` a paid plan. A deployment that forgets the variable is exposed, and the route's safety depends on unverified SDK behavior.
- Fix: in the webhook route, before reading the body: `if (!deps.config.stripeWebhookSecret) throw notFound();` (import `notFound` from `@scholarcrew/domain`). Add a test in `billing.test.ts`: `setDepsForTests({ ...deps(), config: { ...deps().config, stripeWebhookSecret: "" } })`, send a payload signed with `stripeSignature(payload, "")`, and expect 404 and an unchanged subscription. Test count becomes 9 for billing and 97 overall; update M12 Step 4, M15, Success Criteria, and Testing Requirements.

### D-13-3 (low): IP rate limits trust the client-supplied first `X-Forwarded-For` hop

- Location: M4 `clientIp`: `req.headers.get("x-forwarded-for")?.split(",")[0]`. The Review Checklist says the proxy "must overwrite `X-Forwarded-For`".
- Problem: most proxies (including Vercel, Fly, and nginx `proxy_add_x_forwarded_for`) append the real client IP rather than replace the header. The first hop is then whatever the client sent, so the per-IP limits (magic link per IP, `verify-hours`, `helper-view`, `public/offer-tool` in plan 14) can be dodged by rotating a fake header. The per-email magic-link limit still holds.
- Fix: use the right-most entry, which the nearest trusted proxy appended: `const hops = xff.split(",").map((s) => s.trim()).filter(Boolean); const ip = hops.at(-1)`. Update the M4 test to send `"198.51.100.1, 203.0.113.5"` and expect the key `t:203.0.113.5`. Reword the checklist line to "the deployment's proxy appends the client IP to `X-Forwarded-For`".

### D-13-4 (low): magic-link verify is a state-changing GET

- Location: M7 `auth/verify/route.ts` (GET consumes the single-use token and sets the cookie), §10 `GET /auth/verify?token=`.
- Problem: email security scanners (Outlook Safe Links, Mimecast, Gmail link previews) fetch links in emails. The fetch uses up the token, and the student then sees `/sign-in?error=link`. A GET that signs you in also allows login CSRF: an attacker can send a victim a fresh link for the attacker's own account.
- Fix (R1 is acceptable as specified; do this if the drafter of 18 agrees): `GET /auth/verify` 303s to a plan 18 page `/sign-in/confirm?token=…` that shows a "Sign in" button that POSTs the token to a new `POST /auth/verify` (auth none, `csrf` check against `APP_URL`). Move the cookie-setting logic into the POST. Record this in the review log against 13, 18, and §10 if adopted.

### D-13-5 (low): two M15 checks don't exit 0 on success

- Location: M15 Step 2.
- Problem: `find … | wc -l` prints `      42` with leading spaces on macOS, so a literal compare to `42` fails. `grep -rln "process.env" apps/web/src | grep -v …` exits 1 when there are no matches, which is the passing case. §21.1 wants gates as commands that exit 0.
- Fix: `test "$(find apps/web/src/app/api/v1 -name route.ts | wc -l | tr -d ' ')" = 42` and `! grep -rln "process.env" apps/web/src --include='*.ts' | grep -v '^apps/web/src/server/deps.ts$'`. State "exits 0, prints nothing" as the expected result.

### D-13-6 (low): `serverExternalPackages` names packages the web app doesn't depend on

- Location: M1 `apps/web/package.json` (no `pg-boss` or `postgres`) and M2 `next.config.ts` `serverExternalPackages: ["pg-boss", "postgres"]`.
- Problem: under pnpm's strict layout, `pg-boss` and `postgres` live only in `packages/jobs` and `packages/db`. An external `require("pg-boss")` emitted into `apps/web/.next/server` resolves from `apps/web` and can fail at `next build` or runtime with `Cannot find module 'pg-boss'`. The plan 13 gate doesn't run `next build`, so this only shows up in plan 16/18 or §21.5.
- Fix: add `"pg-boss"` and `"postgres"` to `apps/web` `dependencies` at the exact versions plans 05 and 03 pin. Add a config test assertion that every entry in `serverExternalPackages` is in `manifest.dependencies`.

### D-13-7 (medium): `body()` reads JSON bodies of any size, including on public routes

- Location: M4 `http.ts` `body()`: `const text = await req.text();`.
- Problem: there is no byte cap, so any route that calls `body()` buffers whatever the client sends. That includes the unauthenticated `POST /auth/magic-link` here and, in plan 14, `POST /public/offer-tool` and `POST /verify-hours/:token`. Their per-IP limits run first but can be dodged (D-13-3). Every domain input is a few KB at most.
- Fix: give `body()` an optional limit with a 256 KB default: `export async function body<T>(req: Request, schema: ZodType<T>, maxBytes = 256 * 1024)`. Reject when `Number(req.headers.get("content-length") ?? 0) > maxBytes`, then read `req.body` through a byte-counting reader that stops at `maxBytes` and throws `invalidInput("Request body is too large")`. The §9.7 signature gains an optional third parameter, which existing callers don't notice. Add an http.test case: a 300 KB JSON string returns 400 with that message. Update the http test count (21) and the totals.

### Review-log items touching 13

| D-item | Status in 13 | Note |
|---|---|---|
| D11 | Done | `route()` skips the Origin check for bearer; `cors: "extension"` and `extensionPreflight` exist (M4). |
| D12 | Resolved by design | Web scripts don't use `--env-file`; `next.config.ts` loads the root `.env` only if it exists. |
| D15 | Accepted, still applies | Middleware adds `?next=`, but nothing consumes it after a magic link. |
| D16 | Done on 13's side | Helpers exist; see 14 for reuse. |
| D17 | Implemented as accepted | `next.config.ts` loads the root `.env` and `deps.ts` has `stripeSecretKey()`. The §3 secrets rule in 00 still says `process.env` only in `deps.ts`; 00 needs the wording change. |
| D27 | Open | No `GET /documents` (the `documents/route.ts` has only `POST`) and no `GET /account/exports/latest`. 06 also lacks `listDocuments`/`latestExport`, so 06 has to land first. |
| D30 | Open | `middleware.ts` doesn't forward `x-pathname`. Fix: on pass-through, `const headers = new Headers(req.headers); headers.set("x-pathname", pathname); return NextResponse.next({ request: { headers } });` and add a middleware test assertion (`x-middleware-request-x-pathname`). |
| D31 | No 13 change | Offers routes are 14's. |

---

## 14-api-pipeline.md

### What I checked (no defect unless listed)

- Every import in 14 resolves: about 50 domain schemas (including `ScholarshipQueryParams`, `CollegeQueryParams`, `AuditQueryParams`, `TERMINAL_JOB_STATUSES`, `ScholarshipStatusInput`, `ResolveReportInput`, `ResearchInput`, `StoryReuseCheckInput`, `StudyPlanInput`, `SavePageInput`, `CardId` via `ApplyActionInput`), every 07/08 service function with matching argument order (`listMatches(deps, actor, studentId)`, `getWeekPlan(…, weekStart?)`, `setScholarshipStatus(…, status, note?)`, `listReports(…, status?)`, `checkStoryReuse(…, { storyId, collegeId?, scholarshipId? })`, `acceptStudyPlan(…, { sessions })`), `TEST_NOW`/`fixedClock` from core/shared, the `@test/helpers` names from 13 M4, and `parseScorecardCsvWithErrors` from `@scholarcrew/catalog` with the `{ rows, errors: { line, message }[] }` shape (D7 done).
- All 74 route files exist for every 14-owned row of §10, with the §10 method, path, and auth mode. Success codes match openapi: 201 for creates, 202 for the five job starts (`/essays/:id/review`, `/prep/retake`, `/offers/:id/appeal`, `/plan/regenerate`, `/conversations/:id/messages`), and 204 for empty. All four rate limits match §10.
- 402: the five job-starting core functions call `assertCrewAllowance` (07 `requestReview`, `requestRetakeAnalysis`; 08 `requestWeeklyPlan`, `requestAppealOutline`, `sendMessage`), and `errorResponse` maps `limit_reached` to 402. See D-14-1 for the missing route test.
- Authorization deny: every not-yours case in the tests expects 404, admin routes give 404 to students (`route({ auth: "admin" })`), and bearer routes give 403 for a missing scope.
- `?studentId=` (D23) is on all 17 read routes where openapi declares the `StudentId` parameter, and nowhere else.
- Next.js 15: route files export only methods, `runtime`, `dynamic`, and `OPTIONS = extensionPreflight`; the SSE timing setter lives in `stream.ts` (D24). Static segments (`local`, `compare`, `progress`, `archive-season`, `link`, `reuse-check`) sit next to dynamic ones without a conflict. `[idOrSlug]` is used for both the detail and the report routes, so the segment names agree.
- D11/D16: both extension routes use 13's `route({ auth: "bearer", cors: "extension" })`, `requireScope`, and `extensionPreflight`. There is no duplicate CORS code in 14.
- SSE matches §10: `event: job` frames on a status or progress-length change, `event: end` with `{}` on a terminal status or after 130 s, a 1000 ms poll, the first `getJob` before the stream opens (so a deny is 404 JSON), and abort handling.
- Test counts add up (8+7+6+4+5+6+3+4+6+5+5+4+3+6 = 72), and each test file imports the routes its task creates.

### D-14-1 (medium): no test shows 402 on any job-starting route (CR-10 is claimed)

- Location: header feature list ("CR-10 (402 passthrough)"), rules line 10, N3/N4/N6/N8/N9 tests. No test in 14 asserts 402.
- Problem: 21 §2 requires a test for every acceptance criterion a plan claims. The five job-starting routes are the only places a student meets the allowance, and none has a 402 assertion. A route that caught `limit_reached`, or that enqueued before calling core, would pass every test.
- Fix: add one test per task file, or a single table-driven test in `plan/plan.test.ts` that covers all five routes. Exhaust the allowance with `await deps().db.insert(usageCounters).values({ userId: user.id, month: "2026-10", crewRequests: 20, costMicros: 0 })` (free plan limit 20 per 06 `PLAN_LIMITS`). Then expect `status 402`, `(await errorOf(res)).code === "limit_reached"`, and `deps().jobs.sent` to equal `[]`. Bump the counts in N8 Step 4 (5), N15, Success Criteria (73 or more), and Testing Requirements ("Allowance: each job-starting route returns 402 `limit_reached` and enqueues nothing").

### D-14-2 (low): `studentIdOf`/`ForStudent` is copied into 17 route files

- Location: N1 `matches`, `scholarship-applications`; N2 `college-list`; N3 `essays`, `stories`; N4 `test-scores`, `prep/superscores`; N5 `service-logs`, `service-logs/progress`, `activities`; N6 `costs`, `offers`, `offers/compare`; N7 `aid/checklists`, `aid/deadlines`; N8 `plan/this-week` (and an inline variant in `plan/route.ts`).
- Problem: 21 §2 says to repeat code across plan tasks, but this repeats the same runtime helper across 17 source files. Any change, such as D23's strictness or a future rule that parents must pass `studentId`, has to be made 17 times. 13's `family/share-settings` already uses `z.strictObject` for the same parameter, so the two plans parse it differently (unknown params are 400 there and ignored here).
- Fix: ask 13 to add `export function studentIdParam(ctx: { actor: Actor; url: URL }): string` to `src/server/http.ts`, using a non-strict `z.object({ studentId: Id.optional() })` so other params like `week` pass. 14's routes then call `studentIdParam(ctx)`. Record it as a 9.7 addition. If 13 won't own it, leave the copies in place and note D23 as resolved.

### D-14-3 (low): the report route accepts `[idOrSlug]` but only works with an id

- Location: N1 `scholarships/[idOrSlug]/report/route.ts`, `withPathId(raw, params.idOrSlug)` into `ReportInput` (`scholarshipId: Id`). openapi `POST /scholarships/{idOrSlug}/report`.
- Problem: §10 says `POST /scholarships/:id/report`, but the folder has to be `[idOrSlug]` (Next requires one dynamic name per level), and openapi documents it as `idOrSlug`. Posting to `/scholarships/maple-rotary-stem/report` returns 400 `scholarshipId: Invalid UUID`. Plan 17 links from the slug-based detail page, so this is an easy mistake to make.
- Fix: either resolve the slug first (`const s = await getScholarship(deps, actor, params.idOrSlug); withPathId(raw, s.id)`, which also turns an unknown or hidden listing into 404), or keep id-only and change openapi's description to "listing id (slugs are not accepted)". The first is better. Add a test that reports by slug and gets 204.

### D-14-4 (low): the CSV import pulls the Anthropic SDK and agents runtime into the web server

- Location: N12 `import { parseScorecardCsvWithErrors } from "@scholarcrew/catalog"`; 11's `package.json` `exports` has only `"."` and `"./testing"`, and `"."` re-exports `src/anthropic.ts`.
- Problem: the web bundle now includes `@anthropic-ai/sdk`, `@scholarcrew/agents`, and the catalog research code just to parse a CSV. That's unused weight, and it means a web route imports model-calling code that §3 keeps in the worker.
- Fix: 11 adds a `"./csv": "./src/csv.ts"` subpath export (parseCsv, parseScorecardCsv, parseScorecardCsvWithErrors). 14 imports from `@scholarcrew/catalog/csv`. Record the subpath in §9.6. This is a cross-plan request to 11.

### D-14-5 (low): the CSV size check is skipped for chunked bodies

- Location: N12 route, `Number(req.headers.get("content-length") ?? "0") > MAX_CSV_BYTES` then `await req.text()`.
- Problem: this is the same pattern as D-13-1. Without `Content-Length`, `req.text()` buffers the whole body before the 5 MB check. It's admin-only, so the risk is low.
- Fix: use the byte-capped reader from D-13-7 (`body()` can't be reused because the input is CSV). Expose the reader from 13's `http.ts` as `readTextCapped(req, maxBytes, message)` and call `readTextCapped(req, MAX_CSV_BYTES, TOO_BIG)`.

### D-14-6 (low): per-task run commands may not filter, so their expected counts can be wrong

- Location: every Step 2/Step 4 in N1–N14, for example `pnpm --filter @scholarcrew/web test -- src/app/api/v1/scholarships`, with "Expected: PASS, 1 file, 8 tests".
- Problem: the script is `vitest run`. Depending on the pnpm version, the literal `--` is either forwarded (`vitest run -- src/…`, which cac treats as non-positional, so Vitest runs every file) or stripped. If it's forwarded, "1 file, 8 tests" is wrong, because plan 13's 96 tests run too.
- Fix: use `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/scholarships` in every Step 2 and Step 4, which is unambiguous.

### D-14-7 (low): the N15 gate states only this plan's share of the totals and skips DB setup

- Location: N15 Step 3, "including this plan's 14 files and 72 tests"; Success Criteria line 2.
- Problem: `pnpm --filter @scholarcrew/web test` prints the package totals. After plans 13 and 14 that's `Test Files 27 passed (27)` and `Tests 168 passed (168)`, plus 13's own fixes. The gate also assumes the DB is up and migrated, which only Testing Requirements mentions.
- Fix: N15 Step 3: `pnpm db:up && pnpm db:wait && pnpm db:migrate:test && pnpm --filter @scholarcrew/web typecheck && pnpm --filter @scholarcrew/web test && pnpm lint`, with "Expected: `Test Files 27 passed (27)`, `Tests 168 passed (168)`". Adjust the numbers after the D-13 and D-14 test additions land.

### Review-log items touching 14

| D-item | Status in 14 | Note |
|---|---|---|
| D5 | Done | `POST /college-list` passes the core `invalid_input` message through, and N2 tests it. |
| D7 | Done | The import route uses `parseScorecardCsvWithErrors` and keeps CSV line numbers. |
| D11 | Done | Bearer + `cors: "extension"` + `OPTIONS = extensionPreflight` on both extension routes. |
| D16 | Done | No duplicate CORS code. |
| D23 | Done in 14 | 17 read routes take `?studentId=`. The note in §10 of 00 is still missing (00 change). See D-14-2. |
| D24 | Done | Setter lives in `stream.ts`. |
| D28 | Open | No `GET /jobs?active=1`, and 08 has no `crew.listJobs`. 08 must land first; then add `apps/web/src/app/api/v1/jobs/route.ts` (`GET`, `query(url, z.object({ active: z.stringbool().optional(), limit: z.coerce.number().int().min(1).max(50).default(10) }))`) with an owner and stranger test, and add the row to §10 and openapi. |
| D31 | No 14 change needed | Offers routes return whatever 08 returns. `parseJobId` appears once 07/08 add it. Add a `toHaveProperty("parseJobId")` assertion in N6 when it does. |
| D32 | Accepted | No retake-result route. |
| D33 | Open | No `GET /recommendations` (or `GET /recommenders/requests`), and 07 has no `listRecRequests`. Add the route after 07, with §10 and openapi rows. |

---

## Cross-plan requests raised by this review

| To plan | Request | From |
|---|---|---|
| 00 | §3 secrets rule: allow `next.config.ts` to load the root `.env` (D17). §10: note the optional `?studentId=` on read routes (D23). §9.7: list 13's additions (`scopes`, `requireScope`, `fileResponse`, `cors`, `extensionPreflight`, `clientIp`, plus `studentIdParam`/`readTextCapped` if adopted, and the optional `maxBytes` on `body()`). | D17, D23, D-13-7, D-14-2, D-14-5 |
| 06 | `listDocuments`, `latestExport` (D27) before 13 adds the routes. | D27 |
| 07 | `listRecRequests` (D33). | D33 |
| 08 | `crew.listJobs` (D28). | D28 |
| 11 | `./csv` subpath export. | D-14-4 |
| 18 | Only if D-13-4 is adopted: a `/sign-in/confirm` page that POSTs the token. | D-13-4 |

## Summary

| ID | Severity | Plan / task | One line |
|---|---|---|---|
| D-13-1 | medium | 13 M13 `documents/route.ts` | A chunked upload with no `Content-Length` is buffered in full before the 10 MB check |
| D-13-2 | medium | 13 M12 `billing/webhook/route.ts` | The webhook runs with an empty `STRIPE_WEBHOOK_SECRET`, so events signed with key `""` could be accepted |
| D-13-3 | low | 13 M4 `clientIp` | The first `X-Forwarded-For` hop is client-controlled, so per-IP limits can be dodged |
| D-13-4 | low | 13 M7 `auth/verify` | A state-changing GET: link scanners burn tokens, and login CSRF is possible |
| D-13-5 | low | 13 M15 Step 2 | `wc -l` padding and `grep | grep -v` exit 1 when the check passes |
| D-13-6 | low | 13 M1/M2 | `serverExternalPackages` lists packages `apps/web` doesn't depend on |
| D-13-7 | medium | 13 M4 `body()` | No size cap on JSON bodies, including public routes |
| D-14-1 | medium | 14 N3/N4/N6/N8/N9 | No 402 `limit_reached` test on any job-starting route (CR-10 claimed) |
| D-14-2 | low | 14 N1–N8 | `studentIdOf` is copied into 17 files, and its parsing differs from 13's |
| D-14-3 | low | 14 N1 report route | `[idOrSlug]` path, but a slug gets 400 |
| D-14-4 | low | 14 N12 | Importing `@scholarcrew/catalog` bundles the Anthropic SDK into web |
| D-14-5 | low | 14 N12 | The CSV 5 MB check is skipped for chunked bodies |
| D-14-6 | low | 14 every Step 2/4 | `test -- <path>` may run the whole suite, so the expected counts can be wrong |
| D-14-7 | low | 14 N15 | The gate states only this plan's counts and skips DB setup |

| Plan | High | Medium | Low |
|---|---|---|---|
| 13 | 0 | 3 | 4 |
| 14 | 0 | 1 | 6 |
| Total | 0 | 4 | 10 |

Open review-log items in this group: D27 (13), D30 (13), D28 (14), D33 (14). Each of D27, D28, and D33 needs its core producer (06, 08, 07) to land first. D23 and D17 still need wording changes in 00. Done or accepted with no change needed: D5, D7, D11, D12 (13), D15, D16, D24, D31, D32.
