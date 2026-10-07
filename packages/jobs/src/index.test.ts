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
