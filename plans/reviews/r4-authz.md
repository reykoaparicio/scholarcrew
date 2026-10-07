# Round 4 review: authorization and privacy

Reviewer slice: authorization and privacy across core services (06, 07, 08), the routes that call them (13, 14), and the privacy paths they feed (09, 10, 11, 12 for sensitive facts and worker ownership).
Known issues in `plans/review-log.md` are not repeated.

Severity: high = data exposure or broken contract; medium = wrong behavior or weaker protection; low = unclear.

Counts: 20 findings (6 high: R4Z-1 to R4Z-6; 6 medium: R4Z-7 to R4Z-12; 8 low: R4Z-13 to R4Z-20).

## Findings

### R4Z-1 (high): the sensitive-key guard misses half the sensitive kinds, so the crew can file and read them as plain memory facts

- Plans and tasks: 06 F6 (`SENSITIVE_KEY_PREFIXES`, `isSensitiveKey`, `parseFactInput`, `createFact`, `createCandidate`), 12 L7 (`fileCandidates`), 12 L5 (`crewVisibleFacts` in the snapshot), 08 H10 (`confirm_fact` card → `createFact`).
- Detail: `isSensitiveKey` is `key.startsWith(prefix)` over `income, heritage, ethnicity, race, religion, disability, citizenship, immigration, gender, sexual`. Four of the eight `SENSITIVE_KINDS` (02) aren't covered: `first_gen`, `military_family`, `foster_care`, `noncitizen_filter`. Prefix matching also lets through `family_income`, `household_income`, `parent_income`, `religious_affiliation`, `is_first_generation`, `health_condition`, `undocumented`, `lgbtq`. The only test (06 F6 "refuses sensitive-looking keys") checks `income_exact`, `religion`, and `citizenship_status`.
- Scenario: a student writes "I'm first gen and my mom's in the Army, what can I apply for?" Compass returns a `confirm_fact` card `{ key: "first_gen", value: true, visibility: "crew" }`. 12 `fileCandidates` calls `createCandidate`, which accepts the key, and the row is stored in plain text as `crew_inferred`. Once the student clicks "Save" (or the card is applied), `crewVisibleFacts` puts `first_gen: Yes` into every later `ContextSnapshot`, so it goes to the model on every request. A model-proposed `crew_family` visibility puts it in the family room too. That breaks product rule 5 and ME-03 ("Sensitive kinds are never inferred").
- Fix (06 F6): build the guard from the domain list instead of a hand-kept prefix list. Export `SENSITIVE_FACT_TERMS` from 02 `memory.ts`: every `SENSITIVE_KINDS` value split on `_`, plus `income, salary, ethnicity, race, citizen, immigration, undocumented, daca, gender, sexual, lgbtq, health, medical, disability, religion, religious, faith, military, foster, first_gen, firstgen`. Then `isSensitiveKey(key)` returns true when any `_`-separated token of the key, or the whole key, matches a term. Run the same check on string values in `createCandidate`, so a model can't write `background: "first-generation, foster care"`. Add one test per `SENSITIVE_KINDS` value and one for `family_income`. 12 L7 needs no change, since the guard is in core.

### R4Z-2 (high): the audit log records sensitive facts in plain text, and admins can read them

- Plans and tasks: 06 F8 (`setSensitiveFact` → `recordAudit`), 06 F19 (`purgeDeletedAccounts`), 08 H12 (`searchAudit`), 14 N11 (`GET /admin/audit`), 18 R15 (`/admin/audit` page).
- Detail: `setSensitiveFact` writes `{ action: "sensitive_fact_updated", entityId: "<userId>:<kind>", meta: { kind, enabled } }`. For the five yes/no kinds (`first_gen`, `disability`, `military_family`, `foster_care`, `noncitizen_filter`), `enabled: true` is the value itself. `searchAudit` returns `meta` and `entityId` to any admin, filtered by `entityType` or `action`. 06's own rule says "An admin gets no automatic access to student data." `purgeDeletedAccounts` deletes users but not their audit rows, and the `entityId` string keeps the user id, so the fact outlives the account (R2I-17 says "nothing is kept").
- Scenario: an admin opens `/admin/audit?action=sensitive_fact_updated` and gets a list of user ids with `disability: enabled true` and `foster_care: enabled true`. That's the most sensitive data in the system, unencrypted, and it never expires.
- Fix (06 F8): audit `sensitive_facts_changed` with `entityType: "user"`, `entityId: userId`, and no `meta` (or `meta: { count: 1 }`). Don't record the kind or the flag. 06 F19: `purgeDeletedAccounts` deletes `auditEvents` where `entityId` is the purged user's id or starts with `<id>:`, or sets `meta` to `{}` for them. Add a test that no audit row contains a sensitive kind name.

