# Round 4 review: edge cases and data integrity

Reviewer slice: plans 02–08, 11, 12, 16–18. Focus areas: missing data and zero values, time and expiry, duplicates and idempotency, concurrency and transactions, failure paths, deletion and purge, limits. Everything in `plans/review-log.md` is treated as known and isn't repeated.

Severity: high = data loss, double charge or send, or a broken contract; medium = wrong behavior; low = unclear.

## Findings

### High

#### R4E-1 (high): A crew job can run twice at once, posting two replies and charging twice

- Plans/tasks: 05 E2 `SEND_DEFAULTS` (`expireInSeconds: 900`, `retryLimit: 2`); 09 I3 `createModelClient` (`new Anthropic({ apiKey })` with SDK defaults: 10-minute timeout, 2 automatic retries) and I5 `canCall` (the deadline is checked only before a call); 12 L6 `runCrewJob`, L14 `STOP_TIMEOUT_MS`; 08 H2 `completeJob`.
- Scenario: during an API slowdown, Compass and the consults it calls take more than 900 s. A single `messages.create` can take up to 10 minutes, and the SDK retries it twice. pg-boss marks the job expired and retries it. The first handler is still running, because pg-boss doesn't abort it. The retry's `loadJob` sees `working`, which isn't terminal, so it runs the whole job again. Both runs reach `completeJob`, which checks `TERMINAL && resultMessageId !== null` with a plain read and then writes with an unconditional update. If both runs read before either commits, two crew messages are posted. If the second run arrives after the first finished, `completeJob` returns early, but `runCrewJob` still calls `recordUsage({ crewRequest: true })`. The student is charged two requests and two model costs. For `plan.weekly`, `replaceGeneratedPlan` also runs twice (see R4E-12). For `offer.parse`, the second run can undo the student's review (R4E-7).
- Fix:
  - 09 I3: pass `timeout` (for example 90 s) and `maxRetries: 1` to `new Anthropic(...)`, and accept an `AbortSignal` so a job-wide deadline can cancel a call that's in flight.
  - 12 L6: give each job one deadline below the queue expiry (for example 600 s) and abort the model calls when it passes. Before calling `work`, claim a lease with `update crew_jobs set status='working', updated_at=now() where id=? and (status='queued' or (status='working' and updated_at < now() - interval '<expiry>')) returning`. If no row comes back, another run holds the job, so return.
  - 08 H2 `completeJob`: lock the row (`select … for update`) inside the transaction and update only `where status in ('queued','working')`. Return `{ job, alreadyComplete: true }` when nothing changed, and have `runCrewJob` skip `afterComplete` and `recordUsage` in that case.
  - 05: give the crew queues an explicit `expireInSeconds` above the job deadline, and say in §9.3 that every queue's expiry must exceed its handler's worst case.

#### R4E-2 (high): Jobs that die on their last attempt, or are never enqueued, stay `queued`/`working` forever

- Plans/tasks: 12 L6 `runCrewJob`, L14 `startWorker` (graceful stop after 30 s); 08 H2 `startJob`/`completeJob`, H7 `getThisWeek` (`crewWorking`), H3 `requestWeeklyPlan`, H9 `sendMessage`, H5 `createOffer`; 07 G11 `requestReview`, G13 `requestRetakeAnalysis`; 06 F13 `completeOnboarding`, F18 `requestExport`, F19 `purgeExpired`; 17 Q23 (Remove is offered only on `failed` and `needs_review` letters).
- Scenario A: the worker is killed during the last attempt, which happens on a deploy since `STOP_TIMEOUT_MS` is 30 s and a Compass run takes minutes, or pg-boss expires the last attempt. `runCrewJob` never reaches `completeJob`. Nothing ever moves the row out of `working`. The results:
  - `getThisWeek.crewWorking` has no age bound, so "your crew is working" shows forever.
  - `GET /jobs?active=1` lists the job forever.
  - An `offer_parse` job leaves the offer in `parsing`. 17 offers no Remove button for that status, so the letter can't be retried or removed from the UI.
- Scenario B: every request path commits its rows and then calls `deps.jobs.enqueue` outside the transaction. If the enqueue throws (a pg-boss connection blip), the API returns 500, but the job (or export) row is already committed with nothing to run it. On a retry, `sendMessage` also stores the user's message a second time.
- Fix:
  - 06 F19 `purgeExpired` (or a new system function in 08 that `maintenance.purge` calls): fail jobs whose status is `queued` or `working` and whose `updatedAt` is older than the queue expiry plus a margin. Use `completeJob(status: "failed", error: FAILED_TEXT)` so the user is notified, call `markOfferFailed` for `offer_parse`, and mark exports that have been `queued` for more than an hour as `failed`.
  - 08 H7: count only jobs updated in the last 20 minutes in `crewWorking`.
  - 05/06/07/08: enqueue inside the same transaction. pg-boss 10 `send` accepts a `db` adapter. Alternatively, write an outbox row in the transaction and have the worker drain it.
  - 17 Q23: offer Remove on an offer that has been `parsing` for more than 20 minutes.

