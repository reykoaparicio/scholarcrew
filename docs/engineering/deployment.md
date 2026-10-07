# Deployment

This page covers what production needs: where each process runs, which secrets each one reads, the order of a release, the third-party setup (Stripe, Resend, Anthropic), and the checks to finish before real students sign up. Hosting choices marked **Recommendation** aren't fixed by the plans; pick equivalents if you prefer.

## Topology

```
            HTTPS
Browser ───────────► web (Next.js 15, `next start`) ──┐
Stripe webhooks ───►                                   │ DATABASE_URL
                                                       ▼
                                          Postgres 16 (app tables + pgboss schema)
                                                       ▲
worker (long-running Node, pg-boss consumers + cron) ──┘
   └─► Anthropic API · Resend · Twilio (R3)
```

| Piece | What it does | Recommendation |
|---|---|---|
| Postgres 16 | All state: users, memory, catalog, encrypted blobs, and the pg-boss job queue (schema `pgboss`). | A managed Postgres 16 service with daily automated backups and point-in-time recovery turned on. |
| web (`apps/web`) | Pages, `/api/v1/*`, the Stripe webhook. Only sends jobs; never runs cron or queue maintenance. | A Node host or container platform running `next start`. Vercel works with the caveats below. |
| worker (`apps/worker`) | Creates queues, registers cron schedules, runs every job handler, and calls the model. | A long-running Node process (container or VM), one instance to start. |

Both processes use the same `DATABASE_URL`. There's no separate queue service: pg-boss stores jobs in Postgres, so a database backup also captures queued work.

The worker can't run on a serverless platform. pg-boss workers poll the database and hold jobs for up to 15 minutes (`expireInSeconds: 900`), and cron needs a process that's always up. If the worker stops, crew replies, emails, reminders, catalog re-checks, and retention purges all stop.

**Recommendation:** give the worker a stop grace period of at least 30 seconds. The worker stops pg-boss with `boss.stop({ graceful: true, timeout: 30_000 })` (00-overview section 14), so in-flight jobs get up to 30 seconds to finish.

### The job event stream behind a proxy

