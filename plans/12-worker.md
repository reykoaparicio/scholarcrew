# Plan 12: Worker (Agent L)

`apps/worker` is the background process. It consumes every pg-boss queue in `JOB_NAMES`, registers the `SCHEDULES` crons, and wires the three halves of the backend together: it builds the `CrewDataPort` over plan 06/07/08 core services with the system actor, runs plan 09's Compass and plan 10's specialists against it, runs plan 11's catalog pipeline, and writes results back through core (`completeJob`, `saveQuillComments`, `saveParsedOffer`, `replaceGeneratedPlan`, notifications, billing usage). It also ships a deterministic offline demo model for local dev and e2e (`SCHOLARCREW_FAKE_MODEL=1`). Feature IDs: CR-06 (jobs keep running after the tab closes; queued → working → ready/needs_input/failed), CR-09 (crisis messages reach the crisis reply with no model call), CR-11 (refusals end as a polite reply), ON-06 (first `plan.weekly` and `sweep.student` jobs), SC-10 (Sunday sweep fan-out), ES-04 (Quill review job), MO-04 (award letter parse job), MO-08 (appeal outline job), PR-03 (retake job), NO-02 (weekly digest), NO-03 (deadline reminders), NO-05 (1-day SMS reminders through Twilio), WK-01/WK-02 (Monday weekly-plan fan-out), CA-01, CA-02, CA-05 (catalog research, extract, re-check jobs), ME-08 (export job), ID-05 (account purge job), SE-07 (retention purge job), AG-06 (one `agentRuns` row per model turn plus monthly usage).

Read first: `00-overview.md` §3, §4, §9.3–§9.6, §14 (pg-boss 10); `02-domain.md` (`JobPayloadSchemas`, `CrewRequestInput`, `ContextSnapshot`, `CrewReply`); plans 05, 06, 07, 08, 09, 10, 11 for the imported names.

Decisions this plan makes on top of `00-overview.md`:

- **Handler shape.** `Handler = (deps: WorkerDeps, data: unknown, ctx?: JobContext) => Promise<void>`. `ctx` carries pg-boss's `retryCount` and `retryLimit` (the worker calls `boss.work` with `includeMetadata: true`). Every handler re-parses `data` with `JobPayloads[name]`; a bad payload throws a `ZodError`, which pg-boss records as a failed attempt.
- **Crew job error policy** (`runCrewJob` in `src/handlers/shared.ts`): a job already in a terminal status is skipped, so pg-boss retries are idempotent. A retryable model error (the plan 09 client's `AppError("internal")` with `details.rateLimited === true`, `status >= 500`, or `status === null`) is rethrown while retries remain, returning the job to `queued` after releasing its lease; on the last attempt, and for every other error, the job is completed `failed` with `"Something went wrong. Try again in a minute."` and the handler resolves. Model cost already spent is still recorded (with `crewRequest: false`).
- **Usage (AG-06).** `onUsage` writes one `recordAgentRun` per model turn (cost rounded to whole micro-dollars) and sums the cost; terminal completion or stale-job reaping bills the job’s accumulated cost once, in its creation month. A failed insert is logged (`usage.record_failed`) and never rejects, so it can't crash the worker or fail a finished job; the cost still counts. Retry attempts keep their cost on the job before rethrowing; terminal completion bills all attempts together. Catalog calls (D20) go through `catalogUsageRecorder`: one `agentRuns` row per extraction, research turn, and batch item, with role `catalog`, `jobId` and `userId` null. `crewRequest` is `true` for `crew.request`, `essay.review`, `appeal.outline`, `prep.retake`, and user `plan.weekly` jobs (their request paths check the allowance) and `false` for `offer.parse` and for `plan.weekly` with `source: "system"` (the Monday fan-out, R2C-5).
- **Job owner.** `CrewJob` (domain) has no `ownerId`, so `runCrewJob` reads `crewJobs.ownerId` directly. Handlers use that owner, never the payload's `ownerId` (`plan.weekly`), for every core call.
- **Audience-bound port (FA, SE-01).** `createCrewDataPort(core, { audience })` is built per job. `crew.request` binds it to the request's audience and builds `makeConsult` from the same base, so Compass and every specialist read through it. For family, every read checks the student's share settings (`shareSettings` rows, defaulting to `DEFAULT_SHARED`, re-read on every protected read and before completion) and returns empty when the category is off: costs and offers → `costs`, college list and application items → `colleges`, activities and service progress → `activities`, deadlines, week plan, and aid checklists → `deadlines` (R2P-20, matching 08), matches → `scholarships`, stories → `stories`, essay → `essays`; a college list entry's `gapUsd` is filled from `getCosts` only when `costs` is shared too (R2P-15). Test scores have no share category, so family never gets them. Family snapshots also drop decisions and keep only `crew_family` facts. Snapshot profile fields follow each profile fact's visibility (R2I-10): a field whose current confirmed fact isn't `crew`/`crew_family` (crew) or `crew_family` (family) is blanked, so `scout_only` means matching only. Sensitive facts never enter any snapshot: they live encrypted in `sensitiveFacts`, and the port never calls `readSensitiveForMatcher`.
- **Temporary chats (CR-07, D22).** A `temporary` snapshot has no facts and no decisions, and its `confirm_fact` cards never become candidates.
- **Memory candidates (ME-03, D19).** After a crew-audience reply outside temporary rooms, each `confirm_fact` card goes to `createCandidate`; a failure is logged and skipped. Filing runs in `JobOutcome.afterComplete`, after `completeJob` and with usage already committed, so a `completeJob` failure and retry can't file twice (R2C-15).
- **Prep and Impact (D29).** Each is on when the student's confirmed `crew_prep_enabled`/`crew_impact_enabled` fact is `true` (plan 16's onboarding switch) or the data exists.
- **Crew search.** Core rejects `local: true` from the system actor, so the port drops `local` (the crew can't run a local search) and always sets `excludeScams: true`.
- **Requester and speakers (D42, R2C-1).** `loadCrewInput` looks up the owner, the request author, and every history author in one `users` query. `requester` is `{ role: "student", firstName }` for the owner, else `{ role: users.role === "parent" ? "parent" : "student", firstName }`, where `firstName` is the first whitespace token of `displayName` (up to 60 characters, may be `""`). Each history line's `speaker` is `crew`, `student` (the owner), or `parent`/`student` by the author's role. 09 renders the labels and the `"<firstName> (parent) asks: "` prefix. `FAMILY_MEMBER_PREFIX` is gone.
- **SMS (NO-05, R2I-9).** `WorkerDeps.sms` is `twilioSmsSender` when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` are all set, `devOutboxSmsSender` when all are empty, and a startup error otherwise. `reminders.deadlines` passes `sms: true` only for 1-day, non-renewal reminders; `notify.sms` calls 06 `deliverSms`.
- **Weekly plan fan-out (R2C-5).** `plan.weekly.fanout` (Monday 11:00 UTC) calls 08 `startWeeklyPlan` for every active, onboarded student; a system plan doesn't count against the allowance.
- **Sweeps.** `sweep.student` stays a standard queue (06's onboarding enqueue has no key), so a retried `sweep.weekly` can queue a student twice. Accepted: the sweep is idempotent per student and week.
- **Schedules.** `catalog.recheck` runs with `expireInSeconds: 3600` and `retryLimit: 0` (plan 11 caps its fetching at 10 minutes).
- **Digest guard.** `digest.weekly` matches each active student's `digestDay` (0 = Sunday) in their time zone and runs at the first hourly pass at or after the effective hour (the quiet window's end when `digestHour` falls inside quiet hours) that isn't in quiet hours (R2I-16). It skips a student whose `digest:<userId>:<weekStart>` notification exists before building, calls `notify` (kind `digest`, no email), and sends the email only when `notify` returned a new notification. A failed send calls 06 `retractNotification`, so the next hour that day retries.
- **Demo model.** `createDemoModelClient()` is demo-only. It wraps `createScriptedModelClient`'s function form, answers from what the request carries (the `student_context` and `essay_draft` untrusted blocks, the submit tool name, the role), and clears the scripted client's request log after every call so a long-running dev worker doesn't grow memory. In fake mode the catalog gets the demo model plus the `@scholarcrew/catalog/testing` fakes (no network).
- **Config.** Only `src/deps.ts` reads `process.env` (`buildWorkerDeps(env = process.env)`). `main.ts` calls it without arguments.

## Files

Create:

- `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/vitest.config.ts`
- `apps/worker/test/global-setup.ts`, `apps/worker/test/setup.ts`, `apps/worker/test/helpers.ts`
- `apps/worker/src/log.ts`, `src/time.ts`, `src/types.ts`, `src/demo-model.ts`, `src/deps.ts`, `src/sms.ts`, `src/port.ts`
- `apps/worker/src/handlers/shared.ts`
- `apps/worker/src/handlers/crew-request.ts`, `essay-review.ts`, `offer-parse.ts`, `appeal-outline.ts`, `prep-retake.ts`, `plan-weekly.ts`, `plan-weekly-fanout.ts`
- `apps/worker/src/handlers/sweep-weekly.ts`, `sweep-student.ts`, `reminders-deadlines.ts`, `digest-weekly.ts`, `notify-email.ts`, `notify-sms.ts`
- `apps/worker/src/handlers/catalog-research.ts`, `catalog-extract.ts`, `catalog-recheck.ts`, `catalog-recheck-collect.ts`
- `apps/worker/src/handlers/account-export.ts`, `account-purge.ts`, `maintenance-purge.ts`
- `apps/worker/src/registry.ts`, `apps/worker/src/app.ts`, `apps/worker/src/main.ts`

Test:

- `apps/worker/src/log.test.ts`, `src/time.test.ts`, `src/demo-model.test.ts`, `src/deps.test.ts`, `src/sms.test.ts`, `src/port.test.ts`
- `apps/worker/src/handlers/shared.test.ts`, `crew-request.test.ts`, `essay-offer.test.ts`, `crew-jobs.test.ts`, `sweeps.test.ts`, `notices.test.ts`, `catalog.test.ts`, `account.test.ts`
- `apps/worker/src/registry.test.ts`, `apps/worker/src/app.test.ts`

Modify: nothing outside `apps/worker/**`.

Every test touching Postgres runs under this package's Vitest config (`globalSetup` migrates `TEST_DATABASE_URL`, `setupFiles` runs `resetDb` before each test, `fileParallelism: false`). The fixed clock is `TEST_NOW` = `2026-10-06T15:00:00.000Z` (Tuesday, 10:00 in `America/Chicago`; week starts `2026-10-05`).

## Tasks

### L1: Package scaffold, test wiring, and the JSON logger

- [ ] **Step 1: Create the package files and link them**

`apps/worker/package.json`:

```json
{
  "name": "@scholarcrew/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=../../.env src/main.ts",
    "start": "tsx src/main.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scholarcrew/agents": "workspace:*",
    "@scholarcrew/catalog": "workspace:*",
    "@scholarcrew/core": "workspace:*",
    "@scholarcrew/db": "workspace:*",
    "@scholarcrew/domain": "workspace:*",
    "@scholarcrew/engines": "workspace:*",
    "@scholarcrew/jobs": "workspace:*",
    "pg-boss": "^10.1.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "tsx": "^4.20.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

`apps/worker/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`apps/worker/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
```

`apps/worker/test/global-setup.ts`:

```ts
import { setupTestDatabase } from "@scholarcrew/db/testing";

export default setupTestDatabase;
```

`apps/worker/test/setup.ts`:

```ts
import { getTestDb, resetDb } from "@scholarcrew/db/testing";
import { beforeEach } from "vitest";

beforeEach(async () => {
  await resetDb(getTestDb());
});
```

Run: `pnpm install`
Expected: links the seven workspace packages, `pg-boss`, `zod`, `tsx`, `vitest`, and `typescript` into `apps/worker/node_modules`; no errors.

- [ ] **Step 2: Write the failing test**

`apps/worker/src/log.test.ts`:

```ts
import { AppError } from "@scholarcrew/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { errorLabel, log } from "./log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log", () => {
  it("writes one JSON line per call, errors to stderr", () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    log("info", "job.done", { name: "crew.request", ms: 12 });
    log("warn", "job.retry");
    log("error", "job.error", { name: "offer.parse" });
    expect(out.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
      { level: "info", msg: "job.done", name: "crew.request", ms: 12 },
      { level: "warn", msg: "job.retry" },
    ]);
    expect(JSON.parse(String(err.mock.calls[0]?.[0]))).toEqual({ level: "error", msg: "job.error", name: "offer.parse" });
  });
});

describe("errorLabel", () => {
  it("labels errors without their messages", () => {
    expect(errorLabel(new AppError("not_found", "Essay about my grandmother not found"))).toBe("code=not_found");
    expect(errorLabel(z.strictObject({ jobId: z.uuid() }).safeParse({}).error)).toBe("unknown");
    expect(errorLabel(new TypeError("secret text"))).toBe("unknown");
    expect(errorLabel("boom")).toBe("unknown");
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/log.test.ts`
Expected: FAIL with `Failed to resolve import "./log" from "src/log.test.ts"`.

- [ ] **Step 4: Write the implementation**

`apps/worker/src/log.ts`:

```ts
export { errorLabel } from "@scholarcrew/core/shared";

export type LogLevel = "info" | "warn" | "error";

/** JSON lines (00-overview §3). Callers never pass tokens, essay text, sensitive facts, or document bytes. */
export function log(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, msg, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}
```

- [ ] **Step 5: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/worker test -- src/log.test.ts && pnpm --filter @scholarcrew/worker typecheck`
Expected: PASS, 1 file, 2 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/package.json apps/worker/tsconfig.json apps/worker/vitest.config.ts apps/worker/test/global-setup.ts apps/worker/test/setup.ts apps/worker/src/log.ts apps/worker/src/log.test.ts
git commit -m "feat(worker): package scaffold, test wiring, JSON logger"
```

### L2: Calendar helpers and worker types

- [ ] **Step 1: Write the failing test**

`apps/worker/src/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_TIME_ZONE, localWeekdayHour, safeTimeZone } from "./time";

