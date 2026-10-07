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