### R4Z-3 (high): the income range drives cost estimates, so parents and the model can recover it

- Plans and tasks: 08 H4 (`loadContext` → `readSensitiveForMatcher(COSTS_SYSTEM)`, `summariesFor` → `estimateNetPrice(college, ctx.incomeRange)`, `SOURCE_LABELS.scorecardRange`), 12 L5 (`costs`, `collegeList.gapUsd`), 10 J1 (`get_costs`, `get_college`), product rule 5 vs MO-01.
- Detail: product rule 5 and ME-05 say the income range is "used only by the matcher" and "never sent to a model". 08 reads it for costs, and the result goes to every reader of the `costs` category: parents by default (`DEFAULT_SHARED.costs = true`), the family-room crew, and the student's private crew. `CostSummary` carries `costOfAttendanceUsd`, `freeMoneyUsd` (the Scorecard band value), and `sourceLabel: "College Scorecard estimate for your income range"`. `get_college` (port `college` → 07 `getCollege`) returns the public `netPriceByIncome` table for the same college. The `costEstimates.inputs` rule (08 line 17) keeps the range out of storage but not out of the output.
- Scenario: Ledger calls `get_costs` and gets State U, free money $14,200, labeled "for your income range". It calls `get_college` and sees the `48_75k` band is $14,200. The model now knows the family earns $48k–75k, which it was never supposed to see. A parent the student added (default `costs` on) can do the same thing on `/money` with the public Scorecard site, whether or not the student meant to tell them.
- Fix (08 H4, coordinator call on MO-01): `costsFor(deps, ownerId, o: { useIncomeRange: boolean })`. `getCosts` passes `true` only when `readsAsOwner(actor, studentId)`, or when the range was shared by a parent (`sharedByUserId !== null`, so the family already knows it). The 12 L5 port (`costs`, `collegeList` gap) and 08 `topGap` for non-owners pass `false`, which gives the overall-average basis and `scorecardOverall`. Also, 10 J1 `get_college` drops `netPriceByIncome` from the tool result. Otherwise MO-01 and rule 5 conflict, and features.md needs one of them reworded.

### R4Z-4 (high): matches that only qualify through a sensitive rule reveal the trait to parents, the family room, and the model

- Plans and tasks: 07 G3 (`listMatches`), 07 G5 (`getBoard`), 10 J1 (`get_matches` with `privateReasons`, `get_scholarship`), 12 L5 (`matches`), SC-02, user-flows step 3 ("sensitive facts stay private").
- Detail: core removes only the `sensitive` reasons. The listing itself stays: `listMatches` for the family audience and `getBoard` for a parent without the `sensitive` share return the same matches and cards, just with fewer reasons. For a listing whose rules include `heritage_any`, `religion_any`, `disability`, `foster_care`, `military_family`, `first_gen`, or `income_max`, eligibility proves the student has that trait. The scholarship's name usually says it too ("Catholic Daughters Scholarship", "Foster Youth Award"). 10's `get_matches` adds `privateReasons: n`, and `get_scholarship` returns the full `eligibility` array, so the model sees "eligible", "1 private reason", and `religion_any: ["Catholic"]` together.
- Scenario: a student turns on `religion: ["Muslim"]` for matching and leaves the defaults on (`scholarships` shared). A parent opens `/scholarships?studentId=` and sees "Islamic Relief Scholarship" in Matched. The family-room crew lists it by name ("You match the Islamic Relief award"). The private crew is told the trait outright in violation of rule 5.
- Fix (07 G3/G5): when sensitive reasons are being stripped (the family audience, or a parent without `sensitive`), drop the whole match or card if its stored or evaluated reasons include any `sensitive: true` entry, and return a count (`Board.privateCount` or `hiddenSensitive: n` on the matches response) so the UI can say "N more matches use details you keep private". 10 J1 `get_matches`: for both audiences, drop matches with `privateReasons > 0` and return `privateMatches: n` instead. `get_scholarship` removes sensitive rule types from `eligibility` before the model sees it. Add an isolation test (19 privacy eval) that a sensitive-only match name never appears in a family-audience request.

