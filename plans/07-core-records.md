# Plan 07: Core records (Agent G)

The record services inside `@scholarcrew/core`: the scholarship catalog as students see it (search, detail, matching with reasons, the board, outcomes, local submissions, reports, the weekly sweep), the college list with application items and recommenders, Essay Studio data (versions with optimistic saves, Quill comments anchored to exact quotes, the Story Bank and reuse checks), test scores and retake value, service hours with supervisor verification, the activities list, and the scoped helper view. Every function takes `(deps, actor, ...)`, checks access first through plan 06's `access` module, and returns domain objects from `@scholarcrew/domain`. Feature IDs: SC-01..SC-10 (service side), ES-01, ES-02, ES-04 (comment storage), ES-05, ES-07, CO-01..CO-07, PR-01..PR-05, IM-01..IM-04, HL-02, HL-03, PU-02, ME-07.

Read first: `00-overview.md` §3, §8, §9.4 (the "Plan 07 modules" table is the contract), `02-domain.md`, and `03-database.md` (tables, `factories`, `pgErrorCode`).

**Dependencies by contract (plan 06, imported relatively inside `packages/core/src`):**

- `../access`: `assertUser` and `assertSystem` (assertion functions), `assertOwner` (owner user or system, else `not_found`), `assertCanRead` (system, owner, sharing parent, or in-scope helper, else `not_found`), `isOwner`.
- `../shared`: `CoreDeps`, `createTestDeps` (test DB, memory jobs, `appUrl` `http://localhost:3000`; accepts `clock` and `email` overrides), `fixedClock`, `currentSeason`, `toIso`, `toIsoOrNull`, `requireUuid` (non-UUID path ids become `not_found` instead of a Postgres cast error), `todayIn` (the one core copy, R3V-9), `calendarShort` and `instantInZone` (message dates, R3E-8).
- `@scholarcrew/domain`: `awardYearFor` (R3V-7). `@scholarcrew/engines`: `formatUsd` (the one money formatter, R3V-5).
- `../memory`: `readSensitiveForMatcher`, `setSensitiveFact` (tests only).
- `../notifications`: `notify`. `../billing`: `assertCrewAllowance`. `../helpers`: `createHelperLink`. `../crypto`: `randomToken`, `sha256Hex`. `../audit`: `recordAudit`.
- Plan 06 owns `packages/core/package.json`, `vitest.config.ts`, and `test/setup.ts` (runs `resetDb(getTestDb())` before each test), so tests here never reset the database themselves.

**Access rules used everywhere in this plan.** A `system` actor reads anything (worker paths). Other reads go through `assertCanRead(deps, actor, ownerId, category)` with these categories: scholarships and matches → `scholarships`; college list and items → `colleges`; essays and comments → `essays`; stories → `stories`; activities and service logs → `activities`. Test scores and recommenders are owner only (`assertOwner`). Every write is owner only. Not-yours is always `not_found`.

## Files

Create (all under `packages/core/src/`):

- `scholarships/common.ts`: shared helpers for all six modules (`requireUser`, `assertReadable`, `assertOwnerOrSystem`, `readsAsOwner`, `seesSensitiveReasons`, `addDays`, `monthOf`, `firstRow`, `escapeLike`, `isUuid`, `hoursFromMinutes`, `userTimeZone`, `firstName`)
- `scholarships/labels.ts`: `slugify` (`STATE_NAMES` and `localLabel` come from `@scholarcrew/domain`, D41)
- `scholarships/mappers.ts`: `toScholarship`, `toSummary`, `toApplication`, `toPlanItem`, `toCrewJob`, `isStale`
- `scholarships/testkit.ts`: test setup helpers (`setup`, `makeStudent`, `makeParentOf`, `setShare`, `NOW`)
- `scholarships/search.ts`: `searchScholarships`, `getScholarship`, `visibleListingWhere`, `liveListingWhere`
- `scholarships/matching.ts`: `buildMatcherProfile`, `listMatches`, `evaluateForStudent`, `matchListingFor`, `reusableStoryIds`
- `scholarships/sweep.ts`: `runSweep`, `lastSweep`
- `scholarships/board.ts`: `getBoard`, `saveScholarship`, `updateApplication`, `RETIRED_TEXT`, `UNDER_REVIEW_TEXT`
- `scholarships/submissions.ts`: `submitLocalScholarship`, `reportListing`
- `scholarships/index.ts`
- `colleges/mappers.ts`, `colleges/catalog.ts`, `colleges/list.ts`, `colleges/items.ts`, `colleges/recommenders.ts`, `colleges/index.ts`
- `essays/mappers.ts`, `essays/quotes.ts`, `essays/essays.ts`, `essays/review.ts`, `essays/stories.ts`, `essays/index.ts`
- `prep/prep.ts`, `prep/index.ts`
- `impact/mappers.ts`, `impact/service.ts`, `impact/verification.ts`, `impact/activities.ts`, `impact/index.ts`
- `helperview/view.ts`, `helperview/index.ts`

Test:

- `scholarships/common.test.ts`, `scholarships/search.test.ts`, `scholarships/matching.test.ts`, `scholarships/sweep.test.ts`, `scholarships/board.test.ts`, `scholarships/submissions.test.ts`
- `colleges/catalog.test.ts`, `colleges/list.test.ts`, `colleges/items.test.ts`
- `essays/quotes.test.ts`, `essays/essays.test.ts`, `essays/review.test.ts`, `essays/stories.test.ts`
- `prep/prep.test.ts`
- `impact/service.test.ts`, `impact/activities.test.ts`
- `helperview/view.test.ts`

Modify: nothing outside `packages/core/src/{scholarships,colleges,essays,prep,impact,helperview}/**`.

Every test file runs with plan 06's Vitest config (`fileParallelism: false`, `TEST_DATABASE_URL`). The fixed clock is `2026-10-06T15:00:00.000Z` (a Tuesday; 10:00 in `America/Chicago`), so `currentSeason` is `"2026-27"`, the student's week starts `2026-10-05`, and today is `2026-10-06`.

## Tasks

### G1: Shared helpers, labels, mappers, and the test kit

- [ ] **Step 1: Write the failing test**

`packages/core/src/scholarships/common.test.ts`:

```ts
import { localLabel } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { addDays, escapeLike, firstName, hoursFromMinutes, isUuid, monthOf } from "./common";
import { slugify } from "./labels";
import { isStale } from "./mappers";

// `todayIn` is 06's shared copy (R3V-9); its test lives in `shared/shared.test.ts`.
describe("calendar helpers", () => {
  it("adds days across month ends and reads the month", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-10-06", -6)).toBe("2026-09-30");
    expect(monthOf("2026-10-06")).toBe("2026-10");
  });
});

describe("labels", () => {
  it("labels national, state, county, and city listings", () => {
    expect(localLabel({ national: true, state: null, counties: [], cities: [] })).toBe("National");
    expect(localLabel({ national: false, state: "TX", counties: [], cities: [] })).toBe("Texas");
    expect(localLabel({ national: false, state: "TX", counties: ["Maple"], cities: [] })).toBe("Maple County, TX");
    expect(localLabel({ national: false, state: "TX", counties: ["Maple County"], cities: [] })).toBe("Maple County, TX");
    expect(localLabel({ national: false, state: "TX", counties: [], cities: ["Cedar Park"] })).toBe("Cedar Park, TX");
  });

  it("slugifies names", () => {
    expect(slugify("Maple County Rotary Club — STEM Award!")).toBe("maple-county-rotary-club-stem-award");
    expect(slugify("Beca Fundación Niños")).toBe("beca-fundacion-ninos");
    expect(slugify("!!!")).toBe("scholarship");
  });
});

describe("small helpers", () => {
  it("escapes LIKE wildcards, checks UUIDs, converts minutes, reads first names", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(isUuid("00000000-0000-4000-8000-000000000000")).toBe(true);
    expect(isUuid("maple-rotary")).toBe(false);
    expect(hoursFromMinutes(90)).toBe(1.5);
    expect(hoursFromMinutes(100)).toBe(1.7);
    expect(firstName("Maya Reyes")).toBe("Maya");
    expect(firstName("  ")).toBe("A student");
  });

  it("treats stale status or a verification older than 30 days as stale", () => {
    const now = new Date("2026-10-06T15:00:00.000Z");
    expect(isStale({ status: "stale", verifiedAt: now }, now)).toBe(true);
    expect(isStale({ status: "published", verifiedAt: new Date("2026-09-01T00:00:00.000Z") }, now)).toBe(true);
    expect(isStale({ status: "published", verifiedAt: new Date("2026-09-20T00:00:00.000Z") }, now)).toBe(false);
    expect(isStale({ status: "published", verifiedAt: null }, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/scholarships/common.test.ts`
Expected: FAIL with `Failed to resolve import "./common" from "src/scholarships/common.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/scholarships/common.ts`:

```ts
import { type Db, eq, users } from "@scholarcrew/db";
import {
  type Actor,
  AppError,
  type IsoDate,
  type ShareCategory,
  type SystemActor,
  type UserActor,
  forbidden,
  unauthenticated,
} from "@scholarcrew/domain";
import { assertCanRead, assertOwner, assertSystem, assertUser, getShareGrants, isOwner } from "../access";
import { type CoreDeps, safeTimeZone } from "../shared";

/** Narrows the actor to a signed-in user (works whether assertUser asserts or returns). */
export function requireUser(actor: Actor): UserActor {
  assertUser(actor);
  if (actor.kind !== "user") throw forbidden();
  return actor;
}

/** Narrows the actor to the worker's system actor (works whether assertSystem asserts or returns). */
export function requireSystem(actor: Actor): SystemActor {
  assertSystem(actor);
  if (actor.kind !== "system") throw forbidden();
  return actor;
}

/** System actors read anything; everyone else goes through the share-aware access check. */
export async function assertReadable(
  deps: CoreDeps,
  actor: Actor,
  ownerId: string,
  category: ShareCategory,
): Promise<void> {
  if (actor.kind === "system") return;
  await assertCanRead(deps, actor, ownerId, category);
}

export function assertOwnerOrSystem(actor: Actor, ownerId: string): void {
  if (actor.kind === "system") return;
  assertOwner(actor, ownerId);
}

/** True for the owner and the worker; false for parents and helpers. */
export function readsAsOwner(actor: Actor, ownerId: string): boolean {
  return actor.kind === "system" || isOwner(actor, ownerId);
}

/** Private matching reasons belong to the student alone. System matcher reads remain internal. */
export async function seesSensitiveReasons(_deps: CoreDeps, actor: Actor, ownerId: string): Promise<boolean> {
  return readsAsOwner(actor, ownerId);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthOf(date: IsoDate): string {
  return date.slice(0, 7);
}

export function firstRow<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new AppError("internal", `No ${what} row returned`);
  return row;
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** Minutes to hours, one decimal place. */
export function hoursFromMinutes(minutes: number): number {
  return Math.round(minutes / 6) / 10;
}

export async function userTimeZone(db: Db, userId: string): Promise<string> {
  const [row] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, userId));
  return safeTimeZone(row?.timeZone ?? "America/Chicago");
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "A student";
}
```

`packages/core/src/scholarships/labels.ts` (`STATE_NAMES` and `localLabel` live in `@scholarcrew/domain` `geo.ts`, review-log D41, so plan 18 can share them):

```ts
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "scholarship";
}
```

`packages/core/src/scholarships/mappers.ts`:

```ts
import type { crewJobs, planItems, scholarshipApplications, scholarships } from "@scholarcrew/db";
import {
  type CrewJob,
  type PlanItem,
  type Scholarship,
  type ScholarshipApplication,
  type ScholarshipSummary,
  localLabel,
} from "@scholarcrew/domain";
import { toIso, toIsoOrNull } from "../shared";

export type ScholarshipRow = typeof scholarships.$inferSelect;
export type ApplicationRow = typeof scholarshipApplications.$inferSelect;

export const STALE_AFTER_DAYS = 30;

export function isStale(row: Pick<ScholarshipRow, "status" | "verifiedAt">, now: Date): boolean {
  if (row.status === "stale") return true;
  if (!row.verifiedAt) return false;
  return now.getTime() - row.verifiedAt.getTime() > STALE_AFTER_DAYS * 86_400_000;
}

export function toScholarship(row: ScholarshipRow, viewerId?: string): Scholarship {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    provider: row.provider,
    url: row.url,
    sourceUrl: row.sourceUrl,
    amountMinUsd: row.amountMinUsd,
    amountMaxUsd: row.amountMaxUsd,
    renewable: row.renewable,
    renewalTerms: row.renewalTerms,
    deadline: row.deadline,
    cycle: row.cycle,
    localArea: row.localArea,
    eligibility: row.eligibility,
    requirements: row.requirements,
    status: row.status,
    visibility: row.visibility,
    submittedById: viewerId === row.submittedById ? row.submittedById : null,
    scamFlags: row.scamFlags,
    estMinutes: row.estMinutes,
    verifiedAt: toIsoOrNull(row.verifiedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toSummary(row: ScholarshipRow): ScholarshipSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    provider: row.provider,
    amountMinUsd: row.amountMinUsd,
    amountMaxUsd: row.amountMaxUsd,
    renewable: row.renewable,
    deadline: row.deadline,
    localLabel: localLabel(row.localArea),
    status: row.status,
    verifiedAt: toIsoOrNull(row.verifiedAt),
    scamFlags: row.scamFlags,
    unverified: row.verifiedAt === null || row.visibility === "submitter_only",
    estMinutes: row.estMinutes,
  };
}

export function toApplication(row: ApplicationRow): ScholarshipApplication {
  return {
    id: row.id,
    scholarshipId: row.scholarshipId,
    stage: row.stage,
    matchReasons: row.matchReasons,
    fitScore: row.fitScore,
    estMinutes: row.estMinutes,
    submittedAt: toIsoOrNull(row.submittedAt),
    outcomeUsd: row.outcomeUsd,
    outcomeRenewable: row.outcomeRenewable,
    outcomeAt: toIsoOrNull(row.outcomeAt),
    thankYouSent: row.thankYouSent,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toPlanItem(row: typeof planItems.$inferSelect): PlanItem {
  return {
    id: row.id,
    weekStart: row.weekStart,
    title: row.title,
    kind: row.kind,
    refType: row.refType,
    refId: row.refId,
    minutes: row.minutes,
    valueUsd: row.valueUsd,
    dueOn: row.dueOn,
    status: row.status,
    contributors: row.contributors,
    priority: row.priority,
    createdAt: toIso(row.createdAt),
    completedAt: toIsoOrNull(row.completedAt),
  };
}

export function toCrewJob(row: typeof crewJobs.$inferSelect): CrewJob {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    conversationId: row.conversationId,
    requestMessageId: row.requestMessageId,
    resultMessageId: row.resultMessageId,
    refId: row.refId,
    progress: row.progress,
    error: row.error,
    safety: row.safety ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}
```

`packages/core/src/scholarships/testkit.ts` (imported only by `*.test.ts` files in this plan's folders):

```ts
import { and, eq, shareSettings } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type ShareCategory, userActor } from "@scholarcrew/domain";
import { type CoreDeps, createTestDeps, fixedClock } from "../shared";

export const NOW = "2026-10-06T15:00:00.000Z";
export type Mail = { to: string; subject: string; text: string };

/** Test deps with a fixed clock and an in-memory mailbox. */
export function setup() {
  const clock = fixedClock(NOW);
  const mails: Mail[] = [];
  const deps = createTestDeps({
    clock,
    email: {
      send: async (m) => {
        mails.push(m);
      },
    },
  });
  return { deps, clock, mails };
}

export async function makeStudent(deps: CoreDeps, o: Parameters<typeof factories.student>[1] = {}) {
  const { user, profile } = await factories.student(deps.db, o);
  return { user, profile, actor: userActor(user.id, "student") };
}

/** A parent in one family with the student; share settings start at DEFAULT_SHARED. */
export async function makeParentOf(deps: CoreDeps, studentId: string) {
  const parent = await factories.parent(deps.db);
  const family = await factories.family(deps.db, { studentIds: [studentId], parentIds: [parent.id] });
  return { parent, family, actor: userActor(parent.id, "parent") };
}

export async function setShare(deps: CoreDeps, studentId: string, category: ShareCategory, enabled: boolean) {
  await deps.db
    .update(shareSettings)
    .set({ enabled })
    .where(and(eq(shareSettings.studentId, studentId), eq(shareSettings.category, category)));
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/scholarships/common.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scholarships/common.ts packages/core/src/scholarships/common.test.ts packages/core/src/scholarships/labels.ts packages/core/src/scholarships/mappers.ts packages/core/src/scholarships/testkit.ts
git commit -m "feat(core): shared record helpers, listing labels, and mappers"
```

### G2: Scholarship search, detail, and the public state directory

Visibility: a signed-in user sees `published` and `stale` public listings plus their own `submitter_only` submissions (any of `draft`, `published`, `stale`). Public and helper actors see `published` public listings only. `flagged` and `retired` never appear. Search keeps scam-flagged published listings for signed-in users (the summary carries `scamFlags` so the UI shows the reason) unless `excludeScams` is set; public-actor searches (the state directory is one) and matching always drop them, in SQL, so totals and pages stay right (review-log D39). `getScholarship` also drops them for the public actor, so a flagged listing is `not_found` by slug or id when signed out, while a signed-in student still opens it and sees the flag (R2P-19).

`liveListingWhere(ownerId)` is the test every open-plan reader shares (R2P-4): the listing has no scam flags and is either a public `published`/`stale` listing or `ownerId`'s own `submitter_only` submission in `draft`, `published`, or `stale`. `ownerId` is a user id or a column (for example `scholarshipApplications.ownerId`), so 07's board and requirement progress and 08's deadlines, reminders, and pending money apply one rule to open applications. It's exported from `@scholarcrew/core/scholarships`.

Filters: `q` matches name or provider (case-insensitive); `state` keeps listings whose `localArea.state` equals it; `local` keeps non-national listings in the actor's profile state whose county list is empty or contains the profile county (ignored without a profile state; a non-user actor gets `invalid_input` because only a student has a profile, so the crew port can't silently widen a local search); `renewable`; `minUsd` compares against `amountMaxUsd`; `deadlineBefore` keeps deadlines on or before the date; `openOn` keeps listings still open on that date (`deadline is null or deadline >= openOn`, in SQL, so totals and pages stay right; F-18-3). Order: deadline ascending with nulls last, then name, for every query, so with `openOn` set the soonest open deadline comes first and undated listings come last. Callers pass `openOn` themselves: 17 with the student's today, and 18's state directory page with today in Central (F-18-4). The old UTC-only `listPublicByState` is gone (R3V-9).

- [ ] **Step 1: Write the failing test**

`packages/core/src/scholarships/search.test.ts`:

```ts
import { factories } from "@scholarcrew/db/testing";
import { PUBLIC_ACTOR, type ScholarshipQuery, userActor } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { getScholarship, searchScholarships } from "./search";
import { makeStudent, setup } from "./testkit";

const Q = (o: Partial<ScholarshipQuery> = {}): ScholarshipQuery => ({ page: 1, pageSize: 20, ...o });
const TX = (counties: string[] = []) => ({ national: false, state: "TX" as const, counties, cities: [] });

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  const { db } = ctx.deps;
  student = await makeStudent(ctx.deps, { state: "TX", county: "Maple" });
  const other = await makeStudent(ctx.deps);
  await factories.scholarship(db, { name: "Alpha National", slug: "alpha-national", deadline: "2026-11-01" });
  await factories.scholarship(db, {
    name: "Bravo Texas",
    localArea: TX(),
    deadline: "2026-10-20",
    renewable: true,
    amountMaxUsd: 5000,
  });
  await factories.scholarship(db, { name: "Charlie Maple", localArea: TX(["Maple"]), deadline: null });
  await factories.scholarship(db, { name: "Delta Cedar", localArea: TX(["Cedar"]) });
  await factories.scholarship(db, { name: "Echo Stale", status: "stale" });
  await factories.scholarship(db, { name: "Flagged One", status: "flagged" });
  await factories.scholarship(db, { name: "Retired One", status: "retired" });
  await factories.scholarship(db, { name: "Draft One", status: "draft" });
  await factories.scholarship(db, {
    name: "Foxtrot Own",
    slug: "foxtrot-own",
    status: "draft",
    visibility: "submitter_only",
    submittedById: student.user.id,
    verifiedAt: null,
    deadline: null,
  });
  await factories.scholarship(db, {
    name: "Other Student Draft",
    slug: "other-draft",
    status: "draft",
    visibility: "submitter_only",
    submittedById: other.user.id,
  });
});

const names = (page: { items: Array<{ name: string }> }) => page.items.map((s) => s.name);

describe("searchScholarships", () => {
  it("shows the public only published public listings, deadline first with nulls last", async () => {
    const page = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q());
    expect(names(page)).toEqual(["Bravo Texas", "Alpha National", "Delta Cedar", "Charlie Maple"]);
    expect(page.total).toBe(4);
  });

  it("adds stale listings and the student's own submissions, never flagged, retired, or others' drafts", async () => {
    const page = await searchScholarships(ctx.deps, student.actor, Q());
    expect(names(page)).toEqual([
      "Bravo Texas",
      "Alpha National",
      "Delta Cedar",
      "Echo Stale",
      "Charlie Maple",
      "Foxtrot Own",
    ]);
    const own = page.items.find((s) => s.name === "Foxtrot Own");
    expect(own?.unverified).toBe(true);
    const maple = page.items.find((s) => s.name === "Charlie Maple");
    expect(maple).toMatchObject({ localLabel: "Maple County, TX", unverified: false });
    expect(page.items.find((s) => s.name === "Bravo Texas")?.localLabel).toBe("Texas");
    expect(page.items.find((s) => s.name === "Alpha National")?.localLabel).toBe("National");
  });

  it("applies text, state, local, renewable, amount, and deadline filters", async () => {
    const run = async (o: Partial<ScholarshipQuery>) => names(await searchScholarships(ctx.deps, student.actor, Q(o)));
    expect(await run({ q: "MAPLE" })).toEqual(["Charlie Maple"]);
    expect(await run({ state: "TX" })).toEqual(["Bravo Texas", "Delta Cedar", "Charlie Maple"]);
    expect(await run({ local: true })).toEqual(["Bravo Texas", "Charlie Maple"]);
    expect(await run({ renewable: true })).toEqual(["Bravo Texas"]);
    expect(await run({ minUsd: 2000 })).toEqual(["Bravo Texas"]);
    expect(await run({ deadlineBefore: "2026-11-01" })).toEqual(["Bravo Texas", "Alpha National"]);
    expect(await run({ q: "100%_" })).toEqual([]);
    await expect(searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ local: true }))).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("drops scam-flagged listings in SQL when excludeScams is set, and always for the public", async () => {
    await factories.scholarship(ctx.deps.db, {
      name: "Golf Scam",
      localArea: TX(),
      scamFlags: ["application_fee"],
      deadline: "2026-10-10",
    });
    expect(names(await searchScholarships(ctx.deps, student.actor, Q()))[0]).toBe("Golf Scam");
    const clean = await searchScholarships(ctx.deps, student.actor, Q({ excludeScams: true }));
    expect(names(clean)).not.toContain("Golf Scam");
    expect(clean.total).toBe(6);
    const pub = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ pageSize: 3 }));
    expect(names(pub)).toEqual(["Bravo Texas", "Alpha National", "Delta Cedar"]);
    expect(pub.total).toBe(4);
  });

  it("paginates with a stable total", async () => {
    const page = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ page: 2, pageSize: 3 }));
    expect(names(page)).toEqual(["Charlie Maple"]);
    expect(page).toMatchObject({ page: 2, pageSize: 3, total: 4 });
  });

  it("drops listings whose deadline is before openOn in SQL, keeping same-day and undated ones", async () => {
    await factories.scholarship(ctx.deps.db, { name: "Hotel Past", localArea: TX(), deadline: "2026-09-30" });
    await factories.scholarship(ctx.deps.db, { name: "India Today", deadline: "2026-10-06" });
    const all = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q());
    expect(names(all)[0]).toBe("Hotel Past");
    expect(all.total).toBe(6);
    const open = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ openOn: "2026-10-06" }));
    expect(names(open)).toEqual(["India Today", "Bravo Texas", "Alpha National", "Delta Cedar", "Charlie Maple"]);
    expect(open.total).toBe(5);
    const next30 = await searchScholarships(
      ctx.deps,
      PUBLIC_ACTOR,
      Q({ openOn: "2026-10-06", deadlineBefore: "2026-11-05" }),
    );
    expect(names(next30)).toEqual(["India Today", "Bravo Texas", "Alpha National"]);
    const texas = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ state: "TX", openOn: "2026-10-06" }));
    expect(names(texas)).not.toContain("Hotel Past");
    expect(texas.total).toBe(3);
  });

  it("sorts openOn results by deadline ascending with undated listings last, across pages", async () => {
    await factories.scholarship(ctx.deps.db, { name: "Juliet Late", deadline: "2027-01-15" });
    await factories.scholarship(ctx.deps.db, { name: "Aaron Undated", deadline: null });
    await factories.scholarship(ctx.deps.db, { name: "Kilo Past", deadline: "2026-10-05" });
    const first = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ openOn: "2026-10-06", pageSize: 4 }));
    expect(names(first)).toEqual(["Bravo Texas", "Alpha National", "Delta Cedar", "Juliet Late"]);
    expect(first.total).toBe(6);
    const second = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ openOn: "2026-10-06", page: 2, pageSize: 4 }));
    expect(names(second)).toEqual(["Aaron Undated", "Charlie Maple"]);
    expect(second).toMatchObject({ page: 2, pageSize: 4, total: 6 });
  });
});

describe("getScholarship", () => {
  it("finds by slug or id and marks listings verified more than 30 days ago as stale", async () => {
    const old = await factories.scholarship(ctx.deps.db, {
      name: "Old Verify",
      slug: "old-verify",
      verifiedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const bySlug = await getScholarship(ctx.deps, PUBLIC_ACTOR, "old-verify");
    expect(bySlug).toMatchObject({ id: old.id, stale: true, application: null });
    const fresh = await getScholarship(ctx.deps, student.actor, "alpha-national");
    expect(fresh.stale).toBe(false);
    expect((await getScholarship(ctx.deps, student.actor, fresh.id)).name).toBe("Alpha National");
  });

  it("hides other students' submissions and stale listings from the public as not_found", async () => {
    await expect(getScholarship(ctx.deps, student.actor, "other-draft")).rejects.toMatchObject({ code: "not_found" });
    expect((await getScholarship(ctx.deps, student.actor, "foxtrot-own")).visibility).toBe("submitter_only");
    await expect(getScholarship(ctx.deps, PUBLIC_ACTOR, "foxtrot-own")).rejects.toMatchObject({ code: "not_found" });
    const stale = await factories.scholarship(ctx.deps.db, { slug: "stale-two", status: "stale" });
    await expect(getScholarship(ctx.deps, PUBLIC_ACTOR, stale.slug)).rejects.toMatchObject({ code: "not_found" });
    await expect(getScholarship(ctx.deps, userActor(student.user.id, "student"), "missing")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("hides scam-flagged listings from the public but shows them, with the flag, to a student (R2P-19)", async () => {
    await factories.scholarship(ctx.deps.db, { name: "Golf Scam", slug: "golf-scam", scamFlags: ["application_fee"] });
    await expect(getScholarship(ctx.deps, PUBLIC_ACTOR, "golf-scam")).rejects.toMatchObject({ code: "not_found" });
    const seen = await getScholarship(ctx.deps, student.actor, "golf-scam");
    expect(seen).toMatchObject({ name: "Golf Scam", scamFlags: ["application_fee"] });
    expect((await getScholarship(ctx.deps, PUBLIC_ACTOR, "alpha-national")).name).toBe("Alpha National");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/scholarships/search.test.ts`
Expected: FAIL with `Failed to resolve import "./search" from "src/scholarships/search.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/scholarships/search.ts`:

```ts
import {
  and,
  asc,
  count,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  profiles,
  scholarshipApplications,
  scholarships,
  sql,
} from "@scholarcrew/db";
import {
  type Actor,
  type IsoDate,
  type Page,
  type ScholarshipDetail,
  type ScholarshipQuery,
  type ScholarshipSummary,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import type { SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { CoreDeps } from "../shared";
import { escapeLike, isUuid } from "./common";
import { isStale, toApplication, toScholarship, toSummary } from "./mappers";

const area = scholarships.localArea;
export const deadlineOrder = [sql`${scholarships.deadline} asc nulls last`, asc(scholarships.name)];
export const noScamFlags = sql`cardinality(${scholarships.scamFlags}) = 0`;

/** Still open on `day`: no deadline, or a deadline on or after it (F-18-3). */
export function openOnWhere(day: IsoDate): SQL {
  return or(isNull(scholarships.deadline), gte(scholarships.deadline, day)) as SQL;
}

/**
 * A listing that may stay in an open plan for `ownerId` (R2P-4): no scam flags, and either a public
 * published or stale listing or `ownerId`'s own submission (draft, published, or stale). Pass a user id,
 * or a column such as `scholarshipApplications.ownerId` to check each application's own owner.
 */
export function liveListingWhere(ownerId: string | AnyPgColumn): SQL {
  return and(
    noScamFlags,
    or(
      and(eq(scholarships.visibility, "public"), inArray(scholarships.status, ["published", "stale"])),
      and(
        eq(scholarships.visibility, "submitter_only"),
        eq(scholarships.submittedById, ownerId),
        inArray(scholarships.status, ["draft", "published", "stale"]),
      ),
    ),
  ) as SQL;
}

/** Which listings an actor may see at all. */
export function visibleListingWhere(actor: Actor): SQL {
  const statuses: Array<"published" | "stale"> =
    actor.kind === "public" || actor.kind === "helper" ? ["published"] : ["published", "stale"];
  const listed = and(eq(scholarships.visibility, "public"), inArray(scholarships.status, statuses)) as SQL;
  if (actor.kind !== "user") return listed;
  const own = and(
    eq(scholarships.visibility, "submitter_only"),
    eq(scholarships.submittedById, actor.userId),
    inArray(scholarships.status, ["draft", "published", "stale"]),
  ) as SQL;
  return or(listed, own) as SQL;
}

export async function searchScholarships(
  deps: CoreDeps,
  actor: Actor,
  q: ScholarshipQuery,
): Promise<Page<ScholarshipSummary>> {
  const conds: SQL[] = [visibleListingWhere(actor)];
  if (q.excludeScams || actor.kind === "public") conds.push(noScamFlags);
  const text = q.q?.trim();
  if (text) {
    const like = `%${escapeLike(text)}%`;
    conds.push(or(ilike(scholarships.name, like), ilike(scholarships.provider, like)) as SQL);
  }
  if (q.state) conds.push(sql`${area}->>'state' = ${q.state}`);
  if (q.local) {
    if (actor.kind !== "user") throw invalidInput("Local search needs the student's profile; filter by state instead");
    const [p] = await deps.db
      .select({ state: profiles.state, county: profiles.county })
      .from(profiles)
      .where(eq(profiles.userId, actor.userId));
    if (p?.state) {
      conds.push(sql`coalesce((${area}->>'national')::boolean, false) = false`);
      conds.push(sql`${area}->>'state' = ${p.state}`);
      const noCounties = sql`coalesce(jsonb_array_length(${area}->'counties'), 0) = 0`;
      conds.push(
        p.county
          ? sql`(${noCounties} or ${area}->'counties' @> ${JSON.stringify([p.county])}::jsonb)`
          : noCounties,
      );
    }
  }
  if (q.renewable !== undefined) conds.push(eq(scholarships.renewable, q.renewable));
  if (q.minUsd !== undefined) conds.push(gte(scholarships.amountMaxUsd, q.minUsd));
  if (q.deadlineBefore) conds.push(lte(scholarships.deadline, q.deadlineBefore));
  if (q.openOn) conds.push(openOnWhere(q.openOn));
  const where = and(...conds);
  const [total] = await deps.db.select({ n: count() }).from(scholarships).where(where);
  const rows = await deps.db
    .select()
    .from(scholarships)
    .where(where)
    .orderBy(...deadlineOrder)
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return { items: rows.map(toSummary), page: q.page, pageSize: q.pageSize, total: total?.n ?? 0 };
}

export async function getScholarship(deps: CoreDeps, actor: Actor, idOrSlug: string): Promise<ScholarshipDetail> {
  const key = isUuid(idOrSlug) ? eq(scholarships.id, idOrSlug) : eq(scholarships.slug, idOrSlug);
  // Signed-out callers never get a scam-flagged listing, matching public search (R2P-19).
  const conds: SQL[] = [key, visibleListingWhere(actor)];
  if (actor.kind === "public") conds.push(noScamFlags);
  const [row] = await deps.db
    .select()
    .from(scholarships)
    .where(and(...conds));
  if (!row) throw notFound("Scholarship not found");
  // `application` is always the viewer's own row, so its reasons are the viewer's own (R2I-11a has nothing to strip here).
  let application: ScholarshipDetail["application"] = null;
  if (actor.kind === "user") {
    const [app] = await deps.db
      .select()
      .from(scholarshipApplications)
      .where(and(eq(scholarshipApplications.ownerId, actor.userId), eq(scholarshipApplications.scholarshipId, row.id)));
    application = app ? toApplication(app) : null;
  }
  return { ...toScholarship(row, actor.kind === "user" ? actor.userId : undefined), application, stale: isStale(row, deps.clock.now()) };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/scholarships/search.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scholarships/search.ts packages/core/src/scholarships/search.test.ts
git commit -m "feat(core): scholarship search, detail, and state directory"
```

