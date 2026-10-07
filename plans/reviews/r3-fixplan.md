# Review round 3 fix plan

Coordinator: round 3 fixes (output and format). Inputs: `r3-events.md` (R3E-1..12), `r3-values.md` (R3V-1..15), `r3-api.md` (R3A-1..25), `review-log.md`, 00 §3, §5, §8–§14, and targeted reads of 02, 04, 06, 07, 08, 09, 10, 12, 13, 14, 16, 17, 18, 20, `docs/api/openapi.yaml`, and `docs/api/README.md`.

Counts: 52 findings: 1 high, 17 medium, 34 low (R3E 0/6/6, R3V 0/4/11, R3A 1/7/17). Four pairs are merged (R3E-1 with R3E-2, R3E-8 with R3V-4, R3V-15 with R3A-19, R3A-11 with R3A-23), which leaves **48 decisions**.

Lead decisions applied as given: R3E-3 (submit tools without `strict`, Zod retry once, union-count test), R3E-1 (SSE headers plus a 15 s `: ping`, which closes R3E-2), R3A-4 (non-strict response parsing in the extension), R3A-11 (`Retry-After` on every 429), R3V-7 (award year derived from the season, one helper in 02).

Rules for patch agents:

- Every name below is final. If a name conflicts with existing code, keep the name here, adapt the call site, and record it in the plan.
- Owners recount their own task and test totals and fix Success Criteria and Testing Requirements.
- "Owner" is the plan file that gets the change. A work package (R3-A..R3-E, §2) is the patch agent that edits those plans.
- This round adds no table, column, enum value, job name, or route. It adds one query parameter (`GET /account/exports/:id?format=md`) and one `LoopResult.reason` value (`invalid_submit`).
- Fixtures that assert changed text (dates in messages, plan and stage labels, the rate-limit message) are updated by the plan that owns the fixture.

---

## 1. Decisions

### R3E-1 + R3E-2 (M/L) SSE buffering and heartbeat

Fix: the job stream opts out of compression and proxy buffering, and writes a comment line every 15 s when nothing changed, so idle proxies don't close it.

Names:
- 14 N10 `stream.ts`: `SSE_HEADERS = { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "content-encoding": "none", "x-accel-buffering": "no", connection: "keep-alive" }`. Next 15's `next start` compresses through its bundled `compression` middleware, which skips a response that already has a `Content-Encoding` or has `Cache-Control: no-transform`. Both are set, so either alone is enough. 13 M2 keeps `compress` at its default; there's no `compress: false`.
- `JobEventTiming` gains `pingMs`: `DEFAULT_JOB_EVENT_TIMING = { pollMs: 1000, timeoutMs: 130_000, pingMs: 15_000 }`. New `export const SSE_PING = encoder.encode(": ping\n\n")`. The loop keeps `lastWriteAt` (set by every `send`). After a poll with no change, it writes `SSE_PING` when `Date.now() - lastWriteAt >= pingMs`.
- 00 §10 SSE paragraph and the README event-stream section add: "While nothing changes, the stream writes a `: ping` comment every 15 s; `EventSource` ignores it. The response sets `Cache-Control: no-cache, no-transform`, `Content-Encoding: none`, and `X-Accel-Buffering: no`."
- `docs/engineering/deployment.md` adds: "The job stream (`/api/v1/jobs/:id/events`) must not be buffered or compressed by the proxy. With nginx, honor `X-Accel-Buffering: no` or set `proxy_buffering off` for that path."
- 00 §14 Next.js note adds: "SSE: verify buffering under `next start` at execution, and behind the deploy proxy. `curl -N -H 'Accept-Encoding: gzip' …/events` must show a frame each second and no `Content-Encoding: gzip`. If a target browser rejects `Content-Encoding: none`, drop that header; `no-transform` alone stops Next's compression."

Owners: 14, 00 §10/§14, README, deployment.md.

Tests (14 `events.test.ts`):
- The first test asserts the new `cache-control`, `content-encoding`, and `x-accel-buffering` values.
- `parseFrames` drops blocks whose first line starts with `:`.
- New test: with `{ pollMs: 20, timeoutMs: 200, pingMs: 50 }` and a job that never changes, the raw text contains `: ping\n\n` at least twice, and the frames are `["job", "end"]`. events 5 → 6.

### R3E-3 (M) Strict-schema union limit

Fix (lead decision): submit tools are sent without `strict` and validated in code with the domain schema. Every other tool stays strict. A test keeps each request's strict schemas at 16 union or nullable nodes or fewer.

Names:
- 09 `model/types.ts`: `ToolDef.strict?: boolean` (default `true`). The same field goes on the 00 §9.5 `ToolDef` line.
- 09 I3 `toolParam(t)`: sends `strict: true` unless `t.strict === false`. When it's `false`, the `strict` key is left out. The schema is still `toStrictJsonSchema(t.input)`.
- 09 I5 `runCheckedAgentLoop`: the internal `submitTool` gets `strict: false`. `limits.ts` adds `MAX_SUBMIT_RETRIES = 1`.
  - An invalid submit input gets the existing `is_error` result, `Invalid <name> input. <formatIssues>`. That's the first 10 issues as `path: message`, and `formatIssues` now also caps the joined text at 2,000 characters.
  - A second invalid submit ends the loop with the new reason `"invalid_submit"`, added to `LoopResult.reason` here and in 00 §9.5.
  - Check-hook retries are counted separately, as they are today.
- 09 I12 `runCrewRequest`: on `invalid_submit` it logs `crew.invalid_submit` and returns `{ reply: partialReply(OUT_OF_TIME_TEXT, session.contributors()), status: "failed", safety: "partial", consulted }`.
  - 12 already completes a `failed` outcome without counting the request.
  - `runWeeklyPlan` already returns `{ items: [], reply: null }` for any reason other than submitted, which 12 turns into `PLAN_FAILED_TEXT`.
- 10 J3: the `Unfinished` type and `UNFINISHED_UNCERTAINTY` gain `invalid_submit: "My answer didn't pass the format check, so nothing in it is confirmed."`. Essay review, appeal, and retake already fall back on any reason other than submitted, so they only need to typecheck.
- 09 I2 `model/schema.ts`:
  - `export const STRICT_UNION_LIMIT = 16`.
  - `export function countStrictUnions(params: MessageCreateParams): number` counts nodes that have `anyOf` or an array `type`, across `tools` with `strict: true` plus `output_config.format.schema`.
  - The `toStrictJsonSchema` docstring adds "Model-facing schemas use `.nullable()` for absent values, never `.optional()`."
- 00 §9.5 prose: replace "Submit tools and every other tool are sent with `strict: true`…" with "Submit tools are sent without `strict`. The loop validates their input with the domain Zod schema, allows one retry, then ends with `invalid_submit`. Every other tool is sent with `strict: true` and an `input_schema` from `toStrictJsonSchema`."
- 00 §14 Anthropic bullet adds: "Verify strict-mode schema limits against current Anthropic docs at execution. The plan assumes at most 16 union-typed (`anyOf` or type-array) parameters across a request's strict schemas, and 09's `strictBudget.test.ts` enforces it."

