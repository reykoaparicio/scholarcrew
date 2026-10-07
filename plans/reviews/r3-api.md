# Review round 3: API responses, status codes, errors, request parsing

Reviewer slice: every route in plans 13 and 14 compared across the route code, the route test, 00 §10, `docs/api/openapi.yaml`, and `docs/api/README.md`; the 00 §3 error table; the domain schemas in 02; and the client parsers in 16, 17, 18, and 20 (including the extension's reads of 14's shapes, CORS, cookies, redirects, and download headers). Items already in `plans/review-log.md` are not repeated.

Severity: high breaks the build or a contract; medium is wrong behavior; low is unclear.

## Findings

### Cross-cutting: error bodies, status conventions, and the API docs

**R3A-1 (high).** Plans: `docs/api/openapi.yaml` (patched alongside 13/14 in P-F), 02 B7, 14 N13, 18 R9.
openapi `HelperView` (line 2052) has `required: [studentName, helperRole, label, expiresAt, activities, stories, deadlines, colleges, scholarships]` and no `request` property. 02 B7 `HelperView` has the required field `request: z.strictObject({ message: z.string().nullable(), dueDate: IsoDate.nullable() })` (D38), which 14's `GET /helper-view/:token` returns and 18 R9 renders. The D38 fixes patched 02, 03, 07, and 18 but never openapi, so a client generated from the spec drops a required response field.
Fix (openapi): add `request` to `required`, as an object with required `message: { type: [string, "null"] }` and `dueDate: { type: [string, "null"], format: date }`.

**R3A-2 (medium).** Plans: openapi, 02 B7 (`CatalogTaskPayload`), 14 N11, 18 R14.
openapi `CatalogTaskPayloadUserSubmission` (line 2400) has `required: [type, url, name, notes, submittedById]`, and its properties stop at `submittedById`. 02 has `draft: ListingDraft.nullable().optional(),` and `report: VerificationReport.nullable().optional(),` (D18). 18 R14 branches on `draftOf`/`reportOf` from `GET /admin/catalog-tasks/:id`.
Fix (openapi): add optional `draft: { oneOf: [ListingDraft, null] }` and `report: { oneOf: [VerificationReport, null] }`.

**R3A-3 (medium).** Plans: openapi, 13 M4 `http.ts`.
In `DELETE /admin/aid-deadlines/{id}` (openapi lines 5686–5687), the `"404": { $ref: "#/components/responses/NotFound" }` key appears twice in the same mapping. YAML requires unique mapping keys, and strict loaders such as js-yaml (used by Redocly and Swagger tooling) fail with "duplicated mapping key". The P-F note that the YAML was checked by parsing it only holds for lenient parsers.
Fix (openapi): delete line 5687, and parse the file with a strict loader (for example `npx @redocly/cli lint docs/api/openapi.yaml`).

**R3A-4 (medium).** Plans: openapi (`info.description`), 20 T3 `api.ts`, 02 B8.
openapi lines 13–14 say: "Response schemas don't set it, so new response fields can appear within v1." The extension, however, validates responses with the strict domain schemas: `call("GET", "/autofill-profile", undefined, AutofillProfile)` and `call("POST", "/save-page", input, ScholarshipSummary)`, where both are `z.strictObject`. 20's own test proves an added field is rejected: `json(201, { ...SUMMARY, extra: true })` gives `bad_response` "...Update the extension." So any additive server change, which the spec allows, breaks every installed extension.
Fix (20 T3): parse with non-strict copies (`z.object(AutofillProfile.shape)`, `z.object(ScholarshipSummary.shape)`, with `Activity` relaxed the same way) and flip the `extra: true` test to expect success. Or, if strictness is intended, drop the openapi sentence and state that v1 response shapes are frozen.

**R3A-5 (low).** Plans: openapi, 02 B4/B3.
openapi doesn't mark response fields that have a Zod `.default()` as required, even though they are always present after parsing:
- `NetPriceByIncome` (line 1066) has no `required` list, while 02 makes every band `Usd.nullable().default(null)`.
- `CollegeDeadlines` has `required: [rolling]` only.
- `CollegeRequirements` has no `required` list.
- `LocalArea` has `required: [national, state]`, but `counties` and `cities` are `.default([])`.

