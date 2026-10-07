# Review round 3: events, agent output, and messages

Reviewer slice: SSE wire format and job status enum; agent output formats (strict tool schemas, submit tools to domain reply/card/receipt, Quill comments, offer parse lines); emails, SMS, notification kinds and links, export format; money and date formatting. Items already in `plans/review-log.md` are not repeated.

Severity: high breaks the build or a contract; medium is wrong behavior; low is unclear.

## Findings

### 1. SSE and job status

Checked and consistent (no finding): event names `job` and `end`; `job` data is a full `CrewJob` whose keys match the strict 02 `CrewJob` that 16's `parseJob` uses (08 `toCrewJob` emits exactly the 12 keys, `id` first, ISO `Z` timestamps); `end` data is `{}`; terminal statuses come from `TERMINAL_JOB_STATUSES` in 14, 16 and 17; the 1000 ms / 130 s timing matches 00 §10, openapi `streamJobEvents`, and `docs/api/README.md`; a terminal status is shown by the last `job` frame, and `end` alone means "timed out" in all three. The status enum `queued, working, ready, needs_input, failed` is identical in 00 §8, 02 `JobStatus`, 03 `jobStatusEnum`, openapi `JobStatus`, 08 (`ACTIVE_JOB_STATUSES`, `WORKING`), 12, 15 `StatusPill`, 16 `HEADLINE`, 17, and 19 `waitForJob` (`/^(ready|needs_input|failed)$/`). No plan sends or expects a `retry:` field or an `id:` field, and none expects heartbeats.

#### R3E-1 (medium): gzip compression can buffer the job stream under `next start`

- Plans: 13 M2 (`next.config.ts`), 14 N10 (`stream.ts`), docs/engineering/deployment.md.
- 13: `const config: NextConfig = { poweredByHeader: false, transpilePackages: [...] ...` has no `compress` setting, so Next's default `compress: true` applies to every response from `next start`.
- 14: `SSE_HEADERS = { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" }` sets neither `Content-Encoding` nor `X-Accel-Buffering`, and `cache-control` has no `no-transform`.
- What goes wrong: browsers send `Accept-Encoding: gzip` on `EventSource` requests. With Next's compression middleware (or a proxy that gzips), small SSE frames can sit in the gzip buffer until the stream closes. Then the student sees nothing for up to 130 s and gets every frame at once. CR-06's live progress would work in Vitest (route called directly) and fail in production. This is a known Next.js route-handler SSE problem; confirm it against the installed Next 15 at execution.
- Fix (14 N10): add `"cache-control": "no-cache, no-transform"`, `"content-encoding": "none"` and `"x-accel-buffering": "no"` to `SSE_HEADERS`, and update the header assertion in `events.test.ts`. In 13 M2, either set `compress: false` (and note in deployment.md that the proxy compresses) or leave compression on and rely on the `content-encoding: none` header. Add a line to deployment.md: "The job stream must not be buffered or compressed by the proxy."

#### R3E-2 (low): no heartbeat during quiet stretches of up to 130 s

- Plans: 14 N10, 00 §10, docs/api/README.md.
- 14 `jobEventStream` writes only when `changed(last, next)`, so a `queued` job that waits behind other work sends no bytes until the 130 s timeout. 00 §10 says "writes `event: job` ... whenever `status` or `progress.length` changes" and nothing else.
- Proxies with a 60 s idle read timeout (the nginx default) close the connection. 16 then sees an `error` while CONNECTING and falls back to polling, so nothing breaks, but the "live" stream is often a 3 s poll in practice.
- Fix (14 N10, 00 §10, API README): send a comment line `: ping\n\n` every 15 s when nothing changed. `EventSource` ignores comments. 14's test `parseFrames` would turn a comment block into `{ event: "", data: null }`, so make it drop blocks that start with `:`. Document it in 00 §10 and the README frame example.

### 2. Agent output formats

