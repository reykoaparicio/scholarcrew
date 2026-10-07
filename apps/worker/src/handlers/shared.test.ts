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
    await runCrewJob(
      deps,
      { name: "plan.weekly", jobId: job.id, ctx: NO_RETRY, crewRequest: true, onFailed },
      async () => {
        throw new Error("boom");
      },
    );
    expect(await getJob(core, SYSTEM, job.id)).toMatchObject({
      status: "failed",
      error: FAILED_TEXT,
      resultMessageId: null,
    });
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
    await runCrewJob(deps, { name: "plan.weekly", jobId: job.id, ctx: NO_RETRY, crewRequest: true }, async (run) => {
      await run.base.onUsage?.("compass", TURN);
      return { reply: REPLY, status: "ready" };
    });
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
