import { researchCandidates } from "@scholarcrew/catalog";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";

/** CA-01: candidate pages become research_candidate tasks (never listings); each gets one extract job. */
export async function handleCatalogResearch(deps: WorkerDeps, data: unknown): Promise<void> {
  const { state, county } = JobPayloads["catalog.research"].parse(data);
  const { created, taskIds } = await researchCandidates(deps.catalog, { state, county: county ?? undefined });
  for (const taskId of taskIds) {
    await deps.core.jobs.enqueue("catalog.extract", { taskId }, { singletonKey: `catalog.extract:${taskId}` });
  }
  log("info", "catalog.research", { state, created });
}
