# Review round 3: values, formatting, nulls, and defaults

Reviewer slice: dates and times, money, nulls and defaults, enums and labels, and text limits across 02 (domain), 03 (db), 04 (engines), 06/07/08 (core), 15 (UI kit), and 16/17/18 (pages). Items already in `plans/review-log.md` are not repeated.

Severity: high breaks the build or a contract; medium is wrong behavior; low is unclear.

## Findings

### R3V-1 (medium): a student-submitted local listing shows "$0" on the board and detail page

- Plans/tasks: 07 G6 `submitLocalScholarship`; 17 Q4/Q5 board card, Q8 detail page; 14 extension save-page (same core path).
- Mismatch: 07 inserts the unknown amount as a real zero: `amountMinUsd: 0, amountMaxUsd: 0, deadline: null` ("provider `Unknown`, amounts 0, no deadline"). 11 K6 stores the extracted draft in the task payload and leaves the listing row unchanged, so the zeros stay until an admin publishes. 17's card renders `usd(won && a.outcomeUsd !== null ? a.outcomeUsd : s.amountMaxUsd)` and the detail page renders `amountLabel(detail.amountMinUsd, detail.amountMaxUsd)`. Both print "$0" for an amount nobody has read yet. The card also gets `valuePerHour` 0, so it ranks last.
- Fix (17 owns the display, 07 owns the data): 17 `scholarships/board.ts` and `[slug]/page.tsx` show "Amount not known yet" when the listing is still `status === "draft"`. `ScholarshipSummary` has `status` but no `visibility`, and the only drafts a student can see are their own submissions. A bare `amountMaxUsd === 0` check would also relabel a published listing that an admin saved at $0. Add one board test and one detail test. Optional cleaner fix in 02/03/07: make `amountMaxUsd` nullable for drafts. That would ripple into 04 `scoreMatch` and 08 pending money, so the 17 label is the smaller change.

### R3V-2 (medium): the signed-in scholarship search lists closed listings and lets students save them

- Plans/tasks: 17 Q6 `scholarships/page.tsx` and `SearchResults.tsx`; 07 G2 `searchScholarships` (`openOn`, F-18-3).
- Mismatch: 18's directory always passes `openOn: todayIso(now)` ("closed listings never appear", F-18-3). 17 calls `searchScholarships(v.deps, v.actor, { q, page: 1, pageSize: 20 })` with no `openOn`. It then renders `` `due ${dateShort(s.deadline)}` `` with a Save button for a listing whose deadline is already past, and saving it inserts a `planned` application (07 `saveScholarship`) for a closed award, which then counts as pending money (R3V-6).
- Fix (17): pass `openOn: todayIn(v.deps.clock.now(), v.timeZone)` from `components/scholarships/viewer.ts`'s `todayIn`, which uses the student's zone. Add a SearchResults/page test where a listing that closed yesterday is absent and one due today is present.

### R3V-3 (low): the family budget input refuses "12,000" and saves whitespace as $0

- Plans/tasks: 16 P19 `ParentSpace` budget form (`saveBudget`); 17 Q21 `dollars`; 18 R6 `parseDollars`.
- Mismatch: 16 parses `const n = Number(annual); if (!Number.isInteger(n) || n < 0 || n > 500_000)`, and Save is only disabled for `annual === ""`. So "12,000" or "$12000" gets "Enter whole dollars, up to $500,000.", while every 17/18 money input strips symbols first (`text.replace(/[$,\s]/g, "")`). And a field holding only a space passes as `Number(" ") === 0`, which saves "Saved: $0 a year."
- Fix (16): parse like 17's `dollars`: strip `[$,\s]`, require `^\d+$`, cap at 500,000, and treat an empty result as invalid. Disable Save on `annual.trim() === ""`. Add tests for "12,000" and " ".

### R3V-4 (low): the weekly digest prints raw ISO dates while the app prints "Oct 15"

