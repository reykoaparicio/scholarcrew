# Review round 2 fix plan

Coordinator: round 2 fixes. Inputs: `r2-crew.md` (R2C-1..15), `r2-identity.md` (R2I-1..20), `r2-pipeline.md` (R2P-1..21), `review-log.md`, 00 §4/§5/§8–§12, `docs/product/features.md`, and targeted reads of 02, 06, 07, 08, 09, 12, 16, 17, 18.

Counts: 56 findings, 0 high, 28 medium, 28 low. The brief said 26 low, but the three reports list 7 + 11 + 10 = 28. Three pairs are merged (R2C-2 with R2I-13, R2C-12 with R2P-12, R2I-6 with R2P-2), which leaves **53 decisions**.

Rules for patch agents:

- Every name below is final. If an owner finds a name conflicts with existing code, it keeps the name here and adapts the call site, then records that in its plan.
- Owners recount their own task and test totals and fix Success Criteria and Testing Requirements.
- "Owner" means the plan file that gets the change. A cluster (P-A..P-I) is the patch agent that edits those plans.
- New 02 fields are added with `.optional()` or `.nullable()` as stated, so existing callers keep typechecking. Required additions are called out, and every fixture owner must update their fixtures.
- New job names are `plan.weekly.fanout` and `notify.sms`. `JOB_NAMES` grows from 18 to 20, and every test that counts it changes too.

---

## 1. Decisions

### R2C-1 (M) D42: requester and speaker in family rooms

Fix: carry who asked, and who said each history line, from the message rows through `CrewRequestInput` into Compass's context blocks and prompt. This replaces the 12-9 prefix.

Names:
- 02 `crew.ts`:
  - `export const CrewSpeaker = z.enum(["student", "parent", "crew"])`.
  - `export const CrewRequester = z.strictObject({ role: z.enum(["student", "parent"]), firstName: z.string().max(60) })`.
  - `CrewRequestInput` gains `requester: CrewRequester` (required), and `history` items become `z.strictObject({ author: MessageAuthor, speaker: CrewSpeaker, text: z.string() })`.
- 12 L7 `loadCrewInput`:
  - Look up `users { id, role, displayName }` for the request author and every history author in one query.
  - `requester`: if the author is the owner, `{ role: "student", firstName }`. Otherwise `{ role: users.role === "parent" ? "parent" : "student", firstName }`. `firstName` is the first whitespace token of `displayName`, cut to 60 characters, and may be `""`.
  - `speaker`: crew lines are `"crew"`, the owner is `"student"`, and any other user is `"parent"` when their role is parent, otherwise `"student"`.
  - Delete `FAMILY_MEMBER_PREFIX`.
- 09 `context/blocks.ts`:
  - New signature: `buildContextBlocks(snapshot, history, userText, mentions, requester: CrewRequester)`.
  - History labels are `Student:`, `Parent:`, and `Crew:`, taken from `speaker`.
  - When `requester.role === "parent"`, the final block starts `"<firstName> (parent) asks: "`, or `"A parent asks: "` when `firstName` is blank, and the mention note reads `They mentioned …`.
  - `runCrewRequest` passes `i.requester`.
- 09 `COMPASS_SYSTEM`:
  - Replace `Talk to the student as "you".` with `Talk to the person who asked as "you".`
  - Add: `- In a family room (student_context.audience is "family") the request may come from a parent. Answer the person who asked by name, refer to the student by first name in the third person, and say you're using shared information only.` (FA-03)
- 16: no data change.

Owners: 02, 09, 12, 16. Every `CrewRequestInput` fixture in 09, 10, 12, and 19 adds `requester` and `speaker`.

Tests:
- 02: parse a parent requester, and reject a history line with no `speaker`.
- 12 L7: change the 12-9 expectation to `"Parent: How are things going?"`. Add a test that a parent's current message block starts `"<firstName> (parent) asks:"`.
- 09: a blocks test for the labels and the parent prefix, plus a prompt test that checks for `shared information only`.
- 16 P12: a parent's bubble is labeled with the parent's first name.

### R2C-2 + R2I-13 (M/L) A confirmed fact leaves its candidate pending

Fix: when a fact becomes confirmed, retire the live candidates for the same key. Don't match through `sourceRef`; R2I-13's `card:<…>` approach is not adopted.

Names:
- 06 `memory/facts.ts` `writeConfirmedFact`: in the same `db`/`tx`, run `update memoryFacts set supersededById = <confirmed row id> where ownerId = ? and key = ? and status = 'candidate' and supersededById is null`. Do this in the no-op branch too, using `current.id`.
- `updateFact` runs the same update for `row.key`. `confirmCandidate` runs it for the other live candidates with that key, excluding the one being confirmed.
- `createCandidate`, also for R2C-15: return the existing row and insert nothing when the owner already has a current confirmed fact or a live candidate with the same `key` and the same `JSON.stringify(value)`.

Owners: 06, 08 (test only).

Tests:
- 06: `createCandidate(intended_major)` then `createFact(intended_major)`; `listFacts` returns only the confirmed row.
- 06: two identical `createCandidate` calls leave one row.
- 06: `createCandidate` when a matching confirmed fact exists leaves no candidate.
- 08 H10: applying a `confirm_fact` card after a candidate exists leaves no live candidate.

### R2C-3 (M) `applyActionCard` isn't race-safe

Fix: claim the receipt first, then run the card. This is in 08 H10 `crew/actions.ts`.

Names:
- `const PENDING_RESULT = { pending: true } as const`.
- `const STALE_CLAIM_MS = 60_000`.

Flow:
1. Insert `actionReceipts { ownerId: conv.ownerId, messageId, cardId, appliedAt: now, result: PENDING_RESULT }` with `.onConflictDoNothing({ target: [messageId, cardId] }).returning()`.
2. If no row comes back, re-read the receipt. Return it when `result.pending !== true` or when `appliedAt` is older than `STALE_CLAIM_MS`. Otherwise throw `conflict("This action is still being applied")`.
3. If the claim succeeds, run `runCard`. On success, `update actionReceipts set result = <card result>` and return it. If `runCard` throws, delete the claim row and rethrow.

`getMessages.appliedCardIds` is unchanged, so a pending claim reads as applied.

Owner: 08. Test: two `Promise.all` applies of one `add_plan_item` card create exactly one plan item; each call returns a receipt or `conflict`. A `runCard` failure leaves no receipt.

### R2C-4 (M) Regenerating the plan deletes accepted items

Fix: mark which plan items were generated.

Names:
- 03 `planItems.generated: boolean("generated").notNull().default(false)`. 00 §8 `planItems` gains `· generated bool = false`.
- 08 H3 `replaceGeneratedPlan` inserts `generated: true` and deletes only rows with `generated = true and status = 'todo'` for that owner and week. The `cardinality(contributors) > 0` condition goes away.
- `addPlanItem`, H10 cards, and 07 `acceptStudyPlan` leave the column at its default. 07 needs no code change.
- The 02 `PlanItem` schema is unchanged; the flag stays internal.

Owners: 03, 08, 00 §8. Tests:
- 03: a schema/migrate assertion for the column (bool, not null, default false).
- 08 H3: an applied card item (contributors `["scout"]`) and a `prep` study item in the same week survive a regenerate, and an earlier generated item is replaced.

### R2C-5 (M) The weekly plan never reruns after onboarding

Fix: do both. There's a Monday schedule fan-out, and `/week` gets a student "Plan my week" button.

Names:
- 02 `jobs.ts`:
  - `JOB_NAMES` adds `"plan.weekly.fanout"` after `"plan.weekly"`.
  - `JobPayloadSchemas["plan.weekly.fanout"] = empty`.
  - `"plan.weekly"` becomes `z.strictObject({ jobId: Id, ownerId: Id, source: z.enum(["user", "system"]).optional() })`. A missing `source` means `"user"`.
- 05 `SCHEDULES` adds `{ name: "plan.weekly.fanout", cron: "0 11 * * 1", tz: "UTC" }`. That's Monday 11:00 UTC, which is Monday morning in every US zone, so `weekStartFor` lands on the new Monday. The queue policy stays `standard`. 00 §9.3 gets both names and the schedule.
- 08 `plan` module adds `startWeeklyPlan(deps, system, ownerId): Promise<CrewJob | null>`:
  - It requires the system actor, and returns null unless the user is an active student with `onboardingCompletedAt`.
  - It returns null when the owner has a `weekly_plan` job created in the last 12 hours, so fan-out retries are idempotent.
  - It does no allowance check. It inserts a `weekly_plan` job and enqueues `plan.weekly { jobId, ownerId, source: "system" }`.
- 12 new `handlers/plan-weekly-fanout.ts` `handlePlanWeeklyFanout(deps, data)`:
  - It uses the same student query as `sweep.weekly` and calls `startWeeklyPlan` for each student.
  - A failure for one student is logged and the loop continues. It logs `{ candidates, started }`.
  - It's registered in `HANDLERS`.
- 12 `plan-weekly.ts` passes `crewRequest: payload.source !== "system"`. A system plan records its cost but doesn't count against the monthly request allowance.
- 16 new `src/components/week/PlanWeekButton.tsx` `PlanWeekButton()` (client, no props):
  - It's rendered on `/week` for the student viewing their own week, never for parents.
  - The label is "Plan my week" and the busy text is "Planning…".
  - It calls `POST /plan/regenerate`, follows the `CrewJob` with `useJobStream`, and calls `router.refresh()` on a terminal status.
  - On 402 it shows the `isLimit` "See plans" link.