### R4Z-5 (high): any member can add a "student" member that no one can remove, and that member can read the first student's family room and remove parents

- Plans and tasks: 06 F9 (`invite` with `memberRole`, `acceptInvite`, `removeMember`), 13 M10 (`InviteBody = InviteInput.extend({ memberRole })`), 08 H9 (`accessibleConversation`, `createConversation` family branch), 06 F4 (`getShareGrants`).
- Detail:
  - `invite` lets any member, including a parent, pass `memberRole: "student"`, and 13 exposes that field.
  - `removeMember` only deletes rows with `memberRole = 'parent'`, and only a student member may call it. So a student member can never be removed by anyone, and any student member (including a fake one) can remove every parent.
  - The family room's owner is the first student (`createConversation` picks the oldest `student` member). `accessibleConversation` lets every family member read it and post in it. `sendMessage` then queues a `crew_request` owned by the first student, with the family audience over that student's data.
  - Meanwhile `getShareGrants(A, B)` gives a student member B nothing, because it requires `memberRole = 'parent'`. The family room is a side door around that rule.
- Scenario: a parent invites an adult friend's address as `memberRole: "student"`. The friend signs in, accepts, and is now a student member. They read the family room's history, ask the crew "What's Maya's gap at each school and her next deadlines?", and get answers built from Maya's data, charged to Maya's allowance. Maya can't remove them. The friend can also remove Maya's other parent. A real sibling gets the same read access to Maya's shared data, which getShareGrants never grants to a student.
- Fix (06 F9 and 13 M10): only a student member may invite with `memberRole: "student"`. Drop `memberRole` from `InviteBody` for parents, or have core reject it with `forbidden`. `removeMember` lets the family creator (`families.createdById`), or any student, remove any non-self member of either role. Its `clearDeparted` path is unchanged. 08 H9: for a family room, `accessibleConversation` requires the actor to be the room owner or a `parent` member (not another student). A sibling gets their own family room, keyed by `(familyId, ownerId)`, in `createConversation`. Add tests: a parent's student-role invite gets 403, the creator removes a student member, and a sibling gets 404 on the first student's family room.

### R4Z-6 (high): after the room's student leaves, the family room keeps answering from their data with default sharing

- Plans and tasks: 06 F9 (`leaveFamily`), 08 H9 (`accessibleConversation`, `sendMessage`), 12 L5 (`familyShares(core, studentId)`), FA-07 ("Access ends immediately").
- Detail: `leaveFamily` deletes the leaver's `familyMembers` and `shareSettings` rows. The family survives when another student is still in it, and so does the family room, whose `ownerId` is the leaver. `accessibleConversation` checks only that the actor is in `conversations.familyId`, not that the owner still is. In 12, `familyShares` reads `shareSettings` by `studentId` only (not by family), and with no rows it falls back to `DEFAULT_SHARED`, so deadlines, colleges, costs, scholarships, and activities all read as shared again. 07 `sharesWithFamily` has the same family-blind query.
- Scenario: siblings Maya (first student) and Leo share a family with Dana. Maya leaves the family, which deletes her share rows. Dana and Leo keep the "Family" room. Dana asks "What are Maya's costs now?" `sendMessage` queues a job owned by Maya, charged to her, and the family-bound port reads her costs, college list, and deadlines under the defaults. If Maya later joins another family, that family's rows decide what this old room sees.
- Fix: 06 F9 `leaveFamily` archives (sets `archivedAt` on) family rooms owned by the leaver in that family. 08 H9 `accessibleConversation` and `sendMessage` require the room owner to still be a `student` member of `conversations.familyId`, else `not_found`. 12 L5: `createCrewDataPort(core, { audience, familyId })`. `familyShares` filters by `familyId`, returns all-false when the owner isn't a student member of it, and `crew.request` passes the conversation's `familyId`. 07 `sharesWithFamily` takes `familyId` the same way.

