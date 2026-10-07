# Review round 2, student pipeline (plans 14, 07, 08, 12, 10, 17, 18)

Focus: data flow end to end (21 §3, round 2). Every §10 row owned by plan 14 for the student pipeline is traced route handler (14) → core (07, 08) → tables and columns (03, 00 §8) → domain object (02) → engines (04) where math is involved → page or component (17, or 18 for public pages). The six pipeline jobs (`essay.review`, `offer.parse`, `appeal.outline`, `prep.retake`, `sweep.weekly`, `sweep.student`) are traced enqueue (route or core, payload, singletonKey) → worker handler (12) → specialist (10) → core save → notification → the UI that shows the result. Names and imports were round 1's job and aren't repeated. Everything already in `plans/review-log.md` (D1–D50 and the round 1 fix tables) is treated as known.

Out of scope here: plan, crew, admin, helper-view, and extension routes (other round 2 slices), except where a pipeline value flows through them.

Severity: high = breaks the build or a contract; medium = wrong behavior; low = unclear.

Inputs: 00 (§8, §9, §10, §11), review-log, `docs/api/openapi.yaml`, `docs/product/features.md`, plans 02, 03, 04, 07, 08, 10, 12, 14, 17, 18 (grep plus targeted reads of the code blocks).

Money units: every amount checked below is integer USD (`Usd` in 02, `int` columns in 03, engine inputs and outputs in 04, `usd()` in 16's format helpers). No cents or X100 values cross a layer boundary except GPA (`gpaUnweightedX100` → `/100` in both 07 and 06's `getMe`), which is consistent.

---

## Findings

### R2P-1 (medium): aid rules and aid deadlines are read but nothing ever writes them

- Plans and tasks: 08 H5 `loanEstimates`, H6 `loadAidDeadlines`/`listAidDeadlines`, H7 `collectDeadlines`; 03 seed (`packages/db/src/seed/catalog.ts`); 14 N6/N7; 17 Q21 `/money`, Q23 `/money/offers`; 16 This Week "Coming up".
- Trace: `GET /offers/:id/loans` → 08 `loanEstimates` reads `aidRules` where `key = "federal_loan_rates"` for the offer's award year → `readRates(rule?.value)` → no rule means `rates = {}` → every federal loan line is skipped → `[]`. `GET /aid/deadlines` and `collectDeadlines` → `loadAidDeadlines` reads `aidDeadlines` for `currentAwardYear` → always `[]`. A grep of every plan finds inserts into `aidRules`/`aidDeadlines` only in 08's own tests (H5 line ~1819, H6 ~2345, H7 ~2674). 03's `seedDev` seeds colleges, scholarships, people, and records, but no aid rows; no admin route, catalog job, or import writes them (`docs/architecture/catalog.md` says "they come only from the dev seed", which isn't true of 03's seed). So 17's "Loan payments (10-year standard plan)" card never renders (MO-09), and state grant deadlines never reach `/money` or Coming up (AID-03), in dev or production.
- Fix: 03 `seedDev` (C-task for `seed/catalog.ts`): insert `aidRules` `{ awardYear: "2027-28", key: "federal_loan_rates", value: { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 }, sourceUrl: "https://studentaid.gov/understand-aid/types/loans/interest-rates", verifiedAt }` (and the same for `2026-27`), plus `aidDeadlines` rows for the federal FAFSA deadline (state null) and Texas (state `TX`) for both award years; add a seed test that `loanEstimates` returns one row for Jordan's seeded confirmed offer. For production, add a follow-up to 08/14/18 for an admin upsert of `aidRules`/`aidDeadlines` (`admin.upsertAidRule`, `admin.upsertAidDeadline`, `PUT /admin/aid-rules`, `PUT /admin/aid-deadlines`) or record the gap in 00 §12 for MO-09/AID-03. Correct `docs/architecture/catalog.md` either way.

### R2P-2 (medium): a parent's FAFSA/CSS steps live in two rows whose statuses never sync

- Plans and tasks: 08 H6 `ensureChecklists`, `getAidChecklists`, `updateAidItem`; 06 family `updateTask`; 13 `PATCH /family/tasks/:id`; 14 N7 `PATCH /aid/items/:id`; 16 `/family` tasks; 17 Q21 `AidChecklists` (`readOnly={v.isParent}`).
- Trace: `ensureChecklists` writes each parent step twice: an `aidChecklistItems` row (`assignee: "parent"`, `status: todo`) and a `familyTasks` row (`kind: fafsa_contributor`/`css_contributor`, same title). The parent sees the family task on `/family` and marks it done → 06 `updateTask` sets `familyTasks.status = done` only. On `/money` the student's checklist reads `aidChecklistItems`, so the parent step stays "todo", and `doneCount`/`totalCount` never reach 100%. The reverse path doesn't exist for parents: 17 renders `AidChecklists` read-only for parents, so the only place a parent can act is the family task, which is never reflected in the checklist. A grep for `aidChecklistItems` in 06 finds only the export code, and 08 never reads `familyTasks.status`.
- Fix: 08 H6: in `getAidChecklists`, treat a parent-assigned item as done when a matching family task (same `studentId`, `kind`, `title`, `detail = "FAFSA <awardYear>"` or `"CSS Profile <awardYear>"`) is done; and in `updateAidItem`, when a parent-assigned item changes, update the matching family tasks' status in the same transaction. Add one test each way. (Alternative: 03 adds `familyTasks.aidItemId uuid?` and 06 `updateTask` mirrors the status onto that item.)

