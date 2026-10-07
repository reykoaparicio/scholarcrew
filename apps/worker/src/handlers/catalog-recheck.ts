import { startRecheck } from "@scholarcrew/catalog";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";

/** CA-05, nightly: unchanged pages refresh verifiedAt, dead pages go stale, changed pages go to one batch. */
export async function handleCatalogRecheck(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["catalog.recheck"].parse(data);
  const { batchId, count } = await startRecheck(deps.catalog);
  log("info", "catalog.recheck", { batchId, count });
}
