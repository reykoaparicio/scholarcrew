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