- Plans/tasks: 08 H8 `buildWeeklyDigest`; 16 P1 `format.ts` (`dateShort`).
- Mismatch: 08 writes `` `- ${i.title} (${i.minutes} min${i.dueOn ? `, due ${i.dueOn}` : ""})` `` and `` `- ${d.title}: ${daysLeftText(d.daysLeft)} (${d.dueOn})` ``, which come out as "due 2026-10-15". Every page formats the same field as `dateShort(d)`, giving "Oct 15" (UTC, no shift).
- Fix (08): add a local `dateShort(d: IsoDate)` in `plan/common.ts` that matches 16's (`Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })` over `${d}T00:00:00.000Z`), use it on both lines, and update the 08 digest test's expected text. 12 tests that assert digest text change with it.

### R3V-5 (low): six copies of the money formatter, and two of them don't round

- Plans/tasks: 04 D2 `formatUsd` (not exported); 07 `const usd = (n) => \`$${n.toLocaleString("en-US")}\``; 08 `plan/common.ts` `usd`; 10 `usd` (no `Math.round`); 15 `shared/format.ts` `usd` (Intl currency); 16 `lib/format.ts` `usd` (Intl currency); and an inline `` `$${r.gapUsd.toLocaleString("en-US")}` `` in a 15 Table test.
- Mismatch: the template forms print `$-500` for a negative number, while the Intl forms print `-$500`. 07 and 10 pass fractional numbers through unrounded (`$12.5`). Today every `Usd` is an int ≥ 0, so nothing shows wrong yet. But the brief asks for one formatter, and 15's comment "Same output as apps/web usd()" is a copy, not an import.
- Fix: 04 exports `formatUsd` from its index (Intl `en-US` USD with 0 fraction digits and `Math.round`). 07, 08, and 10 import it instead of their local copies, 16 `lib/format.ts` re-exports 15's `usd`, and the 15 test uses `usd`. Owners: 04 (export), 07/08/10/16 (imports).

### R3V-6 (medium): pending money and "in play" money still count applications whose deadline has passed

- Plans/tasks: 08 H4 `loadContext` (`pendingUsd`); 07 G5 `getBoard` (`totals.inPlayUsd`), G2 `liveListingWhere`; 16 P9 gap card; 17 Q21 `pendingLine`.
- Mismatch: 08 sums `amountMaxUsd` over `inArray(scholarshipApplications.stage, PENDING_STAGES)` (`["planned", "drafting", "submitted"]`) filtered only by `liveListingWhere(...)`. That filter checks scam flags, status, and visibility, but not `deadline`. 07 does the same for `if (open || app.stage === "submitted") board.totals.inPlayUsd += listing.amountMaxUsd`. A `planned` or `drafting` card whose deadline passed last week still shows on This Week as "Your open applications are worth $X. If they all come through, this year's gap…", and in 17 as "`$X in pending applications · gap $Y if they come through`", even though the student can no longer submit it. `submitted` should keep counting, because the decision is still pending.
- Fix: 08 `loadContext` keeps `submitted` as is and adds `or(isNull(scholarships.deadline), gte(scholarships.deadline, todayIn(now, tz)))` for `planned`/`drafting`, using the student's zone (`userTimeZone`). 07 `getBoard` applies the same `listing.deadline >= today` rule to open cards before adding to `inPlayUsd` (`today` is already computed there). Add one test each: a planned app due yesterday is left out of `pendingUsd` and `inPlayUsd`, and a submitted one due yesterday stays in.

### R3V-7 (medium): award year and season roll over on different days, so for two months the app's "current" FAFSA year doesn't match its season

- Plans/tasks: 06 F2 `shared/dates.ts` (`currentAwardYear` Oct 1, `currentSeason` Aug 1); 07 G8 `awardYearFor`/`archiveSeason`; 08 H6 `ensureChecklists`/`loadAidDeadlines`, H5 `plausibleAwardYear`; 17 Q23 `UploadLetter awardYear={currentAwardYear(...)}`; 18 R16 default year; 00 §9.4 comment.
- Mismatch: 06 says "`currentAwardYear`: Rolls over on October 1 (UTC): 2026-10-06 → \"2027-28\"" and "`currentSeason`: Rolls over on August 1 (UTC): 2026-10-06 → \"2026-27\"". 07 maps a season to its award year with `awardYearFor("2026-27") → "2027-28"`. From Aug 1 to Sep 30, a senior's season is "2026-27" (college list, archive), but 08 `ensureChecklists` and `loadAidDeadlines` use `currentAwardYear(now)`, which is "2026-27". So they build a 2026-27 FAFSA checklist, plus parent `fafsa_contributor` tasks titled for it. On Oct 1 they build a second 2027-28 checklist and a second set of parent tasks, and the first set never goes away. 17's upload form also defaults new award letters to "2026-27" in that window, while `archiveSeason` treats "2027-28" as this season's year.
- Fix (06 owns the rule): define `currentAwardYear(now)` as `awardYearFor(currentSeason(now))`. Move `awardYearFor` from 07 into `core/shared/dates.ts` and have 07 import it. Update 06's date test to cover 2026-08-15 → "2027-28" and 2026-07-31 → "2026-27", and change the 00 §9.4 comment to "Aug 1 rollover, the award year of the current season". 08 and 17/18 need no code change. If the Oct 1 FAFSA-opening date is wanted for copy, give it its own name (`fafsaOpensOn(awardYear)`).

