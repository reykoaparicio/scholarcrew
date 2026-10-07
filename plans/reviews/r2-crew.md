# Round 2 review: crew, jobs, catalog, admin, extension (end-to-end data flow)

Focus: plans/21-review-harness.md §3 round 2. I followed real values from the route handler to core to the db to the domain object to the page, and each job from enqueue to worker to agents/catalog to core to the UI. Names and imports were round 1's job and aren't repeated here. Items that `plans/review-log.md` marks fixed or accepted (D4, D5, D10, D14, D19 filing, D20, D22 snapshot, D25, D26, D29, D35, D40, D49, 12-1, 12-9) aren't re-reported unless the trace shows the fix is incomplete.

Sources: 00 §8, §9.3–§9.8, §10; review-log; openapi `/conversations/{id}/messages`, `/jobs`, `/jobs/{id}`, `/jobs/{id}/events`, `/actions/apply`, `/extension/save-page`; 02 B7/B8 (`crew.ts`, `catalog.ts`, `jobs.ts`, extension schemas); 06 F-memory (`createFact`, `writeConfirmedFact`, `createCandidate`, `confirmCandidate`), F-billing (`assertCrewAllowance`, `recordUsage`, `monthKey`), apitokens, `getAutofillProfile`; 07 G6 `submitLocalScholarship`, G2 search statuses; 08 H2 jobs, H3 `replaceGeneratedPlan`/`requestWeeklyPlan`, H7 `getThisWeek`, H9 conversations, H10 actions, H11/H12 admin; 09 I12 `runCrewRequest`, prompt, `buildContextBlocks`, `knownFromSnapshot`; 10 specialist prompts and context blocks; 11 recheck (`createReviewTask`, `startRecheck`); 12 L5 port, L6 runner, L7 crew.request, L9 plan.weekly, L12 catalog, L14 registry; 14 N9, N10, N12, N14; 16 P3 `useJobStream`, P11 `ActionButtons`/`ReplyCard`, P12 `Thread`, P13 parent room, P9/P10 `/week`, P20 family page; 17 Q2 `ContextCrew` and its three call sites; 18 R14 `review.ts`/`TaskReview`/tasks page, R15; 20 API client and router.

Finding IDs: `R2C-<n>`. Severity: high (breaks the build or a contract), medium (wrong behavior), low (unclear or minor).

## Findings

### R2C-1 (medium) D42 is still open: a parent's message in a family room reaches Compass as the student's

Plans: 02 B7, 09 I12 (`blocks.ts`, `prompt.ts`), 12 L7, 16 P13/P20.

Trace:
- 16 family room (`parentRoom` in P13, the `/family` page in P20) → `Thread` → `POST /conversations/:id/messages` → 08 `sendMessage` stores `authorUserId = parent.id` and inserts the job with `ownerId = conv.ownerId` (the student).
- 12 `loadCrewInput` builds `CrewRequestInput` from `request.body` only. 02 `CrewRequestInput` has no requester field (B7 `crew.ts`: `jobId, ownerId, conversationId, room, roomRef, audience, userText, history, mentions`).
- 12-9 only prefixes earlier history lines with `"Family member: "`, and 09 `buildContextBlocks` still wraps them as `Student: …`. The L7 test asserts `"Student: Family member: How are things going?"`, which is the half-fix.
- The current message goes in as the bare final text block, followed by `"The student mentioned …"`. `COMPASS_SYSTEM` says `Talk to the student as "you"`. So a parent asking "How are things going?" gets an answer written to the student in the second person. FA-03's "Answers say using shared numbers only" isn't in any prompt either (no plan contains "shared numbers").

