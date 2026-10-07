# ScholarCrew API

The web app and the browser extension talk to the server through JSON routes under `/api/v1`. This page covers the rules every route shares. [openapi.yaml](openapi.yaml) lists each route with its parameters, bodies, and responses.

Source of truth: section 10 of [`plans/00-overview.md`](../../plans/00-overview.md) for the route list, [`plans/02-domain.md`](../../plans/02-domain.md) for the schemas, and plans 13 and 14 for route behavior. When this page and the plans disagree, the plans win.

## Base URL and versioning

Every route lives under `<APP_URL>/api/v1`. In local development that's `http://localhost:3000/api/v1`.

The version is in the path, and `v1` is the only version. Request bodies are strict: an unknown field is a 400, so send only the fields a schema lists.

Bodies and responses are `application/json; charset=utf-8` unless a route says otherwise (file upload, file download, CSV import, the Stripe webhook, and the job event stream). Every JSON response carries `Cache-Control: no-store`.

### Conventions in payloads

| Kind | Format | Example |
|---|---|---|
| IDs | UUID strings. College IDs are the IPEDS unit ID as a string (up to 12 characters). | `"8c0f…"`, `"228778"` |
| Money | Integer whole US dollars, never negative. Field names end in `Usd`. Per year unless the name says otherwise (`fourYearUsd`). | `"amountUsd": 9200` |
| Model cost | Integer micro-dollars in `costMicros`. | `"costMicros": 41200` |
| Calendar dates | `YYYY-MM-DD` | `"2026-10-15"` |
| Instants | ISO 8601 date-time in UTC | `"2026-10-06T15:00:00.000Z"` |
| Award years and seasons | `YYYY-YY` | `"2027-28"` |
| GPA, admit rate | Numbers (`3.72`, `0.452`) | |

### Status codes on success

| Result | Status |
|---|---|
| Read or update | 200 with the resource |
| Create | 201 with the new resource |
| Start a background job | 202 with the `CrewJob` (sending a message returns `{ message, job }`) |
| Nothing to return | 204, empty body |
| Sign-in link followed | 303 redirect |

## Authentication

Routes use one of five auth modes. The OpenAPI file marks each route with its mode.

| Mode | Who | How |
|---|---|---|
| `user` | Any signed-in user. The service checks role and ownership. | Session cookie |
| `admin` | Signed-in users with role `admin` | Session cookie |
| `optional` | Anyone. Signed-in callers see more. | Session cookie if present |
| `none` | Anyone | Nothing, or a token in the path |
| `bearer` | The browser extension | `Authorization: Bearer sct_…` |

### Session cookie

Signing in is passwordless. `POST /auth/magic-link` emails a one-time link that expires in 15 minutes. Following it (`GET /auth/verify?token=…`) creates a session and sets:

```
Set-Cookie: sc_session=<token>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
```

Sessions last 30 days. `POST /auth/sign-out` and `DELETE /account` end the session and clear the cookie. Sign-out is an `optional` route: it always answers 204 with the clearing cookie, even for an expired or unknown session, so a dead cookie can always be removed. It still needs the `Origin` header. A missing, unknown, or expired session is a 401 `unauthenticated` on `user` and `admin` routes; `optional` routes treat it as signed out.

The verify route redirects (303) to `/onboarding` when `GET /me` would report `onboardingComplete: false` (new students and students who haven't finished), `/week` for everyone else (parents, including a new account created from a pending family invite, and admins), and `/sign-in?error=link` when the link is bad, used, or expired. The link can't carry a return path yet (review-log D15).

Browsers send `Secure` cookies to `http://localhost`, so dev uses the same attributes as production.

### Roles

`User.role` is `student`, `parent`, or `admin`. Routes don't take a role; the core service decides what each role may do. Admin routes (`/admin/*`) return 404 `not_found` to signed-in non-admins, so they look like they don't exist.

### Extension tokens

The extension authenticates with an API token instead of the cookie. A signed-in user creates one with `POST /extension/tokens`; the response holds the secret (`sct_` followed by 43 URL-safe characters) once. The server stores only its SHA-256 hash, and the list route never returns it.

Each token has scopes:

| Scope | Allows |
|---|---|
| `autofill` | `GET /extension/autofill-profile` |
| `save_page` | `POST /extension/save-page` |

New tokens get both scopes unless the body lists fewer. A bad or revoked token is 401; a valid token missing the route's scope is 403 `forbidden`. Bearer routes ignore cookies, and cookie routes ignore bearer tokens.

## CSRF

Cookie-authenticated writes must come from the app. On `user`, `admin`, and `optional` routes, any method other than GET, HEAD, or OPTIONS needs an `Origin` header equal to the origin of `APP_URL`. A missing or different `Origin` is 403 `forbidden` with the message "This request didn't come from ScholarCrew".

The check doesn't apply to `none` routes (they have no session to abuse), `bearer` routes (the token isn't sent automatically), or the Stripe webhook. Browsers set `Origin` on their own; scripts like curl must add it.