### R3V-8 (low): the same enum gets different labels on different screens, and one map isn't exhaustive

- Plans/tasks: 08 H1 `APP_PLAN_LABELS`; 17 Q16 `PLAN_LABEL`, Q7 `STAGE_LABEL`, Q20 `FREE`; 18 R9 `PLAN_LABELS`/`STAGE_LABELS`, R12 `INCOME_OPTIONS`; 02 `INCOME_RANGE_LABELS`, `FREE_CATEGORIES`.
- Mismatch:
  - `AppPlan`: 08 has `RD: "Regular Decision", rolling: "Rolling admission"` (which shows up in deadline titles), 17 has `RD: "Regular", rolling: "Rolling"`, and 18 has `RD: "Regular Decision", rolling: "Rolling"`.
  - `ApplicationStage`: the student sees 17's `planned: "Working on", lost: "Didn't win"`, while a helper sees 18's `planned: "Planned", drafting: "Working on it", lost: "Not selected"`. 18 also types its map as `const STAGE_LABELS: Record<string, string>`, so a new stage would compile and render `undefined`.
  - Copies of domain values: 18 `INCOME_OPTIONS` copies `INCOME_RANGE_LABELS` by hand (16 derives it), and 17 `export const FREE: OfferLineCategory[] = ["grant", "scholarship"]` copies `FREE_CATEGORIES`.
  - A null scholarship deadline reads "Rolling" / "No deadline listed" on 17's detail page, "no deadline listed" in 17 search, and "Not posted" / "Check the sponsor's page" in 18's directory. `null` means unknown, so "Rolling" claims something nobody checked.
- Fix: 02 adds `APP_PLAN_LABELS: Record<AppPlan, string>` and `APPLICATION_STAGE_LABELS: Record<ApplicationStage, string>` next to the enums (taking 08's plan wording and 17's stage wording). 08, 17, and 18 import them, 18 imports `INCOME_RANGE_LABELS`, and 17 imports `FREE_CATEGORIES`. 17 Q8 shows "Not posted" for a null deadline, to match 18 R4 `deadlineLabel`.

### R3V-9 (low): five copies of "today", one unused UTC reader, and parents count days in their own zone

- Plans/tasks: 07 G1 `todayIn`, G2 `listPublicByState`; 08 H1 `todayIn`; 12 `todayIn`; 17 Q1 `viewer.ts` `todayIn`/`loadViewer`; 18 R4 `todayIso`; 00 §12 PU row.
- Mismatch:
  - `todayIn` is written out in 07, 08, 12, and 17, and 18 has `todayIso` on top of those. 17's copy also falls back to UTC on a bad zone, unlike the others.
  - 07 still ships `listPublicByState`, which is "open today in UTC" (`todayIn(deps.clock.now(), "UTC")`). Since F-18-4, 18 doesn't call it: the directory uses `searchScholarships` with `openOn` in Central. 00 §12 still maps PU to it.
  - 17's `loadViewer` sets `timeZone: me.user.timeZone`, the viewer's own zone, so a parent's `daysUntil(detail.deadline, now, v.timeZone)` can be off by one from the student-zone `daysLeft` that 08 puts on the same deadline.
- Fix: 06 exports one `todayIn(now, timeZone)` from `core/shared/dates.ts`. 07 and 08 import it, and 17/18 import it in server components. 07 deletes `listPublicByState` and its tests, and 00 §12 PU drops it. 17 `loadViewer` uses the student's `timeZone` (from `getFamily` members, or a `userTimeZone` read) for parents.