### G3: Matcher profile and matches with reasons

`buildMatcherProfile` (system only) reads the profile, the best official ACT and SAT composites, verified service minutes ÷ 60, and `memory.readSensitiveForMatcher`. Sensitive values stay inside the matcher; only `MatchReason` objects leave, and those flagged `sensitive` are always stripped for the family audience (SC-02). Private awards are withheld from parents, helpers, and models even when the sensitive category is shared; only the student can view their identities and reasons.

`listMatches` evaluates published listings (public, or the student's own submission) whose deadline is null or on/after today in the student's time zone. Eligible listings with scam flags are left out (they feed the sweep's hidden count). Each match gets engine scores, reuse stories (non-archived stories with a theme that appears, case-insensitively, in any of the listing's essay prompts), and the student's application id and stage. The audience is `crew` for the owner and the worker unless they ask for `family`; parents always get `family`. A `family` audience returns `[]` unless the student shares `scholarships` with a family. An explicit `audience: "family"` (the crew port) always strips sensitive reasons; a parent who didn't ask for it keeps them only with the `sensitive` share.

`matchListingFor(deps, studentId, listing)` (internal, no access check) scores one listing with the same inputs as `evaluateForStudent` (one shared `scoreListing`), returning `{ reasons: [], fitScore: 0 }` when the student isn't eligible. `saveScholarship` uses it so a listing saved from search or the detail page carries reasons and a fit score (R2P-3).

- [ ] **Step 1: Write the failing test**

`packages/core/src/scholarships/matching.test.ts`:

```ts
import { scholarshipApplications, serviceLogs, testScores } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { systemActor } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { setSensitiveFact } from "../memory";
import { buildMatcherProfile, listMatches, reusableStoryIds } from "./matching";
import { makeParentOf, makeStudent, setShare, setup } from "./testkit";

const system = systemActor("test");
let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps, { state: "TX", county: "Maple", gpaX100: 372 });
});

describe("buildMatcherProfile", () => {
  it("uses the best official scores, verified hours, and enabled sensitive facts", async () => {
    const ownerId = student.user.id;
    await ctx.deps.db.insert(testScores).values([
      { ownerId, test: "ACT", takenOn: "2026-04-11", official: true, composite: 27, sections: {} },
      { ownerId, test: "ACT", takenOn: "2026-06-13", official: true, composite: 30, sections: {} },
      { ownerId, test: "ACT", takenOn: "2026-07-01", official: false, composite: 33, sections: {} },
    ]);
    await ctx.deps.db.insert(serviceLogs).values([
      { ownerId, organization: "Library", activity: "STEM night", servedOn: "2026-09-12", minutes: 90, verification: "verified" },
      { ownerId, organization: "Library", activity: "Setup", servedOn: "2026-09-13", minutes: 60 },
    ]);
    await setSensitiveFact(ctx.deps, student.actor, { kind: "first_gen", enabled: true, value: null });
    const p = await buildMatcherProfile(ctx.deps, system, ownerId);
    expect(p).toMatchObject({ state: "TX", county: "Maple", gpa: 3.72, act: 30, sat: null, serviceHours: 1.5 });
    expect(p.sensitive.firstGen).toBe(true);
  });

  it("is system only", async () => {
    await expect(buildMatcherProfile(ctx.deps, student.actor, student.user.id)).rejects.toThrow();
  });
});

describe("reusableStoryIds", () => {
  it("matches story themes inside essay prompts, ignoring case", () => {
    const list = [
      { id: "a", themes: ["Service"] },
      { id: "b", themes: ["robotics"] },
    ];
    expect(reusableStoryIds(list, ["Describe a SERVICE project."])).toEqual(["a"]);
    expect(reusableStoryIds(list, [])).toEqual([]);
  });
});

describe("listMatches", () => {
  async function seed() {
    const { db } = ctx.deps;
    const maple = await factories.scholarship(db, {
      name: "Maple Rotary",
      localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
      eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
      requirements: {
        essays: [{ prompt: "Describe a time you led a service project.", wordLimit: 500 }],
        recommendations: 0,
        transcript: false,
        serviceHours: null,
        other: [],
      },
      amountMaxUsd: 2000,
      deadline: "2026-11-01",
    });
    const firstGen = await factories.scholarship(db, { name: "First Gen Award", eligibility: [{ type: "first_gen" }] });
    await factories.scholarship(db, { name: "Rolling Award", deadline: null });
    await factories.scholarship(db, { name: "Past Deadline", deadline: "2026-10-01" });
    await factories.scholarship(db, { name: "High GPA", eligibility: [{ type: "gpa_min", min: 3.9 }] });
    await factories.scholarship(db, { name: "Scam Award", scamFlags: ["guaranteed_award"] });
    await factories.scholarship(db, { name: "Draft Award", status: "draft" });
    const story = await factories.story(db, student.user.id, { title: "Library nights", themes: ["Service"] });
    await factories.story(db, student.user.id, { themes: ["led"], archivedAt: new Date() });
    await setSensitiveFact(ctx.deps, student.actor, { kind: "first_gen", enabled: true, value: null });
    return { maple, firstGen, story };
  }

  it("returns eligible, open, scam-free listings with scores, reuse stories, and application state", async () => {
    const { maple, story } = await seed();
    const [app] = await ctx.deps.db
      .insert(scholarshipApplications)
      .values({ ownerId: student.user.id, scholarshipId: maple.id, stage: "planned" })
      .returning();
    const { matches } = await listMatches(ctx.deps, student.actor, student.user.id);
    expect(matches.map((m) => m.scholarship.name).sort()).toEqual(["First Gen Award", "Maple Rotary", "Rolling Award"]);
    const m = matches.find((x) => x.scholarship.id === maple.id);
    expect(m).toMatchObject({ reuseStoryIds: [story.id], daysUntilDeadline: 26, applicationId: app?.id, stage: "planned" });
    expect(m?.reasons.length).toBeGreaterThan(0);
    expect(matches.find((x) => x.scholarship.name === "Rolling Award")).toMatchObject({
      daysUntilDeadline: null,
      applicationId: null,
      stage: null,
    });
    const gen = matches.find((x) => x.scholarship.name === "First Gen Award");
    expect(gen?.reasons.some((r) => r.sensitive)).toBe(true);
  });

  it("withholds sensitive matches for parents and the family audience", async () => {
    await seed();
    const parent = await makeParentOf(ctx.deps, student.user.id);
    for (const list of [
      await listMatches(ctx.deps, parent.actor, student.user.id),
      await listMatches(ctx.deps, parent.actor, student.user.id, { audience: "crew" }),
      await listMatches(ctx.deps, student.actor, student.user.id, { audience: "family" }),
      await listMatches(ctx.deps, system, student.user.id, { audience: "family" }),
    ]) {
      expect(list.privateCount).toBe(1);
      expect(list.matches).toHaveLength(2);
      expect(list.matches.flatMap((m) => m.reasons).every((r) => !r.sensitive)).toBe(true);
    }
  });

  it("withholds sensitive matches even when the sensitive category is shared", async () => {
    await seed();
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await setShare(ctx.deps, student.user.id, "sensitive", true);
    const forParent = await listMatches(ctx.deps, parent.actor, student.user.id);
    expect(forParent.privateCount).toBe(1);
    expect(forParent.matches.some((m) => m.scholarship.name === "First Gen Award")).toBe(false);
    for (const list of [
      await listMatches(ctx.deps, parent.actor, student.user.id, { audience: "family" }),
      await listMatches(ctx.deps, system, student.user.id, { audience: "family" }),
    ]) {
      expect(list.privateCount).toBe(1);
      expect(list.matches).toHaveLength(2);
      expect(list.matches.flatMap((m) => m.reasons).every((r) => !r.sensitive)).toBe(true);
    }
    await setShare(ctx.deps, student.user.id, "sensitive", false);
    const off = await listMatches(ctx.deps, parent.actor, student.user.id);
    expect(off.matches.flatMap((m) => m.reasons).every((r) => !r.sensitive)).toBe(true);
  });

  it("needs the scholarships share for parents and the family audience", async () => {
    await seed();
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await setShare(ctx.deps, student.user.id, "scholarships", false);
    await expect(listMatches(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await listMatches(ctx.deps, system, student.user.id, { audience: "family" })).matches).toHaveLength(2); // Port gates live grants.
    expect((await listMatches(ctx.deps, system, student.user.id)).matches).toHaveLength(3);
  });

  it("hides another student's matches as not_found", async () => {
    const other = await makeStudent(ctx.deps);
    await expect(listMatches(ctx.deps, other.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/scholarships/matching.test.ts`
Expected: FAIL with `Failed to resolve import "./matching" from "src/scholarships/matching.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/scholarships/matching.ts`:

```ts
import {
  and,
  eq,
  gte,
  isNull,
  or,
  profiles,
  scholarshipApplications,
  scholarships,
  serviceLogs,
  sql,
  stories,
  testScores,
} from "@scholarcrew/db";
import { type Actor, type Match, type MatchReason, type ShareCategory, hasSensitiveReason, systemActor } from "@scholarcrew/domain";
import { type MatcherProfile, daysUntil, evaluateEligibility, rankMatches, scoreMatch } from "@scholarcrew/engines";
import { readSensitiveForMatcher } from "../memory";
import { type CoreDeps, todayIn } from "../shared";
import { assertReadable, readsAsOwner, requireSystem, seesSensitiveReasons, userTimeZone } from "./common";
import { type ScholarshipRow, toSummary } from "./mappers";

export async function buildMatcherProfile(deps: CoreDeps, system: Actor, ownerId: string): Promise<MatcherProfile> {
  const sys = requireSystem(system);
  const [p] = await deps.db.select().from(profiles).where(eq(profiles.userId, ownerId));
  const scores = await deps.db
    .select({ test: testScores.test, composite: testScores.composite })
    .from(testScores)
    .where(and(eq(testScores.ownerId, ownerId), eq(testScores.official, true)));
  const best = (test: "ACT" | "SAT") => {
    const values = scores.filter((s) => s.test === test).map((s) => s.composite);
    return values.length > 0 ? Math.max(...values) : null;
  };
  const logs = await deps.db
    .select({ minutes: serviceLogs.minutes })
    .from(serviceLogs)
    .where(and(eq(serviceLogs.ownerId, ownerId), eq(serviceLogs.verification, "verified")));
  const gpaX100 = p?.gpaUnweightedX100 ?? null;
  return {
    state: p?.state ?? "",
    county: p?.county ?? "",
    city: p?.city ?? "",
    classYear: p?.classYear ?? null,
    gpa: gpaX100 === null ? null : gpaX100 / 100,
    intendedMajors: p?.intendedMajors ?? [],
    interests: p?.interests ?? [],
    act: best("ACT"),
    sat: best("SAT"),
    serviceHours: logs.reduce((sum, l) => sum + l.minutes, 0) / 60,
    sensitive: await readSensitiveForMatcher(deps, sys, ownerId),
  };
}

/** Story ids whose themes appear in any of the prompts (case-insensitive). */
export function reusableStoryIds(list: Array<{ id: string; themes: string[] }>, prompts: string[]): string[] {
  const text = prompts.join("\n").toLowerCase();
  if (!text) return [];
  return list
    .filter((s) => s.themes.some((t) => t.trim() !== "" && text.includes(t.trim().toLowerCase())))
    .map((s) => s.id);
}

/** Private ids are withheld from every non-owner and every model-facing read. */
export async function privateScholarshipIds(db: import("@scholarcrew/db").DbOrTx, ownerId: string): Promise<Set<string>> {
  const rows = await db.select({ id: scholarshipApplications.scholarshipId }).from(scholarshipApplications)
    .where(and(eq(scholarshipApplications.ownerId, ownerId),
      sql`${scholarshipApplications.matchReasons} @> '[{"sensitive":true}]'::jsonb`));
  return new Set(rows.map((r) => r.id));
}

export type Evaluation = { matches: Match[]; scamIds: string[]; timeZone: string };

type StoryThemes = Array<{ id: string; themes: string[] }>;

/** Eligibility plus engine scores for one listing; the single scoring path for the sweep, matches, and saves. */
function scoreListing(row: ScholarshipRow, profile: MatcherProfile, storyRows: StoryThemes, now: Date, timeZone: string) {
  const result = evaluateEligibility(row.eligibility, row.localArea, profile);
  const reuse = reusableStoryIds(
    storyRows,
    row.requirements.essays.map((e) => e.prompt),
  );
  const daysUntilDeadline = row.deadline ? daysUntil(row.deadline, now, timeZone) : null;
  const score = scoreMatch({
    amountMaxUsd: row.amountMaxUsd,
    estMinutes: row.estMinutes,
    reasonsCount: result.reasons.length,
    unknownsCount: result.unknowns.length,
    daysUntilDeadline,
    reusableStories: reuse.length,
  });
  return { result, reuse, daysUntilDeadline, score };
}

async function storyThemes(deps: CoreDeps, studentId: string): Promise<StoryThemes> {
  return deps.db
    .select({ id: stories.id, themes: stories.themes })
    .from(stories)
    .where(and(eq(stories.ownerId, studentId), isNull(stories.archivedAt)));
}

/** Runs the matcher over open published listings. No access check: callers do that. */
export async function evaluateForStudent(deps: CoreDeps, studentId: string): Promise<Evaluation> {
  const profile = await buildMatcherProfile(deps, systemActor("matcher"), studentId);
  const timeZone = await userTimeZone(deps.db, studentId);
  const now = deps.clock.now();
  const today = todayIn(now, timeZone);
  const listings = await deps.db
    .select()
    .from(scholarships)
    .where(
      and(
        eq(scholarships.status, "published"),
        or(
          eq(scholarships.visibility, "public"),
          and(eq(scholarships.visibility, "submitter_only"), eq(scholarships.submittedById, studentId)),
        ),
        or(isNull(scholarships.deadline), gte(scholarships.deadline, today)),
      ),
    );
  const storyRows = await storyThemes(deps, studentId);
  const apps = await deps.db
    .select({ id: scholarshipApplications.id, scholarshipId: scholarshipApplications.scholarshipId, stage: scholarshipApplications.stage })
    .from(scholarshipApplications)
    .where(eq(scholarshipApplications.ownerId, studentId));
  const appByListing = new Map(apps.map((a) => [a.scholarshipId, a]));

  const matches: Match[] = [];
  const scamIds: string[] = [];
  for (const row of listings) {
    const { result, reuse, daysUntilDeadline, score } = scoreListing(row, profile, storyRows, now, timeZone);
    if (!result.eligible) continue;
    if (row.scamFlags.length > 0) {
      scamIds.push(row.id);
      continue;
    }
    const app = appByListing.get(row.id);
    matches.push({
      scholarship: toSummary(row),
      fitScore: score.fitScore,
      valuePerHour: score.valuePerHour,
      estMinutes: row.estMinutes,
      reasons: result.reasons,
      unknowns: result.unknowns,
      reuseStoryIds: reuse,
      daysUntilDeadline,
      applicationId: app?.id ?? null,
      stage: app?.stage ?? null,
    });
  }
  return { matches: rankMatches(matches), scamIds, timeZone };
}

/**
 * Reasons and fit score for one listing, with the same inputs as `evaluateForStudent` (R2P-3).
 * Ineligible listings get no reasons and a fit of 0. No access check: `saveScholarship` checks visibility first.
 */
export async function matchListingFor(
  deps: CoreDeps,
  studentId: string,
  listing: ScholarshipRow,
): Promise<{ reasons: MatchReason[]; fitScore: number }> {
  const profile = await buildMatcherProfile(deps, systemActor("matcher"), studentId);
  const timeZone = await userTimeZone(deps.db, studentId);
  const storyRows = await storyThemes(deps, studentId);
  const { result, score } = scoreListing(listing, profile, storyRows, deps.clock.now(), timeZone);
  if (!result.eligible) return { reasons: [], fitScore: 0 };
  return { reasons: result.reasons, fitScore: score.fitScore };
}

export async function listMatches(
  deps: CoreDeps, actor: Actor, studentId: string,
  o: { audience?: "crew" | "family" } = {},
): Promise<{ matches: Match[]; privateCount: number }> {
  await assertReadable(deps, actor, studentId, "scholarships");
  const { matches } = await evaluateForStudent(deps, studentId);
  const privateCount = matches.filter((m) => hasSensitiveReason(m.reasons)).length;
  const ownerView = readsAsOwner(actor, studentId) && o.audience !== "family";
  return { matches: ownerView ? matches : matches.filter((m) => !hasSensitiveReason(m.reasons)), privateCount };
}

```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/scholarships/matching.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scholarships/matching.ts packages/core/src/scholarships/matching.test.ts
git commit -m "feat(core): matcher profile and ranked matches with reasons"
```

### G4: Weekly sweep and last sweep summary

`runSweep` (system) runs the same evaluation as `listMatches`, inserts a `matched` application for every clean eligible listing the student has no application for (`onConflictDoNothing` on `(ownerId, scholarshipId)`, so reruns and races add nothing), refreshes `matchReasons` and `fitScore` on the student's existing open applications (`matched`, `planned`, `drafting`) whose listing is in the eligible match set, so a card saved before a profile change catches up (R2P-3), records a `sweepRuns` row with the eligible scam-flagged listing ids, and sends one `new_matches` notification per student per sweep day (`dedupeKey` `sweep:<studentId>:<todayIn(now, timeZone)>`) when it added at least one match. Keying by day lets the Sunday sweep in a signup week announce what it finds after the onboarding sweep (R2P-21); same-day reruns still notify once.

- [ ] **Step 1: Write the failing test**

`packages/core/src/scholarships/sweep.test.ts`:

```ts
import { and, eq, notifications, profiles, scholarshipApplications, sweepRuns } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { systemActor } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { lastSweep, runSweep } from "./sweep";
import { makeParentOf, makeStudent, setup } from "./testkit";

const system = systemActor("test");
let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

const essayReq = (prompt: string) => ({
  essays: [{ prompt, wordLimit: 400 }],
  recommendations: 0,
  transcript: false,
  serviceHours: null,
  other: [],
});

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps, { state: "TX", county: "Maple" });
});

async function seed() {
  const { db } = ctx.deps;
  const a = await factories.scholarship(db, { name: "A", amountMaxUsd: 1000 });
  const b = await factories.scholarship(db, { name: "B", amountMaxUsd: 2500, requirements: essayReq("A service moment") });
  const scam = await factories.scholarship(db, { name: "Scam", scamFlags: ["application_fee"] });
  await factories.scholarship(db, {
    name: "Ineligible scam",
    scamFlags: ["sweepstakes"],
    eligibility: [{ type: "gpa_min", min: 3.9 }],
  });
  await factories.story(db, student.user.id, { themes: ["service"] });
  return { a, b, scam };
}

describe("runSweep", () => {
  it("adds matched applications, counts hidden scams, records the run, and notifies once", async () => {
    const { scam } = await seed();
    const result = await runSweep(ctx.deps, system, student.user.id);
    expect(result).toEqual({
      studentId: student.user.id,
      ranAt: "2026-10-06T15:00:00.000Z",
      newMatches: 2,
      totalUsd: 3500,
      reuseCount: 1,
      hiddenScams: 1,
    });
    const apps = await ctx.deps.db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.ownerId, student.user.id));
    expect(apps).toHaveLength(2);
    expect(apps.every((x) => x.stage === "matched")).toBe(true);
    const runs = await ctx.deps.db.select().from(sweepRuns).where(eq(sweepRuns.ownerId, student.user.id));
    expect(runs[0]?.hiddenScholarshipIds).toEqual([scam.id]);
    const notes = await ctx.deps.db.select().from(notifications).where(eq(notifications.userId, student.user.id));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: "new_matches", dedupeKey: `sweep:${student.user.id}:2026-10-06` });
  });

  it("is idempotent: a second run adds nothing and sends no second notification", async () => {
    await seed();
    await runSweep(ctx.deps, system, student.user.id);
    const again = await runSweep(ctx.deps, system, student.user.id);
    expect(again).toMatchObject({ newMatches: 0, totalUsd: 0, reuseCount: 0, hiddenScams: 1 });
    const apps = await ctx.deps.db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.ownerId, student.user.id));
    expect(apps).toHaveLength(2);
    const notes = await ctx.deps.db.select().from(notifications).where(eq(notifications.userId, student.user.id));
    expect(notes).toHaveLength(1);
    expect(await ctx.deps.db.select().from(sweepRuns).where(eq(sweepRuns.ownerId, student.user.id))).toHaveLength(2);
  });

  it("keeps existing applications and notifies again the next week", async () => {
    const { a } = await seed();
    await ctx.deps.db
      .insert(scholarshipApplications)
      .values({ ownerId: student.user.id, scholarshipId: a.id, stage: "planned" });
    expect((await runSweep(ctx.deps, system, student.user.id)).newMatches).toBe(1);
    const [saved] = await ctx.deps.db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.scholarshipId, a.id));
    expect(saved?.stage).toBe("planned");
    ctx.clock.set("2026-10-13T15:00:00.000Z");
    await factories.scholarship(ctx.deps.db, { name: "C" });
    expect((await runSweep(ctx.deps, system, student.user.id)).newMatches).toBe(1);
    const notes = await ctx.deps.db.select().from(notifications).where(eq(notifications.userId, student.user.id));
    expect(notes.map((n) => n.dedupeKey).sort()).toEqual([
      `sweep:${student.user.id}:2026-10-06`,
      `sweep:${student.user.id}:2026-10-13`,
    ]);
  });

  it("notifies for an onboarding sweep and the Sunday sweep of the same week (R2P-21)", async () => {
    await seed();
    ctx.clock.set("2026-10-07T15:00:00.000Z"); // Wednesday, 10:00 in Chicago
    expect((await runSweep(ctx.deps, system, student.user.id)).newMatches).toBe(2);
    await factories.scholarship(ctx.deps.db, { name: "C" });
    ctx.clock.set("2026-10-11T14:00:00.000Z"); // Sunday, 09:00 in Chicago, the same Monday-start week
    expect((await runSweep(ctx.deps, system, student.user.id)).newMatches).toBe(1);
    const notes = await ctx.deps.db.select().from(notifications).where(eq(notifications.userId, student.user.id));
    expect(notes.map((n) => n.dedupeKey).sort()).toEqual([
      `sweep:${student.user.id}:2026-10-07`,
      `sweep:${student.user.id}:2026-10-11`,
    ]);
  });

  it("refreshes reasons and fit on open applications saved before the profile changed (R2P-3)", async () => {
    const { db } = ctx.deps;
    const cedar = { national: false, state: "TX" as const, counties: ["Cedar"], cities: [] };
    const listing = await factories.scholarship(db, {
      name: "Cedar Rotary",
      localArea: cedar,
      eligibility: [{ type: "county_in", state: "TX", counties: ["Cedar"] }],
    });
    const past = await factories.scholarship(db, {
      name: "Cedar Old",
      localArea: cedar,
      eligibility: [{ type: "county_in", state: "TX", counties: ["Cedar"] }],
    });
    await db.insert(scholarshipApplications).values([
      { ownerId: student.user.id, scholarshipId: listing.id, stage: "planned" },
      { ownerId: student.user.id, scholarshipId: past.id, stage: "submitted" },
    ]);
    await db.update(profiles).set({ county: "Cedar" }).where(eq(profiles.userId, student.user.id));
    await runSweep(ctx.deps, system, student.user.id);
    const [saved] = await db
      .select()
      .from(scholarshipApplications)
      .where(and(eq(scholarshipApplications.ownerId, student.user.id), eq(scholarshipApplications.scholarshipId, listing.id)));
    expect(saved?.stage).toBe("planned");
    expect(saved?.matchReasons.map((r) => r.code)).toContain("county_in");
    expect(saved?.fitScore).toBeGreaterThan(0);
    const [submitted] = await db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.scholarshipId, past.id));
    expect(submitted).toMatchObject({ stage: "submitted", matchReasons: [], fitScore: 0 });
  });

  it("is system only", async () => {
    await expect(runSweep(ctx.deps, student.actor, student.user.id)).rejects.toThrow();
  });
});