Checked and consistent: `toStrictJsonSchema` (09 I2) strips `minLength`, `maxLength`, `pattern`, `minimum`/`maximum`, `maxItems`, `minItems` > 1 and unsupported `format`s, rewrites `oneOf` to `anyOf`, and sets `additionalProperties: false` with every key in `required` on every object, nested and `$defs` included. No model-facing schema uses `z.record`, `z.unknown`, transforms, or `z.lazy`, so `z.toJSONSchema` won't throw and no record turns into an empty object. Card kinds are the same 7 in 02 `ActionCard`, 08 `runCard` (exhaustive switch), 16 `APPLIED_LABEL` (typed `Record<Exclude<..., "open_link">, string>`, so a missing kind fails `tsc`) and the 12 demo model (`add_plan_item` only, built from `PlanItemInput`). Payloads (`item: PlanItemInput`, `scholarshipId`, `collegeId`/`fit`/`plan`, `essay: EssayInput`, `href: InternalHref`, `decision: DecisionInput`, `fact: FactInput`) are the 02 types everywhere. Offer line categories are the 8 `OFFER_LINE_CATEGORIES` in 02, 04, 10's prompt, and the 17/18 `Record<OfferLineCategory, string>` label maps; amounts are integer `Usd`; `page` is `int >= 1 | null`.

On "optional handled as nullable": strictify marks `.optional()` and `.default()` keys required without making them nullable. Every model-facing schema uses `.nullable()` (with or without `.default(null)`) for "absent", so this is fine today. A future `.optional()` field in a model schema would force the model to invent a value; the 09 I2 docstring should say "use `.nullable()`, not `.optional()`, in model schemas".

#### R3E-3 (medium): the `CrewReply` strict schema may pass the API's union-type limit

- Plans: 09 I2 (`toStrictJsonSchema`), I12/I13 (`submit_reply`, `submit_plan`), 00 §14, 02 `CrewReply`.
- 00 §14 says only "Strict tools need `additionalProperties: false` and every property in `required`". It doesn't list the structured-output complexity limits. As of the last docs I know, those cap union-typed parameters (`anyOf` or type arrays) at 16 across all strict schemas in one request. Treat that number as something to confirm against the current docs.
- Count for `submit_reply` = `toStrictJsonSchema(CrewReply)`: `question`, `safety` (2); `receipt[]` `refId`, `sourceUrl`, `verifiedAt` (3); the `actionCards` union (1); `add_plan_item.item` `refType`, `refId`, `valueUsd`, `dueOn`, `weekStart` (5); `start_essay.essay` `wordLimit`, `charLimit`, `targetCollegeId`, `targetScholarshipId` (4); `confirm_fact.fact` `value` (4-way union) and `sourceRef` (2). That's 17 `anyOf` nodes before the calculator and consult tools in the same request. `submit_plan` (`{ items: PlanItemInput[], reply: CrewReply }`) adds 5 more, so 22.
- If the limit holds, every crew request and weekly plan gets a 400, which is high. No test catches it, because `createScriptedModelClient` never validates schemas.
- Fix (09 I2): add a test that counts `anyOf` nodes across the tools of a full Compass request and asserts the count is within the documented limit. Record the limits in 00 §14. If the count is over, the smallest change is in 02/09: make the `submit_reply` card schema a model-facing variant where the nullable `PlanItemInput`/`EssayInput` fields are plain strings or numbers with sentinels (`""`/`0`), mapped back to null in `session.finish`. A second option is to send the tool with `strict: false` and rely on the loop's Zod retry, which already exists (AG-03).

#### R3E-4 (medium): receipt `sourceUrl` and `verifiedAt` are only checked on `catalog` items, and 16 renders them as a link and a "verified" date