### R4Z-7 (medium): invites can't be revoked, and a removed or departed member's pending invites still work

- Plans and tasks: 06 F9 (`invite`, `acceptInvite`, `clearDeparted`, `removeMember`, `leaveFamily`), 13 M10 (no route to cancel an invite), product rule 6 ("Sharing is per category and per person").
- Detail:
  - Any member can invite a parent. That includes a parent, up to `MAX_PARENTS`.
  - Nothing revokes an unaccepted invite: 06 has no `revokeInvite`, and 13 has no `DELETE /family/invites/:id`. `familyView.pendingInvites` shows them to the student, who can't act on them.
  - `clearDeparted` (used by `removeMember` and `leaveFamily`) deletes budgets and tasks, but not `familyInvites` with `invitedById` = the departing user. Only `deleteAccount` does that (R2I-4).
- Scenario: Dana (parent) invites her partner's address. Maya sees the pending invite and removes Dana. The 7-day invite still works: the partner accepts, joins as a parent, and gets Maya's five default categories plus the family room. Maya never chose them and couldn't stop it. Even with Dana still in the family, there's no way to cancel an invite sent to a mistyped address, which is a token that grants family access for 7 days.
- Fix (06 F9): `clearDeparted` also runs `delete familyInvites where familyId = ? and invitedById = userId and acceptedAt is null`. Add `revokeInvite(deps, actor, inviteId)`, allowed for the inviter or any student member, `not_found` otherwise, and audited. 13 M10 adds `DELETE /family/invites/:id`. For rule 6, either require a student member to approve a parent-sent invite (`invite` from a parent stores `approvedAt null`, and `acceptInvite` refuses until a student approves), or reword rule 6 and FA-01 to say any member can add parents. Coordinator call.

### R4Z-8 (medium): turning a category off doesn't hide what the family room already said, and old replies feed new family prompts