// todayIn comes from @scholarcrew/core/shared (R3V-9); 06 tests it.
describe("time helpers", () => {
  it("reads the local weekday (0 = Sunday) and hour", () => {
    expect(localWeekdayHour(new Date("2026-10-06T15:00:00.000Z"), "America/Chicago")).toEqual({ weekday: 2, hour: 10 });
    expect(localWeekdayHour(new Date("2026-10-11T21:00:00.000Z"), "America/Chicago")).toEqual({ weekday: 0, hour: 16 });
    expect(localWeekdayHour(new Date("2026-10-12T04:30:00.000Z"), "UTC")).toEqual({ weekday: 1, hour: 4 });
  });

  it("falls back to the default zone for unknown zones", () => {
    expect(safeTimeZone("America/New_York")).toBe("America/New_York");
    expect(safeTimeZone("Mars/Olympus_Mons")).toBe("UTC");
    expect(localWeekdayHour(new Date("2026-10-06T15:00:00.000Z"), "Mars/Olympus_Mons")).toEqual({ weekday: 2, hour: 15 });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/time.test.ts`
Expected: FAIL with `Failed to resolve import "./time" from "src/time.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/time.ts`:

```ts
import { safeTimeZone } from "@scholarcrew/core/shared";
export { safeTimeZone } from "@scholarcrew/core/shared";
export const DEFAULT_TIME_ZONE = "America/Chicago";

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Local weekday (0 = Sunday, matching notificationPrefs.digestDay) and hour (0–23). */
export function localWeekdayHour(now: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = WEEKDAYS[parts.find((p) => p.type === "weekday")?.value ?? ""] ?? 0;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return { weekday, hour };
}
```

`apps/worker/src/types.ts`:

```ts
import type { ModelClient } from "@scholarcrew/agents";
import type { CatalogDeps } from "@scholarcrew/catalog";
import type { CoreDeps, SmsSender } from "@scholarcrew/core/shared";

/** Everything a job handler needs. The pg-boss instance stays in main/app. */
export interface WorkerDeps {
  core: CoreDeps;
  model: ModelClient;
  catalog: CatalogDeps;
  /** NO-05 (R2I-9): Twilio, or the dev outbox when no TWILIO_* is set (src/sms.ts, L4). */
  sms: SmsSender;
}

/** pg-boss attempt metadata (work option includeMetadata: true). */
export interface JobContext {
  retryCount: number;
  retryLimit: number;
}

/** No retries left: handlers finish the job instead of rethrowing. */
export const NO_RETRY: JobContext = { retryCount: 0, retryLimit: 0 };

export type Handler = (deps: WorkerDeps, data: unknown, ctx?: JobContext) => Promise<void>;
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/worker test -- src/time.test.ts && pnpm --filter @scholarcrew/worker typecheck`
Expected: PASS, 1 file, 2 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/time.ts apps/worker/src/time.test.ts apps/worker/src/types.ts
git commit -m "feat(worker): calendar helpers and handler types"
```

### L3: Demo model client (demo-only, offline)

The demo model drives the real plan 09/10 runners, so these tests prove its answers pass the same schemas, guards, and checks a real reply must pass.

- [ ] **Step 1: Write the failing test**

`apps/worker/src/demo-model.test.ts`:

```ts
import { type ModelClient, runCrewRequest, runWeeklyPlan } from "@scholarcrew/agents";
import {
  consultSpecialist,
  makeConsult,
  runAppealOutline,
  runEssayReview,
  runOfferParse,
  runRetakeExplanation,
} from "@scholarcrew/agents/specialists";
import { JORDAN, createFakePort, jordanData } from "@scholarcrew/agents/testing";
import {
  CrewReply,
  type CrewRequestInput,
  type Deadline,
  type OfferColumn,
  ParsedOffer,
  PlanItemInput,
  QuillCommentDraft,
  SpecialistResult,
} from "@scholarcrew/domain";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DEMO_OFFER, NO_DEADLINES_TEXT, createDemoModelClient } from "./demo-model";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
const CONVERSATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02";
const OFFER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03";

function setup(port = createFakePort(), model: ModelClient = createDemoModelClient()) {
  const base = { model, port, now: () => NOW };
  return { base, deps: { ...base, consult: makeConsult(base) } };
}

/** The demo model with its first `n` submit inputs replaced by `{}`, which fails every submit schema (R3E-3). */
function breakSubmits(n: number): ModelClient {
  const demo = createDemoModelClient();
  let left = n;
  return {
    ...demo,
    async turn(req) {
      const t = await demo.turn(req);
      const content = t.content.map((b) => {
        if (b.type !== "tool_use" || !b.name.startsWith("submit_") || left === 0) return b;
        left -= 1;
        return { ...b, input: {} };
      });
      return { ...t, content };
    },
  };
}

const input = (o: Partial<CrewRequestInput> = {}): CrewRequestInput => ({
  jobId: JOB_ID,
  ownerId: JORDAN.ownerId,
  conversationId: CONVERSATION_ID,
  room: "my_crew",
  roomRef: null,
  audience: "crew",
  requester: { role: "student", firstName: "Jordan" },
  userText: "What should I do first?",
  history: [],
  mentions: [],
  ...o,
});

const UT_EA: Deadline = {
  kind: "application",
  title: "UT Austin · Early Action",
  dueOn: "2026-11-01",
  daysLeft: 26,
  refType: "college_list",
  refId: JORDAN.collegeEntryId,
  valueUsd: null,
  warning: false,
};

const STATE_U: OfferColumn = {
  offerId: OFFER_ID,
  collegeId: JORDAN.collegeId,
  collegeName: "State U",
  costOfAttendanceUsd: 27_800,
  freeMoneyUsd: 18_600,
  workStudyUsd: 2_000,
  loansUsd: 5_500,
  letterSaysOweUsd: 1_700,
  reallyCostsUsd: 9_200,
  fourYearUsd: 36_800,
  oneTimeFreeUsd: 0,
  warnings: [],
};

describe("demo model: Compass", () => {
  it("names the nearest deadline and offers one plan card", async () => {
    const { deps } = setup();
    const result = await runCrewRequest(deps, input());
    expect(result.status).toBe("ready");
    expect(CrewReply.safeParse(result.reply).success).toBe(true);
    expect(result.reply).toMatchObject({ contributors: ["compass"], safety: null, needsInput: false });
    expect(result.reply.text).toContain("Hill Country STEM Award on Oct 15 (9 days left)");
    expect(result.reply.actionCards).toEqual([
      {
        kind: "add_plan_item",
        id: "next-deadline",
        label: "Add to this week",
        item: {
          title: "Work on Hill Country STEM Award",
          kind: "scholarship",
          refType: "scholarship",
          refId: JORDAN.scholarshipId,
          minutes: 30,
          valueUsd: 1000,
          dueOn: "2026-10-15",
          contributors: ["compass"],
          weekStart: null,
        },
      },
    ]);
  });

  it("summarizes the next two deadlines in date order", async () => {
    const data = jordanData();
    const port = createFakePort({ snapshot: { ...data.snapshot, deadlines: [UT_EA, ...data.deadlines] } });
    const result = await runCrewRequest(setup(port).deps, input());
    expect(result.reply.text).toBe(
      "Your next two deadlines are Hill Country STEM Award on Oct 15 (9 days left) and UT Austin · Early Action on Nov 1 (26 days left). Start with Hill Country STEM Award.",
    );
    expect(result.reply.actionCards).toHaveLength(1);
  });

  it("says so when there are no deadlines", async () => {
    const data = jordanData();
    const port = createFakePort({ snapshot: { ...data.snapshot, deadlines: [] } });
    const result = await runCrewRequest(setup(port).deps, input({ audience: "family", room: "family" }));
    expect(result.reply).toMatchObject({ text: NO_DEADLINES_TEXT, actionCards: [], safety: null });
  });

  it("answers the retry after one invalid submit_reply (R3E-3)", async () => {
    const result = await runCrewRequest(setup(createFakePort(), breakSubmits(1)).deps, input());
    expect(result).toMatchObject({ status: "ready", safety: null });
    expect(result.reply.text).toContain("Hill Country STEM Award on Oct 15 (9 days left)");
    expect(result.reply.actionCards).toHaveLength(1);
  });

  it("fails the request safely after two invalid submit_reply inputs (R3E-3)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const result = await runCrewRequest(setup(createFakePort(), breakSubmits(2)).deps, input());
    expect(result).toMatchObject({ status: "failed", safety: "partial", consulted: [] });
    // 09's OUT_OF_TIME_TEXT; 12 completes the job as failed and doesn't count the request (L6).
    expect(result.reply).toMatchObject({
      text: "I ran out of time on that one. Want me to try a narrower question?",
      actionCards: [],
      needsInput: true,
    });
    expect(CrewReply.safeParse(result.reply).success).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"msg":"crew.invalid_submit"'));
    log.mockRestore();
  });
});

describe("demo model: weekly plan and specialists", () => {
  it("plans 2 items from deadlines, padded with a filler", async () => {
    const result = await runWeeklyPlan(setup().deps, { ownerId: JORDAN.ownerId, weekStart: "2026-10-12" });
    expect(result.items.map((i) => i.title)).toEqual(["Work on Hill Country STEM Award", "Spend 20 minutes on your Story Bank"]);
    for (const item of result.items) expect(PlanItemInput.safeParse(item).success).toBe(true);
    expect(result.items.every((i) => i.weekStart === "2026-10-12")).toBe(true);
    expect(result.reply?.text).toBe("Here's your week: 2 steps, nearest deadline first.");
  });

  it("returns a valid one-line specialist result", async () => {
    const out = await consultSpecialist(setup().base, {
      role: "atlas",
      question: "Which application is due first?",
      ownerId: JORDAN.ownerId,
      audience: "crew",
      context: jordanData().snapshot,
    });
    expect(SpecialistResult.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ role: "atlas", summary: "Atlas checked your records and has nothing urgent to add." });
  });
});

describe("demo model: job runs", () => {
  it("leaves one Quill question quoting the draft's first sentence", async () => {
    const essay = jordanData().essays[0]!;
    const { comments, refused } = await runEssayReview(setup().base, { ownerId: JORDAN.ownerId, essayId: JORDAN.essayId, version: essay.currentVersion, body: essay.body, context: essay });
    expect(refused).toBe(false);
    expect(comments).toHaveLength(1);
    expect(QuillCommentDraft.safeParse(comments[0]).success).toBe(true);
    expect(comments[0]).toMatchObject({
      quote: "When our robot died at regionals, I learned that a team can rebuild faster than it can blame.",
      occurrence: 1,
      kind: "question",
    });
  });

  it("parses the fixed State U sample letter", async () => {
    const result = await runOfferParse(setup().base, {
      ownerId: JORDAN.ownerId,
      pdfBase64: Buffer.from("%PDF-1.4 demo").toString("base64"),
      collegeName: "State U",
    });
    expect(result).toEqual({ parsed: DEMO_OFFER, refused: false });
    expect(ParsedOffer.safeParse(DEMO_OFFER).success).toBe(true);
    const free = DEMO_OFFER.lines.filter((l) => l.category === "grant" || l.category === "scholarship");
    expect(free.reduce((sum, l) => sum + l.amountUsd, 0)).toBe(18_600);
  });

  it("writes a safe appeal outline and retake explanation", async () => {
    const port = createFakePort({ offers: { columns: [STATE_U], lowestFourYearOfferId: OFFER_ID, assumptions: [] } });
    const appeal = await runAppealOutline(setup(port).base, { ownerId: JORDAN.ownerId, offerId: OFFER_ID });
    expect(appeal.safety).toBeNull();
    expect(appeal.text).toContain("Points to raise");
    const retake = await runRetakeExplanation(setup().base, {
      ownerId: JORDAN.ownerId,
      analysis: { test: "ACT", currentComposite: 29, targetComposite: 31, rows: [], totalFourYearDeltaUsd: 0 },
    });
    expect(retake).toMatchObject({ contributors: ["prep"], safety: null });
    expect(CrewReply.safeParse(retake).success).toBe(true);
  });

  it("returns no value for extraction roles other than Aid", async () => {
    const model = createDemoModelClient();
    const res = await model.extract({
      role: "catalog",
      system: "S",
      content: [],
      schema: z.strictObject({ n: z.number() }),
      effort: "low",
      maxTokens: 100,
    });
    expect(res).toMatchObject({ value: null, refused: false });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/demo-model.test.ts`
Expected: FAIL with `Failed to resolve import "./demo-model" from "src/demo-model.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/demo-model.ts`:

```ts
import type { ModelClient, ModelRequest } from "@scholarcrew/agents";
import { type ScriptedTurn, createScriptedModelClient } from "@scholarcrew/agents/testing";
import { calendarShort } from "@scholarcrew/core/shared";
import {
  CREW_NAMES,
  ContextSnapshot,
  type CrewReply,
  type Deadline,
  type ParsedOffer,
  type PlanItemInput,
  type QuillCommentDraft,
  SpecialistRole,
  type SpecialistResult,
} from "@scholarcrew/domain";
import type { z } from "zod";

/*
 * DEMO ONLY. A deterministic, offline stand-in for the Anthropic API, used when SCHOLARCREW_FAKE_MODEL=1
 * (local dev without an API key, and the e2e suite). It reads the same requests the real model gets and
 * answers with schema-valid submit calls built from the request's own data. It is not coaching advice and
 * must never run in production.
 */

export const NO_DEADLINES_TEXT =
  "Nothing on your list has a deadline yet. Save a scholarship or add a college and I'll keep track of the dates.";

/** Fixed sample matching the State U column of the money mockup (06_money.html). */
export const DEMO_OFFER: ParsedOffer = {
  costOfAttendanceUsd: 27_800,
  awardYear: "2027-28",
  lines: [
    {
      label: "Federal Pell Grant",
      amountUsd: 7_395,
      category: "grant",
      renewable: true,
      renewalCondition: "File the FAFSA each year",
      page: 1,
      citedText: "Federal Pell Grant $7,395",
    },
    {
      label: "State U Opportunity Grant",
      amountUsd: 8_205,
      category: "grant",
      renewable: true,
      renewalCondition: "",
      page: 1,
      citedText: "State U Opportunity Grant $8,205",
    },
    {
      label: "State U Merit Award",
      amountUsd: 3_000,
      category: "scholarship",
      renewable: true,
      renewalCondition: "Keep a 3.0 GPA",
      page: 1,
      citedText: "State U Merit Award $3,000 (renewable with a 3.0 GPA)",
    },
    {
      label: "Federal Work-Study",
      amountUsd: 2_000,
      category: "work_study",
      renewable: false,
      renewalCondition: "",
      page: 2,
      citedText: "Federal Work-Study $2,000",
    },
    {
      label: "Direct Subsidized Loan",
      amountUsd: 3_500,
      category: "loan_federal_subsidized",
      renewable: false,
      renewalCondition: "",
      page: 2,
      citedText: "Direct Subsidized Loan $3,500",
    },
    {
      label: "Direct Unsubsidized Loan",
      amountUsd: 2_000,
      category: "loan_federal_unsubsidized",
      renewable: false,
      renewalCondition: "",
      page: 2,
      citedText: "Direct Unsubsidized Loan $2,000",
    },
  ],
};

const APPEAL_TEXT = [
  "Points to raise",
  "- Ask the office to review your offer and say what changed for your family, if anything did.",
  "- Mention any lower cost at another college, using the numbers in your comparison.",
  "Documents to gather",
  "- This award letter and any competing award letters.",
  "- Your FAFSA Submission Summary.",
  "Who to contact",
  "- The college's financial aid office. Ask how they handle appeals and whether they use a form.",
  "Timeline",
  "- Reach out this week, before the enrollment deposit deadline.",
].join("\n");

const RETAKE_TEXT =
  "Here's what the retake numbers say for your list. Look at the table for each college, then confirm its merit rules on its own site before you register.";

const FILLERS: PlanItemInput[] = [
  {
    title: "Spend 20 minutes on your Story Bank",
    kind: "custom",
    refType: null,
    refId: null,
    minutes: 20,
    valueUsd: null,
    dueOn: null,
    contributors: ["compass"],
    weekStart: null,
  },
  {
    title: "Save one new scholarship to your board",
    kind: "custom",
    refType: null,
    refId: null,
    minutes: 15,
    valueUsd: null,
    dueOn: null,
    contributors: ["compass"],
    weekStart: null,
  },
];

type TextLike = { type?: unknown; text?: unknown };

function userTexts(req: ModelRequest): string[] {
  const out: string[] = [];
  for (const m of req.messages) {
    if (m.role !== "user") continue;
    if (typeof m.content === "string") {
      out.push(m.content);
      continue;
    }
    for (const b of m.content as unknown as TextLike[]) {
      if (b.type === "text" && typeof b.text === "string") out.push(b.text);
    }
  }
  return out;
}

/** The body of the first `<untrusted label="...">` block with this label, or null. */
export function untrustedBlock(req: ModelRequest, label: string): string | null {
  const open = `<untrusted label="${label}">`;
  for (const text of userTexts(req)) {
    const start = text.indexOf(open);
    const end = text.lastIndexOf("</untrusted>");
    if (start !== -1 && end > start) return text.slice(start + open.length, end);
  }
  return null;
}

function snapshotOf(req: ModelRequest): ContextSnapshot | null {
  const raw = untrustedBlock(req, "student_context");
  if (raw === null) return null;
  try {
    const parsed = ContextSnapshot.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function upcoming(s: ContextSnapshot | null): Deadline[] {
  return [...(s?.deadlines ?? [])].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title));
}

function daysText(daysLeft: number): string {
  if (daysLeft <= 0) return "due today";
  return daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
}

/** "Oct 15", like the web's dateShort (R3E-12). */
function describeDeadline(d: Deadline): string {
  return `${d.title} on ${calendarShort(d.dueOn)} (${daysText(d.daysLeft)})`;
}

function planItemFor(d: Deadline): PlanItemInput {
  return {
    title: `Work on ${d.title}`.slice(0, 120),
    kind: d.kind,
    refType: d.refType,
    refId: d.refId,
    minutes: 30,
    valueUsd: d.valueUsd,
    dueOn: d.dueOn,
    contributors: ["compass"],
    weekStart: null,
  };
}

function reply(text: string, o: Partial<CrewReply> = {}): CrewReply {
  return {
    text: text.slice(0, 2000),
    contributors: ["compass"],
    question: null,
    actionCards: [],
    receipt: [],
    safety: null,
    needsInput: false,
    ...o,
  };
}

function compassReply(s: ContextSnapshot | null): CrewReply {
  const [first, second] = upcoming(s);
  if (!first) return reply(NO_DEADLINES_TEXT);
  const text = second
    ? `Your next two deadlines are ${describeDeadline(first)} and ${describeDeadline(second)}. Start with ${first.title}.`
    : `Your next deadline is ${describeDeadline(first)}. Start there this week.`;
  return reply(text, {
    actionCards: [{ kind: "add_plan_item", id: "next-deadline", label: "Add to this week", item: planItemFor(first) }],
  });
}

function weeklyPlan(s: ContextSnapshot | null): { items: PlanItemInput[]; reply: CrewReply } {
  const items = upcoming(s).slice(0, 3).map(planItemFor);
  for (const filler of FILLERS) {
    if (items.length >= 2) break;
    items.push(filler);
  }
  return { items, reply: reply(`Here's your week: ${items.length} steps, nearest deadline first.`) };
}

function specialistResult(role: string): SpecialistResult {
  const parsed = SpecialistRole.safeParse(role);
  const r = parsed.success ? parsed.data : "scout";
  return {
    role: r,
    summary: `${CREW_NAMES[r]} checked your records and has nothing urgent to add.`,
    proposedActions: [],
    factsUsed: [],
    uncertainty: [],
    needsPermission: [],
  };
}

function quillComments(draft: string | null): QuillCommentDraft[] {
  const body = (draft ?? "").trimStart();
  const sentence = /^[^.!?\n]*[.!?]/.exec(body)?.[0] ?? body.split("\n")[0] ?? "";
  const quote = sentence.trim().slice(0, 400);
  if (!quote) return [];
  return [
    {
      quote,
      occurrence: 1,
      kind: "question",
      body: "What were you feeling right at this moment? One concrete detail here would help a reader picture it.",
    },
  ];
}

function submit(name: string, input: unknown): ScriptedTurn {
  return { content: [{ type: "tool_use", name, input }] };
}

const NOTHING: ScriptedTurn = { content: [{ type: "text", text: "The demo crew has nothing to add." }] };

function answer(req: ModelRequest): ScriptedTurn {
  // extract() calls reach the script with no tools.
  if (req.tools.length === 0) return { extract: req.role === "aid" ? DEMO_OFFER : null };
  const names = new Set(req.tools.map((t) => t.name));
  if (names.has("submit_plan")) return submit("submit_plan", weeklyPlan(snapshotOf(req)));
  if (names.has("submit_comments")) {
    const comments = quillComments(untrustedBlock(req, "essay_draft"));
    return comments.length > 0 ? submit("submit_comments", { comments }) : NOTHING;
  }
  if (names.has("submit_result")) return submit("submit_result", specialistResult(req.role));
  if (names.has("submit_reply")) {
    if (req.role === "aid") return submit("submit_reply", reply(APPEAL_TEXT, { contributors: ["aid", "ledger"] }));
    if (req.role === "prep") return submit("submit_reply", reply(RETAKE_TEXT, { contributors: ["prep"] }));
    return submit("submit_reply", compassReply(snapshotOf(req)));
  }
  return NOTHING;
}

type ExtractInput<T> = Omit<Parameters<ModelClient["extract"]>[0], "schema"> & { schema: z.ZodType<T> };

/** Demo-only ModelClient. Clears the scripted client's request log after each call. */
export function createDemoModelClient(): ModelClient {
  const inner = createScriptedModelClient(answer);
  return {
    async turn(req) {
      try {
        return await inner.turn(req);
      } finally {
        inner.requests.length = 0;
      }
    },
    async extract<T>(req: ExtractInput<T>) {
      try {
        return await inner.extract(req);
      } finally {
        inner.extractRequests.length = 0;
      }
    },
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/worker test -- src/demo-model.test.ts && pnpm --filter @scholarcrew/worker typecheck`
Expected: PASS, 1 file, 11 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/demo-model.ts apps/worker/src/demo-model.test.ts
git commit -m "feat(worker): deterministic offline demo model for dev and e2e"
```

### L4: Worker deps from env, and test helpers

- [ ] **Step 1: Write the failing test**

`apps/worker/src/deps.test.ts`:

```ts
import { eq, devOutbox } from "@scholarcrew/db";
import { getTestDb, testDatabaseUrl } from "@scholarcrew/db/testing";
import { ParsedOffer } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { DEMO_OFFER } from "./demo-model";
import { allowedDomains, buildWorkerDeps } from "./deps";

const KEY = "ab".repeat(32);
const env = (o: Record<string, string | undefined> = {}) => ({
  DATABASE_URL: testDatabaseUrl(),
  ENCRYPTION_KEY: KEY,
  SCHOLARCREW_FAKE_MODEL: "1",
  RESEND_API_KEY: "",
  ...o,
});

describe("buildWorkerDeps", () => {
  it("refuses to start without required config", () => {
    expect(() => buildWorkerDeps(env({ DATABASE_URL: undefined }))).toThrow("DATABASE_URL is not set");
    expect(() => buildWorkerDeps(env({ ENCRYPTION_KEY: "short" }))).toThrow("ENCRYPTION_KEY must be 64 hex characters");
    expect(() => buildWorkerDeps(env({ SCHOLARCREW_FAKE_MODEL: "0", ANTHROPIC_API_KEY: "" }))).toThrow(
      "ANTHROPIC_API_KEY is not set",
    );
  });

  it("uses the demo model, catalog fakes, and the dev outbox in fake mode", async () => {
    const built = buildWorkerDeps(env({ CATALOG_ALLOWED_DOMAINS: " a.org, ,b.org " }));
    try {
      expect(built.fakeModel).toBe(true);
      const res = await built.model.extract({
        role: "aid",
        system: "S",
        content: [],
        schema: ParsedOffer,
        effort: "high",
        maxTokens: 100,
      });
      expect(res.value).toEqual(DEMO_OFFER);
      expect(await built.catalog.researcher.findCandidates({ state: "TX", allowedDomains: [] })).toEqual([]);
      expect(built.catalog.allowedDomains).toEqual(["a.org", "b.org"]);
      expect(typeof built.catalog.onUsage).toBe("function");
      expect(built.core.config).toMatchObject({ appUrl: "http://localhost:3000", sessionDays: 30 });
      expect(built.core.config.encryptionKey.equals(Buffer.from(KEY, "hex"))).toBe(true);
      expect(built.core.stripe).toBeNull();
      await built.core.email.send({ to: "Jordan@Example.test", subject: "Hi", text: "Body" });
      const rows = await getTestDb().select().from(devOutbox).where(eq(devOutbox.to, "jordan@example.test"));
      expect(rows).toHaveLength(1);
    } finally {
      await built.close();
    }
  });

  it("builds the real clients without touching the network", async () => {
    const built = buildWorkerDeps(env({ SCHOLARCREW_FAKE_MODEL: "0", ANTHROPIC_API_KEY: "sk-ant-test-key", APP_URL: "https://scholarcrew.example" }));
    try {
      expect(built.fakeModel).toBe(false);
      expect(typeof built.model.turn).toBe("function");
      expect(typeof built.catalog.fetchPage).toBe("function");
      expect(typeof built.catalog.onUsage).toBe("function");
      expect(built.core.config.appUrl).toBe("https://scholarcrew.example");
    } finally {
      await built.close();
    }
  });
});

describe("allowedDomains", () => {
  it("drops blanks", () => {
    expect(allowedDomains(undefined)).toEqual([]);
    expect(allowedDomains("")).toEqual([]);
    expect(allowedDomains("example.org,  scholarships.example.com ,")).toEqual(["example.org", "scholarships.example.com"]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/deps.test.ts`
Expected: FAIL with `Failed to resolve import "./deps" from "src/deps.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/deps.ts`:

```ts
import { type ModelClient, createModelClient } from "@scholarcrew/agents";
import {
  type CatalogDeps,
  createAnthropicBatchGateway,
  createAnthropicResearcher,
  createFetchPage,
} from "@scholarcrew/catalog";
import { createFakeBatchGateway, createFakeFetchPage, createFakeResearcher } from "@scholarcrew/catalog/testing";
import { recordAgentRun } from "@scholarcrew/core/crew";
import { type CoreDeps, devOutboxEmailSender, resendEmailSender, systemClock } from "@scholarcrew/core/shared";
import { createDb } from "@scholarcrew/db";
import { systemActor } from "@scholarcrew/domain";
import { createJobsClient, createPgBoss } from "@scholarcrew/jobs";
import type PgBoss from "pg-boss";
import { createDemoModelClient } from "./demo-model";
import { devOutboxSmsSender, twilioSmsSender } from "./sms";
import type { WorkerDeps } from "./types";

export type WorkerEnv = Record<string, string | undefined>;

export interface BuiltWorker extends WorkerDeps {
  /** The worker's own pg-boss (role "worker": runs maintenance and cron). Started by startWorker. */
  boss: PgBoss;
  fakeModel: boolean;
  close(): Promise<void>;
}

const DEFAULT_FROM = "ScholarCrew <crew@scholarcrew.example>";

function required(env: WorkerEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

function encryptionKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  return Buffer.from(hex, "hex");
}

export function allowedDomains(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}

const CATALOG_ACTOR = systemActor("worker:catalog");

export const TWILIO_PARTIAL_ERROR = "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM must all be set or all be empty";

/**
 * NO-05 (R2I-9, 00 §4): all three TWILIO_* set → Twilio; all three empty → null (the dev outbox); anything
 * else throws, so a half-configured worker never starts and silently drops texts.
 */
export function twilioConfig(env: WorkerEnv): { accountSid: string; authToken: string; from: string } | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  const authToken = env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  const from = env.TWILIO_FROM?.trim() ?? "";
  const set = [accountSid, authToken, from].filter((v) => v.length > 0).length;
  if (set === 0) return null;
  if (set < 3) throw new Error(TWILIO_PARTIAL_ERROR);
  return { accountSid, authToken, from };
}

/** D20, AG-06: one agent_runs row per catalog model call (no job, no user). Plan 11's reportUsage catches failures. */
export function catalogUsageRecorder(core: CoreDeps): NonNullable<CatalogDeps["onUsage"]> {
  return (role, t) =>
    recordAgentRun(core, CATALOG_ACTOR, {
      jobId: null,
      userId: null,
      role,
      model: t.model,
      inputTokens: t.usage.inputTokens,
      outputTokens: t.usage.outputTokens,
      cacheReadTokens: t.usage.cacheReadTokens,
      cacheWriteTokens: t.usage.cacheWriteTokens,
      stopReason: t.stopReason,
      costMicros: Math.max(0, Math.round(t.usage.costMicros)),
      durationMs: Math.max(0, Math.round(t.durationMs)),
    });
}

/** The only place the worker reads configuration. Nothing here connects; pg-boss starts in startWorker. */
export function buildWorkerDeps(env: WorkerEnv = process.env): BuiltWorker {
  const databaseUrl = required(env, "DATABASE_URL");
  const key = encryptionKey(required(env, "ENCRYPTION_KEY"));
  const fakeModel = env.SCHOLARCREW_FAKE_MODEL?.trim() === "1";
  const apiKey = env.ANTHROPIC_API_KEY?.trim() || undefined;
  if (!fakeModel && !apiKey) throw new Error("ANTHROPIC_API_KEY is not set (or set SCHOLARCREW_FAKE_MODEL=1)");
  // Checked before the pool exists, so a bad TWILIO_* set throws without leaving connections open.
  const twilio = twilioConfig(env);

  const database = createDb(databaseUrl, { max: 10 });
  const db = database.db;
  const boss = createPgBoss(databaseUrl);
  const resendKey = env.RESEND_API_KEY?.trim();
  const core: CoreDeps = {
    db,
    jobs: createJobsClient(boss),
    clock: systemClock(),
    email: resendKey ? resendEmailSender(resendKey, env.EMAIL_FROM?.trim() || DEFAULT_FROM) : devOutboxEmailSender(db),
    config: {
      appUrl: env.APP_URL?.trim() || "http://localhost:3000",
      encryptionKey: key,
      sessionDays: 30,
      stripePriceFamily: env.STRIPE_PRICE_FAMILY ?? "",
      stripePriceSeason: env.STRIPE_PRICE_SEASON ?? "",
      stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
    },
    stripe: null,
  };

  const model: ModelClient = fakeModel ? createDemoModelClient() : createModelClient({ apiKey });
  const domains = allowedDomains(env.CATALOG_ALLOWED_DOMAINS);
  const now = () => core.clock.now();
  const onUsage = catalogUsageRecorder(core);
  const catalog: CatalogDeps = fakeModel
    ? {
        db,
        model,
        fetchPage: createFakeFetchPage({}),
        anthropicBatches: createFakeBatchGateway(),
        researcher: createFakeResearcher([]),
        now,
        allowedDomains: domains,
        onUsage,
      }
    : {
        db,
        model,
        fetchPage: createFetchPage(),
        anthropicBatches: createAnthropicBatchGateway(apiKey),
        researcher: createAnthropicResearcher(apiKey, onUsage),
        now,
        allowedDomains: domains,
        onUsage,
      };

  return {
    core,
    model,
    catalog,
    sms: twilio ? twilioSmsSender(twilio) : devOutboxSmsSender(db),
    boss,
    fakeModel,
    async close() {
      await database.close();
    },
  };
}
```

`apps/worker/src/sms.ts` (NO-05, R2I-9; the phone number is never logged):

```ts
import type { SmsSender } from "@scholarcrew/core/shared";
import { type Db, devOutbox } from "@scholarcrew/db";

export const TWILIO_API = "https://api.twilio.com/2010-04-01";
export const SMS_TIMEOUT_MS = 10_000;

/** Twilio's REST API over fetch (00 §2). A non-2xx response throws `twilio <status> <code>`, never the message text. */
export function twilioSmsSender(o: { accountSid: string; authToken: string; from: string; fetchImpl?: typeof fetch }): SmsSender {
  const fetchImpl = o.fetchImpl ?? fetch;
  const url = `${TWILIO_API}/Accounts/${encodeURIComponent(o.accountSid)}/Messages.json`;
  const authorization = `Basic ${Buffer.from(`${o.accountSid}:${o.authToken}`).toString("base64")}`;
  return {
    async send(m) {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { Authorization: authorization, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: m.to, From: o.from, Body: m.text }),
        signal: AbortSignal.timeout(SMS_TIMEOUT_MS),
      });
      if (res.ok) return;
      // Twilio's error `message` can quote the phone number, so only the numeric code is kept.
      let code = "unknown";
      try {
        const body = (await res.json()) as { code?: unknown };
        if (typeof body.code === "number" || typeof body.code === "string") code = String(body.code);
      } catch {
        // Not JSON; keep "unknown".
      }
      throw new Error(`twilio ${res.status} ${code}`);
    },
  };
}

/** Local dev and tests: each text lands in dev_outbox with subject "SMS". */
export function devOutboxSmsSender(db: Db): SmsSender {
  return {
    async send(m) {
      await db.insert(devOutbox).values({ to: m.to, subject: "SMS", text: m.text });
    },
  };
}
```

`apps/worker/src/sms.test.ts`:

```ts
import { devOutbox, eq } from "@scholarcrew/db";
import { getTestDb, testDatabaseUrl } from "@scholarcrew/db/testing";
import { describe, expect, it, vi } from "vitest";
import { TWILIO_PARTIAL_ERROR, buildWorkerDeps, twilioConfig } from "./deps";
import { devOutboxSmsSender, twilioSmsSender } from "./sms";

const PHONE = "+15125550100";
const FROM = "+15125550000";
const KEY = "ab".repeat(32);
const env = (o: Record<string, string | undefined> = {}) => ({
  DATABASE_URL: testDatabaseUrl(),
  ENCRYPTION_KEY: KEY,
  SCHOLARCREW_FAKE_MODEL: "1",
  ...o,
});

describe("twilioSmsSender", () => {
  it("posts a form-encoded message with Basic auth and a timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ sid: "SM1" }), { status: 201 }));
    await twilioSmsSender({ accountSid: "AC123", authToken: "secret", from: FROM, fetchImpl }).send({ to: PHONE, text: "ScholarCrew: hi" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Basic ${Buffer.from("AC123:secret").toString("base64")}`);
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({ To: PHONE, From: FROM, Body: "ScholarCrew: hi" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws on a non-2xx response without the phone number in the error", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ code: 21211, message: `The 'To' number ${PHONE} is not valid.` }), { status: 400 }),
    );
    const sms = twilioSmsSender({ accountSid: "AC123", authToken: "secret", from: FROM, fetchImpl });
    const error = await sms.send({ to: PHONE, text: "x" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("twilio 400 21211");
    expect((error as Error).message).not.toContain("5125550100");
  });
});

describe("devOutboxSmsSender", () => {
  it("writes one dev_outbox row with subject SMS", async () => {
    const db = getTestDb();
    await devOutboxSmsSender(db).send({ to: PHONE, text: "ScholarCrew: hi" });
    const rows = await db.select().from(devOutbox).where(eq(devOutbox.to, PHONE));
    expect(rows.map((r) => [r.subject, r.text])).toEqual([["SMS", "ScholarCrew: hi"]]);
  });
});

describe("buildWorkerDeps SMS config", () => {
  it("uses Twilio with all three TWILIO_* set, the dev outbox with none, and refuses a partial set", async () => {
    const FULL = { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "secret", TWILIO_FROM: FROM };
    expect(twilioConfig(env(FULL))).toEqual({ accountSid: "AC123", authToken: "secret", from: FROM });
    expect(twilioConfig(env({ TWILIO_ACCOUNT_SID: " ", TWILIO_AUTH_TOKEN: "", TWILIO_FROM: undefined }))).toBeNull();
    expect(() => buildWorkerDeps(env({ TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "", TWILIO_FROM: "" }))).toThrow(
      TWILIO_PARTIAL_ERROR,
    );
    expect(TWILIO_PARTIAL_ERROR).toBe("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM must all be set or all be empty");
    const full = buildWorkerDeps(env(FULL));
    expect(typeof full.sms.send).toBe("function");
    await full.close();
    const dev = buildWorkerDeps(env());
    try {
      await dev.sms.send({ to: PHONE, text: "ScholarCrew: dev" });
      expect(await getTestDb().select().from(devOutbox).where(eq(devOutbox.to, PHONE))).toHaveLength(1);
    } finally {
      await dev.close();
    }
  });
});
```

`apps/worker/test/helpers.ts`:

```ts
import type { ModelClient } from "@scholarcrew/agents";
import type { CatalogDeps } from "@scholarcrew/catalog";
import { createFakeBatchGateway, createFakeFetchPage, createFakeResearcher } from "@scholarcrew/catalog/testing";
import { TEST_NOW, createTestDeps, fixedClock } from "@scholarcrew/core/shared";
import { type Db, desc, devOutbox, eq } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type SystemActor, type UserActor, systemActor, userActor } from "@scholarcrew/domain";
import { createDemoModelClient } from "../src/demo-model";
import { catalogUsageRecorder } from "../src/deps";
import { devOutboxSmsSender } from "../src/sms";
import type { WorkerDeps } from "../src/types";

export const SYSTEM: SystemActor = systemActor("test");

/** Worker deps over the test DB: memory jobs, fixed clock (TEST_NOW), dev outbox (email and SMS), demo model, inert catalog fakes. */
export function makeWorkerDeps(o: { model?: ModelClient; catalog?: Partial<CatalogDeps> } = {}) {
  const clock = fixedClock(TEST_NOW);
  const core = createTestDeps({ clock });
  const model = o.model ?? createDemoModelClient();
  const catalog: CatalogDeps = {
    db: core.db,
    model,
    fetchPage: createFakeFetchPage({}),
    anthropicBatches: createFakeBatchGateway(),
    researcher: createFakeResearcher([]),
    now: () => clock.now(),
    allowedDomains: [],
    onUsage: catalogUsageRecorder(core),
    ...o.catalog,
  };
  const deps: WorkerDeps = { core, model, catalog, sms: devOutboxSmsSender(core.db) };
  return { deps, core, clock };
}

export async function makeStudent(db: Db, o: Parameters<typeof factories.student>[1] = {}) {
  const { user, profile } = await factories.student(db, o);
  const actor: UserActor = userActor(user.id, "student");
  return { user, profile, actor };
}

export async function emailsTo(db: Db, to: string) {
  return db
    .select()
    .from(devOutbox)
    .where(eq(devOutbox.to, to.toLowerCase()))
    .orderBy(desc(devOutbox.createdAt));
}

/** A model whose every call throws `error` (API failures, rate limits). */
export function failingModel(error: unknown): ModelClient {
  return {
    async turn() {
      throw error;
    },
    async extract() {
      throw error;
    },
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/worker test -- src/deps.test.ts src/sms.test.ts && pnpm --filter @scholarcrew/worker typecheck`
Expected: PASS, 2 files, 8 tests (4 deps, 4 sms); `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/deps.ts apps/worker/src/deps.test.ts apps/worker/src/sms.ts apps/worker/src/sms.test.ts apps/worker/test/helpers.ts
git commit -m "feat(worker): build deps from env with fake-model mode and an SMS sender"
```

### L5: CrewDataPort over core services

- [ ] **Step 1: Write the failing test**

`apps/worker/src/port.test.ts`:

```ts
import { addCollege } from "@scholarcrew/core/colleges";
import { createFact, recordDecision, setSensitiveFact } from "@scholarcrew/core/memory";
import { saveScholarship } from "@scholarcrew/core/scholarships";
import { activities, and, eq, inArray, planItems, shareSettings, testScores } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { ContextSnapshot, type FactValue, type FactVisibility, type ShareCategory } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { makeStudent, makeWorkerDeps } from "../test/helpers";
import { createCrewDataPort } from "./port";

const fact = (key: string, value: FactValue, visibility: FactVisibility) => ({
  key,
  value,
  visibility,
  source: "user_stated" as const,
  sourceRef: null,
});

async function setup() {
  const { core } = makeWorkerDeps();
  const student = await makeStudent(core.db, { state: "TX", county: "Maple" });
  return { core, port: createCrewDataPort(core), ...student };
}

async function unshare(s: Awaited<ReturnType<typeof setup>>, categories: ShareCategory[]) {
  await s.core.db
    .update(shareSettings)
    .set({ enabled: false })
    .where(and(eq(shareSettings.studentId, s.user.id), inArray(shareSettings.category, categories)));
}

/** One record in every category the port reads. */
async function seedRecords(s: Awaited<ReturnType<typeof setup>>) {
  const college = await factories.college(s.core.db, { name: "State U" });
  await addCollege(s.core, s.actor, { collegeId: college.id, fit: "target", plan: "RD" });
  await s.core.db.insert(activities).values({ ownerId: s.user.id, position: 0, name: "Robotics" });
  await s.core.db.insert(testScores).values({
    ownerId: s.user.id,
    test: "ACT",
    takenOn: "2026-06-13",
    official: true,
    composite: 29,
    sections: {},
  });
  await s.core.db
    .insert(planItems)
    .values({ ownerId: s.user.id, weekStart: "2026-10-05", title: "Outline the essay", kind: "custom", minutes: 30 });
  await factories.story(s.core.db, s.user.id);
  const essay = await factories.essay(s.core.db, s.user.id);
  const parent = await factories.parent(s.core.db);
  await factories.family(s.core.db, { studentIds: [s.user.id], parentIds: [parent.id] });
  return { essay };
}

async function seedMemory(s: Awaited<ReturnType<typeof setup>>) {
  await createFact(s.core, s.actor, fact("dream_school", "Rice", "crew"));
  await createFact(s.core, s.actor, fact("favorite_subject", "Physics", "crew_family"));
  await createFact(s.core, s.actor, fact("private_note", "Nervous about interviews", "private"));
  await setSensitiveFact(s.core, s.actor, { kind: "income_range", enabled: true, value: "under_30k" });
  await setSensitiveFact(s.core, s.actor, { kind: "heritage", enabled: true, value: ["Mexican-American"] });
  await recordDecision(s.core, s.actor, { summary: "Apply EA to State U", rationale: "" });
  const listing = await factories.scholarship(s.core.db, { name: "Maple County STEM Award", deadline: "2026-10-20" });
  await saveScholarship(s.core, s.actor, { scholarshipId: listing.id });
  return listing;
}

describe("snapshot", () => {
  it("builds the crew snapshot without sensitive or private facts", async () => {
    const s = await setup();
    await seedMemory(s);
    const snap = await s.port.snapshot(s.user.id, "my_crew", "crew");
    expect(ContextSnapshot.safeParse(snap).success).toBe(true);
    expect(snap).toMatchObject({
      ownerId: s.user.id,
      displayName: "Test Student",
      today: "2026-10-06",
      timeZone: "America/Chicago",
      audience: "crew",
      room: "my_crew",
      roomRef: null,
      profile: { classYear: 2027, state: "TX", county: "Maple", gpa: 3.72 },
      enabledSpecialists: ["scout", "atlas", "quill", "aid", "ledger"],
    });
    expect(snap.facts.map((f) => [f.key, f.value])).toEqual([
      ["dream_school", "Rice"],
      ["favorite_subject", "Physics"],
    ]);
    expect(snap.decisions.map((d) => d.summary)).toEqual(["Apply EA to State U"]);
    expect(snap.deadlines.map((d) => d.title)).toContain("Maple County STEM Award");
    expect(snap.weekPlan.weekStart).toBe("2026-10-05");
    const json = JSON.stringify(snap);
    for (const secret of ["under_30k", "Mexican-American", "income_range", "heritage", "Nervous about interviews"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("gives family only family-visible facts and the categories the student shares", async () => {
    const s = await setup();
    await seedMemory(s);
    const parent = await factories.parent(s.core.db);
    await factories.family(s.core.db, { studentIds: [s.user.id], parentIds: [parent.id] });
    const fam = await s.port.snapshot(s.user.id, "family", "family");
    expect(fam.audience).toBe("family");
    expect(fam.facts.map((f) => f.key)).toEqual(["favorite_subject"]);
    expect(fam.decisions).toEqual([]);
    expect(fam.deadlines).toHaveLength(1);
    expect(JSON.stringify(fam)).not.toContain("under_30k");

    await s.core.db
      .update(shareSettings)
      .set({ enabled: false })
      .where(and(eq(shareSettings.studentId, s.user.id), eq(shareSettings.category, "deadlines")));
    const hidden = await s.port.snapshot(s.user.id, "family", "family");
    expect(hidden.deadlines).toEqual([]);
    expect(hidden.weekPlan).toEqual({ weekStart: "2026-10-05", items: [], totalMinutes: 0, doneCount: 0 });
    expect((await s.port.snapshot(s.user.id, "my_crew", "crew")).deadlines).toHaveLength(1);
  });

  it("turns on Prep with test scores and Impact with activities", async () => {
    const s = await setup();
    await s.core.db.insert(testScores).values({
      ownerId: s.user.id,
      test: "ACT",
      takenOn: "2026-06-13",
      official: true,
      composite: 29,
      sections: {},
    });
    await s.core.db.insert(activities).values({ ownerId: s.user.id, position: 0, name: "Robotics" });
    const snap = await s.port.snapshot(s.user.id, "my_crew", "crew");
    expect(snap.enabledSpecialists).toEqual(["scout", "atlas", "quill", "aid", "ledger", "prep", "impact"]);
  });

  it("turns on Prep and Impact from the onboarding facts before there's any data (D29)", async () => {
    const s = await setup();
    expect((await s.port.snapshot(s.user.id, "my_crew", "crew")).enabledSpecialists).toEqual(["scout", "atlas", "quill", "aid", "ledger"]);
    await createFact(s.core, s.actor, fact("crew_prep_enabled", true, "crew"));
    await createFact(s.core, s.actor, fact("crew_impact_enabled", false, "crew"));
    expect((await s.port.snapshot(s.user.id, "my_crew", "crew")).enabledSpecialists).toEqual(["scout", "atlas", "quill", "aid", "ledger", "prep"]);
    // The switch counts in family and temporary rooms too, even though those snapshots carry no crew facts.
    expect((await s.port.snapshot(s.user.id, "temporary", "crew")).enabledSpecialists).toContain("prep");
  });

  it("loads no memory in temporary chats (CR-07, D22)", async () => {
    const s = await setup();
    await seedMemory(s);
    const temp = await s.port.snapshot(s.user.id, "temporary", "crew");
    expect(temp.room).toBe("temporary");
    expect(temp.facts).toEqual([]);
    expect(temp.decisions).toEqual([]);
    expect(temp.deadlines.map((d) => d.title)).toContain("Maple County STEM Award");
  });
});

describe("family-bound port (12-1)", () => {
  it("returns only what the student shares, per category", async () => {
    const s = await setup();
    await seedMemory(s);
    await seedRecords(s);
    const crew = createCrewDataPort(s.core);
    const shared = createCrewDataPort(s.core, { audience: "family" });
    // Shared by default: family reads match the crew's.
    expect(await shared.collegeList(s.user.id)).toEqual(await crew.collegeList(s.user.id));
    expect(await shared.costs(s.user.id)).toEqual(await crew.costs(s.user.id));
    expect(await shared.activities(s.user.id)).toHaveLength(1);
    expect((await shared.weekPlan(s.user.id)).items).toHaveLength(1);
    expect(await shared.deadlines(s.user.id)).toEqual(await crew.deadlines(s.user.id));
    expect((await shared.matches(s.user.id, "family")).matches.length).toBeGreaterThan(0);

    await unshare(s, ["costs", "colleges", "activities", "deadlines", "scholarships"]);
    expect(await shared.costs(s.user.id)).toEqual([]);
    expect(await shared.liveGrants()).not.toContain("costs");
    // Share settings are read once per port (one port per job), so a fresh port sees the change.
    const off = createCrewDataPort(s.core, { audience: "family" });
    expect(await off.costs(s.user.id)).toEqual([]);
    expect(await off.offers(s.user.id)).toEqual({ columns: [], lowestFourYearOfferId: null, assumptions: [] });
    expect(await off.collegeList(s.user.id)).toEqual([]);
    expect(await off.applicationItems(s.user.id)).toEqual([]);
    expect(await off.activities(s.user.id)).toEqual([]);
    expect(await off.serviceProgress(s.user.id)).toEqual([]);
    expect(await off.deadlines(s.user.id)).toEqual([]);
    expect(await off.weekPlan(s.user.id)).toEqual({ weekStart: "2026-10-05", items: [], totalMinutes: 0, doneCount: 0 });
    expect(await off.matches(s.user.id, "family")).toEqual({ matches: [], privateCount: 0 });
    const snap = await off.snapshot(s.user.id, "family", "family");
    expect(snap).toMatchObject({ deadlines: [], colleges: [], weekPlan: { items: [] } });
    // A crew-bound port still gates a call that asks for the family audience.
    expect(await crew.matches(s.user.id, "family")).toEqual({ matches: [], privateCount: 0 });
    // The crew port is unaffected.
    expect(await crew.collegeList(s.user.id)).toHaveLength(1);
    expect((await crew.costs(s.user.id)).length).toBeGreaterThan(0);
    expect(await crew.activities(s.user.id)).toHaveLength(1);
    expect((await crew.weekPlan(s.user.id)).items).toHaveLength(1);
  });

  it("never gives family test scores, gates aid checklists by deadlines, and keeps stories and essays behind their share switches", async () => {
    const s = await setup();
    const { essay } = await seedRecords(s);
    const crew = createCrewDataPort(s.core);
    const fam = createCrewDataPort(s.core, { audience: "family" });
    expect(await crew.testScores(s.user.id)).toHaveLength(1);
    expect(await fam.testScores(s.user.id)).toEqual([]);
    expect((await crew.aidChecklist(s.user.id)).length).toBeGreaterThan(0);
    // R2P-20: aid checklists follow `deadlines`, which is shared by default, matching 08 getAidChecklists.
    expect(await fam.aidChecklist(s.user.id)).toEqual(await crew.aidChecklist(s.user.id));
    await unshare(s, ["deadlines"]);
    expect(await createCrewDataPort(s.core, { audience: "family" }).aidChecklist(s.user.id)).toEqual([]);
    // essays and stories are off by default (DEFAULT_SHARED).
    expect(await crew.stories(s.user.id)).toHaveLength(1);
    expect(await fam.stories(s.user.id)).toEqual([]);
    expect((await crew.essay(s.user.id, essay.id))?.id).toBe(essay.id);
    expect(await fam.essay(s.user.id, essay.id)).toBeNull();
  });
});

describe("profile visibility and gaps", () => {
  it("blanks profile fields whose fact visibility the audience can't use (R2I-10)", async () => {
    const s = await setup();
    await createFact(s.core, s.actor, fact("county", "Maple", "scout_only"));
    await createFact(s.core, s.actor, fact("gpa_unweighted", 3.72, "crew"));
    const crew = await s.port.snapshot(s.user.id, "my_crew", "crew");
    expect(crew.profile).toMatchObject({ county: "", gpa: 3.72, state: "TX", classYear: 2027 });
    const fam = await createCrewDataPort(s.core, { audience: "family" }).snapshot(s.user.id, "family", "family");
    expect(fam.profile).toMatchObject({ county: "", gpa: null, state: "TX", classYear: 2027 });
  });

  it("fills each list entry's gap from costs, only when costs are shared (R2P-15)", async () => {
    const s = await setup();
    await seedRecords(s);
    const crew = createCrewDataPort(s.core);
    const [cost] = await crew.costs(s.user.id);
    const [entry] = await crew.collegeList(s.user.id);
    expect(entry?.gapUsd).not.toBeNull();
    expect(entry?.gapUsd).toBe(cost?.gapUsd);
    await unshare(s, ["costs"]);
    const fam = createCrewDataPort(s.core, { audience: "family" });
    const [famEntry] = await fam.collegeList(s.user.id);
    expect(famEntry?.collegeId).toBe(entry?.collegeId);
    expect(famEntry?.gapUsd).toBeNull();
  });
});

describe("record reads", () => {
  it("reads through core and returns null for missing or foreign records", async () => {
    const s = await setup();
    const listing = await factories.scholarship(s.core.db, { name: "Maple County STEM Award" });
    const college = await factories.college(s.core.db, { name: "State U" });
    const mine = await factories.essay(s.core.db, s.user.id);
    const other = await makeStudent(s.core.db);
    const theirs = await factories.essay(s.core.db, other.user.id);

    expect((await s.port.scholarship(listing.slug))?.name).toBe("Maple County STEM Award");
    expect(await s.port.scholarship("no-such-listing")).toBeNull();
    expect((await s.port.college(college.id))?.name).toBe("State U");
    expect(await s.port.college("999999")).toBeNull();
    expect((await s.port.essay(s.user.id, mine.id))?.id).toBe(mine.id);
    expect(await s.port.essay(s.user.id, theirs.id)).toBeNull();
    expect(await s.port.essay(s.user.id, "not-a-uuid")).toBeNull();

    const found = await s.port.searchScholarships({ q: "Maple", page: 1, pageSize: 20 });
    expect(found.map((x) => x.name)).toEqual(["Maple County STEM Award"]);
    // `local` needs a student actor in core; the port drops it instead of failing the tool call.
    expect(await s.port.searchScholarships({ q: "Maple", local: true, page: 1, pageSize: 20 })).toEqual(found);
    const crewMatches = await s.port.matches(s.user.id, "crew");
    expect(crewMatches.matches.map((m) => m.scholarship.id)).toContain(listing.id);
    const familyMatches = await s.port.matches(s.user.id, "family");
    expect(familyMatches.matches.every((m) => m.reasons.every((r) => !r.sensitive))).toBe(true);

    expect((await s.port.weekPlan(s.user.id)).weekStart).toBe("2026-10-05");
    expect(await s.port.collegeList(s.user.id)).toEqual([]);
    expect(await s.port.applicationItems(s.user.id)).toEqual([]);
    expect(await s.port.testScores(s.user.id)).toEqual([]);
    expect((await s.port.offers(s.user.id)).columns).toEqual([]);
    expect((await s.port.aidChecklist(s.user.id)).length).toBeGreaterThan(0);
    expect(await s.port.stories(s.user.id)).toEqual([]);
    expect(await s.port.activities(s.user.id)).toEqual([]);
    expect(Array.isArray(await s.port.costs(s.user.id))).toBe(true);
    expect(Array.isArray(await s.port.serviceProgress(s.user.id))).toBe(true);
    expect(Array.isArray(await s.port.deadlines(s.user.id))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/port.test.ts`
Expected: FAIL with `Failed to resolve import "./port" from "src/port.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/port.ts`:

```ts
import { privateScholarshipIds } from "@scholarcrew/core/scholarships";
import type { CrewDataPort } from "@scholarcrew/agents";
import { getAidChecklists } from "@scholarcrew/core/aid";
import { getCollege, getCollegeList, listApplicationItems } from "@scholarcrew/core/colleges";
import { getEssay, listEssays, listStories } from "@scholarcrew/core/essays";
import { getRequirementProgress, listActivities, listServiceLogs } from "@scholarcrew/core/impact";
import { crewVisibleFacts, listDecisions } from "@scholarcrew/core/memory";
import { compareMyOffers, costsFor, getCosts } from "@scholarcrew/core/money";
import { getWeekPlan, listUpcomingDeadlines } from "@scholarcrew/core/plan";
import { listTestScores } from "@scholarcrew/core/prep";
import { getProfile } from "@scholarcrew/core/profile";
import { getScholarship, listMatches, searchScholarships } from "@scholarcrew/core/scholarships";
import { type CoreDeps, todayIn } from "@scholarcrew/core/shared";
import { and, eq, inArray, isNull, memoryFacts, shareSettings, users } from "@scholarcrew/db";
import {
  type ContextSnapshot,
  DEFAULT_SHARED,
  type FactVisibility,
  type MemoryFact,
  type OfferComparison,
  PROFILE_FACT_KEYS,
  type ProfileFactKey,
  SPECIALIST_ROLES,
  type ShareCategory,
  type SpecialistRole,
  type WeekPlan,
  isAppError,
  notFound,
  systemActor,
} from "@scholarcrew/domain";
import { safeTimeZone } from "./time";

const SYSTEM = systemActor("worker:port");
const DEADLINE_LIMIT = 10;
const DECISION_LIMIT = 20;
const ALWAYS_ON: SpecialistRole[] = ["scout", "atlas", "quill", "aid", "ledger"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Onboarding switches (plan 16): a confirmed fact with value true turns the specialist on before any data exists. */
const SWITCH_FACTS: Record<"prep" | "impact", string> = { prep: "crew_prep_enabled", impact: "crew_impact_enabled" };
const EMPTY_OFFERS: OfferComparison = { columns: [], lowestFourYearOfferId: null, assumptions: [] };

type Audience = "crew" | "family";
export interface PortOptions {
  /** The job's audience. A family port filters every read by the student's share settings. */
  audience: Audience;
}

const blankWeek = (plan: WeekPlan): WeekPlan => ({ weekStart: plan.weekStart, items: [], totalMinutes: 0, doneCount: 0 });

/** Fact visibilities each audience may use (R2I-10). `scout_only` means "matching only"; `private` hides it from the crew. */
const USABLE_VISIBILITY: Record<Audience, FactVisibility[]> = { crew: ["crew", "crew_family"], family: ["crew_family"] };

/**
 * Profile fact keys whose current confirmed fact the audience can't use. The snapshot blanks those profile fields.
 * A key with no fact stays visible. The matcher still reads `profiles`, which 06 keeps in sync with these facts (R2I-1).
 */
async function hiddenProfileKeys(core: CoreDeps, ownerId: string, audience: Audience): Promise<Set<ProfileFactKey>> {
  const rows = await core.db
    .select({ key: memoryFacts.key, visibility: memoryFacts.visibility })
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.ownerId, ownerId),
        eq(memoryFacts.status, "confirmed"),
        isNull(memoryFacts.supersededById),
        inArray(memoryFacts.key, [...PROFILE_FACT_KEYS]),
      ),
    );
  const usable = USABLE_VISIBILITY[audience];
  return new Set(rows.filter((r) => !usable.includes(r.visibility)).map((r) => r.key as ProfileFactKey));
}

/** not_found becomes null; every other error propagates. */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (isAppError(e) && e.code === "not_found") return null;
    throw e;
  }
}

/** The student's share switches, defaulting to DEFAULT_SHARED for categories without a row. */
async function familyShares(core: CoreDeps, studentId: string): Promise<Record<ShareCategory, boolean>> {
  const rows = await core.db
    .select({ category: shareSettings.category, enabled: shareSettings.enabled })
    .from(shareSettings)
    .where(eq(shareSettings.studentId, studentId));
  const out: Record<ShareCategory, boolean> = { ...DEFAULT_SHARED };
  for (const row of rows) out[row.category] = row.enabled;
  return out;
}

const switchedOn = (facts: MemoryFact[], key: string) => facts.some((f) => f.key === key && f.value === true);

/** Prep and Impact are on when the student switched them on (D29) or already has their data. */
async function enabledSpecialists(core: CoreDeps, ownerId: string, crewFacts: MemoryFact[]): Promise<SpecialistRole[]> {
  const on = new Set<SpecialistRole>(ALWAYS_ON);
  if (switchedOn(crewFacts, SWITCH_FACTS.prep) || (await listTestScores(core, SYSTEM, ownerId)).length > 0) on.add("prep");
  if (switchedOn(crewFacts, SWITCH_FACTS.impact)) {
    on.add("impact");
  } else {
    const [logs, acts] = await Promise.all([listServiceLogs(core, SYSTEM, ownerId), listActivities(core, SYSTEM, ownerId)]);
    if (logs.length > 0 || acts.length > 0) on.add("impact");
  }
  return SPECIALIST_ROLES.filter((r) => on.has(r));
}

/**
 * Read-only data for the crew, over core services with the system actor (plan 09's CrewDataPort).
 * Sensitive facts are never read here; they stay in core's matcher path.
 *
 * Audience (FA, SE-01): build one port per job with the job's audience. For "family" (the bound audience, or a
 * call that passes audience "family"), every read checks the student's share settings first and returns empty
 * when the category is off: costs and offers → costs; collegeList and applicationItems → colleges (a list
 * entry's gapUsd also needs costs); activities and serviceProgress → activities; deadlines, weekPlan, and aid
 * checklists → deadlines; matches → scholarships; stories → stories; essay → essays. Test scores have no share
 * category, so family never gets them. Snapshot profile fields follow each profile fact's visibility (R2I-10).
 * Catalog reads (searchScholarships, scholarship, college) are public data and aren't gated.
 */
export function createCrewDataPort(core: CoreDeps, o: PortOptions = { audience: "crew" }): CrewDataPort {
  const used = new Set<ShareCategory>();
  let currentOwner: string | null = null;
  const sharesFor = (ownerId: string) => familyShares(core, ownerId);
  const isFamily = (audience?: Audience) => o.audience === "family" || audience === "family";
  /** Whether this read may return data. `null` means the data has no share category, so family never sees it. */
  const allows = async (ownerId: string, category: ShareCategory | null, audience?: Audience): Promise<boolean> => {
    currentOwner = ownerId;
    if (!isFamily(audience)) return true;
    if (category === null) return false;
    const allowed = (await sharesFor(ownerId))[category];
    if (allowed) used.add(category);
    return allowed;
  };

  return {
    usedCategories: () => [...used],
    async liveGrants() { return currentOwner ? Object.entries(await sharesFor(currentOwner)).filter(([, enabled]) => enabled).map(([category]) => category as ShareCategory) : []; },
    async snapshot(ownerId, room, requested): Promise<ContextSnapshot> {
      currentOwner = ownerId;
      const audience: Audience = isFamily(requested) ? "family" : "crew";
      // CR-07: a temporary chat loads no memory (no facts, no decisions) and saves nothing.
      const temporary = room === "temporary";
      const [user] = await core.db
        .select({ displayName: users.displayName, timeZone: users.timeZone })
        .from(users)
        .where(eq(users.id, ownerId));
      if (!user) throw notFound("Student not found");
      const profile = await orNull(getProfile(core, SYSTEM, ownerId));
      // Crew-visible facts drive the Prep/Impact switches in every room; they reach the snapshot only for the crew.
      const crewFacts = await crewVisibleFacts(core, SYSTEM, ownerId, "crew");
      const facts = temporary ? [] : audience === "crew" ? crewFacts : await crewVisibleFacts(core, SYSTEM, ownerId, "family");
      const decisions =
        temporary || audience === "family" ? [] : (await listDecisions(core, SYSTEM, ownerId)).slice(0, DECISION_LIMIT);
      const plan = await getWeekPlan(core, SYSTEM, ownerId);
      const showDeadlines = await allows(ownerId, "deadlines", audience);
      const deadlines = showDeadlines ? await listUpcomingDeadlines(core, SYSTEM, ownerId, DEADLINE_LIMIT) : [];
      const list = (await allows(ownerId, "colleges", audience)) ? await getCollegeList(core, SYSTEM, ownerId) : [];
      const privateIds = await privateScholarshipIds(core.db, ownerId);
      const publicRef = (item: { refType: string | null; refId: string | null }) => item.refType !== "scholarship" || item.refId === null || !privateIds.has(item.refId);
      const hidden = await hiddenProfileKeys(core, ownerId, audience);
      const hide = (key: ProfileFactKey) => hidden.has(key);
      return {
        ownerId,
        privateMatchCount: privateIds.size,
        displayName: user.displayName,
        today: todayIn(core.clock.now(), safeTimeZone(user.timeZone)),
        timeZone: user.timeZone,
        audience,
        room,
        roomRef: null,
        // R2I-10: each field follows its fact's visibility. high_school and city aren't in the snapshot.
        profile: {
          classYear: hide("class_year") ? null : (profile?.classYear ?? null),
          state: hide("state") ? "" : (profile?.state ?? ""),
          county: hide("county") ? "" : (profile?.county ?? ""),
          gpa: hide("gpa_unweighted") ? null : (profile?.gpaUnweighted ?? null),
          intendedMajors: hide("intended_majors") ? [] : (profile?.intendedMajors ?? []),
          interests: hide("interests") ? [] : (profile?.interests ?? []),
        },
        facts: facts.map((f) => ({ id: f.id, key: f.key, value: f.valueText, source: f.source })),
        decisions: decisions.map((d) => ({ id: d.id, summary: d.summary, decidedAt: d.decidedAt })),
        weekPlan: showDeadlines ? { ...plan, items: plan.items.filter(publicRef) } : blankWeek(plan),
        deadlines: deadlines.filter(publicRef),
        colleges: list.map((e) => ({ id: e.collegeId, name: e.college.name, fit: e.fit, plan: e.plan })),
        enabledSpecialists: await enabledSpecialists(core, ownerId, crewFacts),
      };
    },
    async matches(ownerId, requested) {
      const audience: Audience = isFamily(requested) ? "family" : "crew";
      if (!(await allows(ownerId, "scholarships", audience))) return { matches: [], privateCount: 0 };
      const result = await listMatches(core, SYSTEM, ownerId, { audience });
      const visible = result.matches.filter((match) => !match.reasons.some((reason) => reason.sensitive));
      return { matches: visible, privateCount: result.privateCount + result.matches.length - visible.length };
    },
    async searchScholarships(q) {
      // Core rejects `local` from a non-student actor, so the crew can't run a local search; drop it (and scams).
      const { local: _local, ...rest } = q;
      const privateIds = currentOwner ? await privateScholarshipIds(core.db, currentOwner) : new Set<string>();
      return (await searchScholarships(core, SYSTEM, { ...rest, excludeScams: true })).items.filter((listing) => !privateIds.has(listing.id));
    },
    async scholarship(idOrSlug) {
      const listing = await orNull(getScholarship(core, SYSTEM, idOrSlug));
      if (!listing || (currentOwner && (await privateScholarshipIds(core.db, currentOwner)).has(listing.id))) return null;
      return listing;
    },
    async collegeList(ownerId) {
      if (!(await allows(ownerId, "colleges"))) return [];
      const entries = await getCollegeList(core, SYSTEM, ownerId);
      // R2P-15: 07 can't import 08, so the port fills gapUsd from costs, and only when costs are shared.
      if (!(await allows(ownerId, "costs"))) return entries;
      const gaps = new Map((await costsFor(core, ownerId, { viewer: "other" })).map((c) => [c.collegeId, c.gapUsd] as const));
      return entries.map((e) => ({ ...e, gapUsd: gaps.get(e.collegeId) ?? null }));
    },
    college: (id) => orNull(getCollege(core, SYSTEM, id)),
    async applicationItems(ownerId) {
      if (!(await allows(ownerId, "colleges"))) return [];
      const entries = await getCollegeList(core, SYSTEM, ownerId);
      const lists = await Promise.all(entries.map((e) => listApplicationItems(core, SYSTEM, e.id)));
      return lists.flat();
    },
    async stories(ownerId) {
      if (!(await allows(ownerId, "stories"))) return [];
      const rows = await listStories(core, SYSTEM, ownerId);
      return isFamily() && !(await allows(ownerId, "essays")) ? rows.map((story) => ({ ...story, uses: [] })) : rows;
    },
    async story(ownerId, storyId) {
      if (!(await allows(ownerId, "stories"))) return null;
      const story = (await listStories(core, SYSTEM, ownerId)).find((story) => story.id === storyId && story.archivedAt === null) ?? null;
      if (!story) return null;
      return isFamily() && !(await allows(ownerId, "essays")) ? { ...story, uses: [] } : story;
    },
    async essay(ownerId, essayId) {
      if (!UUID_RE.test(essayId) || !(await allows(ownerId, "essays"))) return null;
      const owned = await listEssays(core, SYSTEM, ownerId);
      if (!owned.some((e) => e.id === essayId)) return null;
      return orNull(getEssay(core, SYSTEM, essayId));
    },
    async costs(ownerId) {
      return (await allows(ownerId, "costs")) ? costsFor(core, ownerId, { viewer: "other" }) : [];
    },
    async offers(ownerId) {
      return (await allows(ownerId, "costs")) ? compareMyOffers(core, SYSTEM, ownerId) : EMPTY_OFFERS;
    },
    async aidChecklist(ownerId) {
      // R2P-20: same rule as 08 getAidChecklists (assertCanRead "deadlines").
      return (await allows(ownerId, "deadlines")) ? getAidChecklists(core, SYSTEM, ownerId) : [];
    },
    async testScores(ownerId) {
      return (await allows(ownerId, null)) ? listTestScores(core, SYSTEM, ownerId) : [];
    },
    async activities(ownerId) {
      return (await allows(ownerId, "activities")) ? listActivities(core, SYSTEM, ownerId) : [];
    },
    async serviceProgress(ownerId) {
      return (await allows(ownerId, "activities")) ? getRequirementProgress(core, SYSTEM, ownerId) : [];
    },
    async weekPlan(ownerId) {
      const plan = await getWeekPlan(core, SYSTEM, ownerId);
      const privateIds = await privateScholarshipIds(core.db, ownerId);
      return (await allows(ownerId, "deadlines")) ? { ...plan, items: plan.items.filter((item) => item.refType !== "scholarship" || !item.refId || !privateIds.has(item.refId)) } : blankWeek(plan);
    },
    async deadlines(ownerId) {
      if (!(await allows(ownerId, "deadlines"))) return [];
      const privateIds = await privateScholarshipIds(core.db, ownerId);
      return (await listUpcomingDeadlines(core, SYSTEM, ownerId, DEADLINE_LIMIT)).filter((item) => item.refType !== "scholarship" || !item.refId || !privateIds.has(item.refId));
    },
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/worker test -- src/port.test.ts && pnpm --filter @scholarcrew/worker typecheck`
Expected: PASS, 1 file, 10 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/port.ts apps/worker/src/port.test.ts
git commit -m "feat(worker): CrewDataPort over core services, bound to the job's audience and share settings"
```

### L6: Shared crew-job runner (status, usage, retries)

- [ ] **Step 1: Write the failing test**

`apps/worker/src/handlers/shared.test.ts`:

```ts
import { MODEL_ID, type ModelTurn } from "@scholarcrew/agents";
import { createJob, getJob } from "@scholarcrew/core/crew";
import { TEST_NOW } from "@scholarcrew/core/shared";
import { agentRuns, crewJobs, eq, usageCounters } from "@scholarcrew/db";
import { AppError, type CrewReply } from "@scholarcrew/domain";
import { describe, expect, it, vi } from "vitest";
import { SYSTEM, makeStudent, makeWorkerDeps } from "../../test/helpers";
import { NO_RETRY } from "../types";
import { BUSY_TEXT, FAILED_TEXT, isRetryableModelError, runCrewJob } from "./shared";

const TURN: ModelTurn = {
  content: [],
  stopReason: "end_turn",
  usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 1400 },
  model: MODEL_ID,
  durationMs: 12,
};

const REPLY: CrewReply = {
  text: "Three steps this week.",
  contributors: ["compass"],
  question: null,
  actionCards: [],
  receipt: [],
  safety: null,
  needsInput: false,
};

const busy = () => new AppError("internal", "The model request failed", { status: 529, rateLimited: false });

async function setup() {
  const { deps, core } = makeWorkerDeps();
  const student = await makeStudent(core.db);
  const job = await createJob(core, student.actor, { kind: "weekly_plan" });
  return { deps, core, job, ...student };
}

async function usageOf(core: Awaited<ReturnType<typeof setup>>["core"], userId: string) {
  const [row] = await core.db.select().from(usageCounters).where(eq(usageCounters.userId, userId));
  return row ? { crewRequests: row.crewRequests, costMicros: row.costMicros } : null;
}

describe("isRetryableModelError", () => {
  it("retries rate limits, 5xx, and connection errors from the model client only", () => {
    expect(isRetryableModelError(busy())).toBe(true);
    expect(isRetryableModelError(new AppError("internal", "x", { status: 429, rateLimited: true }))).toBe(true);
    expect(isRetryableModelError(new AppError("internal", "x", { status: null, rateLimited: false }))).toBe(true);
    expect(isRetryableModelError(new AppError("internal", "x", { status: 400, rateLimited: false }))).toBe(false);
    expect(isRetryableModelError(new AppError("internal", "x"))).toBe(false);
    expect(isRetryableModelError(new AppError("not_found", "x", { status: 500, rateLimited: false }))).toBe(false);
    expect(isRetryableModelError(new Error("boom"))).toBe(false);
  });
});

describe("runCrewJob", () => {
  it("completes the job, records every model turn, and charges one request", async () => {
    const { deps, core, job, user } = await setup();
    await runCrewJob(deps, { name: "plan.weekly", jobId: job.id, ctx: NO_RETRY, crewRequest: true }, async (run) => {
      expect(run.ownerId).toBe(user.id);
      expect(run.job.status).toBe("queued");
      await run.base.onProgress?.({ at: TEST_NOW, role: "compass", text: "Planning" });
      await run.base.onUsage?.("compass", TURN);
      await run.base.onUsage?.("scout", TURN);
      return { reply: REPLY, status: "ready", safety: null };
    });
    const done = await getJob(core, SYSTEM, job.id);
    expect(done).toMatchObject({ status: "ready", error: null, safety: null });
    expect(done.resultMessageId).not.toBeNull();
    expect(done.progress.map((p) => p.text)).toEqual(["Planning"]);
    const runs = await core.db.select().from(agentRuns).where(eq(agentRuns.jobId, job.id));
    expect(runs.map((r) => r.role).sort()).toEqual(["compass", "scout"]);
    expect(runs.every((r) => r.userId === user.id && r.costMicros === 1400 && r.inputTokens === 100)).toBe(true);
    expect(await usageOf(core, user.id)).toEqual({ crewRequests: 1, costMicros: 2800 });
  });

  it("skips finished and missing jobs", async () => {
    const { deps, job } = await setup();
    await runCrewJob(deps, { name: "plan.weekly", jobId: job.id, ctx: NO_RETRY, crewRequest: true }, async () => ({
      reply: REPLY,
      status: "ready",
    }));
    const work = vi.fn();
    await runCrewJob(deps, { name: "plan.weekly", jobId: job.id, ctx: NO_RETRY, crewRequest: true }, work);
    await runCrewJob(
      deps,
      { name: "plan.weekly", jobId: "00000000-0000-4000-8000-000000000000", ctx: NO_RETRY, crewRequest: true },
      work,
    );
    expect(work).not.toHaveBeenCalled();
  });

  it("fails the job without rethrowing on unexpected errors", async () => {
    const { deps, core, job, user } = await setup();
    const onFailed = vi.fn(async () => {});
    await runCrewJob(deps, { name: "plan.weekly", jobId: job.id, ctx: NO_RETRY, crewRequest: true, onFailed }, async () => {
      throw new Error("boom");
    });
    expect(await getJob(core, SYSTEM, job.id)).toMatchObject({ status: "failed", error: FAILED_TEXT, resultMessageId: null });
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(await usageOf(core, user.id)).toBeNull();
  });

  it("fails the job when the work returns an invalid reply", async () => {
    const { deps, core, job } = await setup();
    await runCrewJob(deps, { name: "plan.weekly", jobId: job.id, ctx: NO_RETRY, crewRequest: true }, async () => ({
      reply: { ...REPLY, text: "" },
      status: "ready",
    }));
    expect(await getJob(core, SYSTEM, job.id)).toMatchObject({ status: "failed", error: FAILED_TEXT });
  });

  it("releases retryable jobs and retains all attempt costs for one terminal charge", async () => {
    const { deps, core, job, user } = await setup();
    const onFailed = vi.fn(async () => {});
    const error = busy();
    await expect(
      runCrewJob(
        deps,
        { name: "plan.weekly", jobId: job.id, ctx: { retryCount: 0, retryLimit: 2 }, crewRequest: true, onFailed },
        async (run) => {
          await run.base.onUsage?.("compass", TURN);
          throw error;
        },
      ),
    ).rejects.toBe(error);
    const working = await getJob(core, SYSTEM, job.id);
    expect(working.status).toBe("queued");
    expect(working.progress.at(-1)).toMatchObject({ role: "system", text: BUSY_TEXT });
    expect(onFailed).not.toHaveBeenCalled();
    expect(await usageOf(core, user.id)).toBeNull();
    expect((await core.db.select().from(crewJobs).where(eq(crewJobs.id, job.id)))[0]?.costMicros).toBe(1400);
    await runCrewJob(deps, { name: "plan.weekly", jobId: job.id, ctx: NO_RETRY, crewRequest: true }, async (run) => { await run.base.onUsage?.("compass", TURN); return { reply: REPLY, status: "ready" }; });
    expect(await usageOf(core, user.id)).toEqual({ crewRequests: 1, costMicros: 2800 });
  });

  it("logs a failed agent_runs write and still completes and bills the job", async () => {
    const { deps, core, job, user } = await setup();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // NaN tokens fail AgentRunRecord validation, so recordAgentRun rejects.
    const bad: ModelTurn = { ...TURN, usage: { ...TURN.usage, inputTokens: Number.NaN } };
    await runCrewJob(deps, { name: "plan.weekly", jobId: job.id, ctx: NO_RETRY, crewRequest: true }, async (run) => {
      await run.base.onUsage?.("compass", bad);
      return { reply: REPLY, status: "ready", safety: null };
    });
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('"msg":"usage.record_failed"'));
    errors.mockRestore();
    expect((await getJob(core, SYSTEM, job.id)).status).toBe("ready");
    expect(await core.db.select().from(agentRuns).where(eq(agentRuns.jobId, job.id))).toEqual([]);
    expect(await usageOf(core, user.id)).toEqual({ crewRequests: 1, costMicros: 1400 });
  });

  it("fails on the last attempt and still records the cost already spent", async () => {
    const { deps, core, job, user } = await setup();
    await runCrewJob(
      deps,
      { name: "plan.weekly", jobId: job.id, ctx: { retryCount: 2, retryLimit: 2 }, crewRequest: true },
      async (run) => {
        await run.base.onUsage?.("compass", TURN);
        throw busy();
      },
    );
    expect((await getJob(core, SYSTEM, job.id)).status).toBe("failed");
    expect(await usageOf(core, user.id)).toEqual({ crewRequests: 0, costMicros: 1400 });
  });

  it("runs afterComplete once the job is complete, and logs its failure without failing the job (R2C-15)", async () => {
    const { deps, core, job, user, actor } = await setup();
    const seen: string[] = [];
    await runCrewJob(deps, { name: "plan.weekly", jobId: job.id, ctx: NO_RETRY, crewRequest: true }, async () => ({
      reply: REPLY,
      status: "ready",
      afterComplete: async () => {
        seen.push((await getJob(core, SYSTEM, job.id)).status);
      },
    }));
    expect(seen).toEqual(["ready"]);

    const other = await createJob(core, actor, { kind: "weekly_plan" });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await runCrewJob(deps, { name: "plan.weekly", jobId: other.id, ctx: NO_RETRY, crewRequest: true }, async () => ({
      reply: REPLY,
      status: "ready",
      afterComplete: async () => {
        throw new Error("candidate insert failed");
      },
    }));
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('"msg":"job.after_complete_failed"'));
    errors.mockRestore();
    expect((await getJob(core, SYSTEM, other.id)).status).toBe("ready");
    expect(await usageOf(core, user.id)).toEqual({ crewRequests: 2, costMicros: 0 });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/shared.test.ts`
Expected: FAIL with `Failed to resolve import "./shared" from "src/handlers/shared.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/handlers/shared.ts`:

```ts
import { QUEUE_EXPIRE_SECONDS } from "@scholarcrew/domain";
import type { AgentDeps, ModelTurn } from "@scholarcrew/agents";
import { recordUsage } from "@scholarcrew/core/billing";
import { appendProgress, completeJob, getJob, recordAgentRun, releaseJob, startJob } from "@scholarcrew/core/crew";
import { crewJobs, eq, users } from "@scholarcrew/db";
import {
  type CrewJob,
  CrewReply,
  type JobName,
  type SafetyFlag,
  type ShareCategory,
  TERMINAL_JOB_STATUSES,
  isAppError,
  systemActor,
} from "@scholarcrew/domain";
import { errorLabel, log } from "../log";
import { createCrewDataPort } from "../port";
import type { JobContext, WorkerDeps } from "../types";

export const SYSTEM = systemActor("worker");
export const FAILED_TEXT = "Something went wrong. Try again in a minute.";
export const BUSY_TEXT = "The crew is busy right now. Trying again shortly.";

/** What specialists and job runners take (plan 10's SpecialistDeps). */
export type AgentBase = Omit<AgentDeps, "consult">;

export interface JobOutcome {
  reply: CrewReply | null;
  status: "ready" | "needs_input" | "failed";
  safety?: SafetyFlag | null;
  error?: string;
  /**
   * Side effects that must happen once, after completeJob succeeds with usage already committed (R2C-15).
   * If completeJob throws, the retry reruns the work but this hasn't run yet. A failure here is logged, never rethrown.
   */
  sharedCategories?: ShareCategory[];
  afterComplete?: () => Promise<void>;
}

export interface CrewJobRun {
  job: CrewJob;
  ownerId: string;
  base: AgentBase;
}

/** Plan 09's model client wraps API failures as AppError("internal", ..., { status, rateLimited }). */
export function isRetryableModelError(e: unknown): boolean {
  if (!isAppError(e) || e.code !== "internal") return false;
  const d = e.details;
  if (typeof d !== "object" || d === null || !("rateLimited" in d)) return false;
  const { rateLimited, status } = d as { rateLimited?: unknown; status?: unknown };
  if (rateLimited === true) return true;
  return status === null || (typeof status === "number" && status >= 500);
}

/**
 * AgentDeps without consult, wired to the job: progress events, one agentRuns row per turn, a cost total.
 * The port is crew-bound; crew.request rebinds it to the request's audience (L7).
 * onUsage never rejects: a failed insert is logged and the cost still counts toward billing (09/10 also catch).
 */
export function createAgentBase(deps: WorkerDeps, i: { jobId: string; ownerId: string; leaseToken: string }) {
  let total = 0;
  const base: AgentBase = {
    model: deps.model,
    port: createCrewDataPort(deps.core),
    now: () => deps.core.clock.now(),
    onProgress: (e) => appendProgress(deps.core, SYSTEM, i.jobId, e),
    onUsage: async (role: string, t: ModelTurn) => {
      const cost = Math.max(0, Math.round(t.usage.costMicros));
      total += cost;
      try {
        await recordAgentRun(deps.core, SYSTEM, {
          jobId: i.jobId,
          userId: i.ownerId,
          role,
          model: t.model,
          inputTokens: t.usage.inputTokens,
          outputTokens: t.usage.outputTokens,
          cacheReadTokens: t.usage.cacheReadTokens,
          cacheWriteTokens: t.usage.cacheWriteTokens,
          stopReason: t.stopReason,
          costMicros: cost,
          durationMs: Math.max(0, Math.round(t.durationMs)),
        }, { leaseToken: i.leaseToken });
      } catch (e) {
        log("error", "usage.record_failed", { jobId: i.jobId, role, error: errorLabel(e) });
      }
    },
  };
  return { base, costMicros: () => total };
}

async function loadJob(deps: WorkerDeps, jobId: string): Promise<CrewJob | null> {
  try {
    return await getJob(deps.core, SYSTEM, jobId);
  } catch (e) {
    if (isAppError(e) && e.code === "not_found") return null;
    throw e;
  }
}

/**
 * Runs one crew job: queued → working → ready / needs_input / failed (CR-06).
 * Terminal jobs are skipped so pg-boss retries are idempotent. Retryable model errors are rethrown while
 * retries remain; anything else fails the job with FAILED_TEXT and resolves. `outcome.afterComplete` runs
 * after completeJob with usage already committed; its failure is logged as job.after_complete_failed.
 */
export async function runCrewJob(
  deps: WorkerDeps,
  opts: { name: JobName; jobId: string; ctx: JobContext; crewRequest: boolean; onFailed?: () => Promise<void> },
  work: (run: CrewJobRun) => Promise<JobOutcome>,
): Promise<void> {
  const { name, jobId } = opts;
  const job = await loadJob(deps, jobId);
  if (!job) {
    log("warn", "job.missing", { name, jobId });
    return;
  }
  if (TERMINAL_JOB_STATUSES.includes(job.status)) {
    log("info", "job.skipped", { name, jobId, status: job.status });
    return;
  }
  const [row] = await deps.core.db.select({ ownerId: crewJobs.ownerId, ownerStatus: users.status }).from(crewJobs).innerJoin(users, eq(users.id, crewJobs.ownerId)).where(eq(crewJobs.id, jobId));
  if (!row || row.ownerStatus !== "active") return;
  const ownerId = row.ownerId;
  const claim = await startJob(deps.core, SYSTEM, jobId, { leaseSeconds: QUEUE_EXPIRE_SECONDS[name] });
  if (!claim) { log("info", "job.lease_held", { name, jobId }); return; }
  const leaseToken = claim.leaseToken;
  const agent = createAgentBase(deps, { jobId, ownerId, leaseToken });

  let outcome: JobOutcome;
  let failedByError = false;
  try {
    outcome = await work({ job, ownerId, base: agent.base });
    if (outcome.reply) CrewReply.parse(outcome.reply);
  } catch (e) {
    // D26: without pg-boss retry metadata both counts are undefined, this comparison is false, and the job
    // fails on its first busy error instead of hanging in `working`. That's the safe fallback.
    if (isRetryableModelError(e) && opts.ctx.retryCount < opts.ctx.retryLimit) {
      // The retry starts a fresh cost total, so bill what this attempt already spent before rethrowing.
      // Cost already accumulated durably on the job; completion or reaping bills it once in usageMonth.
      await appendProgress(deps.core, SYSTEM, jobId, {
        at: deps.core.clock.now().toISOString(),
        role: "system",
        text: BUSY_TEXT,
      });
      log("warn", "job.retrying", { name, jobId, attempt: opts.ctx.retryCount + 1, error: errorLabel(e) });
      await releaseJob(deps.core, SYSTEM, jobId, leaseToken);
      throw e;
    }
    log("error", "job.failed", { name, jobId, error: errorLabel(e) });
    if (opts.onFailed) {
      try {
        await opts.onFailed();
      } catch (cleanup) {
        log("error", "job.cleanup_failed", { name, jobId, error: errorLabel(cleanup) });
      }
    }
    outcome = { reply: null, status: "failed", error: FAILED_TEXT };
    failedByError = true;
  }

  const cost = agent.costMicros();
  const crewRequest = opts.crewRequest && !failedByError && outcome.status !== "failed" && outcome.safety !== "crisis";
  const completed = await completeJob(deps.core, SYSTEM, {
    jobId,
    leaseToken,
    usage: { costMicros: cost, crewRequest },
    sharedCategories: outcome.sharedCategories,
    reply: outcome.reply,
    status: outcome.status,
    error: outcome.error,
    safety: outcome.safety ?? undefined,
  }).catch(async (error) => {
    await releaseJob(deps.core, SYSTEM, jobId, leaseToken);
    throw error;
  });
  if (!completed.completed) return;
  if (outcome.afterComplete) {
    try {
      await outcome.afterComplete();
    } catch (e) {
      log("error", "job.after_complete_failed", { name, jobId, error: errorLabel(e) });
    }
  }
  log("info", "job.completed", { name, jobId, status: outcome.status, costMicros: cost });
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/shared.test.ts && pnpm --filter @scholarcrew/worker typecheck`
Expected: PASS, 1 file, 9 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/handlers/shared.ts apps/worker/src/handlers/shared.test.ts
git commit -m "feat(worker): shared crew-job runner with usage ledger and retry policy"
```

### L7: crew.request handler

- [ ] **Step 1: Write the failing test**

`apps/worker/src/handlers/crew-request.test.ts`:

```ts
import type { ModelClient, ModelRequest } from "@scholarcrew/agents";
import { createScriptedModelClient } from "@scholarcrew/agents/testing";
import { createConversation, createJob, getJob, getMessages, sendMessage } from "@scholarcrew/core/crew";
import { createFact } from "@scholarcrew/core/memory";
import { saveScholarship } from "@scholarcrew/core/scholarships";
import { agentRuns, eq, memoryFacts, usageCounters, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { AppError, type CrewReply, type UserActor, userActor } from "@scholarcrew/domain";
import { describe, expect, it, vi } from "vitest";
import { SYSTEM, failingModel, makeStudent, makeWorkerDeps } from "../../test/helpers";
import { createDemoModelClient } from "../demo-model";
import { MISSING_MESSAGE_TEXT, handleCrewRequest } from "./crew-request";
import { FAILED_TEXT } from "./shared";

/** R2C-15: lets one test make completeJob fail once, the way a dropped DB connection would. */
const completeFailures = vi.hoisted(() => ({ remaining: 0 }));
vi.mock("@scholarcrew/core/crew", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scholarcrew/core/crew")>();
  return {
    ...actual,
    completeJob: async (...args: Parameters<typeof actual.completeJob>) => {
      if (completeFailures.remaining > 0) {
        completeFailures.remaining -= 1;
        throw new Error("completeJob failed");
      }
      return actual.completeJob(...args);
    },
  };
});

const REFUSAL = "I can't help with that one, but I'm happy to keep working on your plan.";

const MAJOR_REPLY: CrewReply = {
  text: "Got it. Physics it is.",
  contributors: ["compass"],
  question: null,
  actionCards: [
    {
      kind: "confirm_fact",
      id: "major",
      label: "Remember your major",
      fact: { key: "intended_major", value: "Physics", visibility: "crew", source: "user_stated", sourceRef: null },
    },
  ],
  receipt: [],
  safety: null,
  needsInput: false,
};

function textsOf(req: ModelRequest): string {
  const out: string[] = [];
  for (const m of req.messages) {
    if (typeof m.content === "string") out.push(m.content);
    else for (const b of m.content) if (b.type === "text") out.push(b.text);
  }
  return out.join("\n");
}

/** The demo model, plus the user-message text of every turn request it saw. */
function capturingDemo(): { model: ModelClient; seen: string[] } {
  const demo = createDemoModelClient();
  const seen: string[] = [];
  return {
    seen,
    model: {
      async turn(req) {
        seen.push(textsOf(req));
        return demo.turn(req);
      },
      extract: demo.extract,
    },
  };
}

async function setup(model?: ModelClient) {
  const ctx = makeWorkerDeps(model ? { model } : {});
  const student = await makeStudent(ctx.core.db);
  const listing = await factories.scholarship(ctx.core.db, { name: "Maple County STEM Award", deadline: "2026-10-20" });
  await saveScholarship(ctx.core, student.actor, { scholarshipId: listing.id });
  const room = await createConversation(ctx.core, student.actor, { room: "my_crew", roomRefId: null, familyId: null, title: "" });
  const send = (body: string, actor: UserActor = student.actor, conversationId = room.id) =>
    sendMessage(ctx.core, actor, conversationId, { body });
  return { ...ctx, ...student, room, send };
}

async function usageOf(s: Awaited<ReturnType<typeof setup>>, userId: string) {
  const [row] = await s.core.db.select().from(usageCounters).where(eq(usageCounters.userId, userId));
  return row ? { crewRequests: row.crewRequests, costMicros: row.costMicros } : null;
}

describe("crew.request", () => {
  it("runs Compass end to end with the demo model and saves the reply", async () => {
    const s = await setup();
    const { job } = await s.send("What should I do first?");
    await handleCrewRequest(s.deps, { jobId: job.id });
    const done = await getJob(s.core, SYSTEM, job.id);
    expect(done).toMatchObject({ status: "ready", safety: null, error: null });
    expect(done.progress.map((p) => p.text)).toContain("Compass is reading your request.");
    const last = (await getMessages(s.core, s.actor, s.room.id)).at(-1);
    expect(last?.authorKind).toBe("crew");
    expect(last?.id).toBe(done.resultMessageId);
    expect(last?.reply?.contributors).toEqual(["compass"]);
    expect(last?.reply?.text).toContain("Maple County STEM Award");
    expect(last?.reply?.actionCards).toHaveLength(1);
    const runs = await s.core.db.select().from(agentRuns).where(eq(agentRuns.jobId, job.id));
    expect(runs.map((r) => r.role)).toEqual(["compass"]);
    expect(await usageOf(s, s.user.id)).toEqual({ crewRequests: 1, costMicros: runs[0]?.costMicros });
  });

  it("answers a crisis message with the crisis reply and no model call (CR-09)", async () => {
    const model = createScriptedModelClient([]);
    const s = await setup(model);
    const { job } = await s.send("I want to end my life");
    await handleCrewRequest(s.deps, { jobId: job.id });
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "ready", safety: "crisis" });
    const last = (await getMessages(s.core, s.actor, s.room.id)).at(-1);
    expect(last?.reply?.text).toContain("988");
    expect(model.requests).toHaveLength(0);
    expect(await s.core.db.select().from(agentRuns).where(eq(agentRuns.jobId, job.id))).toEqual([]);
  });

  it("turns a refusal into the polite reply and logs the turn (CR-11)", async () => {
    const s = await setup(createScriptedModelClient([{ stopReason: "refusal" }]));
    const { job } = await s.send("Write my essay for me");
    await handleCrewRequest(s.deps, { jobId: job.id });
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "ready", safety: "refusal" });
    expect((await getMessages(s.core, s.actor, s.room.id)).at(-1)?.reply?.text).toBe(REFUSAL);
    const runs = await s.core.db.select().from(agentRuns).where(eq(agentRuns.jobId, job.id));
    expect(runs.map((r) => r.stopReason)).toEqual(["refusal"]);
  });

  it("sends earlier messages as history and passes mentions", async () => {
    const { model, seen } = capturingDemo();
    const s = await setup(model);
    const first = await s.send("Hi @Scout");
    s.clock.set("2026-10-06T15:01:00.000Z");
    await handleCrewRequest(s.deps, { jobId: first.job.id });
    s.clock.set("2026-10-06T15:02:00.000Z");
    const second = await s.send("@Ledger what about costs?");
    await handleCrewRequest(s.deps, { jobId: second.job.id });
    const text = seen.at(-1) ?? "";
    expect(text).toContain('<untrusted label="conversation_history">');
    expect(text.indexOf("Student: Hi @Scout")).toBeLessThan(text.indexOf("Crew: "));
    expect(text).toContain("The student mentioned @Ledger.");
    expect(text).not.toContain("Student: @Ledger what about costs?");
  });

  it("uses the family audience in family rooms and charges the student", async () => {
    const { model, seen } = capturingDemo();
    const s = await setup(model);
    const parent = await factories.parent(s.core.db);
    const family = await factories.family(s.core.db, { studentIds: [s.user.id], parentIds: [parent.id] });
    const parentActor = userActor(parent.id, "parent");
    const fact = (key: string, value: string, visibility: "crew" | "crew_family") =>
      createFact(s.core, s.actor, { key, value, visibility, source: "user_stated", sourceRef: null });
    await fact("dream_school", "Rice", "crew");
    await fact("favorite_subject", "Physics", "crew_family");
    const room = await createConversation(s.core, parentActor, { room: "family", roomRefId: null, familyId: family.id, title: "" });
    const { job } = await s.send("How are things going?", parentActor, room.id);
    await handleCrewRequest(s.deps, { jobId: job.id });
    expect((await getJob(s.core, SYSTEM, job.id)).status).toBe("ready");
    const text = seen.at(-1) ?? "";
    expect(text).toContain('"audience":"family"');
    expect(text).toContain("Physics");
    expect(text).not.toContain("Rice");
    expect((await usageOf(s, s.user.id))?.crewRequests).toBe(1);
    expect(await usageOf(s, parent.id)).toBeNull();

    // D42: in history, a parent's words are labeled "Parent:", not the student's.
    s.clock.set("2026-10-06T15:05:00.000Z");
    const second = await s.send("Anything due soon?", parentActor, room.id);
    await handleCrewRequest(s.deps, { jobId: second.job.id });
    const later = seen.at(-1) ?? "";
    expect(later).toContain("Parent: How are things going?");
    expect(later).not.toContain("Student: How are things going?");
  });

  it("tells Compass which parent asked, by first name, and who said each line (D42)", async () => {
    const { model, seen } = capturingDemo();
    const s = await setup(model);
    const parent = await factories.parent(s.core.db);
    await s.core.db.update(users).set({ displayName: "Maria Lopez" }).where(eq(users.id, parent.id));
    const family = await factories.family(s.core.db, { studentIds: [s.user.id], parentIds: [parent.id] });
    const parentActor = userActor(parent.id, "parent");
    const room = await createConversation(s.core, parentActor, { room: "family", roomRefId: null, familyId: family.id, title: "" });
    const mine = await s.send("I sent the FAFSA.", s.actor, room.id);
    await handleCrewRequest(s.deps, { jobId: mine.job.id });
    s.clock.set("2026-10-06T15:05:00.000Z");
    const theirs = await s.send("@Ledger what's the gap?", parentActor, room.id);
    await handleCrewRequest(s.deps, { jobId: theirs.job.id });
    const text = seen.at(-1) ?? "";
    expect(text).toContain("Student: I sent the FAFSA.");
    expect(text).toContain("Maria (parent) asks: @Ledger what's the gap?");
    expect(text).toContain("They mentioned @Ledger.");
    expect(text).not.toContain("The student mentioned");
  });

  it("files confirm_fact cards as memory candidates, but never from temporary chats (ME-03, CR-07)", async () => {
    const s = await setup(createScriptedModelClient(() => ({ content: [{ type: "tool_use", name: "submit_reply", input: MAJOR_REPLY }] })));
    const { job } = await s.send("I want to study physics");
    await handleCrewRequest(s.deps, { jobId: job.id });
    const candidates = () => s.core.db.select().from(memoryFacts).where(eq(memoryFacts.ownerId, s.user.id));
    expect((await candidates()).map((f) => [f.key, f.status, f.source])).toEqual([["intended_major", "candidate", "crew_inferred"]]);

    const temp = await createConversation(s.core, s.actor, { room: "temporary", roomRefId: null, familyId: null, title: "" });
    s.clock.set("2026-10-06T15:05:00.000Z");
    const again = await s.send("I want to study physics", s.actor, temp.id);
    await handleCrewRequest(s.deps, { jobId: again.job.id });
    expect((await getJob(s.core, SYSTEM, again.job.id)).status).toBe("ready");
    expect(await candidates()).toHaveLength(1);
  });

  it("files candidates after completeJob, so a retry after a completeJob failure files them once (R2C-15)", async () => {
    const s = await setup(createScriptedModelClient(() => ({ content: [{ type: "tool_use", name: "submit_reply", input: MAJOR_REPLY }] })));
    const { job } = await s.send("I want to study physics");
    const candidates = () => s.core.db.select().from(memoryFacts).where(eq(memoryFacts.ownerId, s.user.id));
    completeFailures.remaining = 1;
    await expect(handleCrewRequest(s.deps, { jobId: job.id })).rejects.toThrow("completeJob failed");
    expect((await getJob(s.core, SYSTEM, job.id)).status).toBe("queued");
    expect(await candidates()).toEqual([]);
    // pg-boss retries the job; the work runs again and the candidate is filed once, after completeJob.
    await handleCrewRequest(s.deps, { jobId: job.id });
    expect((await getJob(s.core, SYSTEM, job.id)).status).toBe("ready");
    expect((await candidates()).map((f) => [f.key, f.status])).toEqual([["intended_major", "candidate"]]);
  });

  it("fails a job whose request message is missing", async () => {
    const s = await setup();
    const job = await createJob(s.core, s.actor, { kind: "crew_request" });
    await handleCrewRequest(s.deps, { jobId: job.id });
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "failed", error: MISSING_MESSAGE_TEXT });
  });

  it("retries busy model errors, then fails on the last attempt", async () => {
    const busy = new AppError("internal", "The model request failed", { status: 529, rateLimited: false });
    const s = await setup(failingModel(busy));
    const { job } = await s.send("What should I do first?");
    await expect(handleCrewRequest(s.deps, { jobId: job.id }, { retryCount: 0, retryLimit: 2 })).rejects.toBe(busy);
    expect((await getJob(s.core, SYSTEM, job.id)).status).toBe("queued");
    await handleCrewRequest(s.deps, { jobId: job.id }, { retryCount: 2, retryLimit: 2 });
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "failed", error: FAILED_TEXT });
    expect((await getMessages(s.core, s.actor, s.room.id)).filter((m) => m.authorKind === "crew")).toEqual([]);
  });

  it("rejects a malformed payload", async () => {
    const s = await setup();
    await expect(handleCrewRequest(s.deps, { jobId: "nope" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/crew-request.test.ts`
Expected: FAIL with `Failed to resolve import "./crew-request" from "src/handlers/crew-request.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/handlers/crew-request.ts`:

```ts
import { privateScholarshipIds } from "@scholarcrew/core/scholarships";
import { runCrewRequest } from "@scholarcrew/agents";
import { makeConsult } from "@scholarcrew/agents/specialists";
import { createCandidate } from "@scholarcrew/core/memory";
import type { CoreDeps } from "@scholarcrew/core/shared";
import { and, conversations, desc, eq, inArray, lte, messages, ne, users, scholarships, shareSettings } from "@scholarcrew/db";
import {
  DEFAULT_SHARED,
  type CrewJob,
  type CrewReply,
  type CrewRequester,
  CrewRequestInput,
  type CrewSpeaker,
  type RoomKind,
  parseMentions,
} from "@scholarcrew/domain";
import { JobPayloads } from "@scholarcrew/jobs";
import { errorLabel, log } from "../log";
import { createCrewDataPort } from "../port";
import { type JobContext, NO_RETRY, type WorkerDeps } from "../types";
import { SYSTEM, runCrewJob } from "./shared";

export const HISTORY_LIMIT = 10;
export const MISSING_MESSAGE_TEXT = "We couldn't find the message for this request. Send it again.";
const REF_ROOMS: RoomKind[] = ["scholarship", "college", "essay"];

/** First whitespace token of a display name, at most 60 characters (CrewRequester.firstName). May be "". */
export function firstNameOf(displayName: string | null | undefined): string {
  return ((displayName ?? "").trim().split(/\s+/)[0] ?? "").slice(0, 60);
}

/** The request message, the 10 messages before it, the room, and the audience (family rooms → "family"). */
export async function loadCrewInput(core: CoreDeps, job: CrewJob, ownerId: string): Promise<CrewRequestInput | null> {
  if (!job.conversationId || !job.requestMessageId) return null;
  const [conv] = await core.db.select().from(conversations).where(eq(conversations.id, job.conversationId));
  const [request] = await core.db.select().from(messages).where(eq(messages.id, job.requestMessageId));
  if (!conv || !request || request.conversationId !== conv.id) return null;
  const earlier = await core.db
    .select({ authorKind: messages.authorKind, authorUserId: messages.authorUserId, body: messages.body, sharedCategories: messages.sharedCategories })
    .from(messages)
    .where(
      and(eq(messages.conversationId, conv.id), ne(messages.id, request.id), lte(messages.createdAt, request.createdAt)),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(HISTORY_LIMIT);
  // D42: one lookup for the owner, the request author, and every history author.
  const authorIds = new Set<string>([ownerId]);
  if (request.authorUserId) authorIds.add(request.authorUserId);
  for (const m of earlier) if (m.authorUserId) authorIds.add(m.authorUserId);
  const people = await core.db
    .select({ id: users.id, role: users.role, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, [...authorIds]));
  const byId = new Map(people.map((p) => [p.id, p]));
  const roleOf = (userId: string): "student" | "parent" => (byId.get(userId)?.role === "parent" ? "parent" : "student");
  // The owner is always "student"; any other user is "parent" when their role is parent, otherwise "student".
  const speakerOf = (m: { authorKind: "user" | "crew"; authorUserId: string | null }): CrewSpeaker => {
    if (m.authorKind === "crew") return "crew";
    return m.authorUserId === null || m.authorUserId === ownerId ? "student" : roleOf(m.authorUserId);
  };
  const askedBy = request.authorUserId ?? ownerId;
  const requester: CrewRequester = {
    role: askedBy === ownerId ? "student" : roleOf(askedBy),
    firstName: firstNameOf(byId.get(askedBy)?.displayName),
  };
  const privateIds = await privateScholarshipIds(core.db, ownerId);
  const privateListings = privateIds.size ? await core.db.select({ id: scholarships.id, name: scholarships.name }).from(scholarships).where(inArray(scholarships.id, [...privateIds])) : [];
  const shares = { ...DEFAULT_SHARED };
  for (const row of await core.db.select().from(shareSettings).where(eq(shareSettings.studentId, ownerId))) shares[row.category] = row.enabled;
  const safeEarlier = earlier.filter((message) => {
    if (message.authorKind !== "crew") return true;
    if (conv.room === "family" && (message.sharedCategories ?? []).some((category) => !shares[category])) return false;
    const text = JSON.stringify(message);
    return !privateListings.some((listing) => text.includes(listing.id) || text.includes(listing.name));
  });
  const room = conv.room;
  return CrewRequestInput.parse({
    jobId: job.id,
    ownerId,
    conversationId: conv.id,
    room,
    roomRef: conv.roomRefId && REF_ROOMS.includes(room) ? { type: room, id: conv.roomRefId } : null,
    audience: room === "family" ? "family" : "crew",
    requester,
    userText: request.body,
    history: safeEarlier.reverse().map((m) => ({ author: m.authorKind, speaker: speakerOf(m), text: m.body })),
    mentions: parseMentions(request.body),
  });
}

/**
 * ME-03, D19: each confirm_fact card becomes a memory candidate ("Waiting for your OK"). Never for temporary
 * chats (CR-07) or family audiences (memory never comes from family rooms). A bad or duplicate fact is logged
 * and skipped so it can't fail a finished reply.
 */
export async function fileCandidates(core: CoreDeps, input: CrewRequestInput, reply: CrewReply): Promise<number> {
  if (input.room === "temporary" || input.audience !== "crew") return 0;
  let filed = 0;
  for (const card of reply.actionCards) {
    if (card.kind !== "confirm_fact") continue;
    try {
      await createCandidate(core, SYSTEM, input.ownerId, card.fact);
      filed += 1;
    } catch (e) {
      log("warn", "crew.candidate_skipped", { jobId: input.jobId, cardId: card.id, error: errorLabel(e) });
    }
  }
  return filed;
}

/** CR-01..CR-11 on the worker side: Compass with specialists through makeConsult (00-overview §9.5). */
export async function handleCrewRequest(deps: WorkerDeps, data: unknown, ctx: JobContext = NO_RETRY): Promise<void> {
  const { jobId } = JobPayloads["crew.request"].parse(data);
  await runCrewJob(deps, { name: "crew.request", jobId, ctx, crewRequest: true }, async ({ job, ownerId, base }) => {
    const input = await loadCrewInput(deps.core, job, ownerId);
    if (!input) return { reply: null, status: "failed", error: MISSING_MESSAGE_TEXT };
    // 12-1: Compass and every specialist read through one port bound to this request's audience.
    const bound = { ...base, port: createCrewDataPort(deps.core, { audience: input.audience }) };
    const result = await runCrewRequest({ ...bound, consult: makeConsult(bound) }, input);
    // R2C-15: file candidates only once the reply is saved, so a completeJob failure and retry can't file them twice.
    return {
      reply: result.reply,
      status: result.status,
      safety: result.safety,
      sharedCategories: bound.port.usedCategories(),
      afterComplete: async () => {
        await fileCandidates(deps.core, input, result.reply);
      },
    };
  });
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/crew-request.test.ts && pnpm --filter @scholarcrew/worker typecheck`
Expected: PASS, 1 file, 11 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/handlers/crew-request.ts apps/worker/src/handlers/crew-request.test.ts
git commit -m "feat(worker): crew.request handler with history, audience-bound port, memory candidates, crisis, and refusals"
```

### L8: essay.review and offer.parse handlers

- [ ] **Step 1: Write the failing test**

`apps/worker/src/handlers/essay-offer.test.ts`:

```ts
import type { ModelClient } from "@scholarcrew/agents";
import { createScriptedModelClient } from "@scholarcrew/agents/testing";
import { getJob, getMessages, listConversations } from "@scholarcrew/core/crew";
import { getDocument, uploadDocument } from "@scholarcrew/core/documents";
import { listComments, requestReview, saveVersion } from "@scholarcrew/core/essays";
import { createOffer, getOffer } from "@scholarcrew/core/money";
import { agentRuns, crewJobs, eq, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { SYSTEM, failingModel, makeStudent, makeWorkerDeps } from "../../test/helpers";
import { DEMO_OFFER } from "../demo-model";
import { handleEssayReview } from "./essay-review";
import { NOT_PDF_TEXT, NO_LETTER_TEXT, PARSE_FAILED_TEXT, handleOfferParse } from "./offer-parse";
import { FAILED_TEXT } from "./shared";

const BODY =
  "When our robot died at regionals, I learned that a team can rebuild faster than it can blame. We rebuilt the drive train in two weeks.";

async function essaySetup(model?: ModelClient) {
  const ctx = makeWorkerDeps(model ? { model } : {});
  const student = await makeStudent(ctx.core.db);
  const essay = await factories.essay(ctx.core.db, student.user.id, { title: "Hill Country STEM essay" });
  await saveVersion(ctx.core, student.actor, essay.id, { body: BODY, baseVersion: 0 });
  const job = await requestReview(ctx.core, student.actor, essay.id);
  return { ...ctx, ...student, essay, job, payload: { jobId: job.id, essayId: essay.id } };
}

async function lastReply(s: { core: Parameters<typeof getMessages>[0]; actor: Parameters<typeof getMessages>[1] }) {
  const [room] = await listConversations(s.core, s.actor);
  if (!room) return null;
  return (await getMessages(s.core, s.actor, room.id)).at(-1)?.reply ?? null;
}

describe("essay.review", () => {
  it("saves Quill's comment and replies with a link to the essay (ES-04)", async () => {
    const s = await essaySetup();
    await handleEssayReview(s.deps, s.payload);
    const comments = await listComments(s.core, s.actor, s.essay.id);
    expect(comments.map((c) => c.quote)).toEqual([
      "When our robot died at regionals, I learned that a team can rebuild faster than it can blame.",
    ]);
    expect(await getJob(s.core, SYSTEM, s.job.id)).toMatchObject({ status: "ready", safety: null });
    const reply = await lastReply(s);
    expect(reply).toMatchObject({ text: 'Quill left 1 comment on "Hill Country STEM essay".', contributors: ["quill"] });
    expect(reply?.actionCards).toEqual([
      { kind: "open_link", id: "open-essay", label: "Open the essay", href: `/essays/${s.essay.id}` },
    ]);
    const [usage] = await s.core.db.select().from(usageCounters).where(eq(usageCounters.userId, s.user.id));
    expect(usage?.crewRequests).toBe(1);
  });

  it("saves only comments whose quotes are really in the draft", async () => {
    const model = createScriptedModelClient(() => ({
      content: [
        {
          type: "tool_use",
          name: "submit_comments",
          input: {
            comments: [
              { quote: "We rebuilt the drive train in two weeks.", occurrence: 1, kind: "question", body: "What tools did you use?" },
              { quote: "This sentence is not in the draft.", occurrence: 1, kind: "clarity", body: "Which part do you mean?" },
            ],
          },
        },
      ],
    }));
    const s = await essaySetup(model);
    await handleEssayReview(s.deps, s.payload);
    const comments = await listComments(s.core, s.actor, s.essay.id);
    expect(comments.map((c) => c.quote)).toEqual(["We rebuilt the drive train in two weeks."]);
    expect((await lastReply(s))?.text).toBe('Quill left 1 comment on "Hill Country STEM essay".');
  });

  it("finishes with a refusal reply and no comments when the model refuses", async () => {
    const s = await essaySetup(createScriptedModelClient([{ stopReason: "refusal" }]));
    await handleEssayReview(s.deps, s.payload);
    expect(await listComments(s.core, s.actor, s.essay.id)).toEqual([]);
    expect(await getJob(s.core, SYSTEM, s.job.id)).toMatchObject({ status: "ready", safety: "refusal" });
    expect((await lastReply(s))?.text).toBe('Quill couldn\'t review "Hill Country STEM essay" this time.');
  });
});

async function offerSetup(model?: ModelClient, mime = "application/pdf") {
  const ctx = makeWorkerDeps(model ? { model } : {});
  const student = await makeStudent(ctx.core.db);
  const college = await factories.college(ctx.core.db, { name: "State U" });
  const doc = await uploadDocument(ctx.core, student.actor, {
    kind: "award_letter",
    filename: "state-u.pdf",
    mime,
    bytes: Buffer.from("%PDF-1.4 State U award letter"),
  });
  const offer = await createOffer(ctx.core, student.actor, { collegeId: college.id, documentId: doc.id, awardYear: "2027-28" });
  const sent = ctx.core.jobs.sent.find((j) => j.name === "offer.parse");
  const payload = sent?.payload as { jobId: string; offerId: string };
  return { ...ctx, ...student, doc, offer, payload };
}

describe("offer.parse", () => {
  it("parses the letter, saves the lines for review, and records Aid's usage (MO-04)", async () => {
    const s = await offerSetup();
    await handleOfferParse(s.deps, s.payload);
    const offer = await getOffer(s.core, s.actor, s.offer.id);
    expect(offer).toMatchObject({ status: "needs_review", costOfAttendanceUsd: 27_800 });
    expect(offer.lines.map((l) => l.label)).toEqual(DEMO_OFFER.lines.map((l) => l.label));
    expect((await getDocument(s.core, s.actor, s.doc.id)).parseStatus).toBe("parsed");
    expect(await getJob(s.core, SYSTEM, s.payload.jobId)).toMatchObject({ status: "ready" });
    expect((await lastReply(s))?.text).toBe("Aid read your State U award letter and found 6 lines. Check each one before it counts.");
    const runs = await s.core.db.select().from(agentRuns).where(eq(agentRuns.jobId, s.payload.jobId));
    expect(runs.map((r) => r.role)).toEqual(["aid"]);
    const [usage] = await s.core.db.select().from(usageCounters).where(eq(usageCounters.userId, s.user.id));
    expect(usage).toMatchObject({ crewRequests: 0, costMicros: runs[0]?.costMicros });
  });

  it("marks the offer failed when Aid refuses", async () => {
    const s = await offerSetup(createScriptedModelClient([{ stopReason: "refusal" }]));
    await handleOfferParse(s.deps, s.payload);
    expect((await getOffer(s.core, s.actor, s.offer.id)).status).toBe("failed");
    expect((await getDocument(s.core, s.actor, s.doc.id)).parseStatus).toBe("failed");
    expect(await getJob(s.core, SYSTEM, s.payload.jobId)).toMatchObject({
      status: "failed",
      error: PARSE_FAILED_TEXT,
      safety: "refusal",
    });
  });

  it("doesn't send non-PDF letters to the model", async () => {
    const model = createScriptedModelClient([]);
    const s = await offerSetup(model, "image/png");
    await handleOfferParse(s.deps, s.payload);
    expect(model.extractRequests).toHaveLength(0);
    expect((await getOffer(s.core, s.actor, s.offer.id)).status).toBe("failed");
    expect(await getJob(s.core, SYSTEM, s.payload.jobId)).toMatchObject({ status: "failed", error: NOT_PDF_TEXT });
  });

  it("marks the offer failed on unexpected errors", async () => {
    const s = await offerSetup(failingModel(new Error("boom")));
    await handleOfferParse(s.deps, s.payload);
    expect((await getOffer(s.core, s.actor, s.offer.id)).status).toBe("failed");
    expect(await getJob(s.core, SYSTEM, s.payload.jobId)).toMatchObject({ status: "failed", error: FAILED_TEXT });
  });

  it("points failed letters at a PDF re-upload or the offer tool, never at entering lines (R2P-8)", () => {
    expect(NOT_PDF_TEXT).toBe("Only PDF award letters can be read. Upload the letter as a PDF, or compare it by hand in the offer tool.");
    expect(PARSE_FAILED_TEXT).toBe("We couldn't read that letter. Upload a clearer PDF, or compare it by hand in the offer tool.");
    expect(NO_LETTER_TEXT).toBe(
      "That file doesn't look like an award letter. Upload the letter as a PDF, or compare it by hand in the offer tool.",
    );
    for (const text of [NOT_PDF_TEXT, PARSE_FAILED_TEXT, NO_LETTER_TEXT]) expect(text).not.toContain("enter the lines");
  });

  it("passes the letter's award year when it differs from the offer's (R2P-16)", async () => {
    const s = await offerSetup(createScriptedModelClient([{ extract: { ...DEMO_OFFER, awardYear: "2026-27" } }]));
    await handleOfferParse(s.deps, s.payload);
    expect(await getOffer(s.core, s.actor, s.offer.id)).toMatchObject({ status: "needs_review", awardYear: "2026-27" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/essay-offer.test.ts`
Expected: FAIL with `Failed to resolve import "./essay-review" from "src/handlers/essay-offer.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/handlers/essay-review.ts`:

```ts
import { and, eq, essays } from "@scholarcrew/db";
import { runEssayReview } from "@scholarcrew/agents/specialists";
import { getEssay, saveQuillComments } from "@scholarcrew/core/essays";
import type { CrewReply } from "@scholarcrew/domain";
import { JobPayloads } from "@scholarcrew/jobs";
import { type JobContext, NO_RETRY, type WorkerDeps } from "../types";
import { FAILED_TEXT, SYSTEM, runCrewJob } from "./shared";

export function reviewReply(essayId: string, title: string, count: number, refused: boolean): CrewReply {
  const name = title.trim() ? `"${title.trim().slice(0, 120)}"` : "your essay";
  let text = `Quill left ${count} ${count === 1 ? "comment" : "comments"} on ${name}.`;
  if (refused) text = `Quill couldn't review ${name} this time.`;
  else if (count === 0) text = `Quill read ${name} and didn't leave comments this time.`;
  return {
    text,
    contributors: ["quill"],
    question: null,
    actionCards: [{ kind: "open_link", id: "open-essay", label: "Open the essay", href: `/essays/${essayId}` }],
    receipt: [],
    safety: refused ? "refusal" : null,
    needsInput: false,
  };
}

/** ES-04: Quill reviews the current version; core keeps only comments whose quote is in that version. */
export async function handleEssayReview(deps: WorkerDeps, data: unknown, ctx: JobContext = NO_RETRY): Promise<void> {
  const { jobId, essayId } = JobPayloads["essay.review"].parse(data);
  await runCrewJob(deps, { name: "essay.review", jobId, ctx, crewRequest: true }, async ({ job, ownerId, base }) => {
    if (job.refId !== essayId) return { reply: null, status: "failed", error: FAILED_TEXT };
    const [owned] = await deps.core.db.select({ id: essays.id }).from(essays).where(and(eq(essays.id, essayId), eq(essays.ownerId, ownerId)));
    if (!owned) return { reply: null, status: "failed", error: FAILED_TEXT };
    const essay = await getEssay(deps.core, SYSTEM, essayId);

    const { comments, refused } = await runEssayReview(base, { ownerId, essayId, version: essay.currentVersion, body: essay.body, context: { prompt: essay.prompt, wordLimit: essay.wordLimit, charLimit: essay.charLimit, targetLabel: essay.targetLabel } });
    const saved =
      comments.length > 0 && essay.currentVersion > 0
        ? await saveQuillComments(deps.core, SYSTEM, { ownerId, essayId, version: essay.currentVersion, jobId, comments })
        : [];
    return {
      reply: reviewReply(essayId, essay.title, saved.length, refused),
      status: "ready",
      safety: refused ? "refusal" : null,
    };
  });
}
```

`apps/worker/src/handlers/offer-parse.ts`:

```ts
import { and, eq, offers } from "@scholarcrew/db";
import { runOfferParse } from "@scholarcrew/agents/specialists";
import { readDocumentBytes } from "@scholarcrew/core/documents";
import { getOffer, markOfferFailed, saveParsedOffer } from "@scholarcrew/core/money";
import type { CrewReply } from "@scholarcrew/domain";
import { JobPayloads } from "@scholarcrew/jobs";
import { type JobContext, NO_RETRY, type WorkerDeps } from "../types";
import { SYSTEM, runCrewJob } from "./shared";

// R2P-8: no route creates offer lines, so failures point at a PDF re-upload or the public offer tool.
export const NOT_PDF_TEXT = "Only PDF award letters can be read. Upload the letter as a PDF, or compare it by hand in the offer tool.";
export const PARSE_FAILED_TEXT = "We couldn't read that letter. Upload a clearer PDF, or compare it by hand in the offer tool.";
export const NO_LETTER_TEXT =
  "That file doesn't look like an award letter. Upload the letter as a PDF, or compare it by hand in the offer tool.";

export function offerReply(offerId: string, collegeName: string, lineCount: number): CrewReply {
  return {
    text: `Aid read your ${collegeName} award letter and found ${lineCount} ${lineCount === 1 ? "line" : "lines"}. Check each one before it counts.`,
    contributors: ["aid"],
    question: null,
    actionCards: [{ kind: "open_link", id: "review-offer", label: "Review the lines", href: `/money/offers/${offerId}` }],
    receipt: [],
    safety: null,
    needsInput: false,
  };
}

/** MO-04: Aid reads the PDF; the student reviews every line before it counts (MO-05, plan 08). */
export async function handleOfferParse(deps: WorkerDeps, data: unknown, ctx: JobContext = NO_RETRY): Promise<void> {
  const { jobId, offerId } = JobPayloads["offer.parse"].parse(data);
  let ownerForFailure: string | null = null;
  const fail = async (reason: string) => { if (ownerForFailure) await markOfferFailed(deps.core, SYSTEM, { offerId, ownerId: ownerForFailure, error: reason }); };
  await runCrewJob(
    deps,
    { name: "offer.parse", jobId, ctx, crewRequest: false, onFailed: () => fail("job_failed") },
    async ({ job, ownerId, base }) => {
      if (job.refId !== offerId) return { reply: null, status: "failed", error: PARSE_FAILED_TEXT };
      const [owned] = await deps.core.db.select({ id: offers.id }).from(offers).where(and(eq(offers.id, offerId), eq(offers.ownerId, ownerId)));
      if (!owned) return { reply: null, status: "failed", error: PARSE_FAILED_TEXT };
      ownerForFailure = ownerId;
      const offer = await getOffer(deps.core, SYSTEM, offerId);
      if (!offer.documentId) {
        await fail("no_document");
        return { reply: null, status: "failed", error: NO_LETTER_TEXT };
      }
      const { meta, bytes } = await readDocumentBytes(deps.core, SYSTEM, offer.documentId);
      if (meta.mime !== "application/pdf" || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        await fail("not_pdf");
        return { reply: null, status: "failed", error: NOT_PDF_TEXT };
      }
      const { parsed, refused } = await runOfferParse(base, {
        ownerId,
        pdfBase64: bytes.toString("base64"),
        collegeName: offer.collegeName,
      });
      if (!parsed) {
        await fail(refused ? "refused" : "no_result");
        return { reply: null, status: "failed", error: PARSE_FAILED_TEXT, safety: refused ? "refusal" : null };
      }
      const saved = await saveParsedOffer(deps.core, SYSTEM, {
        ownerId,
        offerId,
        costOfAttendanceUsd: parsed.costOfAttendanceUsd,
        lines: parsed.lines,
        // R2P-16: pass the letter's year only when it differs; 08 keeps it only within a year of the current award year.
        ...(parsed.awardYear && parsed.awardYear !== offer.awardYear ? { awardYear: parsed.awardYear } : {}),
      });
      return { reply: offerReply(offerId, offer.collegeName, saved.lines.length), status: "ready" };
    },
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/essay-offer.test.ts && pnpm --filter @scholarcrew/worker typecheck`
Expected: PASS, 1 file, 9 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/handlers/essay-review.ts apps/worker/src/handlers/offer-parse.ts apps/worker/src/handlers/essay-offer.test.ts
git commit -m "feat(worker): essay.review and offer.parse handlers"
```

### L9: appeal.outline, prep.retake, plan.weekly, and plan.weekly.fanout handlers

- [ ] **Step 1: Write the failing test**

`apps/worker/src/handlers/crew-jobs.test.ts`:

```ts
import type { ModelClient } from "@scholarcrew/agents";
import { createScriptedModelClient } from "@scholarcrew/agents/testing";
import { getJob, getMessages, listConversations } from "@scholarcrew/core/crew";
import { uploadDocument } from "@scholarcrew/core/documents";
import { confirmOffer, createOffer, requestAppealOutline } from "@scholarcrew/core/money";
import { listNotifications } from "@scholarcrew/core/notifications";
import { addPlanItem, getWeekPlan, replaceGeneratedPlan, requestWeeklyPlan, startWeeklyPlan } from "@scholarcrew/core/plan";
import { requestRetakeAnalysis } from "@scholarcrew/core/prep";
import { saveScholarship } from "@scholarcrew/core/scholarships";
import { aidChecklistItems, eq, profiles, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { PlanItemInput } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, makeStudent, makeWorkerDeps } from "../../test/helpers";
import { handleAppealOutline } from "./appeal-outline";
import { handleOfferParse } from "./offer-parse";
import { PLAN_FAILED_TEXT, handlePlanWeekly } from "./plan-weekly";
import { handlePlanWeeklyFanout } from "./plan-weekly-fanout";
import { handlePrepRetake } from "./prep-retake";

const item = (title: string, o: Partial<PlanItemInput> = {}): PlanItemInput => ({
  title,
  kind: "custom",
  refType: null,
  refId: null,
  minutes: 15,
  valueUsd: null,
  dueOn: null,
  contributors: [],
  weekStart: null,
  ...o,
});

async function setup(model?: ModelClient) {
  const ctx = makeWorkerDeps(model ? { model } : {});
  return { ...ctx, ...(await makeStudent(ctx.core.db)) };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function payloadOf<T>(s: Setup, name: string): T {
  const sent = s.core.jobs.sent.filter((j) => j.name === name).at(-1);
  if (!sent) throw new Error(`no ${name} job queued`);
  return sent.payload as T;
}

async function lastReply(s: Setup) {
  const [room] = await listConversations(s.core, s.actor);
  if (!room) return null;
  return (await getMessages(s.core, s.actor, room.id)).at(-1)?.reply ?? null;
}

describe("appeal.outline", () => {
  it("builds an outline for a confirmed offer (MO-08)", async () => {
    const s = await setup();
    const college = await factories.college(s.core.db, { name: "State U" });
    const doc = await uploadDocument(s.core, s.actor, {
      kind: "award_letter",
      filename: "state-u.pdf",
      mime: "application/pdf",
      bytes: Buffer.from("%PDF-1.4 State U"),
    });
    const offer = await createOffer(s.core, s.actor, { collegeId: college.id, documentId: doc.id, awardYear: "2027-28" });
    await handleOfferParse(s.deps, payloadOf(s, "offer.parse"));
    await confirmOffer(s.core, s.actor, offer.id);
    s.clock.set("2026-10-06T15:05:00.000Z");
    const job = await requestAppealOutline(s.core, s.actor, offer.id);
    await handleAppealOutline(s.deps, payloadOf(s, "appeal.outline"));
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "ready", safety: null });
    const reply = await lastReply(s);
    expect(reply?.text).toContain("Points to raise");
    expect(reply?.text).toContain("Documents to gather");
    expect(reply?.text).not.toMatch(/\b(dear|sincerely)\b/i);
    expect(reply?.contributors).toContain("aid");
  });
});

describe("prep.retake", () => {
  it("computes the retake value in code and explains it (PR-03)", async () => {
    const s = await setup();
    const job = await requestRetakeAnalysis(s.core, s.actor, { test: "ACT", targetComposite: 31 });
    await handlePrepRetake(s.deps, payloadOf(s, "prep.retake"));
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "ready", safety: null });
    const reply = await lastReply(s);
    expect(reply?.contributors).toEqual(["prep"]);
    expect(reply?.receipt.map((r) => r.refId)).toEqual(["calc:retake"]);
  });
});

describe("plan.weekly", () => {
  it("replaces crew items, keeps the student's own, and ensures aid checklists (ON-06)", async () => {
    const s = await setup();
    const listing = await factories.scholarship(s.core.db, { name: "Maple County STEM Award", deadline: "2026-10-20" });
    await saveScholarship(s.core, s.actor, { scholarshipId: listing.id });
    await addPlanItem(s.core, s.actor, item("My own task"));
    await replaceGeneratedPlan(s.core, SYSTEM, {
      ownerId: s.user.id,
      weekStart: "2026-10-05",
      items: [item("Old crew item", { contributors: ["compass"] })],
    });
    const job = await requestWeeklyPlan(s.core, s.actor);
    await handlePlanWeekly(s.deps, payloadOf(s, "plan.weekly"));

    const plan = await getWeekPlan(s.core, s.actor, s.user.id);
    const titles = plan.items.map((i) => i.title);
    expect(titles).toContain("My own task");
    expect(titles).toContain("Work on Maple County STEM Award");
    expect(titles).toContain("Spend 20 minutes on your Story Bank");
    expect(titles).not.toContain("Old crew item");
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "ready" });
    const checklist = await s.core.db.select().from(aidChecklistItems).where(eq(aidChecklistItems.ownerId, s.user.id));
    expect(checklist.length).toBeGreaterThan(0);
    expect((await listNotifications(s.core, s.actor)).map((n) => n.title)).toContain("Your weekly plan is ready");
    const [usage] = await s.core.db.select().from(usageCounters).where(eq(usageCounters.userId, s.user.id));
    expect(usage?.crewRequests).toBe(1);
  });

  it("plans for the job's owner even if the payload names someone else", async () => {
    const s = await setup();
    const other = await makeStudent(s.core.db);
    const job = await requestWeeklyPlan(s.core, s.actor);
    await handlePlanWeekly(s.deps, { jobId: job.id, ownerId: other.user.id });
    expect((await getWeekPlan(s.core, s.actor, s.user.id)).items.length).toBeGreaterThan(0);
    expect((await getWeekPlan(s.core, other.actor, other.user.id)).items).toEqual([]);
  });

  it("keeps the old plan on a refusal and fails when Compass never submits", async () => {
    const refusing = await setup(createScriptedModelClient([{ stopReason: "refusal" }]));
    await replaceGeneratedPlan(refusing.core, SYSTEM, {
      ownerId: refusing.user.id,
      weekStart: "2026-10-05",
      items: [item("Old crew item", { contributors: ["compass"] })],
    });
    const refusedJob = await requestWeeklyPlan(refusing.core, refusing.actor);
    await handlePlanWeekly(refusing.deps, payloadOf(refusing, "plan.weekly"));
    expect(await getJob(refusing.core, SYSTEM, refusedJob.id)).toMatchObject({ status: "ready", safety: "refusal" });
    expect((await getWeekPlan(refusing.core, refusing.actor, refusing.user.id)).items.map((i) => i.title)).toEqual([
      "Old crew item",
    ]);

    const silent = await setup(createScriptedModelClient(() => ({ content: [{ type: "text", text: "Thinking." }] })));
    const silentJob = await requestWeeklyPlan(silent.core, silent.actor);
    await handlePlanWeekly(silent.deps, payloadOf(silent, "plan.weekly"));
    expect(await getJob(silent.core, SYSTEM, silentJob.id)).toMatchObject({ status: "failed", error: PLAN_FAILED_TEXT });
  });

  it("records a system plan's cost without counting it against the allowance (R2C-5)", async () => {
    const s = await setup();
    const job = await startWeeklyPlan(s.core, SYSTEM, s.user.id);
    expect(job).not.toBeNull();
    expect(payloadOf<{ source?: string }>(s, "plan.weekly").source).toBe("system");
    await handlePlanWeekly(s.deps, payloadOf(s, "plan.weekly"));
    expect(await getJob(s.core, SYSTEM, job?.id ?? "")).toMatchObject({ status: "ready" });
    const [usage] = await s.core.db.select().from(usageCounters).where(eq(usageCounters.userId, s.user.id));
    expect(usage?.crewRequests).toBe(0);
    expect(usage?.costMicros).toBeGreaterThan(0);
  });
});

describe("plan.weekly.fanout", () => {
  it("starts one system plan per active, onboarded student, and a rerun starts none (R2C-5)", async () => {
    const s = await setup();
    const b = await makeStudent(s.core.db);
    const notOnboarded = await makeStudent(s.core.db);
    await s.core.db.update(profiles).set({ onboardingCompletedAt: null }).where(eq(profiles.userId, notOnboarded.user.id));
    await factories.parent(s.core.db);

    await handlePlanWeeklyFanout(s.deps, {});
    const planned = () =>
      s.core.jobs.sent.filter((j) => j.name === "plan.weekly").map((j) => j.payload as { ownerId: string; source?: string });
    expect(planned().map((p) => p.ownerId).sort()).toEqual([s.user.id, b.user.id].sort());
    expect(planned().every((p) => p.source === "system")).toBe(true);

    // startWeeklyPlan skips owners with a weekly_plan job in the last 12 hours, so a retried fan-out is a no-op.
    s.clock.set("2026-10-06T16:00:00.000Z");
    await handlePlanWeeklyFanout(s.deps, {});
    expect(planned()).toHaveLength(2);
    await expect(handlePlanWeeklyFanout(s.deps, { extra: 1 })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/crew-jobs.test.ts`
Expected: FAIL with `Failed to resolve import "./appeal-outline" from "src/handlers/crew-jobs.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/handlers/appeal-outline.ts`:

```ts
import { runAppealOutline } from "@scholarcrew/agents/specialists";
import { JobPayloads } from "@scholarcrew/jobs";
import { type JobContext, NO_RETRY, type WorkerDeps } from "../types";
import { runCrewJob } from "./shared";

/** MO-08: Aid's appeal outline. The student writes the letter. */
export async function handleAppealOutline(deps: WorkerDeps, data: unknown, ctx: JobContext = NO_RETRY): Promise<void> {
  const { jobId, offerId } = JobPayloads["appeal.outline"].parse(data);
  await runCrewJob(deps, { name: "appeal.outline", jobId, ctx, crewRequest: true }, async ({ ownerId, base }) => {
    const reply = await runAppealOutline(base, { ownerId, offerId });
    return { reply, status: reply.needsInput ? "needs_input" : "ready", safety: reply.safety };
  });
}
```

`apps/worker/src/handlers/prep-retake.ts`:

```ts
import { runRetakeExplanation } from "@scholarcrew/agents/specialists";
import { computeRetake } from "@scholarcrew/core/prep";
import { JobPayloads } from "@scholarcrew/jobs";
import { type JobContext, NO_RETRY, type WorkerDeps } from "../types";
import { SYSTEM, runCrewJob } from "./shared";

/** PR-03: the dollar values come from computeRetake (code); Prep only explains them. */
export async function handlePrepRetake(deps: WorkerDeps, data: unknown, ctx: JobContext = NO_RETRY): Promise<void> {
  const { jobId, test, targetComposite } = JobPayloads["prep.retake"].parse(data);
  await runCrewJob(deps, { name: "prep.retake", jobId, ctx, crewRequest: true }, async ({ ownerId, base }) => {
    const analysis = await computeRetake(deps.core, SYSTEM, ownerId, { test, targetComposite });
    const reply = await runRetakeExplanation(base, { ownerId, analysis });
    return { reply, status: reply.needsInput ? "needs_input" : "ready", safety: reply.safety };
  });
}
```

`apps/worker/src/handlers/plan-weekly.ts`:

```ts
import { runWeeklyPlan } from "@scholarcrew/agents";
import { makeConsult } from "@scholarcrew/agents/specialists";
import { ensureChecklists } from "@scholarcrew/core/aid";
import { replaceGeneratedPlan } from "@scholarcrew/core/plan";
import { eq, users } from "@scholarcrew/db";
import { weekStartFor } from "@scholarcrew/engines";
import { JobPayloads } from "@scholarcrew/jobs";
import { DEFAULT_TIME_ZONE, safeTimeZone } from "../time";
import { type JobContext, NO_RETRY, type WorkerDeps } from "../types";
import { SYSTEM, runCrewJob } from "./shared";

export const PLAN_FAILED_TEXT = "Compass couldn't finish your plan this time. Try again in a minute.";

/**
 * ON-06 and the weekly plan button. Aid checklists are ensured first so the plan sees aid deadlines.
 * The job's owner (crewJobs.ownerId) is used; the payload's ownerId is only a hint.
 */
export async function handlePlanWeekly(deps: WorkerDeps, data: unknown, ctx: JobContext = NO_RETRY): Promise<void> {
  const { jobId, source } = JobPayloads["plan.weekly"].parse(data);
  // R2C-5: a system plan (Monday fan-out) records its cost but doesn't count against the monthly allowance.
  // A missing source means "user".
  const crewRequest = source !== "system";
  await runCrewJob(deps, { name: "plan.weekly", jobId, ctx, crewRequest }, async ({ ownerId, base }) => {
    await ensureChecklists(deps.core, SYSTEM, ownerId);
    const [user] = await deps.core.db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, ownerId));
    const weekStart = weekStartFor(deps.core.clock.now(), safeTimeZone(user?.timeZone ?? DEFAULT_TIME_ZONE));
    const { items, reply } = await runWeeklyPlan({ ...base, consult: makeConsult(base) }, { ownerId, weekStart });
    if (items.length > 0) await replaceGeneratedPlan(deps.core, SYSTEM, { ownerId, weekStart, items });
    if (!reply) return { reply: null, status: "failed", error: PLAN_FAILED_TEXT };
    return { reply, status: reply.needsInput ? "needs_input" : "ready", safety: reply.safety };
  });
}
```

`apps/worker/src/handlers/plan-weekly-fanout.ts`:

```ts
import { startWeeklyPlan } from "@scholarcrew/core/plan";
import { and, eq, isNotNull, profiles, users } from "@scholarcrew/db";
import { JobPayloads } from "@scholarcrew/jobs";
import { errorLabel, log } from "../log";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/**
 * R2C-5 (WK-01, WK-02): the Monday 11:00 UTC fan-out (00 §9.3 SCHEDULES), Monday morning in every US zone.
 * Same student query as sweep.weekly (L10). startWeeklyPlan skips parents, unfinished students, and owners with a
 * weekly_plan job in the last 12 hours, so a retried fan-out queues nothing new. One student's failure is logged
 * and the loop continues.
 */
export async function handlePlanWeeklyFanout(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["plan.weekly.fanout"].parse(data);
  const rows = await deps.core.db
    .select({ id: users.id })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(users.role, "student"), eq(users.status, "active"), isNotNull(profiles.onboardingCompletedAt)));
  let started = 0;
  for (const row of rows) {
    try {
      if (await startWeeklyPlan(deps.core, SYSTEM, row.id)) started += 1;
    } catch (e) {
      log("error", "plan.weekly.fanout_failed", { studentId: row.id, error: errorLabel(e) });
    }
  }
  log("info", "plan.weekly.fanout", { candidates: rows.length, started });
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/crew-jobs.test.ts && pnpm --filter @scholarcrew/worker typecheck`
Expected: PASS, 1 file, 7 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/handlers/appeal-outline.ts apps/worker/src/handlers/prep-retake.ts apps/worker/src/handlers/plan-weekly.ts apps/worker/src/handlers/plan-weekly-fanout.ts apps/worker/src/handlers/crew-jobs.test.ts
git commit -m "feat(worker): appeal.outline, prep.retake, plan.weekly, and the Monday plan fan-out handlers"
```

### L10: sweep.weekly and sweep.student handlers

- [ ] **Step 1: Write the failing test**

`apps/worker/src/handlers/sweeps.test.ts`:

```ts
import { eq, notifications, profiles, scholarshipApplications, sweepRuns, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { makeStudent, makeWorkerDeps } from "../../test/helpers";
import { handleSweepStudent } from "./sweep-student";
import { handleSweepWeekly, sweepKey } from "./sweep-weekly";

describe("sweep.weekly", () => {
  it("queues one sweep per active, onboarded student with a weekly singleton key (SC-10)", async () => {
    const { deps, core, clock } = makeWorkerDeps();
    clock.set("2026-10-11T14:00:00.000Z"); // Sunday 09:00 in Chicago, Monday 04:00 in Kiritimati
    const a = await makeStudent(core.db);
    const b = await makeStudent(core.db);
    await core.db.update(users).set({ timeZone: "Pacific/Kiritimati" }).where(eq(users.id, b.user.id));
    const notOnboarded = await makeStudent(core.db);
    await core.db.update(profiles).set({ onboardingCompletedAt: null }).where(eq(profiles.userId, notOnboarded.user.id));
    const deleted = await makeStudent(core.db);
    await core.db.update(users).set({ status: "deleted", deletedAt: clock.now() }).where(eq(users.id, deleted.user.id));
    await factories.parent(core.db);

    await handleSweepWeekly(deps, {});
    const sent = [...core.jobs.sent].sort((x, y) =>
      String((x.payload as { studentId: string }).studentId).localeCompare(String((y.payload as { studentId: string }).studentId)),
    );
    const expected = [
      { id: a.user.id, week: "2026-10-05" },
      { id: b.user.id, week: "2026-10-12" },
    ].sort((x, y) => x.id.localeCompare(y.id));
    expect(sent).toEqual(
      expected.map((e) => ({
        name: "sweep.student",
        payload: { studentId: e.id },
        opts: { singletonKey: sweepKey(e.id, e.week) },
      })),
    );
    expect(sweepKey(a.user.id, "2026-10-05")).toBe(`sweep:${a.user.id}:2026-10-05`);
  });

  it("rejects a payload with unknown keys", async () => {
    const { deps } = makeWorkerDeps();
    await expect(handleSweepWeekly(deps, { extra: 1 })).rejects.toThrow();
  });
});

describe("sweep.student", () => {
  it("adds new matches once and notifies the student", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    await factories.scholarship(core.db, { name: "National STEM Award" });
    await handleSweepStudent(deps, { studentId: s.user.id });
    await handleSweepStudent(deps, { studentId: s.user.id });
    const apps = await core.db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.ownerId, s.user.id));
    expect(apps.map((x) => x.stage)).toEqual(["matched"]);
    const notes = await core.db.select().from(notifications).where(eq(notifications.userId, s.user.id));
    expect(notes.map((n) => n.kind)).toEqual(["new_matches"]);
    expect(await core.db.select().from(sweepRuns).where(eq(sweepRuns.ownerId, s.user.id))).toHaveLength(2);
  });

  it("skips deleted students", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    await core.db.update(users).set({ status: "deleted" }).where(eq(users.id, s.user.id));
    await handleSweepStudent(deps, { studentId: s.user.id });
    expect(await core.db.select().from(sweepRuns).where(eq(sweepRuns.ownerId, s.user.id))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/sweeps.test.ts`
Expected: FAIL with `Failed to resolve import "./sweep-student" from "src/handlers/sweeps.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/handlers/sweep-weekly.ts`:

```ts
import { and, eq, isNotNull, profiles, users } from "@scholarcrew/db";
import { weekStartFor } from "@scholarcrew/engines";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import { safeTimeZone } from "../time";
import type { WorkerDeps } from "../types";

export function sweepKey(studentId: string, weekStart: string): string {
  return `sweep:${studentId}:${weekStart}`;
}

/**
 * SC-10: the Sunday fan-out. One sweep.student per active, onboarded student per week (in their time zone).
 * `sweep.student` is a standard queue (06's onboarding enqueue sends no key), so the singleton key doesn't dedupe:
 * a retried sweep.weekly can queue a student twice. That's accepted: runSweep is idempotent per student and week
 * (a second run adds no matches and sends no second notification; the sweep.student test runs it twice).
 */
export async function handleSweepWeekly(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["sweep.weekly"].parse(data);
  const now = deps.core.clock.now();
  const rows = await deps.core.db
    .select({ id: users.id, timeZone: users.timeZone })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(users.role, "student"), eq(users.status, "active"), isNotNull(profiles.onboardingCompletedAt)));
  let queued = 0;
  for (const row of rows) {
    const weekStart = weekStartFor(now, safeTimeZone(row.timeZone));
    const id = await deps.core.jobs.enqueue(
      "sweep.student",
      { studentId: row.id },
      { singletonKey: sweepKey(row.id, weekStart) },
    );
    if (id) queued += 1;
  }
  log("info", "sweep.weekly", { students: rows.length, queued });
}
```

`apps/worker/src/handlers/sweep-student.ts`:

```ts
import { runSweep } from "@scholarcrew/core/scholarships";
import { eq, users } from "@scholarcrew/db";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/** One student's sweep (SC-10, and ON-06's first sweep). Core dedupes matches and the weekly notification. */
export async function handleSweepStudent(deps: WorkerDeps, data: unknown): Promise<void> {
  const { studentId } = JobPayloads["sweep.student"].parse(data);
  const [user] = await deps.core.db
    .select({ role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, studentId));
  if (!user || user.role !== "student" || user.status !== "active") {
    log("info", "sweep.skipped", { studentId });
    return;
  }
  const result = await runSweep(deps.core, SYSTEM, studentId);
  log("info", "sweep.student", { studentId, newMatches: result.newMatches });
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/sweeps.test.ts && pnpm --filter @scholarcrew/worker typecheck`
Expected: PASS, 1 file, 4 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/handlers/sweep-weekly.ts apps/worker/src/handlers/sweep-student.ts apps/worker/src/handlers/sweeps.test.ts
git commit -m "feat(worker): weekly sweep fan-out and per-student sweep"
```

### L11: reminders.deadlines, digest.weekly, notify.email, and notify.sms handlers

- [ ] **Step 1: Write the failing test**

`apps/worker/src/handlers/notices.test.ts`:

```ts
import { addCollege } from "@scholarcrew/core/colleges";
import { notify, updatePrefs } from "@scholarcrew/core/notifications";
import { addPlanItem } from "@scholarcrew/core/plan";
import { saveScholarship } from "@scholarcrew/core/scholarships";
import { TEST_NOW } from "@scholarcrew/core/shared";
import { collegeList, eq, notificationPrefs, notifications, scholarshipApplications } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { PlanItemInput } from "@scholarcrew/domain";
import { describe, expect, it, vi } from "vitest";
import { SYSTEM, emailsTo, makeStudent, makeWorkerDeps } from "../../test/helpers";
import { handleDigestWeekly } from "./digest-weekly";
import { handleNotifyEmail } from "./notify-email";
import { handleNotifySms } from "./notify-sms";
import { handleRemindersDeadlines, renewalBody } from "./reminders-deadlines";

const PHONE = "+15125550100";

const item = (title: string): PlanItemInput => ({
  title,
  kind: "essay",
  refType: null,
  refId: null,
  minutes: 45,
  valueUsd: null,
  dueOn: null,
  contributors: [],
  weekStart: null,
});

describe("reminders.deadlines", () => {
  it("creates each reminder once and queues its email (NO-03)", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    const listing = await factories.scholarship(core.db, { name: "Maple County STEM Award", deadline: "2026-10-13" });
    await saveScholarship(core, s.actor, { scholarshipId: listing.id });
    const [app] = await core.db.select().from(scholarshipApplications).where(eq(scholarshipApplications.ownerId, s.user.id));

    await handleRemindersDeadlines(deps, {});
    await handleRemindersDeadlines(deps, {});
    const notes = await core.db.select().from(notifications).where(eq(notifications.userId, s.user.id));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      kind: "deadline",
      title: "Maple County STEM Award is due in 7 days",
      body: "Due Oct 13. Plan time for it this week.",
      link: "/scholarships",
      dedupeKey: `reminder:scholarship_application:${app?.id}:7`,
    });
    expect(core.jobs.sent).toEqual([{ name: "notify.email", payload: { notificationId: notes[0]?.id } }]);
  });

  it("links a college reminder to its list entry (R3E-9)", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    const college = await factories.college(core.db, {
      name: "Maple State",
      deadlines: { ED: "2026-10-13", EA: null, REA: null, RD: null, rolling: false },
    });
    await addCollege(core, s.actor, { collegeId: college.id, fit: "target", plan: "ED" });
    const [entry] = await core.db.select().from(collegeList).where(eq(collegeList.ownerId, s.user.id));

    await handleRemindersDeadlines(deps, {});
    const notes = await core.db.select().from(notifications).where(eq(notifications.userId, s.user.id));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      kind: "deadline",
      body: "Due Oct 13. Plan time for it this week.",
      link: `/colleges/${entry?.id}`,
      dedupeKey: `reminder:college_list:${entry?.id}:7`,
    });
  });

  it("sends a renewal reminder 30 days ahead with renewal copy and a link to the award (SC-11, D2)", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    const listing = await factories.scholarship(core.db, { name: "Maple Rotary", deadline: null });
    const [app] = await core.db
      .insert(scholarshipApplications)
      .values({
        ownerId: s.user.id,
        scholarshipId: listing.id,
        stage: "won",
        outcomeUsd: 2000,
        outcomeRenewable: true,
        outcomeAt: new Date("2025-11-05T15:00:00.000Z"),
      })
      .returning();

    await handleRemindersDeadlines(deps, {});
    await handleRemindersDeadlines(deps, {});
    const notes = await core.db.select().from(notifications).where(eq(notifications.userId, s.user.id));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      kind: "deadline",
      title: "Maple Rotary renewal is coming up",
      body: renewalBody("2026-11-05"),
      link: `/scholarships/${listing.slug}`,
      dedupeKey: `renewal:${app?.id}:2026`,
    });
    expect(renewalBody("2026-11-05")).toBe(
      "Your award renews around Nov 5. Check what the provider needs to renew it, like grades or a form, and plan time for it.",
    );
    expect(core.jobs.sent).toEqual([{ name: "notify.email", payload: { notificationId: notes[0]?.id } }]);
  });

  it("texts only 1-day, non-renewal reminders, and only to students who opted in (NO-05)", async () => {
    const { deps, core } = makeWorkerDeps();
    const texter = await makeStudent(core.db);
    await updatePrefs(core, texter.actor, { smsEnabled: true, phone: PHONE });
    const tomorrow = await factories.scholarship(core.db, { name: "Tomorrow Award", deadline: "2026-10-07" });
    const later = await factories.scholarship(core.db, { name: "Three Day Award", deadline: "2026-10-09" });
    await saveScholarship(core, texter.actor, { scholarshipId: tomorrow.id });
    await saveScholarship(core, texter.actor, { scholarshipId: later.id });
    const renewing = await factories.scholarship(core.db, { name: "Maple Rotary", deadline: null });
    await core.db.insert(scholarshipApplications).values({
      ownerId: texter.user.id,
      scholarshipId: renewing.id,
      stage: "won",
      outcomeUsd: 2000,
      outcomeRenewable: true,
      outcomeAt: new Date("2025-11-05T15:00:00.000Z"),
    });
    const notOptedIn = await makeStudent(core.db);
    await saveScholarship(core, notOptedIn.actor, { scholarshipId: tomorrow.id });

    await handleRemindersDeadlines(deps, {});
    const mine = await core.db.select().from(notifications).where(eq(notifications.userId, texter.user.id));
    expect(mine).toHaveLength(3);
    const oneDay = mine.find((n) => n.dedupeKey.startsWith("reminder:") && n.dedupeKey.endsWith(":1"));
    expect(core.jobs.sent.filter((j) => j.name === "notify.sms")).toEqual([
      { name: "notify.sms", payload: { notificationId: oneDay?.id } },
    ]);
    expect(core.jobs.sent.filter((j) => j.name === "notify.email")).toHaveLength(4);
  });
});

describe("digest.weekly", () => {
  it("emails students whose digest day and hour match, once per week (NO-02)", async () => {
    const { deps, core } = makeWorkerDeps();
    const prefs = (userId: string, o: { digestDay: number; digestHour: number; emailEnabled?: boolean }) =>
      core.db.insert(notificationPrefs).values({ userId, updatedAt: new Date(TEST_NOW), ...o });
    const due = await makeStudent(core.db);
    await prefs(due.user.id, { digestDay: 2, digestHour: 10 });
    await addPlanItem(core, due.actor, item("Draft the Rotary essay"));
    const sundayPerson = await makeStudent(core.db);
    await addPlanItem(core, sundayPerson.actor, item("Log tutoring hours"));
    const optedOut = await makeStudent(core.db);
    await prefs(optedOut.user.id, { digestDay: 2, digestHour: 10, emailEnabled: false });
    await addPlanItem(core, optedOut.actor, item("Finish the FAFSA"));
    const quiet = await makeStudent(core.db);
    await prefs(quiet.user.id, { digestDay: 2, digestHour: 10 });

    await handleDigestWeekly(deps, {});
    await handleDigestWeekly(deps, {});

    const sent = await emailsTo(core.db, due.user.email);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toMatch(/^Your week: 1 step/);
    expect(sent[0]?.text).toContain("Draft the Rotary essay");
    const notes = await core.db.select().from(notifications).where(eq(notifications.userId, due.user.id));
    expect(notes.map((n) => [n.kind, n.dedupeKey])).toEqual([["digest", `digest:${due.user.id}:2026-10-05`]]);
    for (const other of [sundayPerson, optedOut, quiet]) expect(await emailsTo(core.db, other.user.email)).toEqual([]);
    expect(core.jobs.sent.filter((j) => j.name === "notify.email")).toEqual([]);
  });

  it("waits out quiet hours: a 22:00 digest with quiet hours 21-7 goes at 07:00 (R2I-16)", async () => {
    const { deps, core, clock } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    await core.db.insert(notificationPrefs).values({
      userId: s.user.id,
      digestDay: 2,
      digestHour: 22,
      quietStartHour: 21,
      quietEndHour: 7,
      updatedAt: new Date(TEST_NOW),
    });
    await addPlanItem(core, s.actor, item("Draft the Rotary essay"));
    clock.set("2026-10-06T11:00:00.000Z"); // Tuesday 06:00 in Chicago: still quiet
    await handleDigestWeekly(deps, {});
    expect(await emailsTo(core.db, s.user.email)).toEqual([]);
    clock.set("2026-10-06T12:00:00.000Z"); // 07:00: quiet hours end
    await handleDigestWeekly(deps, {});
    clock.set("2026-10-07T03:00:00.000Z"); // 22:00 the same Tuesday: quiet again, and already sent
    await handleDigestWeekly(deps, {});
    expect(await emailsTo(core.db, s.user.email)).toHaveLength(1);
  });

  it("retracts the digest notification when the send fails, so the next hour retries once (R2I-16)", async () => {
    const { deps, core, clock } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    await core.db.insert(notificationPrefs).values({ userId: s.user.id, digestDay: 2, digestHour: 10, updatedAt: new Date(TEST_NOW) });
    await addPlanItem(core, s.actor, item("Draft the Rotary essay"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(core.email, "send").mockRejectedValueOnce(new Error("resend down"));
    await handleDigestWeekly(deps, {});
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('"msg":"digest.failed"'));
    errors.mockRestore();
    const digests = () => core.db.select().from(notifications).where(eq(notifications.userId, s.user.id));
    expect(await digests()).toEqual([]);
    clock.set("2026-10-06T16:00:00.000Z"); // 11:00 in Chicago, still the digest day
    await handleDigestWeekly(deps, {});
    await handleDigestWeekly(deps, {});
    expect(await emailsTo(core.db, s.user.email)).toHaveLength(1);
    expect((await digests()).map((n) => n.dedupeKey)).toEqual([`digest:${s.user.id}:2026-10-05`]);
  });
});

describe("notify.email", () => {
  it("delivers a notification email once", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    const note = await notify(core, SYSTEM, {
      userId: s.user.id,
      kind: "system",
      title: "Welcome to ScholarCrew",
      body: "Your crew is setting up.",
      link: "/week",
      dedupeKey: `welcome:${s.user.id}`,
      email: true,
    });
    expect(core.jobs.sent).toEqual([{ name: "notify.email", payload: { notificationId: note?.id } }]);
    await handleNotifyEmail(deps, { notificationId: note?.id });
    await handleNotifyEmail(deps, { notificationId: note?.id });
    const sent = await emailsTo(core.db, s.user.email);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("Welcome to ScholarCrew");
  });
});

describe("notify.sms", () => {
  it("texts an opted-in student once through deps.sms (NO-05)", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    await updatePrefs(core, s.actor, { smsEnabled: true, phone: PHONE });
    const note = await notify(core, SYSTEM, {
      userId: s.user.id,
      kind: "deadline",
      title: "Maple County STEM Award is due tomorrow",
      body: "Due Oct 7.",
      link: "/scholarships",
      dedupeKey: `sms-test:${s.user.id}`,
      sms: true,
    });
    expect(core.jobs.sent).toEqual([{ name: "notify.sms", payload: { notificationId: note?.id } }]);
    await handleNotifySms(deps, { notificationId: note?.id });
    await handleNotifySms(deps, { notificationId: note?.id });
    const texts = await emailsTo(core.db, PHONE);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ subject: "SMS" });
    expect(texts[0]?.text).toMatch(/^ScholarCrew: Maple County STEM Award is due tomorrow .*Reply STOP to opt out\.$/);
    await expect(handleNotifySms(deps, { notificationId: "nope" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/notices.test.ts`
Expected: FAIL with `Failed to resolve import "./digest-weekly" from "src/handlers/notices.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/handlers/reminders-deadlines.ts`:

```ts
import { notify } from "@scholarcrew/core/notifications";
import { findDueReminders } from "@scholarcrew/core/plan";
import { eq, scholarshipApplications, scholarships } from "@scholarcrew/db";
import { calendarShort } from "@scholarcrew/core/shared";
import type { Reminder } from "@scholarcrew/domain";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/** Where each reminder opens (R3E-9). 08 sets a college reminder's refId to the list entry id. Anything else opens /week. */
const LINKS: Record<string, (refId: string) => string> = {
  scholarship_application: () => "/scholarships",
  college_list: (id) => `/colleges/${id}`,
};

/** "Due Oct 15. Plan time for it this week." (R3E-8, R3E-9). */
export function deadlineBody(dueOn: string): string {
  return `Due ${calendarShort(dueOn)}. Plan time for it this week.`;
}

/** Plan 08's renewal reminders (SC-11, D2): offset 30, dedupeKey renewal:<applicationId>:<year>. */
export function isRenewal(r: Reminder): boolean {
  return r.offset === 30 && r.dedupeKey.startsWith("renewal:");
}

export function renewalBody(dueOn: string): string {
  return `Your award renews around ${calendarShort(dueOn)}. Check what the provider needs to renew it, like grades or a form, and plan time for it.`;
}

/** The won award's detail page, or the board when the application or listing is gone. */
async function renewalLink(deps: WorkerDeps, applicationId: string): Promise<string> {
  const [row] = await deps.core.db
    .select({ slug: scholarships.slug })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(eq(scholarshipApplications.id, applicationId));
  return row ? `/scholarships/${row.slug}` : "/scholarships";
}

/** NO-03 and SC-11, hourly. Dedupe keys (reminder:<refType>:<refId>:<offset>, renewal:<appId>:<year>) make reruns no-ops. */
export async function handleRemindersDeadlines(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["reminders.deadlines"].parse(data);
  const due = await findDueReminders(deps.core, SYSTEM);
  let created = 0;
  for (const r of due) {
    const renewal = isRenewal(r);
    const note = await notify(deps.core, SYSTEM, {
      userId: r.userId,
      kind: "deadline",
      title: r.title,
      body: renewal ? renewalBody(r.dueOn) : deadlineBody(r.dueOn),
      link: renewal ? await renewalLink(deps, r.refId) : (LINKS[r.refType]?.(r.refId) ?? "/week"),
      dedupeKey: r.dedupeKey,
      email: true,
      // NO-05 (R2I-9): only the 1-day deadline reminder is texted, and core enqueues notify.sms only when opted in.
      sms: r.offset === 1 && !renewal,
    });
    if (note) created += 1;
  }
  log("info", "reminders.deadlines", { due: due.length, created });
}
```

`apps/worker/src/handlers/digest-weekly.ts`:

```ts
import { notify, retractNotification, secondsUntilQuietEnd } from "@scholarcrew/core/notifications";
import { buildWeeklyDigest } from "@scholarcrew/core/plan";
import { and, eq, notificationPrefs, notifications, users } from "@scholarcrew/db";
import { weekStartFor } from "@scholarcrew/engines";
import { JobPayloads } from "@scholarcrew/jobs";
import { errorLabel, log } from "../log";
import { localWeekdayHour, safeTimeZone } from "../time";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/** notificationPrefs defaults (00-overview §8) for students without a prefs row. */
const DEFAULT_DIGEST_DAY = 0;
const DEFAULT_DIGEST_HOUR = 16;
const DEFAULT_QUIET_START = 21;
const DEFAULT_QUIET_END = 7;

/** Whether a local hour falls in the quiet window [start, end), which may wrap midnight. start === end means none. */
export function inQuietWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** The hour the digest may go: the quiet window's end when the chosen hour falls inside it (R2I-16). */
export function effectiveDigestHour(digestHour: number, quietStart: number, quietEnd: number): number {
  return inQuietWindow(digestHour, quietStart, quietEnd) ? quietEnd : digestHour;
}

/**
 * NO-02, hourly at :05. On their digest day (in their zone), each active student gets one email per week at the
 * first run at or after the effective hour that isn't in quiet hours (R2I-16), so a missed hour catches up later
 * that day. A student whose `digest:<id>:<weekStart>` notification exists is skipped before the digest is built.
 * When the send fails, the notification is retracted so the next hourly run that day tries again.
 */
export async function handleDigestWeekly(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["digest.weekly"].parse(data);
  const now = deps.core.clock.now();
  const rows = await deps.core.db
    .select({
      id: users.id,
      timeZone: users.timeZone,
      digestDay: notificationPrefs.digestDay,
      digestHour: notificationPrefs.digestHour,
      quietStartHour: notificationPrefs.quietStartHour,
      quietEndHour: notificationPrefs.quietEndHour,
    })
    .from(users)
    .leftJoin(notificationPrefs, eq(notificationPrefs.userId, users.id))
    .where(and(eq(users.role, "student"), eq(users.status, "active")));
  let sent = 0;
  for (const row of rows) {
    const zone = safeTimeZone(row.timeZone);
    const quietStart = row.quietStartHour ?? DEFAULT_QUIET_START;
    const quietEnd = row.quietEndHour ?? DEFAULT_QUIET_END;
    const effectiveHour = effectiveDigestHour(row.digestHour ?? DEFAULT_DIGEST_HOUR, quietStart, quietEnd);
    const local = localWeekdayHour(now, zone);
    if (local.weekday !== (row.digestDay ?? DEFAULT_DIGEST_DAY) || local.hour < effectiveHour) continue;
    if (secondsUntilQuietEnd(now, zone, quietStart, quietEnd) !== 0) continue;
    const dedupeKey = `digest:${row.id}:${weekStartFor(now, zone)}`;
    const [already] = await deps.core.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, row.id), eq(notifications.dedupeKey, dedupeKey)));
    if (already) continue;
    try {
      const digest = await buildWeeklyDigest(deps.core, SYSTEM, row.id);
      if (!digest) continue;
      const note = await notify(deps.core, SYSTEM, {
        userId: row.id,
        kind: "digest",
        title: digest.subject,
        body: "Your weekly digest is in your email.",
        link: "/week",
        dedupeKey,
      });
      if (!note) continue;
      try {
        await deps.core.email.send({ to: digest.email, subject: digest.subject, text: digest.text });
        sent += 1;
      } catch (e) {
        await retractNotification(deps.core, SYSTEM, note.id);
        throw e;
      }
    } catch (e) {
      log("error", "digest.failed", { userId: row.id, error: errorLabel(e) });
    }
  }
  log("info", "digest.weekly", { candidates: rows.length, sent });
}
```

`apps/worker/src/handlers/notify-email.ts`:

```ts
import { deliverEmail } from "@scholarcrew/core/notifications";
import { JobPayloads } from "@scholarcrew/jobs";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/** Core checks prefs, quiet hours, and emailedAt, so a retry never sends twice. */
export async function handleNotifyEmail(deps: WorkerDeps, data: unknown): Promise<void> {
  const { notificationId } = JobPayloads["notify.email"].parse(data);
  await deliverEmail(deps.core, SYSTEM, notificationId);
}
```

`apps/worker/src/handlers/notify-sms.ts`:

```ts
import { deliverSms } from "@scholarcrew/core/notifications";
import { JobPayloads } from "@scholarcrew/jobs";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/**
 * NO-05 (R2I-9). Core checks the row, smsSentAt, the user's status, smsEnabled, and the phone; re-enqueues during
 * quiet hours; claims the send through smsSentAt; and resets the claim when the sender throws, so pg-boss retries.
 */
export async function handleNotifySms(deps: WorkerDeps, data: unknown): Promise<void> {
  const { notificationId } = JobPayloads["notify.sms"].parse(data);
  await deliverSms(deps.core, SYSTEM, notificationId, deps.sms);
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/notices.test.ts && pnpm --filter @scholarcrew/worker typecheck`
Expected: PASS, 1 file, 9 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/handlers/reminders-deadlines.ts apps/worker/src/handlers/digest-weekly.ts apps/worker/src/handlers/notify-email.ts apps/worker/src/handlers/notify-sms.ts apps/worker/src/handlers/notices.test.ts
git commit -m "feat(worker): deadline reminders, weekly digest, and notification email jobs"
```

### L12: Catalog handlers (research, extract, recheck, collect)

- [ ] **Step 1: Write the failing test**

`apps/worker/src/handlers/catalog.test.ts`:

```ts
import {
  createFakeBatchGateway,
  createFakeExtractModel,
  createFakeFetchPage,
  createFakeResearcher,
} from "@scholarcrew/catalog/testing";
import { submitLocalScholarship } from "@scholarcrew/core/scholarships";
import { agentRuns, catalogTasks, eq, scholarships } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { ListingDraft } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { makeStudent, makeWorkerDeps } from "../../test/helpers";
import { handleCatalogExtract } from "./catalog-extract";
import { handleCatalogRecheck } from "./catalog-recheck";
import { handleCatalogRecheckCollect } from "./catalog-recheck-collect";
import { handleCatalogResearch } from "./catalog-research";

const ROTARY = "https://example.org/rotary";
const LIONS = "https://example.org/lions";
const PAGE =
  "Rotary Club of Eastside Scholarship. Rotary Club of Eastside awards $2,500 to a Maple County senior. Applications are due October 30, 2026. Describe a time you served your community.";

const DRAFT: ListingDraft = {
  name: "Rotary Club of Eastside Scholarship",
  provider: "Rotary Club of Eastside",
  url: ROTARY,
  amountMinUsd: 2500,
  amountMaxUsd: 2500,
  renewable: false,
  deadline: "2026-10-30",
  applicationFeeUsd: null,
  localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
  eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
  requirements: {
    essays: [{ prompt: "Describe a time you served your community.", wordLimit: 500 }],
    recommendations: 0,
    transcript: false,
    serviceHours: null,
    other: [],
  },
  fieldQuotes: [{ field: "deadline", quote: "Applications are due October 30, 2026." }],
};

const candidates = [
  { url: ROTARY, title: "Rotary Club of Eastside Scholarship", snippet: "Due October 30" },
  { url: LIONS, title: "Lions Club Award", snippet: "Local award" },
];

describe("catalog.research and catalog.extract", () => {
  it("files candidates as tasks, queues one extract each, and never repeats a URL (CA-01)", async () => {
    const researcher = createFakeResearcher(candidates);
    const { deps, core } = makeWorkerDeps({ catalog: { researcher } });
    await handleCatalogResearch(deps, { state: "TX", county: null });
    expect(researcher.calls).toEqual([{ state: "TX", county: undefined, allowedDomains: [] }]);
    const tasks = await core.db.select().from(catalogTasks);
    expect(tasks.map((t) => t.kind)).toEqual(["research_candidate", "research_candidate"]);
    expect(core.jobs.sent).toEqual(
      expect.arrayContaining(
        tasks.map((t) => ({ name: "catalog.extract", payload: { taskId: t.id }, opts: { singletonKey: `catalog.extract:${t.id}` } })),
      ),
    );
    expect(core.jobs.sent).toHaveLength(2);

    core.jobs.clear();
    await handleCatalogResearch(deps, { state: "TX", county: "Maple" });
    expect(await core.db.select().from(catalogTasks)).toHaveLength(2);
    expect(core.jobs.sent).toEqual([]);
  });

  it("stores the draft and its verification report on the task (CA-02)", async () => {
    const researcher = createFakeResearcher(candidates);
    const fetchPage = createFakeFetchPage({ [ROTARY]: { status: 200, text: PAGE, contentType: "text/html" } });
    const model = createFakeExtractModel([{ raw: DRAFT }]);
    const { deps, core } = makeWorkerDeps({ catalog: { researcher, fetchPage, model } });
    await handleCatalogResearch(deps, { state: "TX", county: null });
    const tasks = await core.db.select().from(catalogTasks);
    for (const t of tasks) await handleCatalogExtract(deps, { taskId: t.id });

    const after = await core.db.select().from(catalogTasks);
    const byUrl = new Map(after.map((t) => [t.payload.type === "research_candidate" ? t.payload.url : "", t]));
    const rotary = byUrl.get(ROTARY)?.payload;
    const lions = byUrl.get(LIONS)?.payload;
    expect(rotary?.type === "research_candidate" && rotary.draft?.name).toBe("Rotary Club of Eastside Scholarship");
    expect(rotary?.type === "research_candidate" && rotary.report !== null).toBe(true);
    expect(lions?.type === "research_candidate" && lions.draft).toBeNull();
    expect(lions?.type === "research_candidate" && lions.report?.ok).toBe(false);
    expect(after.every((t) => t.status === "open")).toBe(true);
    expect(model.extractCalls).toHaveLength(1);
    // D20, AG-06: the one extraction call is recorded with role catalog and no job or user.
    const runs = await core.db.select().from(agentRuns);
    expect(runs.map((r) => [r.role, r.jobId, r.userId])).toEqual([["catalog", null, null]]);
  });

  it("extracts a student-submitted scholarship from its enqueued job and leaves the listing submitter-only (D18)", async () => {
    const fetchPage = createFakeFetchPage({ [ROTARY]: { status: 200, text: PAGE, contentType: "text/html" } });
    const model = createFakeExtractModel([{ raw: DRAFT }]);
    const { deps, core } = makeWorkerDeps({ catalog: { fetchPage, model } });
    const student = await makeStudent(core.db);
    const summary = await submitLocalScholarship(core, student.actor, { url: ROTARY, name: "Rotary award", notes: "" });
    const [sent] = core.jobs.sent;
    expect(sent).toMatchObject({ name: "catalog.extract", opts: { singletonKey: `catalog.extract:${(sent?.payload as { taskId: string }).taskId}` } });

    await handleCatalogExtract(deps, sent?.payload);

    const [task] = await core.db.select().from(catalogTasks).where(eq(catalogTasks.kind, "user_submission"));
    expect(task?.status).toBe("open");
    expect(task?.payload).toMatchObject({ type: "user_submission", url: ROTARY, draft: { name: DRAFT.name }, report: { ok: expect.any(Boolean) } });
    const [listing] = await core.db.select().from(scholarships).where(eq(scholarships.id, summary.id));
    expect(listing).toMatchObject({ status: "draft", visibility: "submitter_only" });
  });
});

describe("catalog.recheck and catalog.recheck.collect", () => {
  it("batches changed pages nightly and files a review task when results come back unusable (CA-05)", async () => {
    const { core } = makeWorkerDeps();
    const listing = await factories.scholarship(core.db, { name: "Rotary Club of Eastside Scholarship", verifiedAt: null });
    const fetchPage = createFakeFetchPage({ [listing.sourceUrl]: { status: 200, text: PAGE, contentType: "text/html" } });
    const batches = createFakeBatchGateway();
    const { deps } = makeWorkerDeps({ catalog: { fetchPage, anthropicBatches: batches } });

    await handleCatalogRecheck(deps, {});
    expect(batches.created).toHaveLength(1);
    expect(batches.created[0]?.requests.map((r) => r.customId)).toEqual([listing.id]);

    await handleCatalogRecheckCollect(deps, {});
    expect(await core.db.select().from(catalogTasks).where(eq(catalogTasks.kind, "recheck_changed"))).toEqual([]);

    batches.finish(batches.created[0]?.batchId ?? "", []);
    await handleCatalogRecheckCollect(deps, {});
    const review = await core.db.select().from(catalogTasks).where(eq(catalogTasks.kind, "recheck_changed"));
    expect(review.map((t) => t.scholarshipId)).toEqual([listing.id]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/catalog.test.ts`
Expected: FAIL with `Failed to resolve import "./catalog-extract" from "src/handlers/catalog.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/handlers/catalog-research.ts`:

```ts
import { researchCandidates } from "@scholarcrew/catalog";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";

/** CA-01: candidate pages become research_candidate tasks (never listings); each gets one extract job. */
export async function handleCatalogResearch(deps: WorkerDeps, data: unknown): Promise<void> {
  const { state, county } = JobPayloads["catalog.research"].parse(data);
  const { created, taskIds } = await researchCandidates(deps.catalog, { state, county: county ?? undefined });
  for (const taskId of taskIds) {
    await deps.core.jobs.enqueue("catalog.extract", { taskId }, { singletonKey: `catalog.extract:${taskId}` });
  }
  log("info", "catalog.research", { state, created });
}
```

`apps/worker/src/handlers/catalog-extract.ts`:

```ts
import { extractForTask } from "@scholarcrew/catalog";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";

/** CA-02 and D18: fetch, extract, and verify one research candidate or student submission; the task stays open for an admin. */
export async function handleCatalogExtract(deps: WorkerDeps, data: unknown): Promise<void> {
  const { taskId } = JobPayloads["catalog.extract"].parse(data);
  const report = await extractForTask(deps.catalog, taskId);
  log("info", "catalog.extract", { taskId, extracted: report !== null, ok: report?.ok ?? null });
}
```

`apps/worker/src/handlers/catalog-recheck.ts`:

```ts
import { startRecheck } from "@scholarcrew/catalog";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";

/** CA-05, nightly: unchanged pages refresh verifiedAt, dead pages go stale, changed pages go to one batch. */
export async function handleCatalogRecheck(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["catalog.recheck"].parse(data);
  const { batchId, count } = await startRecheck(deps.catalog);
  log("info", "catalog.recheck", { batchId, count });
}
```

`apps/worker/src/handlers/catalog-recheck-collect.ts`:

```ts
import { collectRecheck } from "@scholarcrew/catalog";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";

/** CA-05, every 30 minutes: reads finished batches and files review tasks for changed listings. */
export async function handleCatalogRecheckCollect(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["catalog.recheck.collect"].parse(data);
  const totals = await collectRecheck(deps.catalog);
  log("info", "catalog.recheck.collect", totals);
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/catalog.test.ts && pnpm --filter @scholarcrew/worker typecheck`
Expected: PASS, 1 file, 4 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/handlers/catalog-research.ts apps/worker/src/handlers/catalog-extract.ts apps/worker/src/handlers/catalog-recheck.ts apps/worker/src/handlers/catalog-recheck-collect.ts apps/worker/src/handlers/catalog.test.ts
git commit -m "feat(worker): catalog research, extract, recheck, and collect jobs"
```

### L13: account.export, account.purge, and maintenance.purge handlers

- [ ] **Step 1: Write the failing test**

`apps/worker/src/handlers/account.test.ts`:

```ts
import { deleteAccount, getExport, requestExport } from "@scholarcrew/core/account";
import { createConversation } from "@scholarcrew/core/crew";
import { conversations, eq, users } from "@scholarcrew/db";
import { describe, expect, it } from "vitest";
import { makeStudent, makeWorkerDeps } from "../../test/helpers";
import { handleAccountExport } from "./account-export";
import { handleAccountPurge } from "./account-purge";
import { handleMaintenancePurge } from "./maintenance-purge";

describe("account.export", () => {
  it("builds the export once (ME-08)", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    const record = await requestExport(core, s.actor);
    expect(core.jobs.sent).toEqual([{ name: "account.export", payload: { exportId: record.id } }]);
    await handleAccountExport(deps, { exportId: record.id });
    await handleAccountExport(deps, { exportId: record.id });
    const ready = await getExport(core, s.actor, record.id);
    expect(ready.record.status).toBe("ready");
    expect(ready.bytes).not.toBeNull();
    expect(JSON.parse(ready.bytes?.toString("utf8") ?? "{}")).toHaveProperty("markdown");
  });
});

describe("account.purge", () => {
  it("hard-deletes accounts after the six-day cutoff and keeps everyone else (ID-05)", async () => {
    const { deps, core, clock } = makeWorkerDeps();
    const gone = await makeStudent(core.db);
    const stays = await makeStudent(core.db);
    await deleteAccount(core, gone.actor);
    await handleAccountPurge(deps, {});
    expect(await core.db.select().from(users).where(eq(users.id, gone.user.id))).toHaveLength(1);
    clock.set("2026-10-13T15:00:01.000Z");
    await handleAccountPurge(deps, {});
    expect(await core.db.select().from(users).where(eq(users.id, gone.user.id))).toEqual([]);
    expect(await core.db.select().from(users).where(eq(users.id, stays.user.id))).toHaveLength(1);
  });
});

describe("maintenance.purge", () => {
  it("deletes expired temporary chats and keeps regular rooms (SE-07)", async () => {
    const { deps, core, clock } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    const temp = await createConversation(core, s.actor, { room: "temporary", roomRefId: null, familyId: null, title: "" });
    const mine = await createConversation(core, s.actor, { room: "my_crew", roomRefId: null, familyId: null, title: "" });
    await handleMaintenancePurge(deps, {});
    expect(await core.db.select().from(conversations).where(eq(conversations.id, temp.id))).toHaveLength(1);
    clock.set("2026-10-08T15:00:00.000Z");
    await handleMaintenancePurge(deps, {});
    expect(await core.db.select().from(conversations).where(eq(conversations.id, temp.id))).toEqual([]);
    expect(await core.db.select().from(conversations).where(eq(conversations.id, mine.id))).toHaveLength(1);
  });

  it("rejects payloads with unknown keys", async () => {
    const { deps } = makeWorkerDeps();
    await expect(handleMaintenancePurge(deps, { all: true })).rejects.toThrow();
    await expect(handleAccountPurge(deps, { all: true })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/account.test.ts`
Expected: FAIL with `Failed to resolve import "./account-export" from "src/handlers/account.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/handlers/account-export.ts`:

```ts
import { buildExport } from "@scholarcrew/core/account";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/** ME-08: JSON + Markdown export; core skips exports that aren't queued, so retries are safe. */
export async function handleAccountExport(deps: WorkerDeps, data: unknown): Promise<void> {
  const { exportId } = JobPayloads["account.export"].parse(data);
  await buildExport(deps.core, SYSTEM, exportId);
  log("info", "account.export", { exportId });
}
```

`apps/worker/src/handlers/account-purge.ts`:

```ts
import { purgeDeletedAccounts } from "@scholarcrew/core/account";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/** ID-05, nightly: deleted accounts are hard-deleted after the six-day cutoff (owned rows cascade). */
export async function handleAccountPurge(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["account.purge"].parse(data);
  const purged = await purgeDeletedAccounts(deps.core, SYSTEM);
  log("info", "account.purge", { purged });
}
```

`apps/worker/src/handlers/maintenance-purge.ts`:

```ts
import { reapStaleJobs } from "@scholarcrew/core/crew";
import { purgeExpired } from "@scholarcrew/core/account";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/** SE-07, every ten minutes: magic links, temporary chats, expired exports, and sessions. */
export async function handleMaintenancePurge(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["maintenance.purge"].parse(data);
  const counts = await purgeExpired(deps.core, SYSTEM);
  const stale = await reapStaleJobs(deps.core, SYSTEM);
  log("info", "maintenance.purge", { ...counts, staleJobs: stale.jobs, staleExports: stale.exports });
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/worker test -- src/handlers/account.test.ts && pnpm --filter @scholarcrew/worker typecheck`
Expected: PASS, 1 file, 4 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/handlers/account-export.ts apps/worker/src/handlers/account-purge.ts apps/worker/src/handlers/maintenance-purge.ts apps/worker/src/handlers/account.test.ts
git commit -m "feat(worker): export, account purge, and retention purge jobs"
```

### L14: Handler registry, worker startup, schedules, and graceful shutdown

- [ ] **Step 1: Write the failing tests**

`apps/worker/src/registry.test.ts`:

```ts
import { JOB_NAMES } from "@scholarcrew/jobs";
import { describe, expect, it } from "vitest";
import { makeWorkerDeps } from "../test/helpers";
import { HANDLERS } from "./registry";

describe("HANDLERS", () => {
  it("has exactly one handler per JOB_NAMES entry", () => {
    expect(JOB_NAMES).toHaveLength(20);
    expect(Object.keys(HANDLERS).sort()).toEqual([...JOB_NAMES].sort());
    expect(HANDLERS["plan.weekly.fanout"]).toBeTypeOf("function");
    expect(HANDLERS["notify.sms"]).toBeTypeOf("function");
    for (const name of JOB_NAMES) expect(typeof HANDLERS[name], name).toBe("function");
  });

  it("validates every payload before doing any work", async () => {
    const { deps, core } = makeWorkerDeps();
    for (const name of JOB_NAMES) {
      await expect(HANDLERS[name](deps, { unexpected: true }), name).rejects.toThrow();
    }
    expect(core.jobs.sent).toEqual([]);
  });
});
```

`apps/worker/src/app.test.ts`:

```ts
import { JOB_NAMES, SCHEDULES } from "@scholarcrew/jobs";
import type PgBoss from "pg-boss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeWorkerDeps } from "../test/helpers";
import { STOP_TIMEOUT_MS, startWorker } from "./app";

type WorkHandler = (jobs: unknown[]) => Promise<unknown>;

function fakeBoss() {
  const calls: string[] = [];
  const handlers = new Map<string, WorkHandler>();
  const workOptions: unknown[] = [];
  const schedules: unknown[] = [];
  const stops: unknown[] = [];
  const boss = {
    async start() {
      calls.push("start");
    },
    async createQueue(name: string) {
      calls.push(`queue:${name}`);
    },
    async work(name: string, options: unknown, handler: WorkHandler) {
      workOptions.push(options);
      handlers.set(name, handler);
      return `worker-${name}`;
    },
    async schedule(name: string, cron: string, data: unknown, options: unknown) {
      schedules.push({ name, cron, data, options });
    },
    async stop(options: unknown) {
      stops.push(options);
    },
  };
  return { boss: boss as unknown as PgBoss, calls, handlers, workOptions, schedules, stops };
}

let out: ReturnType<typeof vi.spyOn>;
let err: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  out = vi.spyOn(console, "log").mockImplementation(() => {});
  err = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const lines = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((c) => JSON.parse(String(c[0])));

describe("startWorker", () => {
  it("starts pg-boss, creates every queue, registers every handler, and schedules the crons", async () => {
    const { deps } = makeWorkerDeps();
    const fake = fakeBoss();
    await startWorker(deps, fake.boss, async () => {});
    expect(fake.calls[0]).toBe("start");
    expect(fake.calls.slice(1)).toEqual(JOB_NAMES.map((n) => `queue:${n}`));
    expect([...fake.handlers.keys()]).toEqual([...JOB_NAMES]);
    expect(fake.workOptions.every((o) => JSON.stringify(o) === JSON.stringify({ batchSize: 1, includeMetadata: true }))).toBe(true);
    expect(fake.schedules).toEqual(
      SCHEDULES.map((s) => ({
        name: s.name,
        cron: s.cron,
        data: {},
        options: { tz: "UTC", ...(s.name === "catalog.recheck" ? { expireInSeconds: 3600, retryLimit: 0 } : {}) },
      })),
    );
    // R2C-5: the Monday plan fan-out, Monday morning in every US zone.
    expect(fake.schedules).toContainEqual({ name: "plan.weekly.fanout", cron: "0 11 * * 1", data: {}, options: { tz: "UTC" } });
    expect(lines(out).map((l) => l.msg)).toContain("worker.started");
  });

  it("routes jobs to their handlers and logs failures without payloads", async () => {
    const { deps } = makeWorkerDeps();
    const fake = fakeBoss();
    await startWorker(deps, fake.boss, async () => {});
    await fake.handlers.get("maintenance.purge")?.([
      { id: "job-1", name: "maintenance.purge", data: {}, retryCount: 0, retryLimit: 2 },
    ]);
    expect(lines(out)).toContainEqual(expect.objectContaining({ msg: "job.done", name: "maintenance.purge", id: "job-1" }));
    await expect(
      fake.handlers.get("crew.request")?.([
        { id: "job-2", name: "crew.request", data: { jobId: "not-a-uuid", note: "secret essay text" }, retryCount: 1, retryLimit: 2 },
      ]),
    ).rejects.toThrow();
    const failure = lines(err).find((l) => l.msg === "job.error");
    expect(failure).toEqual({ level: "error", msg: "job.error", name: "crew.request", id: "job-2", attempt: 2, error: "invalid_payload" });
    expect(JSON.stringify(err.mock.calls)).not.toContain("secret essay text");
  });

  it("stops gracefully once, then closes the database", async () => {
    const { deps } = makeWorkerDeps();
    const fake = fakeBoss();
    const close = vi.fn(async () => {});
    const stop = await startWorker(deps, fake.boss, close);
    await Promise.all([stop("SIGTERM"), stop("SIGINT")]);
    expect(fake.stops).toEqual([{ graceful: true, timeout: STOP_TIMEOUT_MS }]);
    expect(STOP_TIMEOUT_MS).toBe(30_000);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/worker test -- src/registry.test.ts src/app.test.ts`
Expected: FAIL with `Failed to resolve import "./registry" from "src/registry.test.ts"` and `Failed to resolve import "./app" from "src/app.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/registry.ts`:

```ts
import type { JobName } from "@scholarcrew/jobs";
import { handleAccountExport } from "./handlers/account-export";
import { handleAccountPurge } from "./handlers/account-purge";
import { handleAppealOutline } from "./handlers/appeal-outline";
import { handleCatalogExtract } from "./handlers/catalog-extract";
import { handleCatalogRecheck } from "./handlers/catalog-recheck";
import { handleCatalogRecheckCollect } from "./handlers/catalog-recheck-collect";
import { handleCatalogResearch } from "./handlers/catalog-research";
import { handleCrewRequest } from "./handlers/crew-request";
import { handleDigestWeekly } from "./handlers/digest-weekly";
import { handleEssayReview } from "./handlers/essay-review";
import { handleMaintenancePurge } from "./handlers/maintenance-purge";
import { handleNotifyEmail } from "./handlers/notify-email";
import { handleNotifySms } from "./handlers/notify-sms";
import { handleOfferParse } from "./handlers/offer-parse";
import { handlePlanWeekly } from "./handlers/plan-weekly";
import { handlePlanWeeklyFanout } from "./handlers/plan-weekly-fanout";
import { handlePrepRetake } from "./handlers/prep-retake";
import { handleRemindersDeadlines } from "./handlers/reminders-deadlines";
import { handleSweepStudent } from "./handlers/sweep-student";
import { handleSweepWeekly } from "./handlers/sweep-weekly";
import type { Handler } from "./types";

/** One handler per JOB_NAMES entry (20). Record<JobName, Handler> makes a missing or extra name a type error. */
export const HANDLERS: Record<JobName, Handler> = {
  "crew.request": handleCrewRequest,
  "essay.review": handleEssayReview,
  "offer.parse": handleOfferParse,
  "appeal.outline": handleAppealOutline,
  "plan.weekly": handlePlanWeekly,
  "plan.weekly.fanout": handlePlanWeeklyFanout,
  "prep.retake": handlePrepRetake,
  "sweep.weekly": handleSweepWeekly,
  "sweep.student": handleSweepStudent,
  "reminders.deadlines": handleRemindersDeadlines,
  "digest.weekly": handleDigestWeekly,
  "notify.email": handleNotifyEmail,
  "notify.sms": handleNotifySms,
  "catalog.research": handleCatalogResearch,
  "catalog.extract": handleCatalogExtract,
  "catalog.recheck": handleCatalogRecheck,
  "catalog.recheck.collect": handleCatalogRecheckCollect,
  "account.export": handleAccountExport,
  "account.purge": handleAccountPurge,
  "maintenance.purge": handleMaintenancePurge,
};
```

`apps/worker/src/app.ts`:

```ts
import { JOB_NAMES, type JobName, SCHEDULES, ensureQueues } from "@scholarcrew/jobs";
import type PgBoss from "pg-boss";
import { errorLabel, log } from "./log";
import { HANDLERS } from "./registry";
import type { WorkerDeps } from "./types";

export const STOP_TIMEOUT_MS = 30_000;

/**
 * Per-schedule job options. catalog.recheck fetches for up to 10 minutes (plan 11 K7) plus DB work, so it gets an
 * hour before pg-boss expires it, and no automatic retry: a second run while the first is going would duplicate
 * batches and review tasks. Tomorrow's run picks up anything missed.
 */
export const SCHEDULE_OPTIONS: Partial<Record<JobName, { expireInSeconds?: number; retryLimit: number }>> = {
  "catalog.recheck": { expireInSeconds: 3600, retryLimit: 0 },
  "catalog.recheck.collect": { retryLimit: 0 },
};

/** One consumer per queue, one job at a time, with retry metadata for the crew-job retry policy. */
export async function registerHandlers(boss: PgBoss, deps: WorkerDeps): Promise<void> {
  for (const name of JOB_NAMES) {
    await boss.work(name, { batchSize: 1, includeMetadata: true }, async (jobs) => {
      for (const job of jobs) {
        const started = Date.now();
        try {
          await HANDLERS[name](deps, job.data, { retryCount: job.retryCount, retryLimit: job.retryLimit });
          log("info", "job.done", { name, id: job.id, ms: Date.now() - started });
        } catch (e) {
          log("error", "job.error", { name, id: job.id, attempt: job.retryCount + 1, error: errorLabel(e) });
          throw e;
        }
      }
    });
  }
}

export async function registerSchedules(boss: PgBoss): Promise<void> {
  for (const s of SCHEDULES) {
    await boss.schedule(s.name, s.cron, {}, { tz: s.tz, ...SCHEDULE_OPTIONS[s.name] });
  }
}

/** Starts consuming. The returned stop function is idempotent: graceful pg-boss stop, then close the DB. */
export async function startWorker(
  deps: WorkerDeps,
  boss: PgBoss,
  close: () => Promise<void>,
): Promise<(signal: string) => Promise<void>> {
  await boss.start();
  await ensureQueues(boss);
  await registerHandlers(boss, deps);
  await registerSchedules(boss);
  log("info", "worker.started", { queues: JOB_NAMES.length, schedules: SCHEDULES.length });

  let stopping: Promise<void> | null = null;
  return (signal) => {
    if (!stopping) {
      stopping = (async () => {
        log("info", "worker.stopping", { signal });
        await boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
        await close();
        log("info", "worker.stopped", { signal });
      })();
    }
    return stopping;
  };
}
```

`apps/worker/src/main.ts`:

```ts
import { startWorker } from "./app";
import { buildWorkerDeps } from "./deps";
import { errorLabel, log } from "./log";

async function main(): Promise<void> {
  const built = buildWorkerDeps();
  const stop = await startWorker(built, built.boss, built.close);
  log("info", "worker.ready", { fakeModel: built.fakeModel });
  const shutdown = (signal: NodeJS.Signals): void => {
    stop(signal).then(
      () => process.exit(0),
      (e: unknown) => {
        log("error", "worker.stop_failed", { error: errorLabel(e) });
        process.exit(1);
      },
    );
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((e: unknown) => {
  // Config and connection errors name the problem (for example "DATABASE_URL is not set"), never a secret.
  log("error", "worker.start_failed", { error: errorLabel(e), message: e instanceof Error ? e.message : "" });
  process.exit(1);
});
```

- [ ] **Step 4: Run them and see them pass, then run the full gate**

Run: `pnpm --filter @scholarcrew/worker test -- src/registry.test.ts src/app.test.ts`
Expected: PASS, 2 files, 5 tests.

Run: `pnpm format && pnpm --filter @scholarcrew/worker typecheck && pnpm --filter @scholarcrew/worker test && pnpm lint`
Expected: `tsc --noEmit` exits 0; `Test Files 16 passed (16)`, `Tests 95 passed (95)`; `biome check .` reports no errors. If the installed pg-boss 10.x types differ for `work` with `includeMetadata`, `JobWithMetadata.retryCount`/`retryLimit`, or `stop` options, fix the call sites in `src/app.ts` (00-overview §14) and say so in the commit message.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/registry.ts apps/worker/src/registry.test.ts apps/worker/src/app.ts apps/worker/src/app.test.ts apps/worker/src/main.ts
git commit -m "feat(worker): handler registry, startup with schedules, graceful shutdown"
```

## Success Criteria

- [ ] `pnpm --filter @scholarcrew/worker typecheck` exits 0.
- [ ] `pnpm --filter @scholarcrew/worker test` exits 0 with `Test Files 16 passed (16)` and `Tests 95 passed (95)`.
- [ ] `pnpm lint` exits 0.
- [ ] `grep -rn "process.env" apps/worker/src | grep -v "src/deps.ts"` prints nothing.
- [ ] `grep -rn "@anthropic-ai/sdk" apps/worker` prints nothing (model access goes through `@scholarcrew/agents` and `@scholarcrew/catalog`).
- [ ] `SCHOLARCREW_FAKE_MODEL=1 pnpm --filter @scholarcrew/worker dev` (with `pnpm db:up && pnpm db:migrate` done) logs `worker.started` and `worker.ready` as JSON lines, and Ctrl-C logs `worker.stopping` then `worker.stopped`.

## Testing Requirements

Command: `pnpm --filter @scholarcrew/worker test` (needs `pnpm db:up && pnpm db:wait && pnpm db:migrate:test`). Expected: 16 files, 95 tests, all passing, no network. The tests prove:

- Registry (L14): `HANDLERS` covers every `JOB_NAMES` entry exactly once; every handler rejects a malformed payload before any side effect; startup creates every queue, registers every consumer with `{ batchSize: 1, includeMetadata: true }`, and schedules exactly `SCHEDULES` (with `catalog.recheck` at `expireInSeconds: 3600`, `retryLimit: 0`); failures log a label, never payload text; shutdown is graceful (30 s) and idempotent.
- Port (L5): crew snapshots carry profile, crew-visible facts as strings, decisions, the week plan, deadlines, the college list, and the right specialists (Prep with test scores or a true `crew_prep_enabled` fact, Impact with activities, service logs, or a true `crew_impact_enabled` fact; D29); sensitive facts and private facts never appear in the JSON; temporary rooms load no facts or decisions (CR-07, D22); family snapshots drop decisions and crew-only facts and hide categories the student doesn't share; a family-bound port returns empty from every read whose share category is off (costs, offers, college list, application items, activities, service progress, deadlines, week plan, aid checklists, matches, stories, essays) and never returns test scores (FA, SE-01); aid checklists follow `deadlines` (R2P-20); profile fields are blanked when their fact's visibility doesn't reach the audience (R2I-10); list entries carry `gapUsd` from costs only when costs are shared (R2P-15); search drops `local`; missing or foreign records read as `null`.
- Crew jobs (L6, L7): queued → working → ready with a crew message (CR-06); one `agentRuns` row per model turn and one monthly crew request with the summed cost (AG-06); a failed `agentRuns` insert is logged and the job still completes and bills; a retried attempt bills what it spent before rethrowing; `confirm_fact` cards become memory candidates outside temporary rooms (ME-03, D19), filed in `afterComplete` so a `completeJob` failure and retry files them once, and a failing `afterComplete` still leaves the job `ready` (R2C-15); parent lines in history are labeled "Parent:" and a parent's request starts `"<firstName> (parent) asks:"` (D42); crisis text gets the crisis reply with zero model calls and no agent runs (CR-09); refusals become the polite reply and are logged (CR-11); history is the 10 earlier messages in order and mentions reach Compass; family rooms use the family audience and charge the student; finished jobs are skipped; retryable model errors are rethrown while retries remain and fail the job on the last attempt; other errors fail the job without rethrowing.
- Job runs (L8, L9): Quill comments are saved only when the quote is in the draft (ES-04); offers parse into `needs_review` lines or are marked failed on refusal, non-PDF input, or errors, with failure texts that point at a PDF re-upload or the offer tool (MO-04, R2P-8), and a differing parsed award year is passed to `saveParsedOffer` (R2P-16); appeal outlines contain the four sections and no letter language (MO-08); retake explanations carry the code-computed receipt (PR-03); the weekly plan replaces only crew items, ensures aid checklists, and plans for the job's owner (ON-06); a system plan records cost without a crew request, and the Monday fan-out starts one system plan per onboarded student and nothing on a rerun (R2C-5).
- Schedules (L10–L13): the Sunday sweep queues one `sweep.student` per active, onboarded student with `sweep:<id>:<weekStart>` in the student's zone (SC-10); reminders and digests are sent once per dedupe key (NO-02, NO-03), deadline reminders read `Due Oct 13. Plan time for it this week.` and a college reminder links to `/colleges/<entryId>` (R3E-8, R3E-9), and renewal reminders (`offset: 30`) get renewal copy with the date as `Nov 5` and a link to the award (SC-11); only 1-day, non-renewal reminders for opted-in students queue `notify.sms`, and `notify.sms` texts once through `deps.sms` (NO-05); a digest hour inside quiet hours goes when they end, and a failed digest send is retracted and retried the next hour (R2I-16); notification emails deliver once; the SMS sender posts Twilio's form with Basic auth, throws on non-2xx without the phone number, writes the dev outbox when unconfigured, and a partial `TWILIO_*` set refuses to start (R2I-9); catalog research files tasks and queues extracts (with `singletonKey: "catalog.extract:<taskId>"`), extraction stores the draft and report for research candidates and student submissions (D18) and records an `agentRuns` row with role `catalog` (D20), re-check batches changed pages, and collection files review tasks (CA-01, CA-02, CA-05); exports build once (ME-08); deleted accounts purge after the six-day cutoff (ID-05); expired temporary chats are deleted (SE-07).
- Demo model (L3): every demo answer passes the real runners' schemas and guards (`CrewReply`, `SpecialistResult`, `PlanItemInput`, `QuillCommentDraft`, `ParsedOffer`); deadlines read `Oct 15` (R3E-12); after one invalid `submit_reply` the retry is answered and the request is `ready`, and after two the request is `failed` with 09's `OUT_OF_TIME_TEXT` and `safety: "partial"` (R3E-3).

## Review Checklist

- [ ] Every path is under `apps/worker/**`; nothing else is created or modified.
- [ ] Imports use only contract names: §9.3 (`JOB_NAMES`, `JobPayloads`, `createPgBoss`, `createJobsClient`, `ensureQueues`, `SCHEDULES`), §9.4 core modules, §9.5 (`createModelClient`, `runCrewRequest`, `runWeeklyPlan`, `makeConsult`, `consultSpecialist`, `runEssayReview`, `runOfferParse`, `runAppealOutline`, `runRetakeExplanation`, `createScriptedModelClient`, `createFakePort`), §9.6 (`researchCandidates`, `extractForTask`, `startRecheck`, `collectRecheck`, `createFetchPage`, `createAnthropicBatchGateway`, `createAnthropicResearcher`, and the `@scholarcrew/catalog/testing` fakes).
- [ ] The wiring matches §9.5: `const base = { model, port, now, onProgress, onUsage }; runCrewRequest({ ...base, consult: makeConsult(base) }, input)`, where `port` is `createCrewDataPort(core, { audience: input.audience })`.
- [ ] Every core call uses the system actor and the job owner from `crewJobs.ownerId`; no handler trusts a payload `ownerId`.
- [ ] No log line contains message bodies, essay text, sensitive values, document bytes, tokens, or error messages from model or user content (`errorLabel` only).
- [ ] The port never calls `readSensitiveForMatcher`, never returns `private` or `scout_only` facts, and blanks profile fields whose fact visibility doesn't reach the audience.
- [ ] Every handler is idempotent under pg-boss retries (terminal-job skip, dedupe keys, singleton keys, core guards).
- [ ] `createDemoModelClient` is used only when `SCHOLARCREW_FAKE_MODEL=1` and is documented as demo-only.
- [ ] `crew.request` builds one port with `{ audience: input.audience }` and passes the same object to `runCrewRequest` and `makeConsult`; a family-bound port returns empty from every read whose share category is off.
- [ ] Every `catalog.extract` enqueue passes `singletonKey: "catalog.extract:<taskId>"` (05 throws `invalid_input` without it).
- [ ] No usage write can reject out of `onUsage` (job runs and catalog), and no worker search sends `local: true`.