- Plans: 09 I9 `guards/sources.ts`, 02 `ReceiptItem`, 16 P11 `Receipt.tsx`.
- 09 `receiptItemProblem`: `case "fact": return known.factIds.has(ref) ? null : ...`, `case "record": return isKnownRecord(known, ref) ? null : ...`, `case "calculation": ...`. Only `case "catalog"` compares `item.sourceUrl === entry.url && item.verifiedAt === entry.verifiedAt`.
- 02: `sourceUrl: z.string().max(2000).nullable()` (no scheme check), `verifiedAt: IsoDateTime.nullable()`.
- 16 `Receipt`: `{item.verifiedAt ? \`${item.label}, verified ${instantShort(item.verifiedAt, timeZone)}\` : item.label}` and `{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" ...>source</a> : null}`.
- So a reply can cite a real fact or record (or `record` with a `scholarship:` ref, which `isKnownRecord` accepts through `known.catalog`) with any `sourceUrl` and any "verified" date. Text injected through a listing page or a scraped web page is the obvious way to steer that. The student then sees a "source" link to an arbitrary site, plus a verification date no admin set. That breaks CR-04's "verified dates for catalog items" promise.
- Fix (09 I9): for `fact`, `record` and `calculation`, return a problem unless `item.sourceUrl === null && item.verifiedAt === null`. For a `record` whose ref is in `known.catalog`, apply the catalog rule instead. Add two cases to `sources.test.ts`. Optionally, in 02, restrict `ReceiptItem.sourceUrl` to `https?://` so 16 never renders another scheme.

#### R3E-5 (medium): one over-long field fails the whole award-letter parse

- Plans: 10 J5 `offerParse.ts`, 09 I3 `extract`, 02 `ParsedOffer`/`ParsedOfferLine`, 12 L8 (`PARSE_FAILED_TEXT`).
- 02: `label: z.string().min(1).max(120)`, `amountUsd: Usd.max(200_000)`, `renewalCondition: z.string().max(200)`, `page: z.number().int().min(1).nullable()`, `citedText: z.string().max(300)`, `lines: z.array(ParsedOfferLine).max(40)`.
- 09: JSON output uses `toStrictJsonSchema(req.schema)`, which removes every one of those bounds, and `extract` returns `{ value: parseJsonOutput(res.content, req.schema) }`, with no retry, so any Zod failure gives `value: null`.
- 10 `OFFER_PARSE_INSTRUCTIONS` states limits for `label` ("120 characters") and `citedText` ("up to 300 characters") but none for `renewalCondition`. It doesn't say pages start at 1 in a way the schema enforces (`page: 0` is possible), and it doesn't cap the line count. A per-term letter (MO-07 asks for "each term as its own line") can pass 40 lines.
- Result: one 210-character renewal condition, or a `page: 0`, makes `runOfferParse` return `{ parsed: null }`. 12 then marks the offer failed with `PARSE_FAILED_TEXT`, and the student loses every good line.
- Fix (10 J5): parse with a lenient copy of the schema, or post-process `result.value` before validating. Truncate `label` to 120, `renewalCondition` to 200 and `citedText` to 300; set `page` below 1 to null; drop lines whose `amountUsd` is not an integer in 0..200,000; keep the first 40 lines; null out `costOfAttendanceUsd` over 200,000. Then run `ParsedOffer.parse`. Add "renewalCondition: up to 200 characters" to the instructions. Add a J5 test with a 250-character condition and a `page: 0` line that still returns the other lines.

#### R3E-6 (low): Quill quote occurrences are counted two different ways

- Plans: 10 J4 `quoteOccurs`, 07 G11 `quotes.ts` `occurrenceIndex`, 17 Q9 `text.ts` `findOccurrence`.
- 10: "`/** True when quote appears in body at least occurrence times (non-overlapping, exact). */` ... `from = at + quote.length;`"
- 07: `index = body.indexOf(quote, from); ... from = index + 1;` (overlapping). 17: `const at = text.indexOf(quote, from); ... from = at + 1;` (overlapping).
- For a self-overlapping quote (for example "ha ha" in "ha ha ha ha"), occurrence 2 is at offset 6 in 10's count and offset 3 in 07/17's. 07 then keeps a comment whose highlight lands on different words than the ones Quill meant. The case is rare, but the three must agree, because 17's highlight is the only way the student finds the comment's anchor.
- Fix (10 J4): count with `from = at + 1`, like 07 and 17, and add a self-overlap case to J4's test. Better: export one `occurrenceIndex` from `@scholarcrew/engines` (04, pure) and have 07, 10 and 17 import it.