### R2P-3 (medium): a listing saved from search or the detail page never gets match reasons or a fit score

- Plans and tasks: 07 G5 `saveScholarship`, G4 `runSweep`; 14 N1 `POST /scholarship-applications`; 17 Q5 `AddLocalModal`, Q6 `SearchResults`, Q7 `DetailActions` "Save to my board", Q8 detail page "Why you match".
- Trace: `POST /scholarship-applications` → `saveScholarship` inserts `{ ownerId, scholarshipId, stage: "planned", estMinutes }`. `matchReasons` defaults to `[]` and `fitScore` to `0` (03 defaults). `runSweep` adds rows only for matches with `applicationId === null`, so it never revisits an existing application. The detail page reads `detail.application.matchReasons` and, when empty, says "Save it to see how you match." After saving, the list stays empty forever, and the board card shows no reasons even when the student is eligible. The same applies to listings saved before the first sweep.
- Fix: 07 G5 `saveScholarship`: before the insert, run the matcher for that one listing (`buildMatcherProfile` + `evaluateEligibility` + `scoreMatch`, as `evaluateForStudent` does) and write `matchReasons`/`fitScore` on insert. On conflict, update them too when the existing row's `matchReasons` is empty. Optionally, `runSweep` refreshes `matchReasons`/`fitScore` for open applications (`matched`, `planned`, `drafting`). Add a board test: a listing saved from search shows its county reason. 17 Q8 then changes the empty-state copy to "You don't match any listed rule yet" for a saved card.

### R2P-4 (medium): retired, flagged, and later scam-flagged listings stay on the board, in deadlines, and in pending money

- Plans and tasks: 07 G5 `getBoard`; 08 H7 `collectDeadlines`, H8 `findDueReminders`, H4 `loadContext` (`pendingUsd`), H11 `setScholarshipStatus`; 07 G15 `getRequirementProgress`; 17 Q5 `BoardView`, Q8 detail page.
- Trace: an admin retires or flags a listing (`setScholarshipStatus` updates only `scholarships.status`), or a recheck adds `scamFlags`. Every pipeline reader joins `scholarshipApplications` → `scholarships` with no status or scam filter: `getBoard` keeps the card in Matched/Working on and adds `amountMaxUsd` to `totals.inPlayUsd` and `dueThisMonth`; `collectDeadlines` and `findDueReminders` keep sending "due in 3 days" for it (`OPEN_APP_STAGES` only checks the application stage); `loadContext` adds it to `pendingUsd`, which lowers `gapIfPendingWinUsd` on `/money` and This Week; `getRequirementProgress` keeps listing its hour requirement. A newly scam-flagged listing shows up twice on the board (in Matched and in `flagged` once the next sweep records it). Clicking the card opens `/scholarships/<slug>`, which 404s, because `getScholarship` applies `visibleListingWhere` (published/stale only). SC-01 says retired and flagged listings never appear; SC-06 says flagged ones are hidden from plans.
- Fix: 07 G2 `search.ts`: export `liveListingWhere = and(inArray(scholarships.status, ["published", "stale"]), noScamFlags)` (submitter-only drafts allowed for their owner). 07 G5 `getBoard`: for open stages (`matched`, `planned`, `drafting`), put cards whose listing fails it into `board.flagged` (reason from `SCAM_FLAG_TEXT`, or "This listing was retired" / "This listing is under review") instead of the columns, and leave them out of `totals`; keep `submitted`/`won`/`lost` history as is. 08 H7/H8/H4 and 07 G15 `getRequirementProgress`: add the same condition to the open-application queries. Add one board test and one deadlines test with a retired listing.

### R2P-5 (medium): the value-per-hour ranking (SC-05) never reaches the board