Fix:
- **02 B7 `crew.ts`:** add `CrewSpeaker = z.enum(["student", "parent", "crew"])`. Add `requester: z.strictObject({ role: z.enum(["student", "parent"]), firstName: z.string().max(60) })` to `CrewRequestInput`. Change `history` items to `{ author: MessageAuthor, speaker: CrewSpeaker, text: z.string() }`. Add a parse test with a parent requester.
- **12 L7 `loadCrewInput`:** select `authorUserId` on the request message as well. When it differs from `ownerId`, read `users.role` and `users.displayName` and set `requester: { role: "parent", firstName }`. Otherwise use `{ role: "student", firstName: <student first name> }`. Set `history[].speaker` from each line's author (crew → `crew`, owner → `student`, anyone else → `parent`), and delete `FAMILY_MEMBER_PREFIX`. Replace the 12-9 test expectation with `"Parent: How are things going?"`, and add a test that a parent's current message produces a block starting `"<firstName> (parent) asks:"`.
- **09 I12 `blocks.ts`:** render history lines as `Student:`, `Parent:`, or `Crew:` from `speaker`. When `requester.role === "parent"`, prefix the final block with `${firstName} (parent) asks: ` and make the mention note read "They mentioned …". `runCrewRequest` passes `i.requester` through. Add a `COMPASS_SYSTEM` rule: "When student_context.audience is family, the requester may be a parent. Answer the requester by name, refer to the student by name in the third person, and say you're using shared information only (FA-03)." Add a crew test where a parent requester's text appears with that label.
- **16:** no data change. Both family-room `Thread`s already pass `authors`. Add one P12 test showing a parent's bubble is labeled with the parent's first name, so a regression in `authors` can't hide who asked.

### R2C-2 (medium) D19: an applied `confirm_fact` card leaves its memory candidate pending

Plans: 12 L7 `fileCandidates`, 08 H10 `runCard`, 06 `createFact`/`writeConfirmedFact`, 16 P18.

Trace:
- crew.request → `fileCandidates` → 06 `createCandidate` inserts a row with `status candidate` and `source crew_inferred` for each `confirm_fact` card (12-3).
- The same card stays in `message.reply.actionCards`. When the student presses it, 08 `runCard` calls `createFact`, which goes through `writeConfirmedFact` and inserts a separate confirmed row. That function only supersedes the current *confirmed* fact for the key (`currentFact` filters `status = confirmed`).
- The candidate is untouched, so 06 `listFacts` keeps returning it and 16's Memory screen still shows it under "Waiting for your OK" after the student already said yes in the chat.
- Rejecting that leftover candidate doesn't remove the confirmed fact. Confirming it supersedes an identical fact.

Fix (06, F-memory `writeConfirmedFact`): inside the same transaction, after inserting the confirmed row, set `supersededById = created.id` on live candidates (`status = 'candidate'`, `supersededById is null`) with the same `ownerId` and `key`. `listFacts` already hides superseded rows. Add a test: `createCandidate(intended_major)`, then `createFact(intended_major)`, and `listFacts` returns only the confirmed row. Add an 08 H10 assertion that applying a `confirm_fact` card after a candidate exists leaves no candidate.

### R2C-3 (medium) `POST /actions/apply` isn't idempotent under concurrent or retried applies

Plans: 08 H10 `applyActionCard`, 14 N9, 16 P11.

Trace:
- `applyActionCard` reads the receipt (`receiptFor`), then `runCard(...)` (each card writes through its own service on `deps.db`), then inserts the receipt with `onConflictDoNothing`.
- Two requests that both pass the read both run the card: two plan items, two essays, two decisions. The second only loses the receipt insert and returns the first receipt.
- 16 `ActionButtons` disables the buttons while one apply is pending in that tab. A second tab, or a client retry after a dropped response, still double-applies. CR-05 says "Applying the same card twice has no extra effect", and the openapi text promises it.
- A crash between `runCard` and the receipt insert also leaves the effect without a receipt, so the next apply runs it again.