Owners: 09, 10, 11 (test only), 00 §9.5/§14.

Tests:
- 09 `client.test.ts`: `toolParam({ ...tool, strict: false })` has no `strict` key, and the default has `strict: true`.
- 09 `loop.test.ts`:
  - The submit tool in `model.requests[0].tools` has `strict: false`.
  - An invalid submit followed by a valid one gives `submitted`.
  - Two invalid submits give `invalid_submit` after 2 requests, and the first `is_error` content contains `path: message`.
- 09 new `src/compass/strictBudget.test.ts`:
  - Builds the crew request (all seven `consult_*` tools from `createCompassSession(...).tools` over `createFakePort()`, the calculators, and `submit_reply`) and the weekly request (`submit_plan`) through `buildTurnParams`.
  - Asserts `countStrictUnions(params) <= STRICT_UNION_LIMIT` for each request, and that neither submit tool carries `strict`.
- 09 `crew.test.ts`: two invalid `submit_reply` inputs give status `failed`, text `OUT_OF_TIME_TEXT`, and safety `partial`.
- 10 `consult.test.ts`: two invalid `submit_result` inputs give `COULDNT_FINISH_SUMMARY` with the `invalid_submit` uncertainty line.
- 10 `definitions.test.ts`: for each role, a request built from its tools plus `submit_result` stays within the limit.
- 10 `offerParse.test.ts`: `buildExtractParams` for the offer-parse schema stays within the limit.
- 11 K5 `extract.test.ts`: the extraction request's `ListingDraft` format schema stays within the limit.

### R3E-4 (M) Receipt links and dates on non-catalog items

Fix: receipt items of kind `fact`, `record`, and `calculation` must carry `sourceUrl: null` and `verifiedAt: null`. A `record` whose ref resolves to a `known.catalog` entry follows the catalog rule.

Names:
- 09 I9 `guards/sources.ts` `receiptItemProblem`:
  - New internal `sourceFieldsProblem(item)` returns `Receipt "<label>" must use sourceUrl null and verifiedAt null.` unless both fields are null. It runs after the existing known-ref check for `fact`, `calculation`, and `record`.
  - A `record` whose ref resolves to a catalog entry (the lookup `isKnownRecord` already does) runs the `catalog` branch instead.
- No other change is needed downstream: `finish` already drops receipt items that have a problem, so a bad link never reaches 16 `Receipt`.

Owner: 09.

Tests (`sources.test.ts`, +2):
- A `fact` item with a `sourceUrl` fails, and the same item with both fields null passes.
- A `record` citing a listing with a wrong `verifiedAt` fails, and one with the catalog's values passes.

### R3E-5 (M) One long field fails the whole award-letter parse

Fix: parse with a looser shape, normalize, then validate with `ParsedOffer`, so bad fields are cut or dropped line by line instead of failing the letter.

Names:
- 10 J5 `offerParse.ts`: a local `RawParsedOffer` with the same keys as `ParsedOffer`, minus every length and range bound:
  - top level: `costOfAttendanceUsd: z.number().nullable()`, `awardYear: z.string().nullable()`, `lines: z.array(...)`.
  - each line: `z.string()`, `z.number()`, `OfferLineCategory`, `z.boolean()`, and `page: z.number().nullable()`.
  - It goes to `deps.model.extract`. Its strict JSON schema is the shape the API saw before, since `toStrictJsonSchema` already stripped the bounds.
- New exported `normalizeParsedOffer(raw: RawParsedOffer): ParsedOffer`:
  - trims `label` and cuts it to 120 characters (a line whose label ends up empty is dropped); cuts `renewalCondition` to 200 and `citedText` to 300.
  - `page` stays only when it's an integer ≥ 1, otherwise `null`.
  - drops a line unless `amountUsd` is an integer from 0 to 200,000, and keeps at most the first 40 lines.
  - `costOfAttendanceUsd` stays only when it's an integer from 0 to 200,000, and `awardYear` only when `AwardYear.safeParse` passes; otherwise `null`.
  - then runs `ParsedOffer.parse`, and logs `offer_parse.normalized` with the number of dropped lines when it's above 0.
- `OFFER_PARSE_INSTRUCTIONS`: "renewalCondition is the condition it prints, up to 200 characters, …".

Owner: 10.

Tests (J5, +1): a letter with a 250-character condition on a `page: 0` line, a line with `amountUsd: 12.5`, and a good line. The result keeps 2 lines: the condition cut to 200, `page` null, and the fractional line gone.

### R3E-6 (L) Quill quote occurrences counted two ways

Fix: 10 counts overlapping occurrences, like 07 and 17.

Names: 10 J4 `quoteOccurs` uses `from = at + 1`. Its docstring says "(overlapping, exact; same count as 07 `occurrenceIndex` and 17 `findOccurrence`)". A shared helper is deferred (§3).

Owner: 10.

Tests (J4): `quoteOccurs("ha ha ha ha", "ha ha", 3)` is true and `quoteOccurs("ha ha ha ha", "ha ha", 4)` is false. The existing cases still pass.

### R3E-7 (M) The SMS cut can drop the opt-out line

Fix: build the fixed parts first and shorten only the title.

Names: 06 F16 `deliverSms`:
- New constants `SMS_PREFIX = "ScholarCrew:"` and `SMS_OPT_OUT = "Reply STOP to opt out."`.
- `tail = [link, SMS_OPT_OUT].filter(Boolean).join(" ")`.
- `room = SMS_MAX - SMS_PREFIX.length - tail.length - 2`. The title is cut to `room - 1` characters plus "…" when it's longer than `room`.
- The text is `${SMS_PREFIX} ${title} ${tail}`, which is at most 300 characters.

Owner: 06.

Tests (06 notifications, +1): a 200-character title with a 45-character `appUrl` gives text that ends with `Reply STOP to opt out.`, contains the full link, and is at most 300 characters. The existing short-title test is unchanged.

### R3E-8 + R3V-4 (M/L) Messages print raw ISO dates; the verify-hours expiry is a UTC date

Fix: messages write calendar dates as "Oct 15", like the web screens. Instants are written in the student's time zone with the zone named.

Names:
- 06 F2 `shared/dates.ts` (00 §9.4 shared lines):
  - `calendarShort(d: IsoDate): string`: "2026-10-15" → "Oct 15", formatted in UTC like 16 `dateShort`.
  - `instantInZone(d: Date, timeZone: string): string`: "Oct 20, 2026, 8:00 PM CDT". It uses `Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone })` and replaces the narrow no-break space (`\u202f`) with a plain space, so the output doesn't change across ICU versions.
