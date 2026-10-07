# Plan 08: Core planning (Agent H)

The planning services inside `@scholarcrew/core`: Ledger's money math over real records (cost estimates, calculator results, award letters, offer comparison, loan payments, appeal requests), the FAFSA and CSS Profile checklists with family tasks, the weekly plan and This Week view, merged deadlines, the weekly digest and deadline reminders, crew conversations with jobs and action cards, and the admin console services. Every function takes `(deps, actor, ...)`, checks access first, and returns domain objects from `@scholarcrew/domain`. Feature IDs: WK-01..WK-05 (service side), ON-06 (weekly plan job), CR-01, CR-03 (reply storage), CR-05, CR-06, CR-07, CR-08, CR-10 (allowance on send), MO-01..MO-11, AID-01..AID-03, FA-03, FA-05, NO-02, NO-03, AD-01..AD-05, CA-04, AG-06.

Read first: `00-overview.md` §3, §8, §9.4 (the "Plan 08 modules" table is the contract), `02-domain.md`, `03-database.md`, `04-engines.md`, `05-jobs.md`.

**Dependencies by contract (imported relatively inside `packages/core/src`):**

- Plan 06: `../shared` (`CoreDeps`, `createTestDeps`, `fixedClock`, `currentAwardYear`, `currentSeason`, `toIso`, `toIsoOrNull`, `one`, `requireUuid`, `isUuid`, `todayIn`, `calendarShort`), `../access` (`assertUser`, `assertAdmin`, `assertSystem`, `assertOwner`, `assertCanRead`, `canRead`, `familyIdsFor`), `../audit` (`recordAudit`), `../memory` (`readSensitiveForMatcher`, `createFact`, `recordDecision` with its 4th `sourceMessageId` argument, `setSensitiveFact`, `createCandidate`, and `listFacts` in tests), `../family` (`createTask` with `aidItemId?`, `updateTask` in tests), `../billing` (`assertCrewAllowance`), `../notifications` (`notify`).
- Plan 07: `../scholarships` (`saveScholarship`, `getScholarship`, `lastSweep`, `liveListingWhere`), `../scholarships/common` (`escapeLike`, internal helper for admin search), `../colleges` (`addCollege`), `../essays` (`createEssay`).
- Plan 06 owns `packages/core/package.json` (subpath exports for `money`, `aid`, `plan`, `crew`, `admin` already declared), `vitest.config.ts`, and `test/setup.ts` (resets the DB before each test). This plan adds no config.

**Rules this plan follows:**

- Access categories: costs, offers, and loans → `costs`; plan, This Week, deadlines, and aid checklists → `deadlines`; the sweep card → `scholarships`. Writes are owner only. Parents may also update aid items assigned to `parent`. Not-yours is always `not_found`. Admin functions call `assertAdmin` (non-admins get `forbidden`) and audit every write.
- Every time-dependent write uses `deps.clock.now()`. The fixed test clock is `2026-10-06T15:00:00.000Z` (a Tuesday; 10:00 in `America/Chicago`): the week starts `2026-10-05`, the season is `2026-27`, the award year is `2027-28`.
- `costEstimates.inputs` never stores the income range itself, only `{ basis: "income_range" | "overall" }`. The range stays encrypted in `sensitiveFacts`.
- Reminder keys are `reminder:<refType>:<refId>:<offset>` with per-student refs (`scholarship_application` + application id, `college_list` + entry id), because `notifications.dedupeKey` is globally unique and two students can save the same scholarship. Renewal reminders (SC-11, D2) use `renewal:<applicationId>:<year>` with `offset: 30`.
- Offer lists, comparisons, and cost summaries skip offers with `archivedAt` set (D1); `getOffer` still returns them by id. Every `Offer` carries `parseJobId`, the newest `offer_parse` job for it (D31).
- Jobs with a reply but no conversation (`appeal_outline`, `weekly_plan`, `retake_analysis`, `essay_review`, `offer_parse`) post into the owner's newest live `my_crew` conversation titled for the job kind (`roomRefId` null, not archived), and a new one is created only when none exists (R2C-14). Every reply has a message row, and the weekly fan-out doesn't open a new room each Monday.
- Ready notices for `appeal_outline` and `retake_analysis` link to `/crew/<conversationId>`, where the reply lives; the other kinds link to the page that shows their result (R2P-9).
- Helpers shared by these five modules live in `plan/common.ts` and `crew/mappers.ts`. Test setup helpers live in `plan/testkit.ts` (imported only by tests). Each module `index.ts` exports exactly the §9.4 names.

## Files

Create (all under `packages/core/src/`):