- Plans and tasks: 08 H9 (`getMessages`), 12 L7 (`loadCrewInput` history), 09 I10 (`checkPrivacy(reply, "family", FAMILY_DEFAULT_ALLOWED)`), FA-02 ("Turning a category off hides it from parents on the next request").
- Detail: family-room crew replies are stored once in `messages.reply`, with text, receipts (cost and deadline numbers), and cards. They're built under whatever was shared at the time. `getMessages` returns every past reply to every family member, whatever the current `shareSettings` are. `loadCrewInput` passes the last 10 messages, crew replies included, as history into the next family-audience request, so the model sees the old numbers again. The guard checks receipts against `FAMILY_DEFAULT_ALLOWED`, not the student's live grants, so it can't catch a re-quoted `costs` figure once costs is off. This is a different issue from D4, which is about citing essays when they are shared.
- Scenario: costs is on, and Dana asks "What's the gap at State U?" The reply says "$8,200, after the $5,000 Rotary award." Maya turns costs off. Dana still reads that reply in the family room on her next visit. Her next question, "And now?", sends that history to Ledger, which can repeat it.
- Fix (08 H9 + 12 L7): when 12 `completeJob` writes a family reply, record the categories it used (`reply.sharedCategories`, derived from the bound port's `allows` calls). Add the field to 02 `CrewReply` or a sibling `messages.categories text[]` column owned by 03. `getMessages` replaces a family reply's body, receipts, and cards with a "This answer used something that's no longer shared" stub for non-owner viewers when any of its categories is now off. 12 `loadCrewInput` leaves those replies out of family history. 09/12 pass the live grants (from the port's share cache) to `checkPrivacy` instead of the default list.

### R4Z-9 (medium): a parent can overwrite and switch on a student's income-range sensitive fact

- Plans and tasks: 06 F8 (`shareIncomeRangeToStudent` → `writeSensitiveFact(..., enabled: true, sharedByUserId)`), 06 rule 9 ("never writes student data"), ME-05, ON-04 ("All are off by default"), product rule 5 (opt-in), FA-04.
- Detail: the parent's share upserts the student's `income_range` row with `enabled: true` and the parent's value, replacing anything the student stored and turning back on a kind the student had switched off. The row stays after the parent leaves or is removed (`clearDeparted` doesn't touch `sensitiveFacts`), so a removed parent's number keeps driving the student's matches and, through R4Z-3, their costs.
- Scenario: Maya decided not to use income for matching (income range off). Dana submits "under $30k" from her private space, and Maya's matcher (and Scorecard band) now uses it without Maya opting in. After Maya removes Dana, the value stays on.
- Fix (06 F8): store the parent's share as an offer, not a write. Either add `sensitiveFacts.offeredValue` / `offeredByUserId` columns (03), or write it with `enabled` unchanged (false for a new row) and let the student turn it on from Memory ("Dana shared an income range. Use it for matching?"). `clearDeparted` in F9 clears a value whose `sharedByUserId` is the departing parent. Update the F8 test "lets a parent in the family share an income range" to expect `enabled: false` until the student confirms.

### R4Z-10 (medium): worker handlers trust payload ids without tying them to the job's owner

- Plans and tasks: 12 L8 (`handleOfferParse`, `handleEssayReview`), 08 H5 (`getOffer`, `saveParsedOffer`, `markOfferFailed` with the system actor), 06 F17 (`readDocumentBytes` with the system actor), 07 G10 (`getEssay` with the system actor), 07 G11 (`saveQuillComments`), item 7 of this round.
- Detail: `runCrewJob` takes `ownerId` from `crewJobs`, which is correct, but the handlers never compare the payload with it.
  - `offer.parse` loads `getOffer(SYSTEM, offerId)` and `readDocumentBytes(SYSTEM, offer.documentId)`, sends that PDF to the model billed to `ownerId`, writes lines with `saveParsedOffer(SYSTEM, { offerId })`, and posts `offer.collegeName` into the owner's room. Nothing checks `offer.ownerId === ownerId` or `job.refId === offerId`. 08 `createOffer` sets `refId: offer.id`, so the check is available.
  - `essay.review` calls `getEssay(SYSTEM, essayId)` and puts its title in the owner's reply. The port's `essay()` owner check stops the comments, but not the title.
  - `appeal.outline` and `prep.retake` are safe: they read through the owner-scoped port or `computeRetake(ownerId)`.
- Scenario: a malformed or replayed `offer.parse` message (a bad retry, a manual pg-boss requeue with a copied payload, or a future caller bug) pairs student A's job with student B's offer id. B's award letter is read by the model under A's job, B's offer lines are overwritten, and A's "Award letter" room says "Aid read your <B's college> award letter".
- Fix (12 L8): before any read, check `job.refId === offerId` (or `essayId`) and that the loaded record's `ownerId === ownerId`. Otherwise call `markOfferFailed` only when the owner matches, log `job.payload_mismatch`, and finish the job `failed`. 08 H5: `saveParsedOffer` and `markOfferFailed` take `ownerId` and add `eq(offers.ownerId, ownerId)` to their reads and writes. 07 `saveQuillComments` takes `ownerId` and joins `essays.ownerId`. Add one mismatch test per handler.

### R4Z-11 (medium): two routes email any address the caller chooses, with no rate limit

- Plans and tasks: 14 N5 (`POST /service-logs/:id/verify` → 07 G14 `requestVerification`), 14 N2 (`POST /recommenders/requests` → 07 G9 `requestRecommendation`), SE-04.
- Detail: both routes are `route({ auth: "user" })` with no `rate`. `requestVerification` can be repeated without limit: each call mints a new token and emails `supervisorEmail` with student-entered `organization`, `activity`, and `supervisorName`. `requestRecommendation` emails `rec.email` with the student's free-text `message`, and creates a 30-day helper link each time. 13 rate-limits family invites ("each invite emails an address the caller chose, so it's limited"), but these two senders were missed.
- Scenario: a scripted account adds a service log whose supervisor email is a victim address, and whose organization and activity fields carry a phishing line. It then calls `/verify` thousands of times. ScholarCrew's sending domain delivers every message, and its reputation suffers. The same account can mint unlimited live helper links through recommendation requests.
- Fix (14 N2, N5): add `rate: { key: "service-logs.verify", limit: 10, windowSeconds: 86_400 }` and `rate: { key: "recommenders.request", limit: 10, windowSeconds: 86_400 }`. 07 G14: refuse a new request while one sent less than 24 hours ago is still open (`conflict("A confirmation request went out today")`).

### R4Z-12 (medium): sensitive match-reason text is stored in plain text and quotes the sensitive value

- Plans and tasks: 04 D4 `checkRule` (`heritage_any`, `religion_any` reason text), 07 G3/G4/G5 (`scholarshipApplications.matchReasons` written by `runSweep`, `saveScholarship`), 06 F18 export, SE-02 ("Sensitive facts ... are encrypted").
- Detail: `why("heritage_any", "Your heritage fits this award (Mexican American)", true)` and `why("religion_any", "Your faith community fits this award (Catholic)", true)` put the decrypted value into the reason text. 07 stores reasons unencrypted in `scholarship_applications.match_reasons` jsonb, and refreshes them on every sweep. So the encrypted `sensitive_facts` row is copied in clear text to a second table that DB backups, admin SQL, and the R2I-11 parent path all reach.
- Scenario: a DB snapshot or a support query on `scholarship_applications` shows students' heritage and religion in plain text next to their user ids.
- Fix (04 + 07): sensitive reasons carry no value: "Your heritage fits this award" and "Your faith community fits this award". If the value has to show to the owner, store only `{ code, sensitive: true }` and have 07 rebuild the owner's text at read time from `readSensitiveForMatcher`. 04's matcher test asserts no sensitive reason text contains a profile value.

### R4Z-13 (low): public listing detail exposes the submitting student's user id

- Plans and tasks: 07 G1 (`toScholarship`), 07 G2 (`getScholarship` for the public actor), 08 H11 (`resolveCatalogTask` and `setScholarshipStatus` publish a submission as `visibility: "public"` and keep `submittedById`), 14 N1 (`GET /scholarships/:idOrSlug`, `auth: "optional"`).
- Scenario: a student submits a local award, and an admin publishes it. Any signed-out visitor's `GET /api/v1/scholarships/<slug>` returns `submittedById: "<student uuid>"` and `visibility`, which ties a student account to a named local listing (school, county) in public.
- Fix (07 G2): `getScholarship` and every non-admin mapper return `submittedById: null` unless the actor is the submitter. Admin reads (08 `getScholarshipForAdmin`) keep it.

### R4Z-14 (low): an essay can target another student's private submission, and its name leaks back

- Plans and tasks: 07 G10 (`createEssay` target check, `targetLabelFor`), 07 G12 (`linkStory`, `checkStoryReuse` name lookup).
- Detail: `createEssay` checks only that `targetScholarshipId` exists, not `visibleListingWhere(user)`. `getEssay.targetLabel` and `checkStoryReuse.message` then read `scholarships.name` by id, so a `submitter_only` draft of another student can be named. It needs the uuid, which is why this is low, but it's a join without the visibility predicate.
- Fix (07 G10): add `visibleListingWhere(user)` to the target lookup (`not_found` otherwise). `targetLabelFor` is then safe as is.

### R4Z-15 (low): reads in one share category carry data from another

- Plans and tasks: 07 G12 (`listStories` → `usesFor` adds `essayTitle`), 07 G15 (`getRequirementProgress` returns `scholarshipName` under `activities`), 08 H5 (`askParentsToReviewCosts` runs whatever the `costs` share is), 12 L5 (`stories` and `serviceProgress` in the family port).
- Scenario: a student shares `stories` but not `essays`. The parent's Story Bank and the family-room crew (via port `stories`) get `uses[].essayTitle` ("Why I'm leaving Texas"). With `activities` on and `scholarships` off, `getRequirementProgress` lists every open scholarship by name. A parent with `costs` off still gets the "Review award letters with Maya" task the moment Maya confirms a letter.
- Fix: 07 G12: drop `essayTitle` (set `""`) for readers who can't read `essays`. 07 G15: replace `scholarshipName` with "A saved scholarship" for readers who can't read `scholarships`. 08 H5: create `review_costs` tasks only for parents whose `getShareGrants` include `costs`.

### R4Z-16 (low): extension API tokens can be minted by any role, never expire, and aren't audited

- Plans and tasks: 06 F15 (`createApiToken` uses `assertUser` only, no `expiresAt`, no `recordAudit`), 13 M14 (`POST /extension/tokens`), EX-01/EX-02.
- Detail: scopes are enforced (`requireScope`), only hashes are stored, revocation works, and `deleteAccount` revokes. But admins and parents can mint `autofill`/`save_page` tokens. A token lives until revoked, so one copied from a lost laptop is good forever. SE-03 lists sign-ins and share changes as audited, and a credential mint is the same class of event.
- Fix (06 F15): `assertRole(actor, "student")`, add `expiresAt` (default 180 days, an `api_tokens.expires_at` column from 03) checked in `resolveApiToken`, and audit `api_token_created`/`api_token_revoked` with the token id only.

### R4Z-17 (low): many writes filter by id alone after a separate ownership read, and several user-facing writes accept the system actor

- Plans and tasks: these functions read the row, call `assertOwner`, and then `UPDATE`/`DELETE ... where id = ?` with no owner predicate. Each is safe today because owners never change, but the statement itself carries no guard.
  - 06: F6 `updateFact`, `forgetFact`, `confirmCandidate`, `rejectCandidate`; F7 `deleteDecision`; F10 `updateTask`; F14 `revokeHelperLink`; F16 `markRead`; F17 `deleteDocument`.
  - 07: G5 `updateApplication`; G8 `updateCollegeEntry`, `removeCollege`; G9 `updateApplicationItem`, `updateRecRequest`; G10 `saveVersion`, `updateEssay`; G11 `resolveComment`; G12 `updateStory`, `archiveStory`; G13 `deleteTestScore`; G14 `updateServiceLog`, `deleteServiceLog`, `requestVerification`; G15 `deleteActivity`.
  - 08: H3 `updatePlanItem`; H5 `updateOfferLine`, `confirmOffer`, `deleteOffer`; H6 `updateAidItem`.
- 07's writes above (and 08 `updateOfferLine`'s read) use `assertOwner` without `assertUser`, so the system actor passes them. 06's rule says "user-facing writes also call `assertUser`, so the system actor can't use them by accident".
- Fix (06/07/08): add `eq(<table>.ownerId, ownerFromCheck)` to each `UPDATE`/`DELETE` `where`, and call `assertUser` (or `requireUser`) first in the 07 user-facing writes. A shared helper `ownedWhere(table, id, ownerId)` in 06 `shared/rows.ts` keeps it short.