As a result, generated clients type these fields as `| undefined`.
Fix (openapi): list every field as required on the response-only schemas (`NetPriceByIncome`, `CollegeDeadlines`, `CollegeRequirements`). `LocalArea` also serves as a request body (`ScholarshipUpsertInput`), so either give it a separate response variant or add a description saying `counties` and `cities` are always present in responses.

**R3A-6 (low).** Plans: 00 §3 and §10, 13 rules (line 12), 14 rules (line 10), README, openapi.
13's rule says "Creates return 201 (`json(x, 201)`); `undefined` returns 204; everything else 200." 14, the README ("Start a background job | 202 with the `CrewJob`"), and openapi ("Creates return 201, job starts 202, empty results 204") all use 202 for job starts. 00 §10 never states the success-status convention at all; its Response column only names types.
Fix (00 §10 header and 13 rules): add "creates 201, job starts 202 (`json(job, 202)`), `undefined` 204, everything else 200".

**R3A-7 (low).** Plans: README "Errors" table, openapi `responses.Forbidden`, 13 M8/M10/M11.
The README `forbidden` row says "Failed the CSRF check, or the token lacks the scope", and openapi says "`forbidden`: the Origin check failed, or the token lacks the scope." But 13's own tests return 403 for role refusals too:
- onboarding under 13: `expect(res.status).toBe(403)`
- a parent onboarding: `is for students only` → 403
- a parent creating a helper link: `expect((await create(parent.cookie, LINK)).status).toBe(403)`
- a student setting the budget: `expect((await put(student.cookie, 9000)).status).toBe(403)`

A client that reads 403 as "reload, CSRF" is misled.
Fix (README and openapi): change the description to "the Origin check failed, the token lacks the scope, or your role can't do this (for example, a parent onboarding or a student setting the family budget)".

**R3A-8 (low).** Plans: README "Errors" table, openapi `responses.Internal`, 13 M12, 06 `createCheckout`.
The README says of `internal`: "The message is always 'Something went wrong'". openapi says the same. But 13 M12 asserts `expect(await errorOf(res)).toEqual({ code: "internal", message: "Billing isn't set up" })`. That's an `AppError("internal", …)` thrown by core, which `errorResponse` passes through unchanged.
Fix (README and openapi): change to "Unhandled errors say 'Something went wrong'; a few configuration errors (billing not set up) carry their own message."

**R3A-9 (low).** Plans: README "Rate limits", 13 M4 `clientIp`.
README line 148 says "signed-out callers by the first `X-Forwarded-For` address". 13's `clientIp` takes "The right-most X-Forwarded-For entry, which the proxy in front appended" (D-13-3, tested with a spoofed first hop). The README sentence is the exact behavior D-13-3 removed, and it tells operators to configure their proxy the wrong way.
Fix (README): change to "by the right-most `X-Forwarded-For` hop (the one your proxy appends), then `X-Real-IP`".

**R3A-10 (low).** Plans: README "Uploads", 13 M13.
README line 267 says "Anything else, an empty file, or a bigger file is 400 `invalid_input`." 13 M13 answers 413 for a big file: `throw new PayloadTooLargeError(TOO_BIG)` with "Files can be up to 10 MB", and the test checks `expect(res.status).toBe(413)`. openapi already says 413.
Fix (README): change to "...an empty file is 400 `invalid_input`; a file over 10 MB is 413 `invalid_input`."

**R3A-11 (low).** Plans: 13 M4 `route`, 06 `consumeRateLimit`, README, openapi, 20 T3, 16 P2.
The user brief expects 429 with `Retry-After`. Every plan consistently sends none: openapi says "No Retry-After header", 06 throws `new AppError("rate_limited", "Too many requests. Try again in a few minutes.")` with no details, and `errorResponse` adds no header. That's consistent, but no client can tell how long to wait. For example, the crew send window is 600 s and the invite window is 86,400 s, yet both say "a few minutes".
Fix (06 + 13, optional): have `consumeRateLimit` throw with `details: { retryAfterSeconds }` (the window end minus now), have `errorResponse` set `Retry-After` from it for `rate_limited`, and update README/openapi. Otherwise accept and record the decision in review-log.