- Plans and tasks: 04 `scoreMatch`, `rankMatches`; 07 G3 `evaluateForStudent`/`listMatches`, G4 `runSweep`, G5 `getBoard`; 14 N1 `GET /matches`; 17 Q3 `boardColumns`, Q5 `BoardView`, Q6 `/scholarships`.
- Trace: the engine ranks matches by `valuePerHour`, `fitScore`, and urgency (`rankMatches`). `runSweep` stores `fitScore` but not `valuePerHour` on the `matched` rows. `getBoard` orders every column by `deadlineOrder` (deadline asc, then name), and 17's `boardColumns` keeps that order and never sorts by `fitScore` either. `GET /matches` (the only route that returns ranked `Match[]` with `valuePerHour`, `unknowns`, and `reuseStoryIds`) has no caller in 16, 17, or 18; only the worker's port uses `listMatches`. So the Matched column on `/scholarships` is in deadline order, and SC-05's "ranked by expected value per hour" has no screen.
- Fix: 07 G5 `getBoard`: compute `evaluateForStudent` once (or reuse `rankMatches` over the matched cards with `scoreMatch` inputs from the listing and stored reasons) and order `board.matched` by that rank, with cards not in the current evaluation last by deadline. Add `valuePerHour: number | null` to 02 `BoardCard` if 17 should show "≈ $X/hour" from the mockup. Add a board test with two matched cards whose deadline order and value order differ. (Alternative: 17 Q6 renders the Matched column from `listMatches`.)

### R2P-6 (medium): a calculator estimate outranks a confirmed award letter in every cost summary

- Plans and tasks: 08 H4 `summariesFor`; consumers 17 Q18 `/colleges` (`withGaps`), Q19 college detail, Q21 `/money` `CostCards`; 16 This Week `topGap`; 12 port `costs`.
- Trace: `summariesFor` picks, per college, the `calculator` row first (`if (calc) { … continue; }`), then the newest confirmed, unarchived offer, then the Scorecard estimate. Once a student has entered a net price calculator result (MO-02) and later confirms that college's award letter (MO-05), every surface keeps showing the calculator number with `isEstimate: true` and "Your net price calculator result". The confirmed letter only shows on `/money/offers`. MO-02 says the calculator replaces the Scorecard estimate, not the real offer. 08's tests check offer over Scorecard and calculator over Scorecard, but never calculator against offer.
- Fix: 08 H4: order the sources offer → calculator → Scorecard in `summariesFor` and update the comment. Add a costs test: a calculator row plus a confirmed offer for the same college yields `source: "offer"`, `isEstimate: false`; archiving the offer falls back to `calculator`.

### R2P-7 (low): one confirmed offer gets two different "after free money" numbers

- Plans and tasks: 08 H4 `summariesFor` (source `offer`), H5 `compareMyOffers`; 04 `computeGap`, `compareOffers`; 17 Q21 `CostCards`, Q22 `OfferComparisonView`.
- Trace: for the same confirmed offer, `/money` shows `gapUsd = computeGap(coa, offerFree + wonUsd)` (won outside scholarships added, per MO-03) and skips the college when both `offer.costOfAttendanceUsd` and `college.costOfAttendanceUsd` are null. `/money/offers` shows `reallyCostsUsd = coa − offerFree` from `compareOffers`, without won scholarships, and with `costOfAttendanceUsd ?? college.costOfAttendanceUsd ?? 0`, so a letter with no stated cost and a college without a Scorecard cost shows $0 "really costs" and can win `lowestFourYearOfferId`. Neither page explains the difference.
- Fix: 08 H5 `compareMyOffers`: skip (or add a warning to) offers whose cost of attendance is unknown instead of using 0, and add an assumption line "Outside scholarships you've won aren't included here; /money counts them". Optionally pass won outside scholarships as a separate line so both numbers agree.

### R2P-8 (medium): award letters upload as PNG, JPG, or text, but the parser only reads PDFs, and a failed offer is a dead end

- Plans and tasks: 17 Q23 `UploadLetter` (`ALLOWED_UPLOAD_MIMES` check and `accept`); 02 `ALLOWED_UPLOAD_MIMES`; 08 H5 `createOffer`, `markOfferFailed`; 12 L8 `handleOfferParse` (`NOT_PDF_TEXT`, `PARSE_FAILED_TEXT`, `NO_LETTER_TEXT`); 10 J5 `runOfferParse` (always sends `media_type: "application/pdf"`); 14 N6.
- Trace: `UploadLetter` accepts any `ALLOWED_UPLOAD_MIMES` type ("Upload a PDF, PNG, JPG, or text file") → `POST /documents` (`kind: award_letter`) → `POST /offers` → `offer.parse` → the handler checks `meta.mime !== "application/pdf"` → `markOfferFailed(…, "not_pdf")` and fails the job with "Only PDF award letters can be read automatically. You can enter the lines yourself." No route creates an offer line (`PATCH /offer-lines/:id` edits existing lines only), `confirmOffer` refuses zero lines, and nothing deletes or retries an offer, so a failed letter sits under "Letters in progress" with a Failed badge forever. 17's own failure copy points to the public offer tool instead, which contradicts the worker's job error text.
- Fix: 17 Q23: for award letters accept and check only `application/pdf` ("Upload the award letter as a PDF"), with a test. 12 L8: change the three texts to drop "enter the lines yourself" (say "Upload a clearer PDF, or compare it by hand in the offer tool"). Optional, 08/14: `DELETE /offers/:id` for failed or unconfirmed offers.

### R2P-9 (medium): "appeal outline ready" and "retake analysis ready" notifications open pages that don't show the result