#### R4E-3 (high): Account deletion leaves a `past_due` Stripe subscription billing, and a retry after a partial delete can never finish

- Plans/tasks: 06 F19 `deleteAccount`, F12 `mapStatus`/`createStripeGateway.cancelSubscription`.
- Scenario: `stripeSubscriptionId` is canceled only when `own?.status === "active"`. A family plan whose card failed is `past_due` (and `incomplete`, `unpaid`, and `paused` all map to `past_due`). Stripe keeps retrying that invoice for weeks. The user deletes their account, the subscription is never canceled, and a later retry charges a deleted account. Nothing in `purgeDeletedAccounts` cancels it either. Separately, `cancelSubscription` runs before the transaction. If the transaction fails afterwards, the local row still says `active`, so the user's retry calls `stripe.subscriptions.cancel` on an already-canceled subscription. Stripe rejects that, `deleteAccount` throws before deleting anything, and every later attempt fails the same way.
- Fix (06 F19): cancel whenever `stripeSubscriptionId` is set and the local status isn't `canceled`. Treat Stripe's "already canceled" or `resource_missing` answer as success (or read the subscription first). Test a `past_due` subscription, and a second `deleteAccount` after a cancel that succeeded while the transaction failed.

#### R4E-4 (high): A second checkout or a sponsor code overwrites the live Stripe subscription id, orphaning a subscription that keeps billing

- Plans/tasks: 06 F12 `createCheckout`, `checkoutCompleted`, `redeemSponsorCode`; F19 `deleteAccount`.
- Scenario: `createCheckout` refuses only when the user has a plan that is paid *and live*. A `past_due` family plan isn't live, and two checkout tabs started at the same time both pass the check. When the second `checkout.session.completed` arrives (say a season pass, `mode: "payment"`), it upserts `stripeSubscriptionId: null` and `plan: "season_pass"` over the family row. `redeemSponsorCode` does the same, setting both Stripe ids to null. The family subscription is still live in Stripe and keeps charging. But its `customer.subscription.updated`/`deleted` events no longer match any row, and `deleteAccount` can't cancel it. Two concurrent family checkouts create two Stripe subscriptions, and the row keeps only the second.
- Fix (06 F12): in `checkoutCompleted` and `redeemSponsorCode`, if the row already holds a `stripeSubscriptionId` that isn't canceled and is different from the new one, cancel the old subscription through the gateway (or refuse and audit it) before overwriting. In `createCheckout`, refuse while any non-canceled `stripeSubscriptionId` exists, and pass a Stripe idempotency key (`checkout:<userId>:<plan>:<minute>`) so a double click opens one session.

#### R4E-5 (high): On August 1 (UTC) every student's college list disappears

- Plans/tasks: 07 G8 `getCollegeList`, `addCollege`, `activeListWhere`, G13 `computeRetake`; 08 H4 `topGap`/cost queries, H6 `ensureChecklists` (CSS colleges), H7 `collectDeadlines`, H8 `findDueReminders`; 06 F2 `currentSeason` (Aug 1 UTC rollover).
- Scenario: each `collegeList` row stores the `season` from when it was added. Every read filters `season = currentSeason(now)`. A junior builds a 12-college list in April 2026, which is season "2025-26". On Aug 1, 2026 the season becomes "2026-27", and the list, its application items, its CSS checklist, and its deadline reminders all vanish just as applications start. Nothing carries the rows over. Re-adding the colleges creates new rows and loses fit, plan, item progress, and rec-request links. The rows are still in the database, so to the student this is data loss with no recovery.
- Fix (07 G8, with 08 following): keep seasons explicit. Either make the active list "rows not archived" regardless of season (`season` stays a label, and only `archiveSeason` ends a list), or have the first read in a new season move unarchived rows forward (`update college_list set season = <current> where owner_id = ? and archived_at is null`). Apply the same rule in 07 G13 and 08 H4/H6/H7/H8, and add a test that an entry added on Jul 31 is still listed on Aug 1.

### Medium

#### R4E-6 (medium): Stripe webhook replays and out-of-order events can re-activate canceled plans or grant the wrong term