**R3A-12 (low).** Plans: 00 §10, README "Pagination", 13 M10, 14 N1/N9/N11.
The §10 rows and the README pagination table drift from the routes:
- `GET /family/budget`: §10 says the response is `FamilyBudget`, but the route says "FamilyBudget, or null before a parent shares one". openapi already uses `oneOf: [FamilyBudget, null]`.
- `GET /scholarships`: §10 lists `?q&state&local&renewable&minUsd&deadlineBefore&openOn&page`. That leaves out `pageSize` (1–50, default 20) and `excludeScams`, both of which `ScholarshipQueryParams` and openapi accept.
- `POST /actions/apply`: §10 doesn't mention the 409 from R2C-3 (see R3A-15).
- README "Pagination": the table lists only `/scholarships`, `/colleges`, and `/admin/audit`, then says "Other list routes return plain arrays". But `GET /admin/scholarships` also returns a `Page<Scholarship>`, with `pageSize` fixed at 50.

Fix (00 §10 and README): write "FamilyBudget or null"; add `pageSize` and `excludeScams` to the `/scholarships` query list; add the 409 to the apply row; add the `GET /admin/scholarships` row (`page`, fixed 50) to the README table.

### Auth, session cookie, and redirects

**R3A-13 (medium).** Plans: 13 M7 `auth/sign-out/route.ts`, 16 P16 `AccountCard.signOut`, 18 R11 `AdminFrame.signOut`, 18 R7 `SignInPage`.
Both clients leave for `/sign-in` whether or not sign-out worked. 16 does `try { await api("/auth/sign-out", { method: "POST" }); } finally { navigate("/sign-in"); }`, and 18 does `await api("/auth/sign-out", { method: "POST" }).catch(() => undefined); router.replace("/sign-in");`. But the cookie is cleared only by a 204 from 13: `return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookie(), … } })`.
- After a network error or a 500, the session is still live, so 18's `SignInPage` (`if (actor) redirect(actor.role === "admin" ? "/admin" : "/week");`) sends the user straight back in, and they believe they signed out.
- 16's `try/finally` also lets the rejection escape as an unhandled promise.
- Separately, sign-out is `auth: "user"`. An expired session gets 401 and no `Set-Cookie`, so the dead cookie stays and the middleware keeps treating the browser as signed in (it only checks that the cookie exists).

Fix:
- 13 M7: make sign-out `route({ auth: "optional" }, …)`, which still runs the Origin check. Call `signOut` only when there is a token, and always return 204 with `clearSessionCookie()`. Add a test that an expired session gets 204 and the clear cookie.
- 16 P16 and 18 R11: navigate only on success (or `code === "unauthenticated"`). Otherwise show `errorMessage(e)` and stay.

### Crew: messages, jobs, and action cards

**R3A-14 (low).** Plans: 16 P12 `Thread.test.tsx`, 16 P11 `ReplyCard` test, 17 Q2 `ContextCrew.test.tsx`, 14 N9.
The client tests fake statuses that 14 never returns:
- 16 P12: `function stubSend(status = 201, body = { message: ..., job: job() })`. Its open-room fake also answers `/conversations/${ROOM}/messages` with 201.
- 17 Q2: `json({ message: userMsg, job: job("queued") }, 201)` (around lines 608 and 646).
- 16 P11: the ReplyCard apply fake answers `{ status: 201 }`.

14 N9, however, sends `json(await sendMessage(...), 202)` for messages, and `applyActionCard` falls through to `json()` (200). Today's `api()` accepts any 2xx, so nothing fails yet. But the fixtures encode the wrong contract, and any `res.status === 201` check added later would pass the tests and fail in production.
Fix (16 P11/P12, 17 Q2): use 202 for `POST /conversations/:id/messages`, 200 for `POST /actions/apply`, and keep 201 only for `POST /conversations`.