Fix (08 H10): claim first. Insert `actionReceipts { ownerId, messageId, cardId, appliedAt, result: { pending: true } }` with `onConflictDoNothing().returning()`.
- If nothing comes back, re-read the receipt. Return it when `result.pending !== true`, otherwise throw `conflict("This action is still being applied")`.
- If the claim succeeds, run the card, then `update actionReceipts set result = <card result>`. If `runCard` throws, delete the claim row and rethrow.
- `getMessages` keeps listing `cardId`s from every receipt. 16 already treats `applied` as done, and a pending claim reads as applied, which is fine.
- Add a test with two `Promise.all` applies of an `add_plan_item` card: exactly one plan item, and both calls return a receipt or one returns `conflict`.

### R2C-4 (medium) `replaceGeneratedPlan` deletes items the student accepted from action cards and study plans

Plans: 08 H3 `replaceGeneratedPlan`, H10 `runCard`, 07 `acceptStudyPlan`, 03 `planItems`, 12 L9.

Trace:
- `replaceGeneratedPlan` deletes this week's `todo` items with `cardinality(contributors) > 0`. Its comment says "items without contributors were added by the student and stay".
- An `add_plan_item` card applied by the student goes through `addPlanItem`, which stores `card.item.contributors`. The H10 test expects `contributors: ["scout"]`, and the card defaults `weekStart` to this week.
- 07 `acceptStudyPlan` inserts `contributors: ["prep"]`.
- So the next `plan.weekly` (onboarding, or `POST /plan/regenerate`) silently removes every crew card the student accepted this week and every accepted Prep session in the current week. The contributor dots are display data, not provenance.

Fix:
- **03 `planItems`:** add `generated bool = false` with a migration, and add it to the 00 §8 `planItems` line.
- **08 H3:** `replaceGeneratedPlan` inserts `generated: true` and deletes only `generated = true and status = 'todo'` for the week. `addPlanItem`, H10 cards, and 07 `acceptStudyPlan` leave it false.
- **Test:** an applied card item and a study session in the same week both survive a regenerate, and an old generated item is replaced.

### R2C-5 (medium) The weekly plan runs only once: no schedule enqueues `plan.weekly`, and nothing calls `POST /plan/regenerate`

Plans: 05 `SCHEDULES`, 12 L10/L14, 14 N8, 16 P9/P10.

