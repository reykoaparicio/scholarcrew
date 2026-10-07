# Review round 2, identity, account and family (plans 13, 06, 12 jobs, 16, 18)

Focus: data flow end to end (21 §3, round 2). Every §10 row owned by plan 13 is traced route handler (13) → core service (06, 07/08 where called) → tables and columns (03, 00 §8) → domain object (02) → the page or component that renders it (16, 18). The six identity jobs are traced enqueue → worker handler (12) → core → email/notification → UI. Names and imports were round 1's job and aren't repeated. Everything already in `plans/review-log.md` is treated as known.

Severity: high = breaks the build or a contract; medium = wrong behavior; low = unclear.

Inputs: 00 (§8, §9, §10, §11), review-log, `docs/api/openapi.yaml`, `docs/product/features.md`, plans 02, 03, 06, 07, 08, 12, 13, 16, 18 (by grep plus targeted reads).

---

## Findings

### R2I-1 (medium): profile values edited or forgotten in Memory never reach `profiles`, so the matcher, crew, and autofill keep the old values

- Plans and tasks: 06 F6 (`facts.ts` `createFact`, `updateFact`, `forgetFact`), 06 F13 (`profile/index.ts` `writeProfileFacts`), 07 G2/G4 (`buildMatcherProfile`), 12 L5 (`port.ts` `getProfile`), 06 F13 `getAutofillProfile`, 16 P16 (`AccountCard`), 16 P18 (`FactsCard`).
- Trace: onboarding writes `profiles.county = "Maple"` and a `county` fact (06 F13 `writeProfileFacts`, one direction only). On `/memory` the student edits the county fact → `PATCH /facts/:id` (13 M9) → `updateFact` inserts a new `memoryFacts` row and supersedes the old one. `profiles.county` is untouched. `buildMatcherProfile` (07, `select().from(profiles)`) still matches on Maple, the crew port reads `getProfile` (12 L5 line ~1553) and still sees Maple, and `getAutofillProfile` still proposes it. `DELETE /facts/:id` (Forget) behaves the same, so ME-02 ("the crew stops seeing it immediately") fails for the eight profile keys. There's no other way to change these fields after onboarding: the only `PATCH /profile` caller in 16/17/18 is `AccountCard`, which sends `displayName` and `timeZone` only. The next `PATCH /profile` would also re-create a forgotten fact from the stale column.
- Fix (06): in `facts.ts`, add `PROFILE_FACT_KEYS` (`class_year`, `high_school`, `state`, `county`, `city`, `gpa_unweighted`, `intended_majors`, `interests`) and a `syncProfileColumn(tx, ownerId, key, value | null)` that validates the value with the matching `ProfilePatch` field and updates `profiles` (`gpa_unweighted` → `gpaUnweightedX100`). Call it in the same transaction from `createFact`, `updateFact`, `confirmCandidate`, and `forgetFact` (forget clears to `''`, `null`, or `[]`). An invalid value for a profile key (for example `state: "Texas"`) is `invalid_input`. Add one test per path. 16 needs no change; `FactsCard` already round-trips the value types.

### R2I-2 (medium): a new parent who signs in from an invite is created as a `student` and can end up a "student" for good