### R4Z-18 (low): the family-share default differs between core and the matches list

- Plans and tasks: 07 G3 (`sharesWithFamily` requires an `enabled = true` row), 06 F4 (`getShareGrants` falls back to `DEFAULT_SHARED`, R2I-11b), 12 L5 (`familyShares` same fallback).
- Scenario: a student's `shareSettings` rows are missing (the R2I-11b case 06 now tests). `getShareGrants` says `scholarships` is shared, so the parent passes `assertReadable`. But `listMatches` returns `[]` because `sharesWithFamily` finds no row, and the family-room port allows matches while core returns none.
- Fix (07 G3): drop `sharesWithFamily`. For parents, `assertReadable` already proved the grant. For the explicit family audience, apply `DEFAULT_SHARED` per category, filtered by the room's `familyId` (see R4Z-6).

### R4Z-19 (low): queued jobs for a deleted account still run

- Plans and tasks: 12 L6 (`runCrewJob` checks only `crewJobs.status`), 06 F19 (`deleteAccount` leaves queued `crewJobs` and pg-boss messages; purge comes 6 days later).
- Scenario: a student deletes their account while a `crew.request` or `essay.review` is queued. The worker still sends their snapshot or essay to the model, bills `usage_counters`, and writes a reply and a notification for a deleted user.
- Fix (12 L6): after loading the job, read `users.status` for `ownerId`. If it isn't `active`, log `job.owner_inactive` and finish `failed` without calling `work`. Optionally, 06 F19 marks the user's queued and working jobs `failed` inside the delete transaction.

