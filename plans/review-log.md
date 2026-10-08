# Review log

Known cross-plan issues found while drafting, plus findings from each review round. Each entry names the plan file to patch.

## Found during drafting

| # | Plan(s) | Issue | Fix |
|---|---|---|---|
| D1 (03 done) | 03, 07, 08 | ME-07 says New season archives offers, but `offers` has no `archivedAt`. | 03: add `archivedAt ts?` to `offers`. 07 `archiveSeason`: also set `offers.archivedAt` for the season's award year. 08: `listOffers`/`compareMyOffers` exclude archived offers. |
| D2 | 08 | SC-11 renewal reminders aren't covered (07 records `outcomeRenewable`). | 08 `findDueReminders`: add yearly renewal reminders for won renewable awards 30 days before the outcome anniversary, dedupeKey `renewal:<applicationId>:<year>`. |
| D3 (03 done) | 03, 06 | Plan 03 exports the export table as `exports` (alias of `exportsTable`); 06 imports `exports as exportsTable`. | 03: export only `exportsTable` (drop the `exports` alias) and use it in resetDb/seed; 06: import `exportsTable` directly. |
| D4 | 09, 10 | Family-room replies never cite essays/stories because share grants aren't in `ContextSnapshot`. | Accept for R2 (stricter than needed); note in docs. |
| D5 | 07 | Over-limit college list throws `invalid_input` (not `limit_reached`, which means billing/402). | Accept; update 14/17 to show the message. |
| D6 (done) | 05 | `createPgBoss` adds `schema?` option; memory client adds `opts` and `clear()`. | Accept; reflected in reviews. |
| D7 (done) | 11 | Import route must use `parseScorecardCsvWithErrors`; worker must call `extractForTask`. | 14 and 12 drafters told. |
| D8 | 04 | `compareOffers` lines take optional `label` for warnings. | 08 passes labels. |
| D9 | features | ON-02 promised past essays seed Story Bank candidates; no plan implements it. | Spec changed: past essays go into a Quill story interview (ES-08). 16's onboarding upload step should say so. |
| D10 | 06 | `getMe` returns onboardingComplete true for parents/admins; `createFact` also refuses sensitive keys; system actor passes assertOwner/assertCanRead. | Accept. |
| D11 (13, 14 done) | 14, 13 | Extension calls from the background worker are cross-origin. | 14: `/extension/autofill-profile` and `/extension/save-page` export `OPTIONS` and send CORS headers for `chrome-extension://` origins (Allow-Headers Authorization, Content-Type; Allow-Methods GET, POST, OPTIONS). 13: bearer auth skips the Origin check (already the rule). |
| D12 (01, 03, 12, 13 done) | 01, 03, 12, 13 | `--env-file=../../.env` crashes on hosts without a `.env` file; `check-env` requires TEST_DATABASE_URL even in production. | Use `--env-file-if-exists=../../.env` in every script (01 scripts package, 03 migrate/seed, 12 dev); 01 `checkEnv` requires TEST_DATABASE_URL only when NODE_ENV !== "production". |
| D13 | 06 | `deleteAccount` doesn't cancel an active Stripe subscription. | 06: add `cancelSubscription(subscriptionId)` to `StripeGateway` (real + fake) and call it from `deleteAccount` when the user pays for an active plan; record in audit. Update §9.4. |
| D14 (done) | 09 | `checkPrivacy(reply, audience, allowed?)` third arg optional. | Accept; §9.5 already lists it. |
| D15 | 06, 13, 18 | Magic links can't carry a `next` path, so sign-in always lands on /week or /onboarding. | Accept for R1. Later: add `nextPath text?` to `magicLinks` and pass it through verify. |
| D16 (13, 14 done) | Plan 13 added `route({ cors: "extension" })` + `extensionPreflight` + `requireScope`; plan 14 may implement CORS separately. | 14's extension routes should use 13's helpers; remove any duplicate CORS code. |
| D17 (13, 00 §3 done) | `next.config.ts` loads the root `.env` into `process.env` (outside deps.ts); `deps.ts` adds `stripeSecretKey()`. | Accept; update §3 secrets rule to allow next.config.ts env loading for dev only. |
| D18 (07, 11, 12 done; 02 pending) | 07, 11, 12 | Student-submitted scholarships are never extracted. | 07 `submitLocalScholarship`: enqueue `catalog.extract` { taskId }. 11 `extractForTask`: accept `user_submission` tasks (fetch the submitted URL, store draft + report in the payload, keep the listing submitter_only/draft). |
| D19 (done) | 12, 06 | Nothing creates memory candidates (ME-03). | 12 crew.request: for each `confirm_fact` card in a reply outside temporary rooms, also call `memory.createCandidate` so it shows under "Waiting for your OK". |
| D20 (done) | 11, 12 | Catalog model calls aren't recorded (AG-06). | 11: `CatalogDeps.onUsage?(turn)`; 12 wires it to `crew.recordAgentRun` with role "catalog" and jobId null. |
| D21 (done) | design | System diagram shows separate file storage, server actions, SMS digest. | Update `design/mockups/source/system.html`: blobs in Postgres, API routes, email digest (SMS reminders R3); re-render. |
| D22 (done) | 12 | Temporary chats must load no memory and save nothing (CR-07). | 12 port `snapshot` for room temporary: empty facts and decisions; no candidates; no decisions recorded. |
| D23 (14, 00 §10 done) | Read routes accept optional `?studentId=` so parents read shared data; not in §10. | 16/17: parent views pass `studentId`; add a note to §10. |
| D24 (14 done) | SSE test setter lives in `jobs/[id]/events/stream.ts` (Next.js rejects extra route exports). | Accept. |
| D25 | 12, 06, 08 | Worker reads crewJobs.ownerId, conversations/messages, shareSettings, notificationPrefs directly (no system readers in core). | Accept for system-only code; optionally add system readers later. D19/D20/D22 still need patching into 12. |
| D26 (12 documented) | 12 | `Handler(deps, data, ctx?)` relies on pg-boss `includeMetadata: true` for retry counts. | Verify against installed pg-boss at execution; fall back to no retry metadata. |
| D27 (06, 13 done) | No `documents.listDocuments`, `account.latestExport`, or `GET /documents`; 16 reads rows directly in `src/lib/owned.ts`. | 06: add `listDocuments(deps, actor)` and `latestExport(deps, actor)`; 13: add `GET /documents` and `GET /account/exports/latest`; 16: use them and delete `owned.ts`. |
| D28 (08, 14 done) | No way to list a student's recent jobs for the crew side panel. | 08: `crew.listJobs(deps, actor, { active?: boolean; limit?: number })`; 14: `GET /jobs?active=1`; 16: panel uses it. |
| D29 (12 done) | 12, 16 | Prep/Impact enablement: 16 writes facts `crew_prep_enabled`/`crew_impact_enabled`; 12's port enables them by data presence. | 12 port: enabled when the fact is true OR the student has the data; 16 keeps the facts. |
| D30 (13 done) | Onboarding redirect runs client-side because layouts can't see the pathname. | 13 middleware: forward `x-pathname` header; 16: server-side redirect in (app) layout, keep the client gate as fallback. |
| D31 (02, 08, 14 done) | `createOffer` doesn't return the `offer.parse` job id, so 17's upload polls `GET /offers/:id`. | 07: add `parseJobId: string \| null` to `Offer` (latest parse job); 13/14 return it; 17: follow `GET /jobs/:id/events` when present, keep polling as fallback. |
| D32 | 08, 14, 17 | `computeRetake` is system-only; 17 runs `retakeAnalysis` client-side. | Accept (pure engine, same inputs). Optional later: `prep.getRetakeResult`. |
| D33 (07, 14 done) | `RecRequest` has no helper link URL and no list endpoint. | 07: `listRecRequests(deps, actor)` returns requests with `helperLinkId`; 14: `GET /recommendations`; 17: render past requests with copy-link. Helper URL itself is shown once at creation (token not stored in clear). |
| D34 | 02, 07, 17 | `Essay` summary has no `wordCount`, so 17 fetches each essay. | 02/07: `Essay.latestWordCount: number \| null` from the latest version; 17 uses the list response. |
| D35 | 16, 17 | 16's `Thread` props unknown to 17; 17 built its own `ContextCrew` reusing 16's `ReplyCard`. | Accept; review round 3 checks 16/17 crew components don't duplicate logic. |
| D36 (08, 14 done) | No admin reads for one listing (any status), a listing list, or one catalog task; 18 reads the DB directly in `components/admin/adminReads.ts`. | 08: add `admin.getScholarshipForAdmin`, `admin.listScholarships({ status?, q?, page })`, `admin.getCatalogTask`; 14: admin GET routes; 18: use them and delete `adminReads.ts`. |
| D37 (06, 13 done) | No invite preview before accepting. | 06: `family.previewInvite(deps, token)` → { inviterFirstName, memberRole, expiresAt } or not_found; 13: `GET /family/invites/preview?token=`; 18: show it on /family/join. |
| D38 | 07, 18 | `HelperView` lacks request text and due date. | 07 helperview: add `request: { message: string \| null; dueDate: string \| null }`; 18 renders it. |
| D39 | 07, 18 | `searchScholarships` returns scam-flagged listings; directory filters after paging. | 07: `ScholarshipQuery.excludeScams?: boolean` applied in SQL (public queries always true); 18 drops its post-filter. |
| D40 | 08, 18 | Mockup's "Publish as unverified" impossible (resolve always sets verifiedAt). | Accept: R1 offers Publish and Reject only; update mockup 18 note in design README. |
| D41 | 07, 18 | `STATE_NAMES`, `localLabel` not exported from core; 18 copies them. | Move both to 02 domain (`domain/geo.ts`) and import in 07 and 18. |
| D42 | 02, 09, 12 | In a family room, a parent's message reaches Compass as if the student wrote it. | 02: `CrewRequestInput.requester: { role: "student" \| "parent"; firstName: string }`; 09: Compass prompt names the requester and answers the audience; 12: set it from the message author. Round 2 (data flow) picks this up. |
| D43 | 16 | 12 reads `crew_prep_enabled`/`crew_impact_enabled` facts only when their visibility is `crew` or `crew_family`. | 16 writes those facts with visibility `crew`. |
| D44 | 17, 18 | Renewal notifications link to `/scholarships/<slug>`. | 17 detail page handles it (already the route); 18 nothing. |
| D45 | 20 | Plan 20 copies `STATE_NAMES` (F-20-4). | 20 imports from `@scholarcrew/domain`. |
| D46 | 19 | No dev route or clock to expire a helper link; e2e writes `expires_at` directly in the e2e DB. | Accept (test-only write against the e2e database). |
| D47 | 17, 19 | `/essays` has no "New essay" form; e2e creates essays through `POST /essays`. | 17: add a New essay form (prompt, word limit, optional college/scholarship) on `/essays` (ES-01); 19 switches to the UI once 17 has it. |
| D48 | 01, 21 | `evals/reports/` isn't git- or Biome-ignored; 21 names it `evals/results/`. | 01: add `evals/reports/` to `.gitignore` and Biome `files.ignore`; 21: rename to `evals/reports/`. |
| D49 | 09, 19 | No code checks dollar amounts in replies against engine results; only the math eval does. | Accept for R1 (Ledger tools return engine numbers verbatim); consider a numbers guard in R2. |
| D50 | 19 | Rate limits in e2e: each browser context sends its own `X-Forwarded-For`. 13 keys on the right-most hop, so this is safe and doesn't help a spoofer behind the real proxy. | Accept. |

## Round 1 group A fixes

Source: `plans/reviews/r1-groupA.md`. Plans 01, 02, 03, 05 and 00 §8/§9.1/§9.3 patched.

| Finding | File and task | Change |
|---|---|---|
| 03-H1 (D3) | 03 rules, C4 `ops.ts`, C4 `index.test.ts`, Review Checklist; 00 §9.1 comment | `export const exportsTable = pgTable("exports", …)`; alias and its comment removed. Rule reads "exported as `exportsTable`; no module declares or imports a binding named `exports`". `index.test.ts` asserts `getTableConfig(schema.exportsTable).name === "exports"` and `"exports" in schema` is false (no count change). |
| 03-M1 (D1) | 03 C4 `pipeline.ts`, C5 `migrate.test.ts`, Testing Requirements, Review Checklist; 00 §8 `offers` | `archivedAt: ts("archived_at")` added to `offers`; §8 line gains `· archivedAt ts?`. New migrate test checks `offers.archived_at` is nullable `timestamp with time zone`. Counts: C5 70, C6 84, C7/Success/Testing 89; `migrate.test.ts` (6). |
| 03-M2 (D12) | 03 C1 `package.json`, Review Checklist | `migrate`, `migrate:test`, `seed` use `tsx --env-file-if-exists=../../.env`. |
| 05-H1 | 05 consumer notes, E2 `validate.ts`/`client.ts`/`client.test.ts`, E3 `memory.ts`/`memory.test.ts`, E4 `queues.ts`/integration test/Step 5, Testing Requirements, Review Checklist | `QUEUE_POLICIES = { "catalog.extract": "short" }` in `validate.ts`; `ensureQueues` calls `createQueue(name, { name, policy })`. New `assertSingletonKey` (both clients) throws `invalid_input` when a `short` queue gets no key. Integration dedupe test moved to `catalog.extract`, plus policy assertions. Consumer note reworded ("`null` only on `QUEUE_POLICIES` queues"). Library note and E4 Step 5 say to verify pg-boss 10 dedupe behavior at execution. Counts: E2 8, E3 12, E4 17, E5 20, E6/Success/Testing 22. |
| 01-M1 (D12) | 01 A4 `scripts/package.json`, A6 README, A7 CI step names and intro, A2 `engines` | `check-env` and `wait-for-db` use `--env-file-if-exists=../.env`. README sentence replaced; prerequisites say Node 22.9+. CI step renamed "Create .env for local-style scripts". Root `engines.node` is `>=22.9` (first Node with the flag). |
| 01-M2 (D12) | 01 A4 `check-env.ts`, `check-env.test.ts`, Testing Requirements | `TEST_DATABASE_URL` dropped from the required list when `NODE_ENV === "production"`; new test covers production and development. |
| 01-L1 | 01 A4 Step 5, A5 Step 4, A7 Steps 2 and 4, Success Criteria, Testing Requirements | Counts with the 01-M2 test: A4 14, A5 19, A7 `1 failed \| 19 passed (20)` then 20; `check-env.test.ts` (11), `repo-config.test.ts` (4). |
| 02-M1 | 02 B1 `common.ts`, B4 `profile.ts`/`profile.test.ts`, Testing Requirements, Review Checklist | New `TimeZone` (Intl-validated) in `common.ts`; `ProfilePatch.timeZone` and `OnboardingInput.timeZone` use it. New test rejects `Mars/Base`; B4 count 6. |
| 02-L1 | 02 B5 Step 4 | "impact file 6 tests added". |
| 02-L2 | 02 Testing Requirements | "10 test files". |
| 02-L3 | 02 import-order line | `colleges` (scholarships), `crew` (colleges, essays, memory, money, plan, scholarships), `jobs` (common); checked against every file's imports. |
| 00-L1 (D6) | 00 §9.3 | `createPgBoss(url, opts?: { role?; schema? })`, memory client `sent[].opts` and `clear()`, `enqueue` null/throw comment, `ensureQueues` policy note. |

Follow-ups for other plans (not edited here):

- 06: replace every `exports as exportsTable,` import with `exportsTable,` and drop the D3 notes (lines 12 and 6403–6404).
- 07 (D1): `archiveSeason` sets `offers.archivedAt` for the season's award year. 07 (D18): `submitLocalScholarship` must enqueue `catalog.extract` with singletonKey `catalog.extract:<taskId>`, or both job clients now throw `invalid_input`.
- 08 (D1): `listOffers`/`compareMyOffers` filter `isNull(offers.archivedAt)`.
- 12, 13: D12 still open on their side (`--env-file-if-exists` in their dev scripts). 12 already passes `singletonKey` for `catalog.extract`; 12 `sweep.weekly` keys `sweep.student` by `sweep:<studentId>:<week>` and counts non-null ids as queued, but `sweep.student` stays `standard` (06 onboarding enqueues it without a key), so a retried `sweep.weekly` can queue a student twice. Either accept (the sweep is idempotent on matches) or move `sweep.student` to `short` in 05 `QUEUE_POLICIES` and have 06 pass `singletonKey: sweep:<userId>:<weekStart>`.
- 16: `import { exportsTable } from "@scholarcrew/db"` now compiles (until D27 deletes `owned.ts`).

## Round 1 group B fixes

Source: `plans/reviews/r1-groupB.md`, the D-items listed below, and the coordinator's group A handoff. Plans 04, 06, 07, 08 and the 00 §9.4 core contract lines patched. 02 and 03 weren't edited; the changes they need are under follow-ups, and 07/08 code against those exact names.

| Finding | File and task | Change |
|---|---|---|
| 04-1 | 04 D7 `dates.ts`/`dates.test.ts`, rules, Steps, Success, Testing | `isoDateMs` round-trips through `msToIsoDate` and throws `RangeError` for `"2026-02-30"`. New test. Counts: D7 89, D8 99, D9 112, D10/Success/Testing 119. |
| 06-1 | 06 F1 `package.json`, Step 2 | `"drizzle-orm": "^0.44.0"` added to core dependencies (07 imports `type SQL`). |
| 06-2 (D13) | 06 F2 `types.ts`, `stripe-fake.ts`, `shared.test.ts`; F12 `createStripeGateway`; F19 `delete.ts`/`delete.test.ts` | `StripeGateway.cancelSubscription(id)`. The fake records `canceled[]`; the real one calls `stripe.subscriptions.cancel`. `deleteAccount` reads `ownSubscription` first, cancels an active `stripeSubscriptionId`, sets the row `canceled` inside the transaction, and audits `subscription_canceled` with `{ stripeSubscriptionId }`. New delete test (`["sub_1"]`, row canceled, one audit row). The first delete test asserts nothing is canceled for a free student. |
| 06-3 (D27) | 06 F17 `documents/index.ts`/test, F18 `export.ts`/test, F19 `account/index.ts` | `listDocuments(deps, actor)` (own uploads, `desc(uploadedAt)`) and `latestExport(deps, actor)` (newest row with `expiresAt` null or in the future). One test each covering owner-only, ordering, expiry, and system-actor rejection. |
| 06-4 (D3) | 06 Rules, F18 `export.ts`, F19 `delete.ts`/`delete.test.ts`, Review Checklist | All three imports are now `exportsTable`. Rules bullet and checklist rewritten; the contract-gap note is gone. |
| 06-5 | 06 Review Checklist | Replaced with "ON-02: past essays are uploaded encrypted; the story interview is ES-08 (D9)", and D10 noted as accepted. |
| D37 | 06 F9 `family/core.ts`/`core.test.ts`, F10 `family/index.ts` | `previewInvite(deps, token)` returns `{ inviterFirstName, memberRole, expiresAt }` with no actor. Unknown, expired, or used tokens are `not_found`, and the invitee's email is never returned. New test. |
| 06 counts | 06 F9–F20, Success, Testing | F9 87, F10 94, F11 100, F12 110, F13 119, F14 126, F15 131, F16 141, F17 148, F18 153, F19/F20/Success/Testing 159 (20 files). |
| 07-1 (D18) | 07 G6 `submissions.ts`/test, intro | The task insert returns its id. After commit, `submitLocalScholarship` enqueues `catalog.extract` `{ taskId }` with `singletonKey: "catalog.extract:<taskId>"` (05 requires it). The test asserts `jobs.sent` including `opts`. |
| 07-2 (D1) | 07 G8 `list.ts`/`list.test.ts`, intro | `archiveSeason` runs in one transaction and also sets `offers.archivedAt` for `awardYearFor(currentSeason(now))` and earlier (`lte` on `YYYY-YY`). New exported helper `awardYearFor`. The return value is still `{ archived: <college entries> }`. The test checks this year's offer is archived and next year's and another student's are not. |
| 07-3 | 07 G8 `buildItems` | `forEach` replaced with `for (const [idx, s] of r.supplements.entries())`. No other `forEach` in 04/06/07/08. |
| 07-4 | 07 G2 `search.ts`/test, prose | `q.local` from a non-user actor throws `invalid_input`. Asserted in the filters test. |
| 07-5 | 07 G16 `view.ts`/test | Helper-view scholarship deadlines use `refType: "scholarship"` with `refId: listing.id`. Asserted. |
| 07-6 | 07 Contract notes | The offers and SC-11 bullets were rewritten for D1/D2. A new bullet lists the 02/03 changes this plan codes against, and another records the crew local-search limit. |
| D33 | 07 G9 `recommenders.ts`/`items.test.ts`/`colleges/index.ts` | `listRecRequests(deps, actor)` returns own requests by `desc(updatedAt)` with `helperLinkId`. New test, and the index name list is updated. |
| D34 | 07 G10 `essays/mappers.ts`, `essays.ts`, test | `toEssay(row, latestWordCount)`. `listEssays` left-joins the current version, `getEssay` passes the latest count, and `createEssay` passes null. Assertions were added to existing tests, so the count doesn't change. |
| D38 | 07 G9 `requestRecommendation`, G16 `view.ts`/test | The rec request stores `message` (proposed 03 column). `HelperView.request` is `{ message, dueDate }`: the note (null when blank) and the earliest target deadline (entry plan deadline, scholarship deadline), or both null for non-recommendation links. New test, and the counselor test asserts nulls. |
| D39 | 07 G2 `search.ts`/test, prose | `excludeScams` (and every public-actor search) adds `noScamFlags` in SQL, so totals and pages stay right. `listPublicByState` already filters in SQL. New test. |
| D41 | 07 G1 `labels.ts`, `mappers.ts`, `common.test.ts`, Files | `STATE_NAMES` and `localLabel` were removed from `labels.ts` (now `slugify` only) and are imported from `@scholarcrew/domain`. The label test now imports them from domain. |
| 07 counts | 07 G2, G4, G6, G9, G16, Success, Testing | search 8, G4 26, G6 38, items 7 (G9 17), helperview 6. Plan total 17 files, 93 tests. |
| D31 | 08 H5 `offers.ts`/test (the review-log row says 07, but `createOffer` lives in 08) | `loadOffers` looks up the newest `offer_parse` job per offer with the same owner, and every `Offer` gets `parseJobId`. Asserted on `createOffer` and `listOffers`. |
| 08-1 (D1) | 08 H4 `costs.ts`/test, H5 `offers.ts`/test, rules | `loadOffers(where: ReturnType<typeof and>)`. `listOffers`, `compareMyOffers`, and the `confirmed` cost query add `isNull(offers.archivedAt)`; `getOffer` still opens archived offers. There's a new offers test, and the costs test checks that the source falls back to `scorecard` once the offer is archived. |
| 08-2 (D2) | 08 H1 `saveApp` (`outcomeAt`), H8 `notify.ts`/test, rules | `findDueReminders` adds won, renewable, dated applications of active students. When today + 30 is a later-year anniversary of `outcomeAt` (local date; Feb 29 → Feb 28), it pushes `{ title: "<name> renewal is coming up", offset: 30, refType: "scholarship_application", dedupeKey: "renewal:<appId>:<year>" }`. New test. Coded against the proposed 02 `Reminder.offset` literal 30. |
| 08-3 (D28) | 08 H2 `jobs.ts`/test, H10 `crew/index.ts`, H13 contract names | `listJobs(deps, actor, { active?, limit? })` returns own jobs only, `desc(createdAt)`, active = queued/working, limit clamped 1..50 (default 20). New test. |
| 08-4 | 08 H2 `completeJob`/test | Returns early when the job is terminal and already has `resultMessageId`. The crew-request test asserts that a retry writes no second message. |
| D36 | 08 H11 `catalog.ts`/test, H12 `admin/index.ts`, H13 contract names | `getScholarshipForAdmin` (any status), `listScholarships({ status?, q?, page })` (50 per page, `q` on name/provider/slug, `page < 1` is invalid_input), and `getCatalogTask`, all `assertAdmin`. New test. |
| 08 counts | 08 H2, H5, H8, H10, H11, H12, H13, Success | jobs 8 (crew 17), offers 8 (money 16), notify 4 (plan 17), catalog 5 (admin 9). Plan total 14 files, 68 tests. |
| 00 §9.4 | 00 §9.4 (core lines only) | Added `StripeGateway.cancelSubscription`, `family.previewInvite`, `documents.listDocuments`, `account.latestExport`, `colleges.listRecRequests`, `crew.listJobs`, `admin.getScholarshipForAdmin`/`listScholarships`/`getCatalogTask`, plus behavior notes on `deleteAccount`, `searchScholarships`, `submitLocalScholarship`, `archiveSeason`, `listOffers`/`compareMyOffers`, and `findDueReminders`. |

D-items closed on the 04/06/07/08 side: D1, D2, D3, D13, D18, D27, D28, D31, D33, D34, D36, D37, D38, D39, D41. D10 stays accepted. D2, D31, D34, D38, D39, and D41 also need the 02/03 follow-ups below before 07/08 typecheck. Coordinator handoff: (1) the D18 singletonKey is done; (2) `exportsTable`, `offers.archivedAt` in 07 and 08 are done; (3) no key was added to `sweep.student` in 06.

Follow-ups for other plans (not edited here):

