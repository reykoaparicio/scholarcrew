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
    await jobs.enqueue("plan.weekly", { jobId: TASK_ID, ownerId: STUDENT_ID });
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