Trace:
- `plan.weekly` senders are 06 `completeOnboarding` and 08 `requestWeeklyPlan`, which is behind 14 `POST /plan/regenerate`.
- 00 §9.3 `SCHEDULES` has no `plan.weekly`, and 12's `sweep.weekly` fan-out queues only `sweep.student`.
- A grep of 16, 17, and 19 finds no client of `/plan/regenerate` (16's `/week` has `NextStepHero`, `PlanList`, `AskBar`, and `CrewWorking`, but no plan button).
- From the student's second week on, 08 `getThisWeek` → `loadWeekPlan` for the new Monday is empty, so This Week has no next step or plan (WK-01, WK-02). The route and handler exist with no way to reach them after onboarding.

Fix:
- **16 P9/P10:** a student-only "Plan my week" button on `/week`, shown when `view.plan.items` has no generated items or at any time. It calls `POST /plan/regenerate`, follows the returned `CrewJob` with `useJobStream`, and runs `router.refresh()` on a terminal status. It shows `isLimit` → "See plans" on 402.
- **Optionally (12 L10):** after `runSweep`, `sweep.student` also starts a weekly plan through a new 08 system function `startWeeklyPlan(deps, system, ownerId)`, which inserts the `weekly_plan` job and enqueues `plan.weekly` while skipping the allowance check. Note it in 00 §9.4.

### R2C-6 (medium) D18: the extracted draft and report on student submissions are written but never read, so Publish ships the placeholder row

Plans: 11 K6 `extractForTask`, 07 G6 `submitLocalScholarship`, 18 R14 `review.ts` and `TaskReview.tsx`.

Trace:
- 07 inserts the submitted listing with `provider: "Unknown"`, `amountMinUsd: 0`, `amountMaxUsd: 0`, `deadline: null`, and empty requirements. The task's `scholarshipId` is that row.
- 12 `catalog.extract` → 11 writes `draft` and `report` into the `user_submission` payload (02 follow-up done) and leaves the listing untouched by design.
- 18 `draftOf` returns a draft only for `research_candidate` and `recheck_changed`, and `reportOf` does the same, so a submission's draft, field quotes, and scam checks never render.
- The only enabled action is `publishSubmission`, which resolves with `publishScholarshipId = task.scholarshipId`. 08 `resolveCatalogTask` then flips the placeholder row to `published`/`public`. The directory (07 search, public actor) and every student's search then show a $0 listing from "Unknown" with no deadline, no eligibility, and no scam flags from the report.

Fix (18 R14):
- `draftOf`: `if (t.payload.type === "user_submission") return t.payload.draft ?? null;`. `reportOf`: same with `report ?? null`.
- In `TaskReview`, show `publishSubmission` only when `draft` is null. With a draft, `publishDraft` already PATCHes `existing` (the page loads it from `task.scholarshipId`) and keeps its slug, which is the right path.
- `publishInput` should keep `existing.slug` (the submission's random-suffix slug) or let the admin edit it, as it does now.
- Tests: a `user_submission` task with a draft renders the field rows and PATCHes `/admin/scholarships/<submission id>` before resolving. One without a draft still offers the plain Publish.

### R2C-7 (medium) Rejecting a re-check review leaves the listing `stale` forever

Plans: 11 K7 `createReviewTask`/`startRecheck`, 08 H11 `resolveCatalogTask`, 18 R14 `TaskReview`.

Trace:
- 11 marks a published listing `stale` when its page changed or died, and files a `recheck_changed` task.
- In 18, Reject calls `resolve` with `status: "rejected"` and `publishScholarshipId: null`. 08 updates only the task.
- The listing stays `stale`. The public directory (07: public actors see `published` only) hides it. 11 `startRecheck` selects only `status = 'published'`, so it's never re-checked again either.
- "The page change doesn't matter, keep the listing" has no path except opening the editor and setting the status by hand. CA-05 says stale lasts "until reviewed".

Fix (18 R14): for `recheck_changed` tasks, label the buttons "Keep current listing" and "Unpublish".
- **Keep current listing:** `POST /admin/scholarships/:id/status { status: "published", note }`, then resolve `rejected`. This refreshes `verifiedAt`, which is right because an admin just looked.
- **Unpublish:** `POST /admin/scholarships/:id/status { status: "retired" }`, then resolve `resolved`.
- Alternatively, 08 `resolveCatalogTask` could restore `stale` → `published` when a `recheck_changed` task is rejected. Add a test either way.

### R2C-8 (medium) The monthly allowance ignores in-flight jobs, so a student at 19/20 can queue up to 30 more

Plans: 06 F-billing `assertCrewAllowance`/`recordUsage`, 08 H9 `sendMessage` (and every job-starting service), 12 L6.

Trace:
- `assertCrewAllowance` compares `usageCounters.crewRequests` with the plan limit.
- That counter only moves in 12 `runCrewJob` after `completeJob` (`recordUsage(..., crewRequest: true)`).
- Every send while earlier jobs are still `queued` or `working` passes the check. With 13's `crew-send` rate of 30 per 10 minutes, a free student at 19 can queue 30 requests, and all of them run and bill. CR-10 says that at 100%, new requests get the limit message.

Fix (06 `assertCrewAllowance`): add the owner's in-flight count to the used total, `crewJobs where ownerId = userId and status in ('queued','working') and kind <> 'offer_parse'`. Treat `used = counter.crewRequests + inFlight` and compare that with the limit. Add a billing test: at limit − 1 with one queued crew job, the call throws `limit_reached`. No change to 12, because the counter still increments once on completion and the in-flight job then drops out of the second term.

### R2C-9 (low) D22: temporary chats still carry fact and decision cards that save when pressed

Plans: 09 I12 (`sanitizeReply`/`session.finish`), 08 H10, 12 L7.

Trace:
- In a temporary room, 12's snapshot has no facts or decisions, and `fileCandidates` skips the room. That's correct for D22.
- But Compass may still return `confirm_fact` or `record_decision` cards. 16 renders them, and 08 `runCard` writes a confirmed fact or a decision.
- CR-07 says a temporary chat "saves no new facts or candidates". The UI promise in 16's "In this room" facts says nothing is remembered.

Fix:
- **09 I12:** in `session.finish`, when `snapshot.room === "temporary"`, drop `confirm_fact` and `record_decision` cards, and add one prompt line for it.
- **08 H10:** `applyActionCard` refuses those two kinds in a `temporary` room with `invalid_input` "Temporary chats don't save memory".
- One test each.

### R2C-10 (low) CR-08 context rooms reach the model only as a bare id

Plans: 12 L7, 09 I12 prompt, 10 Scout/Atlas prompts, 17 Q2.

Trace:
- 17 `ContextCrew` posts `{ room, roomRefId }`. 08 `roomTarget` stores the canonical id (listing id, college id, own essay id). 12 builds `roomRef: { type: room, id }`, and 09 copies it onto the snapshot and adds it to `KnownSources`. The data flow is intact.
- But nothing tells Compass what the room is for. `COMPASS_SYSTEM` never mentions `roomRef`, and only Quill's prompt mentions the room ref. The object (listing name, deadline, college facts) isn't in the snapshot, so in a scholarship room Compass may consult Scout without the id. CR-08 says "the crew sees that object first".

Fix:
- **09:** add a `COMPASS_SYSTEM` line: "If student_context.roomRef is set, the question is about that object. Include its type and id in every consult question."
- **10:** add a matching line to the Scout (`get_scholarship`) and Atlas (college lookup) prompts.
- No schema change.

### R2C-11 (low) A parent's family-room questions don't appear in the parent's job list

Plans: 08 H2 `listJobs`, 16 P13 `BackgroundJobs`.

Trace: a parent's send creates a job owned by the student (08 `sendMessage`). `getJob` and the SSE stream allow it through `inFamilyRoom`, but `listJobs` filters `ownerId = actor.userId`, so the parent's `GET /jobs?active=1` panel never lists it.

Fix (08 H2): `listJobs` also returns jobs whose `requestMessageId` points at a message with `authorUserId = actor.userId` in a family room the actor belongs to. That's a left join on `messages`, or `or(mine, inArray(crewJobs.requestMessageId, <subquery>))`. Add a test.

### R2C-12 (low) Pages saved from the extension don't land on the board, unlike the web form

Plans: 14 N14 `save-page`, 17 Q-scholarships local form, 20 router.

Trace:
- 17's "Add a local scholarship" form posts `/scholarships/local`, then `POST /scholarship-applications`, and says "Added to your board".
- 14 `save-page` calls only `submitLocalScholarship`. 07 doesn't create an application, so the `submitter_only` listing appears only if the student happens to search for it. 20 says "Saved." with no pointer. EX-02 says it feeds SC-07.

Fix (14 N14): after `submitLocalScholarship`, when `ctx.actor.role === "student"`, call `saveScholarship(ctx.deps, ctx.actor, { scholarshipId: summary.id })` and keep the 201 `ScholarshipSummary` body. Extend the test to assert one `scholarshipApplications` row. 20's success text can then add "It's on your board."

### R2C-13 (low) The CSV import mixes two line-number schemes in `errors`

Plans: 14 N12, 08 H12 `importColleges`.

Trace: parse errors use CSV line numbers (header = 1). `importColleges` reports `line: idx + 1` over the already-filtered `parsed.rows` array, and the route concatenates both. Any import-side error points at the wrong CSV line.

Fix (14 N12): have `parseScorecardCsvWithErrors` rows carry their source line (11 `./csv`: `rows: Array<CollegeImportRow & { line?: never }>` plus a parallel `lines: number[]`), and remap `result.errors[].line` through it in the route. Or 08 `importColleges` takes `Array<{ line: number; row: CollegeImportRow }>`. Pick one and note it in 00 §9.4/§9.6.

### R2C-14 (low) Every non-chat job reply opens a new My Crew room

Plans: 08 H2 `completeJob`, 16 P13.

Trace: `weekly_plan`, `essay_review`, `offer_parse`, `appeal_outline`, and `retake_analysis` jobs have no `conversationId`, so `completeJob` inserts a fresh `my_crew` conversation titled by kind every time. One student gets a new "Weekly plan" room each week and one per essay review in `/crew`. This is probably intended, but no plan says so.

Fix: 08 states the choice in H2. Or reuse the newest live room with the same `title` and `room = my_crew` for the owner before inserting.

### R2C-15 (low) A `completeJob` failure re-runs the whole crew request and files the candidates twice

Plans: 12 L6/L7.

Trace: `fileCandidates` runs inside `work`, before `completeJob`. If `completeJob` throws (a DB error), `runCrewJob` doesn't catch it, the job stays `working`, and pg-boss retries. The retry calls the model again, files the same candidates again (06 `createCandidate` doesn't dedupe), and records usage twice.

Fix (12 L6/L7): `JobOutcome` gains `afterComplete?: () => Promise<void>`. `runCrewJob` calls it after `completeJob` succeeds (logging failures), and `handleCrewRequest` moves `fileCandidates` there. Optionally, 06 `createCandidate` returns the existing live candidate when the owner, key, and value match.

## OK table

| # | Item | Result |
|---|---|---|
| 1 | `GET/POST /conversations` → 08 `listConversations`/`createConversation` (family room owned by the first student, context rooms reopened by `(owner, room, roomRefId)`) → `Conversation` | OK |
| 2 | `GET/POST /conversations/:id/messages` → `accessibleConversation` → `assertCrewAllowance(conv.ownerId)` → message + `crew_request` job in one transaction → `enqueue("crew.request", { jobId })` → 202 `{ message, job }` (openapi `SendMessageResponse`) | OK (allowance gap R2C-8; requester R2C-1) |
| 3 | `GET /jobs?active&limit` → `listJobs` (own, newest first, clamp) → 16 `BackgroundJobs` | OK for students; R2C-11 for parents |
| 4 | `GET /jobs/:id` → `getJob` (owner, or a family member for a family-room job) → 16 `useJobStream` poll fallback | OK |
| 5 | `GET /jobs/:id/events`: 14 sends `event: job` (CrewJob) on status or progress-length change and `event: end` `{}`. 16 listens for `job`, `end`, and `error`. openapi and §10 agree. `completeJob` sets status and `resultMessageId` in one update. | OK |
| 6 | `POST /actions/apply` → `applyActionCard` (crew message, card id, family rule) → service write → `actionReceipts` → `getMessages.appliedCardIds` → 16 `ActionButtons` | Writes the right records; not race-safe (R2C-3) |
| 7 | 12 crew.request: `runCrewJob` (`startJob` → work → `completeJob` → `recordUsage`) → `loadCrewInput` (room, `roomRef`, audience, 10-line history, mentions) | OK |
| 8 | Port snapshot by audience and share settings (12-1): family facts `crew_family` only, no decisions, deadlines/weekPlan/colleges gated, no test scores or aid. One bound port shared by Compass and `makeConsult`. | OK |
| 9 | Compass 09 → `consult_*` → 10 `consultSpecialist` (context JSON + `seen` ref filter) → guards (`checkSources`, `checkPrivacy` with `FAMILY_DEFAULT_ALLOWED`, crisis short-circuit) → `CrewRunResult` | OK (D4 accepted) |
| 10 | `completeJob` → `messages { authorKind: crew, body: reply.text, reply }` (cards, receipt, question, safety) → `router.refresh()` → 16 `Thread`/`ReplyCard`/`Receipt`/`CrisisReply` | OK |
| 11 | D19 `confirm_fact` → `createCandidate` (crew audience, not temporary) | Filed; leftover after apply (R2C-2); retry duplicates (R2C-15) |
| 12 | D22 temporary: snapshot facts/decisions `[]`, no candidates | OK; cards can still save (R2C-9) |
| 13 | D42 parent message labeled to Compass | Still open (R2C-1) |
| 14 | 17 `ContextCrew` for scholarship (`detail.id`), college (`college.id`), and essay (`essay.id`) → `POST /conversations { room, roomRefId }` → 16 `Thread` → `roomRef` in the snapshot and `KnownSources` | OK data path; prompt gap (R2C-10) |
| 15 | `plan.weekly` from 06 onboarding (job row + enqueue) → 12 L9 (job owner, `ensureChecklists`, `weekStartFor` in the user's time zone) → `runWeeklyPlan` → `replaceGeneratedPlan` → `completeJob` notice → 16 `/week` (`getThisWeek.crewWorking` + `CrewWorking` refresh) | OK first run; no later runs (R2C-5); wipes accepted items (R2C-4) |
| 16 | `catalog.research`: 18 `/admin/research` → 14 → 08 `enqueueResearch` (`county` null when blank, matches the strict payload) → 12 → 11 `researchCandidates` → one `catalog.extract` per task with `singletonKey` | OK |
| 17 | `catalog.extract` (`short` queue, key `catalog.extract:<taskId>`) from 12 research and 07 submissions → 11 `extractForTask` → draft + report on the task | OK |
| 18 | `catalog.recheck` (cron, 1 h expiry) → `startRecheck` → batch; `catalog.recheck.collect` (every 30 min) → `collectRecheck` → `recheck_changed` tasks, stale marks, half-cost usage | OK; reject path (R2C-7) |
| 19 | Research publish: 18 `publishDraft` → `POST /admin/scholarships` → resolve with `publishScholarshipId` → `published`/`public`/`verifiedAt` → 07 search (public: published + public + no scams + `openOn`) and the directory | OK |
| 20 | CSV import: 18 R15 `text/csv` → 14 N12 `@scholarcrew/catalog/csv` `parseScorecardCsvWithErrors` → 08 `importColleges` (upsert by UNITID) → `ImportResult` | OK; line numbers (R2C-13) |
| 21 | Student submissions (D18): 17 form / 14 save-page → 07 listing (draft, `submitter_only`) + task + extract → 11 draft on the payload → 18 review | Draft never read (R2C-6) |
| 22 | Extension: 16 P17 `POST /extension/tokens { label }` → 13 → 06 `createApiToken` (`sct_` secret once, default both scopes) → 20 settings `validateToken` → bearer `autofill-profile` (`getAutofillProfile` → strict `AutofillProfile`) and `save-page` (`SavePageInput` → `submitLocalScholarship`, notes cut to 1000) → `ScholarshipSummary` 201 | OK; not on the board (R2C-12) |
| 23 | Usage: each model turn (09 Compass, 10 specialists, Quill, offer parse, appeal, retake, weekly) → `onUsage` → `recordAgentRun` (row + `crewJobs.costMicros`) → `recordUsage` once per job (`crewRequest` true except `offer.parse`; retry attempts billed). Catalog → `catalogUsageRecorder` (role `catalog`, null job/user). `assertCrewAllowance` → 402 `limit_reached` on every job-starting route → 16 `isLimit` "See plans". | Recorded everywhere; allowance check lags (R2C-8) |
| 24 | Jobs vs handlers: all 18 `JOB_NAMES` have a 12 handler (`Record<JobName, Handler>`) and a sender (core enqueue or `SCHEDULES`) | OK, except `plan.weekly` has no recurring sender (R2C-5) |

## Counts

- High: 0
- Medium: 8 (R2C-1 D42, R2C-2 candidate left after apply, R2C-3 apply race, R2C-4 regenerate wipes accepted items, R2C-5 no weekly plan after onboarding, R2C-6 submission draft unread, R2C-7 stale after reject, R2C-8 allowance ignores in-flight jobs)
- Low: 7 (R2C-9 to R2C-15)
- OK rows: 24 traced; 10 fully OK (1, 4, 5, 7, 8, 9, 10, 16, 17, 19), 14 OK with a linked finding or a defect
