import { purgeExpired } from "@scholarcrew/core/account";
import { reapStaleJobs } from "@scholarcrew/core/crew";
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