**R3A-15 (medium).** Plans: 08 H10 `applyActionCard` (R2C-3), 14 N9, openapi `/actions/apply`, README "Action cards", 16 P11 `ReplyCard.apply`.
08 now throws `conflict("This action is still being applied")` while another apply holds a fresh claim, and `invalidInput("Temporary chats don't save memory")` for memory cards in temporary rooms (R2C-9). The docs don't cover either:
- openapi `/actions/apply` lists only `200, 400, 401, 403, 404`.
- The README says "every later call returns the same `ActionReceipt` … with 200 … Retrying after a timeout is safe."
- 16's client does `catch (e) { setError(errorMessage(e)); }`. With two tabs, or a retry inside the 60 s claim window, the losing call shows an error and leaves the card clickable, even though the card was applied.

Fix:
- openapi and README: add `"409": Conflict` ("another apply of this card is still running; retry in a minute") and note the temporary-room 400.
- 16 P11: on `e instanceof ApiError && e.code === "conflict"`, call `router.refresh()` and show "Already being added…" instead of an error.

**R3A-16 (low).** Plans: openapi `/essays/{id}/review`, 14 N3.
14's test `needs a saved draft` expects `expect(empty.status).toBe(400)` from `POST /essays/:id/review`. openapi lists only `202, 401, 402, 403, 404` for that operation.
Fix (openapi): add `"400": BadRequest` with "the essay has no saved version yet".

### Onboarding and profile (16)

**R3A-17 (medium).** Plans: 16 P15 onboarding `submit`, 06 F13 `completeOnboarding`, 13 M8.
16 branches on the status number and has no path for the conflict:
```ts
if (e instanceof ApiError && e.status === 403) { clearDraft(); setBlocked(true); return; }
setSubmitError(errorMessage(e));
```
06 throws `conflict("Onboarding is already complete")` (409) when `existing.onboardingCompletedAt` is set. This happens with a second tab, or a resubmit after a slow response that did succeed. In that case the student sees an error, the local draft is kept, and nothing moves them to `/week`. The 403 branch should also key on the code: 13's route is `auth: "user"`, so a CSRF 403 on this route would wrongly show the under-13 block and clear the draft.
Fix (06 F13 + 16 P15): have 06 throw the under-13 block with `details: { reason: "underage" }`, and have 16 block only on `e.code === "forbidden" && (e.details as { reason?: string })?.reason === "underage"`. On `e.code === "conflict"`, call `clearDraft()`, then `router.push("/week"); router.refresh()`. Add a 409 test and a CSRF-403 test that keeps the draft.

**R3A-18 (low).** Plans: 16 P15 and P16 tests, 13 M8.
Two fixtures fake bodies the routes never send:
- 16 P15's onboarding fake returns `json({})` for `POST /onboarding`, which is typed `api<MeResponse>`. 13 returns a full `MeResponse` (`{ user, profile, onboardingComplete, family, plan }`).
- 16 P16 fakes `PATCH /profile` with `json({})`, which is typed `api<Profile>`.

The components ignore the bodies today, so this is a misrepresented contract, not a failure.
Fix (16): return minimal valid `MeResponse` and `Profile` fixtures.

### Scholarships, essays, and colleges (17)

**R3A-19 (medium).** Plans: 17 Q8 `scholarships/[slug]/page.tsx`, 17 Q7 `StartEssayButton`, 02 B5 `EssayInput`, 02 B3/B7 listing names.
The detail page builds the essay title as `` title={req.essays.length > 1 ? `${detail.name} essay ${i + 1}` : `${detail.name} essay`} `` (17 line 2822), and `StartEssayButton` posts it unchanged: `api<Essay>("/essays", { body: { title, prompt, wordLimit, targetType: "scholarship", targetScholarshipId: scholarshipId } })`.
02 limits the title with `EssayInput.title: z.string().min(1).max(200)`, but a listing name can itself be 200 characters (`ScholarshipUpsertInput.name … max(200)`, `LocalSubmissionInput.name: z.string().min(1).max(200)`). With the suffix, the title can reach 206–209 characters. The strict body then gets 400 "Check your input and try again", and the student can't start the essay at all. 17's `ChecklistItems` already guards this case with `item.label.slice(0, 200)`.
Fix (17 Q7): in `StartEssayButton`, send `title: title.slice(0, 200)`. Or build `` `${detail.name.slice(0, 190)} essay ${i + 1}` `` in Q8. Add a test with a 200-character listing name.

