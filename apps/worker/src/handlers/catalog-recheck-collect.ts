import { collectRecheck } from "@scholarcrew/catalog";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";

/** CA-05, every 30 minutes: reads finished batches and files review tasks for changed listings. */
export async function handleCatalogRecheckCollect(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["catalog.recheck.collect"].parse(data);
  const totals = await collectRecheck(deps.catalog);
  log("info", "catalog.recheck.collect", totals);
}