- `plan/common.ts`: `DEFAULT_TIME_ZONE`, `OPEN_APP_STAGES`, `ACTIVE_LIST_STATUSES`, `addIsoDays`, `mondayOf`, `planDeadline`, `firstName`, `userTimeZone`, `studentFamilyIds`, `parentsOf`, `isParentOf`, `toPlanItem` (`APP_PLAN_LABELS` is 02's, `formatUsd` 04's, and `todayIn` 06's, R3V-5/R3V-8/R3V-9)
- `plan/testkit.ts`: `NOW`, `WEEK`, `SEASON`, `AWARD_YEAR`, `makeDeps`, `makeStudent`, `makeParentOf`, `setShare`, `makeStateU`, `listCollege`, `saveApp`, `makeDocument`
- `plan/items.ts`, `plan/deadlines.ts`, `plan/week.ts`, `plan/notify.ts`, `plan/index.ts`
- `crew/mappers.ts`, `crew/jobs.ts`, `crew/conversations.ts`, `crew/actions.ts`, `crew/index.ts`
- `money/costs.ts`, `money/offers.ts`, `money/index.ts`
- `aid/checklists.ts`, `aid/index.ts`
- `admin/mappers.ts`, `admin/catalog.ts`, `admin/colleges.ts`, `admin/aid.ts`, `admin/index.ts`

Test:

- `plan/common.test.ts`, `plan/items.test.ts`, `plan/deadlines.test.ts`, `plan/week.test.ts`, `plan/notify.test.ts`, `plan/contract.test.ts`
- `crew/jobs.test.ts`, `crew/conversations.test.ts`, `crew/actions.test.ts`
- `money/costs.test.ts`, `money/offers.test.ts`
- `aid/checklists.test.ts`
- `admin/catalog.test.ts`, `admin/colleges.test.ts`, `admin/aid.test.ts`

Modify: nothing outside `packages/core/src/{money,aid,plan,crew,admin}/**`.

## Tasks

### H1: Shared planning helpers and the test kit

- [ ] **Step 1: Write the failing test**

`packages/core/src/plan/common.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addIsoDays, firstName, isParentOf, mondayOf, parentsOf, planDeadline, userTimeZone } from "./common";
import { makeDeps, makeParentOf, makeStudent } from "./testkit";

describe("calendar helpers", () => {
  // `todayIn` is 06's shared copy and `formatUsd` is 04's (R3V-9, R3V-5); their tests live there.
  it("adds days and finds Mondays", () => {
    expect(addIsoDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addIsoDays("2026-10-06", -6)).toBe("2026-09-30");
    expect(mondayOf("2026-10-14")).toBe("2026-10-12");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
  });

  it("reads plan deadlines and first names", () => {
    const deadlines = { ED: null, EA: "2026-11-01", REA: null, RD: "2027-01-15", rolling: false };
    expect(planDeadline(deadlines, "EA")).toBe("2026-11-01");
    expect(planDeadline(deadlines, "ED")).toBeNull();
    expect(planDeadline(deadlines, "rolling")).toBeNull();
    expect(firstName("Jordan Reyes")).toBe("Jordan");
    expect(firstName("  ")).toBe("there");
  });
});

describe("family lookups", () => {
  it("finds the student's parents and time zone", async () => {
    const { deps } = makeDeps();
    const { user } = await makeStudent(deps);
    const { parent, family } = await makeParentOf(deps, user.id);
    const { user: other } = await makeStudent(deps);
    expect(await parentsOf(deps.db, user.id)).toEqual([{ familyId: family.id, userId: parent.id }]);
    expect(await parentsOf(deps.db, other.id)).toEqual([]);
    expect(await isParentOf(deps.db, parent.id, user.id)).toBe(true);
    expect(await isParentOf(deps.db, parent.id, other.id)).toBe(false);
    expect(await userTimeZone(deps.db, user.id)).toBe("America/Chicago");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/plan/common.test.ts`
Expected: FAIL with `Failed to resolve import "./common" from "src/plan/common.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/plan/common.ts`:

```ts
import { type DbOrTx, and, eq, familyMembers, inArray, type planItems, users } from "@scholarcrew/db";
import type { AppPlan, AppStatus, ApplicationStage, CollegeDeadlines, IsoDate, PlanItem } from "@scholarcrew/domain";
import { weekStartFor } from "@scholarcrew/engines";
import { toIso, toIsoOrNull } from "../shared";

export const DEFAULT_TIME_ZONE = "America/Chicago";

// R3V-5/R3V-8/R3V-9: `APP_PLAN_LABELS` comes from `@scholarcrew/domain`, `formatUsd` from `@scholarcrew/engines`,
// and `todayIn` from `../shared`; this file keeps no copies.

/** Saved scholarships the student is still working on. */
export const OPEN_APP_STAGES: ApplicationStage[] = ["matched", "planned", "drafting"];

/** College list entries that still have an application deadline ahead. */
export const ACTIVE_LIST_STATUSES: AppStatus[] = ["researching", "applying"];

export function addIsoDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
export function mondayOf(date: IsoDate): IsoDate {
  return weekStartFor(new Date(`${date}T12:00:00.000Z`), "UTC");
}

export function planDeadline(deadlines: CollegeDeadlines, plan: AppPlan): IsoDate | null {
  if (plan === "rolling") return null;
  return deadlines[plan] ?? null;
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "there";
}

export async function userTimeZone(db: DbOrTx, userId: string): Promise<string> {
  const [row] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, userId));
  return row?.timeZone ?? DEFAULT_TIME_ZONE;
}

/** Families where `studentId` is the student member. */
export async function studentFamilyIds(db: DbOrTx, studentId: string): Promise<string[]> {
  const rows = await db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, studentId), eq(familyMembers.memberRole, "student")));
  return rows.map((r) => r.familyId);
}

/** Parent members of the student's families. */
export async function parentsOf(db: DbOrTx, studentId: string): Promise<Array<{ familyId: string; userId: string }>> {
  const familyIds = await studentFamilyIds(db, studentId);
  if (familyIds.length === 0) return [];
  return db
    .select({ familyId: familyMembers.familyId, userId: familyMembers.userId })
    .from(familyMembers)
    .where(and(inArray(familyMembers.familyId, familyIds), eq(familyMembers.memberRole, "parent")));
}

export async function isParentOf(db: DbOrTx, parentId: string, studentId: string): Promise<boolean> {
  return (await parentsOf(db, studentId)).some((p) => p.userId === parentId);
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
```

`packages/core/src/plan/testkit.ts` (imported only by `*.test.ts` files in this plan's folders):

```ts
import { randomBytes } from "node:crypto";
import {
  and,
  blobs,
  collegeList,
  type colleges,
  documents,
  eq,
  scholarshipApplications,
  shareSettings,
} from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import {
  type AppPlan,
  type AppStatus,
  type ApplicationStage,
  type DocumentKind,
  type ShareCategory,
  userActor,
} from "@scholarcrew/domain";
import { createTestDeps, fixedClock, one } from "../shared";

type Deps = ReturnType<typeof createTestDeps>;

export const NOW = "2026-10-06T15:00:00.000Z";
export const WEEK = "2026-10-05";
export const SEASON = "2026-27";
export const AWARD_YEAR = "2027-28";

/** Test deps on a movable clock at NOW (a Tuesday, 10:00 in America/Chicago). */
export function makeDeps() {
  const clock = fixedClock(NOW);
  return { deps: createTestDeps({ clock }), clock };
}

export async function makeStudent(deps: Deps, o: Parameters<typeof factories.student>[1] = {}) {
  const { user, profile } = await factories.student(deps.db, o);
  return { user, profile, actor: userActor(user.id, "student") };
}

/** A parent in one family with the student; share settings start at DEFAULT_SHARED. */
export async function makeParentOf(deps: Deps, studentId: string) {
  const parent = await factories.parent(deps.db);
  const family = await factories.family(deps.db, { studentIds: [studentId], parentIds: [parent.id] });
  return { parent, family, actor: userActor(parent.id, "parent") };
}

export async function setShare(deps: Deps, studentId: string, category: ShareCategory, enabled: boolean) {
  await deps.db
    .update(shareSettings)
    .set({ enabled })
    .where(and(eq(shareSettings.studentId, studentId), eq(shareSettings.category, category)));
}

/** State U from the mockups: $27,800 to attend, $9,200 net price at $48k–75k, Early Action Nov 1. */
export async function makeStateU(deps: Deps, o: Partial<typeof colleges.$inferInsert> = {}) {
  return factories.college(deps.db, {
    id: "100001",
    name: "State U",
    costOfAttendanceUsd: 27800,
    netPriceByIncome: {
      overall: 12000,
      under_30k: 6500,
      "30_48k": 8000,
      "48_75k": 9200,
      "75_110k": 14000,
      over_110k: null,
    },
    deadlines: { ED: null, EA: "2026-11-01", REA: null, RD: "2027-01-15", rolling: false },
    ...o,
  });
}

/** A college list row. `minutesAfter` orders rows added in one test. */
export async function listCollege(
  deps: Deps,
  ownerId: string,
  collegeId: string,
  o: { plan?: AppPlan; status?: AppStatus; season?: string; minutesAfter?: number } = {},
) {
  const createdAt = new Date(new Date(NOW).getTime() + (o.minutesAfter ?? 0) * 60_000);
  return one(
    await deps.db
      .insert(collegeList)
      .values({
        ownerId,
        collegeId,
        fit: "target",
        plan: o.plan ?? "RD",
        status: o.status ?? "applying",
        season: o.season ?? SEASON,
        createdAt,
      })
      .returning(),
    "college_list insert",
  );
}

/** A published scholarship plus the student's application row for it. */
export async function saveApp(
  deps: Deps,
  ownerId: string,
  o: {
    stage?: ApplicationStage;
    amountUsd?: number;
    deadline?: string | null;
    name?: string;
    outcomeUsd?: number | null;
    outcomeRenewable?: boolean | null;
    outcomeAt?: Date | null;
  } = {},
) {
  const amount = o.amountUsd ?? 1000;
  const scholarship = await factories.scholarship(deps.db, {
    name: o.name ?? "Test Scholarship",
    amountMinUsd: amount,
    amountMaxUsd: amount,
    deadline: o.deadline === undefined ? "2026-11-15" : o.deadline,
  });
  const application = one(
    await deps.db
      .insert(scholarshipApplications)
      .values({
        ownerId,
        scholarshipId: scholarship.id,
        stage: o.stage ?? "planned",
        outcomeUsd: o.outcomeUsd ?? null,
        outcomeRenewable: o.outcomeRenewable ?? null,
        outcomeAt: o.outcomeAt ?? null,
      })
      .returning(),
    "scholarship_applications insert",
  );
  return { scholarship, application };
}

/** An uploaded document row over a throwaway encrypted blob. */
export async function makeDocument(deps: Deps, ownerId: string, kind: DocumentKind = "award_letter") {
  const blob = one(
    await deps.db
      .insert(blobs)
      .values({ ciphertext: randomBytes(32), iv: randomBytes(12), tag: randomBytes(16) })
      .returning(),
    "blobs insert",
  );
  return one(
    await deps.db
      .insert(documents)
      .values({ ownerId, kind, filename: "state-u-award.pdf", mime: "application/pdf", sizeBytes: 2048, blobId: blob.id })
      .returning(),
    "documents insert",
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/plan/common.test.ts && pnpm --filter @scholarcrew/core typecheck`
Expected: PASS, 1 file, 3 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plan/common.ts packages/core/src/plan/common.test.ts packages/core/src/plan/testkit.ts
git commit -m "feat(core): shared planning helpers and test kit"
```

### H2: Crew jobs, progress, completion, and agent runs

- [ ] **Step 1: Write the failing test**

`packages/core/src/crew/jobs.test.ts`:

```ts
import { agentRuns, and, conversations, crewJobs, eq, familyMembers, messages, notifications, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type CrewJob, type CrewReply, systemActor, userActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { NOW, makeDeps, makeParentOf, makeStudent } from "../plan/testkit";
import { appendProgress, completeJob, createJob, getJob, insertJob, listJobs, recordAgentRun, reapStaleJobs, startJob } from "./jobs";

const SYSTEM = systemActor("test");
const reply: CrewReply = {
  text: "Start with the Hill Country STEM Award.",
  contributors: ["compass", "scout"],
  question: null,
  actionCards: [],
  receipt: [],
  safety: null,
  needsInput: false,
};

describe("crew jobs", () => {
  it("claims one live lease and posts and charges once under concurrent completion", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const job = await createJob(deps, actor, { kind: "weekly_plan" });
    const claim = await startJob(deps, SYSTEM, job.id, { leaseSeconds: 1200 });
    if (!claim) throw new Error("expected lease");
    expect(await startJob(deps, SYSTEM, job.id, { leaseSeconds: 1200 })).toBeNull();
    const input = { jobId: job.id, leaseToken: claim.leaseToken, reply, status: "ready" as const, usage: { costMicros: 100, crewRequest: true } };
    const results = await Promise.all([completeJob(deps, SYSTEM, input), completeJob(deps, SYSTEM, input)]);
    expect(results.filter((result) => result.completed)).toHaveLength(1);
    expect(await deps.db.select().from(messages).where(eq(messages.id, results[0]?.job.resultMessageId as string))).toHaveLength(1);
    const [usage] = await deps.db.select().from(usageCounters).where(eq(usageCounters.userId, user.id));
    expect(usage).toMatchObject({ crewRequests: 1, costMicros: 100 });
  });

  it("rejects a superseded lease token and reaps an expired live attempt", async () => {
    const { deps, clock } = makeDeps();
    const { actor } = await makeStudent(deps);
    const job = await createJob(deps, actor, { kind: "weekly_plan" });
    const first = await startJob(deps, SYSTEM, job.id, { leaseSeconds: 1 });
    clock.set(new Date(deps.clock.now().getTime() + 2000).toISOString());
    const second = await startJob(deps, SYSTEM, job.id, { leaseSeconds: 1 });
    if (!first || !second) throw new Error("expected leases");
    expect(second.leaseToken).not.toBe(first.leaseToken);
    expect(await completeJob(deps, SYSTEM, { jobId: job.id, leaseToken: first.leaseToken, reply, status: "ready" })).toMatchObject({ completed: false });
    clock.set(new Date(deps.clock.now().getTime() + 11 * 60_000).toISOString());
    expect(await reapStaleJobs(deps, SYSTEM)).toMatchObject({ jobs: 1 });
    expect(await getJob(deps, actor, job.id)).toMatchObject({ status: "failed" });
  });

  it("creates a queued job the owner can read and others can't", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { actor: other } = await makeStudent(deps);
    const { actor: parent } = await makeParentOf(deps, user.id);
    const job = await createJob(deps, actor, { kind: "essay_review", refId: "essay-1" });
    expect(job).toMatchObject({ kind: "essay_review", status: "queued", refId: "essay-1", conversationId: null, progress: [] });
    expect((await getJob(deps, actor, job.id)).id).toBe(job.id);
    expect((await getJob(deps, SYSTEM, job.id)).id).toBe(job.id);
    await expect(getJob(deps, other, job.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getJob(deps, parent, job.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getJob(deps, actor, "nope")).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses a conversation the actor doesn't own", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    const { user: other } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, other.id);
    await expect(createJob(deps, actor, { kind: "crew_request", conversationId: conv.id })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("starts only queued jobs and appends progress in order", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    const job = await createJob(deps, actor, { kind: "essay_review", refId: "essay-1" });
    await expect(startJob(deps, actor, job.id, { leaseSeconds: 1200 })).rejects.toMatchObject({ code: "forbidden" });
    expect((await startJob(deps, SYSTEM, job.id, { leaseSeconds: 1200 }))?.job.status).toBe("working");
    await appendProgress(deps, SYSTEM, job.id, { at: NOW, role: "compass", text: "Reading your plan" });
    await appendProgress(deps, SYSTEM, job.id, { at: NOW, role: "quill", text: "Reading your draft" });
    expect((await getJob(deps, actor, job.id)).progress.map((p) => p.role)).toEqual(["compass", "quill"]);
    await finishTestJob(deps, SYSTEM, { jobId: job.id, reply: null, status: "failed", error: "timeout" });
    const failed = await startJob(deps, SYSTEM, job.id, { leaseSeconds: 1200 });
    expect(failed).toBeNull();
  });

  it("completes a crew request with a crew message and no notification", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const job = await createJob(deps, actor, { kind: "crew_request", conversationId: conv.id });
    const done = await finishTestJob(deps, SYSTEM, { jobId: job.id, reply, status: "ready" });
    expect(done.status).toBe("ready");
    const rows = await deps.db.select().from(messages).where(eq(messages.conversationId, conv.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ authorKind: "crew", authorUserId: null, body: reply.text, reply });
    expect(done.resultMessageId).toBe(rows[0]?.id);
    expect(await deps.db.select().from(notifications)).toHaveLength(0);
    const retried = await finishTestJob(deps, SYSTEM, { jobId: job.id, reply, status: "ready" });
    expect(retried.resultMessageId).toBe(done.resultMessageId);
    expect(await deps.db.select().from(messages).where(eq(messages.conversationId, conv.id))).toHaveLength(1);
  });

  it("files a room-less reply in a new conversation and notifies once per job", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const job = await createJob(deps, actor, { kind: "appeal_outline", refId: "offer-1" });
    const done = await finishTestJob(deps, SYSTEM, { jobId: job.id, reply, status: "ready" });
    const [conv] = await deps.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, done.conversationId as string));
    expect(conv).toMatchObject({ ownerId: user.id, room: "my_crew", title: "Appeal outline" });
    await finishTestJob(deps, SYSTEM, { jobId: job.id, reply: null, status: "ready" });
    const sent = await deps.db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(sent).toHaveLength(1);
    // R2P-9: the outline lives in the conversation, not on the offer page.
    expect(sent[0]).toMatchObject({ kind: "job_ready", dedupeKey: `job:${job.id}`, link: `/crew/${conv?.id}` });
  });

  it("links a retake notice to its conversation and falls back to /prep without one", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const ok = await createJob(deps, actor, { kind: "retake_analysis" });
    const done = await finishTestJob(deps, SYSTEM, { jobId: ok.id, reply, status: "ready" });
    const failed = await createJob(deps, actor, { kind: "retake_analysis" });
    await finishTestJob(deps, SYSTEM, { jobId: failed.id, reply: null, status: "failed", error: "timeout" });
    const essay = await createJob(deps, actor, { kind: "essay_review", refId: "essay-1" });
    await finishTestJob(deps, SYSTEM, { jobId: essay.id, reply, status: "ready" });
    const links = Object.fromEntries(
      (await deps.db.select().from(notifications).where(eq(notifications.userId, user.id))).map((n) => [n.dedupeKey, n.link]),
    );
    expect(links[`job:${ok.id}`]).toBe(`/crew/${done.conversationId}`);
    expect(links[`job:${failed.id}`]).toBe("/prep");
    expect(links[`job:${essay.id}`]).toBe("/essays/essay-1");
  });

  it("reuses the newest live room titled for the job kind (R2C-14)", async () => {
    const { deps, clock } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const first = await createJob(deps, actor, { kind: "weekly_plan" });
    const a = await finishTestJob(deps, SYSTEM, { jobId: first.id, reply, status: "ready" });
    clock.set("2026-10-13T15:00:00.000Z");
    const second = await createJob(deps, actor, { kind: "weekly_plan" });
    const b = await finishTestJob(deps, SYSTEM, { jobId: second.id, reply, status: "ready" });
    expect(b.conversationId).toBe(a.conversationId);
    expect(await deps.db.select().from(messages).where(eq(messages.conversationId, a.conversationId as string))).toHaveLength(2);
    const review = await createJob(deps, actor, { kind: "essay_review", refId: "essay-1" });
    const c = await finishTestJob(deps, SYSTEM, { jobId: review.id, reply, status: "ready" });
    expect(c.conversationId).not.toBe(a.conversationId);
    await deps.db
      .update(conversations)
      .set({ archivedAt: new Date("2026-10-13T16:00:00.000Z") })
      .where(eq(conversations.id, a.conversationId as string));
    const third = await createJob(deps, actor, { kind: "weekly_plan" });
    const d = await finishTestJob(deps, SYSTEM, { jobId: third.id, reply, status: "ready" });
    expect(d.conversationId).not.toBe(a.conversationId);
    const rooms = await deps.db.select().from(conversations).where(eq(conversations.ownerId, user.id));
    expect(rooms.filter((r) => r.title === "Weekly plan")).toHaveLength(2);
  });

  it("records agent runs and adds their cost to the job", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const job = await createJob(deps, actor, { kind: "weekly_plan" });
    const run = {
      jobId: job.id,
      userId: user.id,
      role: "compass",
      model: "claude-opus-5-5",
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 500,
      cacheWriteTokens: 0,
      stopReason: "tool_use",
      costMicros: 8100,
      durationMs: 1200,
    };
    await recordAgentRun(deps, SYSTEM, run);
    await recordAgentRun(deps, SYSTEM, { ...run, role: "scout", costMicros: 900 });
    expect(await deps.db.select().from(agentRuns).where(eq(agentRuns.jobId, job.id))).toHaveLength(2);
    const [row] = await deps.db.select().from(crewJobs).where(eq(crewJobs.id, job.id));
    expect(row?.costMicros).toBe(9000);
    await expect(recordAgentRun(deps, actor, run)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("lets family members read family-room jobs", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { family, actor: parent } = await makeParentOf(deps, user.id);
    const outsider = userActor((await factories.parent(deps.db)).id, "parent");
    const conv = await factories.conversation(deps.db, user.id, { room: "family", familyId: family.id });
    const job = await createJob(deps, actor, { kind: "crew_request", conversationId: conv.id });
    expect((await getJob(deps, parent, job.id)).id).toBe(job.id);
    await expect(getJob(deps, outsider, job.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("lists the actor's own jobs newest first, with an active filter and a capped limit", async () => {
    const { deps, clock } = makeDeps();
    const { actor } = await makeStudent(deps);
    const { actor: other } = await makeStudent(deps);
    const done = await createJob(deps, actor, { kind: "weekly_plan" });
    await finishTestJob(deps, SYSTEM, { jobId: done.id, reply: null, status: "ready" });
    clock.set("2026-10-06T15:01:00.000Z");
    const working = await createJob(deps, actor, { kind: "essay_review", refId: "essay-1" });
    await startJob(deps, SYSTEM, working.id, { leaseSeconds: 1200 });
    clock.set("2026-10-06T15:02:00.000Z");
    const queued = await createJob(deps, actor, { kind: "retake_analysis" });
    await createJob(deps, other, { kind: "weekly_plan" });
    const ids = (jobs: CrewJob[]) => jobs.map((j) => j.id);
    expect(ids(await listJobs(deps, actor))).toEqual([queued.id, working.id, done.id]);
    expect(ids(await listJobs(deps, actor, { active: true }))).toEqual([queued.id, working.id]);
    expect(ids(await listJobs(deps, actor, { limit: 1 }))).toEqual([queued.id]);
    expect(await listJobs(deps, actor, { limit: 0 })).toHaveLength(1);
    expect(await listJobs(deps, actor, { limit: 500 })).toHaveLength(3);
    await expect(listJobs(deps, SYSTEM)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("lists a parent's family-room requests until the parent leaves (R2C-11)", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { parent, family, actor: parentActor } = await makeParentOf(deps, user.id);
    const conv = await factories.conversation(deps.db, user.id, { room: "family", familyId: family.id });
    const [asked] = await deps.db
      .insert(messages)
      .values({ conversationId: conv.id, authorKind: "user", authorUserId: parent.id, body: "How are things going?" })
      .returning();
    const [studentAsked] = await deps.db
      .insert(messages)
      .values({ conversationId: conv.id, authorKind: "user", authorUserId: user.id, body: "What's next?" })
      .returning();
    const now = deps.clock.now();
    const parentJob = await insertJob(deps.db, {
      ownerId: user.id,
      kind: "crew_request",
      conversationId: conv.id,
      requestMessageId: asked?.id ?? null,
      now,
    });
    const studentJob = await insertJob(deps.db, {
      ownerId: user.id,
      kind: "crew_request",
      conversationId: conv.id,
      requestMessageId: studentAsked?.id ?? null,
      now,
    });
    expect((await listJobs(deps, parentActor, { active: true })).map((j) => j.id)).toEqual([parentJob.id]);
    expect((await listJobs(deps, actor)).map((j) => j.id).sort()).toEqual([parentJob.id, studentJob.id].sort());
    await deps.db
      .delete(familyMembers)
      .where(and(eq(familyMembers.familyId, family.id), eq(familyMembers.userId, parent.id)));
    expect(await listJobs(deps, parentActor, { active: true })).toEqual([]);
  });
});
async function finishTestJob(deps: Parameters<typeof completeJob>[0], system: Parameters<typeof completeJob>[1], input: Omit<Parameters<typeof completeJob>[2], "leaseToken">) {
  const claim = await startJob(deps, system, input.jobId, { leaseSeconds: 1200 });
  const [row] = await deps.db.select({ leaseToken: crewJobs.leaseToken }).from(crewJobs).where(eq(crewJobs.id, input.jobId));
  return (await completeJob(deps, system, { ...input, leaseToken: claim?.leaseToken ?? row?.leaseToken ?? "00000000-0000-4000-8000-000000000099" })).job;
}

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/crew/jobs.test.ts`
Expected: FAIL with `Failed to resolve import "./jobs" from "src/crew/jobs.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/crew/mappers.ts`:

```ts
import type { actionReceipts, conversations, crewJobs, messages } from "@scholarcrew/db";
import type { ActionReceipt, Conversation, CrewJob, Message } from "@scholarcrew/domain";
import { toIso, toIsoOrNull } from "../shared";

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type JobRow = typeof crewJobs.$inferSelect;
export type ReceiptRow = typeof actionReceipts.$inferSelect;

export function toCrewJob(row: JobRow): CrewJob {
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

export function toConversation(row: ConversationRow, lastMessageAt: Date | null): Conversation {
  return {
    id: row.id,
    room: row.room,
    roomRefId: row.roomRefId,
    familyId: row.familyId,
    title: row.title,
    createdAt: toIso(row.createdAt),
    expiresAt: toIsoOrNull(row.expiresAt),
    lastMessageAt: toIsoOrNull(lastMessageAt),
  };
}

export function toMessage(row: MessageRow, appliedCardIds: string[]): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    authorKind: row.authorKind,
    authorUserId: row.authorUserId,
    body: row.body,
    reply: row.reply ?? null,
    sharedCategories: row.sharedCategories ?? null,
    createdAt: toIso(row.createdAt),
    appliedCardIds,
  };
}

export function toReceipt(row: ReceiptRow): ActionReceipt {
  return {
    id: row.id,
    messageId: row.messageId,
    cardId: row.cardId,
    appliedAt: toIso(row.appliedAt),
    result: row.result,
  };
}
```

`packages/core/src/crew/jobs.ts`:

```ts
import {
  type DbOrTx,
  agentRuns,
  and,
  conversations,
  crewJobs,
  exportsTable,
  desc,
  eq,
  familyMembers,
  inArray,
  isNull,
  messages,
  or,
  sql,
} from "@scholarcrew/db";
import {
  type Actor,
  AgentRunRecord,
  type CrewJob,
  CrewReply,
  type JobKind,
  type JobStatus,
  ProgressEvent,
  type SafetyFlag,
  TERMINAL_JOB_STATUSES,
  invalidInput,
  notFound,
  JOB_KIND_QUEUE,
  QUEUE_EXPIRE_SECONDS,
  type ShareCategory,
} from "@scholarcrew/domain";
import { markOfferFailed } from "../money/offers";
import { addUsage } from "../billing/plans";
import { assertSystem, assertUser } from "../access";
import { notify } from "../notifications";
import { type CoreDeps, one, requireUuid } from "../shared";
import { type JobRow, toCrewJob } from "./mappers";

type NotifiedKind = Exclude<JobKind, "crew_request">;

/** R2P-9: `link` gets the conversation the reply landed in (null when there was no reply). */
const READY_NOTICE: Record<
  NotifiedKind,
  { title: string; link: (refId: string | null, conversationId: string | null) => string }
> = {
  weekly_plan: { title: "Your weekly plan is ready", link: () => "/week" },
  essay_review: { title: "Quill reviewed your essay", link: (r) => (r ? `/essays/${r}` : "/essays") },
  offer_parse: { title: "Your award letter is ready to review", link: (r) => (r ? `/money/offers/${r}` : "/money/offers") },
  appeal_outline: {
    title: "Your appeal outline is ready",
    link: (r, c) => (c ? `/crew/${c}` : r ? `/money/offers/${r}` : "/money/offers"),
  },
  retake_analysis: { title: "Your retake analysis is ready", link: (_r, c) => (c ? `/crew/${c}` : "/prep") },
};

const ROOM_TITLES: Record<JobKind, string> = {
  crew_request: "My Crew",
  weekly_plan: "Weekly plan",
  essay_review: "Essay review",
  offer_parse: "Award letter",
  appeal_outline: "Appeal outline",
  retake_analysis: "Retake analysis",
};

/** Inserts a queued crew job. No access or allowance check; callers do both. */
export async function insertJob(
  db: DbOrTx,
  i: {
    ownerId: string;
    kind: JobKind;
    now: Date;
    refId?: string | null;
    conversationId?: string | null;
    requestMessageId?: string | null;
  },
): Promise<CrewJob> {
  const row = one(
    await db
      .insert(crewJobs)
      .values({
        ownerId: i.ownerId,
        kind: i.kind,
        refId: i.refId ?? null,
        conversationId: i.conversationId ?? null,
        requestMessageId: i.requestMessageId ?? null,
        usageMonth: i.now.toISOString().slice(0, 7),
        createdAt: i.now,
        updatedAt: i.now,
      })
      .returning(),
    "crew_jobs insert",
  );
  return toCrewJob(row);
}

async function jobRow(db: DbOrTx, id: string): Promise<JobRow | undefined> {
  const [row] = await db.select().from(crewJobs).where(eq(crewJobs.id, id));
  return row;
}

/** True when the conversation is a family room and `userId` belongs to that family. */
export async function inFamilyRoom(db: DbOrTx, conversationId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(familyMembers, eq(familyMembers.familyId, conversations.familyId))
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.room, "family"), eq(familyMembers.userId, userId)),
    );
  return rows.length > 0;
}

export async function createJob(
  deps: CoreDeps,
  actor: Actor,
  i: { kind: JobKind; refId?: string; conversationId?: string },
): Promise<CrewJob> {
  assertUser(actor);
  if (i.conversationId !== undefined) {
    requireUuid(i.conversationId, "Conversation not found");
    const [conv] = await deps.db
      .select({ ownerId: conversations.ownerId })
      .from(conversations)
      .where(eq(conversations.id, i.conversationId));
    if (!conv || conv.ownerId !== actor.userId) throw notFound("Conversation not found");
  }
  return insertJob(deps.db, {
    ownerId: actor.userId,
    kind: i.kind,
    refId: i.refId ?? null,
    conversationId: i.conversationId ?? null,
    now: deps.clock.now(),
  });
}

export async function getJob(deps: CoreDeps, actor: Actor, id: string): Promise<CrewJob> {
  requireUuid(id, "Job not found");
  const row = await jobRow(deps.db, id);
  if (!row) throw notFound("Job not found");
  if (actor.kind === "system") return toCrewJob(row);
  assertUser(actor);
  if (row.ownerId === actor.userId) return toCrewJob(row);
  if (row.conversationId && (await inFamilyRoom(deps.db, row.conversationId, actor.userId))) return toCrewJob(row);
  throw notFound("Job not found");
}

const ACTIVE_JOB_STATUSES: JobStatus[] = ["queued", "working"];

/**
 * D28: the actor's own jobs, newest first, for the crew side panel, plus (R2C-11) jobs the actor asked for
 * in a family room they still belong to (those jobs are owned by the student). `limit` is clamped to 1..50
 * (default 20).
 */
export async function listJobs(
  deps: CoreDeps,
  actor: Actor,
  o: { active?: boolean; limit?: number } = {},
): Promise<CrewJob[]> {
  assertUser(actor);
  const requested = o.limit !== undefined && Number.isFinite(o.limit) ? Math.trunc(o.limit) : 20;
  const limit = Math.min(50, Math.max(1, requested));
  const familyRequests = deps.db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(
      familyMembers,
      and(eq(familyMembers.familyId, conversations.familyId), eq(familyMembers.userId, actor.userId)),
    )
    .where(and(eq(messages.authorUserId, actor.userId), eq(conversations.room, "family")));
  const visible = or(eq(crewJobs.ownerId, actor.userId), inArray(crewJobs.requestMessageId, familyRequests));
  const rows = await deps.db
    .select()
    .from(crewJobs)
    .where(o.active ? and(visible, inArray(crewJobs.status, ACTIVE_JOB_STATUSES)) : visible)
    .orderBy(desc(crewJobs.createdAt))
    .limit(limit);
  return rows.map(toCrewJob);
}

/** Atomically claims a queued job or replaces an expired lease. */
export async function startJob(deps: CoreDeps, system: Actor, id: string, o: { leaseSeconds: number }): Promise<{ job: CrewJob; leaseToken: string } | null> {
  assertSystem(system);
  requireUuid(id, "Job not found");
  const now = deps.clock.now();
  const [row] = await deps.db.update(crewJobs).set({ status: "working", attempt: sql`${crewJobs.attempt} + 1`, leaseToken: sql`gen_random_uuid()`, leaseExpiresAt: new Date(now.getTime() + o.leaseSeconds * 1000), updatedAt: now }).where(and(eq(crewJobs.id, id), or(eq(crewJobs.status, "queued"), and(eq(crewJobs.status, "working"), sql`${crewJobs.leaseExpiresAt} < ${now}`)))).returning();
  return row?.leaseToken ? { job: toCrewJob(row), leaseToken: row.leaseToken } : null;
}

export async function releaseJob(deps: CoreDeps, system: Actor, id: string, leaseToken: string): Promise<void> {
  assertSystem(system);
  await deps.db.update(crewJobs).set({ status: "queued", leaseToken: null, leaseExpiresAt: null, updatedAt: deps.clock.now() }).where(and(eq(crewJobs.id, id), eq(crewJobs.status, "working"), eq(crewJobs.leaseToken, leaseToken)));
}

export async function appendProgress(deps: CoreDeps, system: Actor, id: string, e: ProgressEvent): Promise<void> {
  assertSystem(system);
  requireUuid(id, "Job not found");
  const parsed = ProgressEvent.safeParse(e);
  if (!parsed.success) throw invalidInput("Bad progress event", parsed.error.issues);
  const rows = await deps.db
    .update(crewJobs)
    .set({
      progress: sql`${crewJobs.progress} || ${JSON.stringify([parsed.data])}::jsonb`,
      updatedAt: deps.clock.now(),
    })
    .where(eq(crewJobs.id, id))
    .returning({ id: crewJobs.id });
  if (rows.length === 0) throw notFound("Job not found");
}

function noticeBody(status: "ready" | "needs_input" | "failed"): string {
  if (status === "failed") return "We couldn't finish this one. Try again in a few minutes.";
  if (status === "needs_input") return "Your crew has a question for you.";
  return "Open it to take a look.";
}

export async function completeJob(
  deps: CoreDeps,
  system: Actor,
  i: {
    jobId: string;
    leaseToken: string;
    sharedCategories?: ShareCategory[];
    usage?: { costMicros: number; crewRequest: boolean };
    reply: CrewReply | null;
    status: "ready" | "needs_input" | "failed";
    error?: string;
    safety?: SafetyFlag;
  },
): Promise<{ job: CrewJob; completed: boolean }> {
  assertSystem(system);
  requireUuid(i.jobId, "Job not found");
  const job = await jobRow(deps.db, i.jobId);
  if (!job) throw notFound("Job not found");
  let reply: CrewReply | null = null;
  if (i.reply) {
    const parsed = CrewReply.safeParse(i.reply);
    if (!parsed.success) throw invalidInput("Bad crew reply", parsed.error.issues);
    reply = parsed.data;
  }
  const now = deps.clock.now();
  const result = await deps.db.transaction(async (tx) => {
    const [locked] = await tx.select().from(crewJobs).where(eq(crewJobs.id, i.jobId)).for("update");
    if (!locked) throw notFound("Job not found");
    if (TERMINAL_JOB_STATUSES.includes(locked.status) || locked.leaseToken !== i.leaseToken) return { row: locked, completed: false };
    let conversationId = job.conversationId;
    let resultMessageId = job.resultMessageId;
    if (reply) {
      if (!conversationId) {
        // R2C-14: reuse the owner's newest live room for this kind before opening a new one.
        const title = ROOM_TITLES[job.kind];
        const [existing] = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.ownerId, job.ownerId),
              eq(conversations.room, "my_crew"),
              eq(conversations.title, title),
              isNull(conversations.roomRefId),
              isNull(conversations.archivedAt),
            ),
          )
          .orderBy(desc(conversations.createdAt))
          .limit(1);
        conversationId =
          existing?.id ??
          one(
            await tx
              .insert(conversations)
              .values({ ownerId: job.ownerId, room: "my_crew", title, createdAt: now })
              .returning(),
            "conversations insert",
          ).id;
      }
      const message = one(
        await tx
          .insert(messages)
          .values({ conversationId, authorKind: "crew", authorUserId: null, body: reply.text, reply, sharedCategories: i.sharedCategories ?? null, createdAt: now })
          .returning(),
        "messages insert",
      );
      resultMessageId = message.id;
    }
    const billableCost = Math.max(locked.costMicros, i.usage?.costMicros ?? 0);
    if (billableCost > 0 || i.usage?.crewRequest) await addUsage(tx, { userId: locked.ownerId, month: locked.usageMonth, costMicros: billableCost, crewRequest: i.usage?.crewRequest ?? false });
    const row = one(
      await tx
        .update(crewJobs)
        .set({
          status: i.status,
          leaseToken: null,
          leaseExpiresAt: null,
          conversationId,
          resultMessageId,
          error: i.error ?? null,
          safety: i.safety ?? reply?.safety ?? null,
          updatedAt: now,
        })
        .where(and(eq(crewJobs.id, job.id), eq(crewJobs.leaseToken, i.leaseToken), inArray(crewJobs.status, ["queued", "working"])))
        .returning(),
      "crew_jobs update",
    );
    return { row, completed: true };
  });
  if (!result.completed) return { job: toCrewJob(result.row), completed: false };
  const updated = result.row;
  const kind = job.kind;
  if (kind !== "crew_request") {
    const notice = READY_NOTICE[kind];
    await notify(deps, system, {
      userId: job.ownerId,
      kind: "job_ready",
      title: i.status === "failed" ? `${ROOM_TITLES[kind]} didn't finish` : notice.title,
      body: noticeBody(i.status),
      link: notice.link(job.refId, updated.conversationId),
      dedupeKey: `job:${job.id}`,
    });
  }
  return { job: toCrewJob(updated), completed: true };
}

export const STALE_JOB_TEXT = "This took too long and stopped. Try it again.";
const REAPER_MARGIN_SECONDS = 600;

export async function reapStaleJobs(deps: CoreDeps, system: Actor): Promise<{ jobs: number; exports: number }> {
  assertSystem(system);
  const now = deps.clock.now();
  const rows = await deps.db.select().from(crewJobs).where(inArray(crewJobs.status, ["queued", "working"]));
  let jobs = 0;
  for (const row of rows) {
    const expiry = row.leaseExpiresAt?.getTime() ?? row.updatedAt.getTime() + QUEUE_EXPIRE_SECONDS[JOB_KIND_QUEUE[row.kind]] * 1000;
    if (expiry >= now.getTime() - REAPER_MARGIN_SECONDS * 1000) continue;
    const failed = await deps.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(crewJobs).where(eq(crewJobs.id, row.id)).for("update");
      if (!locked || !["queued", "working"].includes(locked.status) || locked.updatedAt.getTime() !== row.updatedAt.getTime() || locked.leaseToken !== row.leaseToken) return null;
      if (locked.costMicros > 0) await addUsage(tx, { userId: locked.ownerId, month: locked.usageMonth, costMicros: locked.costMicros, crewRequest: false });
      return one(await tx.update(crewJobs).set({ status: "failed", error: STALE_JOB_TEXT, leaseToken: null, leaseExpiresAt: null, updatedAt: now }).where(eq(crewJobs.id, row.id)).returning(), "stale job");
    });
    if (!failed) continue;
    jobs += 1;
    if (row.kind === "offer_parse" && row.refId) await markOfferFailed(deps, system, { offerId: row.refId, ownerId: row.ownerId, error: STALE_JOB_TEXT });
    const link = row.kind === "crew_request" ? `/crew/${row.conversationId}` : READY_NOTICE[row.kind].link(row.refId, row.conversationId);
    await notify(deps, system, { userId: row.ownerId, kind: "job_ready", title: `${ROOM_TITLES[row.kind]} didn't finish`, body: STALE_JOB_TEXT, link, dedupeKey: `job:${row.id}` });
  }
  const abandoned = await deps.db.update(exportsTable).set({ status: "failed", expiresAt: new Date(now.getTime() + 86_400_000) }).where(and(eq(exportsTable.status, "queued"), sql`${exportsTable.createdAt} < ${new Date(now.getTime() - 3_600_000)}`)).returning();
  for (const row of abandoned) await notify(deps, system, { userId: row.userId, kind: "job_ready", title: "Your export didn't finish", body: STALE_JOB_TEXT, link: "/settings", dedupeKey: `export:${row.id}` });
  return { jobs, exports: abandoned.length };
}

export async function recordAgentRun(deps: CoreDeps, system: Actor, r: AgentRunRecord, o: { leaseToken?: string } = {}): Promise<void> {
  assertSystem(system);
  const now = deps.clock.now();
  // Cost is durable even if optional telemetry validation/insertion fails. All attempts accumulate on the job.
  if (r.jobId && r.userId && Number.isSafeInteger(r.costMicros) && r.costMicros >= 0) {
    await deps.db.update(crewJobs).set({ costMicros: sql`${crewJobs.costMicros} + ${r.costMicros}` })
      .where(and(eq(crewJobs.id, r.jobId), eq(crewJobs.ownerId, r.userId), inArray(crewJobs.status, ["queued", "working"]), o.leaseToken ? eq(crewJobs.leaseToken, o.leaseToken) : undefined));
  }
  const parsed = AgentRunRecord.safeParse(r);
  if (!parsed.success) throw invalidInput("Bad agent run record", parsed.error.issues);
  await deps.db.insert(agentRuns).values({ ...parsed.data, createdAt: now });
}

```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/crew/jobs.test.ts`
Expected: PASS, 1 file, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/crew/mappers.ts packages/core/src/crew/jobs.ts packages/core/src/crew/jobs.test.ts
git commit -m "feat(core): crew jobs with progress, completion messages, and agent run costs"
```

### H3: Weekly plan items and generated plans

- [ ] **Step 1: Write the failing test**

`packages/core/src/plan/items.test.ts`:

```ts
import { eq, planItems, profiles, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type PlanItemInput, systemActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { addPlanItem, getWeekPlan, replaceGeneratedPlan, requestWeeklyPlan, startWeeklyPlan, updatePlanItem } from "./items";
import { NOW, WEEK, makeDeps, makeParentOf, makeStudent, setShare } from "./testkit";

const SYSTEM = systemActor("test");
const item = (o: Partial<PlanItemInput> = {}): PlanItemInput => ({
  title: "Draft the Rotary essay",
  kind: "essay",
  refType: null,
  refId: null,
  minutes: 45,
  valueUsd: null,
  dueOn: null,
  contributors: [],
  weekStart: null,
  ...o,
});

describe("plan items", () => {
  it("adds items to the student's current week and moves other dates to their Monday", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    const a = await addPlanItem(deps, actor, item());
    expect(a).toMatchObject({ weekStart: WEEK, status: "todo", contributors: [], priority: 0, completedAt: null });
    const b = await addPlanItem(deps, actor, item({ weekStart: "2026-10-14" }));
    expect(b.weekStart).toBe("2026-10-12");
    await expect(addPlanItem(deps, actor, item({ minutes: -5 }))).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("marks items done, reopens them, and moves them to another week", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    const { actor: other } = await makeStudent(deps);
    const a = await addPlanItem(deps, actor, item());
    expect(await updatePlanItem(deps, actor, a.id, { status: "done" })).toMatchObject({ status: "done", completedAt: NOW });
    expect(await updatePlanItem(deps, actor, a.id, { status: "todo" })).toMatchObject({ status: "todo", completedAt: null });
    expect((await updatePlanItem(deps, actor, a.id, { weekStart: "2026-10-13" })).weekStart).toBe("2026-10-12");
    await expect(updatePlanItem(deps, other, a.id, { status: "done" })).rejects.toMatchObject({ code: "not_found" });
    await expect(updatePlanItem(deps, actor, "nope", { status: "done" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("orders the week by due date and follows the deadlines share", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { actor: parent } = await makeParentOf(deps, user.id);
    await addPlanItem(deps, actor, item({ title: "No date", minutes: 10 }));
    await addPlanItem(deps, actor, item({ title: "Oct 15", minutes: 30, dueOn: "2026-10-15" }));
    const early = await addPlanItem(deps, actor, item({ title: "Oct 9", minutes: 20, dueOn: "2026-10-09" }));
    const done = await addPlanItem(deps, actor, item({ title: "Done", minutes: 5, dueOn: "2026-10-07" }));
    await updatePlanItem(deps, actor, done.id, { status: "done" });
    const plan = await getWeekPlan(deps, actor, user.id);
    expect(plan.weekStart).toBe(WEEK);
    expect(plan.items.map((i) => i.title)).toEqual(["Oct 9", "Oct 15", "No date", "Done"]);
    expect(plan).toMatchObject({ totalMinutes: 65, doneCount: 1 });
    expect(plan.items[0]?.id).toBe(early.id);
    expect((await getWeekPlan(deps, parent, user.id)).items).toHaveLength(4);
    expect((await getWeekPlan(deps, actor, user.id, "2026-10-14")).items).toEqual([]);
    await setShare(deps, user.id, "deadlines", false);
    await expect(getWeekPlan(deps, parent, user.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("enqueues a weekly plan job within the crew allowance", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const job = await requestWeeklyPlan(deps, actor);
    expect(job).toMatchObject({ kind: "weekly_plan", status: "queued", refId: null });
    expect(deps.jobs.sent).toEqual([{ name: "plan.weekly", payload: { jobId: job.id, ownerId: user.id } }]);
    await deps.db.insert(usageCounters).values({ userId: user.id, month: "2026-10", crewRequests: 20 });
    deps.jobs.clear();
    await expect(requestWeeklyPlan(deps, actor)).rejects.toMatchObject({ code: "limit_reached" });
    expect(deps.jobs.sent).toEqual([]);
  });

  it("replaces generated items and keeps user-added and done ones", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    await addPlanItem(deps, actor, item({ title: "Mine" }));
    const nextWeek = await addPlanItem(deps, actor, item({ title: "Next week", contributors: ["prep"], weekStart: "2026-10-12" }));
    const first = await replaceGeneratedPlan(deps, SYSTEM, {
      ownerId: user.id,
      weekStart: WEEK,
      items: [item({ title: "Gen A", contributors: ["scout"] }), item({ title: "Gen B", contributors: ["quill"] })],
    });
    expect(first.items.map((i) => i.title).sort()).toEqual(["Gen A", "Gen B", "Mine"]);
    const genA = first.items.find((i) => i.title === "Gen A");
    if (!genA) throw new Error("Gen A missing");
    await updatePlanItem(deps, actor, genA.id, { status: "done" });
    const second = await replaceGeneratedPlan(deps, SYSTEM, {
      ownerId: user.id,
      weekStart: WEEK,
      items: [item({ title: "Gen C" })],
    });
    expect(second.items.map((i) => i.title).sort()).toEqual(["Gen A", "Gen C", "Mine"]);
    expect(second.items.find((i) => i.title === "Gen C")?.contributors).toEqual(["compass"]);
    expect(await deps.db.select().from(planItems).where(eq(planItems.id, nextWeek.id))).toHaveLength(1);
    await expect(
      replaceGeneratedPlan(deps, actor, { ownerId: user.id, weekStart: WEEK, items: [] }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("keeps applied card items and study sessions when it regenerates (R2C-4)", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    // An applied add_plan_item card and an accepted Prep session both carry contributors but aren't generated.
    const card = await addPlanItem(deps, actor, item({ title: "From Scout's card", contributors: ["scout"] }));
    const study = await addPlanItem(deps, actor, item({ title: "SAT reading set", kind: "test_prep", contributors: ["prep"] }));
    await replaceGeneratedPlan(deps, SYSTEM, { ownerId: user.id, weekStart: WEEK, items: [item({ title: "Gen A" })] });
    const again = await replaceGeneratedPlan(deps, SYSTEM, {
      ownerId: user.id,
      weekStart: WEEK,
      items: [item({ title: "Gen B" })],
    });
    expect(again.items.map((i) => i.title).sort()).toEqual(["From Scout's card", "Gen B", "SAT reading set"]);
    const rows = await deps.db.select().from(planItems).where(eq(planItems.ownerId, user.id));
    expect(rows.find((r) => r.id === card.id)?.generated).toBe(false);
    expect(rows.find((r) => r.id === study.id)?.generated).toBe(false);
    expect(rows.find((r) => r.title === "Gen B")?.generated).toBe(true);
  });

  it("starts a system weekly plan for onboarded students, at most once in 12 hours (R2C-5)", async () => {
    const { deps, clock } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    await deps.db.insert(usageCounters).values({ userId: user.id, month: "2026-10", crewRequests: 20 });
    await expect(startWeeklyPlan(deps, actor, user.id)).rejects.toMatchObject({ code: "forbidden" });
    const job = await startWeeklyPlan(deps, SYSTEM, user.id);
    expect(job).toMatchObject({ kind: "weekly_plan", status: "queued" });
    expect(deps.jobs.sent).toEqual([
      { name: "plan.weekly", payload: { jobId: job?.id, ownerId: user.id, source: "system" } },
    ]);
    deps.jobs.clear();
    expect(await startWeeklyPlan(deps, SYSTEM, user.id)).toBeNull();
    clock.set("2026-10-07T03:01:00.000Z");
    expect(await startWeeklyPlan(deps, SYSTEM, user.id)).not.toBeNull();
    const parent = await factories.parent(deps.db);
    expect(await startWeeklyPlan(deps, SYSTEM, parent.id)).toBeNull();
    const { user: fresh } = await makeStudent(deps);
    await deps.db.update(profiles).set({ onboardingCompletedAt: null }).where(eq(profiles.userId, fresh.id));
    expect(await startWeeklyPlan(deps, SYSTEM, fresh.id)).toBeNull();
    expect(await startWeeklyPlan(deps, SYSTEM, "nope")).toBeNull();
    expect(deps.jobs.sent).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/plan/items.test.ts`
Expected: FAIL with `Failed to resolve import "./items" from "src/plan/items.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/plan/items.ts`:

```ts
import { and, crewJobs, eq, gt, isNotNull, planItems, profiles, users } from "@scholarcrew/db";
import {
  type Actor,
  type CrewJob,
  IsoDate,
  type PlanItem,
  PlanItemInput,
  PlanItemPatch,
  type WeekPlan,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { prioritizePlanItems, weekStartFor } from "@scholarcrew/engines";
import { assertCanRead, assertOwner, assertSystem, assertUser } from "../access";
import { assertCrewAllowance } from "../billing";
import { insertJob } from "../crew/jobs";
import { type CoreDeps, isUuid, one, requireUuid } from "../shared";
import { mondayOf, toPlanItem, userTimeZone } from "./common";

/** The week's items in priority order. No access check. */
export async function loadWeekPlan(deps: CoreDeps, ownerId: string, weekStart?: IsoDate): Promise<WeekPlan> {
  const now = deps.clock.now();
  const timeZone = await userTimeZone(deps.db, ownerId);
  const week = weekStart ? mondayOf(weekStart) : weekStartFor(now, timeZone);
  const rows = await deps.db
    .select()
    .from(planItems)
    .where(and(eq(planItems.ownerId, ownerId), eq(planItems.weekStart, week)));
  const items = prioritizePlanItems(rows.map(toPlanItem), now, timeZone);
  return {
    weekStart: week,
    items,
    totalMinutes: items.reduce((sum, i) => sum + i.minutes, 0),
    doneCount: items.filter((i) => i.status === "done").length,
  };
}

export async function getWeekPlan(deps: CoreDeps, actor: Actor, studentId: string, weekStart?: IsoDate): Promise<WeekPlan> {
  await assertCanRead(deps, actor, studentId, "deadlines");
  if (weekStart !== undefined && !IsoDate.safeParse(weekStart).success) {
    throw invalidInput("Use a YYYY-MM-DD week start");
  }
  return loadWeekPlan(deps, studentId, weekStart);
}

export async function addPlanItem(deps: CoreDeps, actor: Actor, i: PlanItemInput): Promise<PlanItem> {
  assertUser(actor);
  const parsed = PlanItemInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the plan item and try again", parsed.error.issues);
  const v = parsed.data;
  const now = deps.clock.now();
  const weekStart = v.weekStart ? mondayOf(v.weekStart) : weekStartFor(now, await userTimeZone(deps.db, actor.userId));
  const row = one(
    await deps.db
      .insert(planItems)
      .values({
        ownerId: actor.userId,
        weekStart,
        title: v.title,
        kind: v.kind,
        refType: v.refType,
        refId: v.refId,
        minutes: v.minutes,
        valueUsd: v.valueUsd,
        dueOn: v.dueOn,
        contributors: v.contributors,
        createdAt: now,
      })
      .returning(),
    "plan_items insert",
  );
  return toPlanItem(row);
}

export async function updatePlanItem(deps: CoreDeps, actor: Actor, id: string, p: PlanItemPatch): Promise<PlanItem> {
  assertUser(actor);
  requireUuid(id, "Plan item not found");
  const parsed = PlanItemPatch.safeParse(p);
  if (!parsed.success) throw invalidInput("Check the plan item and try again", parsed.error.issues);
  const [row] = await deps.db.select().from(planItems).where(eq(planItems.id, id));
  if (!row) throw notFound("Plan item not found");
  assertOwner(actor, row.ownerId);
  const set: Partial<typeof planItems.$inferInsert> = {};
  if (parsed.data.status !== undefined) {
    set.status = parsed.data.status;
    set.completedAt = parsed.data.status === "done" ? deps.clock.now() : null;
  }
  if (parsed.data.weekStart !== undefined) set.weekStart = mondayOf(parsed.data.weekStart);
  if (Object.keys(set).length === 0) return toPlanItem(row);
  const updated = one(await deps.db.update(planItems).set(set).where(eq(planItems.id, id)).returning(), "plan_items update");
  return toPlanItem(updated);
}

export async function requestWeeklyPlan(deps: CoreDeps, actor: Actor): Promise<CrewJob> {
  assertUser(actor);
  await assertCrewAllowance(deps, actor.userId);
  const job = await insertJob(deps.db, { ownerId: actor.userId, kind: "weekly_plan", now: deps.clock.now() });
  await deps.jobs.enqueue("plan.weekly", { jobId: job.id, ownerId: actor.userId });
  return job;
}

/** A `weekly_plan` job this recent means the Monday fan-out (or the student) already asked. */
const SYSTEM_PLAN_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/**
 * R2C-5: the Monday `plan.weekly.fanout` calls this per student. System only, no allowance check (the worker
 * runs it with `crewRequest: false`). Returns null for anyone who isn't an active, onboarded student, and when
 * a `weekly_plan` job was created in the last 12 hours, so fan-out retries don't double up.
 */
export async function startWeeklyPlan(deps: CoreDeps, system: Actor, ownerId: string): Promise<CrewJob | null> {
  assertSystem(system);
  if (!isUuid(ownerId)) return null;
  const [student] = await deps.db
    .select({ id: users.id })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        eq(users.id, ownerId),
        eq(users.role, "student"),
        eq(users.status, "active"),
        isNotNull(profiles.onboardingCompletedAt),
      ),
    );
  if (!student) return null;
  const now = deps.clock.now();
  const [recent] = await deps.db
    .select({ id: crewJobs.id })
    .from(crewJobs)
    .where(
      and(
        eq(crewJobs.ownerId, ownerId),
        eq(crewJobs.kind, "weekly_plan"),
        gt(crewJobs.createdAt, new Date(now.getTime() - SYSTEM_PLAN_COOLDOWN_MS)),
      ),
    )
    .limit(1);
  if (recent) return null;
  const job = await insertJob(deps.db, { ownerId, kind: "weekly_plan", now });
  await deps.jobs.enqueue("plan.weekly", { jobId: job.id, ownerId, source: "system" });
  return job;
}

/**
 * Swaps the crew's open items for the week. Only rows this function inserted (`generated = true`) are
 * replaced (R2C-4): items the student added, applied from an action card, or accepted from a study plan stay,
 * whatever their contributors, and done or skipped items stay too.
 */
export async function replaceGeneratedPlan(
  deps: CoreDeps,
  system: Actor,
  i: { ownerId: string; weekStart: IsoDate; items: PlanItemInput[] },
): Promise<WeekPlan> {
  assertSystem(system);
  requireUuid(i.ownerId, "Student not found");
  if (!IsoDate.safeParse(i.weekStart).success) throw invalidInput("Use a YYYY-MM-DD week start");
  const week = mondayOf(i.weekStart);
  const items = i.items.map((raw, idx) => {
    const parsed = PlanItemInput.safeParse(raw);
    if (!parsed.success) throw invalidInput(`Plan item ${idx + 1} is invalid`, parsed.error.issues);
    return parsed.data;
  });
  const now = deps.clock.now();
  await deps.db.transaction(async (tx) => {
    await tx
      .delete(planItems)
      .where(
        and(
          eq(planItems.ownerId, i.ownerId),
          eq(planItems.weekStart, week),
          eq(planItems.status, "todo"),
          eq(planItems.generated, true),
        ),
      );
    if (items.length === 0) return;
    await tx.insert(planItems).values(
      items.map((v, idx) => ({
        ownerId: i.ownerId,
        weekStart: week,
        title: v.title,
        kind: v.kind,
        refType: v.refType,
        refId: v.refId,
        minutes: v.minutes,
        valueUsd: v.valueUsd,
        dueOn: v.dueOn,
        contributors: v.contributors.length > 0 ? v.contributors : ["compass" as const],
        priority: items.length - idx,
        generated: true,
        createdAt: now,
      })),
    );
  });
  return loadWeekPlan(deps, i.ownerId, week);
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/plan/items.test.ts`
Expected: PASS, 1 file, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plan/items.ts packages/core/src/plan/items.test.ts
git commit -m "feat(core): weekly plan items, weekly plan jobs, and generated plan swaps"
```

### H4: Cost estimates, calculator results, and the gap

Per current-season college the source order is: the newest confirmed, unarchived offer (archived offers belong to a past season, D1), then the student's calculator row, then the Scorecard estimate (R2P-6: a real letter beats any estimate; the calculator only replaces the Scorecard, MO-02). Free money adds won outside scholarships for year 1. Pending is the max amount of applications in `planned`, `drafting`, or `submitted` whose listing is still live (`liveListingWhere`, R2P-4), so a retired or scam-flagged listing stops lowering the gap. A `planned` or `drafting` application counts only while its listing is undated or due today or later in the student's zone; `submitted` always counts (R3V-6).

- [ ] **Step 1: Write the failing test**

`packages/core/src/money/costs.test.ts`:

```ts
import { costEstimates, eq, familyBudgets, offerLines, offers, scholarships } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { setSensitiveFact } from "../memory";
import { NOW, listCollege, makeDeps, makeParentOf, makeStateU, makeStudent, saveApp, setShare } from "../plan/testkit";
import { getCosts, setCalculatorResult } from "./costs";

async function stateUStudent(withRange: boolean) {
  const { deps } = makeDeps();
  const student = await makeStudent(deps);
  const college = await makeStateU(deps);
  await listCollege(deps, student.user.id, college.id, { plan: "EA" });
  if (withRange) {
    await setSensitiveFact(deps, student.actor, { kind: "income_range", enabled: true, value: "48_75k" });
  }
  const apps = [
    ["planned", 2500],
    ["drafting", 1000],
    ["submitted", 750],
    ["planned", 500],
    ["matched", 2000],
    ["lost", 300],
  ] as const;
  for (const [stage, amountUsd] of apps) await saveApp(deps, student.user.id, { stage, amountUsd });
  return { deps, ...student, college };
}

describe("getCosts", () => {
  it("estimates State U from the Scorecard band for the shared income range", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    expect(await getCosts(deps, actor, user.id)).toEqual([
      {
        collegeId: "100001",
        collegeName: "State U",
        source: "scorecard",
        sourceLabel: "College Scorecard estimate for your income range",
        costOfAttendanceUsd: 27800,
        freeMoneyUsd: 18600,
        gapUsd: 9200,
        pendingUsd: 4750,
        gapIfPendingWinUsd: 4450,
        isEstimate: true,
        budgetUsd: null,
        gapAfterBudgetUsd: null,
      },
    ]);
    const rows = await deps.db.select().from(costEstimates).where(eq(costEstimates.ownerId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "scorecard",
      costOfAttendanceUsd: 27800,
      freeMoneyUsd: 18600,
      netPriceUsd: 9200,
      inputs: { basis: "income_range" },
    });
    await getCosts(deps, actor, user.id);
    expect(await deps.db.select().from(costEstimates).where(eq(costEstimates.ownerId, user.id))).toHaveLength(1);
  });

  it("uses the overall average when no income range is shared", async () => {
    const { deps, user, actor } = await stateUStudent(false);
    const [summary] = await getCosts(deps, actor, user.id);
    expect(summary).toMatchObject({
      sourceLabel: "College Scorecard average (no income range shared)",
      freeMoneyUsd: 15800,
      gapUsd: 12000,
      gapIfPendingWinUsd: 7250,
    });
  });

  it("counts won outside scholarships as free money for year 1", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    await saveApp(deps, user.id, { stage: "won", amountUsd: 1000, outcomeUsd: 1000, outcomeRenewable: false });
    const [summary] = await getCosts(deps, actor, user.id);
    expect(summary).toMatchObject({ freeMoneyUsd: 19600, gapUsd: 8200, pendingUsd: 4750, gapIfPendingWinUsd: 3450 });
  });

  it("prefers a confirmed award letter over the Scorecard", async () => {
    const { deps, user, actor, college } = await stateUStudent(true);
    const [offer] = await deps.db
      .insert(offers)
      .values({
        ownerId: user.id,
        collegeId: college.id,
        awardYear: "2027-28",
        status: "confirmed",
        costOfAttendanceUsd: 27800,
        confirmedAt: new Date(NOW),
      })
      .returning();
    if (!offer) throw new Error("offer insert failed");
    await deps.db.insert(offerLines).values([
      { offerId: offer.id, position: 0, label: "Texas Grant", amountUsd: 15000, category: "grant" },
      { offerId: offer.id, position: 1, label: "State U Merit", amountUsd: 3000, category: "scholarship" },
      { offerId: offer.id, position: 2, label: "Federal Direct Loan", amountUsd: 5500, category: "loan_federal_unsubsidized" },
    ]);
    const [summary] = await getCosts(deps, actor, user.id);
    expect(summary).toMatchObject({
      source: "offer",
      sourceLabel: "Your confirmed award letter",
      freeMoneyUsd: 18000,
      gapUsd: 9800,
      isEstimate: false,
    });
    await deps.db.update(offers).set({ archivedAt: new Date(NOW) }).where(eq(offers.id, offer.id));
    expect((await getCosts(deps, actor, user.id))[0]?.source).toBe("scorecard");
  });

  it("prefers a confirmed award letter over a calculator result, then falls back to it (R2P-6)", async () => {
    const { deps, user, actor, college } = await stateUStudent(true);
    await setCalculatorResult(deps, actor, { collegeId: college.id, costOfAttendanceUsd: 28000, grantsUsd: 20000 });
    const [offer] = await deps.db
      .insert(offers)
      .values({
        ownerId: user.id,
        collegeId: college.id,
        awardYear: "2027-28",
        status: "confirmed",
        costOfAttendanceUsd: 27800,
        confirmedAt: new Date(NOW),
      })
      .returning();
    if (!offer) throw new Error("offer insert failed");
    await deps.db
      .insert(offerLines)
      .values({ offerId: offer.id, position: 0, label: "Texas Grant", amountUsd: 15000, category: "grant" });
    expect((await getCosts(deps, actor, user.id))[0]).toMatchObject({
      source: "offer",
      isEstimate: false,
      freeMoneyUsd: 15000,
    });
    await deps.db.update(offers).set({ archivedAt: new Date(NOW) }).where(eq(offers.id, offer.id));
    expect((await getCosts(deps, actor, user.id))[0]).toMatchObject({ source: "calculator", isEstimate: true });
  });

  it("leaves retired listings out of pending money (R2P-4)", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    const { scholarship } = await saveApp(deps, user.id, { stage: "planned", amountUsd: 900 });
    expect((await getCosts(deps, actor, user.id))[0]?.pendingUsd).toBe(5650);
    await deps.db.update(scholarships).set({ status: "retired" }).where(eq(scholarships.id, scholarship.id));
    expect((await getCosts(deps, actor, user.id))[0]).toMatchObject({ pendingUsd: 4750, gapIfPendingWinUsd: 4450 });
  });

  it("leaves past-due planned and drafting money out of pending, but keeps submitted (R3V-6)", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    await saveApp(deps, user.id, { stage: "planned", amountUsd: 900, deadline: "2026-10-05" });
    await saveApp(deps, user.id, { stage: "drafting", amountUsd: 400, deadline: "2026-10-05" });
    await saveApp(deps, user.id, { stage: "planned", amountUsd: 100, deadline: "2026-10-06" });
    await saveApp(deps, user.id, { stage: "planned", amountUsd: 50, deadline: null });
    await saveApp(deps, user.id, { stage: "submitted", amountUsd: 600, deadline: "2026-10-05" });
    expect((await getCosts(deps, actor, user.id))[0]?.pendingUsd).toBe(4750 + 100 + 50 + 600);
  });

  it("skips colleges without numbers and colleges from other seasons", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    const blank = await factories.college(deps.db, { id: "100002", name: "No Data", costOfAttendanceUsd: null });
    const old = await factories.college(deps.db, { id: "100003", name: "Last Year" });
    await listCollege(deps, user.id, blank.id, { minutesAfter: 1 });
    await listCollege(deps, user.id, old.id, { season: "2025-26", minutesAfter: 2 });
    expect((await getCosts(deps, actor, user.id)).map((c) => c.collegeName)).toEqual(["State U"]);
  });

  it("shows the gap after a shared family budget and follows the costs share", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    const { parent, family, actor: parentActor } = await makeParentOf(deps, user.id);
    const { actor: other } = await makeStudent(deps);
    await deps.db.insert(familyBudgets).values({ familyId: family.id, annualUsd: 4600, sharedById: parent.id });
    const [summary] = await getCosts(deps, parentActor, user.id);
    expect(summary).toMatchObject({ gapUsd: 9200, budgetUsd: 4600, gapAfterBudgetUsd: 4600 });
    expect((await getCosts(deps, actor, user.id))[0]?.gapAfterBudgetUsd).toBe(4600);
    await expect(getCosts(deps, other, user.id)).rejects.toMatchObject({ code: "not_found" });
    await setShare(deps, user.id, "costs", false);
    await expect(getCosts(deps, parentActor, user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("setCalculatorResult", () => {
  it("replaces the Scorecard estimate with the student's calculator result", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    const summary = await setCalculatorResult(deps, actor, { collegeId: "100001", costOfAttendanceUsd: 28000, grantsUsd: 20000 });
    expect(summary).toMatchObject({
      source: "calculator",
      sourceLabel: "Your net price calculator result",
      costOfAttendanceUsd: 28000,
      freeMoneyUsd: 20000,
      gapUsd: 8000,
      isEstimate: true,
    });
    expect((await getCosts(deps, actor, user.id))[0]).toEqual(summary);
    const [row] = await deps.db.select().from(costEstimates).where(eq(costEstimates.source, "calculator"));
    expect(row).toMatchObject({ netPriceUsd: 8000, inputs: { grantsUsd: 20000 } });
  });

  it("rejects grants above the cost and unknown colleges", async () => {
    const { deps, actor } = await stateUStudent(false);
    await expect(
      setCalculatorResult(deps, actor, { collegeId: "100001", costOfAttendanceUsd: 20000, grantsUsd: 25000 }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      setCalculatorResult(deps, actor, { collegeId: "999999", costOfAttendanceUsd: 20000, grantsUsd: 5000 }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/money/costs.test.ts`
Expected: FAIL with `Failed to resolve import "./costs" from "src/money/costs.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/money/costs.ts`:

```ts
import {
  and,
  asc,
  collegeList,
  colleges,
  costEstimates,
  desc,
  eq,
  familyBudgets,
  gte,
  inArray,
  isNull,
  offerLines,
  offers,
  or,
  scholarshipApplications,
  scholarships,
} from "@scholarcrew/db";
import {
  type Actor,
  AppError,
  type ApplicationStage,
  CalculatorResultInput,
  type CostSource,
  type CostSummary,
  type IncomeRange,
  invalidInput,
  notFound,
  systemActor,
} from "@scholarcrew/domain";
import { categorizeOfferLine, computeGap, estimateNetPrice, wonScholarshipsForYear } from "@scholarcrew/engines";
import { assertCanRead, assertUser } from "../access";
import { readsAsOwner } from "../scholarships/common";
import { readSensitiveForMatcher } from "../memory";
import { studentFamilyIds, userTimeZone } from "../plan/common";
import { liveListingWhere } from "../scholarships";
import { type CoreDeps, currentSeason, todayIn } from "../shared";

type CollegeRow = typeof colleges.$inferSelect;

export const SOURCE_LABELS = {
  scorecard: "College Scorecard estimate",
  scorecardRange: "College Scorecard estimate for your income range",
  scorecardOverall: "College Scorecard average (no income range shared)",
  calculator: "Your net price calculator result",
  offer: "Your confirmed award letter",
} as const;

const PENDING_STAGES: ApplicationStage[] = ["planned", "drafting", "submitted"];
const COSTS_SYSTEM = systemActor("money.costs");

interface CostContext {
  ownerId: string;
  incomeRange: IncomeRange | null;
  wonUsd: number;
  pendingUsd: number;
  budgetUsd: number | null;
}

async function loadContext(deps: CoreDeps, ownerId: string): Promise<CostContext> {
  const sensitive = await readSensitiveForMatcher(deps, COSTS_SYSTEM, ownerId);
  const apps = await deps.db
    .select({
      stage: scholarshipApplications.stage,
      outcomeUsd: scholarshipApplications.outcomeUsd,
      outcomeRenewable: scholarshipApplications.outcomeRenewable,
      amountMaxUsd: scholarships.amountMaxUsd,
    })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(eq(scholarshipApplications.ownerId, ownerId));
  // Won money stays counted whatever happens to the listing later; pending money needs a live listing (R2P-4).
  // R3V-6: planned and drafting count only while the listing is undated or due today or later in the
  // student's zone; submitted always counts, because the decision is still pending.
  const today = todayIn(deps.clock.now(), await userTimeZone(deps.db, ownerId));
  const pending = await deps.db
    .select({ amountMaxUsd: scholarships.amountMaxUsd })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(
      and(
        eq(scholarshipApplications.ownerId, ownerId),
        inArray(scholarshipApplications.stage, PENDING_STAGES),
        liveListingWhere(scholarshipApplications.ownerId),
        or(
          eq(scholarshipApplications.stage, "submitted"),
          isNull(scholarships.deadline),
          gte(scholarships.deadline, today),
        ),
      ),
    );
  const pendingUsd = pending.reduce((sum, a) => sum + a.amountMaxUsd, 0);
  const familyIds = await studentFamilyIds(deps.db, ownerId);
  let budgetUsd: number | null = null;
  if (familyIds.length > 0) {
    const [budget] = await deps.db
      .select({ annualUsd: familyBudgets.annualUsd })
      .from(familyBudgets)
      .where(inArray(familyBudgets.familyId, familyIds))
      .limit(1);
    budgetUsd = budget?.annualUsd ?? null;
  }
  return { ownerId, incomeRange: sensitive.incomeRange, wonUsd: wonScholarshipsForYear(apps, 0), pendingUsd, budgetUsd };
}

function summarize(
  ctx: CostContext,
  college: CollegeRow,
  base: { source: CostSource; sourceLabel: string; costOfAttendanceUsd: number; freeMoneyUsd: number; isEstimate: boolean },
): CostSummary {
  const freeMoneyUsd = base.freeMoneyUsd + ctx.wonUsd;
  const { gapUsd, gapIfPendingWinUsd } = computeGap({
    costOfAttendanceUsd: base.costOfAttendanceUsd,
    freeMoneyUsd,
    pendingUsd: ctx.pendingUsd,
  });
  return {
    collegeId: college.id,
    collegeName: college.name,
    source: base.source,
    sourceLabel: base.sourceLabel,
    costOfAttendanceUsd: base.costOfAttendanceUsd,
    freeMoneyUsd,
    gapUsd,
    pendingUsd: ctx.pendingUsd,
    gapIfPendingWinUsd,
    isEstimate: base.isEstimate,
    budgetUsd: ctx.budgetUsd,
    gapAfterBudgetUsd: ctx.budgetUsd === null ? null : Math.max(0, gapUsd - ctx.budgetUsd),
  };
}

async function upsertEstimate(
  deps: CoreDeps,
  ownerId: string,
  collegeId: string,
  source: CostSource,
  v: { costOfAttendanceUsd: number; freeMoneyUsd: number; netPriceUsd: number; inputs: Record<string, unknown> },
): Promise<void> {
  const now = deps.clock.now();
  await deps.db
    .insert(costEstimates)
    .values({ ownerId, collegeId, source, ...v, computedAt: now })
    .onConflictDoUpdate({
      target: [costEstimates.ownerId, costEstimates.collegeId, costEstimates.source],
      set: { ...v, computedAt: now },
    });
}

/** The newest confirmed offer, then the calculator row, then the Scorecard estimate (R2P-6). Colleges without numbers are skipped. */
async function summariesFor(deps: CoreDeps, ctx: CostContext, list: CollegeRow[], viewer: "owner" | "other"): Promise<CostSummary[]> {
  if (list.length === 0) return [];
  const ids = list.map((c) => c.id);
  const calculators = await deps.db
    .select()
    .from(costEstimates)
    .where(
      and(
        eq(costEstimates.ownerId, ctx.ownerId),
        inArray(costEstimates.collegeId, ids),
        eq(costEstimates.source, "calculator"),
      ),
    );
  const confirmed = await deps.db
    .select()
    .from(offers)
    .where(
      and(
        eq(offers.ownerId, ctx.ownerId),
        inArray(offers.collegeId, ids),
        eq(offers.status, "confirmed"),
        isNull(offers.archivedAt),
      ),
    )
    .orderBy(desc(offers.confirmedAt));
  const lines =
    confirmed.length === 0
      ? []
      : await deps.db
          .select()
          .from(offerLines)
          .where(
            inArray(
              offerLines.offerId,
              confirmed.map((o) => o.id),
            ),
          );
  const out: CostSummary[] = [];
  for (const college of list) {
    // R2P-6: a confirmed letter is real money, so it outranks the calculator estimate.
    const offer = confirmed.find((o) => o.collegeId === college.id);
    const offerCoa = offer ? ((offer.costOfAttendanceUsd ?? 0) > 0 ? offer.costOfAttendanceUsd : (college.costOfAttendanceUsd ?? 0) > 0 ? college.costOfAttendanceUsd : null) : null;
    if (offer && offerCoa !== null) {
      const free = lines
        .filter((l) => l.offerId === offer.id && categorizeOfferLine(l.category) === "free")
        .reduce((sum, l) => sum + l.amountUsd, 0);
      out.push(
        summarize(ctx, college, {
          source: "offer",
          sourceLabel: SOURCE_LABELS.offer,
          costOfAttendanceUsd: offerCoa,
          freeMoneyUsd: free,
          isEstimate: false,
        }),
      );
      continue;
    }
    const calc = calculators.find((e) => e.collegeId === college.id);
    if (calc) {
      out.push(
        summarize(ctx, college, {
          source: "calculator",
          sourceLabel: SOURCE_LABELS.calculator,
          costOfAttendanceUsd: calc.costOfAttendanceUsd,
          freeMoneyUsd: calc.freeMoneyUsd,
          isEstimate: true,
        }),
      );
      continue;
    }
    const estimate = estimateNetPrice(college, ctx.incomeRange);
    if (!estimate) continue;
    const usedBand = ctx.incomeRange !== null && college.netPriceByIncome[ctx.incomeRange] !== null;
    await upsertEstimate(deps, ctx.ownerId, college.id, "scorecard", {
      costOfAttendanceUsd: estimate.costOfAttendanceUsd,
      freeMoneyUsd: estimate.freeMoneyUsd,
      netPriceUsd: estimate.netPriceUsd,
      inputs: { basis: usedBand ? "income_range" : "overall" },
    });
    out.push(
      summarize(ctx, college, {
        source: "scorecard",
        sourceLabel: usedBand ? (viewer === "owner" ? SOURCE_LABELS.scorecardRange : SOURCE_LABELS.scorecard) : (viewer === "owner" ? SOURCE_LABELS.scorecardOverall : SOURCE_LABELS.scorecard),
        costOfAttendanceUsd: estimate.costOfAttendanceUsd,
        freeMoneyUsd: estimate.freeMoneyUsd,
        isEstimate: true,
      }),
    );
  }
  return out;
}

/** Active colleges on the list, oldest first; only archiveSeason archives. */
export async function listedColleges(deps: CoreDeps, ownerId: string): Promise<CollegeRow[]> {
  const rows = await deps.db
    .select({ college: colleges })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .where(
      and(
        eq(collegeList.ownerId, ownerId),
                isNull(collegeList.archivedAt),
      ),
    )
    .orderBy(asc(collegeList.createdAt));
  return rows.map((r) => r.college);
}

/** getCosts without the access check (This Week, the worker's data port). */
export async function costsFor(deps: CoreDeps, ownerId: string, o: { viewer: "owner" | "other" }): Promise<CostSummary[]> {
  const list = await listedColleges(deps, ownerId);
  if (list.length === 0) return [];
  return summariesFor(deps, await loadContext(deps, ownerId), list, o.viewer);
}

export async function getCosts(deps: CoreDeps, actor: Actor, studentId: string): Promise<CostSummary[]> {
  await assertCanRead(deps, actor, studentId, "costs");
  return costsFor(deps, studentId, { viewer: readsAsOwner(actor, studentId) ? "owner" : "other" });
}

export async function setCalculatorResult(deps: CoreDeps, actor: Actor, i: CalculatorResultInput): Promise<CostSummary> {
  assertUser(actor);
  const parsed = CalculatorResultInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the calculator numbers and try again", parsed.error.issues);
  const v = parsed.data;
  if (v.grantsUsd > v.costOfAttendanceUsd) throw invalidInput("Grants can't be more than the cost to attend");
  const [college] = await deps.db.select().from(colleges).where(eq(colleges.id, v.collegeId));
  if (!college) throw notFound("College not found");
  await upsertEstimate(deps, actor.userId, college.id, "calculator", {
    costOfAttendanceUsd: v.costOfAttendanceUsd,
    freeMoneyUsd: v.grantsUsd,
    netPriceUsd: v.costOfAttendanceUsd - v.grantsUsd,
    inputs: { grantsUsd: v.grantsUsd },
  });
  const [summary] = await summariesFor(deps, await loadContext(deps, actor.userId), [college], "owner");
  if (!summary) throw new AppError("internal", "Calculator result missing after save");
  return summary;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/money/costs.test.ts`
Expected: PASS, 1 file, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/money/costs.ts packages/core/src/money/costs.test.ts
git commit -m "feat(core): Ledger cost estimates, calculator results, and gaps"
```

### H5: Award letters, offer review, comparison, appeals, loans, and the money index

- [ ] **Step 1: Write the failing test**

`packages/core/src/money/offers.test.ts`:

```ts
import { aidRules, and, crewJobs, documents, eq, familyTasks, offerLines, offers, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type OfferLineCategory, type ParsedOfferLine, systemActor } from "@scholarcrew/domain";
import { estimateLoanPayment } from "@scholarcrew/engines";
import { describe, expect, it } from "vitest";
import { AWARD_YEAR, NOW, makeDeps, makeDocument, makeParentOf, makeStateU, makeStudent, setShare } from "../plan/testkit";
import {
  compareMyOffers,
  confirmOffer,
  createOffer,
  deleteOffer,
  getOffer,
  listOffers,
  loanEstimates,
  markOfferFailed,
  publicOfferTool,
  requestAppealOutline,
  saveParsedOffer,
  updateOfferLine,
} from "./index";
import { OUTSIDE_SCHOLARSHIPS_NOTE } from "./offers";

const SYSTEM = systemActor("test");

function line(label: string, amountUsd: number, category: OfferLineCategory, renewable: boolean): ParsedOfferLine {
  return { label, amountUsd, category, renewable, renewalCondition: "", page: 1, citedText: `${label} $${amountUsd}` };
}

const STATE_U_LINES = [
  line("Federal Pell Grant", 3600, "grant", true),
  line("State U Merit", 3000, "scholarship", true),
  line("Texas Grant", 12000, "grant", true),
  line("Federal Direct Subsidized Loan", 3500, "loan_federal_subsidized", true),
];

async function withOffer() {
  const { deps, clock } = makeDeps();
  const student = await makeStudent(deps);
  const college = await makeStateU(deps);
  const doc = await makeDocument(deps, student.user.id);
  const offer = await createOffer(deps, student.actor, { collegeId: college.id, documentId: doc.id, awardYear: AWARD_YEAR });
  return { deps, clock, ...student, college, doc, offer };
}

describe("award letters", () => {
  it("creates an offer from an owned award letter and queues the parse", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { user: other } = await makeStudent(deps);
    const college = await makeStateU(deps);
    const doc = await makeDocument(deps, user.id);
    const transcript = await makeDocument(deps, user.id, "transcript");
    const theirs = await makeDocument(deps, other.id);
    const input = (documentId: string, collegeId = college.id) => ({ collegeId, documentId, awardYear: AWARD_YEAR });
    await expect(createOffer(deps, actor, input(theirs.id))).rejects.toMatchObject({ code: "not_found" });
    await expect(createOffer(deps, actor, input(transcript.id))).rejects.toMatchObject({ code: "not_found" });
    await expect(createOffer(deps, actor, input(doc.id, "999999"))).rejects.toMatchObject({ code: "not_found" });
    await expect(createOffer(deps, actor, { ...input(doc.id), awardYear: "2027" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    const offer = await createOffer(deps, actor, input(doc.id));
    expect(offer).toMatchObject({ collegeName: "State U", status: "parsing", awardYear: "2027-28", documentId: doc.id, lines: [] });
    const [document] = await deps.db.select().from(documents).where(eq(documents.id, doc.id));
    expect(document?.parseStatus).toBe("queued");
    const [job] = await deps.db.select().from(crewJobs).where(eq(crewJobs.ownerId, user.id));
    expect(job).toMatchObject({ kind: "offer_parse", refId: offer.id, status: "queued" });
    expect(offer.parseJobId).toBe(job?.id);
    expect((await listOffers(deps, actor, user.id))[0]?.parseJobId).toBe(job?.id);
    expect(deps.jobs.sent).toEqual([{ name: "offer.parse", payload: { jobId: job?.id, offerId: offer.id } }]);
  });

  it("leaves archived offers out of the list and the comparison", async () => {
    const { deps, user, actor, offer } = await withOffer();
    await saveTestOffer(deps, SYSTEM, { offerId: offer.id, costOfAttendanceUsd: 27800, lines: STATE_U_LINES });
    await confirmOffer(deps, actor, offer.id);
    expect((await listOffers(deps, actor, user.id)).map((o) => o.id)).toEqual([offer.id]);
    expect((await compareMyOffers(deps, actor, user.id)).columns).toHaveLength(1);
    await deps.db.update(offers).set({ archivedAt: new Date(NOW) }).where(eq(offers.id, offer.id));
    expect(await listOffers(deps, actor, user.id)).toEqual([]);
    expect((await compareMyOffers(deps, actor, user.id)).columns).toEqual([]);
    expect((await getOffer(deps, actor, offer.id)).id).toBe(offer.id);
  });

  it("saves parsed lines, takes corrections, confirms, and compares with labels", async () => {
    const { deps, clock, user, actor, offer } = await withOffer();
    const { actor: other } = await makeStudent(deps);
    const riverside = await factories.college(deps.db, { id: "100002", name: "Riverside College", costOfAttendanceUsd: 31200 });
    const riverDoc = await makeDocument(deps, user.id);
    const river = await createOffer(deps, actor, { collegeId: riverside.id, documentId: riverDoc.id, awardYear: AWARD_YEAR });
    const save = { offerId: offer.id, costOfAttendanceUsd: 27800, lines: [line("Wrong", 1, "other", false)] };
    await expect(saveTestOffer(deps, actor, save)).rejects.toMatchObject({ code: "forbidden" });
    await saveTestOffer(deps, SYSTEM, save);
    const parsed = await saveTestOffer(deps, SYSTEM, { ...save, lines: STATE_U_LINES });
    expect(parsed).toMatchObject({ status: "needs_review", costOfAttendanceUsd: 27800 });
    expect(parsed.lines.map((l) => [l.position, l.label, l.page, l.userCorrected])).toEqual([
      [0, "Federal Pell Grant", 1, false],
      [1, "State U Merit", 1, false],
      [2, "Texas Grant", 1, false],
      [3, "Federal Direct Subsidized Loan", 1, false],
    ]);
    const [document] = await deps.db.select().from(documents).where(eq(documents.id, offer.documentId as string));
    expect(document?.parseStatus).toBe("parsed");
    await saveTestOffer(deps, SYSTEM, {
      offerId: river.id,
      costOfAttendanceUsd: 31200,
      lines: [line("Riverside Grant", 18400, "grant", true), line("Riverside Welcome Grant", 6000, "scholarship", true)],
    });
    const welcome = (await getOffer(deps, actor, river.id)).lines[1];
    if (!welcome) throw new Error("welcome line missing");
    expect(await updateOfferLine(deps, actor, welcome.id, { category: "grant", renewable: false })).toMatchObject({
      category: "grant",
      renewable: false,
      userCorrected: true,
    });
    await expect(updateOfferLine(deps, other, welcome.id, { renewable: true })).rejects.toMatchObject({ code: "not_found" });
    expect((await compareMyOffers(deps, actor, user.id)).columns).toEqual([]);
    expect(await confirmOffer(deps, actor, offer.id)).toMatchObject({ status: "confirmed", confirmedAt: NOW });
    clock.set("2026-10-06T16:00:00.000Z");
    await confirmOffer(deps, actor, river.id);
    const comparison = await compareMyOffers(deps, actor, user.id);
    expect(comparison.lowestFourYearOfferId).toBe(offer.id);
    expect(comparison.columns.map((c) => [c.collegeName, c.reallyCostsUsd, c.fourYearUsd])).toEqual([
      ["State U", 9200, 36800],
      ["Riverside College", 6800, 45200],
    ]);
    expect(comparison.columns[1]?.warnings).toEqual(["$6,000 Riverside Welcome Grant is year 1 only"]);
  });

  it("refuses to confirm an empty offer and records parse failures", async () => {
    const { deps, actor, offer, doc } = await withOffer();
    await expect(confirmOffer(deps, actor, offer.id)).rejects.toMatchObject({ code: "invalid_input" });
    await failTestOffer(deps, SYSTEM, offer.id, "Could not read page 2");
    expect((await getOffer(deps, actor, offer.id)).status).toBe("failed");
    const [document] = await deps.db.select().from(documents).where(eq(documents.id, doc.id));
    expect(document?.parseStatus).toBe("failed");
  });

  it("deletes failed and unconfirmed letters but keeps confirmed ones (R2P-8)", async () => {
    const { deps, actor, offer, doc, college } = await withOffer();
    const { actor: other } = await makeStudent(deps);
    await failTestOffer(deps, SYSTEM, offer.id, "not_pdf");
    await expect(deleteOffer(deps, other, offer.id)).rejects.toMatchObject({ code: "not_found" });
    await deleteOffer(deps, actor, offer.id);
    await expect(getOffer(deps, actor, offer.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await deps.db.select().from(documents).where(eq(documents.id, doc.id))).toHaveLength(1);
    const parsed = await createOffer(deps, actor, { collegeId: college.id, documentId: doc.id, awardYear: AWARD_YEAR });
    await saveTestOffer(deps, SYSTEM, { offerId: parsed.id, costOfAttendanceUsd: 27800, lines: STATE_U_LINES });
    await deleteOffer(deps, actor, parsed.id);
    expect(await deps.db.select().from(offerLines).where(eq(offerLines.offerId, parsed.id))).toEqual([]);
    const kept = await createOffer(deps, actor, { collegeId: college.id, documentId: doc.id, awardYear: AWARD_YEAR });
    await saveTestOffer(deps, SYSTEM, { offerId: kept.id, costOfAttendanceUsd: 27800, lines: STATE_U_LINES });
    await confirmOffer(deps, actor, kept.id);
    await expect(deleteOffer(deps, actor, kept.id)).rejects.toMatchObject({ code: "conflict" });
    await expect(deleteOffer(deps, actor, "nope")).rejects.toMatchObject({ code: "not_found" });
  });

  it("stores a parsed award year within a year of now and ignores others (R2P-16)", async () => {
    const { deps, offer } = await withOffer();
    const save = { offerId: offer.id, costOfAttendanceUsd: 27800, lines: STATE_U_LINES };
    expect((await saveTestOffer(deps, SYSTEM, { ...save, awardYear: "2026-27" })).awardYear).toBe("2026-27");
    expect((await saveTestOffer(deps, SYSTEM, { ...save, awardYear: "1999-00" })).awardYear).toBe("2026-27");
    expect((await saveTestOffer(deps, SYSTEM, { ...save, awardYear: "2027" })).awardYear).toBe("2026-27");
    expect((await saveTestOffer(deps, SYSTEM, save)).awardYear).toBe("2026-27");
  });

  it("leaves letters with no known cost out of the comparison and explains both numbers (R2P-7)", async () => {
    const { deps, user, actor, offer } = await withOffer();
    await saveTestOffer(deps, SYSTEM, { offerId: offer.id, costOfAttendanceUsd: 27800, lines: STATE_U_LINES });
    await confirmOffer(deps, actor, offer.id);
    const blank = await factories.college(deps.db, { id: "100004", name: "No Cost U", costOfAttendanceUsd: null });
    const blankDoc = await makeDocument(deps, user.id);
    const unknown = await createOffer(deps, actor, { collegeId: blank.id, documentId: blankDoc.id, awardYear: AWARD_YEAR });
    await saveTestOffer(deps, SYSTEM, {
      offerId: unknown.id,
      costOfAttendanceUsd: null,
      lines: [line("Big Grant", 40000, "grant", true)],
    });
    await confirmOffer(deps, actor, unknown.id);
    const comparison = await compareMyOffers(deps, actor, user.id);
    expect(comparison.columns.map((c) => c.collegeName)).toEqual(["State U"]);
    expect(comparison.lowestFourYearOfferId).toBe(offer.id);
    expect(comparison.assumptions).toContain(
      "No Cost U: the letter doesn't list a cost of attendance, so it isn't compared.",
    );
    expect(comparison.assumptions).toContain(OUTSIDE_SCHOLARSHIPS_NOTE);
  });

  it("asks each parent to review costs once after a letter is confirmed (R2I-7)", async () => {
    const { deps, user, actor, offer } = await withOffer();
    const { parent, family } = await makeParentOf(deps, user.id);
    await saveTestOffer(deps, SYSTEM, { offerId: offer.id, costOfAttendanceUsd: 27800, lines: STATE_U_LINES });
    await confirmOffer(deps, actor, offer.id);
    const reviews = () =>
      deps.db
        .select()
        .from(familyTasks)
        .where(and(eq(familyTasks.studentId, user.id), eq(familyTasks.kind, "review_costs")));
    expect(await reviews()).toMatchObject([
      { familyId: family.id, assigneeId: parent.id, title: "Review award letters with Test", detail: "", status: "todo" },
    ]);
    await confirmOffer(deps, actor, offer.id);
    expect(await reviews()).toHaveLength(1);
  });

  it("queues appeal outlines within the allowance", async () => {
    const { deps, user, actor, offer } = await withOffer();
    const { actor: other } = await makeStudent(deps);
    deps.jobs.clear();
    const job = await requestAppealOutline(deps, actor, offer.id);
    expect(job).toMatchObject({ kind: "appeal_outline", refId: offer.id, status: "queued" });
    expect(deps.jobs.sent).toEqual([{ name: "appeal.outline", payload: { jobId: job.id, offerId: offer.id } }]);
    await expect(requestAppealOutline(deps, other, offer.id)).rejects.toMatchObject({ code: "not_found" });
    await deps.db.insert(usageCounters).values({ userId: user.id, month: "2026-10", crewRequests: 20 });
    deps.jobs.clear();
    await expect(requestAppealOutline(deps, actor, offer.id)).rejects.toMatchObject({ code: "limit_reached" });
    expect(deps.jobs.sent).toEqual([]);
  });

  it("estimates federal loan payments at the award year's rates", async () => {
    const { deps, actor, offer } = await withOffer();
    await saveTestOffer(deps, SYSTEM, {
      offerId: offer.id,
      costOfAttendanceUsd: 27800,
      lines: [
        line("Federal Direct Subsidized Loan", 3500, "loan_federal_subsidized", true),
        line("Bank Loan", 5000, "loan_private", false),
        line("Parent PLUS Loan", 10000, "loan_parent_plus", false),
        line("Texas Grant", 12000, "grant", true),
      ],
    });
    expect(await loanEstimates(deps, actor, offer.id)).toEqual([]);
    await deps.db.insert(aidRules).values({
      awardYear: AWARD_YEAR,
      key: "federal_loan_rates",
      value: { subsidized: 6.53, unsubsidized: 6.53, parent_plus: 9.08 },
      sourceUrl: "https://studentaid.gov/understand-aid/types/loans/interest-rates",
      verifiedAt: new Date(NOW),
    });
    expect(await loanEstimates(deps, actor, offer.id)).toEqual([
      { ...estimateLoanPayment({ principalUsd: 3500, annualRatePct: 6.53, years: 10 }), label: "Federal Direct Subsidized Loan" },
      { ...estimateLoanPayment({ principalUsd: 10000, annualRatePct: 9.08, years: 10 }), label: "Parent PLUS Loan" },
    ]);
  });

  it("lets a parent read offers only with the costs share", async () => {
    const { deps, user, offer } = await withOffer();
    const { actor: parent } = await makeParentOf(deps, user.id);
    expect((await listOffers(deps, parent, user.id)).map((o) => o.id)).toEqual([offer.id]);
    expect((await getOffer(deps, parent, offer.id)).id).toBe(offer.id);
    await setShare(deps, user.id, "costs", false);
    await expect(listOffers(deps, parent, user.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getOffer(deps, parent, offer.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("publicOfferTool", () => {
  it("compares typed offers with no storage and rejects empty input", () => {
    const result = publicOfferTool({
      offers: [{ name: "State U", costOfAttendanceUsd: 27800, lines: [{ label: "Grant", amountUsd: 18600, category: "grant", renewable: true }] }],
    });
    expect(result.columns[0]).toMatchObject({ collegeName: "State U", reallyCostsUsd: 9200, fourYearUsd: 36800 });
    let code: string | undefined;
    try {
      publicOfferTool({ offers: [] });
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("invalid_input");
  });
});
async function saveTestOffer(deps: Parameters<typeof saveParsedOffer>[0], actor: Parameters<typeof saveParsedOffer>[1], input: Omit<Parameters<typeof saveParsedOffer>[2], "ownerId">) {
  const [offer] = await deps.db.select({ ownerId: offers.ownerId }).from(offers).where(eq(offers.id, input.offerId));
  if (!offer) throw new Error("test offer missing");
  return saveParsedOffer(deps, actor, { ...input, ownerId: offer.ownerId });
}

async function failTestOffer(deps: Parameters<typeof markOfferFailed>[0], actor: Parameters<typeof markOfferFailed>[1], offerId: string, error: string) {
  const [offer] = await deps.db.select({ ownerId: offers.ownerId }).from(offers).where(eq(offers.id, offerId));
  if (!offer) throw new Error("test offer missing");
  return markOfferFailed(deps, actor, { offerId, ownerId: offer.ownerId, error });
}

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/money/offers.test.ts`
Expected: FAIL with `Failed to resolve import "./index" from "src/money/offers.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/money/offers.ts`:

```ts
import {
  type DbOrTx,
  aidRules,
  and,
  asc,
  colleges,
  count,
  crewJobs,
  desc,
  documents,
  eq,
  familyTasks,
  inArray,
  isNull,
  offerLines,
  offers,
  users,
} from "@scholarcrew/db";
import {
  type Actor,
  AwardYear,
  CreateOfferInput,
  type CrewJob,
  type LoanEstimate,
  type OfferComparison,
  type OfferLine,
  type OfferLineCategory,
  OfferLinePatch,
  type OfferWithLines,
  ParsedOfferLine,
  PublicOfferInput,
  Usd,
  conflict,
  invalidInput,
  notFound,
  systemActor,
} from "@scholarcrew/domain";
import { compareOffers, computePublicOffers, estimateLoanPayment } from "@scholarcrew/engines";
import { assertCanRead, assertOwner, assertSystem, assertUser } from "../access";
import { recordAudit } from "../audit";
import { assertCrewAllowance } from "../billing";
import { insertJob } from "../crew/jobs";
import { createTask } from "../family";
import { parentsOf } from "../plan/common";
import { type CoreDeps, currentAwardYear, one, requireUuid, toIso, toIsoOrNull } from "../shared";

type OfferRow = typeof offers.$inferSelect;
type LineRow = typeof offerLines.$inferSelect;
type RateKey = "subsidized" | "unsubsidized" | "parent_plus";

const RATE_KEYS: Partial<Record<OfferLineCategory, RateKey>> = {
  loan_federal_subsidized: "subsidized",
  loan_federal_unsubsidized: "unsubsidized",
  loan_parent_plus: "parent_plus",
};
export const LOAN_YEARS = 10;
const MAX_LINES = 40;
const MONEY_SYSTEM = systemActor("money.offers");

/** R2P-7: always added to `compareMyOffers` assumptions, because /money adds won scholarships and this page doesn't. */
export const OUTSIDE_SCHOLARSHIPS_NOTE = "Outside scholarships you've won aren't counted here. Your Costs page includes them.";

/** R2P-16: a parsed award year counts only when it's well formed and within one year of the current one. */
function plausibleAwardYear(value: string | undefined, now: Date): string | null {
  if (value === undefined || !AwardYear.safeParse(value).success) return null;
  const start = Number(value.slice(0, 4));
  const current = Number(currentAwardYear(now).slice(0, 4));
  if (value.slice(5) !== String((start + 1) % 100).padStart(2, "0")) return null;
  return Math.abs(start - current) <= 1 ? value : null;
}

export function toOfferLine(row: LineRow): OfferLine {
  return {
    id: row.id,
    offerId: row.offerId,
    position: row.position,
    label: row.label,
    amountUsd: row.amountUsd,
    category: row.category,
    renewable: row.renewable,
    renewalCondition: row.renewalCondition,
    page: row.page,
    citedText: row.citedText,
    userCorrected: row.userCorrected,
  };
}

function toOffer(row: OfferRow, collegeName: string, lines: LineRow[], parseJobId: string | null): OfferWithLines {
  return {
    id: row.id,
    collegeId: row.collegeId,
    collegeName,
    awardYear: row.awardYear,
    documentId: row.documentId,
    status: row.status,
    costOfAttendanceUsd: row.costOfAttendanceUsd,
    createdAt: toIso(row.createdAt),
    confirmedAt: toIsoOrNull(row.confirmedAt),
    parseJobId,
    lines: [...lines].sort((a, b) => a.position - b.position).map(toOfferLine),
  };
}

async function loadOffers(db: DbOrTx, where: ReturnType<typeof and>): Promise<OfferWithLines[]> {
  const rows = await db
    .select({ offer: offers, collegeName: colleges.name })
    .from(offers)
    .innerJoin(colleges, eq(colleges.id, offers.collegeId))
    .where(where)
    .orderBy(asc(offers.createdAt));
  if (rows.length === 0) return [];
  const offerIds = rows.map((r) => r.offer.id);
  const lines = await db.select().from(offerLines).where(inArray(offerLines.offerId, offerIds));
  // D31: the newest offer_parse job per offer, so the upload page can follow its events.
  const parseJobs = await db
    .select({ id: crewJobs.id, refId: crewJobs.refId, ownerId: crewJobs.ownerId })
    .from(crewJobs)
    .where(and(eq(crewJobs.kind, "offer_parse"), inArray(crewJobs.refId, offerIds)))
    .orderBy(desc(crewJobs.createdAt));
  return rows.map((r) => {
    const job = parseJobs.find((j) => j.refId === r.offer.id && j.ownerId === r.offer.ownerId);
    return toOffer(
      r.offer,
      r.collegeName,
      lines.filter((l) => l.offerId === r.offer.id),
      job?.id ?? null,
    );
  });
}

async function loadOne(db: DbOrTx, id: string): Promise<OfferWithLines> {
  const [offer] = await loadOffers(db, eq(offers.id, id));
  if (!offer) throw notFound("Offer not found");
  return offer;
}

async function offerRow(db: DbOrTx, id: string): Promise<OfferRow> {
  requireUuid(id, "Offer not found");
  const [row] = await db.select().from(offers).where(eq(offers.id, id));
  if (!row) throw notFound("Offer not found");
  return row;
}

export async function listOffers(deps: CoreDeps, actor: Actor, studentId: string): Promise<OfferWithLines[]> {
  await assertCanRead(deps, actor, studentId, "costs");
  return loadOffers(deps.db, and(eq(offers.ownerId, studentId), isNull(offers.archivedAt)));
}

export async function getOffer(deps: CoreDeps, actor: Actor, id: string): Promise<OfferWithLines> {
  const row = await offerRow(deps.db, id);
  await assertCanRead(deps, actor, row.ownerId, "costs");
  return loadOne(deps.db, row.id);
}

export async function createOffer(deps: CoreDeps, actor: Actor, i: CreateOfferInput): Promise<OfferWithLines> {
  assertUser(actor);
  const parsed = CreateOfferInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the award letter details and try again", parsed.error.issues);
  const v = parsed.data;
  const [doc] = await deps.db
    .select()
    .from(documents)
    .where(and(eq(documents.id, v.documentId), eq(documents.ownerId, actor.userId)));
  if (!doc || doc.kind !== "award_letter") throw notFound("Award letter not found");
  const [college] = await deps.db.select({ id: colleges.id }).from(colleges).where(eq(colleges.id, v.collegeId));
  if (!college) throw notFound("College not found");
  const now = deps.clock.now();
  const { offerId, job } = await deps.db.transaction(async (tx) => {
    const offer = one(
      await tx
        .insert(offers)
        .values({
          ownerId: actor.userId,
          collegeId: college.id,
          awardYear: v.awardYear,
          documentId: doc.id,
          status: "parsing",
          createdAt: now,
        })
        .returning(),
      "offers insert",
    );
    await tx.update(documents).set({ parseStatus: "queued" }).where(eq(documents.id, doc.id));
    const created = await insertJob(tx, { ownerId: actor.userId, kind: "offer_parse", refId: offer.id, now });
    return { offerId: offer.id, job: created };
  });
  await deps.jobs.enqueue("offer.parse", { jobId: job.id, offerId });
  return loadOne(deps.db, offerId);
}

export async function saveParsedOffer(
  deps: CoreDeps,
  system: Actor,
  i: {
    offerId: string;
    ownerId: string;
    costOfAttendanceUsd: number | null;
    lines: ParsedOfferLine[];
    /** R2P-16: the year printed on the letter. Kept only when it's a valid award year within one year of now. */
    awardYear?: AwardYear;
  },
): Promise<OfferWithLines> {
  assertSystem(system);
  const offer = await offerRow(deps.db, i.offerId);
  if (offer.ownerId !== i.ownerId) throw notFound("Offer not found");
  const coa = Usd.max(200_000).nullable().safeParse(i.costOfAttendanceUsd);
  if (!coa.success) throw invalidInput("Bad cost of attendance", coa.error.issues);
  if (i.lines.length > MAX_LINES) throw invalidInput(`An award letter has at most ${MAX_LINES} lines`);
  const lines = i.lines.map((raw, idx) => {
    const parsed = ParsedOfferLine.safeParse(raw);
    if (!parsed.success) throw invalidInput(`Offer line ${idx + 1} is invalid`, parsed.error.issues);
    return parsed.data;
  });
  const awardYear = plausibleAwardYear(i.awardYear, deps.clock.now()) ?? offer.awardYear;
  await deps.db.transaction(async (tx) => {
    const [current] = await tx.select().from(offers).where(and(eq(offers.id, offer.id), eq(offers.ownerId, i.ownerId))).for("update");
    if (!current) throw notFound("Offer not found");
    if (current.status !== "uploaded" && current.status !== "parsing") return;
    await tx.delete(offerLines).where(eq(offerLines.offerId, offer.id));
    if (lines.length > 0) {
      await tx.insert(offerLines).values(
        lines.map((l, position) => ({
          offerId: offer.id,
          position,
          label: l.label,
          amountUsd: l.amountUsd,
          category: l.category,
          renewable: l.renewable,
          renewalCondition: l.renewalCondition,
          page: l.page,
          citedText: l.citedText,
        })),
      );
    }
    await tx
      .update(offers)
      .set({ costOfAttendanceUsd: (coa.data ?? 0) > 0 ? coa.data : null, status: "needs_review", awardYear })
      .where(and(eq(offers.id, offer.id), eq(offers.ownerId, i.ownerId), inArray(offers.status, ["uploaded", "parsing"])));
    if (offer.documentId) {
      await tx.update(documents).set({ parseStatus: "parsed" }).where(eq(documents.id, offer.documentId));
    }
  });
  return loadOne(deps.db, offer.id);
}

export async function markOfferFailed(deps: CoreDeps, system: Actor, i: { offerId: string; ownerId: string; error: string }): Promise<{ changed: boolean }> {
  assertSystem(system);
  const changed = await deps.db.transaction(async (tx) => {
    const [offer] = await tx.select().from(offers).where(and(eq(offers.id, i.offerId), eq(offers.ownerId, i.ownerId))).for("update");
    if (!offer) throw notFound("Offer not found");
    if (offer.status !== "uploaded" && offer.status !== "parsing") return false;
    await tx.update(offers).set({ status: "failed" }).where(and(eq(offers.id, offer.id), eq(offers.ownerId, i.ownerId), inArray(offers.status, ["uploaded", "parsing"])));
    if (offer.documentId) await tx.update(documents).set({ parseStatus: "failed" }).where(eq(documents.id, offer.documentId));
    return true;
  });
  if (changed) await recordAudit(deps, { actor: system, action: "offer_parse_failed", entityType: "offer", entityId: i.offerId, meta: { error: i.error.slice(0, 200) } });
  return { changed };
}

export async function updateOfferLine(deps: CoreDeps, actor: Actor, id: string, p: OfferLinePatch): Promise<OfferLine> {
  assertUser(actor);
  requireUuid(id, "Offer line not found");
  const parsed = OfferLinePatch.safeParse(p);
  if (!parsed.success) throw invalidInput("Check the line and try again", parsed.error.issues);
  const [found] = await deps.db
    .select({ line: offerLines, ownerId: offers.ownerId })
    .from(offerLines)
    .innerJoin(offers, eq(offers.id, offerLines.offerId))
    .where(eq(offerLines.id, id));
  if (!found) throw notFound("Offer line not found");
  assertOwner(actor, found.ownerId);
  const set: Partial<typeof offerLines.$inferInsert> = { userCorrected: true };
  if (parsed.data.label !== undefined) set.label = parsed.data.label;
  if (parsed.data.amountUsd !== undefined) set.amountUsd = parsed.data.amountUsd;
  if (parsed.data.category !== undefined) set.category = parsed.data.category;
  if (parsed.data.renewable !== undefined) set.renewable = parsed.data.renewable;
  const updated = one(await deps.db.update(offerLines).set(set).where(eq(offerLines.id, id)).returning(), "offer_lines update");
  return toOfferLine(updated);
}

export async function confirmOffer(deps: CoreDeps, actor: Actor, id: string): Promise<OfferWithLines> {
  assertUser(actor);
  const offer = await offerRow(deps.db, id);
  assertOwner(actor, offer.ownerId);
  const [lines] = await deps.db.select({ n: count() }).from(offerLines).where(eq(offerLines.offerId, offer.id));
  if ((lines?.n ?? 0) === 0) throw invalidInput("Add at least one line before confirming this letter");
  await deps.db.update(offers).set({ status: "confirmed", confirmedAt: deps.clock.now() }).where(eq(offers.id, offer.id));
  await askParentsToReviewCosts(deps, offer.ownerId);
  return loadOne(deps.db, offer.id);
}

/** R2I-7 (FA-05): one `review_costs` task per parent of the student, created the first time a letter is confirmed. */
async function askParentsToReviewCosts(deps: CoreDeps, studentId: string): Promise<void> {
  const parents = await parentsOf(deps.db, studentId);
  if (parents.length === 0) return;
  const existing = await deps.db
    .select({ assigneeId: familyTasks.assigneeId })
    .from(familyTasks)
    .where(and(eq(familyTasks.studentId, studentId), eq(familyTasks.kind, "review_costs")));
  const [student] = await deps.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, studentId));
  const name = student?.displayName.trim().split(/\s+/)[0] || "your student";
  for (const p of parents) {
    if (existing.some((t) => t.assigneeId === p.userId)) continue;
    await createTask(deps, MONEY_SYSTEM, {
      familyId: p.familyId,
      assigneeId: p.userId,
      studentId,
      kind: "review_costs",
      title: `Review award letters with ${name}`,
      detail: "",
    });
  }
}

/**
 * R2P-8: owner only. Removes a letter that failed or that the student doesn't want to confirm; lines cascade and
 * the uploaded document stays. Confirmed letters stay for comparisons and archive with the season (ME-07).
 */
export async function deleteOffer(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  const offer = await offerRow(deps.db, id);
  assertOwner(actor, offer.ownerId);
  if (offer.status === "confirmed") throw conflict("Confirmed offers stay. Start a new season to archive them.");
  await deps.db.delete(offers).where(eq(offers.id, offer.id));
}

export async function compareMyOffers(deps: CoreDeps, actor: Actor, studentId: string): Promise<OfferComparison> {
  await assertCanRead(deps, actor, studentId, "costs");
  const rows = await deps.db
    .select({ offer: offers, college: colleges })
    .from(offers)
    .innerJoin(colleges, eq(colleges.id, offers.collegeId))
    .where(and(eq(offers.ownerId, studentId), eq(offers.status, "confirmed"), isNull(offers.archivedAt)))
    .orderBy(asc(offers.confirmedAt), asc(offers.createdAt));
  const lines =
    rows.length === 0
      ? []
      : await deps.db
          .select()
          .from(offerLines)
          .where(
            inArray(
              offerLines.offerId,
              rows.map((r) => r.offer.id),
            ),
          )
          .orderBy(asc(offerLines.position));
  // R2P-7: a letter with no known cost of attendance can't be compared; it used to count as $0 and win.
  const unknownCost = rows.filter(({ offer, college }) => (offer.costOfAttendanceUsd ?? college.costOfAttendanceUsd) === null);
  const comparable = rows.filter((r) => !unknownCost.includes(r));
  const result = compareOffers(
    comparable.map(({ offer, college }) => ({
      offerId: offer.id,
      collegeId: college.id,
      collegeName: college.name,
      costOfAttendanceUsd: offer.costOfAttendanceUsd ?? college.costOfAttendanceUsd ?? 0,
      lines: lines
        .filter((l) => l.offerId === offer.id)
        .map((l) => ({ label: l.label, amountUsd: l.amountUsd, category: l.category, renewable: l.renewable })),
    })),
  );
  return {
    ...result,
    assumptions: [
      ...result.assumptions,
      ...unknownCost.map(
        ({ college }) => `${college.name}: the letter doesn't list a cost of attendance, so it isn't compared.`,
      ),
      OUTSIDE_SCHOLARSHIPS_NOTE,
    ],
  };
}

export async function requestAppealOutline(deps: CoreDeps, actor: Actor, offerId: string): Promise<CrewJob> {
  assertUser(actor);
  const offer = await offerRow(deps.db, offerId);
  assertOwner(actor, offer.ownerId);
  await assertCrewAllowance(deps, actor.userId);
  const job = await insertJob(deps.db, {
    ownerId: actor.userId,
    kind: "appeal_outline",
    refId: offer.id,
    now: deps.clock.now(),
  });
  await deps.jobs.enqueue("appeal.outline", { jobId: job.id, offerId: offer.id });
  return job;
}

function readRates(value: unknown): Partial<Record<RateKey, number>> {
  const out: Partial<Record<RateKey, number>> = {};
  if (typeof value !== "object" || value === null) return out;
  const record = value as Record<string, unknown>;
  for (const key of ["subsidized", "unsubsidized", "parent_plus"] as const) {
    const rate = record[key];
    if (typeof rate === "number" && Number.isFinite(rate) && rate >= 0 && rate <= 30) out[key] = rate;
  }
  return out;
}

/** Federal loan lines on a 10-year standard plan. Private loans and years without stored rates are skipped. */
export async function loanEstimates(deps: CoreDeps, actor: Actor, offerId: string): Promise<LoanEstimate[]> {
  const offer = await offerRow(deps.db, offerId);
  await assertCanRead(deps, actor, offer.ownerId, "costs");
  const [rule] = await deps.db
    .select({ value: aidRules.value })
    .from(aidRules)
    .where(and(eq(aidRules.awardYear, offer.awardYear), eq(aidRules.key, "federal_loan_rates")));
  const rates = readRates(rule?.value);
  const lines = await deps.db
    .select()
    .from(offerLines)
    .where(eq(offerLines.offerId, offer.id))
    .orderBy(asc(offerLines.position));
  const out: LoanEstimate[] = [];
  for (const l of lines) {
    const key = RATE_KEYS[l.category];
    if (!key) continue;
    const rate = rates[key];
    if (rate === undefined) continue;
    out.push({ ...estimateLoanPayment({ principalUsd: l.amountUsd, annualRatePct: rate, years: LOAN_YEARS }), label: l.label });
  }
  return out;
}

/** No storage, no model. */
export function publicOfferTool(i: PublicOfferInput): OfferComparison {
  const parsed = PublicOfferInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the offers and try again", parsed.error.issues);
  return computePublicOffers(parsed.data);
}
```

`packages/core/src/money/index.ts`:

```ts
export { costsFor, getCosts, setCalculatorResult } from "./costs";
export {
  compareMyOffers,
  confirmOffer,
  createOffer,
  deleteOffer,
  getOffer,
  listOffers,
  loanEstimates,
  markOfferFailed,
  publicOfferTool,
  requestAppealOutline,
  saveParsedOffer,
  updateOfferLine,
} from "./offers";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/money`
Expected: PASS, 2 files, 24 tests (costs 11, offers 13).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/money
git commit -m "feat(core): award letters, offer review and comparison, appeals, loan payments"
```

### H6: FAFSA and CSS Profile checklists, family tasks, aid deadlines

- [ ] **Step 1: Write the failing test**

`packages/core/src/aid/checklists.test.ts`:

```ts
import { aidChecklistItems, aidDeadlines, and, eq, familyTasks } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { FAFSA_STEPS, systemActor, userActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { updateTask } from "../family";
import { AWARD_YEAR, NOW, listCollege, makeDeps, makeParentOf, makeStateU, makeStudent } from "../plan/testkit";
import { ensureChecklists, getAidChecklists, listAidDeadlines, updateAidItem } from "./index";

const SYSTEM = systemActor("test");

async function setup() {
  const { deps } = makeDeps();
  const student = await makeStudent(deps);
  const css = await factories.college(deps.db, {
    id: "200001",
    name: "Northgate University",
    cssProfileRequired: true,
    aidPriorityDate: "2026-11-15",
  });
  const plain = await makeStateU(deps);
  await listCollege(deps, student.user.id, css.id, { plan: "EA" });
  await listCollege(deps, student.user.id, plain.id, { plan: "EA", minutesAfter: 1 });
  return { deps, ...student, css, plain };
}

describe("ensureChecklists", () => {
  it("creates FAFSA items, CSS items for CSS colleges, and parent tasks once", async () => {
    const { deps, user, actor, css } = await setup();
    const { parent } = await makeParentOf(deps, user.id);
    await expect(ensureChecklists(deps, actor, user.id)).rejects.toMatchObject({ code: "forbidden" });
    await ensureChecklists(deps, SYSTEM, user.id);
    await ensureChecklists(deps, SYSTEM, user.id);
    const items = await deps.db.select().from(aidChecklistItems).where(eq(aidChecklistItems.ownerId, user.id));
    expect(items.filter((i) => i.program === "fafsa")).toHaveLength(7);
    const cssItems = items.filter((i) => i.program === "css");
    expect(cssItems).toHaveLength(3);
    expect(cssItems.every((i) => i.collegeId === css.id && i.dueOn === "2026-11-15" && i.awardYear === AWARD_YEAR)).toBe(true);
    const tasks = await deps.db.select().from(familyTasks).where(eq(familyTasks.assigneeId, parent.id));
    expect(tasks.map((t) => t.kind).sort()).toEqual(["css_contributor", "fafsa_contributor", "fafsa_contributor"]);
    // R2I-5: the stored title is the plain step; 06 listTasks adds the college name for viewers who may read colleges.
    const cssParentItem = cssItems.find((i) => i.assignee === "parent");
    expect(tasks.find((t) => t.kind === "css_contributor")).toMatchObject({
      title: "Enter household finances on the CSS Profile",
      detail: `CSS Profile ${AWARD_YEAR}`,
      dueOn: "2026-11-15",
      studentId: user.id,
      aidItemId: cssParentItem?.id,
    });
    // R2I-6: every parent task points at its checklist item.
    const parentItemIds = items.filter((i) => i.assignee === "parent").map((i) => i.id).sort();
    expect(tasks.map((t) => t.aidItemId).sort()).toEqual(parentItemIds);
  });

  it("reads a parent step as done once the parent finishes the family task (R2I-6)", async () => {
    const { deps, user, actor } = await setup();
    const { parent, actor: parentActor } = await makeParentOf(deps, user.id);
    await ensureChecklists(deps, SYSTEM, user.id);
    const consent = (await getAidChecklists(deps, actor, user.id))[0]?.items.find((i) => i.key === "contributor_consent");
    if (!consent) throw new Error("consent step missing");
    const [task] = await deps.db
      .select()
      .from(familyTasks)
      .where(and(eq(familyTasks.assigneeId, parent.id), eq(familyTasks.aidItemId, consent.id)));
    if (!task) throw new Error("linked task missing");
    await updateTask(deps, parentActor, task.id, { status: "done" });
    const fafsa = (await getAidChecklists(deps, actor, user.id))[0];
    expect(fafsa?.items.find((i) => i.id === consent.id)).toMatchObject({ status: "done", completedAt: NOW });
    expect(fafsa?.doneCount).toBe(1);
    await ensureChecklists(deps, SYSTEM, user.id);
    expect(await deps.db.select().from(familyTasks).where(eq(familyTasks.assigneeId, parent.id))).toHaveLength(3);
  });
});

describe("getAidChecklists", () => {
  it("returns FAFSA plus one CSS checklist per listed CSS college", async () => {
    const { deps, user, actor } = await setup();
    const { actor: parent } = await makeParentOf(deps, user.id);
    const { actor: other } = await makeStudent(deps);
    const lists = await getAidChecklists(deps, actor, user.id);
    expect(lists.map((l) => [l.program, l.awardYear, l.collegeName, l.totalCount, l.doneCount])).toEqual([
      ["fafsa", AWARD_YEAR, null, 7, 0],
      ["css", AWARD_YEAR, "Northgate University", 3, 0],
    ]);
    expect(lists[0]?.items.map((i) => i.key)).toEqual(FAFSA_STEPS.map((s) => s.key));
    expect(await getAidChecklists(deps, parent, user.id)).toHaveLength(2);
    await expect(getAidChecklists(deps, other, user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("updateAidItem", () => {
  it("lets the student finish any item and a parent finish parent steps", async () => {
    const { deps, user, actor } = await setup();
    const { actor: parent } = await makeParentOf(deps, user.id);
    const outsider = userActor((await factories.parent(deps.db)).id, "parent");
    const fafsa = (await getAidChecklists(deps, actor, user.id))[0]?.items ?? [];
    const studentStep = fafsa.find((i) => i.assignee === "student");
    const parentStep = fafsa.find((i) => i.assignee === "parent");
    if (!studentStep || !parentStep) throw new Error("missing steps");
    expect(await updateAidItem(deps, actor, studentStep.id, { status: "done" })).toMatchObject({ status: "done", completedAt: NOW });
    expect(await updateAidItem(deps, parent, parentStep.id, { status: "done" })).toMatchObject({ status: "done" });
    await expect(updateAidItem(deps, parent, studentStep.id, { status: "todo" })).rejects.toMatchObject({ code: "not_found" });
    await expect(updateAidItem(deps, outsider, parentStep.id, { status: "todo" })).rejects.toMatchObject({ code: "not_found" });
    expect(await updateAidItem(deps, actor, studentStep.id, { status: "todo" })).toMatchObject({ completedAt: null });
    expect((await getAidChecklists(deps, actor, user.id))[0]?.doneCount).toBe(1);
  });
});

describe("listAidDeadlines", () => {
  it("lists federal and the student's state deadlines for the award year", async () => {
    const { deps, user, actor } = await setup();
    const base = { sourceUrl: "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines", verifiedAt: new Date(NOW) };
    await deps.db.insert(aidDeadlines).values([
      { ...base, awardYear: AWARD_YEAR, state: null, program: "FAFSA", deadline: "2028-06-30" },
      { ...base, awardYear: AWARD_YEAR, state: "TX", program: "Texas TASFA priority", deadline: "2027-01-15" },
      { ...base, awardYear: AWARD_YEAR, state: "CA", program: "Cal Grant", deadline: "2027-03-02" },
      { ...base, awardYear: "2026-27", state: "TX", program: "Last year", deadline: "2026-01-15" },
    ]);
    const list = await listAidDeadlines(deps, actor, user.id);
    expect(list.map((d) => [d.program, d.state, d.deadline])).toEqual([
      ["Texas TASFA priority", "TX", "2027-01-15"],
      ["FAFSA", null, "2028-06-30"],
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/aid/checklists.test.ts`
Expected: FAIL with `Failed to resolve import "./index" from "src/aid/checklists.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/aid/checklists.ts`:

```ts
import {
  aidChecklistItems,
  aidDeadlines,
  and,
  asc,
  collegeList,
  colleges,
  eq,
  familyTasks,
  inArray,
  isNull,
  or,
  profiles,
} from "@scholarcrew/db";
import {
  type Actor,
  type AidChecklist,
  type AidChecklistItem,
  AidChecklistPatch,
  type AidDeadline,
  type AidProgram,
  CSS_STEPS,
  FAFSA_STEPS,
  invalidInput,
  notFound,
  systemActor,
} from "@scholarcrew/domain";
import { assertCanRead, assertSystem, assertUser } from "../access";
import { createTask } from "../family";
import { isParentOf, parentsOf } from "../plan/common";
import { type CoreDeps, currentAwardYear, currentSeason, one, requireUuid, toIso, toIsoOrNull } from "../shared";

type ItemRow = typeof aidChecklistItems.$inferSelect;
type CollegeRow = typeof colleges.$inferSelect;

const AID_SYSTEM = systemActor("aid.checklists");

function toItem(row: ItemRow): AidChecklistItem {
  return {
    id: row.id,
    awardYear: row.awardYear,
    program: row.program,
    collegeId: row.collegeId,
    key: row.key,
    title: row.title,
    assignee: row.assignee,
    status: row.status,
    dueOn: row.dueOn,
    completedAt: toIsoOrNull(row.completedAt),
  };
}

/** Also used by the admin aid editor (H12). */
export function toAidDeadline(row: typeof aidDeadlines.$inferSelect): AidDeadline {
  return {
    id: row.id,
    awardYear: row.awardYear,
    state: row.state,
    program: row.program,
    deadline: row.deadline,
    note: row.note,
    sourceUrl: row.sourceUrl,
    verifiedAt: toIso(row.verifiedAt),
  };
}

/** Current-season listed colleges that require the CSS Profile, oldest first. */
export async function cssColleges(deps: CoreDeps, studentId: string): Promise<CollegeRow[]> {
  const rows = await deps.db
    .select({ college: colleges })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .where(
      and(
        eq(collegeList.ownerId, studentId),
                isNull(collegeList.archivedAt),
        eq(colleges.cssProfileRequired, true),
      ),
    )
    .orderBy(asc(collegeList.createdAt));
  return rows.map((r) => r.college);
}

/** Federal deadlines plus the student's state for the current award year, soonest first (no date last). */
export async function loadAidDeadlines(deps: CoreDeps, studentId: string): Promise<AidDeadline[]> {
  const [profile] = await deps.db.select({ state: profiles.state }).from(profiles).where(eq(profiles.userId, studentId));
  const state = profile?.state ?? "";
  const awardYear = currentAwardYear(deps.clock.now());
  const scope = state ? or(isNull(aidDeadlines.state), eq(aidDeadlines.state, state)) : isNull(aidDeadlines.state);
  const rows = await deps.db
    .select()
    .from(aidDeadlines)
    .where(and(eq(aidDeadlines.awardYear, awardYear), scope))
    .orderBy(asc(aidDeadlines.deadline), asc(aidDeadlines.program));
  return rows.map(toAidDeadline);
}

export async function ensureChecklists(deps: CoreDeps, system: Actor, studentId: string): Promise<void> {
  assertSystem(system);
  requireUuid(studentId, "Student not found");
  const awardYear = currentAwardYear(deps.clock.now());
  const css = await cssColleges(deps, studentId);
  const rows = [
    ...FAFSA_STEPS.map((s) => ({
      ownerId: studentId,
      awardYear,
      program: "fafsa" as const,
      collegeId: null,
      key: s.key,
      title: s.title,
      assignee: s.assignee,
      dueOn: null,
    })),
    ...css.flatMap((c) =>
      CSS_STEPS.map((s) => ({
        ownerId: studentId,
        awardYear,
        program: "css" as const,
        collegeId: c.id,
        key: s.key,
        title: s.title,
        assignee: s.assignee,
        dueOn: c.aidPriorityDate,
      })),
    ),
  ];
  await deps.db.insert(aidChecklistItems).values(rows).onConflictDoNothing();

  const parents = await parentsOf(deps.db, studentId);
  if (parents.length === 0) return;
  // R2I-6: the checklist item is the only status. Each parent gets one task per parent-assigned item, linked by
  // `aidItemId`; 06 reads and writes the task's status through that item. R2I-5: the title is the plain step
  // title, so a parent without the `colleges` share never sees a college name (06 listTasks adds it when allowed).
  const cssIds = new Set(css.map((c) => c.id));
  const parentItems = (
    await deps.db
      .select()
      .from(aidChecklistItems)
      .where(
        and(
          eq(aidChecklistItems.ownerId, studentId),
          eq(aidChecklistItems.awardYear, awardYear),
          eq(aidChecklistItems.assignee, "parent"),
        ),
      )
  ).filter((item) => item.program === "fafsa" || (item.collegeId !== null && cssIds.has(item.collegeId)));
  if (parentItems.length === 0) return;
  const linked = await deps.db
    .select({ aidItemId: familyTasks.aidItemId, assigneeId: familyTasks.assigneeId })
    .from(familyTasks)
    .where(
      and(
        eq(familyTasks.studentId, studentId),
        inArray(
          familyTasks.aidItemId,
          parentItems.map((item) => item.id),
        ),
      ),
    );
  for (const p of parents) {
    for (const item of parentItems) {
      if (linked.some((l) => l.aidItemId === item.id && l.assigneeId === p.userId)) continue;
      // createTask inserts with onConflictDoNothing on (aidItemId, assigneeId), so a racing call is harmless.
      await createTask(deps, system, {
        familyId: p.familyId,
        assigneeId: p.userId,
        studentId,
        kind: item.program === "fafsa" ? "fafsa_contributor" : "css_contributor",
        title: item.title,
        detail: item.program === "fafsa" ? `FAFSA ${awardYear}` : `CSS Profile ${awardYear}`,
        dueOn: item.dueOn,
        aidItemId: item.id,
      });
    }
  }
}

function checklist(
  program: AidProgram,
  awardYear: string,
  college: CollegeRow | null,
  steps: Array<{ key: string }>,
  rows: ItemRow[],
): AidChecklist {
  const order = (key: string) => steps.findIndex((s) => s.key === key);
  const items = [...rows].sort((a, b) => order(a.key) - order(b.key)).map(toItem);
  return {
    program,
    awardYear,
    collegeId: college?.id ?? null,
    collegeName: college?.name ?? null,
    items,
    doneCount: items.filter((i) => i.status === "done").length,
    totalCount: items.length,
  };
}

export async function getAidChecklists(deps: CoreDeps, actor: Actor, studentId: string): Promise<AidChecklist[]> {
  await assertCanRead(deps, actor, studentId, "deadlines");
  await ensureChecklists(deps, AID_SYSTEM, studentId);
  const awardYear = currentAwardYear(deps.clock.now());
  const rows = await deps.db
    .select()
    .from(aidChecklistItems)
    .where(and(eq(aidChecklistItems.ownerId, studentId), eq(aidChecklistItems.awardYear, awardYear)));
  const css = await cssColleges(deps, studentId);
  return [
    checklist("fafsa", awardYear, null, FAFSA_STEPS, rows.filter((r) => r.program === "fafsa")),
    ...css.map((c) =>
      checklist("css", awardYear, c, CSS_STEPS, rows.filter((r) => r.program === "css" && r.collegeId === c.id)),
    ),
  ];
}

/** The student updates any item; a parent in the student's family updates items assigned to a parent. */
export async function updateAidItem(deps: CoreDeps, actor: Actor, id: string, p: AidChecklistPatch): Promise<AidChecklistItem> {
  assertUser(actor);
  requireUuid(id, "Checklist item not found");
  const parsed = AidChecklistPatch.safeParse(p);
  if (!parsed.success) throw invalidInput("Check the status and try again", parsed.error.issues);
  const [row] = await deps.db.select().from(aidChecklistItems).where(eq(aidChecklistItems.id, id));
  if (!row) throw notFound("Checklist item not found");
  const allowed =
    row.ownerId === actor.userId ||
    (row.assignee === "parent" && (await isParentOf(deps.db, actor.userId, row.ownerId)));
  if (!allowed) throw notFound("Checklist item not found");
  const status = parsed.data.status;
  const updated = one(
    await deps.db
      .update(aidChecklistItems)
      .set({ status, completedAt: status === "done" ? deps.clock.now() : null })
      .where(eq(aidChecklistItems.id, id))
      .returning(),
    "aid_checklist_items update",
  );
  return toItem(updated);
}

export async function listAidDeadlines(deps: CoreDeps, actor: Actor, studentId: string): Promise<AidDeadline[]> {
  await assertCanRead(deps, actor, studentId, "deadlines");
  return loadAidDeadlines(deps, studentId);
}
```

`packages/core/src/aid/index.ts`:

```ts
export { ensureChecklists, getAidChecklists, listAidDeadlines, updateAidItem } from "./checklists";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/aid`
Expected: PASS, 1 file, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/aid
git commit -m "feat(core): FAFSA and CSS checklists with parent tasks and aid deadlines"
```

### H7: Coming-up deadlines and the This Week view

- [ ] **Step 1: Write the failing tests**

`packages/core/src/plan/deadlines.test.ts`:

```ts
import { aidDeadlines, eq, scholarships } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { listUpcomingDeadlines } from "./deadlines";
import { AWARD_YEAR, NOW, listCollege, makeDeps, makeParentOf, makeStateU, makeStudent, saveApp, setShare } from "./testkit";

async function setup() {
  const { deps } = makeDeps();
  const student = await makeStudent(deps);
  const id = student.user.id;
  const stateU = await makeStateU(deps);
  await listCollege(deps, id, stateU.id, { plan: "EA" });
  const sent = await factories.college(deps.db, {
    id: "100003",
    name: "Done College",
    deadlines: { ED: null, EA: "2026-10-20", REA: null, RD: null, rolling: false },
  });
  await listCollege(deps, id, sent.id, { plan: "EA", status: "submitted", minutesAfter: 1 });
  const css = await factories.college(deps.db, {
    id: "200001",
    name: "Northgate University",
    cssProfileRequired: true,
    aidPriorityDate: "2026-10-25",
    deadlines: { ED: null, EA: null, REA: null, RD: "2027-01-05", rolling: false },
  });
  await listCollege(deps, id, css.id, { plan: "RD", minutesAfter: 2 });
  const hill = await saveApp(deps, id, { name: "Hill Country STEM Award", amountUsd: 1000, deadline: "2026-10-15" });
  await saveApp(deps, id, { name: "Maple Rotary", stage: "matched", amountUsd: 2500, deadline: "2026-10-30" });
  await saveApp(deps, id, { name: "Submitted One", stage: "submitted", deadline: "2026-10-10" });
  await saveApp(deps, id, { name: "Past One", deadline: "2026-10-01" });
  await saveApp(deps, id, { name: "No Date", deadline: null });
  const base = { awardYear: AWARD_YEAR, sourceUrl: "https://example.org/aid", verifiedAt: new Date(NOW) };
  await deps.db.insert(aidDeadlines).values([
    { ...base, state: "TX", program: "Texas TASFA priority", deadline: "2027-01-15" },
    { ...base, state: "CA", program: "Cal Grant", deadline: "2026-10-20" },
  ]);
  return { deps, ...student, hill };
}

describe("listUpcomingDeadlines", () => {
  it("merges scholarships, applications, and aid dates in due order", async () => {
    const { deps, user, actor, hill } = await setup();
    const all = await listUpcomingDeadlines(deps, actor, user.id, 10);
    expect(all.map((d) => [d.kind, d.title, d.dueOn, d.daysLeft, d.warning])).toEqual([
      ["scholarship", "Hill Country STEM Award", "2026-10-15", 9, true],
      ["aid", "CSS Profile · Northgate University", "2026-10-25", 19, false],
      ["scholarship", "Maple Rotary", "2026-10-30", 24, false],
      ["application", "State U · Early Action", "2026-11-01", 26, false],
      ["application", "Northgate University · Regular Decision", "2027-01-05", 91, false],
      ["aid", "Texas TASFA priority", "2027-01-15", 101, false],
    ]);
    expect(all[0]).toMatchObject({ refType: "scholarship", refId: hill.scholarship.id, valueUsd: 1000 });
    const top = await listUpcomingDeadlines(deps, actor, user.id, 4);
    expect(top.map((d) => d.title)).toEqual([
      "Hill Country STEM Award",
      "CSS Profile · Northgate University",
      "Maple Rotary",
      "State U · Early Action",
    ]);
  });

  it("follows the deadlines share", async () => {
    const { deps, user } = await setup();
    const { actor: parent } = await makeParentOf(deps, user.id);
    const { actor: other } = await makeStudent(deps);
    expect(await listUpcomingDeadlines(deps, parent, user.id, 4)).toHaveLength(4);
    await expect(listUpcomingDeadlines(deps, other, user.id, 4)).rejects.toMatchObject({ code: "not_found" });
    await setShare(deps, user.id, "deadlines", false);
    await expect(listUpcomingDeadlines(deps, parent, user.id, 4)).rejects.toMatchObject({ code: "not_found" });
  });

  it("drops retired and scam-flagged listings (R2P-4)", async () => {
    const { deps, user, actor, hill } = await setup();
    await deps.db.update(scholarships).set({ status: "retired" }).where(eq(scholarships.id, hill.scholarship.id));
    const flagged = await saveApp(deps, user.id, { name: "Flagged One", deadline: "2026-10-12" });
    await deps.db
      .update(scholarships)
      .set({ scamFlags: ["application_fee"] })
      .where(eq(scholarships.id, flagged.scholarship.id));
    const titles = (await listUpcomingDeadlines(deps, actor, user.id, 10)).map((d) => d.title);
    expect(titles).not.toContain("Hill Country STEM Award");
    expect(titles).not.toContain("Flagged One");
    expect(titles).toContain("Maple Rotary");
  });
});
```

`packages/core/src/plan/week.test.ts`:

```ts
import { sweepRuns } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type PlanItemInput, ThisWeekView } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { createJob } from "../crew/jobs";
import { setSensitiveFact } from "../memory";
import { addPlanItem } from "./items";
import { NOW, WEEK, listCollege, makeDeps, makeParentOf, makeStateU, makeStudent, saveApp, setShare } from "./testkit";
import { getThisWeek } from "./week";

const item = (o: Partial<PlanItemInput>): PlanItemInput => ({
  title: "Later",
  kind: "custom",
  refType: null,
  refId: null,
  minutes: 10,
  valueUsd: null,
  dueOn: null,
  contributors: [],
  weekStart: null,
  ...o,
});

async function weekSetup() {
  const { deps } = makeDeps();
  const student = await makeStudent(deps);
  const id = student.user.id;
  const first = await factories.college(deps.db, { id: "100004", name: "First Added", costOfAttendanceUsd: 30000 });
  await listCollege(deps, id, first.id, { plan: "RD" });
  const stateU = await makeStateU(deps);
  await listCollege(deps, id, stateU.id, { plan: "EA", minutesAfter: 1 });
  await setSensitiveFact(deps, student.actor, { kind: "income_range", enabled: true, value: "48_75k" });
  await saveApp(deps, id, { name: "Hill Country", amountUsd: 2500, deadline: "2026-10-15" });
  await addPlanItem(deps, student.actor, item({}));
  await addPlanItem(
    deps,
    student.actor,
    item({ title: "Hill Country STEM Award", kind: "scholarship", minutes: 30, valueUsd: 1000, dueOn: "2026-10-15", contributors: ["scout"] }),
  );
  await deps.db
    .insert(sweepRuns)
    .values({ ownerId: id, ranAt: new Date(NOW), newMatches: 3, totalUsd: 4750, reuseCount: 2, hiddenScams: 1 });
  return { deps, ...student };
}

describe("getThisWeek", () => {
  it("assembles next step, plan, top-school gap, deadlines, sweep, and crew status", async () => {
    const { deps, user, actor } = await weekSetup();
    await createJob(deps, actor, { kind: "weekly_plan" });
    const view = await getThisWeek(deps, actor, user.id);
    expect(ThisWeekView.safeParse(view).success).toBe(true);
    expect(view).toMatchObject({
      greetingName: "Test",
      weekStart: WEEK,
      crewWorking: true,
      sweep: { newMatches: 3, totalUsd: 4750, reuseCount: 2, hiddenScams: 1 },
    });
    expect(view.nextStep?.title).toBe("Hill Country STEM Award");
    expect(view.plan.items).toHaveLength(2);
    expect(view.gap).toMatchObject({ collegeName: "State U", gapUsd: 9200, pendingUsd: 2500, gapIfPendingWinUsd: 6700 });
    expect(view.deadlines.map((d) => d.title)).toEqual([
      "Hill Country",
      "State U · Early Action",
      "First Added · Regular Decision",
    ]);
  });

  it("returns an empty week for a new student", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    expect(await getThisWeek(deps, actor, user.id)).toEqual({
      greetingName: "Test",
      weekStart: WEEK,
      nextStep: null,
      plan: { weekStart: WEEK, items: [], totalMinutes: 0, doneCount: 0 },
      gap: null,
      deadlines: [],
      sweep: null,
      crewWorking: false,
    });
  });

  it("hides the gap and sweep from a parent without those shares", async () => {
    const { deps, user } = await weekSetup();
    const { actor: parent } = await makeParentOf(deps, user.id);
    const shared = await getThisWeek(deps, parent, user.id);
    expect(shared.gap?.collegeName).toBe("State U");
    expect(shared.sweep?.newMatches).toBe(3);
    await setShare(deps, user.id, "costs", false);
    await setShare(deps, user.id, "scholarships", false);
    const limited = await getThisWeek(deps, parent, user.id);
    expect(limited).toMatchObject({ gap: null, sweep: null });
    expect(limited.plan.items).toHaveLength(2);
    await setShare(deps, user.id, "deadlines", false);
    await expect(getThisWeek(deps, parent, user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/core test -- src/plan/deadlines.test.ts src/plan/week.test.ts`
Expected: FAIL with `Failed to resolve import "./deadlines" from "src/plan/deadlines.test.ts"` and `Failed to resolve import "./week" from "src/plan/week.test.ts"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/plan/deadlines.ts`:

```ts
import { privateScholarshipIds } from "../scholarships";
import { readsAsOwner } from "../scholarships/common";
import {
  and,
  collegeList,
  colleges,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  scholarshipApplications,
  scholarships,
} from "@scholarcrew/db";
import { APP_PLAN_LABELS, type Actor, type Deadline } from "@scholarcrew/domain";
import { daysUntil, isWarning } from "@scholarcrew/engines";
import { assertCanRead } from "../access";
import { cssColleges, loadAidDeadlines } from "../aid/checklists";
import { liveListingWhere } from "../scholarships";
import { type CoreDeps, currentSeason, todayIn } from "../shared";
import { ACTIVE_LIST_STATUSES, OPEN_APP_STAGES, planDeadline, userTimeZone } from "./common";

type Pending = Omit<Deadline, "daysLeft" | "warning">;

/**
 * Every future deadline for the student, soonest first: saved scholarships still being worked on,
 * current-season applications, aid deadlines for their state, and CSS Profile priority dates. No access check.
 */
export async function collectDeadlines(deps: CoreDeps, studentId: string): Promise<Deadline[]> {
  const now = deps.clock.now();
  const timeZone = await userTimeZone(deps.db, studentId);
  const today = todayIn(now, timeZone);
  const out: Pending[] = [];

  const apps = await deps.db
    .select({ id: scholarships.id, name: scholarships.name, deadline: scholarships.deadline, amountMaxUsd: scholarships.amountMaxUsd })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(
      and(
        eq(scholarshipApplications.ownerId, studentId),
        inArray(scholarshipApplications.stage, OPEN_APP_STAGES),
        isNotNull(scholarships.deadline),
        gte(scholarships.deadline, today),
        // R2P-4: retired, under-review, and scam-flagged listings leave Coming up.
        liveListingWhere(scholarshipApplications.ownerId),
      ),
    );
  for (const a of apps) {
    if (!a.deadline) continue;
    out.push({ kind: "scholarship", title: a.name, dueOn: a.deadline, refType: "scholarship", refId: a.id, valueUsd: a.amountMaxUsd });
  }

  const entries = await deps.db
    .select({ entryId: collegeList.id, plan: collegeList.plan, name: colleges.name, deadlines: colleges.deadlines })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .where(
      and(
        eq(collegeList.ownerId, studentId),
        eq(collegeList.season, currentSeason(now)),
        isNull(collegeList.archivedAt),
        inArray(collegeList.status, ACTIVE_LIST_STATUSES),
      ),
    );
  for (const e of entries) {
    const due = planDeadline(e.deadlines, e.plan);
    if (!due || due < today) continue;
    out.push({
      kind: "application",
      title: `${e.name} · ${APP_PLAN_LABELS[e.plan]}`,
      dueOn: due,
      refType: "college_list",
      refId: e.entryId,
      valueUsd: null,
    });
  }

  for (const d of await loadAidDeadlines(deps, studentId)) {
    if (!d.deadline || d.deadline < today) continue;
    out.push({ kind: "aid", title: d.program, dueOn: d.deadline, refType: "aid_deadline", refId: d.id, valueUsd: null });
  }

  for (const c of await cssColleges(deps, studentId)) {
    if (!c.aidPriorityDate || c.aidPriorityDate < today) continue;
    out.push({
      kind: "aid",
      title: `CSS Profile · ${c.name}`,
      dueOn: c.aidPriorityDate,
      refType: "college",
      refId: c.id,
      valueUsd: null,
    });
  }

  out.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : a.title.localeCompare(b.title)));
  return out.map((d) => {
    const daysLeft = daysUntil(d.dueOn, now, timeZone);
    return { ...d, daysLeft, warning: isWarning(daysLeft) };
  });
}

export async function listUpcomingDeadlines(
  deps: CoreDeps,
  actor: Actor,
  studentId: string,
  limit: number,
): Promise<Deadline[]> {
  await assertCanRead(deps, actor, studentId, "deadlines");
  const n = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 4;
  const privateIds = readsAsOwner(actor, studentId) ? new Set<string>() : await privateScholarshipIds(deps.db, studentId);
  return (await collectDeadlines(deps, studentId)).filter((deadline) => deadline.refType !== "scholarship" || !privateIds.has(deadline.refId)).slice(0, n);
}
```

`packages/core/src/plan/week.ts`:

```ts
import { privateScholarshipIds } from "../scholarships";
import { readsAsOwner } from "../scholarships/common";
import { and, asc, collegeList, colleges, crewJobs, eq, inArray, isNull, users, sql } from "@scholarcrew/db";
import { type Actor, type CostSummary, type JobStatus, type ThisWeekView, notFound } from "@scholarcrew/domain";
import { assertCanRead, canRead } from "../access";
import { costsFor } from "../money/costs";
import { lastSweep } from "../scholarships";
import { type CoreDeps, currentSeason } from "../shared";
import { firstName } from "./common";
import { collectDeadlines } from "./deadlines";
import { loadWeekPlan } from "./items";

const WORKING: JobStatus[] = ["queued", "working"];

/** The college with the earliest ED or EA deadline, else the first one added; its cost summary or null. */
async function topGap(deps: CoreDeps, studentId: string): Promise<CostSummary | null> {
  const entries = await deps.db
    .select({ collegeId: collegeList.collegeId, plan: collegeList.plan, deadlines: colleges.deadlines })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .where(
      and(
        eq(collegeList.ownerId, studentId),
                isNull(collegeList.archivedAt),
      ),
    )
    .orderBy(asc(collegeList.createdAt));
  let top = entries[0];
  if (!top) return null;
  let earliest: string | null = null;
  for (const e of entries) {
    if (e.plan !== "ED" && e.plan !== "EA") continue;
    const due = e.deadlines[e.plan];
    if (due && (earliest === null || due < earliest)) {
      earliest = due;
      top = e;
    }
  }
  const topId = top.collegeId;
  return (await costsFor(deps, studentId, { viewer: "other" })).find((c) => c.collegeId === topId) ?? null;
}

export async function getThisWeek(deps: CoreDeps, actor: Actor, studentId: string): Promise<ThisWeekView> {
  await assertCanRead(deps, actor, studentId, "deadlines");
  const [user] = await deps.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, studentId));
  if (!user) throw notFound("Student not found");
  const loaded = await loadWeekPlan(deps, studentId);
  const privateIds = readsAsOwner(actor, studentId) ? new Set<string>() : await privateScholarshipIds(deps.db, studentId);
  const publicRef = (item: { refType: string | null; refId: string | null }) => item.refType !== "scholarship" || item.refId === null || !privateIds.has(item.refId);
  const plan = { ...loaded, items: loaded.items.filter(publicRef) };
  const gap = (await canRead(deps, actor, studentId, "costs")) ? await topGap(deps, studentId) : null;
  const sweep = (await canRead(deps, actor, studentId, "scholarships")) ? await lastSweep(deps, actor, studentId) : null;
  const working = await deps.db
    .select({ id: crewJobs.id })
    .from(crewJobs)
    .where(and(eq(crewJobs.ownerId, studentId), inArray(crewJobs.status, WORKING), sql`${crewJobs.updatedAt} > ${new Date(deps.clock.now().getTime() - 30 * 60_000)}`))
    .limit(1);
  return {
    greetingName: firstName(user.displayName),
    weekStart: plan.weekStart,
    nextStep: plan.items.find((i) => i.status === "todo") ?? null,
    plan,
    gap,
    deadlines: (await collectDeadlines(deps, studentId)).filter(publicRef).slice(0, 4),
    sweep,
    crewWorking: working.length > 0,
  };
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/core test -- src/plan/deadlines.test.ts src/plan/week.test.ts`
Expected: PASS, 2 files, 6 tests (deadlines 3, week 3).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plan/deadlines.ts packages/core/src/plan/deadlines.test.ts packages/core/src/plan/week.ts packages/core/src/plan/week.test.ts
git commit -m "feat(core): merged coming-up deadlines and the This Week view"
```

### H8: Weekly digest, deadline reminders, and the plan index

- [ ] **Step 1: Write the failing test**

`packages/core/src/plan/notify.test.ts`:

```ts
import { eq, notificationPrefs, scholarshipApplications, scholarships, sweepRuns, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type PlanItemInput, systemActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { addPlanItem, buildWeeklyDigest, findDueReminders, updatePlanItem } from "./index";
import { NOW, WEEK, listCollege, makeDeps, makeStateU, makeStudent, saveApp } from "./testkit";

const SYSTEM = systemActor("test");
const item = (o: Partial<PlanItemInput>): PlanItemInput => ({
  title: "Draft the Rotary essay",
  kind: "essay",
  refType: null,
  refId: null,
  minutes: 45,
  valueUsd: null,
  dueOn: null,
  contributors: [],
  weekStart: null,
  ...o,
});
const daysAgo = (n: number) => new Date(new Date(NOW).getTime() - n * 86_400_000);

describe("buildWeeklyDigest", () => {
  it("returns null for parents, empty weeks, stale sweeps, and email opt-outs", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const parent = await factories.parent(deps.db);
    expect(await buildWeeklyDigest(deps, SYSTEM, parent.id)).toBeNull();
    expect(await buildWeeklyDigest(deps, SYSTEM, user.id)).toBeNull();
    await deps.db
      .insert(sweepRuns)
      .values({ ownerId: user.id, ranAt: daysAgo(8), newMatches: 2, totalUsd: 3000, reuseCount: 0, hiddenScams: 0 });
    expect(await buildWeeklyDigest(deps, SYSTEM, user.id)).toBeNull();
    await addPlanItem(deps, actor, item({}));
    await deps.db.insert(notificationPrefs).values({ userId: user.id, emailEnabled: false });
    expect(await buildWeeklyDigest(deps, SYSTEM, user.id)).toBeNull();
    await expect(buildWeeklyDigest(deps, actor, user.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("summarizes open items, deadlines within 14 days, and a fresh sweep", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const stateU = await makeStateU(deps);
    await listCollege(deps, user.id, stateU.id, { plan: "EA" });
    await saveApp(deps, user.id, { name: "Hill Country STEM Award", amountUsd: 1000, deadline: "2026-10-15" });
    await addPlanItem(deps, actor, item({ dueOn: "2026-10-15" }));
    const done = await addPlanItem(deps, actor, item({ title: "Done thing" }));
    await updatePlanItem(deps, actor, done.id, { status: "done" });
    await deps.db
      .insert(sweepRuns)
      .values({ ownerId: user.id, ranAt: daysAgo(1), newMatches: 3, totalUsd: 4750, reuseCount: 2, hiddenScams: 1 });
    const digest = await buildWeeklyDigest(deps, SYSTEM, user.id);
    expect(digest).toMatchObject({
      userId: user.id,
      email: user.email,
      weekStart: WEEK,
      subject: "Your week: 1 step, 1 deadline coming up",
    });
    const text = digest?.text ?? "";
    expect(text).toContain("Hi Test,");
    expect(text).toContain("- Draft the Rotary essay (45 min, due Oct 15)");
    expect(text).toContain("- Hill Country STEM Award: 9 days left (Oct 15)");
    expect(text).not.toContain("2026-10-15");
    expect(text).toContain("Scout found 3 new matches worth up to $4,750.");
    expect(text).toContain("http://localhost:3000/week");
    expect(text).not.toContain("Done thing");
    expect(text).not.toContain("State U");
  });
});

describe("findDueReminders", () => {
  it("finds 7, 3, and 1 day reminders keyed per student item", async () => {
    const { deps } = makeDeps();
    const a = await makeStudent(deps);
    const b = await makeStudent(deps);
    const seven = await saveApp(deps, a.user.id, { name: "Seven", deadline: "2026-10-13" });
    const three = await saveApp(deps, a.user.id, { name: "Three", stage: "drafting", deadline: "2026-10-09" });
    const one = await saveApp(deps, a.user.id, { name: "One", stage: "matched", deadline: "2026-10-07" });
    await saveApp(deps, a.user.id, { name: "Four", deadline: "2026-10-10" });
    await saveApp(deps, a.user.id, { name: "Sent", stage: "submitted", deadline: "2026-10-13" });
    const [shared] = await deps.db
      .insert(scholarshipApplications)
      .values({ ownerId: b.user.id, scholarshipId: seven.scholarship.id, stage: "planned" })
      .returning();
    const early = await factories.college(deps.db, {
      id: "100005",
      name: "Early College",
      deadlines: { ED: "2026-10-09", EA: null, REA: null, RD: null, rolling: false },
    });
    const entry = await listCollege(deps, a.user.id, early.id, { plan: "ED" });
    const blocked = await makeStudent(deps);
    await deps.db.update(users).set({ status: "blocked_underage" }).where(eq(users.id, blocked.user.id));
    await saveApp(deps, blocked.user.id, { deadline: "2026-10-13" });

    const reminders = await findDueReminders(deps, SYSTEM);
    expect(reminders.map((r) => r.dedupeKey).sort()).toEqual(
      [
        `reminder:college_list:${entry.id}:3`,
        `reminder:scholarship_application:${one.application.id}:1`,
        `reminder:scholarship_application:${seven.application.id}:7`,
        `reminder:scholarship_application:${shared?.id}:7`,
        `reminder:scholarship_application:${three.application.id}:3`,
      ].sort(),
    );
    expect(reminders.find((r) => r.refId === seven.application.id)).toEqual({
      userId: a.user.id,
      title: "Seven is due in 7 days",
      dueOn: "2026-10-13",
      offset: 7,
      refType: "scholarship_application",
      refId: seven.application.id,
      dedupeKey: `reminder:scholarship_application:${seven.application.id}:7`,
    });
    expect(reminders.find((r) => r.refId === one.application.id)?.title).toBe("One is due tomorrow");
    expect(reminders.find((r) => r.refType === "college_list")?.title).toBe("Early College · Early Decision is due in 3 days");
    await expect(findDueReminders(deps, a.actor)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("sends no reminder for a retired or scam-flagged listing (R2P-4)", async () => {
    const { deps } = makeDeps();
    const { user } = await makeStudent(deps);
    const retired = await saveApp(deps, user.id, { name: "Retired", deadline: "2026-10-13" });
    const flagged = await saveApp(deps, user.id, { name: "Flagged", deadline: "2026-10-09" });
    const live = await saveApp(deps, user.id, { name: "Live", deadline: "2026-10-07" });
    await deps.db.update(scholarships).set({ status: "retired" }).where(eq(scholarships.id, retired.scholarship.id));
    await deps.db
      .update(scholarships)
      .set({ scamFlags: ["guaranteed_award"] })
      .where(eq(scholarships.id, flagged.scholarship.id));
    expect((await findDueReminders(deps, SYSTEM)).map((r) => r.refId)).toEqual([live.application.id]);
  });

  it("finds a renewal reminder 30 days before the anniversary of a renewable win (SC-11)", async () => {
    const { deps } = makeDeps();
    const { user } = await makeStudent(deps);
    const lastYear = new Date("2025-11-05T15:00:00.000Z");
    const won = { stage: "won" as const, outcomeUsd: 2000, outcomeRenewable: true, outcomeAt: lastYear };
    const renewable = await saveApp(deps, user.id, { ...won, name: "Maple Rotary" });
    await saveApp(deps, user.id, { ...won, name: "One Time", outcomeRenewable: false });
    await saveApp(deps, user.id, { ...won, name: "Next Week", outcomeAt: new Date("2025-11-12T15:00:00.000Z") });
    await saveApp(deps, user.id, { ...won, name: "Lost One", stage: "lost" });
    await saveApp(deps, user.id, { ...won, name: "No Date", outcomeAt: null });
    expect(await findDueReminders(deps, SYSTEM)).toEqual([
      {
        userId: user.id,
        title: "Maple Rotary renewal is coming up",
        dueOn: "2026-11-05",
        offset: 30,
        refType: "scholarship_application",
        refId: renewable.application.id,
        dedupeKey: `renewal:${renewable.application.id}:2026`,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/plan/notify.test.ts`
Expected: FAIL with `Failed to resolve import "./index" from "src/plan/notify.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/plan/notify.ts`:

```ts
import {
  and,
  collegeList,
  colleges,
  eq,
  inArray,
  isNotNull,
  isNull,
  notificationPrefs,
  scholarshipApplications,
  scholarships,
  users,
} from "@scholarcrew/db";
import { APP_PLAN_LABELS, type Actor, type Digest, type IsoDate, type Reminder } from "@scholarcrew/domain";
import { formatUsd, reminderOffsetsDue } from "@scholarcrew/engines";
import { assertSystem } from "../access";
import { lastSweep, liveListingWhere } from "../scholarships";
import { type CoreDeps, calendarShort, currentSeason, isUuid, safeTimeZone, todayIn } from "../shared";
import { ACTIVE_LIST_STATUSES, OPEN_APP_STAGES, addIsoDays, firstName, planDeadline } from "./common";
import { collectDeadlines } from "./deadlines";
import { loadWeekPlan } from "./items";

const DAY_MS = 86_400_000;
const DIGEST_DEADLINE_DAYS = 14;
const FRESH_SWEEP_DAYS = 7;
const RENEWAL_OFFSET = 30;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function daysLeftText(daysLeft: number): string {
  if (daysLeft <= 0) return "due today";
  return `${plural(daysLeft, "day", "days")} left`;
}

/** Plain-text weekly email for an active student, or null when there's nothing to say or email is off. */
export async function buildWeeklyDigest(deps: CoreDeps, system: Actor, userId: string): Promise<Digest | null> {
  assertSystem(system);
  if (!isUuid(userId)) return null;
  const [user] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!user || user.role !== "student" || user.status !== "active") return null;
  const [prefs] = await deps.db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
  if (prefs && !prefs.emailEnabled) return null;

  const now = deps.clock.now();
  const plan = await loadWeekPlan(deps, userId);
  const open = plan.items.filter((i) => i.status === "todo");
  const soon = (await collectDeadlines(deps, userId)).filter((d) => d.daysLeft <= DIGEST_DEADLINE_DAYS);
  const sweep = await lastSweep(deps, system, userId);
  const fresh =
    sweep && sweep.newMatches > 0 && now.getTime() - new Date(sweep.ranAt).getTime() <= FRESH_SWEEP_DAYS * DAY_MS
      ? sweep
      : null;
  if (open.length === 0 && soon.length === 0 && !fresh) return null;

  const lines: string[] = [`Hi ${firstName(user.displayName)},`, ""];
  if (open.length > 0) {
    lines.push(`This week's plan (${open.length} open):`);
    // R3E-8: calendar dates read "Oct 15", like the web screens.
    for (const i of open) lines.push(`- ${i.title} (${i.minutes} min${i.dueOn ? `, due ${calendarShort(i.dueOn)}` : ""})`);
    lines.push("");
  }
  if (soon.length > 0) {
    lines.push(`Coming up in the next ${DIGEST_DEADLINE_DAYS} days:`);
    for (const d of soon) lines.push(`- ${d.title}: ${daysLeftText(d.daysLeft)} (${calendarShort(d.dueOn)})`);
    lines.push("");
  }
  if (fresh) {
    lines.push(`Scout found ${plural(fresh.newMatches, "new match", "new matches")} worth up to ${formatUsd(fresh.totalUsd)}.`);
    lines.push("");
  }
  lines.push(`Open your week: ${deps.config.appUrl}/week`, "", "Change digest settings any time in Settings.");
  return {
    userId,
    email: user.email,
    subject: `Your week: ${plural(open.length, "step", "steps")}, ${plural(soon.length, "deadline", "deadlines")} coming up`,
    text: lines.join("\n"),
    weekStart: plan.weekStart,
  };
}

function reminderTitle(name: string, offset: 7 | 3 | 1): string {
  return offset === 1 ? `${name} is due tomorrow` : `${name} is due in ${offset} days`;
}

/** True when `date` is a later-year anniversary of `wonOn`. A Feb 29 win renews on Feb 28 in other years. */
export function isRenewalAnniversary(wonOn: IsoDate, date: IsoDate): boolean {
  const year = Number(date.slice(0, 4));
  if (year <= Number(wonOn.slice(0, 4))) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const monthDay = wonOn.slice(5) === "02-29" && !leap ? "02-28" : wonOn.slice(5);
  return date.slice(5) === monthDay;
}

/**
 * Reminders due today (in each student's time zone) for items active students are working on, plus SC-11
 * renewal reminders 30 days before each anniversary of a won renewable award (D2).
 */
export async function findDueReminders(deps: CoreDeps, system: Actor): Promise<Reminder[]> {
  assertSystem(system);
  const now = deps.clock.now();
  const out: Reminder[] = [];
  const push = (userId: string, timeZone: string, name: string, dueOn: IsoDate, refType: string, refId: string) => {
    for (const offset of reminderOffsetsDue(dueOn, now, safeTimeZone(timeZone))) {
      out.push({
        userId,
        title: reminderTitle(name, offset),
        dueOn,
        offset,
        refType,
        refId,
        dedupeKey: `reminder:${refType}:${refId}:${dueOn}:${offset}`,
      });
    }
  };
  const activeStudent = and(eq(users.role, "student"), eq(users.status, "active"));

  const apps = await deps.db
    .select({
      userId: scholarshipApplications.ownerId,
      timeZone: users.timeZone,
      applicationId: scholarshipApplications.id,
      name: scholarships.name,
      deadline: scholarships.deadline,
    })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .innerJoin(users, eq(users.id, scholarshipApplications.ownerId))
    .where(
      and(
        activeStudent,
        inArray(scholarshipApplications.stage, OPEN_APP_STAGES),
        isNotNull(scholarships.deadline),
        // R2P-4: no "due in 3 days" for a retired, under-review, or scam-flagged listing.
        liveListingWhere(scholarshipApplications.ownerId),
      ),
    );
  for (const a of apps) {
    if (a.deadline) push(a.userId, a.timeZone, a.name, a.deadline, "scholarship_application", a.applicationId);
  }

  const entries = await deps.db
    .select({
      userId: collegeList.ownerId,
      timeZone: users.timeZone,
      entryId: collegeList.id,
      plan: collegeList.plan,
      name: colleges.name,
      deadlines: colleges.deadlines,
    })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .innerJoin(users, eq(users.id, collegeList.ownerId))
    .where(
      and(
        activeStudent,
        eq(collegeList.season, currentSeason(now)),
        isNull(collegeList.archivedAt),
        inArray(collegeList.status, ACTIVE_LIST_STATUSES),
      ),
    );
  for (const e of entries) {
    const due = planDeadline(e.deadlines, e.plan);
    if (due) push(e.userId, e.timeZone, `${e.name} · ${APP_PLAN_LABELS[e.plan]}`, due, "college_list", e.entryId);
  }

  const wins = await deps.db
    .select({
      userId: scholarshipApplications.ownerId,
      timeZone: users.timeZone,
      applicationId: scholarshipApplications.id,
      name: scholarships.name,
      outcomeAt: scholarshipApplications.outcomeAt,
    })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .innerJoin(users, eq(users.id, scholarshipApplications.ownerId))
    .where(
      and(
        activeStudent,
        eq(scholarshipApplications.stage, "won"),
        eq(scholarshipApplications.outcomeRenewable, true),
        isNotNull(scholarshipApplications.outcomeAt),
      ),
    );
  for (const w of wins) {
    if (!w.outcomeAt) continue;
    const dueOn = addIsoDays(todayIn(now, w.timeZone), RENEWAL_OFFSET);
    if (!isRenewalAnniversary(todayIn(w.outcomeAt, w.timeZone), dueOn)) continue;
    out.push({
      userId: w.userId,
      title: `${w.name} renewal is coming up`,
      dueOn,
      offset: RENEWAL_OFFSET,
      refType: "scholarship_application",
      refId: w.applicationId,
      dedupeKey: `renewal:${w.applicationId}:${dueOn.slice(0, 4)}`,
    });
  }
  return out;
}
```

`packages/core/src/plan/index.ts`:

```ts
export { listUpcomingDeadlines } from "./deadlines";
export { addPlanItem, getWeekPlan, replaceGeneratedPlan, requestWeeklyPlan, startWeeklyPlan, updatePlanItem } from "./items";
export { buildWeeklyDigest, findDueReminders } from "./notify";
export { getThisWeek } from "./week";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/plan`
Expected: PASS, 5 files, 21 tests (common 3, items 7, deadlines 3, week 3, notify 5).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plan
git commit -m "feat(core): weekly digest, deadline reminders, and the plan module index"
```

### H9: Conversations, rooms, messages, and sending

Rooms: `my_crew` and `temporary` always create a new room (temporary expires after 24 hours). `family` reopens the family's room or creates it, owned by the family's student. `scholarship`, `college`, and `essay` reopen the owner's room for that object or create it after checking the owner can read it. Parents read and write family rooms only, never a student's private rooms.

- [ ] **Step 1: Write the failing test**

`packages/core/src/crew/conversations.test.ts`:

```ts
import { messages } from "@scholarcrew/db";
import { actionReceipts, crewJobs, eq, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type ConversationInput, type CrewReply, type RoomKind, systemActor, userActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { NOW, makeDeps, makeParentOf, makeStateU, makeStudent } from "../plan/testkit";
import { CREW_SEND_LIMIT, createConversation, getMessages, listConversations, sendMessage } from "./conversations";
import { consumeRateLimit } from "../ratelimit";
import { completeJob, startJob } from "./jobs";

const SYSTEM = systemActor("test");
const room = (r: RoomKind, o: Partial<ConversationInput> = {}): ConversationInput => ({
  room: r,
  roomRefId: null,
  familyId: null,
  title: "",
  ...o,
});

describe("conversations", () => {
  it("pages the newest 50 messages and then the earlier 10", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    for (let index = 0; index < 60; index += 1) await deps.db.insert(messages).values({ conversationId: conv.id, authorKind: "user", authorUserId: user.id, body: `message ${index}`, createdAt: new Date(deps.clock.now().getTime() + index * 1000) });
    const latest = await getMessages(deps, actor, conv.id);
    expect(latest).toHaveLength(50);
    expect(latest[0]?.body).toBe("message 10");
    expect(await getMessages(deps, actor, conv.id, { before: latest[0]?.id })).toHaveLength(10);
  });

  it("answers a crisis before exhausted usage and a full send bucket", async () => {
    const { deps, jobs } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    for (let n = 0; n < 30; n += 1) await consumeRateLimit(deps, { key: "crew-send:" + user.id, ...CREW_SEND_LIMIT });
    await deps.db.insert(usageCounters).values({ userId: user.id, month: deps.clock.now().toISOString().slice(0, 7), crewRequests: 20, costMicros: 0 });
    const result = await sendMessage(deps, actor, conv.id, { body: "I want to kill myself" });
    expect(result.job).toMatchObject({ status: "ready", safety: "crisis" });
    expect((await getMessages(deps, actor, conv.id)).at(-1)?.body).toContain("988");
    expect(jobs.sent).toEqual([]);
    const [usage] = await deps.db.select().from(usageCounters).where(eq(usageCounters.userId, user.id));
    expect(usage?.crewRequests).toBe(20);
    await expect(sendMessage(deps, actor, conv.id, { body: "Plan my week" })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("creates private rooms and expires temporary chats after 24 hours", async () => {
    const { deps, clock } = makeDeps();
    const { actor } = await makeStudent(deps);
    const mine = await createConversation(deps, actor, room("my_crew"));
    expect(mine).toMatchObject({ room: "my_crew", title: "My Crew", expiresAt: null, lastMessageAt: null, familyId: null });
    const temp = await createConversation(deps, actor, room("temporary"));
    expect(temp).toMatchObject({ title: "Temporary chat", expiresAt: "2026-10-07T15:00:00.000Z" });
    expect((await listConversations(deps, actor)).map((c) => c.id).sort()).toEqual([mine.id, temp.id].sort());
    clock.set("2026-10-07T15:00:01.000Z");
    expect((await listConversations(deps, actor)).map((c) => c.id)).toEqual([mine.id]);
    await expect(getMessages(deps, actor, temp.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(sendMessage(deps, actor, temp.id, { body: "hi" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("sends a message as a queued crew request within the allowance", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await createConversation(deps, actor, room("my_crew"));
    const { message, job } = await sendMessage(deps, actor, conv.id, { body: "  What's due this week?  " });
    expect(message).toMatchObject({
      conversationId: conv.id,
      authorKind: "user",
      authorUserId: user.id,
      body: "What's due this week?",
      reply: null,
      appliedCardIds: [],
    });
    expect(job).toMatchObject({ kind: "crew_request", status: "queued", conversationId: conv.id, requestMessageId: message.id });
    expect(deps.jobs.sent).toEqual([{ name: "crew.request", payload: { jobId: job.id } }]);
    expect((await listConversations(deps, actor))[0]?.lastMessageAt).toBe(NOW);
    await expect(sendMessage(deps, actor, conv.id, { body: "   " })).rejects.toMatchObject({ code: "invalid_input" });
    await deps.db.insert(usageCounters).values({ userId: user.id, month: "2026-10", crewRequests: 20 });
    deps.jobs.clear();
    await expect(sendMessage(deps, actor, conv.id, { body: "One more?" })).rejects.toMatchObject({ code: "limit_reached" });
    expect(await getMessages(deps, actor, conv.id)).toHaveLength(1);
    expect(deps.jobs.sent).toEqual([]);
  });

  it("shares the family room with family members only", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { family, actor: parent } = await makeParentOf(deps, user.id);
    const outsider = userActor((await factories.parent(deps.db)).id, "parent");
    const familyRoom = await createConversation(deps, parent, room("family", { familyId: family.id }));
    expect(familyRoom).toMatchObject({ room: "family", familyId: family.id, title: "Family" });
    expect((await createConversation(deps, actor, room("family", { familyId: family.id }))).id).toBe(familyRoom.id);
    await expect(createConversation(deps, outsider, room("family", { familyId: family.id }))).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(createConversation(deps, actor, room("family"))).rejects.toMatchObject({ code: "invalid_input" });
    const { job } = await sendMessage(deps, parent, familyRoom.id, { body: "Can we afford State U?" });
    const [row] = await deps.db.select().from(crewJobs).where(eq(crewJobs.id, job.id));
    expect(row?.ownerId).toBe(user.id);
    expect(await getMessages(deps, actor, familyRoom.id)).toHaveLength(1);
    expect((await listConversations(deps, parent)).map((c) => c.id)).toEqual([familyRoom.id]);
    const mine = await createConversation(deps, actor, room("my_crew"));
    await expect(getMessages(deps, parent, mine.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(sendMessage(deps, parent, mine.id, { body: "hi" })).rejects.toMatchObject({ code: "not_found" });
    await expect(getMessages(deps, outsider, familyRoom.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("binds context rooms to objects the owner can read and reopens them", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { user: other } = await makeStudent(deps);
    const listing = await factories.scholarship(deps.db, { name: "Maple Rotary" });
    const byslug = await createConversation(deps, actor, room("scholarship", { roomRefId: listing.slug }));
    expect(byslug).toMatchObject({ room: "scholarship", roomRefId: listing.id, title: "Maple Rotary" });
    expect((await createConversation(deps, actor, room("scholarship", { roomRefId: listing.id }))).id).toBe(byslug.id);
    const college = await makeStateU(deps);
    expect((await createConversation(deps, actor, room("college", { roomRefId: college.id }))).title).toBe("State U");
    const theirs = await factories.essay(deps.db, other.id);
    await expect(createConversation(deps, actor, room("essay", { roomRefId: theirs.id }))).rejects.toMatchObject({
      code: "not_found",
    });
    const mine = await factories.essay(deps.db, user.id, { title: "Rotary essay" });
    expect((await createConversation(deps, actor, room("essay", { roomRefId: mine.id }))).title).toBe("Rotary essay");
    await expect(createConversation(deps, actor, room("college", { roomRefId: "999999" }))).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(createConversation(deps, actor, room("college"))).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("lists messages oldest first with applied card ids", async () => {
    const { deps, clock } = makeDeps();
    const { actor } = await makeStudent(deps);
    const conv = await createConversation(deps, actor, room("my_crew"));
    const { job } = await sendMessage(deps, actor, conv.id, { body: "What should I do first?" });
    clock.set("2026-10-06T15:01:00.000Z");
    const reply: CrewReply = {
      text: "Open your board first.",
      contributors: ["compass"],
      question: null,
      actionCards: [{ kind: "open_link", id: "open-board", label: "Open the board", href: "/scholarships" }],
      receipt: [],
      safety: null,
      needsInput: false,
    };
    const done = await finishTestJob(deps, SYSTEM, { jobId: job.id, reply, status: "ready" });
    await deps.db
      .insert(actionReceipts)
      .values({ ownerId: actor.userId, messageId: done.resultMessageId as string, cardId: "open-board" });
    const list = await getMessages(deps, actor, conv.id);
    expect(list.map((m) => [m.authorKind, m.appliedCardIds])).toEqual([
      ["user", []],
      ["crew", ["open-board"]],
    ]);
    expect(list[1]?.reply?.actionCards).toHaveLength(1);
  });
});
async function finishTestJob(deps: Parameters<typeof completeJob>[0], system: Parameters<typeof completeJob>[1], input: Omit<Parameters<typeof completeJob>[2], "leaseToken">) {
  const claim = await startJob(deps, system, input.jobId, { leaseSeconds: 1200 });
  const [row] = await deps.db.select({ leaseToken: crewJobs.leaseToken }).from(crewJobs).where(eq(crewJobs.id, input.jobId));
  return (await completeJob(deps, system, { ...input, leaseToken: claim?.leaseToken ?? row?.leaseToken ?? "00000000-0000-4000-8000-000000000099" })).job;
}

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/crew/conversations.test.ts`
Expected: FAIL with `Failed to resolve import "./conversations" from "src/crew/conversations.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/crew/conversations.ts`:

```ts
import {
  actionReceipts,
  and,
  asc,
  desc,
  colleges,
  conversations,
  crewJobs,
  eq,
  essays,
  familyMembers,
  gt,
  inArray,
  isNull,
  messages,
  ne,
  or,
  sql,
} from "@scholarcrew/db";
import {
  type Actor,
  CRISIS_REPLY,
  detectCrisis,
  type Conversation,
  ConversationInput,
  type CrewJob,
  type Message,
  type RoomKind,
  SendMessageInput,
  type UserActor,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertUser, familyIdsFor, getShareGrants } from "../access";
import { assertCrewAllowance } from "../billing";
import { consumeRateLimit } from "../ratelimit";
import { getScholarship } from "../scholarships";
import { type CoreDeps, one, requireUuid } from "../shared";
import { insertJob } from "./jobs";
import { type ConversationRow, toConversation, toCrewJob, toMessage } from "./mappers";

export const STALE_SHARE_TEXT = "This answer used something that's no longer shared.";
export const CREW_SEND_LIMIT = { limit: 30, windowSeconds: 600 };
const TEMPORARY_MS = 24 * 3_600_000;

const DEFAULT_TITLES: Record<RoomKind, string> = {
  my_crew: "My Crew",
  family: "Family",
  temporary: "Temporary chat",
  scholarship: "Scholarship",
  college: "College",
  essay: "Essay",
};

function isLive(row: ConversationRow, now: Date): boolean {
  return row.archivedAt === null && (row.expiresAt === null || row.expiresAt.getTime() > now.getTime());
}

/**
 * The conversation if `actor` may use it: any family member for a family room, otherwise only its owner.
 * Archived rooms and expired temporary chats are gone.
 */
export async function accessibleConversation(deps: CoreDeps, actor: UserActor, id: string): Promise<ConversationRow> {
  requireUuid(id, "Conversation not found");
  const [row] = await deps.db.select().from(conversations).where(eq(conversations.id, id));
  if (!row || !isLive(row, deps.clock.now())) throw notFound("Conversation not found");
  if (row.room === "family") {
    if (row.familyId && (await familyIdsFor(deps, actor.userId)).includes(row.familyId)) return row;
    throw notFound("Conversation not found");
  }
  if (row.ownerId !== actor.userId) throw notFound("Conversation not found");
  return row;
}

async function lastMessageTimes(deps: CoreDeps, ids: string[]): Promise<Map<string, Date>> {
  if (ids.length === 0) return new Map();
  const rows = await deps.db
    .select({
      conversationId: messages.conversationId,
      last: sql<Date>`max(${messages.createdAt})`.mapWith(messages.createdAt),
    })
    .from(messages)
    .where(inArray(messages.conversationId, ids))
    .groupBy(messages.conversationId);
  return new Map(rows.map((r) => [r.conversationId, r.last]));
}

async function withLast(deps: CoreDeps, row: ConversationRow): Promise<Conversation> {
  const times = await lastMessageTimes(deps, [row.id]);
  return toConversation(row, times.get(row.id) ?? null);
}

export async function listConversations(deps: CoreDeps, actor: Actor): Promise<Conversation[]> {
  assertUser(actor);
  const now = deps.clock.now();
  const familyIds = await familyIdsFor(deps, actor.userId);
  const mine = and(eq(conversations.ownerId, actor.userId), ne(conversations.room, "family"));
  const visible =
    familyIds.length > 0
      ? or(mine, and(eq(conversations.room, "family"), inArray(conversations.familyId, familyIds)))
      : mine;
  const rows = await deps.db
    .select()
    .from(conversations)
    .where(
      and(
        visible,
        isNull(conversations.archivedAt),
        or(isNull(conversations.expiresAt), gt(conversations.expiresAt, now)),
      ),
    );
  const times = await lastMessageTimes(
    deps,
    rows.map((r) => r.id),
  );
  const activity = (r: ConversationRow) => (times.get(r.id) ?? r.createdAt).getTime();
  return [...rows].sort((a, b) => activity(b) - activity(a)).map((r) => toConversation(r, times.get(r.id) ?? null));
}

async function roomTarget(
  deps: CoreDeps,
  actor: UserActor,
  room: RoomKind,
  ref: string,
): Promise<{ refId: string; title: string }> {
  if (room === "scholarship") {
    const listing = await getScholarship(deps, actor, ref);
    return { refId: listing.id, title: listing.name };
  }
  if (room === "college") {
    const [college] = await deps.db
      .select({ id: colleges.id, name: colleges.name })
      .from(colleges)
      .where(eq(colleges.id, ref));
    if (!college) throw notFound("College not found");
    return { refId: college.id, title: college.name };
  }
  requireUuid(ref, "Essay not found");
  const [essay] = await deps.db
    .select({ id: essays.id, title: essays.title })
    .from(essays)
    .where(and(eq(essays.id, ref), eq(essays.ownerId, actor.userId)));
  if (!essay) throw notFound("Essay not found");
  return { refId: essay.id, title: essay.title };
}

export async function createConversation(deps: CoreDeps, actor: Actor, i: ConversationInput): Promise<Conversation> {
  assertUser(actor);
  const parsed = ConversationInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the room and try again", parsed.error.issues);
  const v = parsed.data;
  const now = deps.clock.now();
  const insert = async (values: {
    ownerId: string;
    title: string;
    roomRefId?: string | null;
    familyId?: string | null;
    expiresAt?: Date | null;
  }): Promise<Conversation> => {
    const row = one(
      await deps.db
        .insert(conversations)
        .values({ room: v.room, createdAt: now, ...values })
        .returning(),
      "conversations insert",
    );
    return toConversation(row, null);
  };

  if (v.room === "my_crew") {
    return insert({ ownerId: actor.userId, title: v.title || DEFAULT_TITLES.my_crew });
  }
  if (v.room === "temporary") {
    return insert({
      ownerId: actor.userId,
      title: v.title || DEFAULT_TITLES.temporary,
      expiresAt: new Date(now.getTime() + TEMPORARY_MS),
    });
  }
  if (v.room === "family") {
    const familyId = v.familyId;
    if (!familyId) throw invalidInput("Pick the family for this room");
    if (!(await familyIdsFor(deps, actor.userId)).includes(familyId)) throw notFound("Family not found");
    const [student] = await deps.db
      .select({ userId: familyMembers.userId })
      .from(familyMembers)
      .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.memberRole, "student")))
      .orderBy(asc(familyMembers.joinedAt))
      .limit(1);
    if (!student) throw invalidInput("This family has no student yet");
    const [existing] = await deps.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.room, "family"), eq(conversations.familyId, familyId), isNull(conversations.archivedAt)))
      .orderBy(asc(conversations.createdAt))
      .limit(1);
    if (existing) return withLast(deps, existing);
    return insert({ ownerId: student.userId, familyId, title: v.title || DEFAULT_TITLES.family });
  }

  if (!v.roomRefId) throw invalidInput("Pick what this room is about");
  const target = await roomTarget(deps, actor, v.room, v.roomRefId);
  const [existing] = await deps.db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.ownerId, actor.userId),
        eq(conversations.room, v.room),
        eq(conversations.roomRefId, target.refId),
        isNull(conversations.archivedAt),
      ),
    )
    .orderBy(asc(conversations.createdAt))
    .limit(1);
  if (existing) return withLast(deps, existing);
  return insert({ ownerId: actor.userId, roomRefId: target.refId, title: v.title || target.title });
}

export async function getMessages(deps: CoreDeps, actor: Actor, conversationId: string, o: { before?: string; limit?: number } = {}): Promise<Message[]> {
  assertUser(actor);
  const conv = await accessibleConversation(deps, actor, conversationId);
  const limit = Math.min(100, Math.max(1, o.limit ?? 50));
  if (!Number.isInteger(limit)) throw invalidInput("Choose a whole message limit");
  const [before] = o.before ? await deps.db.select().from(messages).where(and(eq(messages.id, o.before), eq(messages.conversationId, conv.id))).limit(1) : [];
  if (o.before && !before) throw notFound("Message not found");
  const older = before ? sql`(${messages.createdAt}, ${messages.id}) < (${before.createdAt}, ${before.id})` : undefined;
  const grants = actor.userId === conv.ownerId ? null : await getShareGrants(deps, conv.ownerId, actor.userId);
  const rows = await deps.db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conv.id), older))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);
  if (rows.length === 0) return [];
  const receipts = await deps.db
    .select({ messageId: actionReceipts.messageId, cardId: actionReceipts.cardId })
    .from(actionReceipts)
    .where(
      inArray(
        actionReceipts.messageId,
        rows.map((r) => r.id),
      ),
    );
  return rows.reverse().map((r) => {
    const stale = grants !== null && r.authorKind === "crew" && (r.sharedCategories ?? []).some((category) => !grants.includes(category));
    const shown = stale ? { ...r, body: STALE_SHARE_TEXT, reply: { ...CRISIS_REPLY, text: STALE_SHARE_TEXT, safety: null, actionCards: [], receipt: [] } } : r;
    return toMessage(
      shown,
      receipts.filter((x) => x.messageId === r.id).map((x) => x.cardId),
    );
  });
}

/** Stores the user's message and queues a crew request charged to the room owner's allowance. */
export async function sendMessage(
  deps: CoreDeps,
  actor: Actor,
  conversationId: string,
  i: SendMessageInput,
): Promise<{ message: Message; job: CrewJob }> {
  assertUser(actor);
  const conv = await accessibleConversation(deps, actor, conversationId);
  const parsed = SendMessageInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Type a message first", parsed.error.issues);
  const now = deps.clock.now();
  if (detectCrisis(parsed.data.body)) {
    const result = await deps.db.transaction(async (tx) => {
      const request = one(await tx.insert(messages).values({ conversationId: conv.id, authorKind: "user", authorUserId: actor.userId, body: parsed.data.body, createdAt: now }).returning(), "crisis request insert");
      const answer = one(await tx.insert(messages).values({ conversationId: conv.id, authorKind: "crew", authorUserId: null, body: CRISIS_REPLY.text, reply: CRISIS_REPLY, createdAt: now }).returning(), "crisis reply insert");
      const row = one(await tx.insert(crewJobs).values({ ownerId: conv.ownerId, kind: "crew_request", status: "ready", conversationId: conv.id, requestMessageId: request.id, resultMessageId: answer.id, safety: "crisis", costMicros: 0, usageMonth: now.toISOString().slice(0, 7), createdAt: now, updatedAt: now }).returning(), "crisis job insert");
      return { message: toMessage(request, []), job: toCrewJob(row) };
    });
    console.log(JSON.stringify({ level: "info", msg: "crew.crisis", jobId: result.job.id }));
    return result;
  }
  await consumeRateLimit(deps, { key: "crew-send:" + actor.userId, ...CREW_SEND_LIMIT });
  const { message, job } = await deps.db.transaction(async (tx) => {
    await assertCrewAllowance(deps, conv.ownerId, tx);
    const row = one(
      await tx
        .insert(messages)
        .values({ conversationId: conv.id, authorKind: "user", authorUserId: actor.userId, body: parsed.data.body, createdAt: now })
        .returning(),
      "messages insert",
    );
    const created = await insertJob(tx, {
      ownerId: conv.ownerId,
      kind: "crew_request",
      conversationId: conv.id,
      requestMessageId: row.id,
      now,
    });
    return { message: row, job: created };
  });
  await deps.jobs.enqueue("crew.request", { jobId: job.id });
  return { message: toMessage(message, []), job };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/crew/conversations.test.ts`
Expected: PASS, 1 file, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/crew/conversations.ts packages/core/src/crew/conversations.test.ts
git commit -m "feat(core): crew rooms, family rooms, context rooms, and message sending"
```

### H10: Action cards and the crew index

A card applies once. The receipt row (unique on message and card) is the idempotency key, and it's claimed before the card runs (R2C-3): the apply inserts a `{ pending: true }` receipt with conflict-do-nothing, runs the card only when that insert wins, then writes the result. A losing apply returns the finished receipt, returns a claim older than `STALE_CLAIM_MS` (60 s) as-is, or throws `conflict` while the first apply is still running. A card that throws drops its claim so it can be retried. In a family room only the student applies cards other than `open_link`; anyone else gets `not_found`. In a temporary room `confirm_fact` and `record_decision` are refused with `invalid_input` (R2C-9). A `record_decision` card stores the message id as `decisions.sourceMessageId` (R2I-12).

- [ ] **Step 1: Write the failing test**

`packages/core/src/crew/actions.test.ts`:

```ts
import {
  actionReceipts,
  and,
  collegeList,
  decisions,
  eq,
  essays,
  isNull,
  memoryFacts,
  messages,
  planItems,
  scholarshipApplications,
} from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type ActionCard, type CrewReply, systemActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { createCandidate, listFacts } from "../memory";
import { WEEK, makeDeps, makeParentOf, makeStateU, makeStudent } from "../plan/testkit";
import { applyActionCard, getMessages } from "./index";

type Deps = ReturnType<typeof makeDeps>["deps"];

async function crewMessage(deps: Deps, conversationId: string, cards: ActionCard[]) {
  const reply: CrewReply = {
    text: "Here's what I'd do.",
    contributors: ["compass"],
    question: null,
    actionCards: cards,
    receipt: [],
    safety: null,
    needsInput: false,
  };
  const [row] = await deps.db.insert(messages).values({ conversationId, authorKind: "crew", body: reply.text, reply }).returning();
  if (!row) throw new Error("message insert failed");
  return row;
}

const planCard: ActionCard = {
  kind: "add_plan_item",
  id: "hill-country",
  label: "Add to my weekend",
  item: {
    title: "Hill Country STEM Award",
    kind: "scholarship",
    refType: "scholarship",
    refId: null,
    minutes: 30,
    valueUsd: 1000,
    dueOn: "2026-10-15",
    contributors: ["scout"],
    weekStart: null,
  },
};
const linkCard: ActionCard = { kind: "open_link", id: "open-board", label: "Open the board", href: "/scholarships" };

describe("applyActionCard", () => {
  it("applies a card once and returns the same receipt after that", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const msg = await crewMessage(deps, conv.id, [planCard, linkCard]);
    const first = await applyActionCard(deps, actor, { messageId: msg.id, cardId: "hill-country" });
    const second = await applyActionCard(deps, actor, { messageId: msg.id, cardId: "hill-country" });
    expect(second).toEqual(first);
    expect(first).toMatchObject({ messageId: msg.id, cardId: "hill-country", result: { planItemId: expect.any(String) } });
    const items = await deps.db.select().from(planItems).where(eq(planItems.ownerId, user.id));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ weekStart: WEEK, title: "Hill Country STEM Award", contributors: ["scout"] });
    const shown = await getMessages(deps, actor, conv.id);
    expect(shown[0]?.appliedCardIds).toEqual(["hill-country"]);
  });

  it("saves scholarships, adds colleges, starts essays, records decisions, and confirms facts", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const listing = await factories.scholarship(deps.db, { name: "Maple Rotary" });
    const college = await makeStateU(deps);
    const msg = await crewMessage(deps, conv.id, [
      { kind: "save_scholarship", id: "save-rotary", label: "Save it", scholarshipId: listing.id },
      { kind: "add_college", id: "add-state-u", label: "Add State U", collegeId: college.id, fit: "target", plan: "EA" },
      {
        kind: "start_essay",
        id: "start-essay",
        label: "Start the essay",
        essay: {
          title: "Rotary essay",
          prompt: "Describe a time you served your community.",
          wordLimit: 500,
          charLimit: null,
          targetType: "scholarship",
          targetCollegeId: null,
          targetScholarshipId: listing.id,
        },
      },
      { kind: "record_decision", id: "decide", label: "Remember this", decision: { summary: "Apply EA to State U", rationale: "Merit deadline" } },
    ]);
    const more = await crewMessage(deps, conv.id, [
      {
        kind: "confirm_fact",
        id: "fact-major",
        label: "Yes, remember that",
        fact: { key: "intended_major", value: "mechanical engineering", visibility: "crew", source: "user_stated", sourceRef: null },
      },
      { kind: "add_college", id: "add-again", label: "Add State U", collegeId: college.id, fit: "reach", plan: "RD" },
    ]);
    for (const cardId of ["save-rotary", "add-state-u", "start-essay", "decide"]) {
      await applyActionCard(deps, actor, { messageId: msg.id, cardId });
    }
    const [app] = await deps.db.select().from(scholarshipApplications).where(eq(scholarshipApplications.ownerId, user.id));
    expect(app).toMatchObject({ scholarshipId: listing.id, stage: "planned" });
    expect(await deps.db.select().from(collegeList).where(eq(collegeList.ownerId, user.id))).toHaveLength(1);
    const [essay] = await deps.db.select().from(essays).where(eq(essays.ownerId, user.id));
    expect(essay?.title).toBe("Rotary essay");
    const [decision] = await deps.db.select().from(decisions).where(eq(decisions.ownerId, user.id));
    expect(decision?.summary).toBe("Apply EA to State U");
    // R2I-12: the decision links back to the chat message that proposed it.
    expect(decision?.sourceMessageId).toBe(msg.id);
    await applyActionCard(deps, actor, { messageId: more.id, cardId: "fact-major" });
    const [fact] = await deps.db.select().from(memoryFacts).where(eq(memoryFacts.ownerId, user.id));
    expect(fact).toMatchObject({ key: "intended_major", value: "mechanical engineering" });
    const again = await applyActionCard(deps, actor, { messageId: more.id, cardId: "add-again" });
    expect(again.result).toEqual({ collegeId: college.id, alreadyListed: true });
  });

  it("hides unknown cards, user messages, and other students' messages", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { actor: other } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const msg = await crewMessage(deps, conv.id, [planCard]);
    const [mine] = await deps.db
      .insert(messages)
      .values({ conversationId: conv.id, authorKind: "user", authorUserId: user.id, body: "hi" })
      .returning();
    await expect(applyActionCard(deps, actor, { messageId: msg.id, cardId: "nope" })).rejects.toMatchObject({ code: "not_found" });
    await expect(applyActionCard(deps, actor, { messageId: mine?.id as string, cardId: "hill-country" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(applyActionCard(deps, other, { messageId: msg.id, cardId: "hill-country" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(applyActionCard(deps, actor, { messageId: msg.id, cardId: "Bad Id!" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("lets only the student apply family-room cards other than links", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { family, actor: parent } = await makeParentOf(deps, user.id);
    const room = await factories.conversation(deps.db, user.id, { room: "family", familyId: family.id });
    const msg = await crewMessage(deps, room.id, [planCard, linkCard]);
    await expect(applyActionCard(deps, parent, { messageId: msg.id, cardId: "hill-country" })).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await applyActionCard(deps, parent, { messageId: msg.id, cardId: "open-board" })).result).toEqual({
      href: "/scholarships",
    });
    expect((await applyActionCard(deps, actor, { messageId: msg.id, cardId: "hill-country" })).cardId).toBe("hill-country");
    expect(await deps.db.select().from(planItems).where(eq(planItems.ownerId, user.id))).toHaveLength(1);
  });

  it("claims the receipt first, so concurrent applies run the card once (R2C-3)", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const msg = await crewMessage(deps, conv.id, [planCard]);
    const input = { messageId: msg.id, cardId: "hill-country" };
    const results = await Promise.allSettled([applyActionCard(deps, actor, input), applyActionCard(deps, actor, input)]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "conflict" });
      else expect(r.value.result).toMatchObject({ planItemId: expect.any(String) });
    }
    expect(await deps.db.select().from(planItems).where(eq(planItems.ownerId, user.id))).toHaveLength(1);
    expect(await deps.db.select().from(actionReceipts).where(eq(actionReceipts.messageId, msg.id))).toHaveLength(1);
  });

  it("reports a fresh claim as a conflict, returns a stale one, and drops the claim when a card fails", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const missing: ActionCard = {
      kind: "save_scholarship",
      id: "save-missing",
      label: "Save it",
      scholarshipId: "00000000-0000-4000-8000-000000000000",
    };
    const msg = await crewMessage(deps, conv.id, [planCard, missing]);
    await expect(applyActionCard(deps, actor, { messageId: msg.id, cardId: "save-missing" })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await deps.db.select().from(actionReceipts).where(eq(actionReceipts.messageId, msg.id))).toEqual([]);
    const now = deps.clock.now();
    await deps.db
      .insert(actionReceipts)
      .values({ ownerId: user.id, messageId: msg.id, cardId: "hill-country", appliedAt: now, result: { pending: true } });
    await expect(applyActionCard(deps, actor, { messageId: msg.id, cardId: "hill-country" })).rejects.toMatchObject({
      code: "conflict",
    });
    await deps.db
      .update(actionReceipts)
      .set({ appliedAt: new Date(now.getTime() - 61_000) })
      .where(eq(actionReceipts.messageId, msg.id));
    expect((await applyActionCard(deps, actor, { messageId: msg.id, cardId: "hill-country" })).result).toEqual({
      pending: true,
    });
    expect(await deps.db.select().from(planItems).where(eq(planItems.ownerId, user.id))).toEqual([]);
  });

  it("refuses fact and decision cards in a temporary chat (R2C-9)", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const temp = await factories.conversation(deps.db, user.id, {
      room: "temporary",
      expiresAt: new Date(deps.clock.now().getTime() + 86_400_000),
    });
    const msg = await crewMessage(deps, temp.id, [
      planCard,
      { kind: "record_decision", id: "decide", label: "Remember this", decision: { summary: "Apply EA", rationale: "" } },
      {
        kind: "confirm_fact",
        id: "fact-major",
        label: "Yes, remember that",
        fact: { key: "intended_major", value: "nursing", visibility: "crew", source: "user_stated", sourceRef: null },
      },
    ]);
    for (const cardId of ["decide", "fact-major"]) {
      await expect(applyActionCard(deps, actor, { messageId: msg.id, cardId })).rejects.toMatchObject({
        code: "invalid_input",
        message: "Temporary chats don't save memory",
      });
    }
    expect(await deps.db.select().from(decisions).where(eq(decisions.ownerId, user.id))).toEqual([]);
    expect(await deps.db.select().from(memoryFacts).where(eq(memoryFacts.ownerId, user.id))).toEqual([]);
    expect(await deps.db.select().from(actionReceipts).where(eq(actionReceipts.messageId, msg.id))).toEqual([]);
    expect((await applyActionCard(deps, actor, { messageId: msg.id, cardId: "hill-country" })).cardId).toBe("hill-country");
  });

  it("clears the matching memory candidate when a confirm_fact card is applied (R2C-2)", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const fact = { key: "intended_major", value: "mechanical engineering", visibility: "crew" as const, sourceRef: null };
    await createCandidate(deps, systemActor("test"), user.id, { ...fact, source: "crew_inferred" });
    const msg = await crewMessage(deps, conv.id, [
      { kind: "confirm_fact", id: "fact-major", label: "Yes, remember that", fact: { ...fact, source: "user_stated" } },
    ]);
    await applyActionCard(deps, actor, { messageId: msg.id, cardId: "fact-major" });
    const live = await deps.db
      .select()
      .from(memoryFacts)
      .where(and(eq(memoryFacts.ownerId, user.id), eq(memoryFacts.status, "candidate"), isNull(memoryFacts.supersededById)));
    expect(live).toEqual([]);
    expect((await listFacts(deps, actor, user.id)).map((f) => f.status)).toEqual(["confirmed"]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/crew/actions.test.ts`
Expected: FAIL with `Failed to resolve import "./index" from "src/crew/actions.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/crew/actions.ts`:

```ts
import { actionReceipts, and, eq, messages } from "@scholarcrew/db";
import {
  type ActionCard,
  type ActionReceipt,
  type Actor,
  AppError,
  ApplyActionInput,
  type UserActor,
  conflict,
  invalidInput,
  isAppError,
  notFound,
} from "@scholarcrew/domain";
import { assertUser } from "../access";
import { addCollege } from "../colleges";
import { createEssay } from "../essays";
import { createFact, recordDecision } from "../memory";
import { addPlanItem } from "../plan/items";
import { saveScholarship } from "../scholarships";
import { type CoreDeps, one } from "../shared";
import { accessibleConversation } from "./conversations";
import { toReceipt } from "./mappers";

/** The receipt's result while the card runs. `getMessages.appliedCardIds` treats a pending claim as applied. */
const PENDING_RESULT = { pending: true } as const;
/** A claim older than this is a crashed apply; it's returned as-is instead of blocking forever. */
const STALE_CLAIM_MS = 60_000;

async function receiptFor(deps: CoreDeps, messageId: string, cardId: string) {
  const [row] = await deps.db
    .select()
    .from(actionReceipts)
    .where(and(eq(actionReceipts.messageId, messageId), eq(actionReceipts.cardId, cardId)));
  return row;
}

/** Runs the card as the student. Every write goes through the owning module's service. */
async function runCard(
  deps: CoreDeps,
  actor: UserActor,
  card: ActionCard,
  messageId: string,
): Promise<Record<string, unknown>> {
  switch (card.kind) {
    case "add_plan_item": {
      const item = await addPlanItem(deps, actor, card.item);
      return { planItemId: item.id };
    }
    case "save_scholarship": {
      const app = await saveScholarship(deps, actor, { scholarshipId: card.scholarshipId });
      return { applicationId: app.id };
    }
    case "add_college": {
      try {
        const entry = await addCollege(deps, actor, { collegeId: card.collegeId, fit: card.fit, plan: card.plan });
        return { collegeListId: entry.id };
      } catch (e) {
        if (isAppError(e) && e.code === "conflict") return { collegeId: card.collegeId, alreadyListed: true };
        throw e;
      }
    }
    case "start_essay": {
      const essay = await createEssay(deps, actor, card.essay);
      return { essayId: essay.id };
    }
    case "open_link":
      return { href: card.href };
    case "record_decision": {
      // R2I-12: keep the link back to the chat message that proposed it.
      const decision = await recordDecision(deps, actor, card.decision, messageId);
      return { decisionId: decision.id };
    }
    case "confirm_fact": {
      const fact = await createFact(deps, actor, card.fact);
      return { factId: fact.id };
    }
  }
}

export async function applyActionCard(deps: CoreDeps, actor: Actor, i: ApplyActionInput): Promise<ActionReceipt> {
  assertUser(actor);
  const parsed = ApplyActionInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the action and try again", parsed.error.issues);
  const { messageId, cardId } = parsed.data;
  const [message] = await deps.db.select().from(messages).where(eq(messages.id, messageId));
  if (!message || message.authorKind !== "crew" || !message.reply) throw notFound("Action not found");
  const conv = await accessibleConversation(deps, actor, message.conversationId);
  const card = message.reply.actionCards.find((c) => c.id === cardId);
  if (!card) throw notFound("Action not found");
  if (conv.room === "family" && card.kind !== "open_link" && conv.ownerId !== actor.userId) {
    throw notFound("Action not found");
  }
  // R2C-9 (CR-07): a temporary chat remembers nothing, even when the model proposed it.
  if (conv.room === "temporary" && (card.kind === "confirm_fact" || card.kind === "record_decision")) {
    throw invalidInput("Temporary chats don't save memory");
  }
  // R2C-3: claim the receipt before running the card, so two tabs or a client retry can't both run it.
  const [claim] = await deps.db
    .insert(actionReceipts)
    .values({ ownerId: conv.ownerId, messageId, cardId, appliedAt: deps.clock.now(), result: PENDING_RESULT })
    .onConflictDoNothing({ target: [actionReceipts.messageId, actionReceipts.cardId] })
    .returning();
  if (!claim) {
    const existing = await receiptFor(deps, messageId, cardId);
    if (!existing) throw new AppError("internal", "Action receipt missing after claim");
    const stale = deps.clock.now().getTime() - existing.appliedAt.getTime() > STALE_CLAIM_MS;
    if (existing.result.pending !== true || stale) return toReceipt(existing);
    throw conflict("This action is still being applied");
  }
  let result: Record<string, unknown>;
  try {
    result = await runCard(deps, actor, card, messageId);
  } catch (e) {
    await deps.db.delete(actionReceipts).where(eq(actionReceipts.id, claim.id));
    throw e;
  }
  const done = one(
    await deps.db.update(actionReceipts).set({ result }).where(eq(actionReceipts.id, claim.id)).returning(),
    "action_receipts update",
  );
  return toReceipt(done);
}
```

`packages/core/src/crew/index.ts`:

```ts
export { applyActionCard } from "./actions";
export { createConversation, getMessages, listConversations, sendMessage } from "./conversations";
export { appendProgress, completeJob, createJob, getJob, listJobs, recordAgentRun, reapStaleJobs, releaseJob, startJob } from "./jobs";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/crew`
Expected: PASS, 3 files, 25 tests (jobs 11, conversations 5, actions 9).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/crew
git commit -m "feat(core): idempotent action cards and the crew module index"
```

### H11: Admin review queue, scholarship editor, and reports

- [ ] **Step 1: Write the failing test**

`packages/core/src/admin/catalog.test.ts`:

```ts
import { auditEvents, catalogReports, eq, scholarships } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type ScholarshipUpsertInput, systemActor, userActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { NOW, makeDeps, makeStudent } from "../plan/testkit";
import {
  createCatalogTask,
  getCatalogTask,
  getScholarshipForAdmin,
  listCatalogTasks,
  listReports,
  listScholarships,
  resolveCatalogTask,
  resolveReport,
  setScholarshipStatus,
  upsertScholarship,
} from "./catalog";

const SYSTEM = systemActor("test");

const upsertInput = (o: Partial<ScholarshipUpsertInput> = {}): ScholarshipUpsertInput => ({
  id: null,
  slug: "maple-rotary-stem",
  name: "Maple Rotary STEM Award",
  provider: "Rotary Club of Maple",
  url: "https://example.org/rotary",
  sourceUrl: "https://example.org/rotary",
  amountMinUsd: 2500,
  amountMaxUsd: 2500,
  renewable: false,
  renewalTerms: "",
  deadline: "2026-10-30",
  cycle: "2026-27",
  localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
  eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
  requirements: { essays: [], recommendations: 0, transcript: false, serviceHours: null, other: [] },
  estMinutes: 45,
  scamFlags: [],
  ...o,
});

async function admin() {
  const { deps } = makeDeps();
  const row = await factories.admin(deps.db);
  return { deps, admin: row, actor: userActor(row.id, "admin") };
}

describe("admin catalog", () => {
  it("denies non-admins", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    await expect(listCatalogTasks(deps, actor, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(upsertScholarship(deps, actor, upsertInput())).rejects.toMatchObject({ code: "forbidden" });
    await expect(listReports(deps, actor)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      createCatalogTask(deps, actor, { kind: "import", payload: { type: "import", summary: "x" } }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("queues tasks and publishes the listing when a task resolves", async () => {
    const { deps, admin: me, actor } = await admin();
    const { user } = await makeStudent(deps);
    const draft = await factories.scholarship(deps.db, {
      status: "draft",
      visibility: "submitter_only",
      verifiedAt: null,
      submittedById: user.id,
    });
    const task = await createCatalogTask(deps, SYSTEM, {
      kind: "user_submission",
      scholarshipId: draft.id,
      createdById: user.id,
      payload: { type: "user_submission", url: draft.url, name: draft.name, notes: "", submittedById: user.id },
    });
    await createCatalogTask(deps, SYSTEM, { kind: "import", payload: { type: "import", summary: "Imported 12 colleges" } });
    await expect(
      createCatalogTask(deps, SYSTEM, { kind: "report", payload: { type: "import", summary: "x" } }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect((await listCatalogTasks(deps, actor, { kind: "user_submission" })).map((t) => t.id)).toEqual([task.id]);
    expect(await listCatalogTasks(deps, actor, { status: "open" })).toHaveLength(2);
    const resolved = await resolveCatalogTask(deps, actor, task.id, {
      status: "resolved",
      note: "Checked the source page",
      publishScholarshipId: draft.id,
    });
    expect(resolved).toMatchObject({ status: "resolved", resolvedById: me.id, resolutionNote: "Checked the source page", resolvedAt: NOW });
    const [listing] = await deps.db.select().from(scholarships).where(eq(scholarships.id, draft.id));
    expect(listing).toMatchObject({ status: "published", visibility: "public", verifiedById: me.id });
    expect(listing?.verifiedAt?.toISOString()).toBe(NOW);
    await expect(
      resolveCatalogTask(deps, actor, task.id, { status: "rejected", note: "again", publishScholarshipId: null }),
    ).rejects.toMatchObject({ code: "conflict" });
    const audit = await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "catalog_task_resolved"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: me.id, entityId: task.id });
  });

  it("republishes a stale listing when its re-check is rejected, and leaves other kinds alone (R2C-7)", async () => {
    const { deps, admin: me, actor } = await admin();
    const stale = await factories.scholarship(deps.db, { status: "stale", verifiedAt: new Date("2026-01-01T00:00:00.000Z") });
    const recheck = (scholarshipId: string) =>
      createCatalogTask(deps, SYSTEM, {
        kind: "recheck_changed",
        scholarshipId,
        payload: { type: "recheck_changed", url: stale.url, before: null, after: null, report: null },
      });
    const task = await recheck(stale.id);
    await resolveCatalogTask(deps, actor, task.id, { status: "rejected", note: "Change doesn't matter", publishScholarshipId: null });
    const [kept] = await deps.db.select().from(scholarships).where(eq(scholarships.id, stale.id));
    expect(kept).toMatchObject({ status: "published", verifiedById: me.id });
    expect(kept?.verifiedAt?.toISOString()).toBe(NOW);
    const retired = await factories.scholarship(deps.db, { status: "retired" });
    await resolveCatalogTask(deps, actor, (await recheck(retired.id)).id, {
      status: "rejected",
      note: "Already retired",
      publishScholarshipId: null,
    });
    expect((await deps.db.select().from(scholarships).where(eq(scholarships.id, retired.id)))[0]?.status).toBe("retired");
    const other = await factories.scholarship(deps.db, { status: "stale" });
    const importTask = await createCatalogTask(deps, SYSTEM, {
      kind: "import",
      scholarshipId: other.id,
      payload: { type: "import", summary: "x" },
    });
    await resolveCatalogTask(deps, actor, importTask.id, { status: "rejected", note: "No", publishScholarshipId: null });
    expect((await deps.db.select().from(scholarships).where(eq(scholarships.id, other.id)))[0]?.status).toBe("stale");
  });

  it("creates and edits listings and sets their status", async () => {
    const { deps, admin: me, actor } = await admin();
    const created = await upsertScholarship(deps, actor, upsertInput());
    expect(created).toMatchObject({ slug: "maple-rotary-stem", status: "draft", visibility: "public", verifiedAt: null });
    const edited = await upsertScholarship(deps, actor, upsertInput({ id: created.id, amountMaxUsd: 3000 }));
    expect(edited).toMatchObject({ id: created.id, amountMaxUsd: 3000 });
    await expect(upsertScholarship(deps, actor, upsertInput())).rejects.toMatchObject({ code: "conflict" });
    await expect(
      upsertScholarship(deps, actor, upsertInput({ id: "00000000-0000-4000-8000-000000000000", slug: "other-slug" })),
    ).rejects.toMatchObject({ code: "not_found" });
    const published = await setScholarshipStatus(deps, actor, created.id, "published", "Verified with the club");
    expect(published).toMatchObject({ status: "published", verifiedAt: NOW });
    const [row] = await deps.db.select().from(scholarships).where(eq(scholarships.id, created.id));
    expect(row?.verifiedById).toBe(me.id);
    expect((await setScholarshipStatus(deps, actor, created.id, "retired")).status).toBe("retired");
    const actions = (await deps.db.select().from(auditEvents)).map((e) => e.action).sort();
    expect(actions).toEqual(["scholarship_created", "scholarship_status_set", "scholarship_status_set", "scholarship_updated"]);
  });

  it("lists reports with names and resolves the report and its task", async () => {
    const { deps, actor } = await admin();
    const { user } = await makeStudent(deps);
    const listing = await factories.scholarship(deps.db, { name: "Maple Rotary" });
    const [report] = await deps.db
      .insert(catalogReports)
      .values({ scholarshipId: listing.id, reporterId: user.id, reason: "wrong_deadline", details: "It's Oct 30" })
      .returning();
    if (!report) throw new Error("report insert failed");
    const task = await createCatalogTask(deps, SYSTEM, {
      kind: "report",
      scholarshipId: listing.id,
      payload: { type: "report", reportId: report.id, reason: "wrong_deadline", details: "It's Oct 30" },
    });
    expect((await listReports(deps, actor, "open")).map((r) => [r.scholarshipName, r.reason])).toEqual([
      ["Maple Rotary", "wrong_deadline"],
    ]);
    const resolved = await resolveReport(deps, actor, report.id, { status: "resolved", note: "Deadline fixed" });
    expect(resolved).toMatchObject({ status: "resolved", resolvedAt: NOW, scholarshipName: "Maple Rotary" });
    expect(await listReports(deps, actor, "open")).toEqual([]);
    const [closed] = await listCatalogTasks(deps, actor, { kind: "report" });
    expect(closed).toMatchObject({ id: task.id, status: "resolved", resolutionNote: "Deadline fixed" });
    await expect(resolveReport(deps, actor, report.id, { status: "rejected", note: "x" })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("reads one listing in any status, pages listings with filters, and reads one task (D36)", async () => {
    const { deps, actor } = await admin();
    const { actor: student } = await makeStudent(deps);
    const draft = await factories.scholarship(deps.db, {
      name: "Maple Rotary Draft",
      status: "draft",
      visibility: "submitter_only",
    });
    await factories.scholarship(deps.db, { name: "Hill Country STEM", provider: "Hill Country Fund" });
    await factories.scholarship(deps.db, { name: "Retired Award", status: "retired" });
    expect(await getScholarshipForAdmin(deps, actor, draft.id)).toMatchObject({
      id: draft.id,
      status: "draft",
      visibility: "submitter_only",
    });
    await expect(
      getScholarshipForAdmin(deps, actor, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await listScholarships(deps, actor, { page: 1 })).toMatchObject({ page: 1, pageSize: 50, total: 3 });
    expect((await listScholarships(deps, actor, { status: "draft", page: 1 })).items.map((s) => s.id)).toEqual([draft.id]);
    const byProvider = await listScholarships(deps, actor, { q: "hill country fund", page: 1 });
    expect(byProvider.items.map((s) => s.name)).toEqual(["Hill Country STEM"]);
    expect((await listScholarships(deps, actor, { page: 2 })).items).toEqual([]);
    await expect(listScholarships(deps, actor, { page: 0 })).rejects.toMatchObject({ code: "invalid_input" });
    const task = await createCatalogTask(deps, SYSTEM, { kind: "import", payload: { type: "import", summary: "Imported 12 colleges" } });
    expect(await getCatalogTask(deps, actor, task.id)).toEqual(task);
    await expect(getCatalogTask(deps, actor, "nope")).rejects.toMatchObject({ code: "not_found" });
    await expect(getScholarshipForAdmin(deps, student, draft.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(listScholarships(deps, student, { page: 1 })).rejects.toMatchObject({ code: "forbidden" });
    await expect(getCatalogTask(deps, student, task.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/admin/catalog.test.ts`
Expected: FAIL with `Failed to resolve import "./catalog" from "src/admin/catalog.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/admin/mappers.ts`:

```ts
import type { auditEvents, catalogReports, catalogTasks, scholarships } from "@scholarcrew/db";
import type { AuditEvent, CatalogReport, CatalogTask, Scholarship } from "@scholarcrew/domain";
import { toIso, toIsoOrNull } from "../shared";

export function toScholarship(row: typeof scholarships.$inferSelect): Scholarship {
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
    submittedById: row.submittedById,
    scamFlags: row.scamFlags,
    estMinutes: row.estMinutes,
    verifiedAt: toIsoOrNull(row.verifiedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toCatalogTask(row: typeof catalogTasks.$inferSelect): CatalogTask {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    scholarshipId: row.scholarshipId,
    payload: row.payload,
    createdById: row.createdById,
    resolvedById: row.resolvedById,
    resolutionNote: row.resolutionNote,
    createdAt: toIso(row.createdAt),
    resolvedAt: toIsoOrNull(row.resolvedAt),
  };
}

export function toReport(row: typeof catalogReports.$inferSelect, scholarshipName: string): CatalogReport {
  return {
    id: row.id,
    scholarshipId: row.scholarshipId,
    scholarshipName,
    reporterId: row.reporterId,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: toIso(row.createdAt),
    resolvedAt: toIsoOrNull(row.resolvedAt),
  };
}

export function toAuditEvent(row: typeof auditEvents.$inferSelect): AuditEvent {
  return {
    id: row.id,
    actorId: row.actorId,
    actorKind: row.actorKind,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    meta: row.meta,
    createdAt: toIso(row.createdAt),
  };
}
```

`packages/core/src/admin/catalog.ts`:

```ts
import {
  and,
  asc,
  catalogReports,
  catalogTasks,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  pgErrorCode,
  scholarships,
  sql,
} from "@scholarcrew/db";
import {
  type Actor,
  type CatalogReport,
  CatalogStatus,
  type CatalogTask,
  CatalogTaskKind,
  CatalogTaskPayload,
  CatalogTaskResolution,
  CatalogTaskStatus,
  type Page,
  ReportStatus,
  ResolveReportInput,
  type Scholarship,
  ScholarshipUpsertInput,
  conflict,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertAdmin, assertSystem } from "../access";
import { recordAudit } from "../audit";
import { escapeLike } from "../scholarships/common";
import { type CoreDeps, one, requireUuid } from "../shared";
import { toCatalogTask, toReport, toScholarship } from "./mappers";

const OPEN_TASK: CatalogTaskStatus[] = ["open", "in_review"];
const LIST_LIMIT = 200;
const ADMIN_PAGE_SIZE = 50;

/** D36: one listing in any status or visibility, for the admin editor. */
export async function getScholarshipForAdmin(deps: CoreDeps, actor: Actor, id: string): Promise<Scholarship> {
  assertAdmin(actor);
  requireUuid(id, "Scholarship not found");
  const [row] = await deps.db.select().from(scholarships).where(eq(scholarships.id, id));
  if (!row) throw notFound("Scholarship not found");
  return toScholarship(row);
}

/** D36: every listing, newest edit first, 50 per page; `q` matches name, provider, or slug. */
export async function listScholarships(
  deps: CoreDeps,
  actor: Actor,
  f: { status?: CatalogStatus; q?: string; page: number },
): Promise<Page<Scholarship>> {
  assertAdmin(actor);
  if (f.status !== undefined && !CatalogStatus.safeParse(f.status).success) throw invalidInput("Unknown listing status");
  if (!Number.isInteger(f.page) || f.page < 1) throw invalidInput("Page must be 1 or more");
  const text = f.q?.trim().slice(0, 100);
  const like = text ? `%${escapeLike(text)}%` : null;
  const where = and(
    f.status ? eq(scholarships.status, f.status) : undefined,
    like
      ? or(ilike(scholarships.name, like), ilike(scholarships.provider, like), ilike(scholarships.slug, like))
      : undefined,
  );
  const [total] = await deps.db.select({ n: count() }).from(scholarships).where(where);
  const rows = await deps.db
    .select()
    .from(scholarships)
    .where(where)
    .orderBy(desc(scholarships.updatedAt), asc(scholarships.name))
    .limit(ADMIN_PAGE_SIZE)
    .offset((f.page - 1) * ADMIN_PAGE_SIZE);
  return { items: rows.map(toScholarship), page: f.page, pageSize: ADMIN_PAGE_SIZE, total: total?.n ?? 0 };
}

/** D36: one catalog task with its payload, for the review page. */
export async function getCatalogTask(deps: CoreDeps, actor: Actor, id: string): Promise<CatalogTask> {
  assertAdmin(actor);
  requireUuid(id, "Task not found");
  const [row] = await deps.db.select().from(catalogTasks).where(eq(catalogTasks.id, id));
  if (!row) throw notFound("Task not found");
  return toCatalogTask(row);
}

export async function listCatalogTasks(
  deps: CoreDeps,
  actor: Actor,
  f: { status?: CatalogTaskStatus; kind?: CatalogTaskKind },
): Promise<CatalogTask[]> {
  assertAdmin(actor);
  if (f.status !== undefined && !CatalogTaskStatus.safeParse(f.status).success) throw invalidInput("Unknown task status");
  if (f.kind !== undefined && !CatalogTaskKind.safeParse(f.kind).success) throw invalidInput("Unknown task kind");
  const rows = await deps.db
    .select()
    .from(catalogTasks)
    .where(
      and(
        f.status ? eq(catalogTasks.status, f.status) : undefined,
        f.kind ? eq(catalogTasks.kind, f.kind) : undefined,
      ),
    )
    .orderBy(asc(catalogTasks.createdAt), asc(catalogTasks.id))
    .limit(LIST_LIMIT);
  return rows.map(toCatalogTask);
}

export async function createCatalogTask(
  deps: CoreDeps,
  system: Actor,
  i: { kind: CatalogTaskKind; payload: CatalogTaskPayload; scholarshipId?: string; createdById?: string },
): Promise<CatalogTask> {
  assertSystem(system);
  const payload = CatalogTaskPayload.safeParse(i.payload);
  if (!payload.success) throw invalidInput("Bad catalog task payload", payload.error.issues);
  if (payload.data.type !== i.kind) throw invalidInput("Task kind and payload type must match");
  const row = one(
    await deps.db
      .insert(catalogTasks)
      .values({
        kind: i.kind,
        payload: payload.data,
        scholarshipId: i.scholarshipId ?? null,
        createdById: i.createdById ?? null,
        createdAt: deps.clock.now(),
      })
      .returning(),
    "catalog_tasks insert",
  );
  return toCatalogTask(row);
}

/**
 * Only an admin publishes (CA-04). Publishing sets public visibility, the verified date, and the verifier.
 * Rejecting a `recheck_changed` task restores a `stale` listing to `published` (R2C-7).
 */
export async function resolveCatalogTask(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  r: CatalogTaskResolution,
): Promise<CatalogTask> {
  assertAdmin(actor);
  requireUuid(id, "Task not found");
  const parsed = CatalogTaskResolution.safeParse(r);
  if (!parsed.success) throw invalidInput("Check the resolution and try again", parsed.error.issues);
  const v = parsed.data;
  if (v.publishScholarshipId && v.status !== "resolved") throw invalidInput("Only a resolved task can publish a listing");
  const [task] = await deps.db.select().from(catalogTasks).where(eq(catalogTasks.id, id));
  if (!task) throw notFound("Task not found");
  if (!OPEN_TASK.includes(task.status)) throw conflict("This task is already closed");
  const now = deps.clock.now();
  const updated = await deps.db.transaction(async (tx) => {
    if (v.publishScholarshipId) {
      const published = await tx
        .update(scholarships)
        .set({ status: "published", visibility: "public", verifiedAt: now, verifiedById: actor.userId, updatedAt: now })
        .where(eq(scholarships.id, v.publishScholarshipId))
        .returning({ id: scholarships.id });
      if (published.length === 0) throw notFound("Scholarship not found");
    }
    // R2C-7 (CA-05): rejecting a re-check means "keep the listing as it is", so a stale listing goes back to
    // published with a fresh verification. Other statuses (retired, flagged) and other task kinds don't change.
    if (task.kind === "recheck_changed" && v.status === "rejected" && task.scholarshipId) {
      await tx
        .update(scholarships)
        .set({ status: "published", verifiedAt: now, verifiedById: actor.userId, updatedAt: now })
        .where(and(eq(scholarships.id, task.scholarshipId), eq(scholarships.status, "stale")));
    }
    return one(
      await tx
        .update(catalogTasks)
        .set({
          status: v.status,
          resolvedById: actor.userId,
          resolutionNote: v.note,
          resolvedAt: now,
          scholarshipId: task.scholarshipId ?? v.publishScholarshipId,
        })
        .where(eq(catalogTasks.id, id))
        .returning(),
      "catalog_tasks update",
    );
  });
  await recordAudit(deps, {
    actor,
    action: "catalog_task_resolved",
    entityType: "catalog_task",
    entityId: id,
    meta: { status: v.status, publishedScholarshipId: v.publishScholarshipId },
  });
  return toCatalogTask(updated);
}

export async function upsertScholarship(deps: CoreDeps, actor: Actor, i: ScholarshipUpsertInput): Promise<Scholarship> {
  assertAdmin(actor);
  const parsed = ScholarshipUpsertInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the listing and try again", parsed.error.issues);
  const { id, ...fields } = parsed.data;
  const now = deps.clock.now();
  try {
    if (id === null) {
      const row = one(
        await deps.db.insert(scholarships).values({ ...fields, createdAt: now, updatedAt: now }).returning(),
        "scholarships insert",
      );
      await recordAudit(deps, { actor, action: "scholarship_created", entityType: "scholarship", entityId: row.id });
      return toScholarship(row);
    }
    const [row] = await deps.db
      .update(scholarships)
      .set({ ...fields, updatedAt: now })
      .where(eq(scholarships.id, id))
      .returning();
    if (!row) throw notFound("Scholarship not found");
    await recordAudit(deps, { actor, action: "scholarship_updated", entityType: "scholarship", entityId: row.id });
    return toScholarship(row);
  } catch (e) {
    if (pgErrorCode(e) === "23505") throw conflict("Another listing already uses that slug");
    throw e;
  }
}

export async function setScholarshipStatus(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  status: CatalogStatus,
  note?: string,
): Promise<Scholarship> {
  assertAdmin(actor);
  requireUuid(id, "Scholarship not found");
  if (!CatalogStatus.safeParse(status).success) throw invalidInput("Unknown listing status");
  const now = deps.clock.now();
  const set: Partial<typeof scholarships.$inferInsert> = { status, updatedAt: now };
  if (status === "published") {
    set.visibility = "public";
    set.verifiedAt = now;
    set.verifiedById = actor.userId;
  }
  const [row] = await deps.db.update(scholarships).set(set).where(eq(scholarships.id, id)).returning();
  if (!row) throw notFound("Scholarship not found");
  await recordAudit(deps, {
    actor,
    action: "scholarship_status_set",
    entityType: "scholarship",
    entityId: id,
    meta: { status, note: (note ?? "").slice(0, 1000) },
  });
  return toScholarship(row);
}

async function reportsWhere(deps: CoreDeps, where: ReturnType<typeof eq> | undefined): Promise<CatalogReport[]> {
  const rows = await deps.db
    .select({ report: catalogReports, name: scholarships.name })
    .from(catalogReports)
    .innerJoin(scholarships, eq(scholarships.id, catalogReports.scholarshipId))
    .where(where)
    .orderBy(asc(catalogReports.createdAt), asc(catalogReports.id))
    .limit(LIST_LIMIT);
  return rows.map((r) => toReport(r.report, r.name));
}

export async function listReports(deps: CoreDeps, actor: Actor, status?: ReportStatus): Promise<CatalogReport[]> {
  assertAdmin(actor);
  if (status !== undefined && !ReportStatus.safeParse(status).success) throw invalidInput("Unknown report status");
  return reportsWhere(deps, status ? eq(catalogReports.status, status) : undefined);
}

/** Closes the report and the open review task that points at it. */
export async function resolveReport(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  i: { status: "resolved" | "rejected"; note: string },
): Promise<CatalogReport> {
  assertAdmin(actor);
  requireUuid(id, "Report not found");
  const parsed = ResolveReportInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the resolution and try again", parsed.error.issues);
  const v = parsed.data;
  const [report] = await deps.db.select().from(catalogReports).where(eq(catalogReports.id, id));
  if (!report) throw notFound("Report not found");
  if (report.status !== "open") throw conflict("This report is already closed");
  const now = deps.clock.now();
  await deps.db.transaction(async (tx) => {
    await tx.update(catalogReports).set({ status: v.status, resolvedAt: now }).where(eq(catalogReports.id, id));
    await tx
      .update(catalogTasks)
      .set({ status: v.status, resolvedById: actor.userId, resolutionNote: v.note, resolvedAt: now })
      .where(
        and(
          eq(catalogTasks.kind, "report"),
          inArray(catalogTasks.status, OPEN_TASK),
          sql`${catalogTasks.payload}->>'reportId' = ${id}`,
        ),
      );
  });
  await recordAudit(deps, {
    actor,
    action: "report_resolved",
    entityType: "catalog_report",
    entityId: id,
    meta: { status: v.status },
  });
  const [out] = await reportsWhere(deps, eq(catalogReports.id, id));
  if (!out) throw notFound("Report not found");
  return out;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/admin/catalog.test.ts`
Expected: PASS, 1 file, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/admin/mappers.ts packages/core/src/admin/catalog.ts packages/core/src/admin/catalog.test.ts
git commit -m "feat(core): admin review queue, scholarship editor, and report triage"
```

### H12: College import, audit search, research requests, and the admin index

- [ ] **Step 1: Write the failing test**

`packages/core/src/admin/colleges.test.ts`:

```ts
import { auditEvents, colleges, eq } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type CollegeImportRow, userActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { NOW, makeDeps, makeStudent } from "../plan/testkit";
import { enqueueResearch, importColleges, searchAudit } from "./index";

const row = (o: Partial<CollegeImportRow> = {}): CollegeImportRow => ({
  id: "100001",
  name: "State U",
  state: "TX",
  city: "Austin",
  control: "public",
  admitRate: 0.452,
  costOfAttendanceUsd: 27800,
  netPriceByIncome: { overall: 12000, under_30k: 6500, "30_48k": 8000, "48_75k": 9200, "75_110k": 14000, over_110k: null },
  ...o,
});

async function admin() {
  const { deps } = makeDeps();
  const me = await factories.admin(deps.db);
  return { deps, me, actor: userActor(me.id, "admin") };
}

describe("importColleges", () => {
  it("inserts new colleges with defaults and refreshes only Scorecard fields on existing ones", async () => {
    const { deps, actor } = await admin();
    const tier = { label: "Presidential", minGpa: 3.5, minAct: 28, minSat: null, annualUsd: 4000, renewalGpa: 3.0 };
    await factories.college(deps.db, {
      id: "100001",
      name: "Old Name",
      cssProfileRequired: true,
      meritTiers: [tier],
      deadlines: { ED: null, EA: "2026-11-01", REA: null, RD: null, rolling: false },
    });
    const result = await importColleges(deps, actor, [row(), row({ id: "100009", name: "New College" }), row({ id: "12" })]);
    expect(result).toMatchObject({ inserted: 1, updated: 1, skipped: 1 });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.line).toBe(3);
    const [kept] = await deps.db.select().from(colleges).where(eq(colleges.id, "100001"));
    expect(kept).toMatchObject({
      name: "State U",
      city: "Austin",
      admitRateX1000: 452,
      costOfAttendanceUsd: 27800,
      cssProfileRequired: true,
      meritTiers: [tier],
      deadlines: { ED: null, EA: "2026-11-01", REA: null, RD: null, rolling: false },
    });
    const [fresh] = await deps.db.select().from(colleges).where(eq(colleges.id, "100009"));
    expect(fresh).toMatchObject({
      name: "New College",
      testPolicy: "unknown",
      cssProfileRequired: false,
      meritTiers: [],
      deadlines: { ED: null, EA: null, REA: null, RD: null, rolling: false },
      requirements: {
        supplements: [],
        teacherRecs: 0,
        counselorRec: false,
        applicationFeeUsd: null,
        feeWaiverAvailable: false,
        portfolio: false,
        interview: "none",
      },
    });
    const [audit] = await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "colleges_imported"));
    expect(audit?.meta).toEqual({ inserted: 1, updated: 1, skipped: 1 });
  });

  it("denies non-admins", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    await expect(importColleges(deps, actor, [row()])).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("searchAudit", () => {
  it("pages 20 events at a time, newest first, with filters", async () => {
    const { deps, me, actor } = await admin();
    const start = new Date(NOW).getTime();
    await deps.db.insert(auditEvents).values(
      Array.from({ length: 25 }, (_, i) => ({
        actorId: me.id,
        actorKind: "user",
        action: i % 2 === 1 ? "colleges_imported" : "scholarship_updated",
        entityType: "scholarship",
        entityId: `s-${i}`,
        createdAt: new Date(start - (25 - i) * 60_000),
      })),
    );
    const first = await searchAudit(deps, actor, { page: 1 });
    expect(first).toMatchObject({ page: 1, pageSize: 20, total: 25 });
    expect(first.items).toHaveLength(20);
    expect(first.items[0]?.entityId).toBe("s-24");
    const second = await searchAudit(deps, actor, { page: 2 });
    expect(second.items.map((e) => e.entityId)).toEqual(["s-4", "s-3", "s-2", "s-1", "s-0"]);
    expect((await searchAudit(deps, actor, { page: 1, action: "colleges_imported" })).total).toBe(12);
    expect((await searchAudit(deps, actor, { page: 1, entityId: "s-7" })).items.map((e) => e.action)).toEqual([
      "colleges_imported",
    ]);
    const { actor: student } = await makeStudent(deps);
    await expect(searchAudit(deps, student, { page: 1 })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("enqueueResearch", () => {
  it("queues catalog research for a state and county", async () => {
    const { deps, actor } = await admin();
    await enqueueResearch(deps, actor, { state: "TX", county: "Maple" });
    await enqueueResearch(deps, actor, { state: "ca" });
    expect(deps.jobs.sent).toEqual([
      { name: "catalog.research", payload: { state: "TX", county: "Maple" } },
      { name: "catalog.research", payload: { state: "CA", county: null } },
    ]);
    await expect(enqueueResearch(deps, actor, { state: "ZZ" })).rejects.toMatchObject({ code: "invalid_input" });
    const { actor: student } = await makeStudent(deps);
    await expect(enqueueResearch(deps, student, { state: "TX" })).rejects.toMatchObject({ code: "forbidden" });
    expect(await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "research_enqueued"))).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test -- src/admin/colleges.test.ts`
Expected: FAIL with `Failed to resolve import "./index" from "src/admin/colleges.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/admin/colleges.ts`:

```ts
import { and, auditEvents, colleges, count, desc, eq, inArray, sql } from "@scholarcrew/db";
import {
  type Actor,
  type AuditEvent,
  AuditQuery,
  CollegeDeadlines,
  CollegeImportRow,
  CollegeRequirements,
  type ImportResult,
  type Page,
  ResearchInput,
  USState,
  invalidInput,
} from "@scholarcrew/domain";
import { assertAdmin } from "../access";
import { recordAudit } from "../audit";
import type { CoreDeps } from "../shared";
import { toAuditEvent } from "./mappers";

const IMPORT_CHUNK = 500;
export const AUDIT_PAGE_SIZE = 20;

/**
 * Upserts Scorecard rows by IPEDS id. New colleges get empty deadlines, default requirements, and no merit tiers;
 * existing colleges only refresh name, state, city, control, admit rate, cost, and net price.
 */
export async function importColleges(deps: CoreDeps, actor: Actor, rows: CollegeImportRow[]): Promise<ImportResult> {
  assertAdmin(actor);
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const byId = new Map<string, CollegeImportRow>();
  for (let idx = 0; idx < rows.length; idx += 1) {
    const parsed = CollegeImportRow.safeParse(rows[idx]);
    if (!parsed.success) {
      result.skipped += 1;
      result.errors.push({ line: idx + 1, message: parsed.error.issues[0]?.message ?? "Invalid row" });
      continue;
    }
    if (byId.has(parsed.data.id)) result.skipped += 1;
    byId.set(parsed.data.id, parsed.data);
  }
  const valid = [...byId.values()];
  const now = deps.clock.now();
  const deadlines = CollegeDeadlines.parse({ rolling: false });
  const requirements = CollegeRequirements.parse({});
  await deps.db.transaction(async (tx) => {
    for (let start = 0; start < valid.length; start += IMPORT_CHUNK) {
      const chunk = valid.slice(start, start + IMPORT_CHUNK);
      const existing = await tx
        .select({ id: colleges.id })
        .from(colleges)
        .where(
          inArray(
            colleges.id,
            chunk.map((r) => r.id),
          ),
        );
      result.updated += existing.length;
      result.inserted += chunk.length - existing.length;
      await tx
        .insert(colleges)
        .values(
          chunk.map((r) => ({
            id: r.id,
            name: r.name,
            state: r.state,
            city: r.city,
            control: r.control,
            admitRateX1000: r.admitRate === null ? null : Math.round(r.admitRate * 1000),
            costOfAttendanceUsd: r.costOfAttendanceUsd,
            netPriceByIncome: r.netPriceByIncome,
            deadlines,
            requirements,
            meritTiers: [],
            updatedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: colleges.id,
          set: {
            name: sql`excluded.name`,
            state: sql`excluded.state`,
            city: sql`excluded.city`,
            control: sql`excluded.control`,
            admitRateX1000: sql`excluded.admit_rate_x1000`,
            costOfAttendanceUsd: sql`excluded.cost_of_attendance_usd`,
            netPriceByIncome: sql`excluded.net_price_by_income`,
            updatedAt: now,
          },
        });
    }
  });
  await recordAudit(deps, {
    actor,
    action: "colleges_imported",
    entityType: "colleges",
    entityId: "scorecard",
    meta: { inserted: result.inserted, updated: result.updated, skipped: result.skipped },
  });
  return result;
}

export async function searchAudit(deps: CoreDeps, actor: Actor, q: AuditQuery): Promise<Page<AuditEvent>> {
  assertAdmin(actor);
  const parsed = AuditQuery.safeParse(q);
  if (!parsed.success) throw invalidInput("Check the search and try again", parsed.error.issues);
  const v = parsed.data;
  const where = and(
    v.actorId ? eq(auditEvents.actorId, v.actorId) : undefined,
    v.entityType ? eq(auditEvents.entityType, v.entityType) : undefined,
    v.entityId ? eq(auditEvents.entityId, v.entityId) : undefined,
    v.action ? eq(auditEvents.action, v.action) : undefined,
  );
  const [total] = await deps.db.select({ n: count() }).from(auditEvents).where(where);
  const rows = await deps.db
    .select()
    .from(auditEvents)
    .where(where)
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset((v.page - 1) * AUDIT_PAGE_SIZE);
  return { items: rows.map(toAuditEvent), page: v.page, pageSize: AUDIT_PAGE_SIZE, total: total?.n ?? 0 };
}

export async function enqueueResearch(deps: CoreDeps, actor: Actor, i: { state: string; county?: string }): Promise<void> {
  assertAdmin(actor);
  const parsed = ResearchInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Pick a state", parsed.error.issues);
  const state = USState.safeParse(parsed.data.state.toUpperCase());
  if (!state.success) throw invalidInput("Pick a US state");
  const county = parsed.data.county?.trim() || null;
  await deps.jobs.enqueue("catalog.research", { state: state.data, county });
  await recordAudit(deps, {
    actor,
    action: "research_enqueued",
    entityType: "catalog",
    entityId: state.data,
    meta: { county },
  });
}
```

`packages/core/src/admin/index.ts`:

```ts
export {
  createCatalogTask,
  getCatalogTask,
  getScholarshipForAdmin,
  listCatalogTasks,
  listReports,
  listScholarships,
  resolveCatalogTask,
  resolveReport,
  setScholarshipStatus,
  upsertScholarship,
} from "./catalog";
export { enqueueResearch, importColleges, searchAudit } from "./colleges";
export { deleteAidDeadline, listAidDeadlinesForAdmin, listAidRules, upsertAidDeadline, upsertAidRule } from "./aid";
```

`packages/core/src/admin/aid.test.ts` (R2P-1: production aid rules and deadlines are maintained here; dev uses plan 03's marked sample seed):

```ts
import { offers } from "@scholarcrew/db";
import { aidDeadlines, aidRules, auditEvents, eq } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type AidDeadlineInput, systemActor, userActor } from "@scholarcrew/domain";
import { estimateLoanPayment } from "@scholarcrew/engines";
import { describe, expect, it } from "vitest";
import { createOffer, loanEstimates, saveParsedOffer } from "../money";
import { AWARD_YEAR, NOW, makeDeps, makeDocument, makeStateU, makeStudent } from "../plan/testkit";
import { deleteAidDeadline, listAidDeadlinesForAdmin, listAidRules, upsertAidDeadline, upsertAidRule } from "./index";

const SOURCE = "https://studentaid.gov/understand-aid/types/loans/interest-rates";
const RATES = { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 };

async function admin() {
  const { deps, clock } = makeDeps();
  const me = await factories.admin(deps.db);
  return { deps, clock, actor: userActor(me.id, "admin") };
}

const deadline = (o: Partial<AidDeadlineInput> = {}): AidDeadlineInput => ({
  awardYear: AWARD_YEAR,
  state: null,
  program: "FAFSA",
  deadline: "2028-06-30",
  note: "",
  sourceUrl: "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines",
  ...o,
});

describe("admin aid rules", () => {
  it("upserts loan rates by award year, lists valid rows, and feeds loanEstimates", async () => {
    const { deps, clock, actor } = await admin();
    const first = await upsertAidRule(deps, actor, { awardYear: AWARD_YEAR, key: "federal_loan_rates", value: RATES, sourceUrl: SOURCE });
    expect(first).toMatchObject({ awardYear: AWARD_YEAR, key: "federal_loan_rates", value: RATES, verifiedAt: NOW });
    clock.set("2026-10-07T15:00:00.000Z");
    const updated = await upsertAidRule(deps, actor, {
      awardYear: AWARD_YEAR,
      key: "federal_loan_rates",
      value: { ...RATES, parent_plus: 9.08 },
      sourceUrl: SOURCE,
    });
    expect(updated).toMatchObject({ id: first.id, verifiedAt: "2026-10-07T15:00:00.000Z" });
    await deps.db.insert(aidRules).values({ awardYear: "2026-27", key: "federal_loan_rates", value: { subsidized: "x" }, sourceUrl: SOURCE, verifiedAt: new Date(NOW) });
    expect((await listAidRules(deps, actor, {})).map((r) => r.awardYear)).toEqual([AWARD_YEAR]);
    expect(await listAidRules(deps, actor, { awardYear: "2026-27" })).toEqual([]);
    await expect(listAidRules(deps, actor, { awardYear: "2027" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      upsertAidRule(deps, actor, { awardYear: AWARD_YEAR, key: "federal_loan_rates", value: { ...RATES, subsidized: 31 }, sourceUrl: SOURCE }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    const { user, actor: student } = await makeStudent(deps);
    const college = await makeStateU(deps);
    const doc = await makeDocument(deps, user.id);
    const offer = await createOffer(deps, student, { collegeId: college.id, documentId: doc.id, awardYear: AWARD_YEAR });
    await saveTestOffer(deps, systemActor("test"), {
      offerId: offer.id,
      costOfAttendanceUsd: 27800,
      lines: [
        { label: "Parent PLUS Loan", amountUsd: 10000, category: "loan_parent_plus", renewable: false, renewalCondition: "", page: 1, citedText: "" },
      ],
    });
    expect(await loanEstimates(deps, student, offer.id)).toEqual([
      { ...estimateLoanPayment({ principalUsd: 10000, annualRatePct: 9.08, years: 10 }), label: "Parent PLUS Loan" },
    ]);
    expect(await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "aid_rule_upserted"))).toHaveLength(2);
  });

  it("adds, edits, lists, and deletes aid deadlines", async () => {
    const { deps, actor } = await admin();
    const federal = await upsertAidDeadline(deps, actor, deadline());
    const texas = await upsertAidDeadline(deps, actor, deadline({ state: "TX", program: "TEXAS Grant priority", deadline: "2027-01-15" }));
    await upsertAidDeadline(deps, actor, deadline({ awardYear: "2026-27", deadline: "2027-06-30" }));
    const edited = await upsertAidDeadline(deps, actor, deadline({ id: texas.id, state: "TX", program: "TEXAS Grant priority", deadline: "2027-01-31" }));
    expect(edited).toMatchObject({ id: texas.id, deadline: "2027-01-31", verifiedAt: NOW });
    await expect(
      upsertAidDeadline(deps, actor, deadline({ id: "00000000-0000-4000-8000-000000000000" })),
    ).rejects.toMatchObject({ code: "not_found" });
    expect((await listAidDeadlinesForAdmin(deps, actor, { awardYear: AWARD_YEAR })).map((d) => d.id)).toEqual([
      edited.id,
      federal.id,
    ]);
    expect(await listAidDeadlinesForAdmin(deps, actor, {})).toHaveLength(3);
    await deleteAidDeadline(deps, actor, federal.id);
    expect(await deps.db.select().from(aidDeadlines).where(eq(aidDeadlines.id, federal.id))).toEqual([]);
    await expect(deleteAidDeadline(deps, actor, federal.id)).rejects.toMatchObject({ code: "not_found" });
    const actions = (await deps.db.select().from(auditEvents)).map((e) => e.action).sort();
    expect(actions).toEqual(["aid_deadline_deleted", ...Array(4).fill("aid_deadline_upserted")]);
  });

  it("denies non-admins", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    const id = "00000000-0000-4000-8000-000000000000";
    await expect(listAidRules(deps, actor, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      upsertAidRule(deps, actor, { awardYear: AWARD_YEAR, key: "federal_loan_rates", value: RATES, sourceUrl: SOURCE }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(listAidDeadlinesForAdmin(deps, actor, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(upsertAidDeadline(deps, actor, deadline())).rejects.toMatchObject({ code: "forbidden" });
    await expect(deleteAidDeadline(deps, actor, id)).rejects.toMatchObject({ code: "forbidden" });
  });
});
async function saveTestOffer(deps: Parameters<typeof saveParsedOffer>[0], actor: Parameters<typeof saveParsedOffer>[1], input: Omit<Parameters<typeof saveParsedOffer>[2], "ownerId">) {
  const [offer] = await deps.db.select({ ownerId: offers.ownerId }).from(offers).where(eq(offers.id, input.offerId));
  if (!offer) throw new Error("test offer missing");
  return saveParsedOffer(deps, actor, { ...input, ownerId: offer.ownerId });
}

```

`packages/core/src/admin/aid.ts`:

```ts
import { aidDeadlines, aidRules, asc, eq } from "@scholarcrew/db";
import {
  type Actor,
  type AidDeadline,
  AidDeadlineInput,
  type AidRule,
  AidRuleInput,
  AidRuleKey,
  AppError,
  AwardYear,
  FederalLoanRates,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertAdmin } from "../access";
import { toAidDeadline } from "../aid/checklists";
import { recordAudit } from "../audit";
import { type CoreDeps, one, requireUuid, toIso } from "../shared";

type RuleRow = typeof aidRules.$inferSelect;

/** Null for a stored row whose key or value doesn't parse, so one bad row can't break the page. */
function toAidRule(row: RuleRow): AidRule | null {
  const key = AidRuleKey.safeParse(row.key);
  const value = FederalLoanRates.safeParse(row.value);
  if (!key.success || !value.success) return null;
  return {
    id: row.id,
    awardYear: row.awardYear,
    key: key.data,
    value: value.data,
    sourceUrl: row.sourceUrl,
    verifiedAt: toIso(row.verifiedAt),
  };
}

function awardYearOf(f: { awardYear?: string }): string | undefined {
  if (f.awardYear === undefined || f.awardYear === "") return undefined;
  if (!AwardYear.safeParse(f.awardYear).success) throw invalidInput("Use a YYYY-YY award year");
  return f.awardYear;
}

export async function listAidRules(deps: CoreDeps, actor: Actor, f: { awardYear?: string } = {}): Promise<AidRule[]> {
  assertAdmin(actor);
  const awardYear = awardYearOf(f);
  const rows = await deps.db
    .select()
    .from(aidRules)
    .where(awardYear ? eq(aidRules.awardYear, awardYear) : undefined)
    .orderBy(asc(aidRules.awardYear), asc(aidRules.key));
  return rows.flatMap((r) => {
    const rule = toAidRule(r);
    return rule ? [rule] : [];
  });
}

/** Upserts on (awardYear, key) and stamps `verifiedAt` now; the admin just checked the source. */
export async function upsertAidRule(deps: CoreDeps, actor: Actor, i: AidRuleInput): Promise<AidRule> {
  assertAdmin(actor);
  const parsed = AidRuleInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the loan rates and try again", parsed.error.issues);
  const v = parsed.data;
  const now = deps.clock.now();
  const row = one(
    await deps.db
      .insert(aidRules)
      .values({ awardYear: v.awardYear, key: v.key, value: v.value, sourceUrl: v.sourceUrl, verifiedAt: now })
      .onConflictDoUpdate({
        target: [aidRules.awardYear, aidRules.key],
        set: { value: v.value, sourceUrl: v.sourceUrl, verifiedAt: now },
      })
      .returning(),
    "aid_rules upsert",
  );
  await recordAudit(deps, {
    actor,
    action: "aid_rule_upserted",
    entityType: "aid_rule",
    entityId: row.id,
    meta: { awardYear: v.awardYear, key: v.key },
  });
  const rule = toAidRule(row);
  if (!rule) throw new AppError("internal", "Aid rule unreadable after save");
  return rule;
}

export async function listAidDeadlinesForAdmin(
  deps: CoreDeps,
  actor: Actor,
  f: { awardYear?: string } = {},
): Promise<AidDeadline[]> {
  assertAdmin(actor);
  const awardYear = awardYearOf(f);
  const rows = await deps.db
    .select()
    .from(aidDeadlines)
    .where(awardYear ? eq(aidDeadlines.awardYear, awardYear) : undefined)
    .orderBy(asc(aidDeadlines.awardYear), asc(aidDeadlines.deadline), asc(aidDeadlines.program));
  return rows.map(toAidDeadline);
}

/** Inserts when `id` is missing, updates otherwise (unknown id is `not_found`). `verifiedAt` is now either way. */
export async function upsertAidDeadline(deps: CoreDeps, actor: Actor, i: AidDeadlineInput): Promise<AidDeadline> {
  assertAdmin(actor);
  const parsed = AidDeadlineInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the deadline and try again", parsed.error.issues);
  const { id, ...v } = parsed.data;
  const values = { ...v, verifiedAt: deps.clock.now() };
  let row: typeof aidDeadlines.$inferSelect;
  if (id === undefined) {
    row = one(await deps.db.insert(aidDeadlines).values(values).returning(), "aid_deadlines insert");
  } else {
    const [updated] = await deps.db.update(aidDeadlines).set(values).where(eq(aidDeadlines.id, id)).returning();
    if (!updated) throw notFound("Aid deadline not found");
    row = updated;
  }
  await recordAudit(deps, {
    actor,
    action: "aid_deadline_upserted",
    entityType: "aid_deadline",
    entityId: row.id,
    meta: { awardYear: row.awardYear, state: row.state, program: row.program },
  });
  return toAidDeadline(row);
}

export async function deleteAidDeadline(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertAdmin(actor);
  requireUuid(id, "Aid deadline not found");
  const deleted = await deps.db.delete(aidDeadlines).where(eq(aidDeadlines.id, id)).returning({ id: aidDeadlines.id });
  if (deleted.length === 0) throw notFound("Aid deadline not found");
  await recordAudit(deps, { actor, action: "aid_deadline_deleted", entityType: "aid_deadline", entityId: id });
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test -- src/admin`
Expected: PASS, 3 files, 13 tests (catalog 6, colleges 4, aid 3).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/admin packages/core/src/aid/checklists.ts
git commit -m "feat(core): college import, audit search, research requests, aid rule editing, admin index"
```

### H13: Contract surface check, format, and the gate

- [ ] **Step 1: Write the failing test**

`packages/core/src/plan/contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as admin from "../admin";
import * as aid from "../aid";
import * as crew from "../crew";
import * as money from "../money";
import * as plan from "./index";

const CONTRACT: Record<string, { mod: Record<string, unknown>; names: string[] }> = {
  money: {
    mod: money,
    names: [
      "compareMyOffers",
      "confirmOffer",
      "createOffer",
      "deleteOffer",
      "getCosts",
      "getOffer",
      "listOffers",
      "loanEstimates",
      "markOfferFailed",
      "publicOfferTool",
      "requestAppealOutline",
      "saveParsedOffer",
      "setCalculatorResult",
      "updateOfferLine",
    ],
  },
  aid: { mod: aid, names: ["ensureChecklists", "getAidChecklists", "listAidDeadlines", "updateAidItem"] },
  plan: {
    mod: plan,
    names: [
      "addPlanItem",
      "buildWeeklyDigest",
      "findDueReminders",
      "getThisWeek",
      "getWeekPlan",
      "listUpcomingDeadlines",
      "replaceGeneratedPlan",
      "requestWeeklyPlan",
      "startWeeklyPlan",
      "updatePlanItem",
    ],
  },
  crew: {
    mod: crew,
    names: [
      "appendProgress",
      "applyActionCard",
      "completeJob",
      "createConversation",
      "createJob",
      "getJob",
      "getMessages",
      "listConversations",
      "listJobs",
      "recordAgentRun",
      "sendMessage",
      "startJob",
    ],
  },
  admin: {
    mod: admin,
    names: [
      "createCatalogTask",
      "deleteAidDeadline",
      "enqueueResearch",
      "getCatalogTask",
      "getScholarshipForAdmin",
      "importColleges",
      "listAidDeadlinesForAdmin",
      "listAidRules",
      "listCatalogTasks",
      "listReports",
      "listScholarships",
      "resolveCatalogTask",
      "resolveReport",
      "searchAudit",
      "setScholarshipStatus",
      "upsertAidDeadline",
      "upsertAidRule",
      "upsertScholarship",
    ],
  },
};

describe("plan 08 module surfaces", () => {
  for (const [name, { mod, names }] of Object.entries(CONTRACT)) {
    it(`${name} exports exactly the section 9.4 functions`, () => {
      expect(Object.keys(mod).sort()).toEqual(names);
      for (const fn of names) expect(typeof mod[fn]).toBe("function");
    });
  }
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @scholarcrew/core test -- src/plan/contract.test.ts`
Expected: PASS, 5 tests (the indexes already exist; this test locks the surface so an extra or missing export fails the build).

- [ ] **Step 3: Format and lint**

Run: `pnpm format && pnpm lint`
Expected: Biome rewrites long lines under `packages/core/src/{money,aid,plan,crew,admin}`; `biome check .` then reports no errors.

- [ ] **Step 4: Run the gate**

Run: `pnpm --filter @scholarcrew/core typecheck && pnpm --filter @scholarcrew/core test`
Expected: `tsc --noEmit` prints nothing; Vitest passes every core file (plans 06, 07, and 08), including this plan's 15 files and 92 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/money packages/core/src/aid packages/core/src/plan packages/core/src/crew packages/core/src/admin
git commit -m "test(core): lock the plan 08 module surfaces"
```

## Success Criteria

- [ ] `pnpm --filter @scholarcrew/core typecheck` exits 0.
- [ ] `pnpm --filter @scholarcrew/core test` exits 0, with these plan 08 files passing: `plan/{common,items,deadlines,week,notify,contract}.test.ts`, `crew/{jobs,conversations,actions}.test.ts`, `money/{costs,offers}.test.ts`, `aid/checklists.test.ts`, `admin/{catalog,colleges,aid}.test.ts` (15 files, 93 tests: plan 26, crew 25, money 24, aid 5, admin 13).
- [ ] `pnpm lint` exits 0.
- [ ] `grep -rn "new Date()" packages/core/src/{money,aid,plan,crew,admin} --include=*.ts --exclude=*.test.ts --exclude=testkit.ts` prints nothing (every timestamp comes from `deps.clock`).
- [ ] `grep -n "inputs:" packages/core/src/money/costs.ts` shows only `{ basis: ... }` and `{ grantsUsd: ... }` (the income range is never written to `costEstimates.inputs`).

## Testing Requirements

- Command: `pnpm --filter @scholarcrew/core test`
- What the tests prove:
  - Ledger: State U with the `$48k–75k` range gives $27,800 cost, $18,600 free money, a $9,200 gap, $4,750 pending, and $4,450 if pending wins; the overall average applies with no range; won outside awards add to year 1; confirmed offers beat calculator results, which beat the Scorecard, and archiving the offer falls back to the calculator (R2P-6); archived offers drop out; retired listings leave pending money (R2P-4); a `planned` or `drafting` application past its deadline in the student's zone leaves pending money while a past-due `submitted` one stays (R3V-6); colleges without numbers and other seasons are skipped; a family budget yields the remaining gap; parents need the `costs` share.
  - Offers: only an owned `award_letter` document starts a parse (`offer.parse` enqueued with the job and offer ids, document `queued`); parsed lines replace earlier ones with positions; corrections set `userCorrected`; confirming needs a line; comparison uses confirmed offers and labels ("$6,000 Riverside Welcome Grant is year 1 only", State U lowest at $36,800 over 4 years); letters with no known cost are left out with an assumption line, and the outside-scholarships line is always present (R2P-7); every offer carries its `parseJobId`; archived offers leave the list and the comparison but still open by id; failures mark the offer and document; failed and unconfirmed letters can be deleted, confirmed ones are a `conflict`, and another student's are `not_found` (R2P-8); a parsed award year within one year of now is stored and others are ignored (R2P-16); the first confirmed letter creates one `review_costs` task per parent and a re-confirm adds none (R2I-7); appeal outlines respect the allowance; loan payments use the award year's stored rates and skip private loans; the public tool validates input.
  - Aid: FAFSA and CSS items are idempotent, CSS items carry the priority date, parent steps become one family task per parent linked by `aidItemId` with the plain step title (R2I-5, R2I-6), a parent finishing the family task marks the checklist item done, a second `ensureChecklists` adds no tasks, parents update only parent steps, and aid deadlines are federal plus the student's state.
  - Plan: items land on the student's Monday; done sets `completedAt`; weekly plan jobs respect the allowance; regenerated plans replace only `generated` todo items, so user-added, card-applied, study-plan, and done items stay (R2C-4); `startWeeklyPlan` is system only, skips the allowance, starts one job per 12 hours with `source: "system"`, and skips parents and unfinished students (R2C-5); deadlines merge scholarships, applications, aid, and CSS dates with days left and warnings, and drop retired or scam-flagged listings (R2P-4); This Week picks the ED/EA school for the gap and hides cards a parent can't see; the digest is null when empty or opted out, and writes due dates as "Oct 15" (R3E-8); reminder keys are unique per student item and offset, and retired or flagged listings get no reminder (R2P-4); a won renewable award gets one `offset: 30` renewal reminder 30 days before its anniversary, and non-renewable, lost, or undated wins get none.
  - Crew: jobs move `queued → working → ready/failed`, completion writes a crew message and notifies once per non-chat job, a retried completion writes no second message, room-less replies reuse the newest live room with the kind's title (R2C-14), appeal and retake notices link to `/crew/<conversationId>` (R2P-9), `listJobs` returns the actor's jobs plus their own family-room requests newest first with the active filter and the 1..50 limit, and drops those once the parent leaves (R2C-11), agent runs add cost; temporary chats expire after 24 hours; sending is allowance-checked and charged to the room owner; family rooms are shared with members only and parents never read private rooms; context rooms check the object and reopen; action cards claim their receipt first, so concurrent applies run once, a fresh claim is a `conflict`, a stale one is returned, and a failing card leaves no receipt (R2C-3); a temporary room refuses fact and decision cards (R2C-9); a decision card stores `sourceMessageId` (R2I-12); a confirm_fact card leaves no live candidate for the key (R2C-2); only the student applies non-link cards in a family room.
  - Admin: non-admins get `forbidden`; resolving a task can publish (public, verified now, verifier set) and is audited; rejecting a `recheck_changed` task republishes a stale listing and leaves other kinds and statuses alone (R2C-7); slugs are unique; report resolution closes its task; college import inserts defaults and refreshes only Scorecard fields; audit search pages 20 newest first; research requests enqueue `catalog.research`; admins read one listing in any status, page listings by status and text, and read one task; admins upsert loan rates by award year and key (skipping unreadable rows on list), and `loanEstimates` uses them; admins add, edit, list, and delete aid deadlines, with each write audited (R2P-1).
- Expected: all files pass, 0 failed.

## Review Checklist

- [ ] Each of `money`, `aid`, `plan`, `crew`, `admin` `index.ts` exports exactly the §9.4 names (locked by `plan/contract.test.ts`).
- [ ] Every user-facing read calls `assertCanRead` with the category listed at the top of this plan before touching rows; every write is owner-only or admin-only; system functions call `assertSystem`.
- [ ] `getCosts` reads the income range only through `readSensitiveForMatcher` with a system actor, and `costEstimates.inputs` holds `basis` only.
- [ ] Crew sends and the weekly plan and appeal jobs call `assertCrewAllowance` before inserting anything; the essay review and retake jobs (plan 07), `offer.parse`, and the system `startWeeklyPlan` (R2C-5) don't count here.
- [ ] Family rooms are owned by the family's student; `getMessages`, `sendMessage`, `getJob`, and `applyActionCard` let parents in only through `familyId` membership.
- [ ] `applyActionCard` runs each card through the owning module's service (`addPlanItem`, `saveScholarship`, `addCollege`, `createEssay`, `recordDecision`, `createFact`) as the student, never writes those tables directly.
- [ ] Reminder dedupe keys use per-student refs, so `notifications.dedupeKey` (globally unique) never collides between students.
- [ ] Admin writes (`resolveCatalogTask`, `upsertScholarship`, `setScholarshipStatus`, `resolveReport`, `importColleges`, `enqueueResearch`, `upsertAidRule`, `upsertAidDeadline`, `deleteAidDeadline`) each record one audit event.
- [ ] Round 1 fixes code against two 02 changes that must land first: `Reminder.offset` widened to `30 | 7 | 3 | 1` (D2) and `Offer.parseJobId: Id.nullable()` (D31). Until then `plan/notify.ts` and `money/offers.ts` don't typecheck.
- [ ] Round 2 (P-D) codes against names other clusters add, which must land first: 03 `planItems.generated`, `familyTasks.aidItemId` (R2C-4, R2I-6); 02 `plan.weekly` payload `source?` and `FederalLoanRates`, `AidRuleKey`, `AidRule`, `AidRuleInput`, `AidDeadlineInput` (R2C-5, R2P-1); 06 `createTask` `aidItemId?`, `updateTask` writing through to the aid item, `recordDecision`'s 4th `sourceMessageId` argument, and `writeConfirmedFact` superseding candidates (R2I-6, R2I-12, R2C-2); 07 `liveListingWhere` from `../scholarships` (R2P-4).
