# Implementation readiness review — October 7, 2026

Status: **planning review complete; ready to implement in the phase order in 00-overview.md.** No application implementation was performed.

## Changes applied

Round-four security, authorization, and runtime corrections are incorporated directly into the numbered plans, proposed modules, and regression tests. The overview, OpenAPI specification, product requirements, architecture, deployment, and operational documents now share the revised contracts.

The final completeness review closed these integration defects:

- Family grants are re-read for protected source reads and before returning a model reply. Revoked categories are removed from model history. Shared stories do not expose unshared essay titles or ids through their uses.
- Private sensitive awards are withheld from parents, helpers, and model sources; counts remain available. Helpers cannot recover private award identities from saved awards or deadlines. Income labels and bracket tables remain outside model tools.
- Crisis handling precedes allowances and rate limits. Indirect distress has both a scripted regression and a real-model evaluation case. URL query parameters only prefill the composer.
- Worker leases prevent duplicate completion. Completion failures release the matching lease. All attempt costs accumulate durably on the job before optional telemetry validation; completion or stale-job reaping bills once, atomically, in the creation month. Pending weekly plans reserve allowance until completion, including system plans whose terminal completion consumes no request.
- Export requests serialize per user; builders lock the export row and commit its encrypted blob and ready state together. Ready retries recover notification enqueue failures without rebuilding or downgrading a completed export. Delivery timestamps prevent duplicate sends.
- Stripe event handling serializes by owner, respects event ordering, and refuses account deletion when a required cancellation gateway is unavailable.
- Fixtures now include required job usage months and immutable essay version/body inputs. Local imports and exports, JSON history expectations, route counts, and final test totals were reconciled.
- E2E coverage includes private award visibility, invitation restrictions, family removal and leave, sharing revocation, sensitive alias rejection and audit sanitization, nonce CSP, duplicate delivery, stale lease recovery, crisis limits, and prefill-only navigation.
- Implementation phases now account for database-dependent queue tests and run checks only after their packages exist. Production CSP checks remain separate from the development E2E server.

## Validation completed

These are planning-artifact checks, not executed application tests:

- 1,019 embedded TypeScript/TSX blocks parsed with zero syntax errors.
- No unbound local symbols remained after excluding declared append/replacement fragments and runtime globals.
- Imports were compared against exports collected from 985 documented module paths; no unresolved named imports remained among those documented modules.
- OpenAPI YAML parsed successfully: 127 paths and 1,095 reference occurrences, all internal references resolving.
- JSON examples and relative Markdown links were checked.
- All 146 product feature identifiers have coverage in numbered plans; the 19 design screens were inspected for coverage.
- Final declared test totals were reconciled using AST counts, including parameterized cases. Plan 19 contains 22 browser tests, 47 scripted evaluation tests, and 20 real-model cases across six scenarios.
- The repository still contains only design, plans, and docs directories. No app, package, migration, or runtime implementation was created.

## Accepted scope decisions

The existing decisions in [round-four fix plan §3](r4-fixplan.md#3-declined-or-deferred) remain explicit scope choices, rather than unfinished review fixes. They include row-bound encryption AAD, a transactional queue outbox, metadata-only essay history/export size caps, DB-clock message ordering, and automatic refunds for inactive season-pass buyers. The operational runbook covers manual refunds; the reaper bounds abandoned queued work. Aggregate cost figures retain the documented income-inference risk. User-authored text can mention private subjects; filtering applies to application-retrieved records and matching metadata.

The queue outbox deferral means a failed enqueue can leave an orphaned request row, and a resubmitted message can be stored twice. Post-completion notices or candidate filing can also fail independently of the completed reply and usage transaction. These limits are recorded in round four and must remain visible during implementation.

## Implementation gates

Run the numbered plans in the overview's phase order. The implementation must pass the phase-appropriate typechecks, database-backed tests, lint, builds, the browser suite, production CSP smoke checks, and release-blocking evaluations. This review does not claim those future gates have run. Review and validate pinned SDK/framework behavior when installing dependencies, as required by the existing execution gates.

## Provider reference checks

- [Next.js 15 CSP guide](https://nextjs.org/docs/15/app/guides/content-security-policy)
- [Anthropic server tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools)
- [Anthropic TypeScript SDK retry implementation](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts)

The pinned SDK retry implementation was inspected locally. Its uncapped date-valued Retry-After handling motivated the explicit 60-second cap in the proposed fetch wrapper. Catalog server tools explicitly permit direct callers.
