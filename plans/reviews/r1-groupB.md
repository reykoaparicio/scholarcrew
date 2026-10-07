# Review round 1, group B (plans 04, 06, 07, 08)

Focus: data flow and compile-level correctness. Each plan's code was checked against `03-database.md` (table and column code, `@scholarcrew/db` index exports, factories), `02-domain.md` (schema names and fields), `00-overview.md` §8 and §9, `05-jobs.md` (memory jobs client), and the call sites in plans 09–20.

I verified these by hand:

- Every engines test expectation, including the amortization numbers, the 142-word Rotary draft count, every scam-regex case, all date math, merit/retake, superscore, and the plan ordering.
- The declared test counts for each plan: 04 = 118, 06 = 155, 07 = 90, 08 = 64.
- Every import from `@scholarcrew/db`. Each name exists in 03's index or schema, except `drizzle-orm` (06-1 below).
- Every module index against §9.4.
- No import cycles inside `packages/core`.
- No placeholder text.
- Factory defaults the tests rely on: `Test Student`, `Test Parent`, TX/Maple/372, `onboardingCompletedAt`, and default share settings.

## 06-core-identity.md

**06-1 · high · F1 `packages/core/package.json`, `"dependencies": { "@scholarcrew/db": …, "stripe": …, "zod": … }`**

`drizzle-orm` isn't listed, but plan 07 imports it directly in three places:

- G2 `scholarships/search.ts`: `import type { SQL } from "drizzle-orm";`
- G7 `colleges/catalog.ts`: same import
- G8 `colleges/list.ts`: same import

With pnpm's default isolated linking, `packages/core` can't resolve undeclared packages. So `pnpm --filter @scholarcrew/core typecheck` fails with `TS2307 Cannot find module 'drizzle-orm'`. §2 lists core as a drizzle-orm user.

Fix: add `"drizzle-orm": "^0.44.0"` to core's `dependencies`, and mention it in the F1 Step 2 expected output. Alternative: 03 re-exports `export type { SQL } from "drizzle-orm"` from `@scholarcrew/db`, and 07 imports `type SQL` from there.

**06-2 · medium · F19 `deleteAccount`: "blocks the account at once (status, sessions, API tokens, helper links)" (review-log D13, unfixed)**

An active Stripe Family subscription keeps billing after the account is deleted. `StripeGateway` in F2 `shared/types.ts` has no cancel method.

Fix:

- Add `cancelSubscription(subscriptionId: string): Promise<void>` to `StripeGateway` (types.ts and §9.4).
- The fake pushes the id to a new `canceled: string[]`. `createStripeGateway` calls `await stripe.subscriptions.cancel(subscriptionId)`.
- In `deleteAccount`, before the transaction, run `const own = await ownSubscription(deps.db, userId)`. When `deps.stripe && own?.stripeSubscriptionId && own.status === "active"`, call `cancelSubscription`.
- Inside the transaction, set `subscriptions.status = "canceled"`. Record the audit event `subscription_canceled`.
- Add a delete.test case: insert a `family`/`active`/`sub_1` row, delete the account, and expect `(deps.stripe as FakeStripeGateway).canceled` to equal `["sub_1"]`.

**06-3 · medium · F17 and F18 (review-log D27, unfixed)**

Neither `documents` nor `account` exports a list or latest reader. Plan 16 works around this in `src/lib/owned.ts` (16 lines 17 and 8232) by reading `documents` and `exports` rows directly in web code, which bypasses core access checks.

Fix:

- Add `listDocuments(deps, actor): Promise<DocumentMeta[]>` to `documents/index.ts`. It calls `assertUser`, filters `eq(documents.ownerId, actor.userId)`, and orders by `desc(documents.uploadedAt)`.
- Add `latestExport(deps, actor): Promise<ExportRecord | null>` to `account/export.ts` and `account/index.ts`. It returns the actor's newest row where `expiresAt` is null or in the future, ordered by `desc(exportsTable.createdAt)` with limit 1.
- One test each for owner-only and ordering. Add both to §9.4.
- Then 13 adds `GET /documents` and `GET /account/exports/latest`, and 16 deletes `owned.ts`.

**06-4 · medium · The Rules bullet "Core imports it as `import { exports as exportsTable } from "@scholarcrew/db"`", plus the same import in F18 `account/export.ts`, F19 `account/delete.ts`, and F19 `delete.test.ts` (review-log D3, unfixed)**

§8 says the table's TypeScript name is `exportsTable` and "never import a binding named `exports`". When 03 applies D3 (export only `exportsTable`), these three imports fail with `TS2305 Module has no exported member 'exports'`.

Fix:

- Change the three imports to `exportsTable`.
- Rewrite the Rules bullet to "imports `exportsTable` directly".
- Change the Review Checklist item "The exports table is imported as `exports as exportsTable`" to "`exportsTable` is imported by name".
- Drop the "`@scholarcrew/db` names the exports table `exports`" contract gap. Coordinate with 03 so both land in the same phase.

