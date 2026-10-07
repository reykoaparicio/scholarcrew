# Observability

ScholarCrew has no metrics service built in. You watch it through three sources: JSON log lines from web and worker, the pg-boss tables in Postgres, and the app's own usage tables (`agent_runs`, `usage_counters`, `crew_jobs`, `catalog_tasks`). Every query below is plain SQL you can run from a dashboard tool or `psql`.

**Recommendation:** create a read-only Postgres role for dashboards and alert queries, and point your log shipper at stdout and stderr of both processes.

## Logs

Both processes log one JSON object per line through `console`:

```ts
console.log(JSON.stringify({ level: "info", msg: "migrations applied", target: "dev" }));
console.error(JSON.stringify({ level: "error", msg: "pgboss", role: "worker", error: "Error: boom" }));
```

`level` and `msg` are always present. Other fields are IDs, counts, durations, and error text. Keep `msg` a fixed string and put variable parts in fields, so you can count and alert on `msg`.

These never appear in a log line, error message, audit `meta`, or job payload:

| Never logged | Why |
|---|---|
| Tokens: session, magic link, invite, helper link, API token, hours verification | Anyone with one can act as the user. Only SHA-256 hashes are stored. |
| Secrets: `ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, Stripe, Resend, and Twilio keys, `DATABASE_URL` | `check-env` and `wait-for-db` print key names, never values. The pg-boss error logger never includes the connection string. |
| Essay text (drafts, versions, prompts sent to Quill) | Student writing is private and is the product's integrity record. |
| Sensitive facts (income range, heritage, disability, religion, and the rest of `sensitive_kind`) | Product rule 5. They're decrypted only for the matcher. |
| Document bytes and parsed document text | Award letters and transcripts carry financial and academic records. |
| Model prompts and responses | They can contain all of the above. |

Job payloads carry IDs only, so pg-boss tables don't hold essay text or sensitive facts either.

**Recommendation:** log user IDs, not email addresses. Treat log storage as personal data anyway: restrict access and keep it no longer than 30 days.

Security-relevant actions (sign-ins, share changes, exports, deletions, admin edits, helper-link use) go to the `audit_events` table, not the logs. Admins search them at `/admin/audit`.

## Job health

pg-boss 10 keeps jobs in the `pgboss` schema of the app database. The queries below use pg-boss 10's tables (`pgboss.job`, `pgboss.schedule`); check them against the installed version after upgrades. Job states are `created`, `retry`, `active`, `completed`, `cancelled`, and `failed`. Every send uses `retryLimit: 2`, `retryDelay: 30`, and per-queue expiry from QUEUE_EXPIRE_SECONDS (1,200 seconds for crew/weekly plan, 2,400 for catalog research, 900 otherwise).

Backlog per queue:

```sql
select name, state, count(*) as jobs
from pgboss.job
where state in ('created', 'retry', 'active')
group by name, state
order by name, state;
```

Oldest job waiting to start, per queue:

```sql
select name, count(*) as waiting, now() - min(created_on) as oldest_wait
from pgboss.job
where state in ('created', 'retry') and start_after <= now()
group by name
order by oldest_wait desc;
```

Failures and retries in the last 24 hours:

```sql
select name,
       count(*) filter (where state = 'failed') as failed,
       count(*) filter (where retry_count > 0) as retried
from pgboss.job
where created_on > now() - interval '24 hours'
group by name
order by failed desc, retried desc;
```

Recent failure details (`output` holds the error pg-boss recorded):

```sql
select id, name, retry_count, completed_on, output
from pgboss.job
where state = 'failed'
order by completed_on desc
limit 20;
```

Registered cron schedules. Expect seven rows: `account.purge`, `catalog.recheck`, `catalog.recheck.collect`, `digest.weekly`, `maintenance.purge`, `reminders.deadlines`, `sweep.weekly`.

```sql
select name, cron, timezone from pgboss.schedule order by name;
```

Crew jobs have their own status in `crew_jobs` (`queued`, `working`, `ready`, `needs_input`, `failed`), which is what users see:

```sql
-- Outcomes by kind, last 24 hours
select kind, status, count(*) as jobs
from crew_jobs
where created_at > now() - interval '24 hours'
group by kind, status
order by kind, status;

