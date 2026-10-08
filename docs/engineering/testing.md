# Testing

ScholarCrew has seven test layers. The first five run in `pnpm test` and need nothing but the local Postgres container. Playwright runs the whole stack with the fake model. Model evals call the real API and are run by hand.

| Layer | Where | Talks to | Command |
|---|---|---|---|
| Pure unit tests | `packages/domain`, `packages/engines`, `scripts`, pure helpers anywhere | nothing | `pnpm --filter @scholarcrew/engines test` |
| DB-backed service tests | `packages/db`, `packages/core`, `packages/jobs`, `packages/catalog`, `apps/worker` | `scholarcrew_test` | `pnpm --filter @scholarcrew/core test` |
| Route tests | `apps/web` (`src/app/api/v1/**`) | `scholarcrew_test` | `pnpm --filter @scholarcrew/web test` |
| UI component tests | `packages/ui`, `apps/web` components | jsdom | `pnpm --filter @scholarcrew/ui test` |
| Agent tests | `packages/agents` | scripted model client, fake port | `pnpm --filter @scholarcrew/agents test` |
| End-to-end | `e2e/` | full stack, fake model, Chromium | `pnpm e2e` |
| Model evals | `evals/` | Anthropic API (real model) | `pnpm evals` |

Run everything that gates a merge:

```bash
pnpm db:up && pnpm db:wait
pnpm db:migrate:test
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @scholarcrew/web build
pnpm e2e
```

CI (`.github/workflows/ci.yml`) runs the same steps in two jobs, `check` and `e2e`, against a Postgres 16 service with `SCHOLARCREW_FAKE_MODEL=1`. The `e2e` and `evals` packages have no `test` script, so `pnpm test` never runs them.

## Rules for every test

- Tests live next to the code as `*.test.ts` or `*.test.tsx`, and run with `vitest run`.
- No network and no secrets. Models use `createScriptedModelClient`, Stripe uses the fake `StripeGateway`, email uses `devOutboxEmailSender`, and HTTP fetches use injected fakes (`@scholarcrew/catalog/testing` has a fake `Researcher`, `BatchGateway`, and `fetchPage`).
- Time comes from the clock in `deps`. `createTestDeps()` uses `fixedClock("2026-10-06T15:00:00.000Z")`; call `deps.clock.set(iso)` to move it. Never read `Date.now()` in code under test.
- Assert authorization, not just the happy path: owner, other user, family parent with and without the share grant, helper scope, admin, and the system actor where it applies.

## Pure unit tests

`@scholarcrew/engines` holds every calculator (Ledger money math, eligibility, scam rules, deadlines, word limits, merit tiers, superscores, ranking). Its functions are pure and synchronous, so tests call them with literals and compare results. `@scholarcrew/domain` tests check Zod schemas: what parses, what's rejected, and the inferred types. These run in milliseconds and need no database.

## DB-backed service tests

Every package that touches Postgres shares one test database, `TEST_DATABASE_URL` (default `postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew_test`). `testDatabaseUrl()` reads it from the process, then from the repo-root `.env`, then falls back to that default.

How a run works:

1. Vitest `globalSetup` calls `setupTestDatabase()` from `@scholarcrew/db/testing`, which applies the migrations to the test database once per run. An advisory lock keeps two migrators from colliding.
2. A setup file runs `resetDb(getTestDb())` in `beforeEach`. It truncates every schema table with `RESTART IDENTITY CASCADE`. It leaves `drizzle.__drizzle_migrations` and the `pgboss` schema alone.
3. Each test builds its own rows with `factories` (`user`, `student`, `parent`, `admin`, `family`, `scholarship`, `college`, `essay`, `story`, `conversation`).
4. `fileParallelism: false` keeps files in one package sequential.

Because every package truncates the same tables, only one package's suite can run at a time. `pnpm test` runs `turbo run test --concurrency=1` for that reason. Don't run two packages' tests in parallel; see [local-dev.md](local-dev.md#common-problems).

Core services take `(deps, actor, input)`. A typical test:

