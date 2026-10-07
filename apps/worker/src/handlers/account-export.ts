import { buildExport } from "@scholarcrew/core/account";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import { type JobContext, NO_RETRY, type WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/** ME-08: JSON + Markdown export; core skips exports that aren't queued, so retries are safe. */
export async function handleAccountExport(deps: WorkerDeps, data: unknown, ctx: JobContext = NO_RETRY): Promise<void> {
  const { exportId } = JobPayloads["account.export"].parse(data);
  await buildExport(deps.core, SYSTEM, exportId, { lastAttempt: ctx.retryCount >= ctx.retryLimit });
  log("info", "account.export", { exportId });
}