### 3. Messages and text output

Checked and consistent: every email is plain text only. 06 `resendEmailSender` posts `{ from, to, subject, text }` with no `html`, and the dev outbox stores `text`, so user text such as names, notes, organizations or activities can't inject HTML. Links come from `deps.config.appUrl` and match 00 §11 and the 13 routes: magic link `/api/v1/auth/verify?token=` (13 M7), invite `/family/join?token=` (18 reads `searchParams.token`), helper and brag-sheet `/h/<token>` (06 `createHelperLink`, 18 `/h/[token]`), verify hours `/verify-hours/<token>` (18), digest `/week`, every notification email `appUrl + link` plus `Change email settings: <appUrl>/settings`, and the export notice `/settings#data` (16 P17 renders `<div id="data">`). Notification kinds are the six in 00 §8, 02 `NotificationKind` and openapi, and every link points at an existing page: `/scholarships`, `/scholarships/<slug>`, `/colleges`, `/week`, `/family`, `/essays/<id>`, `/money/offers/<id>`, `/crew/<id>`, `/prep`, `/settings#data`. Parents only get `family` notices, which link to `/family`. SMS goes only to opted-in students with a phone, only for the 1-day reminder, outside quiet hours, once.

#### R3E-7 (medium): the SMS 300-character cut can drop the opt-out line

- Plans: 06 F16 `deliverSms`, 08 H8 `reminderTitle`, 02 listing `name` (`max(200)`), 12 L11.
- 06: `const text = ["ScholarCrew:", row.n.title, link, "Reply STOP to opt out."].filter(...).join(" ").slice(0, SMS_MAX);` with `SMS_MAX = 300`.
- 08: the title is `${name} is due tomorrow`, where `name` is a listing name up to 200 characters, or for college reminders `${e.name} · ${APP_PLAN_LABELS[e.plan]}`. 12 passes `link` `/scholarships` or `/colleges`, which `deliverSms` prefixes with `APP_URL`.
- With a 200-character name and an `APP_URL` of about 45 characters, the message is 13 + 216 + 58 + 22 + 3 = 312 characters. `.slice` then cuts "Reply STOP to opt out." Carriers and TCPA practice expect the opt-out notice in every recurring text. The 06 test only covers a short title.
- Fix (06 F16): build the fixed parts first and truncate only the title. For example, `const tail = [link, "Reply STOP to opt out."].filter(Boolean).join(" "); const room = SMS_MAX - "ScholarCrew: ".length - tail.length - 1; const title = row.n.title.length > room ? \`${row.n.title.slice(0, room - 1)}…\` : row.n.title;`. Add a test with a 200-character listing name asserting `text.endsWith("Reply STOP to opt out.")` and `text.length <= 300`. Optional: aim for 160 GSM-7 characters so most reminders are one segment.

#### R3E-8 (medium): reminder, digest and verify-hours messages print raw ISO dates, and the verify-hours expiry is a UTC date

- Plans: 12 L11 `reminders-deadlines.ts`, 08 H8 `buildWeeklyDigest`, 07 G14 `requestVerification`, 06 F18 `renderMarkdown`; compare 16 `lib/format.ts`.
- 12: `body: renewal ? renewalBody(r.dueOn) : \`Due ${r.dueOn}. Open your week to plan time for it.\`` and `renewalBody` returns `Your award renews around ${dueOn}.` Both show in the bell and in the email body (06 `deliverEmail` sends `row.n.body`) as "Due 2026-10-15."
- 08: `- ${i.title} (${i.minutes} min${i.dueOn ? \`, due ${i.dueOn}\` : ""})` and `- ${d.title}: ${daysLeftText(d.daysLeft)} (${d.dueOn})`.
- 07: `${row.activity} on ${row.servedOn}: ...` and `The link expires on ${toIso(expiresAt).slice(0, 10)}.`. That expiry is the UTC calendar date. A link requested at 8 pm Central on Oct 6 expires at 8 pm Central on Oct 20, but the email says "2026-10-21", so a supervisor who reads it at face value tries a dead link on the evening of the 20th.
- 06 export Markdown: `Generated ${generatedAt}` (an ISO instant) and fact dates `toIso(f.createdAt).slice(0, 10)` (UTC).
- Every web screen shows calendar dates as "Oct 15" (16 `dateShort`, formatted in UTC so the day never shifts) and instants in the user's zone (`instantShort(iso, timeZone)`). Messages should match.
- Fix: add `calendarShort(d: IsoDate): string` ("Oct 15", UTC like 16's `dateShort`) and `instantDate(iso, timeZone): string` to 06 `shared` (or 04 engines, since it's pure), and use them in 08 H8 (digest lines), 12 L11 (reminder and renewal bodies), 07 G14 (served-on date, and the expiry in the student's zone with the zone named, e.g. "Oct 20 (Central time)"), and 06 F18 (the Markdown dates in the student's zone). Update the tests that assert the ISO strings: 12 L11's renewal-body test, 07 G14's mail test, and 08's digest expectations.

