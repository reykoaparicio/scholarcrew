# Jobs

Work that shouldn't block a request runs as a pg-boss job in Postgres: crew replies, essay reviews, document parsing, sweeps, reminders, email, catalog research and re-checks, exports, and purges. `@scholarcrew/jobs` (plan 05) owns the names, payload validation, and schedules. The worker (`apps/worker`, plan 12) runs the handlers.

Plan 12 specifies handlers and runtime wiring. Plans 00, 05, 08, and 12 define the authoritative queue and completion contracts.

## How the web app enqueues

```ts
const boss = createPgBoss(DATABASE_URL, { role: "sender" }); // supervise: false, schedule: false
await boss.start();
await ensureQueues(boss);                // createQueue for every JOB_NAMES entry (idempotent)
const jobs = createJobsClient(boss);     // becomes CoreDeps.jobs in apps/web/src/server/deps.ts
```

- The web process only sends. With `supervise` and `schedule` off it never runs pg-boss maintenance or cron.
- Core services call `deps.jobs.enqueue(name, payload, opts?)`. The client validates the payload against `JobPayloads[name]` (strict Zod objects) and throws `invalid_input` for an unknown name or a bad payload, so nothing invalid reaches the queue.
- Every send uses `retryLimit: 2`, `retryDelay: 30` (seconds), per-queue `expireInSeconds` from `QUEUE_EXPIRE_SECONDS`. `startAfterSeconds` maps to pg-boss `startAfter`. `singletonKey` maps straight through; `enqueue` returns `null` when pg-boss drops a duplicate key while a job with that name and key is queued or active.
- Payloads carry ids only, so essay text, sensitive facts, and documents never sit in the job table.
- Most user-facing jobs pair a `crewJobs` row (status, progress, reply) with the pg-boss job. The service inserts the `crewJobs` row as `queued`, then enqueues with `{ jobId }`. The browser follows the `crewJobs` row over SSE, not the pg-boss job.
- Tests use `createMemoryJobsClient()`, which validates the same way and records `{ name, payload, opts }` in `sent`.

## How the worker consumes

```ts
const boss = createPgBoss(DATABASE_URL);                 // role "worker": maintenance and cron on
await boss.start();
await ensureQueues(boss);
for (const s of SCHEDULES) await boss.schedule(s.name, s.cron, {}, { tz: s.tz });
await boss.work("crew.request", { batchSize: 1 }, async ([job]) => { /* parse job.data, run handler */ });
// on shutdown: await boss.stop({ graceful: true, timeout: 30_000 });
```

Handlers re-parse `job.data` with `JobPayloads[name].parse`, act through core services with a `SystemActor`, and throw on failure so pg-boss retries. Concurrency and batch size are fixed by plan 12 registrations.

## Job reference