- Plans and tasks: 08 H2 `READY_NOTICE`, `completeJob`; 12 L9 `handleAppealOutline`, `handlePrepRetake`; 17 Q23 `AppealButton` and `/money/offers/[id]`, Q27 `RetakeForm` and `/prep`; 16 notification bell and `/crew/[id]`.
- Trace: `POST /offers/:id/appeal` → `requestAppealOutline` (job `appeal_outline`, `refId = offerId`) → `appeal.outline` → `runAppealOutline` → `completeJob` writes the outline as a crew message in a new `my_crew` conversation ("Appeal outline") and notifies with `link: /money/offers/<offerId>`. That page renders only `LineReview` (lines and confirm); the outline appears only in `AppealButton`'s `JobReply` on `/money/offers`, and only while that tab keeps the job id in state. Same for `prep.retake`: the notice links to `/prep`, where `RetakeForm` starts empty after a reload (the job result isn't stored, D32), so the explanation is reachable only by finding the "Retake analysis" conversation in `/crew`. Both are the paths a student takes when they leave the page during a 30–60 s job.
- Fix: 08 H2 `completeJob`: for `appeal_outline` and `retake_analysis` (and any kind with a reply), link to the result conversation, `/crew/<conversationId>`, which `completeJob` already has after the insert. Keep the `/essays/<id>` and `/money/offers/<id>` links for `essay_review` and `offer_parse`, whose results are on those pages. Update the jobs test that asserts the links.

### R2P-10 (medium): an expired supervisor link leaves the log stuck at "Waiting" with no way to resend

- Plans and tasks: 07 G14 `requestVerification`, `findOpenRequest`, `toServiceLog`; 02 `ServiceLog`; 14 N5 `POST /service-logs/:id/verify`; 17 Q29 `ServiceLogs` (`canAsk`); 18 R10 `/verify-hours/[token]` expired message.
- Trace: `requestVerification` sets `verification = "requested"` and `verificationExpiresAt = now + 14 days`. When the link expires, `findOpenRequest` returns null and the supervisor sees "If the student still needs you to confirm these hours, they can send a new request" (18). Nothing resets the row, so it stays `requested`. `ServiceLog` (02) has no expiry field, so 17 can't tell it expired, and `canAsk` allows "Ask to confirm" only for `self_reported` and `declined`. The core would accept a resend (it only refuses `verified`), but no screen offers it, so those hours can never count toward IM-03.
- Fix: 02 `ServiceLog`: add `verificationExpiresAt: IsoDateTime.nullable()`. 07 G14 `toServiceLog`: map it. 17 Q29: when `verification === "requested"` and the expiry has passed, show "Link expired" and the "Ask to confirm" button; add a test. Also update openapi `ServiceLog`.

### R2P-11 (medium): recommendation request status is read and labeled but never written past "requested"

- Plans and tasks: 07 G9 `requestRecommendation`, `listRecRequests`; 03 `recRequests.status` (`rec_status`: draft, requested, confirmed, submitted, declined); 14 N2; 17 Q16 `REC_STATUS_LABEL`, `pastRequests`, Q19 `Recommenders`; 18 R9 helper view.
- Trace: `requestRecommendation` inserts `status: "requested"`. No core function, route, helper-view action, or worker changes it; a grep for updates to `recRequests` finds none. 17 maps every `RecStatus` to a label ("Agreed to write", "Submitted", "Declined") that can't occur. CO-07 says "track status".
- Fix: 07 G9: add `updateRecRequest(deps, actor, id, p: { status: "confirmed" | "submitted" | "declined" })` (owner only; sets `updatedAt`), plus 02 `RecRequestPatch`; 14 N2: `PATCH /recommendations/:id`; 00 §9.4/§10 and openapi; 17 Q19: a status select on each past request. Add tests in each plan.

### R2P-12 (medium): a page saved from the extension never reaches the student's board

- Plans and tasks: 14 N14 `POST /extension/save-page`; 07 G6 `submitLocalScholarship`; 17 Q5 `AddLocalModal`.
- Trace: 17's dialog calls `POST /scholarships/local`, then `POST /scholarship-applications` to put the submission on the board. The extension route calls `submitLocalScholarship` only. The draft is `submitter_only`, so `evaluateForStudent` (published only) never matches it and the sweep never adds it; it appears only if the student searches its exact name. EX-02 says the saved page becomes a local scholarship (SC-07), which is "visible only to that student, labeled unverified".
- Fix: 07 G6 `submitLocalScholarship`: in the same transaction, insert a `planned` application for the submitter (`onConflictDoNothing`), so every path behaves the same; 17 Q5 drops its second call (or keeps it, since `saveScholarship` is an upsert). Add an extension route test that the board's Working on column has the saved page.

### R2P-13 (low): the calculator form only offers colleges that already have a cost estimate