#### R3E-9 (low): deadline reminder copy says "Open your week" but links to the board or the college list

- Plans: 12 L11.
- 12: `body: \`Due ${r.dueOn}. Open your week to plan time for it.\``, but `link: LINKS[r.refType] ?? "/week"` with `LINKS = { scholarship_application: "/scholarships", college_list: "/colleges" }`. 08's reminders only use those two refTypes, so the link never goes to `/week`. Also, `refId` for `college_list` is the list entry id, so the reminder could open `/colleges/<entryId>`, which 00 §11 defines.
- Fix (12 L11): either link to `/week` to match the copy, or change the copy to "Open it to plan time for it." and use `college_list: (id) => \`/colleges/${id}\``.

#### R3E-10 (low): display names with control characters reach email subjects

- Plans: 02 B4 `ProfilePatch.displayName` / `OnboardingInput.displayName` (`z.string().min(1).max(80)`), 06 F9 `invite` (`subject: \`${inviter} invited you to their family on ScholarCrew\``), 07 G9 (`subject: \`${studentName} asked you for a recommendation\``).
- No schema refuses `\r`, `\n` or other control characters in a display name, and two subjects interpolate it unchanged. Resend's JSON API keeps this from becoming header injection, but a newline in a subject gets the send rejected (the invite then fails with a 5xx) or mangles the subject line for the recipient.
- Fix (02 B4): `displayName: z.string().trim().min(1).max(80).regex(/^[^\p{Cc}]*$/u, "Use letters, spaces, and punctuation")` in both schemas, plus one test. As a backstop, 06 `resendEmailSender` replaces `/[\r\n]+/g` with a space in `subject`.

#### R3E-11 (low): the export is one JSON file with the Markdown as an escaped string, and it skips share settings and family tasks

- Plans: 06 F18 `buildExport`/`collect`, 13 M14 `account/exports/[id]/route.ts`, docs/product/features.md ME-08, docs/architecture/memory.md.
- 06: `const file = { generatedAt, data: collected.data, markdown: renderMarkdown(...) }; ... putBlob(deps, Buffer.from(JSON.stringify(file), "utf8"))`. 13: `fileResponse(bytes, "application/json; charset=utf-8", \`scholarcrew-export-${...}.json\`)`.
- ME-08 promises "a JSON + Markdown export of everything the student owns", and memory.md says "every row the student owns". What the student actually gets is one `.json` file. The readable part is a single string full of `\n` escapes, which no student will open as Markdown. `collect` also has no `shareSettings` (keyed by `studentId`) and no `familyTasks` about the student. Those are the student's sharing choices, which ME-08's "everything" covers.
- Fix (06 F18, 13 M14): keep the JSON, and serve the Markdown as its own download (`GET /account/exports/:id?format=md` returns `text/markdown; charset=utf-8`, `scholarcrew-export-<date>.md`, from `file.markdown`), with a second link in 16's DataCard. Or change the docs to "one JSON file that includes a Markdown summary". Add `shareSettings` (where `studentId = id`) and `familyTasks` (where `studentId = id` or `assigneeId = id`) to `collect`.

