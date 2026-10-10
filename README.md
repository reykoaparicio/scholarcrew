# ScholarCrew

ScholarCrew is a website where a high school student, and their parents if the student invites them, get a crew of AI specialists that plans scholarships, essays, college applications, and the cost of college. This repo holds the whole product: a Next.js web app, a background worker, shared TypeScript packages, and the Postgres schema.

## Prerequisites

- Node 22.9 or later (the scripts use `--env-file-if-exists`). The major version is pinned in `.nvmrc`; with nvm, run `nvm install` once.
- pnpm 10.33.0 through Corepack, which ships with Node. The version is pinned in `package.json`.
- Docker with Compose v2, for the local Postgres 16 database.
- `openssl`, to generate an encryption key.

## Setup

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

Copy `.env.example` to `.env` before you run any `db:*` or `dev` script. The scripts load it with Node's `--env-file-if-exists` flag, so hosts that inject env vars without a `.env` file still work. `check-env` tells you which keys are missing or malformed and never prints their values.

The web app runs at http://localhost:3000. The defaults keep everything on your machine:

- `SCHOLARCREW_FAKE_MODEL=1` makes the crew use a scripted model, so you don't need an Anthropic key. Set it to `0` and fill in `ANTHROPIC_API_KEY` to use Claude.
- With `RESEND_API_KEY` empty, email is written to the `dev_outbox` table instead of being sent. With `ENABLE_DEV_ROUTES=1`, open `http://localhost:3000/api/v1/dev/outbox/latest?to=you@example.com` to read your latest sign-in link.
- Stripe and Twilio keys stay empty in development. Checkout and SMS are off until you set them.
- Postgres listens on `localhost:54320`. `scholarcrew` is the dev database and `scholarcrew_test` is the test database. Tests empty every table in the test database, so never point `TEST_DATABASE_URL` at data you want to keep.

## Common commands

| Command | What it does |
|---|---|
| `pnpm dev` | Runs the web app and the worker in watch mode. |
| `pnpm lint` | Checks lint and formatting with Biome. |
| `pnpm format` | Applies Biome fixes and formatting. |
| `pnpm typecheck` | Runs `tsc --noEmit` in every package. |
| `pnpm test` | Runs Vitest in every package. |
| `pnpm build` | Builds every package that has a build step. |
| `pnpm db:up` | Starts Postgres in Docker. |
| `pnpm db:wait` | Waits up to 30 seconds for Postgres to accept connections. |
| `pnpm db:generate` | Generates a Drizzle migration after a schema change. |
| `pnpm db:migrate` | Applies migrations to the dev database. |
| `pnpm db:migrate:test` | Applies migrations to the test database. |
| `pnpm db:seed` | Loads fictional sample data into the dev database. |
| `pnpm e2e` | Runs the Playwright flows. Install the browser once with `pnpm --filter @scholarcrew/e2e exec playwright install chromium`. |
| `pnpm evals` | Runs the model evals against the real API. They need `ANTHROPIC_API_KEY` and cost money. |
| `pnpm --filter <package> test` | Runs one package's tests, for example `pnpm --filter @scholarcrew/domain test`. |

To start over with empty databases, run `docker compose down -v`, then `pnpm db:up`. Postgres runs `scripts/create-test-db.sql` only when it first creates the data volume. If your volume is older than that file, create the test database once with `docker compose exec db createdb -U scholarcrew scholarcrew_test`.

## Where things live

- `docs/product/features.md`: the feature spec. Every feature has an ID such as `CR-01`.
- `design/`: concept mockups as PNGs, plus the static HTML and CSS they were drawn from.
- `plans/`: the implementation plans. Start with `plans/00-overview.md`, which covers the architecture, conventions, and package contracts.
- `packages/`: shared code (domain schemas, database, calculators, jobs, services, agents, catalog, UI kit).
- `apps/`: the web app, the worker, and the Chrome extension.
- `e2e/` and `evals/`: Playwright flows and model evals.
- `presentation/`: a 39-slide product walkthrough built from live screenshots, as a web deck (`ScholarCrew.html`) and PowerPoint (`ScholarCrew.pptx`).
- `scripts/`: the env check, the database wait script, and the test database SQL.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, the web build, and the Playwright flows on every push and pull request.

## Privacy

The app ships no third-party analytics or ad SDKs. Never commit `.env`. Turborepo and Next.js send anonymous usage telemetry by default; turn it off with `pnpm exec turbo telemetry disable` and by exporting `NEXT_TELEMETRY_DISABLED=1` in your shell. CI turns both off.
