# Implementation record

Implemented on October 7, 2026 from plans 01–20, with `00-overview.md` as the contract authority and the supplied design system and mockups as the visual reference.

## Delivered

- A pnpm/Turbo TypeScript monorepo with Next.js web application, pg-boss worker, and Chrome Manifest V3 extension.
- Domain validation, a generated Drizzle migration for the PostgreSQL schema, fictional development seeds, and isolated database test helpers.
- Authentication, onboarding, student/family permissions, sensitive-fact encryption, scoped helper links, exports, account deletion, notifications, subscriptions, and sponsorship.
- Weekly plans, crew conversations and action receipts, scholarship matching and catalog moderation, Essay Studio and Story Bank, college applications, financial aid and offer comparisons, Prep, and Impact.
- Claude adapters, scripted development models, specialist tools, guarded model output, background jobs and schedules, catalog ingestion, public pages, and the admin console.
- Unit/integration tests, browser flows, model evaluation fixtures and CLI, CI, deployment guidance, and operational runbooks.

## Integration corrections

The reviewed plan snapshots did not compose unchanged. Implementation corrected imports and renamed the `offerTool.ts` helper to `offerToolState.ts` to avoid its case collision with `OfferTool.tsx` on macOS. Worker configuration now uses the shared encryption keyring; export retries receive the final-attempt context. PostgreSQL date comparisons use typed parameters rather than passing raw JavaScript dates through SQL interpolation.

Active college entries remain visible regardless of their season label; only explicit archival removes them. Parent views keep sensitive scholarship identifiers and reasons private unless authorized. Matching refreshes preserve application stages. Retry tests account for date-specific reminder keys and onboarding's initial crew reply.

The Claude fallback request uses the scalar `"default"` required by the plan; an adapter type bridge handles the installed SDK's narrower type declaration. No real model response was claimed from the scripted development model.

## Adversarial audit

The Bug Hunter and Defender confirmed two defects, and the Referee reviewed their fixes:

1. Scholarship fetching validated DNS but previously allowed the transport to resolve again. The production transport now pins every redirect connection to the validated addresses, retains HTTPS hostname verification, caps response bytes, and closes its dispatcher. A DNS-change regression and a live request to example.org verify the path.
2. A parent could retrieve a previously visible action link after sharing was revoked. Action application now checks the message's categories against current grants before selecting a card or returning an existing receipt. A regression verifies both reply masking and rejected receipt access.

A follow-up ordering audit found that tied clock values could put replies before requests. All message insert paths now allocate strictly increasing timestamps while holding a conversation row lock; the regression covers consecutive requests, replies, and a crisis pair under a frozen clock. The Referee confirmed the correction.

No outstanding findings remained from those audits. Notification reads also preserve optimistic state when an earlier list request finishes late and roll back a failed read request.

## Local operation

PostgreSQL uses Docker on port 54320. The development database is `scholarcrew`; unit/integration tests use `scholarcrew_test`, and browser tests own `scholarcrew_e2e`. The local `.env` contains a generated encryption key and uses scripted models and the database email outbox. It is ignored by Git.

Use `pnpm dev` to start the web application and worker. Follow [local-dev.md](local-dev.md) for seeded accounts and sign-in links, [testing.md](testing.md) for verification, and [deployment.md](deployment.md) before publishing.

## Verification

All local gates passed on October 7, 2026:

| Check | Result |
|---|---|
| Dependency installation, environment validation, development/test migrations, and fictional seed | Passed |
| `pnpm lint` | 1,082 files checked; clean |
| `pnpm typecheck` | All 14 workspace tasks passed |
| `pnpm test` | All 1,978 tests passed across 12 packages |
| `pnpm --filter @scholarcrew/web build` | Production build passed |
| `pnpm --filter @scholarcrew/extension build` | Unpacked Chrome extension generated in `apps/extension/dist` |
| `pnpm e2e` | All 22 Chromium browser flows passed |
| `pnpm --filter @scholarcrew/evals check` | All 47 scripted evaluation tests passed |
| `pnpm evals --dry-run` | Six scenarios and 20 cases validated without model calls |

Visual checks covered This week, scholarships, essays, money, and family on desktop, plus This week, scholarships, and money at a 390px phone width. The phone top bar now wraps into two rows; every checked screen fits the viewport and reported no browser runtime errors. The development indicator is disabled in the preview.

The database suites ran sequentially. Heavy host load caused timeouts in earlier overlapping runs; the final complete test and browser gates passed with separate runs.

## External release checks

The live Claude evaluation run remains pending because no Anthropic API key was supplied. Evaluation fixture validation and scripted evaluation tests are available locally; they do not replace the real safety evaluation required by plan 21 before release. Stripe checkout/webhooks, Resend delivery, and Twilio SMS adapters require their respective credentials and provider setup. No production deployment was performed.