describe("lastSweep", () => {
  it("returns the newest run for the owner and sharing parents, null before any run", async () => {
    expect(await lastSweep(ctx.deps, student.actor, student.user.id)).toBeNull();
    await seed();
    await runSweep(ctx.deps, system, student.user.id);
    ctx.clock.set("2026-10-07T15:00:00.000Z");
    await runSweep(ctx.deps, system, student.user.id);
    expect(await lastSweep(ctx.deps, student.actor, student.user.id)).toEqual({
      ranAt: "2026-10-07T15:00:00.000Z",
      newMatches: 0,
      totalUsd: 0,
      reuseCount: 0,
      hiddenScams: 1,
    });
    const parent = await makeParentOf(ctx.deps, student.user.id);
    expect((await lastSweep(ctx.deps, parent.actor, student.user.id))?.hiddenScams).toBe(1);
    const other = await makeStudent(ctx.deps);
    await expect(lastSweep(ctx.deps, other.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/scholarships/sweep.test.ts`
Expected: FAIL with `Failed to resolve import "./sweep" from "src/scholarships/sweep.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/scholarships/sweep.ts`:

```ts
import { and, desc, eq, inArray, scholarshipApplications, sweepRuns } from "@scholarcrew/db";
import type { Actor, Match, SweepResult, SweepSummary } from "@scholarcrew/domain";
import { formatUsd } from "@scholarcrew/engines";
import { notify } from "../notifications";
import { type CoreDeps, toIso, todayIn } from "../shared";
import { assertReadable, firstRow, requireSystem } from "./common";
import { evaluateForStudent } from "./matching";

const OPEN_STAGES = ["matched", "planned", "drafting"] as const;

function toSweepSummary(row: typeof sweepRuns.$inferSelect): SweepSummary {
  return {
    ranAt: toIso(row.ranAt),
    newMatches: row.newMatches,
    totalUsd: row.totalUsd,
    reuseCount: row.reuseCount,
    hiddenScams: row.hiddenScams,
  };
}

export async function runSweep(deps: CoreDeps, system: Actor, studentId: string): Promise<SweepResult> {
  const sys = requireSystem(system);
  const { matches, scamIds, timeZone } = await evaluateForStudent(deps, studentId);
  const fresh = matches.filter((m) => m.applicationId === null);
  let added: Match[] = [];
  if (fresh.length > 0) {
    const rows = await deps.db
      .insert(scholarshipApplications)
      .values(
        fresh.map((m) => ({
          ownerId: studentId,
          scholarshipId: m.scholarship.id,
          stage: "matched" as const,
          matchReasons: m.reasons,
          fitScore: m.fitScore,
          estMinutes: m.estMinutes,
        })),
      )
      .onConflictDoNothing({ target: [scholarshipApplications.ownerId, scholarshipApplications.scholarshipId] })
      .returning({ scholarshipId: scholarshipApplications.scholarshipId });
    const ids = new Set(rows.map((r) => r.scholarshipId));
    added = fresh.filter((m) => ids.has(m.scholarship.id));
  }
  // Saved or older cards catch up with the current profile (R2P-3). Submitted and later stages keep their reasons.
  const open: readonly string[] = OPEN_STAGES;
  const refresh = matches.filter((m) => m.applicationId !== null && m.stage !== null && open.includes(m.stage));
  if (refresh.length > 0) {
    await deps.db.transaction(async (tx) => {
      for (const m of refresh) {
        if (!m.applicationId) continue;
        await tx
          .update(scholarshipApplications)
          .set({ matchReasons: m.reasons, fitScore: m.fitScore })
          .where(
            and(
              eq(scholarshipApplications.id, m.applicationId),
              inArray(scholarshipApplications.stage, [...OPEN_STAGES]),
            ),
          );
      }
    });
  }
  const totalUsd = added.reduce((sum, m) => sum + m.scholarship.amountMaxUsd, 0);
  const now = deps.clock.now();
  const [prior] = await deps.db.select().from(sweepRuns)
    .where(eq(sweepRuns.ownerId, studentId)).orderBy(desc(sweepRuns.ranAt)).limit(1);
  if (added.length === 0 && prior && todayIn(prior.ranAt, timeZone) === todayIn(now, timeZone))
    return { studentId, ranAt: toIso(now), newMatches: 0, totalUsd: 0, reuseCount: 0, hiddenScams: scamIds.length };
  const run = firstRow(
    await deps.db
      .insert(sweepRuns)
      .values({
        ownerId: studentId,
        ranAt: now,
        newMatches: added.length,
        totalUsd,
        reuseCount: added.filter((m) => m.reuseStoryIds.length > 0).length,
        hiddenScams: scamIds.length,
        hiddenScholarshipIds: scamIds,
      })
      .returning(),
    "sweep run",
  );
  if (added.length > 0) {
    await notify(deps, sys, {
      userId: studentId,
      kind: "new_matches",
      title: added.length === 1 ? "1 new scholarship match" : `${added.length} new scholarship matches`,
      body: `Worth up to ${formatUsd(totalUsd)} in total. Open your board to review them.`,
      link: "/scholarships",
      // Keyed by sweep day in the student's zone, so the signup week's Sunday sweep can still notify (R2P-21).
      dedupeKey: `sweep:${studentId}:${todayIn(now, timeZone)}`,
      email: true,
    });
  }
  return { studentId, ...toSweepSummary(run) };
}

export async function lastSweep(deps: CoreDeps, actor: Actor, studentId: string): Promise<SweepSummary | null> {
  await assertReadable(deps, actor, studentId, "scholarships");
  const [row] = await deps.db
    .select()
    .from(sweepRuns)
    .where(eq(sweepRuns.ownerId, studentId))
    .orderBy(desc(sweepRuns.ranAt))
    .limit(1);
  return row ? toSweepSummary(row) : null;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/scholarships`
Expected: PASS, 4 files, 30 tests (common 5, search 10, matching 8, sweep 7).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scholarships/sweep.ts packages/core/src/scholarships/sweep.test.ts
git commit -m "feat(core): weekly scholarship sweep with hidden scam count"
```

### G5: Board, saving, and outcomes

Board columns: `matched`; `working` = `planned` + `drafting`; `submitted`; `won`; `lostOrSkipped` = `lost` + `skipped`. The `matched` column is ranked by expected value per hour (SC-05, R2P-5): each matched card gets `scoreMatch({ amountMaxUsd, estMinutes: app.estMinutes, reasonsCount: app.matchReasons.length, unknownsCount: 0, daysUntilDeadline, reusableStories })` and the column is ordered by `rankMatches` over `{ fitScore: app.fitScore, valuePerHour, daysUntilDeadline }`; the stored (unfiltered) reason count is used so a parent sees the same order as the student. The other columns are ordered by deadline (nulls last), then name. `progress` is set only on `drafting` cards: the most recently updated essay targeting that scholarship, current version word count ÷ word limit, capped at 1 (null without a word limit or essay).

An open-stage card (`matched`, `planned`, `drafting`) whose listing fails `liveListingWhere(studentId)` (R2P-4) leaves the columns and the totals and goes to `flagged`, with the reason `SCAM_FLAG_TEXT` of its first flag, `RETIRED_TEXT` ("This listing was retired"), or `UNDER_REVIEW_TEXT` ("This listing is under review", for a `flagged` listing or a public `draft`). `submitted`, `won`, and `lost` history stays where it is. `flagged` also lists the listings in the newest `sweepRuns.hiddenScholarshipIds` with `SCAM_FLAG_TEXT` of their first flag, deduplicated by scholarship id against the cards already there.

Totals: `inPlayUsd` sums `amountMaxUsd` across live matched and working cards whose listing is undated or due today or later in the student's zone (R3V-6), and every submitted card; `wonUsd` sums `outcomeUsd` of won cards; `dueThisMonth` counts live matched and working cards due from today through the end of this month. Private cards with any sensitive reason are owner-only and omitted from non-owner columns and totals; Board.privateCount records how many were withheld. A sensitive grant never widens this rule.

`saveScholarship` runs `matchListingFor` and writes `matchReasons` and `fitScore` on insert; on conflict it sets them only when the existing row has no reasons (`jsonb_array_length(match_reasons) = 0`), so a sweep-scored card keeps its reasons (R2P-3).

- [ ] **Step 1: Write the failing test**

`packages/core/src/scholarships/board.test.ts`:

```ts
import { and, eq, essayVersions, inArray, planItems, scholarshipApplications, scholarships, sweepRuns } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type ApplicationStage, type MatchReason, SCAM_FLAG_TEXT } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { RETIRED_TEXT, UNDER_REVIEW_TEXT, getBoard, saveScholarship, updateApplication } from "./board";
import { makeParentOf, makeStudent, setShare, setup } from "./testkit";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

const reasons: MatchReason[] = [
  { code: "county", text: "You live in Maple County", sensitive: false },
  { code: "first_gen", text: "You'd be the first in your family to go to college", sensitive: true },
];

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
});

async function app(stage: ApplicationStage, o: { deadline?: string | null; amountMaxUsd?: number; outcomeUsd?: number } = {}) {
  const listing = await factories.scholarship(ctx.deps.db, {
    name: `${stage} listing`,
    deadline: o.deadline === undefined ? "2026-11-20" : o.deadline,
    amountMaxUsd: o.amountMaxUsd ?? 1000,
    requirements: {
      essays: [{ prompt: "Tell us about a service moment.", wordLimit: 500 }],
      recommendations: 0,
      transcript: false,
      serviceHours: null,
      other: [],
    },
  });
  const [row] = await ctx.deps.db
    .insert(scholarshipApplications)
    .values({ ownerId: student.user.id, scholarshipId: listing.id, stage, matchReasons: reasons, outcomeUsd: o.outcomeUsd })
    .returning();
  if (!row) throw new Error("no application");
  return { listing, row };
}

describe("getBoard", () => {
  it("groups cards into columns with progress, reuse story, flagged scams, and totals", async () => {
    const { db } = ctx.deps;
    await app("matched", { deadline: "2026-10-20", amountMaxUsd: 1000 });
    await app("planned", { deadline: "2026-10-28", amountMaxUsd: 2000 });
    const drafting = await app("drafting", { deadline: "2026-11-10", amountMaxUsd: 3000 });
    await app("submitted", { amountMaxUsd: 1500 });
    await app("won", { outcomeUsd: 1200 });
    await app("lost");
    await app("skipped", { deadline: null });
    await factories.story(db, student.user.id, { title: "Library nights", themes: ["service"] });
    const essay = await factories.essay(db, student.user.id, {
      targetType: "scholarship",
      targetScholarshipId: drafting.listing.id,
      wordLimit: 500,
      currentVersion: 1,
    });
    await db
      .insert(essayVersions)
      .values({ essayId: essay.id, version: 1, body: "draft", wordCount: 250, authorId: student.user.id });
    const scam = await factories.scholarship(db, { name: "Scam", scamFlags: ["application_fee", "sweepstakes"] });
    await db.insert(sweepRuns).values({
      ownerId: student.user.id,
      ranAt: new Date("2026-10-04T14:00:00.000Z"),
      newMatches: 0,
      totalUsd: 0,
      reuseCount: 0,
      hiddenScams: 1,
      hiddenScholarshipIds: [scam.id],
    });

    const board = await getBoard(ctx.deps, student.actor, student.user.id);
    expect(board.matched.map((c) => c.application.stage)).toEqual(["matched"]);
    expect(board.working.map((c) => c.application.stage)).toEqual(["planned", "drafting"]);
    expect(board.submitted).toHaveLength(1);
    expect(board.won).toHaveLength(1);
    expect(board.lostOrSkipped.map((c) => c.application.stage)).toEqual(["lost", "skipped"]);
    expect(board.working[0]?.progress).toBeNull();
    expect(board.working[1]).toMatchObject({ progress: 0.5, reuseStoryTitle: "Library nights", daysUntilDeadline: 35 });
    expect(board.matched[0]?.reasons).toHaveLength(2);
    expect(board.flagged).toEqual([
      { scholarship: expect.objectContaining({ id: scam.id }), reason: SCAM_FLAG_TEXT.application_fee },
    ]);
    expect(board.totals).toEqual({ inPlayUsd: 7500, wonUsd: 1200, dueThisMonth: 2 });
  });

  it("strips sensitive reasons for parents and enforces the scholarships share", async () => {
    await app("matched");
    const parent = await makeParentOf(ctx.deps, student.user.id);
    const board = await getBoard(ctx.deps, parent.actor, student.user.id);
    expect(board.matched).toEqual([]);
    expect(board.privateCount).toBe(1);
    expect(board.totals.inPlayUsd).toBe(0);
    await setShare(ctx.deps, student.user.id, "scholarships", false);
    await expect(getBoard(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    const other = await makeStudent(ctx.deps);
    await expect(getBoard(ctx.deps, other.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("withholds private cards even with sensitive sharing enabled", async () => {
    await app("matched");
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await setShare(ctx.deps, student.user.id, "sensitive", true);
    const shared = await getBoard(ctx.deps, parent.actor, student.user.id);
    expect(shared.matched).toEqual([]);
    expect(shared.privateCount).toBe(1);
    expect(shared.totals.inPlayUsd).toBe(0);
    await setShare(ctx.deps, student.user.id, "sensitive", false);
    const hidden = await getBoard(ctx.deps, parent.actor, student.user.id);
    expect(hidden.matched).toEqual([]);
  });

  it("moves open cards on retired, under-review, or scam-flagged listings to flagged and out of the totals (R2P-4)", async () => {
    const { db } = ctx.deps;
    const live = await app("planned", { deadline: "2026-10-28", amountMaxUsd: 2000 });
    const retired = await app("planned", { deadline: "2026-10-20", amountMaxUsd: 5000 });
    const review = await app("drafting", { deadline: "2026-10-21", amountMaxUsd: 4000 });
    const scam = await app("matched", { deadline: "2026-10-22", amountMaxUsd: 3000 });
    const history = await app("submitted", { amountMaxUsd: 1500 });
    await db
      .update(scholarships)
      .set({ status: "retired" })
      .where(inArray(scholarships.id, [retired.listing.id, history.listing.id]));
    await db.update(scholarships).set({ status: "flagged" }).where(eq(scholarships.id, review.listing.id));
    await db.update(scholarships).set({ scamFlags: ["application_fee"] }).where(eq(scholarships.id, scam.listing.id));
    await db.insert(sweepRuns).values({
      ownerId: student.user.id,
      ranAt: new Date("2026-10-04T14:00:00.000Z"),
      newMatches: 0,
      totalUsd: 0,
      reuseCount: 0,
      hiddenScams: 1,
      hiddenScholarshipIds: [scam.listing.id],
    });

    const board = await getBoard(ctx.deps, student.actor, student.user.id);
    expect(board.matched).toEqual([]);
    expect(board.working.map((c) => c.scholarship.id)).toEqual([live.listing.id]);
    expect(board.submitted.map((c) => c.scholarship.id)).toEqual([history.listing.id]);
    expect(board.flagged.map((f) => [f.scholarship.id, f.reason])).toEqual([
      [retired.listing.id, RETIRED_TEXT],
      [review.listing.id, UNDER_REVIEW_TEXT],
      [scam.listing.id, SCAM_FLAG_TEXT.application_fee],
    ]);
    expect(board.totals).toEqual({ inPlayUsd: 3500, wonUsd: 0, dueThisMonth: 1 });
  });

  it("leaves past-due open cards out of inPlayUsd but keeps submitted ones (R3V-6)", async () => {
    const pastPlanned = await app("planned", { deadline: "2026-10-05", amountMaxUsd: 4000 });
    await app("drafting", { deadline: "2026-10-06", amountMaxUsd: 2000 });
    await app("planned", { deadline: null, amountMaxUsd: 300 });
    await app("submitted", { deadline: "2026-10-05", amountMaxUsd: 1500 });
    const board = await getBoard(ctx.deps, student.actor, student.user.id);
    expect(board.working.map((c) => c.scholarship.id)).toContain(pastPlanned.listing.id);
    expect(board.totals.inPlayUsd).toBe(2000 + 300 + 1500);
  });

  it("ranks the matched column by value per hour, not deadline, for every reader (R2P-5)", async () => {
    const soonSmall = await app("matched", { deadline: "2026-10-20", amountMaxUsd: 500 });
    const lateLarge = await app("matched", { deadline: "2026-11-20", amountMaxUsd: 5000 });
    const order = [lateLarge.listing.id, soonSmall.listing.id];
    expect((await getBoard(ctx.deps, student.actor, student.user.id)).matched.map((c) => c.scholarship.id)).toEqual(order);
    const parent = await makeParentOf(ctx.deps, student.user.id);
    expect((await getBoard(ctx.deps, parent.actor, student.user.id)).matched).toEqual([]); // These fixture cards carry sensitive reasons.
  });
});

describe("saveScholarship", () => {
  it("creates or upgrades to planned and never moves later stages back", async () => {
    const listing = await factories.scholarship(ctx.deps.db);
    const first = await saveScholarship(ctx.deps, student.actor, { scholarshipId: listing.id });
    expect(first.stage).toBe("planned");
    expect((await saveScholarship(ctx.deps, student.actor, { scholarshipId: listing.id })).id).toBe(first.id);
    const matched = await app("matched");
    expect((await saveScholarship(ctx.deps, student.actor, { scholarshipId: matched.listing.id })).stage).toBe("planned");
    const drafting = await app("drafting");
    expect((await saveScholarship(ctx.deps, student.actor, { scholarshipId: drafting.listing.id })).stage).toBe("drafting");
  });

  it("writes match reasons and fit when saving from search, keeping reasons a sweep already stored (R2P-3)", async () => {
    const maya = await makeStudent(ctx.deps, { state: "TX", county: "Maple" });
    const listing = await factories.scholarship(ctx.deps.db, {
      localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
      eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
    });
    const saved = await saveScholarship(ctx.deps, maya.actor, { scholarshipId: listing.id });
    expect(saved.matchReasons.map((r) => r.code)).toContain("county_in");
    expect(saved.fitScore).toBeGreaterThan(0);
    const board = await getBoard(ctx.deps, maya.actor, maya.user.id);
    expect(board.working[0]?.reasons.map((r) => r.code)).toContain("county_in");
    const cedar = await factories.scholarship(ctx.deps.db, {
      eligibility: [{ type: "county_in", state: "TX", counties: ["Cedar"] }],
    });
    expect(await saveScholarship(ctx.deps, maya.actor, { scholarshipId: cedar.id })).toMatchObject({
      matchReasons: [],
      fitScore: 0,
    });
    const swept = await app("matched");
    const upgraded = await saveScholarship(ctx.deps, student.actor, { scholarshipId: swept.listing.id });
    expect(upgraded.stage).toBe("planned");
    expect(upgraded.matchReasons).toEqual(reasons);
  });

  it("rejects listings the student can't see", async () => {
    const other = await makeStudent(ctx.deps);
    const hidden = await factories.scholarship(ctx.deps.db, {
      status: "draft",
      visibility: "submitter_only",
      submittedById: other.user.id,
    });
    await expect(saveScholarship(ctx.deps, student.actor, { scholarshipId: hidden.id })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("updateApplication", () => {
  it("records a win with the listing amount by default and adds one thank-you plan item", async () => {
    const { row } = await app("submitted", { amountMaxUsd: 2000 });
    const won = await updateApplication(ctx.deps, student.actor, row.id, { stage: "won" });
    expect(won).toMatchObject({ stage: "won", outcomeUsd: 2000, outcomeAt: "2026-10-06T15:00:00.000Z" });
    await updateApplication(ctx.deps, student.actor, row.id, { stage: "won", thankYouSent: true });
    const items = await ctx.deps.db
      .select()
      .from(planItems)
      .where(and(eq(planItems.ownerId, student.user.id), eq(planItems.kind, "thank_you")));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Send a thank-you note to Test Foundation",
      minutes: 15,
      weekStart: "2026-10-05",
      refId: row.id,
    });
  });

  it("keeps an explicit outcome amount and stamps submittedAt", async () => {
    const a = await app("drafting", { amountMaxUsd: 2000 });
    const submitted = await updateApplication(ctx.deps, student.actor, a.row.id, { stage: "submitted" });
    expect(submitted.submittedAt).toBe("2026-10-06T15:00:00.000Z");
    const won = await updateApplication(ctx.deps, student.actor, a.row.id, { stage: "won", outcomeUsd: 800 });
    expect(won.outcomeUsd).toBe(800);
  });

  it("is owner only", async () => {
    const { row } = await app("matched");
    const other = await makeStudent(ctx.deps);
    const parent = await makeParentOf(ctx.deps, student.user.id);
    for (const actor of [other.actor, parent.actor]) {
      await expect(updateApplication(ctx.deps, actor, row.id, { stage: "skipped" })).rejects.toMatchObject({
        code: "not_found",
      });
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/scholarships/board.test.ts`
Expected: FAIL with `Failed to resolve import "./board" from "src/scholarships/board.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/scholarships/board.ts`:

```ts
import {
  and,
  desc,
  eq,
  essayVersions,
  essays,
  inArray,
  isNotNull,
  isNull,
  planItems,
  scholarshipApplications,
  scholarships,
  sql,
  stories,
  sweepRuns,
} from "@scholarcrew/db";
import {
  type Actor,
  type ApplicationPatch,
  type Board,
  type BoardCard,
  SCAM_FLAG_TEXT,
  type ScholarshipApplication,
  notFound,
} from "@scholarcrew/domain";
import { daysUntil, rankMatches, scoreMatch, weekStartFor } from "@scholarcrew/engines";
import { assertOwner } from "../access";
import { type CoreDeps, requireUuid, todayIn } from "../shared";
import { assertReadable, firstRow, monthOf, requireUser, readsAsOwner, userTimeZone } from "./common";
import { type ScholarshipRow, toApplication, toSummary } from "./mappers";
import { matchListingFor, reusableStoryIds } from "./matching";
import { hasSensitiveReason } from "@scholarcrew/domain";
import { deadlineOrder, liveListingWhere, visibleListingWhere } from "./search";

export const RETIRED_TEXT = "This listing was retired";
export const UNDER_REVIEW_TEXT = "This listing is under review";

/** Why an open card's listing left the columns (R2P-4). */
function notLiveReason(listing: ScholarshipRow): string {
  const flag = listing.scamFlags[0];
  if (flag) return SCAM_FLAG_TEXT[flag];
  if (listing.status === "retired") return RETIRED_TEXT;
  return UNDER_REVIEW_TEXT;
}

export async function getBoard(deps: CoreDeps, actor: Actor, studentId: string): Promise<Board> {
  await assertReadable(deps, actor, studentId, "scholarships");
  const keepSensitive = readsAsOwner(actor, studentId);
  const timeZone = await userTimeZone(deps.db, studentId);
  const now = deps.clock.now();
  const today = todayIn(now, timeZone);

  const rows = await deps.db
    .select({
      app: scholarshipApplications,
      listing: scholarships,
      live: sql<boolean>`coalesce((${liveListingWhere(studentId)}), false)`,
    })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(eq(scholarshipApplications.ownerId, studentId))
    .orderBy(...deadlineOrder);
  const storyRows = await deps.db
    .select({ id: stories.id, title: stories.title, themes: stories.themes })
    .from(stories)
    .where(and(eq(stories.ownerId, studentId), isNull(stories.archivedAt)))
    .orderBy(stories.createdAt);
  const linked = await deps.db
    .select({ scholarshipId: essays.targetScholarshipId, wordLimit: essays.wordLimit, wordCount: essayVersions.wordCount })
    .from(essays)
    .leftJoin(essayVersions, and(eq(essayVersions.essayId, essays.id), eq(essayVersions.version, essays.currentVersion)))
    .where(and(eq(essays.ownerId, studentId), isNotNull(essays.targetScholarshipId)))
    .orderBy(desc(essays.updatedAt));
  const progressBy = new Map<string, number | null>();
  for (const e of linked) {
    if (!e.scholarshipId || progressBy.has(e.scholarshipId)) continue;
    progressBy.set(e.scholarshipId, e.wordLimit ? Math.min(1, (e.wordCount ?? 0) / e.wordLimit) : null);
  }

  const board: Board = {
    matched: [],
    working: [],
    submitted: [],
    won: [],
    lostOrSkipped: [],
    flagged: [],
    privateCount: 0,
    totals: { inPlayUsd: 0, wonUsd: 0, dueThisMonth: 0 },
  };
  const flaggedIds = new Set<string>();
  const matched: Array<{ card: BoardCard; fitScore: number; valuePerHour: number; daysUntilDeadline: number | null }> = [];
  for (const { app, listing, live } of rows) {
    if (hasSensitiveReason(app.matchReasons)) {
      board.privateCount += 1;
      if (!keepSensitive) continue;
    }
    const reasons = keepSensitive ? app.matchReasons : app.matchReasons.filter((r) => !r.sensitive);
    const reuse = reusableStoryIds(
      storyRows,
      listing.requirements.essays.map((e) => e.prompt),
    );
    const daysUntilDeadline = listing.deadline ? daysUntil(listing.deadline, now, timeZone) : null;
    const card: BoardCard = {
      application: { ...toApplication(app), matchReasons: reasons },
      scholarship: toSummary(listing),
      reasons,
      reuseStoryTitle: storyRows.find((s) => s.id === reuse[0])?.title ?? null,
      progress: app.stage === "drafting" ? (progressBy.get(listing.id) ?? null) : null,
      daysUntilDeadline,
    };
    const open = app.stage === "matched" || app.stage === "planned" || app.stage === "drafting";
    if (open && !live) {
      // Retired, under review, or scam-flagged since it was added: off the columns and out of the totals (R2P-4).
      flaggedIds.add(listing.id);
      board.flagged.push({ scholarship: toSummary(listing), reason: notLiveReason(listing) });
      continue;
    }
    // R3V-6: an open card counts while its listing is undated or due today or later in the student's zone;
    // a submitted one always counts (the decision is still pending). A past-due card stays on the board.
    const stillOpen = listing.deadline === null || listing.deadline >= today;
    if ((open && stillOpen) || app.stage === "submitted") board.totals.inPlayUsd += listing.amountMaxUsd;
    if (open && listing.deadline && listing.deadline >= today && monthOf(listing.deadline) === monthOf(today)) {
      board.totals.dueThisMonth += 1;
    }
    if (app.stage === "matched") {
      // SC-05: value per hour from the stored (unfiltered) reasons, so every reader sees the same order (R2P-5).
      const { valuePerHour } = scoreMatch({
        amountMaxUsd: listing.amountMaxUsd,
        estMinutes: app.estMinutes,
        reasonsCount: app.matchReasons.length,
        unknownsCount: 0,
        daysUntilDeadline,
        reusableStories: reuse.length,
      });
      matched.push({ card, fitScore: app.fitScore, valuePerHour, daysUntilDeadline });
    } else if (app.stage === "planned" || app.stage === "drafting") board.working.push(card);
    else if (app.stage === "submitted") board.submitted.push(card);
    else if (app.stage === "won") {
      board.won.push(card);
      board.totals.wonUsd += app.outcomeUsd ?? 0;
    } else board.lostOrSkipped.push(card);
  }
  board.matched = rankMatches(matched).map((m) => m.card);

  const [latest] = await deps.db
    .select({ ids: sweepRuns.hiddenScholarshipIds })
    .from(sweepRuns)
    .where(eq(sweepRuns.ownerId, studentId))
    .orderBy(desc(sweepRuns.ranAt))
    .limit(1);
  if (latest && latest.ids.length > 0) {
    const scams = await deps.db.select().from(scholarships).where(inArray(scholarships.id, latest.ids)).orderBy(...deadlineOrder);
    for (const s of scams) {
      const flag = s.scamFlags[0];
      if (flag && !flaggedIds.has(s.id)) {
        flaggedIds.add(s.id);
        board.flagged.push({ scholarship: toSummary(s), reason: SCAM_FLAG_TEXT[flag] });
      }
    }
  }
  return board;
}

export async function saveScholarship(
  deps: CoreDeps,
  actor: Actor,
  i: { scholarshipId: string },
): Promise<ScholarshipApplication> {
  const user = requireUser(actor);
  requireUuid(i.scholarshipId, "Scholarship not found");
  const [listing] = await deps.db
    .select()
    .from(scholarships)
    .where(and(eq(scholarships.id, i.scholarshipId), visibleListingWhere(user)));
  if (!listing) throw notFound("Scholarship not found");
  // Saved from search or the detail page: score it now so the card has reasons before the next sweep (R2P-3).
  const match = await matchListingFor(deps, user.userId, listing);
  const t = scholarshipApplications;
  const noReasons = sql`jsonb_array_length(${t.matchReasons}) = 0`;
  const row = firstRow(
    await deps.db
      .insert(t)
      .values({
        ownerId: user.userId,
        scholarshipId: listing.id,
        stage: "planned",
        estMinutes: listing.estMinutes,
        matchReasons: match.reasons,
        fitScore: match.fitScore,
      })
      .onConflictDoUpdate({
        target: [t.ownerId, t.scholarshipId],
        set: {
          stage: sql`case when ${t.stage} in ('matched', 'skipped') then 'planned'::app_stage_enum else ${t.stage} end`,
          matchReasons: sql`case when ${noReasons} then ${JSON.stringify(match.reasons)}::jsonb else ${t.matchReasons} end`,
          fitScore: sql`case when ${noReasons} then ${match.fitScore}::integer else ${t.fitScore} end`,
          updatedAt: deps.clock.now(),
        },
      })
      .returning(),
    "scholarship application",
  );
  return toApplication(row);
}

export async function updateApplication(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  p: ApplicationPatch,
): Promise<ScholarshipApplication> {
  requireUser(actor);
  requireUuid(id, "Application not found");
  const [found] = await deps.db
    .select({ app: scholarshipApplications, listing: scholarships })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(eq(scholarshipApplications.id, id));
  if (!found) throw notFound("Application not found");
  const { app, listing } = found;
  assertOwner(actor, app.ownerId);

  const now = deps.clock.now();
  const set: Partial<typeof scholarshipApplications.$inferInsert> = { updatedAt: now };
  if (p.stage !== undefined) set.stage = p.stage;
  if (p.outcomeUsd !== undefined) set.outcomeUsd = p.outcomeUsd;
  if (p.outcomeRenewable !== undefined) set.outcomeRenewable = p.outcomeRenewable;
  if (p.thankYouSent !== undefined) set.thankYouSent = p.thankYouSent;
  const becameWon = p.stage === "won" && app.stage !== "won";
  if (becameWon) {
    set.outcomeUsd = p.outcomeUsd ?? app.outcomeUsd ?? listing.amountMaxUsd;
    set.outcomeAt = now;
    if (p.outcomeRenewable === undefined && app.outcomeRenewable === null) set.outcomeRenewable = listing.renewable;
  }
  if (p.stage === "submitted" && !app.submittedAt) set.submittedAt = now;
  const timeZone = await userTimeZone(deps.db, app.ownerId);

  const updated = await deps.db.transaction(async (tx) => {
    const row = firstRow(
      await tx.update(scholarshipApplications).set(set).where(and(eq(scholarshipApplications.id, id), eq(scholarshipApplications.ownerId, app.ownerId))).returning(),
      "scholarship application",
    );
    if (becameWon) {
      await tx.insert(planItems).values({
        ownerId: app.ownerId,
        weekStart: weekStartFor(now, timeZone),
        title: `Send a thank-you note to ${listing.provider}`,
        kind: "thank_you",
        refType: "scholarship_application",
        refId: id,
        minutes: 15,
        contributors: ["scout"],
      });
    }
    return row;
  });
  return toApplication(updated);
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/scholarships/board.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scholarships/board.ts packages/core/src/scholarships/board.test.ts
git commit -m "feat(core): scholarship board, saving, and win outcomes"
```

### G6: Local submissions, reports, and the scholarships index

`submitLocalScholarship` creates a `draft`, `submitter_only` listing (slug = name slug + 8 hex chars, provider `Unknown`, amounts 0, no deadline, `cycle = currentSeason(now)`, local area from the student's profile), a `user_submission` catalog task, and a `planned` application for the submitter (`onConflictDoNothing` on `(ownerId, scholarshipId)`, `estMinutes` from the listing), in one transaction, then enqueues `catalog.extract` `{ taskId }` with `singletonKey: "catalog.extract:<taskId>"` so plan 11 extracts and checks the submitted page (SC-07, review-log D18). The application puts every submission on the board, from the web form and the extension alike, so 17's dialog makes one request and 14's `save-page` needs no second call (R2C-12/R2P-12). `reportListing` writes a `catalogReports` row and a `report` catalog task for any listing the user can see (SC-08).

- [ ] **Step 1: Write the failing test**

`packages/core/src/scholarships/submissions.test.ts`:

```ts
import { catalogReports, catalogTasks, eq, scholarshipApplications, scholarships } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { PUBLIC_ACTOR } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { getBoard } from "./board";
import * as scholarshipsModule from "./index";
import { getScholarship, searchScholarships } from "./search";
import { reportListing, submitLocalScholarship } from "./submissions";
import { makeStudent, setup } from "./testkit";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps, { state: "TX", county: "Maple" });
});

describe("submitLocalScholarship", () => {
  it("creates an unverified draft only the submitter can see, plus a review task", async () => {
    const input = { url: "https://maplerotary.example.org/award", name: "Maple Rotary STEM Award", notes: "Flyer at school" };
    const summary = await submitLocalScholarship(ctx.deps, student.actor, input);
    expect(summary).toMatchObject({
      name: "Maple Rotary STEM Award",
      provider: "Unknown",
      amountMinUsd: 0,
      amountMaxUsd: 0,
      deadline: null,
      status: "draft",
      unverified: true,
      localLabel: "Maple County, TX",
    });
    expect(summary.slug).toMatch(/^maple-rotary-stem-award-[0-9a-f]{8}$/);
    const [row] = await ctx.deps.db.select().from(scholarships).where(eq(scholarships.id, summary.id));
    expect(row).toMatchObject({ visibility: "submitter_only", submittedById: student.user.id, cycle: "2026-27" });
    const tasks = await ctx.deps.db.select().from(catalogTasks).where(eq(catalogTasks.scholarshipId, summary.id));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ kind: "user_submission", status: "open", createdById: student.user.id });
    expect(tasks[0]?.payload).toEqual({ type: "user_submission", ...input, submittedById: student.user.id });
    expect(ctx.deps.jobs.sent).toEqual([
      {
        name: "catalog.extract",
        payload: { taskId: tasks[0]?.id },
        opts: { singletonKey: `catalog.extract:${tasks[0]?.id}` },
      },
    ]);

    const mine = await searchScholarships(ctx.deps, student.actor, { page: 1, pageSize: 20 });
    expect(mine.items.map((s) => s.id)).toContain(summary.id);
    const other = await makeStudent(ctx.deps);
    await expect(getScholarship(ctx.deps, other.actor, summary.slug)).rejects.toMatchObject({ code: "not_found" });
    const again = await submitLocalScholarship(ctx.deps, student.actor, input);
    expect(again.slug).not.toBe(summary.slug);
  });

  it("puts the submission on the submitter's board as one planned application (R2C-12)", async () => {
    const input = { url: "https://maplerotary.example.org/award", name: "Maple Rotary STEM Award", notes: "" };
    const summary = await submitLocalScholarship(ctx.deps, student.actor, input);
    const apps = await ctx.deps.db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.scholarshipId, summary.id));
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ ownerId: student.user.id, stage: "planned", estMinutes: summary.estMinutes });
    const board = await getBoard(ctx.deps, student.actor, student.user.id);
    expect(board.working.map((c) => c.scholarship.id)).toEqual([summary.id]);
    expect(board.flagged).toEqual([]);
  });

  it("requires a signed-in user", async () => {
    await expect(
      submitLocalScholarship(ctx.deps, PUBLIC_ACTOR, { url: "https://x.example.org", name: "X", notes: "" }),
    ).rejects.toThrow();
  });
});

describe("reportListing", () => {
  it("records the report and opens an admin task", async () => {
    const listing = await factories.scholarship(ctx.deps.db);
    await reportListing(ctx.deps, student.actor, { scholarshipId: listing.id, reason: "dead_link", details: "404" });
    const [report] = await ctx.deps.db.select().from(catalogReports).where(eq(catalogReports.scholarshipId, listing.id));
    expect(report).toMatchObject({ reporterId: student.user.id, reason: "dead_link", details: "404", status: "open" });
    const [task] = await ctx.deps.db.select().from(catalogTasks).where(eq(catalogTasks.scholarshipId, listing.id));
    expect(task).toMatchObject({ kind: "report", status: "open" });
    expect(task?.payload).toEqual({ type: "report", reportId: report?.id, reason: "dead_link", details: "404" });
  });

  it("returns not_found for listings the user can't see", async () => {
    const retired = await factories.scholarship(ctx.deps.db, { status: "retired" });
    await expect(
      reportListing(ctx.deps, student.actor, { scholarshipId: retired.id, reason: "scam", details: "" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("scholarships index", () => {
  it("exports exactly the contract names", () => {
    expect(Object.keys(scholarshipsModule).sort()).toEqual([
      "buildMatcherProfile",
      "getBoard",
      "getScholarship",
      "lastSweep",
      "listMatches",
      "liveListingWhere",
      "privateScholarshipIds",
      "reportListing",
      "runSweep",
      "saveScholarship",
      "searchScholarships",
      "submitLocalScholarship",
      "updateApplication",
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/scholarships/submissions.test.ts`
Expected: FAIL with `Failed to resolve import "./index" from "src/scholarships/submissions.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/scholarships/submissions.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, catalogReports, catalogTasks, count, eq, inArray, sql, profiles, scholarshipApplications, scholarships } from "@scholarcrew/db";
import {
  type Actor,
  AppError,
  type LocalArea,
  type LocalSubmissionInput,
  type ReportInput,
  type ScholarshipSummary,
  USState,
  notFound,
} from "@scholarcrew/domain";
import { type CoreDeps, currentSeason } from "../shared";
import { firstRow, requireUser } from "./common";
import { slugify } from "./labels";
import { toSummary } from "./mappers";
import { visibleListingWhere } from "./search";

export async function submitLocalScholarship(
  deps: CoreDeps,
  actor: Actor,
  i: LocalSubmissionInput,
): Promise<ScholarshipSummary> {
  const user = requireUser(actor);
  const [p] = await deps.db
    .select({ state: profiles.state, county: profiles.county })
    .from(profiles)
    .where(eq(profiles.userId, user.userId));
  const state = USState.safeParse(p?.state ?? "");
  const localArea: LocalArea = state.success
    ? { national: false, state: state.data, counties: p?.county ? [p.county] : [], cities: [] }
    : { national: false, state: null, counties: [], cities: [] };
  const name = i.name.trim();
  const now = deps.clock.now();
  const { summary, taskId } = await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"local-submission:" + user.userId}))`);
    const [pending] = await tx.select({ n: count() }).from(catalogTasks).where(and(
      eq(catalogTasks.createdById, user.userId), eq(catalogTasks.kind, "user_submission"),
      inArray(catalogTasks.status, ["open", "in_review"])));
    if ((pending?.n ?? 0) >= 10) throw new AppError("limit_reached", "You have 10 submissions waiting for review. We'll get to them soon.");
    const row = firstRow(
      await tx
        .insert(scholarships)
        .values({
          slug: `${slugify(name)}-${randomUUID().replace(/-/g, "").slice(0, 8)}`,
          name,
          provider: "Unknown",
          url: i.url,
          sourceUrl: i.url,
          amountMinUsd: 0,
          amountMaxUsd: 0,
          deadline: null,
          cycle: currentSeason(now),
          localArea,
          requirements: { essays: [], recommendations: 0, transcript: false, serviceHours: null, other: [] },
          status: "draft",
          visibility: "submitter_only",
          submittedById: user.userId,
          verifiedAt: null,
        })
        .returning(),
      "scholarship",
    );
    const task = firstRow(
      await tx
        .insert(catalogTasks)
        .values({
          kind: "user_submission",
          scholarshipId: row.id,
          payload: { type: "user_submission", url: i.url, name, notes: i.notes, submittedById: user.userId },
          createdById: user.userId,
        })
        .returning({ id: catalogTasks.id }),
      "catalog task",
    );
    // Every submission lands on the submitter's board, from the web form and the extension (R2C-12/R2P-12).
    await tx
      .insert(scholarshipApplications)
      .values({ ownerId: user.userId, scholarshipId: row.id, stage: "planned", estMinutes: row.estMinutes })
      .onConflictDoNothing({ target: [scholarshipApplications.ownerId, scholarshipApplications.scholarshipId] });
    return { summary: toSummary(row), taskId: task.id };
  });
  // After commit, so the worker always finds the task. catalog.extract is a deduped queue and needs a key.
  await deps.jobs.enqueue("catalog.extract", { taskId }, { singletonKey: `catalog.extract:${taskId}` });
  return summary;
}

export async function reportListing(deps: CoreDeps, actor: Actor, i: ReportInput): Promise<void> {
  const user = requireUser(actor);
  const [listing] = await deps.db
    .select({ id: scholarships.id })
    .from(scholarships)
    .where(and(eq(scholarships.id, i.scholarshipId), visibleListingWhere(user)));
  if (!listing) throw notFound("Scholarship not found");
  await deps.db.transaction(async (tx) => {
    const report = firstRow(
      await tx
        .insert(catalogReports)
        .values({ scholarshipId: listing.id, reporterId: user.userId, reason: i.reason, details: i.details })
        .returning(),
      "catalog report",
    );
    await tx.insert(catalogTasks).values({
      kind: "report",
      scholarshipId: listing.id,
      payload: { type: "report", reportId: report.id, reason: i.reason, details: i.details },
      createdById: user.userId,
    });
  });
}
```

`packages/core/src/scholarships/index.ts`:

```ts
export { getBoard, saveScholarship, updateApplication } from "./board";
export { buildMatcherProfile, listMatches, privateScholarshipIds } from "./matching";
export { getScholarship, liveListingWhere, searchScholarships } from "./search";
export { reportListing, submitLocalScholarship } from "./submissions";
export { lastSweep, runSweep } from "./sweep";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/scholarships`
Expected: PASS, 6 files, 48 tests (common 5, search 10, matching 8, sweep 7, board 12, submissions 6).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scholarships/submissions.ts packages/core/src/scholarships/submissions.test.ts packages/core/src/scholarships/index.ts
git commit -m "feat(core): local scholarship submissions, reports, and scholarships index"
```

### G7: College catalog search

- [ ] **Step 1: Write the failing test**

`packages/core/src/colleges/catalog.test.ts`:

```ts
import { factories } from "@scholarcrew/db/testing";
import { type CollegeQuery, PUBLIC_ACTOR } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeStudent, setup } from "../scholarships/testkit";
import { getCollege, searchColleges } from "./catalog";

const Q = (o: Partial<CollegeQuery> = {}): CollegeQuery => ({ page: 1, pageSize: 20, ...o });
let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
  const { db } = ctx.deps;
  await factories.college(db, { id: "100001", name: "Maple State University", state: "TX" });
  await factories.college(db, { id: "100002", name: "Cedar College", state: "OK", control: "private_nonprofit" });
  await factories.college(db, { id: "100003", name: "Birch Tech", state: "TX", admitRateX1000: 452 });
});

describe("searchColleges", () => {
  it("filters by name, state, and control, ordered by name", async () => {
    const run = async (o: Partial<CollegeQuery>) =>
      (await searchColleges(ctx.deps, student.actor, Q(o))).items.map((c) => c.name);
    expect(await run({})).toEqual(["Birch Tech", "Cedar College", "Maple State University"]);
    expect(await run({ q: "maple" })).toEqual(["Maple State University"]);
    expect(await run({ state: "tx" })).toEqual(["Birch Tech", "Maple State University"]);
    expect(await run({ control: "private_nonprofit" })).toEqual(["Cedar College"]);
  });

  it("paginates and maps rates to fractions", async () => {
    const page = await searchColleges(ctx.deps, student.actor, Q({ pageSize: 1 }));
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 1 });
    expect(page.items[0]).toMatchObject({ id: "100003", admitRate: 0.452, testPolicy: "optional" });
  });

  it("needs a signed-in user", async () => {
    await expect(searchColleges(ctx.deps, PUBLIC_ACTOR, Q())).rejects.toThrow();
  });
});

describe("getCollege", () => {
  it("returns the full record or not_found", async () => {
    const c = await getCollege(ctx.deps, student.actor, "100001");
    expect(c).toMatchObject({ id: "100001", admitRate: 0.6, deadlines: { RD: "2027-01-15", rolling: false } });
    await expect(getCollege(ctx.deps, student.actor, "999999")).rejects.toMatchObject({ code: "not_found" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/colleges/catalog.test.ts`
Expected: FAIL with `Failed to resolve import "./catalog" from "src/colleges/catalog.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/colleges/mappers.ts`:

```ts
import type { applicationItems, colleges, recRequests, recommenders } from "@scholarcrew/db";
import type {
  AppPlan,
  ApplicationItem,
  College,
  CollegeDeadlines,
  CollegeSummary,
  IsoDate,
  RecRequest,
  Recommender,
} from "@scholarcrew/domain";
import { toIso, toIsoOrNull } from "../shared";

export type CollegeRow = typeof colleges.$inferSelect;

export function deadlineFor(deadlines: CollegeDeadlines, plan: AppPlan): IsoDate | null {
  if (plan === "rolling") return null;
  return deadlines[plan] ?? null;
}

export function toCollege(row: CollegeRow): College {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    city: row.city,
    control: row.control,
    admitRate: row.admitRateX1000 === null ? null : row.admitRateX1000 / 1000,
    costOfAttendanceUsd: row.costOfAttendanceUsd,
    netPriceByIncome: row.netPriceByIncome,
    testPolicy: row.testPolicy,
    superscore: row.superscore,
    cssProfileRequired: row.cssProfileRequired,
    outsidePolicy: row.outsidePolicy,
    meritTiers: row.meritTiers,
    deadlines: row.deadlines,
    requirements: row.requirements,
    aidPriorityDate: row.aidPriorityDate,
    sourceUrl: row.sourceUrl,
    verifiedAt: toIsoOrNull(row.verifiedAt),
  };
}

export function toCollegeSummary(row: CollegeRow): CollegeSummary {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    city: row.city,
    control: row.control,
    admitRate: row.admitRateX1000 === null ? null : row.admitRateX1000 / 1000,
    costOfAttendanceUsd: row.costOfAttendanceUsd,
    testPolicy: row.testPolicy,
  };
}

export function toApplicationItem(row: typeof applicationItems.$inferSelect): ApplicationItem {
  return {
    id: row.id,
    collegeListId: row.collegeListId,
    kind: row.kind,
    label: row.label,
    status: row.status,
    dueOn: row.dueOn,
    essayId: row.essayId,
    updatedAt: toIso(row.updatedAt),
  };
}

export function toRecommender(row: typeof recommenders.$inferSelect): Recommender {
  return { id: row.id, name: row.name, email: row.email, relationship: row.relationship, createdAt: toIso(row.createdAt) };
}

export function toRecRequest(row: typeof recRequests.$inferSelect): RecRequest {
  return {
    id: row.id,
    recommenderId: row.recommenderId,
    collegeListId: row.collegeListId,
    scholarshipApplicationId: row.scholarshipApplicationId,
    helperLinkId: row.helperLinkId,
    status: row.status,
    requestedAt: toIsoOrNull(row.requestedAt),
    updatedAt: toIso(row.updatedAt),
  };
}
```

`packages/core/src/colleges/catalog.ts`:

```ts
import { and, asc, colleges, count, eq, ilike } from "@scholarcrew/db";
import { type Actor, type College, type CollegeQuery, type CollegeSummary, type Page, notFound } from "@scholarcrew/domain";
import type { SQL } from "drizzle-orm";
import { escapeLike, requireUser } from "../scholarships/common";
import type { CoreDeps } from "../shared";
import { toCollege, toCollegeSummary } from "./mappers";

function assertSignedInOrSystem(actor: Actor): void {
  if (actor.kind !== "system") requireUser(actor);
}

export async function searchColleges(deps: CoreDeps, actor: Actor, q: CollegeQuery): Promise<Page<CollegeSummary>> {
  assertSignedInOrSystem(actor);
  const conds: SQL[] = [];
  const text = q.q?.trim();
  if (text) conds.push(ilike(colleges.name, `%${escapeLike(text)}%`));
  if (q.state) conds.push(eq(colleges.state, q.state.toUpperCase()));
  if (q.control) conds.push(eq(colleges.control, q.control));
  const where = conds.length > 0 ? and(...conds) : undefined;
  const [total] = await deps.db.select({ n: count() }).from(colleges).where(where);
  const rows = await deps.db
    .select()
    .from(colleges)
    .where(where)
    .orderBy(asc(colleges.name), asc(colleges.id))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return { items: rows.map(toCollegeSummary), page: q.page, pageSize: q.pageSize, total: total?.n ?? 0 };
}

export async function getCollege(deps: CoreDeps, actor: Actor, id: string): Promise<College> {
  assertSignedInOrSystem(actor);
  const [row] = await deps.db.select().from(colleges).where(eq(colleges.id, id));
  if (!row) throw notFound("College not found");
  return toCollege(row);
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/colleges/catalog.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/colleges/mappers.ts packages/core/src/colleges/catalog.ts packages/core/src/colleges/catalog.test.ts
git commit -m "feat(core): college catalog search and detail"
```

### G8: College list with generated application items

`getCollegeList` returns the current season's non-archived entries (oldest first). `deadline` is `college.deadlines[plan]` (null for `rolling`); `itemsTotal` counts items not marked `not_needed`, `itemsDone` counts `done`; `gapUsd` is null here (plan 08 fills money). `addCollege` enforces `MAX_COLLEGE_LIST` (25 active entries this season → `invalid_input`), rejects a second entry for the same college and season (`conflict`), and creates items in the same transaction: `form`, `transcript`, `counselor_rec` if required, one `teacher_rec` per required teacher ("Teacher recommendation 1", …), one `supplement` per prompt, `test_scores` when the test policy is `required`, `fee_or_waiver` when there's a fee or a waiver, `css_profile` when required. Every item's `dueOn` is the plan deadline; changing the plan moves them. `archiveSeason` archives every active entry and sets `offers.archivedAt` on the student's unarchived offers for the current season's award year and earlier (`2026-27` → award year `2027-28`), so plan 08's offer lists and comparisons drop them (ME-07, review-log D1). It returns the number of college entries archived. Essays, stories, activities, and facts are untouched.

- [ ] **Step 1: Write the failing test**

`packages/core/src/colleges/list.test.ts`:

```ts
import { applicationItems, collegeList, eq, offers } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { MAX_COLLEGE_LIST } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setShare, setup } from "../scholarships/testkit";
import { addCollege, archiveSeason, getCollegeList, removeCollege, updateCollegeEntry } from "./list";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
});

async function fullCollege() {
  return factories.college(ctx.deps.db, {
    id: "200001",
    name: "Maple State University",
    testPolicy: "required",
    cssProfileRequired: true,
    deadlines: { ED: null, EA: "2026-11-01", REA: null, RD: "2027-01-15", rolling: false },
    requirements: {
      supplements: [
        { prompt: "Why Maple State?", wordLimit: 250 },
        { prompt: "Describe a community you belong to.", wordLimit: 300 },
      ],
      teacherRecs: 2,
      counselorRec: true,
      applicationFeeUsd: 50,
      feeWaiverAvailable: true,
      portfolio: false,
      interview: "none",
    },
  });
}

const itemsOf = (entryId: string) =>
  ctx.deps.db.select().from(applicationItems).where(eq(applicationItems.collegeListId, entryId));

describe("addCollege", () => {
  it("creates the entry and one item per requirement, due on the plan deadline", async () => {
    await fullCollege();
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200001", fit: "target", plan: "EA" });
    expect(entry).toMatchObject({
      collegeId: "200001",
      season: "2026-27",
      deadline: "2026-11-01",
      itemsDone: 0,
      itemsTotal: 10,
      gapUsd: null,
      testPolicy: "required",
      college: { name: "Maple State University" },
    });
    const items = await itemsOf(entry.id);
    expect(items.map((i) => i.kind).sort()).toEqual([
      "counselor_rec",
      "css_profile",
      "fee_or_waiver",
      "form",
      "supplement",
      "supplement",
      "teacher_rec",
      "teacher_rec",
      "test_scores",
      "transcript",
    ]);
    expect(items.filter((i) => i.kind === "teacher_rec").map((i) => i.label).sort()).toEqual([
      "Teacher recommendation 1",
      "Teacher recommendation 2",
    ]);
    expect(items.every((i) => i.dueOn === "2026-11-01")).toBe(true);
  });

  it("uses no deadline for rolling plans and only the needed items", async () => {
    await factories.college(ctx.deps.db, { id: "200002" });
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200002", fit: "likely", plan: "rolling" });
    expect(entry.deadline).toBeNull();
    const items = await itemsOf(entry.id);
    expect(items.map((i) => i.kind).sort()).toEqual(["counselor_rec", "fee_or_waiver", "form", "teacher_rec", "transcript"]);
    expect(items.every((i) => i.dueOn === null)).toBe(true);
  });

  it("rejects duplicates, unknown colleges, and a 26th active college", async () => {
    await fullCollege();
    await addCollege(ctx.deps, student.actor, { collegeId: "200001", fit: "target", plan: "RD" });
    await expect(
      addCollege(ctx.deps, student.actor, { collegeId: "200001", fit: "reach", plan: "EA" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      addCollege(ctx.deps, student.actor, { collegeId: "999999", fit: "reach", plan: "RD" }),
    ).rejects.toMatchObject({ code: "not_found" });
    for (let n = 1; n < MAX_COLLEGE_LIST; n += 1) {
      const c = await factories.college(ctx.deps.db, { id: String(300000 + n) });
      await ctx.deps.db
        .insert(collegeList)
        .values({ ownerId: student.user.id, collegeId: c.id, fit: "target", plan: "RD", season: "2026-27" });
    }
    const extra = await factories.college(ctx.deps.db, { id: "399999" });
    await expect(
      addCollege(ctx.deps, student.actor, { collegeId: extra.id, fit: "likely", plan: "RD" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect((await archiveSeason(ctx.deps, student.actor)).archived).toBe(MAX_COLLEGE_LIST);
    expect((await addCollege(ctx.deps, student.actor, { collegeId: extra.id, fit: "likely", plan: "RD" })).id).toBeTruthy();
  });
});

describe("getCollegeList", () => {
  it("lists this season's active entries with item progress", async () => {
    await fullCollege();
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200001", fit: "target", plan: "EA" });
    const [first, second] = await itemsOf(entry.id);
    if (!first || !second) throw new Error("items missing");
    await ctx.deps.db.update(applicationItems).set({ status: "done" }).where(eq(applicationItems.id, first.id));
    await ctx.deps.db.update(applicationItems).set({ status: "not_needed" }).where(eq(applicationItems.id, second.id));
    const old = await factories.college(ctx.deps.db, { id: "200009" });
    await ctx.deps.db
      .insert(collegeList)
      .values({ ownerId: student.user.id, collegeId: old.id, fit: "reach", plan: "RD", season: "2025-26" });
    const list = await getCollegeList(ctx.deps, student.actor, student.user.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: entry.id, itemsDone: 1, itemsTotal: 9 });
  });

  it("follows the colleges share for parents and hides other students' lists", async () => {
    await fullCollege();
    await addCollege(ctx.deps, student.actor, { collegeId: "200001", fit: "target", plan: "EA" });
    const parent = await makeParentOf(ctx.deps, student.user.id);
    expect(await getCollegeList(ctx.deps, parent.actor, student.user.id)).toHaveLength(1);
    await setShare(ctx.deps, student.user.id, "colleges", false);
    await expect(getCollegeList(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    const other = await makeStudent(ctx.deps);
    await expect(getCollegeList(ctx.deps, other.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("updateCollegeEntry, removeCollege, archiveSeason", () => {
  it("moves item due dates with the plan, deletes with items, and archives the season", async () => {
    await fullCollege();
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200001", fit: "target", plan: "EA" });
    const updated = await updateCollegeEntry(ctx.deps, student.actor, entry.id, { plan: "RD", status: "applying" });
    expect(updated).toMatchObject({ plan: "RD", status: "applying", deadline: "2027-01-15" });
    expect((await itemsOf(entry.id)).every((i) => i.dueOn === "2027-01-15")).toBe(true);

    const other = await makeStudent(ctx.deps);
    await expect(updateCollegeEntry(ctx.deps, other.actor, entry.id, { fit: "reach" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(removeCollege(ctx.deps, other.actor, entry.id)).rejects.toMatchObject({ code: "not_found" });

    const [thisYear, nextYear, theirs] = await ctx.deps.db
      .insert(offers)
      .values([
        { ownerId: student.user.id, collegeId: "200001", awardYear: "2027-28" },
        { ownerId: student.user.id, collegeId: "200001", awardYear: "2028-29" },
        { ownerId: other.user.id, collegeId: "200001", awardYear: "2027-28" },
      ])
      .returning();
    expect(await archiveSeason(ctx.deps, student.actor)).toEqual({ archived: 1 });
    expect(await getCollegeList(ctx.deps, student.actor, student.user.id)).toEqual([]);
    const offerRows = await ctx.deps.db.select().from(offers);
    const archivedAt = (id: string | undefined) => offerRows.find((o) => o.id === id)?.archivedAt ?? null;
    expect(archivedAt(thisYear?.id)).toEqual(new Date("2026-10-06T15:00:00.000Z"));
    expect(archivedAt(nextYear?.id)).toBeNull();
    expect(archivedAt(theirs?.id)).toBeNull();
    expect(await archiveSeason(ctx.deps, student.actor)).toEqual({ archived: 0 });

    await removeCollege(ctx.deps, student.actor, entry.id);
    expect(await itemsOf(entry.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/colleges/list.test.ts`
Expected: FAIL with `Failed to resolve import "./list" from "src/colleges/list.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/colleges/list.ts`:

```ts
import { aidChecklistItems,
  type DbOrTx,
  and,
  applicationItems,
  asc,
  collegeList,
  colleges,
  count,
  eq,
  inArray,
  isNull,
  lte,
  offers,
  pgErrorCode,
} from "@scholarcrew/db";
import {
  type Actor,
  type AppPlan,
  type ApplicationItemKind,
  type CollegeListEntry,
  type CollegeListInput,
  type CollegeListPatch,
  MAX_COLLEGE_LIST,
  awardYearFor,
  conflict,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import type { SQL } from "drizzle-orm";
import { assertOwner } from "../access";
import { assertReadable, requireUser } from "../scholarships/common";
import { type CoreDeps, currentSeason, requireUuid, toIso } from "../shared";
import { type CollegeRow, deadlineFor, toCollegeSummary } from "./mappers";

/** Entries matching `where`, with item counts. No access check. */
export async function loadEntries(db: DbOrTx, where: SQL): Promise<CollegeListEntry[]> {
  const rows = await db
    .select({ entry: collegeList, college: colleges })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .where(where)
    .orderBy(asc(collegeList.createdAt), asc(colleges.name));
  if (rows.length === 0) return [];
  const counts = await db
    .select({ entryId: applicationItems.collegeListId, status: applicationItems.status, n: count() })
    .from(applicationItems)
    .where(
      inArray(
        applicationItems.collegeListId,
        rows.map((r) => r.entry.id),
      ),
    )
    .groupBy(applicationItems.collegeListId, applicationItems.status);
  return rows.map(({ entry, college }) => {
    const mine = counts.filter((c) => c.entryId === entry.id);
    return {
      id: entry.id,
      collegeId: entry.collegeId,
      college: toCollegeSummary(college),
      fit: entry.fit,
      plan: entry.plan,
      status: entry.status,
      season: entry.season,
      deadline: deadlineFor(college.deadlines, entry.plan),
      itemsDone: mine.filter((c) => c.status === "done").reduce((s, c) => s + c.n, 0),
      itemsTotal: mine.filter((c) => c.status !== "not_needed").reduce((s, c) => s + c.n, 0),
      gapUsd: null,
      outsidePolicy: college.outsidePolicy,
      testPolicy: college.testPolicy,
      createdAt: toIso(entry.createdAt),
    };
  });
}

export function activeListWhere(ownerId: string): SQL {
  return and(eq(collegeList.ownerId, ownerId), isNull(collegeList.archivedAt)) as SQL;
}

function short(text: string): string {
  const t = text.trim();
  return t.length > 60 ? `${t.slice(0, 57)}...` : t;
}

/** Application items the catalog requirements call for. */
export function buildItems(college: CollegeRow, plan: AppPlan) {
  const dueOn = deadlineFor(college.deadlines, plan);
  const r = college.requirements;
  const items: Array<{ kind: ApplicationItemKind; label: string }> = [
    { kind: "form", label: "Application form" },
    { kind: "transcript", label: "Official transcript" },
  ];
  if (r.counselorRec) items.push({ kind: "counselor_rec", label: "Counselor recommendation" });
  for (let n = 1; n <= r.teacherRecs; n += 1) items.push({ kind: "teacher_rec", label: `Teacher recommendation ${n}` });
  for (const [idx, s] of r.supplements.entries()) {
    items.push({ kind: "supplement", label: `Supplement ${idx + 1}: ${short(s.prompt)}` });
  }
  if (college.testPolicy === "required") items.push({ kind: "test_scores", label: "Send test scores" });
  const fee = r.applicationFeeUsd ?? 0;
  if (fee > 0 || r.feeWaiverAvailable) {
    items.push({ kind: "fee_or_waiver", label: fee > 0 ? `Pay the $${fee} fee or request a waiver` : "Request a fee waiver" });
  }
  if (college.cssProfileRequired) items.push({ kind: "css_profile", label: "CSS Profile" });
  return items.map((i) => ({ ...i, dueOn }));
}

export async function getCollegeList(deps: CoreDeps, actor: Actor, studentId: string): Promise<CollegeListEntry[]> {
  await assertReadable(deps, actor, studentId, "colleges");
  return loadEntries(deps.db, activeListWhere(studentId));
}

export async function addCollege(deps: CoreDeps, actor: Actor, i: CollegeListInput): Promise<CollegeListEntry> {
  const user = requireUser(actor);
  const [college] = await deps.db.select().from(colleges).where(eq(colleges.id, i.collegeId));
  if (!college) throw notFound("College not found");
  const season = currentSeason(deps.clock.now());
  const [active] = await deps.db.select({ n: count() }).from(collegeList).where(activeListWhere(user.userId));
  if ((active?.n ?? 0) >= MAX_COLLEGE_LIST) {
    throw invalidInput(`Your list holds up to ${MAX_COLLEGE_LIST} colleges. Remove one to add another.`);
  }
  const dup = await deps.db
    .select({ id: collegeList.id })
    .from(collegeList)
    .where(and(eq(collegeList.ownerId, user.userId), eq(collegeList.collegeId, college.id), isNull(collegeList.archivedAt)));
  if (dup.length > 0) throw conflict("That college is already on your list.");
  try {
    return await deps.db.transaction(async (tx) => {
      const [entry] = await tx
        .insert(collegeList)
        .values({ ownerId: user.userId, collegeId: college.id, fit: i.fit, plan: i.plan, season })
        .returning();
      if (!entry) throw new Error("college list insert returned no row");
      await tx
        .insert(applicationItems)
        .values(buildItems(college, i.plan).map((item) => ({ ...item, ownerId: user.userId, collegeListId: entry.id })));
      const [created] = await loadEntries(tx, eq(collegeList.id, entry.id));
      if (!created) throw new Error("college list entry missing after insert");
      return created;
    });
  } catch (e) {
    if (pgErrorCode(e) === "23505") throw conflict("That college is already on your list.");
    throw e;
  }
}

async function ownedEntry(deps: CoreDeps, actor: Actor, id: string) {
  requireUuid(id, "College list entry not found");
  const [entry] = await deps.db.select().from(collegeList).where(eq(collegeList.id, id));
  if (!entry) throw notFound("College list entry not found");
  assertOwner(actor, entry.ownerId);
  return entry;
}

export async function updateCollegeEntry(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  p: CollegeListPatch,
): Promise<CollegeListEntry> {
  requireUser(actor);
  const entry = await ownedEntry(deps, actor, id);
  return deps.db.transaction(async (tx) => {
    await tx
      .update(collegeList)
      .set({ fit: p.fit ?? entry.fit, plan: p.plan ?? entry.plan, status: p.status ?? entry.status })
      .where(and(eq(collegeList.id, id), eq(collegeList.ownerId, entry.ownerId)));
    if (p.plan && p.plan !== entry.plan) {
      const [college] = await tx.select().from(colleges).where(eq(colleges.id, entry.collegeId));
      const dueOn = college ? deadlineFor(college.deadlines, p.plan) : null;
      await tx.update(applicationItems).set({ dueOn }).where(eq(applicationItems.collegeListId, id));
    }
    const [updated] = await loadEntries(tx, eq(collegeList.id, id));
    if (!updated) throw notFound("College list entry not found");
    return updated;
  });
}

export async function removeCollege(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  requireUser(actor);
  const entry = await ownedEntry(deps, actor, id);
  await deps.db.transaction(async (tx) => {
    await tx.delete(collegeList).where(and(eq(collegeList.id, id), eq(collegeList.ownerId, entry.ownerId)));
    const [other] = await tx.select({ id: collegeList.id }).from(collegeList)
      .where(and(activeListWhere(entry.ownerId), eq(collegeList.collegeId, entry.collegeId))).limit(1);
    if (!other) await tx.delete(aidChecklistItems).where(and(
      eq(aidChecklistItems.ownerId, entry.ownerId), eq(aidChecklistItems.collegeId, entry.collegeId),
      eq(aidChecklistItems.program, "css")));
  });
}

/** ME-07: archives the active college list and the offers for this season's award year and earlier (`awardYearFor` is 02's, R3V-7). */
export async function archiveSeason(deps: CoreDeps, actor: Actor): Promise<{ archived: number }> {
  const user = requireUser(actor);
  const now = deps.clock.now();
  const awardYear = awardYearFor(currentSeason(now));
  return deps.db.transaction(async (tx) => {
    const rows = await tx
      .update(collegeList)
      .set({ archivedAt: now })
      .where(and(eq(collegeList.ownerId, user.userId), isNull(collegeList.archivedAt)))
      .returning({ id: collegeList.id });
    // "YYYY-YY" award years sort as strings, so lte also catches older unarchived offers.
    await tx
      .update(offers)
      .set({ archivedAt: now })
      .where(and(eq(offers.ownerId, user.userId), lte(offers.awardYear, awardYear), isNull(offers.archivedAt)));
    return { archived: rows.length };
  });
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/colleges/list.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/colleges/list.ts packages/core/src/colleges/list.test.ts
git commit -m "feat(core): college list with generated application items"
```

### G9: Application items, recommenders, and the colleges index

`requestRecommendation` (CO-07, HL-02) checks that the recommender and any target entry or application belong to the student, creates a helper link through `helpers.createHelperLink` (role `recommender`, scope `["activities", "stories"]`, 30 days, label `Recommendation for <recommender name>`), records a `requested` rec request with that link and the student's note (`recRequests.message`, shown on the helper view), and emails the recommender the link and the note. `listRecRequests` returns the student's requests newest first, each with its `helperLinkId` so the page can match it to the link list (D33; the helper URL itself is shown once at creation because the token isn't stored in clear). `updateRecRequest(deps, actor, id, p: RecRequestPatch)` (CO-07, R2P-11) is owner only: it sets `status` to `confirmed`, `submitted`, or `declined` (the schema refuses `requested` and `draft`) and stamps `updatedAt`; a missing or not-yours id is `not_found`. Recommenders are owner only.

- [ ] **Step 1: Write the failing test**

`packages/core/src/colleges/items.test.ts`:

```ts
import { eq, helperLinks, recRequests } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setup } from "../scholarships/testkit";
import * as collegesModule from "./index";
import { listApplicationItems, updateApplicationItem } from "./items";
import { addCollege } from "./list";
import { addRecommender, listRecRequests, listRecommenders, requestRecommendation, updateRecRequest } from "./recommenders";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
  await factories.college(ctx.deps.db, { id: "200002", name: "Cedar College" });
});

describe("application items", () => {
  it("lists items in requirement order and lets the owner update status and essay links", async () => {
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200002", fit: "target", plan: "RD" });
    const items = await listApplicationItems(ctx.deps, student.actor, entry.id);
    expect(items.map((i) => i.kind)).toEqual(["form", "transcript", "counselor_rec", "teacher_rec", "fee_or_waiver"]);
    const essay = await factories.essay(ctx.deps.db, student.user.id);
    const form = items[0];
    if (!form) throw new Error("no items");
    const updated = await updateApplicationItem(ctx.deps, student.actor, form.id, { status: "done", essayId: essay.id });
    expect(updated).toMatchObject({ status: "done", essayId: essay.id });
    const parent = await makeParentOf(ctx.deps, student.user.id);
    expect(await listApplicationItems(ctx.deps, parent.actor, entry.id)).toHaveLength(5);
    await expect(updateApplicationItem(ctx.deps, parent.actor, form.id, { status: "todo" })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("rejects another student's essay and another student's items", async () => {
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200002", fit: "target", plan: "RD" });
    const [item] = await listApplicationItems(ctx.deps, student.actor, entry.id);
    if (!item) throw new Error("no items");
    const other = await makeStudent(ctx.deps);
    const theirEssay = await factories.essay(ctx.deps.db, other.user.id);
    await expect(
      updateApplicationItem(ctx.deps, student.actor, item.id, { essayId: theirEssay.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(listApplicationItems(ctx.deps, other.actor, entry.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("recommenders", () => {
  it("adds and lists the student's own recommenders only", async () => {
    await addRecommender(ctx.deps, student.actor, { name: "Ms. Patel", email: "Patel@School.example", relationship: "AP Physics" });
    const list = await listRecommenders(ctx.deps, student.actor);
    expect(list).toEqual([expect.objectContaining({ name: "Ms. Patel", email: "patel@school.example" })]);
    const other = await makeStudent(ctx.deps);
    expect(await listRecommenders(ctx.deps, other.actor)).toEqual([]);
  });

  it("creates a scoped helper link, records the request, and emails the recommender", async () => {
    const rec = await addRecommender(ctx.deps, student.actor, {
      name: "Ms. Patel",
      email: "patel@school.example",
      relationship: "",
    });
    const entry = await addCollege(ctx.deps, student.actor, { collegeId: "200002", fit: "target", plan: "RD" });
    const request = await requestRecommendation(ctx.deps, student.actor, {
      recommenderId: rec.id,
      collegeListId: entry.id,
      scholarshipApplicationId: null,
      message: "Thanks for considering it!",
    });
    expect(request).toMatchObject({ status: "requested", requestedAt: "2026-10-06T15:00:00.000Z", collegeListId: entry.id });
    const [link] = await ctx.deps.db.select().from(helperLinks).where(eq(helperLinks.studentId, student.user.id));
    expect(link).toMatchObject({ id: request.helperLinkId, helperRole: "recommender", label: "Recommendation for Ms. Patel" });
    expect([...(link?.scope ?? [])].sort()).toEqual(["activities", "stories"]);
    expect(ctx.mails).toHaveLength(1);
    expect(ctx.mails[0]?.to).toBe("patel@school.example");
    expect(ctx.mails[0]?.text).toContain("Thanks for considering it!");
    expect(ctx.mails[0]?.text).toContain("Cedar College");
    expect(ctx.mails[0]?.text).toMatch(/https?:\/\/\S+/);
  });

  it("returns not_found for someone else's recommender or entry", async () => {
    const other = await makeStudent(ctx.deps);
    const theirs = await addRecommender(ctx.deps, other.actor, { name: "Mr. Lee", email: "lee@school.example", relationship: "" });
    const mine = await addRecommender(ctx.deps, student.actor, { name: "Ms. Patel", email: "patel@school.example", relationship: "" });
    const theirEntry = await addCollege(ctx.deps, other.actor, { collegeId: "200002", fit: "target", plan: "RD" });
    const base = { collegeListId: null, scholarshipApplicationId: null, message: "" };
    await expect(
      requestRecommendation(ctx.deps, student.actor, { ...base, recommenderId: theirs.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      requestRecommendation(ctx.deps, student.actor, { ...base, recommenderId: mine.id, collegeListId: theirEntry.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await ctx.deps.db.select().from(recRequests)).toEqual([]);
  });

  it("lists the student's own requests newest first, with their helper link ids", async () => {
    const rec = await addRecommender(ctx.deps, student.actor, { name: "Ms. Patel", email: "patel@school.example", relationship: "" });
    const base = { recommenderId: rec.id, collegeListId: null, scholarshipApplicationId: null, message: "" };
    const first = await requestRecommendation(ctx.deps, student.actor, base);
    ctx.clock.set("2026-10-07T15:00:00.000Z");
    const second = await requestRecommendation(ctx.deps, student.actor, base);
    const list = await listRecRequests(ctx.deps, student.actor);
    expect(list.map((r) => r.id)).toEqual([second.id, first.id]);
    expect(list[0]?.helperLinkId).toBe(second.helperLinkId);
    expect(second.helperLinkId).not.toBe(first.helperLinkId);
    const other = await makeStudent(ctx.deps);
    expect(await listRecRequests(ctx.deps, other.actor)).toEqual([]);
  });

  it("lets only the owner move a request's status and stamps updatedAt (R2P-11)", async () => {
    const rec = await addRecommender(ctx.deps, student.actor, { name: "Ms. Patel", email: "patel@school.example", relationship: "" });
    const request = await requestRecommendation(ctx.deps, student.actor, {
      recommenderId: rec.id,
      collegeListId: null,
      scholarshipApplicationId: null,
      message: "",
    });
    ctx.clock.set("2026-10-09T15:00:00.000Z");
    const agreed = await updateRecRequest(ctx.deps, student.actor, request.id, { status: "confirmed" });
    expect(agreed).toMatchObject({
      id: request.id,
      status: "confirmed",
      requestedAt: "2026-10-06T15:00:00.000Z",
      updatedAt: "2026-10-09T15:00:00.000Z",
    });
    expect((await updateRecRequest(ctx.deps, student.actor, request.id, { status: "submitted" })).status).toBe("submitted");
    expect((await listRecRequests(ctx.deps, student.actor))[0]?.status).toBe("submitted");
    const parent = await makeParentOf(ctx.deps, student.user.id);
    const other = await makeStudent(ctx.deps);
    for (const actor of [parent.actor, other.actor]) {
      await expect(updateRecRequest(ctx.deps, actor, request.id, { status: "declined" })).rejects.toMatchObject({
        code: "not_found",
      });
    }
    await expect(updateRecRequest(ctx.deps, student.actor, "not-a-uuid", { status: "declined" })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("colleges index", () => {
  it("exports exactly the contract names", () => {
    expect(Object.keys(collegesModule).sort()).toEqual([
      "addCollege",
      "addRecommender",
      "archiveSeason",
      "getCollege",
      "getCollegeList",
      "listApplicationItems",
      "listRecRequests",
      "listRecommenders",
      "removeCollege",
      "requestRecommendation",
      "searchColleges",
      "updateApplicationItem",
      "updateCollegeEntry",
      "updateRecRequest",
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/colleges/items.test.ts`
Expected: FAIL with `Failed to resolve import "./index" from "src/colleges/items.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/colleges/items.ts`:

```ts
import { and, applicationItems, asc, collegeList, eq, essays } from "@scholarcrew/db";
import { type Actor, type ApplicationItem, type ApplicationItemPatch, notFound } from "@scholarcrew/domain";
import { assertOwner } from "../access";
import { assertReadable, firstRow } from "../scholarships/common";
import { type CoreDeps, requireUuid } from "../shared";
import { toApplicationItem } from "./mappers";

export async function listApplicationItems(deps: CoreDeps, actor: Actor, entryId: string): Promise<ApplicationItem[]> {
  requireUuid(entryId, "College list entry not found");
  const [entry] = await deps.db.select({ ownerId: collegeList.ownerId }).from(collegeList).where(eq(collegeList.id, entryId));
  if (!entry) throw notFound("College list entry not found");
  await assertReadable(deps, actor, entry.ownerId, "colleges");
  const rows = await deps.db
    .select()
    .from(applicationItems)
    .where(eq(applicationItems.collegeListId, entryId))
    .orderBy(asc(applicationItems.kind), asc(applicationItems.label));
  return rows.map(toApplicationItem);
}

export async function updateApplicationItem(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  p: ApplicationItemPatch,
): Promise<ApplicationItem> {
  requireUser(actor);
  requireUuid(id, "Application item not found");
  const [item] = await deps.db.select().from(applicationItems).where(eq(applicationItems.id, id));
  if (!item) throw notFound("Application item not found");
  assertOwner(actor, item.ownerId);
  if (p.essayId) {
    const [essay] = await deps.db
      .select({ id: essays.id })
      .from(essays)
      .where(and(eq(essays.id, p.essayId), eq(essays.ownerId, item.ownerId)));
    if (!essay) throw notFound("Essay not found");
  }
  const set: Partial<typeof applicationItems.$inferInsert> = { updatedAt: deps.clock.now() };
  if (p.status !== undefined) set.status = p.status;
  if (p.essayId !== undefined) set.essayId = p.essayId;
  const row = firstRow(
    await deps.db.update(applicationItems).set(set).where(and(eq(applicationItems.id, id), eq(applicationItems.ownerId, item.ownerId))).returning(),
    "application item",
  );
  return toApplicationItem(row);
}
```

`packages/core/src/colleges/recommenders.ts`:

```ts
import { helperLinks, gte, isNull, sql,
  and,
  asc,
  collegeList,
  colleges,
  desc,
  eq,
  recRequests,
  recommenders,
  scholarshipApplications,
  scholarships,
  users,
} from "@scholarcrew/db";
import {
  type Actor,
  conflict,
  type RecRequest,
  type RecRequestInput,
  type RecRequestPatch,
  type Recommender,
  type RecommenderInput,
  notFound,
} from "@scholarcrew/domain";
import { assertOwner } from "../access";
import { createHelperLink } from "../helpers";
import { firstRow, requireUser } from "../scholarships/common";
import { type CoreDeps, requireUuid } from "../shared";
import { toRecRequest, toRecommender } from "./mappers";

export async function listRecommenders(deps: CoreDeps, actor: Actor): Promise<Recommender[]> {
  const user = requireUser(actor);
  const rows = await deps.db
    .select()
    .from(recommenders)
    .where(eq(recommenders.ownerId, user.userId))
    .orderBy(asc(recommenders.name));
  return rows.map(toRecommender);
}

/** The student's own recommendation requests, newest first (D33). */
export async function listRecRequests(deps: CoreDeps, actor: Actor): Promise<RecRequest[]> {
  const user = requireUser(actor);
  const rows = await deps.db
    .select()
    .from(recRequests)
    .where(eq(recRequests.ownerId, user.userId))
    .orderBy(desc(recRequests.updatedAt));
  return rows.map(toRecRequest);
}

export async function addRecommender(deps: CoreDeps, actor: Actor, i: RecommenderInput): Promise<Recommender> {
  const user = requireUser(actor);
  const row = firstRow(
    await deps.db
      .insert(recommenders)
      .values({ ownerId: user.userId, name: i.name.trim(), email: i.email.trim().toLowerCase(), relationship: i.relationship })
      .returning(),
    "recommender",
  );
  return toRecommender(row);
}

export async function requestRecommendation(deps: CoreDeps, actor: Actor, i: RecRequestInput): Promise<RecRequest> {
  const user = requireUser(actor);
  const [rec] = await deps.db
    .select()
    .from(recommenders)
    .where(and(eq(recommenders.id, i.recommenderId), eq(recommenders.ownerId, user.userId)));
  if (!rec) throw notFound("Recommender not found");
  const targets: string[] = [];
  if (i.collegeListId) {
    const [entry] = await deps.db
      .select({ name: colleges.name })
      .from(collegeList)
      .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
      .where(and(eq(collegeList.id, i.collegeListId), eq(collegeList.ownerId, user.userId)));
    if (!entry) throw notFound("College list entry not found");
    targets.push(entry.name);
  }
  if (i.scholarshipApplicationId) {
    const [app] = await deps.db
      .select({ name: scholarships.name })
      .from(scholarshipApplications)
      .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
      .where(and(eq(scholarshipApplications.id, i.scholarshipApplicationId), eq(scholarshipApplications.ownerId, user.userId)));
    if (!app) throw notFound("Scholarship application not found");
    targets.push(app.name);
  }
  const [me] = await deps.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, user.userId));
  const studentName = me?.displayName.trim() || "A student";

  const now = deps.clock.now();
  const { link, row } = await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"rec-request:" + user.userId + ":" + rec.id}))`);
    const [duplicate] = await tx.select({ id: recRequests.id }).from(recRequests).where(and(
      eq(recRequests.ownerId, user.userId), eq(recRequests.recommenderId, rec.id),
      i.collegeListId ? eq(recRequests.collegeListId, i.collegeListId) : isNull(recRequests.collegeListId),
      i.scholarshipApplicationId ? eq(recRequests.scholarshipApplicationId, i.scholarshipApplicationId) : isNull(recRequests.scholarshipApplicationId),
      eq(recRequests.status, "requested"), gte(recRequests.requestedAt, new Date(now.getTime() - 86_400_000))));
    if (duplicate) throw conflict(`You already asked ${rec.name} for this one.`);
    const link = await createHelperLink({ ...deps, db: tx as CoreDeps["db"] }, user, {
    label: `Recommendation for ${rec.name}`.slice(0, 80),
    helperRole: "recommender",
    scope: ["activities", "stories"],
    expiresInDays: 30,
  });
  const row = firstRow(
    await tx
      .insert(recRequests)
      .values({
        ownerId: user.userId,
        recommenderId: rec.id,
        collegeListId: i.collegeListId,
        scholarshipApplicationId: i.scholarshipApplicationId,
        helperLinkId: link.link.id,
        message: i.message.trim(),
        status: "requested",
        requestedAt: now,
        updatedAt: now,
      })
      .returning(),
    "rec request",
  );
    return { link, row };
  });
  const lines = [
    `Hi ${rec.name},`,
    "",
    `${studentName} asked you for a letter of recommendation${targets.length > 0 ? ` for ${targets.join(" and ")}` : ""}.`,
  ];
  if (i.message.trim()) lines.push("", "Their note:", i.message.trim());
  lines.push(
    "",
    "Brag sheet (their activities and the stories they chose to share):",
    link.url,
    "",
    "The link works for 30 days and doesn't need an account.",
    "",
    "ScholarCrew",
  );
  try {
  await deps.email.send({
    to: rec.email,
    subject: `${studentName} asked you for a recommendation`,
    text: lines.join("\n"),
  });
  } catch (error) {
    await deps.db.transaction(async (tx) => {
      await tx.update(helperLinks).set({ revokedAt: deps.clock.now() })
        .where(and(eq(helperLinks.id, link.link.id), eq(helperLinks.studentId, user.userId)));
      await tx.delete(recRequests).where(and(eq(recRequests.id, row.id), eq(recRequests.ownerId, user.userId)));
    });
    throw error;
  }
  return toRecRequest(row);
}

/** The student records what the recommender did after the request went out (CO-07, R2P-11). Owner only. */
export async function updateRecRequest(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  p: RecRequestPatch,
): Promise<RecRequest> {
  requireUser(actor);
  requireUuid(id, "Recommendation request not found");
  const [found] = await deps.db.select({ ownerId: recRequests.ownerId }).from(recRequests).where(eq(recRequests.id, id));
  if (!found) throw notFound("Recommendation request not found");
  assertOwner(actor, found.ownerId);
  const row = firstRow(
    await deps.db
      .update(recRequests)
      .set({ status: p.status, updatedAt: deps.clock.now() })
      .where(and(eq(recRequests.id, id), eq(recRequests.ownerId, found.ownerId)))
      .returning(),
    "rec request",
  );
  return toRecRequest(row);
}
```

`packages/core/src/colleges/index.ts`:

```ts
export { getCollege, searchColleges } from "./catalog";
export { listApplicationItems, updateApplicationItem } from "./items";
export { addCollege, archiveSeason, getCollegeList, removeCollege, updateCollegeEntry } from "./list";
export {
  addRecommender,
  listRecRequests,
  listRecommenders,
  requestRecommendation,
  updateRecRequest,
} from "./recommenders";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/colleges`
Expected: PASS, 3 files, 18 tests (catalog 4, list 6, items 8).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/colleges/items.ts packages/core/src/colleges/recommenders.ts packages/core/src/colleges/index.ts packages/core/src/colleges/items.test.ts
git commit -m "feat(core): application items, recommenders, and colleges index"
```

### G10: Essays and versions with optimistic saves

`saveVersion` is owner only (ES-02). It requires `baseVersion === currentVersion` (else `conflict`), then, in one transaction, bumps `currentVersion` with a conditional update (`where currentVersion = baseVersion`, so two concurrent saves can't both win) and inserts the version with `countWords(body)` and the owner as author. `getEssay` returns the latest body, unresolved comments, and `targetLabel` (the college or scholarship name). Every `Essay` carries `latestWordCount`, the current version's word count (null before the first save), so list pages don't fetch each essay (D34). `updateEssay(deps, actor, id, p: EssayPatch)` (R2P-14) is owner only: it sets any of `title` (trimmed), `prompt`, and `status` (`drafting`, `ready`, `submitted`), stamps `updatedAt`, and returns the `Essay` with its `latestWordCount`; versions are untouched. Reads use the `essays` share category, which is off by default for parents.

- [ ] **Step 1: Write the failing test**

`packages/core/src/essays/essays.test.ts`:

```ts
import { factories } from "@scholarcrew/db/testing";
import type { EssayInput } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setShare, setup } from "../scholarships/testkit";
import { createEssay, getEssay, listEssays, listVersions, saveVersion, updateEssay } from "./essays";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

const input = (o: Partial<EssayInput> = {}): EssayInput => ({
  title: "Common App personal essay",
  prompt: "Share an essay on any topic of your choice.",
  wordLimit: 650,
  charLimit: null,
  targetType: "general",
  targetCollegeId: null,
  targetScholarshipId: null,
  ...o,
});

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
});

describe("createEssay and getEssay", () => {
  it("starts empty and labels the target", async () => {
    const essay = await createEssay(ctx.deps, student.actor, input());
    expect(await getEssay(ctx.deps, student.actor, essay.id)).toMatchObject({
      currentVersion: 0,
      body: "",
      wordCount: 0,
      comments: [],
      targetLabel: null,
    });
    await factories.college(ctx.deps.db, { id: "200002", name: "Cedar College" });
    const college = await createEssay(ctx.deps, student.actor, input({ targetType: "college", targetCollegeId: "200002" }));
    expect((await getEssay(ctx.deps, student.actor, college.id)).targetLabel).toBe("Cedar College");
    const listing = await factories.scholarship(ctx.deps.db, { name: "Maple Rotary" });
    const sch = await createEssay(
      ctx.deps,
      student.actor,
      input({ targetType: "scholarship", targetScholarshipId: listing.id }),
    );
    expect((await getEssay(ctx.deps, student.actor, sch.id)).targetLabel).toBe("Maple Rotary");
    const listed = await listEssays(ctx.deps, student.actor, student.user.id);
    expect(listed).toHaveLength(3);
    expect(listed.every((e) => e.latestWordCount === null)).toBe(true);
  });

  it("validates targets", async () => {
    await expect(createEssay(ctx.deps, student.actor, input({ targetType: "college" }))).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      createEssay(ctx.deps, student.actor, input({ targetType: "college", targetCollegeId: "999999" })),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("saveVersion", () => {
  it("creates numbered versions with word counts and rejects stale bases", async () => {
    const essay = await createEssay(ctx.deps, student.actor, input());
    const v1 = await saveVersion(ctx.deps, student.actor, essay.id, { body: "The first STEM night.", baseVersion: 0 });
    expect(v1).toMatchObject({ version: 1, wordCount: 4, authorId: student.user.id });
    await expect(
      saveVersion(ctx.deps, student.actor, essay.id, { body: "Older tab", baseVersion: 0 }),
    ).rejects.toMatchObject({ code: "conflict" });
    await saveVersion(ctx.deps, student.actor, essay.id, { body: "The first STEM night, 30 kids came.", baseVersion: 1 });
    expect((await listVersions(ctx.deps, student.actor, essay.id)).map((v) => v.version)).toEqual([2, 1]);
    expect(await getEssay(ctx.deps, student.actor, essay.id)).toMatchObject({
      currentVersion: 2,
      body: "The first STEM night, 30 kids came.",
      wordCount: 7,
      latestWordCount: 7,
    });
    const [listed] = await listEssays(ctx.deps, student.actor, student.user.id);
    expect(listed).toMatchObject({ id: essay.id, currentVersion: 2, latestWordCount: 7 });
  });

  it("lets only one of two concurrent saves win", async () => {
    const essay = await createEssay(ctx.deps, student.actor, input());
    const results = await Promise.allSettled([
      saveVersion(ctx.deps, student.actor, essay.id, { body: "Tab one", baseVersion: 0 }),
      saveVersion(ctx.deps, student.actor, essay.id, { body: "Tab two", baseVersion: 0 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({ code: "conflict" });
    expect(await listVersions(ctx.deps, student.actor, essay.id)).toHaveLength(1);
  });
});

describe("updateEssay", () => {
  it("lets the owner change title, prompt, and status without touching versions (R2P-14)", async () => {
    const essay = await createEssay(ctx.deps, student.actor, input());
    await saveVersion(ctx.deps, student.actor, essay.id, { body: "The first STEM night.", baseVersion: 0 });
    ctx.clock.set("2026-10-08T15:00:00.000Z");
    const ready = await updateEssay(ctx.deps, student.actor, essay.id, { status: "ready" });
    expect(ready).toMatchObject({
      status: "ready",
      title: "Common App personal essay",
      currentVersion: 1,
      latestWordCount: 4,
      updatedAt: "2026-10-08T15:00:00.000Z",
    });
    const renamed = await updateEssay(ctx.deps, student.actor, essay.id, { title: "  Personal essay  ", prompt: "New prompt" });
    expect(renamed).toMatchObject({ title: "Personal essay", prompt: "New prompt", status: "ready" });
    expect((await listEssays(ctx.deps, student.actor, student.user.id))[0]?.status).toBe("ready");
    expect(await listVersions(ctx.deps, student.actor, essay.id)).toHaveLength(1);
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await setShare(ctx.deps, student.user.id, "essays", true);
    const other = await makeStudent(ctx.deps);
    for (const actor of [parent.actor, other.actor]) {
      await expect(updateEssay(ctx.deps, actor, essay.id, { status: "submitted" })).rejects.toMatchObject({
        code: "not_found",
      });
    }
  });
});

describe("essay access", () => {
  it("needs the essays share for parents, and only the owner saves", async () => {
    const essay = await createEssay(ctx.deps, student.actor, input());
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await expect(getEssay(ctx.deps, parent.actor, essay.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(listEssays(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    await setShare(ctx.deps, student.user.id, "essays", true);
    expect((await getEssay(ctx.deps, parent.actor, essay.id)).id).toBe(essay.id);
    await expect(
      saveVersion(ctx.deps, parent.actor, essay.id, { body: "Parent edit", baseVersion: 0 }),
    ).rejects.toMatchObject({ code: "not_found" });
    const other = await makeStudent(ctx.deps);
    await expect(getEssay(ctx.deps, other.actor, essay.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(listVersions(ctx.deps, other.actor, essay.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/essays/essays.test.ts`
Expected: FAIL with `Failed to resolve import "./essays" from "src/essays/essays.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/essays/mappers.ts`:

```ts
import type { essayComments, essayVersions, essays, stories, storyUses } from "@scholarcrew/db";
import type { Essay, EssayComment, EssayVersion, Story, StoryUse } from "@scholarcrew/domain";
import { toIso, toIsoOrNull } from "../shared";

export type EssayRow = typeof essays.$inferSelect;

/** `latestWordCount` is the word count of version `currentVersion`, or null before the first save. */
export function toEssay(row: EssayRow, latestWordCount: number | null): Essay {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    wordLimit: row.wordLimit,
    charLimit: row.charLimit,
    targetType: row.targetType,
    targetCollegeId: row.targetCollegeId,
    targetScholarshipId: row.targetScholarshipId,
    currentVersion: row.currentVersion,
    latestWordCount,
    status: row.status,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toEssayVersion(row: typeof essayVersions.$inferSelect): EssayVersion {
  return {
    id: row.id,
    essayId: row.essayId,
    version: row.version,
    body: row.body,
    wordCount: row.wordCount,
    authorId: row.authorId,
    createdAt: toIso(row.createdAt),
  };
}

export function toEssayComment(row: typeof essayComments.$inferSelect): EssayComment {
  return {
    id: row.id,
    essayId: row.essayId,
    version: row.version,
    author: row.author,
    kind: row.kind,
    quote: row.quote,
    occurrence: row.occurrence,
    body: row.body,
    resolvedAt: toIsoOrNull(row.resolvedAt),
    createdAt: toIso(row.createdAt),
  };
}

export function toStoryUse(row: typeof storyUses.$inferSelect): StoryUse {
  return {
    id: row.id,
    storyId: row.storyId,
    essayId: row.essayId,
    collegeId: row.collegeId,
    scholarshipId: row.scholarshipId,
    usedAt: toIso(row.usedAt),
  };
}

export function toStory(row: typeof stories.$inferSelect, uses: Story["uses"]): Story {
  return {
    id: row.id,
    title: row.title,
    moment: row.moment,
    themes: row.themes,
    evidence: row.evidence,
    summary: row.summary,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    archivedAt: toIsoOrNull(row.archivedAt),
    uses,
  };
}
```

`packages/core/src/essays/essays.ts`:

```ts
import {
  and,
  asc,
  colleges,
  desc,
  eq,
  essayComments,
  essayVersions,
  essays,
  isNull,
  scholarships,
} from "@scholarcrew/db";
import {
  type Actor,
  type Essay,
  type EssayInput,
  type EssayPatch,
  type EssayVersion,
  type EssayWithBody,
  type SaveVersionInput,
  conflict,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { countWords } from "@scholarcrew/engines";
import { assertOwner } from "../access";
import { assertReadable, firstRow, requireUser } from "../scholarships/common";
import { type CoreDeps, requireUuid } from "../shared";
import { type EssayRow, toEssay, toEssayComment, toEssayVersion } from "./mappers";

const STALE_SAVE = "This essay changed since you opened it. Reload to get the latest version, then save again.";

export async function loadEssay(deps: CoreDeps, id: string): Promise<EssayRow> {
  requireUuid(id, "Essay not found");
  const [row] = await deps.db.select().from(essays).where(eq(essays.id, id));
  if (!row) throw notFound("Essay not found");
  return row;
}

export async function targetLabelFor(deps: CoreDeps, row: EssayRow, actor: Actor): Promise<string | null> {
  if (row.targetType === "college" && row.targetCollegeId) {
    const [c] = await deps.db.select({ name: colleges.name }).from(colleges).where(eq(colleges.id, row.targetCollegeId));
    return c?.name ?? null;
  }
  if (row.targetType === "scholarship" && row.targetScholarshipId) {
    if (!(actor.kind === "user" && actor.userId === row.ownerId) &&
      (await privateScholarshipIds(deps.db, row.ownerId)).has(row.targetScholarshipId)) return "A private scholarship";
    const [s] = await deps.db
      .select({ name: scholarships.name })
      .from(scholarships)
      .where(eq(scholarships.id, row.targetScholarshipId));
    return s?.name ?? null;
  }
  return null;
}

export async function listEssays(deps: CoreDeps, actor: Actor, ownerId: string): Promise<Essay[]> {
  await assertReadable(deps, actor, ownerId, "essays");
  const rows = await deps.db
    .select({ essay: essays, latestWordCount: essayVersions.wordCount })
    .from(essays)
    .leftJoin(
      essayVersions,
      and(eq(essayVersions.essayId, essays.id), eq(essayVersions.version, essays.currentVersion)),
    )
    .where(eq(essays.ownerId, ownerId))
    .orderBy(desc(essays.updatedAt));
  return rows.map((r) => toEssay(r.essay, r.latestWordCount));
}

import { visibleListingWhere } from "../scholarships/search";
import { privateScholarshipIds } from "../scholarships/matching";

export async function createEssay(deps: CoreDeps, actor: Actor, i: EssayInput): Promise<Essay> {
  const user = requireUser(actor);
  const targetCollegeId = i.targetType === "college" ? i.targetCollegeId : null;
  const targetScholarshipId = i.targetType === "scholarship" ? i.targetScholarshipId : null;
  if (i.targetType === "college") {
    if (!targetCollegeId) throw invalidInput("Pick the college this essay is for.");
    const [c] = await deps.db.select({ id: colleges.id }).from(colleges).where(eq(colleges.id, targetCollegeId));
    if (!c) throw notFound("College not found");
  }
  if (i.targetType === "scholarship") {
    if (!targetScholarshipId) throw invalidInput("Pick the scholarship this essay is for.");
    const [s] = await deps.db
      .select({ id: scholarships.id })
      .from(scholarships)
      .where(and(eq(scholarships.id, targetScholarshipId), visibleListingWhere(user)));
    if (!s) throw notFound("Scholarship not found");
  }
  const row = firstRow(
    await deps.db
      .insert(essays)
      .values({
        ownerId: user.userId,
        title: i.title.trim(),
        prompt: i.prompt,
        wordLimit: i.wordLimit,
        charLimit: i.charLimit,
        targetType: i.targetType,
        targetCollegeId,
        targetScholarshipId,
      })
      .returning(),
    "essay",
  );
  return toEssay(row, null);
}

export async function getEssay(deps: CoreDeps, actor: Actor, id: string): Promise<EssayWithBody> {
  const row = await loadEssay(deps, id);
  await assertReadable(deps, actor, row.ownerId, "essays");
  const [latest] =
    row.currentVersion > 0
      ? await deps.db
          .select()
          .from(essayVersions)
          .where(and(eq(essayVersions.essayId, id), eq(essayVersions.version, row.currentVersion)))
      : [];
  const comments = await deps.db
    .select()
    .from(essayComments)
    .where(and(eq(essayComments.essayId, id), isNull(essayComments.resolvedAt)))
    .orderBy(asc(essayComments.createdAt));
  return {
    ...toEssay(row, latest?.wordCount ?? null),
    body: latest?.body ?? "",
    wordCount: latest?.wordCount ?? 0,
    comments: comments.map(toEssayComment),
    targetLabel: await targetLabelFor(deps, row, actor),
  };
}

export async function saveVersion(deps: CoreDeps, actor: Actor, id: string, i: SaveVersionInput): Promise<EssayVersion> {
  requireUser(actor);
  const row = await loadEssay(deps, id);
  assertOwner(actor, row.ownerId);
  if (i.baseVersion !== row.currentVersion) throw conflict(STALE_SAVE);
  const next = i.baseVersion + 1;
  return deps.db.transaction(async (tx) => {
    const bumped = await tx
      .update(essays)
      .set({ currentVersion: next, updatedAt: deps.clock.now() })
      .where(and(eq(essays.id, id), eq(essays.currentVersion, i.baseVersion)))
      .returning({ id: essays.id });
    if (bumped.length === 0) throw conflict(STALE_SAVE);
    const version = firstRow(
      await tx
        .insert(essayVersions)
        .values({ essayId: id, version: next, body: i.body, wordCount: countWords(i.body), authorId: row.ownerId })
        .returning(),
      "essay version",
    );
    return toEssayVersion(version);
  });
}

export async function listVersions(deps: CoreDeps, actor: Actor, id: string): Promise<EssayVersion[]> {
  const row = await loadEssay(deps, id);
  await assertReadable(deps, actor, row.ownerId, "essays");
  const rows = await deps.db
    .select()
    .from(essayVersions)
    .where(eq(essayVersions.essayId, id))
    .orderBy(desc(essayVersions.version));
  return rows.map(toEssayVersion);
}

/** Owner edits to title, prompt, or status (R2P-14). `EssayPatch` guarantees at least one key. */
export async function updateEssay(deps: CoreDeps, actor: Actor, id: string, p: EssayPatch): Promise<Essay> {
  requireUser(actor);
  const row = await loadEssay(deps, id);
  assertOwner(actor, row.ownerId);
  const set: Partial<typeof essays.$inferInsert> = { updatedAt: deps.clock.now() };
  if (p.title !== undefined) set.title = p.title.trim();
  if (p.prompt !== undefined) set.prompt = p.prompt;
  if (p.status !== undefined) set.status = p.status;
  const updated = firstRow(await deps.db.update(essays).set(set).where(and(eq(essays.id, id), eq(essays.ownerId, row.ownerId))).returning(), "essay");
  const [latest] =
    updated.currentVersion > 0
      ? await deps.db
          .select({ wordCount: essayVersions.wordCount })
          .from(essayVersions)
          .where(and(eq(essayVersions.essayId, id), eq(essayVersions.version, updated.currentVersion)))
      : [];
  return toEssay(updated, latest?.wordCount ?? null);
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/essays/essays.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/essays/mappers.ts packages/core/src/essays/essays.ts packages/core/src/essays/essays.test.ts
git commit -m "feat(core): essays and versions with optimistic saves"
```

### G11: Quill review requests and anchored comments

`requestReview` (owner only, needs a saved version) checks `billing.assertCrewAllowance`, inserts a queued `essay_review` crew job with `refId = essayId`, and enqueues `essay.review { jobId, essayId }`. `saveQuillComments` (system) keeps only drafts whose `quote` appears at its `occurrence` in that version's body, stores them with author `quill` and the job id, and is idempotent per job (a retried job returns the comments already stored). `resolveComment` is owner only.

- [ ] **Step 1: Write the failing test**

`packages/core/src/essays/quotes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { occurrenceIndex } from "./quotes";

describe("occurrenceIndex", () => {
  it("finds the nth exact occurrence or returns -1", () => {
    expect(occurrenceIndex("a b a b a", "a", 1)).toBe(0);
    expect(occurrenceIndex("a b a b a", "a", 3)).toBe(8);
    expect(occurrenceIndex("a b a b a", "a", 4)).toBe(-1);
    expect(occurrenceIndex("Thirty kids came", "thirty kids", 1)).toBe(-1);
    expect(occurrenceIndex("anything", "", 1)).toBe(-1);
    expect(occurrenceIndex("anything", "any", 0)).toBe(-1);
  });
});
```

`packages/core/src/essays/review.test.ts`:

```ts
import { crewJobs, eq, essayComments, usageCounters } from "@scholarcrew/db";
import { type EssayInput, systemActor } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setShare, setup } from "../scholarships/testkit";
import { createEssay, getEssay, saveVersion } from "./essays";
import { listComments, requestReview, resolveComment, saveQuillComments } from "./review";

const system = systemActor("test");
const BODY = "We had one extension cord. The cord ran under the door. One cord.";
const input: EssayInput = {
  title: "Rotary essay",
  prompt: "Describe a service project.",
  wordLimit: 500,
  charLimit: null,
  targetType: "general",
  targetCollegeId: null,
  targetScholarshipId: null,
};

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
});

async function savedEssay() {
  const essay = await createEssay(ctx.deps, student.actor, input);
  await saveVersion(ctx.deps, student.actor, essay.id, { body: BODY, baseVersion: 0 });
  return essay;
}

describe("requestReview", () => {
  it("queues an essay_review job and enqueues essay.review", async () => {
    const empty = await createEssay(ctx.deps, student.actor, input);
    await expect(requestReview(ctx.deps, student.actor, empty.id)).rejects.toMatchObject({ code: "invalid_input" });
    const essay = await savedEssay();
    const job = await requestReview(ctx.deps, student.actor, essay.id);
    expect(job).toMatchObject({ kind: "essay_review", status: "queued", refId: essay.id, progress: [] });
    expect(ctx.deps.jobs.sent).toEqual([{ name: "essay.review", payload: { jobId: job.id, essayId: essay.id } }]);
  });

  it("stops at the monthly allowance and is owner only", async () => {
    const essay = await savedEssay();
    await ctx.deps.db.insert(usageCounters).values({ userId: student.user.id, month: "2026-10", crewRequests: 20 });
    await expect(requestReview(ctx.deps, student.actor, essay.id)).rejects.toMatchObject({ code: "limit_reached" });
    expect(await ctx.deps.db.select().from(crewJobs).where(eq(crewJobs.ownerId, student.user.id))).toEqual([]);
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await setShare(ctx.deps, student.user.id, "essays", true);
    await expect(requestReview(ctx.deps, parent.actor, essay.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("saveQuillComments", () => {
  const drafts = [
    { quote: "extension cord", occurrence: 1, kind: "question" as const, body: "What did the cord make possible?" },
    { quote: "cord", occurrence: 3, kind: "clarity" as const, body: "Is this the same cord?" },
    { quote: "cord", occurrence: 4, kind: "clarity" as const, body: "There is no fourth cord." },
    { quote: "thirty kids", occurrence: 1, kind: "structure" as const, body: "Not in the draft." },
  ];

  it("keeps only comments whose quote is at that occurrence, once per job", async () => {
    const essay = await savedEssay();
    const jobId = "00000000-0000-4000-8000-0000000000a1";
    const saved = await saveQuillComments(ctx.deps, system, { essayId: essay.id, ownerId: student.user.id, version: 1, jobId, comments: drafts });
    expect(saved.map((c) => [c.quote, c.occurrence, c.author])).toEqual([
      ["extension cord", 1, "quill"],
      ["cord", 3, "quill"],
    ]);
    const again = await saveQuillComments(ctx.deps, system, { essayId: essay.id, ownerId: student.user.id, version: 1, jobId, comments: drafts });
    expect(again.map((c) => c.id).sort()).toEqual(saved.map((c) => c.id).sort());
    expect(await ctx.deps.db.select().from(essayComments).where(eq(essayComments.essayId, essay.id))).toHaveLength(2);
  });

  it("is system only and needs an existing version", async () => {
    const essay = await savedEssay();
    const jobId = "00000000-0000-4000-8000-0000000000a2";
    await expect(
      saveQuillComments(ctx.deps, student.actor, { essayId: essay.id, ownerId: student.user.id, version: 1, jobId, comments: drafts }),
    ).rejects.toThrow();
    await expect(
      saveQuillComments(ctx.deps, system, { essayId: essay.id, ownerId: student.user.id, version: 9, jobId, comments: drafts }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("listComments and resolveComment", () => {
  it("resolves for the owner only and hides resolved comments from getEssay", async () => {
    const essay = await savedEssay();
    const jobId = "00000000-0000-4000-8000-0000000000a3";
    const [first] = await saveQuillComments(ctx.deps, system, {
      essayId: essay.id, ownerId: student.user.id,
      version: 1,
      jobId,
      comments: [
        { quote: "extension cord", occurrence: 1, kind: "question", body: "Why one cord?" },
        { quote: "under the door", occurrence: 1, kind: "clarity", body: "Which door?" },
      ],
    });
    if (!first) throw new Error("no comment");
    const other = await makeStudent(ctx.deps);
    await expect(resolveComment(ctx.deps, other.actor, first.id)).rejects.toMatchObject({ code: "not_found" });
    await resolveComment(ctx.deps, student.actor, first.id);
    expect((await getEssay(ctx.deps, student.actor, essay.id)).comments.map((c) => c.quote)).toEqual(["under the door"]);
    const all = await listComments(ctx.deps, student.actor, essay.id);
    expect(all).toHaveLength(2);
    expect(all.find((c) => c.id === first.id)?.resolvedAt).toBe("2026-10-06T15:00:00.000Z");
    await expect(listComments(ctx.deps, other.actor, essay.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/core test -- src/essays/quotes.test.ts src/essays/review.test.ts`
Expected: FAIL with `Failed to resolve import "./quotes"` and `Failed to resolve import "./review"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/essays/quotes.ts`:

```ts
/** Index of the nth (1-based) exact occurrence of `quote` in `body`, or -1. */
export function occurrenceIndex(body: string, quote: string, occurrence: number): number {
  if (!quote || occurrence < 1) return -1;
  let from = 0;
  let index = -1;
  for (let n = 0; n < occurrence; n += 1) {
    index = body.indexOf(quote, from);
    if (index === -1) return -1;
    from = index + 1;
  }
  return index;
}
```

`packages/core/src/essays/review.ts`:

```ts
import { and, asc, crewJobs, eq, essayComments, essayVersions, essays, isNull } from "@scholarcrew/db";
import {
  type Actor,
  type CrewJob,
  type EssayComment,
  type QuillCommentDraft,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertOwner } from "../access";
import { assertCrewAllowance } from "../billing";
import { assertReadable, firstRow, requireSystem, requireUser } from "../scholarships/common";
import { toCrewJob } from "../scholarships/mappers";
import { type CoreDeps, requireUuid } from "../shared";
import { loadEssay } from "./essays";
import { toEssayComment } from "./mappers";
import { occurrenceIndex } from "./quotes";

export async function requestReview(deps: CoreDeps, actor: Actor, id: string): Promise<CrewJob> {
  requireUser(actor);
  const essay = await loadEssay(deps, id);
  assertOwner(actor, essay.ownerId);
  if (essay.currentVersion === 0) throw invalidInput("Save a draft before asking Quill to review it.");
  const now = deps.clock.now();
  const job = await deps.db.transaction(async (tx) => {
    await assertCrewAllowance(deps, essay.ownerId, tx);
    return firstRow(await tx.insert(crewJobs).values({
      ownerId: essay.ownerId, kind: "essay_review", status: "queued", refId: id,
      usageMonth: now.toISOString().slice(0, 7), createdAt: now, updatedAt: now,
    }).returning(), "crew job");
  });
  await deps.jobs.enqueue("essay.review", { jobId: job.id, essayId: id });
  return toCrewJob(job);
}

export async function listComments(deps: CoreDeps, actor: Actor, id: string): Promise<EssayComment[]> {
  const essay = await loadEssay(deps, id);
  await assertReadable(deps, actor, essay.ownerId, "essays");
  const rows = await deps.db
    .select()
    .from(essayComments)
    .where(eq(essayComments.essayId, id))
    .orderBy(asc(essayComments.createdAt));
  return rows.map(toEssayComment);
}

export async function resolveComment(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  requireUser(actor);
  requireUuid(id, "Comment not found");
  const [row] = await deps.db
    .select({ ownerId: essays.ownerId })
    .from(essayComments)
    .innerJoin(essays, eq(essays.id, essayComments.essayId))
    .where(eq(essayComments.id, id));
  if (!row) throw notFound("Comment not found");
  assertOwner(actor, row.ownerId);
  await deps.db
    .update(essayComments)
    .set({ resolvedAt: deps.clock.now() })
    .where(and(eq(essayComments.id, id), isNull(essayComments.resolvedAt)));
}

export async function saveQuillComments(
  deps: CoreDeps,
  system: Actor,
  i: { essayId: string; ownerId: string; version: number; jobId: string; comments: QuillCommentDraft[] },
): Promise<EssayComment[]> {
  requireSystem(system);
  const [owned] = await deps.db.select({ id: essays.id }).from(essays)
    .where(and(eq(essays.id, i.essayId), eq(essays.ownerId, i.ownerId)));
  if (!owned) throw notFound("Essay not found");
  const [version] = await deps.db
    .select({ body: essayVersions.body })
    .from(essayVersions)
    .where(and(eq(essayVersions.essayId, i.essayId), eq(essayVersions.version, i.version)));
  if (!version) throw notFound("Essay version not found");
  const existing = await deps.db
    .select()
    .from(essayComments)
    .where(and(eq(essayComments.essayId, i.essayId), eq(essayComments.jobId, i.jobId)))
    .orderBy(asc(essayComments.createdAt));
  if (existing.length > 0) return existing.map(toEssayComment);
  const kept = i.comments.filter((c) => occurrenceIndex(version.body, c.quote, c.occurrence) >= 0);
  if (kept.length === 0) return [];
  const rows = await deps.db
    .insert(essayComments)
    .values(
      kept.map((c) => ({
        essayId: i.essayId,
        version: i.version,
        author: "quill" as const,
        kind: c.kind,
        quote: c.quote,
        occurrence: c.occurrence,
        body: c.body,
        jobId: i.jobId,
      })),
    )
    .returning();
  return rows.map(toEssayComment);
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/core test -- src/essays/quotes.test.ts src/essays/review.test.ts`
Expected: PASS, 2 files, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/essays/quotes.ts packages/core/src/essays/quotes.test.ts packages/core/src/essays/review.ts packages/core/src/essays/review.test.ts
git commit -m "feat(core): Quill review requests and quote-anchored comments"
```

### G12: Story Bank, reuse tracking, and the essays index

Stories (ES-05) are owner-written; reads use the `stories` share category (off by default for parents). `listStories` hides archived stories and attaches each use with its essay title. `linkStory` (ES-07) records the use with the essay's current college or scholarship target and returns the existing use when the pair is already linked. `checkStoryReuse` reports prior uses and whether the story already went to that college or scholarship, with the message `You've already used this story for <name>.`

- [ ] **Step 1: Write the failing test**

`packages/core/src/essays/stories.test.ts`:

```ts
import { factories } from "@scholarcrew/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setShare, setup } from "../scholarships/testkit";
import * as essaysModule from "./index";
import { archiveStory, checkStoryReuse, createStory, linkStory, listStories, updateStory } from "./stories";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;
const storyInput = {
  title: "Library STEM nights",
  moment: "Thirty kids showed up and we had one extension cord.",
  themes: ["service", "leadership"],
  evidence: "Library flyer",
  summary: "Started monthly STEM nights at the public library.",
};

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
  await factories.college(ctx.deps.db, { id: "200002", name: "Cedar College" });
  await factories.college(ctx.deps.db, { id: "200003", name: "Birch Tech" });
});

describe("stories", () => {
  it("creates, updates, lists, and archives", async () => {
    const story = await createStory(ctx.deps, student.actor, storyInput);
    expect(story).toMatchObject({ title: "Library STEM nights", themes: ["service", "leadership"], uses: [], archivedAt: null });
    const updated = await updateStory(ctx.deps, student.actor, story.id, { title: "STEM nights" });
    expect(updated).toMatchObject({ title: "STEM nights", moment: storyInput.moment });
    expect((await listStories(ctx.deps, student.actor, student.user.id)).map((s) => s.id)).toEqual([story.id]);
    await archiveStory(ctx.deps, student.actor, story.id);
    expect(await listStories(ctx.deps, student.actor, student.user.id)).toEqual([]);
  });

  it("follows the stories share for parents and stays owner-only for writes", async () => {
    const story = await createStory(ctx.deps, student.actor, storyInput);
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await expect(listStories(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    await setShare(ctx.deps, student.user.id, "stories", true);
    expect(await listStories(ctx.deps, parent.actor, student.user.id)).toHaveLength(1);
    await expect(updateStory(ctx.deps, parent.actor, story.id, { title: "x" })).rejects.toMatchObject({ code: "not_found" });
    const other = await makeStudent(ctx.deps);
    await expect(archiveStory(ctx.deps, other.actor, story.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("linkStory and checkStoryReuse", () => {
  it("records one use per essay and warns before reusing a story for the same target", async () => {
    const story = await createStory(ctx.deps, student.actor, storyInput);
    const essay = await factories.essay(ctx.deps.db, student.user.id, {
      title: "Cedar supplement",
      targetType: "college",
      targetCollegeId: "200002",
    });
    const use = await linkStory(ctx.deps, student.actor, { storyId: story.id, essayId: essay.id });
    expect(use).toMatchObject({ storyId: story.id, essayId: essay.id, collegeId: "200002", scholarshipId: null });
    expect((await linkStory(ctx.deps, student.actor, { storyId: story.id, essayId: essay.id })).id).toBe(use.id);
    const [listed] = await listStories(ctx.deps, student.actor, student.user.id);
    expect(listed?.uses).toEqual([expect.objectContaining({ essayId: essay.id, essayTitle: "Cedar supplement" })]);

    expect(await checkStoryReuse(ctx.deps, student.actor, { storyId: story.id, collegeId: "200002" })).toEqual({
      storyId: story.id,
      alreadyUsedForTarget: true,
      priorUses: 1,
      message: "You've already used this story for Cedar College.",
    });
    expect(await checkStoryReuse(ctx.deps, student.actor, { storyId: story.id, collegeId: "200003" })).toEqual({
      storyId: story.id,
      alreadyUsedForTarget: false,
      priorUses: 1,
      message: null,
    });
  });

  it("handles scholarship targets and rejects other students' stories or essays", async () => {
    const listing = await factories.scholarship(ctx.deps.db, { name: "Maple Rotary" });
    const story = await createStory(ctx.deps, student.actor, storyInput);
    const essay = await factories.essay(ctx.deps.db, student.user.id, {
      targetType: "scholarship",
      targetScholarshipId: listing.id,
    });
    await linkStory(ctx.deps, student.actor, { storyId: story.id, essayId: essay.id });
    const check = await checkStoryReuse(ctx.deps, student.actor, { storyId: story.id, scholarshipId: listing.id });
    expect(check.message).toBe("You've already used this story for Maple Rotary.");

    const other = await makeStudent(ctx.deps);
    const theirEssay = await factories.essay(ctx.deps.db, other.user.id);
    await expect(
      linkStory(ctx.deps, student.actor, { storyId: story.id, essayId: theirEssay.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(linkStory(ctx.deps, other.actor, { storyId: story.id, essayId: theirEssay.id })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(checkStoryReuse(ctx.deps, other.actor, { storyId: story.id })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("essays index", () => {
  it("exports exactly the contract names", () => {
    expect(Object.keys(essaysModule).sort()).toEqual([
      "archiveStory",
      "checkStoryReuse",
      "createEssay",
      "createStory",
      "getEssay",
      "linkStory",
      "listComments",
      "listEssays",
      "listStories",
      "listVersions",
      "requestReview",
      "resolveComment",
      "saveQuillComments",
      "saveVersion",
      "updateEssay",
      "updateStory",
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/essays/stories.test.ts`
Expected: FAIL with `Failed to resolve import "./index" from "src/essays/stories.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/essays/stories.ts`:

```ts
import { and, asc, colleges, desc, eq, essays, inArray, isNull, scholarships, stories, storyUses } from "@scholarcrew/db";
import {
  type Actor,
  type LinkStoryInput,
  type Story,
  type StoryInput,
  type StoryPatch,
  type StoryReuseCheck,
  type StoryUse,
  notFound,
} from "@scholarcrew/domain";
import { assertOwner, canRead } from "../access";
import { assertReadable, firstRow, requireUser } from "../scholarships/common";
import { type CoreDeps, requireUuid, toIso } from "../shared";
import { toStory, toStoryUse } from "./mappers";

async function usesFor(deps: CoreDeps, storyIds: string[]): Promise<Map<string, Story["uses"]>> {
  const map = new Map<string, Story["uses"]>();
  if (storyIds.length === 0) return map;
  const rows = await deps.db
    .select({
      storyId: storyUses.storyId,
      essayId: storyUses.essayId,
      essayTitle: essays.title,
      collegeId: storyUses.collegeId,
      scholarshipId: storyUses.scholarshipId,
      usedAt: storyUses.usedAt,
    })
    .from(storyUses)
    .innerJoin(essays, eq(essays.id, storyUses.essayId))
    .where(inArray(storyUses.storyId, storyIds))
    .orderBy(asc(storyUses.usedAt));
  for (const r of rows) {
    const list = map.get(r.storyId) ?? [];
    list.push({
      essayId: r.essayId,
      essayTitle: r.essayTitle,
      collegeId: r.collegeId,
      scholarshipId: r.scholarshipId,
      usedAt: toIso(r.usedAt),
    });
    map.set(r.storyId, list);
  }
  return map;
}

async function ownedStory(deps: CoreDeps, actor: Actor, id: string) {
  requireUuid(id, "Story not found");
  const [row] = await deps.db.select().from(stories).where(eq(stories.id, id));
  if (!row) throw notFound("Story not found");
  assertOwner(actor, row.ownerId);
  return row;
}

async function withUses(deps: CoreDeps, row: typeof stories.$inferSelect): Promise<Story> {
  const uses = await usesFor(deps, [row.id]);
  return toStory(row, uses.get(row.id) ?? []);
}

export async function listStories(deps: CoreDeps, actor: Actor, ownerId: string): Promise<Story[]> {
  await assertReadable(deps, actor, ownerId, "stories");
  const rows = await deps.db
    .select()
    .from(stories)
    .where(and(eq(stories.ownerId, ownerId), isNull(stories.archivedAt)))
    .orderBy(desc(stories.updatedAt));
  const uses = await usesFor(
    deps,
    rows.map((r) => r.id),
  );
  const canSeeEssay = actor.kind === "system" || await canRead(deps, actor, ownerId, "essays");
  return rows.map((r) => toStory(r, (uses.get(r.id) ?? []).map((use) => ({
    ...use, essayTitle: canSeeEssay ? use.essayTitle : "",
  }))));
}

export async function createStory(deps: CoreDeps, actor: Actor, i: StoryInput): Promise<Story> {
  const user = requireUser(actor);
  const row = firstRow(
    await deps.db
      .insert(stories)
      .values({
        ownerId: user.userId,
        title: i.title.trim(),
        moment: i.moment,
        themes: i.themes.map((t) => t.trim()).filter((t) => t !== ""),
        evidence: i.evidence,
        summary: i.summary,
      })
      .returning(),
    "story",
  );
  return toStory(row, []);
}

export async function updateStory(deps: CoreDeps, actor: Actor, id: string, p: StoryPatch): Promise<Story> {
  requireUser(actor);
  await ownedStory(deps, actor, id);
  const set: Partial<typeof stories.$inferInsert> = { updatedAt: deps.clock.now() };
  if (p.title !== undefined) set.title = p.title.trim();
  if (p.moment !== undefined) set.moment = p.moment;
  if (p.themes !== undefined) set.themes = p.themes.map((t) => t.trim()).filter((t) => t !== "");
  if (p.evidence !== undefined) set.evidence = p.evidence;
  if (p.summary !== undefined) set.summary = p.summary;
  const row = firstRow(await deps.db.update(stories).set(set).where(and(eq(stories.id, id), eq(stories.ownerId, actor.kind === "user" ? actor.userId : ""))).returning(), "story");
  return withUses(deps, row);
}

export async function archiveStory(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  requireUser(actor);
  await ownedStory(deps, actor, id);
  await deps.db
    .update(stories)
    .set({ archivedAt: deps.clock.now() })
    .where(and(eq(stories.id, id), eq(stories.ownerId, actor.kind === "user" ? actor.userId : ""), isNull(stories.archivedAt)));
}

export async function linkStory(deps: CoreDeps, actor: Actor, i: LinkStoryInput): Promise<StoryUse> {
  requireUser(actor);
  const story = await ownedStory(deps, actor, i.storyId);
  const [essay] = await deps.db
    .select()
    .from(essays)
    .where(and(eq(essays.id, i.essayId), eq(essays.ownerId, story.ownerId)));
  if (!essay) throw notFound("Essay not found");
  const pair = and(eq(storyUses.storyId, story.id), eq(storyUses.essayId, essay.id));
  const [existing] = await deps.db.select().from(storyUses).where(pair);
  if (existing) return toStoryUse(existing);
  await deps.db
    .insert(storyUses)
    .values({
      storyId: story.id,
      essayId: essay.id,
      collegeId: essay.targetType === "college" ? essay.targetCollegeId : null,
      scholarshipId: essay.targetType === "scholarship" ? essay.targetScholarshipId : null,
      usedAt: deps.clock.now(),
    })
    .onConflictDoNothing({ target: [storyUses.storyId, storyUses.essayId] });
  return toStoryUse(firstRow(await deps.db.select().from(storyUses).where(pair), "story use"));
}

export async function checkStoryReuse(
  deps: CoreDeps,
  actor: Actor,
  i: { storyId: string; collegeId?: string; scholarshipId?: string },
): Promise<StoryReuseCheck> {
  const story = await ownedStory(deps, actor, i.storyId);
  const uses = await deps.db.select().from(storyUses).where(eq(storyUses.storyId, story.id));
  const hit = uses.find(
    (u) => (i.collegeId !== undefined && u.collegeId === i.collegeId) ||
      (i.scholarshipId !== undefined && u.scholarshipId === i.scholarshipId),
  );
  let name: string | null = null;
  if (hit?.collegeId && hit.collegeId === i.collegeId) {
    const [c] = await deps.db.select({ name: colleges.name }).from(colleges).where(eq(colleges.id, hit.collegeId));
    name = c?.name ?? "this college";
  } else if (hit?.scholarshipId) {
    const [s] = await deps.db
      .select({ name: scholarships.name })
      .from(scholarships)
      .where(eq(scholarships.id, hit.scholarshipId));
    name = s?.name ?? "this scholarship";
  }
  return {
    storyId: story.id,
    alreadyUsedForTarget: hit !== undefined,
    priorUses: uses.length,
    message: name ? `You've already used this story for ${name}.` : null,
  };
}
```

`packages/core/src/essays/index.ts`:

```ts
export { createEssay, getEssay, listEssays, listVersions, saveVersion, updateEssay } from "./essays";
export { listComments, requestReview, resolveComment, saveQuillComments } from "./review";
export { archiveStory, checkStoryReuse, createStory, linkStory, listStories, updateStory } from "./stories";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/essays`
Expected: PASS, 4 files, 17 tests (essays 6, quotes 1, review 5, stories 5).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/essays/stories.ts packages/core/src/essays/stories.test.ts packages/core/src/essays/index.ts
git commit -m "feat(core): story bank, reuse checks, and essays index"
```

### G13: Test scores, superscores, retake value, and study plans

Scores are owner only (the worker reads them as `system`). `requestRetakeAnalysis` checks the allowance, inserts a queued `retake_analysis` crew job (`refId` = the test), and enqueues `prep.retake { jobId, test, targetComposite }`. `computeRetake` (system) runs `engines.retakeAnalysis` over the student's unarchived college list with the profile GPA and the best official ACT and SAT composites (PR-03). `acceptStudyPlan` adds one `test_prep` plan item per session with contributors `["prep"]` (PR-04).

- [ ] **Step 1: Write the failing test**

`packages/core/src/prep/prep.test.ts`:

```ts
import { and, collegeList, eq, planItems, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { systemActor } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setup } from "../scholarships/testkit";
import * as prepModule from "./index";
import {
  acceptStudyPlan,
  addTestScore,
  computeRetake,
  deleteTestScore,
  getSuperscores,
  listTestScores,
  requestRetakeAnalysis,
} from "./prep";

const system = systemActor("test");
let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps, { gpaX100: 372 });
});

describe("test scores", () => {
  it("adds, lists newest first, superscores official sections, and deletes", async () => {
    const a = await addTestScore(ctx.deps, student.actor, {
      test: "ACT",
      takenOn: "2026-04-11",
      official: true,
      composite: 27,
      sections: { english: 29, math: 25, reading: 28, science: 26 },
    });
    await addTestScore(ctx.deps, student.actor, {
      test: "ACT",
      takenOn: "2026-06-13",
      official: true,
      composite: 28,
      sections: { english: 27, math: 29, reading: 27, science: 28 },
    });
    expect((await listTestScores(ctx.deps, student.actor, student.user.id)).map((s) => s.takenOn)).toEqual([
      "2026-06-13",
      "2026-04-11",
    ]);
    const [act] = await getSuperscores(ctx.deps, student.actor, student.user.id);
    expect(act).toMatchObject({ test: "ACT", sections: { english: 29, math: 29, reading: 28, science: 28 } });
    await deleteTestScore(ctx.deps, student.actor, a.id);
    expect(await listTestScores(ctx.deps, student.actor, student.user.id)).toHaveLength(1);
  });

  it("is owner only, even for parents", async () => {
    const s = await addTestScore(ctx.deps, student.actor, {
      test: "SAT",
      takenOn: "2026-05-02",
      official: true,
      composite: 1350,
      sections: {},
    });
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await expect(listTestScores(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getSuperscores(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteTestScore(ctx.deps, parent.actor, s.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await listTestScores(ctx.deps, system, student.user.id)).toHaveLength(1);
  });
});

describe("retake analysis", () => {
  it("queues a retake_analysis job and enqueues prep.retake", async () => {
    const college = await factories.college(ctx.deps.db, { id: "200001", meritTiers: [
      { label: "Merit", minGpa: 3, minAct: 30, minSat: null, annualUsd: 3000, renewalGpa: 3 },
    ] });
    await ctx.deps.db.insert(collegeList).values({ ownerId: student.user.id, collegeId: college.id, fit: "target", plan: "RD", season: "2026-27" });
    const job = await requestRetakeAnalysis(ctx.deps, student.actor, { test: "ACT", targetComposite: 30 });
    expect(job).toMatchObject({ kind: "retake_analysis", status: "queued", refId: "ACT" });
    expect(ctx.deps.jobs.sent).toEqual([
      { name: "prep.retake", payload: { jobId: job.id, test: "ACT", targetComposite: 30 } },
    ]);
    await ctx.deps.db.insert(usageCounters).values({ userId: student.user.id, month: "2026-10", crewRequests: 20 });
    await expect(
      requestRetakeAnalysis(ctx.deps, student.actor, { test: "ACT", targetComposite: 31 }),
    ).rejects.toMatchObject({ code: "limit_reached" });
  });

  it("computes the dollar difference over the current college list", async () => {
    const college = await factories.college(ctx.deps.db, {
      id: "200001",
      name: "Maple State University",
      meritTiers: [
        { label: "Scholars", minGpa: 3.5, minAct: 27, minSat: null, annualUsd: 3000, renewalGpa: 3.0 },
        { label: "Presidential", minGpa: 3.5, minAct: 30, minSat: null, annualUsd: 6000, renewalGpa: 3.25 },
      ],
    });
    const archived = await factories.college(ctx.deps.db, { id: "200009" });
    await ctx.deps.db.insert(collegeList).values([
      { ownerId: student.user.id, collegeId: college.id, fit: "target", plan: "RD", season: "2026-27" },
      { ownerId: student.user.id, collegeId: archived.id, fit: "target", plan: "RD", season: "2025-26" },
    ]);
    await addTestScore(ctx.deps, student.actor, { test: "ACT", takenOn: "2026-06-13", official: true, composite: 28, sections: {} });
    const analysis = await computeRetake(ctx.deps, system, student.user.id, { test: "ACT", targetComposite: 30 });
    expect(analysis).toMatchObject({ test: "ACT", currentComposite: 28, targetComposite: 30, totalFourYearDeltaUsd: 12000 });
    expect(analysis.rows.map((r) => r.collegeId)).toEqual(["200001"]);
    await expect(
      computeRetake(ctx.deps, student.actor, student.user.id, { test: "ACT", targetComposite: 30 }),
    ).rejects.toThrow();
  });
});

describe("acceptStudyPlan", () => {
  it("adds test_prep plan items credited to Prep", async () => {
    const items = await acceptStudyPlan(ctx.deps, student.actor, {
      sessions: [
        { title: "ACT math: functions", minutes: 45, weekStart: "2026-10-05", dueOn: "2026-10-10" },
        { title: "ACT practice test", minutes: 180, weekStart: "2026-10-12", dueOn: null },
      ],
    });
    expect(items.map((i) => [i.kind, i.weekStart, i.contributors])).toEqual([
      ["test_prep", "2026-10-05", ["prep"]],
      ["test_prep", "2026-10-12", ["prep"]],
    ]);
    const rows = await ctx.deps.db
      .select()
      .from(planItems)
      .where(and(eq(planItems.ownerId, student.user.id), eq(planItems.kind, "test_prep")));
    expect(rows).toHaveLength(2);
  });
});

describe("prep index", () => {
  it("exports exactly the contract names", () => {
    expect(Object.keys(prepModule).sort()).toEqual([
      "acceptStudyPlan",
      "addTestScore",
      "computeRetake",
      "deleteTestScore",
      "getSuperscores",
      "listTestScores",
      "requestRetakeAnalysis",
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/prep`
Expected: FAIL with `Failed to resolve import "./index" from "src/prep/prep.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/prep/prep.ts`:

```ts
import { and, collegeList, colleges, crewJobs, desc, eq, isNull, planItems, profiles, testScores } from "@scholarcrew/db";
import {
  type Actor,
  systemActor,
  invalidInput,
  type CrewJob,
  type PlanItem,
  type RetakeAnalysis,
  type RetakeAnalysisInput,
  type StudySession,
  type Superscore,
  type TestScore,
  type TestScoreInput,
  notFound,
} from "@scholarcrew/domain";
import { retakeAnalysis, superscore } from "@scholarcrew/engines";
import { assertOwner } from "../access";
import { assertCrewAllowance } from "../billing";
import { assertOwnerOrSystem, firstRow, requireSystem, requireUser } from "../scholarships/common";
import { toCrewJob, toPlanItem } from "../scholarships/mappers";
import { type CoreDeps, currentSeason, requireUuid, toIso } from "../shared";

function toTestScore(row: typeof testScores.$inferSelect): TestScore {
  return {
    id: row.id,
    test: row.test,
    takenOn: row.takenOn,
    official: row.official,
    composite: row.composite,
    sections: row.sections,
    createdAt: toIso(row.createdAt),
  };
}

async function loadScores(deps: CoreDeps, ownerId: string): Promise<TestScore[]> {
  const rows = await deps.db
    .select()
    .from(testScores)
    .where(eq(testScores.ownerId, ownerId))
    .orderBy(desc(testScores.takenOn), desc(testScores.createdAt));
  return rows.map(toTestScore);
}

export async function listTestScores(deps: CoreDeps, actor: Actor, ownerId: string): Promise<TestScore[]> {
  assertOwnerOrSystem(actor, ownerId);
  return loadScores(deps, ownerId);
}

export async function addTestScore(deps: CoreDeps, actor: Actor, i: TestScoreInput): Promise<TestScore> {
  const user = requireUser(actor);
  const row = firstRow(
    await deps.db
      .insert(testScores)
      .values({
        ownerId: user.userId,
        test: i.test,
        takenOn: i.takenOn,
        official: i.official,
        composite: i.composite,
        sections: i.sections,
      })
      .returning(),
    "test score",
  );
  return toTestScore(row);
}

export async function deleteTestScore(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  requireUser(actor);
  requireUuid(id, "Test score not found");
  const [row] = await deps.db.select({ ownerId: testScores.ownerId }).from(testScores).where(eq(testScores.id, id));
  if (!row) throw notFound("Test score not found");
  assertOwner(actor, row.ownerId);
  await deps.db.delete(testScores).where(and(eq(testScores.id, id), eq(testScores.ownerId, row.ownerId)));
}

export async function getSuperscores(deps: CoreDeps, actor: Actor, ownerId: string): Promise<Superscore[]> {
  assertOwnerOrSystem(actor, ownerId);
  return superscore(await loadScores(deps, ownerId));
}

export async function requestRetakeAnalysis(deps: CoreDeps, actor: Actor, i: RetakeAnalysisInput): Promise<CrewJob> {
  const user = requireUser(actor);
  const analysis = await computeRetake(deps, systemActor("retake-precheck"), user.userId, i);
  if (analysis.rows.length === 0) throw invalidInput("Add colleges with merit scholarships first.");
  if (analysis.totalFourYearDeltaUsd === 0) throw invalidInput("Pick a target above your best score.");
  const now = deps.clock.now();
  const job = await deps.db.transaction(async (tx) => {
    await assertCrewAllowance(deps, user.userId, tx);
    return firstRow(await tx.insert(crewJobs).values({
      ownerId: user.userId, kind: "retake_analysis", status: "queued", refId: i.test,
      usageMonth: now.toISOString().slice(0, 7), createdAt: now, updatedAt: now,
    }).returning(), "crew job");
  });
  await deps.jobs.enqueue("prep.retake", { jobId: job.id, test: i.test, targetComposite: i.targetComposite });
  return toCrewJob(job);
}

export async function computeRetake(
  deps: CoreDeps,
  system: Actor,
  ownerId: string,
  i: RetakeAnalysisInput,
): Promise<RetakeAnalysis> {
  requireSystem(system);
  const list = await deps.db
    .select({ id: colleges.id, name: colleges.name, meritTiers: colleges.meritTiers })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .where(
      and(
        eq(collegeList.ownerId, ownerId),
        isNull(collegeList.archivedAt),
      ),
    )
    .orderBy(colleges.name);
  const [profile] = await deps.db
    .select({ gpaX100: profiles.gpaUnweightedX100 })
    .from(profiles)
    .where(eq(profiles.userId, ownerId));
  const official = (await loadScores(deps, ownerId)).filter((s) => s.official);
  const best = (test: "ACT" | "SAT") => {
    const values = official.filter((s) => s.test === test).map((s) => s.composite);
    return values.length > 0 ? Math.max(...values) : null;
  };
  const gpaX100 = profile?.gpaX100 ?? null;
  return retakeAnalysis({
    colleges: list,
    gpa: gpaX100 === null ? null : gpaX100 / 100,
    currentAct: best("ACT"),
    currentSat: best("SAT"),
    target: { test: i.test, composite: i.targetComposite },
  });
}

export async function acceptStudyPlan(
  deps: CoreDeps,
  actor: Actor,
  i: { sessions: StudySession[] },
): Promise<PlanItem[]> {
  const user = requireUser(actor);
  if (i.sessions.length === 0) return [];
  const rows = await deps.db
    .insert(planItems)
    .values(
      i.sessions.map((s) => ({
        ownerId: user.userId,
        weekStart: s.weekStart,
        title: s.title,
        kind: "test_prep" as const,
        refType: "prep",
        minutes: s.minutes,
        dueOn: s.dueOn,
        contributors: ["prep" as const],
      })),
    )
    .returning();
  return rows.map(toPlanItem).sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.title.localeCompare(b.title));
}
```

`packages/core/src/prep/index.ts`:

```ts
export {
  acceptStudyPlan,
  addTestScore,
  computeRetake,
  deleteTestScore,
  getSuperscores,
  listTestScores,
  requestRetakeAnalysis,
} from "./prep";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/prep`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/prep
git commit -m "feat(core): test scores, superscores, retake value, and study plans"
```

### G14: Service logs and supervisor verification

Service logs (IM-01) are owner-written and read under the `activities` share category. Editing the organization, activity, date, minutes, or supervisor email of a log that isn't `self_reported` drops it back to `self_reported` and voids any open link, so a verification always matches what the supervisor saw. `requestVerification` (IM-02) needs a supervisor email, stores only `sha256Hex(token)`, expires in 14 days, sets `requested`, and emails `${appUrl}/verify-hours/<token>` naming the student by first name only. The email writes the service date as "Sep 12" (`calendarShort`) and the expiry as an instant in the student's `users.timeZone` with the zone named (`instantInZone`, "Oct 20, 2026, 10:00 AM CDT"), R3E-8. `getVerificationRequest` returns null for unknown, expired, or answered tokens. `submitVerification` sets `verified` or `declined` with the note, clears the token hash, and records an audit event. Every `ServiceLog` carries `verificationExpiresAt` (null when no link is open), so the student's page can show "Link expired" on a lapsed `requested` log and offer a new request (R2P-10).

- [ ] **Step 1: Write the failing test**

`packages/core/src/impact/service.test.ts`:

```ts
import { auditEvents, eq, serviceLogs } from "@scholarcrew/db";
import type { ServiceLogInput } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setShare, setup } from "../scholarships/testkit";
import { addServiceLog, deleteServiceLog, listServiceLogs, updateServiceLog } from "./service";
import { getVerificationRequest, requestVerification, submitVerification } from "./verification";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

const log = (o: Partial<ServiceLogInput> = {}): ServiceLogInput => ({
  organization: "Maple Public Library",
  activity: "STEM night",
  servedOn: "2026-09-12",
  minutes: 150,
  supervisorName: "Ms. Ortiz",
  supervisorEmail: "ortiz@library.example",
  reflection: "",
  ...o,
});

const tokenFrom = (text: string | undefined) => /verify-hours\/(\S+)/.exec(text ?? "")?.[1] ?? "";

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
});

describe("service logs", () => {
  it("adds, lists newest first, updates, and deletes", async () => {
    await addServiceLog(ctx.deps, student.actor, log({ servedOn: "2026-08-01" }));
    const b = await addServiceLog(ctx.deps, student.actor, log());
    expect(b).toMatchObject({ verification: "self_reported", minutes: 150, verifiedAt: null, verificationExpiresAt: null });
    expect((await listServiceLogs(ctx.deps, student.actor, student.user.id)).map((l) => l.servedOn)).toEqual([
      "2026-09-12",
      "2026-08-01",
    ]);
    expect((await updateServiceLog(ctx.deps, student.actor, b.id, { reflection: "Kids loved it" })).reflection).toBe(
      "Kids loved it",
    );
    await deleteServiceLog(ctx.deps, student.actor, b.id);
    expect(await listServiceLogs(ctx.deps, student.actor, student.user.id)).toHaveLength(1);
  });

  it("drops verification when verified details change", async () => {
    const a = await addServiceLog(ctx.deps, student.actor, log());
    await ctx.deps.db
      .update(serviceLogs)
      .set({ verification: "verified", verifiedAt: new Date() })
      .where(eq(serviceLogs.id, a.id));
    expect((await updateServiceLog(ctx.deps, student.actor, a.id, { reflection: "ok" })).verification).toBe("verified");
    const changed = await updateServiceLog(ctx.deps, student.actor, a.id, { minutes: 240 });
    expect(changed).toMatchObject({ verification: "self_reported", verifiedAt: null, minutes: 240 });
  });

  it("follows the activities share for parents and stays owner-only for writes", async () => {
    const a = await addServiceLog(ctx.deps, student.actor, log());
    const parent = await makeParentOf(ctx.deps, student.user.id);
    expect(await listServiceLogs(ctx.deps, parent.actor, student.user.id)).toHaveLength(1);
    await expect(updateServiceLog(ctx.deps, parent.actor, a.id, { minutes: 1 })).rejects.toMatchObject({ code: "not_found" });
    await setShare(ctx.deps, student.user.id, "activities", false);
    await expect(listServiceLogs(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    const other = await makeStudent(ctx.deps);
    await expect(deleteServiceLog(ctx.deps, other.actor, a.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("supervisor verification", () => {
  it("needs a supervisor email", async () => {
    const a = await addServiceLog(ctx.deps, student.actor, log({ supervisorEmail: "" }));
    await expect(requestVerification(ctx.deps, student.actor, a.id)).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("emails a 14-day link with the first name only, then records the supervisor's answer once", async () => {
    const a = await addServiceLog(ctx.deps, student.actor, log());
    const requested = await requestVerification(ctx.deps, student.actor, a.id);
    expect(requested).toMatchObject({ verification: "requested", verificationExpiresAt: "2026-10-20T15:00:00.000Z" });
    expect((await listServiceLogs(ctx.deps, student.actor, student.user.id))[0]?.verificationExpiresAt).toBe(
      "2026-10-20T15:00:00.000Z",
    );
    expect(ctx.mails).toHaveLength(1);
    const mail = ctx.mails[0];
    expect(mail?.to).toBe("ortiz@library.example");
    expect(mail?.text).toContain(`${ctx.deps.config.appUrl}/verify-hours/`);
    expect(mail?.text).toContain("Test");
    expect(mail?.text).not.toContain("Test Student");
    // R3E-8: calendar dates read "Sep 12"; the expiry is an instant in the student's zone, with the zone named.
    expect(mail?.text).toContain("STEM night on Sep 12: 2.5 hours");
    expect(mail?.text).toContain("The link expires Oct 20, 2026, 10:00 AM CDT.");
    expect(mail?.text).not.toContain("2026-10-20");
    const token = tokenFrom(mail?.text);
    const [stored] = await ctx.deps.db.select().from(serviceLogs).where(eq(serviceLogs.id, a.id));
    expect(stored?.verificationTokenHash).not.toBe(token);
    expect(stored?.verificationExpiresAt?.toISOString()).toBe("2026-10-20T15:00:00.000Z");

    expect(await getVerificationRequest(ctx.deps, token)).toEqual({
      studentFirstName: "Test",
      organization: "Maple Public Library",
      activity: "STEM night",
      servedOn: "2026-09-12",
      minutes: 150,
      expiresAt: "2026-10-20T15:00:00.000Z",
    });
    expect(await getVerificationRequest(ctx.deps, "wrong-token")).toBeNull();

    await submitVerification(ctx.deps, token, { confirmed: true, note: "Thanks, Maya!" });
    const [done] = await ctx.deps.db.select().from(serviceLogs).where(eq(serviceLogs.id, a.id));
    expect(done).toMatchObject({ verification: "verified", verifierNote: "Thanks, Maya!", verificationTokenHash: null });
    expect(done?.verifiedAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    expect(await getVerificationRequest(ctx.deps, token)).toBeNull();
    await expect(submitVerification(ctx.deps, token, { confirmed: false, note: "" })).rejects.toMatchObject({
      code: "not_found",
    });
    const audits = await ctx.deps.db.select().from(auditEvents).where(eq(auditEvents.entityId, a.id));
    expect(audits.map((e) => e.action)).toContain("service_log.verified");
    await expect(requestVerification(ctx.deps, student.actor, a.id)).rejects.toMatchObject({ code: "conflict" });
  });

  it("expires after 14 days and records declines", async () => {
    const a = await addServiceLog(ctx.deps, student.actor, log());
    await requestVerification(ctx.deps, student.actor, a.id);
    const oldToken = tokenFrom(ctx.mails[0]?.text);
    ctx.clock.set("2026-10-21T15:00:00.000Z");
    expect(await getVerificationRequest(ctx.deps, oldToken)).toBeNull();
    const [lapsed] = await listServiceLogs(ctx.deps, student.actor, student.user.id);
    expect(lapsed).toMatchObject({ verification: "requested", verificationExpiresAt: "2026-10-20T15:00:00.000Z" });
    await expect(submitVerification(ctx.deps, oldToken, { confirmed: true, note: "" })).rejects.toMatchObject({
      code: "not_found",
    });
    const resent = await requestVerification(ctx.deps, student.actor, a.id);
    expect(resent.verificationExpiresAt).toBe("2026-11-04T15:00:00.000Z");
    const fresh = tokenFrom(ctx.mails[1]?.text);
    expect(fresh).not.toBe(oldToken);
    await submitVerification(ctx.deps, fresh, { confirmed: false, note: "Wrong date" });
    const [row] = await ctx.deps.db.select().from(serviceLogs).where(eq(serviceLogs.id, a.id));
    expect(row).toMatchObject({ verification: "declined", verifiedAt: null, verifierNote: "Wrong date" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/impact/service.test.ts`
Expected: FAIL with `Failed to resolve import "./service" from "src/impact/service.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/impact/mappers.ts`:

```ts
import type { activities, serviceLogs } from "@scholarcrew/db";
import type { Activity, ServiceLog } from "@scholarcrew/domain";
import { toIso, toIsoOrNull } from "../shared";

export function toServiceLog(row: typeof serviceLogs.$inferSelect): ServiceLog {
  return {
    id: row.id,
    organization: row.organization,
    activity: row.activity,
    servedOn: row.servedOn,
    minutes: row.minutes,
    supervisorName: row.supervisorName,
    supervisorEmail: row.supervisorEmail,
    verification: row.verification,
    // Lets 17 show "Link expired" and offer a new request once a `requested` link lapses (R2P-10).
    verificationExpiresAt: toIsoOrNull(row.verificationExpiresAt),
    verifiedAt: toIsoOrNull(row.verifiedAt),
    verifierNote: row.verifierNote,
    reflection: row.reflection,
    createdAt: toIso(row.createdAt),
  };
}

export function toActivity(row: typeof activities.$inferSelect): Activity {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    role: row.role,
    organization: row.organization,
    description: row.description,
    hoursPerWeek: row.hoursPerWeek,
    weeksPerYear: row.weeksPerYear,
    grades: row.grades,
    category: row.category,
  };
}
```

`packages/core/src/impact/service.ts`:

```ts
import { and,  desc, eq, serviceLogs } from "@scholarcrew/db";
import { type Actor, type ServiceLog, type ServiceLogInput, type ServiceLogPatch, notFound } from "@scholarcrew/domain";
import { assertOwner } from "../access";
import { assertReadable, firstRow, requireUser } from "../scholarships/common";
import { type CoreDeps, requireUuid } from "../shared";
import { toServiceLog } from "./mappers";

export async function ownedLog(deps: CoreDeps, actor: Actor, id: string) {
  requireUuid(id, "Service log not found");
  const [row] = await deps.db.select().from(serviceLogs).where(eq(serviceLogs.id, id));
  if (!row) throw notFound("Service log not found");
  assertOwner(actor, row.ownerId);
  return row;
}

export async function listServiceLogs(deps: CoreDeps, actor: Actor, ownerId: string): Promise<ServiceLog[]> {
  await assertReadable(deps, actor, ownerId, "activities");
  const rows = await deps.db
    .select()
    .from(serviceLogs)
    .where(eq(serviceLogs.ownerId, ownerId))
    .orderBy(desc(serviceLogs.servedOn), desc(serviceLogs.createdAt));
  return rows.map(toServiceLog);
}

export async function addServiceLog(deps: CoreDeps, actor: Actor, i: ServiceLogInput): Promise<ServiceLog> {
  const user = requireUser(actor);
  const row = firstRow(
    await deps.db
      .insert(serviceLogs)
      .values({
        ownerId: user.userId,
        organization: i.organization.trim(),
        activity: i.activity.trim(),
        servedOn: i.servedOn,
        minutes: i.minutes,
        supervisorName: i.supervisorName.trim(),
        supervisorEmail: i.supervisorEmail.trim().toLowerCase(),
        reflection: i.reflection,
      })
      .returning(),
    "service log",
  );
  return toServiceLog(row);
}

export async function updateServiceLog(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  p: ServiceLogPatch,
): Promise<ServiceLog> {
  requireUser(actor);
  const row = await ownedLog(deps, actor, id);
  const set: Partial<typeof serviceLogs.$inferInsert> = {};
  if (p.organization !== undefined) set.organization = p.organization.trim();
  if (p.activity !== undefined) set.activity = p.activity.trim();
  if (p.servedOn !== undefined) set.servedOn = p.servedOn;
  if (p.minutes !== undefined) set.minutes = p.minutes;
  if (p.supervisorName !== undefined) set.supervisorName = p.supervisorName.trim();
  if (p.supervisorEmail !== undefined) set.supervisorEmail = p.supervisorEmail.trim().toLowerCase();
  if (p.reflection !== undefined) set.reflection = p.reflection;
  const changed =
    (set.organization !== undefined && set.organization !== row.organization) ||
    (set.activity !== undefined && set.activity !== row.activity) ||
    (set.servedOn !== undefined && set.servedOn !== row.servedOn) ||
    (set.minutes !== undefined && set.minutes !== row.minutes) ||
    (set.supervisorEmail !== undefined && set.supervisorEmail !== row.supervisorEmail);
  if (changed && row.verification !== "self_reported") {
    set.verification = "self_reported";
    set.verifiedAt = null;
    set.verifierNote = "";
    set.verificationTokenHash = null;
    set.verificationExpiresAt = null;
  }
  if (Object.keys(set).length === 0) return toServiceLog(row);
  const updated = firstRow(
    await deps.db.update(serviceLogs).set(set).where(and(eq(serviceLogs.id, id), eq(serviceLogs.ownerId, row.ownerId))).returning(),
    "service log",
  );
  return toServiceLog(updated);
}

export async function deleteServiceLog(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  requireUser(actor);
  const row = await ownedLog(deps, actor, id);
  await deps.db.delete(serviceLogs).where(and(eq(serviceLogs.id, id), eq(serviceLogs.ownerId, row.ownerId)));
}
```

`packages/core/src/impact/verification.ts`:

```ts
import { and, eq, serviceLogs, users } from "@scholarcrew/db";
import {
  type Actor,
  PUBLIC_ACTOR,
  type ServiceLog,
  type VerificationRequestView,
  type VerificationSubmitInput,
  conflict,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { recordAudit } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import { firstName, firstRow, hoursFromMinutes, requireUser } from "../scholarships/common";
import { type CoreDeps, calendarShort, instantInZone, toIso } from "../shared";
import { toServiceLog } from "./mappers";
import { ownedLog } from "./service";

export const VERIFY_LINK_DAYS = 14;

export async function requestVerification(deps: CoreDeps, actor: Actor, id: string): Promise<ServiceLog> {
  requireUser(actor);
  const row = await ownedLog(deps, actor, id);
  if (!row.supervisorEmail) throw invalidInput("Add your supervisor's email before asking them to confirm.");
  if (row.verification === "verified") throw conflict("These hours are already verified.");
  const token = randomToken();
  const now = deps.clock.now();
  if (row.verification === "requested" && row.verificationExpiresAt &&
    row.verificationExpiresAt.getTime() > now.getTime() + 13 * 86_400_000)
    throw conflict("We sent that request today. The link in it still works.");
  const expiresAt = new Date(now.getTime() + VERIFY_LINK_DAYS * 86_400_000);
  const updated = firstRow(
    await deps.db
      .update(serviceLogs)
      .set({
        verification: "requested",
        verificationTokenHash: sha256Hex(token),
        verificationExpiresAt: expiresAt,
        verifiedAt: null,
        verifierNote: "",
      })
      .where(and(eq(serviceLogs.id, id), eq(serviceLogs.ownerId, row.ownerId)))
      .returning(),
    "service log",
  );
  const [owner] = await deps.db
    .select({ displayName: users.displayName, timeZone: users.timeZone })
    .from(users)
    .where(eq(users.id, row.ownerId));
  const name = firstName(owner?.displayName ?? "");
  const studentTimeZone = owner?.timeZone ?? "America/Chicago";
  await deps.email.send({
    to: row.supervisorEmail,
    subject: `Can you confirm ${name}'s volunteer hours?`,
    text: [
      `Hi ${row.supervisorName || "there"},`,
      "",
      `${name} logged volunteer hours with ${row.organization} and asked you to confirm them:`,
      "",
      `${row.activity} on ${calendarShort(row.servedOn)}: ${hoursFromMinutes(row.minutes)} hours`,
      "",
      "Confirm or decline here (no account needed):",
      `${deps.config.appUrl}/verify-hours/${token}`,
      "",
      // R3E-8: the link dies at this instant; a UTC date could read a day late for the supervisor.
      `The link expires ${instantInZone(expiresAt, studentTimeZone)}.`,
      "",
      "ScholarCrew",
    ].join("\n"),
  });
  return toServiceLog(updated);
}

async function findOpenRequest(deps: CoreDeps, token: string) {
  if (!token) return null;
  const [row] = await deps.db
    .select({ log: serviceLogs, displayName: users.displayName })
    .from(serviceLogs)
    .innerJoin(users, eq(users.id, serviceLogs.ownerId))
    .where(eq(serviceLogs.verificationTokenHash, sha256Hex(token)));
  if (!row) return null;
  const expires = row.log.verificationExpiresAt;
  if (row.log.verification !== "requested" || !expires || expires.getTime() <= deps.clock.now().getTime()) return null;
  return row;
}

export async function getVerificationRequest(deps: CoreDeps, token: string): Promise<VerificationRequestView | null> {
  const found = await findOpenRequest(deps, token);
  if (!found || !found.log.verificationExpiresAt) return null;
  return {
    studentFirstName: firstName(found.displayName),
    organization: found.log.organization,
    activity: found.log.activity,
    servedOn: found.log.servedOn,
    minutes: found.log.minutes,
    expiresAt: toIso(found.log.verificationExpiresAt),
  };
}

export async function submitVerification(deps: CoreDeps, token: string, i: VerificationSubmitInput): Promise<void> {
  const found = await findOpenRequest(deps, token);
  if (!found) throw notFound("This link has expired or was already used.");
  const now = deps.clock.now();
  const rows = await deps.db
    .update(serviceLogs)
    .set({
      verification: i.confirmed ? "verified" : "declined",
      verifiedAt: i.confirmed ? now : null,
      verifierNote: i.note.trim(),
      verificationTokenHash: null,
      verificationExpiresAt: null,
    })
    .where(and(eq(serviceLogs.id, found.log.id), eq(serviceLogs.verificationTokenHash, sha256Hex(token))))
    .returning({ id: serviceLogs.id });
  if (rows.length === 0) throw notFound("This link has expired or was already used.");
  await recordAudit(deps, {
    actor: PUBLIC_ACTOR,
    action: i.confirmed ? "service_log.verified" : "service_log.declined",
    entityType: "service_log",
    entityId: found.log.id,
  });
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/impact/service.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/impact/mappers.ts packages/core/src/impact/service.ts packages/core/src/impact/verification.ts packages/core/src/impact/service.test.ts
git commit -m "feat(core): service logs with expiring supervisor verification"
```

### G15: Activities, requirement progress, and the impact index

`upsertActivity` (IM-04) writes by `(ownerId, position)`; positions are 1..10 by schema, so the list never exceeds 10 and the 150-code-point description limit is enforced by `ActivityInput`. `getRequirementProgress` (IM-03) covers the student's open applications (`matched`, `planned`, `drafting`, `submitted`) whose listing requires service hours and still passes `liveListingWhere(scholarshipApplications.ownerId)`, so retired and scam-flagged listings drop out (R2P-4): `verifiedHours` counts verified logs, `totalHours` counts every log except declined ones, both rounded to one decimal.

- [ ] **Step 1: Write the failing test**

`packages/core/src/impact/activities.test.ts`:

```ts
import { scholarshipApplications, serviceLogs } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { ActivityInput } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setup } from "../scholarships/testkit";
import { deleteActivity, getRequirementProgress, listActivities, upsertActivity } from "./activities";
import * as impactModule from "./index";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

const activity = (o: Partial<ActivityInput> = {}): ActivityInput => ({
  position: 1,
  name: "Robotics team",
  role: "Build lead",
  organization: "Maple High",
  description: "é".repeat(150),
  hoursPerWeek: 8,
  weeksPerYear: 30,
  grades: [10, 11, 12],
  category: "STEM",
  ...o,
});

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
});

describe("activities", () => {
  it("upserts by position, lists in order, and deletes", async () => {
    const first = await upsertActivity(ctx.deps, student.actor, activity());
    expect(first.description).toHaveLength(150);
    const replaced = await upsertActivity(ctx.deps, student.actor, activity({ name: "Robotics captain" }));
    expect(replaced.id).toBe(first.id);
    await upsertActivity(ctx.deps, student.actor, activity({ position: 2, name: "Library STEM nights" }));
    expect((await listActivities(ctx.deps, student.actor, student.user.id)).map((a) => a.name)).toEqual([
      "Robotics captain",
      "Library STEM nights",
    ]);
    await deleteActivity(ctx.deps, student.actor, first.id);
    expect(await listActivities(ctx.deps, student.actor, student.user.id)).toHaveLength(1);
  });

  it("lets sharing parents read and keeps deletes owner-only", async () => {
    const a = await upsertActivity(ctx.deps, student.actor, activity());
    const parent = await makeParentOf(ctx.deps, student.user.id);
    expect(await listActivities(ctx.deps, parent.actor, student.user.id)).toHaveLength(1);
    await expect(deleteActivity(ctx.deps, parent.actor, a.id)).rejects.toMatchObject({ code: "not_found" });
    const other = await makeStudent(ctx.deps);
    await expect(listActivities(ctx.deps, other.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("getRequirementProgress", () => {
  it("compares verified and total hours with each open, live listing's requirement", async () => {
    const { db } = ctx.deps;
    const req = (serviceHours: number | null) => ({
      essays: [],
      recommendations: 0,
      transcript: false,
      serviceHours,
      other: [],
    });
    const needs = await factories.scholarship(db, { name: "Service Award", requirements: req(20) });
    const none = await factories.scholarship(db, { name: "No Hours", requirements: req(null) });
    const lost = await factories.scholarship(db, { name: "Lost Award", requirements: req(40) });
    const retired = await factories.scholarship(db, { name: "Retired Award", requirements: req(30), status: "retired" });
    const scam = await factories.scholarship(db, { name: "Scam Award", requirements: req(30), scamFlags: ["application_fee"] });
    await db.insert(scholarshipApplications).values([
      { ownerId: student.user.id, scholarshipId: needs.id, stage: "planned" },
      { ownerId: student.user.id, scholarshipId: none.id, stage: "planned" },
      { ownerId: student.user.id, scholarshipId: lost.id, stage: "lost" },
      { ownerId: student.user.id, scholarshipId: retired.id, stage: "planned" },
      { ownerId: student.user.id, scholarshipId: scam.id, stage: "drafting" },
    ]);
    const base = { ownerId: student.user.id, organization: "Library", activity: "STEM night", servedOn: "2026-09-12" };
    await db.insert(serviceLogs).values([
      { ...base, minutes: 600, verification: "verified" },
      { ...base, minutes: 300 },
      { ...base, minutes: 120, verification: "declined" },
    ]);
    expect(await getRequirementProgress(ctx.deps, student.actor, student.user.id)).toEqual([
      { scholarshipId: needs.id, scholarshipName: "Service Award", requiredHours: 20, verifiedHours: 10, totalHours: 15 },
    ]);
  });
});

describe("impact index", () => {
  it("exports exactly the contract names", () => {
    expect(Object.keys(impactModule).sort()).toEqual([
      "addServiceLog",
      "deleteActivity",
      "deleteServiceLog",
      "getRequirementProgress",
      "getVerificationRequest",
      "listActivities",
      "listServiceLogs",
      "requestVerification",
      "submitVerification",
      "updateServiceLog",
      "upsertActivity",
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/impact/activities.test.ts`
Expected: FAIL with `Failed to resolve import "./activities" from "src/impact/activities.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/impact/activities.ts`:

```ts
import {
  type DbOrTx,
  activities,
  and,
  asc,
  eq,
  inArray,
  scholarshipApplications,
  scholarships,
  serviceLogs,
} from "@scholarcrew/db";
import {
  type Activity,
  type ActivityInput,
  type Actor,
  type RequirementProgress,
  notFound,
} from "@scholarcrew/domain";
import { assertOwner, canRead } from "../access";
import { privateScholarshipIds } from "../scholarships/matching";
import { assertReadable, firstRow, hoursFromMinutes, requireUser } from "../scholarships/common";
import { liveListingWhere } from "../scholarships/search";
import { type CoreDeps, requireUuid } from "../shared";
import { toActivity } from "./mappers";

/** No access check: used by listActivities and the helper view. */
export async function loadActivities(db: DbOrTx, ownerId: string): Promise<Activity[]> {
  const rows = await db.select().from(activities).where(eq(activities.ownerId, ownerId)).orderBy(asc(activities.position));
  return rows.map(toActivity);
}

export async function listActivities(deps: CoreDeps, actor: Actor, ownerId: string): Promise<Activity[]> {
  await assertReadable(deps, actor, ownerId, "activities");
  return loadActivities(deps.db, ownerId);
}

export async function upsertActivity(deps: CoreDeps, actor: Actor, i: ActivityInput): Promise<Activity> {
  const user = requireUser(actor);
  const values = {
    name: i.name.trim(),
    role: i.role.trim(),
    organization: i.organization.trim(),
    description: i.description,
    hoursPerWeek: i.hoursPerWeek,
    weeksPerYear: i.weeksPerYear,
    grades: i.grades,
    category: i.category.trim(),
  };
  const row = firstRow(
    await deps.db
      .insert(activities)
      .values({ ownerId: user.userId, position: i.position, ...values })
      .onConflictDoUpdate({
        target: [activities.ownerId, activities.position],
        set: { ...values, updatedAt: deps.clock.now() },
      })
      .returning(),
    "activity",
  );
  return toActivity(row);
}

export async function deleteActivity(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  requireUser(actor);
  requireUuid(id, "Activity not found");
  const [row] = await deps.db.select({ ownerId: activities.ownerId }).from(activities).where(eq(activities.id, id));
  if (!row) throw notFound("Activity not found");
  assertOwner(actor, row.ownerId);
  await deps.db.delete(activities).where(and(eq(activities.id, id), eq(activities.ownerId, row.ownerId)));
}

export async function getRequirementProgress(
  deps: CoreDeps,
  actor: Actor,
  ownerId: string,
): Promise<RequirementProgress[]> {
  await assertReadable(deps, actor, ownerId, "activities");
  const open = await deps.db
    .select({ id: scholarships.id, name: scholarships.name, requirements: scholarships.requirements })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(
      and(
        eq(scholarshipApplications.ownerId, ownerId),
        inArray(scholarshipApplications.stage, ["matched", "planned", "drafting", "submitted"]),
        // Retired, under-review, and scam-flagged listings leave the requirement list (R2P-4).
        liveListingWhere(scholarshipApplications.ownerId),
      ),
    )
    .orderBy(asc(scholarships.name));
  const own = actor.kind === "system" || (actor.kind === "user" && actor.userId === ownerId);
  const privateIds = own ? new Set<string>() : await privateScholarshipIds(deps.db, ownerId);
  const namesShared = own || await canRead(deps, actor, ownerId, "scholarships");
  const needing = open.filter((s) => s.requirements.serviceHours !== null && !privateIds.has(s.id));
  if (needing.length === 0) return [];
  const logs = await deps.db
    .select({ minutes: serviceLogs.minutes, verification: serviceLogs.verification })
    .from(serviceLogs)
    .where(eq(serviceLogs.ownerId, ownerId));
  const verified = logs.filter((l) => l.verification === "verified").reduce((s, l) => s + l.minutes, 0);
  const total = logs.filter((l) => l.verification !== "declined").reduce((s, l) => s + l.minutes, 0);
  return needing.map((s) => ({
    scholarshipId: s.id,
    scholarshipName: namesShared ? s.name : "A saved scholarship",
    requiredHours: s.requirements.serviceHours ?? 0,
    verifiedHours: hoursFromMinutes(verified),
    totalHours: hoursFromMinutes(total),
  }));
}
```

`packages/core/src/impact/index.ts`:

```ts
export { deleteActivity, getRequirementProgress, listActivities, upsertActivity } from "./activities";
export { addServiceLog, deleteServiceLog, listServiceLogs, updateServiceLog } from "./service";
export { getVerificationRequest, requestVerification, submitVerification } from "./verification";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/impact`
Expected: PASS, 2 files, 10 tests (service 6, activities 4).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/impact/activities.ts packages/core/src/impact/activities.test.ts packages/core/src/impact/index.ts
git commit -m "feat(core): activities list, requirement progress, and impact index"
```

### G16: Scoped helper view

`getHelperView` (HL-02, HL-03) re-reads the helper link (revoked or expired → `not_found`) and only fills the sections in both the actor's scope and the stored link scope; every other section is `null`. Sections: `activities`; `stories` as title and summary of non-archived stories; `deadlines` from saved scholarships (`planned`, `drafting`) and unarchived colleges still `researching` or `applying`, upcoming only, with `daysLeft = engines.daysUntil` and `warning = engines.isWarning`, sorted by date, encoded like plan 08's deadlines (`refType: "scholarship"` with the listing id, `refType: "college_list"` with the entry id); `colleges` as the unarchived list; `scholarships` as name, deadline, and stage for `planned`, `drafting`, `submitted`, and `won`. Essays, chats, costs, and sensitive facts are never read here. `request` is always present (D38): for a link made by `requestRecommendation` it holds the student's note (null when blank) and the earliest due date of the request's targets (the college list entry's plan deadline, the scholarship deadline); for any other link both are null.

- [ ] **Step 1: Write the failing test**

`packages/core/src/helperview/view.test.ts`:

```ts
import { activities, collegeList, eq, helperLinks, scholarshipApplications } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { HelperActor, HelperScope } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { addCollege } from "../colleges/list";
import { addRecommender, requestRecommendation } from "../colleges/recommenders";
import { createHelperLink } from "../helpers";
import { makeStudent, setup } from "../scholarships/testkit";
import * as helperviewModule from "./index";
import { getHelperView } from "./view";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
  const { db } = ctx.deps;
  const ownerId = student.user.id;
  await db.insert(activities).values({ ownerId, position: 1, name: "Robotics team", role: "Build lead" });
  await factories.story(db, ownerId, { title: "Library STEM nights", summary: "Started monthly STEM nights." });
  await factories.story(db, ownerId, { title: "Archived", archivedAt: new Date() });
  await factories.college(db, { id: "200002", name: "Cedar College" });
  await addCollege(ctx.deps, student.actor, { collegeId: "200002", fit: "target", plan: "RD" });
  const soon = await factories.scholarship(db, { name: "Maple Rotary", deadline: "2026-10-15", amountMaxUsd: 2000 });
  const past = await factories.scholarship(db, { name: "Past Award", deadline: "2026-10-01" });
  const matched = await factories.scholarship(db, { name: "Only Matched", deadline: "2026-10-20" });
  await db.insert(scholarshipApplications).values([
    { ownerId, scholarshipId: soon.id, stage: "planned" },
    { ownerId, scholarshipId: past.id, stage: "drafting" },
    { ownerId, scholarshipId: matched.id, stage: "matched" },
  ]);
});

async function helper(scope: HelperScope[], claimed: HelperScope[] = scope): Promise<HelperActor> {
  const created = await createHelperLink(ctx.deps, student.actor, {
    label: "Ms. Patel",
    helperRole: "counselor",
    scope,
    expiresInDays: 30,
  });
  return { kind: "helper", helperLinkId: created.link.id, studentId: student.user.id, scope: claimed };
}

describe("getHelperView", () => {
  it("shows a recommender only activities and story titles with summaries", async () => {
    const view = await getHelperView(ctx.deps, await helper(["activities", "stories"]));
    expect(view).toMatchObject({ studentName: "Test Student", label: "Ms. Patel", helperRole: "counselor" });
    expect(view.request).toEqual({ message: null, dueDate: null });
    expect(view.activities?.map((a) => a.name)).toEqual(["Robotics team"]);
    expect(view.stories).toEqual([{ title: "Library STEM nights", summary: "Started monthly STEM nights." }]);
    expect(view.deadlines).toBeNull();
    expect(view.colleges).toBeNull();
    expect(view.scholarships).toBeNull();
  });

  it("shows a counselor upcoming deadlines and the college list", async () => {
    const view = await getHelperView(ctx.deps, await helper(["deadlines", "colleges"]));
    expect(view.activities).toBeNull();
    expect(view.stories).toBeNull();
    expect(view.scholarships).toBeNull();
    expect(view.colleges?.map((c) => c.college.name)).toEqual(["Cedar College"]);
    expect(view.deadlines?.map((d) => [d.kind, d.title, d.dueOn, d.daysLeft, d.warning])).toEqual([
      ["scholarship", "Maple Rotary", "2026-10-15", 9, true],
      ["application", "Cedar College (RD)", "2027-01-15", 101, false],
    ]);
    const [rotary] = await ctx.deps.db.select().from(scholarshipApplications).where(eq(scholarshipApplications.stage, "planned"));
    expect(view.deadlines?.[0]).toMatchObject({ refType: "scholarship", refId: rotary?.scholarshipId });
  });

  it("shows a recommender the student's note and the target's due date", async () => {
    const rec = await addRecommender(ctx.deps, student.actor, { name: "Ms. Patel", email: "patel@school.example", relationship: "" });
    const [entry] = await ctx.deps.db.select().from(collegeList).where(eq(collegeList.ownerId, student.user.id));
    const request = await requestRecommendation(ctx.deps, student.actor, {
      recommenderId: rec.id,
      collegeListId: entry?.id ?? null,
      scholarshipApplicationId: null,
      message: "  Please mention robotics.  ",
    });
    const view = await getHelperView(ctx.deps, {
      kind: "helper",
      helperLinkId: request.helperLinkId ?? "",
      studentId: student.user.id,
      scope: ["activities", "stories"],
    });
    expect(view.helperRole).toBe("recommender");
    expect(view.request).toEqual({ message: "Please mention robotics.", dueDate: "2027-01-15" });
  });

  it("lists saved scholarships with stage, never bare matches", async () => {
    const view = await getHelperView(ctx.deps, await helper(["scholarships"]));
    expect(view.scholarships).toEqual([
      { name: "Past Award", deadline: "2026-10-01", stage: "drafting" },
      { name: "Maple Rotary", deadline: "2026-10-15", stage: "planned" },
    ]);
  });

  it("never widens past the stored scope and rejects revoked or expired links", async () => {
    const narrow = await helper(["activities"], ["activities", "colleges", "stories"]);
    const view = await getHelperView(ctx.deps, narrow);
    expect(view.colleges).toBeNull();
    expect(view.stories).toBeNull();
    ctx.clock.set("2026-11-06T15:00:00.000Z");
    await expect(getHelperView(ctx.deps, narrow)).rejects.toMatchObject({ code: "not_found" });
    ctx.clock.set("2026-10-06T15:00:00.000Z");
    await ctx.deps.db.update(helperLinks).set({ revokedAt: new Date() }).where(eq(helperLinks.id, narrow.helperLinkId));
    await expect(getHelperView(ctx.deps, narrow)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("private helper listings", () => {
  it("withholds private saved awards and their deadlines", async () => {
    const listing = await factories.scholarship(ctx.deps.db, { name: "Private heritage award", deadline: "2026-10-15" });
    await ctx.deps.db.insert(scholarshipApplications).values({ ownerId: student.user.id, scholarshipId: listing.id, stage: "planned", matchReasons: [{ code: "heritage", text: "Heritage criterion matched", sensitive: true }] });
    const view = await getHelperView(ctx.deps, await helper(["scholarships", "deadlines"]));
    expect(JSON.stringify(view)).not.toContain("Private heritage award");
    expect(view.deadlines?.some((d) => d.refId === listing.id)).toBe(false);
  });
});

describe("helperview index", () => {
  it("exports exactly the contract names", () => {
    expect(Object.keys(helperviewModule)).toEqual(["getHelperView"]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/helperview`
Expected: FAIL with `Failed to resolve import "./index" from "src/helperview/view.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/helperview/view.ts`:

```ts
import {
  and,
  collegeList,
  colleges,
  desc,
  eq,
  helperLinks,
  inArray,
  isNull,
  recRequests,
  scholarshipApplications,
  scholarships,
  stories,
  users,
} from "@scholarcrew/db";
import { type Deadline, type HelperActor, type HelperScope, type HelperView, notFound } from "@scholarcrew/domain";
import { daysUntil, isWarning } from "@scholarcrew/engines";
import { activeListWhere, loadEntries } from "../colleges/list";
import { deadlineFor } from "../colleges/mappers";
import { loadActivities } from "../impact/activities";
import { deadlineOrder } from "../scholarships/search";
import { privateScholarshipIds } from "../scholarships/matching";
import { type CoreDeps, currentSeason, toIso } from "../shared";

/** D38: the note and due date of the recommendation request this link was made for, if any. */
async function loadRequest(deps: CoreDeps, helperLinkId: string): Promise<HelperView["request"]> {
  const [req] = await deps.db
    .select()
    .from(recRequests)
    .where(eq(recRequests.helperLinkId, helperLinkId))
    .orderBy(desc(recRequests.updatedAt))
    .limit(1);
  if (!req) return { message: null, dueDate: null };
  const dates: string[] = [];
  if (req.collegeListId) {
    const [row] = await deps.db
      .select({ plan: collegeList.plan, deadlines: colleges.deadlines })
      .from(collegeList)
      .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
      .where(and(eq(collegeList.id, req.collegeListId), eq(collegeList.ownerId, req.ownerId)));
    const due = row ? deadlineFor(row.deadlines, row.plan) : null;
    if (due) dates.push(due);
  }
  if (req.scholarshipApplicationId) {
    const [row] = await deps.db
      .select({ deadline: scholarships.deadline, scholarshipId: scholarships.id })
      .from(scholarshipApplications)
      .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
      .where(
        and(
          eq(scholarshipApplications.id, req.scholarshipApplicationId),
          eq(scholarshipApplications.ownerId, req.ownerId),
        ),
      );
    const privateIds = await privateScholarshipIds(deps.db, req.ownerId);
    if (row?.deadline && !privateIds.has(row.scholarshipId)) dates.push(row.deadline);
  }
  dates.sort();
  return { message: req.message.trim() || null, dueDate: dates[0] ?? null };
}

export async function getHelperView(deps: CoreDeps, actor: HelperActor): Promise<HelperView> {
  if (actor.kind !== "helper") throw notFound("Link not found");
  const now = deps.clock.now();
  const [link] = await deps.db
    .select()
    .from(helperLinks)
    .where(and(eq(helperLinks.id, actor.helperLinkId), eq(helperLinks.studentId, actor.studentId)));
  if (!link || link.revokedAt || link.expiresAt.getTime() <= now.getTime()) throw notFound("This link has expired");
  const scope = new Set<HelperScope>(actor.scope.filter((s) => link.scope.includes(s)));
  const studentId = link.studentId;
  const [student] = await deps.db
    .select({ displayName: users.displayName, timeZone: users.timeZone })
    .from(users)
    .where(eq(users.id, studentId));
  const timeZone = student?.timeZone ?? "America/Chicago";

  const wantsDeadlines = scope.has("deadlines");
  const entries =
    scope.has("colleges") || wantsDeadlines
      ? await loadEntries(deps.db, activeListWhere(studentId))
      : [];
  const rawSaved =
    scope.has("scholarships") || wantsDeadlines
      ? await deps.db
          .select({ app: scholarshipApplications, listing: scholarships })
          .from(scholarshipApplications)
          .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
          .where(
            and(
              eq(scholarshipApplications.ownerId, studentId),
              inArray(scholarshipApplications.stage, ["planned", "drafting", "submitted", "won"]),
            ),
          )
          .orderBy(...deadlineOrder)
      : [];

  const privateIds = await privateScholarshipIds(deps.db, studentId);
  const saved = rawSaved.filter(({ listing }) => !privateIds.has(listing.id));

  let deadlines: Deadline[] | null = null;
  if (wantsDeadlines) {
    const list: Deadline[] = [];
    for (const { app, listing } of saved) {
      if (!listing.deadline || (app.stage !== "planned" && app.stage !== "drafting")) continue;
      const daysLeft = daysUntil(listing.deadline, now, timeZone);
      if (daysLeft < 0) continue;
      list.push({
        kind: "scholarship",
        title: listing.name,
        dueOn: listing.deadline,
        daysLeft,
        refType: "scholarship",
        refId: listing.id,
        valueUsd: listing.amountMaxUsd,
        warning: isWarning(daysLeft),
      });
    }
    for (const e of entries) {
      if (!e.deadline || (e.status !== "researching" && e.status !== "applying")) continue;
      const daysLeft = daysUntil(e.deadline, now, timeZone);
      if (daysLeft < 0) continue;
      list.push({
        kind: "application",
        title: `${e.college.name} (${e.plan})`,
        dueOn: e.deadline,
        daysLeft,
        refType: "college_list",
        refId: e.id,
        valueUsd: null,
        warning: isWarning(daysLeft),
      });
    }
    deadlines = list.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title));
  }

  const storyRows = scope.has("stories")
    ? await deps.db
        .select({ title: stories.title, summary: stories.summary })
        .from(stories)
        .where(and(eq(stories.ownerId, studentId), isNull(stories.archivedAt)))
        .orderBy(desc(stories.updatedAt))
    : null;

  return {
    studentName: student?.displayName.trim() || "A student",
    helperRole: link.helperRole,
    label: link.label,
    expiresAt: toIso(link.expiresAt),
    request: await loadRequest(deps, link.id),
    activities: scope.has("activities") ? await loadActivities(deps.db, studentId) : null,
    stories: storyRows,
    deadlines,
    colleges: scope.has("colleges") ? entries : null,
    scholarships: scope.has("scholarships")
      ? saved.map(({ app, listing }) => ({ name: listing.name, deadline: listing.deadline, stage: app.stage }))
      : null,
  };
}
```

`packages/core/src/helperview/index.ts`:

```ts
export { getHelperView } from "./view";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/helperview`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the whole gate and commit**

Run: `pnpm --filter @scholarcrew/core typecheck && pnpm --filter @scholarcrew/core test && pnpm lint`
Expected: `tsc --noEmit` prints nothing; Vitest reports every core test file passing (this plan adds 17 files, 106 tests); Biome reports no errors.

```bash
git add packages/core/src/helperview
git commit -m "feat(core): scoped helper view"
```

## Success Criteria

- [ ] `pnpm --filter @scholarcrew/core typecheck` exits 0.
- [ ] `pnpm --filter @scholarcrew/core test` exits 0 (plan 06's tests plus this plan's 17 files and 106 tests).
- [ ] `pnpm lint` exits 0.
- [ ] `grep -rnE "from \"\\.\\./(money|aid|plan|crew|admin)\"" packages/core/src/{scholarships,colleges,essays,prep,impact,helperview}` prints nothing (no plan 08 imports).
- [ ] `grep -rn "@anthropic-ai/sdk\|process.env" packages/core/src/{scholarships,colleges,essays,prep,impact,helperview}` prints nothing.

## Testing Requirements

Command: `pnpm --filter @scholarcrew/core test -- src/scholarships src/colleges src/essays src/prep src/impact src/helperview`
Expected: 17 files, 106 tests, all passing (round 3: common −1 and search −2 for the moved `todayIn` test and the deleted `listPublicByState`, board +1), against `TEST_DATABASE_URL` with plan 06's per-test `resetDb`.

What the tests prove:

- **Isolation (SE-01):** another student gets `not_found` on matches, board, last sweep, scholarship detail of a private submission, applications, college list and items, recommenders and rec request updates, essays, essay updates, versions, comments, stories, test scores, service logs, and activities.
- **Parent share categories:** `scholarships` gates matches, board, and last sweep; private sensitive matches are withheld from parents, helpers, and models; only the student can view their identities; `colleges` gates the list and items; `essays` (off by default) gates essays and versions; `stories` (off by default) gates the Story Bank; `activities` gates service logs and activities; test scores stay owner only. Parents never write.
- **Helper scope:** only sections in both the actor's and the stored link's scope are filled; revoked and expired links are `not_found`; bare matches never appear; a recommender link shows the student's note and the target's due date; deadlines use the same `refType` encoding as plan 08.
- **Search:** `excludeScams` (and every public-actor search) drops scam-flagged listings in SQL, so totals match; `local` from a non-user actor is `invalid_input`; `openOn` drops past deadlines in SQL (same-day and undated listings stay, totals match) and results stay deadline ascending with nulls last across pages; `getScholarship` hides scam-flagged listings from the public and shows them, flagged, to students (R2P-19).
- **Season archive (ME-07):** `archiveSeason` also archives the season's offers and leaves next year's and other students' offers alone.
- **Submissions (SC-07):** a local submission enqueues `catalog.extract` with its task id and the `catalog.extract:<taskId>` key, and adds one `planned` application, so it's on the board (R2C-12).
- **Board (R2P-4, R2P-5, R2P-3, R3V-6):** open cards on retired, under-review, or scam-flagged listings move to `flagged` with their reason and leave the totals, deduplicated against the sweep's hidden list, while submitted history stays; a `planned` or `drafting` card past its deadline in the student's zone stays on the board but leaves `inPlayUsd`, and a past-due submitted card stays in; the matched column follows value per hour, the same for parents; a save from search writes reasons and fit, and a sweep-scored card keeps its reasons.
- **Record status writes:** `updateRecRequest` (R2P-11) and `updateEssay` (R2P-14) are owner only and stamp `updatedAt`; every `ServiceLog` carries `verificationExpiresAt`, which stays set on a lapsed request (R2P-10).
- **Save conflict:** a stale `baseVersion` and the loser of two concurrent saves get `conflict`; only one version is written.
- **Quill quote matching:** comments are kept only when the quote exists at that occurrence; retries for the same job don't duplicate.
- **Sweep:** idempotent (second run adds 0 and sends no second notification), per-day dedupe key so the signup week's Sunday sweep still notifies (R2P-21), existing stages untouched, reasons and fit refreshed on open applications only (R2P-3), scam-flagged eligible listings counted and recorded but never matched; ineligible scams aren't counted.
- **Limits and expiry:** `MAX_COLLEGE_LIST` (26th active entry → `invalid_input`; archiving frees space), duplicates → `conflict`, verification links expire after 14 days and work once, and the supervisor email reads "on Sep 12" and names the expiry in the student's zone (R3E-8), the monthly crew allowance blocks reviews and retake analyses with `limit_reached`.
- **Outcomes:** won defaults to the listing's max amount and adds exactly one thank-you plan item; submitted stamps `submittedAt`.
- **Requirement progress:** retired and scam-flagged listings drop out (R2P-4).
- **Indexes:** each module's `index.ts` exports exactly its §9.4 names.

## Review Checklist

- [ ] Every function in the §9.4 "Plan 07 modules" table exists with the contract name and parameter order, and each `index.ts` exports nothing else.
- [ ] Every service checks access before reading rows it returns: `assertReadable` (system bypass, else `assertCanRead`) for shared categories, `assertOwner` / `assertOwnerOrSystem` for owner-only data, `requireSystem` for `buildMatcherProfile`, `runSweep`, `saveQuillComments`, `computeRetake`.
- [ ] Not-yours is always `not_found`, never `forbidden`.
- [ ] Sensitive facts only reach `evaluateEligibility`; they never appear in returned objects except as `MatchReason` text, which is visible only to the student; non-owner and model-facing reads withhold the whole private award and expose its count.
- [ ] Verification tokens are stored only as `sha256Hex`; the email names the student by first name only.
- [ ] Table and column names match `00-overview.md` §8; domain types come from `@scholarcrew/domain` and none are redefined.
- [ ] Money stays integer dollars; GPA and admit rate convert from `X100` / `X1000` only in mappers.
- [ ] Dates: deadlines compared to today in the student's time zone; week starts from `engines.weekStartFor`.
- [ ] `scholarships/testkit.ts` is imported only by test files.

## Contract notes for the integrator

- `addCollege` over `MAX_COLLEGE_LIST` throws `invalid_input` (not `limit_reached`, which maps to HTTP 402 and means billing).
- `archiveSeason` archives college list entries (and hides their items with them) and sets `offers.archivedAt` for the current season's award year and earlier (D1). Plan 08's `listOffers`, `compareMyOffers`, and cost summaries skip archived offers.
- Round 1 fixes depend on producer changes that this plan codes against by name: 02 adds `geo.ts` (`STATE_NAMES`, `localLabel`, moved from `scholarships/labels.ts`, D41), `ScholarshipQuery.excludeScams?: boolean` (D39), `ScholarshipQuery.openOn?: IsoDate` (F-18-3), `Essay.latestWordCount: number | null` (D34), and `HelperView.request: { message: string | null; dueDate: IsoDate | null }` (D38); 03 adds `recRequests.message text NOT NULL DEFAULT ''` (D38). Until they land, G1, G2, G9, G10, and G16 don't typecheck.
- `searchScholarships` with `local: true` from a non-user actor (the worker's `CrewDataPort.searchScholarships(core, SYSTEM, q)`) throws `invalid_input`; the crew can't do local search until the port passes an owner id.
- HL-02 says "chosen stories": there is no per-link story selection in the schema, so the helper view shows every non-archived story's title and summary when `stories` is in scope.
- SC-11: `updateApplication` records `outcomeRenewable` (defaulting to the listing's `renewable` on a win) and `outcomeAt`; plan 08 `findDueReminders` turns them into yearly renewal reminders (D2).
- Checked against the drafted `06-core-identity.md`: `access`, `shared` (`requireUuid`, `toIsoOrNull`, `fixedClock().set`, `createTestDeps` overrides), `memory.setSensitiveFact` / `readSensitiveForMatcher`, `notifications.notify`, `billing.assertCrewAllowance` (free plan: 20 requests per UTC month), and `helpers.createHelperLink` (URL `${appUrl}/h/<token>`) are used exactly as drafted there.
- Round 2 fixes code against these producer names: 02 `RecRequestPatch` (R2P-11), `EssayPatch` (R2P-14), and `ServiceLog.verificationExpiresAt` (R2P-10); 06 `access.getShareGrants` with the `DEFAULT_SHARED` fallback for missing rows (R2I-11b), which `seesSensitiveReasons` calls. Until 02 lands, G9, G10, and G14 don't typecheck.
- `liveListingWhere(ownerId: string | AnyPgColumn): SQL` is exported from `@scholarcrew/core/scholarships` for 08's `collectDeadlines`, `findDueReminders`, and `loadContext` `pendingUsd` (R2P-4); pass `scholarshipApplications.ownerId` when the query spans owners.
- `getScholarship` always returns the viewer's own application, so it never carries another student's reasons; R2I-11a needs no change there. The board and matches lists are where a parent sees a student's reasons.
- 14 N14 `save-page` and 17 Q5 `AddLocalModal` rely on `submitLocalScholarship` adding the `planned` application (R2C-12); neither should call `saveScholarship` afterward.
- Open follow-up (not in the round 2 decisions): G16's helper-view `deadlines` section still lists `planned`/`drafting` applications on retired or flagged listings; adding `liveListingWhere(scholarshipApplications.ownerId)` to that query would match the board.
