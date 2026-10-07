# ScholarCrew feature spec

This is the requirements source for every plan file in `plans/`. Each feature has an ID, a release, and acceptance criteria. A plan task that implements a feature cites its ID; a feature with no task is a planning bug.

Releases:

- **R1 (MVP):** the find-and-fund loop. Profile, verified scholarship matches, weekly plan, Story Bank, essay coaching, the gap per school, memory controls.
- **R2 (Next):** award letters and appeals, application requirements per school, parent seat and family room, FAFSA/CSS checklists, recommenders.
- **R3 (Later):** test prep, community service, counselor view, SMS, sponsored seats, browser extension.

All three releases are planned in full. Numbered execution phases build the complete product and mix release features by subsystem; R1/R2/R3 are product rollout labels, not executable phase boundaries. A smaller release requires an explicit scoped plan before implementation.

Fixed product rules that every feature inherits:

1. The student writes every essay. Quill comments and asks questions; it never produces submittable prose.
2. Nothing is submitted for the student. No portal logins, no FSA ID, no passwords for other sites.
3. No fact without a source. Scholarships, deadlines, amounts, and requirements carry a source URL and a verified date, or they're labeled unconfirmed.
4. Money math is code. Ledger and the other calculators compute; the model explains.
5. Sensitive facts are opt-in, encrypted, read only by code (the matcher, and the cost estimate for the income range), and never sent to a model.
6. Paying for a plan doesn't grant access to anyone's data. Sharing is per category and per person.
7. No selling data, no lender referral fees, no sweepstakes, no "guaranteed money" claims.
8. Users under 13 can't sign up.

---

## ID: Identity and accounts

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| ID-01 | R1 | Magic-link sign in | Entering an email sends a one-time link that expires in 15 minutes and works once. Unknown emails create an account on first verification. |
| ID-02 | R1 | Sessions and sign out | A verified link creates a 30-day session cookie (httpOnly, Secure, SameSite=Lax). Sign out deletes the session server-side. Expired or deleted sessions return 401 on the API and redirect to sign in on pages. |
| ID-03 | R1 | Age gate | Onboarding asks for birth year. If the user would be under 13 this year, the account is deactivated and the user sees a plain explanation. |
| ID-04 | R1 | Roles | Every user is `student`, `parent`, or `admin`. Parents can't open student-only screens (Essays, Story Bank, crew chat) unless the student shares that category. Admin screens require `admin`. |
| ID-05 | R1 | Delete account | Deleting an account revokes sessions immediately, blocks retrieval of the user's data at once, and hard-deletes owned rows and blobs within 7 days. Shared family objects created by the user are removed from the family room. |
| ID-06 | R1 | CSRF and origin checks | Every cookie-authenticated mutation checks the `Origin` header against the app origin. Mismatches return 403. |

## ON: Onboarding

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| ON-01 | R1 | Profile basics | A 5-step flow captures class year, high school, state, county, GPA (optional), intended majors, and interests. Each saved value becomes a profile fact with source `user_stated`. |
| ON-02 | R1 | Starter uploads | The student can upload a transcript, past essays, or a resume (PDF, text, or image, 10 MB max). Uploads are encrypted at rest and listed in Settings for download or deletion. To turn a past essay into stories, the student pastes it into a Quill story interview (ES-08). |
| ON-03 | R1 | Starter college list | The student can search colleges and add up to 15 to their list during onboarding. |
| ON-04 | R1 | Matching opt-ins | A dedicated step explains sensitive matching facts and lets the student turn each on or off. All are off by default. |
| ON-05 | R2 | Invite a parent | The student can invite a parent by email at the end of onboarding or later. |
| ON-06 | R1 | First plan | Finishing onboarding enqueues a first sweep and a first weekly plan. The This Week screen shows a "your crew is working" state until both finish. |