```ts
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { actorOf } from "../../test/helpers";
import { createTestDeps } from "../shared";
import { createFact, listFacts } from "./index";

describe("listFacts", () => {
  it("hides another student's facts as not_found", async () => {
    const deps = createTestDeps();
    const { user: owner } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    await createFact(deps, actorOf(owner), { key: "county", value: "Maple", visibility: "crew", source: "user_stated", sourceRef: null });
    await expect(listFacts(deps, actorOf(other), owner.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
```

`createTestDeps()` gives you the shared test DB, an in-memory jobs client (`deps.jobs.sent` lists `{ name, payload }` in order), the fixed clock, the dev-outbox email sender, a fixed 32-byte encryption key, and the fake Stripe gateway. `packages/core/test/helpers.ts` adds `SYSTEM`, `actorOf(user)`, `latestEmail(db, to)`, and `tokenIn(text)` for magic-link and invite flows.

`packages/jobs` also has an integration test against real pg-boss. It uses its own schema, `pgboss_jobs_test`, and deletes the queues it touches before and after the run.

## Route tests

API route handlers are tested by importing the exported `GET`/`POST`/`PATCH`/`DELETE` function and calling it directly. No server runs.

```ts
const res = await GET(new Request("http://localhost:3000/api/v1/facts/abc", { headers: { cookie: "sc_session=..." } }), {
  params: Promise.resolve({ id: "abc" }),
});
expect(res.status).toBe(404);
```

Handlers read the session cookie from `req.headers.get("cookie")`, not from `next/headers`, so they run under plain Vitest. Route tests use the same shared test database and `resetDb` rules as service tests. Cover the status code mapping (`not_found` 404, `invalid_input` 400, `limit_reached` 402, `rate_limited` 429), the error body `{ "error": { "code", "message" } }`, and the `Origin` check: a cookie-authenticated mutation with a foreign or missing `Origin` returns 403 (ID-06).

## UI component tests

`packages/ui` and the web app's components run under Vitest with `environment: "jsdom"` and `@testing-library/react`. Test what a user sees and does: rendered text, roles, labels, and callbacks after clicks. Don't snapshot whole trees. `@scholarcrew/ui` components take data as props, so their tests need no API fakes.

## Agent tests

`@scholarcrew/agents/testing` exports two fakes:

- `createScriptedModelClient(script)` takes a list of `ScriptedTurn`s (or a function of the request) and returns a `ModelClient`. Each turn can carry `text` and `tool_use` blocks, a `stopReason` (for example `"refusal"` or `"max_tokens"`), usage numbers, or an `extract` value. It records every request in `.requests` (and `.extractRequests`), so a test can assert exactly what the model would have seen. It throws when the script runs out of turns.
- `createFakePort(data)` is an in-memory `CrewDataPort`.

With these, tests cover the loop bounds (`COMPASS_LIMITS`, at most 4 consults), refusals, invalid submit output retried once, the guards, and the shape of every prompt, all with no network. The worker's `SCHOLARCREW_FAKE_MODEL=1` mode uses the same scripted client.

## End-to-end tests

`e2e/` runs Playwright against the full stack: web, worker, Postgres, and the fake model, with `ENABLE_DEV_ROUTES=1`. Flows sign in by requesting a magic link and reading it from `GET /api/v1/dev/outbox/latest?to=`. Plan 19 defines the flows and the Playwright config.

```bash
pnpm --filter @scholarcrew/e2e exec playwright install chromium   # once
pnpm db:migrate && pnpm db:migrate:test
pnpm e2e
```

On a CI failure, the `playwright-report` artifact holds traces and screenshots.

## Model evals

`evals/` runs scripted scenarios against the real `claude-opus-5-5` and checks properties of the answers (AG-08): no ghostwriting, sources present, no cross-family leakage, correct math, and no sensitive facts in prompts.

Set `ANTHROPIC_API_KEY` in `.env` (use a key with a spend limit), then:

```bash
pnpm evals
```

Evals cost money and are non-deterministic, so they don't gate the build. Run them before each release and after prompt or model changes, and record results in `evals/results/<date>.md`. A failing safety eval (ghostwriting, cross-family leakage, sensitive facts in prompts) blocks the release until it's fixed.

## Adding a test

