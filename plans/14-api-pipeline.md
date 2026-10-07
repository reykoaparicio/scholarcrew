# Plan 14: API pipeline (Agent N)

This plan writes every `/api/v1` route that section 10 of `00-overview.md` assigns to owner 14: scholarships, matches and the board, colleges and the college list, application items and recommenders, essays, comments and the Story Bank, test scores and prep, service hours, supervisor verification and activities, costs, offers and the public offer tool, aid checklists, the weekly plan, crew conversations, jobs with the SSE progress stream, action cards, the admin console (including the aid rules and deadlines editor's routes, R2P-1), the scoped helper view, and the two extension data routes. Routes are thin: parse input with the domain schema, call one `@scholarcrew/core` service with the request's `Actor`, return its result. Feature IDs: SC-01..SC-09 (routes), CO-01..CO-07, ES-01, ES-02, ES-04, ES-05, ES-07, PR-01..PR-04, IM-01..IM-04, MO-01..MO-11 (routes; MO-11/PU-03 public offer tool), AID-01..AID-03, WK-01..WK-05 (This Week route), CR-01, CR-05, CR-06 (job status over SSE), CR-08, CR-10 (402 passthrough), HL-02, HL-03, AD-01..AD-05, SE-04 (rate limits on crew sends and public routes), EX-01, EX-02.

Rules this plan follows on top of `00-overview.md` and plan 13:

- Every route file has exactly `export const runtime = "nodejs";`, `export const dynamic = "force-dynamic";`, and HTTP method exports built with `route()` from `@/server/http` (plan 13, M4). Nothing else is exported from a `route.ts` (Next.js rejects unknown route exports), so the SSE timing setter lives in a sibling `stream.ts`.
- Query strings go through `query(url, schema)` with the domain `ScholarshipQueryParams`, `CollegeQueryParams`, and `AuditQueryParams`. Routes that read another student's data (parents with a share grant) take an optional `?studentId=` (D23) through plan 13's `studentIdParam({ actor, url })`, which defaults to the signed-in user and ignores other params. The remaining local query schemas only parse URL strings; no domain type is redefined.
- Bodies go through `body(req, Schema)` with the domain schema, which caps JSON at 256 KB; the `none` routes that take a body (`POST /verify-hours/:token`, `POST /public/offer-tool`) pass `PUBLIC_BODY_LIMIT` (64 KB), and the CSV import reads through `readTextCapped` at 5 MB. Past a cap the answer is 413 `invalid_input`, with or without `Content-Length` (plan 13). When the path carries an id the domain body also has (`ReportInput.scholarshipId`, `ScholarshipUpsertInput.id`), a `z.preprocess` puts the path id into the body before validation, so the path always wins.
- Status codes: creates return 201, job-starting routes return 202 with the `CrewJob` (`POST /conversations/:id/messages` returns `{ message, job }` with 202), `undefined` returns 204, everything else 200. Errors come from `errorResponse` (plan 13): not-yours is 404, signed out is 401, non-admins on admin routes get 404, a missing token scope is 403, over-allowance is 402 (each job-starting route has a test that it enqueues nothing), over a body cap is 413, over a rate limit is 429.
- Rate limits use `route({ rate })`, keyed per user when signed in and per IP otherwise (plan 13): crew sends are limited in core after crisis detection (30 per 600 s); local submissions and extension saves share `scholarships.local` 10 per day, recommendation email `recommenders.request` 10 per day, service verification email `service-logs.verify` 10 per day, public offer tool `offer-tool` 30 per 3600 s, helper view `helper-view` 60 per 3600 s, supervisor verification `verify-hours` 10 per 3600 s (GET and POST share the key).
- Extension routes use `route({ auth: "bearer", cors: "extension" })`, `requireScope(ctx, scope)`, and export `OPTIONS = extensionPreflight` (plan 13 adds these to the section 9.7 surface for D11).
- Tests call the exported handlers with `request()`, `params()`, `NO_PARAMS`, `signedInStudent()`, `signedInParent()`, `signedInAdmin()`, `readJson()`, `errorOf()`, `exhaustAllowance()`, and `useTestDeps()` from `@test/helpers` (plan 13, M4). The clock is fixed at `2026-10-06T15:00:00.000Z`, so the season is `2026-27`, the award year `2027-28`, and the week starts `2026-10-05`. The database is truncated before every test.
- Per-task test runs use `pnpm --filter @scholarcrew/web exec vitest run <path>`, which runs only the files under `<path>` whatever pnpm does with `--`.

## Files

Create (all under `apps/web/src/app/api/v1/`):

- Scholarships (N1): `scholarships/route.ts`, `scholarships/local/route.ts`, `scholarships/[idOrSlug]/route.ts`, `scholarships/[idOrSlug]/report/route.ts`, `matches/route.ts`, `scholarship-applications/route.ts`, `scholarship-applications/[id]/route.ts`
- Colleges (N2): `colleges/route.ts`, `colleges/[id]/route.ts`, `college-list/route.ts`, `college-list/[id]/route.ts`, `college-list/[id]/items/route.ts`, `college-list/archive-season/route.ts`, `application-items/[id]/route.ts`, `recommenders/route.ts`, `recommenders/requests/route.ts`, `recommendations/route.ts`, `recommendations/[id]/route.ts` (PATCH, R2P-11)
- Essays (N3): `essays/route.ts`, `essays/[id]/route.ts` (GET, PATCH R2P-14), `essays/[id]/versions/route.ts`, `essays/[id]/review/route.ts`, `essays/[id]/comments/route.ts`, `essay-comments/[id]/resolve/route.ts`, `stories/route.ts`, `stories/[id]/route.ts`, `stories/link/route.ts`, `stories/reuse-check/route.ts`
- Prep (N4): `test-scores/route.ts`, `test-scores/[id]/route.ts`, `prep/superscores/route.ts`, `prep/retake/route.ts`, `prep/study-plan/route.ts`
- Impact (N5): `service-logs/route.ts`, `service-logs/[id]/route.ts`, `service-logs/[id]/verify/route.ts`, `service-logs/progress/route.ts`, `activities/route.ts`, `activities/[id]/route.ts`, `verify-hours/[token]/route.ts`
- Money (N6): `costs/route.ts`, `costs/calculator/route.ts`, `offers/route.ts`, `offers/compare/route.ts`, `offers/[id]/route.ts` (GET, DELETE R2P-8), `offers/[id]/confirm/route.ts`, `offers/[id]/appeal/route.ts`, `offers/[id]/loans/route.ts`, `offer-lines/[id]/route.ts`, `public/offer-tool/route.ts`
- Aid (N7): `aid/checklists/route.ts`, `aid/items/[id]/route.ts`, `aid/deadlines/route.ts`
- Plan (N8): `plan/route.ts`, `plan/this-week/route.ts`, `plan/regenerate/route.ts`, `plan-items/route.ts`, `plan-items/[id]/route.ts`
- Crew (N9): `conversations/route.ts`, `conversations/[id]/messages/route.ts`, `jobs/route.ts`, `jobs/[id]/route.ts`, `actions/apply/route.ts`
- Job events (N10): `jobs/[id]/events/stream.ts`, `jobs/[id]/events/route.ts`
- Admin (N11): `admin/catalog-tasks/route.ts`, `admin/catalog-tasks/[id]/route.ts`, `admin/catalog-tasks/[id]/resolve/route.ts`, `admin/scholarships/route.ts`, `admin/scholarships/[id]/route.ts`, `admin/scholarships/[id]/status/route.ts`, `admin/reports/route.ts`, `admin/reports/[id]/resolve/route.ts`, `admin/audit/route.ts`, `admin/research/route.ts`, `admin/aid-rules/route.ts`, `admin/aid-deadlines/route.ts`, `admin/aid-deadlines/[id]/route.ts` (R2P-1)
- College import (N12): `admin/colleges/import/route.ts`
- Helper view (N13): `helper-view/[token]/route.ts`
- Extension (N14): `extension/autofill-profile/route.ts`, `extension/save-page/route.ts`

Test (next to the routes, same root):

- `scholarships/scholarships.test.ts`, `college-list/colleges.test.ts`, `essays/essays.test.ts`, `prep/prep.test.ts`, `service-logs/impact.test.ts`, `offers/money.test.ts`, `aid/aid.test.ts`, `plan/plan.test.ts`, `conversations/crew.test.ts`, `jobs/[id]/events/events.test.ts`, `admin/admin.test.ts`, `admin/colleges/import/import.test.ts`, `helper-view/helper-view.test.ts`, `extension/save-page/extension.test.ts`

Modify: nothing. Plan 13 owns `apps/web/package.json` (already depends on `@scholarcrew/catalog`, `@scholarcrew/core`, `@scholarcrew/db`, `@scholarcrew/domain`, `zod`), `src/server/**`, and `test/**`.

## Tasks

### N1: Scholarship search, detail, local submissions, reports, matches, and the board

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/scholarships/scholarships.test.ts`:

```ts
import { rateLimits, catalogTasks, eq } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type {
  Board,
  Match,
  Page,
  ScholarshipApplication,
  ScholarshipDetail,
  ScholarshipSummary,
} from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as listMatches } from "../matches/route";
import { PATCH as patchApplication } from "../scholarship-applications/[id]/route";
import { GET as getBoard, POST as saveScholarship } from "../scholarship-applications/route";
import { POST as savePage } from "../extension/save-page/route";
import { createApiToken } from "@scholarcrew/core/apitokens";
import { TEST_NOW } from "@scholarcrew/core/shared";
import { userActor } from "@scholarcrew/domain";
import { POST as report } from "./[idOrSlug]/report/route";
import { GET as getDetail } from "./[idOrSlug]/route";
import { POST as submitLocal } from "./local/route";
import { GET as search } from "./route";

const deps = useTestDeps();

describe("GET /scholarships", () => {
  it("searches signed out with parsed query params, including openOn (F-18-3)", async () => {
    await factories.scholarship(deps().db, { name: "Maple Rotary STEM Award", amountMaxUsd: 2500 });
    await factories.scholarship(deps().db, { name: "Small Maple Grant", amountMaxUsd: 300 });
    await factories.scholarship(deps().db, { name: "Maple Closed Award", amountMaxUsd: 5000, deadline: "2026-09-01" });
    const res = await search(request("/scholarships?q=maple&minUsd=1000&openOn=2026-10-06&page=1"), NO_PARAMS);
    expect(res.status).toBe(200);
    const page = await readJson<Page<ScholarshipSummary>>(res);
    expect(page.items.map((s) => s.name)).toEqual(["Maple Rotary STEM Award"]);
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    const withClosed = await readJson<Page<ScholarshipSummary>>(await search(request("/scholarships?q=maple&minUsd=1000"), NO_PARAMS));
    expect(withClosed.items.map((s) => s.name)).toEqual(["Maple Closed Award", "Maple Rotary STEM Award"]);
  });

  it("rejects bad query params", async () => {
    for (const qs of ["page=0", "state=ZZ", "minUsd=lots", "deadlineBefore=11/15/2026", "openOn=today"]) {
      const res = await search(request(`/scholarships?${qs}`), NO_PARAMS);
      expect(res.status).toBe(400);
      expect((await errorOf(res)).code).toBe("invalid_input");
    }
  });
});

describe("GET /scholarships/:idOrSlug", () => {
  it("returns a published listing by slug or id signed out, 404 for drafts and unknown ids", async () => {
    const s = await factories.scholarship(deps().db, { slug: "maple-rotary-stem" });
    const bySlug = await getDetail(request("/scholarships/maple-rotary-stem"), params({ idOrSlug: "maple-rotary-stem" }));
    expect(bySlug.status).toBe(200);
    expect(await readJson<ScholarshipDetail>(bySlug)).toMatchObject({ id: s.id, application: null });
    expect((await getDetail(request(`/scholarships/${s.id}`), params({ idOrSlug: s.id }))).status).toBe(200);
    const draft = await factories.scholarship(deps().db, { status: "draft" });
    expect((await getDetail(request(`/scholarships/${draft.id}`), params({ idOrSlug: draft.id }))).status).toBe(404);
    expect((await getDetail(request("/scholarships/nope"), params({ idOrSlug: "nope" }))).status).toBe(404);
  });
});

describe("POST /scholarships/local and POST /scholarships/:id/report", () => {
  it("shares the daily 10-page allowance with bearer extension saves", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const token = await createApiToken(deps(), userActor(user.id, "student"), { label: "Browser" });
    await deps().db.insert(rateLimits).values({ key: `scholarships.local:${user.id}`, windowStart: new Date(TEST_NOW), count: 10 });
    const local = await submitLocal(request("/scholarships/local", { method: "POST", cookie, body: { url: "https://listing.test/a", name: "Award" } }), NO_PARAMS);
    const extension = await savePage(request("/extension/save-page", { method: "POST", headers: { authorization: `Bearer ${token.secret}` }, body: { url: "https://listing.test/a", title: "Award", selectedText: "" } }), NO_PARAMS);
    expect(local.status).toBe(429);
    expect(extension.status).toBe(429);
  });

  it("submits a local listing into the review queue (SC-07)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const body = { url: "https://maplerotary.example/award", name: "Maple Rotary Award" };
    const res = await submitLocal(request("/scholarships/local", { method: "POST", cookie, body }), NO_PARAMS);
    expect(res.status).toBe(201);
    expect(await readJson<ScholarshipSummary>(res)).toMatchObject({ name: "Maple Rotary Award", unverified: true });
    const tasks = await deps().db.select().from(catalogTasks).where(eq(catalogTasks.kind, "user_submission"));
    expect(tasks).toHaveLength(1);
  });

  it("validates the body and needs a session", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const bad = { url: "not a url", name: "X" };
    expect((await submitLocal(request("/scholarships/local", { method: "POST", cookie, body: { url: "javascript:alert(1)", name: "X" } }), NO_PARAMS)).status).toBe(400);
    expect((await submitLocal(request("/scholarships/local", { method: "POST", cookie, body: bad }), NO_PARAMS)).status).toBe(400);
    const good = { url: "https://a.example", name: "X" };
    expect((await submitLocal(request("/scholarships/local", { method: "POST", body: good }), NO_PARAMS)).status).toBe(401);
  });

  it("reports a listing by path id or slug (SC-08)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const s = await factories.scholarship(deps().db, { slug: "maple-rotary-stem" });
    const path = `/scholarships/${s.id}/report`;
    const ok = await report(
      request(path, { method: "POST", cookie, body: { reason: "dead_link", details: "404 page" } }),
      params({ idOrSlug: s.id }),
    );
    expect(ok.status).toBe(204);
    const bySlug = await report(
      request("/scholarships/maple-rotary-stem/report", { method: "POST", cookie, body: { reason: "scam" } }),
      params({ idOrSlug: "maple-rotary-stem" }),
    );
    expect(bySlug.status).toBe(204);
    const unknown = await report(
      request("/scholarships/no-such-listing/report", { method: "POST", cookie, body: { reason: "scam" } }),
      params({ idOrSlug: "no-such-listing" }),
    );
    expect(unknown.status).toBe(404);
    const bad = await report(request(path, { method: "POST", cookie, body: { reason: "boring" } }), params({ idOrSlug: s.id }));
    expect(bad.status).toBe(400);
  });
});