**06-5 · low · Review Checklist, last bullet: "ON-02's 'past essays seed Story Bank candidates' needs a document-to-candidate step in plan 08 or 12"**

This is stale. D9 changed the spec so past essays go to a Quill story interview (ES-08).

Fix: replace it with "ON-02: past essays are uploaded encrypted; the story interview is ES-08 (D9)."

## 07-core-records.md

**07-1 · medium · G6 `submitLocalScholarship`: `await tx.insert(catalogTasks).values({ kind: "user_submission", … })` (review-log D18, unfixed)**

The function never enqueues `catalog.extract`, so student submissions are never extracted or verified.

Fix:

- Add `.returning({ id: catalogTasks.id })` to the task insert.
- Return `{ summary: toSummary(row), taskId }` from the transaction.
- After the transaction, `await deps.jobs.enqueue("catalog.extract", { taskId })`, then return `summary`.
- In submissions.test, after the first submit, expect `ctx.deps.jobs.sent` to contain `{ name: "catalog.extract", payload: { taskId: tasks[0]?.id } }`.
- Update the G6 intro sentence.

**07-2 · medium · G8 `archiveSeason`, and the contract note "offers has no archive column and belongs to plan 08, so offers are not archived here" (review-log D1, unfixed)**

ME-07 says starting a new season archives offers.

Fix, after 03 adds `archivedAt: ts("archived_at")` to `offers`, in the same call:

```ts
await deps.db.update(offers).set({ archivedAt: now }).where(and(eq(offers.ownerId, user.userId), eq(offers.awardYear, awardYearFor(season)), isNull(offers.archivedAt)))
```

- `awardYearFor("2026-27")` returns `"2027-28"`, so `start + 1` and `pad2((start + 2) % 100)`.
- Keep the return value `{ archived: <college entries> }`.
- Add an assertion to list.test that an inserted offer gets `archivedAt` set.
- Delete the contract note.

**07-3 · medium · G8 `colleges/list.ts` `buildItems`: `r.supplements.forEach((s, idx) => items.push({ kind: "supplement", … }))`**

Biome 1.9.4's recommended rule `lint/complexity/noForEach` reports an error here, so the G16 gate (`pnpm lint`) fails.

Fix:

```ts
for (const [idx, s] of r.supplements.entries()) items.push({ kind: "supplement", label: `Supplement ${idx + 1}: ${short(s.prompt)}` });
```

**07-4 · low · G2 `searchScholarships`: `if (q.local && actor.kind === "user") {`**

The worker port (12, line 1396) calls `searchScholarships(core, SYSTEM, q)`. A `local: true` query from Scout is silently ignored and returns statewide and national listings.

Fix: when `q.local` is set and the actor isn't a user, throw `invalidInput("Local search needs the student's profile; filter by state instead")` so the tool result tells the agent. Note for 09/12: `CrewDataPort.searchScholarships` has no `ownerId`, so local search isn't available to the crew.

**07-5 · low · G16 `helperview/view.ts` deadlines: `refType: "scholarship_application", refId: app.id`**

08 `collectDeadlines` encodes the same `Deadline` as `refType: "scholarship", refId: <scholarship id>`, and 16's link builder (`if (item.refType === "scholarship") return /scholarships/${id}`) depends on that. Two encodings of one domain type means a shared deadline renderer builds wrong links for helper-view rows.

Fix: use `refType: "scholarship", refId: listing.id` in the helper view.

**07-6 · low · "Contract notes for the integrator", bullets 2 and 4 (offers not archived; SC-11 left to 08)**

These contradict review-log D1 and D2. Update them once 07-2 and 08-2 land.

The 07 call sites of `import type { SQL } from "drizzle-orm"` are covered by 06-1. Use the alternative fix there if 06 shouldn't take the dependency.

## 08-core-planning.md

**08-1 · medium · H5 `listOffers` / `compareMyOffers`, and H4 `summariesFor`'s `confirmed` query (review-log D1, unfixed)**

Archived offers from past seasons keep appearing in comparisons and cost summaries.

Fix, after 03 adds `offers.archivedAt`:

- Widen `loadOffers(db, where: ReturnType<typeof eq>)` to `where: ReturnType<typeof and>`.
- `listOffers` passes `and(eq(offers.ownerId, studentId), isNull(offers.archivedAt))`.
- Add `isNull(offers.archivedAt)` to the `compareMyOffers` where and to the `confirmed` query in costs.ts.
- Add an offers.test case where an archived confirmed offer isn't listed or compared.

**08-2 · medium · H8 `findDueReminders` only covers saved scholarships and college list entries (review-log D2, unfixed)**

SC-11 renewal reminders are missing. A second problem blocks the fix: domain `Reminder.offset` is `z.union([z.literal(7), z.literal(3), z.literal(1)])`, so a 30-day renewal reminder can't be represented.

Fix:

