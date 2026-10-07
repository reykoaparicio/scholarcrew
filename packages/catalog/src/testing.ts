import type { ModelClient, ModelTurn, ModelUsage } from "@scholarcrew/agents";
import type { z } from "zod";
import type {
  BatchGateway,
  BatchItem,
  BatchRequest,
  CatalogDeps,
  FetchedPage,
  ResearchCandidate,
  ResearchInput,
  Researcher,
} from "./types";

type ExtractRequest = Parameters<ModelClient["extract"]>[0];
export type ExtractCall = Omit<ExtractRequest, "schema">;
/** One scripted extract() answer: a refusal, or raw model output (JSON text or an already-parsed value). */
export type FakeExtractAnswer = { refused: true } | { raw: unknown };

const ZERO_USAGE: ModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costMicros: 0,
};

/** A ModelClient whose extract() answers from a script and parses like the real client: JSON, then the schema. */
export function createFakeExtractModel(script: FakeExtractAnswer[]): ModelClient & { extractCalls: ExtractCall[] } {
  const answers = [...script];
  const extractCalls: ExtractCall[] = [];
  return {
    extractCalls,
    async turn(): Promise<ModelTurn> {
      throw new Error("The fake extract model doesn't script turn()");
    },
    async extract<T>(
      req: Omit<ExtractRequest, "schema"> & { schema: z.ZodType<T> },
    ): Promise<{ value: T | null; refused: boolean; usage: ModelUsage }> {
      const { schema, ...call } = req;
      extractCalls.push(call);
      const next = answers.shift();
      if (!next) throw new Error("The fake extract model ran out of answers");
      if ("refused" in next) return { value: null, refused: true, usage: ZERO_USAGE };
      let raw = next.raw;
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch {
          return { value: null, refused: false, usage: ZERO_USAGE };
        }
      }
      const parsed = schema.safeParse(raw);
      return { value: parsed.success ? parsed.data : null, refused: false, usage: ZERO_USAGE };
    },
  };
}

const NOT_FOUND: FetchedPage = { status: 404, text: "", contentType: "text/html" };

/** fetchPage over a URL map. An Error value is thrown; unknown URLs get `fallback` (404 by default). */
export function createFakeFetchPage(
  pages: Record<string, FetchedPage | Error>,
  fallback: FetchedPage = NOT_FOUND,
): CatalogDeps["fetchPage"] & { calls: string[] } {
  const calls: string[] = [];
  const fetchPage = async (url: string): Promise<FetchedPage> => {
    calls.push(url);
    const page = pages[url] ?? fallback;
    if (page instanceof Error) throw page;
    return page;
  };
  return Object.assign(fetchPage, { calls });
}

export function createFakeResearcher(candidates: ResearchCandidate[]): Researcher & { calls: ResearchInput[] } {
  const calls: ResearchInput[] = [];
  return {
    calls,
    async findCandidates(i) {
      calls.push(i);
      return candidates;
    },
  };
}

/**
 * Batches that stay in progress until finish(batchId, items) is called. fail(batchId, error) makes results() throw.
 * Ids are msgbatch_fake_1, _2, and so on.
 */
export function createFakeBatchGateway(): BatchGateway & {
  created: Array<{ batchId: string; requests: BatchRequest[] }>;
  finish(batchId: string, items: BatchItem[]): void;
  fail(batchId: string, error: Error): void;
} {
  const created: Array<{ batchId: string; requests: BatchRequest[] }> = [];
  const finished = new Map<string, BatchItem[]>();
  const failures = new Map<string, Error>();
  return {
    created,
    async create(requests) {
      const batchId = `msgbatch_fake_${created.length + 1}`;
      created.push({ batchId, requests });
      return { batchId };
    },
    async results(batchId) {
      const failure = failures.get(batchId);
      if (failure) throw failure;
      const items = finished.get(batchId);
      return items ? { ended: true, items } : { ended: false, items: [] };
    },
    finish(batchId, items) {
      finished.set(batchId, items);
    },
    fail(batchId, error) {
      failures.set(batchId, error);
    },
  };
}