-- Stuck jobs: not finished and not touched for 15 minutes
select id, kind, status, created_at, updated_at
from crew_jobs
where status in ('queued', 'working') and updated_at < now() - interval '15 minutes'
order by created_at;
```

## Model usage and cost

Every model call writes one `agent_runs` row: `role` (`compass`, a specialist such as `scout` or `quill`, or another caller), `model`, token counts, `stop_reason`, `cost_micros`, and `duration_ms`. `job_id` links it to `crew_jobs`. `usage_counters` holds per-user monthly totals (`crew_requests`, `cost_micros`) that drive the allowance (CR-10).

Costs are integer micro-dollars: divide by 1,000,000 for dollars. Pricing used by `costMicros()`: input 4, output 20, cache read 0.2, cache write 5 micro-dollars per token.

Two caveats:

- With `SCHOLARCREW_FAKE_MODEL=1`, the scripted client still writes `agent_runs` rows with made-up usage (100 input and 50 output tokens per turn, 0 ms). Ignore cost numbers from dev and staging environments that run the fake model.
- Calls outside a user's crew job, such as catalog research, extraction, and Message Batches re-checks, may not have `agent_runs` rows, depending on how the worker wires them. Reconcile monthly totals against the Anthropic console.

Cost per day:

```sql
select created_at::date as day,
       count(*) as calls,
       round(sum(cost_micros) / 1e6, 2) as usd,
       round(sum(cache_read_tokens)::numeric / nullif(sum(input_tokens + cache_read_tokens), 0), 3) as cache_read_share
from agent_runs
where created_at > now() - interval '30 days'
group by day
order by day;
```

Cost and stop reasons by role, last 7 days:

```sql
select role,
       count(*) as calls,
       round(sum(cost_micros) / 1e6, 2) as usd,
       count(*) filter (where stop_reason = 'refusal') as refusals,
       round(100.0 * count(*) filter (where stop_reason = 'refusal') / count(*), 2) as refusal_pct,
       count(*) filter (where stop_reason = 'max_tokens') as max_tokens
from agent_runs
where created_at > now() - interval '7 days'
group by role
order by usd desc;
```

Average model rounds per crew request. Compass is capped at 3 rounds and 4 consultations (AG-01), so `compass_rounds` should stay at or under 3:

```sql
select round(avg(compass_rounds), 2) as avg_compass_rounds,
       max(compass_rounds) as max_compass_rounds,
       round(avg(total_calls), 2) as avg_model_calls,
       round(avg(usd), 4) as avg_usd
from (
  select j.id,
         count(*) filter (where r.role = 'compass') as compass_rounds,
         count(*) as total_calls,
         sum(r.cost_micros) / 1e6 as usd
  from crew_jobs j
  join agent_runs r on r.job_id = j.id
  where j.kind = 'crew_request' and j.created_at > now() - interval '7 days'
  group by j.id
) per_job;
```

p95 durations. End to end per job kind (the AG-01 budget is 120 seconds for a crew request), then per model call by role:

```sql
select kind,
       count(*) as jobs,
       percentile_cont(0.95) within group (order by extract(epoch from updated_at - created_at)) as p95_seconds
from crew_jobs
where status in ('ready', 'needs_input', 'failed') and created_at > now() - interval '7 days'
group by kind;