### R3V-10 (low): admin pages print raw UTC dates and raw enum values

- Plans/tasks: 18 R13 `admin/scholarships/page.tsx`, `ScholarshipEditor`; R14 `TaskReview`; R15 reports and audit; R16 aid editor.
- Mismatch: `` `Opened ${task.createdAt.slice(0, 10)}` ``, `` `Verified ${current.verifiedAt.slice(0, 10)}.` ``, `<td>{r.createdAt.slice(0, 10)}</td>`, and `` `Last checked ${verifiedAt.slice(0, 10)}` `` show the UTC calendar day in `YYYY-MM-DD`. An evening event in Chicago shows as the next day, and these screens don't use `instantShort` the way the other admin columns do. The scholarships table renders `{ key: "status", header: "Status" }` as the raw enum value ("draft", "stale"), the deadline uses `dateShort` with no year, and the audit page hard-codes `timeZone: "America/Chicago"` in `WHEN`.
- Fix (18): use `instantShort(iso, "America/Chicago")` (or `instantLong`) everywhere `.slice(0, 10)` is used on an `IsoDateTime`, add a `CATALOG_STATUS_LABELS: Record<CatalogStatus, string>` for the status column, and use `calendarLong` for admin deadlines. Picking one `ADMIN_TZ` constant is fine.

### R3V-11 (low): a skipped family task shows the same check icon as an "on" status

- Plans/tasks: 16 P19 `FamilyTasks.tsx` `pill`; 15 O6 `StatusPill`.
- Mismatch: `if (t.status === "skipped") return <StatusPill status="on" label="Skipped" />;`. The `on` entry is `{ label: "On", icon: "check", tone: "neutral" }`, so "Skipped" carries a check mark like done. 15's pills pair tone, icon, and text, and here the icon says the opposite of the text.
- Fix (16): render skipped as `<Badge tone="neutral" icon="info">Skipped</Badge>`. Or 15 adds a `skipped` `PillStatus` with a neutral, non-check icon, and 16 uses it.

### R3V-12 (low): award-year strings use an en dash in seeded and fixture titles