- 08 H8 `buildWeeklyDigest`: `, due ${calendarShort(i.dueOn)}` and `(${calendarShort(d.dueOn)})`.
- 12 L11 `reminders-deadlines.ts`:
  - The deadline body is `Due ${calendarShort(r.dueOn)}. Plan time for it this week.` (copy from R3E-9).
  - `renewalBody(dueOn)` prints `calendarShort(dueOn)` where it printed the ISO date; the rest of its text is unchanged.
- 07 G14 `requestVerification`:
  - Writes `${row.activity} on ${calendarShort(row.servedOn)}`.
  - Writes `The link expires ${instantInZone(expiresAt, studentTimeZone)}.`. `studentTimeZone` is the student's `users.timeZone`, read in the same query.
- 06 F18 `renderMarkdown`: the export keeps ISO dates (it's a record and needs the year). Fact dates use `todayIn(f.createdAt, timeZone)` in the student's zone instead of the UTC slice.

Owners: 06, 07, 08, 12, 00 §9.4.

Tests:
- 06 shared: `calendarShort("2026-10-15")` is `"Oct 15"`, and `instantInZone(new Date("2026-10-21T01:00:00.000Z"), "America/Chicago")` is `"Oct 20, 2026, 8:00 PM CDT"`.
- 07 G14 mail test: expects `on Oct 5` and the Central expiry.
- 08 digest expectations: `due Oct 15`.
- 12 L11: the renewal-body test and the deadline-body assertion.
- 06 export test: a fact created at `2026-10-07T02:00:00.000Z` shows `2026-10-06` for a Central student.

### R3E-9 (L) Reminder copy says "Open your week" but links elsewhere

Fix: the copy matches the link, and college reminders open the list entry.

Names: 12 L11:
- Copy is `Due <Oct 15>. Plan time for it this week.`
- `LINKS: Record<string, (refId: string) => string>` with `scholarship_application: () => "/scholarships"` and ``college_list: (id) => `/colleges/${id}` `` (08 sets `refId` to the entry id). The fallback stays `/week`.

Owner: 12.

Tests: the reminders test asserts that a college reminder links to `/colleges/<entryId>`.

### R3E-10 (L) Control characters in display names reach email subjects

Fix: refuse control characters in display names, and flatten newlines in every subject as a backstop.

Names:
- 02 B4 `profile.ts`: `export const DisplayName = z.string().trim().min(1).max(80).regex(/^[^\p{Cc}]*$/u, "Use letters, spaces, and punctuation")`. `ProfilePatch.displayName: DisplayName.optional()` and `OnboardingInput.displayName: DisplayName`.
- 06 F2: `resendEmailSender` and `devOutboxEmailSender` send `subject.replace(/[\r\n]+/g, " ")`.

Owners: 02, 06.

Tests:
- 02 profile test: rejects `"Maya\nLopez"` and trims `"  Maya "` to `"Maya"`.
- 06 shared test: a subject with `\r\n` reaches a stubbed `fetch` body, and the dev outbox row, with a single space instead.

### R3E-11 (L) The export is one JSON file and skips share settings and family tasks

Fix: serve the Markdown as its own download, and add the student's sharing choices and family tasks to the export.

Names:
- 06 F18 `collect`: `data` gains `shareSettings` (rows where `studentId = id`) and `familyTasks` (rows where `studentId = id` or `assigneeId = id`). `renderMarkdown` adds `## Sharing with family` (`- <category>: on|off`) and `## Family tasks` (`- <title> (<status>)`).
- 13 M14 `account/exports/[id]/route.ts`:
  - `?format=md` returns `file.markdown` with `text/markdown; charset=utf-8` and filename `scholarcrew-export-<date>.md`.
  - A missing `format` or `format=json` returns the JSON as today. Any other value is 400 `invalid_input`.
- 16 P17 `DataCard`: a second link, "Download as Markdown", to `/api/v1/account/exports/<id>?format=md`.
- openapi `getExport`: a `format` query parameter (`enum: [json, md]`) and a `text/markdown` response. The README "Downloads" section names both formats.

Owners: 06, 13, 16, openapi, README.

Tests:
- 06 export test: both new keys and both headings.
- 13 account test: `?format=md` has the Markdown content type and filename, and the body starts with `# ScholarCrew export`; `?format=pdf` is 400.
- 16 DataCard test: the Markdown link's `href`.

### R3E-12 (L) No money or date style in the prompts; the demo model prints ISO dates

Fix: one style line in the prompts, and the demo model formats dates.

Names:
- 09 I11 `COMPASS_SYSTEM` "The reply" section and 10 J1 `RULES` add: `- Write money as whole dollars with commas ($12,345) and dates as month and day (Oct 15); add the year only when it isn't this school year.`
- 12 L3 `describeDeadline`: `` `${d.title} on ${calendarShort(d.dueOn)} (${daysText(d.daysLeft)})` ``, with `calendarShort` from `@scholarcrew/core/shared` (R3E-8).

Owners: 09, 10, 12.

Tests:
- The 09 prompt test checks for `($12,345)`.
- The 10 definitions test checks that every specialist prompt contains it.
- Any 12 L3 demo-reply expectation that names a date uses `Oct <d>`.

### R3V-1 (M) A student-submitted listing shows "$0"

Fix: 17 shows the amount as unknown while the listing is still a draft. Only a student's own submissions are visible as drafts.

Names: 17:
- New `UNKNOWN_AMOUNT = "Amount not known yet"` in `scholarships/board.ts`.
- The board card shows it when `s.status === "draft"` and the card isn't a won card with `outcomeUsd`.
- The Q8 detail page shows it instead of `amountLabel(...)` when `detail.status === "draft"`.
- No data change: 07 keeps the zeros, and a published $0 listing still reads "$0".

Owner: 17.

Tests: one BoardView test (a draft card shows the text and no "$0") and one DetailPage test.

### R3V-2 (M) Signed-in search lists closed listings

Fix: the student search filters on the student's today.

Names: 17 Q6 `scholarships/page.tsx` calls `searchScholarships(v.deps, v.actor, { q, page: 1, pageSize: 20, openOn: todayIn(v.deps.clock.now(), v.timeZone) })`, with `todayIn` from `components/scholarships/viewer.ts`.

Owner: 17.

Tests: the page test asserts the `openOn` argument (`"2026-10-06"` at `TEST_NOW`). 07's search tests already cover the SQL filter.

### R3V-3 (L) The family budget refuses "12,000" and saves a space as $0

Fix: parse the budget like 17's money inputs.

Names: 16 P19 `ParentSpace`:
- New local `parseDollars(text: string): number | null` strips `[$,\s]`, requires `^\d+$`, and caps at 500,000. An empty result is invalid.
- Save is disabled when `annual.trim() === ""`.

Owner: 16.

Tests: "12,000" saves `12000`, and " " leaves Save disabled.

### R3V-5 (L) Several copies of the money formatter, and two don't round

Fix: core and agents share one exported formatter. The web copies already produce the same output (§3).

Names:
- 04 D2 `formatUsd(n)` becomes `USD.format(Math.round(n))`, where `USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })`. It's exported from `src/index.ts` and listed in 00 §9.2.
- 07 (`const usd`), 08 `plan/common.ts` `usd`, and 10 `usd` are deleted, and their call sites import `formatUsd` from `@scholarcrew/engines`.

Owners: 04, 07, 08, 10, 00 §9.2.

Tests:
- 04: `formatUsd(-500)` is `"-$500"`, and `formatUsd(12.5)` is `"$13"`.
- 04 index test: lists the export.
- The 07, 08, and 10 expectations stay the same, since every input is an integer of 0 or more.

### R3V-6 (M) Pending and in-play money count applications past their deadline

Fix: `planned` and `drafting` applications count only while the listing is undated or due today or later, in the student's zone. `submitted` always counts.

Names:
- 08 H4 `loadContext` pending query adds `or(eq(scholarshipApplications.stage, "submitted"), isNull(scholarships.deadline), gte(scholarships.deadline, today))`, with `today = todayIn(now, userTimeZone)`.
- 07 G5 `getBoard`: an open card adds to `totals.inPlayUsd` only when `listing.deadline === null || listing.deadline >= today`. The card itself stays on the board.
- 00 §9.4 money and scholarships notes say so.

Owners: 07, 08, 00 §9.4.

Tests: one each in 08 costs and 07 board. A `planned` application due yesterday is left out of `pendingUsd` and `inPlayUsd`; a `submitted` one due yesterday stays in.

### R3V-7 (M) Award year and season roll over on different days

Fix (lead decision): the award year is always the award year of the current season. One helper in 02 maps a season to its award year.

Names:
- 02 B1 `common.ts`: `export function awardYearFor(season: string): AwardYear`, next to `AwardYear`. For example, "2026-27" → "2027-28" and "2099-00" → "2100-01".
- 06 F2: `currentAwardYear(now) = awardYearFor(currentSeason(now))`, with the docstring "Aug 1 rollover (UTC): the award year of the current season."
- 07 G8 deletes its own `awardYearFor` and imports it from `@scholarcrew/domain`.
- 19 S4 `support/admin.ts`: `awardYearOn(now) = awardYearFor(seasonOn(now))`, imported from `@scholarcrew/domain` (19 adds the dependency if it's missing). The comment naming the Oct 1 rollover is replaced.
- 00 §9.4: `currentAwardYear(now: Date): string; // Aug 1 rollover: the award year of currentSeason(now); 2026-08-15 → "2027-28"`.
- 08, 17, and 18 need no code change. If FAFSA-opening copy ever needs Oct 1, it gets its own name.

Owners: 02, 06, 07, 19, 00 §9.4.

Tests:
- 02 common: `awardYearFor`, 2 cases (moved from 07 G8).
- 06 shared: the "rolls the award year on October 1" test becomes "follows the season". `2026-07-31T23:59:59.000Z` → "2026-27", `2026-08-01T00:00:00.000Z` → "2027-28", and `2026-10-06` → "2027-28".
- 07 G8: drop the moved assertions.

### R3V-8 (L) The same enum gets different labels on different screens

Fix: one label map per enum, in 02 next to the enum. Copies of domain values are replaced with imports.

Names:
- 02:
  - B4 `colleges.ts`: `export const APP_PLAN_LABELS: Record<AppPlan, string>`, using 08's wording ("Regular Decision", "Rolling admission").
  - B3 `scholarships.ts`: `export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string>`, using 17's wording (`planned`/`drafting` "Working on", `lost` "Didn't win").
- 08 H1: deletes its `APP_PLAN_LABELS` and imports the 02 map. Deadline titles don't change.
- 17:
  - Q16 `PLAN_LABEL` and Q7 `STAGE_LABEL` become the 02 maps; keep the local names as `const PLAN_LABEL = APP_PLAN_LABELS` if that's simpler.
  - Q20 `FREE` becomes `FREE_CATEGORIES`.
  - Q8 shows "Not posted" for a null deadline, matching 18 R4 `deadlineLabel`.
- 18:
  - R9 `PLAN_LABELS` and `STAGE_LABELS` become the 02 maps; `?? s.stage` is dropped, since the map is total.
  - R12 `INCOME_OPTIONS` is built from `INCOME_RANGE_LABELS`.

Owners: 02, 08, 17, 18.

Tests:
- 02 index test: lists the two new exports.
- 17 and 18 tests that assert "Regular", "Rolling", "Planned", "Working on it", or "Not selected" switch to the 02 wording.
- 17 DetailPage: a null deadline reads "Not posted".

### R3V-9 (L) Copies of "today", an unused UTC reader

Fix: core and the worker share one `todayIn`, and the dead `listPublicByState` is deleted.

Names:
- 06 F2 `shared/dates.ts`: `export function todayIn(now: Date, timeZone: string): IsoDate` (07's implementation), listed in 00 §9.4.
- 07 G1 and 08 H1 delete their copies and import it from `../shared`. 12 deletes its copy and imports it from `@scholarcrew/core/shared`.
- 07 G2 deletes `listPublicByState` and its test. 00 §9.4 drops it, and the 00 §12 PU row becomes "07 (`searchScholarships` with `openOn`), 14 (public route), 18".
- The web copies (17 `viewer.ts` `todayIn`, 18 `todayIso`) stay, and so does the parent-zone part (§3).

Owners: 06, 07, 08, 12, 00 §9.4/§12.

Tests:
- 06 shared: `todayIn(new Date("2026-10-07T03:00:00.000Z"), "America/Chicago")` is `"2026-10-06"`.
- 07 drops the state-directory test, and its owner recounts.

### R3V-10 (L) Admin pages print raw UTC dates and raw enum values

Fix: admin instants use the Central-calendar formatter 18 already has, and statuses get labels.

Names: 18 R13–R16:
- Every `.slice(0, 10)` on an `IsoDateTime` (`task.createdAt`, `task.resolvedAt`, `current.verifiedAt`, `r.createdAt`, the aid `verifiedAt`) becomes `instantLong(iso, ADMIN_TZ)` from `components/public/dates.ts`.
- New `ADMIN_TZ = "America/Chicago"` in `components/admin`, also used by the audit `WHEN`.
- The scholarships table status column renders `CATALOG_STATUS_LABELS: Record<CatalogStatus, string>` = `{ draft: "Draft", published: "Published", stale: "Needs re-check", retired: "Retired", flagged: "Flagged" }`.
- Admin deadlines use `calendarLong`.

Owner: 18.

Tests: the admin scholarships page test asserts "Draft" and a `calendarLong` deadline, and the TaskReview test asserts `Opened Oct 6, 2026`.

### R3V-11 (L) A skipped family task shows a check mark

Names: 16 P19 `FamilyTasks.tsx`: `skipped` renders `<Badge tone="neutral" icon="info">Skipped</Badge>`. 15 is unchanged.

Owner: 16.

Tests: the FamilyTasks test checks that a skipped task has no check icon.

### R3V-12 (L) Award years with an en dash in seed and fixture titles

Names: 03 C7 seed: "Start the 2027-28 FAFSA with Dana", with a hyphen, including any other `20xx–yy` string in seed titles. 16 P19 FamilyTasks fixture: "Add your info to the 2027-28 FAFSA", plus its `Mark done: …` button-name assertion.

Owners: 03, 16.

Tests: the 03 seed test, if it asserts the title, and the 16 fixture assertion.

### R3V-13 (L) The age gate uses the UTC year

Fix: compute the year in the student's zone, and name the rule. The policy itself stays "13 or older by birth year" (see §3 and the open doubt).

Names: 06 F13:
- New `isUnderMinAge(birthYear: number, today: IsoDate): boolean` returns `Number(today.slice(0, 4)) - birthYear < MIN_AGE`.
- `completeOnboarding` calls it with `todayIn(now, input.timeZone)`, after the time-zone check moves above the gate. An invalid zone is still `invalid_input`.

Owner: 06.

Tests (06 F13, +1): at `2027-01-01T03:00:00.000Z` (Dec 31, 9 pm Central) a Central student born in 2014 is blocked, because the local year is 2026; the UTC rule would have let them through. Birth year 2013 at `2026-10-06` still passes.

### R3V-14 (L) Family tasks drop their due date and can show an empty assignee

Names:
- 16 P19 `FamilyTasks.tsx`: shows `` `Due ${dateShort(t.dueOn)}` `` when `t.dueOn` is set.
- 06 F10 `listTasks`/`presentTasks`: `assigneeName` is `displayName.trim() || unnamedInviter(assigneeRole)` ("Your family member" for a parent, "Your student" otherwise).

Owners: 06, 16.

Tests:
- 06 family settings: a nameless parent assignee lists as "Your family member".
- 16 FamilyTasks: a dated task shows "Due Oct 15", and a nameless assignee renders the fallback.

### R3V-15 + R3A-19 (L/M) The generated essay title can pass 200 characters

Fix: cut the title at the single place it's sent.

Names: 17 Q7 `StartEssayButton` sends `title: title.slice(0, 200)` (the prompt is already within its limit). Both Q8 call sites stay as they are.

Owner: 17.

Tests: a 200-character listing name produces a `POST /essays` body whose `title` is 200 characters long and starts with the name.

### R3A-1 (H) openapi `HelperView` has no `request`

Names: openapi `HelperView` adds `request` to `required` and to `properties`. `request` is an object with `required: [message, dueDate]`, `message: { type: [string, "null"] }`, and `dueDate: { type: [string, "null"], format: date }`.

Owner: openapi.

Tests: the R3-C strict YAML parse and `$ref` check (see R3A-3). 14's helper-view test already returns the field.

### R3A-2 (M) openapi `user_submission` payload lacks `draft` and `report`

Names: openapi `CatalogTaskPayloadUserSubmission` adds two optional properties (not in `required`): `draft: { oneOf: [{ $ref: "#/components/schemas/ListingDraft" }, { type: "null" }] }` and `report: { oneOf: [{ $ref: "#/components/schemas/VerificationReport" }, { type: "null" }] }`.

Owner: openapi.

Tests: the R3-C parse check.

### R3A-3 (M) Duplicate `"404"` key in `deleteAidDeadline`

Fix: delete the second `"404"` line under `DELETE /admin/aid-deadlines/{id}`.

Owner: openapi.

Tests: R3-C runs a strict parse that fails on duplicate keys: `npx --yes @redocly/cli lint docs/api/openapi.yaml`, or `node -e "require('js-yaml').load(require('fs').readFileSync('docs/api/openapi.yaml','utf8'))"`. It's recorded in the review-log entry.

### R3A-4 (M) The extension rejects additive response fields

Fix (lead decision): the extension parses responses with non-strict copies of the domain schemas, so unknown keys are stripped and never rejected.

Names: 20 T3 `api.ts`:
- `AutofillProfileResponse = z.object({ ...AutofillProfile.shape, activities: z.array(z.object(Activity.shape)) })`.
- `ScholarshipSummaryResponse = z.object(ScholarshipSummary.shape)`.
- `getAutofillProfile` and `savePage` parse with these. Enum and type checks stay strict.
- The openapi sentence "new response fields can appear within v1" stays.

Owner: 20.

Tests (20 `api.test.ts`): the `extra: true` save-page test now expects success, with `extra` absent from the result. A new autofill test with an extra top-level key and an extra key on one activity succeeds and strips both. api 9 → 10.

### R3A-5 (L) openapi leaves defaulted response fields optional

Names: openapi:
- `NetPriceByIncome`, `CollegeDeadlines`, and `CollegeRequirements` list every property in `required`.
- `LocalArea`, which is also a request body, gets the description "`counties` and `cities` default to `[]` in requests and are always present in responses."

Owner: openapi.

Tests: the parse check.

### R3A-6 (L) The success-status convention isn't stated in 00 §10 or 13's rules

Names: the 00 §10 intro and 13's rules line add "Creates return 201 (`json(x, 201)`), job starts return 202 (`json(job, 202)`), `undefined` returns 204, and everything else returns 200."

Owners: 00 §10, 13.

Tests: none (doc).

### R3A-7 (L) The `forbidden` description leaves out role refusals

Names: README errors row and openapi `responses.Forbidden`: "`forbidden`: the Origin check failed, the token lacks the scope, or your role can't do this (for example a parent onboarding, or a student setting the family budget). Under-13 onboarding adds `details.reason: "underage"`."

Owners: README, openapi.

Tests: none.

### R3A-8 (L) The `internal` message is "always" "Something went wrong"

Names: README errors row and openapi `responses.Internal`: "Unhandled errors say 'Something went wrong'. A few configuration errors, such as billing not set up, carry their own message."

Owners: README, openapi.

Tests: none.

### R3A-9 (L) The README names the first `X-Forwarded-For` hop

Names: README "Rate limits": "signed-out callers by the right-most `X-Forwarded-For` hop (the one your proxy appends), then `X-Real-IP`."

Owner: README.

Tests: none.

### R3A-10 (L) The README says a big upload is 400

Names: README "Uploads": "Anything else or an empty file is 400 `invalid_input`; a file over 10 MB is 413 `invalid_input`."

Owner: README.

Tests: none.

### R3A-11 + R3A-23 (L) No `Retry-After`, and every limit says "a few minutes"

Fix (lead decision): every 429 sends `Retry-After` in seconds, taken from the limiter window. The message names the real wait, which also fixes 18's offer tool without a client branch.

Names:
- 06 `ratelimit` `consumeRateLimit`:
  - `returning({ count: rateLimits.count, windowStart: rateLimits.windowStart })`.
  - Over the limit, `retryAfterSeconds = Math.max(1, Math.ceil((windowStart.getTime() + i.windowSeconds * 1000 - now.getTime()) / 1000))`.
  - It throws `AppError("rate_limited", message, { retryAfterSeconds })` with the message `Too many requests. Try again in <waitText(retryAfterSeconds)>.`
  - New exported `waitText(s)`: "a minute" up to 60 s, `"<n> minutes"` under an hour (rounded up), then `"<n> hour(s)"` (rounded up).
- 13 M4 `errorResponse`: for `code === "rate_limited"` with a numeric `details.retryAfterSeconds`, it sets `retry-after: String(retryAfterSeconds)` on the response. CORS responses keep their headers.
- openapi `responses.RateLimited`: "`rate_limited`: too many requests in the window. `Retry-After` gives the seconds until the window ends, also in `details.retryAfterSeconds`." It adds a `Retry-After` header object (integer).
- README "Rate limits": "Over the limit is 429 `rate_limited` with `Retry-After` (seconds) and `details.retryAfterSeconds`."
- 00 §3 adds a line under the error table: "429 responses carry `Retry-After` in seconds."
- 18 R6 `OfferTool` needs no branch; the server message now says "Try again in 47 minutes".

Owners: 06, 13, openapi, README, 00 §3.

Tests:
- 06 ratelimit +1: with limit 2 and a 600 s window, the third call throws `details.retryAfterSeconds` 600 and the message "Try again in 10 minutes."; 100 s later it's 500 and "9 minutes".
- 13 http +1: `errorResponse` of that error has `retry-after: "600"`.
- 13 M7 magic-link rate test asserts `retry-after` matches `/^\d+$/`.

### R3A-12 (L) 00 §10 and the README drift from the routes

Names:
- 00 §10:
  - The `GET /family/budget` response is "FamilyBudget or null".
  - The `/scholarships` query list adds `pageSize` (1–50, default 20) and `excludeScams`.
  - The `POST /actions/apply` response adds "409 `conflict` while another apply of the card is running; 400 for memory cards in temporary rooms".
- README "Pagination" adds a `GET /admin/scholarships` row (`page`; fixed at 50 per page).

Owners: 00 §10, README.

Tests: none.

### R3A-13 (M) Sign-out leaves for `/sign-in` even when it failed; an expired session can't clear its cookie

Fix: sign-out always clears the cookie, and the clients leave only when sign-out worked.

Names:
- 13 M7 `auth/sign-out/route.ts`: `route({ auth: "optional" }, …)`, which keeps the Origin check. `const token = parseCookie(req.headers.get("cookie"), SESSION_COOKIE); if (token) await signOut(deps, token);`. It always returns 204 with `clearSessionCookie()`. 00 §10's row reads "optional (Origin check) · 204, always clears cookie".
- 16 P16 `AccountCard.signOut` and 18 R11 `AdminFrame.signOut`: navigate to `/sign-in` on success, or on `e instanceof ApiError && e.code === "unauthenticated"`. On any other error, show `errorMessage(e)` in an Alert and stay; no `finally` and no swallowed `catch`.

Owners: 13, 16, 18, 00 §10.

Tests:
- 13 auth +1: an expired session cookie gets 204 and the clearing `Set-Cookie`.
- 16 cards +1: a 500 from sign-out shows the message and doesn't navigate.
- 18 AdminFrame +1: the same.

### R3A-14 (L) Client fixtures fake statuses 14 never returns

Names:
- 16 P12 `Thread.test.tsx` `stubSend` and the open-room fake: 202 for `POST /conversations/:id/messages`, and 201 only for `POST /conversations`.
- 16 P11 ReplyCard apply fake: 200.
- 17 Q2 `ContextCrew.test.tsx`: 202 for the message send.

Owners: 16, 17.

Tests: the fixtures themselves; counts don't change.

### R3A-15 (M) Apply conflicts and temporary-room refusals aren't documented, and the card stays clickable

Fix: document the 409 and the 400, and treat a conflict as "already being applied" in the UI.

Names:
- openapi `applyActionCard`: adds `"409": Conflict` ("Another apply of this card is still running; retry in a minute."). The `400` description adds "memory cards (`confirm_fact`, `record_decision`) in temporary chats".
- README "Action cards": the same two sentences, and "Retrying after a timeout is safe" becomes "Retrying after a timeout is safe; a retry within a minute may get 409 while the first apply finishes."
- 16 P11 `ReplyCard.apply`: on `e instanceof ApiError && e.code === "conflict"`, it shows the status text "Already being added…", disables the card's button, and calls `router.refresh()`. Other errors behave as today.

Owners: openapi, README, 16.

Tests: 16 ReplyCard +1. A 409 shows "Already being added…", calls refresh, and shows no error alert.

### R3A-16 (L) openapi `requestEssayReview` lacks the 400

Names: openapi `/essays/{id}/review` adds `"400": BadRequest`, described as "the essay has no saved version yet".

Owner: openapi.

Tests: the parse check.

### R3A-17 (M) Onboarding branches on 403 and has no path for 409

Fix: the under-13 refusal carries a reason, and the client branches on codes.

Names:
- 06 F13: the gate throws `new AppError("forbidden", "ScholarCrew is for students 13 and older", { reason: "underage" })`.
- 16 P15 onboarding `submit`:
  - Blocks and clears the draft only when `e instanceof ApiError && e.code === "forbidden" && (e.details as { reason?: string } | undefined)?.reason === "underage"`.
  - On `e.code === "conflict"`, calls `clearDraft()`, then `router.push("/week")` and `router.refresh()`.
  - Anything else shows `errorMessage(e)` and keeps the draft.

Owners: 06, 13 (test), 16.

Tests:
- 06 F13 and 13 M8: the under-13 test asserts `details: { reason: "underage" }`.
- 16 onboarding +2: a 409 clears the draft and pushes `/week`; a 403 with no reason (CSRF) keeps the draft and shows the message.

### R3A-18 (L) Onboarding and profile fixtures return `{}`

Names: 16 P15's `POST /onboarding` fake returns a minimal valid `MeResponse` (`{ user, profile, onboardingComplete: true, family: null, plan }`). 16 P16's `PATCH /profile` fake returns a minimal valid `Profile`. Both are built from the existing fixtures.

Owner: 16.

Tests: the fixtures; counts don't change.

### R3A-20 (L) 17 fixtures: one status for POST and PATCH, and the wrong list-cap message

Names:
- 17 Q7 `detail.test.tsx` fake answers 201 when `init.method === "POST"`, else 200.
- 17 Q17 `AddCollegeModal.test.tsx` uses 07's text `Your list holds up to 25 colleges. Remove one to add another.` in the fake and its assertion.

Owner: 17.

Tests: the fixtures; counts don't change.

### R3A-21 (L) Admin resolve calls don't handle 409

Names: 18 R14 `TaskReview.run` and R15 `ReportsTable.close`: on `e instanceof ApiError && e.code === "conflict"`, they show the server message, mark the item closed (buttons disabled), and call `router.refresh()`. Replace the comment "A retry repeats both safely" with "A retry of the resolve after a lost response gets 409; the item is shown closed."

Owner: 18.

Tests: TaskReview +1 and ReportsTable +1. A 409 disables Publish/Reject (or Resolve/Reject), shows the message, and refreshes.

### R3A-22 (L) The CSV import fakes the over-size refusal as 400, and `postCsv` has no 413 fallback

Names: 18 R15: the test fake answers 413. `postCsv` adds `if (res.status === 413) throw new ApiError("invalid_input", TOO_BIG, 413)` before the generic fallback, as `OfferTool` does.

Owner: 18.

Tests: the existing over-size test now uses 413, plus +1 for a 413 with no `ErrorBody` showing `TOO_BIG`.

### R3A-24 (L) Admin note and county fields have no client limit

Names: 18 R13/R14/R15:
- `maxLength={1000}` on the TaskReview "Decision note", the ReportsTable note, and the ScholarshipEditor "Note for the audit log".
- `maxLength={100}` on the ResearchForm county.

Owner: 18.

Tests: one assertion per form in the existing tests (attribute present); counts don't change.

### R3A-25 (L) `filename*` leaves `'()*` unescaped

Names: 13 M4 `contentDisposition`: ``filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}``. The ASCII `filename=` fallback is unchanged.

Owner: 13.

Tests: the `fileResponse` test adds `"Maya's essay (final).pdf"`, expecting `filename*=UTF-8''Maya%27s%20essay%20%28final%29.pdf`.

### Carry-over (not counted): 17's 402 alerts still lack "See plans"

`r3-api.md` noted that the review-log follow-up (line 381) is still open. 17 adds `isLimit(e)` with `<Button variant="soft" size="sm" href="/settings">See plans</Button>` next to the 402 alert in `CommentsPanel`, `AppealButton`/`JobReply`, and `RetakeForm`, and updates its rules line 28. One 402 test per component that has one; otherwise an assertion in the existing error test.

---

## 2. Work packages

Each package edits only its files. Names come from §1. Packages can run in parallel: the only cross-package dependencies are names, and those are fixed here. Each package records its rows in `review-log.md` under "Round 3 R3-x fixes".

### R3-A: 02, 03, 04, 05, 06, 07, 08, with 00 §8/§9.1–§9.4

Findings: R3E-7, R3E-8, R3E-10, R3E-11, R3V-5, R3V-6, R3V-7, R3V-8, R3V-9, R3V-12, R3V-13, R3V-14, R3A-11, R3A-17.

- 02:
  - B1 `common.ts`: `awardYearFor(season)` (R3V-7).
  - B4 `profile.ts`: `DisplayName`, used by `ProfilePatch.displayName` and `OnboardingInput.displayName` (R3E-10).
  - B4 `colleges.ts`: `APP_PLAN_LABELS`; B3 `scholarships.ts`: `APPLICATION_STAGE_LABELS` (R3V-8).
  - Tests: common, profile, index.
- 03: C7 seed titles use the hyphenated award year (R3V-12).
- 04: D2 `formatUsd` in Intl form, exported from the index (R3V-5); 00 §9.2 lists it.
- 05: no change.
- 06:
  - F2 `shared/dates.ts`: `calendarShort`, `instantInZone`, `todayIn`, and `currentAwardYear` through `awardYearFor` (R3E-8, R3V-9, R3V-7).
  - F2 email senders flatten subject newlines (R3E-10).
  - `consumeRateLimit` gets `retryAfterSeconds` and the `waitText` message (R3A-11).
  - F10 `listTasks` falls back to `unnamedInviter` for nameless assignees (R3V-14).
  - F13: `isUnderMinAge` with the local year (R3V-13), and `details: { reason: "underage" }` (R3A-17).
  - F16 `deliverSms` keeps the opt-out line (R3E-7).
  - F18 `collect` adds `shareSettings` and `familyTasks`; the Markdown gets two sections and local fact dates (R3E-11, R3E-8).
- 07:
  - G1 imports `todayIn`.
  - G2 deletes `listPublicByState` and its test (R3V-9).
  - G5 `getBoard` adds the `inPlayUsd` deadline rule (R3V-6).
  - G8 imports `awardYearFor` from domain (R3V-7).
  - G14 verify-hours mail uses `calendarShort` and `instantInZone` in the student's zone (R3E-8).
  - Imports `formatUsd` (R3V-5).
- 08:
  - H1 imports `APP_PLAN_LABELS` from domain (R3V-8) and `todayIn` (R3V-9).
  - H4 `loadContext` gets the pending deadline rule (R3V-6).
  - H8 digest uses `calendarShort` (R3E-8).
  - `plan/common.ts` imports `formatUsd` (R3V-5).
- 00 §9.4:
  - shared lines: `calendarShort`, `instantInZone`, `todayIn`, and the `currentAwardYear` comment.
  - `consumeRateLimit` throws `rate_limited` with `details.retryAfterSeconds`.
  - `listPublicByState` removed.
  - money and scholarships notes for R3V-6.
- 00 §8 and §9.1: no change.

### R3-B: 09, 10, 11, 12, with 00 §9.5/§9.6/§14

Findings: R3E-3, R3E-4, R3E-5, R3E-6, R3E-8 (12), R3E-9, R3E-12, R3V-5 (10), R3V-9 (12), R3E-1 (00 §14 note).

- 09:
  - `ToolDef.strict?`; `toolParam` honors it.
  - The loop's submit tool is `strict: false`, with `MAX_SUBMIT_RETRIES = 1`, reason `invalid_submit`, and `formatIssues` capped at 2,000 characters.
  - `runCrewRequest` returns `failed` on `invalid_submit`.
  - `STRICT_UNION_LIMIT`, `countStrictUnions`, and new `strictBudget.test.ts` (R3E-3).
  - I9 `sourceFieldsProblem` (R3E-4).
  - The `COMPASS_SYSTEM` style line (R3E-12).
- 10:
  - `Unfinished`/`UNFINISHED_UNCERTAINTY` gain `invalid_submit`, plus the union-count tests (R3E-3).
  - J5 `RawParsedOffer`, `normalizeParsedOffer`, and the instruction line (R3E-5).
  - J4 `quoteOccurs` counts overlapping (R3E-6).
  - J1 `RULES` style line (R3E-12).
  - `usd` replaced by `formatUsd` (R3V-5).
- 11: K5 union-count assertion for `ListingDraft` (R3E-3). No code change.
- 12:
  - L11: `calendarShort` in bodies, new copy, and the `LINKS` functions with `/colleges/<entryId>` (R3E-8, R3E-9).
  - L3 `describeDeadline` uses `calendarShort` (R3E-12).
  - Imports `todayIn` from `@scholarcrew/core/shared` (R3V-9).
- 00 §9.5: `ToolDef.strict?`, `LoopResult.reason` adds `invalid_submit`, and the submit-tool prose.
- 00 §9.6: no change.
- 00 §14: the Anthropic strict-limit note (R3E-3) and the Next.js SSE verification note (R3E-1).

### R3-C: 13, 14, docs/api/openapi.yaml, docs/api/README.md, with 00 §3/§10

Findings: R3E-1/R3E-2, R3E-11, R3A-1, R3A-2, R3A-3, R3A-5, R3A-6, R3A-7, R3A-8, R3A-9, R3A-10, R3A-11, R3A-12, R3A-13, R3A-15, R3A-16, R3A-17 (13 test), R3A-25.

- 13:
  - rules line: the 202 convention (R3A-6).
  - M4 `errorResponse` sets `retry-after` (R3A-11), and `contentDisposition` escapes `'()*` (R3A-25).
  - M7 sign-out is `auth: "optional"` and always clears the cookie (R3A-13); the magic-link rate test asserts `retry-after`.
  - M8 under-13 test asserts `details.reason` (R3A-17).
  - M14 export `?format=md` (R3E-11).
- 14: N10 `SSE_HEADERS`, `pingMs`/`SSE_PING`, and the `parseFrames` comment skip, plus the new ping test (R3E-1/R3E-2).
- openapi:
  - `HelperView.request` (R3A-1).
  - `user_submission` `draft`/`report` (R3A-2).
  - the duplicate `404` deleted (R3A-3).
  - required lists and the `LocalArea` note (R3A-5).
  - `Forbidden`/`Internal`/`RateLimited` descriptions and the `Retry-After` header (R3A-7, R3A-8, R3A-11).
  - `applyActionCard` 409 and the 400 note (R3A-15).
  - `requestEssayReview` 400 (R3A-16).
  - `getExport` `format` and `text/markdown` (R3E-11).
  - Gate: a strict parse with no duplicate keys, every `$ref` resolving, and no repeated `operationId`.
- README: forbidden, internal, right-most hop, upload 413, rate-limit `Retry-After`, the pagination row, action-card 409/400, the event-stream ping and headers, and export formats (R3A-7..R3A-12, R3A-15, R3E-1, R3E-11).
- `docs/engineering/deployment.md`: the no-buffering line (R3E-1). It's added to this package because it's the only docs file the round touches outside `docs/api`.
- 00 §3: the `Retry-After` line under the error table (R3A-11).
- 00 §10:
  - intro gets the status convention (R3A-6); the SSE paragraph gets ping and headers (R3E-1/R3E-2).
  - `GET /family/budget` "or null", `/scholarships` `pageSize`/`excludeScams`, and the apply-row 409/400 (R3A-12).
  - the sign-out row (R3A-13) and the export row `?format=md` (R3E-11).

### R3-D: 15, 16, 17, with 00 §9.8/§9.9

Findings: R3E-11 (16), R3V-1, R3V-2, R3V-3, R3V-8 (17), R3V-11, R3V-12 (16), R3V-14 (16), R3V-15/R3A-19, R3A-13 (16), R3A-14, R3A-15 (16), R3A-17 (16), R3A-18, R3A-20, plus the 17 "See plans" carry-over.

- 15: no change (R3V-11 uses the existing `Badge`; the R3V-5 web part is deferred).
- 16:
  - P11 `ReplyCard` conflict handling (R3A-15) and its apply fake returns 200 (R3A-14).
  - P12 `Thread` fakes use 202 (R3A-14).
  - P15 onboarding branches on `forbidden` + `underage` and `conflict`, and returns a `MeResponse` fixture (R3A-17, R3A-18).
  - P16 `AccountCard.signOut` navigates only on success (R3A-13); `Profile` fixture (R3A-18).
  - P17 `DataCard` Markdown link (R3E-11).
  - P19 `ParentSpace` `parseDollars` (R3V-3); `FamilyTasks` skipped badge, due date, and assignee fallback (R3V-11, R3V-14); the hyphen fixture (R3V-12).
- 17:
  - Q3/Q4/Q8 `UNKNOWN_AMOUNT` for drafts (R3V-1).
  - Q6 `openOn` (R3V-2).
  - Q7 `StartEssayButton` slice (R3V-15/R3A-19); its status-per-method fake (R3A-20).
  - Q7/Q16/Q20 domain label and category imports, and Q8 "Not posted" (R3V-8).
  - Q2 202 fake (R3A-14); Q17 list-cap message (R3A-20).
  - `isLimit` "See plans" in `CommentsPanel`, `AppealButton`/`JobReply`, and `RetakeForm` (carry-over).
- 00 §9.8/§9.9: no change.

### R3-E: 18, 19, 20, with 00 §11/§12

Findings: R3V-7 (19), R3V-8 (18), R3V-9 (00 §12), R3V-10, R3A-4, R3A-13 (18), R3A-21, R3A-22, R3A-24.

- 18:
  - R9/R12 domain label imports (R3V-8).
  - R11 `AdminFrame.signOut` (R3A-13).
  - R13–R16 `instantLong(iso, ADMIN_TZ)`, `CATALOG_STATUS_LABELS`, and `calendarLong` deadlines (R3V-10).
  - R14/R15 conflict handling (R3A-21).
  - R15 `postCsv` 413 and the fake (R3A-22).
  - R13–R15 `maxLength`s (R3A-24).
  - R6 `OfferTool` unchanged (R3A-23 is closed by R3A-11).
- 19: S4 `awardYearOn` through `awardYearFor` (R3V-7). No selector changes: the label changes in 17/18 don't touch strings 19 selects; the package re-greps "Regular", "Rolling", and "Working on" to confirm.
- 20: T3 `AutofillProfileResponse`/`ScholarshipSummaryResponse` and the two tests (R3A-4).
- 00 §11: no change. 00 §12: the PU row drops `listPublicByState` (R3V-9).

---

## 3. Declined or deferred findings

- R3E-1, `compress: false` in 13 M2: declined. The SSE headers already stop Next's compression, and turning it off would uncompress every other response. Recheck if the execution-time check fails.
- R3E-4, restricting 02 `ReceiptItem.sourceUrl` to `https?://`: deferred. After the 09 guard, a receipt link can only be a catalog entry's admin-verified URL.
- R3E-6, one shared `occurrenceIndex` in 04 for 07, 10, and 17: deferred. Fixing 10's count makes all three agree. A shared helper is a refactor across three packages.
- R3E-7, aiming for a 160-character SMS: deferred. It's a cost choice, not a defect.
- R3V-5, web part (16 re-exporting 15's `usd`, 15's inline Table test formatter): deferred. Both web formatters already produce the same Intl output.
- R3V-9, web part (17 `viewer.ts` `todayIn` and 18 `todayIso` importing core) and parents counting days in the student's zone: deferred. `@scholarcrew/core/shared` also loads test deps, email senders, and the Stripe fake (G-19-16), so client-reachable web modules shouldn't import it. A parent zone needs the student's `timeZone` on `FamilyView` members, which is a contract change for a rare off-by-one.
- R3V-13, policy: the rule stays "local year minus birth year is less than 13". A birth year alone can't separate a 12-year-old from a 13-year-old in the same year. Round 4 should decide whether to block that whole birth year (a conservative check that also turns away some real 13-year-olds) or to ask for a birth month.
