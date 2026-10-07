import type { ModelClient, ModelTurn, ModelUsage } from "@scholarcrew/agents";
import type { Db } from "@scholarcrew/db";

/** Finds candidate scholarship pages for an area. The real one uses web search (src/anthropic.ts). */
export interface Researcher {
  findCandidates(i: {
    state: string;
    county?: string;
    allowedDomains: string[];
  }): Promise<Array<{ url: string; title: string; snippet: string }>>;
}

/**
 * The Message Batches API, reduced to what the re-check needs. `usage` is the item's full-price token usage
 * (null when the item didn't succeed); callers halve the cost for batch pricing.
 * `results` throws `BatchNotFoundError` when the API no longer has the batch (bad id, or results expired after 29 days).
 */
export interface BatchGateway {
  create(
    requests: Array<{ customId: string; system: string; userText: string; schema: Record<string, unknown> }>,
  ): Promise<{ batchId: string }>;
  results(
    batchId: string,
  ): Promise<{ ended: boolean; items: Array<{ customId: string; json: unknown | null; usage?: ModelUsage | null }> }>;
}

export class BatchNotFoundError extends Error {
  readonly batchId: string;
  constructor(batchId: string) {
    super(`Batch ${batchId} not found`);
    this.name = "BatchNotFoundError";
    this.batchId = batchId;
  }
}

export interface CatalogDeps {
  db: Db;
  model: ModelClient;
  fetchPage(url: string): Promise<{ status: number; text: string; contentType: string; finalUrl?: string }>;
  anthropicBatches: BatchGateway;
  researcher: Researcher;
  now: () => Date;
  allowedDomains: string[];
  /** AG-06: one call per catalog model call (extraction, research turn, batch item). Plan 12 writes agent_runs. */
  onUsage?: (role: "catalog", t: ModelTurn) => Promise<void>;
}

export type FetchedPage = Awaited<ReturnType<CatalogDeps["fetchPage"]>>;
export type ResearchInput = Parameters<Researcher["findCandidates"]>[0];
export type ResearchCandidate = Awaited<ReturnType<Researcher["findCandidates"]>>[number];
export type BatchRequest = Parameters<BatchGateway["create"]>[0][number];
export type BatchItem = Awaited<ReturnType<BatchGateway["results"]>>["items"][number];