- Plans and tasks: 06 F5 (`createAccount`), 06 F9 (`acceptInvite`), 13 M7 (`auth/verify`), 16 P7 (`(app)` layout onboarding redirect), 16 P15 (`/onboarding`), 18 R7/R8 (`FAMILY_JOIN_NOTE`, `/family/join`). Related to D15 (accepted), but this consequence isn't covered by it.
- Trace: the invite email links to `/family/join?token=` (06 F9). Signed out, 18 sends the parent to `/sign-in`. `verifyMagicLink` → `createAccount` always inserts `role: "student"`, `isNew` is true, so 13's verify redirects to `/onboarding`. 16's `(app)` layout forces unfinished students into the student wizard. If the parent completes it (the wizard asks for a high school, class year, and so on, but nothing stops them), `profiles.onboardingCompletedAt` is set and `plan.weekly` and `sweep.student` are queued for them. When they later reopen the invite, `acceptInvite` flips the role only when `me.role === "student" && !profile?.onboardingCompletedAt`, so `users.role` stays `student` while `familyMembers.memberRole` is `parent`. From then on 16's nav, `requireAppActor` checks, `AccountCard`, `FamilyPage` (`myRole` comes from `users.role`), and `redeemSponsorCode`/`createHelperLink` (both `assertRole(... "student")`) all treat the parent as a student, while `getShareGrants` treats them as a parent.
- Fix (06): in `createAccount`, look up an unaccepted, unexpired `familyInvites` row for the email with `memberRole = "parent"` and insert the user with `role: "parent"` when one exists. Then `getMe` gives `onboardingComplete: true` and verify sends them to `/week`, where 18's `FAMILY_JOIN_NOTE` already tells them to reopen the invite. In `acceptInvite`, also flip the role when the account has no `collegeList`, `essays`, or `scholarshipApplications` rows, even if onboarding was completed. Add a test to 06 F5 and one to F9.

### R2I-3 (medium): parents can never set a display name or time zone, but many layers read both

- Plans and tasks: 16 P16 (`AccountCard editable={isStudent}`), 16 note at line 33, 06 F13 `updateProfile`, 06 F9 `invite` and `previewInvite`, 16 P19 `FamilyTasks`, 12 L7 (D42 requester `firstName`), 06 F16 `deliverEmail` (quiet hours use `users.timeZone`).
- Trace: a parent account is created with `displayName = ''` and `timeZone = 'America/Chicago'` (00 §8 defaults). Onboarding (the only other writer) is students-only. Settings makes the card read-only for parents. 16's note says this is because "`updateProfile` reads the caller's `profiles` row, which parents may not have", but 06's `profileRow` inserts the row when it's missing, so the route works for parents. Readers that get a blank value: `invite` sends "Your student invited you…" when a parent invites another parent (`me.displayName || "Your student"`), `previewInvite` returns `inviterFirstName: "Your student"`, `FamilyTasks` renders an empty name tag (`t.assigneeName.split(" ")[0] || t.assigneeName`), and the D42 requester `firstName` in a family room is `""`. A parent outside Central time gets every email's quiet-hours window in Chicago time.
- Fix (16): make `AccountCard` editable for parents (name and time zone; the PATCH body already sends only those two). Drop the line-33 deviation. Optional (06): in `invite`, fall back to `"Your family member"` when the inviter is a parent.

### R2I-4 (medium): deleting a parent's account leaves their family-room messages and tasks behind

- Plans and tasks: 06 F19 (`deleteAccount`), 08 H9 (family rooms are owned by the student; `sendMessage` stores `authorUserId: actor.userId`), 16 P17 (`DataCard` copy), features ID-05.
- Trace: `deleteAccount` deletes `conversations` the user owns with a `familyId`. That covers a student, but the family room is owned by the student (08 H9), so for a parent nothing is removed. Their `messages` rows (`authorUserId` has no FK, 00 §8) and the crew replies to them stay in the room after the purge. `familyTasks` assigned to them also stay in `listTasks` for 7 days (the `innerJoin(users)` still matches until purge). ID-05 says "Shared family objects created by the user are removed from the family room", and 16's `DataCard` tells the user "Things you shared in the family room are removed too."
- Fix (06): in the `deleteAccount` transaction, for every family the user belongs to, delete `messages` where `authorUserId = userId` in that family's rooms, plus the crew reply each one produced (`crewJobs.requestMessageId` → `resultMessageId`), and delete `familyTasks` where `assigneeId = userId`. Extend the first delete test with a parent who posted in the student's family room.

### R2I-5 (medium): `GET /family/tasks` shows parents the student's college names with no `colleges` share check