- Plans/tasks: 03 C7 seed (`title: "Start the 2027–28 FAFSA with Dana"`); 16 P19 `FamilyTasks` test fixture (`"Add your info to the 2027–28 FAFSA"`).
- Mismatch: `AwardYear` is `/^\d{4}-\d{2}$/` (hyphen), and 08 writes `detail` as `FAFSA <awardYear>`, which renders "FAFSA 2027-28". The seed and the 16 fixture use "2027–28", so dev data and tests show both forms.
- Fix: use the hyphen in 03's seed title and 16's fixture (update 16's `Mark done: …` button name assertion with it).

### R3V-13 (low): the age gate computes age from the UTC year alone

- Plans/tasks: 06 F13 onboarding age gate; 02 `OnboardingInput.birthYear`.
- Mismatch: `if (now.getUTCFullYear() - input.birthYear < MIN_AGE)`. A student born in December 2013 is 12 on 2026-10-06 but passes (2026 − 2013 = 13). And on Dec 31 after 6 pm Central the UTC year has already turned over.
- Fix (06): pick one rule and name it: block when `currentYear - birthYear < 13`, or when `currentYear - birthYear <= 13` (conservative), with `currentYear` from `todayIn(now, input.timeZone)`. Add a test for the boundary year. Round 4 should confirm the policy.

### R3V-14 (low): family tasks drop their due date and can show an empty assignee

- Plans/tasks: 16 P19 `FamilyTasks.tsx`; 06 F10 `listTasks`/`toTask`; 08 H6 `ensureChecklists` (`dueOn: item.dueOn`).
- Mismatch: `FamilyTask.dueOn: IsoDate.nullable()` is filled for aid-linked tasks (08 writes the FAFSA/CSS `dueOn`), but 16 renders only title, `detail`, and `t.assigneeName.split(" ")[0] || t.assigneeName`. So a parent never sees when "Give consent to share federal tax information" is due. 06 takes `assigneeName: users.displayName`, which is `''` for a parent who joined from an invite and hasn't set a name (R2I-3), so the tag renders empty. 16's member list already falls back with `m.displayName || m.email`.
- Fix: 16 shows `` dueOn ? `Due ${dateShort(dueOn)}` : null `` on each task. 06 `toTask` falls back to `unnamedInviter(role)` ("Your family member"/"Your student") when `displayName.trim()` is empty. Add one 16 test with a dated, nameless-assignee task.

### R3V-15 (low): the generated essay title can exceed `EssayInput.title`'s 200 characters

- Plans/tasks: 17 Q8 `[slug]/page.tsx` `StartEssayButton title=…`, Q7 `StartEssayButton`; 02 `EssayInput.title` (`max(200)`), `ScholarshipUpsertInput.name` (`max(200)`).
- Mismatch: `title={req.essays.length > 1 ? \`${detail.name} essay ${i + 1}\` : \`${detail.name} essay\`}`. A listing name longer than 192 characters (the catalog allows 200) makes `POST /essays` fail with 400. The college "Start essay" path already guards with `item.label.slice(0, 200)` (R2P-17).
- Fix (17): build the title as `` `${detail.name.slice(0, 186)} essay${n}` `` (or slice the final string to 200), and add a test with a 200-character name.

## Checked with no defect

- Enums: 03's `enums.test.ts` compares all 49 `pgEnum` value lists to the 02 `z.enum` `.options`, so they can't drift. The UI label maps for `CrewRole`, `JobStatus`, `JobKind`, `RoomKind`, `DocumentKind`, `FactSource`, `FactVisibility`, `ShareCategory`, `HelperScope`, `EssayStatus`, `EssayTarget`, `Fit`, `RecStatus`, `OfferStatus`, `OfferLineCategory`, `VerificationStatus`, `OutsidePolicy`, `CatalogTaskKind`/`Status`, `ReportReason`/`Status`, `AppStatus`, and `PlanItem.kind` are typed `Record<Enum, …>`. `StatusPill`'s `PILL` covers every `JobStatus` plus `on`.
- Calendar dates: every `date` column is `mode: "string"`. Every `dateShort`/`dateWithWeekday`/`calendarLong` call gets an `IsoDate` and formats in UTC, and every `instantShort`/`instantLong` call gets an `IsoDateTime`. No date-only field goes through `new Date()` without the `T00:00:00.000Z` suffix. 04's `daysUntil`/`weekStartFor` count local calendar days across DST.
- Core "today" (07 board, sweep, helper view; 08 deadlines, reminders, renewals, week) uses the student's `users.timeZone`. Usage months are UTC by design (06 `monthKey`).
- Money: every db money column is `int`, every domain field is `Usd` (int, 0..10M), and 04 floors gaps and costs at 0. Work-study and loans never count as free money (`categorizeOfferLine`, `FREE_CATEGORIES`), and the calculator path uses `grantsUsd`. Colleges with no cost are skipped in `getCosts` and left out of `compareMyOffers` (R2P-7), and the UI shows "Not estimated" for a null `gapUsd`. 04's rounding (`Math.round` on the monthly payment, `valuePerHour` to 2 decimals) is stated once and used by its own tests and by 17's client-side `retakeAnalysis`.
- Defaults: `notificationPrefs` (0/16/true/false/21/7) match between 00 §8, 06 `DEFAULT_PREFS`, and 16's fixtures. `users.timeZone`, `OnboardingInput.timeZone`, and 16 `DEFAULT_TIME_ZONE` all use `America/Chicago`. Fact visibility `crew`, essay target `general`, and `recRequests.message ''` (with a blank becoming `null` in `HelperView`) all line up. 02 output schemas have no `.optional()` fields except `ErrorBody.details` and the known `user_submission` draft/report.
- Text limits: the UI `maxLength`s match 02 for local submissions (200/1000), reports (1000), essay body (50,000), essay title and prompt (200/4,000), stories (120/4,000/40/2,000/400), rec requests (120/120/1,000), service logs (200/200/120/2,000), activities (100/50/100/60, plus the 150 code-point description through `countChars`), the composer (4,000), fact values (500), token labels (60), helper link labels (80), and onboarding fields. 03 has no length `check` constraints, so 02 is the single source.

## Summary

15 findings: 0 high, 4 medium (R3V-1, R3V-2, R3V-6, R3V-7), 11 low.