- In 02, widen it to `z.union([z.literal(30), z.literal(7), z.literal(3), z.literal(1)])`. 12's reminder handler must accept 30.
- In `findDueReminders`, query `scholarshipApplications` joined to `scholarships` and `users` (active students) where `stage = 'won'`, `outcomeRenewable = true`, and `outcomeAt` is not null.
- Each later year's anniversary is the `outcomeAt` month/day in the current or next year. When `daysUntil(anniversary, now, tz) === 30`, push `{ userId, title: `${name} renewal is coming up`, dueOn: anniversary, offset: 30, refType: "scholarship_application", refId: app.id, dedupeKey: `renewal:${app.id}:${anniversary.slice(0, 4)}` }`.
- Add a notify.test case.

**08-3 · medium · H10 `crew/index.ts` exports no job list (review-log D28, unfixed)**

16 (line 18) falls back to `sessionStorage` for the background panel, and 14 has no `GET /jobs`.

Fix:

- Add `listJobs(deps, actor, o: { active?: boolean; limit?: number } = {}): Promise<CrewJob[]>` to `crew/jobs.ts`. It calls `assertUser`, filters `eq(crewJobs.ownerId, actor.userId)`, adds `inArray(crewJobs.status, ["queued", "working"])` when `active`, orders by `desc(crewJobs.createdAt)`, and caps the limit at 1..50 (default 20).
- Export it from `crew/index.ts` and add `"listJobs"` to the `crew` names in H13 `contract.test.ts`.
- Add a jobs.test case covering the owner-only and active filters, and a §9.4 row.
- Then 14 adds `GET /jobs?active=1` and 16 uses it.

**08-4 · low · H2 `completeJob`: the reply branch always runs `tx.insert(messages)`**

A worker retry after a successful completion (pg-boss `retryLimit: 2`, for example when `recordUsage` throws after `completeJob`) writes a second crew message and replaces `resultMessageId`.

Fix: right after loading `job`, add `if (TERMINAL_JOB_STATUSES.includes(job.status) && job.resultMessageId !== null) return toCrewJob(job);`, importing `TERMINAL_JOB_STATUSES` from domain. The existing "notifies once per job" test still passes.

## 04-engines.md

**04-1 · low · D7 `isoDateMs`: "Throws RangeError for anything but YYYY-MM-DD"**

The function only checks the format. `"2026-02-30"` silently becomes March 2 through `Date.UTC` overflow.

Fix: after computing `ms`, check `msToIsoDate(ms) === date`, otherwise `throw new RangeError(...)`. Add `expect(() => daysUntil("2026-02-30", now, TZ)).toThrow(RangeError)` and update the test count from 118 to 119 in Steps and Success Criteria.

No other defects in 04. Every contract export and signature matches §9.2, and every consumer call in 09, 10, 11, 12, and 17 matches.

## Consumer mismatches found in plans 09–20

These are attributed to the plan that should change. Every other imported name and argument shape I checked matches the 06/07/08/04 code: 12 port and handlers, 13 routes, 14 routes, 16/17/18 server pages.

- **16 `src/lib/owned.ts` and the session-only job panel** come from 06-3 and 08-3. After those land, 16 should switch to the new services or routes.
- **12 port `searchScholarships(core, SYSTEM, q)`** never gets local filtering (07-4). 09/12 should document that the crew can't do local search, or extend `CrewDataPort.searchScholarships` with `ownerId`.
- **12 reminder handler** must accept `offset: 30` once 08-2 widens `Reminder.offset`.
- **§9.4 in 00-overview.md** needs rows for `StripeGateway.cancelSubscription` (06-2), `documents.listDocuments` and `account.latestExport` (06-3), and `crew.listJobs` (08-3).

## Review-log D-items for these plans

| Item | Plan(s) | Status | Fix |
|---|---|---|---|
| D1 | 03, 07, 08 | Unfixed in all three (03 `offers` has no `archivedAt`) | 03 adds the column; 07-2; 08-1 |
| D2 | 08 (+02) | Unfixed; also blocked by `Reminder.offset` | 08-2 (02 widens offset to include 30) |
| D3 | 03, 06 | Unfixed (03 still `export { exportsTable as exports }`; 06 imports `exports as exportsTable`) | 03 exports only `exportsTable`; 06-4 |
| D5 | 07 | Done (`invalid_input` over `MAX_COLLEGE_LIST`) | — |
| D8 | 04 | Done (`OfferLineInput.label?`; 08 passes labels) | — |
| D10 | 06 | Done as accepted | — |
| D13 | 06 | Unfixed | 06-2 |
| D18 | 07 (+11) | Unfixed in 07 | 07-1 (11 `extractForTask` must accept `user_submission`) |
| D19 | 06 side | Done (`memory.createCandidate` exists, system-only); the rest is 12 | — |
| D27 | 06 (+13, 16) | Unfixed | 06-3 |
| D28 | 08 (+14, 16) | Unfixed | 08-3 |

## Counts

| Plan | High | Medium | Low |
|---|---|---|---|
| 04 | 0 | 0 | 1 |
| 06 | 1 | 3 | 1 |
| 07 | 0 | 3 | 3 |
| 08 | 0 | 3 | 1 |