select role, percentile_cont(0.95) within group (order by duration_ms) as p95_ms
from agent_runs
where created_at > now() - interval '7 days'
group by role
order by p95_ms desc;
```

Safety outcomes recorded on jobs (`crisis`, `refusal`, `limit`, `partial`):

```sql
select safety, count(*) from crew_jobs
where safety is not null and created_at > now() - interval '7 days'
group by safety;
```

Monthly usage and spend from the counters:

```sql
select month,
       count(*) as active_users,
       sum(crew_requests) as crew_requests,
       max(crew_requests) as max_per_user,
       round(sum(cost_micros) / 1e6, 2) as usd
from usage_counters
group by month
order by month desc
limit 6;
```

## Catalog freshness

Listings move `draft` → `published` → `stale` (after a changed page or a dead link on re-check) → back to `published` after an admin reviews it, or to `retired`/`flagged`. The nightly re-check picks published listings verified more than 30 days ago or due within 45 days (CA-05).

```sql
-- Listings by status
select status, count(*) from scholarships group by status order by status;

-- Published listings overdue for verification
select count(*) as overdue
from scholarships
where status = 'published' and (verified_at is null or verified_at < now() - interval '30 days');

-- Listings that went stale in the last 24 hours
select count(*) as newly_stale
from scholarships
where status = 'stale' and updated_at > now() - interval '24 hours';

-- Open review work by kind and age
select kind, count(*) as open_tasks, now() - min(created_at) as oldest
from catalog_tasks
where status in ('open', 'in_review')
group by kind
order by oldest desc;

-- Open user reports by reason
select reason, count(*) as open_reports, now() - min(created_at) as oldest
from catalog_reports
where status = 'open'
group by reason;

-- Re-check batches never collected
select id, anthropic_batch_id, created_at
from recheck_batches
where status = 'in_progress' and created_at < now() - interval '24 hours';
```

## Suggested alerts

Starting thresholds. Tune them once you have a few weeks of real traffic.

| Alert | Condition | Severity |
|---|---|---|
| Worker down | No `pgboss.job` row reached `completed` in 45 minutes (`catalog.recheck.collect` runs every 30). | Page |
| Crew backlog | Oldest waiting `crew.request` job older than 2 minutes. | Page |
| Any backlog | Oldest waiting job in any queue older than 15 minutes. | Ticket |
| Job failures | More than 5 `failed` jobs in one queue in an hour. | Ticket |
| Retention failed | `account.purge` or `maintenance.purge` failed, or `account.purge` hasn't completed in 26 hours. | Page |
| Purge overdue | Any `users` row with `status = 'deleted'` and `deleted_at` older than 8 days. | Page |
| Stuck crew jobs | Any `crew_jobs` row `queued` or `working` with `updated_at` older than 15 minutes. | Ticket |
| Crew failures | More than 5% of crew jobs `failed` in an hour (at least 20 jobs). | Page |
| Slow replies | p95 `crew_request` duration over 90 seconds for an hour. | Ticket |
| Refusal spike | Compass refusal rate over 2%, or over 3 times its 7-day average, for an hour. | Ticket |
| Truncation | `max_tokens` stop reasons over 1% of calls in a day. | Ticket |
| Spend | Daily `agent_runs` cost over 150% of the 7-day average, or over your fixed daily cap. | Page |
| Error logs | More than 20 `level: "error"` lines from one `msg` in 10 minutes. | Ticket |
| Catalog stale spike | More than 20 listings went `stale` in 24 hours. | Ticket |
| Review queue | Any open catalog task older than 7 days. | Ticket |
| Wrong deadline | Any open `wrong_deadline` report older than 24 hours. | Ticket |
| Re-check stuck | Any `recheck_batches` row `in_progress` for more than 24 hours. | Ticket |
| Email | More than 3 `notify.email` failures in an hour, or Resend bounce rate over 5%. | Ticket |
| Stripe webhook | Any failed delivery to `/api/v1/billing/webhook` in the Stripe dashboard. | Ticket |
| Database | Storage over 80%, or connections over 80% of `max_connections`. | Ticket |

Runbooks for most of these are in [runbooks.md](runbooks.md).
