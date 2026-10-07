import { extractForTask } from "@scholarcrew/catalog";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";

/** CA-02 and D18: fetch, extract, and verify one research candidate or student submission; the task stays open for an admin. */
export async function handleCatalogExtract(deps: WorkerDeps, data: unknown): Promise<void> {
  const { taskId } = JobPayloads["catalog.extract"].parse(data);
  const report = await extractForTask(deps.catalog, taskId);
  log("info", "catalog.extract", { taskId, extracted: report !== null, ok: report?.ok ?? null });
}