The check runs first, before auth and rate limits.

## Errors

Every error has the same body:

```json
{ "error": { "code": "not_found", "message": "Scholarship not found" } }
```

`message` is written for people and safe to show. `details` appears only when there's more to say, as with validation errors.

| code | HTTP | Meaning |
|---|---|---|
| `invalid_input` | 400 | The body, query, or form data failed validation, or the request breaks a business rule (for example, a 26th college on the list). |
| `unauthenticated` | 401 | No live session, or a bad extension token. |
| `limit_reached` | 402 | The monthly crew allowance is used up. Upgrade or wait for next month. |
| `forbidden` | 403 | The Origin check failed, the token lacks the scope, or your role can't do this (for example a parent onboarding, or a student setting the family budget). Under-13 onboarding adds `details.reason: "underage"`. |
| `not_found` | 404 | Doesn't exist, or isn't yours. |
| `conflict` | 409 | The write lost a race, such as saving an essay version from a stale `baseVersion`. |
| `rate_limited` | 429 | Too many requests. `Retry-After` and `details.retryAfterSeconds` give the wait in seconds. See [Rate limits](#rate-limits). |
| `internal` | 500 | Unexpected failure. Unhandled errors say "Something went wrong", and the server logs the cause. A few configuration errors, such as billing not set up, carry their own message. |

Objects you can't access return 404, never 403, so IDs can't be probed. That includes another family's records, a parent reading a category the student doesn't share, and test scores (owner only).

## Validation errors

A body that isn't JSON is a 400 with the message "Request body must be JSON". A body or query that doesn't match the schema is a 400 `invalid_input` with the Zod issues in `details`:

```json
{
  "error": {
    "code": "invalid_input",
    "message": "Check your input and try again",
    "details": [
      { "code": "too_small", "minimum": 1, "origin": "string", "inclusive": true, "path": ["title"], "message": "Too small: expected string to have >=1 characters" },
      { "code": "unrecognized_keys", "keys": ["color"], "path": [], "message": "Unrecognized key: \"color\"" }
    ]
  }
}
```

Each issue has at least `code`, `path` (an array of keys and indexes into the body), and `message`. Map `path[0]` to a form field. Query-string failures use the message "Check the query parameters". Business-rule failures thrown by services are also `invalid_input` but usually have no `details`.

## Pagination

Search routes return a `Page`:

```json
{ "items": [], "page": 1, "pageSize": 20, "total": 0 }
```

| Route | Query | Page size |
|---|---|---|
| `GET /scholarships` | `page` (default 1), `pageSize` (1–50, default 20) | as asked |
| `GET /colleges` | `page`, `pageSize` (1–50, default 20) | as asked |
| `GET /admin/scholarships` | `page` | fixed at 50 |
| `GET /admin/audit` | `page` | fixed at 20 |

Pages start at 1. A page past the end returns an empty `items` with the real `total`. Other list routes return plain arrays.

## Rate limits

Limited routes count requests per key in a fixed window that starts with the first request. Signed-in callers are keyed by user ID; signed-out callers by the right-most `X-Forwarded-For` hop (the one your proxy appends), then `X-Real-IP`. The proxy in front of the app must append to `X-Forwarded-For` or set `X-Real-IP`. Rejected requests count too. Over the limit is 429 `rate_limited` with `Retry-After` (seconds) and `details.retryAfterSeconds`; both give the time until the window ends, and the message names it ("Try again in 10 minutes.").

| Route | Limit | Keyed by |
|---|---|---|
| `POST /auth/magic-link` | 5 per 15 minutes, and separately 5 per 15 minutes per email address | IP and email |
| `POST /documents` | 20 per hour | user |
| `POST /family/invites` | 20 per day | user |
| `POST /billing/sponsor-code` | 10 per hour | user |
| `POST /account/export` | 5 per day | user |
| `POST /conversations/:id/messages` | 30 per 10 minutes | user |
| `POST /public/offer-tool` | 30 per hour | IP |
| `GET` and `POST /verify-hours/:token` | 10 per hour, one shared bucket for both methods | IP |
| `GET /helper-view/:token` | 60 per hour | IP |

### Crew allowance

Separately from rate limits, routes that run the crew count against the owner's monthly allowance: 20 requests on `free`, 300 on `family` and `season_pass`. Over the allowance they return 402 `limit_reached`. `GET /billing` shows `usage.crewRequests` and `usage.limit`.

| Route | Starts |
|---|---|
| `POST /conversations/:id/messages` | `crew_request` |
| `POST /essays/:id/review` | `essay_review` |
| `POST /plan/regenerate` | `weekly_plan` |
| `POST /offers/:id/appeal` | `appeal_outline` |
| `POST /prep/retake` | `retake_analysis` |

## Parent reads with `studentId`

Parents see a student's data through the family share grant. Read routes that return one student's records take an optional `?studentId=<uuid>`. Without it, the route reads the caller's own data, which is what a student wants.

```
GET /api/v1/college-list?studentId=3d6f6a1e-…
```

The student controls what's shared per category (`GET`/`PUT /family/share-settings`). Reading a category that isn't shared, or a student outside your family, is 404. Defaults share `deadlines`, `colleges`, `costs`, `scholarships`, and `activities`, and keep `essays`, `chats`, `stories`, and `sensitive` private.

Routes that accept `studentId`:

| Route | Category |
|---|---|
| `GET /matches`, `GET /scholarship-applications` | scholarships |
| `GET /college-list` | colleges |
| `GET /essays` | essays |
| `GET /stories` | stories |
| `GET /test-scores`, `GET /prep/superscores` | owner only: always 404 for anyone else |
| `GET /service-logs`, `GET /service-logs/progress`, `GET /activities` | activities |
| `GET /costs`, `GET /offers`, `GET /offers/compare` | costs |
| `GET /aid/checklists`, `GET /aid/deadlines` | deadlines |
| `GET /plan` (also `week=YYYY-MM-DD`), `GET /plan/this-week` | deadlines; the gap and sweep cards on This Week also need costs and scholarships |
| `GET /family/share-settings` | none: any member of the student's family can read them; 404 if you share no family |

Writes never take `studentId` and are owner only, with a few parent actions the core allows directly: marking aid checklist items assigned to `parent` (`PATCH /aid/items/:id`), sharing an income range (`POST /sensitive-facts/share-income`, which names the student in the body), and setting the family budget.

## Jobs and the event stream

Work that calls the model runs in the background. The starting route returns 202 with a `CrewJob`:

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "kind": "crew_request", "status": "queued",
  "conversationId": "00000000-0000-4000-8000-000000000002",
  "requestMessageId": "00000000-0000-4000-8000-000000000003",
  "resultMessageId": null, "refId": null,
  "progress": [], "error": null, "safety": null,
  "createdAt": "2026-10-07T15:00:00.000Z",
  "updatedAt": "2026-10-07T15:00:00.000Z"
}
```

| Status | Terminal | Meaning |
|---|---|---|
| `queued` | no | Waiting for a worker |
| `working` | no | Running; `progress` grows as crew members report |
| `ready` | yes | Done. For crew requests, `resultMessageId` points at the reply. |
| `needs_input` | yes | The crew asked a question; read the reply and answer in the room. |
| `failed` | yes | Gave up. `error` says why. |

Kinds: `crew_request`, `weekly_plan`, `essay_review`, `offer_parse`, `appeal_outline`, `retake_analysis`.

### Server-sent events

`GET /jobs/:id/events` streams job updates as `text/event-stream`. Unknown jobs and jobs you can't see are a plain 404 JSON error before the stream opens.

The server sends the current job right away, then polls every second and sends it again whenever `status` or the length of `progress` changes. When the job reaches a terminal status, or after 130 seconds, it sends `end` and closes the stream.

While nothing changes, the stream writes a `: ping` comment every 15 s; `EventSource` ignores it. The comment keeps proxies with an idle timeout from closing a stream while a job waits in the queue.

```
event: job
data: {"id":"…","kind":"crew_request","status":"queued","progress":[],…}

