# ScholarCrew: product vision

**Your college team. One plan to get in and pay for it.**

ScholarCrew is a website where a high school student gets a crew of AI specialists that turns "I want to go to college without drowning in debt" into one weekly plan. It answers four questions every week:

1. Which scholarships should I apply to this week? (Verified, ranked by dollars per hour of effort.)
2. Which essays do I need to write, and which of my stories already fit?
3. What's due soon? (Admissions, FAFSA and CSS Profile, scholarships, in one calendar.)
4. How much will each school really cost me? (The gap: cost to attend minus free money.)

Everything the crew does is aimed at shrinking the gap.

## Who it's for

The first customers are high school juniors and seniors and the parent helping them, at schools where one counselor covers hundreds of students, aiming at public and regional universities where merit aid, state grants, and local scholarships actually change the price. Middle-income families ("too much for Pell, not enough for sticker price") are the likely payers. Low-income and first-generation students get sponsored seats through schools, nonprofits, and community foundations (R3).

## The crew

| Name | Job |
|---|---|
| Compass | Coordinator. Plans the week, asks the specialists it needs, writes the one answer. |
| Scout | Scholarships: matches, eligibility reasons, value per hour, scam screening. |
| Atlas | Admissions: college list balance, requirements, deadlines, recommendations. |
| Quill | Essays: Story Bank, story-to-prompt matching, questions and comments. Never writes the essay. |
| Aid | Financial aid process: FAFSA and CSS checklists, award letters, appeals. |
| Ledger | Money math: net cost, the gap, offer comparisons, loan payments. Calculated by code. |
| Prep | ACT/SAT/PSAT: scores, superscores, whether a retake is worth it. |
| Impact | Community service hours, verification, activity descriptions. |

Under the hood there are four kinds of agents: the crew (model-driven, each with a narrow prompt and only the data it needs), calculators (plain code), guards (check every reply), and background workers (sweeps, reminders, document reading, catalog re-checks).

## What makes it different

- One plan across admissions and money, instead of separate tools.
- Every scholarship, deadline, and requirement carries a source and a verified date.
- Essay reuse through the Story Bank, with integrity built in: the student writes, Quill coaches.
- Award-letter decoding that separates free money from work-study and loans, plus appeal help.
- Family sharing per category. Paying for a plan doesn't unlock anyone's private data.
- No lead generation. We never sell student data, take lender referral fees, or run sweepstakes.

## Product rules

These hold for every feature (see `features.md` for the full list):

1. The student writes every essay.
2. Nothing is submitted for the student.
3. No fact without a source.
4. Money math is code.
5. Sensitive facts are opt-in, encrypted, read only by code (matching and income-based cost estimates), and never sent to a model.
6. Sharing is per category and per person.
7. No selling data, no lender fees, no sweepstakes, no "guaranteed money" claims.
8. No users under 13.

## Releases

- **R1:** profile, verified matches, weekly plan, Story Bank, essay coaching, the gap per school, memory controls, public directory, admin catalog tools.
- **R2:** award letters and appeals, application requirements, parent seat and family room, FAFSA/CSS checklists, recommenders, helper links.
- **R3:** test prep, community service, counselor view, SMS, sponsored seats, browser extension.

## How we'll know it works

North star: weekly active students who submit at least one matched application on time with their own writing. Lagging outcome: verified aid won per student, from award letters and Won outcomes the student records.

Stop or narrow if students only want search and ignore the crew, if Story Bank reuse doesn't save time, or if neither parents nor sponsors will pay.
