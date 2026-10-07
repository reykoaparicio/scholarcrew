import type { AgentDeps, ModelTurn } from "@scholarcrew/agents";
import { recordUsage } from "@scholarcrew/core/billing";
import { appendProgress, completeJob, getJob, recordAgentRun, releaseJob, startJob } from "@scholarcrew/core/crew";
import { crewJobs, eq, users } from "@scholarcrew/db";
import { QUEUE_EXPIRE_SECONDS } from "@scholarcrew/domain";
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
        await recordAgentRun(
          deps.core,
          SYSTEM,
          {
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
          },
          { leaseToken: i.leaseToken },
        );
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
  const [row] = await deps.core.db
    .select({ ownerId: crewJobs.ownerId, ownerStatus: users.status })
    .from(crewJobs)
    .innerJoin(users, eq(users.id, crewJobs.ownerId))
    .where(eq(crewJobs.id, jobId));
  if (!row || row.ownerStatus !== "active") return;
  const ownerId = row.ownerId;
  const claim = await startJob(deps.core, SYSTEM, jobId, { leaseSeconds: QUEUE_EXPIRE_SECONDS[name] });
  if (!claim) {
    log("info", "job.lease_held", { name, jobId });
    return;
  }
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