: ping

event: job
data: {"id":"…","status":"working","progress":[{"at":"2026-10-06T15:00:02.000Z","role":"scout","text":"Checking local scholarships"}],…}

event: job
data: {"id":"…","status":"ready","resultMessageId":"…",…}

event: end
data: {}
```

`end` doesn't mean the job finished. If the last `job` frame isn't terminal, the stream timed out: reconnect, or poll `GET /jobs/:id`. The stream sends no `id:` fields, so reconnecting starts over with the current job. Closing the connection stops the server's polling.

Response headers: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, and `X-Accel-Buffering: no`. `no-transform` keeps the app's own compression off the stream, and `X-Accel-Buffering: no` asks nginx not to buffer it. The stream sends no `Content-Encoding`. A proxy in front of the app must not buffer or compress this route (see `docs/engineering/deployment.md`).

## Action cards

A crew reply (`Message.reply`, a `CrewReply`) can carry up to four action cards. Nothing changes until the user presses one, which calls:

```
POST /api/v1/actions/apply
{ "messageId": "…", "cardId": "add-essay-plan" }
```

Applying is idempotent. The receipt is unique per `(messageId, cardId)`: the first call runs the card and stores the receipt, and every later call returns the same `ActionReceipt` (same `id`, same `appliedAt`, same `result`) with 200, without running it again. Retrying after a timeout is safe; a retry within a minute may get 409 while the first apply finishes. `Message.appliedCardIds` lists cards already applied, so the UI can show them as done.

Another apply of this card is still running: 409 `conflict`; retry in a minute. Memory cards (`confirm_fact`, `record_decision`) in temporary chats are 400 `invalid_input`, since temporary chats don't save memory.

In a family room, only the student can apply cards other than `open_link`; anyone else gets 404.

## Files

### Uploads

`POST /documents` takes `multipart/form-data` with two fields:

| Field | Value |
|---|---|
| `kind` | `award_letter`, `transcript`, `score_report`, `essay`, `resume`, or `other` |
| `file` | The file. Up to 10 MB (10,485,760 bytes), not empty. |

Allowed types, from the file part's `Content-Type`: `application/pdf`, `text/plain`, `image/png`, `image/jpeg`. Anything else or an empty file is 400 `invalid_input`; a file over 10 MB is 413 `invalid_input`. The server rejects oversized requests from `Content-Length` before reading the body. File names are stripped of paths. The response is 201 with `DocumentMeta`; bytes are stored encrypted.

To add an award letter, upload it with `kind=award_letter`, then `POST /offers` with the returned `documentId`.

`POST /admin/colleges/import` takes a raw `text/csv` (or `text/plain`) body of up to 5 MB, not multipart.

### Downloads

`GET /documents/:id/download` and a ready `GET /account/exports/:id` return the bytes with:

```
Content-Type: <stored type>
Content-Disposition: attachment; filename="<ASCII fallback>"; filename*=UTF-8''<RFC 8187 percent-encoded name>
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