describe("matches and the board", () => {
  it("lists matches for the student and a sharing parent, 404 for strangers", async () => {
    await factories.scholarship(deps().db);
    const student = await signedInStudent(deps().db);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    const own = await listMatches(request("/matches", { cookie: student.cookie }), NO_PARAMS);
    expect(own.status).toBe(200);
    expect(await readJson<{ matches: Match[]; privateCount: number }>(own)).toMatchObject({ matches: expect.any(Array), privateCount: 0 });
    const forStudent = `/matches?studentId=${student.user.id}`;
    expect((await listMatches(request(forStudent, { cookie: parent.cookie }), NO_PARAMS)).status).toBe(200);
    const stranger = await signedInStudent(deps().db);
    expect((await listMatches(request(forStudent, { cookie: stranger.cookie }), NO_PARAMS)).status).toBe(404);
    expect((await listMatches(request("/matches?studentId=nope", { cookie: student.cookie }), NO_PARAMS)).status).toBe(400);
  });

  it("saves to the board, records an outcome, and hides other students' cards", async () => {
    const s = await factories.scholarship(deps().db, { amountMaxUsd: 1500 });
    const { cookie } = await signedInStudent(deps().db);
    const saved = await saveScholarship(
      request("/scholarship-applications", { method: "POST", cookie, body: { scholarshipId: s.id } }),
      NO_PARAMS,
    );
    expect(saved.status).toBe(201);
    const app = await readJson<ScholarshipApplication>(saved);
    expect(app.scholarshipId).toBe(s.id);
    const board = await readJson<Board>(await getBoard(request("/scholarship-applications", { cookie }), NO_PARAMS));
    expect([...board.matched, ...board.working].map((c) => c.application.id)).toContain(app.id);
    const badSave = await saveScholarship(
      request("/scholarship-applications", { method: "POST", cookie, body: { scholarshipId: "x" } }),
      NO_PARAMS,
    );
    expect(badSave.status).toBe(400);

    const path = `/scholarship-applications/${app.id}`;
    const won = await patchApplication(
      request(path, { method: "PATCH", cookie, body: { stage: "won", outcomeUsd: 1500, outcomeRenewable: false } }),
      params({ id: app.id }),
    );
    expect(won.status).toBe(200);
    expect((await readJson<ScholarshipApplication>(won)).stage).toBe("won");
    const bad = await patchApplication(request(path, { method: "PATCH", cookie, body: { stage: "maybe" } }), params({ id: app.id }));
    expect(bad.status).toBe(400);
    const other = await signedInStudent(deps().db);
    const theirs = await patchApplication(
      request(path, { method: "PATCH", cookie: other.cookie, body: { stage: "lost" } }),
      params({ id: app.id }),
    );
    expect(theirs.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/scholarships`
Expected: FAIL `scholarships.test.ts` with `Failed to resolve import "../matches/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/scholarships/route.ts`:

```ts
import { query, route } from "@/server/http";
import { searchScholarships } from "@scholarcrew/core/scholarships";
import { ScholarshipQueryParams } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signed-out visitors get the public actor and see published public listings only. Every ScholarshipQueryParams
// field passes straight through, including `openOn` (keep listings still open on that date; F-18-3).
export const GET = route({ auth: "optional" }, async ({ deps, actor, url }) =>
  searchScholarships(deps, actor, query(url, ScholarshipQueryParams)),
);
```

`apps/web/src/app/api/v1/scholarships/[idOrSlug]/route.ts`:

```ts
import { route } from "@/server/http";
import { getScholarship } from "@scholarcrew/core/scholarships";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ idOrSlug: string }>({ auth: "optional" }, async ({ deps, actor, params }) =>
  getScholarship(deps, actor, params.idOrSlug),
);
```

`apps/web/src/app/api/v1/scholarships/local/route.ts`:

```ts
import { body, json, route } from "@/server/http";
import { submitLocalScholarship } from "@scholarcrew/core/scholarships";
import { LocalSubmissionInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user", rate: { key: "scholarships.local", limit: 10, windowSeconds: 86_400 } }, async ({ deps, actor, req }) =>
  json(await submitLocalScholarship(deps, actor, await body(req, LocalSubmissionInput)), 201),
);
```

`apps/web/src/app/api/v1/scholarships/[idOrSlug]/report/route.ts`:

```ts
import { body, route } from "@/server/http";
import { getScholarship, reportListing } from "@scholarcrew/core/scholarships";
import { ReportInput } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withPathId(raw: unknown, scholarshipId: string): Record<string, unknown> {
  const fields = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { ...fields, scholarshipId };
}

// The segment is [idOrSlug] (it shares the level with the detail route), so a slug resolves to its id first.
// A listing the caller can't see is 404 here, the same as on the detail page.
export const POST = route<{ idOrSlug: string }>({ auth: "user" }, async ({ deps, actor, req, params }) => {
  const listing = await getScholarship(deps, actor, params.idOrSlug);
  const input = await body(req, z.preprocess((raw) => withPathId(raw, listing.id), ReportInput));
  await reportListing(deps, actor, input);
});
```

`apps/web/src/app/api/v1/matches/route.ts`:

```ts
import { route, studentIdParam } from "@/server/http";
import { listMatches } from "@scholarcrew/core/scholarships";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) => listMatches(deps, actor, studentIdParam({ actor, url })));
```

`apps/web/src/app/api/v1/scholarship-applications/route.ts`:

```ts
import { body, json, route, studentIdParam } from "@/server/http";
import { getBoard, saveScholarship } from "@scholarcrew/core/scholarships";
import { Id } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SaveInput = z.strictObject({ scholarshipId: Id });

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) => getBoard(deps, actor, studentIdParam({ actor, url })));

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await saveScholarship(deps, actor, await body(req, SaveInput)), 201),
);
```

`apps/web/src/app/api/v1/scholarship-applications/[id]/route.ts`:

```ts
import { body, route } from "@/server/http";
import { updateApplication } from "@scholarcrew/core/scholarships";
import { ApplicationPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateApplication(deps, actor, params.id, await body(req, ApplicationPatch)),
);
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/scholarships && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 9 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/scholarships apps/web/src/app/api/v1/matches apps/web/src/app/api/v1/scholarship-applications
git commit -m "feat(web): scholarship search, detail, submissions, reports, matches, and board routes"
```

### N2: Colleges, the college list, application items, and recommenders

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/college-list/colleges.test.ts`:

```ts
import { setDepsForTests } from "@/server/deps";
import { TEST_NOW, fixedClock } from "@scholarcrew/core/shared";
import { and, collegeList, eq, shareSettings, rateLimits } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type {
  ApplicationItem,
  College,
  CollegeListEntry,
  CollegeSummary,
  Page,
  RecRequest,
  Recommender,
} from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { PATCH as patchItem } from "../application-items/[id]/route";
import { GET as getCollege } from "../colleges/[id]/route";
import { GET as searchColleges } from "../colleges/route";
import { PATCH as patchRec } from "../recommendations/[id]/route";
import { GET as listRecRequests } from "../recommendations/route";
import { POST as requestRec } from "../recommenders/requests/route";
import { GET as listRecommenders, POST as addRecommender } from "../recommenders/route";
import { GET as listItems } from "./[id]/items/route";
import { DELETE as removeEntry, PATCH as patchEntry } from "./[id]/route";
import { POST as archiveSeason } from "./archive-season/route";
import { GET as getList, POST as addCollege } from "./route";

const deps = useTestDeps();

function addToList(cookie: string, collegeId: string): Promise<Response> {
  const body = { collegeId, fit: "target", plan: "RD" };
  return addCollege(request("/college-list", { method: "POST", cookie, body }), NO_PARAMS);
}

describe("GET /colleges", () => {
  it("searches the catalog and reads one college (CO-01)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const maple = await factories.college(deps().db, { name: "Maple State University", state: "TX" });
    await factories.college(deps().db, { name: "Cedar College", state: "OK" });
    const res = await searchColleges(request("/colleges?q=maple&state=TX", { cookie }), NO_PARAMS);
    expect(res.status).toBe(200);
    expect((await readJson<Page<CollegeSummary>>(res)).items.map((c) => c.id)).toEqual([maple.id]);
    const one = await getCollege(request(`/colleges/${maple.id}`, { cookie }), params({ id: maple.id }));
    expect((await readJson<College>(one)).name).toBe("Maple State University");
    expect((await getCollege(request("/colleges/999999", { cookie }), params({ id: "999999" }))).status).toBe(404);
  });

  it("needs a session and valid params", async () => {
    expect((await searchColleges(request("/colleges"), NO_PARAMS)).status).toBe(401);
    const { cookie } = await signedInStudent(deps().db);
    expect((await searchColleges(request("/colleges?control=castle", { cookie }), NO_PARAMS)).status).toBe(400);
  });
});

describe("college list", () => {
  it("adds, reads, updates, and removes entries (CO-02)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const college = await factories.college(deps().db);
    const added = await addToList(cookie, college.id);
    expect(added.status).toBe(201);
    const entry = await readJson<CollegeListEntry>(added);
    expect(entry).toMatchObject({ collegeId: college.id, fit: "target", plan: "RD", season: "2026-27" });
    const list = await readJson<CollegeListEntry[]>(await getList(request("/college-list", { cookie }), NO_PARAMS));
    expect(list.map((e) => e.id)).toEqual([entry.id]);

    const path = `/college-list/${entry.id}`;
    const id = params({ id: entry.id });
    const patched = await patchEntry(request(path, { method: "PATCH", cookie, body: { status: "applying" } }), id);
    expect((await readJson<CollegeListEntry>(patched)).status).toBe("applying");
    expect((await patchEntry(request(path, { method: "PATCH", cookie, body: { fit: "dream" } }), id)).status).toBe(400);
    const other = await signedInStudent(deps().db);
    const body = { status: "withdrawn" };
    expect((await patchEntry(request(path, { method: "PATCH", cookie: other.cookie, body }), id)).status).toBe(404);
    expect((await removeEntry(request(path, { method: "DELETE", cookie: other.cookie }), id)).status).toBe(404);
    expect((await removeEntry(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
  });

  it("refuses a 26th college with the core message (D5)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    for (let n = 0; n < 25; n += 1) {
      const c = await factories.college(deps().db);
      await deps()
        .db.insert(collegeList)
        .values({ ownerId: user.id, collegeId: c.id, fit: "target", plan: "RD", season: "2026-27" });
    }
    const res = await addToList(cookie, (await factories.college(deps().db)).id);
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({
      code: "invalid_input",
      message: "Your list holds up to 25 colleges. Remove one to add another.",
    });
  });

  it("lets a parent read a shared list and hides it when colleges sharing is off", async () => {
    const student = await signedInStudent(deps().db);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    await addToList(student.cookie, (await factories.college(deps().db)).id);
    const path = `/college-list?studentId=${student.user.id}`;
    const shared = await getList(request(path, { cookie: parent.cookie }), NO_PARAMS);
    expect(await readJson<CollegeListEntry[]>(shared)).toHaveLength(1);
    await deps()
      .db.update(shareSettings)
      .set({ enabled: false })
      .where(and(eq(shareSettings.studentId, student.user.id), eq(shareSettings.category, "colleges")));
    expect((await getList(request(path, { cookie: parent.cookie }), NO_PARAMS)).status).toBe(404);
  });

  it("lists and updates application items, then archives the season (CO-03)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const entry = await readJson<CollegeListEntry>(await addToList(cookie, (await factories.college(deps().db)).id));
    const itemsPath = `/college-list/${entry.id}/items`;
    const items = await readJson<ApplicationItem[]>(await listItems(request(itemsPath, { cookie }), params({ id: entry.id })));
    const item = items[0];
    if (!item) throw new Error("expected generated application items");
    const path = `/application-items/${item.id}`;
    const id = params({ id: item.id });
    const done = await patchItem(request(path, { method: "PATCH", cookie, body: { status: "done" } }), id);
    expect((await readJson<ApplicationItem>(done)).status).toBe("done");
    expect((await patchItem(request(path, { method: "PATCH", cookie, body: { status: "finished" } }), id)).status).toBe(400);
    const other = await signedInStudent(deps().db);
    expect((await patchItem(request(path, { method: "PATCH", cookie: other.cookie, body: { status: "todo" } }), id)).status).toBe(404);
    expect((await listItems(request(itemsPath, { cookie: other.cookie }), params({ id: entry.id }))).status).toBe(404);
    const archived = await archiveSeason(request("/college-list/archive-season", { method: "POST", cookie }), NO_PARAMS);
    expect(await readJson(archived)).toEqual({ archived: 1 });
  });
});

describe("recommenders", () => {
  it("adds a recommender and sends a request (CO-07)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const input = { name: "Ms. Ortiz", email: "ortiz@school.example", relationship: "Chemistry teacher" };
    const res = await addRecommender(request("/recommenders", { method: "POST", cookie, body: input }), NO_PARAMS);
    expect(res.status).toBe(201);
    const rec = await readJson<Recommender>(res);
    const list = await readJson<Recommender[]>(await listRecommenders(request("/recommenders", { cookie }), NO_PARAMS));
    expect(list.map((r) => r.id)).toEqual([rec.id]);
    const ask = (c: string) =>
      requestRec(request("/recommenders/requests", { method: "POST", cookie: c, body: { recommenderId: rec.id } }), NO_PARAMS);
    const sent = await ask(cookie);
    expect(sent.status).toBe(201);
    expect((await readJson<RecRequest>(sent)).recommenderId).toBe(rec.id);
    const bad = await addRecommender(request("/recommenders", { method: "POST", cookie, body: { name: "X", email: "nope" } }), NO_PARAMS);
    expect(bad.status).toBe(400);
    const other = await signedInStudent(deps().db);
    expect((await ask(other.cookie)).status).toBe(404);
  });

  it("lists the student's recommendation requests newest first, with the helper link id (D33)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const add = async (name: string, email: string) =>
      readJson<Recommender>(
        await addRecommender(request("/recommenders", { method: "POST", cookie, body: { name, email, relationship: "Teacher" } }), NO_PARAMS),
      );
    const ask = async (recommenderId: string) =>
      readJson<RecRequest>(
        await requestRec(request("/recommenders/requests", { method: "POST", cookie, body: { recommenderId } }), NO_PARAMS),
      );
    const older = await ask((await add("Ms. Ortiz", "ortiz@school.example")).id);
    setDepsForTests({ ...deps(), clock: fixedClock("2026-10-06T16:00:00.000Z") });
    const newer = await ask((await add("Mr. Lee", "lee@school.example")).id);
    const list = await readJson<RecRequest[]>(await listRecRequests(request("/recommendations", { cookie }), NO_PARAMS));
    expect(list.map((r) => r.id)).toEqual([newer.id, older.id]);
    expect(list[0]?.helperLinkId).toEqual(expect.any(String));
    const other = await signedInStudent(deps().db);
    expect(await readJson<RecRequest[]>(await listRecRequests(request("/recommendations", { cookie: other.cookie }), NO_PARAMS))).toEqual([]);
    expect((await listRecRequests(request("/recommendations"), NO_PARAMS)).status).toBe(401);
  });

  it("moves a request to agreed, submitted, or declined for its owner only (R2P-11, CO-07)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const input = { name: "Ms. Ortiz", email: "ortiz@school.example", relationship: "Chemistry teacher" };
    const rec = await readJson<Recommender>(await addRecommender(request("/recommenders", { method: "POST", cookie, body: input }), NO_PARAMS));
    const asked = await readJson<RecRequest>(
      await requestRec(request("/recommenders/requests", { method: "POST", cookie, body: { recommenderId: rec.id } }), NO_PARAMS),
    );
    const path = `/recommendations/${asked.id}`;
    const id = params({ id: asked.id });
    const patch = (c: string | undefined, body: unknown) => patchRec(request(path, { method: "PATCH", cookie: c, body }), id);
    const agreed = await patch(cookie, { status: "confirmed" });
    expect(agreed.status).toBe(200);
    expect(await readJson<RecRequest>(agreed)).toMatchObject({ id: asked.id, status: "confirmed" });
    expect((await readJson<RecRequest>(await patch(cookie, { status: "submitted" }))).status).toBe("submitted");
    expect((await patch(cookie, { status: "requested" })).status).toBe(400);
    expect((await patch(cookie, {})).status).toBe(400);
    const other = await signedInStudent(deps().db);
    expect((await patch(other.cookie, { status: "declined" })).status).toBe(404);
    expect((await patch(undefined, { status: "declined" })).status).toBe(401);
    const list = await readJson<RecRequest[]>(await listRecRequests(request("/recommendations", { cookie }), NO_PARAMS));
    expect(list.map((r) => r.status)).toEqual(["submitted"]);
  });
  it("refuses an eleventh recommendation email in a day", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    await deps().db.insert(rateLimits).values({ key: `recommenders.request:${user.id}`, windowStart: new Date(TEST_NOW), count: 10 });
    const res = await requestRec(request("/recommenders/requests", { method: "POST", cookie, body: {} }), NO_PARAMS);
    expect(res.status).toBe(429);
  });

});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/college-list`
Expected: FAIL `colleges.test.ts` with `Failed to resolve import "../application-items/[id]/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/colleges/route.ts`:

```ts
import { query, route } from "@/server/http";
import { searchColleges } from "@scholarcrew/core/colleges";
import { CollegeQueryParams } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  searchColleges(deps, actor, query(url, CollegeQueryParams)),
);
```

`apps/web/src/app/api/v1/colleges/[id]/route.ts`:

```ts
import { route } from "@/server/http";
import { getCollege } from "@scholarcrew/core/colleges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  getCollege(deps, actor, params.id),
);
```

`apps/web/src/app/api/v1/college-list/route.ts`:

```ts
import { body, json, route, studentIdParam } from "@/server/http";
import { addCollege, getCollegeList } from "@scholarcrew/core/colleges";
import { CollegeListInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  getCollegeList(deps, actor, studentIdParam({ actor, url })),
);

// Over MAX_COLLEGE_LIST the core throws invalid_input with a readable message (D5); the route passes it through.
export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await addCollege(deps, actor, await body(req, CollegeListInput)), 201),
);
```

`apps/web/src/app/api/v1/college-list/[id]/route.ts`:

```ts
import { body, route } from "@/server/http";
import { removeCollege, updateCollegeEntry } from "@scholarcrew/core/colleges";
import { CollegeListPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateCollegeEntry(deps, actor, params.id, await body(req, CollegeListPatch)),
);

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await removeCollege(deps, actor, params.id);
});
```

`apps/web/src/app/api/v1/college-list/[id]/items/route.ts`:

```ts
import { route } from "@/server/http";
import { listApplicationItems } from "@scholarcrew/core/colleges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  listApplicationItems(deps, actor, params.id),
);
```

`apps/web/src/app/api/v1/college-list/archive-season/route.ts`:

```ts
import { route } from "@/server/http";
import { archiveSeason } from "@scholarcrew/core/colleges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor }) => archiveSeason(deps, actor));
```

`apps/web/src/app/api/v1/application-items/[id]/route.ts`:

```ts
import { body, route } from "@/server/http";
import { updateApplicationItem } from "@scholarcrew/core/colleges";
import { ApplicationItemPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateApplicationItem(deps, actor, params.id, await body(req, ApplicationItemPatch)),
);
```

`apps/web/src/app/api/v1/recommenders/route.ts`:

```ts
import { body, json, route } from "@/server/http";
import { addRecommender, listRecommenders } from "@scholarcrew/core/colleges";
import { RecommenderInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listRecommenders(deps, actor));

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await addRecommender(deps, actor, await body(req, RecommenderInput)), 201),
);
```

`apps/web/src/app/api/v1/recommenders/requests/route.ts`:

```ts
import { body, json, route } from "@/server/http";
import { requestRecommendation } from "@scholarcrew/core/colleges";
import { RecRequestInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user", rate: { key: "recommenders.request", limit: 10, windowSeconds: 86_400 } }, async ({ deps, actor, req }) =>
  json(await requestRecommendation(deps, actor, await body(req, RecRequestInput)), 201),
);
```

`apps/web/src/app/api/v1/recommendations/route.ts`:

```ts
import { route } from "@/server/http";
import { listRecRequests } from "@scholarcrew/core/colleges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// D33: past requests, newest first. helperLinkId matches GET /helper-links; the URL itself is shown only at creation.
export const GET = route({ auth: "user" }, async ({ deps, actor }) => listRecRequests(deps, actor));
```

`apps/web/src/app/api/v1/recommendations/[id]/route.ts`:

```ts
import { body, route } from "@/server/http";
import { updateRecRequest } from "@scholarcrew/core/colleges";
import { RecRequestPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// R2P-11 (CO-07): the student marks a letter agreed, submitted, or declined. `requested` is set only at creation,
// so RecRequestPatch refuses it (400); another student's id is 404.
export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateRecRequest(deps, actor, params.id, await body(req, RecRequestPatch)),
);
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/college-list && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 10 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/colleges apps/web/src/app/api/v1/college-list apps/web/src/app/api/v1/application-items apps/web/src/app/api/v1/recommenders apps/web/src/app/api/v1/recommendations
git commit -m "feat(web): college search, college list, application items, recommender, and recommendation routes"
```

### N3: Essays, versions, Quill review, comments, and the Story Bank

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/essays/essays.test.ts`:

```ts
import { essayComments } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type {
  CrewJob,
  Essay,
  EssayComment,
  EssayVersion,
  EssayWithBody,
  Story,
  StoryReuseCheck,
  StoryUse,
} from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  exhaustAllowance,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { POST as resolveComment } from "../essay-comments/[id]/resolve/route";
import { DELETE as archiveStory, PATCH as patchStory } from "../stories/[id]/route";
import { POST as linkStory } from "../stories/link/route";
import { POST as reuseCheck } from "../stories/reuse-check/route";
import { GET as listStories, POST as createStory } from "../stories/route";
import { GET as listComments } from "./[id]/comments/route";
import { POST as review } from "./[id]/review/route";
import { GET as getEssay, PATCH as patchEssay } from "./[id]/route";
import { GET as listVersions, POST as saveVersion } from "./[id]/versions/route";
import { GET as listEssays, POST as createEssay } from "./route";

const deps = useTestDeps();

async function newEssay(cookie: string): Promise<Essay> {
  const body = { title: "Why nursing", prompt: "Tell us why you chose your major.", wordLimit: 650 };
  const res = await createEssay(request("/essays", { method: "POST", cookie, body }), NO_PARAMS);
  expect(res.status).toBe(201);
  return readJson<Essay>(res);
}

describe("essays and versions", () => {
  it("creates, lists, and reads an essay (ES-01)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const essay = await newEssay(cookie);
    expect(essay).toMatchObject({ title: "Why nursing", wordLimit: 650, currentVersion: 0, targetType: "general" });
    const list = await readJson<Essay[]>(await listEssays(request("/essays", { cookie }), NO_PARAMS));
    expect(list.map((e) => e.id)).toEqual([essay.id]);
    const full = await readJson<EssayWithBody>(await getEssay(request(`/essays/${essay.id}`, { cookie }), params({ id: essay.id })));
    expect(full).toMatchObject({ id: essay.id, body: "", wordCount: 0, comments: [] });
    const bad = await createEssay(request("/essays", { method: "POST", cookie, body: { title: "", prompt: "" } }), NO_PARAMS);
    expect(bad.status).toBe(400);
  });

  it("saves versions with optimistic concurrency (ES-02)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const essay = await newEssay(cookie);
    const path = `/essays/${essay.id}/versions`;
    const id = params({ id: essay.id });
    const first = await saveVersion(request(path, { method: "POST", cookie, body: { body: "My first draft", baseVersion: 0 } }), id);
    expect(first.status).toBe(201);
    expect(await readJson<EssayVersion>(first)).toMatchObject({ version: 1, wordCount: 3 });
    const stale = await saveVersion(request(path, { method: "POST", cookie, body: { body: "Other tab", baseVersion: 0 } }), id);
    expect(stale.status).toBe(409);
    expect((await errorOf(stale)).code).toBe("conflict");
    expect(await readJson<EssayVersion[]>(await listVersions(request(path, { cookie }), id))).toHaveLength(1);
  });

  it("hides essays from other students and from parents without the essays share", async () => {
    const student = await signedInStudent(deps().db);
    const essay = await newEssay(student.cookie);
    const other = await signedInStudent(deps().db);
    expect((await getEssay(request(`/essays/${essay.id}`, { cookie: other.cookie }), params({ id: essay.id }))).status).toBe(404);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    const asParent = await listEssays(request(`/essays?studentId=${student.user.id}`, { cookie: parent.cookie }), NO_PARAMS);
    expect(asParent.status).toBe(404);
  });

  it("updates an essay's status and title for its owner only (R2P-14)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const essay = await newEssay(cookie);
    const path = `/essays/${essay.id}`;
    const id = params({ id: essay.id });
    const patch = (c: string, body: unknown) => patchEssay(request(path, { method: "PATCH", cookie: c, body }), id);
    const ready = await patch(cookie, { status: "ready" });
    expect(ready.status).toBe(200);
    expect(await readJson<Essay>(ready)).toMatchObject({ id: essay.id, status: "ready", title: "Why nursing", latestWordCount: null });
    expect((await readJson<Essay>(await patch(cookie, { title: "Why I chose nursing" }))).title).toBe("Why I chose nursing");
    expect((await patch(cookie, {})).status).toBe(400);
    expect((await patch(cookie, { status: "done" })).status).toBe(400);
    const other = await signedInStudent(deps().db);
    expect((await patch(other.cookie, { status: "submitted" })).status).toBe(404);
    const list = await readJson<Essay[]>(await listEssays(request("/essays", { cookie }), NO_PARAMS));
    expect(list.map((e) => e.status)).toEqual(["ready"]);
  });
});

