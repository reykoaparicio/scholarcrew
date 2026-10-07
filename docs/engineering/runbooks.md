# Runbooks

Each runbook says how the problem shows up, what to check, and what to do. SQL refers to the queries in [observability.md](observability.md). Keep personal data out of tickets and chat: refer to users by ID, and read message or essay content only when the investigation can't proceed without it.

## Job backlog growing

**Shows up as:** crew replies stuck on "queued", late emails or reminders, the backlog or "worker down" alert.

1. Is the worker running? Check the process and its recent logs. No `completed` rows in `pgboss.job` for 45 minutes means it's down or wedged. Restart it. pg-boss keeps every queued job in Postgres, so nothing is lost while it's down.
2. Run the backlog and oldest-wait queries. One queue or all of them?
   - **All queues:** the worker is down, can't reach Postgres, or the database is saturated. Check `pgboss` error lines (`msg: "pgboss"`) and database CPU and connections.
   - **Only `crew.request`, `essay.review`, `offer.parse`, `appeal.outline`, `prep.retake`, `plan.weekly`:** model calls are slow or failing. Go to [Model errors or refusal spike](#model-errors-or-refusal-spike).
   - **Only `notify.email`:** go to [Email not arriving](#email-not-arriving).
3. Check failures and retries. Every job gets 2 retries 30 seconds apart and uses its per-queue expiry (1,200 seconds for crew/weekly plan, 2,400 for research, 900 otherwise). Read `output` on recent failed jobs for the error.
4. If the worker is healthy but can't keep up, add a second worker instance (**Recommendation**; pg-boss workers share queues safely through Postgres). Don't delete queued jobs to clear a backlog. They're users' requests.
5. The reaper in maintenance.purge runs every 10 minutes and fails expired leases or orphaned queued rows after a 600-second margin. If that process is unhealthy, `crew_jobs` rows can remain working. Find them with the stuck-jobs query, confirm the pg-boss job is `failed`, then mark them so users see a clear state:

   ```sql
   update crew_jobs set status = 'failed', error = 'interrupted', updated_at = now()
   where id = '<crew job id>' and status in ('queued', 'working');
   ```

## Model errors or refusal spike

**Shows up as:** failed crew jobs, many "I can't help with that one" replies, the refusal or crew-failure alert.

Server-side fallbacks are on for every Messages API request (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`), so a capacity problem on one model is usually absorbed. A spike that gets through is worth a look.

1. Run the cost-and-stop-reasons-by-role query for the last few hours.
   - `stop_reason = 'refusal'` concentrated in **one role** after a deploy: a prompt or tool change is the likely cause. Compare with the last release and roll back the prompt change. Run `pnpm evals` before re-shipping.
   - Refusals spread across roles: look for a pattern in the requests (a viral prompt, an abuse wave) using job IDs and timing first. Refusals already produce the polite reply and `safety = 'refusal'` on the job (CR-11), so users aren't left hanging.
   - `max_tokens` rising: answers are being cut off. Check recent changes to `maxTokens` or prompt length.
2. API errors (rate limits, 5xx) surface as `AppError("internal")` and failed jobs. Check worker error lines and the Anthropic status page. For sustained 429s, check the account's rate-limit tier in the Anthropic console.
3. Check `agent_runs.model` over time. A shift away from `claude-opus-5-5` suggests fallbacks are carrying traffic.
4. Don't remove refusal handling, the crisis guard, or fallbacks to make the numbers look better.

## Catalog stale spike or a wrong-deadline report

### Stale spike

**Shows up as:** many listings moved to `stale` in a day, a long `recheck_changed` queue in `/admin/tasks`.

1. Group the new stale listings by source host (`split_part(source_url, '/', 3)`). One host usually means a site redesign, a moved page, or a site blocking the fetcher. Fetches that throw (DNS, timeout) skip the listing; 404s and changed content mark it stale.
2. Check for a stuck batch: `recheck_batches` rows `in_progress` for more than 24 hours. Batch items that fail to parse get a review task without a status change.
3. Check whether `CATALOG_ALLOWED_DOMAINS` changed recently.
4. Admins work through the `recheck_changed` tasks, which show before and after values. Re-publish unchanged listings, edit changed ones, retire dead ones. Only admins publish (CA-04).

### Wrong-deadline report

**Shows up as:** an open `wrong_deadline` row in `/admin/reports`.

1. Open the listing's `source_url` and find the real deadline on the provider's page.
2. If the report is right, fix the deadline in `/admin/scholarships/<id>`. Saving and publishing sets the verified date and verifier.
3. Resolve the report with a note saying what changed and the source. If the report is wrong, reject it with a note.
4. If the deadline moved earlier, count the students working on it:

   ```sql
   select stage, count(*) from scholarship_applications
   where scholarship_id = '<id>' and stage in ('matched', 'planned', 'drafting')
   group by stage;
   ```

   Plans and reminders read the listing's deadline, so they update on their own, but a student whose reminder offsets already passed may need a direct notice. There's no bulk-notify tool; decide case by case.

## Email not arriving

**Shows up as:** "I never got the sign-in link", missing digests or reminders.

1. In production, `RESEND_API_KEY` must be set. Startup refuses a missing provider key; dev_outbox fallback is development-only. Check:

   ```sql
   select count(*) from dev_outbox where created_at > now() - interval '1 day';
   ```

   Anything above 0 in production means the key is missing on web or worker.
2. Sign-in links are sent by the web process during `POST /api/v1/auth/magic-link`; other email goes through the worker's `notify.email` jobs. Check the matching process's error lines and failed `notify.email` jobs.
3. In the Resend dashboard, look up the address: bounced, suppressed, or delivered? School-managed accounts often filter unfamiliar senders. Ask the student to check spam or use a personal address.
4. Check domain verification (SPF, DKIM) in Resend. A DNS change can break it.
5. For notifications, check the user's prefs: `email_enabled` false means no email by design, and quiet hours delay delivery until the window ends.
6. Sign-in links expire after 15 minutes and work once. Five requests per 15 minutes per IP or per email return 429.

## Data export or deletion request

### Export (ME-08)

A student exports their own data from Settings: `POST /api/v1/account/export` queues `account.export`. The file is JSON plus Markdown of everything they own, should be ready within 10 minutes, and its link expires after 24 hours.

1. If the request comes by email, point the student to Settings. If they can't sign in, they must first prove they control the account email by signing in with a magic link. Don't send data to any other address.
2. If it's stuck, check `exports` for the user (`status`, `created_at`) and failed `account.export` jobs. Fix the cause, then have them request again.
3. A parent asking for a student's data gets what the student shares through the family. A legal request from a parent or guardian goes to counsel; don't improvise.

### Deletion (ID-05, ME-09)

`DELETE /api/v1/account` (Settings) does this at once: status `deleted`, sessions deleted, API tokens and helper links revoked, removed from the family along with family-room chats the user owns. `account.purge` (daily at 03:30 UTC) hard-deletes the user, all owned rows, and orphan blobs once `deleted_at` is more than 6 days old.

1. If the request comes off-platform, verify identity the same way, then have the user delete from Settings. The plans include no admin delete tool. Don't hand-write deletes; add an admin service with tests if you need one.
2. Confirm: `select status, deleted_at from users where id = '<id>'`. After the purge window, the row is gone.
3. Deletion cancels any non-canceled subscription before changing account state. Check cancellation failures before retrying; the purge also cancels leftovers. Delete the Stripe customer manually if required for full erasure.
4. Copies remain in database backups until they expire, and in Resend's delivery logs. Say so in your reply if asked.
5. If `account.purge` hasn't run, see the "Retention failed" alert. Deleted accounts must be gone within 7 days.

## Suspected cross-family data exposure

**Shows up as:** a user, parent, helper, or school reports seeing another family's data, or an isolation test or eval fails in a way that suggests production is affected. Treat it as an incident from the first report.

1. **Stop the exposure.** If you can identify the code path, roll back to the last release without it, or take that route offline. If a helper link or API token is involved, revoke it. If you can't scope it, stop the web process; a maintenance outage is better than a leak.
2. **Preserve evidence before changing data.** Record a point-in-time recovery timestamp or take a manual snapshot. Export the relevant `audit_events` rows (sign-ins, share changes, helper-link use), log lines, and `crew_jobs` and `agent_runs` rows for the involved IDs. `audit_events` has no foreign keys, so purges don't remove it, but copy it anyway. Write a timeline as you go.
3. **Revoke sessions.** For the affected accounts:

   ```sql
   delete from sessions where user_id in ('<id>', '<id>');
   update helper_links set revoked_at = now() where student_id in ('<id>') and revoked_at is null;
   update api_tokens set revoked_at = now() where user_id in ('<id>') and revoked_at is null;
   ```

   If the scope is unknown, `truncate sessions` signs everyone out.
4. **Notify.** Call the incident contacts and legal counsel right away. Counsel decides who must be told (families, schools for sponsored seats, regulators) and by when; deadlines vary by state and contract. Don't contact affected families before that conversation, and don't speculate in writing.
5. **Fix.** Write the failing isolation test first (see the security scenarios in [testing.md](testing.md#security-scenarios)), fix the access check, and deploy. If the leak went through the crew (family room, the privacy guard), run the cross-family eval before re-enabling.
6. Write a postmortem: cause, what was exposed to whom, how long, and which test now prevents it.

## Stripe webhook failures

**Shows up as:** a user paid but is still on Free, or failed deliveries in the Stripe dashboard.

1. Read the delivery response in Stripe's webhook view.
   - **400:** signature check failed. `STRIPE_WEBHOOK_SECRET` doesn't match this endpoint (a test secret in live mode, or the secret was rolled). The handler must verify the raw request body, so check that nothing parses or re-encodes it first.
   - **403:** the webhook must skip the `Origin` check; Stripe sends no browser origin.
   - **3xx:** the endpoint URL redirects (for example a `www` redirect). Stripe doesn't follow redirects. Use the exact `${APP_URL}/api/v1/billing/webhook`.
   - **5xx or timeout:** check web error lines and database health.
2. Fix the cause, then resend the failed events from the Stripe dashboard. Stripe also retries automatically for a few days. Replays are safe: checkout upserts by user, and status events update by subscription ID.
3. Replay in order. `customer.subscription.updated` before `checkout.session.completed` changes nothing, because the subscription ID isn't stored yet.
4. Confirm:

   ```sql
   select plan, status, stripe_customer_id, current_period_end
   from subscriptions where owner_id = '<user id>';
   ```

## Rotate the encryption key

1. Generate a fresh 32-byte secret with `openssl rand -hex 32`, and choose a new positive smallint id. Keep the old secrets available.
2. Configure `ENCRYPTION_KEYS` on web and worker with the new id first and old ids after it: `<new-id>:<new-key>,<old-id>:<old-key>`. Restart both. Never paste these values into logs or tickets.
3. Run `pnpm --filter @scholarcrew/worker reencrypt` until it reports zero remaining rows. It rewrites sensitive facts, blobs, and phone values in bounded batches. Verify all populated encrypted rows use the primary id.
4. Exercise an existing upload download and sensitive matching read. Remove retired keys only after migration and verification; keep backup restore keys in the secret archive for the backup retention window.

## Inactive-user season-pass refund

An inactive user's paid checkout grants no entitlement. Review the `subscription_refused` audit event and the Stripe payment, issue the refund in Stripe, and record its payment/refund ids in the operational record. Do not restore the deleted account to apply a purchase.
