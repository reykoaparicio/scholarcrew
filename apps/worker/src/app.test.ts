import { JOB_NAMES, SCHEDULES } from "@scholarcrew/jobs";
import type PgBoss from "pg-boss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeWorkerDeps } from "../test/helpers";
import { SCHEDULE_OPTIONS, STOP_TIMEOUT_MS, startWorker } from "./app";

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
    expect(
      fake.workOptions.every((o) => JSON.stringify(o) === JSON.stringify({ batchSize: 1, includeMetadata: true })),
    ).toBe(true);
    expect(fake.schedules).toEqual(
      SCHEDULES.map((s) => ({
        name: s.name,
        cron: s.cron,
        data: {},
        options: { tz: "UTC", ...SCHEDULE_OPTIONS[s.name] },
      })),
    );
    // R2C-5: the Monday plan fan-out, Monday morning in every US zone.
    expect(fake.schedules).toContainEqual({
      name: "plan.weekly.fanout",
      cron: "0 11 * * 1",
      data: {},
      options: { tz: "UTC" },
    });
    expect(lines(out).map((l) => l.msg)).toContain("worker.started");
  });

  it("routes jobs to their handlers and logs failures without payloads", async () => {
    const { deps } = makeWorkerDeps();
    const fake = fakeBoss();
    await startWorker(deps, fake.boss, async () => {});
    await fake.handlers.get("maintenance.purge")?.([
      { id: "job-1", name: "maintenance.purge", data: {}, retryCount: 0, retryLimit: 2 },
    ]);
    expect(lines(out)).toContainEqual(
      expect.objectContaining({ msg: "job.done", name: "maintenance.purge", id: "job-1" }),
    );
    await expect(
      fake.handlers.get("crew.request")?.([
        {
          id: "job-2",
          name: "crew.request",
          data: { jobId: "not-a-uuid", note: "secret essay text" },
          retryCount: 1,
          retryLimit: 2,
        },
      ]),
    ).rejects.toThrow();
    const failure = lines(err).find((l) => l.msg === "job.error");
    expect(failure).toEqual({
      level: "error",
      msg: "job.error",
      name: "crew.request",
      id: "job-2",
      attempt: 2,
      error: "unknown",
    });
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
