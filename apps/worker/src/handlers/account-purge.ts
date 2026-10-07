import { purgeDeletedAccounts } from "@scholarcrew/core/account";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/** ID-05, nightly: deleted accounts are hard-deleted after the six-day cutoff (owned rows cascade). */
export async function handleAccountPurge(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["account.purge"].parse(data);
  const purged = await purgeDeletedAccounts(deps.core, SYSTEM);
  log("info", "account.purge", { purged });
}