Owners: 02, 05, 08, 12, 16, 00 §9.3/§9.4. Tests:
- 02: payload with and without `source`.
- 05: `SCHEDULES` includes the cron.
- 08: `startWeeklyPlan` starts one job, skips a second call within 12 hours, and skips parents and unfinished students.
- 12: fan-out over two students enqueues two `plan.weekly` jobs with `source: "system"`. A system plan leaves `usageCounters.crewRequests` unchanged.
- 16: the button posts, follows the stream, refreshes, shows the 402 link, and is absent for parents.

### R2C-6 (M) A submission's draft and report are never shown

Fix (18 R14 `review.ts`, `TaskReview.tsx`):
- `draftOf`: `if (t.payload.type === "user_submission") return t.payload.draft ?? null;`. `reportOf` does the same with `report`.
- `TaskReview` shows `publishSubmission` only when the draft is null. With a draft, the existing `publishDraft` PATCHes `/admin/scholarships/<task.scholarshipId>` (keeping `existing.slug`) and then resolves with `publishScholarshipId`.

Owner: 18. Tests:
- A `user_submission` task with a draft renders the field rows and scam checks, and PATCHes `/admin/scholarships/<id>` before resolving.
- Without a draft, it still offers plain Publish.

### R2C-7 (M) Rejecting a re-check leaves the listing stale

Fix: core restores the listing, and the admin page relabels the buttons.

Names:
- 08 H11 `resolveCatalogTask`: when `task.kind === "recheck_changed"`, `v.status === "rejected"`, and the listing's status is `stale`, set the listing to `status: "published", verifiedAt: now, verifiedById: actor.userId, updatedAt: now` in the same transaction.
- 18 R14: for `recheck_changed` tasks, Reject is labeled "Keep current listing". A new "Retire listing" button calls `POST /admin/scholarships/:id/status { status: "retired", note }` and then resolves with `status: "resolved", publishScholarshipId: null`.

Owners: 08, 18. Tests:
- 08: rejecting a recheck task republishes a stale listing; rejecting other kinds leaves listings alone.
- 18: the button labels and the two-call retire sequence.

### R2C-8 (M) The allowance ignores in-flight jobs

Fix (06 F-billing `assertCrewAllowance`): count `used = counter.crewRequests + inFlight`. `inFlight` counts `crewJobs` with `ownerId = userId`, `status in ('queued','working')`, `kind <> 'offer_parse'`, and `createdAt > now - 1 hour`, so a stuck job can't hold allowance forever.

Owner: 06. Test: at limit − 1 with one queued `crew_request` job, the call throws `limit_reached`. A queued `offer_parse` doesn't count, and neither does a job queued two hours ago.

### R2C-9 (L) Temporary chats can still save facts and decisions

Fix:
- 09 I12: when `snapshot.room === "temporary"`, `session.finish` drops `confirm_fact` and `record_decision` cards. Add a `COMPASS_SYSTEM` line: `- In a temporary room (student_context.room is "temporary") nothing is remembered: never propose confirm_fact or record_decision cards.`
- 08 H10: `applyActionCard` throws `invalidInput("Temporary chats don't save memory")` for those two kinds when `conv.room === "temporary"`.

Owners: 09, 08. Tests: one 09 crew test (the cards are stripped) and one 08 actions test (refused).

### R2C-10 (L) Context rooms reach Compass only as a bare id

Fix: prompt lines only, no schema change.
- 09 `COMPASS_SYSTEM`: `- If student_context.roomRef is set, the question is about that object. Include its type and id in every consult question.`
- 10: the Scout and Atlas system prompts get `If the question names a scholarship or college id, look it up first with get_scholarship or get_college.`

Owners: 09, 10. Tests: prompt-content assertions in 09 and 10.

### R2C-11 (L) A parent's family-room jobs don't appear in their job list

Fix (08 H2 `listJobs`): the filter becomes `or(eq(crewJobs.ownerId, actor.userId), inArray(crewJobs.requestMessageId, <subquery>))`. The subquery selects `messages.id` joined to `conversations` (`room = 'family'`) and to `familyMembers` (`userId = actor.userId`), where `messages.authorUserId = actor.userId`. The active filter, order, and limit don't change.

Owner: 08. Test: a parent's family-room send appears in the parent's `listJobs({ active: true })`, and drops out once the parent leaves the family.

### R2C-12 + R2P-12 (L/M) Pages saved from the extension don't land on the board

Fix: 07 `submitLocalScholarship` inserts a `planned` application for the submitter in the same transaction, using `scholarshipApplications` `onConflictDoNothing` with `estMinutes` from the listing. This applies to every path (web form and extension).

Changes:
- 17 Q5 `AddLocalModal` drops its second `POST /scholarship-applications` call and keeps the "Added to your board" text.
- 14 N14 needs no code change.
- 20's success text becomes "Saved. It's on your board as unverified."

Owners: 07, 14 (test), 17, 20. Tests:
- 07 G6: a submission creates one `planned` application.
- 14 N14: save-page leaves one `scholarshipApplications` row for the student.
- 17: the modal makes one request.
- 20: the success text.

### R2C-13 (L) The CSV import mixes line-number schemes

Fix:
- 11 `./csv` `parseScorecardCsvWithErrors` returns `{ rows, lines, errors }`, where `lines: number[]` holds the CSV line of each row (header = 1). 00 §9.6 is updated.
- 14 N12 remaps every `importColleges` error with `line: parsed.lines[e.line - 1] ?? e.line` before merging it with the parse errors.
- 08 is unchanged.

Owners: 11, 14, 00 §9.6. Tests:
- 11: `lines` skips blank or invalid lines.
- 14: an import-side error on CSV line 5, after one bad line, reports `line: 5`.

### R2C-14 (L) Every non-chat job opens a new My Crew room

Fix (08 H2 `completeJob`): when the job has no `conversationId`, reuse the owner's newest conversation with `room = 'my_crew'`, `title = ROOM_TITLES[kind]`, `roomRefId is null`, and `archivedAt is null`. Insert a new one only when none exists. Document this in H2.

Owner: 08. Test: two `weekly_plan` jobs post into one "Weekly plan" room.

### R2C-15 (L) A `completeJob` failure refiles candidates

Fix:
- 12 L6 `JobOutcome` gains `afterComplete?: () => Promise<void>`. `runCrewJob` calls it after `completeJob` and before `recordUsage`, and logs `job.after_complete_failed` on error without rethrowing.
- `handleCrewRequest` moves `fileCandidates` into `afterComplete`.
- The 06 `createCandidate` dedupe is in R2C-2.

Owners: 12, 06. Test: when `completeJob` throws once and the handler is retried, there's one candidate row, and a failing `afterComplete` still leaves the job `ready`.

### R2I-1 (M) Editing or forgetting a profile fact leaves `profiles` stale

Fix: memory writes on the eight profile keys update the matching `profiles` column in the same transaction.

Names:
- 02 `memory.ts`: `export const PROFILE_FACT_KEYS = ["class_year", "high_school", "state", "county", "city", "gpa_unweighted", "intended_majors", "interests"] as const;` and `export type ProfileFactKey = (typeof PROFILE_FACT_KEYS)[number]`. 16 also imports these (R2I-10).
- 06 `memory/facts.ts`: internal `syncProfileColumn(tx: DbOrTx, ownerId: string, key: string, value: FactValue | null): Promise<void>`.
  - It does nothing for other keys.
  - It validates `value` with the matching `ProfilePatch` field (`class_year` → `classYear`, `high_school` → `highSchool`, `gpa_unweighted` → `gpaUnweighted` stored ×100, `intended_majors` → `intendedMajors`, and the rest map one to one). An invalid value throws `invalidInput("That value doesn't fit <label>")`.
  - `null` clears the column to `''`, `null`, or `[]`.
- It's called from `createFact`, `updateFact` (new value), `confirmCandidate` (candidate value), and `forgetFact`. `forgetFact` clears the column only when the forgotten row is the current confirmed fact, and its delete and sync run in one transaction.
- `writeConfirmedFact` doesn't call it, because profile writes already update both sides.

Owners: 02, 06. Tests (06, one per path):
- create `county`, then `profiles.county` matches.
- update `gpa_unweighted` 3.9, then `gpaUnweightedX100` is 390.
- confirm a candidate `state`.
- forget `county`, then the column is `''`.
- `state: "Texas"` is `invalid_input`.

### R2I-2 (M) A parent signing in from an invite becomes a student

Fix:
- 06 F5 `createAccount`: before inserting, look for a `familyInvites` row with this email, `memberRole = 'parent'`, `acceptedAt is null`, and `expiresAt > now`. When one exists, insert `role: "parent"`.
- 13 M7 verify: the redirect becomes `next = me.onboardingComplete ? "/week" : "/onboarding"`, dropping `isNew ||`, so a new parent lands on `/week`. 00 §10's verify row reads "303 to `/onboarding` (student who hasn't onboarded) or `/week`".

Declined part: flipping the role in `acceptInvite` for onboarded students with no rows (§3).

Owners: 06, 13, 00 §10. Tests:
- 06 F5: an email with a pending parent invite creates a `parent`, and one without creates a `student`.
- 13: a new parent's verify redirects to `/week`.

