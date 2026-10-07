# Plan 05: Jobs (Agent E)

`@scholarcrew/jobs` is the one place that knows how work leaves a request and runs later. It re-exports the job names and payload schemas from `@scholarcrew/domain`, wraps pg-boss 10 in a small validated `JobsClient`, creates every queue, gives tests an in-memory client, and lists the cron schedules the worker registers. Because jobs live in Postgres with retries and expiry, a crew request keeps running after the tab closes (CR-06). The schedules drive the Sunday sweep (SC-10), the Monday weekly-plan fan-out (WK-02, R2C-5), the hourly digest and deadline-reminder checks (NO-02, NO-03), the nightly catalog re-check and its batch collector (CA-05), and the retention purges (SE-07).

## Files

- Create: `packages/jobs/package.json`, `packages/jobs/tsconfig.json`, `packages/jobs/vitest.config.ts`
- Create: `packages/jobs/src/index.ts`, `packages/jobs/src/validate.ts`, `packages/jobs/src/client.ts`, `packages/jobs/src/memory.ts`, `packages/jobs/src/pgboss.ts`, `packages/jobs/src/queues.ts`, `packages/jobs/src/schedules.ts`
- Test: `packages/jobs/src/index.test.ts`, `packages/jobs/src/client.test.ts`, `packages/jobs/src/memory.test.ts`, `packages/jobs/src/pgboss.test.ts`, `packages/jobs/src/pgboss.integration.test.ts`, `packages/jobs/src/schedules.test.ts`
- Modify: nothing outside this package. E4 rewrites `package.json` (adds the `@scholarcrew/db` dev dependency) and E6 rewrites `src/index.ts` and `src/index.test.ts`.

Notes for consumers (plans 06, 12, 13):

- Web (send-only): `const boss = createPgBoss(url, { role: "sender" }); await boss.start(); await ensureQueues(boss); const jobs = createJobsClient(boss);`. The sender role sets `supervise: false, schedule: false`, so the web process never runs maintenance or cron.
- Worker: `createPgBoss(url)` (role defaults to `"worker"`), `start()`, `ensureQueues(boss)`, then `boss.schedule(s.name, s.cron, {}, { tz: s.tz })` for each `SCHEDULES` entry, then registers handlers with `boss.work`. pg-boss 10 needs a queue to exist before `send`, `schedule`, or `work`, so both processes call `ensureQueues` at startup (it's idempotent).
- `enqueue` throws `AppError("invalid_input")` for an unknown name, a payload that fails `JobPayloads[name]`, or a missing `singletonKey` on a queue listed in `QUEUE_POLICIES` (`src/validate.ts`). On those queues it returns `null` when a job with the same key is already queued; callers treat `null` as "already queued". Today only `catalog.extract` is deduped (`short` policy), and callers key it `catalog.extract:<taskId>`. On every other queue (`standard` policy) `singletonKey` alone doesn't dedupe, so don't rely on `null` there.
- pg-boss library note: dedupe comes from the queue policy in pg-boss 10 (`short` allows one queued job per key; a null key counts as `''`, which is why `short` queues require a key). Verify this against the installed pg-boss 10.x at E4 Step 5 before relying on it.
- Every send uses `retryLimit: 2, retryDelay: 30` and `expireInSeconds: QUEUE_EXPIRE_SECONDS[name]` from domain (900 seconds normally, 1,200 for crew/weekly plans, 2,400 for catalog research). `startAfterSeconds` maps to pg-boss `startAfter` (seconds).
- Payloads carry IDs only (the domain schemas are strict objects of IDs), so essay text and sensitive facts never sit in the job table. Handlers re-parse `job.data` with `JobPayloads[name].parse`.
- `createMemoryJobsClient().sent` entries are `{ name, payload, opts }`; `opts` is `undefined` when the caller passed none, so `expect(jobs.sent).toEqual([{ name, payload }])` still works in other plans' tests. `clear()` empties the same array and restarts ids at `mem-1`.
- Integration-test isolation: `src/pgboss.integration.test.ts` uses its own pg-boss schema `pgboss_jobs_test` in the test database, so it can't collide with the worker package's tests running under turbo at the same time. It deletes the queues it uses before and after the run, so leftovers from an interrupted run can't break the dedupe assertion, and `catalog.extract` is always recreated with its `short` policy.
- `ensureQueues` leaves an existing queue as it is, so changing a queue's policy later means `deleteQueue` first.


Expiry budget (R4E-1): `boundedRetryFetch` clamps every server retry hint (seconds, milliseconds, or HTTP date) to 60 s because the SDK otherwise waits without a cap. One SDK call takes at most W = 2 × 120 s + 60 s = 300 s. Loop deadlines are checked before each call, so a loop with deadline D ends by D + W plus its last tool calls. Compass: 120 + 300 + (45 + 300) concurrent consults + 60 completion = 825 s against 1,200 s. Essay review: 120 + 300 + 60 = 480 s; appeal/retake: 45 + 300 + 60 = 405 s; offer parse: 300 + 60 = 360 s, all against 900 s. Catalog research: 6 × 300 + 60 = 1,860 s against 2,400 s. Catalog extract: 10 s fetch + DNS + 300 s extract + completion is bounded by 380 s against 900 s. Every queue expiry must exceed the handler worst case by at least 120 s; plan 12's `expiry.test.ts` enforces these budgets. The ten-minute maintenance schedule catches abandoned rows through core's lease-aware reaper.

## Tasks

### E1: Package scaffold and domain re-exports

- [ ] **Step 1: Create the package files and link them**

`packages/jobs/package.json`:

```json
{
  "name": "@scholarcrew/jobs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scholarcrew/domain": "workspace:*",
    "pg-boss": "^10.1.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

`packages/jobs/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src"]
}
```

`packages/jobs/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
```

Run: `pnpm install`
Expected: links `@scholarcrew/domain` into `packages/jobs/node_modules`, installs `pg-boss` 10.x and `zod` 4.x, no errors. Don't commit `pnpm-lock.yaml` (the integrator owns it).

- [ ] **Step 2: Write the failing test**

`packages/jobs/src/index.test.ts`:

```ts
import { JOB_NAMES as DOMAIN_JOB_NAMES, JobPayloadSchemas } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { JOB_NAMES, JobPayloads } from "./index";