- 02 `scholarships.ts`: add `excludeScams: z.boolean().optional()` to `ScholarshipQuery` and `excludeScams: z.stringbool().optional()` to `ScholarshipQueryParams` (D39).
- 02 `essays.ts`: add `latestWordCount: z.number().int().min(0).nullable()` to `Essay`, after `currentVersion` (D34). `EssayWithBody` inherits it.
- 02 `money.ts`: add `parseJobId: Id.nullable()` to `Offer`, after `confirmedAt` (D31). `OfferWithLines` inherits it.
- 02 `plan.ts`: `Reminder.offset: z.union([z.literal(30), z.literal(7), z.literal(3), z.literal(1)])` (D2).
- 02 `helpers.ts`: import `IsoDate` from `./common` and add `request: z.strictObject({ message: z.string().nullable(), dueDate: IsoDate.nullable() })` to `HelperView` (D38).
- 02 new `geo.ts` (D41), exported from `index.ts` with `export * from "./geo";`. Move the B-task test of the five label cases there if wanted.
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
- 03 `pipeline.ts` `recRequests`: add `message: text("message").notNull().default("")` with a migration. In 00 §8, add ` · message text = ''` to the `recRequests` line (D38).
- 11: `extractForTask` must accept `user_submission` tasks (D18, unchanged).
- 12: the `reminders.deadlines` handler must accept `offset: 30` and link renewal reminders to the application. `CrewDataPort.searchScholarships(core, SYSTEM, q)` must not send `local: true` (it's now `invalid_input`); document that the crew can't do local search, or add an `ownerId` to the port.
- 13: `GET /documents` (`listDocuments`), `GET /account/exports/latest` (`latestExport`), and `GET /family/invites/preview?token=` (`previewInvite`, rate-limited per IP). Offer responses now include `parseJobId`. `DELETE /account` can fail with a Stripe error before anything is deleted; show a retry.
- 14: `GET /jobs?active=1&limit=` (`listJobs`), `GET /recommendations` (`listRecRequests`), and admin GETs for `listScholarships`, `getScholarshipForAdmin`, and `getCatalogTask`. Public search callers no longer need to pass `excludeScams`.
- 16: delete `src/lib/owned.ts` and use the 13 routes. The background job panel reads `GET /jobs?active=1` instead of `sessionStorage`.
- 17: offer upload follows `GET /jobs/:id/events` when `parseJobId` is set. The essay list uses `latestWordCount`. The recommendations page lists `GET /recommendations` and matches `helperLinkId` to the link list.
- 18: use the 14 admin routes and delete `components/admin/adminReads.ts`. Import `STATE_NAMES`/`localLabel` from `@scholarcrew/domain`. Render `HelperView.request`. Drop the directory's scam post-filter. Show `previewInvite` on `/family/join`.

## Round 1 02/03 follow-ups

Source: the group B follow-ups above. Plans 02, 03, and the `recRequests` line of 00 §8 patched. Names and types match what 07 and 08 code against.

| Finding | File and task | Change |
|---|---|---|
| D39 | 02 B3 `scholarships.ts`/test | `ScholarshipQuery.excludeScams: z.boolean().optional()` and `ScholarshipQueryParams.excludeScams: z.stringbool().optional()`. New test. |
| D41 | 02 Files, import order, B3 new `geo.ts`/`geo.test.ts`, B8 `index.ts`/`jobs.test.ts` | `STATE_NAMES: Record<USState, string>` and `localLabel(area: LocalArea)` (code as above). `index.ts` adds `export * from "./geo";` after scholarships; the index test checks both names. Geo test: all 52 codes named, plus the national, null-state, state, county (with and without the "County" suffix), and city labels. Import order: `scholarships` ← `geo` (scholarships) ← `colleges`. |
| D34 | 02 B5 `essays.ts`, `impact.test.ts` | `Essay.latestWordCount: z.number().int().min(0).nullable()` after `currentVersion`; `EssayWithBody` inherits it. New test (null, 412, rejects -1 and missing). |
| D31 | 02 B6 `money.ts`, `money.test.ts` | `Offer.parseJobId: Id.nullable()` after `confirmedAt`; `OfferWithLines` inherits it. New test. |
| D2 | 02 B6 `plan.ts`, `money.test.ts` | `Reminder.offset` is `30 \| 7 \| 3 \| 1`. New test (rejects 14). |
| D38 | 02 B7 `helpers.ts`, `crew.test.ts`; 03 C4 `pipeline.ts`, `index.test.ts`, C5 `migrate.test.ts` and migration grep; 00 §8 | `HelperView.request: z.strictObject({ message: z.string().nullable(), dueDate: IsoDate.nullable() })` (helpers now imports `IsoDate`). New HelperView test. 03 adds `recRequests.message: text("message").notNull().default("")` after `helperLinkId`, in the generated 0000 migration. The schema test checks text/not null/default `""` and column order; the migrate test checks `text`, `NO`, `''::text`; C5 greps the SQL for `"message" text DEFAULT '' NOT NULL`. 00 §8 line: `message text = ''`. |
| Counts | 02 B3, B5, B6, B7, Testing; 03 C4–C7, Success, Testing | 02: scholarships 6, geo 2, impact 7, money 7, crew 9; 11 test files. 03: C4 65, C5 72, C6 86, C7/Success/Testing 91 (index 5, migrate 7). |

Deviation: the column is `NOT NULL DEFAULT ''`, not nullable. 07 G9 inserts `i.message.trim()` and G16 reads `req.message.trim() || null`, which only typecheck on a non-null `string`, and the 07 contract note already says `NOT NULL DEFAULT ''`. A blank note still surfaces as `null` in `HelperView.request.message`.

## Round 1 group C fixes

Source: `plans/reviews/r1-groupC.md` plus D-items D4, D7, D12, D14, D18, D19, D20, D22, D25, D26, D29 and the group A/B handoffs for 12. Plans 09, 10, 11, 12 and 00 §9.5/§9.6 patched. 02 wasn't edited; 11 codes against the field names under follow-ups.

| Finding | File and task | Change |
|---|---|---|
| 09-1 | 09 Decisions, I11 `session.ts`/`session.test.ts` | `onTurn` attaches `.catch` to each `onUsage` promise at creation and logs `agents.usage_failed`; `flush()` can't reject. New test with a rejecting `onUsage`. |
| 09-2 | 09 Decisions | Notes that `learn()` relies on 10's ref filter (10-2); no 09 code change. |
| 09-3 | 09 I11 `session.ts`/test, I12 `crew.ts`, I13 `weekly.ts` | `createCompassSession(..., { submitName })`; cap error says `Call ${submitName} now`. Crew passes `submit_reply`, weekly `submit_plan`. New test asserts `Call submit_plan now`. |
| 09-4 | 09 Decisions, I12 `crew.ts`/`crew.test.ts` | `fallbackText()`: `no_submit` text is used only when ≥ 20 chars and `checkIntegrity` passes against `userText` + history, else `OUT_OF_TIME_TEXT`. New test (short text, 35-word prose). |
| 09 extra (11-1) | 09 I3 `client.ts`/`model/index.ts`, I14 `index.ts`/`index.test.ts`; 00 §9.5 | `usageOf(u: UsageLike)` takes a structural usage type and is exported from the root. |
| 09 counts | 09 I11–I14, Success, Testing | session 9, crew 12, compass 25; total 14 files, 91 tests. |
| 10-1 | 10 Decisions, J1 `tools.ts`/`tools.test.ts` | `FAMILY_HIDDEN_TOOLS` adds `get_test_scores`, `retake_value`; family test checks Prep and Atlas lists. Port side is 12-1. |
| 10-2 | 10 Decisions, J3 `consult.ts`/`consult.test.ts`; 00 §9.5 prose | Every tool is wrapped to record its result JSON; `seen` starts with the context JSON. `keepSeenRefs` drops `factsUsed`/`proposedActions` whose id (whole ref for `calc:`) doesn't appear as a JSON string in `seen`. Two new tests (unknown essay/calc/action dropped; own calc kept). |
| 10-3 | 10 J1 `shared.ts`, J6 `appeal.ts`/`appeal.test.ts`, J7 `retake.ts`/`retake.test.ts` | `dollarAmounts` moved to `shared.ts`. Appeal `check` adds `appealDollarProblems(text, comparisonAmounts(columns))`; prompt says comparison amounts only. New test (`$8,000` retried, clean accepted, fallback passes). |
| 10-4 | 10 J1 `shared.ts`/`tools.test.ts`, J5 `offerParse.ts`/`offerParse.test.ts` | `usageReporter` catches and logs; new `reportUsageOnce` for offer parse. Tests: rejecting `onUsage` flushes cleanly; offer parse keeps the parsed offer. |
| 10-5 | 10 J3 `consult.ts`/test | `quillIntegrityProblems` checks summary, action titles, and uncertainty lines; final failure replaces the summary, clears actions, and drops failing uncertainty lines. New test. |
| 10-6 | 10 Decisions, J1 `tools.ts` | "fixed dummy values" in prose; guard comments on `LEDGER_CALCULATOR_NAMES` and the calculator call. |
| 10 counts | 10 J1, J3, J5, J6, J8, Success, Testing | tools 12, consult 13, offer 4, appeal 8; plan 8 files, 58 tests; package 22 files, 149 tests. |
| 11-1 (D20) | 11 intro, Decisions, K1 `types.ts`, K5 `extract.ts`/`testing.ts`/`extract.test.ts`, K7 `recheck.ts`/test, K9 `anthropic.ts`/test; 00 §9.6 | `CatalogDeps.onUsage?`; `reportUsage` (awaited, logs on failure) and `catalogTurn` in `extract.ts`. Extraction reports per call; `runResearch(send, i, onUsage?)` per turn; `createAnthropicResearcher(apiKey?, onUsage?)`; `BatchItem.usage?` filled by `batchItemOf`; collect reports items at half cost. Tests in extract, recheck, anthropic (×2). |
| 11-2 (D18) | 11 prerequisites, Decisions, K6 `research.ts`/`research.test.ts` | `extractForTask` handles open `user_submission` tasks too; listing untouched. Test: submission gets draft + report, listing row unchanged; other kinds and missing ids still null. Needs the 02 change below. |
| 11-3 | 11 Decisions, K8 `fetch.ts`/`fetch.test.ts`; 00 §9.6 | `redirect: "manual"`, ≤ 5 hops, each hop checked by `isSafeTarget` (literal check + `dns.promises.lookup` all addresses vs `isPrivateAddress`, IPv4/IPv6/mapped). `createFetchPage(fetchImpl?, lookupImpl?)`; 508 after too many redirects; DNS errors throw. Tests: public redirect followed, 302 to `10.0.0.5` = one call + 400, private resolution blocked, redirect cap. DNS rebinding between check and connect is noted as out of scope. |
| 11-4 | 00 §9.6, 11 Decisions/Checklist | §9.6 now says `extractForTask(...): Promise<VerificationReport \| null>`. |
| 11-5 | 11 K1 `types.ts`, K5 fake gateway `fail()`, K7 `collectRecheck`/test, K9 gateway; 00 §9.6 | Per-batch try/catch. `BatchNotFoundError` (thrown by the real gateway on `Anthropic.NotFoundError`) marks the batch `failed` and files a review task per listing; other errors leave it `in_progress`. Test covers both plus a good batch in one run. |
| 11-6 | 11 Decisions, K7 `recheck.ts`/test | `RECHECK_CONCURRENCY = 8` worker pool and `RECHECK_BUDGET_MS = 10 min` (no new listing after). New test. 12 gives the job an hour (12-7). |
| 11 counts | 11 K5–K10, Success, Testing | extract 6, research 7, recheck 12, fetch 9, anthropic 9; 9 files, 65 tests. Index list adds `BatchNotFoundError`. |
| 12-1 (high) | 12 Decisions, L5 `port.ts`/`port.test.ts`, L7 `crew-request.ts` | `createCrewDataPort(core, { audience })`; family reads go through `allows(ownerId, category)` with cached `familyShares`: costs/offers → costs, collegeList/applicationItems → colleges, activities/serviceProgress → activities, deadlines/weekPlan → deadlines, matches → scholarships, stories → stories, essay → essays; testScores and aidChecklist always empty. `crew.request` builds one bound port and passes the same object to `runCrewRequest` and `makeConsult`. Two new port tests cover every gated method. |
| 12-2 (D22) | 12 L5 | Temporary snapshots have no facts or decisions. New test. |
| 12-3 (D19) | 12 L7 `fileCandidates`/test | `confirm_fact` cards → `createCandidate` for crew audience outside temporary rooms; failures logged. New test (one candidate; none from a temporary chat). |
| 12-4 (D20) | 12 L4 `deps.ts`/`deps.test.ts`, `test/helpers.ts`, L12 test | `catalogUsageRecorder(core)` writes `agent_runs` (role `catalog`, null job/user) in both branches and is passed to `createAnthropicResearcher`. L12 asserts one row after extraction. |
| 12-5 | 12 Decisions, L6 `shared.ts`/test | `onUsage` wraps `recordAgentRun` in try/catch and logs `usage.record_failed`; cost still counts. New test (NaN tokens fail validation; job ready and billed). |
| 12-6 (D29) | 12 L5 | Prep/Impact on when the confirmed `crew_prep_enabled`/`crew_impact_enabled` fact is `true` or the data exists; crew facts read in every room. New test. |
| 12-7 | 12 L14 `app.ts`/`app.test.ts` | `SCHEDULE_OPTIONS["catalog.recheck"] = { expireInSeconds: 3600, retryLimit: 0 }` spread into `schedule`. Test expectation updated. |
| 12-8 | 12 L6 | Retry branch bills `agent.costMicros()` with `crewRequest: false` before rethrowing. Retry test asserts 1400. |
| 12-9 | 12 Decisions, L7 `loadCrewInput`/test | Non-owner user lines in history get `Family member: `. Family test checks it. |
| 12-10 (D12) | 12 L1 `package.json` | `--env-file-if-exists=../../.env`. |
| D26 | 12 L6 `shared.ts` | Comment: without retry metadata the comparison is false and the job fails on its first busy error (safe). |
| Group B: offset 30 | 12 L11 `reminders-deadlines.ts`/test | Renewal reminders (`offset 30`, `renewal:` key) get `renewalBody` copy and link to `/scholarships/<slug>`. New test. |
| Group B: `local` | 12 Decisions, L5 | Port strips `local` and sets `excludeScams: true`; test passes `local: true` and gets the same results. |
| Group A: sweep dedupe | 12 Decisions, L10 `sweep-weekly.ts` | Documented: `sweep.student` stays standard; a retried fan-out can queue twice; accepted as idempotent per student/week. 05/06 unchanged. |
| D14 | 00 §9.5 | `checkPrivacy(reply, audience, allowed?)`. |
| 12 counts | 12 L5–L7, L11, L12, L14, Success, Testing | port 8, shared 8, crew-request 9, notices 4, catalog 4; 15 files, 76 tests. |

D-items closed here: D7, D12 (12 side), D14, D18 (11/12 side), D19, D20, D22, D29 (12 side). D4 and D25 stay accepted; D26 is documented.

Declined: none. 10-1(b) is done as 12-1. Reviewer suggested `.default(null)` for the 02 fields; `.optional()` is used instead so 07's existing insert (no draft/report) still typechecks.

Follow-ups for other plans (not edited here):

- 02 `catalog.ts` (D18), before 11 K6 typechecks: in the `user_submission` variant of `CatalogTaskPayload`, after `submittedById: Id,` add
  ```ts
  draft: ListingDraft.nullable().optional(),
  report: VerificationReport.nullable().optional(),
  ```
  and add one test: `CatalogTaskPayload.parse({ type: "user_submission", url, name, notes: "", submittedById, draft: null, report: null })` succeeds and the existing five-key parse still succeeds.
- 16: the `crew_prep_enabled`/`crew_impact_enabled` facts must use `crew` or `crew_family` visibility (12 reads them through `crewVisibleFacts(..., "crew")`).
- 17/18: renewal notifications link to `/scholarships/<slug>`.
- 09/02 (later): `CrewRequestInput` has no requester field, so a parent's current `userText` in a family room is presented as the requester's message without a label. Optional: add `requesterIsStudent: boolean` to `CrewRequestInput` and label it in `buildContextBlocks`.

## F-18-3 openOn

| Item | Where | Fix |
|---|---|---|
| F-18-3 (02) | 02 `scholarships.ts`/test | `ScholarshipQuery.openOn: IsoDate.optional()` and `ScholarshipQueryParams.openOn: IsoDate.optional()`. New parse test (accepts ISO date, rejects other formats); scholarships 7. |
| F-18-3 (07) | 07 G2 prose, `search.ts`/test; 00 §9.4 | `openOnWhere(day)` = `deadline is null or deadline >= day`, applied in SQL by `searchScholarships` when `q.openOn` is set; order stays deadline asc nulls last, then name. `listPublicByState` always applies today in UTC (`todayIn(now, "UTC")`). Two search tests (past deadline excluded, same-day/undated kept, totals; sort across pages) and one state-directory test (UTC rollover). search 11; scholarships 29 / 41; plan 17 files, 96 tests. |
| D18 (02) | 02 `catalog.ts`/test | `user_submission` payload adds `draft: ListingDraft.nullable().optional()` and `report: VerificationReport.nullable().optional()`. One parse test (without, with both, both null); catalog 4. Unblocks 11 K6. |

Plan 18 follow-up: `toQuery` must always pass `openOn: todayIso(now)` (the `openOn` field of `ScholarshipQuery`), so the directory pages and "Next 30/90 days" chips skip closed listings. Not edited: 00 §10 `GET /scholarships` param list doesn't name `openOn` yet.

## Round 1 group D fixes

Source: `plans/reviews/r1-groupD.md`, the D-items below, and two coordinator requests (F-18-1, F-18-3). Plans 13 and 14, 00 §10, and `docs/api/openapi.yaml` patched. Counts: plan 13 is 13 files, 105 tests, 44 route files; plan 14 is 14 files, 81 tests, 77 route files; the web package after both is `Test Files 27 passed (27)`, `Tests 186 passed (186)`. openapi has 121 paths (44 + 77), every `$ref` resolves, and no `operationId` repeats.

| Finding | File and task | Change |
|---|---|---|
| D-13-2 | 13 M12 `billing/webhook/route.ts`, `billing.test.ts`; openapi; 00 §10 | `if (!deps.config.stripeWebhookSecret) throw notFound()` before anything is read. New test: empty secret, event signed with key `""`, expects 404 `not_found` and the subscription still `free`. billing 9. |
| D-13-1, D-13-7 | 13 rules, M4 `http.ts`/`http.test.ts`/`helpers.ts`, M13 `documents/route.ts`/test, M7 magic-link; openapi `PayloadTooLarge` | New `readBytesCapped(req, max, message?)` and `readTextCapped`: a declared `Content-Length` over the cap is refused before reading; otherwise the reader cancels the stream once it passes the cap. Both throw `PayloadTooLargeError` (an `AppError` `invalid_input` whose `status` is 413; no new domain error code). `body(req, schema, maxBytes = JSON_BODY_LIMIT)` (256 KB); `PUBLIC_BODY_LIMIT` (64 KB) on magic-link, verify-hours POST, and the offer tool. Uploads parse `new Response(capped).formData()` with a 10 MB + 64 KB cap and 413 on `File.size`. Test helper `chunkedRequest` (stream body, no `Content-Length`, `pulled()` counter). http tests: JSON cap declared/undeclared/chunked plus public cap; `readTextCapped`. Documents tests: declared-length 413 and a chunked 20 MB upload cut off with no row. |
| D-13-3 | 13 M4 `clientIp`, http test, checklist | Right-most `X-Forwarded-For` hop. The rate test rotates the first hop and still hits 429 on `t:203.0.113.5`. |
| D-13-5 | 13 M15 Step 2, Success Criteria | `test "$(… \| wc -l \| tr -d ' ')" = 44`, a `while read -r` segment-config loop, and `! grep … \| grep -v deps.ts`; all exit 0 and print nothing. |
| D-13-6 | 13 M1 `package.json`, M2 config test | `pg-boss ^10.1.0` and `postgres ^3.4.7` (the 05/03 pins) added to `apps/web` dependencies; the config test asserts every `serverExternalPackages` entry is a direct dependency. |
| D-14-1 | 14 N3, N4, N6, N8, N9 tests; helpers `exhaustAllowance` | One 402 test per job-starting route: `exhaustAllowance` inserts `usage_counters` at the free limit for `2026-10`; expects 402 `limit_reached` and `jobs.sent` equal to `[]` (the crew send also saves no message). essays 7, prep 5, money 7, plan 5, crew 8. |
| D-14-2 (D23) | 13 M4 `http.ts` `studentIdParam`, M10 share-settings; 14 rules and 17 route files | `studentIdParam({ actor, url })` (non-strict `z.object({ studentId: Id.optional() })`, defaults to the caller) replaces the 16 `studentIdOf` copies and `plan/route.ts`'s inline parser; 13's share-settings uses it too. New http test. 00 §10 now has the `?studentId=` note. |
| D-14-3 | 14 N1 report route/test; 00 §10; openapi | The route calls `getScholarship(deps, actor, idOrSlug)` first and reports `listing.id`. The test reports by slug (204) and by unknown slug (404). openapi's `idOrSlug` is a plain string. |
| D-14-5 | 14 N12 route/test | `readTextCapped(req, MAX_CSV_BYTES, TOO_BIG)`; over 5 MB is 413, and a chunked 10 MB CSV stops reading early. |
| D-14-6 | 14 every Step 2/4 | `pnpm --filter @scholarcrew/web exec vitest run <path>`. |
| D-14-7 | 14 N15 Step 3, Success Criteria, Testing Requirements | The gate runs `db:up`, `db:wait`, `db:migrate:test` and expects the package totals 27/186. The inventory expects 77 and `tr`-strips `wc` padding. |
| D12 | 13 M1 `start`, M2 config test | `start` is `node --env-file-if-exists=../../.env node_modules/next/dist/bin/next start -p 3000`; no script uses `--env-file=`. |
| D17 | 13 rules, M2 `next.config.ts`/test, Success Criteria | Root `.env` loading runs only when `NODE_ENV === "development"` (`next dev`). |
| D27 | 13 M13 `GET /documents`, M14 `account/exports/latest/route.ts`; tests; 00 §10; openapi | `listDocuments` (own, newest first, 401 signed out) and `latestExport` (newest unexpired or `null`). documents 8, account 6. |
| D28 | 14 N9 `jobs/route.ts`/test; 00 §10; openapi | `GET /jobs?active&limit`: `z.stringbool()` and `limit` 1..50 into `crew.listJobs`. Test covers order, active filter, limit, 400s, 401, other users' jobs hidden. |
| D30 | 13 M6 `middleware.ts`/test | Pass-through is `NextResponse.next({ request: { headers } })` with `x-pathname` set, overwriting a client-sent value. Asserted through `x-middleware-request-x-pathname`. |
| D31 | 14 N6 money test; 00 §10; openapi `Offer.parseJobId` | `toHaveProperty("parseJobId", null)` on list and detail. |
| D33 | 14 N2 `recommendations/route.ts`/test; 00 §10; openapi | `GET /recommendations` → `listRecRequests` (newest first, `helperLinkId`, own only). colleges 8. |
| D36 | 14 N11 `admin/catalog-tasks/[id]/route.ts`, GETs on `admin/scholarships` and `admin/scholarships/[id]`; tests; 00 §10; openapi `PageScholarship` | `GET /admin/scholarships?status&q&page` (`page` defaults to 1), `GET /admin/scholarships/:id` (any status), `GET /admin/catalog-tasks/:id`. Two tests. admin 7. |
| D37, F-18-1 | 13 M6 `protected.ts`/test, M10 `family/invites/preview/route.ts`/test; 00 §10; openapi | `GET /family/invites/preview?token=` is `auth: "none"` with `family.invite-preview` 30/hour per IP. `PUBLIC_EXCEPTIONS = ["/family/join"]` makes the join page reachable signed out (18's page already has a signed-out branch); the rest of `/family` stays protected. The test covers the preview fields, no invitee email, 404 unknown or used, 400 with no token, and 429. family 8. |
| F-18-3 | 14 N1 search test; 00 §10; openapi | `openOn` passes through `ScholarshipQueryParams` (no route change). The search test excludes a closed listing with `openOn` and includes it without; `openOn=today` is 400. |

Declined or deferred:

- D-13-4 (verify as a state-changing GET): declined for R1, as the review allows. A move to POST needs an 18 confirm page and a §10 change. Mail scanners using up tokens is the real risk, so revisit if support reports `?error=link` after a single click.
- D-14-4 (`@scholarcrew/catalog/csv`): deferred. Plan 11 exports only `.` and `./testing`, so switching now would break 14's typecheck. N12 says to switch once 11 adds the subpath.

Follow-ups for other plans (not edited here):

- 00 §3: the secrets rule should allow `apps/web/next.config.ts` to load the root `.env` under `next dev` only (D17). 00 §9.7: list `body(req, schema, maxBytes?)`, `readBytesCapped`, `readTextCapped`, `PayloadTooLargeError`, `JSON_BODY_LIMIT`, `PUBLIC_BODY_LIMIT`, `studentIdParam`, `clientIp` (right-most hop), `requireScope`, `fileResponse`, `cors: "extension"`, `extensionPreflight`, and `RouteCtx.scopes`. 00 §3 error table: 413 is `invalid_input` with status 413.
- 11: add a `"./csv": "./src/csv.ts"` export (`parseCsv`, `parseScorecardCsv`, `parseScorecardCsvWithErrors`, `ScorecardError`), then 14 N12 imports from it (D-14-4).
- 16: delete `src/lib/owned.ts` and read `GET /documents` and `GET /account/exports/latest` (D27). The background panel reads `GET /jobs?active=1&limit=10` instead of `sessionStorage` (D28). Do the onboarding redirect in the `(app)` layout from `headers().get("x-pathname")` and keep the client gate as a fallback (D30). The header is only set on the middleware's matcher paths. `api()` should show a 413 `invalid_input` message for uploads.
- 17: on offer upload, follow `GET /jobs/:id/events` when `parseJobId` is set (D31). The recommendations page lists `GET /recommendations` and matches `helperLinkId` to `GET /helper-links` (D33). Report links may use the slug (D-14-3). The upload UI should check file size before sending; the server answers 413 past 10 MB.
- 18: use `GET /admin/scholarships`, `GET /admin/scholarships/:id`, and `GET /admin/catalog-tasks/:id` and delete `components/admin/adminReads.ts` (D36). `/family/join` is now public: call `GET /family/invites/preview?token=` and show the inviter, role, and expiry signed out and signed in (D37, F-18-1). `toQuery` passes `openOn` (F-18-3; §10 now lists it). The public offer tool page should expect 413 past 64 KB.

## Round 1 leftovers

Source: the "Round 1 group D fixes" follow-ups for 00, 11, and 14, plus D17 and D23. Plan 13 is unchanged: its `transpilePackages` already lists `@scholarcrew/catalog`, which covers the new subpath, and `apps/web` already depends on the package.

| Item | Where | Change |
|---|---|---|
| D17 | 00 §3 Secrets | `apps/web/next.config.ts` may load the repo-root `.env` only when `NODE_ENV === "development"` (`next dev`); never under build, start, or Vitest. Matches 13 M2. |
| D-13-1, D-13-7 | 00 §3 Errors | Note under the error table: body caps JSON 256 KB, public 64 KB, uploads 10 MB, CSV 5 MB; over the cap is 413 `invalid_input` (`PayloadTooLargeError`, no new code). |
| 13 additions | 00 §9.7 | Signatures from 13's http.ts/deps.ts: `RouteCtx.scopes`, `route` option `cors?: "extension"`, `body(req, schema, maxBytes?)`, `JSON_BODY_LIMIT`, `PUBLIC_BODY_LIMIT`, `PayloadTooLargeError`, `readBytesCapped`, `readTextCapped`, `studentIdParam(ctx: { actor; url })`, `clientIp(req)`, `requireScope(ctx, scope)`, `fileResponse(bytes, contentType, filename)`, `extensionPreflight(req)`, `devRoutesEnabled()`. Prose names the other 13 exports (`setDepsForTests`, `resetDepsForTests`, `buildDeps`, `createLazyJobsClient`, `stripeSecretKey`, `parseCookie`). |
| D23 | 00 §10 | Already present (`?studentId=` note); no edit. |
| Status | 00 §15 | Every plan 01–21 reads "drafted; round 1 reviewed". |
| D-14-4 | 11 K1 `package.json`, header, K10 `index.test.ts`, Success Criteria, Testing Requirements, Review Checklist; 00 §9.6 | `"./csv": "./src/csv.ts"` (`parseCsv`, `parseScorecardCsv`, `parseScorecardCsvWithErrors`, type `ScorecardError`). New index test: the manifest maps `./csv`, the module's runtime exports, its only import specifier is `@scholarcrew/domain`, and domain's dependencies have no `@anthropic-ai/sdk` or workspace package. New gate grep on `csv.ts` imports and `packages/domain`. index 2; plan 11 is 9 files, 66 tests. |
| D-14-4 | 14 N12 route, prose, Success Criteria, Review Checklist | Import route uses `@scholarcrew/catalog/csv`; gate `grep -rn 'from "@scholarcrew/catalog"' apps/web/src/app/api/v1` prints nothing. Test counts unchanged. |

## Round 1 18/20 fixes

Source: `plans/reviews/r1-groupF.md` (every F-18 and F-20 finding), D36–D41 and D45, the F-18-3 `openOn` follow-up, and the "Round 1 group D fixes" follow-ups for 18. Only plans 18 and 20 were patched. Counts: plan 18 is 24 test files and 99 tests (public 14 / 54, auth 2 / 15, admin 8 / 30). Plan 20 is 9 test files and 134 tests.

| Finding | File and task | Change |
|---|---|---|
| F-18-1, D37 | 18 R8 `JoinInvite.tsx`, `family/join/page.tsx`, `JoinInvite.test.tsx` | New client `InvitePreview` calls `GET /family/invites/preview?token=`. It shows "<inviter> invited you to join as a <role>. The invite expires <date>." and renders its children while the preview loads, once it's ready, or if the check fails. A `not_found`/`invalid_input` invite shows only `INVITE_GONE`. The page renders it signed out (above the sign-in button) and signed in (around accept). Tests: signed-out preview (fetch URL, GET, text), unknown invite (no inviter name, no token, no sign-in link), and a rate-limited check that keeps the children. JoinInvite 8. |
| F-18-2 | 18 R10 new `(public)/error.tsx`, `(admin)/error.tsx`, `h/[token]/error.tsx`, `verify-hours/[token]/error.tsx`, `components/public/ErrorState.tsx`, `error.module.css`, `errorPages.test.tsx`; Files; Checklist | `"use client"` boundaries pass only `reset` to `ErrorState` (`EmptyState` "Something went wrong on our side" plus a Try again `Button`). Tests: `reset` is called, and the rendered HTML never contains the message, digest, or a token. A source scan also bans `error.message/digest/stack`, `useParams`, `usePathname`, `useSearchParams`, and `console.`. errorPages 2. |
| F-18-3 | 18 R4 `listings.ts` `toQuery`/test, R5 `directoryPages.test.tsx` | `toQuery` always sets `openOn: todayIso(now)`, and `deadlineBefore` builds on the same day. The test expectations include `openOn: "2026-10-06"`, plus a Central rollover case. New directory test: a closed listing isn't shown (including in Next 30 days), and a same-day listing is kept and sorted first. The state test adds a closed TX listing. directoryPages 4. |
| F-18-4 | 18 R5 `directory/[state]/page.tsx`/test | `listPublicByState` is gone. The state total comes from `searchScholarships` (pageSize 1, same `openOn`). The subline reads `N listings`, or `X of N match your filters` when a filter is set, and the test asserts "1 of 2 match your filters". |
| F-18-5 | 18 R13 `listingForm.ts`/test, `admin/scholarships/new`, `[id]`, R14 `admin/tasks` | `seasonFor` and its two assertions are deleted. The pages call `currentSeason(deps.clock.now())` from `@scholarcrew/core/shared`, and the count is unchanged. |
| F-18-6 | 18 R7 `messages.ts` (`SIGNIN_EMAIL_KEY`), `SignInForm.tsx`, `CheckEmail.tsx`, `check-email/page.tsx`, test | `SignInForm` saves the address in `sessionStorage` (`sc_signin_email`) and pushes `/sign-in/check-email` with no query. `CheckEmail` takes no props, reads the address on mount, and calls `router.replace("/sign-in")` when it's missing. Tests cover the push and the stored value, plus a new missing-address test. SignInForm 7. |
| F-18-7 | 18 R3 terms, R7 `CheckEmail` | Both "sign out everywhere/every device" sentences are removed. |
| F-18-8 | 18 R13 `admin/scholarships/page.tsx`, R15 `admin/audit/page.tsx` | `EmptyState` "No listings match" and "No events match these filters" replace empty tables. |
| F-18-9 | 18 R8 page, R7 `joinErrorMessage` | The page checks `AcceptInviteInput.safeParse({ token })` before anything else and shows the incomplete-link card, signed in or out. `joinErrorMessage` maps `invalid_input` to the not-found text. Asserted with `short-token`. |
| D36 | 18 R11, R13, R14; Files; deviations | `adminReads.ts` and `adminReads.test.ts` are deleted. Pages call core `getScholarshipForAdmin`, `listScholarships`, and `getCatalogTask`, the functions the 14 admin GET routes wrap. Server components call core, so they don't fetch their own API. `not_found` turns into `notFound()` or "nothing selected". `/admin/scholarships` reads `?page=`, adds a pager, and shows `${total} listings`. R11 is 1 file, 2 tests. |
| D38 | 18 R9 `HelperSheet.tsx`/test | The fixture gains `request: { message: null, dueDate: null }`, which fixes `tsc`. A "What <name> is asking for" card comes first in the left column, with the quoted note and "Helpful by <calendarLong>". New test with both fields set, then due date only. HelperSheet 5. |
| D39 | 18 R1 `seo.ts`, R4 test, R5 pages | `publicListing.ts` and every `.filter(isPublicListing)` are removed, and the sitemap does `out.push(...res.items)`. listings 9. |
| D40 | 18 deviations | Reworded as accepted: Release 1 has only Publish and Reject. |
| D41 | 18 R1 `states.ts`, R4 `listings.ts`/test, R5 pages, R14 `review.ts` | The `STATE_NAMES` copy and `areaLabel` are deleted. `STATE_NAMES` and `localLabel` are imported from `@scholarcrew/domain`, and the area test now exercises the domain `localLabel`. |
| Group D follow-ups | 18 R6 `OfferTool.tsx`/test, R9 `pageRate.ts`/test | A 413 from the 64 KB public body cap shows `TOO_BIG` (OfferTool 4). `allowPageRequest` uses 13's `clientIp` (the right-most hop), so the page charges the same bucket as the route, and the test sends a spoofed first hop. |
| 18 counts | 18 R4–R16, Success Criteria, Testing Requirements, Review Checklist | Running totals: R4 27, R5 31, R6 40, R9 47, R10 14 files / 54, R7 7, R8 15, R11 2, R12 10, R13 17, R14 26, R15 30. Gate 24 / 99. The checklist lists the D-items as adopted. |
| F-20-1 | 20 design notes, T7 `messages.ts`, T8 router/tests, T9 popup/tests | New `save-preview` returns `{ ok, url (hash cleared), title, selectedText }` and makes no API call. The popup shows the URL, title, and selection, with an "Include selected text" box that's checked only when there's a selection. Only "Send to Scout" sends the strict `{ type: "save-page", title, includeSelection }`. The router re-reads the tab, clears the hash, and sends `selectedText: ""` when the box is unchecked. Router and popup tests cover each step. |
| F-20-2 | 20 T7–T9, Files | New `src/zod-config.ts` is the first import in `content.ts`, `background.ts`, and `popup.ts`. The inline `z.config` calls are gone, and an `autofill.test.ts` case checks the first import. |
| F-20-3 | 20 T2 `normalizeAppUrl`/test | `http:` is allowed only for `localhost`, `127.0.0.1`, and `[::1]`; any other host gets "Use https:// for anything but your own computer." `it.each` covers 3 accepted and 3 rejected URLs. |
| F-20-4, D45 | 20 T5 `fill.ts` | Imports `STATE_NAMES` from `@scholarcrew/domain`, guarded by `USState.safeParse`. The local table is gone. |
| F-20-5 | 20 T2 `restrictToTrustedContexts`/tests, T8 `background.ts`, design note | At startup the worker sets `chrome.storage.local` to `TRUSTED_CONTEXTS`, and returns false if the API is missing. Execution has to confirm `@types/chrome` 0.0.326 and Chrome 120 support; otherwise keep the source scan. |
| F-20-6 | 20 structure, design note | `## Files` section. The contract note now reads "Relies on 13 `route({ auth: "bearer", cors: "extension" })` and `extensionPreflight` (D11/D16), and on 06 secrets `sct_` + 43 base64url characters." |
| F-20-7 | 20 Success Criteria | Already had `pnpm --filter @scholarcrew/extension build`. |
| 20 counts | 20 T1–T9, Testing Requirements | manifest 4, settings 28, api 9, fields 30, fill 12, panel 9, autofill 9, router 18, popup-app 15: 9 files, 134 tests. |

D-items closed on the 18/20 side: D36, D37, D38, D39, D40 (accepted), D41, D45. D15 stays accepted.

Follow-ups for other plans (not edited here):

- 00 §11 admin row: add `/admin/scholarships` and `/admin/scholarships/new` (F-18-10).
- 00 §13 (phase 9 on) and 01 `ci.yml` (after the web build): add `pnpm --filter @scholarcrew/extension build` (F-20-7).
- 00 §9.7: list `clientIp` as used by 18's `pageRate.ts` (already in the group D follow-up list).

## Round 1 17 fixes

Source: `plans/reviews/r1-groupE.md` (E-17-1..E-17-13), D23, D31, D33, D34, D35, D44, D47, and the group D follow-ups for 17. Only `plans/17-web-pipeline.md` was edited. Counts: 30 files, 117 tests (scholarships 32, essays 30, colleges 16, money 20, prep 9, impact 10). The Gate is now Q32.

| Finding | File and task | Change |
|---|---|---|
| E-17-1 (high) | 17 Q9 `text.ts`/`text.test.ts`, Q12 `ReviewView.tsx` | `Segment.start` (body offset: `at` for plain text, `p.start` for a mark). `ReviewView` uses `key={s.start}` for both elements; no index keys remain. Test expectations add `start` (0, 31, 46, 65, 83; 0 for no comments). `comments.forEach` became `for … of entries()`. |
| E-17-2 (D35) | 17 Q1 `shared.module.css`, Q2 `ContextCrew.tsx`/test, Q8, Q19 pages | `ContextCrew` keeps only the room header and renders 16's `Thread` (P12 props: `conversation`, `messages`, `chips`, `compact`, `placeholder`, `emptyText`, `timeZone`). 16's `Thread` takes no room prop and needs a `Conversation`, so a room that doesn't exist yet shows "Ask your crew here", which calls `POST /conversations`, then mounts `Thread` and refreshes. The composer, send, stream, crisis chip hiding, and refresh are 16's. Thread CSS was dropped from `shared.module.css`. Pages pass `conversation`/`messages` and role-tagged `chips`. Tests (5): open then send, open room with chips, crisis hides chips, lost stream re-enables Send, essay room and open error. |
| E-17-3 | 17 Q2, Q14 `essays/[id]/page.tsx`, `EssayPages.test.tsx` | `ContextRoom` adds `"essay"` ("Crew room · this essay", lead `quill`). The studio's left column finds `room === "essay" && roomRefId === essay.id` for students only. Page test covers student and parent. |
| E-17-4 (ES-08) | 17 Q15 `StoryBank.tsx`/test, title | "Capture a new story with Quill" card (students only): optional "Paste a past essay" and a "Start a story interview" link to `/crew?ask=…`, capped at 4,000 characters. New test. ES-08 claimed. |
| E-17-5 (AID-04/05) | 17 Q20 CSS, Q21 `AidChecklists.tsx` (`AidHelpCards`), test, `/money` | Implemented, since §12 maps AID-04/05 to 17 and the package covers R1–R3. "Family finances changed?" (steps, documents, Ask Aid prefill) and "Selected for verification?" (documents, Ask Aid prefill to track the steps as plan items). Parents see the cards without links. New test. The deviation records that no verification checklist is stored. |
| E-17-6 | 17 Q12 `CommentsPanel.tsx`/`Review.test.tsx` | Reads `error: streamError`; `working` is false once it's set; the alert shows it. New test: a CLOSED `error` clears "Quill is reading" and re-enables Ask Quill. |
| E-17-7 | 17 counts | Review 6 (one new test on top of the 5). Every Step 4, the Gate, and Testing Requirements were recounted from the code blocks. |
| E-17-8 | 17 new Q31 `scholarships/assets.test.ts`, Files | 16's patterns over `app/(app)/<area>` and `components/<area>` for the six areas, excluding tests; CSS also refuses `http(s)://`. Step 2 plants a `next/script` import to see it fail. |
| E-17-9 | 17 Q27 `prep/page.tsx` | Parents get "Test scores stay private to your student" instead of `NotShared`; the student branch no longer needs `readShared`. |
| E-17-10 | 17 Q20 CSS `.srOnly`, Q22 `OfferComparisonView`/test | The chip is `aria-hidden` with a hover title, followed by a visually hidden "Page n: cited text". The view stays a server component. Test expectations include the hidden text. |
| E-17-11 | 17 Q11 `EssayEditor`, Q30 `ActivitiesEditor` | The running count has no `aria-live`; only the near/over badge sits in an `aria-live="polite"` span. |
| E-17-12 | 17 Q16 `colleges.ts`, Q19 page, Q25 `prep.ts` | `bestOfficial(scores, test: TestKind)` lives in `colleges.ts`. The college page imports it, and `prep.ts` re-exports it, so the prep test and page are unchanged. |
| E-17-13 | 17 Q30 `/impact`, deviations | "Ask Impact for ideas" links to `/crew?prefill=@Impact suggest local service that fits my interests and requirement gaps`. The deviation says no listings are claimed as verified. |
| D23 | 17 rules | Parent views pass the viewer's `studentId` to every service; no client component in a parent view reads over HTTP. |
| D31 | 17 Q20 fixture, Q23 `UploadLetter.tsx`/test | With `parseJobId`, `useJobStream` follows `GET /jobs/:id/events`, then one `GET /offers/:id`. With null, or a dropped stream, it polls as before. New SSE test. Fixture adds `parseJobId: null`. |
| D33 | 17 Q16 `pastRequests`/`REC_STATUS_LABEL`/test, Q19 `Recommenders.tsx`/page/test | The page calls `listRecRequests` and `listHelperLinks` and matches `helperLinkId`. The component lists "Letters you asked for" with link state (open until, expired, turned off) and refreshes after a request. The URL stays email-only. Two new tests (colleges, CollegeDetail). |
| D34 | 17 Q14 `essays/page.tsx`, `EssayWorkspace.test.tsx` fixture | Length comes from `latestWordCount` (no `getEssay` per row). "For" names come from the college list and board, with type labels as the fallback. The fixture adds `latestWordCount`. |
| D44 | 17 Q8 page/test | `getScholarship` takes the renewal link's slug. A won renewable award shows the renewal terms and a reminder note. New test. |
| D47 | 17 Q14 `NewEssayForm.tsx`, `essays/page.tsx`, `EssayPages.test.tsx` | "Start a new essay" form (`aria-label="New essay"`, `id="new-essay"`): Title, Prompt, Word limit (optional, 1–5,000), and For (general, `college:<id>`, `scholarship:<id>`). It posts `POST /essays` and then `router.push`es to the studio. Students only. Two form tests plus the list-page test. |
| Group D: report slugs | 17 deviations | The report dialog sends the listing id; the route also accepts a slug. No code change. |
| Group D: upload size | 17 Q23 | Type and size are checked separately before anything is sent ("This file is over 10 MB…"), so a 413 never happens from this form. Asserted with no fetch. |

Declined: none. E-17-2 took the review's preferred route as far as 16's current props allow; the lazy-room part waits on 16 (below).

Follow-ups for 16 (17 codes against these; all additive):

- Keep `Thread`'s P12 props and behavior: the textarea label "Message your crew", `placeholder`, `chips` that fill the composer, chips hidden after a crisis reply, `busy` false once the stream sets `error`, and `router.refresh()` after send and after a terminal job. 17's tests match `JobProgress`'s error text with `/Refresh to check on your crew/`, so keep that phrase in both the lost-connection and the reconnect-cap messages.
- Keep `useJobStream(jobId): { job, error }`. 17's fake `EventSource`s set `readyState = CLOSED` (and define the static `CONNECTING`/`OPEN`/`CLOSED`) before a fatal `error`, so E-16-1's "ignore while CONNECTING" works with them.
- Optional: `ThreadProps.conversation: Conversation | null` plus `openRoom?: { room: RoomKind; roomRefId: string }` (create on first send). Then 17 drops the "Ask your crew here" button and the `POST /conversations` call from `ContextCrew`.
- Export `isLimit(e)` from `src/lib/api.ts` (E-16-6). Then 17 adds the "See plans" link next to 402 alerts in `CommentsPanel`, `AppealButton`/`JobReply`, `RetakeForm`, and `UploadLetter`.
- E-16-2: parents reach 17's shared views (`/scholarships`, `/essays`, `/essays/stories`, `/impact`). `/prep` needs no parent nav item; it shows parents a private-scores card.

Follow-ups for other plans:

- 08/14 (AID-05, optional): a `verification` program in `getAidChecklists`, so verification documents can be tracked as checklist items rather than plan items.
- 19: create essays through the `/essays` form (form "New essay", fields "Title", "Prompt", "Word limit (optional)", select "For", button "Create essay") instead of `POST /essays` (D47).

## Round 1 15/16 fixes

Source: `plans/reviews/r1-groupE.md` (E-15-1..E-15-4, E-16-1..E-16-8, the E-17 items that need 16), D9, D23, D27, D28, D29, D30, D35, D43, the group D follow-ups for 16, and the "Round 1 17 fixes" follow-ups for 16. Plans 15 and 16 and 00 §9.8/§9.9 patched. Counts: 15 is 29 files, 106 tests; 16 is 29 files, 152 tests (lib 28, shell 28, week 24, crew 22, onboarding 15, settings 14, memory 10, family 11).

| Finding | File and task | Change |
|---|---|---|
| E-15-1 | 15 O13 `Modal.tsx`/test, Testing, Checklist; 00 §9.9 | `dialogRef`; Tab from the last focusable wraps to the close button and Shift+Tab from the first wraps to the last; Escape closes only when focus is inside the dialog (stacked modals close one at a time); focus still returns to the opener. Two tests (Tab wrap; Shift+Tab wrap with a second modal that ignores the Escape). O13 8. |
| E-15-2 | 15 Notes | "Section 7 runs 15 in phase 3, in parallel with 03, 04, and 05." |
| E-15-4 | 15 O14 `AppShell.tsx`/CSS/test; 16 P4 `globals.css`, P7 `ShellFrame`; 00 §9.9 | `AppShellProps.className?` (outer frame) and `mobileNav?: ReactNode` rendered inside the frame with class `withMobileNav`, which hides the sidebar and pads the content under 640px. 16 passes `className="sc-shell"` and the tab bar as `mobileNav`; the `.sc-shell > div > aside` rules are gone. Two tests. O14 11. |
| E-16-1 | 16 P3 `sse.ts`/test, exports list; 00 §9.8 | `useJobStream(jobId, opts?: { pollMs?; maxMs? })`. A terminal `job` closes the stream. `end` before a terminal status, or an `error` while reconnecting, closes it and polls `GET /jobs/:id` (now, then every 3 s) until terminal. A 4xx or non-job poll answer, 3 network/5xx failures in a row, or a CLOSED stream gives "Lost the live connection. Refresh to check on your crew."; 15 minutes gives "Still working. Refresh to check on your crew." Tests: terminal close without polling, error then poll, early end then poll, failing polls and 404, maxMs, CLOSED fatal. sse 9. |
| E-16-2 | 16 P5 `nav.ts`/test, P7 layout/`AppLayout.test.tsx`, P13 crew pages/`CrewPage.test.tsx` | `navFor`/`mobileTabsFor` take `shared?: ShareCategory[]`, and there's a new `sharedCategoriesOf`. Parents get Crew chats (`/crew`), plus Scholarships, Essays or Story Bank (`/essays/stories`), and Service (`/impact`) when `scholarships`, `essays`/`stories`, or `activities` are shared. The layout reads `getFamily` + `getShareSettings(deps, actor, studentId)`. `/crew` sends parents to the family room (opened with `createConversation`, else `/family`), and `/crew/[id]` renders it for parents (Thread with read-only cards) and 404s every other room. |
| E-16-3 | 16 P16 `NotificationsCard`/test, title | "Mobile number" (`type="tel"`, E.164, "Use the format +15125550123") with Save number, and "Text me 1-day reminders" disabled until `phoneSet`. Marked NO-05 (R3) per features.md; §12 already maps NO to 16. New test. |
| E-16-4 | 16 Files, P7 `(app)/error.tsx`, `(app)/loading.tsx`, `boundaries.test.tsx` | Error: Card "Something went wrong on our side", EmptyState, Try again calls `reset()`, never shows `error.message`. Loading: `aria-busy` card "Loading…". Two tests. |
| E-16-5 | 16 P6 `NotificationBell`/test | `useId` panel id with `aria-controls`; opening focuses the first button in the panel; Escape closes and refocuses the bell; a mousedown outside closes it. Two tests; bell 5. |
| E-16-6 | 16 P2 `api.ts`/test, P12 `Thread`; 00 §9.8 | `isLimit(e)`. Thread shows `<Button variant="soft" size="sm" href="/settings">See plans</Button>` next to a 402 alert; the 402 test asserts it. |
| E-16-7 | 16 P5 `rosterFor(enabled, role?)`, P13 `AddTeammate` | "add" links go to `/crew#add-teammate` (the AddTeammate wrapper has that id); parents get none. |
| E-16-8 | 16 title | HL-01, HL-04, EX-01, ID-04, NO-05 listed. |
| D9 | 16 P15 | Already done: the upload step says past essays go into a Quill story interview. No change. |
| D23 | 16 P10, P7 | Already done on 16's side (This Week calls `getThisWeek(deps, actor, studentId)`); the layout's share lookup passes the student id too. |
| D27 | 16 Files, P17 settings page, `DataCard`/test, deviations, Checklist | `src/lib/owned.ts` deleted. The page calls `listDocuments` and `latestExport` (the services behind `GET /documents` and `GET /account/exports/latest`; server components call core). "Check again" calls `GET /account/exports/latest`. New test; data 5. |
| D28 | 16 P13 `BackgroundJobs`/test, `jobMemory` comment | Lists `GET /jobs?active=1&limit=10`, labels this tab's questions from `sessionStorage` and others by kind, refreshes every 15 s while something runs, and shows list errors. Two tests. |
| D29, D43 | 16 P13 `AddTeammate`, P5 comment | `POST /facts` body `{ key, value: true, visibility: "crew" }`. Asserted in `CrewPage.test.tsx`. |
| D30 | 16 P7 layout/`OnboardingGate`, deviations | Unfinished students are redirected on the server from `headers().get("x-pathname")`; with no header the `SetupFrame` + client `OnboardingGate` fallback stays. Tested for all three cases. |
| D35, 17 follow-ups | 16 P12 `Thread`/test, exports list; 00 §9.8 | All existing `ThreadProps` kept. `conversation` widened to `Conversation \| null`. Added `openRoom?: { room: "scholarship" \| "college" \| "essay"; roomRefId: string }` (the first send POSTs `/conversations` with `{ room, roomRefId, familyId: null, title: "" }`, then sends) and `readOnly?: boolean` (no chips or composer; cards read-only). Both stream error strings contain "Refresh to check on your crew". Two tests; thread 7. |
| Group D: 413 | 16 P2 `api.ts`/test | A 413 without an `ErrorBody` becomes `invalid_input` "That's too big to upload. Files can be up to 10 MB." |
| Exports | 16 top of file | "Exports for 17/18" lists `api`/`ApiError`/`apiUrl`/`errorMessage`/`isLimit`, `useJobStream` and its constants, `Thread`/`ThreadProps`/`DEFAULT_CHIPS`, `ReplyCard`, `requireAppActor`/`loadMe`, the format helpers, the nav helpers, and the `(app)` boundaries. |

Declined or deferred:

- E-15-3 (add 15 to §12 SE-02..SE-07) and the §12 half of E-16-8 (add 16 to the HL and EX rows): these are 00 §12 edits, which are outside this patch's scope (only §9.8/§9.9). The coordinator should apply them.
- E-16-1's "ignore errors while CONNECTING and let the browser reconnect": replaced by the requested design, which closes and polls instead. CLOSED errors are final at once, so 17's fakes behave as before.
- E-16-2's "parents read private rooms when `chats` is shared": 08 never lets parents read private rooms, so parents' Crew chats is the family room. Follow-up for 08 if `chats` should open private rooms read-only.

Follow-ups for other plans (not edited here):

- 00 §5: add `src/app/(app)/error.tsx` and `src/app/(app)/loading.tsx` to the plan-16 line (E-16-4). 00 §12: add 15 to the SE-02..SE-07 row (E-15-3), and add 16 to the HL (HL-01, HL-04) and EX (EX-01) rows (E-16-8).
- 17: parents now reach `/scholarships`, `/essays` or `/essays/stories`, and `/impact` from the nav, so those pages must allow `requireAppActor(["student", "parent"])` (they already do through `readShared`). Optionally switch `ContextCrew` to `<Thread conversation={room ?? null} openRoom={{ room, roomRefId }} …>` and drop its "Ask your crew here" step; don't `key` the Thread on the conversation id for a lazy room. Use `isLimit` for the "See plans" links. Tests that emit a non-fatal `error` (no `readyState = CLOSED`) or an early `end` must stub `GET /api/v1/jobs/<id>`.
- 08 (optional): a read-only path for parents to private rooms when `chats` is shared, if ID-04's "crew chat when shared" should mean more than the family room.

## Round 1 19 fixes

Source: `plans/reviews/r1-groupG.md` (G-19-1..G-19-19), D46–D50, and the "Round 1 15/16 fixes", "Round 1 17 fixes", and "Round 1 18/20 fixes" sections. Only `plans/19-e2e-evals.md` was edited. Every selector was re-grepped against the current 16, 17, and 18. Counts: e2e still 17 tests in 12 specs; evals `check` is 11 files, 42 tests (privacy 4; running totals 3 → 15 → 22 → 28 → 34 → 42); still 6 scenarios and 18 cases.

| Finding | File and task | Change |
|---|---|---|
| G-19-1 (high) | 19 S2 `users.ts` `signInViaUi` | Expects `/\/sign-in\/check-email$/` (F-18-6: no query) and the address in CheckEmail's `<b>` (`getByText(s.email, { exact: true })`). |
| G-19-2 (high) | 19 S6 `offers.spec.ts`, intro | Upload steps scoped to the "Add an award letter" Card section; the link is `p` "Aid labeled every line." → "Review the lines", so the "Letters in progress" copy can't collide. The test also waits for the `GET /jobs/:id/events` request that `UploadLetter` opens from `parseJobId` (D31). |
| G-19-3 (high) | 19 S9 `admin.spec.ts` test 2, intro | `NO_SUCH_ID` removed. The student submits a real local listing, `POST /admin/scholarships/<its id>/status` gets 404 `not_found`, and a fresh visitor still gets 404 for its slug. Count stays 2. |
| G-19-4 (high) | 19 S10 `isolation.spec.ts`, intro, Testing Requirements | The admin publishes a listing due in 21 days, A saves it, A's crew job is awaited with `waitForJob`, and the probe uses `replyWithCard(…, "next-deadline").id`. After the probes the card is still unapplied and A's own apply returns 200. Added a probe for the offer's `parseJobId`: 19 probes. |
| G-19-5 | 19 S20 Step 3 | `pnpm test > /tmp/sc-test.log 2>&1; status=$?; echo "pnpm test exit $status"; test "$status" -eq 0 && ! grep -qE "@scholarcrew/(e2e\|evals):test" /tmp/sc-test.log && echo "not in pnpm test"`. Exits 1 on a failing `pnpm test` or a match. |
| G-19-6 | 19 S1 `env.ts` `assertE2eDatabase`/`e2eDatabaseUrl`, `stack.ts` `prepareDatabase`, Notes, Step 4, Checklist | Throws `Refusing to reset <name>: the e2e database name must end in _e2e and differ from DATABASE_URL and TEST_DATABASE_URL`; both `e2eDatabaseUrl()` (so `support/db.ts` too) and `prepareDatabase` call it. Step 4 runs it against the dev database and expects the refusal. |
| G-19-7 | 19 S1 `stack.ts`, Notes, Step 4, Checklist | `stopAll()` is a shared promise: SIGTERM each child's process group, poll `kill(-pid, 0)` until every group is empty or 10 s pass, SIGKILL the rest, log `e2e.stopped`, then exit. `prepareDatabase` runs `pg_terminate_backend` on the e2e database's other connections before migrating. Step 4 checks `ps` after Ctrl-C. |
| G-19-8 | 19 S18 `privacy.ts` `familyCase`/`sharedPhrases`, `privacy.test.ts`, counts | New property "unshared essay and story text never reaches a family-audience prompt" over `ctx.model.captured`. Validation now also refuses phrases found outside the essay and Story Bank or in the question. The family test asserts it's ok; a new test pushes a captured request carrying `ESSAY_PHRASES` and sees it fail with "found in compass requests". S18 8 / 34; S19, S20, Success Criteria, Testing Requirements 42. |
| G-19-9 | 19 S3 `onboarding.ts` `waitForFirstPlan`/`signUpStudent`, S4 intro, Notes | `signUpStudent` polls `GET /plan/this-week` until `crewWorking` is false (120 s), so the onboarding `weekly_plan` job is finished before any spec counts plan items. |
| G-19-10 | 19 Files, S14 Step 1 and Step 5, S20 Step 1, gaps | `evals/reports/.gitignore` removed everywhere (01 ignores the directory; `writeReport` creates it). G6 closed. |
| G-19-11 | 19 S19 `math.ts` `gap-if-win`, `mathCase` | Reads `portData().costs` for `JORDAN.collegeId`, `required: [c.gapIfPendingWinUsd]`, `extra: []`. Validation adds `computeGap(c).gapIfPendingWinUsd === c.gapIfPendingWinUsd` (through a new `problems` field) and refuses an empty `required`. |
| G-19-12 | 19 Notes, gaps | Line 11 and G2 now name 13's right-most-hop `clientIp` (D50). G4, G6, G9 dropped; G5 became the S5 change below. A "Closed in round 1" line lists them. |
| G-19-13 | 19 S9 `admin.spec.ts` test 1 | Comment says fake mode has no draft and one Publish button; asserts `toHaveCount(1)` before clicking (no `.last()`). |
| G-19-14 | 19 S15 `properties.test.ts` | Added to existing `it`s: clean `receiptProblems` (empty and a dated catalog item), `unknownRefs(reply(), new Set())`, a 37-word first-person body quoted from the draft (`["comment 1 writes first-person prose"]`), a 60-word three-sentence body ("reads like a paragraph"), and `["a 30-word quoted passage"]`. Count stays 12. |
| G-19-15 | 19 S2 `latestEmail`, S4 `waitForJob` | Both use `expect.poll` (250 ms and 1 s intervals); no `waitForTimeout` remains. `waitForJob` is used by S10. |
| G-19-16 | 19 S1 `stack.ts`, S4 `admin.ts`, S6/S10 imports | Truncation is `resetDb(db)` from `@scholarcrew/db/testing`, keeping the explicit pgboss drop. The copies are renamed `seasonOn`/`awardYearOn` with comments naming 06's `dates.ts`; not imported, because `@scholarcrew/core/shared` also loads test deps, email senders, and the Stripe fake. |
| G-19-17 | 19 S4 new `support/fixtures.ts`, `admin.ts` `signInAdminState`/`adminSession`, S4/S8/S9/S10 specs, Notes, Checklist | Worker-scoped `adminState` signs the seeded admin in once and saves `storageState`; each spec opens `adminSession(browser, adminState)` with its own `X-Forwarded-For`. CI keeps `retries: 1`. |
| G-19-18 | 19 gaps, S19 `run.ts` comment | G10 added (below). |
| G-19-19 | 19 gaps, S17 intro | Recorded as the D42 follow-up; `crewInput` is unchanged until 02 adds `requester`. |
| D47 | 19 S5 `essays.spec.ts`, `essays.ts` `createEssayViaUi` | The essay flow fills `/essays` form "New essay" (Title, Prompt, "Word limit (optional)", For = general, "Create essay") and reads the id from the studio URL; it asserts the created essay through the API. Family and isolation keep `POST /essays` for setup. |
| D37, F-18-1 | 19 S7 `family.ts` `previewInviteSignedOut`, `family.spec.ts` | Signed out, `/family/join` shows "You've been invited to a family" and "Riley invited you to join as a parent."; the "Sign in" link is checked inside `<main>` (PublicChrome's header has another). |
| E-16-2 | 19 S7 `family.spec.ts` | Parent nav checks scoped to `navigation` "Main": Crew chats and Colleges visible, no Essays or Story Bank; after sharing essays, Essays links to `/essays`. |
| Selector re-check | 19 S3, S5, S8 | "This week" heading `exact` and the checkbox count scoped to that Card's section; "Comment 1" and "Draft history" `exact`; "Texas" scoped to region "Browse by state"; directory search scoped to the `search` form; "Browse scholarships by state" scoped to `<main>`. Every other string matched 16/17/18 as written. |

Follow-ups for other plans (not edited here):

- 00 §3 (G10): list `e2e/support/env.ts` and `evals/src/run.ts` with the test setup files that may read `process.env`.
- 02/09/12 (D42): when `CrewRequestInput.requester` lands, 19's `crewInput` adds `requester: o.audience === "family" ? { role: "parent", firstName: "Dana" } : { role: "student", firstName: jordanData().snapshot.displayName.split(" ")[0] ?? "Jordan" }`.
- 13 (G3, optional): `POST /dev/helper-links/:id/expire` would remove 19's only direct DB write.
- 09/10 (G7, G8): unchanged; the recording decorator and the math eval stay the only checks.

## Round 2 P-A fixes

Plans 02, 03, 05, and 00 §8, §9.1, §9.3. Plan 04 has no change (R2P-5 uses the existing `scoreMatch` and `rankMatches`).

| Finding | Plan and task | Change |
|---|---|---|
| R2C-1 | 02 B7 `crew.ts`, `crew.test.ts` | `CrewSpeaker = z.enum(["student", "parent", "crew"])` and `CrewRequester = z.strictObject({ role: z.enum(["student", "parent"]), firstName: z.string().max(60) })` sit next to `MessageAuthor`. `CrewRequestInput.requester: CrewRequester` is required, and `history[]` items are `{ author, speaker, text }`. New `CrewRequestInput` tests: a parent requester parses (blank `firstName` allowed, a missing requester or `admin` role fails), and a history line with no `speaker` or an unknown one fails. |
| R2C-4 | 03 C4 `pipeline.ts`, `index.test.ts`; C5 `migrate.test.ts`; C6 `constraints.test.ts`; C7 `records.ts`, `seed.test.ts`; 00 §8 | `planItems.generated: boolean("generated").notNull().default(false)`. Schema test (bool, not null, default false), migrate test, and a constraints assertion that a new row reads `false`. The five seeded week-of-Oct-5 items are `generated: true`, because they stand in for a crew plan and a dev "Plan my week" should replace them; the seed test asserts it. 00 §8 `planItems` adds `· generated bool = false`. |
| R2C-5 | 02 B8 `jobs.ts`, `jobs.test.ts`; 05 E4, E5, E6; 00 §9.3 | `JOB_NAMES` adds `"plan.weekly.fanout"` after `"plan.weekly"` (20 names with R2I-9). `"plan.weekly"` is `{ jobId, ownerId, source?: "user" \| "system" }`, and `"plan.weekly.fanout"` is `empty`. 05 `SCHEDULES` adds `{ name: "plan.weekly.fanout", cron: "0 11 * * 1", tz: "UTC" }` after `sweep.weekly`, with a new test that 11:00 UTC Monday is Monday morning in seven US zones in both DST and standard time. The integration test asserts 20 queues, with the two new ones on `standard`. The index test pins 20. 00 §9.3 has the new literal, the payload note, and the schedule. |
| R2I-1 | 02 B2 `memory.ts`, `memory.test.ts` | `PROFILE_FACT_KEYS` (the eight keys, in fix-plan order) and `ProfileFactKey`. Test: length 8, unique, and every key passes `FactKey`. |
| R2I-6 | 03 C4 (modifies `family.ts`), C5, C6, C7; 00 §8 | `familyTasks.aidItemId: uuid("aid_item_id").references(() => aidChecklistItems.id, { onDelete: "cascade" })`, plus `unique("family_tasks_aid_item_assignee_uq").on(t.aidItemId, t.assigneeId)` (nulls distinct). Tests cover the schema, the migrated constraint and FK, and behavior: a duplicate fails with 23505, `onConflictDoNothing` returns `[]`, unlinked tasks are unrestricted, and deleting the item deletes its task. The seed replaces its one hand-titled `fafsa_contributor` task with three linked tasks (two FAFSA, one CSS) whose title, detail, and `dueOn` match what 08 `ensureChecklists` writes, so 08 adds no duplicates in dev. 00 §8 `familyTasks` has the column and the unique. |
| R2I-9 | 02 B8 `jobs.ts`; 03 C4 `ops.ts`, C5; 05 E4; 00 §8, §9.3 | `JOB_NAMES` adds `"notify.sms"` after `"notify.email"`, with payload `{ notificationId: Id }` on a `standard` queue. `notifications.smsSentAt: ts("sms_sent_at")` is nullable. Tests: a jobs payload test, a schema test, and a migrate test. 00 §8 `notifications` adds `· smsSentAt ts?`. |
| R2I-19 | 03 C4 `ops.ts`, C5, C7 `people.ts`; 00 §8 | `subscriptions.familyId` is removed, and the seed's subscription insert no longer sets it. The schema test and migrate test both assert there's no `family_id`. 00 §8 drops `· familyId uuid?`. |
| R2P-1 | 02 B6 `money.ts`, `money.test.ts`; 03 C7 new `seed/aid.ts`, `seed/index.ts`, `seed.test.ts`; 00 §9.1 | `FederalLoanRates`, `AidRuleKey`, `AidRule`, `AidRuleInput`, and `AidDeadlineInput` match the fix plan exactly, with types. They live in `money.ts` beside the other money schemas; `AidDeadline` stays in `aid.ts`. Tests: a 31% rate is rejected, the key enum and URL are checked, and `AidDeadlineInput` defaults `note` to "", accepts a federal (`null`) or state deadline with an optional id, and rejects `ZZ` and a blank program. `seedAid(tx)` runs from `seedDev` after `seedCatalog`. It upserts `federal_loan_rates` for 2026-27 and 2027-28 (6.39 / 6.39 / 8.94, the 2025-26 rates reused as samples) and replaces four `aidDeadlines` rows: FAFSA June 30 of the second calendar year, and TX "TEXAS Grant priority" Jan 15 of the first. Every row carries `// SAMPLE DATA for development: not verified rates or deadlines for these award years.` and the deadline note "Sample data for development. Check the source before relying on it." The seed test checks 2 rules, 4 deadlines, the dates, the values, and the notes, and the existing run-twice test covers idempotency. The 00 §9.1 seed comment mentions the sample rows. |
| R2P-10 | 02 B5 `impact.ts`, `impact.test.ts` | `ServiceLog.verificationExpiresAt: IsoDateTime.nullable()` goes after `verification`. Test: parses with null and with a timestamp, and rejects a missing value. The 03 column already existed. |
| R2P-11 | 02 B4 `colleges.ts`, `profile.test.ts` | `RecRequestPatch = z.strictObject({ status: z.enum(["confirmed", "submitted", "declined"]) })`. Test: those three pass, and `requested`, `draft`, and `{}` fail. |
| R2P-14 | 02 B5 `essays.ts`, `impact.test.ts` | `EssayPatch` uses `EssayInput.shape.title`/`.prompt` `.optional()` and `EssayStatus.optional()`, refined to require at least one defined key. Test: `{}` fails, a status or title alone passes, and an empty title, an unknown status, and an extra key fail. |

Deviation (smallest correct alternative): `familyTasks` lives in `family.ts` (C3), but `aidChecklistItems` lives in `pipeline.ts` (C4). So C4 modifies `family.ts`, importing `aidChecklistItems` from `./pipeline` and adding the column and unique, instead of C3 declaring them. `pipeline.ts` never imports `family.ts`, so there's no cycle. Names are unchanged.

Counts:
- 02: 11 files, 9 new tests. Per file: common 7, memory 7, family 3, scholarships 7, geo 2, profile 7, impact 9, money 9, crew 11, catalog 4, jobs 5. The index test lists the 10 new exports.
- 03: 91 → 98 tests (index 9, migrate 8, constraints 9, seed 6). C4 69, C5 77, C6 92, C7 98. The table, enum, and users-FK counts (59 / 49 / 42) and the single `NULLS NOT DISTINCT` don't change.
- 05: 22 → 23 tests (E5 21, E6 23).
- 04: unchanged.

Notes for other clusters:
- 06 `createTask` with `aidItemId` can use `onConflictDoNothing({ target: [familyTasks.aidItemId, familyTasks.assigneeId] })`.
- 08 `ensureChecklists` must write `title: item.title`, `detail` `FAFSA <awardYear>` or `CSS Profile <awardYear>`, and `dueOn: item.dueOn` to match the seed.
- Every `CrewRequestInput` fixture (09, 10, 12, 19) and every `ServiceLog` fixture (07, 16, 17, 19) needs the new required fields.

## Round 2 P-C fixes

Source: `plans/reviews/r2-fixplan.md` (P-C) and the cited findings in `r2-crew.md`, `r2-identity.md`, and `r2-pipeline.md`. Only `plans/07-core-records.md` and 07's rows in 00 §9.4 were edited. Coordinator calls applied: R2I-11 keeps the `sensitive` toggle, which now gates parent-visible sensitive match reasons. Counts: 07 goes from 17 files / 96 tests to 17 files / 107 tests (scholarships 41 → 50: search 12, matching 8, sweep 7, board 11, submissions 6; colleges 17 → 18: items 8; essays 16 → 17: essays 6; impact stays 10; prep 6 and helperview 6 unchanged).

| Finding | File and task | Change |
|---|---|---|
| R2C-12 / R2P-12 | 07 G6 `submitLocalScholarship`, intro, test, contract notes | The transaction also inserts a `planned` `scholarshipApplications` row for the submitter (`onConflictDoNothing` on `(ownerId, scholarshipId)`, `estMinutes` from the listing). New test: one planned application, and the board's working column has the submission. |
| R2I-11 (a) | 07 G1 `common.ts` `seesSensitiveReasons`, G3 `listMatches`, G5 `getBoard`, intros, checklist | `seesSensitiveReasons(deps, actor, ownerId)`: owner and system always, a parent only when `getShareGrants` includes `sensitive`, helpers never. `getBoard` uses it for the card and `application.matchReasons`. `listMatches` uses it for a parent unless `audience: "family"` was passed (the crew port), which always strips. New tests in matching and board. |
| R2P-3 | 07 G3 `matching.ts` `matchListingFor` + shared `scoreListing`, G5 `saveScholarship`, G4 `runSweep` | `matchListingFor(deps, studentId, listing)` uses the same `scoreListing` as `evaluateForStudent`; ineligible gives `{ reasons: [], fitScore: 0 }`. `saveScholarship` writes both on insert, and on conflict only when `jsonb_array_length(match_reasons) = 0`. `runSweep` updates reasons and fit on open (`matched`/`planned`/`drafting`) applications in the eligible set, in one transaction. New tests in board (save from search, ineligible, sweep-scored card kept) and sweep (refresh after a profile change; a submitted row untouched). |
| R2P-4 | 07 G2 `search.ts` `liveListingWhere`, G5 `getBoard`, G15 `getRequirementProgress`, scholarships index | `liveListingWhere(ownerId: string \| AnyPgColumn): SQL`, exported from the index. `getBoard` selects `live` per row; open cards that fail it go to `flagged` with `SCAM_FLAG_TEXT`, `RETIRED_TEXT`, or `UNDER_REVIEW_TEXT` (exported from `board.ts`), leave the totals, and are deduplicated against the sweep list. Submitted, won, and lost stay. `getRequirementProgress` adds `liveListingWhere(scholarshipApplications.ownerId)`; its test gains a retired and a scam listing (count unchanged). |
| R2P-5 | 07 G5 `getBoard` | Matched cards get `scoreMatch(...)` and the column is `rankMatches` over `{ fitScore: app.fitScore, valuePerHour, daysUntilDeadline }`. New test: value order beats deadline order for the student and the parent. |
| R2P-10 | 07 G14 `toServiceLog`, intro, tests | Maps `verificationExpiresAt: toIsoOrNull(...)`. Existing tests assert null on a new log, the date after `requestVerification`, that the date stays on a lapsed `requested` log, and the new date on a resend (count unchanged). |
| R2P-11 | 07 G9 `updateRecRequest`, colleges index | `updateRecRequest(deps, actor, id, p: RecRequestPatch): Promise<RecRequest>`: `requireUuid`, owner only (`assertOwner`, else `not_found`), sets `status` and `updatedAt`. New test. |
| R2P-14 | 07 G10 `updateEssay`, essays index | `updateEssay(deps, actor, id, p: EssayPatch): Promise<Essay>`: owner only, trims `title`, sets `prompt`/`status`/`updatedAt`, returns `latestWordCount`, and leaves versions alone. New test. |
| R2P-19 | 07 G2 `getScholarship`, intro | Adds `noScamFlags` when `actor.kind === "public"`. New test: public `not_found`, student sees the flag. |
| R2P-21 | 07 G4 `runSweep` | The dedupe key is `sweep:<studentId>:<todayIn(now, timeZone)>`, and `weekStartFor` is no longer imported. The existing keys change to `2026-10-06` and `2026-10-13`. New test: a Wednesday sweep and the Sunday sweep that week each notify. |
| 00 §9.4 | Plan 07 table | scholarships: `liveListingWhere(ownerId: string \| AnyPgColumn): SQL`, plus notes on `getScholarship`, `listMatches`, `getBoard`, `saveScholarship`, `submitLocalScholarship`, and `runSweep`. colleges: `updateRecRequest`. essays: `updateEssay`. impact: notes on `getRequirementProgress` and `verificationExpiresAt`. |

Deviations:

- R2I-11 (a), `getScholarship`: no code change. It loads only the viewer's own application (`ownerId = actor.userId`), so a parent never gets a student's `application.matchReasons` there. A comment and a contract note record this.
- R2P-5: `reasonsCount` uses the stored `app.matchReasons.length`, not the parent-filtered list, so parents and students see the same order. The test checks both.
- R2P-4, `getBoard`: the live check runs as `liveListingWhere(studentId)` inside the select (`coalesce(..., false)`) so one rule decides it. 08 can pass the column form.

Follow-up (not in the round 2 decisions, not done): G16's helper-view `deadlines` still includes open applications on retired or flagged listings. It could add `liveListingWhere(scholarshipApplications.ownerId)`.

## Round 2 P-D fixes

Source: `plans/reviews/r2-fixplan.md` (P-D) and the cited findings in `r2-crew.md`, `r2-identity.md`, and `r2-pipeline.md`. Only `plans/08-core-planning.md` and 08's rows in 00 §9.4 were edited. Coordinator calls applied: R2C-5, automatic plans skip the allowance (`startWeeklyPlan` does no `assertCrewAllowance`). R2P-1, the sample loan rates come from 03's seed, so 08 only adds the admin editor. Counts: 08 goes from 14 files / 68 tests to 15 files / 92 tests (plan 22 → 26: items 5 → 7, deadlines 2 → 3, notify 4 → 5; crew 17 → 25: jobs 8 → 11, actions 4 → 9; money 16 → 23: costs 8 → 10, offers 8 → 13; aid 4 → 5; admin 9 → 13: catalog 5 → 6, new `admin/aid.test.ts` 3). The contract test stays at 5 tests and now lists the 7 new exports.

| Finding | File and task | Change |
|---|---|---|
| R2C-2 (test) | 08 H10 `actions.test.ts` | New test: `createCandidate(intended_major)`, then apply a `confirm_fact` card for the same key. No live candidate is left, and `listFacts` returns only the confirmed row. The supersede itself is 06's change. |
| R2C-3 | 08 H10 `crew/actions.ts`, intro | `PENDING_RESULT = { pending: true } as const` and `STALE_CLAIM_MS = 60_000`. `applyActionCard` claims first with `onConflictDoNothing({ target: [messageId, cardId] }).returning()`. A lost claim re-reads the row: it returns the row when it isn't pending or is older than `STALE_CLAIM_MS`, and otherwise throws `conflict("This action is still being applied")`. A won claim runs `runCard`, then updates `result`. If `runCard` throws, the claim row is deleted and the error is rethrown. New tests: two concurrent applies with `Promise.allSettled` give one plan item and one receipt, and each call returns a receipt or `conflict`. A second test covers a failing card (no receipt), a fresh claim (`conflict`), and a stale claim (returned as-is, nothing run). |
| R2C-4 | 08 H3 `replaceGeneratedPlan` | It inserts `generated: true` and deletes only `generated = true and status = 'todo'` rows for the week. The `cardinality(contributors) > 0` filter is gone. New test: a card item (`["scout"]`) and a `test_prep` item (`["prep"]`) survive two regenerates, and the earlier generated item is replaced. |
| R2C-5 | 08 H3 `startWeeklyPlan`, plan index | `startWeeklyPlan(deps, system, ownerId): Promise<CrewJob \| null>` is system only. It returns null for a non-uuid id, or anyone who isn't an active student with `profiles.onboardingCompletedAt`, or when a `weekly_plan` job was created in the last 12 hours (`SYSTEM_PLAN_COOLDOWN_MS`). It does no allowance check. It inserts the job and enqueues `plan.weekly { jobId, ownerId, source: "system" }`. New test: forbidden for a user actor; at the allowance limit it still starts; a second call is null, and 12 h 1 min later it starts again; a parent, an unfinished student, and `"nope"` each get null. |
| R2C-7 | 08 H11 `resolveCatalogTask` | In the same transaction, a rejected `recheck_changed` task sets its listing to `published` with `verifiedAt`, `verifiedById`, and `updatedAt`, but only where the status is `stale`. New test: a stale listing is republished; a retired listing under a recheck stays retired; a stale listing under an `import` task stays stale. |
| R2C-9 | 08 H10 `applyActionCard` | `confirm_fact` and `record_decision` in a `temporary` room throw `invalidInput("Temporary chats don't save memory")` before any claim. New test: both are refused with no decision, fact, or receipt rows, and a plan card in the same room still applies. |
| R2C-11 | 08 H2 `listJobs` | The filter is `or(eq(ownerId, actor), inArray(requestMessageId, <subquery>))`. The subquery picks `messages` the actor wrote in a `family` conversation, inner-joined on `familyMembers` (actor). The active filter, order, and limit are unchanged. New test: a parent sees only their own family-room request in `{ active: true }`, the student sees both, and the parent sees none after the membership row is deleted. |
| R2C-14 | 08 H2 `completeJob`, plan rules | A room-less reply reuses the owner's newest conversation with `room = 'my_crew'`, `title = ROOM_TITLES[kind]`, `roomRefId` null, and `archivedAt` null, and inserts one only when none exists. The rule at the top of the plan says so. New test: two `weekly_plan` jobs share one room, an `essay_review` gets its own, and an archived room isn't reused. |
| R2I-5 | 08 H6 `ensureChecklists` | CSS parent tasks use `title: item.title` (no college name) and `detail: "CSS Profile <awardYear>"`. 06 `listTasks` adds the name for viewers who may read colleges. The H6 test now expects the plain title. |
| R2I-6 | 08 H6 `ensureChecklists`, `toAidDeadline` export | After the item insert, it re-selects the student's parent-assigned items for the award year (FAFSA, plus CSS for current CSS colleges). It creates one task per (parent, item) with `aidItemId`, `kind` `fafsa_contributor`/`css_contributor`, `title: item.title`, `detail` `FAFSA <awardYear>` or `CSS Profile <awardYear>`, and `dueOn: item.dueOn`. Existing (aidItemId, assignee) pairs are skipped up front, and 06 `createTask`'s conflict-do-nothing handles races. The title/detail matching code is gone. `updateAidItem` is unchanged. Tests: the H6 test asserts every task's `aidItemId`. A new test has a parent mark the linked task done through 06 `updateTask`, after which `getAidChecklists` shows the item done (`doneCount` 1), and a second `ensureChecklists` still leaves 3 tasks. |
| R2I-7 | 08 H5 `confirmOffer` | New internal `askParentsToReviewCosts`: for each `parentsOf(student)` row without a `review_costs` task for that student, `createTask({ kind: "review_costs", title: "Review award letters with <first name or 'your student'>", detail: "" })` as `systemActor("money.offers")`. New test: one task for the parent, and a re-confirm adds none. |
| R2I-12 | 08 H10 `runCard` | `runCard` takes `messageId`, and `record_decision` calls `recordDecision(deps, actor, card.decision, messageId)`. The existing card test asserts `decision.sourceMessageId === msg.id`. |
| R2P-1 | 08 H12 new `admin/aid.ts`, `admin/aid.test.ts`, admin index; H6 exports `toAidDeadline` | `listAidRules`, `upsertAidRule`, `listAidDeadlinesForAdmin`, `upsertAidDeadline`, `deleteAidDeadline`, with the fix-plan signatures. All call `assertAdmin`. A bad `awardYear` filter is `invalid_input`. Rules upsert on `(awardYear, key)` with `verifiedAt = now`, and listing skips rows whose key or value fails `AidRuleKey`/`FederalLoanRates`. Deadlines insert without `id` and update with it (unknown is `not_found`); delete of a missing id is `not_found`. The audit actions are `aid_rule_upserted`, `aid_deadline_upserted`, `aid_deadline_deleted`. Tests: rule upsert, update, and list, then `loanEstimates` reading the upserted 9.08% PLUS rate; deadline insert, edit, list order, and delete, with audit counts; and `forbidden` for all five. |
| R2P-4 | 08 H4 `loadContext`, H7 `collectDeadlines`, H8 `findDueReminders` | Each adds `liveListingWhere(scholarshipApplications.ownerId)` from `../scholarships` to its open-application query. `loadContext` keeps its all-stage query for won money and gets a separate pending query. Renewal reminders on won awards aren't filtered. New tests: a retired $900 planned app leaves pending (5650 → 4750); a retired and a scam-flagged listing drop out of Coming up; and the same pair gets no reminder. |
| R2P-6 | 08 H4 `summariesFor`, intro, comment | The order is a confirmed unarchived offer, then `calculator`, then Scorecard. New test: with a calculator row and a confirmed offer, the source is `offer` and `isEstimate` is false; archiving the offer falls back to `calculator`. |
| R2P-7 | 08 H5 `compareMyOffers` | Offers whose `offer.costOfAttendanceUsd ?? college.costOfAttendanceUsd` is null are left out of `compareOffers`, and each adds `"<College>: the letter doesn't list a cost of attendance, so it isn't compared."` `OUTSIDE_SCHOLARSHIPS_NOTE` ("Outside scholarships you've won aren't counted here. Your Costs page includes them.") is always added. New test: a $40,000-grant letter at a no-cost college is left out of `lowestFourYearOfferId`, and both lines are present. |
| R2P-8 | 08 H5 `deleteOffer`, money index | `deleteOffer(deps, actor, id): Promise<void>` is owner only (`not_found` otherwise). A `confirmed` offer is `conflict("Confirmed offers stay. Start a new season to archive them.")`. Lines cascade and the document stays. New test: a failed and a parsed letter delete (lines gone, document kept); a confirmed one is a conflict; another student's and a bad id are `not_found`. |
| R2P-9 | 08 H2 `READY_NOTICE`, `completeJob` | `link` is `(refId, conversationId) => string`. `appeal_outline` and `retake_analysis` link to `/crew/<conversationId>`, falling back to the old links. `completeJob` passes the updated row's `conversationId`. The appeal assertion now expects `/crew/<id>`. A new test checks the retake link, the `/prep` fallback for a failed job with no reply, and the unchanged essay link. |
| R2P-16 | 08 H5 `saveParsedOffer` | The input gains `awardYear?: AwardYear`. Internal `plausibleAwardYear` keeps it only when it matches `AwardYear`, its second half is the first year + 1, and it's within one year of `currentAwardYear(now)`. Otherwise the offer's year stays. New test: `"2026-27"` is stored; `"1999-00"`, `"2027"`, and an omitted year keep it. |
| 00 §9.4 | Plan 08 table | money: the source-order and live-pending note, `saveParsedOffer` `awardYear?`, the `confirmOffer` `review_costs` note, `deleteOffer`, and the `compareMyOffers` assumptions. aid: aid-linked, plain-titled parent tasks. plan: `startWeeklyPlan`, `replaceGeneratedPlan` replacing only generated todo items, and live-listing notes on deadlines and reminders. crew: `listJobs` with family-room requests, claim-first and temporary-room refusal for `applyActionCard`, and `completeJob` room reuse and links. admin: `resolveCatalogTask` restores stale listings, plus the five aid functions. |

Deviations (smallest correct alternative; names other clusters rely on are unchanged):

- R2P-1: the five admin aid functions live in a new `admin/aid.ts`, not in `admin/colleges.ts`, exported from `admin/index.ts` under the fix-plan names. H6's `toAidDeadline` is now exported from `aid/checklists.ts` (not from the `aid` index) so both modules map rows the same way.
- R2P-4, `loadContext`: pending money uses a separate query with `liveListingWhere`, because the original single query also feeds won money (`wonScholarshipsForYear`), and a win shouldn't vanish when its listing is retired. `submitted` applications on dead listings also leave pending, since `PENDING_STAGES` includes `submitted`.
- R2I-6: `ensureChecklists` makes tasks only for parent items of the current award year whose CSS college is still on the current list, matching which checklists `getAidChecklists` shows. Pre-filtering existing `(aidItemId, assigneeId)` pairs avoids one insert per item on every `getAidChecklists` read.
- R2C-3: a stale pending claim is returned as-is (its `result` is `{ pending: true }`), as the fix plan says. The card isn't re-run.

Depends on other clusters landing first (listed in 08's Review Checklist): 03 `planItems.generated` and `familyTasks.aidItemId`; 02 `plan.weekly` `source?`, `FederalLoanRates`, `AidRuleKey`, `AidRule`, `AidRuleInput`, `AidDeadlineInput`; 06 `createTask` `aidItemId?`, `updateTask` writing to the linked item, the `recordDecision` 4th argument, and candidate superseding in `writeConfirmedFact`; 07 `liveListingWhere`.

## Round 2 P-E fixes

Cluster P-E: plans 09, 10, 11, 12, 00 §9.5/§9.6, and `docs/architecture/catalog.md`. Names follow `reviews/r2-fixplan.md` §1.

| Finding | Where | Change |
|---|---|---|
| R2C-1 (D42) | 09 I7 `context/blocks.ts`, I11 `COMPASS_SYSTEM`, I12 `crew.ts`, I13 `weekly.ts`, intro | `buildContextBlocks(snapshot, history, userText, mentions, requester: CrewRequester)`. History labels come from `speaker` (`Student:`, `Parent:`, `Crew:`). A parent requester's block starts `"<firstName> (parent) asks: "` (or `"A parent asks: "` when the name is blank), and the mention note reads `They mentioned …`. `runCrewRequest` passes `i.requester`. `runWeeklyPlan` passes `{ role: "student", firstName: "" }`. The prompt now says `Talk to the person who asked as "you".` and has the family-room line (FA-03, "shared information only"). Tests: a new I7 labels and prefix test, a new prompt test in `session.test.ts`, and a new crew test for a parent requester. Every 09 `CrewRequestInput` fixture adds `requester` and every history fixture adds `speaker`. |
| R2C-1 (D42) | 12 L7 `loadCrewInput`, decisions | One `users { id, role, displayName }` query covers the owner, the request author, and the history authors. `requester` and `speaker` follow the fix plan, and `firstName` comes from the new `firstNameOf` (first token, 60 characters max). `FAMILY_MEMBER_PREFIX` is deleted. The 12-9 expectation is now `"Parent: How are things going?"`. New test: a parent named "Maria Lopez" produces `"Maria (parent) asks: @Ledger what's the gap?"` and `They mentioned @Ledger.`, and the student's earlier line stays `Student:`. The L3 and 10 J8 fixtures add `requester`. |
| R2C-5 | 12 L9 `plan-weekly.ts`, new `handlers/plan-weekly-fanout.ts`, L14 `HANDLERS`, `app.test.ts`, decisions | `handlePlanWeekly` sets `crewRequest = source !== "system"`. `handlePlanWeeklyFanout` runs the `sweep.weekly` student query (written out again, since L9 comes before L10), calls 08 `startWeeklyPlan` for each student, logs per-student failures and keeps going, and logs `{ candidates, started }`. New tests: a system plan leaves `crewRequests` at 0 with its cost recorded, and the fan-out starts two `source: "system"` plans, skips the student who hasn't finished onboarding and the parent, starts none on a rerun an hour later, and rejects extra keys. `app.test.ts` asserts the `0 11 * * 1` UTC schedule. |
| R2C-9 (D22) | 09 I11 `session.finish`, `COMPASS_SYSTEM` | In a `temporary` room, `finish` drops `confirm_fact` and `record_decision` cards without marking the reply partial. The prompt gets the temporary-room line. New crew test: only the `open_link` card survives in a temporary room, and all three survive in `my_crew`. |
| R2C-10 (CR-08) | 09 `COMPASS_SYSTEM`; 10 J2 Scout and Atlas prompts | Compass gets the `roomRef` line. Scout gets "If the question names a scholarship id, look it up first with get_scholarship." and Atlas gets "If the question names a college id, look it up first with get_college." Tests: a 09 prompt assertion and a new 10 definitions test. |
| R2C-13 | 11 K3 `csv.ts`, intro; 00 §9.6; `docs/architecture/catalog.md` | `parseScorecardCsvWithErrors` returns `{ rows, lines, errors }`, where `lines[k]` is the CSV line of `rows[k]`. Early returns give `lines: []`. The existing tests assert `lines` `[2, 3, 4]` and `[7]` (blank and invalid lines are skipped), and the empty-file and missing-column cases include `lines: []`. The intro and §9.6 describe 14's `parsed.lines[e.line - 1] ?? e.line` remap. |
| R2C-15 | 12 L6 `JobOutcome.afterComplete`, `runCrewJob`; L7 `handleCrewRequest` | `afterComplete` runs after `completeJob` and before `recordUsage`. A failure there is logged as `job.after_complete_failed` and isn't rethrown. `fileCandidates` moved into it. New tests: L6 checks that `afterComplete` sees the job `ready` and that a throwing one still leaves the job `ready` and billed. L7 uses a `vi.mock` of `@scholarcrew/core/crew` so `completeJob` fails once: the first attempt files nothing and leaves the job `working`, and the retry files one candidate. |
| R2I-9 (NO-05) | 12 L2 `WorkerDeps.sms`, L4 `deps.ts`, new `src/sms.ts` and `src/sms.test.ts`, `test/helpers.ts`, L11 reminders, new `handlers/notify-sms.ts`, L14 `HANDLERS` | `twilioSmsSender({ accountSid, authToken, from, fetchImpl? })` POSTs the form to `…/Accounts/<sid>/Messages.json` with Basic auth and `AbortSignal.timeout(10_000)`. A non-2xx response throws `twilio <status> <code>`, using only Twilio's numeric code because its message can quote the number. `devOutboxSmsSender(db)` writes `devOutbox { to, subject: "SMS", text }`. `twilioConfig(env)` returns the Twilio settings when all three are set and null when none are, and throws `TWILIO_PARTIAL_ERROR` for a partial set. It runs before the DB pool opens. `makeWorkerDeps` uses the dev outbox sender. Reminders pass `sms: r.offset === 1 && !renewal`. `handleNotifySms` calls `deliverSms(deps.core, SYSTEM, notificationId, deps.sms)`. Tests: 4 in `sms.test.ts` (fetch shape, a 400 with no phone in the error, the dev outbox, and full/empty/partial env). Reminders: an opted-in student with 1-day, 3-day, and renewal reminders gets one `notify.sms`, and a student who didn't opt in gets none. `notify.sms`: sends once, the text matches `ScholarCrew: <title> … Reply STOP to opt out.`, and a bad payload is rejected. |
| R2I-10 | 12 L5 port `snapshot`, decisions, Review Checklist; 00 §9.5 | New `hiddenProfileKeys` reads current confirmed facts for `PROFILE_FACT_KEYS` and blanks the matching `snapshot.profile` field when the audience can't use the fact's visibility (crew: `crew`, `crew_family`; family: `crew_family`). `high_school` and `city` aren't in `ContextSnapshot.profile`, so they're skipped. New test: a `scout_only` county is blank for crew and family, and a `crew` GPA is present for crew and null for family. |
| R2I-16 | 12 L11 `digest-weekly.ts`, decisions | The handler also selects quiet hours and uses the new `inQuietWindow` and `effectiveDigestHour`. On `digestDay` it sends when `local.hour >= effectiveHour` and `secondsUntilQuietEnd(...) === 0`. Before building, it skips a student whose `digest:<id>:<weekStart>` already exists (`weekStart` comes from `weekStartFor` in the student's zone). A failed `email.send` calls `retractNotification`. New tests: a 22:00 digest with quiet hours 21–7 isn't sent at 06:00, is sent at 07:00, and isn't sent again at 22:00; a failed send leaves no notification, and the next hour sends exactly once. |
| R2P-1 (doc) | `docs/architecture/catalog.md` | The "Open" line now reads: "Dev uses sample rows from the seed; admins maintain real values at /admin/aid". The curated college fields are still listed as open. |
| R2P-8 | 12 L8 `offer-parse.ts` | `NOT_PDF_TEXT`, `PARSE_FAILED_TEXT`, and `NO_LETTER_TEXT` use the fix-plan wording. New test asserts all three strings and that none says "enter the lines". |
| R2P-15 | 12 L5 port `collegeList` | When `allows(ownerId, "costs")`, `gapUsd` is filled from `getCosts` by `collegeId`. Otherwise it stays null. New test: the crew port's gap equals the cost summary's, and a family port with `costs` off gives null. |
| R2P-16 | 12 L8 `offer-parse.ts` | `saveParsedOffer` gets `awardYear: parsed.awardYear` only when it's set and differs from the offer's. New test: a letter that parses as `"2026-27"` on a `"2027-28"` offer stores `"2026-27"`. |
| R2P-20 | 12 L5 port `aidChecklist`, doc comment, decisions; 00 §9.5 | `aidChecklist` uses `allows(ownerId, "deadlines")`. The existing family-port test now expects the checklist while `deadlines` is shared and `[]` after it's turned off. The §9.5 comment says aid checklists follow `deadlines`. |
| 00 §9.5 | wiring prose and port comment | Adds `CrewRequestInput.requester`, history `speaker`, the new `buildContextBlocks` signature, the parent prefix, and the temporary-room card drop. The port comment reads "never returns test scores, and aid checklists follow `deadlines`", with notes on profile visibility and `gapUsd`. |
| 00 §9.6 | `parseScorecardCsvWithErrors` | Now `{ rows; lines: number[]; errors }`, with the remap note. |

Counts:
- 09: context 7, session 10, crew 14, compass 28; 14 files, 95 tests.
- 10: definitions 6; plan 8 files, 59 tests; package 22 files, 154 tests.
- 11: unchanged at 9 files, 66 tests. The R2C-13 checks are assertions in existing K3 tests.
- 12: deps+sms 8, port 10, shared 9, crew-request 11, essay-offer 9, crew-jobs 7, notices 8; 16 files, 93 tests.

Deviations (smallest correct alternative; names other clusters rely on are unchanged):

- R2C-10, 10: the fix plan gives one line for both prompts, "…look it up first with get_scholarship or get_college." The J2 test "names exactly the tools each specialist has" fails when a prompt names a tool its role lacks: Scout has no `get_college`, and Atlas has no `get_scholarship`. So each prompt names only its own lookup tool.
- R2C-5, 12: `plan-weekly-fanout.ts` writes out the `sweep.weekly` student query again (active, `student`, onboarded) instead of importing it, because L9 lands before L10's `sweep-weekly.ts`.
- R2I-9, 12: the env check is split out as an exported `twilioConfig(env)` with `TWILIO_PARTIAL_ERROR`, so tests can cover the full case without network and a bad config throws before the pool opens. `buildWorkerDeps` behaves as the fix plan says. A Twilio error with no JSON body reports code `unknown`.
- R2I-10, 12: only the six profile keys present in `ContextSnapshot.profile` are masked (`class_year`, `state`, `county`, `gpa_unweighted`, `intended_majors`, `interests`). A key with no confirmed fact stays visible.
- R2I-16, 12: the dedupe key is now `digest:<id>:<weekStartFor(now, zone)>`, computed before the build, instead of `digest.weekStart` from `buildWeeklyDigest`. Both give the same Monday.

Depends on other clusters: 02 `CrewSpeaker`, `CrewRequester`, `CrewRequestInput.requester`, history `speaker`, `PROFILE_FACT_KEYS`/`ProfileFactKey`, the `plan.weekly` `source?` payload, `plan.weekly.fanout`, and `notify.sms` (20 `JOB_NAMES`); 05 `SCHEDULES`; 06 `SmsSender`, `notify` `sms?`, `deliverSms`, `retractNotification`, the profile-column sync, and `createCandidate` dedupe; 08 `startWeeklyPlan` and `saveParsedOffer` `awardYear?`; 14 N12's remap through `parsed.lines`.

## Round 2 P-B fixes

Cluster P-B: plan 06 and its lines in 00 §9.4. Names follow `reviews/r2-fixplan.md` §1. Coordinator calls applied: R2I-11 keeps the `sensitive` toggle (06 only does the missing-row default), R2C-5 system weekly plans don't count, R2I-17 the under-13 purge keeps nothing.

| Finding | Where | Change |
|---|---|---|
| R2C-2 + R2I-13 | 06 F6 `facts.ts` | New internal `retireCandidates(db, ownerId, key, confirmedId)` sets `supersededById` on live candidates for the key. `writeConfirmedFact` calls it after the insert and in the no-op branch (`current.id`). `updateFact` calls it with the new row, and `confirmCandidate` with the confirmed row (it skips that row). No `sourceRef` matching. Test: candidate then `createFact(intended_majors)` lists only the confirmed row. |
| R2C-15 | 06 F6 `createCandidate` | Returns the owner's current confirmed fact or live candidate with the same key and `JSON.stringify(value)`, and inserts nothing. Tests: two identical calls leave one row; a matching confirmed fact leaves no candidate. |
| R2C-8 | 06 F11 `assertCrewAllowance` | `used = counter.crewRequests + inFlight`. `inFlight` counts the owner's `crewJobs` with status `queued`/`working`, created in the last 60 minutes, kind not `offer_parse` and not `weekly_plan` (see deviations). `details.used` reports the sum. Test: at 19/20, a queued offer parse, a queued weekly plan, a two-hour-old queued request, and a ready request all pass; one working request from 5 minutes ago throws `limit_reached` with `used: 20`. |
| R2I-1 | 06 F6 `facts.ts` | Internal `syncProfileColumn(tx, ownerId, key, value \| null)` over `PROFILE_FACT_KEYS` (from 02). A `PROFILE_COLUMNS` map validates with the matching `ProfilePatch` field (`gpa_unweighted` stored x100) and throws `invalidInput("That value doesn't fit <label>")`. `null` clears to `''`, `null`, or `[]`. Called in the same transaction from `createFact`, `updateFact`, `confirmCandidate`, and `forgetFact` (only when the forgotten row is the current confirmed fact; delete and sync now share a transaction). `writeConfirmedFact` doesn't call it. Five tests, one per path plus `state: "Texas"`. |
| R2I-2 | 06 F5 `createAccount` | In the account transaction, a live unaccepted `memberRole = 'parent'` invite for the email makes the user a `parent`. Test: a parent invitee becomes a parent with a profile row; a student invite, an accepted invite, and no invite give students. |
| R2I-3 | 06 F9 `invite`, `previewInvite` | New `unnamedInviter(role)`: "Your family member" for parents, "Your student" otherwise. `previewInvite` also selects the inviter's role. Test: a nameless parent's invite subject and preview say "Your family member". |
| R2I-4 | 06 F19 `deleteAccount` | Inside the transaction: collect the user's messages in their families' rooms, delete the jobs those messages started and the jobs' `resultMessageId` replies, then the messages; delete `familyTasks` where the user is assignee or student; delete their unaccepted invites. A family is deleted when no `student` member is left. The first delete test now expects the student's family to go; a new test covers a parent who posted in the student's room (message, reply, job, task, and invite gone; the student's message and job stay). |
| R2I-5 | 06 F10 `listTasks` | New `taskQuery` left-joins `aidChecklistItems` and `colleges` on `aidItemId`. `presentTasks` appends ` (<college>)` to `css_contributor` titles only for the task's student or a viewer whose `getShareGrants` include `colleges` (cached per student). `updateTask` uses the same rule. Test: `colleges` off hides the name from the parent but not the student; on shows both. |
| R2I-6 | 06 F9 `insertFamilyTask`, F10 `createTask`, `listTasks`, `updateTask` | `createTask` takes `aidItemId?: string \| null` (non-UUID is `invalid_input`). With it, the insert uses `onConflictDoNothing` on `(aidItemId, assigneeId)` and returns the existing task. Linked tasks read `status`/`completedAt` from the item, and `updateTask` writes them to the item instead of the task. Tests: a second create returns the same task; marking the task done sets the item done and leaves the task row `todo`; an item marked done elsewhere lists as done. |
| R2I-7 | 06 F9 `acceptInvite` | When a parent joins, inside the accept transaction: one `share_budget` task ("Share a yearly budget for college") for the first student by `joinedAt`, and one `share_income_range` task ("Share an income range for scholarship matching") per student. Tests: F9 checks both tasks; F10 checks that `setBudget` and `shareIncomeRangeToStudent` close them. |
| R2I-9 | 06 F2 `SmsSender`; F16 `notify`, new `deliverSms` | `interface SmsSender { send(m: { to; text }) }` in `shared` (not in `CoreDeps`). `notify` gains `sms?: boolean` and enqueues `notify.sms { notificationId }` when prefs have `smsEnabled` and a phone. `deliverSms(deps, system, notificationId, sms)` skips missing, sent, inactive, opted-out, and phoneless cases; re-enqueues with `startAfterSeconds` in quiet hours; claims with `smsSentAt`; decrypts the phone; sends `ScholarCrew: <title> <appUrl><link> Reply STOP to opt out.` cut to 300; on a send error resets `smsSentAt` and rethrows. Five tests. |
| R2I-11 (b) | 06 F4 `getShareGrants` | Reads every row for the shared families and uses `DEFAULT_SHARED[c]` when a category has no row. Test: with all rows deleted a parent gets the five defaults, and an explicit `costs: false` row still wins. |
| R2I-12 | 06 F7 `recordDecision` | Fourth argument `sourceMessageId: string \| null = null`, stored on the row; a non-UUID is `invalid_input`. Test: the id comes back from `recordDecision` and `listDecisions`. |
| R2I-14 | 06 F9 `removeMember`, `leaveFamily` | New internal `clearDeparted(tx, familyId, userId, memberRole)`: deletes the user's `familyBudgets` row and assigned tasks (and, for a student, the tasks about them), then deletes the family when no student is left. `removeMember` now runs in a transaction. Three tests: remove, a parent leaving, and the last student leaving with parents still in. The invite cleanup is in R2I-4. |
| R2I-15 | 06 F9 `familyNotice`, `insertFamilyTask`, `acceptInvite` | `acceptInvite` writes `{ kind: "family", title: "<first name or 'Your family member'> joined your family", link: "/family", dedupeKey: "family-joined:<inviteId>" }` for the inviter. A real task insert writes `"New family task: <title>"` with `family-task:<taskId>`. No email. Tests: the inviter's entry, the joining parent's two task entries, one entry after two aid-linked creates. |
| R2I-16 | 06 F16 new `retractNotification` | `retractNotification(deps, system, id)` deletes the row (non-UUID is a no-op). Test: system only, and the dedupe key works again. |
| R2I-17 | 06 F13 age gate; F19 `purgeDeletedAccounts` | `PURGE_AFTER_DAYS = 6`. The age gate also sets `deletedAt = now`. The purge deletes users with status `deleted` or `blocked_underage` and `deletedAt < now - 6 days`, plus rows keyed by their emails (magic links, invites, `ml:email:<email>` rate-limit rows). Tests: purged at 6 days 1 minute and not at 5 days; a blocked under-13 account follows the same schedule and leaves no email-keyed rows; the age-gate test checks `deletedAt`. |
| R2I-18 | 06 F18 `buildExport` | `collect` returns `documentRows`. The Markdown adds "## Files you uploaded" (`- <filename> (<kind>, <sizeBytes> bytes)`, then "Download these from Settings → Documents."). After a successful build it calls `notify` with the fix-plan text, `dedupeKey: "export:<exportId>"`, and `email: true`. Test: an uploaded transcript is listed and two builds leave one notification and one email job. |
| R2I-19 | 06 F12 `checkoutCompleted`, `redeemSponsorCode` | The `familyId` writes and the `familyIdsFor` import are gone. The Family checkout test asserts the row has no `familyId`. |
| 00 §9.4 | shared, access, auth, memory, family, notifications, billing, account | `SmsSender`; the `getShareGrants` default; the parent-invite account role; `createCandidate` dedupe, the `recordDecision` 4th argument, and the profile-column sync note; `createTask` `aidItemId?` with notes on aid-linked status, college-name redaction, accept tasks, and departures; `notify` `sms?`, `deliverSms`, `retractNotification`; the in-flight allowance; the export file list and notice, the deletion cleanup, and the purge within 7 days including blocked under-13 accounts. |

Counts: 06 goes from 20 files, 159 tests to 20 files, 189 tests (access 11, auth 15, facts 21, decisions 5, family core 17, family settings 11, billing plans 7, notifications 16, export 6, delete 8). Every per-task cumulative line (F4 36, F5 51, F6 72, F7 77, F8 86, F9 103, F10 114, F11 121, F12 131, F13 140, F14 147, F15 152, F16 168, F17 175, F18 181, F19 189), the F20 gate, Success Criteria, and Testing Requirements are updated.

Deviations (smallest correct alternative; names other clusters rely on are unchanged):

- R2C-8: the in-flight term also skips `weekly_plan`, not only `offer_parse`. The coordinator decided automatic weekly plans don't count, and `crewJobs` can't tell a system plan from a student's, so a queued Monday fan-out job would otherwise block a student at limit − 1. A student's own plan still counts once it completes (12 `crewRequest`), and `requestWeeklyPlan` still checks the allowance. This replaces the §3 "accepted overlap" row.
- R2I-7 / R2I-15: `acceptInvite` doesn't call `createTask`, and family notices don't call `notify`. F9 runs before F10 (`createTask`) and F16 (`notify`), and `createTask` requires the system actor. Both paths share the new internal `insertFamilyTask` in `family/core.ts` (which `createTask` also uses), and the notice is the same `notifications` row `notify` writes with no email, inserted in the same transaction.
- R2I-17: "keeps nothing" also deletes the purged emails' magic links, invites, and `ml:email:` rate-limit rows, which don't cascade from `users`. No hashed block list is kept.

Depends on other clusters: 02 `PROFILE_FACT_KEYS`/`ProfileFactKey` and `notify.sms` in `JOB_NAMES`; 03 `familyTasks.aidItemId` with unique `(aidItemId, assigneeId)`, `notifications.smsSentAt`, and no `subscriptions.familyId`. 08 passes `aidItemId` to `createTask`, `messageId` to `recordDecision`, and creates `review_costs` through `createTask`; 12 calls `deliverSms` and `retractNotification`.

## Round 2 P-F fixes

Source: `plans/reviews/r2-fixplan.md` (P-F) and the cited findings in `r2-crew.md`, `r2-identity.md`, and `r2-pipeline.md`. Only plans 13 and 14, `docs/api/openapi.yaml`, and 00 §10 were edited. Core names are the ones P-B, P-C, and P-D landed in 06, 07, and 08 (`updateRecRequest`, `updateEssay`, `deleteOffer`, `listAidRules`, `upsertAidRule`, `listAidDeadlinesForAdmin`, `upsertAidDeadline`, `deleteAidDeadline`). Coordinator calls applied: R2C-5 keeps `POST /plan/regenerate` as the "Plan my week" route, which counts toward the allowance, while the Monday fan-out doesn't. R2I-10 and R2I-11 are documented on openapi `FactVisibility` and `ShareCategory`. R2P-1 uses sample rates from the 03 seed, and 14 only adds the admin routes. R2I-17 doesn't touch these files.

| Finding | Plan and task | Change |
|---|---|---|
| R2I-2 | 13 M7 `auth/verify/route.ts`, `auth.test.ts`, Testing Requirements; 00 §10; openapi `/auth/verify` | `next = me.onboardingComplete ? "/week" : "/onboarding"`, with `isNew` dropped. New test: a student invites `dana@example.test` through core `invite`, Dana signs in, the redirect is `/week`, and `/me` is a parent with `onboardingComplete: true`. auth goes from 9 to 10. |
| R2P-11 | 14 N2 new `recommendations/[id]/route.ts`, `colleges.test.ts`; 00 §10 row; openapi `PATCH /recommendations/{id}`, `RecRequestPatch` | PATCH calls `updateRecRequest(deps, actor, id, body(req, RecRequestPatch))`. Test: confirmed, then submitted. `requested` and `{}` are 400, another student gets 404, signed out gets 401, and the list shows the new status. colleges goes from 8 to 9. |
| R2P-14 | 14 N3 `essays/[id]/route.ts` PATCH, `essays.test.ts`; 00 §10 essays row; openapi `PATCH /essays/{id}`, `EssayPatch` (`minProperties: 1`) | PATCH calls `updateEssay(deps, actor, id, body(req, EssayPatch))`. Test: status `ready` (with `latestWordCount: null`) and a title change. `{}` and an unknown status are 400, another student gets 404, and the list reflects the change. essays goes from 7 to 8. |
| R2P-8 | 14 N6 `offers/[id]/route.ts` DELETE, `money.test.ts`; 00 §10 new row; openapi `DELETE /offers/{id}` | DELETE calls `deleteOffer` and returns 204. Test: another student gets 404. The owner gets 204, then a 404 on GET, and the offer's lines are gone. A confirmed offer gets 409 with the core message and stays readable. money goes from 7 to 8. |
| R2P-1 | 14 N11 new `admin/aid-rules/route.ts` (GET, PUT), `admin/aid-deadlines/route.ts` (GET, PUT), `admin/aid-deadlines/[id]/route.ts` (DELETE), `admin.test.ts`; 00 §10 new row; openapi three paths plus `FederalLoanRates`, `AidRuleKey`, `AidRule`, `AidRuleInput`, `AidDeadlineInput` | GET takes a local `AwardYearFilter` (`AwardYear.optional()`). PUT is an upsert, so it returns 200. Five tests, one per method: rule upsert (same id on the second PUT; 31% rate and unknown key are 400; student 404), rule list with filter (bad year 400, signed out 401), deadline insert and edit (unknown id 404, `ZZ` 400), deadline list in award-year-then-date order (student 404), and delete once (student 404, then 204, then 404). admin goes from 7 to 12. |
| R2C-13 | 14 N12 route, prose, `import.test.ts`, checklist, Testing Requirements; 00 §10 import row; openapi import description | Import errors are remapped with `line: parsed.lines[e.line - 1] ?? e.line` before the merge. New test: CSV lines 2, 4, and 5 are valid and line 3 is bad. A queued `importColleges` error on its row 3 comes back as `line: 5`, the spy saw three rows, and `skipped` is 2. import goes from 4 to 5. |
| R2C-12 | 14 N14 `extension.test.ts`, route comment; 00 §10 save-page and local rows; openapi descriptions | `tokenFor` returns `user`. The save test asserts exactly one `scholarshipApplications` row `{ scholarshipId: summary.id, stage: "planned" }`. The route is unchanged, and the count stays the same. |
| R2C-5 | 14 N8 `plan/regenerate/route.ts` comment; 00 §10 plan row; openapi `/plan/regenerate` | No code change. The payload has no `source`, so it's a `"user"` plan that counts, and the fan-out's `source: "system"` plans don't. The existing 202 and 402 tests stay. |
| R2P-10, R2P-18 | openapi `ServiceLog`, `Essay`, `GET /scholarships` | `ServiceLog.verificationExpiresAt` (date-time or null) and `Essay.latestWordCount` (integer ≥ 0 or null) are both required. `GET /scholarships` gets an `excludeScams` boolean query parameter. |

Deviations (smallest correct alternative):
- R2I-2 test: it calls core `invite` from `@scholarcrew/core/family`, not `POST /family/invites`, because that route is M10's and M7's test must pass at M7.
- R2C-13 test: a valid parsed row never fails `CollegeImportRow` again inside `importColleges`, so a CSV alone can't trigger an import-side error. `import.test.ts` uses `vi.mock("@scholarcrew/core/admin")` with a pass-through `vi.fn(actual.importColleges)`, and one test queues `mockResolvedValueOnce`. Vitest 3.2's `restoreAllMocks` (13's setup) only restores `vi.spyOn` spies, so the other tests still run the real function.
- 00 §10: the `/scholarships/local` row also says the submission lands on the board (07 does this on every path). The CSV import row now names `parseScorecardCsvWithErrors` and the `lines` remap. The plan row notes who counts toward the allowance.
- openapi: `FactVisibility` and `ShareCategory` get descriptions for R2I-10 and R2I-11. Doc only; no path or schema count changed.

Counts:
- 13: 13 files, 105 → 106 tests (auth 10). Running totals M7 55, M8 63, M9 70, M10 78, M11 83, M12 92, M13 100, M14 106. Still 44 route files.
- 14: 14 files, 81 → 90 tests (scholarships 8, colleges 9, essays 8, prep 5, impact 5, money 8, aid 3, plan 5, crew 8, events 5, admin 12, import 5, helper view 3, extension 6). The route inventory goes from 77 to 81.
- Web package: `Test Files 27 passed (27)`, `Tests 196 passed (196)`.
- openapi: 125 paths (44 + 81) and 161 operations. Every `$ref` resolves (checked by parsing the YAML), and no `operationId` repeats.

Follow-ups for other plans (not edited here):
- `docs/api/README.md` line 59 still says verify sends "new users" to `/onboarding`. It should read "a student who hasn't finished onboarding", and a new parent invitee lands on `/week` (R2I-2).

## Round 2 P-G fixes

Source: `plans/reviews/r2-fixplan.md` (P-G), the cited findings in `r2-crew.md` and `r2-identity.md`, and the P-A..P-F sections above. Only `plans/16-web-shell-core.md` was edited. Plan 15 has no change (as the fix plan says), and 00 §9.8/§9.9 have no contract change: `PlanWeekButton` and `BillingReturnNotice` are page components, and every export that 17/18/19 use (`Thread`/`ThreadProps`, `ReplyCard`, `useJobStream`, `isLimit`, the nav helpers) is unchanged. Coordinator calls applied: R2C-5 adds a student "Plan my week" button that calls `POST /plan/regenerate`; R2I-3 parents set their name and time zone; R2I-8 is copy only, as the fix plan says (a first call for a digest-only switch was withdrawn, see deviation 1); R2I-11 keeps the `sensitive` toggle as parent-visible sensitive match reasons.

| Finding | File and task | Change |
|---|---|---|
| R2C-5 | 16 P9 new `components/week/PlanWeekButton.tsx`, `cards.test.tsx`; P10 `week/page.tsx`, `WeekPage.test.tsx`; Files, Testing Requirements, manual smoke | `PlanWeekButton()` (client, no props) posts `/plan/regenerate`, follows the returned `CrewJob` with `useJobStream`, calls `router.refresh()` on a terminal status ("Your crew couldn't plan this week. Try again in a minute." on `failed`), shows "Planning…" while busy, and shows the server message plus `isLimit` "See plans" (`/settings`) on 402. `/week` renders it under `PlanList` for students only. Tests: post, stream, and refresh; 402 link with no stream; the page shows it to the student and not to the parent (assertions in the existing page tests). |
| R2C-1 (test) | 16 P12 `Thread.test.tsx` | New test: in a family room with `authors`, the parent's bubble carries "Dana" and not "Maya", and the student's carries "Maya". |
| R2I-3 | 16 P17 `settings/page.tsx`, new `SettingsPage.test.tsx`; P16 `cards.test.tsx`; deviations | The page passes `editable={isStudent \|\| isParent}`, and `displayName={me.user.displayName.trim()}` so a parent with no name gets an empty field (not `displayNameOf`'s email fallback; that import is gone). The line-33 deviation is removed. Tests: `AccountCard` saves a parent's trimmed name and time zone (Save disabled while blank), and the parent's settings page has an editable Name and Time zone and no extension card. |
| R2I-8 | 16 P16 `NotificationsCard`, `cards.test.tsx` | Copy only, with no core change and no new field. The one email switch (`emailEnabled`) is labeled "Email me (digest, deadline reminders, new matches)", with the detail "The digest is skipped when there's nothing new". The reminders row shows `StatusPill on` with "7, 3, and 1 day before", or `Badge tone="neutral"` "Off" with "In the app only" while email is off. Tests: the existing test queries the renamed switch, still PATCHes `'{"emailEnabled":false}'`, and checks that the card has two switches (email and SMS). A new test flips the reminders row to Off / "In the app only". |
| R2I-9 (copy) | 16 P16 `NotificationsCard`, `cards.test.tsx` | "Texts wait until your quiet hours end." under the SMS toggle, asserted in the NO-05 test. |
| R2I-10 | 16 P18 `memory/labels.ts`, `FactsCard.tsx`, `FactsCard.test.tsx` | `visibilityOptionsFor(key, current)` offers "Scout only" only for `PROFILE_FACT_KEYS` (imported from domain), plus a fact that already has it so the select can show its value. `SCOUT_ONLY_HINT = "Used for scholarship matching only"` is the Select hint while Scout only is picked. New test: four options and the hint for `intended_majors`, three for `distance_pref`. |
| R2I-11 (copy) | 16 P18 `SensitiveToggles`, P19 `ShareToggles`, their tests | `SHARE_LABELS.sensitive` is "Sensitive match reasons (scholarship board only, never in chat)". The Memory note reads "never shown to schools, never shown to family unless you share sensitive match reasons". Assertions added to the existing first tests. |
| R2I-19 | 16 P17 new `components/settings/BillingReturnNotice.tsx`, `settings.module.css` `.notice`, `settings/page.tsx`, `SettingsPage.test.tsx` | `BillingReturnNotice({ status, pollMs?, maxPolls? })` (the optional props default to `BILLING_POLL_MS = 3000` and `BILLING_MAX_POLLS = 5`, for tests). On success it shows "Payment received. Your plan updates in a minute." (`role="status"`), checks `GET /billing` every 3 s up to 5 times, and calls `router.refresh()` once `plan !== "free"` (then "Payment received. Your plan is updated."). On cancel it shows "Checkout canceled." The page reads `searchParams.billing` and ignores other values. Tests: poll then refresh then stop, give up after five, cancel never polls, and the page shows or ignores `?billing=`. |
| R2I-20 | 16 P17 `ExtensionTokens.tsx`, `ExtensionTokens.test.tsx` | The mask is `sct_••••` with no suffix. The fixture secret is now `sct_`-shaped, and the test checks that the id's last four characters don't appear. |

Deviations:

1. R2I-8, reverted: a first coordinator call asked for a separate digest-only switch backed by a new `digestEnabled` field. The coordinator withdrew it because it contradicted the fix plan's copy-only choice (§3: NO-04 asks only for email on or off). Plan 16 has no `digestEnabled` and no "Weekly digest email" switch, and no other plan needs a follow-up for it. The switch uses the fix plan's full label, so its accessible name starts "Email me".
2. R2I-8 pill: plan 15's `StatusPill` has no `off` status, so the Off state is `Badge tone="neutral"`, and 15 doesn't change.
3. R2I-10: a non-profile fact that's already `scout_only` keeps the option so the select stays truthful. The fix plan didn't cover that case.
4. R2I-3: the editable card gets the raw `displayName`, not `displayNameOf(me)`, so a nameless parent isn't shown their email's local part as a name.

Counts: 16 goes from 29 files and 152 tests to 30 files and 163 tests:
- By area: lib 28, shell 28, week 26, crew 23, onboarding 15, settings 21, memory 11, family 11.
- Step lines: P9 22 (cards 14), P10 26, P12 15 (thread 8), P13 23, P16 8, P17 4 files and 21 (cards 8, tokens 3, data 5, page and notice 5), P18 11 (facts 6).
- The P21 gate and Testing Requirements are updated to match. Plan 15 stays at 29 files and 106 tests.

Follow-ups for other plans (not edited here):
- 19: any e2e step that finds the "Weekly digest email" switch must use "Email me (digest, deadline reminders, new matches)". A grep finds none today.

## Round 2 P-H fixes

Source: `plans/reviews/r2-fixplan.md` (P-H), the cited findings in `r2-crew.md` and `r2-pipeline.md`, and the P-A..P-G sections above. Only `plans/17-web-pipeline.md` was edited. Names come from the landed 02, 07, 08, and 14/00 §10 changes: `board.flagged` with `RETIRED_TEXT`/`UNDER_REVIEW_TEXT`, the ranked Matched column, `deleteOffer` (`DELETE /offers/:id`), `updateRecRequest` (`PATCH /recommendations/:id`, `RecRequestPatch`), `updateEssay` (`PATCH /essays/:id`, `EssayPatch`), `ServiceLog.verificationExpiresAt`, and the offer, calculator, Scorecard cost order. Plan 16's exports are used unchanged. The appeal and retake `/crew/<conversationId>` links need no 17 change.

| Finding | File and task | Change |
|---|---|---|
| R2C-12 / R2P-12 | 17 Q5 `AddLocalModal.tsx`, `BoardView.test.tsx` | One request: `POST /scholarships/local` only, since 07 adds the `planned` application. "Added to your board" stays. The test asserts exactly one call and its body. |
| R2P-3 (copy) | 17 Q8 `[slug]/page.tsx`, `DetailPage.test.tsx` | With no reasons, a saved card says "You don't match any listed rule yet." and an unsaved listing still says "Save it to see how you match." New test covers both. |
| R2P-5 (test) | 17 Q3 `board.ts` comment, `board.test.ts` | New test: `boardColumns` keeps the core's Matched order against deadline order, with and without a filter. |
| R2P-8 | 17 Q23 `UploadLetter.tsx` (new export `RemoveOfferButton`), `/money/offers/page.tsx`, `UploadLetter.test.tsx`, intro | `accept="application/pdf"` and a PDF-only check ("Upload the award letter as a PDF. Aid can only read PDFs."), with the hint "Upload the award letter as a PDF (up to 10 MB)." The failure copy matches 12's `PARSE_FAILED_TEXT` wording ("Upload a clearer PDF, or compare it by hand in the offer tool"). Retry: a failed parse offers "Remove and try again" (DELETE, then the form resets). The "Letters in progress" list has Remove on failed and `needs_review` letters (students only). Tests: a PNG and a .docx are refused with no fetch; the failed path DELETEs and resets; `RemoveOfferButton` DELETEs and refreshes, and shows a 409's message. |
| R2P-10 | 17 Q29 `ServiceLogs.tsx`, `ServiceLogs.test.tsx`, Q30 `/impact` page | Fixture adds `verificationExpiresAt: null`. A `requested` log past its expiry shows "Link expired" (no "link sent"), and `canAsk` includes it. New prop `now` (server clock ISO) from the page. New test: an open link stays "Waiting" with no button, a lapsed one is expired and re-asks with `POST /service-logs/:id/verify`, and parents get no button. |
| R2P-11 | 17 Q16 `REC_STATUS_LABEL`, `colleges.module.css` `.statusSelect`, Q19 `Recommenders.tsx`, `CollegeDetail.test.tsx` | Each past request has a status select (Asked, Agreed to write, Submitted, Declined), and "Asked" is disabled. Choosing a status sends `PATCH /recommendations/:id { status }`, then refreshes. `REC_STATUS_LABEL` now reads "Asked" and "Submitted". The summary line drops the status. New test, plus the list test reads the summary block and the select values. |
| R2P-13 | 17 Q21 `/money/page.tsx`, `CostsAid.test.tsx` | The calculator picker comes from `getCollegeList(deps, actor, studentId)` (students only), as `{ id: e.collegeId, name: e.college.name }`. New page test: a listed college with no estimate is offered, and parents get no picker or list read. |
| R2P-14 | 17 Q14 `EssayWorkspace.tsx`, `EssayWorkspace.test.tsx` | `EssayStatusSelect` (students only, next to Write and Review notes) sends `PATCH /essays/:id { status }` and refreshes; it rolls back and shows the message on error. New test. The test's router mock is now hoisted. |
| R2P-17 | 17 Q19 `ChecklistItems.tsx` (new prop `collegeId`), college page, `CollegeDetail.test.tsx` | Supplements with no `essayId` get "Start essay" (students only): `POST /essays { title: label, prompt: label, targetType: "college", targetCollegeId }`, then `PATCH /application-items/:id { essayId }`, then `router.push("/essays/<id>")`. New test checks the order and bodies. The parent test asserts there's no button. |
| R2P-6 (copy) | 17 Q21 `CalculatorForm.tsx` | The saved note reads "Ledger uses this instead of the Scorecard estimate until you confirm an award letter." No test change. |

Deviations (smallest correct alternative):

1. R2P-13: the fix plan's `e.name` doesn't exist on `CollegeListEntry`, so the picker uses `e.college.name`, like the other 17 pages.
2. R2I-11, not in P-H's list: Q8 used to drop sensitive reasons for parents itself, which would make the new `sensitive` share do nothing on the detail page. The page now shows what 07 `getBoard` returns. The parent test mocks a granted parent and expects both reasons. SC-02 stripping is 07's test.
3. R2P-4, not in P-H's list: 07 now puts retired and under-review cards in `board.flagged`, but their detail pages 404 and they aren't scams. `FlaggedCard` gives the "Flagged" badge and "Why flagged?" link only when the reason is a `SCAM_FLAG_TEXT` value. Otherwise it shows "Not available" with no link. Client code can't import 07's `RETIRED_TEXT`, so it checks the domain scam texts instead. New BoardView test. The first test's reason is now `SCAM_FLAG_TEXT.application_fee`.
4. R2P-8 retry: there's no re-parse route, so retry means remove and upload again. Remove is offered on failed and `needs_review` letters only, as the fix plan says; parsing and confirmed letters don't get it.
5. R2P-11: the status control is a native `<select>`, because plan 15's `Select` can't disable an option. A `draft` row shows as "Asked"; no path creates drafts.

Counts: 17 goes from 30 files and 117 tests to 30 files and 126 tests.
- By area: scholarships 35, essays 31, colleges 18, money 22, prep 9, impact 11.
- Per file: board 7, BoardView 6, DetailPage 4, EssayWorkspace 3, CollegeDetail 7, CostsAid 5, UploadLetter 5, ServiceLogs 4.
- Step lines: Q3 7; Q5 23; Q6 25; Q8 34; Q14 27; Q15 31; Q19 18; Q21 9; Q22 13; Q23 18; Q24 22; Q29 8; Q30 11.
- The Q32 gate, Testing Requirements, and the Review Checklist routes (`PATCH /recommendations/:id`, `PATCH /essays/:id`, `DELETE /offers/:id`, and `PATCH /application-items/:id` with `essayId`) are updated to match. No file was added.

Follow-ups for other plans (not edited here):
- 19: no selector changes. The award-letter spec uploads a PDF and scopes "Review the lines" to the upload card, so the new Remove buttons don't collide. A 19 step that reads past-request text would now see "Asked" or "Submitted", but none does today.
- 07 (optional): if parents should see "This listing was retired" without the client-side check, `Board.flagged` could carry a `kind: "scam" | "retired" | "review"`.

## Round 2 P-I fixes

Source: `plans/reviews/r2-fixplan.md` (P-I), the cited findings in `r2-crew.md`, `r2-identity.md`, and `r2-pipeline.md`, and the P-A..P-H sections above. Only plans 18, 19, 20 and 00 §11/§12 were edited. Names are the ones 02, 07, 08, 14, and 16 landed (`AidRuleInput`, `AidDeadlineInput`, `listAidRules`, `listAidDeadlinesForAdmin`, the three admin aid routes, `CrewRequester`, `PlanWeekButton` "Plan my week").

| Finding | Plan and task | Change |
|---|---|---|
| R2C-6 | 18 R14 `review.ts`, `TaskReview.tsx`, `review.test.ts`, `TaskReview.test.tsx` | `draftOf`/`reportOf` return a `user_submission`'s `draft ?? null` and `report ?? null`. With a draft, the task shows field rows and code checks, and its one Publish runs `publishDraft`, which PATCHes `/admin/scholarships/<task.scholarshipId>` (keeping `existing.slug`) and then resolves with `publishScholarshipId`. `createdId` starts at `task.scholarshipId` for submissions, so it never POSTs a duplicate. `publishSubmission` shows only when there's no draft, with a note that it ships the row as entered. Tests: review (draft/report read, placeholder slug kept), TaskReview (draft submission PATCH then resolve, with `pay_for_info` from the report; no-draft submission keeps plain Publish). |
| R2C-7 | 18 R14 `TaskReview.tsx`, test | For `recheck_changed`, Reject becomes "Keep current listing" (resolve `rejected`; 08 H11 republishes a stale listing) and a new "Retire listing" needs a note, calls `POST /admin/scholarships/:id/status { status: "retired", note }`, then resolves `resolved` with `publishScholarshipId: null`. Test: labels, the note check, the two-call retire, and the one-call keep. |
| R2P-1 | 18 new R16 `AidRulesEditor.tsx`, `AidRulesEditor.test.tsx`, `(admin)/admin/aid/page.tsx`; R11 `AdminFrame` NAV and test; Files, Gate (now R17), Testing Requirements, checklist; 00 §11, §12 | The page reads `listAidRules`/`listAidDeadlinesForAdmin` through core (D36), defaults to `currentAwardYear(now)`, and has year chips for −1/0/+1. The editor has a loan-rate form (three percentages and a source URL, `PUT /admin/aid-rules`) and a deadlines table with add, edit (sends `id`), and delete (`DELETE /admin/aid-deadlines/:id`). NAV adds `{ key: "aid", label: "Aid rules", href: "/admin/aid", icon: "doc" }`; the AdminFrame test asserts the link and `adminActiveKey("/admin/aid") === "aid"`. Three editor tests. |
| R2I-9, R2I-17 | 18 R3 privacy page, `legal.test.tsx` | Adds "If you turn on text reminders, we send your phone number and the reminder to Twilio to deliver it.", Twilio in the provider list, the mobile number under "What we collect", and "If you're under 13, we delete the account and everything in it within 7 days." The legal test checks all three phrases (count unchanged). |
| R2C-12 | 20 T7 `messages.ts`, T8 router test, T9 popup test, intro, Testing Requirements, checklist | `SAVED_MESSAGE` is "Saved. It's on your board as unverified." in code, tests, and prose. The intro says the same call puts the listing on the board as `planned`. Counts unchanged. |
| R2C-1 (D42) | 19 S17 `fixtures.ts`, S18 `privacy.ts`/`privacy.test.ts`, notes, checklist | `crewInput` sets the required `requester`: `PARENT_REQUESTER` (`{ role: "parent", firstName: "Dana" }`) for family audience, otherwise `studentRequester()` (Jordan). It takes optional `requester` and `history` (lines carry `speaker`). Family cases pass `FAMILY_HISTORY` (a student line and a crew line). New property in `familyCase`: "Compass hears the parent who asked, and earlier lines by who said them" (`Dana (parent) asks: <question>`, `Student:`/`Crew:` labels). Two new tests: it passes on a scripted run, and fails when the prefix is stripped from the captured request. |
| R2C-3 | 19 S10 `isolation.spec.ts`, intro, Testing Requirements, checklist | The final apply is now two concurrent `POST /actions/apply` calls (`Promise.all`): at least one 200, any other is 409 `conflict`, exactly one new plan item, and `appliedCardIds` is `["next-deadline"]`. Same test, still 19 probes. |
| R2C-5, R2C-12, R2C-6 (selectors) | 19 S3, S7, S9, checklist | S3 sees "Plan my week" for the student; S7 sees none on the parent's `/week`; S9 checks the submission is `planned` in the student's board (`GET /scholarship-applications`) and the comment explains why fake mode shows one plain Publish. "Plan my week" was grepped in 16. |
| 00 §12 | WK, CR-08, MO, AID, FA, NO, CA, EX rows | WK adds 05 (Monday `plan.weekly.fanout` schedule), 12 (fan-out handler), 16 (Plan my week). CR-08 adds 10 (lookup-first) and 12 (port by room). MO and AID add 03 (sample seed), 14 (admin aid routes), 18 (`/admin/aid`). FA adds 08 (aid-linked tasks, `review_costs`), 09/12 (parent requester), 19 (privacy evals). NO adds 03 (`smsSentAt`), 12 (`notify.sms`, Twilio), 18 (privacy). CA adds 18 and the stale-restore note on 08. EX adds 07 (saved page lands on the board). |
| 00 §11 | admin and `/week` rows | The admin row adds `/admin/aid`; `/week` notes the student's "Plan my week". |

Deviations (smallest correct alternative):
- 19: the fix plan says "fixture-only, no new tests". Per the coordinator's brief, 19 also adds the parent-message eval (a property plus two tests) and the double-apply probe. The probe sits inside the existing isolation test, which already has a fresh unapplied card, so the e2e count doesn't change.
- 18 R2C-7: "Retire listing" needs a note (it changes a public listing). "Keep current listing" doesn't, because it's a verification like Publish.
- 18 R2P-1: the aid editor is a new task R16, and the Gate moves to R17. Validation messages are local to `AidRulesEditor` (field-named), not `listingForm`'s `issuesToErrors`. The page's award-year chips are an addition.
- 00 §12: 05/12/16 go on the WK row, not ON, because the weekly rerun is This Week's path (ON already lists 12 and 16). The E-15-3 and E-16-8 follow-ups were already applied (SE lists 15, and HL and EX list 16), so those rows needed no change.
- Coordinator note (P-G): 19 has no step that selects a notifications switch, so the "Email me (digest, deadline reminders, new matches)" label needs no selector change.

Counts:
- 18: 24 files / 99 tests → 25 files / 106 (public 14 / 54, auth 2 / 15, admin 9 / 37). Running totals: R14 30 (review 5, TaskReview 8), R15 34, R16 37.
- 19: e2e still 17 tests in 12 specs. Evals `check` 42 → 44 in 11 files (privacy 6; S18 36). Still 6 scenarios and 18 cases.
- 20: unchanged at 9 files, 134 tests.

## Round 3 R3-C fixes

Source: `plans/reviews/r3-fixplan.md` (R3-C) and the cited findings in `r3-events.md` and `r3-api.md`. Edited: plans 13 and 14, `docs/api/openapi.yaml`, `docs/api/README.md`, `docs/engineering/deployment.md` (the fix plan puts it in R3-C), and 00 §3 and §10 (Edit tool only). Core names come from the fix plan (06 `consumeRateLimit` with `details.retryAfterSeconds`, the F13 `details: { reason: "underage" }`, the F18 `markdown` field). Lead override applied to R3E-1: no `Content-Encoding` header (see deviation 1).

| Finding | Plan and task | Change |
|---|---|---|
| R3E-1, R3E-2 | 14 N10 intro, `stream.ts`, `events.test.ts`, Testing Requirements, checklist; 00 §10 SSE paragraph; openapi `streamJobEvents`; README event stream; deployment.md | `SSE_HEADERS` is `content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform`, `connection: keep-alive`, `x-accel-buffering: no`. `JobEventTiming.pingMs` (default 15,000) and `SSE_PING = ": ping\n\n"`: `send` records `lastWriteAt`, and a poll with no change writes the ping once `pingMs` passed. The N10 intro has a library note: buffering under `next start` and behind the proxy must be checked at execution with `curl -sN -D - -H 'Accept-Encoding: gzip' …/events`, and `compress: false` in 13 M2 is the fallback only if that check fails. Tests: the first test asserts the four headers and no `content-encoding`; `parseFrames` drops blocks that start with `:`; a new test (`pollMs 20, timeoutMs 200, pingMs 50`, job never changes) sees at least two `: ping` lines and frames `["job", "end"]`. events 5 → 6. |
| R3E-11 | 13 M14 `account/exports/[id]/route.ts`, `account.test.ts`; 00 §10 export row; openapi `getExport`; README Downloads | Non-strict `ExportQuery` with `format: z.enum(["json", "md"]).default("json")`, parsed before `getExport`. With `md` and a ready file, the route returns the stored `markdown` as `text/markdown; charset=utf-8`, named `scholarcrew-export-<date>.md`. A not-ready export still returns the `ExportRecord`. New test: the Markdown content type, the filename, a body that starts with `# ScholarCrew export`, `format=json` is JSON, and `format=pdf` is 400 `invalid_input`. account 6 → 7. |
| R3A-1 | openapi `HelperView` | `request` is now in `required` and `properties`: an object with `required: [message, dueDate]`, `message` string or null, and `dueDate` date or null. |
| R3A-2 | openapi `CatalogTaskPayloadUserSubmission` | Optional `draft` (ListingDraft or null) and `report` (VerificationReport or null). Neither is in `required`. |
| R3A-3 | openapi `deleteAidDeadline` | Deleted the second `"404"`. |
| R3A-5 | openapi `NetPriceByIncome`, `CollegeDeadlines`, `CollegeRequirements`, `LocalArea` | The three response-only schemas list every property in `required`. They're used only by `College`. `LocalArea` gets the "`counties` and `cities` default to `[]` in requests and are always present in responses" description. |
| R3A-6 | 13 rules line; 00 §10 intro; openapi info | "Creates return 201 (`json(x, 201)`), job starts return 202 (`json(job, 202)`), `undefined` returns 204, and everything else returns 200." |
| R3A-7, R3A-8 | openapi `responses.Forbidden` and `responses.Internal`; README errors table | The fix plan's wording, including `details.reason: "underage"` and "billing not set up". |
| R3A-9, R3A-10 | README Rate limits, Uploads | The right-most `X-Forwarded-For` hop, then `X-Real-IP`. A file over 10 MB is 413 `invalid_input`. |
| R3A-11 | 13 M4 `errorResponse`, `http.test.ts`, M7 magic-link test, rules line, checklist; openapi `RateLimited` plus a new `headers.RetryAfter`; README; 00 §3 | When `code === "rate_limited"` and `details.retryAfterSeconds` is a finite number, `errorResponse` sets `retry-after` to `String(Math.max(1, Math.ceil(n)))`. `withExtensionCors` copies the headers, so CORS responses keep it. New http test: `retryAfterSeconds: 600` gives `retry-after: "600"` and the details in the body; another code with the same details, and a `rate_limited` with no details, get no header. The magic-link per-email test asserts `retry-after` matches `/^\d+$/`. 00 §3 has "429 responses carry `Retry-After` in seconds." http 23 → 24. |
| R3A-12 | 00 §10 rows; README Pagination | `GET /family/budget` returns "FamilyBudget or null · FamilyBudget". `/scholarships` adds `excludeScams` and `pageSize` (1–50, default 20). The apply row adds the 409 and the temporary-room 400. README adds `GET /admin/scholarships` (`page`, fixed at 50). |
| R3A-13 | 13 M7 `auth/sign-out/route.ts`, `auth.test.ts`, checklist; 00 §10 row; openapi `signOut`; README Session cookie | The route is `route({ auth: "optional" }, …)` and runs `if (token) await signOut(deps, token)`. It always returns 204 with `clearSessionCookie()`. New test: a session expired by the clock gets 204, the clearing `Set-Cookie`, and no session row left; a request with no cookie also gets 204 and the clear. openapi: `x-auth: optional`, `security: [{}, cookieAuth]`, 401 removed. auth 10 → 11. |
| R3A-15 | openapi `applyActionCard`; README Action cards | Inline `"409"` ("another apply of this card is still running; retry in a minute") and an inline `"400"` that names memory cards in temporary chats. README has the two sentences and "a retry within a minute may get 409 while the first apply finishes". |
| R3A-16 | openapi `requestEssayReview` | Inline `"400"`: "the essay has no saved version yet". |
| R3A-17 (13 test) | 13 M8 `profile.test.ts`; openapi `completeOnboarding` | The under-13 test asserts the whole error, `{ code: "forbidden", message: "ScholarCrew is for students 13 and older", details: { reason: "underage" } }`. The count is unchanged. |
| R3A-25 | 13 M4 `contentDisposition`, `http.test.ts`; openapi `headers.ContentDisposition`; README Downloads | `filename*` escapes `'()*` as `%XX`. The `fileResponse` test adds `"Maya's essay (final).pdf"`, which gives `filename*=UTF-8''Maya%27s%20essay%20%28final%29.pdf`; its ASCII `filename=` keeps the apostrophe and parentheses. |

Deviations (smallest correct alternative):

1. R3E-1, lead override of the fix plan's `SSE_HEADERS`: `"content-encoding": "none"` is dropped because `none` isn't a registered content coding. `"content-type"` gains `; charset=utf-8`. `no-transform` alone keeps Next's bundled `compression` off the stream. The fix plan's R3E-1 names (§1) and its 00 §10/README sentence ("…`Content-Encoding: none`…") are superseded by the list in the R3E-1/R3E-2 row above. 00 §10, the README, openapi, and 14 all say "sends no `Content-Encoding`".
2. R3E-11: the format query is non-strict `z.object`, so an unrelated param such as a cache buster isn't a 400; only a bad `format` is. It's parsed before the export lookup, so `?format=pdf` is 400 even while the export is queued. The md body is the `markdown` field of the stored JSON. 06 doesn't store a second blob.
3. R3E-11 and R3A-13 tests are new `it` blocks, not extra assertions, so each finding has its own failing test.
4. R3A-17 spec drift beyond the fix plan: openapi `completeOnboarding` adds the 409 `conflict` that 06 throws, and its description names the `underage` reason. 16 P15 branches on both.
5. R3A-11: `errorResponse` rounds up and clamps to at least 1, so a fractional or zero value from a caller still gives a valid `Retry-After`. 06 already sends an integer ≥ 1.

Gate (R3A-3):
- `npx @redocly/cli` and `js-yaml` can't be installed here, so the check used PyYAML 6.0.3 with a `SafeLoader` subclass whose mapping constructor raises on a repeated key.
- Before the fix, that check failed with `duplicate key '404' (first at line 5686, again at line 5687)`.
- After the fix: `openapi 3.1.0: 125 paths, 161 operations, 260 schemas, 1085 $refs`. No `$ref` is unresolved, no `operationId` repeats or is missing, and every `required` name is in its `properties`.

Counts:
- 13: 13 files, 106 → 109 tests (http 24, auth 11, account 7). Running totals: M4 39, M5 42, M6 46, M7 57, M8 65, M9 72, M10 80, M11 85, M12 94, M13 102, M14 109. Still 44 route files.
- 14: 14 files, 90 → 91 tests (events 6). Still 81 routes.
- Web package: `Test Files 27 passed (27)`, `Tests 200 passed (200)`.
- openapi: 125 paths, 161 operations, and 260 schemas, all unchanged.

Follow-ups for other packages (not edited here):
- R3-B, 00 §14: the fix plan's Next.js note ends "If a target browser rejects `Content-Encoding: none`, drop that header". With the override, no such header is sent. The note should keep only the `next start`/proxy check (`curl -N -H 'Accept-Encoding: gzip' …/events` shows a frame each second and no `Content-Encoding: gzip`), plus "if compression still applies, set `compress: false` in 13 M2".
- 16, 17, 19: no change. No client asserts SSE header values, and `EventSource` accepts the `charset` parameter and ignores `: ping`.

## Round 3 R3-D fixes

Source: `plans/reviews/r3-fixplan.md` (R3-D), the cited findings in `r3-values.md`, `r3-api.md`, and `r3-events.md`, and the round 2 sections above. Only plans 16 and 17 were edited. 15 and 00 §9.8/§9.9 needed no change: the skipped badge uses the existing `Badge` (`tone="neutral"`, `icon="info"`), and no §9.8 signature changed. Names are the fix plan's: `UNKNOWN_AMOUNT`, `parseDollars`, `APP_PLAN_LABELS`, `APPLICATION_STAGE_LABELS`, and `FREE_CATEGORIES` (02, already landed), `openOn`, `isLimit`, and `details.reason: "underage"`.

| Finding | Plan and task | Change |
|---|---|---|
| R3A-15 | 16 P11 `ActionButtons.tsx`, `ReplyCard.test.tsx` | On `ApiError` `conflict`, the card's button is disabled (label kept), a `role="status"` line says `ALREADY_APPLYING` ("Already being added…", exported), `router.refresh()` runs, and no alert shows. Other errors are unchanged. +1 test. |
| R3A-14 | 16 P11/P12, 17 Q2 | The ReplyCard apply fake answers 200. Thread's `stubSend` defaults to 202, and the open-room fake answers 201 only for `POST /conversations` and 202 for the message. ContextCrew's message fakes answer 202. |
| R3A-17 | 16 P15 `OnboardingWizard.tsx`, test | `isUnderageBlock(e)` (`forbidden` with `details.reason === "underage"`) blocks and clears the draft. `conflict` clears the draft, then `router.push("/week")` and `router.refresh()`. Anything else shows `errorMessage(e)` and keeps the draft. The under-13 fake carries the reason. +2 tests (409, and a CSRF 403 that keeps the draft). |
| R3A-18 | 16 P15, P16 tests | `POST /onboarding` returns a full `ME: MeResponse`. `PATCH /profile` returns a `Profile`, and a blank one for the parent case. |
| R3A-13 | 16 P16 `AccountCard.tsx`, `cards.test.tsx` | `signOut` navigates on success or on `unauthenticated`. Otherwise it shows `errorMessage(e)` in a `role="alert"` paragraph and stays. There's no `finally`. +1 test (500 stays, then 401 and 204 leave). |
| R3E-11 | 16 P17 `DataCard.tsx`, test | "Download as Markdown" links to `markdownExportUrl(id)` = `/api/v1/account/exports/<id>?format=md`, and only shows while the JSON link is live. Assertions were added to the existing ready/expired test. |
| R3V-3 | 16 P19 `ParentSpace.tsx`, `ShareToggles.test.tsx` | Local `parseDollars` strips `[$,\s]`, requires `^\d+$`, and caps at 500,000. Save is disabled on `annual.trim() === ""`. The input keeps what the parent types. +2 tests ("12,000" saves 12000; " " disables Save, and "12k" is refused). |
| R3V-11, R3V-14, R3V-12 | 16 P19 `FamilyTasks.tsx`, test | Skipped renders `<Badge tone="neutral" icon="info">Skipped</Badge>`, and a dated task shows `` `Due ${dateShort(t.dueOn)}` ``. The tag goes through `assigneeTag`, which keeps 06's fallback phrases whole. The fixture and the `Mark done:` name use "2027-28". +1 test (due date, no check icon, fallback). |
| R3V-1 | 17 Q3 `board.ts`, Q5 `ScholarshipCard.tsx`, Q8 page, tests | `UNKNOWN_AMOUNT` and `cardAmount(c)` (the won amount, else unknown for `status === "draft"`, else `usd(amountMaxUsd)`). The detail page shows it for draft listings. +1 BoardView test and +1 DetailPage test. |
| R3V-2 | 17 Q6 `scholarships/page.tsx`, `SearchResults.test.tsx` | Passes `openOn: todayIn(v.deps.clock.now(), v.timeZone)`. A new page test runs at `2026-10-07T03:00Z` (still Oct 6 in Chicago) and expects `openOn: "2026-10-06"`. +1 test. |
| R3V-15 / R3A-19 | 17 Q7 `DetailActions.tsx`, `detail.test.tsx` | `StartEssayButton` sends `title.slice(0, 200)`. +1 test with a 200-character name. |
| R3A-20 | 17 Q7, Q17 tests | The detail-actions fake answers 201 for POST and 200 otherwise. AddCollegeModal uses 07's "Your list holds up to 25 colleges. Remove one to add another." |
| R3V-8 | 17 Q7 `detail.ts`, Q8, Q16 `colleges.ts`, Q20/Q22 money | `STAGE_LABEL = APPLICATION_STAGE_LABELS` and `PLAN_LABEL = APP_PLAN_LABELS`, so the local names are kept. `FREE` is deleted, and `OfferComparisonView` uses `FREE_CATEGORIES`. Q8 shows `NO_DEADLINE` ("Not posted") with "Check the sponsor's page", as 18 R4 does. CollegeTable asserts "Rolling admission". |
| Carry-over (E-16-6) | 17 `CommentsPanel`, `AppealButton`, `RetakeForm`, rules line 28 | `isLimit(e)` shows `<Button variant="soft" size="sm" href="/settings">See plans</Button>` next to the 402 alert. +1 test each (Review, UploadLetter, Retake). |

Deviations (smallest correct alternative):
- R3V-3: the old `onChange` already stripped non-digits, so "12,000" never reached `Number()` and " " became "". The bug was latent. The fix applies `parseDollars` as the single parse point and lets the field show what was typed.
- R3V-14: cutting the name to its first word would turn 06's "Your family member" into "Your". The local `assigneeTag` keeps "Your family member" and "Your student" whole, and uses "Your family member" for an empty name.
- R3A-13: there's no `Alert` component in 15, so the "Alert" is a `role="alert"` paragraph, the same pattern as every other 16 card.
- R3A-17: the new tests go through all five steps, because the client submits at step 1 only for under-13 birth years.
- R3V-2: 17 had no `/scholarships` page test. The new one lives in `SearchResults.test.tsx`, so the file count doesn't change.
- R3V-8: the Q8 null-deadline sub line changes from "No deadline listed" to "Check the sponsor's page" to match 18's pair. The college table's null-deadline "Rolling" (Q18) is out of scope and stays. Its test's `getByText("Rolling")` used to match the plan cell too, and now matches only the deadline cell. `LOANS` stays local, since the fix plan doesn't name it.
- Carry-over: `JobReply` needs no change because the 402 comes from the starting POST. The AppealButton test lives in `UploadLetter.test.tsx`, which is already in that task's commit.
- Exports for 18/19 are unchanged. The new exports (`ALREADY_APPLYING`, `markdownExportUrl`, `UNKNOWN_AMOUNT`, `cardAmount`, `NO_DEADLINE`) are additive. `offers.ts` no longer exports `FREE`, and no other plan imports it.

Counts:
- 16: 30 files / 163 tests → 30 / 170 (lib 28, shell 28, week 26, crew 24, onboarding 17, settings 22, memory 11, family 14). Running totals: P11 8, P12 16, P13 24, P15 17 (wizard 8), P16 9, P17 22 (cards 9), P19 11, P20 14.
- 17: 30 files / 126 tests → 30 / 133 (scholarships 39, essays 32, colleges 18, money 23, prep 10, impact 11). Running totals: Q5 24 (BoardView 7), Q6 27, Q7 6, Q8 38 (DetailPage 5), Q12 18 (Review 7), Q13 21, Q14 28, Q15 32, Q23 19 (UploadLetter 6), Q24 23, Q27 10 (RetakeForm 3).
- 15: unchanged.

## Round 3 R3-A fixes

Source: `plans/reviews/r3-fixplan.md` (R3-A) and the cited findings in `r3-events.md`, `r3-values.md`, and `r3-api.md`. Only plans 02, 03, 04, 06, 07, 08 and 00 §9.2/§9.4 were edited; 05, 00 §8, and 00 §9.1 need no change. Names are the fix plan's, verbatim.

| Finding | Plan and task | Change |
|---|---|---|
| R3E-7 | 06 F16 `deliverSms`, notifications test | `SMS_PREFIX = "ScholarCrew:"`, `SMS_OPT_OUT = "Reply STOP to opt out."`, `tail = [link, SMS_OPT_OUT].filter(Boolean).join(" ")`, `room = SMS_MAX - SMS_PREFIX.length - tail.length - 2`; only the title is cut (`room - 1` plus "…"). New test: a 200-character title, a 45-character `appUrl`, and an 80-character slug give 300 characters ending in the full link and the opt-out line. |
| R3E-8 + R3V-4 | 06 F2 `shared/dates.ts`, F18 `renderMarkdown`; 07 G14 `requestVerification`; 08 H8 `buildWeeklyDigest`; 00 §9.4 | `calendarShort(d: IsoDate)` ("Oct 15", UTC) and `instantInZone(d, timeZone)` ("Oct 20, 2026, 8:00 PM CDT", `\u202f` becomes a plain space). The digest prints `due Oct 15` and `(Oct 15)`. The verify-hours mail prints `on Sep 12` and `The link expires Oct 20, 2026, 10:00 AM CDT.` from the student's `users.timeZone`, read in the same query. Export fact dates use `todayIn(f.createdAt, user.timeZone)`. |
| R3E-10 | 02 B4 `profile.ts`; 06 F2 `email.ts` | `DisplayName = z.string().trim().min(1).max(80).regex(/^[^\p{Cc}]*$/u, ...)` is used by `ProfilePatch.displayName` (optional) and `OnboardingInput.displayName`. Both senders send `subject.replace(/[\r\n]+/g, " ")`. Tests: profile (+1), shared (+1). |
| R3E-11 | 06 F18 `collect`, `renderMarkdown`, export test | `data.shareSettings` (`studentId = id`) and `data.familyTasks` (`studentId = id` or `assigneeId = id`). The Markdown gets `## Sharing with family` (`- <category>: on/off`, in `SHARE_CATEGORIES` order) and `## Family tasks` (`- <title> (<status>)`). New export test (+1). |
| R3V-5 | 04 D2 `formatUsd`, D2–D10 `index.ts`, index test; 07 G4 `sweep.ts`; 08 H1/H8; 00 §9.2 | `formatUsd(n) = USD.format(Math.round(n))` is exported and in the contract list. The copies in 07 (`const usd`) and 08 (`usd` in `plan/common.ts`) are deleted, and their call sites import `formatUsd` from `@scholarcrew/engines`. New money test (+1): `-$500`, `$13`. |
| R3V-6 | 07 G5 `getBoard`; 08 H4 `loadContext`; 00 §9.4 | An open card adds to `inPlayUsd` only when `listing.deadline === null \|\| listing.deadline >= today`, and stays on the board. The pending query adds `or(eq(stage, "submitted"), isNull(deadline), gte(deadline, today))` with `today = todayIn(now, userTimeZone)`. One test each (+1, +1). |
| R3V-7 | 02 B1 `common.ts`; 06 F2; 07 G8; 00 §9.4 | `awardYearFor(season): AwardYear` lives in 02 (common test +1, the cases moved from 07). `currentAwardYear(now) = awardYearFor(currentSeason(now))`. 06's test is now "follows the season" (Jul 31 → 2026-27, Aug 1 and Aug 15 and Oct 6 → 2027-28). 07 imports the 02 function. |
| R3V-8 | 02 B3/B4; 08 H1 | `APP_PLAN_LABELS` (08's wording) sits in `colleges.ts` and `APPLICATION_STAGE_LABELS` (17's wording) in `scholarships.ts`. The index test lists both and checks they cover their enums. 08 deletes its copy and imports the 02 map in `deadlines.ts` and `notify.ts`. |
| R3V-9 | 06 F2; 07 G1/G2/G3/G4/G5; 08 H1/H4/H5; 00 §9.4 | `todayIn` lives in `shared/dates.ts` (shared test +1). 07 `common.ts` and 08 `plan/common.ts` delete their copies, and every call site imports it from `../shared`. 07 deletes `listPublicByState`, its two tests, its index entry, and its prose. 00 §9.4 drops it. |
| R3V-12 | 03 C7 seed, seed test | "Start the 2027-28 FAFSA with Dana", with a hyphen (it was the only `20xx–yy` string). The seed test asserts the title and that no week title matches `/\d{4}–\d{2}/`. The count is unchanged. |
| R3V-13 | 06 F13 `completeOnboarding`, profile test | `isUnderMinAge(birthYear, today)` with `todayIn(now, input.timeZone)`. The time-zone check moves above the gate. New test (+1): at `2027-01-01T03:00Z`, a Central student born in 2014 is blocked. |
| R3V-14 | 06 F10 `settings.ts`, settings test | `taskQuery` selects `assigneeRole`. `assigneeNameOf(r) = displayName.trim() \|\| unnamedInviter(role)` serves both `presentTasks` and `createTask`, and `unnamedInviter` is now exported from `family/core.ts`. New test (+1): "Your family member". |
| R3A-11 | 06 F3 `ratelimit`; 00 §9.4 | `returning({ count, windowStart })`, `retryAfterSeconds = max(1, ceil((windowStart + window - now) / 1000))`, and `AppError("rate_limited", "Too many requests. Try again in <waitText(s)>.", { retryAfterSeconds })`. `waitText` is exported. New test (+1): 600 s and "10 minutes", then 500 s and "9 minutes", plus the `waitText` bands. |
| R3A-17 | 06 F13; 00 §9.4 | The gate throws `new AppError("forbidden", "ScholarCrew is for students 13 and older", { reason: "underage" })`. The under-13 test asserts `details: { reason: "underage" }`. |

Deviations (smallest correct alternative):
- R3E-8, 07 G14 test: the fixture's `servedOn` is `2026-09-12`, so the mail asserts `STEM night on Sep 12: 2.5 hours` (not "on Oct 5") and `The link expires Oct 20, 2026, 10:00 AM CDT.`
- R3V-9: the `todayIn` tests in 07 G1 (`common.test.ts`, −1) and 08 H1 (assertions only; that file stays at 3 tests) moved to 06 shared. 08's `usd` assertion was dropped, since 04 tests `formatUsd`.
- R3E-11: in the Markdown, an aid-linked family task shows its aid item's status (`leftJoin aidChecklistItems`, R2I-6). The JSON keeps the raw task rows.
- R3E-7: the title cut uses `Math.max(0, room - 1)`, so an extremely long link can't make `slice` negative.
- 00 §9.4 also notes `requestVerification`, `buildWeeklyDigest`, `deliverSms`, `buildExport`, `listTasks`, `archiveSeason`, and the profile age gate, all doc only.
- Process: one 00 write went through a script instead of Edit. Afterward, R3-C's §3 `Retry-After` line and §10 ping text were confirmed present. R3-B should confirm that its §9.5/§14 edits are in 00.

Counts:
- 02: 11 files, 71 → 73 tests (common 8, profile 8).
- 03: seed test still 6.
- 04: 10 files, 119 → 120. Step lines: D2 15, D3 27, D4 43, D5 53, D6 77, D7 90, D8 100, D9 113, D10 120.
- 06: 20 files, 189 → 197. By area: shared 16, ratelimit 5, family settings 12, profile 10, notifications 17, export 7. Running totals: F3 29, F4 40, F5 55, F6 76, F7 81, F8 90, F9 107, F10 119, F11 126, F12 136, F13 146, F14 153, F15 158, F16 175, F17 182, F18 189, F19 197.
- 07: 17 files, 107 → 105 (common 5, search 10, board 12). Running totals: G4 30, G6 48.
- 08: 15 files, 92 → 93 (money 24: costs 11). Step lines: H4 11, H5 24.

Follow-ups for other packages (names are already fixed):
- 00 §12 PU row still names `listPublicByState` (R3-E).
- 12 deletes its `todayIn` and imports it from `@scholarcrew/core/shared` (R3-B). 19 imports `awardYearFor` from `@scholarcrew/domain` (R3-E). 13 M8 asserts `details.reason` (R3-C). 16/17/18 import `APP_PLAN_LABELS` and `APPLICATION_STAGE_LABELS` from `@scholarcrew/domain` (R3-D/R3-E).

## Round 3 R3-B fixes

Source: `plans/reviews/r3-fixplan.md` (R3-B) and the cited findings in `r3-events.md`. Only plans 09, 10, 11, 12 and 00 §9.5/§14 were edited (00 with the Edit tool only; §9.6 has no change). Names are the fix plan's: `ToolDef.strict?`, `MAX_SUBMIT_RETRIES = 1`, `invalid_submit`, `STRICT_UNION_LIMIT = 16`, `countStrictUnions(params: MessageCreateParams)`, `crew.invalid_submit`, `UNFINISHED_UNCERTAINTY.invalid_submit`, `sourceFieldsProblem`, `RawParsedOffer`, `normalizeParsedOffer`, `offer_parse.normalized`, `LINKS` functions, and `calendarShort`/`todayIn`/`formatUsd` as R3-A landed them in 06 and 04.

| Finding | Plan and task | Change |
|---|---|---|
| R3E-3 | 09 I1 `types.ts`, I3 `client.ts` `toolParam` | `ToolDef.strict?: boolean` (default true). `toolParam` sends `strict: true` unless `t.strict === false`, which leaves the key out; the schema is still `toStrictJsonSchema(t.input)`. client test +1. |
| R3E-3 | 09 I5 `limits.ts`, `loop.ts` | The internal submit tool has `strict: false`. `MAX_SUBMIT_RETRIES = 1` and `MAX_ISSUE_CHARS = 2_000`. A first invalid submit gets the existing `Invalid <name> input. <formatIssues>` `is_error` result; a second ends with `invalid_submit`. The assistant turn is already appended and nothing earlier is edited. Check retries are counted separately. `formatIssues` cuts the joined text to 2,000 characters plus "…". Loop tests: the submit tool's `strict` is `false`; invalid then valid gives `submitted`; two invalid give `invalid_submit` after 2 requests, with history `[user, assistant tool_use]` plus one `is_error` result matching `Invalid submit_answer input. answer: …`; the issue cap (+2). |
| R3E-3 | 09 I2 `schema.ts` | `STRICT_UNION_LIMIT = 16`; `countStrictUnions` counts nodes with `anyOf` or an array `type` across `strict: true` tools plus `output_config.format.schema`. The `toStrictJsonSchema` docstring says model schemas use `.nullable()`, never `.optional()`. Schema test +1 (strict tools counted, non-strict skipped, JSON output counted, type arrays counted). |
| R3E-3 | 09 I12 `crew.ts`; I13 `strictBudget.test.ts`, `weekly.test.ts` | On `invalid_submit`, `runCrewRequest` logs `crew.invalid_submit` and returns `{ reply: partialReply(OUT_OF_TIME_TEXT, contributors), status: "failed", safety: "partial", consulted }`. Crew test +1: one invalid `submit_reply` is retried to `ready`; two give `failed`, `OUT_OF_TIME_TEXT`, `partial`. New `strictBudget.test.ts` (+2) captures the first request `runCrewRequest` and `runWeeklyPlan` actually send (all seven `consult_*` tools, the calculators, and the submit tool), runs it through `buildTurnParams`, and asserts `countStrictUnions <= STRICT_UNION_LIMIT` and that `submit_reply`/`submit_plan` have no `strict` key. The weekly test also asserts two invalid plans give `{ items: [], reply: null }` (no count change). |
| R3E-3 | 10 J2 `definitions.test.ts`, J3 `consult.ts`, J5 `offerParse.test.ts` | `Unfinished` and `UNFINISHED_UNCERTAINTY` gain `invalid_submit: "My answer didn't pass the format check, so nothing in it is confirmed."`. Consult test +1 (one invalid `submit_result` retried; two give `COULDNT_FINISH_SUMMARY` with that line; the real submit tool is `strict: false`). Definitions test +1: for every role and both audiences, the role's tools plus a non-strict `submit_result` stay within the limit. Offer-parse test +1: `buildExtractParams` of the recorded extract request stays within the limit. |
| R3E-3 | 11 K5 `extract.test.ts` | +1: `buildExtractParams` for `ListingDraft` (the same schema K7's batch items send) is above 0 and within the limit. No catalog code change. |
| R3E-3 | 12 L3 `demo-model.test.ts` | New local `breakSubmits(n)` wraps the demo model and replaces the first `n` submit inputs with `{}`. +2: after one, the retry is answered and the request is `ready` with the usual reply; after two, it's `failed`, `partial`, with 09's `OUT_OF_TIME_TEXT`, and `crew.invalid_submit` is logged. |
| R3E-4 | 09 I9 `sources.ts`, I11 `COMPASS_SYSTEM` | New internal `sourceFieldsProblem` (`Receipt "<label>" must use sourceUrl null and verifiedAt null.`) for `fact`, `calculation`, and `record` after the known-ref check. A `record` whose ref is a known catalog listing runs the catalog check when it carries a link or date (see deviation 1). The prompt adds "sourceUrl and verifiedAt are null on every item except catalog items". Sources tests +2. |
| R3E-5 | 10 J5 `offerParse.ts` | `RawParsedOffer` (ParsedOffer's keys, no bounds) goes to `model.extract`. `normalizeParsedOffer` trims and cuts `label` to 120 (an empty label drops the line), cuts `renewalCondition` to 200 and `citedText` to 300, nulls a `page` that isn't an integer ≥ 1, drops lines whose `amountUsd` isn't an integer from 0 to 200,000, keeps 40 lines, nulls a bad `costOfAttendanceUsd` or `awardYear`, runs `ParsedOffer.parse`, and logs `offer_parse.normalized` with `dropped` when above 0. The `$0` filter runs after it. Instructions say "up to 200 characters". Test +1: a 250-character condition on a `page: 0` line, a `12.5` line, and a good line give 2 lines (condition cut to 200, `page` null); a direct call nulls a 250,000 cost and `2027-2028`, and keeps 40 of 45 lines. |
| R3E-6 | 10 J4 `quoteOccurs` | `from = at + 1`; the docstring names 07 `occurrenceIndex` and 17 `findOccurrence`. The test adds the "ha ha" cases (3 true, 4 false). |
| R3E-8, R3E-9 | 12 L11 `reminders-deadlines.ts`, `notices.test.ts` | New local `deadlineBody(dueOn)` = `Due ${calendarShort(dueOn)}. Plan time for it this week.`. `renewalBody` prints `calendarShort(dueOn)`. `LINKS: Record<string, (refId: string) => string>` with `college_list: (id) => \`/colleges/${id}\``; the fallback stays `/week`. The first reminder test asserts the body, the renewal test expects "around Nov 5", and a new college test (+1) asserts `/colleges/<entryId>`. |
| R3E-12 | 09 I11, 10 J1/J2 `RULES`, 12 L3 `describeDeadline` | Both prompts add the style line; the session test and every specialist prompt check `($12,345)` and `(Oct 15)`. The demo model prints `calendarShort(d.dueOn)`, so its expectations read `on Oct 15` and `on Nov 1`. |
| R3V-5 (10) | 10 J1 `shared.ts`, J6 `appeal.ts`, J7 `retake.ts` | `usd` and its test are deleted; call sites use `formatUsd` from `@scholarcrew/engines`. Appeal and retake expectations are unchanged. |
| R3V-9 (12) | 12 L2 `time.ts`, L5 `port.ts` | 12's `todayIn` and its test are deleted; L5 imports `todayIn` from `@scholarcrew/core/shared` (see deviation 5). |
| 00 §9.5 | `ToolDef`, `LoopResult`, contract list, prose | `ToolDef.strict?`; `LoopResult.reason` adds `invalid_submit`; `STRICT_UNION_LIMIT`, `countStrictUnions`, `buildExtractParams`, and the `MessageCreateParams` note; the submit-tool prose is replaced with the fix plan's wording, plus the append-only retry, the `invalid_submit` outcomes, and the R3E-4 receipt rule. |
| 00 §14 | Anthropic and Next.js notes | Anthropic: submit tools are non-strict, and "Verify strict-mode schema limits against current Anthropic docs at execution. The plan assumes at most 16 union-typed (`anyOf` or type-array) parameters across a request's strict schemas, and 09's `strictBudget.test.ts` enforces it", naming the 10/11 checks and where to change the limit. Next.js: "SSE sends `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`, and a `: ping` every 15 s. At execution, verify events arrive unbuffered under `next start`." |

Union counts by reading the schemas (Zod 4 emits `anyOf` for `.nullable()` and unions): the crew and weekly requests have 0 in strict tools (consult inputs and calculators have no nullable fields), Scout's request has 4 (`search_scholarships`), the offer parse has 3, and `ListingDraft` has 9. With the submit tools strict, `CrewReply` alone was about 17 (R3E-3).

Deviations (smallest correct alternative; names other clusters use are unchanged):

1. R3E-4: a `record` that cites a known catalog listing may carry the listing's exact `sourceUrl` and `verifiedAt` or both null, not only the catalog values. A saved scholarship's deadline (`scholarship:<id>`) is in `known.recordIds` from the snapshot and in `known.catalog` once a specialist cites it, and Compass's prompt and existing receipts cite deadlines with null fields. Requiring catalog values would fail every such deadline receipt (09's crew test `deadlineItem`, the sources acceptance test). Null shows no link, so the R3E-4 risk (an arbitrary link or date) is still closed.
2. `MessageCreateParams` moved from `client.ts` to `model/types.ts` (type only; `client.ts` re-exports it, so every import still works), so I2's `schema.ts` can type `countStrictUnions` before I3 creates `client.ts`. The root also exports the type.
3. The agents root also exports `STRICT_UNION_LIMIT`, `countStrictUnions`, and `buildExtractParams` (listed in §9.5), because 11 can only import `@scholarcrew/agents`. The I14 surface test checks them.
4. 10's definitions test builds the request with a non-strict `submit_result` that matches the loop's, because `consult.ts` doesn't exist yet at J2. J3's invalid-submit test checks that the real loop-built tool is `strict: false`.
5. 12 L5 calls `todayIn(now, safeTimeZone(user.timeZone))`, which keeps 12's fallback for an unknown zone. `safeTimeZone` stays in `time.ts`, and `time.test.ts` goes from 3 to 2 tests (06 tests `todayIn`).
6. 10's `usd` test is deleted rather than pointed at `formatUsd`, since 04 tests it.
7. Additions beyond the fix plan: the `formatIssues` cap test, the `countStrictUnions` unit test, the weekly two-invalid assertion, the 09 prompt's receipt-link line, and the `notify.sms` fixture body `Due Oct 7.` (copy only).

Coordinator notes:
- Lead override on SSE: the route sends no `Content-Encoding`, so 00 §14 has no "drop `Content-Encoding: none`" line. It uses the coordinator's wording.
- 00 was rewritten as a whole file by another agent during this run. §9.5, §9.6, and §14 were read again after that and before any 00 edit. All R3-B edits were then made with Edit, and a grep confirmed they're all present: `strict?: boolean`, `invalid_submit`, `STRICT_UNION_LIMIT`, the new submit-tool prose, the strict-limit note, and the SSE note. §10's R3-C SSE text was left alone.

Counts:
- 09: 14 files, 95 tests → 15 files, 104 (schema 7, client 9, scripted 6, fake port 3, loop 17, context 7, crisis/integrity 7, sources 9, calculators 5, session 10, crew 15, weekly 4, strictBudget 2, index 3). The step lines (I2 7; I3 16; I5 17; I9 16; I12 25; I13 4 files 31), the I14 gate, Success Criteria, and Testing Requirements are updated.
- 10: 8 files, 59 tests → 8 files, 62 (tools 11, definitions 7, consult 14, essay review 6, offer parse 6, appeal 8, retake 7, index 3). The package gate goes from 22 files and 154 tests to 23 and 166.
- 11: 9 files, 66 → 67 (extract 7; K5 28, K6 35, K7 47, K8 56, K9 65, K10 67).
- 12: 16 files, 93 → 95 (time 2, demo model 11, notices 9). The L14 gate, Success Criteria, and Testing Requirements are updated.

Follow-ups for other plans (not edited here):
- 19: no e2e or eval asserts the demo model's old `on 2026-10-15` text or the old reminder copy (grepped). The eval fixture `statesFacts("Due 2026-10-15.")` tests a helper, not demo output, and stays.
- 16 `Receipt` needs no change; 09 now drops any non-catalog link before it renders.

## Round 3 R3-E fixes

Source: `plans/reviews/r3-fixplan.md` (R3-E) and the cited findings in `r3-values.md` and `r3-api.md`, plus the coordinator's brief (19 probes and evals for R3E-1/R3E-2, R3E-3, and R3A-11). Only plans 18, 19, 20 and 00 §12 were edited (00 with Edit only). Names are the fix plan's and match what landed in 02 (`awardYearFor`, `APP_PLAN_LABELS`, `APPLICATION_STAGE_LABELS`), 06 (`waitText`, `details.retryAfterSeconds`), 09 (`Invalid <name> input.`, `invalid_submit`), and 14 (`SSE_HEADERS`, `SSE_PING`).

| Finding | Plan and task | Change |
|---|---|---|
| R3V-8 | 18 R9 `HelperSheet.tsx`, `HelperSheet.test.tsx`; R12 `eligibility.ts`, `eligibility.test.ts` | `PLAN_LABELS = APP_PLAN_LABELS` and `STAGE_LABELS = APPLICATION_STAGE_LABELS` from domain; the local maps and `?? s.stage` are gone. New exported `stageLabel(stage)` narrows with `ApplicationStage.safeParse` (see deviations). `INCOME_OPTIONS` is built from `IncomeRange.options` and `INCOME_RANGE_LABELS`. The counselor test now reads "Working on · due Oct 15"; the dates test pins `stageLabel`; the rule-specs test pins `INCOME_OPTIONS`. |
| R3V-10 | 18 new `components/admin/labels.ts` (R13); R13 `ScholarshipEditor.tsx`, `admin/scholarships/page.tsx`; R14 `TaskReview.tsx`, `TaskList.tsx`; R15 `ReportsTable.tsx`, audit page; R16 `AidRulesEditor.tsx`; tests | `ADMIN_TZ = "America/Chicago"`, `CATALOG_STATUS_LABELS`, and `adminDeadline(d)` (`calendarLong`, or "Not posted"). Every `.slice(0, 10)` on an `IsoDateTime` is now `instantLong(iso, ADMIN_TZ)`: "Verified", "Opened" (review and queue), the resolved line, "Reported", "Last checked". The status column, status badge, and status chips use the labels; the audit `WHEN` uses `ADMIN_TZ`. Tests: listingForm +1 (labels, deadline with year, 02:00Z → "Oct 6, 2026"); ScholarshipEditor asserts "Published" and "Verified Oct 6, 2026."; TaskReview asserts "Opened Oct 6, 2026"; ReportsTable "Oct 5, 2026"; AidRulesEditor "Last checked Oct 6, 2026." |
| R3A-13 | 18 R11 `AdminFrame.tsx`, `AdminFrame.test.tsx` | `signOut` uses try/catch with no swallowed error: it leaves on success or `ApiError` `unauthenticated`, and otherwise shows `errorMessage(e)` in a `role="alert"` and re-enables the button. +1 test: a 500 shows "Something went wrong" and doesn't navigate, then a 401 navigates. |
| R3A-21 | 18 R14 `TaskReview.run`, R15 `ReportsTable.close`, tests | On `ApiError` `conflict`: show the server message, set `closed` (TaskReview's `locked` and ReportsTable's per-row `closed` disable every decision button), and `router.refresh()`. The retire comment now reads "A retry of the resolve after a lost response gets 409; the item is shown closed." TaskReview +1 and adminTools +1 (409 disables both buttons, one fetch, one refresh). |
| R3A-22 | 18 R15 `CollegeImport.postCsv`, `adminTools.test.tsx` | `if (res.status === 413) throw new ApiError("invalid_input", TOO_BIG, 413)` after the `ErrorBody` branch. The refusal fake is now 413; +1 test for a bare HTML 413 showing the 5 MB message. |
| R3A-24 | 18 R13/R14/R15 | `maxLength={1000}` on "Note for the audit log", "Decision note", and the report note; `maxLength={100}` on "County (optional)". One attribute assertion per form in existing tests. |
| R3A-23 | 18 R6 | No change: 06's message now names the wait (closed by R3A-11). |
| R3V-7 | 19 S4 `support/admin.ts` | `awardYearOn(now) = awardYearFor(seasonOn(now))`, imported from `@scholarcrew/domain` (already a dependency of `e2e` and `evals`); the Oct 1 comment is replaced. The offers spec's default award-year assertion is the check. |
| R3E-1/R3E-2 (probe) | 19 S4 `support/crew.ts`, S6 `offers.spec.ts` | New `sseEvents(text)` (skips `:` comment blocks) and `readJobStream(page, jobId)` (raw GET with `Accept-Encoding: gzip`). After the parse job is `ready`, the offers spec checks `text/event-stream`, `cache-control: no-cache, no-transform`, `x-accel-buffering: no`, no gzip/br/deflate encoding, frames `["job", "end"]`, and that `: ping` blocks are skipped. Same test. |
| R3A-11 (probe) | 19 S2 `auth.spec.ts`, `support/api.ts` | +1 e2e test: five magic links from one address get 204, and the sixth gets 429 `rate_limited` with a numeric `Retry-After` from 1 to 900 that equals `details.retryAfterSeconds`, and a message matching `Try again in \d+ minutes.` `ApiErrorBody.error` gains `details?`. |
| R3E-3 (evals) | 19 S17 `scenarios/testkit.ts`, `noGhostwriting.test.ts` | New `invalidSubmitReply()` (unknown `safety`). +2 tests on `crew-write-my-opening`: invalid then valid passes every property and the retry turn carries `Invalid submit_reply input.`; invalid twice fails "the request finished" with `status failed`. |
| R3E-4 (evals) | 19 S15 `properties.ts`, `properties.test.ts` | `receiptProblems` flags a `fact` or `calculation` item with a `sourceUrl` or `verifiedAt` ("… is not a catalog item but has a source URL or check date"). Assertions added to the existing test. |
| R3A-4 | 20 T3 `api.ts`, `api.test.ts`, design notes, Testing Requirements, checklist | `AutofillProfileResponse = z.object({ ...AutofillProfile.shape, activities: z.array(z.object(Activity.shape)) })` and `ScholarshipSummaryResponse = z.object(ScholarshipSummary.shape)` are what `getAutofillProfile`/`savePage` parse with (`zod` becomes a value import). The `extra: true` save-page test now expects success with `extra` stripped, plus a second response with `status: "archived"` that is still `bad_response`. New test: an extra top-level key and an extra key on one activity are stripped. `ContentRequest` keeps the strict `AutofillProfile`, which the stripped profile passes. |
| R3V-9 | 00 §12 PU row | "07 (`searchScholarships` with `openOn`), 14 (public route), 18". |

Coordinator check (00 rewrite): after another agent rewrote `00-overview.md`, §11 and §12 were re-read from disk before editing. §11 needs no change (no route was added or removed). §12's PU row still named `listPublicByState`. 07 now says that function is gone (R3V-9), and 18 builds the directory on `searchScholarships` with `openOn`, so the row was updated to that with Edit. No other 00 text mentions `listPublicByState`.

Deviations (smallest correct alternative):

- R3V-8: 02 B7 types `HelperView.scholarships[].stage` as `z.string()`, so indexing `APPLICATION_STAGE_LABELS` directly doesn't typecheck. `stageLabel` narrows with `ApplicationStage.safeParse` and returns the raw value only as a type-level fallback. Tightening 02 to `ApplicationStage` would be cleaner; that belongs to 02 (optional follow-up).
- R3V-10: the fix plan puts `ADMIN_TZ` "in `components/admin`" without naming a file, and asks for an admin scholarships page test, which 18 doesn't have (no admin server page is tested). `labels.ts` holds `ADMIN_TZ`, `CATALOG_STATUS_LABELS`, and `adminDeadline`; the "Draft" and dated-deadline assertions live in `listingForm.test.ts` (+1), and `ScholarshipEditor.test.tsx` covers the labeled badge. The TaskReview fixture's `createdAt` moved to `2026-10-07T02:00:00.000Z`, so "Opened Oct 6, 2026" tells the Central day from the UTC one. Additions beyond the list: the status chips read the labels ("All" first), and the task's resolved line and `TaskList` use `instantLong` too.
- 19: the fix plan lists only `awardYearOn` for 19. Per the coordinator's brief, 19 also adds the SSE header probe (inside the existing offers test), one 429 e2e test, two submit-retry eval tests, and the R3E-4 receipt rule. 14 (R3-C) dropped `content-encoding: none` from `SSE_HEADERS`, so the probe asserts the response isn't compressed rather than asserting `none`. The 15 s `: ping` can't be observed in e2e (no job idles that long), so 14's `events.test.ts` remains its proof; the e2e parser only proves comment blocks are skipped. Grepping 19 for "Regular", "Rolling", and "Working on" finds no step, so no selector changed.
- R3A-4: the fix plan sets api at 9 → 10. The "known fields stay strict" check is folded into the flipped save-page test (a second fake response), not a separate test, so the count stays 10.

Counts:
- 18: 25 files, 106 → 111 tests (public 14 / 54, auth 2 / 15, admin 9 / 42). Running admin totals: R11 3, R12 11, R13 19 (listingForm 5), R14 33 (TaskReview 9), R15 39 (adminTools 6), R16 42. The gate, Success Criteria, and Testing Requirements are updated; Files lists `labels.ts`.
- 19: e2e 17 → 18 tests in 12 specs (auth 3). Evals `check` 44 → 46 in 11 files (noGhostwriting 5; S17 30, S18 38, S19 and gate 46). Still 6 scenarios and 18 cases.
- 20: 9 files, 134 → 135 tests (api 10).

Follow-ups for other plans (not edited here):
- 02 (optional): `HelperView.scholarships[].stage` could be `ApplicationStage`, which would let 18 drop `stageLabel`'s narrowing.
- 14/00 §14: the e2e stack runs `next dev`, so the `next start` compression check in 00 §14 is still an execution-time manual step.


## October 7, 2026 — round 4 application and readiness pass

Security, identity, runtime, UI, API, and operations corrections were applied directly to the planning artifacts. See [round 5 readiness review](reviews/r5-readiness.md) for changes, static validation, and the remaining final integration checks. Review is **not yet closed**: account usage limits interrupted the final audit. No application implementation was performed.


## October 7, 2026 — round 5 completed

The interrupted audit resumed and its remaining checks are closed. Three read-only reviewers audited identity, runtime, and E2E integration; the coordinator patched the concrete defects directly in plans and documentation. Final changes include durable retry cost accumulation and atomic terminal billing, live sharing and story-use filtering, export locking and notification retry recovery, Stripe owner serialization, required fixtures/imports, privacy and CSP browser probes, and indirect-crisis/income-table evaluation cases.

Static checks: 1,019 TS/TSX blocks have no syntax errors or unexplained unbound local symbols; named-import checks against 985 documented module paths are clean; OpenAPI has 127 paths and 1,095 resolving reference occurrences; JSON examples and relative Markdown links pass. Declared E2E coverage is 22 browser tests, 47 scripted tests, and 20 model cases. Runtime gates remain implementation steps and were not executed. See [readiness review](reviews/r5-readiness.md) for the accepted scope limits and validation boundary. No implementation files were created.

## October 7, 2026 — implemented application follow-up audit

Bug Hunter reviews covered production streaming, worker retries, webhook order and extension form matching. Defender/Referee checks confirmed the fixes for closed-stream recovery, early Stripe lifecycle delivery, retired-subscription acknowledgment, SMS preparation before its delivery claim, and conservative autofill with stale-review protection. A production browser pass found and corrected narrow-screen overflow and an inaccessible flagged-listing link.

The optimized-server audit passes seven scenarios and produces 179 screen captures. The browser extension was also checked read-only against a public scholarship form. See [implementation readiness audit](../docs/engineering/readiness-audit.md) for concrete corrections, verification scope, and the credential-dependent release gates. Live-model safety evaluation remains open; this local audit does not authorize release.

Final follow-up gates: 2,004 tests in the complete workspace run; subsequently 169 extension tests and 80 domain tests after the final compatibility/CSP corrections; 23 regular browser flows and seven optimized production scenarios passed. The production audit captured 179 screenshots without overflow, runtime or CSP errors. All 14 typecheck tasks and lint across 1,085 files passed.