Files always download as attachments; they're never rendered inline. The encoded `filename*` also escapes `'`, `(`, `)`, and `*`. `GET /account/exports/:id` returns the `ExportRecord` as JSON while the export is `queued` or `failed`. Once it's ready, it returns the file in one of two formats:

| Query | Content type | File name |
|---|---|---|
| none, or `?format=json` | `application/json; charset=utf-8` (the whole export; its `markdown` field holds the readable copy) | `scholarcrew-export-YYYY-MM-DD.json` |
| `?format=md` | `text/markdown; charset=utf-8` (the readable copy alone) | `scholarcrew-export-YYYY-MM-DD.md` |

Any other `format` is 400 `invalid_input`.

## CORS for the extension

Only the two bearer routes send CORS headers:

- `GET /extension/autofill-profile`
- `POST /extension/save-page`

When the request `Origin` is `chrome-extension://<id>`, responses (including errors) carry:

```
Access-Control-Allow-Origin: chrome-extension://<id>
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Max-Age: 600
Vary: Origin
```

Both routes answer `OPTIONS` preflights with 204. Other origins get no CORS headers. No route allows credentials, and no other route sends CORS headers.

## Example session

This walks a new user through sign-in, `/me`, a crew message, and its event stream against a local dev server. It needs `ENABLE_DEV_ROUTES=1`, an empty `RESEND_API_KEY` (so email lands in the dev outbox), and a running worker (`SCHOLARCREW_FAKE_MODEL=1` is fine). It uses `jq`.