describe("Quill review and comments", () => {
  it("needs a saved draft, then returns a queued job with 202 (ES-04)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const essay = await newEssay(cookie);
    const id = params({ id: essay.id });
    const path = `/essays/${essay.id}/review`;
    const empty = await review(request(path, { method: "POST", cookie }), id);
    expect(empty.status).toBe(400);
    await saveVersion(
      request(`/essays/${essay.id}/versions`, { method: "POST", cookie, body: { body: "A real draft", baseVersion: 0 } }),
      id,
    );
    const res = await review(request(path, { method: "POST", cookie }), id);
    expect(res.status).toBe(202);
    const job = await readJson<CrewJob>(res);
    expect(job).toMatchObject({ kind: "essay_review", status: "queued", refId: essay.id });
    expect(deps().jobs.sent).toContainEqual({ name: "essay.review", payload: { jobId: job.id, essayId: essay.id } });
    const other = await signedInStudent(deps().db);
    expect((await review(request(path, { method: "POST", cookie: other.cookie }), id)).status).toBe(404);
  });

  it("answers 402 limit_reached and queues nothing once the crew allowance is used (CR-10)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const essay = await newEssay(cookie);
    const id = params({ id: essay.id });
    await saveVersion(
      request(`/essays/${essay.id}/versions`, { method: "POST", cookie, body: { body: "A real draft", baseVersion: 0 } }),
      id,
    );
    await exhaustAllowance(deps().db, user.id);
    const res = await review(request(`/essays/${essay.id}/review`, { method: "POST", cookie }), id);
    expect(res.status).toBe(402);
    expect((await errorOf(res)).code).toBe("limit_reached");
    expect(deps().jobs.sent).toEqual([]);
  });

  it("lists and resolves comments for the owner only", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const essay = await newEssay(cookie);
    const [comment] = await deps()
      .db.insert(essayComments)
      .values({ essayId: essay.id, version: 1, author: "quill", kind: "question", quote: "draft", body: "What changed?" })
      .returning();
    if (!comment) throw new Error("comment insert failed");
    const list = await listComments(request(`/essays/${essay.id}/comments`, { cookie }), params({ id: essay.id }));
    expect((await readJson<EssayComment[]>(list)).map((c) => c.id)).toEqual([comment.id]);
    const path = `/essay-comments/${comment.id}/resolve`;
    const other = await signedInStudent(deps().db);
    expect((await resolveComment(request(path, { method: "POST", cookie: other.cookie }), params({ id: comment.id }))).status).toBe(404);
    expect((await resolveComment(request(path, { method: "POST", cookie }), params({ id: comment.id }))).status).toBe(204);
  });
});