describe("domain re-exports", () => {
  it("re-exports the domain job names and payload schemas unchanged", () => {
    expect(JOB_NAMES).toBe(DOMAIN_JOB_NAMES);
    expect(JobPayloads).toBe(JobPayloadSchemas);
  });

  it("has a payload schema for every job name", () => {
    expect(Object.keys(JobPayloads).sort()).toEqual([...JOB_NAMES].sort());
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/jobs test`
Expected: FAIL `src/index.test.ts` with `Failed to resolve import "./index"`.

- [ ] **Step 4: Write the implementation**

`packages/jobs/src/index.ts`:

```ts
export { JOB_NAMES, JobPayloadSchemas as JobPayloads } from "@scholarcrew/domain";
export type { JobName, JobPayload } from "@scholarcrew/domain";
```

- [ ] **Step 5: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/jobs test && pnpm --filter @scholarcrew/jobs typecheck`
Expected: PASS, 1 file, 2 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add packages/jobs/package.json packages/jobs/tsconfig.json packages/jobs/vitest.config.ts packages/jobs/src/index.ts packages/jobs/src/index.test.ts
git commit -m "feat(jobs): package scaffold and domain re-exports"
```

### E2: Payload validation and the pg-boss JobsClient

- [ ] **Step 1: Write the failing test**

`packages/jobs/src/client.test.ts`:

```ts
import { AppError } from "@scholarcrew/domain";
import type PgBoss from "pg-boss";
import { describe, expect, it, vi } from "vitest";
import { createJobsClient } from "./client";

const STUDENT_ID = "00000000-0000-4000-8000-000000000001";
const TASK_ID = "00000000-0000-4000-8000-000000000004";
const DEFAULTS = { retryLimit: 2, retryDelay: 30, expireInSeconds: 900 };

function fakeBoss(result: string | null) {
  const send = vi.fn(
    async (_name: string, _data: object, _options: PgBoss.SendOptions): Promise<string | null> => result,
  );
  return { boss: { send } as unknown as PgBoss, send };
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected the promise to reject");
}

describe("createJobsClient", () => {
  it("sends the parsed payload with only the default retry and expiry options", async () => {
    const { boss, send } = fakeBoss("job-1");
    const id = await createJobsClient(boss).enqueue("sweep.student", { studentId: STUDENT_ID });
    expect(id).toBe("job-1");
    expect(send).toHaveBeenCalledTimes(1);
    const [name, data, options] = send.mock.calls[0] ?? [];
    expect(name).toBe("sweep.student");
    expect(data).toEqual({ studentId: STUDENT_ID });
    expect(options).toStrictEqual(DEFAULTS);
  });

  it("uses the domain expiry for every queue", async () => {
    const { boss, send } = fakeBoss("job-expiry");
    const jobs = createJobsClient(boss);
    await jobs.enqueue("crew.request", { jobId: TASK_ID });
    await jobs.enqueue("plan.weekly", { jobId: TASK_ID });
    await jobs.enqueue("catalog.research", { state: "TX", county: null });
    expect(send.mock.calls.map((call) => call[2].expireInSeconds)).toEqual([1200, 1200, 2400]);
  });

  it("maps singletonKey and startAfterSeconds, keeps a zero delay, and omits unset options", async () => {
    const { boss, send } = fakeBoss("job-2");
    const jobs = createJobsClient(boss);
    const singletonKey = `sweep.student:${STUDENT_ID}`;
    await jobs.enqueue("sweep.student", { studentId: STUDENT_ID }, { singletonKey, startAfterSeconds: 60 });
    await jobs.enqueue("sweep.student", { studentId: STUDENT_ID }, { startAfterSeconds: 0 });
    await jobs.enqueue("sweep.student", { studentId: STUDENT_ID }, {});
    expect(send.mock.calls.map((c) => c[2])).toStrictEqual([
      { singletonKey, startAfter: 60, ...DEFAULTS },
      { startAfter: 0, ...DEFAULTS },
      DEFAULTS,
    ]);
  });

  it("returns null when pg-boss drops a duplicate singleton", async () => {
    const { boss } = fakeBoss(null);
    await expect(createJobsClient(boss).enqueue("sweep.weekly", {}, { singletonKey: "weekly" })).resolves.toBeNull();
  });

  it("rejects invalid payloads with invalid_input and sends nothing", async () => {
    const { boss, send } = fakeBoss("job-3");
    const jobs = createJobsClient(boss);
    const cases: Array<() => Promise<unknown>> = [
      () => jobs.enqueue("sweep.student", { studentId: "not-a-uuid" }),
      () => jobs.enqueue("sweep.student", {} as never),
      () => jobs.enqueue("sweep.student", { studentId: STUDENT_ID, extra: true } as never),
      () => jobs.enqueue("catalog.research", { state: "Texas", county: null }),
    ];
    for (const run of cases) {
      const err = await rejection(run());
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("invalid_input");
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an unknown job name", async () => {
    const { boss, send } = fakeBoss("job-4");
    const err = await rejection(createJobsClient(boss).enqueue("nope" as never, {} as never));
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("invalid_input");
    expect(send).not.toHaveBeenCalled();
  });

  it("requires a singletonKey on deduped queues", async () => {
    const { boss, send } = fakeBoss("job-5");
    const jobs = createJobsClient(boss);
    const err = await rejection(jobs.enqueue("catalog.extract", { taskId: TASK_ID }));
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("invalid_input");
    const blank = await rejection(jobs.enqueue("catalog.extract", { taskId: TASK_ID }, { singletonKey: "" }));
    expect((blank as AppError).code).toBe("invalid_input");
    expect(send).not.toHaveBeenCalled();
    const singletonKey = `catalog.extract:${TASK_ID}`;
    await expect(jobs.enqueue("catalog.extract", { taskId: TASK_ID }, { singletonKey })).resolves.toBe("job-5");
    expect(send.mock.calls[0]?.[2]).toStrictEqual({ singletonKey, ...DEFAULTS });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/jobs test`
Expected: FAIL `src/client.test.ts` with `Failed to resolve import "./client"`.

- [ ] **Step 3: Write the implementation**

`packages/jobs/src/validate.ts`:

```ts
import { AppError, type JobName, JobPayloadSchemas } from "@scholarcrew/domain";
import type { z } from "zod";

/**
 * Queues that dedupe by singletonKey. pg-boss 10 only dedupes through the queue policy:
 * "short" keeps one queued job per key. Every other queue is "standard".
 */
export const QUEUE_POLICIES: Partial<Record<JobName, "short">> = { "catalog.extract": "short" };

/** Validates a payload against its domain schema. Throws AppError("invalid_input"). */
export function parseJobPayload(name: JobName, payload: unknown): Record<string, unknown> {
  if (typeof name !== "string" || !Object.hasOwn(JobPayloadSchemas, name)) {
    throw new AppError("invalid_input", `Unknown job name: ${String(name)}`);
  }
  const schema: z.ZodType = JobPayloadSchemas[name];
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError("invalid_input", `Invalid payload for job ${name}`, parsed.error.issues);
  }
  return parsed.data as Record<string, unknown>;
}

/** A "short" queue treats a missing key as '', so unkeyed sends would collide. Throws AppError("invalid_input"). */
export function assertSingletonKey(name: JobName, singletonKey: string | undefined): void {
  if (QUEUE_POLICIES[name] === "short" && !singletonKey) {
    throw new AppError("invalid_input", `Job ${name} needs a singletonKey`);
  }
}
```

`packages/jobs/src/client.ts`:

```ts
import { QUEUE_EXPIRE_SECONDS, type JobName, type JobPayload } from "@scholarcrew/domain";
import type PgBoss from "pg-boss";
import { assertSingletonKey, parseJobPayload } from "./validate";

export type EnqueueOptions = { singletonKey?: string; startAfterSeconds?: number };

export interface JobsClient {
  enqueue<N extends JobName>(name: N, payload: JobPayload<N>, opts?: EnqueueOptions): Promise<string | null>;
}

const SEND_DEFAULTS = { retryLimit: 2, retryDelay: 30 } as const;

export function createJobsClient(boss: PgBoss): JobsClient {
  return {
    async enqueue<N extends JobName>(name: N, payload: JobPayload<N>, opts?: EnqueueOptions): Promise<string | null> {
      const data = parseJobPayload(name, payload);
      assertSingletonKey(name, opts?.singletonKey);
      const options: PgBoss.SendOptions = { ...SEND_DEFAULTS, expireInSeconds: QUEUE_EXPIRE_SECONDS[name] };
      if (opts?.singletonKey !== undefined) options.singletonKey = opts.singletonKey;
      if (opts?.startAfterSeconds !== undefined) options.startAfter = opts.startAfterSeconds;
      return boss.send(name, data, options);
    },
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/jobs test && pnpm --filter @scholarcrew/jobs typecheck`
Expected: PASS, 2 files, 9 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/jobs/src/validate.ts packages/jobs/src/client.ts packages/jobs/src/client.test.ts
git commit -m "feat(jobs): validated pg-boss jobs client"
```

### E3: In-memory jobs client for tests

- [ ] **Step 1: Write the failing test**

`packages/jobs/src/memory.test.ts`:

```ts
import { AppError } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { createMemoryJobsClient } from "./memory";

const JOB_ID = "00000000-0000-4000-8000-000000000002";
const ESSAY_ID = "00000000-0000-4000-8000-000000000003";
const TASK_ID = "00000000-0000-4000-8000-000000000004";

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected the promise to reject");
}

describe("createMemoryJobsClient", () => {
  it("records valid jobs in order with fake ids and options", async () => {
    const jobs = createMemoryJobsClient();
    const singletonKey = `essay.review:${ESSAY_ID}`;
    expect(await jobs.enqueue("crew.request", { jobId: JOB_ID })).toBe("mem-1");
    expect(await jobs.enqueue("essay.review", { jobId: JOB_ID, essayId: ESSAY_ID }, { singletonKey })).toBe("mem-2");
    expect(jobs.sent).toStrictEqual([
      { name: "crew.request", payload: { jobId: JOB_ID }, opts: undefined },
      { name: "essay.review", payload: { jobId: JOB_ID, essayId: ESSAY_ID }, opts: { singletonKey } },
    ]);
  });

  it("matches the contract shape { name, payload } when no options are given", async () => {
    const jobs = createMemoryJobsClient();
    await jobs.enqueue("sweep.weekly", {});
    expect(jobs.sent).toEqual([{ name: "sweep.weekly", payload: {} }]);
  });

  it("rejects invalid payloads with invalid_input and records nothing", async () => {
    const jobs = createMemoryJobsClient();
    const badId = await rejection(jobs.enqueue("crew.request", { jobId: "nope" }));
    expect(badId).toBeInstanceOf(AppError);
    expect((badId as AppError).code).toBe("invalid_input");
    const extraKey = await rejection(jobs.enqueue("sweep.weekly", { force: true } as never));
    expect((extraKey as AppError).code).toBe("invalid_input");
    const unknownName = await rejection(jobs.enqueue("nope" as never, {} as never));
    expect((unknownName as AppError).code).toBe("invalid_input");
    const noKey = await rejection(jobs.enqueue("catalog.extract", { taskId: TASK_ID }));
    expect((noKey as AppError).code).toBe("invalid_input");
    expect(jobs.sent).toEqual([]);
  });

  it("clear() empties the same sent array and restarts ids", async () => {
    const jobs = createMemoryJobsClient();
    const sent = jobs.sent;
    await jobs.enqueue("sweep.weekly", {});
    jobs.clear();
    expect(sent).toHaveLength(0);
    expect(jobs.sent).toBe(sent);
    expect(await jobs.enqueue("sweep.weekly", {})).toBe("mem-1");
    expect(sent).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/jobs test`
Expected: FAIL `src/memory.test.ts` with `Failed to resolve import "./memory"`.

- [ ] **Step 3: Write the implementation**

`packages/jobs/src/memory.ts`:

```ts
import type { JobName, JobPayload } from "@scholarcrew/domain";
import type { EnqueueOptions, JobsClient } from "./client";
import { assertSingletonKey, parseJobPayload } from "./validate";

export type SentJob = { name: JobName; payload: unknown; opts: EnqueueOptions | undefined };
export type MemoryJobsClient = JobsClient & { sent: SentJob[]; clear(): void };

/** Same validation as the pg-boss client; records jobs instead of sending them. */
export function createMemoryJobsClient(): MemoryJobsClient {
  const sent: SentJob[] = [];
  let counter = 0;
  return {
    sent,
    async enqueue<N extends JobName>(name: N, payload: JobPayload<N>, opts?: EnqueueOptions): Promise<string | null> {
      const data = parseJobPayload(name, payload);
      assertSingletonKey(name, opts?.singletonKey);
      sent.push({ name, payload: data, opts });
      counter += 1;
      return `mem-${counter}`;
    },
    clear() {
      sent.length = 0;
      counter = 0;
    },
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/jobs test && pnpm --filter @scholarcrew/jobs typecheck`
Expected: PASS, 3 files, 12 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/jobs/src/memory.ts packages/jobs/src/memory.test.ts
git commit -m "feat(jobs): in-memory jobs client for tests"
```

### E4: createPgBoss, ensureQueues, and the Postgres integration test

Needs plan 03 merged (for `testDatabaseUrl()` from `@scholarcrew/db/testing`) and the test database from plan 01's `docker-compose.yml` (`pnpm db:up`). Drizzle migrations aren't needed: pg-boss installs its own schema on `start()`.

- [ ] **Step 1: Add the test-only database dependency**

`packages/jobs/package.json`:

```json
{
  "name": "@scholarcrew/jobs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scholarcrew/domain": "workspace:*",
    "pg-boss": "^10.1.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@scholarcrew/db": "workspace:*",
    "@types/node": "^22.15.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

Run: `pnpm install`
Expected: links `@scholarcrew/db` into `packages/jobs/node_modules`, no errors.

- [ ] **Step 2: Write the failing tests**

`packages/jobs/src/pgboss.test.ts` (no database):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPgBoss } from "./pgboss";

const FAKE_URL = "postgres://scholarcrew:secret-password@localhost:1/unused";

describe("createPgBoss", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs pg-boss errors as one JSON line without the connection string", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const boss = createPgBoss(FAKE_URL);
    boss.emit("error", new Error("boom"));
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({ level: "error", msg: "pgboss", role: "worker", error: "Error: boom" });
    expect(line).not.toContain("secret-password");
  });

  it("labels the send-only role", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    createPgBoss(FAKE_URL, { role: "sender" }).emit("error", new Error("down"));
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      level: "error",
      msg: "pgboss",
      role: "sender",
      error: "Error: down",
    });
  });
});
```

`packages/jobs/src/pgboss.integration.test.ts` (real Postgres):

```ts
import { randomUUID } from "node:crypto";
import { testDatabaseUrl } from "@scholarcrew/db/testing";
import { JOB_NAMES } from "@scholarcrew/domain";
import type PgBoss from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJobsClient } from "./client";
import { createPgBoss } from "./pgboss";
import { ensureQueues } from "./queues";

// Own pg-boss schema so this file never shares queues with other packages' tests.
const SCHEMA = "pgboss_jobs_test";
const USED_QUEUES = ["catalog.extract", "notify.email"] as const;

let worker: PgBoss;
let sender: PgBoss;

async function dropUsedQueues(boss: PgBoss): Promise<void> {
  for (const name of USED_QUEUES) {
    if (await boss.getQueue(name)) await boss.deleteQueue(name);
  }
}

beforeAll(async () => {
  const url = testDatabaseUrl();
  worker = createPgBoss(url, { role: "worker", schema: SCHEMA });
  sender = createPgBoss(url, { role: "sender", schema: SCHEMA });
  await worker.start();
  await dropUsedQueues(worker);
  await ensureQueues(worker);
  await sender.start();
});

afterAll(async () => {
  await dropUsedQueues(worker);
  await sender.stop({ graceful: false });
  await worker.stop({ graceful: false });
});

describe("pg-boss integration", () => {
  it("creates every job queue with its policy and is safe to run again", async () => {
    await ensureQueues(worker);
    for (const name of JOB_NAMES) {
      expect((await worker.getQueue(name))?.name).toBe(name);
    }
    expect(JOB_NAMES).toHaveLength(20);
    expect((await worker.getQueue("catalog.extract"))?.policy).toBe("short");
    expect((await worker.getQueue("sweep.student"))?.policy).toBe("standard");
    expect((await worker.getQueue("plan.weekly.fanout"))?.policy).toBe("standard");
    expect((await worker.getQueue("notify.sms"))?.policy).toBe("standard");
  });

  it("delivers a validated job to a worker and dedupes catalog.extract by singletonKey", async () => {
    const jobs = createJobsClient(sender);
    const taskId = randomUUID();
    const otherId = randomUUID();
    const singletonKey = `catalog.extract:${taskId}`;

    const id = await jobs.enqueue("catalog.extract", { taskId }, { singletonKey });
    expect(id).toEqual(expect.any(String));
    expect(await jobs.enqueue("catalog.extract", { taskId }, { singletonKey })).toBeNull();
    const otherKey = `catalog.extract:${otherId}`;
    const other = await jobs.enqueue("catalog.extract", { taskId: otherId }, { singletonKey: otherKey });
    expect(other).toEqual(expect.any(String));

    const fetched = await worker.fetch<{ taskId: string }>("catalog.extract", { batchSize: 10 });
    expect(fetched.map((j) => j.id).sort()).toEqual([id, other].sort());
    expect(fetched.find((j) => j.id === id)?.data).toEqual({ taskId });
    expect(fetched.find((j) => j.id === other)?.data).toEqual({ taskId: otherId });
    expect(await worker.fetch("catalog.extract")).toEqual([]);
  });

  it("holds a job back until startAfterSeconds has passed", async () => {
    const jobs = createJobsClient(sender);
    const id = await jobs.enqueue("notify.email", { notificationId: randomUUID() }, { startAfterSeconds: 3600 });
    expect(id).toEqual(expect.any(String));
    expect(await worker.fetch("notify.email")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `pnpm db:up && pnpm db:wait && pnpm --filter @scholarcrew/jobs test`
Expected: FAIL `src/pgboss.test.ts` and `src/pgboss.integration.test.ts` with `Failed to resolve import "./pgboss"`.

- [ ] **Step 4: Write the implementation**

`packages/jobs/src/pgboss.ts`:

```ts
import PgBoss from "pg-boss";

export type PgBossRole = "worker" | "sender";

/**
 * "worker" (default) runs maintenance and cron. "sender" (web) only sends:
 * supervise and schedule are off. `schema` exists for test isolation.
 */
export function createPgBoss(url: string, opts: { role?: PgBossRole; schema?: string } = {}): PgBoss {
  const role = opts.role ?? "worker";
  const boss = new PgBoss({
    connectionString: url,
    schema: opts.schema ?? "pgboss",
    ...(role === "sender" ? { supervise: false, schedule: false } : {}),
  });
  boss.on("error", (error: Error) => {
    console.error(JSON.stringify({ level: "error", msg: "pgboss", role, error: String(error) }));
  });
  return boss;
}
```

`packages/jobs/src/queues.ts`:

```ts
import { JOB_NAMES } from "@scholarcrew/domain";
import type PgBoss from "pg-boss";
import { QUEUE_POLICIES } from "./validate";

/**
 * Creates a queue for every job name with its QUEUE_POLICIES policy ("standard" otherwise).
 * pg-boss 10 skips queues that already exist and doesn't change their policy.
 */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of JOB_NAMES) {
    await boss.createQueue(name, { name, policy: QUEUE_POLICIES[name] ?? "standard" });
  }
}
```

- [ ] **Step 5: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/jobs test && pnpm --filter @scholarcrew/jobs typecheck`
Expected: PASS, 5 files, 17 tests; `tsc --noEmit` prints nothing. Before accepting a red or green result here, confirm against the installed pg-boss 10.x that a `standard` queue doesn't dedupe by `singletonKey` alone and a `short` queue does (its `job` table's partial unique indexes by `policy`). If the installed pg-boss 10.x types differ for `getQueue`, `deleteQueue`, `fetch`, `createQueue` options, or the `supervise`/`schedule` options, fix the call sites in these files (00-overview §14) and say so in the commit message.

- [ ] **Step 6: Commit**

```bash
git add packages/jobs/package.json packages/jobs/src/pgboss.ts packages/jobs/src/queues.ts packages/jobs/src/pgboss.test.ts packages/jobs/src/pgboss.integration.test.ts
git commit -m "feat(jobs): pg-boss factory, queue setup, integration test"
```

### E5: Cron schedules

- [ ] **Step 1: Write the failing test**

`packages/jobs/src/schedules.test.ts`:

```ts
import { JOB_NAMES } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SCHEDULES } from "./schedules";

describe("SCHEDULES", () => {
  it("matches the 00-overview section 9.3 table", () => {
    expect(SCHEDULES).toEqual([
      { name: "sweep.weekly", cron: "0 14 * * 0", tz: "UTC" },
      { name: "plan.weekly.fanout", cron: "0 11 * * 1", tz: "UTC" },
      { name: "reminders.deadlines", cron: "0 * * * *", tz: "UTC" },
      { name: "digest.weekly", cron: "5 * * * *", tz: "UTC" },
      { name: "catalog.recheck", cron: "0 8 * * *", tz: "UTC" },
      { name: "catalog.recheck.collect", cron: "*/30 * * * *", tz: "UTC" },
      { name: "account.purge", cron: "30 3 * * *", tz: "UTC" },
      { name: "maintenance.purge", cron: "*/10 * * * *", tz: "UTC" },
    ]);
  });

  it("uses known job names, each once", () => {
    const names = SCHEDULES.map((s) => s.name);
    for (const name of names) expect(JOB_NAMES).toContain(name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses five-field UTC cron expressions", () => {
    for (const s of SCHEDULES) {
      const fields = s.cron.split(" ");
      expect(fields).toHaveLength(5);
      for (const field of fields) expect(field).toMatch(/^[\d*/,-]+$/);
      expect(s.tz).toBe("UTC");
    }
  });

  it("fans out weekly plans at a time that is Monday morning in every US zone (R2C-5)", () => {
    expect(SCHEDULES.find((s) => s.name === "plan.weekly.fanout")).toEqual({ name: "plan.weekly.fanout", cron: "0 11 * * 1", tz: "UTC" });
    const zones = ["Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Puerto_Rico"];
    // One Monday in daylight time and one in standard time, both at 11:00 UTC.
    for (const at of ["2026-10-05T11:00:00.000Z", "2027-01-04T11:00:00.000Z"]) {
      for (const timeZone of zones) {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(at));
        expect(parts.find((p) => p.type === "weekday")?.value, `${timeZone} ${at}`).toBe("Mon");
        expect(Number(parts.find((p) => p.type === "hour")?.value), `${timeZone} ${at}`).toBeLessThan(12);
      }
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/jobs test`
Expected: FAIL `src/schedules.test.ts` with `Failed to resolve import "./schedules"`.

- [ ] **Step 3: Write the implementation**

`packages/jobs/src/schedules.ts`:

```ts
import type { JobName } from "@scholarcrew/domain";

/**
 * Cron jobs the worker registers with boss.schedule(name, cron, {}, { tz }).
 * Hourly digest and reminder checks pick students whose local day and hour match.
 * plan.weekly.fanout runs Monday 11:00 UTC (01:00 Honolulu to 07:00 New York, Monday everywhere in the US),
 * so weekStartFor lands on the new Monday for every student (R2C-5).
 */
export const SCHEDULES: Array<{ name: JobName; cron: string; tz: "UTC" }> = [
  { name: "sweep.weekly", cron: "0 14 * * 0", tz: "UTC" },
  { name: "plan.weekly.fanout", cron: "0 11 * * 1", tz: "UTC" },
  { name: "reminders.deadlines", cron: "0 * * * *", tz: "UTC" },
  { name: "digest.weekly", cron: "5 * * * *", tz: "UTC" },
  { name: "catalog.recheck", cron: "0 8 * * *", tz: "UTC" },
  { name: "catalog.recheck.collect", cron: "*/30 * * * *", tz: "UTC" },
  { name: "account.purge", cron: "30 3 * * *", tz: "UTC" },
  { name: "maintenance.purge", cron: "*/10 * * * *", tz: "UTC" },
];
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/jobs test && pnpm --filter @scholarcrew/jobs typecheck`
Expected: PASS, 6 files, 21 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/jobs/src/schedules.ts packages/jobs/src/schedules.test.ts
git commit -m "feat(jobs): cron schedules"
```

### E6: Public surface matches the contract

- [ ] **Step 1: Write the failing test**

`packages/jobs/src/index.test.ts`:

```ts
import { JOB_NAMES as DOMAIN_JOB_NAMES, JobPayloadSchemas } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import * as jobs from "./index";

describe("public surface", () => {
  it("exports exactly the 00-overview section 9.3 contract", () => {
    expect(Object.keys(jobs).sort()).toEqual([
      "JOB_NAMES",
      "JobPayloads",
      "SCHEDULES",
      "createJobsClient",
      "createMemoryJobsClient",
      "createPgBoss",
      "ensureQueues",
    ]);
  });

  it("re-exports the domain job names and payload schemas unchanged", () => {
    expect(jobs.JOB_NAMES).toBe(DOMAIN_JOB_NAMES);
    expect(jobs.JobPayloads).toBe(JobPayloadSchemas);
  });

  it("has a payload schema for every job name", () => {
    expect(jobs.JOB_NAMES).toHaveLength(20);
    expect(Object.keys(jobs.JobPayloads).sort()).toEqual([...jobs.JOB_NAMES].sort());
  });

  it("types JobPayload per job name", () => {
    const ok: jobs.JobPayload<"sweep.student"> = { studentId: "00000000-0000-4000-8000-000000000001" };
    // @ts-expect-error sweep.student needs studentId, not jobId
    const bad: jobs.JobPayload<"sweep.student"> = { jobId: "00000000-0000-4000-8000-000000000001" };
    expect(jobs.JobPayloads["sweep.student"].parse(ok)).toEqual(ok);
    expect(jobs.JobPayloads["sweep.student"].safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/jobs test`
Expected: FAIL `src/index.test.ts` > "exports exactly the 00-overview section 9.3 contract" with `AssertionError: expected [ 'JOB_NAMES', 'JobPayloads' ] to deeply equal [ 'JOB_NAMES', …(6) ]`.

- [ ] **Step 3: Write the implementation**

`packages/jobs/src/index.ts`:

```ts
export { JOB_NAMES, JobPayloadSchemas as JobPayloads } from "@scholarcrew/domain";
export type { JobName, JobPayload } from "@scholarcrew/domain";
export type { JobsClient } from "./client";
export { createJobsClient } from "./client";
export { createMemoryJobsClient } from "./memory";
export { createPgBoss } from "./pgboss";
export { ensureQueues } from "./queues";
export { SCHEDULES } from "./schedules";
```

- [ ] **Step 4: Run the gate and see it pass**

Run: `pnpm exec biome check --write packages/jobs && pnpm --filter @scholarcrew/jobs typecheck && pnpm --filter @scholarcrew/jobs test && pnpm lint`
Expected: Biome applies only formatting or import-order fixes inside `packages/jobs`; `tsc --noEmit` prints nothing (the `@ts-expect-error` line is used); PASS, 6 files, 26 tests; `pnpm lint` reports no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/jobs
git commit -m "feat(jobs): public surface matches contract"
```

## Success Criteria

- [ ] `pnpm --filter @scholarcrew/jobs typecheck` exits 0.
- [ ] `pnpm db:up && pnpm db:wait && pnpm --filter @scholarcrew/jobs test` exits 0 with 6 files and 26 tests passing.
- [ ] `pnpm lint` exits 0.
- [ ] `grep -rn "process.env" packages/jobs/src` prints nothing (config comes from callers).
- [ ] `grep -rnE "strictObject|z\.object" packages/jobs/src` prints nothing (no payload schema is redefined locally).

## Testing Requirements

- Command: `pnpm db:up && pnpm db:wait && pnpm --filter @scholarcrew/jobs test`
- Expected: `Test Files 6 passed (6)`, `Tests 26 passed (26)`.
- `index.test.ts`: the package exports exactly the §9.3 names; `JOB_NAMES` and `JobPayloads` are the domain objects themselves; `JobPayload<N>` is a real per-job type (the `@ts-expect-error` line fails typecheck if it ever widens to `unknown`).
- `client.test.ts`: payloads are parsed before sending; retry defaults `retryLimit 2 / retryDelay 30` and domain-owned per-queue expiry are always set; `singletonKey` and `startAfterSeconds` map to pg-boss options, `0` is kept, unset options are absent (`toStrictEqual`); a pg-boss `null` passes through; bad UUIDs, missing keys, extra keys, a bad state code, unknown names, and a `catalog.extract` send without a `singletonKey` all throw `AppError("invalid_input")` and never call `send`.
- `memory.test.ts`: same validation (including the `singletonKey` requirement on `short` queues); `sent` records `{ name, payload, opts }` in order with ids `mem-1`, `mem-2`; entries without options still `toEqual` `{ name, payload }`; failures record nothing; `clear()` empties the same array and restarts ids.
- `pgboss.test.ts`: the error listener logs one JSON line with the role and never the connection string.
- `pgboss.integration.test.ts`: against the real test database, a sender and a worker share schema `pgboss_jobs_test`; all 20 queues exist, `catalog.extract` has the `short` policy and other queues (including the round 2 `plan.weekly.fanout` and `notify.sms`) `standard`, and `ensureQueues` runs twice without error; a sent `catalog.extract` job is fetched by the worker with matching `id` and `data` (fetch returns an array); a second `catalog.extract` send with the same `singletonKey` returns `null` while a different key is accepted; `startAfterSeconds: 3600` keeps the job out of `fetch`. Queues used are deleted before and after the run.
- `schedules.test.ts`: `SCHEDULES` equals the §9.3 table (8 entries, including `plan.weekly.fanout` `0 11 * * 1`, R2C-5), every name is a job name used once, every cron is five fields in UTC, and the fan-out time is a Monday morning in every US zone in both daylight and standard time.

## Review Checklist

- [ ] `src/index.ts` exports exactly `JOB_NAMES`, `JobPayloads`, `JobName`, `JobPayload`, `JobsClient`, `createPgBoss`, `createJobsClient`, `ensureQueues`, `createMemoryJobsClient`, `SCHEDULES`, and `JobPayloads` is `JobPayloadSchemas` from `@scholarcrew/domain`, not a copy.
- [ ] `JobsClient.enqueue` has the §9.3 signature; `createPgBoss(url)` with no options behaves as the §14 example (schema `pgboss`, maintenance and cron on).
- [ ] The sender role sets `supervise: false` and `schedule: false`; nothing in this package calls `boss.start()` except tests.
- [ ] Both clients share `parseJobPayload` and `assertSingletonKey`, so the memory client can't accept a job the real one rejects.
- [ ] Only queues in `QUEUE_POLICIES` (today `catalog.extract`) use the `short` policy; everything else is `standard`, so unkeyed jobs like `notify.email` never collapse into one.
- [ ] No `undefined` values reach `boss.send` options.
- [ ] Logs are JSON lines and never include the connection string or payload data.
- [ ] `@scholarcrew/db` is a dev dependency only and is imported only by `pgboss.integration.test.ts`.
- [ ] The integration test uses schema `pgboss_jobs_test` and cleans the queues it touches, so reruns after a crash still pass.
- [ ] `SCHEDULES` matches §9.3 character for character.
