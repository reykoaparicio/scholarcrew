# Local development

This page gets you from a fresh clone to a running ScholarCrew: the web app on http://localhost:3000, the worker, and Postgres in Docker. The commands come from the root `README.md` (plan 01) and the scripts defined in `plans/00-overview.md` section 3.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node | 22 LTS | Pinned in `.nvmrc`. With nvm, run `nvm install` once. |
| pnpm | 10.33.0 | Comes through Corepack, which ships with Node. Pinned in `package.json` (`packageManager`). |
| Docker | Compose v2 | Runs Postgres 16 (`postgres:16-alpine`). |
| openssl | any | Generates `ENCRYPTION_KEY`. |

You don't need an Anthropic, Stripe, Resend, or Twilio account to run the app locally.

## First-time setup

Run these from the repo root:

```bash
nvm use
corepack enable
pnpm install
cp .env.example .env
KEY=$(openssl rand -hex 32) && sed -i.bak "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$KEY/" .env && rm .env.bak
pnpm --filter @scholarcrew/scripts check-env
pnpm db:up
pnpm db:wait
pnpm db:migrate
pnpm db:migrate:test
pnpm db:seed
pnpm dev
```

What each step does:

- `check-env` validates `.env` and prints `{"level":"info","msg":"env ok"}`. It names missing or malformed keys and never prints their values. It rejects the all-zero placeholder key from `.env.example`, an `APP_URL` with a path or trailing slash, a `TEST_DATABASE_URL` equal to `DATABASE_URL`, and `SCHOLARCREW_FAKE_MODEL=0` without `ANTHROPIC_API_KEY`.
- `db:up` starts the `db` container. On first start, Postgres runs `scripts/create-test-db.sql`, which creates `scholarcrew_test` next to the dev database `scholarcrew`.
- `db:wait` retries a `select 1` for up to 30 seconds and prints `database ready`.
- `db:migrate` and `db:migrate:test` apply `packages/db/drizzle` to the dev and test databases.
- `db:seed` loads fictional sample data into the dev database (see [Seeded accounts](#seeded-accounts)).
- `pnpm dev` runs `turbo run dev`, which starts the web app and the worker in watch mode.

Keep each `.env` value in sync with `.env.example` when new keys appear. `plans/00-overview.md` section 4 explains every key.

## Daily commands

After pulling:

```bash
pnpm install
pnpm db:up && pnpm db:wait
pnpm db:migrate && pnpm db:migrate:test
pnpm dev
```

Before you push, run the same gate CI runs:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @scholarcrew/web build
```

| Command | What it does |
|---|---|
| `pnpm dev` | Web app and worker in watch mode. |
| `pnpm lint` / `pnpm format` | Biome check / Biome fixes and formatting. |
| `pnpm typecheck` | `tsc --noEmit` in every package. |
| `pnpm test` | Vitest in every package, one package at a time. |
| `pnpm --filter <package> test` | One package's tests, for example `pnpm --filter @scholarcrew/core test`. |
| `pnpm --filter <package> exec vitest run <file>` | One test file. |
| `pnpm db:generate` | Generates a Drizzle migration after you change `packages/db/src/schema`. |
| `pnpm db:seed` | Reloads the sample data. Safe to run again. |
| `pnpm e2e` | Playwright flows. Install the browser once: `pnpm --filter @scholarcrew/e2e exec playwright install chromium`. |
| `pnpm evals` | Model evals against the real API. Needs `ANTHROPIC_API_KEY` and costs money. |

Turborepo and Next.js send anonymous telemetry by default. Turn it off with `pnpm exec turbo telemetry disable` and `export NEXT_TELEMETRY_DISABLED=1`.

See [testing.md](testing.md) for how the test layers work.

## Seeded accounts

`pnpm db:seed` creates three users with fictional data from the mockups in `design/mockups/source/`. Nothing in it is real.

| Email | Role | What's there |
|---|---|---|
| `jordan@example.com` | student | Jordan R., class of 2027, Maple High School, Maple County, TX, GPA 3.72. Onboarding done. Six colleges (ids `99xxxx`), a scholarship board in every stage, the Rotary essay draft (versions 1 and 2), the plan for the week of 2026-10-05, an aid checklist, two crew replies, helper links, and service logs. |
| `dana@example.com` | parent | Dana, in Jordan's family. Holds the Family plan subscription and a shared budget of $4,600 a year. Sees Jordan's data only in the default shared categories. |
| `admin@example.com` | admin | Admin console. The seed adds a flagged scam listing and its report task to the review queue. |

Sensitive facts and award letters aren't seeded. Add sensitive facts through the Memory screen if you need them; that path uses `ENCRYPTION_KEY`.

### Signing in

With `RESEND_API_KEY` empty, email goes to the `dev_outbox` table instead of being sent. With `ENABLE_DEV_ROUTES=1`, you read it over HTTP:

1. Open http://localhost:3000/sign-in and enter a seeded email.
2. Read the newest message for that address:

   ```bash
   curl -s 'http://localhost:3000/api/v1/dev/outbox/latest?to=jordan@example.com'
   ```

   It returns `{ "subject", "text" }`, or 404 when there's nothing for that address.
3. Open the `http://localhost:3000/api/v1/auth/verify?token=...` link from `text`. It works once and expires after 15 minutes.

Sign-in requests are rate limited to 5 per 15 minutes per IP and per email. If you hit the limit while testing, clear the counters:

```bash
docker compose exec db psql -U scholarcrew -d scholarcrew -c 'TRUNCATE rate_limits'
```

### Seeded helper links and hours verification

The seed stores fixed dev-only tokens (`SEED_TOKENS` in `packages/db/src/seed/util.ts`), so these pages open without signing in:

| Page | URL |
|---|---|
| Ms. Patel, recommender (activities, stories) | http://localhost:3000/h/seed-helper-link-patel000000000000000000000 |
| Mr. Okafor, counselor (deadlines, colleges) | http://localhost:3000/h/seed-helper-link-okafor00000000000000000000 |
| Ms. Rivera, hours verification | http://localhost:3000/verify-hours/seed-verify-hours-rivera0000000000000000000 |

Helper links expire 30 days after seeding and the verification request after 14. Run `pnpm db:seed` again to refresh them.

## Web and worker

`pnpm dev` starts two processes:

- `apps/web` (Next.js 15) on port 3000. It serves pages and `/api/v1/*`, and only sends jobs to pg-boss. It never runs cron or queue maintenance.
- `apps/worker` (Node via `tsx`). It creates every queue, registers the cron schedules from `@scholarcrew/jobs`, and runs job handlers: crew requests, essay reviews, offer parsing, sweeps, reminders, digests, email, catalog jobs, exports, and purges.

Both read the same `DATABASE_URL`. Jobs live in the `pgboss` schema of the dev database, so a crew request queued while the worker is down runs when it starts again. If chat messages stay `queued`, check that the worker is running.

To run one side alone, use `pnpm --filter @scholarcrew/web dev` or `pnpm --filter @scholarcrew/worker dev`.

## Fake model or a real API key

| Setting | Behavior |
|---|---|
| `SCHOLARCREW_FAKE_MODEL=1` (default) | The worker uses the scripted model client. No Anthropic calls, no key needed, no cost. Replies are canned, so use it for UI and flow work, not to judge answer quality. CI and Playwright run this way. |
| `SCHOLARCREW_FAKE_MODEL=0` plus `ANTHROPIC_API_KEY` | The worker calls `claude-opus-5-5` with server-side fallbacks on. Every call costs money and is recorded in `agent_runs`. |

To switch, edit `.env`, run `check-env`, and restart `pnpm dev`. Only the worker (and `pnpm evals`) reads the key; the web app never calls the model. Use a development key with a low spend limit set in the Anthropic console.

Stripe and Twilio stay off in development until you set their keys. Without them, checkout fails with "Billing isn't set up" and SMS stays off.

## Resetting the database

Reload the sample data only. This deletes the seed users (their rows cascade) and upserts the catalog rows:

```bash
pnpm db:seed
```

Start over with empty databases. This deletes the Docker volume, so every local row and every queued job goes:

```bash
docker compose down -v
pnpm db:up && pnpm db:wait
pnpm db:migrate && pnpm db:migrate:test
pnpm db:seed
```

Recreate only the dev database and keep the test database:

```bash
docker compose exec db dropdb -U scholarcrew --force scholarcrew
docker compose exec db createdb -U scholarcrew scholarcrew
pnpm db:migrate && pnpm db:seed
```

## Common problems

**Port 54320 is busy.** `db:up` fails with "port is already allocated", or `db:wait` connects to the wrong server. Find the process with `lsof -nP -iTCP:54320 -sTCP:LISTEN`. It's often an old container from another checkout: `docker ps --filter publish=54320`. Stop it, or map a different host port in your local `docker-compose.yml` and change the port in both `DATABASE_URL` and `TEST_DATABASE_URL`. Don't commit the port change.

**Missing `.env`.** Every `db:*`, `dev`, and `check-env` script runs Node with `--env-file`, which exits with a "not found" error naming the `.env` path. Run `cp .env.example .env` and generate the key as in first-time setup.

**Migrations out of date.** Errors like `relation "..." does not exist` or `column "..." does not exist` (Postgres codes `42P01`, `42703`) mean the database is behind the schema. Run `pnpm db:migrate && pnpm db:migrate:test`. Packages with a Vitest `globalSetup` migrate the test database at the start of each run, but the dev database only moves when you run `db:migrate`. If you changed `packages/db/src/schema`, run `pnpm db:generate` and commit the new files under `packages/db/drizzle/`. Never hand-edit them.

**The test database doesn't exist.** Postgres runs `scripts/create-test-db.sql` only when it first creates the volume. On an older volume, run `docker compose exec db createdb -U scholarcrew scholarcrew_test`.

**Tests interfere with each other.** Every Postgres-backed package shares `scholarcrew_test` and truncates every table before each test. `pnpm test` runs packages one at a time (`turbo run test --concurrency=1`) for this reason. If you run two packages' tests at once (two terminals, `pnpm -r test`, or `turbo run test` without the concurrency flag), they delete each other's rows and fail at random with `not_found`, foreign key errors, or wrong counts. Run one package at a time.

**Never point `TEST_DATABASE_URL` at data you want to keep.** Tests empty it. `check-env` refuses a test URL equal to the dev URL, but it can't tell whether some other database matters to you.

**Sign-in link doesn't arrive.** Check that `RESEND_API_KEY` is empty and `ENABLE_DEV_ROUTES=1`, then read the outbox route above. A 429 on the sign-in form means the rate limit; clear `rate_limits`.