describe("Story Bank", () => {
  it("creates, edits, links, checks reuse, and archives stories (ES-05, ES-07)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const input = { title: "Night shift", moment: "I translated for my grandmother at the clinic.", themes: ["family"] };
    const created = await createStory(request("/stories", { method: "POST", cookie, body: input }), NO_PARAMS);
    expect(created.status).toBe(201);
    const story = await readJson<Story>(created);
    expect((await readJson<Story[]>(await listStories(request("/stories", { cookie }), NO_PARAMS))).map((s) => s.id)).toEqual([
      story.id,
    ]);
    const path = `/stories/${story.id}`;
    const id = params({ id: story.id });
    const renamed = await patchStory(request(path, { method: "PATCH", cookie, body: { title: "Clinic nights" } }), id);
    expect((await readJson<Story>(renamed)).title).toBe("Clinic nights");
    expect((await patchStory(request(path, { method: "PATCH", cookie, body: { title: "" } }), id)).status).toBe(400);

    const essay = await newEssay(cookie);
    const link = await linkStory(
      request("/stories/link", { method: "POST", cookie, body: { storyId: story.id, essayId: essay.id } }),
      NO_PARAMS,
    );
    expect(link.status).toBe(201);
    expect(await readJson<StoryUse>(link)).toMatchObject({ storyId: story.id, essayId: essay.id });
    const check = await reuseCheck(
      request("/stories/reuse-check", { method: "POST", cookie, body: { storyId: story.id, collegeId: "100001" } }),
      NO_PARAMS,
    );
    expect(await readJson<StoryReuseCheck>(check)).toMatchObject({ storyId: story.id, alreadyUsedForTarget: false });

    const other = await signedInStudent(deps().db);
    expect((await patchStory(request(path, { method: "PATCH", cookie: other.cookie, body: { title: "Mine" } }), id)).status).toBe(404);
    expect((await archiveStory(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
    const bad = await createStory(request("/stories", { method: "POST", cookie, body: { title: "X", moment: "" } }), NO_PARAMS);
    expect(bad.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/essays`
Expected: FAIL `essays.test.ts` with `Failed to resolve import "../essay-comments/[id]/resolve/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/essays/route.ts`:

```ts
import { body, json, route, studentIdParam } from "@/server/http";
import { createEssay, listEssays } from "@scholarcrew/core/essays";
import { EssayInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) => listEssays(deps, actor, studentIdParam({ actor, url })));

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await createEssay(deps, actor, await body(req, EssayInput)), 201),
);
```

`apps/web/src/app/api/v1/essays/[id]/route.ts`:

```ts
import { body, route } from "@/server/http";
import { getEssay, updateEssay } from "@scholarcrew/core/essays";
import { EssayPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  getEssay(deps, actor, params.id),
);

// R2P-14: owner edits to title, prompt, or status (drafting, ready, submitted); versions are untouched.
// EssayPatch refuses an empty object, so `{}` is 400.
export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateEssay(deps, actor, params.id, await body(req, EssayPatch)),
);
```

`apps/web/src/app/api/v1/essays/[id]/versions/route.ts`:

```ts
import { body, json, route } from "@/server/http";
import { listVersions, saveVersion } from "@scholarcrew/core/essays";
import { SaveVersionInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  listVersions(deps, actor, params.id),
);

// A stale baseVersion is a 409 conflict from the core; the editor reloads and asks the student.
export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  json(await saveVersion(deps, actor, params.id, await body(req, SaveVersionInput)), 201),
);
```

`apps/web/src/app/api/v1/essays/[id]/review/route.ts`:

```ts
import { json, route } from "@/server/http";
import { requestReview } from "@scholarcrew/core/essays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Counts toward the crew allowance; over the limit the core throws limit_reached (402).
export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  json(await requestReview(deps, actor, params.id), 202),
);
```

`apps/web/src/app/api/v1/essays/[id]/comments/route.ts`:

```ts
import { route } from "@/server/http";
import { listComments } from "@scholarcrew/core/essays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  listComments(deps, actor, params.id),
);
```

`apps/web/src/app/api/v1/essay-comments/[id]/resolve/route.ts`:

```ts
import { route } from "@/server/http";
import { resolveComment } from "@scholarcrew/core/essays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await resolveComment(deps, actor, params.id);
});
```

`apps/web/src/app/api/v1/stories/route.ts`:

```ts
import { body, json, route, studentIdParam } from "@/server/http";
import { createStory, listStories } from "@scholarcrew/core/essays";
import { StoryInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) => listStories(deps, actor, studentIdParam({ actor, url })));

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await createStory(deps, actor, await body(req, StoryInput)), 201),
);
```

`apps/web/src/app/api/v1/stories/[id]/route.ts`:

```ts
import { body, route } from "@/server/http";
import { archiveStory, updateStory } from "@scholarcrew/core/essays";
import { StoryPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateStory(deps, actor, params.id, await body(req, StoryPatch)),
);

// DELETE archives (ES-05): the story leaves the bank but past uses stay on record.
export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await archiveStory(deps, actor, params.id);
});
```

`apps/web/src/app/api/v1/stories/link/route.ts`:

```ts
import { body, json, route } from "@/server/http";
import { linkStory } from "@scholarcrew/core/essays";
import { LinkStoryInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await linkStory(deps, actor, await body(req, LinkStoryInput)), 201),
);
```

`apps/web/src/app/api/v1/stories/reuse-check/route.ts`:

```ts
import { body, route } from "@/server/http";
import { checkStoryReuse } from "@scholarcrew/core/essays";
import { StoryReuseCheckInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  checkStoryReuse(deps, actor, await body(req, StoryReuseCheckInput)),
);
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/essays && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 8 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/essays apps/web/src/app/api/v1/essay-comments apps/web/src/app/api/v1/stories
git commit -m "feat(web): essay, version, review, comment, and story bank routes"
```

### N4: Test scores, superscores, retake value, and study plans

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/prep/prep.test.ts`:

```ts
import { factories } from "@scholarcrew/db/testing";
import type { CrewJob, PlanItem, Superscore, TestScore } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  exhaustAllowance,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { DELETE as deleteScore } from "../test-scores/[id]/route";
import { GET as listScores, POST as addScore } from "../test-scores/route";
import { POST as retake } from "./retake/route";
import { POST as studyPlan } from "./study-plan/route";
import { GET as superscores } from "./superscores/route";

const deps = useTestDeps();

const ACT = {
  test: "ACT",
  takenOn: "2026-09-12",
  official: true,
  composite: 29,
  sections: { english: 30, math: 28, reading: 29, science: 29 },
};

describe("test scores (PR-01, PR-02)", () => {
  it("records, lists, superscores, and deletes scores", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await addScore(request("/test-scores", { method: "POST", cookie, body: ACT }), NO_PARAMS);
    expect(res.status).toBe(201);
    const score = await readJson<TestScore>(res);
    expect(score).toMatchObject({ test: "ACT", composite: 29, official: true });
    expect(await readJson<TestScore[]>(await listScores(request("/test-scores", { cookie }), NO_PARAMS))).toHaveLength(1);
    const supers = await readJson<Superscore[]>(await superscores(request("/prep/superscores", { cookie }), NO_PARAMS));
    expect(supers.map((s) => s.test)).toContain("ACT");

    const path = `/test-scores/${score.id}`;
    const other = await signedInStudent(deps().db);
    expect((await deleteScore(request(path, { method: "DELETE", cookie: other.cookie }), params({ id: score.id }))).status).toBe(404);
    expect((await deleteScore(request(path, { method: "DELETE", cookie }), params({ id: score.id }))).status).toBe(204);
  });

  it("rejects out-of-range composites and keeps scores owner-only", async () => {
    const student = await signedInStudent(deps().db);
    const bad = await addScore(
      request("/test-scores", { method: "POST", cookie: student.cookie, body: { ...ACT, composite: 40 } }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    const asParent = await listScores(request(`/test-scores?studentId=${student.user.id}`, { cookie: parent.cookie }), NO_PARAMS);
    expect(asParent.status).toBe(404);
  });
});

describe("retake value and study plans (PR-03, PR-04)", () => {
  it("starts a retake analysis job with 202", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await retake(
      request("/prep/retake", { method: "POST", cookie, body: { test: "ACT", targetComposite: 32 } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(202);
    const job = await readJson<CrewJob>(res);
    expect(job).toMatchObject({ kind: "retake_analysis", status: "queued" });
    expect(deps().jobs.sent).toContainEqual({
      name: "prep.retake",
      payload: { jobId: job.id, test: "ACT", targetComposite: 32 },
    });
    const bad = await retake(request("/prep/retake", { method: "POST", cookie, body: { test: "PSAT", targetComposite: 1200 } }), NO_PARAMS);
    expect(bad.status).toBe(400);
  });

  it("answers 402 limit_reached and queues nothing once the crew allowance is used (CR-10)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    await exhaustAllowance(deps().db, user.id);
    const res = await retake(
      request("/prep/retake", { method: "POST", cookie, body: { test: "ACT", targetComposite: 32 } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(402);
    expect((await errorOf(res)).code).toBe("limit_reached");
    expect(deps().jobs.sent).toEqual([]);
  });

  it("accepts study sessions into the weekly plan", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const sessions = [{ title: "ACT math set", minutes: 45, weekStart: "2026-10-05", dueOn: null }];
    const res = await studyPlan(request("/prep/study-plan", { method: "POST", cookie, body: { sessions } }), NO_PARAMS);
    expect(res.status).toBe(201);
    const items = await readJson<PlanItem[]>(res);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "ACT math set", minutes: 45, weekStart: "2026-10-05" });
    const empty = await studyPlan(request("/prep/study-plan", { method: "POST", cookie, body: { sessions: [] } }), NO_PARAMS);
    expect(empty.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/prep`
Expected: FAIL `prep.test.ts` with `Failed to resolve import "../test-scores/[id]/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/test-scores/route.ts`:

```ts
import { body, json, route, studentIdParam } from "@/server/http";
import { addTestScore, listTestScores } from "@scholarcrew/core/prep";
import { TestScoreInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scores are owner-only in the core; anyone else gets 404.
export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  listTestScores(deps, actor, studentIdParam({ actor, url })),
);

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await addTestScore(deps, actor, await body(req, TestScoreInput)), 201),
);
```

`apps/web/src/app/api/v1/test-scores/[id]/route.ts`:

```ts
import { route } from "@/server/http";
import { deleteTestScore } from "@scholarcrew/core/prep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await deleteTestScore(deps, actor, params.id);
});
```

`apps/web/src/app/api/v1/prep/superscores/route.ts`:

```ts
import { route, studentIdParam } from "@/server/http";
import { getSuperscores } from "@scholarcrew/core/prep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  getSuperscores(deps, actor, studentIdParam({ actor, url })),
);
```

`apps/web/src/app/api/v1/prep/retake/route.ts`:

```ts
import { body, json, route } from "@/server/http";
import { requestRetakeAnalysis } from "@scholarcrew/core/prep";
import { RetakeAnalysisInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await requestRetakeAnalysis(deps, actor, await body(req, RetakeAnalysisInput)), 202),
);
```

`apps/web/src/app/api/v1/prep/study-plan/route.ts`:

```ts
import { body, json, route } from "@/server/http";
import { acceptStudyPlan } from "@scholarcrew/core/prep";
import { StudyPlanInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await acceptStudyPlan(deps, actor, await body(req, StudyPlanInput)), 201),
);
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/prep && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 5 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/test-scores apps/web/src/app/api/v1/prep
git commit -m "feat(web): test score, superscore, retake, and study plan routes"
```

### N5: Service hours, supervisor verification, activities, and requirement progress

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/service-logs/impact.test.ts`:

```ts
import { rateLimits } from "@scholarcrew/db";
import { TEST_NOW } from "@scholarcrew/core/shared";
import { factories } from "@scholarcrew/db/testing";
import type { Activity, RequirementProgress, ServiceLog, VerificationRequestView } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  latestEmail,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { DELETE as deleteActivity } from "../activities/[id]/route";
import { GET as listActivities, PUT as putActivity } from "../activities/route";
import { GET as viewRequest, POST as submitVerification } from "../verify-hours/[token]/route";
import { DELETE as deleteLog, PATCH as patchLog } from "./[id]/route";
import { POST as requestVerify } from "./[id]/verify/route";
import { GET as progress } from "./progress/route";
import { GET as listLogs, POST as addLog } from "./route";

const deps = useTestDeps();

const LOG = {
  organization: "Maple Food Bank",
  activity: "Sorting donations",
  servedOn: "2026-09-26",
  minutes: 120,
  supervisorName: "Dana Lee",
  supervisorEmail: "dana@foodbank.example",
};

async function newLog(cookie: string): Promise<ServiceLog> {
  const res = await addLog(request("/service-logs", { method: "POST", cookie, body: LOG }), NO_PARAMS);
  expect(res.status).toBe(201);
  return readJson<ServiceLog>(res);
}

function verifyToken(text: string): string {
  const match = /\/verify-hours\/([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) throw new Error("No verification link in the email");
  return match[1];
}

describe("service logs (IM-01)", () => {
  it("adds, lists, edits, and deletes logs for the owner only", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const log = await newLog(cookie);
    expect(log).toMatchObject({ minutes: 120, verification: "self_reported" });
    expect(await readJson<ServiceLog[]>(await listLogs(request("/service-logs", { cookie }), NO_PARAMS))).toHaveLength(1);
    const path = `/service-logs/${log.id}`;
    const id = params({ id: log.id });
    const edited = await patchLog(request(path, { method: "PATCH", cookie, body: { minutes: 90 } }), id);
    expect((await readJson<ServiceLog>(edited)).minutes).toBe(90);
    expect((await patchLog(request(path, { method: "PATCH", cookie, body: { minutes: 0 } }), id)).status).toBe(400);
    const other = await signedInStudent(deps().db);
    expect((await patchLog(request(path, { method: "PATCH", cookie: other.cookie, body: { minutes: 30 } }), id)).status).toBe(404);
    expect((await deleteLog(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
  });

  it("lets a parent read logs and progress with the activities share", async () => {
    const student = await signedInStudent(deps().db);
    await newLog(student.cookie);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    const q = `?studentId=${student.user.id}`;
    expect(await readJson<ServiceLog[]>(await listLogs(request(`/service-logs${q}`, { cookie: parent.cookie }), NO_PARAMS))).toHaveLength(1);
    const rows = await readJson<RequirementProgress[]>(
      await progress(request(`/service-logs/progress${q}`, { cookie: parent.cookie }), NO_PARAMS),
    );
    expect(rows).toEqual([]);
  });
});

describe("supervisor verification (IM-02)", () => {
  it("emails a link the supervisor can open and answer once, without an account", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const log = await newLog(cookie);
    const asked = await requestVerify(request(`/service-logs/${log.id}/verify`, { method: "POST", cookie }), params({ id: log.id }));
    expect((await readJson<ServiceLog>(asked)).verification).toBe("requested");
    const token = verifyToken((await latestEmail(deps().db, "dana@foodbank.example")).text);
    const at = params({ token });

    const view = await viewRequest(request(`/verify-hours/${token}`), at);
    expect(view.status).toBe(200);
    expect(await readJson<VerificationRequestView>(view)).toMatchObject({
      studentFirstName: "Test",
      organization: "Maple Food Bank",
      minutes: 120,
    });
    const bad = await submitVerification(request(`/verify-hours/${token}`, { method: "POST", body: { confirmed: "yes" } }), at);
    expect(bad.status).toBe(400);
    const huge = await submitVerification(
      request(`/verify-hours/${token}`, { method: "POST", body: { confirmed: true, note: "n".repeat(70_000) } }),
      at,
    );
    expect(huge.status).toBe(413);
    const done = await submitVerification(
      request(`/verify-hours/${token}`, { method: "POST", body: { confirmed: true, note: "Great helper" } }),
      at,
    );
    expect(done.status).toBe(204);
    expect((await viewRequest(request(`/verify-hours/${token}`), at)).status).toBe(404);
    const again = await submitVerification(request(`/verify-hours/${token}`, { method: "POST", body: { confirmed: false } }), at);
    expect(again.status).toBe(404);
  });

  it("returns 404 for unknown tokens and limits each IP to 10 requests an hour", async () => {
    const headers = { "x-forwarded-for": "198.51.100.20" };
    for (let n = 0; n < 10; n += 1) {
      const res = await viewRequest(request("/verify-hours/unknown-token", { headers }), params({ token: "unknown-token" }));
      expect(res.status).toBe(404);
    }
    const limited = await viewRequest(request("/verify-hours/unknown-token", { headers }), params({ token: "unknown-token" }));
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe("rate_limited");
  });
});

describe("activities (IM-04)", () => {
  it("upserts by position, enforces 150 characters, and deletes for the owner only", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const input = { position: 1, name: "Robotics Club", role: "Captain", description: "é".repeat(150) };
    const res = await putActivity(request("/activities", { method: "PUT", cookie, body: input }), NO_PARAMS);
    expect(res.status).toBe(200);
    const activity = await readJson<Activity>(res);
    const renamed = await putActivity(request("/activities", { method: "PUT", cookie, body: { ...input, name: "FIRST Robotics" } }), NO_PARAMS);
    expect(await readJson<Activity>(renamed)).toMatchObject({ id: activity.id, name: "FIRST Robotics" });
    const tooLong = await putActivity(
      request("/activities", { method: "PUT", cookie, body: { ...input, description: "a".repeat(151) } }),
      NO_PARAMS,
    );
    expect(tooLong.status).toBe(400);
    expect(await readJson<Activity[]>(await listActivities(request("/activities", { cookie }), NO_PARAMS))).toHaveLength(1);
    const path = `/activities/${activity.id}`;
    const other = await signedInStudent(deps().db);
    expect((await deleteActivity(request(path, { method: "DELETE", cookie: other.cookie }), params({ id: activity.id }))).status).toBe(404);
    expect((await deleteActivity(request(path, { method: "DELETE", cookie }), params({ id: activity.id }))).status).toBe(204);
  });
  it("refuses an eleventh supervisor verification email in a day", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    await deps().db.insert(rateLimits).values({ key: `service-logs.verify:${user.id}`, windowStart: new Date(TEST_NOW), count: 10 });
    const res = await requestVerify(request("/service-logs/11111111-1111-4111-8111-111111111111/verify", { method: "POST", cookie }), params({ id: "11111111-1111-4111-8111-111111111111" }));
    expect(res.status).toBe(429);
  });

});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/service-logs`
Expected: FAIL `impact.test.ts` with `Failed to resolve import "../activities/[id]/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/service-logs/route.ts`:

```ts
import { body, json, route, studentIdParam } from "@/server/http";
import { addServiceLog, listServiceLogs } from "@scholarcrew/core/impact";
import { ServiceLogInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  listServiceLogs(deps, actor, studentIdParam({ actor, url })),
);

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await addServiceLog(deps, actor, await body(req, ServiceLogInput)), 201),
);
```

`apps/web/src/app/api/v1/service-logs/[id]/route.ts`:

```ts
import { body, route } from "@/server/http";
import { deleteServiceLog, updateServiceLog } from "@scholarcrew/core/impact";
import { ServiceLogPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateServiceLog(deps, actor, params.id, await body(req, ServiceLogPatch)),
);

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await deleteServiceLog(deps, actor, params.id);
});
```

`apps/web/src/app/api/v1/service-logs/[id]/verify/route.ts`:

```ts
import { route } from "@/server/http";
import { requestVerification } from "@scholarcrew/core/impact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "user", rate: { key: "service-logs.verify", limit: 10, windowSeconds: 86_400 } }, async ({ deps, actor, params }) =>
  requestVerification(deps, actor, params.id),
);
```

`apps/web/src/app/api/v1/service-logs/progress/route.ts`:

```ts
import { route, studentIdParam } from "@/server/http";
import { getRequirementProgress } from "@scholarcrew/core/impact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  getRequirementProgress(deps, actor, studentIdParam({ actor, url })),
);
```

`apps/web/src/app/api/v1/activities/route.ts`:

```ts
import { body, route, studentIdParam } from "@/server/http";
import { listActivities, upsertActivity } from "@scholarcrew/core/impact";
import { ActivityInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  listActivities(deps, actor, studentIdParam({ actor, url })),
);

// PUT upserts by (owner, position): position 1..10 is the slot on the Common App list.
export const PUT = route({ auth: "user" }, async ({ deps, actor, req }) =>
  upsertActivity(deps, actor, await body(req, ActivityInput)),
);
```

`apps/web/src/app/api/v1/activities/[id]/route.ts`:

```ts
import { route } from "@/server/http";
import { deleteActivity } from "@scholarcrew/core/impact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, params, actor }) => {
  await deleteActivity(deps, actor, params.id);
});
```

`apps/web/src/app/api/v1/verify-hours/[token]/route.ts`:

```ts
import { PUBLIC_BODY_LIMIT, body, route } from "@/server/http";
import { getVerificationRequest, submitVerification } from "@scholarcrew/core/impact";
import { VerificationSubmitInput, notFound } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One bucket per IP for both methods, so a token can't be guessed by alternating GET and POST.
const RATE = { key: "verify-hours", limit: 10, windowSeconds: 3600 };

export const GET = route<{ token: string }>({ auth: "none", rate: RATE }, async ({ deps, params }) => {
  const view = await getVerificationRequest(deps, params.token);
  if (!view) throw notFound("This link has expired or was already used.");
  return view;
});

// Public body: the small cap (413 past 64 KB).
export const POST = route<{ token: string }>({ auth: "none", rate: RATE }, async ({ deps, req, params }) => {
  await submitVerification(deps, params.token, await body(req, VerificationSubmitInput, PUBLIC_BODY_LIMIT));
});
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/service-logs && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 6 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/service-logs apps/web/src/app/api/v1/activities apps/web/src/app/api/v1/verify-hours
git commit -m "feat(web): service log, verification, activity, and requirement progress routes"
```

### N6: Costs, award letters, offer comparison, appeals, loans, and the public offer tool

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/offers/money.test.ts`:

```ts
import { TEST_NOW } from "@scholarcrew/core/shared";
import { eq, offerLines, offers, rateLimits } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { CostSummary, CrewJob, LoanEstimate, OfferComparison, OfferLine, OfferWithLines } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  exhaustAllowance,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as getCosts } from "../costs/route";
import { PUT as putCalculator } from "../costs/calculator/route";
import { PATCH as patchLine } from "../offer-lines/[id]/route";
import { POST as offerTool } from "../public/offer-tool/route";
import { POST as appeal } from "./[id]/appeal/route";
import { POST as confirm } from "./[id]/confirm/route";
import { GET as loans } from "./[id]/loans/route";
import { DELETE as removeOffer, GET as getOffer } from "./[id]/route";
import { GET as compare } from "./compare/route";
import { GET as listOffers, POST as createOffer } from "./route";

const deps = useTestDeps();

async function seedOffer(ownerId: string) {
  const college = await factories.college(deps().db, { name: "Maple State University" });
  const [offer] = await deps()
    .db.insert(offers)
    .values({ ownerId, collegeId: college.id, awardYear: "2027-28", status: "needs_review", costOfAttendanceUsd: 30000 })
    .returning();
  if (!offer) throw new Error("offer insert failed");
  const [line] = await deps()
    .db.insert(offerLines)
    .values({ offerId: offer.id, position: 0, label: "Presidential grant", amountUsd: 10000, category: "grant" })
    .returning();
  if (!line) throw new Error("line insert failed");
  return { college, offer, line };
}

describe("costs (MO-01..MO-03)", () => {
  it("saves a calculator result and reads costs, including for a sharing parent", async () => {
    const student = await signedInStudent(deps().db);
    const college = await factories.college(deps().db);
    const body = { collegeId: college.id, costOfAttendanceUsd: 30000, grantsUsd: 12000 };
    const res = await putCalculator(request("/costs/calculator", { method: "PUT", cookie: student.cookie, body }), NO_PARAMS);
    expect(res.status).toBe(200);
    expect(await readJson<CostSummary>(res)).toMatchObject({
      collegeId: college.id,
      source: "calculator",
      costOfAttendanceUsd: 30000,
      freeMoneyUsd: 12000,
    });
    const over = { ...body, grantsUsd: 40000 };
    expect((await putCalculator(request("/costs/calculator", { method: "PUT", cookie: student.cookie, body: over }), NO_PARAMS)).status).toBe(400);
    expect((await getCosts(request("/costs", { cookie: student.cookie }), NO_PARAMS)).status).toBe(200);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    const asParent = await getCosts(request(`/costs?studentId=${student.user.id}`, { cookie: parent.cookie }), NO_PARAMS);
    expect(asParent.status).toBe(200);
    expect((await getCosts(request("/costs"), NO_PARAMS)).status).toBe(401);
  });
});

describe("award letters (MO-04..MO-09)", () => {
  it("lists, reads, corrects, confirms, and compares offers", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const { offer, line } = await seedOffer(user.id);
    const list = await readJson<OfferWithLines[]>(await listOffers(request("/offers", { cookie }), NO_PARAMS));
    expect(list.map((o) => o.id)).toEqual([offer.id]);
    // D31: every offer carries the newest offer.parse job id (null here: the offer was seeded without one).
    expect(list[0]).toHaveProperty("parseJobId", null);
    const one = await getOffer(request(`/offers/${offer.id}`, { cookie }), params({ id: offer.id }));
    const detail = await readJson<OfferWithLines>(one);
    expect(detail.lines).toHaveLength(1);
    expect(detail).toHaveProperty("parseJobId", null);

    const linePath = `/offer-lines/${line.id}`;
    const fixed = await patchLine(request(linePath, { method: "PATCH", cookie, body: { amountUsd: 11000 } }), params({ id: line.id }));
    expect(await readJson<OfferLine>(fixed)).toMatchObject({ amountUsd: 11000, userCorrected: true });
    expect((await patchLine(request(linePath, { method: "PATCH", cookie, body: { category: "gift" } }), params({ id: line.id }))).status).toBe(400);

    const confirmed = await confirm(request(`/offers/${offer.id}/confirm`, { method: "POST", cookie }), params({ id: offer.id }));
    expect((await readJson<OfferWithLines>(confirmed)).status).toBe("confirmed");
    const comparison = await readJson<OfferComparison>(await compare(request("/offers/compare", { cookie }), NO_PARAMS));
    expect(comparison.columns.map((c) => c.offerId)).toEqual([offer.id]);
    expect(await readJson<LoanEstimate[]>(await loans(request(`/offers/${offer.id}/loans`, { cookie }), params({ id: offer.id })))).toEqual([]);
  });

  it("starts an appeal outline job with 202 and hides offers from other students", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const { offer, line } = await seedOffer(user.id);
    const res = await appeal(request(`/offers/${offer.id}/appeal`, { method: "POST", cookie }), params({ id: offer.id }));
    expect(res.status).toBe(202);
    const job = await readJson<CrewJob>(res);
    expect(job).toMatchObject({ kind: "appeal_outline", status: "queued", refId: offer.id });
    expect(deps().jobs.sent).toContainEqual({ name: "appeal.outline", payload: { jobId: job.id, offerId: offer.id } });

    const other = await signedInStudent(deps().db);
    expect((await getOffer(request(`/offers/${offer.id}`, { cookie: other.cookie }), params({ id: offer.id }))).status).toBe(404);
    const steal = { method: "PATCH", cookie: other.cookie, body: { amountUsd: 1 } };
    expect((await patchLine(request(`/offer-lines/${line.id}`, steal), params({ id: line.id }))).status).toBe(404);
    expect((await appeal(request(`/offers/${offer.id}/appeal`, { method: "POST", cookie: other.cookie }), params({ id: offer.id }))).status).toBe(404);
  });

  it("answers 402 limit_reached for an appeal and queues nothing once the crew allowance is used (CR-10)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const { offer } = await seedOffer(user.id);
    await exhaustAllowance(deps().db, user.id);
    const res = await appeal(request(`/offers/${offer.id}/appeal`, { method: "POST", cookie }), params({ id: offer.id }));
    expect(res.status).toBe(402);
    expect((await errorOf(res)).code).toBe("limit_reached");
    expect(deps().jobs.sent).toEqual([]);
  });

  it("validates new offers and needs the student's own award letter", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const college = await factories.college(deps().db);
    const bad = await createOffer(request("/offers", { method: "POST", cookie, body: { collegeId: college.id, awardYear: "2027" } }), NO_PARAMS);
    expect(bad.status).toBe(400);
    const body = { collegeId: college.id, awardYear: "2027-28", documentId: "00000000-0000-4000-8000-000000000001" };
    const missing = await createOffer(request("/offers", { method: "POST", cookie, body }), NO_PARAMS);
    expect(missing.status).toBe(404);
  });

  it("removes a letter that isn't confirmed and keeps confirmed ones (R2P-8)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const { offer } = await seedOffer(user.id);
    const path = `/offers/${offer.id}`;
    const id = params({ id: offer.id });
    const other = await signedInStudent(deps().db);
    expect((await removeOffer(request(path, { method: "DELETE", cookie: other.cookie }), id)).status).toBe(404);
    expect((await removeOffer(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
    expect((await getOffer(request(path, { cookie }), id)).status).toBe(404);
    expect(await deps().db.select().from(offerLines).where(eq(offerLines.offerId, offer.id))).toEqual([]);

    const kept = (await seedOffer(user.id)).offer;
    const keptId = params({ id: kept.id });
    await confirm(request(`/offers/${kept.id}/confirm`, { method: "POST", cookie }), keptId);
    const refused = await removeOffer(request(`/offers/${kept.id}`, { method: "DELETE", cookie }), keptId);
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toEqual({ code: "conflict", message: "Confirmed offers stay. Start a new season to archive them." });
    expect((await getOffer(request(`/offers/${kept.id}`, { cookie }), keptId)).status).toBe(200);
  });
});

describe("POST /public/offer-tool (MO-11)", () => {
  const input = {
    offers: [
      {
        name: "Maple State",
        costOfAttendanceUsd: 30000,
        lines: [{ label: "Grant", amountUsd: 10000, category: "grant", renewable: true }],
      },
    ],
  };
  const headers = { "x-forwarded-for": "203.0.113.9" };

  it("compares offers without signing in and validates the body", async () => {
    const res = await offerTool(request("/public/offer-tool", { method: "POST", body: input, headers }), NO_PARAMS);
    expect(res.status).toBe(200);
    expect((await readJson<OfferComparison>(res)).columns).toHaveLength(1);
    const bad = await offerTool(request("/public/offer-tool", { method: "POST", body: { offers: [] }, headers }), NO_PARAMS);
    expect(bad.status).toBe(400);
    const huge = { offers: [{ ...input.offers[0], name: "n".repeat(70_000) }] };
    expect((await offerTool(request("/public/offer-tool", { method: "POST", body: huge, headers }), NO_PARAMS)).status).toBe(413);
  });

  it("limits each IP to 30 requests an hour", async () => {
    await deps()
      .db.insert(rateLimits)
      .values({ key: "offer-tool:203.0.113.9", windowStart: new Date(TEST_NOW), count: 30 });
    const limited = await offerTool(request("/public/offer-tool", { method: "POST", body: input, headers }), NO_PARAMS);
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe("rate_limited");
    const otherIp = { "x-forwarded-for": "203.0.113.10" };
    expect((await offerTool(request("/public/offer-tool", { method: "POST", body: input, headers: otherIp }), NO_PARAMS)).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/offers`
Expected: FAIL `money.test.ts` with `Failed to resolve import "../costs/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/costs/route.ts`:

```ts
import { route, studentIdParam } from "@/server/http";
import { getCosts } from "@scholarcrew/core/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) => getCosts(deps, actor, studentIdParam({ actor, url })));
```

`apps/web/src/app/api/v1/costs/calculator/route.ts`:

```ts
import { body, route } from "@/server/http";
import { setCalculatorResult } from "@scholarcrew/core/money";
import { CalculatorResultInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = route({ auth: "user" }, async ({ deps, actor, req }) =>
  setCalculatorResult(deps, actor, await body(req, CalculatorResultInput)),
);
```

`apps/web/src/app/api/v1/offers/route.ts`:

```ts
import { body, json, route, studentIdParam } from "@/server/http";
import { createOffer, listOffers } from "@scholarcrew/core/money";
import { CreateOfferInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) => listOffers(deps, actor, studentIdParam({ actor, url })));

// The award letter is uploaded first through POST /documents (plan 13); this enqueues offer.parse.
export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await createOffer(deps, actor, await body(req, CreateOfferInput)), 201),
);
```

`apps/web/src/app/api/v1/offers/compare/route.ts`:

```ts
import { route, studentIdParam } from "@/server/http";
import { compareMyOffers } from "@scholarcrew/core/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  compareMyOffers(deps, actor, studentIdParam({ actor, url })),
);
```

`apps/web/src/app/api/v1/offers/[id]/route.ts`:

```ts
import { route } from "@/server/http";
import { deleteOffer, getOffer } from "@scholarcrew/core/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  getOffer(deps, actor, params.id),
);

// R2P-8: removes a failed or unconfirmed letter (its lines cascade; the uploaded document stays). A confirmed
// offer is 409 conflict: it stays for comparisons and archives with the season (ME-07).
export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await deleteOffer(deps, actor, params.id);
});
```

`apps/web/src/app/api/v1/offers/[id]/confirm/route.ts`:

```ts
import { route } from "@/server/http";
import { confirmOffer } from "@scholarcrew/core/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  confirmOffer(deps, actor, params.id),
);
```

`apps/web/src/app/api/v1/offers/[id]/appeal/route.ts`:

```ts
import { json, route } from "@/server/http";
import { requestAppealOutline } from "@scholarcrew/core/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  json(await requestAppealOutline(deps, actor, params.id), 202),
);
```

`apps/web/src/app/api/v1/offers/[id]/loans/route.ts`:

```ts
import { route } from "@/server/http";
import { loanEstimates } from "@scholarcrew/core/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  loanEstimates(deps, actor, params.id),
);
```

`apps/web/src/app/api/v1/offer-lines/[id]/route.ts`:

```ts
import { body, route } from "@/server/http";
import { updateOfferLine } from "@scholarcrew/core/money";
import { OfferLinePatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateOfferLine(deps, actor, params.id, await body(req, OfferLinePatch)),
);
```

`apps/web/src/app/api/v1/public/offer-tool/route.ts`:

```ts
import { PUBLIC_BODY_LIMIT, body, route } from "@/server/http";
import { publicOfferTool } from "@scholarcrew/core/money";
import { PublicOfferInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MO-11: no login, no storage, no model. Pure Ledger math behind a per-IP limit (SE-04) and the public body cap.
export const POST = route({ auth: "none", rate: { key: "offer-tool", limit: 30, windowSeconds: 3600 } }, async ({ req }) =>
  publicOfferTool(await body(req, PublicOfferInput, PUBLIC_BODY_LIMIT)),
);
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/offers && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 8 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/costs apps/web/src/app/api/v1/offers apps/web/src/app/api/v1/offer-lines apps/web/src/app/api/v1/public
git commit -m "feat(web): cost, offer, comparison, appeal, loan, and public offer tool routes"
```

### N7: FAFSA and CSS checklists and aid deadlines

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/aid/aid.test.ts`:

```ts
import { ensureChecklists } from "@scholarcrew/core/aid";
import { factories } from "@scholarcrew/db/testing";
import { type AidChecklist, type AidChecklistItem, type AidDeadline, systemActor } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as checklists } from "./checklists/route";
import { GET as deadlines } from "./deadlines/route";
import { PATCH as patchItem } from "./items/[id]/route";

const deps = useTestDeps();

async function studentWithParent() {
  const student = await signedInStudent(deps().db);
  const parent = await signedInParent(deps().db);
  await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
  await ensureChecklists(deps(), systemActor("test"), student.user.id);
  return { student, parent };
}

function fafsaItems(lists: AidChecklist[]): AidChecklistItem[] {
  const fafsa = lists.find((l) => l.program === "fafsa");
  if (!fafsa) throw new Error("expected a FAFSA checklist");
  return fafsa.items;
}

describe("aid checklists (AID-01)", () => {
  it("lists the FAFSA steps for the award year and lets the student check one off", async () => {
    const { student } = await studentWithParent();
    const lists = await readJson<AidChecklist[]>(await checklists(request("/aid/checklists", { cookie: student.cookie }), NO_PARAMS));
    const items = fafsaItems(lists);
    expect(items).toHaveLength(7);
    expect(items.every((i) => i.awardYear === "2027-28")).toBe(true);
    const mine = items.find((i) => i.assignee === "student");
    if (!mine) throw new Error("expected a student step");
    const path = `/aid/items/${mine.id}`;
    const done = await patchItem(request(path, { method: "PATCH", cookie: student.cookie, body: { status: "done" } }), params({ id: mine.id }));
    expect(done.status).toBe(200);
    expect((await readJson<AidChecklistItem>(done)).status).toBe("done");
    const bad = await patchItem(request(path, { method: "PATCH", cookie: student.cookie, body: { status: "finished" } }), params({ id: mine.id }));
    expect(bad.status).toBe(400);
  });

  it("lets a parent read the checklist and complete parent steps; strangers get 404", async () => {
    const { student, parent } = await studentWithParent();
    const path = `/aid/checklists?studentId=${student.user.id}`;
    const lists = await readJson<AidChecklist[]>(await checklists(request(path, { cookie: parent.cookie }), NO_PARAMS));
    const theirs = fafsaItems(lists).find((i) => i.assignee === "parent");
    if (!theirs) throw new Error("expected a parent step");
    const done = await patchItem(
      request(`/aid/items/${theirs.id}`, { method: "PATCH", cookie: parent.cookie, body: { status: "done" } }),
      params({ id: theirs.id }),
    );
    expect(done.status).toBe(200);
    const stranger = await signedInStudent(deps().db);
    expect((await checklists(request(path, { cookie: stranger.cookie }), NO_PARAMS)).status).toBe(404);
    const steal = await patchItem(
      request(`/aid/items/${theirs.id}`, { method: "PATCH", cookie: stranger.cookie, body: { status: "todo" } }),
      params({ id: theirs.id }),
    );
    expect(steal.status).toBe(404);
  });

  it("lists aid deadlines (AID-03)", async () => {
    const { student } = await studentWithParent();
    const res = await deadlines(request("/aid/deadlines", { cookie: student.cookie }), NO_PARAMS);
    expect(res.status).toBe(200);
    expect(Array.isArray(await readJson<AidDeadline[]>(res))).toBe(true);
    expect((await deadlines(request("/aid/deadlines"), NO_PARAMS)).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/aid`
Expected: FAIL `aid.test.ts` with `Failed to resolve import "./checklists/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/aid/checklists/route.ts`:

```ts
import { route, studentIdParam } from "@/server/http";
import { getAidChecklists } from "@scholarcrew/core/aid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  getAidChecklists(deps, actor, studentIdParam({ actor, url })),
);
```

`apps/web/src/app/api/v1/aid/items/[id]/route.ts`:

```ts
import { body, route } from "@/server/http";
import { updateAidItem } from "@scholarcrew/core/aid";
import { AidChecklistPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The core lets the student update any item and a family parent update items assigned to "parent".
export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateAidItem(deps, actor, params.id, await body(req, AidChecklistPatch)),
);
```

`apps/web/src/app/api/v1/aid/deadlines/route.ts`:

```ts
import { route, studentIdParam } from "@/server/http";
import { listAidDeadlines } from "@scholarcrew/core/aid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  listAidDeadlines(deps, actor, studentIdParam({ actor, url })),
);
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/aid && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 3 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/aid
git commit -m "feat(web): aid checklist and aid deadline routes"
```

### N8: The weekly plan, This Week, plan items, and plan regeneration

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/plan/plan.test.ts`:

```ts
import { and, eq, shareSettings } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { CrewJob, PlanItem, ThisWeekView, WeekPlan } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  exhaustAllowance,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { PATCH as patchItem } from "../plan-items/[id]/route";
import { POST as addItem } from "../plan-items/route";
import { POST as regenerate } from "./regenerate/route";
import { GET as getPlan } from "./route";
import { GET as thisWeek } from "./this-week/route";

const deps = useTestDeps();

async function addEssayItem(cookie: string): Promise<PlanItem> {
  const body = { title: "Draft Rotary essay", kind: "essay", minutes: 45 };
  const res = await addItem(request("/plan-items", { method: "POST", cookie, body }), NO_PARAMS);
  expect(res.status).toBe(201);
  return readJson<PlanItem>(res);
}

describe("week plan and items (WK-01, WK-02)", () => {
  it("adds an item to this week, reads weeks, and checks items off", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const item = await addEssayItem(cookie);
    expect(item).toMatchObject({ weekStart: "2026-10-05", status: "todo", minutes: 45 });
    const week = await readJson<WeekPlan>(await getPlan(request("/plan", { cookie }), NO_PARAMS));
    expect(week).toMatchObject({ weekStart: "2026-10-05", totalMinutes: 45, doneCount: 0 });
    const next = await readJson<WeekPlan>(await getPlan(request("/plan?week=2026-10-12", { cookie }), NO_PARAMS));
    expect(next).toMatchObject({ weekStart: "2026-10-12", items: [] });
    expect((await getPlan(request("/plan?week=next", { cookie }), NO_PARAMS)).status).toBe(400);

    const path = `/plan-items/${item.id}`;
    const id = params({ id: item.id });
    const done = await patchItem(request(path, { method: "PATCH", cookie, body: { status: "done" } }), id);
    expect((await readJson<PlanItem>(done)).status).toBe("done");
    expect((await patchItem(request(path, { method: "PATCH", cookie, body: { status: "finished" } }), id)).status).toBe(400);
    const other = await signedInStudent(deps().db);
    expect((await patchItem(request(path, { method: "PATCH", cookie: other.cookie, body: { status: "todo" } }), id)).status).toBe(404);
    const bad = await addItem(request("/plan-items", { method: "POST", cookie, body: { title: "", kind: "essay", minutes: 5 } }), NO_PARAMS);
    expect(bad.status).toBe(400);
  });
});

describe("GET /plan/this-week (WK-01..WK-05)", () => {
  it("returns the student's view", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const item = await addEssayItem(cookie);
    const view = await readJson<ThisWeekView>(await thisWeek(request("/plan/this-week", { cookie }), NO_PARAMS));
    expect(view).toMatchObject({ greetingName: "Test", weekStart: "2026-10-05", crewWorking: false });
    expect(view.nextStep?.id).toBe(item.id);
  });

  it("serves a parent while deadlines are shared and 404s once they aren't", async () => {
    const student = await signedInStudent(deps().db);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    const path = `/plan/this-week?studentId=${student.user.id}`;
    const shared = await thisWeek(request(path, { cookie: parent.cookie }), NO_PARAMS);
    expect(shared.status).toBe(200);
    expect((await readJson<ThisWeekView>(shared)).greetingName).toBe("Test");
    await deps()
      .db.update(shareSettings)
      .set({ enabled: false })
      .where(and(eq(shareSettings.studentId, student.user.id), eq(shareSettings.category, "deadlines")));
    expect((await thisWeek(request(path, { cookie: parent.cookie }), NO_PARAMS)).status).toBe(404);
    const stranger = await signedInStudent(deps().db);
    expect((await thisWeek(request(path, { cookie: stranger.cookie }), NO_PARAMS)).status).toBe(404);
  });
});

describe("POST /plan/regenerate", () => {
  it("queues a weekly plan job with 202", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const res = await regenerate(request("/plan/regenerate", { method: "POST", cookie }), NO_PARAMS);
    expect(res.status).toBe(202);
    const job = await readJson<CrewJob>(res);
    expect(job).toMatchObject({ kind: "weekly_plan", status: "queued" });
    expect(deps().jobs.sent).toContainEqual({ name: "plan.weekly", payload: { jobId: job.id, ownerId: user.id } });
    expect((await regenerate(request("/plan/regenerate", { method: "POST" }), NO_PARAMS)).status).toBe(401);
  });

  it("answers 402 limit_reached and queues nothing once the crew allowance is used (CR-10)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    await exhaustAllowance(deps().db, user.id);
    const res = await regenerate(request("/plan/regenerate", { method: "POST", cookie }), NO_PARAMS);
    expect(res.status).toBe(402);
    expect((await errorOf(res)).code).toBe("limit_reached");
    expect(deps().jobs.sent).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/plan`
Expected: FAIL `plan.test.ts` with `Failed to resolve import "../plan-items/[id]/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/plan/route.ts`:

```ts
import { query, route, studentIdParam } from "@/server/http";
import { getWeekPlan } from "@scholarcrew/core/plan";
import { IsoDate } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Non-strict, like studentIdParam's parser, so `week` and `studentId` share the query string.
const WeekParams = z.object({ week: IsoDate.optional() });

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) => {
  const { week } = query(url, WeekParams);
  return getWeekPlan(deps, actor, studentIdParam({ actor, url }), week);
});
```

`apps/web/src/app/api/v1/plan/this-week/route.ts`:

```ts
import { route, studentIdParam } from "@/server/http";
import { getThisWeek } from "@scholarcrew/core/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Parents need the deadlines share; the gap and sweep cards appear only with costs and scholarships shares.
export const GET = route({ auth: "user" }, async ({ deps, actor, url }) => getThisWeek(deps, actor, studentIdParam({ actor, url })));
```

`apps/web/src/app/api/v1/plan/regenerate/route.ts`:

```ts
import { json, route } from "@/server/http";
import { requestWeeklyPlan } from "@scholarcrew/core/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 16's "Plan my week" button (R2C-5). The payload has no `source`, so the worker counts it as a "user" plan against
// the monthly allowance; the Monday `plan.weekly.fanout` starts system plans through 08 `startWeeklyPlan`, which don't count.
export const POST = route({ auth: "user" }, async ({ deps, actor }) => json(await requestWeeklyPlan(deps, actor), 202));
```

`apps/web/src/app/api/v1/plan-items/route.ts`:

```ts
import { body, json, route } from "@/server/http";
import { addPlanItem } from "@scholarcrew/core/plan";
import { PlanItemInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await addPlanItem(deps, actor, await body(req, PlanItemInput)), 201),
);
```

`apps/web/src/app/api/v1/plan-items/[id]/route.ts`:

```ts
import { body, route } from "@/server/http";
import { updatePlanItem } from "@scholarcrew/core/plan";
import { PlanItemPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Not this week" is { weekStart: <next Monday> }; checking an item is { status: "done" }.
export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updatePlanItem(deps, actor, params.id, await body(req, PlanItemPatch)),
);
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/plan && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 5 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/plan apps/web/src/app/api/v1/plan-items
git commit -m "feat(web): week plan, this week, plan item, and regenerate routes"
```

### N9: Conversations, messages, jobs, and action cards

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/conversations/crew.test.ts`:

```ts
import { TEST_NOW } from "@scholarcrew/core/shared";
import { crewJobs, messages, rateLimits, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { ActionReceipt, Conversation, CrewJob, CrewReply, Message } from "@scholarcrew/domain";
import { NO_PARAMS, errorOf, exhaustAllowance, params, readJson, request, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { POST as applyCard } from "../actions/apply/route";
import { GET as getJob } from "../jobs/[id]/route";
import { GET as listJobs } from "../jobs/route";
import { GET as getMessages, POST as sendMessage } from "./[id]/messages/route";
import { GET as listConversations, POST as createConversation } from "./route";

const deps = useTestDeps();

function send(cookie: string, conversationId: string, text: string): Promise<Response> {
  return sendMessage(
    request(`/conversations/${conversationId}/messages`, { method: "POST", cookie, body: { body: text } }),
    params({ id: conversationId }),
  );
}

describe("conversations (CR-01)", () => {
  it("creates and lists rooms and validates the room kind", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await createConversation(request("/conversations", { method: "POST", cookie, body: { room: "my_crew" } }), NO_PARAMS);
    expect(res.status).toBe(201);
    const conv = await readJson<Conversation>(res);
    expect(conv.room).toBe("my_crew");
    const list = await readJson<Conversation[]>(await listConversations(request("/conversations", { cookie }), NO_PARAMS));
    expect(list.map((c) => c.id)).toContain(conv.id);
    const bad = await createConversation(request("/conversations", { method: "POST", cookie, body: { room: "lounge" } }), NO_PARAMS);
    expect(bad.status).toBe(400);
  });
});

describe("messages (CR-06, CR-10)", () => {
  it("answers a crisis at both limits with a ready job, no queue send, and unchanged usage", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, user.id, { room: "my_crew" });
    await exhaustAllowance(deps().db, user.id);
    await deps().db.insert(rateLimits).values({ key: `crew-send:${user.id}`, windowStart: new Date(TEST_NOW), count: 30 });
    const before = await deps().db.select().from(usageCounters);
    const res = await send(cookie, conv.id, "I want to kill myself");
    expect(res.status).toBe(202);
    const result = await readJson<{ message: Message; job: CrewJob }>(res);
    expect(result.job).toMatchObject({ status: "ready", safety: "crisis" });
    const history = await readJson<Message[]>(await getMessages(request(`/conversations/${conv.id}/messages`, { cookie }), params({ id: conv.id })));
    expect(history.find((message) => message.authorKind === "crew")?.body).toContain("988");
    expect(await deps().db.select().from(usageCounters)).toEqual(before);
    expect(deps().jobs.sent).toEqual([]);
  });

  it("sends a message and returns the message and its queued job with 202", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, user.id, { room: "my_crew" });
    const res = await send(cookie, conv.id, "@Scout what's due this week?");
    expect(res.status).toBe(202);
    const { message, job } = await readJson<{ message: Message; job: CrewJob }>(res);
    expect(message).toMatchObject({ authorKind: "user", body: "@Scout what's due this week?" });
    expect(job).toMatchObject({ kind: "crew_request", status: "queued", conversationId: conv.id });
    expect(deps().jobs.sent).toContainEqual({ name: "crew.request", payload: { jobId: job.id } });
    const history = await getMessages(request(`/conversations/${conv.id}/messages`, { cookie }), params({ id: conv.id }));
    expect((await readJson<Message[]>(history)).map((m) => m.id)).toEqual([message.id]);
    expect((await send(cookie, conv.id, "   ")).status).toBe(400);
  });

  it("hides other students' rooms", async () => {
    const owner = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, owner.user.id, { room: "my_crew" });
    const other = await signedInStudent(deps().db);
    expect((await send(other.cookie, conv.id, "hi")).status).toBe(404);
    const read = await getMessages(request(`/conversations/${conv.id}/messages`, { cookie: other.cookie }), params({ id: conv.id }));
    expect(read.status).toBe(404);
  });

  it("limits each user to 30 sends per 10 minutes (SE-04)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, user.id, { room: "my_crew" });
    await deps().db.insert(rateLimits).values({ key: `crew-send:${user.id}`, windowStart: new Date(TEST_NOW), count: 30 });
    const limited = await send(cookie, conv.id, "one more");
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe("rate_limited");
  });

  it("answers 402 limit_reached and saves or queues nothing once the crew allowance is used (CR-10)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, user.id, { room: "my_crew" });
    await exhaustAllowance(deps().db, user.id);
    const res = await send(cookie, conv.id, "@Scout anything new?");
    expect(res.status).toBe(402);
    expect((await errorOf(res)).code).toBe("limit_reached");
    expect(deps().jobs.sent).toEqual([]);
    const history = await getMessages(request(`/conversations/${conv.id}/messages`, { cookie }), params({ id: conv.id }));
    expect(await readJson<Message[]>(history)).toEqual([]);
  });
});

describe("GET /jobs (D28)", () => {
  it("lists the caller's jobs newest first, filters to active ones, and bounds the limit", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const insert = async (ownerId: string, status: CrewJob["status"], at: string): Promise<string> => {
      const [row] = await deps()
        .db.insert(crewJobs)
        .values({ ownerId, kind: "crew_request", status, usageMonth: at.slice(0, 7), createdAt: new Date(at) })
        .returning();
      if (!row) throw new Error("job insert failed");
      return row.id;
    };
    const done = await insert(user.id, "ready", "2026-10-06T13:00:00.000Z");
    const working = await insert(user.id, "working", "2026-10-06T14:00:00.000Z");
    const queued = await insert(user.id, "queued", "2026-10-06T14:30:00.000Z");
    await insert(other.user.id, "queued", "2026-10-06T14:45:00.000Z");
    const ids = async (qs: string) =>
      (await readJson<CrewJob[]>(await listJobs(request(`/jobs${qs}`, { cookie }), NO_PARAMS))).map((j) => j.id);
    expect(await ids("")).toEqual([queued, working, done]);
    expect(await ids("?active=1&limit=10")).toEqual([queued, working]);
    expect(await ids("?limit=1")).toEqual([queued]);
    expect((await listJobs(request("/jobs?limit=51", { cookie }), NO_PARAMS)).status).toBe(400);
    expect((await listJobs(request("/jobs?active=maybe", { cookie }), NO_PARAMS)).status).toBe(400);
    expect((await listJobs(request("/jobs"), NO_PARAMS)).status).toBe(401);
  });
});

describe("GET /jobs/:id", () => {
  it("returns the owner's job and 404 for anyone else", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, user.id, { room: "my_crew" });
    const { job } = await readJson<{ job: CrewJob }>(await send(cookie, conv.id, "hello"));
    const mine = await getJob(request(`/jobs/${job.id}`, { cookie }), params({ id: job.id }));
    expect((await readJson<CrewJob>(mine)).id).toBe(job.id);
    const other = await signedInStudent(deps().db);
    expect((await getJob(request(`/jobs/${job.id}`, { cookie: other.cookie }), params({ id: job.id }))).status).toBe(404);
    expect((await getJob(request("/jobs/nope", { cookie }), params({ id: "nope" }))).status).toBe(404);
  });
});

describe("POST /actions/apply (CR-05)", () => {
  it("applies an action card from a crew reply once, for the room's owner only", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, user.id, { room: "my_crew" });
    const reply: CrewReply = {
      text: "Block 45 minutes for the Rotary essay this week.",
      contributors: ["compass", "quill"],
      question: null,
      actionCards: [
        {
          kind: "add_plan_item",
          id: "plan-1",
          label: "Add to this week",
          item: {
            title: "Draft Rotary essay",
            kind: "essay",
            refType: null,
            refId: null,
            minutes: 45,
            valueUsd: null,
            dueOn: null,
            contributors: ["quill"],
            weekStart: null,
          },
        },
      ],
      receipt: [],
      safety: null,
      needsInput: false,
    };
    const [crewMessage] = await deps()
      .db.insert(messages)
      .values({ conversationId: conv.id, authorKind: "crew", body: reply.text, reply })
      .returning();
    if (!crewMessage) throw new Error("message insert failed");
    const input = { messageId: crewMessage.id, cardId: "plan-1" };
    const res = await applyCard(request("/actions/apply", { method: "POST", cookie, body: input }), NO_PARAMS);
    expect(res.status).toBe(200);
    expect(await readJson<ActionReceipt>(res)).toMatchObject({ messageId: crewMessage.id, cardId: "plan-1" });
    const other = await signedInStudent(deps().db);
    expect((await applyCard(request("/actions/apply", { method: "POST", cookie: other.cookie, body: input }), NO_PARAMS)).status).toBe(404);
    const bad = await applyCard(
      request("/actions/apply", { method: "POST", cookie, body: { messageId: crewMessage.id, cardId: "Bad Card!" } }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/conversations`
Expected: FAIL `crew.test.ts` with `Failed to resolve import "../actions/apply/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/conversations/route.ts`:

```ts
import { body, json, route } from "@/server/http";
import { createConversation, listConversations } from "@scholarcrew/core/crew";
import { ConversationInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listConversations(deps, actor));

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await createConversation(deps, actor, await body(req, ConversationInput)), 201),
);
```

`apps/web/src/app/api/v1/conversations/[id]/messages/route.ts`:

```ts
import { body, json, query, route } from "@/server/http";
import { z } from "zod";
import { getMessages, sendMessage } from "@scholarcrew/core/crew";
import { SendMessageInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params, url }) =>
  getMessages(deps, actor, params.id, query(url, z.object({ before: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(100).optional() }))),
);

// Core checks crisis first, then the crew-send rate and monthly allowance. Crisis replies are free.
export const POST = route<{ id: string }>(
  { auth: "user" },
  async ({ deps, actor, req, params }) =>
    json(await sendMessage(deps, actor, params.id, await body(req, SendMessageInput)), 202),
);
```

`apps/web/src/app/api/v1/jobs/[id]/route.ts`:

```ts
import { route } from "@/server/http";
import { getJob } from "@scholarcrew/core/crew";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => getJob(deps, actor, params.id));
```

`apps/web/src/app/api/v1/jobs/route.ts`:

```ts
import { query, route } from "@/server/http";
import { listJobs } from "@scholarcrew/core/crew";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// D28: the crew panel's background job list. active=1 keeps queued and working jobs; core defaults limit to 20.
const JobsQuery = z.object({
  active: z.stringbool().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) => listJobs(deps, actor, query(url, JobsQuery)));
```

`apps/web/src/app/api/v1/actions/apply/route.ts`:

```ts
import { body, route } from "@/server/http";
import { applyActionCard } from "@scholarcrew/core/crew";
import { ApplyActionInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nothing changes until the student presses the card (CR-05); the receipt is unique per (message, card).
export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  applyActionCard(deps, actor, await body(req, ApplyActionInput)),
);
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/conversations && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 9 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/conversations apps/web/src/app/api/v1/jobs/route.ts "apps/web/src/app/api/v1/jobs/[id]/route.ts" apps/web/src/app/api/v1/actions
git commit -m "feat(web): conversation, message, job, job list, and action card routes"
```

### N10: Job progress over Server-Sent Events

The stream logic lives in `jobs/[id]/events/stream.ts` because a `route.ts` may only export HTTP methods and segment config. The poll interval, timeout, and ping interval are module-level and replaced only by `setJobEventTimingForTests`. The timeout and the ping use wall time (`Date.now()`), not `deps.clock`, because the test clock is fixed.

Buffering and idle proxies (R3E-1, R3E-2):
- `SSE_HEADERS` sends `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, and `X-Accel-Buffering: no`. Next 15's `next start` compresses through its bundled `compression` middleware, which skips a response marked `no-transform`, so 13 M2 keeps `compress` at its default. `X-Accel-Buffering: no` tells nginx not to buffer the stream.
- No `Content-Encoding` header is sent. `none` isn't a registered content coding, and `no-transform` alone already stops Next's compression (lead override of the r3 fix plan's `"content-encoding": "none"`).
- While nothing changes, the stream writes the comment `: ping\n\n` every 15 s (`pingMs`), so a proxy with a 60 s idle timeout doesn't close it. `EventSource` ignores comment lines.
- Library note: whether `next start` (and the deploy proxy) passes frames through unbuffered must be verified at execution, not assumed from Vitest, which calls the route directly. Check with `curl -sN -D - -H 'Accept-Encoding: gzip' -H "Cookie: $COOKIE" "$APP_URL/api/v1/jobs/$JOB/events"`: the dumped headers have no `Content-Encoding: gzip`, a `job` frame shows up as each change lands, and `: ping` lines show up about every 15 s while the job waits. If compression still applies, set `compress: false` in 13 M2 (declined in r3 §3 unless this check fails).

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/jobs/[id]/events/events.test.ts`:

```ts
import { TEST_NOW } from "@scholarcrew/core/shared";
import { crewJobs, eq } from "@scholarcrew/db";
import type { CrewJob } from "@scholarcrew/domain";
import { params, request, signedInStudent, useTestDeps } from "@test/helpers";
import { afterEach, describe, expect, it } from "vitest";
import { GET as events } from "./route";
import { setJobEventTimingForTests } from "./stream";

const deps = useTestDeps();
const decoder = new TextDecoder();

afterEach(() => setJobEventTimingForTests());

type Frame = { event: string; data: unknown };

/** Event blocks only: comment blocks (`: ping`) are dropped, as EventSource ignores them. */
function parseFrames(text: string): Frame[] {
  return text
    .split("\n\n")
    .filter((block) => block.trim() !== "" && !block.startsWith(":"))
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((l) => l.startsWith("event: "))?.slice(7) ?? "";
      const data: unknown = JSON.parse(lines.find((l) => l.startsWith("data: "))?.slice(6) ?? "null");
      return { event, data };
    });
}

function readerOf(res: Response): ReadableStreamDefaultReader<Uint8Array> {
  if (!res.body) throw new Error("expected a streaming body");
  return res.body.getReader();
}

/** Reads until `n` more frames arrived or the stream closed. */
async function readFrames(reader: ReadableStreamDefaultReader<Uint8Array>, n: number): Promise<string> {
  let text = "";
  while ((text.match(/\n\n/g) ?? []).length < n) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

async function readToEnd(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return text;
    text += decoder.decode(value, { stream: true });
  }
}

async function newJob(ownerId: string, status: CrewJob["status"] = "queued"): Promise<string> {
  const [row] = await deps().db.insert(crewJobs).values({ ownerId, kind: "crew_request", status, usageMonth: "2026-10" }).returning();
  if (!row) throw new Error("job insert failed");
  return row.id;
}

function open(cookie: string | undefined, id: string, signal?: AbortSignal): Promise<Response> {
  const req = request(`/jobs/${id}/events`, cookie ? { cookie } : {});
  return events(signal ? new Request(req, { signal }) : req, params({ id }));
}

describe("GET /jobs/:id/events (CR-06)", () => {
  it("streams the current job, each status or progress change, then end on a terminal status", async () => {
    setJobEventTimingForTests({ pollMs: 20, timeoutMs: 5_000 });
    const { user, cookie } = await signedInStudent(deps().db);
    const id = await newJob(user.id);
    const res = await open(cookie, id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    // R3E-1: no-transform stops Next's compression; X-Accel-Buffering stops nginx buffering.
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(res.headers.get("connection")).toBe("keep-alive");
    expect(res.headers.get("content-encoding")).toBeNull();
    const reader = readerOf(res);
    let text = await readFrames(reader, 1);
    await deps()
      .db.update(crewJobs)
      .set({ status: "working", progress: [{ at: TEST_NOW, role: "scout", text: "Checking deadlines" }] })
      .where(eq(crewJobs.id, id));
    text += await readFrames(reader, 1);
    await deps().db.update(crewJobs).set({ status: "ready" }).where(eq(crewJobs.id, id));
    text += await readToEnd(reader);
    const frames = parseFrames(text);
    expect(frames.map((f) => f.event)).toEqual(["job", "job", "job", "end"]);
    expect(frames.slice(0, 3).map((f) => (f.data as CrewJob).status)).toEqual(["queued", "working", "ready"]);
    expect((frames[1]?.data as CrewJob).progress).toHaveLength(1);
    expect(frames[3]?.data).toEqual({});
    expect(text).toContain(`event: job\ndata: {"id":"${id}"`);
  });

  it("ends right away for a job that already finished", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const id = await newJob(user.id, "failed");
    const frames = parseFrames(await (await open(cookie, id)).text());
    expect(frames.map((f) => f.event)).toEqual(["job", "end"]);
  });

  it("sends end after the timeout when nothing changes", async () => {
    setJobEventTimingForTests({ pollMs: 20, timeoutMs: 150 });
    const { user, cookie } = await signedInStudent(deps().db);
    const id = await newJob(user.id);
    const started = Date.now();
    const frames = parseFrames(await (await open(cookie, id)).text());
    expect(frames.map((f) => f.event)).toEqual(["job", "end"]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
  });

  it("writes a : ping comment while nothing changes (R3E-2)", async () => {
    setJobEventTimingForTests({ pollMs: 20, timeoutMs: 200, pingMs: 50 });
    const { user, cookie } = await signedInStudent(deps().db);
    const id = await newJob(user.id);
    const text = await (await open(cookie, id)).text();
    expect((text.match(/^: ping\n\n/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(parseFrames(text).map((f) => f.event)).toEqual(["job", "end"]);
  });

  it("stops without an end frame when the client disconnects", async () => {
    setJobEventTimingForTests({ pollMs: 20, timeoutMs: 10_000 });
    const { user, cookie } = await signedInStudent(deps().db);
    const id = await newJob(user.id);
    const abort = new AbortController();
    const reader = readerOf(await open(cookie, id, abort.signal));
    expect(parseFrames(await readFrames(reader, 1)).map((f) => f.event)).toEqual(["job"]);
    const started = Date.now();
    abort.abort();
    expect(parseFrames(await readToEnd(reader))).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("answers 404 JSON for other students' jobs and 401 signed out", async () => {
    const owner = await signedInStudent(deps().db);
    const id = await newJob(owner.user.id);
    const other = await signedInStudent(deps().db);
    const res = await open(other.cookie, id);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect((await open(undefined, id)).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/jobs`
Expected: FAIL `events.test.ts` with `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/jobs/[id]/events/stream.ts`:

```ts
import { getJob } from "@scholarcrew/core/crew";
import type { CoreDeps } from "@scholarcrew/core/shared";
import { type Actor, type CrewJob, TERMINAL_JOB_STATUSES } from "@scholarcrew/domain";

export interface JobEventTiming {
  pollMs: number;
  timeoutMs: number;
  /** Quiet time after which a `: ping` comment is written (R3E-2). */
  pingMs: number;
}

/** Section 10: poll crew.getJob every second for up to 130 seconds, with a `: ping` every 15 s of quiet. */
export const DEFAULT_JOB_EVENT_TIMING: JobEventTiming = { pollMs: 1000, timeoutMs: 130_000, pingMs: 15_000 };

let timing: JobEventTiming = DEFAULT_JOB_EVENT_TIMING;

/** Tests only: shorten the poll interval, timeout, or ping. Call with no argument to restore the defaults. */
export function setJobEventTimingForTests(t?: Partial<JobEventTiming>): void {
  timing = { ...DEFAULT_JOB_EVENT_TIMING, ...t };
}

/**
 * R3E-1: `no-transform` makes Next's bundled `compression` middleware skip the stream, and
 * `x-accel-buffering: no` tells nginx not to buffer it. No Content-Encoding is sent (`none` isn't a
 * real coding). Verify under `next start` and the deploy proxy at execution (see N10 intro).
 */
export const SSE_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

const encoder = new TextEncoder();

/** An SSE comment line. EventSource ignores it; idle proxies see bytes and keep the connection open. */
export const SSE_PING = encoder.encode(": ping\n\n");

export function sseFrame(event: "job" | "end", data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function isTerminal(job: CrewJob): boolean {
  return TERMINAL_JOB_STATUSES.includes(job.status);
}

function changed(before: CrewJob, after: CrewJob): boolean {
  return before.status !== after.status || before.progress.length !== after.progress.length;
}

/** Resolves after `ms`, or as soon as the signal aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * `event: job` with the current job first, then again whenever status or progress length changes;
 * `event: end` with `{}` on a terminal status or at the timeout. After a poll with no change, a
 * `: ping` comment goes out once `pingMs` passed since the last write. A client disconnect (request
 * signal or stream cancel) stops polling and closes the stream without an end frame.
 */
export function jobEventStream(
  deps: CoreDeps,
  actor: Actor,
  first: CrewJob,
  requestSignal: AbortSignal,
): ReadableStream<Uint8Array> {
  const { pollMs, timeoutMs, pingMs } = timing;
  const stop = new AbortController();
  const onAbort = () => stop.abort();
  if (requestSignal.aborted) stop.abort();
  else requestSignal.addEventListener("abort", onAbort, { once: true });

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let lastWriteAt = Date.now();
      const send = (chunk: Uint8Array) => {
        if (stop.signal.aborted) return;
        try {
          controller.enqueue(chunk);
          lastWriteAt = Date.now();
        } catch {
          stop.abort();
        }
      };
      const run = async () => {
        const deadline = Date.now() + timeoutMs;
        let last = first;
        send(sseFrame("job", first));
        try {
          while (!stop.signal.aborted && !isTerminal(last) && Date.now() < deadline) {
            await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())), stop.signal);
            if (stop.signal.aborted) break;
            const next = await getJob(deps, actor, first.id);
            if (changed(last, next)) send(sseFrame("job", next));
            else if (Date.now() - lastWriteAt >= pingMs) send(SSE_PING);
            last = next;
          }
        } catch (e) {
          console.error(JSON.stringify({ level: "error", msg: "job event stream failed", jobId: first.id, error: String(e) }));
        }
        send(sseFrame("end", {}));
        requestSignal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          // The reader already canceled the stream.
        }
      };
      void run();
    },
    cancel() {
      stop.abort();
    },
  });
}
```

`apps/web/src/app/api/v1/jobs/[id]/events/route.ts`:

```ts
import { route } from "@/server/http";
import { getJob } from "@scholarcrew/core/crew";
import { SSE_HEADERS, jobEventStream } from "./stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The first getJob runs before the stream opens, so unknown and not-yours jobs are a plain 404 JSON error.
export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params, req }) => {
  const job = await getJob(deps, actor, params.id);
  return new Response(jobEventStream(deps, actor, job, req.signal), { status: 200, headers: SSE_HEADERS });
});
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/jobs && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 6 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/api/v1/jobs/[id]/events"
git commit -m "feat(web): job status and progress over server-sent events"
```

### N11: Admin review queue, scholarship editor, reports, audit search, research requests, and aid data

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/admin/admin.test.ts`:

```ts
import { reportListing, submitLocalScholarship } from "@scholarcrew/core/scholarships";
import { factories } from "@scholarcrew/db/testing";
import {
  type AidDeadline,
  type AidRule,
  type AuditEvent,
  type CatalogReport,
  type CatalogTask,
  type Page,
  type Scholarship,
  userActor,
} from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  params,
  readJson,
  request,
  signedInAdmin,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { DELETE as deleteDeadline } from "./aid-deadlines/[id]/route";
import { GET as listDeadlines, PUT as putDeadline } from "./aid-deadlines/route";
import { GET as listRules, PUT as putRule } from "./aid-rules/route";
import { GET as searchAudit } from "./audit/route";
import { POST as resolveTask } from "./catalog-tasks/[id]/resolve/route";
import { GET as getTask } from "./catalog-tasks/[id]/route";
import { GET as listTasks } from "./catalog-tasks/route";
import { POST as resolveReport } from "./reports/[id]/resolve/route";
import { GET as listReports } from "./reports/route";
import { POST as enqueueResearch } from "./research/route";
import { GET as getListing, PATCH as updateListing } from "./scholarships/[id]/route";
import { POST as setStatus } from "./scholarships/[id]/status/route";
import { GET as listListings, POST as createListing } from "./scholarships/route";

const deps = useTestDeps();

const LISTING = {
  slug: "maple-rotary-stem-award",
  name: "Maple Rotary STEM Award",
  provider: "Maple Rotary Club",
  url: "https://maplerotary.example/stem",
  sourceUrl: "https://maplerotary.example/stem",
  amountMinUsd: 1000,
  amountMaxUsd: 2500,
  renewable: false,
  renewalTerms: "",
  deadline: "2027-02-01",
  cycle: "2026-27",
  localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
  eligibility: [{ type: "state_in", states: ["TX"] }],
  requirements: {
    essays: [{ prompt: "Why STEM?", wordLimit: 500 }],
    recommendations: 1,
    transcript: true,
    serviceHours: null,
    other: [],
  },
  estMinutes: 90,
  scamFlags: [],
};

describe("admin guard (ID-04)", () => {
  it("is 401 signed out and 404 for non-admins", async () => {
    expect((await listTasks(request("/admin/catalog-tasks"), NO_PARAMS)).status).toBe(401);
    const { cookie } = await signedInStudent(deps().db);
    expect((await listTasks(request("/admin/catalog-tasks", { cookie }), NO_PARAMS)).status).toBe(404);
    const body = { state: "TX" };
    expect((await enqueueResearch(request("/admin/research", { method: "POST", cookie, body }), NO_PARAMS)).status).toBe(404);
  });
});

describe("review queue (AD-01)", () => {
  it("filters tasks and resolves one once", async () => {
    const student = await signedInStudent(deps().db);
    await submitLocalScholarship(deps(), userActor(student.user.id, "student"), {
      url: "https://maplerotary.example/local",
      name: "Maple Local Award",
      notes: "",
    });
    const { cookie } = await signedInAdmin(deps().db);
    const res = await listTasks(request("/admin/catalog-tasks?status=open&kind=user_submission", { cookie }), NO_PARAMS);
    const tasks = await readJson<CatalogTask[]>(res);
    expect(tasks).toHaveLength(1);
    const task = tasks[0];
    if (!task) throw new Error("expected a task");
    expect((await listTasks(request("/admin/catalog-tasks?status=done", { cookie }), NO_PARAMS)).status).toBe(400);

    const path = `/admin/catalog-tasks/${task.id}/resolve`;
    const body = { status: "resolved", note: "Verified with the club", publishScholarshipId: task.scholarshipId };
    const resolved = await resolveTask(request(path, { method: "POST", cookie, body }), params({ id: task.id }));
    expect(resolved.status).toBe(200);
    expect((await readJson<CatalogTask>(resolved)).status).toBe("resolved");
    const again = await resolveTask(request(path, { method: "POST", cookie, body }), params({ id: task.id }));
    expect(again.status).toBe(409);
  });
});

describe("scholarship editor (AD-02)", () => {
  it("creates, edits, and retires a listing, then finds it in the audit log (AD-05)", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const created = await createListing(request("/admin/scholarships", { method: "POST", cookie, body: LISTING }), NO_PARAMS);
    expect(created.status).toBe(201);
    const listing = await readJson<Scholarship>(created);
    expect(listing).toMatchObject({ slug: "maple-rotary-stem-award", amountMaxUsd: 2500 });

    const path = `/admin/scholarships/${listing.id}`;
    const id = params({ id: listing.id });
    const edited = await updateListing(request(path, { method: "PATCH", cookie, body: { ...LISTING, name: "Maple STEM Award" } }), id);
    expect(edited.status).toBe(200);
    expect(await readJson<Scholarship>(edited)).toMatchObject({ id: listing.id, name: "Maple STEM Award" });
    const inverted = { ...LISTING, amountMinUsd: 5000 };
    expect((await updateListing(request(path, { method: "PATCH", cookie, body: inverted }), id)).status).toBe(400);

    const retired = await setStatus(
      request(`${path}/status`, { method: "POST", cookie, body: { status: "retired", note: "Program ended" } }),
      id,
    );
    expect((await readJson<Scholarship>(retired)).status).toBe("retired");
    expect((await setStatus(request(`${path}/status`, { method: "POST", cookie, body: { status: "gone" } }), id)).status).toBe(400);

    const audit = await searchAudit(request(`/admin/audit?entityType=scholarship&entityId=${listing.id}`, { cookie }), NO_PARAMS);
    const page = await readJson<Page<AuditEvent>>(audit);
    expect(page.items.map((e) => e.action)).toContain("scholarship_status_set");
    expect((await searchAudit(request("/admin/audit?page=0", { cookie }), NO_PARAMS)).status).toBe(400);
  });
});

describe("reports (AD-04) and research (CA)", () => {
  it("lists open reports and resolves one with a note", async () => {
    const student = await signedInStudent(deps().db);
    const listing = await factories.scholarship(deps().db);
    await reportListing(deps(), userActor(student.user.id, "student"), {
      scholarshipId: listing.id,
      reason: "dead_link",
      details: "",
    });
    const { cookie } = await signedInAdmin(deps().db);
    const open = await readJson<CatalogReport[]>(await listReports(request("/admin/reports?status=open", { cookie }), NO_PARAMS));
    expect(open).toHaveLength(1);
    const report = open[0];
    if (!report) throw new Error("expected a report");
    expect((await listReports(request("/admin/reports?status=maybe", { cookie }), NO_PARAMS)).status).toBe(400);
    const path = `/admin/reports/${report.id}/resolve`;
    const body = { status: "rejected", note: "The link works" };
    const done = await resolveReport(request(path, { method: "POST", cookie, body }), params({ id: report.id }));
    expect((await readJson<CatalogReport>(done)).status).toBe("rejected");
    const missing = await resolveReport(request(path, { method: "POST", cookie, body: { status: "rejected" } }), params({ id: report.id }));
    expect((await errorOf(missing)).code).toBe("invalid_input");
  });

  it("enqueues catalog research for a state and county", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const res = await enqueueResearch(
      request("/admin/research", { method: "POST", cookie, body: { state: "TX", county: "Maple" } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(204);
    expect(deps().jobs.sent).toContainEqual({ name: "catalog.research", payload: { state: "TX", county: "Maple" } });
    const bad = await enqueueResearch(request("/admin/research", { method: "POST", cookie, body: { state: "Texas" } }), NO_PARAMS);
    expect(bad.status).toBe(400);
  });
});

describe("admin reads (D36)", () => {
  it("reads one listing in any status and pages through listings with filters", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const draft = await factories.scholarship(deps().db, { name: "Maple Draft Award", status: "draft" });
    await factories.scholarship(deps().db, { name: "Cedar Published Grant" });
    const one = await getListing(request(`/admin/scholarships/${draft.id}`, { cookie }), params({ id: draft.id }));
    expect(one.status).toBe(200);
    expect(await readJson<Scholarship>(one)).toMatchObject({ id: draft.id, status: "draft" });
    const missing = "00000000-0000-4000-8000-000000000000";
    expect((await getListing(request(`/admin/scholarships/${missing}`, { cookie }), params({ id: missing }))).status).toBe(404);

    const all = await readJson<Page<Scholarship>>(await listListings(request("/admin/scholarships", { cookie }), NO_PARAMS));
    expect(all).toMatchObject({ page: 1, pageSize: 50, total: 2 });
    const drafts = await readJson<Page<Scholarship>>(
      await listListings(request("/admin/scholarships?status=draft&q=maple", { cookie }), NO_PARAMS),
    );
    expect(drafts.items.map((s) => s.id)).toEqual([draft.id]);
    expect((await listListings(request("/admin/scholarships?page=0", { cookie }), NO_PARAMS)).status).toBe(400);
    expect((await listListings(request("/admin/scholarships?status=gone", { cookie }), NO_PARAMS)).status).toBe(400);

    const student = await signedInStudent(deps().db);
    const asStudent = await getListing(request(`/admin/scholarships/${draft.id}`, { cookie: student.cookie }), params({ id: draft.id }));
    expect(asStudent.status).toBe(404);
    expect((await listListings(request("/admin/scholarships", { cookie: student.cookie }), NO_PARAMS)).status).toBe(404);
  });

  it("reads one catalog task with its payload", async () => {
    const student = await signedInStudent(deps().db);
    await submitLocalScholarship(deps(), userActor(student.user.id, "student"), {
      url: "https://maplerotary.example/local",
      name: "Maple Local Award",
      notes: "",
    });
    const { cookie } = await signedInAdmin(deps().db);
    const [task] = await readJson<CatalogTask[]>(await listTasks(request("/admin/catalog-tasks", { cookie }), NO_PARAMS));
    if (!task) throw new Error("expected a task");
    const one = await getTask(request(`/admin/catalog-tasks/${task.id}`, { cookie }), params({ id: task.id }));
    expect(await readJson<CatalogTask>(one)).toMatchObject({ id: task.id, kind: "user_submission", status: "open" });
    expect((await getTask(request("/admin/catalog-tasks/nope", { cookie }), params({ id: "nope" }))).status).toBe(404);
    const asStudent = await getTask(request(`/admin/catalog-tasks/${task.id}`, { cookie: student.cookie }), params({ id: task.id }));
    expect(asStudent.status).toBe(404);
  });
});

const RATES = { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 };
const RATE_RULE = {
  awardYear: "2027-28",
  key: "federal_loan_rates",
  value: RATES,
  sourceUrl: "https://studentaid.gov/understand-aid/types/loans/interest-rates",
};
const FAFSA = {
  awardYear: "2027-28",
  state: null,
  program: "FAFSA",
  deadline: "2028-06-30",
  note: "",
  sourceUrl: "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines",
};

const putRuleAs = (cookie: string, body: unknown) => putRule(request("/admin/aid-rules", { method: "PUT", cookie, body }), NO_PARAMS);
const putDeadlineAs = (cookie: string, body: unknown) =>
  putDeadline(request("/admin/aid-deadlines", { method: "PUT", cookie, body }), NO_PARAMS);

describe("aid rules and deadlines (R2P-1, MO-09, AID-03)", () => {
  it("PUT /admin/aid-rules upserts loan rates for an award year", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const first = await putRuleAs(cookie, RATE_RULE);
    expect(first.status).toBe(200);
    const rule = await readJson<AidRule>(first);
    expect(rule).toMatchObject({ awardYear: "2027-28", key: "federal_loan_rates", value: RATES, verifiedAt: "2026-10-06T15:00:00.000Z" });
    const again = await readJson<AidRule>(await putRuleAs(cookie, { ...RATE_RULE, value: { ...RATES, parent_plus: 9.08 } }));
    expect(again).toMatchObject({ id: rule.id, value: { ...RATES, parent_plus: 9.08 } });
    expect((await putRuleAs(cookie, { ...RATE_RULE, value: { ...RATES, subsidized: 31 } })).status).toBe(400);
    expect((await putRuleAs(cookie, { ...RATE_RULE, key: "pell_max" })).status).toBe(400);
    const student = await signedInStudent(deps().db);
    expect((await putRuleAs(student.cookie, RATE_RULE)).status).toBe(404);
  });

  it("GET /admin/aid-rules lists rules, optionally for one award year", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    await putRuleAs(cookie, RATE_RULE);
    await putRuleAs(cookie, { ...RATE_RULE, awardYear: "2026-27" });
    const all = await readJson<AidRule[]>(await listRules(request("/admin/aid-rules", { cookie }), NO_PARAMS));
    expect(all.map((r) => r.awardYear).sort()).toEqual(["2026-27", "2027-28"]);
    const one = await readJson<AidRule[]>(await listRules(request("/admin/aid-rules?awardYear=2027-28", { cookie }), NO_PARAMS));
    expect(one.map((r) => r.awardYear)).toEqual(["2027-28"]);
    expect((await listRules(request("/admin/aid-rules?awardYear=2027", { cookie }), NO_PARAMS)).status).toBe(400);
    expect((await listRules(request("/admin/aid-rules"), NO_PARAMS)).status).toBe(401);
  });

  it("PUT /admin/aid-deadlines adds a deadline without an id and edits one with an id", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const created = await putDeadlineAs(cookie, FAFSA);
    expect(created.status).toBe(200);
    const fafsa = await readJson<AidDeadline>(created);
    expect(fafsa).toMatchObject({ awardYear: "2027-28", state: null, program: "FAFSA", deadline: "2028-06-30", note: "" });
    const edit = { ...FAFSA, id: fafsa.id, deadline: "2028-06-29", note: "Check the source" };
    expect(await readJson<AidDeadline>(await putDeadlineAs(cookie, edit))).toMatchObject({
      id: fafsa.id,
      deadline: "2028-06-29",
      note: "Check the source",
    });
    expect((await putDeadlineAs(cookie, { ...FAFSA, id: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
    expect((await putDeadlineAs(cookie, { ...FAFSA, state: "ZZ" })).status).toBe(400);
  });

  it("GET /admin/aid-deadlines lists deadlines by award year, then date", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const fafsa = await readJson<AidDeadline>(await putDeadlineAs(cookie, FAFSA));
    const texas = await readJson<AidDeadline>(
      await putDeadlineAs(cookie, { ...FAFSA, state: "TX", program: "TEXAS Grant priority", deadline: "2027-01-15" }),
    );
    await putDeadlineAs(cookie, { ...FAFSA, awardYear: "2026-27", deadline: "2027-06-30" });
    const year = await readJson<AidDeadline[]>(await listDeadlines(request("/admin/aid-deadlines?awardYear=2027-28", { cookie }), NO_PARAMS));
    expect(year.map((d) => d.id)).toEqual([texas.id, fafsa.id]);
    expect(await readJson<AidDeadline[]>(await listDeadlines(request("/admin/aid-deadlines", { cookie }), NO_PARAMS))).toHaveLength(3);
    const student = await signedInStudent(deps().db);
    expect((await listDeadlines(request("/admin/aid-deadlines", { cookie: student.cookie }), NO_PARAMS)).status).toBe(404);
  });

  it("DELETE /admin/aid-deadlines/:id removes a deadline once", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const fafsa = await readJson<AidDeadline>(await putDeadlineAs(cookie, FAFSA));
    const path = `/admin/aid-deadlines/${fafsa.id}`;
    const id = params({ id: fafsa.id });
    const student = await signedInStudent(deps().db);
    expect((await deleteDeadline(request(path, { method: "DELETE", cookie: student.cookie }), id)).status).toBe(404);
    expect((await deleteDeadline(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
    expect(await readJson<AidDeadline[]>(await listDeadlines(request("/admin/aid-deadlines", { cookie }), NO_PARAMS))).toEqual([]);
    expect((await deleteDeadline(request(path, { method: "DELETE", cookie }), id)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/admin/admin.test.ts`
Expected: FAIL `admin.test.ts` with `Failed to resolve import "./aid-deadlines/[id]/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/admin/catalog-tasks/route.ts`:

```ts
import { query, route } from "@/server/http";
import { listCatalogTasks } from "@scholarcrew/core/admin";
import { CatalogTaskKind, CatalogTaskStatus } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TaskFilter = z.object({ status: CatalogTaskStatus.optional(), kind: CatalogTaskKind.optional() });

export const GET = route({ auth: "admin" }, async ({ deps, actor, url }) => listCatalogTasks(deps, actor, query(url, TaskFilter)));
```

`apps/web/src/app/api/v1/admin/catalog-tasks/[id]/route.ts`:

```ts
import { route } from "@/server/http";
import { getCatalogTask } from "@scholarcrew/core/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// D36: the review page loads one task with its payload; unknown ids are 404.
export const GET = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, params }) =>
  getCatalogTask(deps, actor, params.id),
);
```

`apps/web/src/app/api/v1/admin/catalog-tasks/[id]/resolve/route.ts`:

```ts
import { body, route } from "@/server/http";
import { resolveCatalogTask } from "@scholarcrew/core/admin";
import { CatalogTaskResolution } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, req, params }) =>
  resolveCatalogTask(deps, actor, params.id, await body(req, CatalogTaskResolution)),
);
```

`apps/web/src/app/api/v1/admin/scholarships/route.ts`:

```ts
import { body, json, query, route } from "@/server/http";
import { listScholarships, upsertScholarship } from "@scholarcrew/core/admin";
import { CatalogStatus, ScholarshipUpsertInput } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fieldsOf(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

// D36: every listing in any status, 50 per page, newest edit first; `q` matches name, provider, or slug.
const ListingFilter = z.object({
  status: CatalogStatus.optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const GET = route({ auth: "admin" }, async ({ deps, actor, url }) =>
  listScholarships(deps, actor, query(url, ListingFilter)),
);

// POST always creates: any id in the body is replaced with null. Edits go through PATCH /admin/scholarships/:id.
const CreateListing = z.preprocess((raw) => ({ ...fieldsOf(raw), id: null }), ScholarshipUpsertInput);

export const POST = route({ auth: "admin" }, async ({ deps, actor, req }) =>
  json(await upsertScholarship(deps, actor, await body(req, CreateListing)), 201),
);
```

`apps/web/src/app/api/v1/admin/scholarships/[id]/route.ts`:

```ts
import { body, route } from "@/server/http";
import { getScholarshipForAdmin, upsertScholarship } from "@scholarcrew/core/admin";
import { ScholarshipUpsertInput } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fieldsOf(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

// D36: the editor loads drafts, flagged, and retired listings too (the public detail route hides them).
export const GET = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, params }) =>
  getScholarshipForAdmin(deps, actor, params.id),
);

// The full listing is sent on every edit; the path id wins over any id in the body.
export const PATCH = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, req, params }) => {
  const input = await body(req, z.preprocess((raw) => ({ ...fieldsOf(raw), id: params.id }), ScholarshipUpsertInput));
  return upsertScholarship(deps, actor, input);
});
```

`apps/web/src/app/api/v1/admin/scholarships/[id]/status/route.ts`:

```ts
import { body, route } from "@/server/http";
import { setScholarshipStatus } from "@scholarcrew/core/admin";
import { ScholarshipStatusInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publishing sets the verified date and verifier (AD-02); retire and flag hide the listing everywhere.
export const POST = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, req, params }) => {
  const { status, note } = await body(req, ScholarshipStatusInput);
  return setScholarshipStatus(deps, actor, params.id, status, note);
});
```

`apps/web/src/app/api/v1/admin/reports/route.ts`:

```ts
import { query, route } from "@/server/http";
import { listReports } from "@scholarcrew/core/admin";
import { ReportStatus } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ReportFilter = z.object({ status: ReportStatus.optional() });

export const GET = route({ auth: "admin" }, async ({ deps, actor, url }) =>
  listReports(deps, actor, query(url, ReportFilter).status),
);
```

`apps/web/src/app/api/v1/admin/reports/[id]/resolve/route.ts`:

```ts
import { body, route } from "@/server/http";
import { resolveReport } from "@scholarcrew/core/admin";
import { ResolveReportInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, req, params }) =>
  resolveReport(deps, actor, params.id, await body(req, ResolveReportInput)),
);
```

`apps/web/src/app/api/v1/admin/audit/route.ts`:

```ts
import { query, route } from "@/server/http";
import { searchAudit } from "@scholarcrew/core/admin";
import { AuditQueryParams } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "admin" }, async ({ deps, actor, url }) => searchAudit(deps, actor, query(url, AuditQueryParams)));
```

`apps/web/src/app/api/v1/admin/research/route.ts`:

```ts
import { body, route } from "@/server/http";
import { enqueueResearch } from "@scholarcrew/core/admin";
import { ResearchInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "admin" }, async ({ deps, actor, req }) => {
  await enqueueResearch(deps, actor, await body(req, ResearchInput));
});
```

The three aid routes back 18's `/admin/aid` editor (R2P-1). Production loan rates (MO-09) and aid deadlines (AID-03) are typed in there by an admin; dev reads plan 03's marked sample seed. `PUT` is an upsert, so it answers 200, not 201.

`apps/web/src/app/api/v1/admin/aid-rules/route.ts`:

```ts
import { body, query, route } from "@/server/http";
import { listAidRules, upsertAidRule } from "@scholarcrew/core/admin";
import { AidRuleInput, AwardYear } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AwardYearFilter = z.object({ awardYear: AwardYear.optional() });

// Stored rows whose value doesn't parse as FederalLoanRates are skipped by the core.
export const GET = route({ auth: "admin" }, async ({ deps, actor, url }) => listAidRules(deps, actor, query(url, AwardYearFilter)));

// Upserts on (awardYear, key) and stamps verifiedAt; audited as aid_rule_upserted.
export const PUT = route({ auth: "admin" }, async ({ deps, actor, req }) => upsertAidRule(deps, actor, await body(req, AidRuleInput)));
```

`apps/web/src/app/api/v1/admin/aid-deadlines/route.ts`:

```ts
import { body, query, route } from "@/server/http";
import { listAidDeadlinesForAdmin, upsertAidDeadline } from "@scholarcrew/core/admin";
import { AidDeadlineInput, AwardYear } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AwardYearFilter = z.object({ awardYear: AwardYear.optional() });

// Ordered by award year, then deadline, then program.
export const GET = route({ auth: "admin" }, async ({ deps, actor, url }) =>
  listAidDeadlinesForAdmin(deps, actor, query(url, AwardYearFilter)),
);

// No `id` inserts; an `id` updates that row (unknown id is 404). Audited as aid_deadline_upserted.
export const PUT = route({ auth: "admin" }, async ({ deps, actor, req }) =>
  upsertAidDeadline(deps, actor, await body(req, AidDeadlineInput)),
);
```

`apps/web/src/app/api/v1/admin/aid-deadlines/[id]/route.ts`:

```ts
import { route } from "@/server/http";
import { deleteAidDeadline } from "@scholarcrew/core/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Audited as aid_deadline_deleted; a second delete is 404.
export const DELETE = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, params }) => {
  await deleteAidDeadline(deps, actor, params.id);
});
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/admin/admin.test.ts && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 12 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/admin/admin.test.ts apps/web/src/app/api/v1/admin/catalog-tasks apps/web/src/app/api/v1/admin/scholarships apps/web/src/app/api/v1/admin/reports apps/web/src/app/api/v1/admin/audit apps/web/src/app/api/v1/admin/research apps/web/src/app/api/v1/admin/aid-rules apps/web/src/app/api/v1/admin/aid-deadlines
git commit -m "feat(web): admin review queue, scholarship editor, reports, audit, research, and aid data routes"
```

### N12: College Scorecard CSV import

Per D7 and plan 11, the route parses with `parseScorecardCsvWithErrors`, passes the valid rows to `admin.importColleges`, and returns one `ImportResult` whose `errors` start with the parse errors (CSV line numbers, header is line 1) and whose `skipped` counts the bad data rows too. `importColleges` numbers its own errors 1..n over the rows it was given, so the route maps each one back through the parser's `lines` (`lines[k]` is the CSV line of `rows[k]`): `line: parsed.lines[e.line - 1] ?? e.line`, and every error in the response is a CSV line (R2C-13). A file with no valid rows returns the errors without calling `importColleges`, so no empty import is audited. The body is read through plan 13's `readTextCapped` at 5 MB, so a chunked upload can't grow past that (413). The parser comes from plan 11's `@scholarcrew/catalog/csv` subpath (D-14-4), whose module graph has no `@anthropic-ai/sdk`, so this route's bundle doesn't load the SDK. Plan 13's `transpilePackages` already lists `@scholarcrew/catalog`, which covers its subpaths, so nothing in 13 changes.

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/admin/colleges/import/import.test.ts`:

```ts
import { importColleges } from "@scholarcrew/core/admin";
import { colleges, eq } from "@scholarcrew/db";
import type { ImportResult } from "@scholarcrew/domain";
import { NO_PARAMS, chunkedRequest, errorOf, readJson, request, signedInAdmin, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it, vi } from "vitest";
import { POST as importCsv } from "./route";

// A pass-through spy: every test runs the real importColleges, except where one queues a single result.
// Valid parsed rows never fail CollegeImportRow again, so an import-side error can't be produced from a CSV alone.
// (Vitest 3's restoreAllMocks in 13's setup touches only vi.spyOn spies, so the pass-through survives.)
vi.mock("@scholarcrew/core/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scholarcrew/core/admin")>();
  return { ...actual, importColleges: vi.fn(actual.importColleges) };
});

const deps = useTestDeps();

const HEADER = "UNITID,INSTNM,CITY,STABBR,CONTROL,ADM_RATE,COSTT4_A,NPT4_PUB,NPT4_PRIV";
const CSV = [
  HEADER,
  "100001,Maple State University,Maple City,TX,1,0.6812,24510,12001,NULL",
  "100010,Bad Control College,Austin,TX,9,0.5,30000,NULL,20000",
  "",
].join("\n");

function upload(cookie: string | undefined, text: string, contentType = "text/csv"): Promise<Response> {
  const headers = { "content-type": contentType };
  return importCsv(request("/admin/colleges/import", { method: "POST", cookie, body: text, headers }), NO_PARAMS);
}

describe("POST /admin/colleges/import (AD-03)", () => {
  it("imports the good rows and reports the bad row with its CSV line", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const res = await upload(cookie, CSV);
    expect(res.status).toBe(200);
    const result = await readJson<ImportResult>(res);
    expect(result).toEqual({
      inserted: 1,
      updated: 0,
      skipped: 1,
      errors: [{ line: 3, message: expect.stringMatching(/^control: /) }],
    });
    const [row] = await deps().db.select().from(colleges).where(eq(colleges.id, "100001"));
    expect(row).toMatchObject({ name: "Maple State University", state: "TX", control: "public", costOfAttendanceUsd: 24510 });

    const again = await readJson<ImportResult>(await upload(cookie, CSV));
    expect(again).toMatchObject({ inserted: 0, updated: 1, skipped: 1 });
  });

  it("returns header errors without importing anything", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const result = await readJson<ImportResult>(await upload(cookie, "UNITID,INSTNM\n100001,Maple State University"));
    expect(result).toEqual({
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [
        { line: 1, message: "Missing column STABBR" },
        { line: 1, message: "Missing column CONTROL" },
      ],
    });
    expect(await deps().db.select().from(colleges)).toEqual([]);
  });

  it("rejects bodies that aren't CSV, and answers 413 past 5 MB with or without Content-Length", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const json = await upload(cookie, CSV, "application/json");
    expect(json.status).toBe(400);
    expect((await errorOf(json)).message).toBe("Send the College Scorecard extract as text/csv.");
    const big = await upload(cookie, `${HEADER}\n${"x".repeat(5 * 1024 * 1024)}`);
    expect(big.status).toBe(413);
    expect((await errorOf(big)).message).toBe("The CSV is over 5 MB. Split it and import each part.");
    const { req, pulled } = chunkedRequest("/admin/colleges/import", {
      cookie,
      chunk: new TextEncoder().encode(`${"x".repeat(1023)}\n`.repeat(1024)),
      count: 10,
      headers: { "content-type": "text/csv" },
    });
    expect((await importCsv(req, NO_PARAMS)).status).toBe(413);
    expect(pulled()).toBeLessThan(10);
    expect(await deps().db.select().from(colleges)).toEqual([]);
  });

  it("maps import-side errors back to their CSV lines (R2C-13)", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const csv = [
      HEADER,
      "100001,Maple State University,Maple City,TX,1,0.6812,24510,12001,NULL",
      "100010,Bad Control College,Austin,TX,9,0.5,30000,NULL,20000",
      "100002,Cedar College,Waco,TX,2,0.4,40000,NULL,25000",
      "100003,Pine University,Tyler,TX,1,0.7,22000,11000,NULL",
    ].join("\n");
    // importColleges sees three rows (CSV lines 2, 4, 5) and reports its third row, which is CSV line 5.
    vi.mocked(importColleges).mockResolvedValueOnce({
      inserted: 2,
      updated: 0,
      skipped: 1,
      errors: [{ line: 3, message: "Duplicate UNITID" }],
    });
    const result = await readJson<ImportResult>(await upload(cookie, csv));
    expect(vi.mocked(importColleges).mock.lastCall?.[2].map((r) => r.id)).toEqual(["100001", "100002", "100003"]);
    expect(result).toEqual({
      inserted: 2,
      updated: 0,
      skipped: 2,
      errors: [
        { line: 3, message: expect.stringMatching(/^control: /) },
        { line: 5, message: "Duplicate UNITID" },
      ],
    });
  });

  it("is admin only", async () => {
    expect((await upload(undefined, CSV)).status).toBe(401);
    const { cookie } = await signedInStudent(deps().db);
    expect((await upload(cookie, CSV)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/admin/colleges`
Expected: FAIL `import.test.ts` with `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/admin/colleges/import/route.ts`:

```ts
import { readTextCapped, route } from "@/server/http";
import { parseScorecardCsvWithErrors } from "@scholarcrew/catalog/csv";
import { importColleges } from "@scholarcrew/core/admin";
import { type ImportResult, invalidInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const CSV_TYPES = new Set(["text/csv", "text/plain"]);
const TOO_BIG = "The CSV is over 5 MB. Split it and import each part.";

export const POST = route({ auth: "admin" }, async ({ deps, actor, req }): Promise<ImportResult> => {
  const type = (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!CSV_TYPES.has(type)) throw invalidInput("Send the College Scorecard extract as text/csv.");
  // 413 from a declared Content-Length before reading, or as soon as a chunked body passes 5 MB (D-14-5).
  const text = await readTextCapped(req, MAX_CSV_BYTES, TOO_BIG);

  const parsed = parseScorecardCsvWithErrors(text);
  const badRows = parsed.errors.filter((e) => e.line > 1).length;
  if (parsed.rows.length === 0) {
    return { inserted: 0, updated: 0, skipped: badRows, errors: parsed.errors };
  }
  const result = await importColleges(deps, actor, parsed.rows);
  // importColleges numbers rows 1..n over parsed.rows; parsed.lines[k] is the CSV line of rows[k] (R2C-13).
  const importErrors = result.errors.map((e) => ({ ...e, line: parsed.lines[e.line - 1] ?? e.line }));
  return {
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped + badRows,
    errors: [...parsed.errors, ...importErrors],
  };
});
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/admin/colleges && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 5 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/admin/colleges
git commit -m "feat(web): college scorecard CSV import route with per-line errors"
```

### N13: Scoped helper view

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/helper-view/helper-view.test.ts`:

```ts
import { setDepsForTests } from "@/server/deps";
import { createHelperLink, revokeHelperLink } from "@scholarcrew/core/helpers";
import { TEST_NOW, fixedClock } from "@scholarcrew/core/shared";
import { activities, rateLimits } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type HelperScope, type HelperView, userActor } from "@scholarcrew/domain";
import { errorOf, params, readJson, request, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as helperView } from "./[token]/route";

const deps = useTestDeps();

async function linkFor(scope: HelperScope[]) {
  const { user } = await factories.student(deps().db);
  await deps().db.insert(activities).values({ ownerId: user.id, position: 1, name: "Robotics Club", role: "Captain" });
  const actor = userActor(user.id, "student");
  const created = await createHelperLink(deps(), actor, {
    label: "Ms. Ortiz",
    helperRole: "recommender",
    scope,
    expiresInDays: 30,
  });
  const token = created.url.split("/h/")[1];
  if (!token) throw new Error("expected a /h/<token> url");
  return { token, linkId: created.link.id, actor };
}

function open(token: string, ip = "203.0.113.30"): Promise<Response> {
  return helperView(request(`/helper-view/${token}`, { headers: { "x-forwarded-for": ip } }), params({ token }));
}

describe("GET /helper-view/:token (HL-02, HL-03)", () => {
  it("shows only the sections in the link's scope, without a session", async () => {
    const { token } = await linkFor(["activities", "stories"]);
    const res = await open(token);
    expect(res.status).toBe(200);
    const view = await readJson<HelperView>(res);
    expect(view).toMatchObject({ helperRole: "recommender", label: "Ms. Ortiz", deadlines: null, colleges: null, scholarships: null });
    expect(view.activities?.map((a) => a.name)).toEqual(["Robotics Club"]);
    expect(view.stories).toEqual([]);
  });

  it("is 404 for unknown, expired, and revoked links", async () => {
    expect((await open("not-a-real-token")).status).toBe(404);
    const { token, linkId, actor } = await linkFor(["deadlines"]);
    setDepsForTests({ ...deps(), clock: fixedClock("2026-11-06T15:00:00.000Z") });
    const expired = await open(token);
    expect(expired.status).toBe(404);
    expect((await errorOf(expired)).code).toBe("not_found");
    setDepsForTests(deps());
    expect((await open(token)).status).toBe(200);
    await revokeHelperLink(deps(), actor, linkId);
    expect((await open(token)).status).toBe(404);
  });

  it("limits each IP to 60 views an hour", async () => {
    const { token } = await linkFor(["deadlines"]);
    await deps()
      .db.insert(rateLimits)
      .values({ key: "helper-view:203.0.113.31", windowStart: new Date(TEST_NOW), count: 60 });
    const limited = await open(token, "203.0.113.31");
    expect(limited.status).toBe(429);
    expect((await open(token, "203.0.113.32")).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/helper-view`
Expected: FAIL `helper-view.test.ts` with `Failed to resolve import "./[token]/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/helper-view/[token]/route.ts`:

```ts
import { route } from "@/server/http";
import { getHelperView } from "@scholarcrew/core/helperview";
import { resolveHelperToken } from "@scholarcrew/core/helpers";
import { notFound } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// No account: the token is the credential. Unknown, expired, and revoked links all look the same (404).
export const GET = route<{ token: string }>(
  { auth: "none", rate: { key: "helper-view", limit: 60, windowSeconds: 3600 } },
  async ({ deps, params }) => {
    const helper = await resolveHelperToken(deps, params.token);
    if (!helper) throw notFound("This link has expired or was turned off.");
    return getHelperView(deps, helper);
  },
);
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/helper-view && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 3 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/helper-view
git commit -m "feat(web): scoped helper view route"
```

### N14: Extension data routes with bearer scopes and CORS

The extension's background worker calls these cross-origin (D11). Both routes use `route({ auth: "bearer", cors: "extension" })`, which adds `Access-Control-Allow-Origin` (echoing the `chrome-extension://` origin), `Access-Control-Allow-Headers: Authorization, Content-Type`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Max-Age: 600`, and `Vary: Origin` to every response, errors included, and export `OPTIONS = extensionPreflight`. Bearer auth skips the Origin check (plan 13). The scope check runs before the body is parsed, so a token without the scope always gets 403.

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/extension/save-page/extension.test.ts`:

```ts
import { createApiToken } from "@scholarcrew/core/apitokens";
import { catalogTasks, eq, scholarshipApplications } from "@scholarcrew/db";
import { type ApiTokenScope, type AutofillProfile, type ScholarshipSummary, userActor } from "@scholarcrew/domain";
import { NO_PARAMS, errorOf, readJson, request, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as autofill, OPTIONS as autofillPreflight } from "../autofill-profile/route";
import { OPTIONS as savePreflight, POST as savePage } from "./route";

const deps = useTestDeps();
const EXT = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

async function tokenFor(scopes: ApiTokenScope[]) {
  const { user, cookie } = await signedInStudent(deps().db);
  const created = await createApiToken(deps(), userActor(user.id, "student"), { label: "Chrome", scopes });
  return { user, cookie, headers: { authorization: `Bearer ${created.secret}` } };
}

function save(headers: Record<string, string>, body: unknown): Promise<Response> {
  return savePage(request("/extension/save-page", { method: "POST", origin: EXT, headers, body }), NO_PARAMS);
}

describe("GET /extension/autofill-profile (EX-01)", () => {
  it("returns the profile for an autofill token with CORS for the extension origin", async () => {
    const { headers } = await tokenFor(["autofill"]);
    const res = await autofill(request("/extension/autofill-profile", { origin: EXT, headers }), NO_PARAMS);
    expect(res.status).toBe(200);
    expect(await readJson<AutofillProfile>(res)).toMatchObject({ highSchool: "Maple High School", state: "TX", gpa: 3.72 });
    expect(res.headers.get("access-control-allow-origin")).toBe(EXT);
    expect(res.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type");
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("is 403 without the autofill scope and 401 without a valid token", async () => {
    const saveOnly = await tokenFor(["save_page"]);
    const denied = await autofill(request("/extension/autofill-profile", { origin: EXT, headers: saveOnly.headers }), NO_PARAMS);
    expect(denied.status).toBe(403);
    expect((await errorOf(denied)).code).toBe("forbidden");
    expect(denied.headers.get("access-control-allow-origin")).toBe(EXT);
    expect((await autofill(request("/extension/autofill-profile", { origin: EXT }), NO_PARAMS)).status).toBe(401);
    expect((await autofill(request("/extension/autofill-profile", { cookie: saveOnly.cookie }), NO_PARAMS)).status).toBe(401);
  });
});

describe("POST /extension/save-page (EX-02)", () => {
  it("submits the page as a local scholarship with the selection as notes, and puts it on the board", async () => {
    const { user, headers } = await tokenFor(["save_page"]);
    const body = { url: "https://maplerotary.example/award", title: "Maple Rotary Award", selectedText: "Due March 1" };
    const res = await save(headers, body);
    expect(res.status).toBe(201);
    const summary = await readJson<ScholarshipSummary>(res);
    expect(summary).toMatchObject({ name: "Maple Rotary Award", unverified: true });
    expect(res.headers.get("access-control-allow-origin")).toBe(EXT);
    const [task] = await deps().db.select().from(catalogTasks).where(eq(catalogTasks.kind, "user_submission"));
    expect(task?.payload).toMatchObject({ url: body.url, name: body.title, notes: "Due March 1" });
    // R2C-12: 07 submitLocalScholarship adds one planned application for the submitter, same as the web form.
    const apps = await deps().db.select().from(scholarshipApplications).where(eq(scholarshipApplications.ownerId, user.id));
    expect(apps.map((a) => ({ scholarshipId: a.scholarshipId, stage: a.stage }))).toEqual([
      { scholarshipId: summary.id, stage: "planned" },
    ]);
  });

  it("caps notes at the local submission limit and validates the body", async () => {
    const { headers } = await tokenFor(["save_page"]);
    const long = { url: "https://a.example/s", title: "Long page", selectedText: "n".repeat(1500) };
    expect((await save(headers, long)).status).toBe(201);
    const [task] = await deps().db.select().from(catalogTasks).where(eq(catalogTasks.kind, "user_submission"));
    expect(task?.payload).toMatchObject({ notes: "n".repeat(1000) });
    expect((await save(headers, { url: "https://a.example/s" })).status).toBe(400);
  });

  it("is 403 for a token without save_page, even with a bad body", async () => {
    const { headers } = await tokenFor(["autofill"]);
    expect((await save(headers, {})).status).toBe(403);
  });
});

describe("OPTIONS preflight (D11)", () => {
  it("answers 204 with CORS headers for chrome-extension origins only", async () => {
    for (const preflight of [autofillPreflight, savePreflight]) {
      const ok = preflight(request("/extension/save-page", { method: "OPTIONS", origin: EXT }));
      expect(ok.status).toBe(204);
      expect(ok.headers.get("access-control-allow-origin")).toBe(EXT);
      expect(ok.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
      expect(ok.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type");
      expect(ok.headers.get("access-control-max-age")).toBe("600");
      const web = preflight(request("/extension/save-page", { method: "OPTIONS", origin: "https://evil.example" }));
      expect(web.status).toBe(204);
      expect(web.headers.get("access-control-allow-origin")).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/extension/save-page`
Expected: FAIL `extension.test.ts` with `Failed to resolve import "../autofill-profile/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/extension/autofill-profile/route.ts`:

```ts
import { extensionPreflight, requireScope, route } from "@/server/http";
import { getAutofillProfile } from "@scholarcrew/core/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// EX-01: the extension proposes these values; it never submits a form.
export const GET = route({ auth: "bearer", cors: "extension" }, async (ctx) => {
  requireScope(ctx, "autofill");
  return getAutofillProfile(ctx.deps, ctx.actor);
});

export const OPTIONS = extensionPreflight;
```

`apps/web/src/app/api/v1/extension/save-page/route.ts`:

```ts
import { body, extensionPreflight, json, requireScope, route } from "@/server/http";
import { submitLocalScholarship } from "@scholarcrew/core/scholarships";
import { SavePageInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LocalSubmissionInput.notes allows 1000 characters; a page selection may be up to 2000.
const MAX_NOTES = 1000;

// EX-02: the page becomes a local scholarship submission (SC-07), visible only to the student until reviewed.
// The core also puts it on the student's board as `planned` in the same transaction (R2C-12), so no second call.
export const POST = route({ auth: "bearer", cors: "extension", rate: { key: "scholarships.local", limit: 10, windowSeconds: 86_400 } }, async (ctx) => {
  requireScope(ctx, "save_page");
  const page = await body(ctx.req, SavePageInput);
  const summary = await submitLocalScholarship(ctx.deps, ctx.actor, {
    url: page.url,
    name: page.title,
    notes: page.selectedText.slice(0, MAX_NOTES),
  });
  return json(summary, 201);
});

export const OPTIONS = extensionPreflight;
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web exec vitest run src/app/api/v1/extension/save-page && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 6 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/extension/autofill-profile apps/web/src/app/api/v1/extension/save-page
git commit -m "feat(web): extension autofill and save-page routes with scopes and CORS"
```

### N15: Route inventory, format, and the gate

Config-only task: no new code, only checks over the files N1..N14 created.

- [ ] **Step 1: Format**

Run: `pnpm format`
Expected: Biome rewrites import order and line wrapping where needed and exits 0.

- [ ] **Step 2: Check the route inventory**

Run from the repo root:

```bash
cd apps/web/src/app/api/v1
find scholarships scholarship-applications matches colleges college-list application-items recommenders recommendations essays essay-comments stories test-scores prep service-logs activities verify-hours costs offers offer-lines aid plan plan-items conversations jobs actions public admin helper-view extension/autofill-profile extension/save-page -name route.ts > /tmp/plan14-routes.txt
wc -l < /tmp/plan14-routes.txt | tr -d ' '
while IFS= read -r f; do
  grep -q '^export const runtime = "nodejs";$' "$f" && grep -q '^export const dynamic = "force-dynamic";$' "$f" || echo "missing segment config: $f"
done < /tmp/plan14-routes.txt
tr '\n' '\0' < /tmp/plan14-routes.txt | xargs -0 grep -hoE '^export (const|function|async function) [A-Za-z_]+' | awk '{print $NF}' | sort -u | tr '\n' ' '; echo
cd -
```

The list goes through a file and `read -r` so paths with `[id]` are never glob-expanded or left unsplit (zsh doesn't word-split unquoted variables).

Expected: `81` (77 from round 1 plus `recommendations/[id]`, `admin/aid-rules`, `admin/aid-deadlines`, and `admin/aid-deadlines/[id]` in round 2; `tr` strips the padding macOS `wc` adds), no `missing segment config` lines, and the export names `DELETE GET OPTIONS PATCH POST PUT dynamic runtime` (nothing else, so `next build` accepts every route file).

- [ ] **Step 3: Run the gate**

Run: `pnpm db:up && pnpm db:wait && pnpm db:migrate:test && pnpm --filter @scholarcrew/web typecheck && pnpm --filter @scholarcrew/web test && pnpm lint`
Expected: `tsc --noEmit` prints nothing; Vitest prints the package totals `Test Files 27 passed (27)` and `Tests 212 passed (212)` (plan 13's 13 files and 117 tests plus this plan's 14 files and 95 tests); `biome check .` reports no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/v1
git commit -m "chore(web): format pipeline routes"
```

Skip the commit when `git status --short apps/web/src/app/api/v1` prints nothing.

## Success Criteria

- [ ] `pnpm --filter @scholarcrew/web typecheck` exits 0.
- [ ] `pnpm db:up && pnpm db:wait && pnpm db:migrate:test && pnpm --filter @scholarcrew/web test` exits 0 with `Test Files 27 passed (27)` and `Tests 212 passed (212)`: this plan's 14 files (95 tests) on top of plan 13's 13 files (117 tests).
- [ ] `pnpm lint` exits 0.
- [ ] The N15 inventory prints `81`, no missing segment config, and only HTTP method names plus `dynamic` and `runtime` as route exports.
- [ ] `grep -rn 'from "@scholarcrew/catalog"' apps/web/src/app/api/v1` prints nothing (the CSV import uses `@scholarcrew/catalog/csv`, D-14-4).
- [ ] `grep -rn "process.env" apps/web/src/app/api/v1/{scholarships,scholarship-applications,matches,colleges,college-list,application-items,recommenders,recommendations,essays,essay-comments,stories,test-scores,prep,service-logs,activities,verify-hours,costs,offers,offer-lines,aid,plan,plan-items,conversations,jobs,actions,public,admin,helper-view} apps/web/src/app/api/v1/extension/autofill-profile apps/web/src/app/api/v1/extension/save-page` prints nothing.

## Testing Requirements

Command: `pnpm db:up && pnpm db:wait && pnpm db:migrate:test && pnpm --filter @scholarcrew/web test`. Expected: `Test Files 27 passed (27)`, `Tests 212 passed (212)` (this plan: 14 files, 95 tests; scholarships 9, colleges 10, essays 8, prep 5, impact 6, money 8, aid 3, plan 5, crew 9, events 6, admin 12, import 5, helper view 3, extension 6).

What the 14 files prove, per route group:

- Happy path through the real core services and the test database for every route in section 10 with owner 14, with the status codes from the rules above (201 creates, 202 job starts, 204 empty).
- Validation: each group sends at least one body or query that fails its domain schema and gets 400 `invalid_input` (bad page, state, `openOn`, week, room kind, card id, job filters, listing filters, CSV type).
- Allowance (CR-10): each job-starting route (`/essays/:id/review`, `/prep/retake`, `/offers/:id/appeal`, `/plan/regenerate`, `/conversations/:id/messages`) returns 402 `limit_reached` once the month's allowance is used and enqueues nothing; the crew send also saves no message.
- Body caps: the public offer tool and verify-hours POST answer 413 past 64 KB, and the CSV import answers 413 past 5 MB whether the size is declared or the body is chunked (it stops reading early).
- Isolation (SE-01): another student gets 404 on essays, stories, comments, college entries, application items, recommender requests, service logs, activities, test scores, offers, offer lines, appeals, plan items, aid items, conversations, jobs, and action cards; `GET /recommendations` and `GET /jobs` list only the caller's own rows.
- Family shares: a parent reads matches, the college list, service logs, progress, costs, aid checklists, and This Week through `?studentId=`; turning off `colleges` or `deadlines` sharing turns the read into 404; essays (off by default) are 404; test scores stay owner-only.
- Admin routes: 401 signed out, 404 for students, and working queue, editor, reports, audit, research, and CSV import for admins; one listing in any status, the paged listing list with `status`/`q` filters, and one catalog task (D36); loan rates upsert by award year and list with an `awardYear` filter, and aid deadlines insert, edit (unknown id 404), list in date order, and delete once (R2P-1).
- New reads: `GET /jobs` newest first with `active` and `limit` (D28); `GET /recommendations` newest first with `helperLinkId` (D33); offers carry `parseJobId` (D31); a report by slug resolves to the listing (D-14-3); `openOn` reaches the search (F-18-3).
- Round 2 writes: `PATCH /recommendations/:id` moves a request to confirmed or submitted and refuses `requested` (R2P-11); `PATCH /essays/:id` sets status and title and refuses `{}` (R2P-14); `DELETE /offers/:id` removes an unconfirmed letter with its lines and is 409 for a confirmed one (R2P-8); all three are 404 for another student.
- Rate limits: `crew-send` per user, `offer-tool`, `helper-view`, and `verify-hours` per IP return 429 `rate_limited` past the limit, and a different IP is unaffected.
- SSE: the stream sends the current job, then a frame per status or progress change, then `event: end` with `{}` on a terminal status or at the (shortened) timeout; a client abort stops it with no end frame; unknown jobs are 404 JSON before any stream opens; the headers are `text/event-stream; charset=utf-8`, `no-cache, no-transform`, `keep-alive`, and `X-Accel-Buffering: no`, with no `Content-Encoding` (R3E-1); a job that never changes gets `: ping` comments at the (shortened) ping interval, and the test parser drops comment blocks (R3E-2).
- CSV import: one good row inserts, one bad row comes back as `{ line: 3, message: "control: ..." }` with `skipped: 1`, a re-import updates, an import-side error on the third valid row after one bad line reports CSV line 5 (R2C-13), header problems import nothing, non-CSV bodies are 400 and over-5 MB bodies are 413.
- Extension: a saved page leaves exactly one `planned` application for the student (R2C-12); preflight and responses carry CORS headers only for `chrome-extension://` origins; a token missing the route's scope gets 403 `forbidden` before the body is read; cookies don't authenticate bearer routes.
- The college list over 25 returns 400 `invalid_input` with the core's message (D5).

## Review Checklist

- [ ] Every route in section 10 with owner 14 exists at the path in the Files list, with the auth mode from section 10 (`optional` for scholarship search and detail, `none` for the offer tool, helper view, and verify-hours, `admin` for `/admin/*`, `bearer` for the two extension routes, `user` for the rest).
- [ ] Every route calls exactly the core function section 9.4 names for it, with the actor from `route()`, and never touches `@scholarcrew/db` directly.
- [ ] Bodies use the domain schema named in section 10; the only local schemas are URL query parsers (`week`, job, task, listing, report, and award-year filters) and `{ scholarshipId }` for saving to the board. `?studentId=` always goes through 13's `studentIdParam`; no route copies it.
- [ ] Path ids win over body ids (`report`, `PATCH /admin/scholarships/:id`), the report route resolves a slug to the listing id first, and `POST /admin/scholarships` always creates.
- [ ] Job-starting routes (`/essays/:id/review`, `/prep/retake`, `/offers/:id/appeal`, `/plan/regenerate`, `/conversations/:id/messages`) return 202, and each has a 402 test that asserts nothing was enqueued.
- [ ] No route calls `req.text()`, `req.json()`, or `req.formData()`: JSON goes through `body()` (with `PUBLIC_BODY_LIMIT` on the two `none` routes that take one) and the CSV through `readTextCapped`.
- [ ] The SSE route opens the stream only after `getJob` succeeds, polls with `deps` and the request's actor, stops on `request.signal` abort and on stream cancel, and never writes after close.
- [ ] `SSE_HEADERS` has `cache-control: no-cache, no-transform` and `x-accel-buffering: no` and no `content-encoding`; `SSE_PING` goes out only after a poll with no change and `pingMs` of quiet. Buffering under `next start` and the deploy proxy is checked at execution (N10 library note).
- [ ] `setJobEventTimingForTests` is called only from `events.test.ts`, and every test that changes timing restores it in `afterEach`.
- [ ] The CSV import never passes header-error files to `importColleges`, caps the body at 5 MB through `readTextCapped` (413), and reports every error in CSV line numbers: parse errors as the parser gives them, import errors remapped through `parsed.lines` (R2C-13).
- [ ] The CSV import imports `parseScorecardCsvWithErrors` from `@scholarcrew/catalog/csv`, never the package root (D-14-4).
- [ ] The helper view and verify-hours routes return the same 404 for unknown, expired, and used or revoked tokens.
- [ ] Extension routes check the scope before parsing the body, set CORS only for extension origins, and export `OPTIONS`.
- [ ] Round 2 routes match section 10: `PATCH /recommendations/:id` (`RecRequestPatch`), `PATCH /essays/:id` (`EssayPatch`), `DELETE /offers/:id` (204), and the admin aid routes (`PUT` upserts answer 200). The CSV import maps import errors through `parsed.lines`, and `save-page` makes no `saveScholarship` call because 07 adds the board row (R2C-12).
- [ ] No route file reads `process.env`, logs request bodies, or exports anything besides HTTP methods, `runtime`, and `dynamic`.