```sh
API=http://localhost:3000/api/v1
ORIGIN=http://localhost:3000
EMAIL=maya@example.test

# 1. Ask for a sign-in link. 204 No Content.
curl -s -X POST "$API/auth/magic-link" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\"}"

# 2. Read the link from the dev outbox (404 when dev routes are off).
TOKEN=$(curl -s "$API/dev/outbox/latest?to=$EMAIL" | jq -r .text | grep -o 'token=[A-Za-z0-9_-]*' | cut -d= -f2)

# 3. Follow it. 303 to /onboarding, plus the session cookie.
COOKIE=$(curl -s -o /dev/null -D - "$API/auth/verify?token=$TOKEN" \
  | grep -i '^set-cookie: sc_session=' | sed -E 's/^[Ss]et-[Cc]ookie: (sc_session=[^;]*).*/\1/')

# 4. Who am I? MeResponse with onboardingComplete false.
curl -s "$API/me" -H "Cookie: $COOKIE" | jq '{email: .user.email, onboardingComplete, plan}'

# 5. Open a crew room. Writes need the Origin header. 201 Conversation.
CONV=$(curl -s -X POST "$API/conversations" \
  -H "Cookie: $COOKIE" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  -d '{"room":"my_crew"}' | jq -r .id)

# 6. Send a message. 202 with { message, job }.
JOB=$(curl -s -X POST "$API/conversations/$CONV/messages" \
  -H "Cookie: $COOKIE" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  -d '{"body":"@Scout what local scholarships are due this month?"}' | jq -r .job.id)

# 7. Stream the job until `end`.
curl -sN "$API/jobs/$JOB/events" -H "Cookie: $COOKIE" -H 'Accept: text/event-stream'

# 8. Read the reply.
curl -s "$API/conversations/$CONV/messages" -H "Cookie: $COOKIE" | jq '.[-1].reply'
```

A real client would finish onboarding (`POST /onboarding`) before step 5 so the crew has a profile to work from. Leave out the `Origin` header in step 5 and you'll get 403 `forbidden`.

## Round 4 contract updates

- `POST /auth/sign-out-all` revokes every session and API token, clears the browser cookie, and returns 204. Student extension tokens expire after 180 days.
- `DELETE /family/invites/:id` revokes a pending invitation (204). Only the family's student invites or revokes; `InviteInput` accepts email only. A `memberRole` field is 400.
- `GET /conversations/:id/messages?before=<message-id>&limit=50` returns the newest page older than the cursor, oldest first; limit is 1–100. A full page can have an earlier page. Family replies include nullable `sharedCategories`; revoked grants replace the response with a privacy stub for non-owners.
- `GET /matches` returns `{ matches, privateCount }`. `Board` also includes `privateCount`. Matches involving sensitive reasons are visible only to their owner; models receive the count alone.
- Recommender requests and verification-request emails are each capped at 10 per user per day. Local submissions and extension saves share the `scholarships.local` bucket of 10 per user per day. All 429 responses include `Retry-After`.
- Crisis messages are handled before message rate limits and monthly allowances, produce a ready zero-cost job, and enqueue no specialists. Magic-link requests require same-origin `Origin` even before sign-in and send at most one email per address per minute.
- Page responses use a request nonce in CSP; production uses HSTS. Nonce-bearing HTML renders dynamically and is never cached across requests.