- Plans/tasks: 06 F12 `applyStripeEvent`, `checkoutCompleted`, `seasonPassEnd`.
- Scenario: events aren't deduplicated by `event.id` and aren't ordered. Stripe redelivers for up to 3 days and doesn't guarantee order. That causes five problems:
  - A `checkout.session.completed` delivered after `customer.subscription.deleted` (a retry after a slow 200, or a manual resend) upserts `status: "active"` with `currentPeriodEnd: null`. `isPaidAndLive` treats null as "never ends", so the family plan is free forever.
  - An older `customer.subscription.updated` arriving after `deleted` also flips the status back to active.
  - `currentPeriodEnd: seasonPassEnd(now)` uses the processing time. A season pass paid at 23:50 UTC on May 31 and delivered after midnight gets the next season (a full extra year). One delivered on time gets about 10 minutes.
  - `mode: "payment"` sessions are granted without checking `payment_status === "paid"`, so delayed payment methods get the plan before (or without) paying.
  - It also activates a plan for a user whose status is `deleted` or `blocked_underage`, leaving a live Stripe subscription on an account about to be purged.
- Fix (06 F12):
  - Keep an idempotency table, or reuse `audit_events` with `entityId = event.id`, and skip ids already seen.
  - Ignore `checkout.session.completed` when the row already has a later `updatedAt` from a subscription event for the same subscription.
  - Never set `active` on a row whose Stripe subscription is `canceled`.
  - Compute the season-pass end from `o.created` (the session's creation time).
  - Grant only when `payment_status === "paid"`, and handle `checkout.session.async_payment_succeeded`.
  - For a non-active user, cancel the new subscription (or refund) and audit it.

#### R4E-7 (medium): A late or duplicate parse run wipes the student's corrected lines or fails a confirmed offer

- Plans/tasks: 08 H5 `saveParsedOffer`, `markOfferFailed`, `confirmOffer`; 12 L8 `handleOfferParse` (`onFailed`).
- Scenario: `saveParsedOffer` deletes every `offerLines` row and sets `status: "needs_review"` whatever the offer's current status is. `markOfferFailed` sets `failed` the same way. A second run (R4E-1 concurrency, or a pg-boss retry after `completeJob` failed) that lands after the student corrected lines (`userCorrected`) and confirmed the offer has two outcomes. A successful second run replaces the corrections and un-confirms the offer. A failing one turns a confirmed offer into `failed`. Either way, the costs page quietly falls back to the calculator or Scorecard.
- Fix (08 H5): make both writes conditional, `where status in ('uploaded','parsing')`, inside the transaction, and return the current offer unchanged otherwise. 12 L8 then reports the current lines. Add a test that `saveParsedOffer` and `markOfferFailed` on a confirmed offer change nothing.

#### R4E-8 (medium): Reminder dedupe keys ignore the due date, so changed or next-cycle deadlines are never reminded

- Plans/tasks: 08 H8 `findDueReminders` (`reminder:<refType>:<refId>:<offset>`); 12 L11.
- Scenario: three cases.
  - A college entry gets its ED reminders (7/3/1) for Nov 1. The student switches the plan to RD (Jan 1, `updateCollegeEntry`). Every RD reminder is dropped, because `notify` sees the same `reminder:college_list:<entryId>:7` key.
  - `scholarshipApplications` is unique per (owner, scholarship) forever. When an annual listing rolls to next year's deadline, or an admin corrects a deadline, the student's matched or planned card never gets reminders again.
  - SMS 1-day reminders are lost the same way.
- Fix (08 H8): put the due date in the key, `reminder:<refType>:<refId>:<dueOn>:<offset>`, and update 12 L11's tests.

#### R4E-9 (medium): The monthly allowance resets at UTC midnight, not on the 1st in the student's zone, and concurrent requests can overrun it

- Plans/tasks: 06 F2 `monthKey` (UTC), F11 `getUsage`, `assertCrewAllowance`, `recordUsage`; 16 settings usage copy; the 06 message "the count resets on the 1st".
- Scenario: the message says the count resets on the 1st. For a Chicago student it resets at 7 PM (CDT) or 6 PM (CST) on the last day of the month, and for a Pacific student at 5 PM. A request checked at 6:59 PM Oct 31 in Chicago is checked against October and then billed to November if it finishes after midnight UTC (`recordUsage` takes the month at completion time). Separately, `assertCrewAllowance` counts first and the job is inserted afterwards, outside any lock. Two tabs at 19/20 can both pass and start two requests.
- Fix:
  - 06 F2/F11: either compute `monthKey(now, user.timeZone)` and pass the zone through `getUsage`, `assertCrewAllowance`, and `recordUsage`, or change the copy to say when the reset really happens. Record usage against the month the request was checked in (store `month` on `crewJobs` at creation).
  - Serialize the check and the insert per owner with `pg_advisory_xact_lock(hashtext(ownerId))` in the same transaction as the job insert.

#### R4E-10 (medium): Double-submitting onboarding runs it twice

- Plans/tasks: 06 F13 `completeOnboarding`; 16 P15 `OnboardingWizard`.
- Scenario: the `existing.onboardingCompletedAt` check runs before the transaction. Two submits (double tap, or two tabs) both pass and both transactions commit. The result is:
  - `writeProfileFacts` runs twice concurrently, and can leave two current facts (R4E-11).
  - Two `weekly_plan` jobs are created, along with two `plan.weekly` and two unkeyed `sweep.student` sends. That's two Compass runs. The onboarding plan carries no `source`, so each is charged as a student request (2 of the free allowance), and the plans race in `replaceGeneratedPlan` (R4E-12).
- Fix (06 F13): claim inside the transaction with `update profiles set onboarding_completed_at = now where user_id = ? and onboarding_completed_at is null returning`. If no row comes back, throw `conflict` (16 already handles 409) before writing anything else.

#### R4E-11 (medium): Uniqueness the code relies on isn't enforced: one family per user, and one current fact per key

- Plans/tasks: 03 C3 `familyMembers` (index on `user_id`, no unique) and `memoryFacts` (no partial unique); 06 F9 `invite`/`startFamily`/`acceptInvite`/`membershipOf`, F6 `writeConfirmedFact`, `updateFact`, `confirmCandidate`.
- Scenario: `membershipOf` returns `limit 1` with no order, and every family rule assumes one membership. A student who double-submits the first invite runs `startFamily` twice and ends up in two families with two family rooms. The second invite lands in either family, picked arbitrarily. Two different invites accepted in parallel pass the `membershipOf` check outside the transaction and also give two memberships, and `MAX_PARENTS` can be exceeded the same way. For memory, two concurrent `updateFact` calls on the same row (double-click Save) both insert a new version and both supersede the old one, leaving two current confirmed facts for one key. `listFacts` shows both, `currentFact` picks one at random, and `syncProfileColumn` may keep the other value.
- Fix:
  - 03: `unique("family_members_user_uq").on(t.userId)`, and a partial unique index on `memory_facts (owner_id, key) where status = 'confirmed' and superseded_by_id is null`.
  - 06 F9: run `startFamily` and the accept checks inside one transaction, and map 23505 to `conflict`.
  - 06 F6: supersede with `where superseded_by_id is null returning`, and throw `conflict` when it updates nothing.

#### R4E-12 (medium): "Plan my week" can start two charged plans, and concurrent plans duplicate items

- Plans/tasks: 08 H3 `requestWeeklyPlan`, `replaceGeneratedPlan`; 16 P9 `PlanWeekButton`; 12 L9 `handlePlanWeekly`.
- Scenario: `requestWeeklyPlan` has no in-flight guard. Two tabs (or onboarding plus a click, R4E-10) start two jobs, and each is charged a request. The two `replaceGeneratedPlan` transactions run concurrently under READ COMMITTED: each deletes the generated `todo` rows it can see, then inserts its own set. Both commit, so the week shows both plans' items.
- Fix (08 H3):
  - `requestWeeklyPlan` returns the owner's existing `weekly_plan` job that is `queued`/`working` and updated in the last 15 minutes instead of inserting a new one. 16 then follows that job.
  - `replaceGeneratedPlan` takes `pg_advisory_xact_lock(hashtext(ownerId || week))` before the delete.

#### R4E-13 (medium): Recheck collection isn't claimed, so a retry or overlapping run files duplicate review tasks and double-counts usage

- Plans/tasks: 11 K7 `collectRecheck`, `createReviewTask`; 12 L12 `handleCatalogRecheckCollect`, L14 `SCHEDULE_OPTIONS` (only `catalog.recheck` gets `retryLimit: 0`).
- Scenario: `collectRecheck` processes an `in_progress` batch and sets `collected` only at the end. Either of two things replays the batch from the start:
  - A failure partway through (one `createReviewTask` or `update` throws) fails the job, and pg-boss retries it (scheduled jobs use the default retries).
  - A 200-listing collection that outlasts the 30-minute cron runs alongside the next collection.

  Each replay inserts another `recheck_changed` task for every listing already handled (`createReviewTask` never dedupes) and records every batch item's usage again through `onUsage`.
- Fix (11 K7): claim each batch first with `update recheck_batches set status = 'collecting' where id = ? and status = 'in_progress' returning`, and move it back to `in_progress` on a thrown error. Skip `createReviewTask` when an open `recheck_changed` task already exists for the listing, or add a partial unique index on `catalog_tasks (scholarship_id, kind) where status in ('open','in_review')`. Report usage once per claimed batch.

#### R4E-14 (medium): Notification email and SMS can go out twice

- Plans/tasks: 06 F16 `deliverEmail`, `deliverSms`, F2 `resendEmailSender`; 12 L11 `handleNotifyEmail`, `handleDigestWeekly`.
- Scenario: `deliverEmail` sends first and sets `emailedAt` afterwards, with no claim and no provider idempotency key. Two cases send twice:
  - Resend accepts the message but the call times out or returns 5xx: the handler throws and pg-boss retries.
  - The `emailedAt` update fails after a send that succeeded.

  `deliverSms` claims first, but resets the claim and rethrows on any error, including the 10 s `AbortSignal` timeout after Twilio has already accepted the text, so the retry texts again. The digest retracts its guard notification after an ambiguous send failure, and the next hourly run sends a second digest.
- Fix (06 F16): claim email the same way SMS is claimed (`update … set emailed_at = now where emailed_at is null returning`) and send with an `Idempotency-Key: notification-<id>` header (Resend supports it; the digest uses `digest-<userId>-<weekStart>`). Release the claim only on a definite 4xx rejection. For Twilio, treat timeouts and network errors after the request was sent as "maybe sent": keep the claim and log it rather than retrying.

#### R4E-15 (medium): Emails to third parties are neither idempotent nor rate-limited

- Plans/tasks: 07 G9 `requestRecommendation`, G14 `requestVerification`; 06 F9 `invite`; 14 N2 `recommenders/requests/route.ts` (POST) and N5 `service-logs/[id]/verify/route.ts`, neither of which sets `rate:`; 13 M10 invites (20 a day).
- Scenario: a double-submit of "Ask for a letter" creates two helper links and two `recRequests`, and emails the teacher twice. `createHelperLink` and the insert aren't in one transaction, so a failed send followed by a retry leaves an extra live link. A repeated `requestVerification` emails the supervisor again with a new token, which kills the link in the first email ("This link has expired or was already used"). Neither route is rate-limited, so a student account can send unlimited emails with free text (`message`) to any address from ScholarCrew's domain.
- Fix:
  - 07 G9: run the link, request, and send in one transaction, or refuse a second open `requested` request for the same recommender and target within 10 minutes.
  - 07 G14: don't re-issue the token while `requested` and unexpired. Re-send the same link instead, which means storing the token encrypted rather than only its hash, or returning `conflict`.
  - 14: add `rate: { key: "rec.request", limit: 10, windowSeconds: 86_400 }` and `rate: { key: "service.verify", limit: 20, windowSeconds: 86_400 }`.

#### R4E-16 (medium): A $0 cost of attendance counts as a real cost, so the gap reads $0 and the offer looks cheapest

- Plans/tasks: 02 B1 `Usd` (`min(0)`), B6 `ParsedOffer.costOfAttendanceUsd`; 10 J5 `normalizeParsedOffer`; 08 H5 `saveParsedOffer` (`coa.data ?? offer.costOfAttendanceUsd`), `compareMyOffers` (`offer.costOfAttendanceUsd ?? college.costOfAttendanceUsd`), H4 cost summaries; 04 D2 `buildColumn`.
- Scenario: Aid reads a letter that prints "$0" or a blank total as `costOfAttendanceUsd: 0`. 0 isn't null, so it doesn't fall back to the college's Scorecard cost:
  - `reallyCostsUsd` and `fourYearUsd` become 0, and `compareOffers` picks this letter as `lowestFourYearOfferId`.
  - Once confirmed, the costs summary's gap is `max(0, 0 − free) = 0`, and Ledger and This Week tell the family the school is covered.

  A Scorecard import row with `COSTT4_A = 0` does the same to `colleges.costOfAttendanceUsd`.
- Fix: in 10 J5, normalize a cost of attendance of 0 to null. In 08 H4/H5, treat `0` like `null` when picking the cost (`|| college.costOfAttendanceUsd`) and leave the offer out of the comparison with the existing "doesn't list a cost of attendance" note. In 11 K3, map a Scorecard cost of 0 to null.

#### R4E-17 (medium): Past-deadline matches rank first

- Plans/tasks: 04 D5 `rankMatches`/`compareDeadlines` (the test pins `["past", "soon", "late", "none"]`); 07 G5 `getBoard` (Matched column), G3 `listMatches`.
- Scenario: `rankMatches` sorts by value per hour, and nothing sinks a negative `daysUntilDeadline`. A matched card whose listing closed last week (it stays on the board; R3V-6 only drops it from `inPlayUsd`) keeps its high value per hour and sits at the top of the Matched column. On ties it beats every open listing, because −2 < 3. The board's first suggestion is something the student can't apply to.
- Fix (04 D5): order `daysUntilDeadline < 0` after every open listing, and after no-deadline listings, then by value. Update the test. 07 G5 needs no change beyond the new order. Optionally label closed cards.

#### R4E-18 (medium): `list_stories` returns whole stories, so about three stories overflow the 20,000-character tool cap

- Plans/tasks: 10 J1 `list_stories`; 09 I5 `truncateResult` (`MAX_TOOL_RESULT_CHARS = 20_000`), 10-2 `keepSeenRefs`; 12 L5 `port.stories`; 02 B5 `StoryInput` (moment 4,000, evidence 2,000, summary 400).
- Scenario: each story can be about 6.5k characters plus its `uses`. With 4 or more full stories, the JSON is cut mid-string with `…[truncated]`. Quill gets broken JSON and never sees the later stories. Since 10-2 drops refs that don't appear in `seen`, Quill can't cite them even when it guesses the id. The Story Bank is meant to grow over a season, so this hits ordinary users.
- Fix: in 10 J1, have `list_stories` return `{ id, title, themes, summary or the first 300 characters of moment, usesCount }`, capped at 30 items, and add a `get_story(id)` tool for the full text. In 09 I5, truncate arrays by whole items, keeping the JSON valid, rather than by characters.

#### R4E-19 (medium): After "New season", the same college can't be added back this season

- Plans/tasks: 07 G8 `addCollege` (the `dup` query has no `archivedAt` filter), `archiveSeason`; 03 C4 `college_list_owner_college_season_uq` (owner, college, season).
- Scenario: `archiveSeason` (ME-07) archives every current entry but leaves `season` as it is, since the season comes from the date. A student who starts a new season before Aug 1 and re-adds a school gets "That college is already on your list this season." The row is archived and invisible, and the unique constraint would refuse it anyway.
- Fix (07 G8 with 03 C4): filter `dup` by `isNull(archivedAt)`, and replace the unique with a partial unique index `where archived_at is null`. Better still, have `archiveSeason` close the list without depending on the date-derived season (see R4E-5).

### Low

#### R4E-20 (low): The completion steps aren't atomic, so a failure after `completeJob` commits loses usage, candidates, and the notice

- Plans/tasks: 08 H2 `completeJob` (`notify` runs after the transaction); 12 L6 `runCrewJob` (`completeJob` → `afterComplete` → `recordUsage`).
- Scenario: `notify` throws after the message transaction commits, or `recordUsage` throws. The handler rethrows, the retry sees a terminal job and skips it, and three things never happen: usage is never billed (a free request), `afterComplete` never files candidates, and the "ready" notice and email are never sent. R2C-15 covered the opposite order only.
- Fix: in 08 H2, write the `job:<id>` notification inside the completion transaction (the row insert only; enqueue the email after). In 12 L6, store a `billedAt` on `crewJobs`, and on a retry of a terminal job with `billedAt` null, run `afterComplete` and `recordUsage` before skipping.

#### R4E-21 (low): `resolveCatalogTask` has no claim, so two resolutions can both apply

- Plans/tasks: 08 H11 `resolveCatalogTask`; 18 R14 `TaskReview`.
- Scenario: the open-status check is a read before the transaction, and the final `update catalog_tasks` has no status condition. Two admins, or a retried request, both pass. One rejects and the other publishes: the listing is published, the task ends up with whichever write came last, and both are audited.
- Fix (08 H11): first, inside the transaction, run `update catalog_tasks set status = … where id = ? and status in OPEN_TASK returning`. Throw `conflict` when nothing comes back, and only then publish or restore.

#### R4E-22 (low): A failed export is never retried or announced, and queued or failed exports never expire

- Plans/tasks: 06 F18 `requestExport`, `buildExport`, `latestExport`; F19 `purgeExpired`.
- Scenario: `buildExport` marks the row `failed` and rethrows. The pg-boss retry then sees `status !== "queued"` and returns, so retries never help, and the user gets no notice (only the "ready" path notifies). Rows that are `failed`, or `queued` with no job (R4E-2), have `expiresAt` null, so the purge never removes them and `latestExport` keeps returning them. There's also no guard against a second export request while one is queued, beyond the 5-a-day route limit.
- Fix (06 F18): on a thrown error, leave the row `queued` while retries remain (the handler can pass the retry metadata) and set `failed` plus a "Your export didn't finish" notification on the last attempt. Give failed rows `expiresAt = now + 1 day`. In `requestExport`, return the existing queued export instead of creating another.

#### R4E-23 (low): Lists that grow without bound are read without pagination

- Plans/tasks: 08 H9 `getMessages` and H2 `completeJob` (R2C-14 reuses one room per job kind for good); 07 G10 `listVersions` (full bodies, up to 50,000 characters each); 06 F18 `collect` (every version of every essay), F14 `listHelperLinks`, F6 `listFacts`.
- Scenario: the "Weekly plans" room receives a reply every Monday and every "Plan my week", indefinitely. `getMessages` returns every message with its full `reply` JSON on each open. A heavily revised essay's history returns every version's body. The export loads all of it into one blob, and `getExport` decrypts it in memory.
- Fix: in 08 H9, have `getMessages` take `before?`/`limit` (default 50) with 16 loading older pages on scroll. In 07 G10, make `listVersions` return metadata and fetch one body per version. Optionally cap versions per essay, or let 06 keep the last N full versions in the export.

#### R4E-24 (low): Essay review reads the version twice, and old-version comments can be anchored to the wrong text

- Plans/tasks: 12 L8 `handleEssayReview` (`getEssay` for `currentVersion`, then `runEssayReview` reads through `port.essay`); 07 G11 `saveQuillComments`; 17 Q9 `highlightSegments`.
- Scenario: if the student saves between the handler's `getEssay` and the port read, Quill reviews version N+1 while the comments are validated and stored against N, so they're silently dropped. Later, comments stored for version N are matched against the current body by `(quote, occurrence)`. After an edit, the second "cord" can now be a different sentence, so the highlight lands on the wrong text.
- Fix: in 12 L8 and 10, read the version once and pass `{ version, body }` into `runEssayReview` (or let `port.essay` take a version). In 17 Q9, show comments whose `version` differs from the essay's `currentVersion` in the unplaced list with "from draft N".

#### R4E-25 (low): A duplicate sweep overwrites the "new matches" summary with zero

- Plans/tasks: 07 G4 `runSweep`/`lastSweep`; 12 L10 (accepted duplicate `sweep.student`); 08 H7/H8 (This Week sweep card, digest `fresh`).
- Scenario: the accepted duplicate (a retried `sweep.weekly`, or an onboarding double-submit) runs a second sweep minutes later. It finds 0 new matches and writes a new `sweepRuns` row. `lastSweep` returns that row, so This Week and the digest drop "Scout found 3 new matches worth $4,500."
- Fix (07 G4): when a run adds nothing and an earlier run exists for the same local day, skip the `sweepRuns` insert. Alternatively, have `lastSweep` sum the runs for the week.

#### R4E-26 (low): One bad `users.timeZone` stops deadline reminders for everyone

- Plans/tasks: 04 D7 (`reminderOffsetsDue`/`daysUntil` throw `RangeError` for an unknown zone); 06 F2 `todayIn`; 08 H8 `findDueReminders` (passes `users.timeZone` unchecked); 12 L11.
- Scenario: a zone that a newer or older ICU no longer accepts, or a row written outside `ProfilePatch` (seed, admin fix, migration), throws inside the loop. `findDueReminders` rejects, and no student gets reminders that hour, or any hour after. Plan 12 has `safeTimeZone` for this reason, but 08 doesn't use it.
- Fix (08 H8): wrap each row's zone with a safe fallback, the way 12's `safeTimeZone` does (move it into `core/shared`), or catch per row and log.

#### R4E-27 (low): Timestamps come from two clocks

- Plans/tasks: 07 G11 `requestReview`, G13 `requestRetakeAnalysis` (crew-job insert with DB `defaultNow()`), against 08 H2 `insertJob`/`createJob` and 06 F11 `inFlightCrewJobs` (app clock); 08 H9 messages (web clock) against `completeJob` replies (worker clock); 12 L7 `loadCrewInput` (`lte(createdAt, request.createdAt)`).
- Scenario: in tests with `fixedClock`, those two job kinds get wall-clock `createdAt` while everything else gets `TEST_NOW`. `listJobs` ordering and the 60-minute in-flight window then depend on the real date, which makes tests flaky. In production, skew between web and worker shifts message order: a crew reply stamped by a fast worker clock can sort after the user's next question, and that history line is then excluded by `lte`.
- Fix: in 07 G11/G13, pass `createdAt`/`updatedAt: deps.clock.now()` like 08 does. For ordering columns (`messages.createdAt`), use the DB clock everywhere (`defaultNow()` and no app value), or order history by a sequence.

#### R4E-28 (low): Quiet-hour delays are computed in wall-clock time, so on DST nights they're off by an hour

- Plans/tasks: 06 F16 `secondsUntilQuietEnd`, `deliverEmail`, `deliverSms`.
- Scenario: the wait is `endHour * 3600 − local seconds`. On the spring-forward night, a reminder deferred at 01:30 arrives at 08:00 instead of 07:00. On the fall-back night it wakes at 06:00, finds itself still in quiet hours, and re-enqueues (harmless). Digest and reminder dedupe keys are day- or week-based, so the skipped or repeated hour doesn't double-send.
- Fix (06 F16): compute the next local `endHour:00` instant (for example by stepping hours with `localTimeParts` until the hour matches), not a seconds difference. Add a test at 2027-03-14 01:30 America/Chicago.

#### R4E-29 (low): A crash in the middle of an apply leaves a pending receipt that looks applied forever

- Plans/tasks: 08 H10 `applyActionCard` (`STALE_CLAIM_MS`, `PENDING_RESULT`).
- Scenario: the process dies inside `runCard` before it writes anything. The `{ pending: true }` claim stays. After 60 s it's returned as is, and `getMessages.appliedCardIds` marks the card applied, but no plan item, essay, or college was ever created and the card can't be retried.
- Fix (08 H10): when a stale claim is still pending, re-claim it with `update … set applied_at = now where id = ? and result->>'pending' = 'true' and applied_at < now − 60 s returning`. If that wins, run the card again. `save_scholarship` and `add_college` are already idempotent; `add_plan_item` and `start_essay` need a check against `refId`/`sourceMessageId`, or accept the rare duplicate.

#### R4E-30 (low): Jobs with nothing to work on still use a crew request

- Plans/tasks: 07 G13 `requestRetakeAnalysis`/`computeRetake`; 12 L9 `handlePrepRetake`.
- Scenario: a student with no colleges this season, or with no merit tiers on any listed college, or with a target at or below their best official score, starts a retake analysis. `retakeAnalysis` returns empty rows and $0, Prep explains nothing, and one of the 20 free requests is spent.
- Fix (07 G13): in `requestRetakeAnalysis`, run `computeRetake` first and throw `invalid_input` ("Add colleges with merit scholarships first", or "Pick a target above your best score") when there are no rows or the total is 0. 17's RetakeForm already computes the same thing client-side and can show the message.

#### R4E-31 (low): Removing a college leaves its CSS work and dangling references

- Plans/tasks: 07 G8 `removeCollege` (hard delete); 08 H6 `ensureChecklists`; 06 F10 `listTasks`; 03 C4 `recRequests.collegeListId` (no FK).
- Scenario: CSS checklist items keyed by `collegeId`, and the parents' linked `css_contributor` tasks, outlive the removed entry. Parents keep seeing "CSS Profile (Old College)" tasks. `recRequests.collegeListId` points at a deleted row, so the request loses its target and due date.
- Fix: in 07 G8, delete the student's CSS `aidChecklistItems` for that college in the same transaction (linked tasks cascade, per R2I-6) when no other active entry uses that college. In 03, give `recRequests.collegeListId` and `scholarshipApplicationId` FKs with `on delete set null`.

#### R4E-32 (low): The purge keeps user-linked data in catalog payloads

- Plans/tasks: 06 F19 `purgeDeletedAccounts` (R2I-17 says "nothing is kept"); 07 G6 `submitLocalScholarship`; 03 C3 `catalogTasks.payload`, `scholarships.submittedById` (set null).
- Scenario: a purged student's `user_submission` tasks keep `payload.submittedById` and the free-text `notes`, and their `submitter_only` draft listings stay with `submittedById` null, visible to nobody. `agentRuns.userId` and `auditEvents.actorId` also keep the id.
- Fix (06 F19): in the purge, delete the user's open `user_submission` tasks and `submitter_only` draft listings. For resolved ones, rewrite `payload.submittedById` to null and `notes` to "". State in the privacy notes that anonymous ids are kept in `audit_events` and `agent_runs`.

#### R4E-33 (low): Two first sign-ins for the same new email race and one ends in a 500

- Plans/tasks: 06 F5 `verifyMagicLink`/`createAccount`.
- Scenario: the user requests two links (or opens two tabs) and clicks both. Each link is single-use, so both pass. Neither finds a user, both insert `users`, and the second insert hits `users_email_unique` (23505), which comes back as a raw 500 after that link has already been used up.
- Fix (06 F5): `insert … on conflict (email) do nothing returning`, then re-select the user. Create the profile, subscription, and prefs rows only when this call inserted the user.

## Checked and fine

- Action-card apply: the receipt is claimed first with `onConflictDoNothing`, a lost claim returns or throws `conflict`, and a thrown card drops its claim (08 H10). See R4E-29 for the crash case only.
- Invite accepted twice: the claim is a conditional `update … where accepted_at is null` inside the transaction (06 F9). See R4E-11 for two different invites.
- Same scholarship saved twice: `onConflictDoNothing` on `(ownerId, scholarshipId)` (07 G5, G6).
- College CSV import run twice: an upsert on `colleges.id` (08 H12). A re-import does overwrite with nulls, which is expected Scorecard behavior.
- Catalog extract for the same task twice: `short` policy plus `singletonKey`, and `extractForTask` returns null for a closed task. A rerun only repeats the model cost.
- Quill comments on a retry: `saveQuillComments` returns the comments already stored for that job.
- Magic links: single-use under races, 15-minute expiry, and purged after a day. Invites, helper links, verification links, sessions, temporary chats, and exports all check their expiry on read, and the expired ones the purge covers are deleted hourly.
- Divide by zero in value per hour (minimum 5 minutes), $0 amounts, zero-principal and 0% loans, and a negative gap (clamped to 0) are handled in 04.
- Digest and reminders across DST: every send is keyed by day or week, so an hour that is skipped or repeated can't skip or double-send. The digest catches up at the first eligible hour.
- Leap days: `isRenewalAnniversary` maps Feb 29 to Feb 28, and `isoDateMs` rejects dates that don't exist.

## Counts

High 5 (R4E-1 to R4E-5), medium 14 (R4E-6 to R4E-19), low 14 (R4E-20 to R4E-33).