1. Pick the lowest layer that can prove the behavior. Math and rules go in `engines`. Access and persistence go in a `core` service test. Status codes and request parsing go in a route test. Rendering goes in a UI test. A full user journey goes in `e2e/` only when lower layers can't show it.
2. Write the test first and watch it fail with the expected message, then implement (the TDD cycle in `plans/21-review-harness.md`).
3. For Postgres, build rows with `factories` and services with `createTestDeps()`. Don't depend on rows from another test or on the dev seed.
4. Run the package alone, then the whole suite:

   ```bash
   pnpm --filter @scholarcrew/core exec vitest run src/memory/facts.test.ts
   pnpm --filter @scholarcrew/core test
   pnpm test
   ```

A new package that touches Postgres needs `globalSetup` pointing at `setupTestDatabase`, a setup file that calls `resetDb` in `beforeEach`, and `fileParallelism: false` (copy `packages/core/vitest.config.ts` and `packages/core/test/`).

## Security scenarios

These must stay covered. Most live in `packages/core` service tests (SE-01); plan 19 adds isolation flows on the full stack.

| Scenario | What the tests assert |
|---|---|
| Cross-user isolation | Every read and write of another user's object (facts, decisions, sensitive facts, documents, exports, essays, offers, helper links, API tokens, notifications, profiles) returns `not_found`, never `forbidden`, so IDs can't be probed. |
| Cross-family isolation | A parent in another family gets `not_found`. A parent in the same family reads only the categories enabled in `shareSettings` and never writes student data. Removing a member or leaving the family ends access on the next call. Paying for a plan grants no access. |
| Admins | An admin gets no automatic access to student data. Admin routes reject non-admins. |
| Helper scopes | A helper actor reads only its link's scope (`deadlines`, `colleges`, `activities`, `stories`, `scholarships`) for its own student. Links last at most 90 days. Revoked or expired tokens resolve to `null`. The helper view renders only scoped sections. |
| Sensitive facts never reach a model | Stored ciphertext never contains the plaintext. `crewVisibleFacts` never returns sensitive values. Specialist tests check that `get_matches` strips reasons marked `sensitive`. Only `readSensitiveForMatcher` (system actor) gets decrypted values. For new agent code, assert on the scripted client's `.requests` that no sensitive value reaches a prompt. |
| Notifications and exports | Emails contain only the notification's title, body, and link. Exports contain only the owner's rows and no secrets. |
| Tokens | Magic links, sessions, invites, helper links, and API tokens are stored as SHA-256 hashes. Magic links expire after 15 minutes and work once. |
| Origin and rate limits | Cookie mutations without a matching `Origin` return 403. Sign-in allows 5 requests per 15 minutes per IP and per email, and the limiter stays atomic under concurrent calls. |
| Untrusted content | Page text, PDFs, and user text reach the model only inside `wrapUntrusted` data blocks. |
| Deletion | `deleteAccount` blocks every credential at once. `purgeDeletedAccounts` removes rows and orphan blobs after 7 days. |

## Production browser and extension audit

Run `pnpm audit:production` with local PostgreSQL running and port 3100 available. Stop any development server using `apps/web/.next` first: production builds and `next dev` share that directory.

This builds the web app and extension, resets only the disposable `_e2e` database, and runs seven Chromium scenarios against `next start` with `NODE_ENV=production`. The worker uses the scripted model and local outbox. Seeded sessions are created directly in the disposable database; the web audit has a non-delivering Resend configuration and never calls sign-in or delivery endpoints. Production validation and disabled development routes stay intact.

The suite checks student/detail screens at 1440, 768, 390, and 320px; public/admin screens at desktop and phone sizes; parent views; empty student and onboarding states; helper and verification pages; uncompressed SSE frames; failed-send recovery; and the built extension on React-controlled form inputs. Screenshots and retained failure traces are written to `e2e/test-results/`.

The extension test verifies review before filling, state updates through React, unchanged parent/essay fields, preservation of edits made after review, no form submission, and a review panel that fits 320px. Live portals requiring a school account remain a separate manual compatibility check; iframe and shadow-root application controls and split first/last names are outside the current extension's supported scope.

The regular `pnpm e2e` command builds the extension and runs 23 browser flows; the six optimized screen/recovery audit scenarios are skipped there and run separately by `pnpm audit:production`. CI runs both commands. The production audit also checks content security policy violations.