**R3A-20 (low).** Plans: 17 Q7 `detail.test.tsx`, 17 Q17 `AddCollegeModal.test.tsx`, 14 N1/N2, 07 G8.
Two fixtures don't match the real responses:
- Q7 uses one fake, `json({}, 201)`, for both `POST /scholarship-applications` (201) and `PATCH /scholarship-applications/:id`. 14's route returns `updateApplication(...)` through `json()`, so the PATCH gets 200.
- Q17 fakes the 26th-college error as `"Your list already has 25 colleges this season."`. 07 actually throws `` invalidInput(`Your list holds up to ${MAX_COLLEGE_LIST} colleges. Remove one to add another.`) ``, and 14 N2 asserts that exact text.

The UI shows whatever text the server sends, so nothing breaks today.
Fix (17): answer 201 only when `init.method === "POST"` and 200 otherwise, and use the real 25-college message in the Q17 fake and its assertion.

### Admin and public pages (18)

**R3A-21 (low).** Plans: 18 R14 `TaskReview.run`, 18 R15 `ReportsTable.close`, 08 H11 (`resolveCatalogTask`, `resolveReport`), 14 N11.
Both resolve calls end in `catch (e) { setErrors([errorMessage(e)]); }`. The routes return 409: 08 throws `conflict("This task is already closed")` and `conflict("This report is already closed")`, and 14's test asserts `expect(again.status).toBe(409)`.
- When another admin got there first, or after a retry following a lost response, the Publish/Reject or Resolve/Reject buttons stay live.
- 18's comment "A retry repeats both safely" (around line 9237) is wrong for the second call.

Fix (18 R14/R15): on `e instanceof ApiError && e.code === "conflict"`, show the server message, mark the item closed, and call `router.refresh()`.

**R3A-22 (low).** Plans: 18 R15 `CollegeImport` and its `postCsv` helper, 14 N12, 13 M4 `PayloadTooLargeError`.
18's test fakes the over-size refusal as `json({ error: { code: "invalid_input", message: "The CSV is over 5 MB. Split it and import each part." } }, 400)`. 14 sends that message only with 413 (`readTextCapped(req, MAX_CSV_BYTES, TOO_BIG)`). `postCsv` has no 413 fallback either: when a proxy cuts the body off without an `ErrorBody`, it shows `` `The import failed (${res.status}). Try again.` ``.
Fix (18 R15): use 413 in the fake, and add `if (res.status === 413) throw new ApiError("invalid_input", TOO_BIG, 413)` before the generic fallback, as `OfferTool` does.

**R3A-23 (low).** Plans: 18 R6 `OfferTool.submit`, 14 N6, 06 `consumeRateLimit`.
The submit handler does `setErrors([err instanceof ApiError && err.status === 413 ? TOO_BIG : errorMessage(err)])` and has no `rate_limited` branch. The route's limit is `{ key: "offer-tool", limit: 30, windowSeconds: 3600 }`, but the shown message is 06's "Too many requests. Try again in a few minutes.", so a visitor is told to retry far too soon. 18's `VerifyHoursForm` already handles this case. Branching on 413 is right here, because 400 and 413 share the code `invalid_input`.
Fix (18 R6): on `err.code === "rate_limited"`, show "Too many comparisons from this network. Wait an hour and try again." (or fix the wording centrally, as in R3A-11).

**R3A-24 (low).** Plans: 18 R13/R14/R15 forms, 02 B7.
Several admin fields have server limits but no `maxLength` or client check:
- `CatalogTaskResolution.note`, `ResolveReportInput.note`, and `ScholarshipStatusInput.note` are each `z.string().max(1000)`.
- `ResearchInput.county` is `z.string().max(100)`.