### 4. Formatting

Checked and consistent: every money formatter gives `$12,345` with no cents for whole-dollar input: 04 `formatUsd`, 07 `usd`, 08 `usd`, 10 `usd`, 15 and 16 `Intl.NumberFormat(... maximumFractionDigits: 0)`, 17 (uses 16), and 19 `usd`. 04 rounds `monthlyUsd` and `totalInterestUsd`, and every `Usd` is a non-negative integer, so the `Math.round` difference between them never shows. 09 calculator tools return engine output unchanged (`{ calcId, ...computeGap(i) }`), and 04 `compareOffers` warnings use `formatUsd`. On the web, `ReplyCard`, `Receipt`, `NotificationBell` and every `Thread` call site pass the user's `timeZone`; calendar dates use `dateShort` in UTC and instants use `instantShort(iso, timeZone)`.

#### R3E-12 (low): neither the Compass prompt nor the demo model fixes a money or date style

- Plans: 09 I11 `COMPASS_SYSTEM`, 10 J2 specialist prompts, 12 L3 `demo-model.ts`.
- 09's prompt says where numbers come from ("Money and counting come from tools ...") but not how to write them. `student_context` carries ISO dates (`dueOn: "2026-10-15"`), so the model can print "2026-10-15", "October 15th" or "$12,345.00" in reply text, while the cards and UI show "Oct 15" and "$12,345".
- 12 demo model: `describeDeadline` returns `${d.title} on ${d.dueOn} (${daysText(d.daysLeft)})`, so e2e and dev replies read "due on 2026-10-15".
- Fix: add one line to `COMPASS_SYSTEM` "The reply" section and to the shared specialist rules in 10: "Write money as whole dollars with commas ($12,345) and dates as month and day (Oct 15), adding the year only when it isn't this school year." In 12 L3, format `d.dueOn` the way 16's `dateShort` does (a local `Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })`). No contract change.

## Summary

12 findings: 0 high, 6 medium, 6 low.

| ID | Severity | Owning plan(s) | One line |
|---|---|---|---|
| R3E-1 | medium | 14 N10, 13 M2 | gzip compression under `next start` can buffer the SSE stream; add `content-encoding: none`, `x-accel-buffering: no`, `no-transform`. |
| R3E-2 | low | 14 N10, 00 §10 | No heartbeat for up to 130 s; add a `: ping` comment every 15 s. |
| R3E-3 | medium | 09 I2, 00 §14 | `CrewReply` strict schema has 17 `anyOf` nodes (22 for `submit_plan`); check against the API's union-type limit and add a counting test. Would be high if the limit is 16. |
| R3E-4 | medium | 09 I9 | Non-catalog receipt items may carry any `sourceUrl`/`verifiedAt`, which 16 renders as a link and a "verified" date. |
| R3E-5 | medium | 10 J5 | Strict JSON output drops the length and range bounds, and `extract` doesn't retry, so one long `renewalCondition` or a `page: 0` fails the whole letter. |
| R3E-6 | low | 10 J4 (or 04) | Quote occurrences: 10 counts without overlaps, 07 and 17 count with them. |
| R3E-7 | medium | 06 F16 | `.slice(0, 300)` on the whole SMS can cut "Reply STOP to opt out."; truncate the title instead. |
| R3E-8 | medium | 12 L11, 08 H8, 07 G14, 06 F18 | Messages print ISO dates; the verify-hours expiry is a UTC date that can be a day late. |
| R3E-9 | low | 12 L11 | Reminder copy says "Open your week" but links to `/scholarships` or `/colleges`. |
| R3E-10 | low | 02 B4, 06 | Display names allow control characters, which reach email subjects. |
| R3E-11 | low | 06 F18, 13 M14 | The export is one JSON file with the Markdown as an escaped string, and it has no share settings or family tasks. |
| R3E-12 | low | 09 I11, 10 J2, 12 L3 | No money or date style in the prompts; the demo model prints ISO dates. |