- Plans and tasks: 17 Q21 `/money` (`<CalculatorForm colleges={costs.map(…)} />`); 08 H4 `summariesFor` (`if (!estimate) continue`).
- Trace: `getCosts` skips listed colleges with no calculator row, no confirmed offer, and no Scorecard numbers. `/money` builds the calculator's college picker from that same list, so a listed college with no Scorecard net price can never get a calculator result (MO-02), which is exactly when the student needs one.
- Fix: 17 Q21: build the picker from `getCollegeList` (current season), not from `costs`; add a test with one listed college that has no estimate.

### R2P-14 (low): `Essay.status` is shown but never written

- Plans and tasks: 02 `Essay.status`/`EssayStatus`; 03 `essays.status`; 07 G10 (no update function); 14 N3 (no `PATCH /essays/:id`); 17 Q14 `/essays` Status column.
- Trace: `createEssay` relies on the column default `drafting`. No core function or route changes `status` (or `title`/`prompt`), so every essay shows "Drafting" in the list forever, and "Ready"/"Submitted" can't appear.
- Fix: either 07 G10 adds `updateEssay(deps, actor, id, p: EssayPatch)` (status, title, prompt; owner only) with 02 `EssayPatch`, 14 `PATCH /essays/:id`, 00 §9.4/§10, and a status control in 17's studio; or 17 drops the Status column and 02/03 keep the field for later. Pick one and record it.

### R2P-15 (low): `CollegeListEntry.gapUsd` is always null from the core

- Plans and tasks: 07 G8 `loadEntries` (`gapUsd: null`); 17 Q16 `withGaps`; 12 L5 port `collegeList`; 10 Atlas/Ledger tools.
- Trace: the field is never filled by 07. 17 fills it on the page from `getCosts`, but the worker's port passes the null straight to the agents, so a tool result says every college's gap is null while `get_costs` says otherwise.
- Fix: 07 G8 `getCollegeList`: fill `gapUsd` from 08's `costsFor` (or drop the field from 02 `CollegeListEntry` and openapi, and have 17 keep `withGaps`). If 07 can't import 08 (module order), drop the field.

### R2P-16 (low): the parser's award year is extracted and then dropped

- Plans and tasks: 02 `ParsedOffer.awardYear`; 10 J5 `runOfferParse`; 12 L8 `handleOfferParse`; 08 H5 `saveParsedOffer`.
- Trace: Aid returns `awardYear` from the letter; the handler passes only `costOfAttendanceUsd` and `lines` to `saveParsedOffer`, so a student who typed the wrong year in the upload form keeps it, and `archiveSeason`'s `lte(offers.awardYear, …)` archives the wrong offers.
- Fix: 12 L8: when `parsed.awardYear` differs from the offer's, pass it on; 08 H5 `saveParsedOffer` takes an optional `awardYear` and stores it, or adds a review note. Otherwise drop the field from 02 `ParsedOffer` and 10's prompt.

### R2P-17 (low): `applicationItems.essayId` is read but no screen writes it

- Plans and tasks: 07 G9 `updateApplicationItem` (accepts `essayId`); 14 N2 `PATCH /application-items/:id`; 17 Q19 `ChecklistItems` ("Open draft" when `essayId` is set), Q14 `/essays` empty-state copy ("from a college supplement").
- Trace: `ChecklistItems` only sends `{ status }`; `StartEssayButton` exists only on the scholarship detail page; `createEssay` for a college doesn't link the supplement item. So "Open draft" never appears outside seeded data.
- Fix: 17 Q19: a "Start essay" action on `supplement` items that posts `POST /essays` (`targetType: "college"`, the supplement prompt) and then `PATCH /application-items/:id { essayId }`; add a test. Or drop "Open draft" and the empty-state wording.

### R2P-18 (low): openapi lags two round 1 domain changes

- Plans and tasks: `docs/api/openapi.yaml` (patched with 14 in round 1); 02 `Essay.latestWordCount` (D34), `ScholarshipQueryParams.excludeScams` (D39).
- Trace: openapi `Essay.required` and `properties` have no `latestWordCount`, though every `GET /essays` row carries it and 17 depends on it. `GET /scholarships` lists no `excludeScams` parameter, though the route passes it through `ScholarshipQueryParams`.
- Fix: openapi: add `latestWordCount: { type: [integer, "null"], minimum: 0 }` to `Essay` (required), and `{ name: excludeScams, in: query, schema: { type: boolean } }` to `GET /scholarships`. Add `ServiceLog.verificationExpiresAt` if R2P-10 is adopted.

### R2P-19 (low): `GET /scholarships/:idOrSlug` returns scam-flagged listings to signed-out callers

- Plans and tasks: 07 G2 `getScholarship`; 14 N1 detail route (`auth: "optional"`); 18 R5 `/directory/s/[slug]` (`loadListing` filters `scamFlags` itself).
- Trace: public search drops scam-flagged listings in SQL (D39), but `getScholarship` uses only `visibleListingWhere`, so the public API serves a flagged listing by slug. 18's page hides it; the API doesn't.
- Fix: 07 G2 `getScholarship`: add `noScamFlags` when `actor.kind === "public"` (signed-in students still see the flag and its reason on the detail page). 18 may keep its own check.