The job stream (`/api/v1/jobs/:id/events`) must not be buffered or compressed by the proxy. With nginx, honor `X-Accel-Buffering: no` or set `proxy_buffering off` for that path. The route sends `Cache-Control: no-cache, no-transform` (which also keeps Next's own compression off it) and a `: ping` comment every 15 s, so an idle read timeout of 60 s or more is enough. After a deploy, check it: `curl -sN -D - -H 'Accept-Encoding: gzip' -H "Cookie: $COOKIE" "$APP_URL/api/v1/jobs/$JOB/events"` should print no `Content-Encoding: gzip` header and show each frame as it happens, not all at once at the end.

### If you host web on Vercel

- Route handlers run with `runtime = "nodejs"`, which Vercel supports.
- `GET /api/v1/jobs/:id/events` streams for up to 130 seconds. Set the function's maximum duration above that, or replies will cut off mid-stream.
- Document uploads allow up to 10 MB (ON-02). Vercel caps serverless request bodies below that, so large award letters fail. A Node host avoids this.
- Each serverless instance opens its own Postgres pool. Watch the connection count, and keep migrations and the worker on a direct connection, because migrations take an advisory lock.

## Environment variables

`plans/00-overview.md` section 4 is the source of truth. Store every secret in your host's secret manager, never in the repo.

| Key | web | worker | migrate | Production value |
|---|---|---|---|---|
| `DATABASE_URL` | yes | yes | yes | The managed Postgres URL, with TLS. |
| `TEST_DATABASE_URL` | | | | Not used in production. Never point it at a production database: tests truncate every table. |
| `APP_URL` | yes | yes | | The public origin, for example `https://app.example.org`. No path, no trailing slash. The web app compares it to the `Origin` header; the worker uses it for email links. |
| `ENCRYPTION_KEY` | yes | yes | | 64 hex characters. The same value in web and worker. See [Encryption key](#encryption-key). |
| `ANTHROPIC_API_KEY` | | yes | | A production key with a spend limit. |
| `SCHOLARCREW_FAKE_MODEL` | | yes | | `0`. |
| `RESEND_API_KEY` | yes | yes | | Required. If it's empty, email silently goes to the `dev_outbox` table and nobody can sign in. |
| `EMAIL_FROM` | yes | yes | | An address on your verified Resend domain. |
| `STRIPE_SECRET_KEY` | yes | | | Live secret key. Empty turns billing off. |
| `STRIPE_WEBHOOK_SECRET` | yes | | | The signing secret of the webhook endpoint below. |
| `STRIPE_PRICE_FAMILY` | yes | | | Price ID of the recurring Family plan. |
| `STRIPE_PRICE_SEASON` | yes | | | Price ID of the one-time Season pass. |
| `ENABLE_DEV_ROUTES` | yes | | | **Unset.** When it's `1`, `/api/v1/dev/outbox/latest` hands out sign-in links to anyone. |
| `CATALOG_ALLOWED_DOMAINS` | | yes | | Comma list of domains catalog research may search, or empty for no restriction. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | | yes | | Only when SMS (R3) ships. |

Also set `NODE_ENV=production` on every process (the seed script refuses to run with it) and `NEXT_TELEMETRY_DISABLED=1` on web.

`pnpm --filter @scholarcrew/scripts check-env` is a development tool: it requires `TEST_DATABASE_URL`. Don't use it as a production health check.

## Release steps

Run in this order. Migrations go first so the old web and worker keep working against the new schema while the new code rolls out. Write migrations to be additive (new tables, nullable columns) so the old code survives the window.

1. **Build** from a clean checkout:

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @scholarcrew/web build
   ```

   Run the install without `NODE_ENV=production`, or pass `--prod=false`. The worker and the migration CLI run through `tsx`, which pnpm skips in a production-only install if it's a dev dependency.
2. **Migrate** against production with `DATABASE_URL` from the secret manager. The `db:migrate` script loads `../../.env` with `--env-file` and fails when the file doesn't exist, so on a host without a `.env` run the CLI directly:

   ```bash
   pnpm --filter @scholarcrew/db exec tsx src/cli/migrate.ts
   ```

   It prints `{"level":"info","msg":"migrations applied","target":"dev"}` ("dev" here means `DATABASE_URL`). An advisory lock makes concurrent runs safe.

3. **Deploy web** (`pnpm --filter @scholarcrew/web start`). Check that `/` loads and sign-in emails arrive.

4. **Deploy the worker** (`pnpm --filter @scholarcrew/worker start`). On start it calls `ensureQueues` and registers the cron schedules; both are idempotent. If the `start` script also uses `--env-file`, supply the variables the same way as in step 2.

Never run `pnpm db:seed` against production. It inserts fictional users with fixed helper-link tokens.

Roll back code by redeploying the previous web and worker builds. Migrations don't roll back automatically; fix forward with a new migration, or restore from point-in-time recovery for a destructive mistake.

## Stripe

1. Create two prices: a recurring Family plan and a one-time Season pass. Put their IDs in `STRIPE_PRICE_FAMILY` and `STRIPE_PRICE_SEASON`.
2. Turn on the customer portal in the Stripe dashboard (BI-04).
3. Add a webhook endpoint at `${APP_URL}/api/v1/billing/webhook` with these events:

   | Event | Effect |
   |---|---|
   | `checkout.session.completed` | Starts the Family plan (subscription mode) or Season pass (payment mode) for the user in `client_reference_id`. |
   | `customer.subscription.updated` | Updates status and period end. |
   | `customer.subscription.deleted` | Marks the subscription `canceled`. |
   | `invoice.payment_failed` | Marks it `past_due`. |

   Other event types are ignored. Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`. A bad signature returns 400 and changes nothing.

Test locally with the Stripe CLI and test-mode keys:

```bash
stripe listen --forward-to localhost:3000/api/v1/billing/webhook
stripe trigger checkout.session.completed
```

## Resend

1. Add and verify your sending domain in Resend (SPF and DKIM records). **Recommendation:** add a DMARC record too, and use a subdomain such as `mail.example.org` so app mail doesn't affect your main domain's reputation.
2. Set `EMAIL_FROM` to an address on that domain, for example `ScholarCrew <crew@mail.example.org>`.
3. Create a sending-only API key for `RESEND_API_KEY`.

Sign-in depends on email. If Resend is down or the domain fails verification, nobody can sign in. See [runbooks.md](runbooks.md#email-not-arriving).

## Anthropic

- Only the worker (and `pnpm evals`) reads `ANTHROPIC_API_KEY`. Use separate keys for production, staging, and evals.
- Every request uses `claude-opus-5-5` with server-side fallbacks on (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`). Catalog re-checks use the Message Batches API, which doesn't take `fallbacks`.
- **Recommendation:** set a monthly spend limit and usage alerts in the Anthropic console, sized from expected crew requests. The app's own cap is the per-user monthly allowance (20 crew requests on Free, 300 on Family and Season pass), but catalog research, extraction, and re-checks aren't covered by it.
- Track spend from `agent_runs` and `usage_counters` ([observability.md](observability.md#model-usage-and-cost)) and compare against the console.

## Encryption key

The primary key in `ENCRYPTION_KEYS` (or fallback `ENCRYPTION_KEY`, id 1) encrypts sensitive facts, uploaded documents, export files, and phone numbers with AES-256-GCM.

```bash
openssl rand -hex 32
```

- Generate it once per environment and store it only in the secret manager. Web and worker must use the same keyring.
- If the key is lost, every encrypted column and blob is unreadable. **Recommendation:** keep an offline copy under separate access control from the database backups. A backup plus its key in the same place defeats the encryption.
- Rotate using the key ids and bounded worker reencrypt script specified in plans 06/12; retain old keys until every populated encrypted row is migrated. Follow runbooks.md's rotation procedure.
- The key must never appear in logs. The env check and the logger never print env values.

## Jobs that must keep running

The worker registers these cron schedules (all UTC, from `SCHEDULES` in `@scholarcrew/jobs`). The retention jobs are legal and policy commitments (SE-07, ID-05, ME-08), not housekeeping.

| Job | Cron | What it does |
|---|---|---|
| `maintenance.purge` | `*/10 * * * *` | Deletes magic links older than 1 day, expired temporary chats (24 hours), expired exports and their blobs (24 hours), and expired sessions. |
| `account.purge` | `30 3 * * *` | Hard-deletes accounts deleted more than 6 days ago (within 7 days) (owned rows cascade) and orphan blobs. |
| `reminders.deadlines` | `0 * * * *` | Deadline reminders 7, 3, and 1 days out. |
| `digest.weekly` | `5 * * * *` | Weekly digests for students whose chosen local day and hour match. |
| `sweep.weekly` | `0 14 * * 0` | Sunday scholarship sweep. |
| `catalog.recheck` | `0 8 * * *` | Starts the nightly re-check batch. |
| `catalog.recheck.collect` | `*/30 * * * *` | Collects finished batches. |

Deleted data stays in database backups until they expire. **Recommendation:** keep backup and PITR retention short (for example 30 days) and say so in the privacy policy.

## Pre-launch checklist

- [ ] Legal review of minors' privacy (COPPA for under-13 handling, state student-privacy laws) before launch, and FERPA review before selling to schools or districts (R3 sponsored seats, counselor view).
- [ ] Privacy policy, terms, and AI use policy published at `/privacy`, `/terms`, and `/ai-policy`, and reviewed by counsel.
- [ ] No third-party analytics, ad, or session-replay scripts on any authenticated page (SE-05). CI greps `package.json` files for tracker packages; also check the production pages' network requests by hand.
- [ ] Backups tested: restore a point-in-time copy into a scratch database, run the app against it, and confirm that encrypted documents decrypt with the production key.
- [ ] `ENABLE_DEV_ROUTES` unset, `SCHOLARCREW_FAKE_MODEL=0`, `RESEND_API_KEY` set, `NODE_ENV=production`. `GET /api/v1/dev/outbox/latest` returns 404.
- [ ] Stripe webhook delivering with no failures in the dashboard; one live checkout and one portal visit done end to end.
- [ ] Anthropic spend limit and alerts set.
- [ ] The worker running, with all eight cron schedules registered; check a `maintenance.purge` run within the first 10 minutes.
- [ ] Alerts from [observability.md](observability.md#suggested-alerts) wired to someone who will answer them.
- [ ] Incident contacts written down: who's on call, who can rotate secrets, who talks to families and schools, and legal counsel for a data incident. Keep the list next to [runbooks.md](runbooks.md).
- [ ] Model evals run against the release candidate with no safety failures ([testing.md](testing.md#model-evals)).
