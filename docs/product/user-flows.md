# Signature user flows

Each flow lists the screens, the crew members involved, the API calls, and the jobs that run. Feature IDs point at `features.md`.

## 1. First visit to first plan (ID-01, ON-01..ON-06)

1. The student enters an email on `/sign-in`. `POST /api/v1/auth/magic-link` sends a one-time link (15 minutes).
2. The link hits `GET /api/v1/auth/verify`, which creates the account and a 30-day session and redirects a new user to `/onboarding`.
3. Five onboarding steps (mockup `design/mockups/screens/09_Onboarding.png`): about you (birth year, class year, school, county), grades and interests, matching opt-ins (sensitive facts, all off by default), starter uploads (transcript, past essays), colleges and family (starter list, invite a parent). `POST /api/v1/onboarding` saves everything. Under 13 ends at step 1 with an explanation.
4. Onboarding enqueues `sweep.student` (Scout's first matches) and `plan.weekly` (Compass's first plan). `/week` shows "your crew is working" until both finish.

## 2. "I have 2 hours this weekend" (CR-01..CR-06, WK-01, SC-05, ES-06)

1. On `/crew` the student sends the message. `POST /api/v1/conversations/:id/messages` returns a job; the page follows `GET /api/v1/jobs/:id/events` over SSE.
2. The worker runs `crew.request`: Compass after the core crisis check (crisis messages finish immediately without queueing) with the student's context snapshot.
3. Compass consults Atlas (an unstarted Early Action supplement), Scout (matches due within 3 weeks), and Quill (two prompts fit a story already drafted). Ledger tools rank by deadline, value, and effort.
4. The guards check that every receipt item has a source, then the reply is saved. It names the contributors, gives a 2-hour plan, shows "What the team used", and offers "Add both to my weekend".
5. Clicking the card calls `POST /api/v1/actions/apply`. Applying it twice changes nothing.

## 3. Essay coaching without ghostwriting (ES-01..ES-09)

1. The student opens `/essays/[id]` (Essay Studio), writes, and saves. Each save is a version with a word count (`POST /api/v1/essays/:id/versions`).
2. "Ask Quill" calls `POST /api/v1/essays/:id/review`, which enqueues `essay.review`.
3. Quill returns 1–5 comments. Each one quotes the student's own sentence and asks a question or makes an observation. The integrity guard drops anything with more than 25 consecutive words of new prose.
4. Comments appear next to the highlighted quotes. The student resolves them as they revise.

## 4. Which offer is cheaper? (MO-04..MO-09)

1. In March the student uploads award letters (`POST /api/v1/documents`, then `POST /api/v1/offers`).
2. `offer.parse` has Aid extract every line with its category, amount, renewability, page, and quoted text.
3. The student reviews and corrects the categories on `/money/offers/[id]`, then confirms.
4. `/money/offers` shows Ledger's comparison: what the letter says you owe versus what really costs you, year 1 and over 4 years, with warnings like "$6,000 grant is year 1 only".
5. "Draft an appeal with Aid" enqueues `appeal.outline`. Aid returns points, documents, and contacts. The student writes the letter.

## 5. Parent joins (FA-01..FA-07, AID-01)

1. The student invites Dana from `/family` (`POST /api/v1/family/invites`).
2. Dana signs in from the link and accepts at `/family/join`.
3. Dana sees only the categories the student shares (deadlines, colleges, costs, scholarships, and activities by default). Essays, chats, stories, and sensitive facts stay private.
4. FAFSA contributor steps appear as Dana's family tasks. Dana can offer an income range without sharing documents; it arrives disabled until the student enables it in Memory.
5. In the family room, the crew answers using shared numbers only.

## 6. Weekly rhythm (SC-10, NO-02, NO-03)

- Sunday 14:00 UTC: `sweep.weekly` fans out `sweep.student` for every active student. New matches create a notification.
- Every hour: `reminders.deadlines` sends 7-, 3-, and 1-day reminders. Each one fires once per item and offset.
- Every hour: `digest.weekly` emails students whose digest day and hour match their time zone, and skips anyone with nothing new.

## 7. Keeping the catalog true (CA-01..CA-06, AD-01..AD-04)

1. An admin starts research for a state (`POST /api/v1/admin/research`). The worker uses web search and fetch to find candidate pages and creates review tasks.
2. Extraction turns each page into a structured draft with a quote for every field. Verification rules check quotes, deadlines, amounts, and scam signals.
3. An admin compares fields with quotes on `/admin/tasks` and publishes or rejects.
4. Every night, listings verified more than 30 days ago (or due within 45 days) are re-fetched and re-extracted through the Batch API. Changes mark the listing stale and create a review task.