### R2P-20 (low): aid checklists use different share rules in the API and in the family crew

- Plans and tasks: 08 H6 `getAidChecklists`/`listAidDeadlines` (`assertCanRead(…, "deadlines")`); 12 L5 port `aidChecklist` (`allows(ownerId, null)`).
- Trace: a parent with `deadlines` shared reads the FAFSA and CSS checklists on `/money` (17) through the API, but the family-room crew is told aid checklists "have no share category" and gets `[]`. Same data, two answers to "what's left on the FAFSA?".
- Fix: 12 L5: map `aidChecklist` to `deadlines`, matching 08, and update the port test and the doc comment. (Test scores stay `null`.)

### R2P-21 (low): the signup week's Sunday sweep can't notify

- Plans and tasks: 06 `completeOnboarding` (enqueues `sweep.student`); 07 G4 `runSweep` (`dedupeKey: sweep:<studentId>:<weekStartFor(now, tz)>`); 12 L10 `sweep.weekly` (Sunday 14:00 UTC).
- Trace: a student who onboards on a Wednesday gets the first sweep's `new_matches` notice under key `sweep:<id>:<Monday>`. The Sunday sweep of the same week computes the same Monday (`weekStartFor` of a Sunday is the previous Monday), so `notify` returns null and new matches added that Sunday are never announced. SC-10 says students are notified of new matches.
- Fix: 07 G4: key the notice by sweep day, `sweep:<studentId>:<todayIn(now, tz)>`, or pass a `reason` (`onboarding` | `weekly`) through `sweep.student` and use `sweep:<studentId>:<weekStart>:<reason>`. Update the sweep tests.

---

## Route traces

One line per §10 row (or row group) in this slice. "OK" means the value was followed 14 → 07/08 → 03 → 02 → 04 → 17/18 with no loss, rename, or unit change, and parent `?studentId=` reads go through `assertReadable`/`assertCanRead` with the right share category (D23).