## WK: This Week

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| WK-01 | R1 | Next step | The top card shows the highest-priority open plan item with its contributors, time estimate, value, and due date, plus "Open" and "Not this week" actions. |
| WK-02 | R1 | Weekly plan | The plan lists open and done items for the current week (Monday start, user's time zone) with minutes, value, due date, and contributor dots. Checking an item marks it done. |
| WK-03 | R1 | Gap card | Shows the year-1 gap for the student's top school: cost to attend, free money, gap, open applications that could cut it, and the estimate source. Computed by Ledger. |
| WK-04 | R1 | Coming up | Lists the next 4 deadlines across scholarships, applications, and aid with days remaining. Items due within 14 days get a warning badge. |
| WK-05 | R1 | Scout sweep card | Shows the last sweep's new matches, total value, how many reuse existing stories, and how many were hidden as scams. |
| WK-06 | R1 | Ask bar | A crew input with 3 suggested @mention chips. Submitting opens the Crew screen with the message ready to send. |

## CR: Crew chat and agents in the product

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| CR-01 | R1 | My Crew room | A private conversation with Compass and enabled specialists. History persists per conversation. |
| CR-02 | R1 | Mentions | `@Scout`, `@Atlas`, `@Quill`, `@Aid`, `@Ledger`, `@Prep`, `@Impact` route attention to that specialist. Compass still writes the reply. |
| CR-03 | R1 | Coordinated reply | Each crew reply names its contributors, gives one answer, and asks at most one question. |
| CR-04 | R1 | Receipt | Each reply has a "What the team used" list of the facts, records, and catalog items consulted, with verified dates for catalog items. |
| CR-05 | R1 | Action cards | Replies can carry action cards (add plan item, start essay, save scholarship, add college, set reminder). Nothing changes until the user clicks. Applying the same card twice has no extra effect. |
| CR-06 | R1 | Job status | Sending a message creates a job with status `queued → working → ready` (or `needs_input` / `failed`). The page streams status over SSE and shows the reply when ready. Closing the tab doesn't stop the job. |
| CR-07 | R1 | Temporary chat | A conversation that loads no memory and saves no new facts or candidates. Deleted after 24 hours. |
| CR-08 | R2 | Context rooms | Asking from a scholarship, college, or essay page starts or reopens a room bound to that object, and the crew sees that object first. |
| CR-09 | R1 | Crisis handling | Messages that indicate self-harm or crisis get a reviewed response with 988 Suicide & Crisis Lifeline info instead of planning. The job is marked `ready` with a safety flag; no specialists run. |
| CR-10 | R1 | Usage allowance | Each plan has a monthly crew-request allowance. At 100%, new crew requests return a clear limit message; manual features keep working. |
| CR-11 | R1 | Refusal handling | A model refusal produces a polite "I can't help with that one" reply and is logged. Server-side fallbacks are enabled on every model request. |

## SC: Scholarships

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| SC-01 | R1 | Catalog search | Search published scholarships by text, state, local area, renewable, amount, deadline window. Retired and flagged listings never appear. |
| SC-02 | R1 | Matching with reasons | The eligibility matcher compares profile facts, enabled sensitive facts, and the citizenship filter against listing rules. Each match has human-readable reasons ("you live in Maple County"). Sensitive facts never appear in reasons shown in the family room. |
| SC-03 | R1 | Board | A board with Matched, Working on, Submitted, Won columns (Lost and Skipped are filters). Moving a card changes its stage. |
| SC-04 | R1 | Detail page | Shows amount, renewability, deadline, requirements, essays with word limits, eligibility, source link, verified date, and stale or unconfirmed labels. |
| SC-05 | R1 | Value ranking | Matches are ranked by expected value per hour: amount × fit score ÷ estimated minutes, with deadline urgency as a tiebreaker. |
| SC-06 | R1 | Scam shield | Listings with fees, guarantees, bank or card requests, or sweepstakes patterns are flagged, hidden from plans, and shown with the reason. |
| SC-07 | R1 | Add a local scholarship | A student can submit a scholarship by URL and notes. It enters the verification queue and is visible only to that student, labeled unverified, until an admin publishes it. |
| SC-08 | R1 | Report a problem | Any listing can be reported (wrong deadline, dead link, scam). Reports create admin tasks. |
| SC-09 | R1 | Outcomes | Marking Won records the amount and one-time vs renewable, updates Ledger's gap, and adds a "send a thank-you note" plan item. |
| SC-10 | R1 | Weekly sweep | Every Sunday the worker re-runs matching for each active student and notifies them of new matches. |
| SC-11 | R2 | Renewal tracking | Renewable awards create yearly renewal reminders with the GPA or enrollment condition. |

## ES: Essays and Story Bank

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| ES-01 | R1 | Essay Studio | Shows the prompt, requirements, and verified date on the left, the student's draft in the middle, and Quill's comments on the right. |
| ES-02 | R1 | Versions and authorship | Every save creates a version with author and word count. Draft history shows all versions. Only the student's own saves create versions. |
| ES-03 | R1 | Limits | Word and character counts follow the target's limit and warn at 90% and over 100%. |
| ES-04 | R1 | Quill review | "Ask Quill" enqueues a review that returns 1–5 comments. Each comment quotes the student's text exactly, is a question or observation, and is 60 words or fewer. The integrity guard rejects comments that contain more than 25 consecutive words of new prose. |
| ES-05 | R1 | Story Bank | Create, edit, archive stories with title, moment (the student's own words), themes, and evidence. |
| ES-06 | R1 | Story match | For a prompt, Quill suggests up to 3 stories with reasons and prior uses. |
| ES-07 | R1 | Reuse tracking | Linking a story to an essay records the use. The UI warns before the same story goes to the same school twice. |
| ES-08 | R2 | Story interview | Quill asks up to 5 questions in chat to help the student capture a new story. The student's answers, not Quill's text, become the story's moment. |
| ES-09 | R1 | Integrity guard | Any Quill output longer than 25 consecutive words of prose not quoted from the student is blocked and regenerated once, then dropped with a logged violation. |

## CO: Colleges and applications

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| CO-01 | R1 | College search | Search the college catalog (seeded from College Scorecard) by name, state, and control. |
| CO-02 | R1 | College list | Add or remove colleges with fit (reach, target, likely) and plan (ED, EA, REA, RD, rolling). Max 25. |
| CO-03 | R2 | Requirements checklist | Each listed college gets application items from the catalog's requirements (form, transcript, recommendations, supplements, tests, fee or waiver). Items can be marked done or not needed. |
| CO-04 | R1 | Deadlines | Application deadlines for the student's plan type appear in Coming up and the deadline watcher. |
| CO-05 | R1 | Outside scholarship policy | Shows whether outside scholarships are added on top, reduce loans first, may reduce the school's grant, or are unknown. |
| CO-06 | R1 | Merit tiers | Shows automatic merit tiers when the catalog has them, and whether the student qualifies on current GPA and scores. |
| CO-07 | R2 | Recommenders | Track recommenders, send a request email with a scoped brag-sheet link, and track status. |
| CO-08 | R2 | List balance | Atlas comments on balance (reach/target/likely counts) and policy risks such as grant displacement. |

## MO: Money

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| MO-01 | R1 | Cost estimate | For each listed college, Ledger estimates year-1 net price from the Scorecard net price for the student's income range (or the overall average when no range is shared), labeled as an estimate. |
| MO-02 | R1 | Calculator result | The student can enter the result of a school's net price calculator. It replaces the Scorecard estimate and is labeled with its source. |
| MO-03 | R1 | Gap | Gap = cost to attend − free money (grants + scholarships, including won outside scholarships counted for that year). Shown per school and on This Week. |
| MO-04 | R2 | Award letter upload | Uploading a PDF letter enqueues a parse job. Aid extracts each line with category, amount, renewability, page number, and cited text. |
| MO-05 | R2 | Line review | The student confirms or corrects each line's category before the offer counts in comparisons. |
| MO-06 | R2 | Compare offers | Year-1 and 4-year cost for each confirmed offer, separating free money, work-study, and loans, with the "letter says you owe" vs "really costs you" distinction. |
| MO-07 | R2 | Citations | Every extracted number links to its page and cited text in the letter. |
| MO-08 | R2 | Appeal outline | Aid produces an outline (points, documents to gather, who to contact) for an appeal. The student writes the letter. |
| MO-09 | R2 | Loan payments | Ledger estimates the monthly payment for listed federal loans on a 10-year standard plan at the rate stored in aid rules for the award year. |
| MO-10 | R2 | Family budget | A parent can share a yearly family budget. Ledger shows the remaining gap after it. |
| MO-11 | R1 | Public offer tool | A no-login page where anyone can type offer lines and see year-1 and 4-year cost. No storage, no AI. |

## AID: Financial aid process

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| AID-01 | R2 | FAFSA checklist | Steps for the current award year: StudentAid.gov account, contributors, consent, submission, Submission Summary review, school list. Parent steps appear as family tasks. |
| AID-02 | R2 | CSS Profile checklist | Shown only when a listed college requires the CSS Profile, with that college's priority date. |
| AID-03 | R2 | State aid deadlines | State grant deadlines from aid rules for the student's state appear in Coming up. |
| AID-04 | R2 | Special circumstances | Aid explains how to request a review when family finances change and lists the documents to gather. |
| AID-05 | R3 | Verification checklist | If a school selects the student for verification, Aid lists the usual documents and tracks them. |

## PR: Test prep

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| PR-01 | R3 | Scores | Record official and practice ACT, SAT, PSAT scores with sections and dates. |
| PR-02 | R3 | Superscore | Compute superscores per test from official sections. |
| PR-03 | R3 | Retake value | Prep shows which listed colleges' merit tiers a target score would unlock and the dollar difference over 4 years. Computed by code. |
| PR-04 | R3 | Study plan | Prep proposes weekly study sessions up to the next test date. Accepting adds them to the weekly plan. |
| PR-05 | R1 | Test policy | Each college shows required, optional, blind, or unknown, and whether it superscores. |

## IM: Community service and activities

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| IM-01 | R3 | Service log | Log hours with organization, date, activity, supervisor, and a short reflection. |
| IM-02 | R3 | Supervisor verification | Requesting verification emails the supervisor a link that expires in 14 days. The supervisor confirms or declines without an account. |
| IM-03 | R3 | Requirement progress | Scholarships that require service hours show verified and total hours against the requirement. |
| IM-04 | R1 | Activities list | Up to 10 activities with role, organization, 150-character description (counted exactly), hours per week, weeks per year, grades. |
| IM-05 | R3 | Reflection to story | Impact suggests a Story Bank draft from reflections; the student edits and saves it. |
| IM-06 | R3 | Opportunity ideas | Impact suggests kinds of local service that fit the student's interests and requirement gaps. No external listings are claimed as verified. |

## ME: Memory

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| ME-01 | R1 | Profile facts | Every fact shows value, source, source date, and who can use it (crew, crew + family, Scout only, private). |
| ME-02 | R1 | Edit and forget | Editing supersedes the old fact. Forgetting deletes the fact and any summaries derived from it, and the crew stops seeing it immediately. |
| ME-03 | R1 | Candidates | Inferred facts are saved as candidates. The student confirms or rejects them. Candidates expire after 30 days and are never used as facts. Sensitive kinds are never inferred. |
| ME-04 | R1 | Decisions log | Compass records decisions the student makes in chat ("skip ED at Northgate") with a date and reason. The student can delete them. |
| ME-05 | R1 | Sensitive facts | First-gen, income range, heritage, disability, religion, military family, foster care, and the non-citizen filter. Encrypted with AES-256-GCM. Read only by the matcher and the cost estimate. Never sent to a model. |
| ME-06 | R1 | Temporary chat | See CR-07. |
| ME-07 | R2 | New season | Archives the admissions cycle (college list, application items, offers) and keeps stories, essays, activities, and facts. |
| ME-08 | R1 | Export | Produces a JSON + Markdown export of everything the student owns. Ready within 10 minutes; download link expires in 24 hours. |
| ME-09 | R1 | Delete account | See ID-05. |

## FA: Family

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| FA-01 | R2 | Invite parent | The student invites by email; the link expires in 7 days and works once, and pending invites can be revoked. A family has one student and up to 4 parents. |
| FA-02 | R2 | Share settings | The student turns sharing on or off per category: deadlines, colleges, costs, scholarships, activities, essays, chats, stories, sensitive. Defaults: deadlines, colleges, costs, scholarships, activities on; the rest off. Turning a category off hides it from parents on the next request. |
| FA-03 | R2 | Family room | A shared conversation where the crew only sees categories both sides shared. Answers say "using shared numbers only." |
| FA-04 | R2 | Parent private space | A parent's own facts (exact income, documents) are visible only to that parent. A parent can share a result, such as an income range, to a student's matching. The student turns it on; it never overwrites their own value. |
| FA-05 | R2 | Family tasks | FAFSA and CSS contributor steps, budget input, and shared reviews appear as tasks assigned to a person. |
| FA-06 | R2 | Family budget | See MO-10. |
| FA-07 | R2 | Leave or remove | A member can leave; a student can remove a parent. Access ends immediately. Already-exported material can't be recalled, and the UI says so. |

## HL: Helpers

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| HL-01 | R2 | Helper links | The student creates a read-only link for a recommender, counselor, or mentor with chosen categories (deadlines, colleges, activities, stories, scholarships only; never essays, chats, costs, or sensitive facts) and an expiry (max 90 days). |
| HL-02 | R2 | Brag sheet view | A recommender link shows the student's activities, the titles and summaries of their non-archived stories, and the request details. |
| HL-03 | R3 | Counselor view | A counselor link shows deadlines, college list, and application item status. |
| HL-04 | R2 | Revoke | Revoking a link makes it return 404 immediately. |

## NO: Notifications

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| NO-01 | R1 | In-app | A bell lists notifications with unread state. |
| NO-02 | R1 | Weekly digest | One email per week on the student's chosen day: plan, deadlines, new matches. Skipped if there's nothing new. |
| NO-03 | R1 | Deadline reminders | Reminders 7, 3, and 1 days before a deadline the student is working on. Deduplicated per item and offset. |
| NO-04 | R1 | Preferences | Digest day, email on or off, quiet hours. Notifications never include sensitive facts or essay text. |
| NO-05 | R3 | SMS | Opt-in SMS for 1-day reminders only. |

## BI: Billing

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| BI-01 | R1 | Free tier | Free: profile, matches, board, calendar, Story Bank, 20 crew requests a month. |
| BI-02 | R1 | Family plan | Stripe Checkout subscription. Covers 1 student and 2 parents, 300 crew requests a month. |
| BI-03 | R2 | Season pass | One-time payment for August–May. Same limits as the Family plan. |
| BI-04 | R1 | Manage billing | Stripe customer portal link. |
| BI-05 | R3 | Sponsored seats | Codes issued by schools or nonprofits that grant the Family plan to a student. |

## PU: Public site

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| PU-01 | R1 | Landing page | Explains the product, the no-data-selling rule, and pricing. |
| PU-02 | R1 | Scholarship directory | Server-rendered pages per state and per scholarship, showing verified dates. No login required. |
| PU-03 | R1 | Offer tool | See MO-11. |
| PU-04 | R1 | Legal | Privacy policy, terms, and AI use policy pages. |

## AD: Admin

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| AD-01 | R1 | Review queue | Lists catalog tasks (research candidates, user submissions, reports, stale re-checks) with status. |
| AD-02 | R1 | Scholarship editor | Edit any listing field, set eligibility rules, publish, retire, or flag. Publishing sets verified date and verifier. |
| AD-03 | R1 | College import | Import or refresh colleges from a College Scorecard CSV extract. |
| AD-04 | R1 | Reports triage | Resolve or reject user reports with a note. |
| AD-05 | R2 | Audit viewer | Search audit events by actor, entity, and action. |

## CA: Catalog pipeline

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| CA-01 | R1 | Research | A research job uses web search and fetch (allowed domains configurable) to find candidate scholarships for a state or county. Results become catalog tasks, never published listings. |
| CA-02 | R1 | Extraction | A fetched page is turned into a structured listing draft with cited source text per field. |
| CA-03 | R1 | Verification rules | Code checks drafts for scam signals, missing required fields, past deadlines, and amount sanity before human review. |
| CA-04 | R1 | Human review | Only an admin publishes. |
| CA-05 | R1 | Re-check | Nightly, listings verified more than 30 days ago (or with a deadline within 45 days) are re-fetched through the Batch API. Changed content creates a review task and marks the listing `stale` until reviewed. |
| CA-06 | R1 | Scorecard import | See AD-03. |

## AG: Agent platform

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| AG-01 | R1 | Bounded orchestration | One crew request makes at most 4 Compass model calls (the first plus 3 rounds) and at most 4 specialist consultations, with a 120-second orchestration budget checked before starting another model round; an already-started call and its tools may finish afterward, bounded by explicit SDK timeouts and the queue-expiry calculation. Exceeding a bound ends with the best answer so far and a "needs input" or partial reply. |
| AG-02 | R1 | Scoped specialists | Each specialist has its own prompt, its own read-only tools, and a data scope. A specialist can't call another specialist. |
| AG-03 | R1 | Typed results | Specialists return `SpecialistResult` through structured outputs; Compass returns `CrewReply`. Invalid output is retried once. |
| AG-04 | R1 | Guards | Source guard, integrity guard, privacy guard, crisis guard, and injection rules run on every reply before it's saved. |
| AG-05 | R1 | Cost controls | Prompt caching on the stable system prompt and tool list. Effort per route: `low` for routing and extraction, `medium` for Compass and specialists, `high` for Quill review and offer analysis. |
| AG-06 | R1 | Usage ledger | Every model call records role, tokens, cache reads, stop reason, and cost. |
| AG-07 | R1 | Refusals | See CR-11. |
| AG-08 | R2 | Eval suite | Scripted scenarios with expected properties (no ghostwriting, sources present, no cross-family leakage, correct math) run on demand against the real model. |

## SE: Security and privacy

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| SE-01 | R1 | Authorization everywhere | Every service function takes an `Actor` and checks ownership or a share grant before reading or writing. Cross-user and cross-family isolation tests pass. |
| SE-02 | R1 | Encryption | Sensitive facts and uploaded files are encrypted with AES-256-GCM using a key from the environment. Keys never reach logs. |
| SE-03 | R1 | Audit events | Sign-ins, share changes, exports, deletions, admin edits, and helper-link use are logged. |
| SE-04 | R1 | Rate limits | Per-user and per-IP limits on sign-in, crew requests, uploads, and public tools. |
| SE-05 | R1 | No trackers | No third-party analytics or ad SDKs on any authenticated page. |
| SE-06 | R1 | Untrusted content | Web pages, PDFs, and user text are passed to models as data blocks, never as instructions. Tools can't widen access. Writes happen only through user-clicked action cards. |
| SE-07 | R1 | Retention | Temporary chats deleted after 24 hours, magic links after 1 day, deleted accounts purged within 7 days, exports after 24 hours. |

## EX: Browser extension

| ID | Release | Feature | Acceptance criteria |
|---|---|---|---|
| EX-01 | R3 | Autofill | On a scholarship form, the extension proposes values from the student's profile and activities for matching fields. The student reviews each value; the extension never clicks submit. |
| EX-02 | R3 | Save to Scout | Saving the current page submits it as a local scholarship (SC-07). |