### R2I-3 (M) Parents can't set their name or time zone

Fix:
- 16 P16 `AccountCard` is editable for parents too. The settings page passes `editable={isStudent || isParent}` (that is, not admins). Drop the line-33 deviation note.
- 06 F9 `invite`: when the inviter's name is blank, use `"Your student"` if they're a student and `"Your family member"` if they're a parent. `previewInvite` uses the same fallback.

Owners: 16, 06. Tests:
- 16: a parent can save their name and time zone.
- 06: an invite from a parent with no name says "Your family member".

### R2I-4 (M) Deleting a parent leaves their family-room messages and tasks

Fix (06 F19 `deleteAccount`, inside the existing transaction, before the membership delete):
- Collect `messages.id` where `authorUserId = userId` and the conversation's `familyId` is one of the user's families.
- Collect the `crewJobs` whose `requestMessageId` is in that set. Delete those jobs' `resultMessageId` messages, the jobs themselves, and the user's messages.
- Delete `familyTasks` where `assigneeId = userId`, plus those where `studentId = userId`.
- Delete `familyInvites` where `invitedById = userId` and `acceptedAt is null` (R2I-14).
- The family-removal rule changes from "no members left" to "no `student` member left". In that case delete the family, which cascades to members, invites, tasks, and budgets.

Owner: 06. Tests: extend the first delete test with a parent who posted in the student's family room. The parent's message, the crew reply, the job, and the parent's tasks are gone, and the student's own messages stay. Deleting the only student removes the family.

### R2I-5 (M) Family tasks show college names without a `colleges` share check

Fix: store the plain step title and add the college name only at read time, for viewers who may read colleges.
- 08 `ensureChecklists` creates CSS tasks with `title: s.title` and `detail: "CSS Profile <awardYear>"`, linked through `aidItemId` (R2I-6).
- 06 `listTasks` left-joins `aidChecklistItems` and `colleges` on `familyTasks.aidItemId`. For CSS tasks it appends ` (<college name>)` only when the viewer is the task's student or `getShareGrants(studentId, viewer)` includes `"colleges"`.

Owners: 08, 06. Test (06): with `colleges` off, the parent's CSS task title has no college name and the student's does. With it on, both do.

### R2I-6 + R2P-2 (M) FAFSA/CSS parent steps are stored twice

Fix: the `aidChecklistItems` row is the only status. A linked family task is an assignment pointer, and its status is read from the item.