### R4Z-20 (low): the account export includes `verificationTokenHash`

- Plans and tasks: 06 F18 (`SECRET_FIELDS` matches exact keys only: `tokenHash`, `ciphertext`, `iv`, `tag`, phone fields).
- Detail: `serviceLogs.verificationTokenHash` isn't in the set, so a live supervisor token's hash lands in the export file. The token itself can't be recovered from the hash, but secrets don't belong in a file meant to be downloaded and shared.
- Fix (06 F18): skip any key ending in `TokenHash` or `Hash` (or add `verificationTokenHash`), and assert in the export test that no key matching `/hash$/i` survives.

## Checked, no new defect

- Item 1 (actor checks, `not_found` on deny): every exported function in 06/07/08 takes an actor or is system-only, apart from the internal no-check loaders (`loadWeekPlan`, `collectDeadlines`, `costsFor`, `evaluateForStudent`, `loadActivities`, `loadEntries`). Their callers check first or are system code. Deny paths return `not_found` for existing resources, and `forbidden` appears only for role and system gates, `requireScope`, and `setBudget`'s student case. The id-only writes are listed in R4Z-17.
- Item 2 (parents): every 14 `?studentId=` read maps to the right category (matches/board/sweep → scholarships; list/items → colleges; essays/versions/comments → essays; stories → stories; logs/progress/activities → activities; costs/offers/compare/loans → costs; plan/this-week/aid → deadlines). Test scores and superscores are owner only. Membership checks run live (`familyIdsFor`, `inFamilyRoom`, the `listJobs` subquery, the SSE re-poll via `getJob`), so a removed parent loses access on the next request, apart from R4Z-6 and R4Z-7. Private rooms stay owner-only. Documents are owner-only.
- Item 3 (helper links): helper, verify-hours, invite, and magic-link tokens are separate tables. Each is a sha256 of `randomToken()`, has an expiry, and gives one 404 for unknown, expired, revoked, or used. The helper view intersects the actor scope with the stored scope and never reads essays, chats, costs, or sensitive facts. `/h/` and `/verify-hours/` are `noindex`, `no-referrer`, and per-IP limited. Gaps: invite revocation (R4Z-7) and the sender limits (R4Z-11).
- Item 4 (sensitive facts): `readSensitiveForMatcher` is system-only. The snapshot, port, catalog, and demo model never call it, and `get_matches` strips sensitive reasons. Exports go only to the owner. Gaps: R4Z-1, R4Z-2, R4Z-3, R4Z-4, R4Z-12.
- Item 5 (bearer): `authenticate` reads `Authorization` only for `auth: "bearer"` and cookies only for cookie modes, so neither credential crosses over. Only the two 14 N14 extension routes are bearer. `requireScope` runs before the body is read. Revoked and inactive users get 401. Gaps: R4Z-16.
- Item 6 (admin): every 14 N11/N12 admin route is `auth: "admin"` (`not_found` for others, after the Origin check), and every one of the 11 `(admin)` pages in 18 calls `requirePageActor(["admin"])`. Every admin write audits (`scholarship_created/updated/status_set`, `catalog_task_resolved`, `report_resolved`, `colleges_imported`, `research_enqueued`, the three aid actions).
- Item 7 (workers): `plan.weekly` ignores the payload `ownerId`. `appeal.outline` and `prep.retake` read through the owner, and `crew.request` checks that the message belongs to the job's conversation. `account.export`, `notify.*`, and `sweep.student` load their owner from the row. Gaps: R4Z-10 and R4Z-19.