- Plans and tasks: 08 H7 (`aid.ts` `ensureChecklists`), 06 F10 (`listTasks`), 13 M10 (`family/tasks/route.ts`), 16 P19/P20 (`FamilyTasks`).
- Trace: `ensureChecklists` creates a CSS task for each parent per CSS college with `title: \`${s.title} (${c.name})\``, and the colleges come from the student's current `collegeList`. `listTasks` returns every task in the caller's family (just `membershipOf`) with no `canRead(..., "colleges")`, and `FamilyTasks` renders `t.title`. With `colleges` turned off (FA-02), a parent still sees which CSS schools are on the list. The same goes for `dueOn` (the college's `aidPriorityDate`).
- Fix (08): when `colleges` isn't shared with that parent (`getShareGrants`), create the CSS task without the college name (`"CSS Profile: <step>"`, `detail: "CSS Profile <awardYear>"`). Or (06) `listTasks` redacts `title` to the step name for parent viewers without `colleges`. Pick one and test it with `colleges` off.

### R2I-6 (medium): finishing a FAFSA/CSS family task doesn't update the matching aid checklist item, or the reverse

- Plans and tasks: 08 H7 (`ensureChecklists`, `updateAidItem`), 06 F10 (`updateTask`), 16 P19 (`FamilyTasks`), 17 (`AidChecklists`).
- Trace: for each parent step, `ensureChecklists` writes an `aidChecklistItems` row (`assignee: "parent"`) and a separate `familyTasks` row (`kind: fafsa_contributor`/`css_contributor`), matched later only by `title` + `detail`. A parent who clicks "Mark done" on `/family` → `PATCH /family/tasks/:id` → `updateTask` changes only `familyTasks`. The student's `/money` aid checklist still shows the step as todo. Marking the aid item done (`PATCH /aid/items/:id`, which 08 lets the parent do) leaves the family task open. AID-01 says "Parent steps appear as family tasks", which is one step shown in two places, not two independent records.
- Fix (03, 06, 08): add `familyTasks.aidItemId uuid?` (fk `aidChecklistItems`, cascade) in 03 and 00 §8. 08 `ensureChecklists` sets it. 06 `updateTask` also updates the linked item's `status`/`completedAt`, and 08 `updateAidItem` updates linked tasks. Test both directions.

### R2I-7 (medium): `share_budget`, `share_income_range`, and `review_costs` family tasks are completed but never created (FA-05)

- Plans and tasks: 06 F10 (`setBudget` closes `share_budget`), 06 F8 (`shareIncomeRangeToStudent` closes `share_income_range`), 06 F10 (`createTask`, system only), 08 H7 (the only `createTask` caller, which creates only `fafsa_contributor`/`css_contributor`), 02 B3 (`FamilyTaskKind`), 16 P19 (`FamilyTasks` doc comment: "budget input, and shared reviews").
- Trace: grepping 06/07/08/12 for `createTask` finds only 08's aid checklist. No code inserts the other three kinds, so the "mark done" updates in `setBudget` and `shareIncomeRangeToStudent` never match a row, and FA-05's "budget input, and shared reviews appear as tasks assigned to a person" isn't met.
- Fix (06): in `acceptInvite`, after a parent joins, create one `share_budget` task ("Share a yearly budget for college") and one `share_income_range` task ("Share an income range for scholarship matching") for that parent, with `studentId` set to the family's student. Either add a `review_costs` task when the student's first offer is confirmed (08 `confirmOffer`, one per parent, deduped by kind + studentId) or drop `review_costs` from 02/03. Add tests that the existing completion paths now close a real task.

### R2I-8 (medium): the "Weekly digest email" toggle is the global email switch, so turning it off silently stops reminder emails

- Plans and tasks: 16 P16 (`NotificationsCard`), 06 F16 (`notify`, `deliverEmail`), 08 H8 (`buildWeeklyDigest`), 12 L11 (`reminders.deadlines`, `digest.weekly`).
- Trace: the card binds `emailEnabled` to a toggle labeled "Weekly digest email" (detail "Skipped when there's nothing new") and shows "Deadline reminders · 7, 3, and 1 day before" as a fixed `on` pill. In core, `emailEnabled` gates every email: `notify` doesn't queue `notify.email` when it's off, `deliverEmail` returns early, and `buildWeeklyDigest` returns null. A student who turns off "the digest" also loses every deadline, renewal, and new-match email, while the card still says reminders are on.
- Fix (16): relabel the toggle "Email me (digest, deadline reminders, new matches)" and show the reminders pill as `off` ("In the app only") when `emailEnabled` is false. NO-04 only asks for "email on or off", so no core change is needed. If a digest-only switch is wanted instead, 03/00 §8 add `digestEnabled bool = true`, 02 adds it to `NotificationPrefs`/`NotificationPrefsPatch`, and 08 `buildWeeklyDigest` checks it in place of `emailEnabled`.

### R2I-9 (medium): SMS opt-in is stored but nothing ever sends a text (NO-05)

- Plans and tasks: 06 F16 (`updatePrefs` encrypts `phone*`, stores `smsEnabled`), 16 P16 (`NotificationsCard` "Text me 1-day reminders"), 12 L11 (`reminders.deadlines`), 00 §2/§4 (Twilio via `fetch`, `TWILIO_*` env for "worker SMS (R3)"), 00 §12 (NO-01..NO-05 → 06, 08, 12, 16).
- Trace: `phoneCiphertext`/`phoneIv`/`phoneTag` and `smsEnabled` are written and never read by any sender. 12's `buildWorkerDeps` reads no `TWILIO_*` variable, `reminders.deadlines` only calls `notify(..., email: true)`, and no `SmsSender` exists in 06 `shared`. The UI lets a student turn on texts that never arrive.
- Fix (06 + 12): add `SmsSender` (`twilioSmsSender(sid, token, from)` over `fetch`, plus a `devOutboxSmsSender` that writes `devOutbox` with `subject: "SMS"`) to `CoreDeps`, and `deliverSms(deps, system, notificationId)` (decrypt phone, quiet hours, `smsEnabled`). 12: `reminders.deadlines` calls it for `offset === 1` reminders, and `buildWorkerDeps` reads `TWILIO_*`. If R3 SMS is out of scope for this build, 16 must hide the phone field and toggle instead, and NO-05 should be marked deferred in 00 §12.

### R2I-10 (low): `scout_only` fact visibility is offered and stored, but Scout never reads facts

- Plans and tasks: 02 B2 (`FactVisibility`), 06 F6 (`crewVisibleFacts` reads `crew`/`crew_family` only), 07 G4 (`buildMatcherProfile` reads `profiles` + sensitive facts, no `memoryFacts`), 12 L5 (port excludes `scout_only`), 16 P18 (`VISIBILITY_OPTIONS` includes "Scout only").
- Trace: a fact set to "Scout only" on `/memory` reaches no reader. ME-01 says the label tells "who can use it", so "Scout only" in practice means "nobody".
- Fix (07): `buildMatcherProfile` reads confirmed, current `scout_only` + `crew` + `crew_family` facts for matcher-relevant keys (or pass them as `MatcherProfile.facts` for `custom` rules). Or (16) drop "Scout only" from `VISIBILITY_OPTIONS` until something reads it.

### R2I-11 (low): share settings: the `sensitive` category is never read, and display and enforcement disagree on missing rows

- Plans and tasks: 06 F4 (`getShareGrants`), 06 F10 (`readShareSettings`), 16 P5 (`sharedCategoriesOf`), 16 P19 (`ShareToggles` "Sensitive matching facts").
- Trace: (a) no `canRead`/`assertCanRead`/port `allows` call in 07/08/12 passes `"sensitive"`, so the toggle changes nothing (and 16's own Memory copy says sensitive facts are "never shown to family"). (b) `readShareSettings` fills a missing row from `DEFAULT_SHARED`, but `getShareGrants` treats a missing row as off. Wherever rows are missing (seed or `factories.family` data, or a category added later), 16's parent nav (built from `getShareSettings`) shows links that the pages then 404.
- Fix (06): `getShareGrants` applies the same `DEFAULT_SHARED` fallback for categories with no row. (16) Remove `sensitive` from `ShareToggles` (keep the enum), or define what it gates in 07 (for example, sensitive-based match reasons in parent views).

### R2I-12 (low): `decisions.sourceMessageId` is returned but never written

- Plans and tasks: 06 F7 (`recordDecision` inserts no `sourceMessageId`), 08 H10 (`applyActionCard` `record_decision` has `messageId` in hand), 02 `Decision.sourceMessageId`.
- Trace: the only writers are `POST /decisions` and the `record_decision` card. Both go through `recordDecision`, whose `DecisionInput` has no source, so the column is always null and ME-04's "Compass records decisions… in chat" leaves no link to the chat.
- Fix (06): add an internal `recordDecisionFrom(deps, actor, i, sourceMessageId)` (or an optional 4th arg). 08's `record_decision` case passes `messageId`. 16 `DecisionsCard` may link to `/crew/<conversationId>` later; no change is needed now.

### R2I-13 (low): applying a `confirm_fact` card leaves the same guess waiting in "Waiting for your OK"

- Plans and tasks: 12 L7 (`fileCandidates` → `createCandidate` per `confirm_fact` card, D19), 08 H10 (`confirm_fact` → `createFact`), 16 P18 (`CandidatesCard`).
- Trace: the reply carries the card, and 12 also files a candidate for it. When the student clicks the card in chat, 08 writes a confirmed fact, but the candidate stays live for 30 days, so `/memory` asks again about a fact that's already remembered.
- Fix (12 + 08): 12 sets the candidate's `sourceRef` to `card:<resultMessageId>:<cardId>`. 08's `confirm_fact` case calls `confirmCandidate` on the matching live candidate when one exists (else `createFact`).

### R2I-14 (low): leaving or being removed doesn't clear the parent's shared budget or tasks; a student's deletion leaves live invites

- Plans and tasks: 06 F9 (`removeMember`, `leaveFamily`), 06 F19 (`deleteAccount`), 08 money (budget used in the gap, MO-10).
- Trace: `removeMember`/`leaveFamily` delete only `familyMembers` (and, for a student, `shareSettings`). `familyBudgets.sharedById` keeps pointing at the departed parent, so Ledger keeps subtracting their budget, and their `familyTasks` still list under the student's family. When a student deletes their account and parents remain, the family survives with no student, and invites the student sent stay acceptable until they expire.
- Fix (06): in both functions, delete `familyBudgets` where `sharedById` is the leaving user and `familyTasks` where `assigneeId` is the leaving user. In `deleteAccount`, also delete unaccepted `familyInvites` where `invitedById = userId`. Test each.

### R2I-15 (low): no `family` notification is ever written

- Plans and tasks: 00 §8 `notification_kind` (`family`), 06 F9/F10, 08 H7.
- Trace: `notify` callers write `new_matches` (07), `job_ready` (08), `deadline` (12), and `digest` (12). Nothing writes `family`. A parent assigned a FAFSA step, a student whose invite was accepted, and a parent who was removed get no bell entry (NO-01). Not required by an acceptance criterion, but the enum value has no writer.
- Fix (06/08): `acceptInvite` notifies the inviter ("<name> joined your family"). `createTask` notifies the assignee (`dedupeKey: family-task:<taskId>`, link `/family`). Or drop `family` from the enum.

### R2I-16 (low): the weekly digest ignores quiet hours and is never retried after a send failure

- Plans and tasks: 12 L11 (`digest-weekly.ts`), 06 F16 (`deliverEmail` is the only quiet-hours check).
- Trace: the handler inserts the `digest` notification first (the dedupe guard) and then calls `deps.core.email.send` directly. A digest hour inside quiet hours (for example 22:00 with quiet 21–7, both settable in 16) is sent anyway. If `send` throws, the error is logged, but the notification already exists and the hour has passed, so that week's digest is lost.
- Fix (12): skip users whose digest hour falls in their quiet window (or have 16 refuse that combination), and on a send failure delete the just-inserted notification so the next run (or a retry) can send it.

### R2I-17 (low): the account purge can run past 7 days, and under-13 accounts are never purged

- Plans and tasks: 06 F19 (`purgeDeletedAccounts`: `deletedAt < now - 7d`), 05 `SCHEDULES` (`account.purge` daily at 03:30 UTC), 06 F13 (age gate sets `blocked_underage`), features ID-03/ID-05.
- Trace: an account deleted at 04:00 UTC on day 0 is first older than 7 days at the day-8 run, about 7 days 23.5 hours later. ID-05 says "within 7 days". `blocked_underage` rows (email, birth year, display name of a child under 13) are kept forever; only `deleted` is purged.
- Fix (06): purge at `deletedAt < now - 6 days` (or run `account.purge` hourly in 05). For under-13 accounts, decide: either purge after 7 days and keep only `sha256(email)` in a block list, or document in 18's privacy page why the row is kept.

### R2I-18 (low): the export leaves out uploaded files and nothing says when it's ready

- Plans and tasks: 06 F18 (`collect` exports `documents` metadata only; `buildExport` doesn't notify), 16 P17 (`DataCard` "Check again").
- Trace: ME-08 is "everything the student owns". Transcript and resume bytes aren't in the file, and `blobId` is stripped as a secret field. When the export is ready, no notification is written, so the student has to come back to Settings and click "Check again".
- Fix (06): either include each document base64-encoded under `data.documentFiles` (capped by `MAX_UPLOAD_BYTES` each), or have the Markdown list each file with "download it from Settings". In `buildExport`, `notify(..., kind: "system", title: "Your export is ready", link: "/settings#data", dedupeKey: \`export:${exportId}\`, email: true)`.

### R2I-19 (low): billing: `subscriptions.familyId` is written but never read, and `/settings?billing=` isn't handled

- Plans and tasks: 06 F12 (`checkoutCompleted` and `redeemSponsorCode` set `familyId`), 06 F11 (`planFor` resolves coverage through `familyMembers` instead), 16 P17 (settings page reads no `searchParams`).
- Trace: (a) nothing reads `subscriptions.familyId`, and it goes stale as soon as the payer changes families. (b) Stripe returns to `/settings?billing=success|cancel`. The page ignores the query, and the webhook often lands after the redirect, so the student sees "Free" right after paying.
- Fix: (06) drop the writes, or use the column in `planFor`. (16) Read `searchParams.billing` and show "Payment received. Your plan updates in a minute." or "Checkout canceled.", then poll `GET /billing` a few times on success.

### R2I-20 (low): the extension token mask doesn't match the real secret

- Plans and tasks: 16 P17 (`ExtensionTokens` renders `sc_ext_••••${t.id.slice(-4)}`), 06 F15 (secret is `sct_` + base64url, unrelated to the id).
- Trace: the masked string uses another prefix and the row id, so a student can't match what's in the extension to a row.
- Fix (16): show `sct_••••` with no suffix, or (06) store and return `secretHint` (the last 4 characters) on `ApiToken`.

---

## Per-route and per-job summary

Routes are plan 13's rows in 00 §10. Each trace goes route → 06 (07/08 where called) → tables → domain → 16/18 page.

| Route or job | Result |
|---|---|
| POST /auth/magic-link | OK (email lowercased in 06; dev outbox stores lowercase; 18 `SignInForm` body `{ email }`) |
| GET /auth/verify | R2I-2 (new parent created as `student`); `?error=link` handled by 18 `signInNotice` |
| POST /auth/sign-out | OK |
| GET /me | OK (`MeResponse.user.timeZone` feeds 16; see R2I-3 for parents) |
| GET /dev/outbox/latest | OK |
| GET /profile · PATCH /profile | R2I-1 (no profile edit path after onboarding), R2I-3 (parents blocked in 16) |
| POST /onboarding | OK (`buildInput` matches `OnboardingInput`; `plan.weekly { jobId, ownerId }` and `sweep.student { studentId }` match 02 and 12) |
| GET /facts · POST /facts | R2I-1, R2I-10 |
| PATCH /facts/:id · DELETE /facts/:id | R2I-1 |
| POST /facts/:id/confirm · /reject | R2I-13 |
| GET /decisions · POST /decisions · DELETE /decisions/:id | R2I-12 |
| GET /sensitive-facts · PUT /sensitive-facts | OK |
| POST /sensitive-facts/share-income | R2I-7 (closes a task kind nothing creates) |
| GET /family | OK |
| POST /family/invites | R2I-3 (inviter name for parents) |
| POST /family/invites/accept | R2I-2, R2I-7 |
| GET /family/invites/preview | OK (18 `InvitePreview` reads `{ inviterFirstName, memberRole, expiresAt }`) |
| DELETE /family/members/:userId · POST /family/leave | R2I-14 |
| GET /family/share-settings · PUT /family/share-settings | R2I-11 |
| GET /family/budget · PUT /family/budget | R2I-7, R2I-14 |
| GET /family/tasks · PATCH /family/tasks/:id | R2I-5 (share check), R2I-6 (aid sync) |
| GET /helper-links · POST · DELETE /helper-links/:id | OK (`HelperLinkInput` body matches; URL only in the create response; revoke audited) |
| GET /notifications · POST /notifications/:id/read | OK |
| GET /notification-prefs · PATCH /notification-prefs | R2I-8, R2I-9 |
| GET /billing · POST /billing/checkout · POST /billing/portal | R2I-19 |
| POST /billing/webhook | R2I-19 (`familyId` write) |
| POST /billing/sponsor-code | OK |
| GET /documents · POST /documents · GET/DELETE /documents/:id · GET /documents/:id/download | OK (`parseStatus` written by 08 offers; 16 `DocumentsCard` link matches the download route) |
| POST /account/export · GET /account/exports/latest · GET /account/exports/:id | R2I-18 |
| DELETE /account | R2I-4, R2I-14 |
| POST /extension/tokens · GET · DELETE /extension/tokens/:id | R2I-20 |
| job `notify.email` | OK (enqueued by `notify`/`deliverEmail` with `{ notificationId }`; 12 L11 → `deliverEmail`; emailedAt guard; bell reads `GET /notifications`) |
| job `digest.weekly` | R2I-8, R2I-16 (schedule `5 * * * *` UTC; weekday 0 = Sunday matches `digestDay`) |
| job `reminders.deadlines` | OK for email (offsets 7/3/1 and renewal 30 with `/scholarships/<slug>`); R2I-9 for the 1-day SMS |
| job `account.export` | R2I-18 (enqueued by `requestExport` `{ exportId }`; `buildExport` idempotent on `queued`; 16 `DataCard` link matches `downloadUrl`) |
| job `account.purge` | R2I-17 |
| job `maintenance.purge` | OK (magic links > 1 day, temporary chats, expired exports plus blobs, expired sessions) |

Enqueue and handler pairing for the six jobs: every one has exactly one handler in 12's `HANDLERS` and a producer (`notify`/`deliverEmail`, `requestExport`, or a 05 `SCHEDULES` entry). No orphans.

## Counts

- High: 0
- Medium: 9 (R2I-1 to R2I-9)
- Low: 11 (R2I-10 to R2I-20)
- Fully OK: 14 of 37 (12 of 31 route rows, 2 of 6 jobs)