| # | Route | Trace | Result |
|---|---|---|---|
| 1 | `GET /scholarships` | `ScholarshipQueryParams` (incl. `openOn`, `excludeScams`) → `searchScholarships` (visibility, scams in SQL, deadline order) → `Page<ScholarshipSummary>` → 17 `SearchResults` (flag badge) and 18 directory `toQuery` | OK (openapi param gap: R2P-18) |
| 2 | `GET /scholarships/:idOrSlug` | `getScholarship` (id or slug, `application` for users, `stale`) → 17 detail, 18 `/directory/s/[slug]` | R2P-19 (low) |
| 3 | `POST /scholarships/local` | `LocalSubmissionInput` → draft `submitter_only` listing + `user_submission` task → `catalog.extract` `{ taskId }`, key `catalog.extract:<taskId>` → 17 `AddLocalModal` then saves to board | OK |
| 4 | `POST /scholarships/:idOrSlug/report` | slug → id → `ReportInput` (path id wins) → `catalogReports` + `report` task | OK |
| 5 | `GET /matches` | `listMatches` (scholarships share; sensitive reasons stripped for family) → `Match[]` | R2P-5 (no screen reads it) |
| 6 | `GET /scholarship-applications` | `getBoard` → `Board` (columns, totals in USD, `flagged` from latest `sweepRuns.hiddenScholarshipIds`) → 17 `BoardView`, essays page, detail page for parents | R2P-4, R2P-5 |
| 7 | `POST /scholarship-applications` | `{ scholarshipId }` → `saveScholarship` upsert (`planned`) | R2P-3 |
| 8 | `PATCH /scholarship-applications/:id` | `ApplicationPatch` → won sets `outcomeUsd` (USD), `outcomeAt`, renewable default, thank-you plan item → board `wonUsd`, 08 `wonScholarshipsForYear`, D2 renewal reminders | OK |
| 9 | `GET /colleges` · `GET /colleges/:id` | `CollegeQueryParams` → `searchColleges`/`getCollege` → 17 `AddCollegeModal`, college detail, prep | OK |
| 10 | `GET /college-list` | `getCollegeList` (current season, not archived, colleges share) → `CollegeListEntry[]` → 17 `/colleges` + `withGaps` | R2P-15 (low) |
| 11 | `POST /college-list` · `PATCH /college-list/:id` · `DELETE /college-list/:id` | `addCollege` (25 cap, D5 message; generated items) · `updateCollegeEntry` (plan change moves item due dates) · `removeCollege` (items cascade) | OK |
| 12 | `GET /college-list/:id/items` · `PATCH /application-items/:id` | `listApplicationItems` (colleges share) · `updateApplicationItem` (owner; essay ownership checked) → 17 `ChecklistItems` | R2P-17 (low) |
| 13 | `POST /college-list/archive-season` | `archiveSeason` → `collegeList.archivedAt` + `offers.archivedAt` (D1) → every reader checked: `getCollegeList`, `costsFor`/`listedColleges`, `listOffers`, `compareMyOffers`, `cssColleges`, `collectDeadlines`, `findDueReminders`, `computeRetake`, `topGap` all filter `archivedAt` | OK |
| 14 | `GET /recommenders` · `POST /recommenders` | owner-only list and add → 17 `Recommenders` | OK |
| 15 | `POST /recommenders/requests` · `GET /recommendations` | helper link (scope activities, stories; 30 days) + `recRequests.message` (D38) + email; list with `helperLinkId` (D33) → 17 past requests | R2P-11 |
| 16 | `GET /essays` · `POST /essays` · `GET /essays/:id` | `listEssays` (essays share; `latestWordCount`, D34) · `createEssay` (target checks) · `getEssay` (body, unresolved comments, `targetLabel`) → 17 list, `NewEssayForm`, studio | R2P-14 (low), R2P-18 (low) |
| 17 | `POST /essays/:id/versions` · `GET /essays/:id/versions` | `SaveVersionInput.baseVersion` optimistic check (409) → `wordCount` from engines `countWords` → 17 editor (same `countWords`), `HistoryModal` | OK |
| 18 | `POST /essays/:id/review` · `GET /essays/:id/comments` · `POST /essay-comments/:id/resolve` | job below · all comments (17 reads `getEssay`'s unresolved list instead) · owner resolve → `CommentsPanel` refresh | OK |
| 19 | `GET/POST /stories` · `PATCH/DELETE /stories/:id` | stories share; archive hides from list, board reuse, and matcher | OK |
| 20 | `POST /stories/link` · `POST /stories/reuse-check` | `storyUses` with essay target ids → `StoryReuseCheck` → 17 `StoryMatch` (omits null targets, so the optional fields validate) | OK |
| 21 | `GET/POST/DELETE /test-scores` · `GET /prep/superscores` | owner only (parents get 404; 17 shows the private card) → engines `superscore` → 17 `ScoresCard` | OK |
| 22 | `POST /prep/retake` | job below; 17 recomputes `retakeAnalysis` client-side from the same inputs (current-season list, `gpaUnweighted`, max official composite), so the table matches the worker's numbers (D32) | R2P-9 |
| 23 | `POST /prep/study-plan` | `StudyPlanInput` → `test_prep` plan items (`refType: "prep"`) → 17 `StudyPlan`, 16 This Week | OK |
| 24 | `GET/POST /service-logs` · `PATCH/DELETE /service-logs/:id` | activities share; minutes in, hours shown (`minutes / 60`, one decimal in both 07 and 17); edits reset verification | OK |
| 25 | `POST /service-logs/:id/verify` · `GET/POST /verify-hours/:token` | 14-day hashed token → email → 18 form `{ confirmed, note }` → `verified`/`declined` → matcher `serviceHours`, IM-03 | R2P-10 |
| 26 | `GET /activities` · `PUT /activities` · `DELETE /activities/:id` | upsert by `(ownerId, position)`, 150 code points (engines `countChars` in 17) | OK |
| 27 | `GET /service-logs/progress` | `getRequirementProgress` (verified vs non-declined hours) → 17 `RequirementCard` | OK (see R2P-4 for retired listings) |
| 28 | `GET /costs` | `getCosts` (costs share) → `computeGap` (USD) with won outside scholarships, pending, family budget → 17 `CostCards`, `withGaps`, 16 This Week | R2P-6 |
| 29 | `PUT /costs/calculator` | `CalculatorResultInput` → `costEstimates` (`calculator`) → summary | R2P-6, R2P-13 (low) |
| 30 | `GET /offers` · `GET /offers/:id` | `loadOffers` (archived skipped in the list, `parseJobId` D31) → 17 offers page, `LineReview` | OK |
| 31 | `POST /offers` | document (`award_letter`, own) → offer `parsing` + `offer_parse` job → `offer.parse` | R2P-8 |
| 32 | `POST /offers/:id/confirm` · `PATCH /offer-lines/:id` | ≥ 1 line → `confirmed`; line patch sets `userCorrected` → 17 badge | OK |
| 33 | `GET /offers/compare` | confirmed, unarchived → engines `compareOffers` (labels, D8) → 17 `OfferComparisonView`; `endParts` reuses `reallyCostsUsd + oneTimeFreeUsd`, consistent with `fourYearUsd` | R2P-7 (low) |
| 34 | `POST /offers/:id/appeal` | job below | R2P-9 |
| 35 | `GET /offers/:id/loans` | `aidRules.federal_loan_rates` → engines `estimateLoanPayment` | R2P-1 |
| 36 | `POST /public/offer-tool` | `PublicOfferInput` (64 KB cap) → `computePublicOffers` → 18 `OfferResults` (no storage, no model) | OK |
| 37 | `GET /aid/checklists` · `PATCH /aid/items/:id` | `ensureChecklists` (FAFSA + CSS per current listed college, `dueOn = aidPriorityDate`) → 17 `AidChecklists` | R2P-2, R2P-20 (low) |
| 38 | `GET /aid/deadlines` | `aidDeadlines` for the student's state and award year | R2P-1 |
| 39 | `POST /extension/save-page` (pipeline value only) | `SavePageInput` → `submitLocalScholarship` | R2P-12 |

## Job traces

| Job | Enqueue (who, payload, key) | Worker (12) → agent (10) → core save | Notification → UI | Result |
|---|---|---|---|---|
| `essay.review` | 07 `requestReview` after `assertCrewAllowance`: `crewJobs` `essay_review`, `refId = essayId`; `{ jobId, essayId }`, no key (standard queue) | `runCrewJob` (`crewRequest: true`) → `getEssay` (system) → `runEssayReview` (port `essay`) → `saveQuillComments` (quote must occur in that version; idempotent per job) → `completeJob` with `reviewReply` | `job_ready` → `/essays/<essayId>`; 17 `CommentsPanel` follows `/jobs/:id/events` and refreshes; comments come back through `getEssay` | OK |
| `offer.parse` | 08 `createOffer` (in one transaction with the offer and `documents.parseStatus = queued`): `{ jobId, offerId }`, no key | `runCrewJob` (`crewRequest: false`, `onFailed` marks the offer failed) → `getOffer`, `readDocumentBytes` (system) → PDF check → `runOfferParse` → `saveParsedOffer` (lines, COA in USD, `needs_review`) | `job_ready` → `/money/offers/<offerId>`; 17 `UploadLetter` follows `parseJobId` (D31), then polls `GET /offers/:id`; `LineReview` | R2P-8, R2P-16 (low) |
| `appeal.outline` | 08 `requestAppealOutline` after `assertCrewAllowance`: `{ jobId, offerId }`, no key | `runCrewJob` (`crewRequest: true`) → `runAppealOutline` (port `offers` = `compareMyOffers`, confirmed only; dollar check against the comparison's own numbers) → `completeJob` (new `my_crew` conversation) | `job_ready` → `/money/offers/<offerId>` (wrong page); 17 `AppealButton` → `JobReply` | R2P-9 |
| `prep.retake` | 07 `requestRetakeAnalysis` after `assertCrewAllowance`: `{ jobId, test, targetComposite }`, `refId = test`, no key | `runCrewJob` (`crewRequest: true`) → `computeRetake` (engines `retakeAnalysis`) → `runRetakeExplanation` → `completeJob` | `job_ready` → `/prep` (result not there after a reload); 17 `RetakeForm` → `JobReply`, table from the same engine call | R2P-9 |
| `sweep.weekly` | 05 `SCHEDULES` `0 14 * * 0` UTC; payload `{}` | fan-out to active, onboarded students: `sweep.student` `{ studentId }`, key `sweep:<id>:<weekStart in their zone>` (standard queue; duplicate fan-out accepted, review-log group A/C) | none itself | OK |
| `sweep.student` | 12 `sweep.weekly`; 06 `completeOnboarding` (no key) | role/status check → 07 `runSweep` → `matched` rows (`onConflictDoNothing`), `sweepRuns` (`newMatches`, `totalUsd` in USD, `reuseCount`, `hiddenScams`, ids) | `new_matches` (email) → `/scholarships`; 17 board Matched column and `flagged`; 16 This Week `lastSweep` | R2P-21 (low); R2P-3 and R2P-5 limit what the sweep's rows carry |

Every job above has a handler in 12's `HANDLERS` (typed `Record<JobName, Handler>`), and every handler has an enqueuer. Payloads match 02 `JobPayloadSchemas` field for field. Money stays integer USD from the engines to `usd()` on every path; no job recomputes a number the UI shows differently, except the cost-versus-comparison split in R2P-7.

## Summary

| Severity | Count | IDs |
|---|---|---|
| High | 0 | none |
| Medium | 11 | R2P-1, R2P-2, R2P-3, R2P-4, R2P-5, R2P-6, R2P-8, R2P-9, R2P-10, R2P-11, R2P-12 |
| Low | 10 | R2P-7, R2P-13, R2P-14, R2P-15, R2P-16, R2P-17, R2P-18, R2P-19, R2P-20, R2P-21 |

Traces: 39 route rows (20 OK, two of them with a cross-reference note; 19 with a finding) and 6 jobs (2 OK, 4 with a finding).

Owning plans to patch: 07 (R2P-3, -4, -5, -10, -11, -12, -14, -15, -19, -21), 08 (R2P-1, -2, -4, -6, -7, -9, -16), 17 (R2P-8, -10, -11, -13, -14, -17), 02 (R2P-10, -11, -14), 03 (R2P-1 seed), 12 (R2P-8 texts, -16, -20), 14 (R2P-11, -14, -18 openapi), 18 (R2P-1 admin follow-up, optional).
