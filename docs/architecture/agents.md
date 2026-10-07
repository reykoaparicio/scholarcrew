# Agents

The crew lives in `@scholarcrew/agents` (plans 09 and 10). Plan 09 builds the runtime: the model client, the tool loop, the guards, the calculator tools, and Compass. Plan 10 builds the seven specialists and the job-level runs (essay review, offer parse, appeal outline, retake explanation). The worker (plan 12) wires them together and supplies the data port.

## Four kinds of agents

| Kind | What it is | Where |
|---|---|---|
| Crew | Model-driven agents with narrow prompts: Compass (lead) and Scout, Atlas, Quill, Aid, Ledger, Prep, Impact. | `packages/agents/src/compass`, `src/specialists` |
| Calculators | Plain code exposed to agents as tools: gap, offer comparison, loan payment, word and character counts, days until, retake value. | `@scholarcrew/engines`, wrapped in `src/calculators` and `src/specialists/tools.ts` |
| Guards | Code that checks inputs and outputs: crisis, integrity, sources, privacy, untrusted-content wrapping. | `src/guards`, `src/context/untrusted.ts` |
| Workers | Background jobs that call agents or calculators: crew requests, weekly plans, essay reviews, offer parsing, sweeps, reminders, catalog re-checks. | `apps/worker` (plan 12) |

Ledger is both a specialist role (`consult_ledger`) and a set of calculator tools. The specialist reads stored costs and offers and calls the same three Ledger calculators Compass has.

## Compass

`runCrewRequest(deps, input)` handles one chat message. `runWeeklyPlan(deps, { ownerId, weekStart })` plans a week. Both share a `CompassSession` that holds the tools, the consult counter, the contributors list, and `KnownSources` (everything the reply may cite).

### The loop

Every agent runs `runAgentLoop` (or its internal variant `runCheckedAgentLoop`, which adds a `check` hook):

1. Send the system prompt (cached), the message list, every tool, and the submit tool.
2. On `stop_reason: "refusal"`, stop with reason `refused`. Content isn't read.
3. Append the assistant turn unchanged. On `pause_turn`, call again.
4. If there's no tool call, nudge once ("Call submit_reply now"). A second miss ends with `no_submit`.
5. Run the turn's tool calls concurrently, validating each input with Zod first. Bad input, unknown tools, and thrown errors come back as `is_error` tool results. Results are capped at 20,000 characters.
6. When the submit tool is called with valid input, run `check`. No problems: return `submitted`. Problems: send them back once as an `is_error` result for the submit call, then return the next valid submission with its remaining problems.
7. Invalid submit input goes back as an error with the Zod issues (AG-03).
8. Stop with `limit` when the round budget, tool budget, or wall clock runs out.

Messages are only appended, never edited.

### Bounds

| Limit | `COMPASS_LIMITS` | `SPECIALIST_LIMITS` | `REVIEW_LIMITS` (Quill review) |
|---|---|---|---|
| `maxModelRounds` (calls after the first) | 3 (4 calls total) | 3 | 3 |
| `maxToolCalls` (non-submit) | 8 | 6 | 4 |
| `deadlineMs` | 120,000 | 45,000 | 120,000 |

Compass may also call `consult_*` at most 4 times per request (`MAX_CONSULTS`). The fifth call returns an error result telling it to submit. Specialists get no `consult_*` tools, so they can't call each other (AG-02).

AG-01 permits at most four Compass calls (initial plus three rounds). The orchestration deadline stops new rounds; SDK timeouts and per-queue expiry bound already-running calls and tools.

### Tools and submit

- `consult_<role>` for each role in `snapshot.enabledSpecialists`. Input: `{ question }` (up to 600 characters). Returns the `SpecialistResult` plus `catalogSources`, the real `sourceUrl` and `verifiedAt` for each catalog item the specialist cited, looked up through the port.
- Calculators: `ledger_gap`, `ledger_compare_offers`, `ledger_loan_payment`, `count_words`, `days_until`. Each returns a `calcId` (`calc:1`, `calc:2`, ...) that the receipt must cite.
- `submit_reply` (schema `CrewReply`) for chat. `runWeeklyPlan` uses `submit_plan` with up to 8 `PlanItemInput` items plus a `CrewReply`.

The first user message is the snapshot and the last 10 messages, each wrapped as untrusted data, followed by the student's text and a note naming any @mentions.

### Outcomes

| Loop result | Reply | Job status | `safety` |
|---|---|---|---|
| Crisis phrase in the message | `CRISIS_REPLY` (988 Lifeline, 911), no model call | `ready` | `crisis` |
| Submitted, guards pass | The reply, with contributors set in code | `ready`, or `needs_input` if `needsInput` | null |
| Submitted, guards still failing after the retry | Text kept, failing receipt items and cards dropped | as above | `partial` |
| Refused | "I can't help with that one, but I'm happy to keep working on your plan." (logged `crew.refusal`) | `ready` | `refusal` |
| Limit or no submit | The model's last text, or "I ran out of time on that one..." | `needs_input` | `partial` |

### Effort per route

