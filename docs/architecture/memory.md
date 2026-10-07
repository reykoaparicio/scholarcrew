# Memory

Everything the crew "remembers" is rows in Postgres that the student can see on `/memory`, edit, and delete. The model keeps nothing between requests. Each crew request gets a fresh `ContextSnapshot` built from these rows and filtered for the audience. The services live in `@scholarcrew/core/memory` (plan 06), with records in plans 07 and 08.

## Layers

| Layer | Table | What it holds | Who writes it | Who can read it |
|---|---|---|---|---|
| Profile | `profiles` | Class year, school, state, county, city, GPA (×100), majors, interests. | The student (onboarding, settings). Onboarding also writes each value as a fact. | Owner; parents per share category; the crew through the snapshot. |
| Profile facts | `memory_facts` (status `confirmed`) | Key, JSON value, `source`, `sourceRef`, `visibility`, `confirmedAt`. | The student (`createFact`, `updateFact`), onboarding, confirmed candidates. | Owner only. The crew sees them by visibility (below). |
| Candidates | `memory_facts` (status `candidate`) | A fact the crew inferred, waiting for the student. Expires 30 days after creation. | System only (`createCandidate`), `source` = `crew_inferred`. | Owner, on `/memory`. Never shown to the crew as a fact. |
| Decisions | `decisions` | "Skip ED at Northgate" with a rationale, date, and optional source message. | The student, directly or by clicking a `record_decision` card. | Owner and the crew snapshot. Never parents. |
| Sensitive facts | `sensitive_facts` | Eight opt-in kinds: first-gen, income range, heritage, disability, religion, military family, foster care, the non-citizen filter. AES-256-GCM ciphertext, IV, tag, and an `enabled` flag per kind. | The student; a parent can share an income range into a student's matching. | Code only: eligibility matcher and income-based cost estimate. The owner sees summaries. Never a model, never parents. |
| Story Bank | `stories`, `story_uses` | Title, moment (the student's words), themes, evidence, summary; where each story was used. | The student. | Owner; parents and helpers if `stories` is shared; Quill through `list_stories` in the student's own rooms. |
| Records | `college_list`, `scholarship_applications`, `essays`, `essay_versions`, `test_scores`, `activities`, `service_logs`, `offers`, `plan_items`, and more | The student's working data. | The student, plus system jobs (sweeps, parsed offers, generated plans). | Owner; parents per category; specialists through read-only port tools. |
| Shared catalog | `scholarships`, `colleges`, `aid_rules`, `aid_deadlines` | Listings and rules with source URLs and verified dates. No personal data (a student's own unpublished submission is the exception, visible only to them). | Admins, the catalog pipeline, the Scorecard import. | Everyone, by listing status and visibility. |

### Fact fields

| Field | Values | Meaning |
|---|---|---|
| `source` | `user_stated`, `document`, `parent_shared`, `crew_inferred`, `system` | Where the value came from (ME-01). |
| `visibility` | `crew`, `crew_family`, `scout_only`, `private` | Who may use it. Default `crew`. |
| `status` | `confirmed`, `candidate`, `rejected` | Only `confirmed` facts are ever given to the crew. |
| `supersededById` | fact id or null | Set when a newer version replaces this one. Current facts have null. |
| `expiresAt` | timestamp or null | Set on candidates (30 days); cleared when confirmed. |

Keys that look sensitive (prefixes `income`, `heritage`, `ethnicity`, `race`, `religion`, `disability`, `citizenship`, `immigration`, `gender`, `sexual`) are refused as facts and as candidates. Those values belong in sensitive facts, and sensitive kinds are never inferred (ME-03).

`scout_only` facts aren't returned by `crewVisibleFacts` for either audience. They remain available to code matching through the profile, while snapshots blank those profile values.

## What the crew sees

The worker's `CrewDataPort.snapshot(ownerId, room, audience)` builds the `ContextSnapshot` (plan 12 implements it over core services with a system actor). The audience is `family` in a family room and `crew` everywhere else.

| Snapshot part | `crew` audience (the student's own rooms) | `family` audience (family room) |
|---|---|---|
| `profile` | Class year, state, county, GPA, majors, interests. | Fields follow the corresponding profile fact visibility and the family sharing rules. |
| `facts` | Confirmed, current facts with visibility `crew` or `crew_family` (`crewVisibleFacts`). | Only `crew_family` facts. The privacy guard still blocks a family reply from citing any fact. |
| `decisions` | Included. | Excluded. |
| `weekPlan`, `deadlines` | Included. | Only if `deadlines` is shared. |
| `colleges` | Every unarchived entry; season is a label. | Only if `colleges` is shared. |
| `enabledSpecialists` | Roles available to Compass. | Same. |
| Matches (Scout's `get_matches`) | Only non-private matches; sensitive matches are withheld entirely and counted. | Empty unless `scholarships` is shared; private matches withheld. |
| Essays and stories (Quill's tools) | Available. | Tools removed in the family audience. |
| Sensitive facts | Never. Only match reasons the matcher produced, and those are stripped before any model call. | Never. |

Everything in the snapshot reaches the model inside a `wrapUntrusted("student_context", ...)` block. The last 10 messages of the conversation go in a second untrusted block.

## Controls

| Control | Feature | What happens |
|---|---|---|
| Edit a fact | ME-02 | `updateFact` inserts a new confirmed row and points the old row's `supersededById` at it. Only a current confirmed fact can be edited (`conflict` otherwise). Creating a fact with an existing key does the same. |
| Forget a fact | ME-02 | `forgetFact` deletes the fact and walks the superseded chain backward, deleting every older version. The next snapshot no longer contains it. Audited as `fact_forgotten` with the key and count. |
| Confirm or reject a candidate | ME-03 | Confirming sets `confirmed`, clears `expiresAt`, and supersedes the current fact with that key. Rejecting sets `rejected`. Expired candidates can't be confirmed (`not_found`) and are hidden from lists. |
| Delete a decision | ME-04 | `deleteDecision`, owner only. |
| Sensitive opt-ins | ME-05, ON-04 | `setSensitiveFact` per kind. All off by default. For the kinds with a value (income range, heritage, religion), turning one off without sending a value keeps the stored ciphertext, and the matcher treats the kind as unset. Audited as sensitive_facts_changed with generic wording and no kind or flag. |
| Temporary chat | CR-07 | A `temporary` conversation with `expiresAt` 24 hours out. `maintenance.purge` deletes it after that. The port returns an empty snapshot and no saved context; no fact or decision cards are applied. |
| New season | ME-07 | `colleges.archiveSeason` sets `archivedAt` on the current college list. Stories, essays, activities, and facts stay. |
| Export | ME-08 | `account.requestExport` queues `account.export`. The file is JSON plus Markdown of every row the student owns (facts, sensitive-fact summaries, stories, essays and versions, conversations and messages, and the rest), stored as an encrypted blob that expires after 24 hours. Document bytes aren't included, only their metadata. |
| Delete account | ME-09, ID-05 | Marks the user `deleted`, ends sessions, revokes tokens and helper links, removes family rooms and share settings at once; `account.purge` hard-deletes after 6 days on the daily run, within 7 days. See [security-privacy.md](security-privacy.md). |

### Open items

- **Temporary chat.** Plan 12 returns an empty snapshot and port for temporary rooms; plan 09 drops fact/decision cards.
- **Candidates.** After successful completion outside temporary rooms, plan 12 files confirm_fact proposals as candidates. The student confirms them; proposed values never become facts automatically.
- **Who records decisions.** ME-04 says Compass records decisions. In the plans, Compass can only propose a `record_decision` card; the decision is written when the student clicks. That follows SE-06 (writes only through cards).
- **Derived summaries.** ME-02 says forgetting also removes "summaries derived from it". No summary table exists, so forgetting removes the fact and its history only.
- **New season.** Explicit archiveSeason archives active college entries and offers; calendar rollover alone never hides entries. Application items hang off archived entries.
- **Candidate retention.** Expired and rejected candidates are hidden but never purged. No retention rule is specified.

## Why memory lives in Postgres

- The student can see every fact with its source and date, change it, forget it, and export it. A model's hidden context can't offer that.
- Visibility and share rules are enforced in SQL and service code before anything reaches a prompt, so a prompt can't widen access.
- Sensitive facts stay encrypted and only code decrypts them for matching and income-based costs. They never need to exist in any prompt.
- Forgetting takes effect on the next request because every request rebuilds the snapshot.
- Nothing depends on the model provider keeping state, so model changes and fallbacks don't lose memory.