Inputs past the limit get a generic 400 "Check your input and try again", with Zod issues the forms don't map to a field. This affects the TaskReview "Decision note", the ReportsTable note, the ScholarshipEditor "Note for the audit log", and the ResearchForm county.
Fix (18): add `maxLength={1000}` / `maxLength={100}`, or `safeParse` the body before sending, as `AidRulesEditor` does.

### Files and downloads

**R3A-25 (low).** Plans: 13 M4 `contentDisposition`, README "Downloads", openapi `headers.ContentDisposition`.
13 builds the header as ``filename*=UTF-8''${encodeURIComponent(filename)}``. `encodeURIComponent` leaves `'`, `(`, `)`, and `*` unescaped, and none of those is an RFC 8187 `attr-char`. So a stored name like `Maya's essay (final).pdf` produces a `filename*` that strict parsers reject or truncate at the apostrophe. The ASCII `filename=` fallback is safe: it replaces non-printables, `"`, and `\`, and CR/LF can't get through.
Fix (13 M4): ``encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)``, and add `"Maya's essay (final).pdf"` to the `fileResponse` test.

## Checked and consistent

- **Cookies.** `sc_session=<token>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000` and the `Max-Age=0` clear are identical in 13 `cookies.ts`, its tests, README, and openapi `headers`.
- **Redirects.** Verify answers 303 to `<APP_URL>/onboarding`, `/week`, or `/sign-in?error=link` with `no-store` and `no-referrer`. The middleware's 307 to `/sign-in?next=` is the known D15 item. 18 reads `error` and `next` under the same names.
- **CORS.** 13 `corsHeaders`, 14 N14, README, and openapi agree on the header set and values (Allow-Origin echo for `chrome-extension://` only, Allow-Headers `Authorization, Content-Type`, Allow-Methods `GET, POST, OPTIONS`, Max-Age 600, `Vary: Origin`), and errors carry them too. The extension sends `credentials: "omit"`, and no route allows credentials.
- **Extension shapes.** The extension reads exactly what 14 returns: `AutofillProfile` from 06's `getAutofillProfile` and `ScholarshipSummary` from 07's `toSummary`, and it sends `SavePageInput` with `selectedText: ""` when the selection is unchecked. The open risk is the strict parse (R3A-4).
- **Error mapping.** `{ error: { code, message, details? } }` is the only error body. Code-to-status follows `ERROR_STATUS` in 02 and the 00 §3 table, with 413 as `invalid_input` through `PayloadTooLargeError`. Admin routes answer 404 to non-admins, and every job-starting route has a 402 test.
- **Clients.** 16, 17, 18, and 20 branch on `code`, never on message text. The status-number branches are 16 P15 (R3A-17), the 413 checks (correct, since 400 and 413 share a code), and the extension's 401 reconnect.
- **Query coercion.** `stringbool` for `local`, `renewable`, `excludeScams`, and `active`; `z.coerce` for `page` (default 1), `pageSize` (1–50, default 20), `minUsd`, and `limit` (1–50). Non-strict parsers sit wherever `studentId` shares the query string. Client calls (`/jobs?active=1&limit=10`, `/colleges?q=…&pageSize=8`) fit these.
- **Response shapes.** Every client read matches the route: `Page` vs bare arrays, `{ link, url }`, `{ token, secret }`, `{ message, job }`, `{ archived }`, `{ url }`, and nullable `FamilyView`, `FamilyBudget`, and `ExportRecord`. Request bodies in 16/17/18 match the strict 02 schemas.

## Open follow-ups noticed (already in review-log, not counted)

- 17's rules (line 28) still say pipeline 402 alerts won't link to plans "until plan 16 exports `isLimit`". 16 now exports it, and review-log line 381 lists the 17 change, but `CommentsPanel`, `AppealButton`/`JobReply`, and `RetakeForm` still render only `errorMessage(e)`.

## Counts

25 findings: 1 high (R3A-1), 7 medium (R3A-2, R3A-3, R3A-4, R3A-13, R3A-15, R3A-17, R3A-19), 17 low.