| Run | Effort | Max tokens |
|---|---|---|
| Compass chat and weekly plan | `medium` | 16,000 |
| Specialist consults | `medium` | 16,000 |
| Quill essay review | `high` | 16,000 |
| Aid offer parse | `high` | 16,000 |
| Aid appeal outline, Prep retake explanation | `medium` | 16,000 |
| Catalog extraction (live and batch) | `low` | 8,000 |
| Catalog research | `medium` | 16,000 |

## Specialists

Each specialist has its own system prompt (the shared product rules plus role guidance), effort `medium`, read-only data tools over the port, and `submit_result` (schema `SpecialistResult`). `consultSpecialist` forces `role` to the one asked, and on a refusal, limit, or missing submit returns "I couldn't finish that check." with an uncertainty line instead of throwing.

| Role | Job | Tools |
|---|---|---|
| Scout | Matches and why, eligibility unknowns, value per hour, deadlines, scam warnings. | `get_matches` (private matches withheld entirely, counted as `privateMatches`), `search_scholarships`, `get_scholarship`, `get_deadlines` |
| Atlas | College list, fit balance, plans and deadlines, requirements, test policy, outside-scholarship policy. | `get_college_list`, `get_college`, `get_application_items`, `get_deadlines`, `get_test_scores` |
| Quill | Essay coaching, story matching (up to 3), story interviews (up to 5 questions). Never writes essay text. | `list_stories` (summaries), `get_story`, `get_essay`, `count_words` |
| Aid | FAFSA and CSS checklists, award letters, appeals, special circumstances. Never asks for an FSA ID. | `get_aid_checklist`, `get_offers`, `get_costs`, `get_college` |
| Ledger | Costs, gaps, offer comparison, loan payments. Never recommends a lender. | `get_costs`, `get_offers`, `ledger_gap`, `ledger_compare_offers`, `ledger_loan_payment` |
| Prep | Scores, superscores, test policy, retake value, study sessions. | `get_test_scores`, `get_college_list`, `get_college`, `retake_value` |
| Impact | Service hours and verification, activity descriptions (150 characters), reflections, service ideas. | `get_activities`, `get_service_progress`, `count_chars` |

In the family audience, `list_stories`, `get_story`, and `get_essay` are removed, because essays and stories aren't shared by default. Specialist calculation ids are `calc:<role>-<n>` so they never collide with Compass's.

### Job-level runs

| Function | Job | What it does | Output |
|---|---|---|---|
| `runEssayReview` | `essay.review` | Quill reads the prompt and draft (both untrusted) and returns 1 to 5 margin comments. Each must quote the draft exactly, be 60 words or fewer, and pass the integrity guard. One corrective turn; comments still failing are dropped and logged without essay text. | `{ comments, refused }` |
| `runOfferParse` | `offer.parse` | One `extract` call with the PDF as a document block and `ParsedOffer` as the JSON schema. Code drops $0 lines. The student reviews every line before it counts. | `{ parsed, refused }` |
| `runAppealOutline` | `appeal.outline` | Aid writes an outline (points, documents, who to contact, timeline). "Dear", "Sincerely", "Respectfully", or any line over 35 words gets one corrective turn, then a safe outline built in code. | `CrewReply` from Aid and Ledger |
| `runRetakeExplanation` | `prep.retake` | Prep explains `computeRetake`'s numbers in 120 words or fewer, with up to 3 study-session cards. Every dollar figure must match the analysis. One corrective turn, then a template. | `CrewReply` from Prep |
| `runWeeklyPlan` | `plan.weekly` | Compass picks up to 8 items. Code pins them to the week, drops duplicates and items pointing at unknown records. | `{ items, reply }` |

## Contracts

`SpecialistResult` (what a specialist returns to Compass):

| Field | Type | Rule |
|---|---|---|
| `role` | SpecialistRole | Forced to the role consulted. |
| `summary` | string, up to 1,200 | What Compass should tell the student. Quill: at most 25 words of its own in a row. |
| `proposedActions` | up to 6 `{ title, minutes, dueOn, valueUsd, refType, refId }` | Dates and dollars only when on record. |
| `factsUsed` | up to 12 `{ claim, source, refId, verifiedAt }` | `source` is profile, record, catalog, calculation, or document. |
| `uncertainty` | up to 6 strings | Anything unconfirmed, stale, or estimated. |
| `needsPermission` | up to 4 strings | What the student would need to share first. |

`CrewReply` (what the student sees, stored in `messages.reply`):

| Field | Type | Rule |
|---|---|---|
| `text` | 1 to 2,000 characters | Prompt asks for under 120 words, next step first. |
| `contributors` | 1 to 8 crew roles | Set in code: `compass` plus everyone consulted. |
| `question` | string up to 300, or null | At most one (CR-03). |
| `actionCards` | up to 4 | `add_plan_item`, `save_scholarship`, `add_college`, `start_essay`, `open_link` (internal paths only), `record_decision`, `confirm_fact`. |
| `receipt` | up to 12 `{ kind, label, refId, sourceUrl, verifiedAt }` | `kind` is fact, record, catalog, or calculation. |
| `safety` | `crisis`, `refusal`, `limit`, `partial`, or null | Set in code, never by the model. |
| `needsInput` | boolean | Drives the `needs_input` job status. |

