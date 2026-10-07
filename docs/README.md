# ScholarCrew docs

Start with the product vision, then the architecture overview, then local development. `plans/00-overview.md` is the source of truth for conventions and contracts; when a doc and the overview disagree, the overview wins.

## Product

| Doc | What's in it |
|---|---|
| [product/vision.md](product/vision.md) | What ScholarCrew is, who it's for, the crew, the product rules, releases. |
| [product/features.md](product/features.md) | The feature spec. Every feature has an ID (`CR-01`, `SE-07`) and acceptance criteria. |
| [product/user-flows.md](product/user-flows.md) | Seven signature flows, from first visit to first plan through parent joins and keeping the catalog true, each tagged with feature IDs. |

## Design

| Doc | What's in it |
|---|---|
| [../design/mockups/](../design/mockups/) | Concept mockups: 18 desktop screens and 1 phone screen as PNGs in `screens/`, and the static HTML and CSS they were drawn from in `source/`. See `design/README.txt` for the screen list. |
| [../design/ScholarCrew_Mockups_Overview.png](../design/ScholarCrew_Mockups_Overview.png) | Overview board with all 19 screens. |
| [../design/ScholarCrew_System_Diagram.png](../design/ScholarCrew_System_Diagram.png) | Rough system sketch: agents, server, data, outside services. |

## Architecture

These are being written.

| Doc | What's in it |
|---|---|
| [architecture/overview.md](architecture/overview.md) | Packages, processes, and how a request flows through them. |
| [architecture/agents.md](architecture/agents.md) | Compass, the specialists, the agent loop, guards, and model settings. |
| [architecture/memory.md](architecture/memory.md) | Facts, candidates, decisions, sensitive facts, and what the crew sees. |
| [architecture/data-model.md](architecture/data-model.md) | Tables, enums, and ownership rules. |
| [architecture/security-privacy.md](architecture/security-privacy.md) | Authorization, family sharing, helper scopes, encryption, retention. |
| [architecture/jobs.md](architecture/jobs.md) | pg-boss queues, payloads, retries, and cron schedules. |
| [architecture/catalog.md](architecture/catalog.md) | Scholarship research, extraction, verification, and re-checks. |

## API

These are being written.

| Doc | What's in it |
|---|---|
| [api/README.md](api/README.md) | Auth modes, errors, rate limits, SSE, and conventions for `/api/v1`. |
| [api/openapi.yaml](api/openapi.yaml) | OpenAPI description of every route. |

## Engineering

| Doc | What's in it |
|---|---|
| [engineering/local-dev.md](engineering/local-dev.md) | Setup, daily commands, seeded accounts, fake model, resetting the database, common problems. |
| [engineering/testing.md](engineering/testing.md) | Test layers, how to run and add tests, security scenarios. |
| [engineering/deployment.md](engineering/deployment.md) | Production topology, env vars per service, release steps, Stripe, Resend, Anthropic, the encryption key, pre-launch checklist. |
| [engineering/observability.md](engineering/observability.md) | Logs, job health, model cost and usage SQL, catalog freshness, alerts. |
| [engineering/runbooks.md](engineering/runbooks.md) | What to do when jobs back up, the model misbehaves, email fails, data requests arrive, data leaks, or Stripe webhooks fail. |

## Plans

The implementation plans are how the code gets built. They're planning artifacts, not code.

| Doc | What's in it |
|---|---|
| [../plans/00-overview.md](../plans/00-overview.md) | Architecture, pinned versions, conventions, env vars, file ownership, data model, package contracts, API surface, pages, feature coverage, verification suite. Read it first. |
| `../plans/01-*.md` to `../plans/20-*.md` | One plan per subsystem, owned by one agent. Section 6 of the overview lists them with owners and dependencies, and section 15 tracks status. Some aren't drafted yet. |
| [../plans/21-review-harness.md](../plans/21-review-harness.md) | Plan file format, review rounds, the execution and audit loop, final verification. |
| [../plans/review-log.md](../plans/review-log.md) | Cross-plan issues found while drafting and in each review round, with the fix for each. |

Numbered plans that exist today:

- [01-foundation](../plans/01-foundation.md) · [02-domain](../plans/02-domain.md) · [03-database](../plans/03-database.md) · [04-engines](../plans/04-engines.md) · [05-jobs](../plans/05-jobs.md)
- [06-core-identity](../plans/06-core-identity.md) · [07-core-records](../plans/07-core-records.md) · [08-core-planning](../plans/08-core-planning.md)
- [09-agents-runtime](../plans/09-agents-runtime.md) · [10-specialists](../plans/10-specialists.md) · [11-catalog](../plans/11-catalog.md)
- [15-ui-kit](../plans/15-ui-kit.md) · [20-extension](../plans/20-extension.md)