| Job | Trigger | Payload | Handler | Schedule (UTC) | Idempotency and dedupe |
|---|---|---|---|---|---|
| `crew.request` | `crew.sendMessage` | `{ jobId }` | `crew.startJob`, build `CrewRequestInput` from the conversation, `runCrewRequest` with `makeConsult`, `appendProgress` and `recordAgentRun` as it goes, then `crew.completeJob` with the reply and status. | none | startJob claims a lease and returns null for terminal or actively leased jobs; completeJob requires its token and posts/bills once. |
| `essay.review` | `essays.requestReview` | `{ jobId, essayId }` | `runEssayReview`, `essays.saveQuillComments`, `crew.completeJob`. | none | `saveQuillComments` is idempotent per job. Completion notifies once (`job:<jobId>`). |
| `offer.parse` | `money.createOffer` | `{ jobId, offerId }` | `documents.readDocumentBytes` (system), `runOfferParse`, then `money.saveParsedOffer` or `money.markOfferFailed` (audited), then `crew.completeJob`. | none | Notification key `job:<jobId>`. |
| `appeal.outline` | `money.requestAppealOutline` | `{ jobId, offerId }` | `runAppealOutline`, `crew.completeJob` (creates a `my_crew` conversation for the reply). | none | Notification key `job:<jobId>`. |
| `plan.weekly` | `profile.completeOnboarding`, `plan.requestWeeklyPlan` | `{ jobId, ownerId }` | `runWeeklyPlan`, `plan.replaceGeneratedPlan` for the week, `crew.completeJob`. | none | `replaceGeneratedPlan` swaps the crew's open items for the week and keeps the student's own items and anything done or skipped, so a rerun doesn't duplicate. Notification key `job:<jobId>`. |
| `prep.retake` | `prep.requestRetakeAnalysis` | `{ jobId, test, targetComposite }` | `prep.computeRetake` (code), `runRetakeExplanation`, `crew.completeJob`. The owner comes from the `crewJobs` row. | none | Notification key `job:<jobId>`. |
| `sweep.weekly` | cron | `{}` | Enqueue `sweep.student` for every active student. | `0 14 * * 0` (Sunday 14:00) | The fan-out uses per-student singleton keys. `sweep.student:<studentId>` is the pattern plan 05's tests use. |
| `sweep.student` | `profile.completeOnboarding`, `sweep.weekly` | `{ studentId }` | `scholarships.runSweep`: add a `matched` application for each new clean match, record a `sweepRuns` row, notify. | none | Applications insert with `onConflictDoNothing (ownerId, scholarshipId)`. Notification key `sweep:<studentId>:<local-date>` (once per local day). |
| `reminders.deadlines` | cron | `{}` | `plan.findDueReminders` (7, 3, and 1 days out in each student's time zone), then `notifications.notify` for each. | `0 * * * *` (hourly) | Key `reminder:<refType>:<refId>:<dueOn>:<offset>` with per-student refs. |
| `digest.weekly` | cron | `{}` | For students whose local digest day and hour match now, `plan.buildWeeklyDigest`; null means nothing new or email off. | `5 * * * *` (hourly at :05) | A digest guard and provider idempotency key `digest-<userId>-<weekStart>` dedupe the direct email; ambiguous send failures retain the guard. |
| `notify.email` | `notifications.notify` with `email: true`; itself during quiet hours | `{ notificationId }` | `notifications.deliverEmail`: skip if already emailed, user inactive, or email off; during quiet hours re-enqueue with `startAfterSeconds` until they end; otherwise send and set `emailedAt`. | none | emailedAt is claimed before sending; a definite 4xx releases it, an ambiguous failure retains it. Resend gets notification-<id> as its idempotency key. |
| `catalog.research` | `admin.enqueueResearch` (`POST /admin/research`) | `{ state, county }` (2-letter state, county or null) | `researchCandidates` (web search and fetch), then enqueue `catalog.extract` for each new task. | none | Skips URLs already listed or with an open, in-review, or rejected task. |
| `catalog.extract` | `catalog.research` | `{ taskId }` | `extractForTask`: fetch the page, extract a draft, run `verifyDraft`, store both on the task. | none | No-op unless an eligible open research_candidate or user_submission task. |
| `catalog.recheck` | cron | `{}` | `startRecheck`: re-fetch due listings, refresh unchanged ones, mark dead ones stale, send changed pages to one batch. | `0 8 * * *` (daily 08:00) | Skips listings fetched in the last 7 days; at most 200 per run. |
| `catalog.recheck.collect` | cron | `{}` | `collectRecheck`: for each finished batch, mark changed listings stale with a review task and refresh unchanged ones. | `*/30 * * * *` | Unfinished batches are left alone; a batch is claimed as collecting before reading results, then marked collected; open recheck tasks have a partial unique index. |
| `account.export` | `account.requestExport` | `{ exportId }` | `account.buildExport`: JSON plus Markdown into an encrypted blob, 24-hour expiry. | none | Ready is a no-op; queued requests reuse the existing export. Final failure expires after a day and notifies. |
| `account.purge` | cron | `{}` | `account.purgeDeletedAccounts`: delete users deleted over 6 days ago (within 7 days with daily runs) (rows cascade), then orphaned blobs. | `30 3 * * *` (daily 03:30) | Safe to rerun. |
| `maintenance.purge` | cron | `{}` | account.purgeExpired, then crew.reapStaleJobs: expired links/chats/exports/sessions, stale job leases, orphaned queued rows, and queued exports older than 60 minutes. | `*/10 * * * *` (every 10 minutes) | Safe to rerun. |

Hourly jobs (`reminders.deadlines`, `digest.weekly`) run in UTC and pick students by their own time zone, which is why they're hourly rather than daily.

## Failure behavior

- **Retries.** A handler that throws is retried twice, 30 seconds apart. Expiries are 1,200 seconds for crew.request/plan.weekly, 2,400 for catalog.research, and 900 otherwise; each exceeds the calculated handler bound by at least 120 seconds. Model API errors surface as `AppError("internal")` and take this path.
- **Model outcomes aren't failures.** Refusals, limits, and guard problems end in a normal reply (`refusal` or `partial`) and a `ready` or `needs_input` job, so they don't retry. Only exceptions do.
- **Final failure.** After the last retry, the `crewJobs` row should become `failed` with an error, and `completeJob` then sends a "didn't finish" notification for non-chat jobs. Final attempts complete failed through the lease check. The ten-minute reaper catches expired leases and enqueue orphans after a 600-second margin and notifies with a retry link.
- **Offer parse failures** call `money.markOfferFailed`, which sets the offer to `failed` and records `offer_parse_failed` in the audit log, so the student can correct or re-upload.
- **Catalog fetch errors** (DNS, timeout) skip the listing for that run instead of marking it stale. Unreadable or missing batch results count as `failed` and create a review task, so a changed page is never accepted silently.
- **Duplicate deliveries** are expected after a crash or expiry. The idempotency column above says how each handler copes.
- **Errors in logs** are JSON lines with `msg: "pgboss"` and the process role, never the connection string or payload data.

## Adding a job

1. Add the name to `JOB_NAMES` and a strict payload schema of ids to `JobPayloadSchemas` in `packages/domain/src/jobs.ts` (plan 02).
2. If it runs on a schedule, add it to `SCHEDULES` in `packages/jobs/src/schedules.ts` and to the overview §9.3.
3. Add a system-only core function for the work and a handler in `apps/worker` that calls it.
4. Decide the dedupe story (a `singletonKey`, a unique row, or a `dedupeKey`) before shipping.