Reference ids are `<type>:<id>` with types `fact`, `record`, `scholarship`, `college`, `essay`, `story`, `calc`.

## Guards

| Guard | Runs on | Checks | On failure |
|---|---|---|---|
| Crisis (`detectCrisis`) | The user's message, before anything else | Self-harm phrases (not hyperbole like "this essay is killing me"). | Reviewed `CRISIS_REPLY`, job `ready` with `safety: "crisis"`, no specialists (CR-09). |
| Integrity (`checkIntegrity`) | Quill consult summaries and essay review comments | Longest run of words whose trigrams don't appear in the student's own texts (stories, essays Quill read, the draft). Over 25 fails. | One corrective turn. Consults: summary replaced with "I only give feedback and questions, not essay text." Reviews: comment dropped. Logged without text. |
| Sources (`checkSources`) | Every Compass reply | Each receipt item cites a fact, record, catalog item, or calculation the run actually saw; catalog items copy the exact `sourceUrl` and `verifiedAt`; cards point at known scholarships, colleges, and records. | One corrective turn, then failing items and cards are stripped and `safety` becomes `partial`. |
| Privacy (`checkPrivacy`) | Every Compass reply | In the family audience: no memory facts, and essays, stories, scholarships, and colleges only if the category is allowed. | Same as sources. |
| Untrusted content (`wrapUntrusted`) | Every snapshot, history, page, letter, and draft sent to a model | Wraps text in `<untrusted label="...">` and escapes any closing tag inside it. Prompts say the content is data. | Not a pass/fail check. The defense is that tools are read-only and writes need a click. |

The family privacy check uses the default shared categories, not the student's actual grants (review log D4). It's stricter than needed: family replies won't cite essays or stories even when they're shared.

## Model client rules

- Model `claude-opus-5-5`. Every call is `client.beta.messages.create` with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`. Batches are the exception: the Batch API rejects fallbacks.
- Effort is always explicit through `output_config.effort`. No `thinking` parameter (the model always thinks), no assistant prefill.
- The system prompt is one text block with `cache_control: { type: "ephemeral" }`. Nothing per-request goes in it, so it stays cached (AG-05).
- Data and calculator tools are sent with `strict: true`; submit tools omit strict mode and are checked with Zod, with one invalid-submit retry. Each strict tool carries and a schema from `toStrictJsonSchema`. That drops keywords strict tools reject (`minimum`, `maxLength`, `pattern`, and similar) and rewrites `oneOf` to `anyOf`. Zod re-checks every constraint when the input comes back.
- No forced `tool_choice`. Agents finish by calling their submit tool; the loop nudges once if they don't.
- `stop_reason: "refusal"` is handled before content is read. Responses are read by block `type`.
- Extraction calls (`extract`) send no tools and use `output_config.format` with a JSON schema, then validate with Zod.
- SDK errors become `AppError("internal")` with the status and a rate-limit flag. Code never matches on error text.

## Scripted and demo models

`createScriptedModelClient(script)` (`@scholarcrew/agents/testing`) implements `ModelClient` without network access. The script is a list of turns or a function of the request. It records every request so tests can assert on prompts, tools, and message history. Each turn reports 100 input and 50 output tokens unless the script says otherwise. `createFakePort` provides fixed sample data (the `JORDAN` fixtures).

`SCHOLARCREW_FAKE_MODEL=1` makes the worker use the scripted client, so local dev, CI, and Playwright run with no API key and canned replies. The script the worker uses in that mode (the demo model) belongs to plan 12. Catalog tests use their own `createFakeExtractModel`.

## Cost tracking

- `costMicros(usage)` prices tokens at 4 (input), 20 (output), 0.2 (cache read), and 5 (cache write) micro-dollars each.
- Every model turn calls `onUsage(role, turn)`. The worker turns that into `crew.recordAgentRun`, which writes an `agent_runs` row (role, model, tokens, cache tokens, stop reason, cost, duration) and adds the cost to `crew_jobs.cost_micros`.
- `billing.recordUsage` adds to the monthly `usage_counters` row (`crewRequests`, `costMicros`). The allowance is checked before queueing by `crew.sendMessage`, `essays.requestReview`, `prep.requestRetakeAnalysis`, and `plan.requestWeeklyPlan`: 20 requests a month on Free, 300 on Family and Season Pass.

Successful job completion bills usage inside its lease-checked transaction once per job, against the job creation month. Every attempt accumulates cost durably on the job before optional telemetry is validated; completion or reaping charges those costs once in the creation month. Failed jobs consume no request allowance. Catalog calls record usage with the submitter id where applicable. Direct crisis replies use no model and consume no allowance; a model handoff consumes no request allowance, while its spent model cost remains in internal usage accounting.

SDK calls have a 120-second timeout and one retry, with a maximum honored retry wait of 60 seconds. Queue expiries are calculated from those bounds. Compass also hands off indirect crisis messages to the reviewed reply; the keyword floor runs in core before any rate or allowance check.