Names:
- 03 `familyTasks.aidItemId: uuid("aid_item_id").references(() => aidChecklistItems.id, { onDelete: "cascade" })`, nullable, plus a `unique("family_tasks_aid_item_assignee_uq").on(t.aidItemId, t.assigneeId)` (default nulls-distinct, so non-aid tasks aren't affected). 00 §8 `familyTasks` gains `· aidItemId uuid? fk(aidChecklistItems) cascade. Unique (aidItemId, assigneeId)`.
- 06 `createTask` input gains `aidItemId?: string | null`. With an `aidItemId` it inserts `onConflictDoNothing` and returns the existing task.
- 06 `listTasks`: for tasks with `aidItemId`, `status` and `completedAt` come from the joined item.
- 06 `updateTask`: for tasks with `aidItemId`, write `status`/`completedAt` to that `aidChecklistItems` row, not the task row. The same assignee-or-student check applies.
- 08 `ensureChecklists`:
  - After the item insert, re-select the parent-assigned items (current award year).
  - Create one task per (parent, item) with `aidItemId`, `kind` `fafsa_contributor` or `css_contributor`, `title: item.title`, `detail` `FAFSA <awardYear>` or `CSS Profile <awardYear>`, and `dueOn: item.dueOn`.
  - The title/detail matching code goes away.
- 08 `updateAidItem` is unchanged.

Owners: 03, 06, 08, 00 §8. Tests:
- 06: marking the linked task done sets the item done, and `listTasks` reflects an item marked done through `updateAidItem`.
- 08: `getAidChecklists` shows a parent step done after the parent finishes the family task, and calling `ensureChecklists` twice creates no duplicate tasks.
- 03: a schema assertion for the column and the unique constraint.

### R2I-7 (M) `share_budget`, `share_income_range`, and `review_costs` tasks are never created

Fix:
- 06 F9 `acceptInvite`: when a parent joins, create through `createTask` inside the flow:
  - one `share_budget` task, "Share a yearly budget for college", with `studentId` set to the family's first student member by `joinedAt`.
  - one `share_income_range` task, "Share an income range for scholarship matching", per student member.
- 08 H5 `confirmOffer`: after confirming, for each parent of the student without a `review_costs` task for that student, `createTask({ kind: "review_costs", title: "Review award letters with <student first name>", detail: "" })`. The fallback name is "your student".

Owners: 06, 08. Tests:
- 06: after accept there are two tasks, `setBudget` closes `share_budget`, and `shareIncomeRangeToStudent` closes `share_income_range`.
- 08: the first confirm creates one `review_costs` per parent, and a second confirm adds none.

### R2I-8 (M) The digest toggle is really the global email switch

Fix (16 P16 `NotificationsCard`, copy only):
- The toggle label becomes "Email me (digest, deadline reminders, new matches)".
- The reminders pill reads `off` with "In the app only" when `emailEnabled` is false.
- NO-04 only requires email on/off, so there's no core change.

Owner: 16. Test: rename the switch query in the existing test, and add one that the pill flips to off.

### R2I-9 (M) SMS opt-in is stored but nothing sends a text (NO-05, R3)

Fix: SMS reuses the email pattern. A notification carries an `sms` flag, a `notify.sms` job delivers it outside quiet hours, and the worker sends it through Twilio's REST API with `fetch`. It's used for 1-day deadline reminders only.

Names:
- 03 `notifications.smsSentAt: timestamp("sms_sent_at", { withTimezone: true })`, nullable. 00 §8 gains `· smsSentAt ts?`.
- 02 `jobs.ts`: `JOB_NAMES` adds `"notify.sms"` after `"notify.email"`, with `JobPayloadSchemas["notify.sms"] = z.strictObject({ notificationId: Id })`. 05 queue is `standard`.
- 06 `shared`: `export interface SmsSender { send(m: { to: string; text: string }): Promise<void> }`. This is an interface only; `CoreDeps` is unchanged.
- 06 `notifications.notify` gains `sms?: boolean`. When it's true and the user's prefs have `smsEnabled` and a phone, it also enqueues `notify.sms { notificationId }`.
- 06 `deliverSms(deps, system, notificationId, sms: SmsSender): Promise<void>`:
  1. Return when the row is missing, `smsSentAt` is set, the user isn't active, `smsEnabled` is false, or there's no phone.
  2. During quiet hours, re-enqueue `notify.sms` with `startAfterSeconds = secondsUntilQuietEnd(...)` and return.
  3. Claim the send with `update notifications set smsSentAt = now where id = ? and smsSentAt is null returning`.
  4. Decrypt the phone and send `text = "ScholarCrew: <title> <appUrl><link> Reply STOP to opt out."`, cut to 300 characters.
  5. If `send` throws, reset `smsSentAt` to null and rethrow so pg-boss retries.
- 12 new `src/sms.ts`:
  - `twilioSmsSender(o: { accountSid: string; authToken: string; from: string; fetchImpl?: typeof fetch }): SmsSender` sends `POST https://api.twilio.com/2010-04-01/Accounts/<sid>/Messages.json` with `Authorization: Basic base64(sid:token)`, `Content-Type: application/x-www-form-urlencoded`, body `URLSearchParams({ To, From, Body })`, and `signal: AbortSignal.timeout(10_000)`. Any non-2xx response throws `Error("twilio <status> <code>")`. The phone number never goes in logs.
  - `devOutboxSmsSender(db: Db): SmsSender` inserts `devOutbox { to, subject: "SMS", text }`.
- 12 `WorkerDeps.sms: SmsSender`. `buildWorkerDeps` reads `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` (00 §4). All three set gives Twilio, all three empty gives the dev outbox, and anything else throws `"TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM must all be set or all be empty"`.
- 12 new `handlers/notify-sms.ts` `handleNotifySms(deps, data)` calls `deliverSms(deps.core, SYSTEM, notificationId, deps.sms)`. It's registered in `HANDLERS`.
- 12 `reminders-deadlines.ts` passes `sms: r.offset === 1 && !renewal` to `notify`.
- 16 `NotificationsCard` adds the line "Texts wait until your quiet hours end." under the SMS toggle.
- 18 privacy page adds "If you turn on text reminders, we send your phone number and the reminder to Twilio to deliver it."

Owners: 02, 03, 05 (count), 06, 12, 16, 18, 00 §8/§9.3/§9.4/§12.

Tests:
- 06 `deliverSms`:
  - each skip path
  - quiet hours re-enqueue with `startAfterSeconds`
  - a successful send sets `smsSentAt` and the text has no sensitive fields
  - a failing sender resets `smsSentAt` and rethrows
  - `notify({ sms: true })` enqueues only when opted in
- 12 `sms.test.ts`:
  - a fake `fetch` sees the URL, the Basic header, and the form body
  - a 400 throws
  - the dev outbox sender writes one row
  - `buildWorkerDeps` handles the full, empty, and partial env cases
- 12 reminders: a 1-day reminder for an opted-in student enqueues one `notify.sms`, a 3-day reminder enqueues none, and a renewal reminder enqueues none.

### R2I-10 (L) The `scout_only` visibility reaches no reader

Fix: give the visibility labels meaning for profile keys, and offer "Scout only" only where something honors it.
- 12 L5 port `snapshot`: for each `PROFILE_FACT_KEYS` key whose current confirmed fact has a visibility the audience can't use, blank the matching `snapshot.profile` field (`''`, `null`, or `[]`). Crew can use `crew` and `crew_family`; family can use `crew_family` only. The matcher keeps reading `profiles`, which R2I-1 keeps in sync. So `scout_only` means "matching only", and `private` hides the value from the crew.
- 16 P18 `FactsCard` offers the "Scout only" option only for facts whose key is in `PROFILE_FACT_KEYS`, with the hint "Used for scholarship matching only".

Owners: 12, 16 (and 02 `PROFILE_FACT_KEYS` from R2I-1). Tests:
- 12: a `scout_only` county is blank in the crew snapshot, and a `crew` GPA is blank in a family snapshot but present for crew.
- 16: the option appears only for profile keys.

### R2I-11 (L) The `sensitive` share category has no effect, and missing rows are handled two ways

Fix:
- (a) `sensitive` now gates parent-visible sensitive match reasons on the board, the matches list, and the detail page. It never applies in chat. In 07 `getBoard`, `listMatches` (user actor branch), and `getScholarship` (`application.matchReasons`), a non-owner user viewer keeps `sensitive` reasons only when `getShareGrants(studentId, viewer)` includes `"sensitive"`. The `audience: "family"` path used by the crew port always strips them (SC-02).
- 16 copy: the `ShareToggles` label becomes "Sensitive match reasons (scholarship board only, never in chat)". The Memory screen line "never shown to family" becomes "never shown to family unless you share sensitive match reasons".
- (b) 06 `getShareGrants` applies `DEFAULT_SHARED[c]` for a category with no row in the shared family, the same as `readShareSettings`.

Owners: 07, 06, 16. Tests:
- 07: a parent sees a sensitive reason only with `sensitive` on.
- 06: a family with no `shareSettings` rows grants the five defaults.

### R2I-12 (L) `decisions.sourceMessageId` is never written

Fix:
- 06 `recordDecision(deps, actor, i: DecisionInput, sourceMessageId?: string | null)` stores the id.
- 08 H10's `record_decision` case passes `messageId`.

Owners: 06, 08, 00 §9.4. Tests:
- 06: the stored id is returned.
- 08: applying the card sets `sourceMessageId`.

### R2I-14 (L) Leaving or removal leaves the budget and tasks behind; deleting a student leaves live invites

Fix (06 F9):
- `removeMember` and `leaveFamily` also delete, in that family, `familyBudgets` where `sharedById` is the departing user and `familyTasks` where `assigneeId` is the departing user.
- When the departing user is a student, they also delete that student's `familyTasks` (`studentId`).
- `leaveFamily` deletes the family when no `student` member is left.
- The `deleteAccount` invite cleanup is part of R2I-4.

Owner: 06. Tests: one each for remove, leave, and the last student leaving.

### R2I-15 (L) No `family` notification is ever written

Fix (06):
- `acceptInvite` notifies the inviter: `{ kind: "family", title: "<first name or 'Your family member'> joined your family", body: "", link: "/family", dedupeKey: "family-joined:<inviteId>" }`.
- `createTask` notifies the assignee, but only when it actually inserts a task: `{ kind: "family", title: "New family task: <title>", body: "", link: "/family", dedupeKey: "family-task:<taskId>" }`.
- Neither sends email.

Owner: 06. Tests: one each for the two notifications, and no notification when an `aidItemId` task already exists.

### R2I-16 (L) The digest ignores quiet hours and isn't retried

Fix:
- 12 L11 `digest-weekly.ts` also selects `quietStartHour` and `quietEndHour`.
- It computes `effectiveHour`. That's `quietEndHour` when `digestHour` falls inside the quiet window, otherwise `digestHour`.
- On `digestDay`, it handles a student when `local.hour >= effectiveHour` and `secondsUntilQuietEnd(now, tz, qs, qe) === 0`.
- It skips the student when the `digest:<id>:<weekStart>` notification already exists, checking before it builds the digest.
- When `email.send` throws, it calls the new 06 `retractNotification(deps, system, id): Promise<void>`, which deletes the row, so the next hourly run that day retries.

Owners: 12, 06, 00 §9.4. Tests:
- 12: digest hour 22 with quiet hours 21–7 sends at 07:00. A send failure followed by the next hour sends once.
- 06: `retractNotification` is system only.

### R2I-17 (L) The purge can run past 7 days, and under-13 rows are kept

Fix (06):
- `PURGE_AFTER_DAYS = 6`. With the daily 03:30 run, every account is purged within 7 days.
- The age-gate branch of `completeOnboarding` also sets `deletedAt = now`.
- `purgeDeletedAccounts` deletes users where `status in ('deleted', 'blocked_underage')` and `deletedAt < now - 6 days`.
- 18's privacy page adds "If you're under 13, we delete the account and everything in it within 7 days."

Owners: 06, 18. Tests:
- 06: an account deleted 6 days and 1 minute ago is purged, and one deleted 5 days ago isn't. A blocked under-13 account is purged on the same schedule.

### R2I-18 (L) The export leaves out files and nothing says when it's ready

Fix (06 F18 `buildExport`):
- The Markdown gets a "Files you uploaded" section listing each document's `filename`, `kind`, and `sizeBytes`, plus "Download these from Settings → Documents." File bytes aren't embedded (§3).
- On success, `notify(..., { kind: "system", title: "Your export is ready", body: "It's ready to download for 24 hours.", link: "/settings#data", dedupeKey: "export:<exportId>", email: true })`.

Owner: 06. Test: the export Markdown lists an uploaded transcript, and exactly one notification exists after two `buildExport` calls.

### R2I-19 (L) `subscriptions.familyId` is never read, and `?billing=` is ignored

Fix:
- 03 removes `subscriptions.familyId`, and 00 §8 drops `· familyId uuid?` from `subscriptions`.
- 06 removes the writes in `checkoutCompleted` and `redeemSponsorCode`. `planFor` keeps resolving coverage through `familyMembers`.
- 16 P17: the settings page reads `searchParams.billing`.
  - New client `src/components/settings/BillingReturnNotice.tsx` `BillingReturnNotice({ status }: { status: "success" | "cancel" })`.
  - On success it shows "Payment received. Your plan updates in a minute." and polls `GET /billing` every 3 s, up to 5 times, calling `router.refresh()` when `plan !== "free"`.
  - On cancel it shows "Checkout canceled."

Owners: 03, 06, 16, 00 §8. Tests:
- 03: the schema has no `family_id` on `subscriptions`.
- 06: the existing checkout/sponsor tests drop their `familyId` expectations.
- 16: both notice states, and the poll stops once the plan changes.

### R2I-20 (L) The extension token mask doesn't match the secret

Fix (16 P17 `ExtensionTokens`): show `sct_••••` with no suffix, and update the test fixture and expectations. Owner: 16.

### R2P-1 (M) Aid rules and aid deadlines are read but never written

Fix: dev data comes from a seed that's clearly marked as sample data. Production data comes from a small admin editor. There's no CSV import and no research job.

Names:
- 03 C7 `seed/catalog.ts` (or a new `seed/aid.ts` called from `seedDev`). Every row below carries the code comment `// SAMPLE DATA for development: not verified rates or deadlines for these award years.`
  - `aidRules` for `"2026-27"` and `"2027-28"`: `key: "federal_loan_rates"`, `value: { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 }` (the published 2025-26 rates, reused as samples), `sourceUrl: "https://studentaid.gov/understand-aid/types/loans/interest-rates"`, `verifiedAt` = seed clock.
  - `aidDeadlines` for both award years: federal FAFSA (`state: null`, `program: "FAFSA"`, deadline June 30 of the award year's second calendar year) and Texas (`state: "TX"`, `program: "TEXAS Grant priority"`, deadline Jan 15 of the award year's first calendar year). Each has `note: "Sample data for development. Check the source before relying on it."` and `sourceUrl` set to `https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines`.
- 02 `money.ts`:
  ```ts
  export const FederalLoanRates = z.strictObject({ subsidized: z.number().min(0).max(30), unsubsidized: z.number().min(0).max(30), parent_plus: z.number().min(0).max(30) });
  export const AidRuleKey = z.enum(["federal_loan_rates"]);
  export const AidRule = z.strictObject({ id: Id, awardYear: AwardYear, key: AidRuleKey, value: FederalLoanRates, sourceUrl: z.string(), verifiedAt: IsoDateTime });
  export const AidRuleInput = z.strictObject({ awardYear: AwardYear, key: AidRuleKey, value: FederalLoanRates, sourceUrl: z.url().max(2000) });
  export const AidDeadlineInput = z.strictObject({ id: Id.optional(), awardYear: AwardYear, state: USState.nullable(), program: z.string().trim().min(1).max(80),
    deadline: IsoDate.nullable(), note: z.string().max(300).default(""), sourceUrl: z.url().max(2000) });
  ```
  Each has a matching `export type`.
- 08 `admin` module (all `assertAdmin`; each write is audited as `aid_rule_upserted`, `aid_deadline_upserted`, or `aid_deadline_deleted`):
  - `listAidRules(deps, actor, f: { awardYear?: string }): Promise<AidRule[]>`. Rows whose `value` fails `FederalLoanRates` are skipped.
  - `upsertAidRule(deps, actor, i: AidRuleInput): Promise<AidRule>` upserts on `(awardYear, key)` with `verifiedAt = now`.
  - `listAidDeadlinesForAdmin(deps, actor, f: { awardYear?: string }): Promise<AidDeadline[]>`.
  - `upsertAidDeadline(deps, actor, i: AidDeadlineInput): Promise<AidDeadline>` inserts when `id` is missing and updates otherwise, with `verifiedAt = now`. An unknown `id` is `not_found`.
  - `deleteAidDeadline(deps, actor, id): Promise<void>`.
- 14 routes (all `admin`):
  - `GET /admin/aid-rules?awardYear=` → `AidRule[]`
  - `PUT /admin/aid-rules` with `AidRuleInput` → `AidRule`
  - `GET /admin/aid-deadlines?awardYear=` → `AidDeadline[]`
  - `PUT /admin/aid-deadlines` with `AidDeadlineInput` → `AidDeadline`
  - `DELETE /admin/aid-deadlines/:id` → 204
  - Files: `admin/aid-rules/route.ts`, `admin/aid-deadlines/route.ts`, `admin/aid-deadlines/[id]/route.ts`.
- 18 page `(admin)/admin/aid/page.tsx` plus `components/admin/AidRulesEditor.tsx`:
  - The award year defaults to `currentAwardYear(now)`.
  - It has a loan-rate form (three percentages and a source URL) and a deadlines table with add, edit, and delete (state or "Federal", program, date, note, source URL).
  - Admin `NAV` adds `{ key: "aid", label: "Aid rules", href: "/admin/aid", icon: "doc" }`. 00 §11's admin row adds `/admin/aid`.
- `docs/architecture/catalog.md` (owned by P-E): replace "they come only from the dev seed" with "Dev uses sample rows from the seed; admins maintain real values at /admin/aid".

Owners: 02, 03, 08, 14, 18, docs, 00 §9.4/§10/§11/§12.

Tests:
- 03 seed: the seed writes two `aidRules` rows and four `aidDeadlines` rows, and every deadline note starts with "Sample data". 03 can't import core, so the `loanEstimates` check stays in 08.
- 08: upsert-then-list for rules and deadlines, a non-admin gets `forbidden`, and `loanEstimates` uses a rule written through `upsertAidRule`.
- 14: one route test for each method.
- 18: the editor saves a rate and adds and deletes a deadline.

### R2P-3 (M) A listing saved from search never gets match reasons or a fit score

Fix:
- 07 G3 `scholarships/matching.ts` adds an internal `matchListingFor(deps: CoreDeps, studentId: string, listing: ScholarshipRow): Promise<{ reasons: MatchReason[]; fitScore: number }>`. It uses `buildMatcherProfile`, `evaluateEligibility`, and `scoreMatch` with the same inputs as `evaluateForStudent`. An ineligible listing returns `{ reasons: [], fitScore: 0 }`.
- `saveScholarship` writes `matchReasons` and `fitScore` on insert. On conflict, it sets them only when the existing `jsonb_array_length(matchReasons) = 0`.
- `runSweep` also updates `matchReasons` and `fitScore` on the student's existing open applications (`matched`, `planned`, `drafting`) whose listing is in the eligible match set.
- 17 Q8: for a saved card with no reasons, the empty-state copy becomes "You don't match any listed rule yet."

Owners: 07, 17. Tests:
- 07: a listing saved from search has its county reason, and a sweep refreshes an application saved before the profile changed.
- 17: the empty-state copy.

### R2P-4 (M) Retired and flagged listings stay on the board, in deadlines, and in pending money

Fix:
- 07 G2 `search.ts` exports `liveListingWhere(ownerId: string | AnyPgColumn): SQL`. It means `noScamFlags` and either (`visibility = 'public'` and `status in ('published','stale')`) or (`visibility = 'submitter_only'` and `submittedById = ownerId` and `status in ('draft','published','stale')`). It's also exported from `@scholarcrew/core/scholarships`.
- 07 G5 `getBoard`: an open-stage card (`matched`, `planned`, `drafting`) whose listing fails the check goes to `board.flagged`, not the columns, and is left out of `totals`.
  - The reason is `SCAM_FLAG_TEXT[flag]`, `RETIRED_TEXT = "This listing was retired"`, or `UNDER_REVIEW_TEXT = "This listing is under review"` (for `flagged` or a public `draft`).
  - `flagged` is deduplicated by scholarship id against the sweep list.
  - `submitted`, `won`, and `lost` history doesn't change.
- 07 G15 `getRequirementProgress`, and 08 `collectDeadlines` (H7), `findDueReminders` (H8), and `loadContext` `pendingUsd` (H4): add `liveListingWhere(scholarshipApplications.ownerId)` to their open-application queries.

Owners: 07, 08, 00 §9.4. Tests:
- 07: a retired listing in `planned` lands in `flagged` and isn't in `inPlayUsd`.
- 08: a retired listing produces no deadline or reminder, and the pending total drops.

### R2P-5 (M) The value-per-hour ranking (SC-05) never reaches the board

Fix (07 G5 `getBoard`):
- For every `matched` card, compute `scoreMatch({ amountMaxUsd, estMinutes: app.estMinutes, reasonsCount: reasons.length, unknownsCount: 0, daysUntilDeadline, reusableStories })`.
- Order `board.matched` with `rankMatches` over `{ fitScore: app.fitScore, valuePerHour, daysUntilDeadline }`.
- The other columns keep deadline order.
- There's no `BoardCard` field (§3).

Owners: 07, 17 (test only). Tests:
- 07: two matched cards where deadline order and value order disagree come back in value order.
- 17: `boardColumns` keeps the core's matched order.

### R2P-6 (M) A calculator estimate outranks a confirmed award letter

Fix (08 H4 `summariesFor`): the source order is a confirmed unarchived offer, then `calculator`, then Scorecard. Update the comment.

Owner: 08. Test: with a calculator row and a confirmed offer, the source is `offer` and `isEstimate` is false. Archiving the offer falls back to `calculator`.

### R2P-7 (L) One confirmed offer gets two different "after free money" numbers

Fix (08 H5 `compareMyOffers`):
- Skip offers where `offer.costOfAttendanceUsd ?? college.costOfAttendanceUsd` is null, and add the assumption `"<College>: the letter doesn't list a cost of attendance, so it isn't compared."`
- Always add `"Outside scholarships you've won aren't counted here. Your Costs page includes them."`

Owner: 08. Test: an offer with no known cost is left out of `lowestFourYearOfferId`, and both assumption lines are present.

### R2P-8 (M) Award letters accept images and text, but the parser reads only PDFs, and a failed letter is a dead end

Fix:
- 17 Q23 `UploadLetter`: the award-letter flow accepts and checks only `application/pdf` (`accept="application/pdf"`), with the copy "Upload the award letter as a PDF".
- 12 L8 texts:
  - `NOT_PDF_TEXT = "Only PDF award letters can be read. Upload the letter as a PDF, or compare it by hand in the offer tool."`
  - `PARSE_FAILED_TEXT = "We couldn't read that letter. Upload a clearer PDF, or compare it by hand in the offer tool."`
  - `NO_LETTER_TEXT = "That file doesn't look like an award letter. Upload the letter as a PDF, or compare it by hand in the offer tool."`
- 08 H5 `deleteOffer(deps, actor, id): Promise<void>`: owner only. A `confirmed` offer is `conflict("Confirmed offers stay. Start a new season to archive them.")`. Lines cascade, and the document stays.
- 14 `DELETE /offers/:id` → 204.
- 17 Q23: a "Remove" button on failed and `needs_review` letters.

Owners: 17, 12, 08, 14, 00 §9.4/§10. Tests:
- 17: a PNG is refused with no fetch, and Remove calls DELETE then refreshes.
- 12: the texts.
- 08: deleting a failed offer works, a confirmed one is a conflict, and another student's is `not_found`.
- 14: the route test.

### R2P-9 (M) "Appeal outline ready" and "retake analysis ready" link to pages that don't show the result

Fix (08 H2):
- `READY_NOTICE[kind].link` becomes `(refId: string | null, conversationId: string | null) => string`.
- `appeal_outline` and `retake_analysis` link to `/crew/<conversationId>`, falling back to the old link when it's null.
- `essay_review`, `offer_parse`, and `weekly_plan` don't change.
- `completeJob` passes the conversation id it used or created.

Owner: 08. Test: update the jobs link assertions for the two kinds.

### R2P-10 (M) An expired supervisor link leaves the log stuck at "Waiting"

Fix:
- 02 `ServiceLog` adds `verificationExpiresAt: IsoDateTime.nullable()`, after `verification`.
- 07 G14 `toServiceLog` maps it.
- 17 Q29 `ServiceLogs`: when `verification === "requested"` and the expiry has passed, show the badge "Link expired" and allow "Ask to confirm". `canAsk` includes that case.
- openapi `ServiceLog` gains the field (P-F).

Owners: 02, 07, 17, openapi. Tests:
- 02: parse with null and with a timestamp.
- 07: the mapper sets it after `requestVerification`.
- 17: the expired state shows the button.

### R2P-11 (M) Recommendation status never moves past "requested"

Fix:
- 02 `colleges.ts` `RecRequestPatch = z.strictObject({ status: z.enum(["confirmed", "submitted", "declined"]) })`.
- 07 G9 `updateRecRequest(deps, actor, id, p: RecRequestPatch): Promise<RecRequest>` is owner only and sets `updatedAt`.
- 14 `PATCH /recommendations/:id` (new file `recommendations/[id]/route.ts`) → `RecRequest`.
- 17 Q19 `Recommenders`: a status select on each past request ("Asked", "Agreed to write", "Submitted", "Declined"; "Asked" is shown and can't be selected). It PATCHes, then refreshes.

Owners: 02, 07, 14, 17, 00 §9.4/§10, openapi. Tests: one each in 07 (owner only, sets status), 14 (route), and 17 (the select sends the PATCH).

### R2P-13 (L) The calculator form offers only colleges that already have an estimate

Fix (17 Q21 `/money`): build the `CalculatorForm` colleges from `getCollegeList(deps, actor, studentId)` (current season): `entries.map((e) => ({ id: e.collegeId, name: e.name }))`.

Owner: 17. Test: a listed college with no estimate is offered.

### R2P-14 (L) `Essay.status` is shown but never written

Fix:
- 02 `essays.ts` `EssayPatch = z.strictObject({ title: <EssayInput.title schema>.optional(), prompt: <EssayInput.prompt schema>.optional(), status: EssayStatus.optional() })`, refined so that at least one key is set.
- 07 G10 `updateEssay(deps, actor, id, p: EssayPatch): Promise<Essay>` is owner only, sets `updatedAt`, and returns `latestWordCount`.
- 14 `PATCH /essays/:id` (existing `essays/[id]/route.ts`) → `Essay`.
- 17 Q11/Q14: the studio gets a status select (Drafting, Ready, Submitted) for students.

Owners: 02, 07, 14, 17, 00 §9.4/§10, openapi. Tests: one each in 02 (an empty patch is rejected), 07, 14, and 17.

### R2P-15 (L) `CollegeListEntry.gapUsd` is always null from core

Fix (12 L5 port `collegeList`): when `allows(ownerId, "costs")`, fill `gapUsd` from `getCosts(core, SYSTEM, ownerId)` by `collegeId`; otherwise leave it null. 07 is unchanged (07 can't import 08), and 17 keeps `withGaps`.

Owner: 12. Test: the crew port fills the gap, and a family port with `costs` off leaves it null.

### R2P-16 (L) The parsed award year is dropped

Fix:
- 08 H5 `saveParsedOffer` input gains `awardYear?: AwardYear`. It's stored only when it matches `AwardYear` and is within one year of `currentAwardYear(now)`; otherwise it's ignored.
- 12 L8 passes `parsed.awardYear` when it differs from the offer's.

Owners: 08, 12, 00 §9.4. Tests:
- 08: a valid year is stored and `"1999-00"` is ignored.
- 12: a different year is passed through.

### R2P-17 (L) `applicationItems.essayId` has no writer in the UI

Fix (17 Q19 `ChecklistItems`): `supplement` items with no `essayId` get "Start essay" (students only). It posts `POST /essays { title: item.label, prompt: item.label, targetType: "college", targetCollegeId }`, then `PATCH /application-items/:id { essayId }`, then `router.push("/essays/<id>")`. The new prop is `collegeId: string`.

Owner: 17. Test: the two calls in order, then the push.

### R2P-18 (L) openapi lags two round 1 changes

Fix (P-F, `docs/api/openapi.yaml`):
- `Essay.latestWordCount: { type: [integer, "null"], minimum: 0 }` (required).
- An `excludeScams` boolean query parameter on `GET /scholarships`.
- Also everything new in this plan: `ServiceLog.verificationExpiresAt`, `RecRequestPatch`, `EssayPatch`, `AidRule`, `AidRuleInput`, `AidDeadlineInput`, `FederalLoanRates`, and the new paths and methods.

Owner: P-F. Check: every `$ref` resolves, no `operationId` repeats, and the path count is 125.

### R2P-19 (L) The public API returns scam-flagged listings by slug

Fix (07 G2 `getScholarship`): add `noScamFlags` when `actor.kind === "public"`.

Owner: 07. Test: a flagged listing is `not_found` for public and visible, with its flag, for a student.

### R2P-20 (L) Aid checklists follow different share rules in the API and the family crew

Fix:
- 12 L5 port: `aidChecklist` uses `allows(ownerId, "deadlines")`, matching 08.
- Update the port test and the doc comment.
- 00 §9.5's port comment becomes "never returns test scores; aid checklists follow `deadlines`".

Owners: 12, 00 §9.5. Test: a family port with `deadlines` on returns the checklist, and with it off returns `[]`.

### R2P-21 (L) The Sunday sweep in signup week can't notify

Fix (07 G4 `runSweep`): the dedupe key becomes `sweep:<studentId>:<todayIn(now, timeZone)>`.

Owner: 07. Test: an onboarding sweep on Wednesday and a Sunday sweep in the same week each notify. Update the existing `2026-10-05` key expectation to the sweep day.

---

## 2. Work packages by owner cluster

Each cluster edits only its own plans and the 00 sections listed. Section owners: §8 and §9.1–§9.3 belong to P-A. §9.4 belongs to P-B, P-C, and P-D, each for its own module lines. §9.5 and §9.6 belong to P-E. §10 belongs to P-F. §9.8 and §9.9 belong to P-G. §11 and §12 belong to P-I.

### P-A: 02, 03, 04, 05 (domain, db, engines, jobs)

Findings: R2C-1, R2C-4, R2C-5, R2I-1, R2I-6, R2I-9, R2I-19, R2P-1, R2P-10, R2P-11, R2P-14.

02:
- `crew.ts`: add `CrewSpeaker` and `CrewRequester`. `CrewRequestInput.requester` is required, and `history[]` gets `speaker` (R2C-1).
- `jobs.ts`:
  - `JOB_NAMES` adds `"plan.weekly.fanout"` after `"plan.weekly"` and `"notify.sms"` after `"notify.email"`, for 20 names.
  - Payloads: `"plan.weekly"` gets `source?: "user" | "system"`, `"plan.weekly.fanout"` is `empty`, and `"notify.sms"` is `{ notificationId: Id }` (R2C-5, R2I-9).
- `memory.ts`: `PROFILE_FACT_KEYS` and `ProfileFactKey` (R2I-1).
- `money.ts`: `FederalLoanRates`, `AidRuleKey`, `AidRule`, `AidRuleInput`, and `AidDeadlineInput`, with their types (R2P-1).
- `ServiceLog` (impact file) adds `verificationExpiresAt: IsoDateTime.nullable()` after `verification` (R2P-10).
- `colleges.ts`: `RecRequestPatch` (R2P-11). `essays.ts`: `EssayPatch` with an at-least-one-key refine (R2P-14).
- Tests: a parent requester parse, both job payload shapes and the 20-name sync, `PROFILE_FACT_KEYS` length 8, `AidRuleInput` rejects a rate of 31, `ServiceLog` with null and with a date, `RecRequestPatch` rejects `"requested"`, `EssayPatch` rejects `{}`. The index test lists the new exports.

03:
- `planItems.generated` bool not null, default false (R2C-4).
- `familyTasks.aidItemId` uuid, nullable, fk `aidChecklistItems` cascade, plus unique `(aidItemId, assigneeId)` named `family_tasks_aid_item_assignee_uq` (R2I-6).
- `notifications.smsSentAt` ts, nullable (R2I-9).
- Remove `subscriptions.familyId` (R2I-19).
- Seed: the sample `aidRules` and `aidDeadlines` rows with the `SAMPLE DATA` comment and notes (R2P-1).
- Tests: schema and migrate assertions for each column change, and the seed row counts and notes.
- 00 §8:
  - `planItems` adds `· generated bool = false`.
  - `familyTasks` adds `· aidItemId uuid? fk(aidChecklistItems) cascade`, and its index line adds `Unique (aidItemId, assigneeId)`.
  - `notifications` adds `· smsSentAt ts?`.
  - `subscriptions` drops `· familyId uuid?`.

04: no changes. R2P-5 uses the existing `scoreMatch` and `rankMatches`.

05:
- `SCHEDULES` adds `plan.weekly.fanout` with `0 11 * * 1` UTC. Both new queues are `standard`.
- Update every count of `JOB_NAMES` and queues in tests and prose to 20.
- 00 §9.3: the `JOB_NAMES` literal and the `SCHEDULES` line.

### P-B: 06 (identity core)

Findings: R2C-2/R2I-13, R2C-8, R2C-15, R2I-1, R2I-2, R2I-3, R2I-4, R2I-5, R2I-6, R2I-7, R2I-9, R2I-11(b), R2I-12, R2I-14, R2I-15, R2I-16, R2I-17, R2I-18, R2I-19.

F-memory:
- `writeConfirmedFact`, `updateFact`, and `confirmCandidate` supersede live candidates for the key. `createCandidate` dedupes on owner, key, and value (R2C-2, R2C-15).
- `syncProfileColumn` is called from `createFact`, `updateFact`, `confirmCandidate`, and `forgetFact`, importing `PROFILE_FACT_KEYS` from domain (R2I-1).
- `recordDecision(deps, actor, i, sourceMessageId?: string | null)` (R2I-12).

F-access: `getShareGrants` falls back to `DEFAULT_SHARED` for missing rows (R2I-11b).

F5: `createAccount` creates a `parent` when a pending parent invite exists for the email (R2I-2).

F9 family core:
- `invite` and `previewInvite` use a role-aware name fallback (R2I-3).
- `acceptInvite` creates the `share_budget` and `share_income_range` tasks (R2I-7) and the `family-joined:<inviteId>` notification (R2I-15).
- `removeMember` and `leaveFamily` clean up the budget and tasks, and the family is deleted when no student is left (R2I-14).

F10 family index:
- `createTask` gains `aidItemId?`, inserts with conflict-do-nothing when it's set, and sends the `family-task:<taskId>` notification on insert (R2I-6, R2I-15).
- `listTasks` reads the item's status and adds the college name only for viewers who may read colleges (R2I-5, R2I-6).
- `updateTask` writes to the linked aid item (R2I-6).

F-billing:
- `assertCrewAllowance` adds the in-flight count: queued or working, not `offer_parse`, created within the last hour (R2C-8).
- Drop the `subscriptions.familyId` writes from `checkoutCompleted` and `redeemSponsorCode` (R2I-19).

F-shared: export `interface SmsSender` (R2I-9).

F16 notifications:
- `notify` gains `sms?: boolean`, which enqueues `notify.sms` when the user is opted in.
- New `deliverSms(deps, system, notificationId, sms)` (R2I-9).
- New `retractNotification(deps, system, id)` (R2I-16).

F18 `buildExport`: the "Files you uploaded" Markdown section and the `export:<exportId>` notification (R2I-18).

F19:
- `deleteAccount` removes family-room messages, the crew replies and jobs they produced, tasks, and open invites, and applies the no-student family rule (R2I-4, R2I-14).
- `PURGE_AFTER_DAYS = 6`, and blocked under-13 accounts are purged by `deletedAt`, which the age gate sets (R2I-17).

Tests: as listed in each decision.

00 §9.4, 06 lines:
- shared: `SmsSender`.
- notifications: `notify` `sms?`, `deliverSms`, `retractNotification`.
- memory: the profile-column sync note and the `recordDecision` 4th argument.
- family: `createTask` `aidItemId?`, and notes on aid-linked task status and college-name redaction.
- billing: `assertCrewAllowance` counts in-flight jobs.
- account: purge within 7 days, including blocked under-13 accounts.

### P-C: 07 (records core)

Findings: R2C-12/R2P-12, R2I-11(a), R2P-3, R2P-4, R2P-5, R2P-10, R2P-11, R2P-14, R2P-19, R2P-21.

- G2 `search.ts`: export `liveListingWhere(ownerId)`, also exported from the scholarships index (R2P-4). `getScholarship` adds `noScamFlags` for public actors (R2P-19). Sensitive reasons on `application.matchReasons` follow R2I-11a.
- G3 `matching.ts`: `matchListingFor`, used by `saveScholarship` (R2P-3). `listMatches` keeps sensitive reasons for a parent viewer only when they're granted `sensitive` (R2I-11a).
- G4 `runSweep`: refresh reasons and fit score on open applications (R2P-3). The dedupe key becomes `sweep:<studentId>:<todayIn(now, tz)>` (R2P-21).
- G5 `getBoard`: live-listing split into `flagged`, with `RETIRED_TEXT` and `UNDER_REVIEW_TEXT` and totals excluded (R2P-4). The matched column is ordered by `rankMatches` (R2P-5). Sensitive reasons follow R2I-11a. `saveScholarship` writes reasons (R2P-3).
- G6 `submitLocalScholarship`: insert a `planned` application in the same transaction (R2C-12).
- G9: `updateRecRequest` (R2P-11). G10: `updateEssay` (R2P-14). G14: `toServiceLog` maps `verificationExpiresAt` (R2P-10). G15 `getRequirementProgress` uses `liveListingWhere` (R2P-4).
- Tests: as listed in each decision.

00 §9.4, 07 lines:
- scholarships: `liveListingWhere(ownerId): SQL`, plus notes on `saveScholarship` writing reasons, `submitLocalScholarship` adding a planned application, `getScholarship` hiding scam-flagged listings from public, the sweep key, and the board split and ranking.
- colleges: `updateRecRequest(deps, actor, id, p: RecRequestPatch): Promise<RecRequest>`.
- essays: `updateEssay(deps, actor, id, p: EssayPatch): Promise<Essay>`.

### P-D: 08 (planning core)

Findings: R2C-2 (test), R2C-3, R2C-4, R2C-5, R2C-7, R2C-9, R2C-11, R2C-14, R2I-5, R2I-6, R2I-7, R2I-12, R2P-1, R2P-4, R2P-6, R2P-7, R2P-8, R2P-9, R2P-16.

- H2 jobs:
  - `listJobs` includes the actor's family-room requests (R2C-11).
  - `completeJob` reuses a room by title (R2C-14) and the `READY_NOTICE` link takes `conversationId`, so appeal and retake link to `/crew/<id>` (R2P-9).
- H3 plan:
  - `replaceGeneratedPlan` uses `generated` (R2C-4).
  - New `startWeeklyPlan(deps, system, ownerId): Promise<CrewJob | null>` (R2C-5).
- H4 costs: `summariesFor` order is offer, then calculator, then Scorecard (R2P-6). `loadContext` `pendingUsd` uses `liveListingWhere` (R2P-4).
- H5 money:
  - `compareMyOffers` skips offers with unknown cost and adds the assumption lines (R2P-7).
  - New `deleteOffer` (R2P-8).
  - `saveParsedOffer` takes `awardYear?` (R2P-16).
  - `confirmOffer` creates `review_costs` tasks (R2I-7).
- H6/H7 aid: `ensureChecklists` creates aid-linked tasks with plain step titles (R2I-5, R2I-6). `collectDeadlines` uses `liveListingWhere` (R2P-4).
- H8 notify: `findDueReminders` uses `liveListingWhere` (R2P-4).
- H10 actions:
  - The claim-first receipt (R2C-3).
  - Refuse fact and decision cards in temporary rooms (R2C-9).
  - `record_decision` passes `messageId` (R2I-12).
  - Add the candidate-cleared assertion (R2C-2).
- H11 `resolveCatalogTask`: a rejected `recheck_changed` task republishes a stale listing (R2C-7).
- H12 admin: `listAidRules`, `upsertAidRule`, `listAidDeadlinesForAdmin`, `upsertAidDeadline`, and `deleteAidDeadline` (R2P-1).
- Tests: as listed in each decision.

00 §9.4, 08 lines:
- money: `deleteOffer(deps, actor, id): Promise<void>`, `saveParsedOffer` `awardYear?`, and the cost source order note.
- plan: `startWeeklyPlan`, and the note that `replaceGeneratedPlan` replaces only generated todo items.
- crew: notes on `listJobs` including the actor's family-room requests, `applyActionCard` being claim-first and refusing in temporary rooms, and `completeJob` reusing rooms and its links.
- admin: the five aid functions, and the note on `resolveCatalogTask` restoring stale listings.

### P-E: 09, 10, 11, 12 (agents, catalog, worker)

Findings: R2C-1, R2C-5, R2C-9, R2C-10, R2C-13, R2C-15, R2I-9, R2I-10, R2I-16, R2P-1 (doc), R2P-8, R2P-15, R2P-16, R2P-20.

09:
- `buildContextBlocks(..., requester)` with Student, Parent, and Crew labels and the parent prefix (R2C-1). `runCrewRequest` passes `requester`.
- `COMPASS_SYSTEM`:
  - "Talk to the person who asked"
  - the family-room line (R2C-1)
  - the `roomRef` line (R2C-10)
  - the temporary-room line (R2C-9)
- `session.finish` strips `confirm_fact` and `record_decision` in temporary rooms (R2C-9).
- Fixtures add `requester` and `speaker`.

10: the Scout and Atlas lookup-first line (R2C-10). Any `CrewRequestInput` fixtures add `requester` and `speaker`.

11:
- `parseScorecardCsvWithErrors` returns `lines: number[]` (R2C-13).
- `docs/architecture/catalog.md` aid-data sentence (R2P-1).
- 00 §9.6: `parseScorecardCsvWithErrors(text): { rows; lines: number[]; errors }`.

12:
- L4 `deps.ts`: `WorkerDeps.sms`, the `TWILIO_*` handling, and new `src/sms.ts` with `twilioSmsSender` and `devOutboxSmsSender` (R2I-9).
- L5 port:
  - mask `snapshot.profile` by fact visibility (R2I-10)
  - `collegeList` fills `gapUsd` (R2P-15)
  - `aidChecklist` follows `deadlines` (R2P-20)
- L6: `JobOutcome.afterComplete` (R2C-15).
- L7: `loadCrewInput` sets `requester` and `speaker`, and `FAMILY_MEMBER_PREFIX` is removed (R2C-1). `fileCandidates` runs in `afterComplete` (R2C-15).
- L8: the three new texts (R2P-8), and the `awardYear` pass-through (R2P-16).
- L9: `plan-weekly.ts` takes `crewRequest` from `source`. New `plan-weekly-fanout.ts` (R2C-5).
- L11:
  - reminders pass `sms` for 1-day non-renewal reminders (R2I-9)
  - new `notify-sms.ts` (R2I-9)
  - the digest's quiet hours, catch-up, and retract (R2I-16)
- L14: `HANDLERS` adds `plan.weekly.fanout` and `notify.sms`, typed `Record<JobName, Handler>` over 20 names.
- Tests: as listed in each decision. `app.test.ts` schedule expectations include the new cron.

00 §9.5:
- The port comment becomes "a family-bound port returns empty for every read whose share category is off, never returns test scores, and aid checklists follow `deadlines`".
- Add `CrewRequestInput.requester` to the wiring prose.

### P-F: 13, 14, openapi.yaml, 00 §10

Findings: R2I-2 (13), R2C-12 (test), R2C-13, R2P-1, R2P-8, R2P-10 (openapi), R2P-11, R2P-14, R2P-18.

- 13 M7 verify: `next = me.onboardingComplete ? "/week" : "/onboarding"`, with a new test for a parent invitee (R2I-2).
- 14:
  - New `recommendations/[id]/route.ts` with PATCH using `RecRequestPatch` (R2P-11).
  - `essays/[id]/route.ts` adds PATCH using `EssayPatch` (R2P-14).
  - `offers/[id]/route.ts` adds DELETE → 204 (R2P-8).
  - New `admin/aid-rules/route.ts` (GET, PUT), `admin/aid-deadlines/route.ts` (GET, PUT), and `admin/aid-deadlines/[id]/route.ts` (DELETE) (R2P-1).
  - N12 remaps import errors through `parsed.lines` (R2C-13).
  - The N14 test asserts one application row (R2C-12).
  - The route inventory goes from 77 to 81 files. Recount the tests.
- openapi:
  - R2P-18 items.
  - `ServiceLog.verificationExpiresAt`.
  - Schemas `RecRequestPatch`, `EssayPatch`, `FederalLoanRates`, `AidRule`, `AidRuleInput`, `AidDeadlineInput`.
  - Paths `PATCH /recommendations/{id}`, `PATCH /essays/{id}`, `DELETE /offers/{id}`, `/admin/aid-rules` (GET, PUT), `/admin/aid-deadlines` (GET, PUT), `DELETE /admin/aid-deadlines/{id}`.
  - Paths go from 121 to 125.
- 00 §10:
  - The verify row text (R2I-2).
  - The essays row adds `PATCH /essays/:id` (`EssayPatch` → `Essay`).
  - A new row `PATCH /recommendations/:id | user | colleges.updateRecRequest | RecRequestPatch | RecRequest | 14`.
  - The offers row adds `DELETE /offers/:id` (204, `money.deleteOffer`).
  - A new row `GET /admin/aid-rules?awardYear · PUT /admin/aid-rules · GET /admin/aid-deadlines?awardYear · PUT /admin/aid-deadlines · DELETE /admin/aid-deadlines/:id | admin | admin.listAidRules · upsertAidRule · listAidDeadlinesForAdmin · upsertAidDeadline · deleteAidDeadline | AidRuleInput · AidDeadlineInput | AidRule[] · AidRule · AidDeadline[] · AidDeadline · 204 | 14`.
  - The save-page row notes "also puts it on the board (planned)".

### P-G: 15, 16

Findings: R2C-1 (test), R2C-5, R2I-3, R2I-8, R2I-9 (copy), R2I-10, R2I-11 (copy), R2I-19, R2I-20.

15: no changes.

16:
- P9/P10 `/week`: new `src/components/week/PlanWeekButton.tsx`, for students only (R2C-5).
- P12: a parent-bubble label test (R2C-1).
- P16:
  - `AccountCard` is editable for parents, and the line-33 deviation is removed (R2I-3).
  - `NotificationsCard` relabels the email toggle and makes the reminders pill depend on email (R2I-8).
  - Add the SMS quiet-hours line (R2I-9).
- P17:
  - new `BillingReturnNotice` and the settings page reads `searchParams.billing` (R2I-19)
  - `ExtensionTokens` shows `sct_••••` (R2I-20)
- P18 `FactsCard`: "Scout only" only for `PROFILE_FACT_KEYS`, with its hint (R2I-10). The Memory copy changes for sensitive (R2I-11).
- P19 `ShareToggles`: the `sensitive` label from R2I-11.
- Tests: as listed in each decision.

00 §9.8 and §9.9: no contract change. `PlanWeekButton` and `BillingReturnNotice` are page components and aren't listed. Update the §5 tree only if 16 adds a directory, which it doesn't.

### P-H: 17

Findings: R2C-12/R2P-12, R2P-3 (copy), R2P-5 (test), R2P-8, R2P-10, R2P-11, R2P-13, R2P-14, R2P-17.

- Q5 `AddLocalModal`: one request (R2C-12).
- Q8 detail: the empty-state copy for a saved card (R2P-3).
- Q3: a `boardColumns` test that the matched order is preserved (R2P-5).
- Q23 `UploadLetter`: PDF only, plus Remove on failed and `needs_review` letters (R2P-8).
- Q29 `ServiceLogs`: the "Link expired" state and `canAsk` (R2P-10).
- Q19 `Recommenders`: the status select (R2P-11). `ChecklistItems` gets Start essay for supplements and the `collegeId` prop (R2P-17).
- Q21 `/money`: the calculator picker comes from `getCollegeList` (R2P-13).
- Q11/Q14 studio: the essay status select (R2P-14).
- Fixtures: `ServiceLog` adds `verificationExpiresAt: null`.
- Tests: as listed in each decision.

### P-I: 18, 19, 20, 00 §11, 00 §12

Findings: R2C-6, R2C-7, R2C-12 (20), R2I-9 (privacy), R2I-17 (privacy), R2P-1 (admin page).

18:
- R14: `draftOf` and `reportOf` for `user_submission`, and Publish only without a draft (R2C-6). The recheck buttons are "Keep current listing" and "Retire listing" (R2C-7).
- New `(admin)/admin/aid/page.tsx` and `components/admin/AidRulesEditor.tsx`, plus the NAV `aid` item and the active-key test (R2P-1).
- The privacy page adds the Twilio sentence (R2I-9) and the under-13 deletion sentence (R2I-17).

19: fixture-only. Every `CrewRequestInput` built in evals adds `requester { role: "student", firstName }` and `speaker`, and every `ServiceLog` fixture adds `verificationExpiresAt`. No new tests are required.

20: the save success text is "Saved. It's on your board as unverified.", with a router or popup test update (R2C-12).

00 §11: the admin row adds `/admin/aid`.

00 §12:
- ON/WK: add 05 (`plan.weekly.fanout` schedule), 12 (fan-out handler), and 16 (Plan my week).
- CR-08: add 10 and 12.
- MO (MO-09) and AID (AID-03): add 03 (sample seed), 14 (admin aid routes), and 18 (`/admin/aid`).
- FA: add 08 (aid-linked family tasks, `review_costs`).
- NO: add 03 (`smsSentAt`) and 12 (`notify.sms`, Twilio) for NO-05.
- The E-15-3 and E-16-8 follow-ups from the review log, if they're still open: add 15 to SE-02..SE-07, 16 to HL-01/HL-04, and 16 to EX-01.

---

## 3. Declined or deferred

Every finding gets a fix. Only these parts or alternatives aren't taken:

| Item | Status | Reason |
|---|---|---|
| R2I-2, second half (flip the role in `acceptInvite` for onboarded students with no college list, essays, or applications) | Declined | Onboarding writes starter `collegeList` rows, so the test would rarely pass. An account that finished student onboarding before any invite is a student-shaped account. The `createAccount` fix covers the real path (invite email first). |
| R2I-18, embedding file bytes in the export | Deferred | The export is one blob, and adding up to 10 MB per file is out of proportion. The Markdown lists each file and points to Settings → Documents. |
| R2P-5, `BoardCard.valuePerHour` and a "≈ $X/hour" label | Deferred | Ordering is enough for SC-05. A new required field would touch every `BoardCard` fixture in 16, 17, and 19. |
| R2P-15, dropping `CollegeListEntry.gapUsd` | Not chosen | Filling it in the 12 port is one change. Dropping it touches 02, openapi, 09, and 17 fixtures. |
| R2I-13, matching candidates through `card:<messageId>:<cardId>` | Not chosen | Superseding by key in `writeConfirmedFact` covers card, form, and edit paths with one rule (R2C-2). |
| R2I-10, "Scout only" for non-profile keys | Not offered | No reader exists for them. The option shows only for the eight profile keys, where the matcher honors it. |
| R2I-11, removing the `sensitive` toggle | Not chosen | FA-02 lists it, so it now gates parent-visible sensitive match reasons instead. |
| R2I-8, a separate `digestEnabled` switch | Not chosen | NO-04 asks only for email on or off, so the fix is copy. |
| R2C-7, the two-call 18-only fix as the primary path | Replaced | Core restores `stale` to `published` on reject, which is atomic. 18 keeps a Retire button. |
| R2C-14, "document only" | Not chosen | Reusing the room by title is one query and stops room sprawl from the weekly fan-out. |
| R2P-1, a research job or CSV import for aid rules and deadlines | Deferred | A dozen rows a year are maintained by hand at `/admin/aid`. Dev uses marked sample data. |
| R2P-8, deleting confirmed offers | Declined | Confirmed offers stay for comparisons and archive with the season (ME-07). |
| R2C-8, excluding system weekly plans from the in-flight count | Not done | `crewJobs` has no source column. The one-hour, Monday-morning overlap is accepted. |
