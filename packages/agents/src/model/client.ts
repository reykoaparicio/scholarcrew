import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@scholarcrew/domain";
import type { z } from "zod";
import { costMicros } from "./cost";
import { toStrictJsonSchema } from "./schema";
import {
  type ExtractRequest,
  type ExtractResult,
  MODEL_ID,
  type MessageCreateParams,
  type ModelClient,
  type ModelRequest,
  type ModelUsage,
  type ToolDef,
} from "./types";

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type { MessageCreateParams };

/** The slice of the SDK this client uses. Tests pass a fake. */
export interface AnthropicLike {
  beta: { messages: { create(params: MessageCreateParams): Promise<Anthropic.Beta.BetaMessage> } };
}

function systemBlocks(system: string): Anthropic.Beta.BetaTextBlockParam[] {
  return [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
}

/** Strict unless the tool opts out; an opted-out tool (a submit tool) has no strict key at all (R3E-3). */
export function toolParam(t: ToolDef): Anthropic.Beta.BetaTool {
  const param: Anthropic.Beta.BetaTool = {
    name: t.name,
    description: t.description,
    input_schema: toStrictJsonSchema(t.input) as Anthropic.Beta.BetaTool.InputSchema,
  };
  return t.strict === false ? param : { ...param, strict: true };
}

export function buildTurnParams(req: ModelRequest): MessageCreateParams {
  return {
    model: MODEL_ID,
    max_tokens: req.maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: systemBlocks(req.system),
    messages: req.messages,
    tools: req.tools.map(toolParam),
    output_config: { effort: req.effort },
  };
}

export function buildExtractParams<T>(req: ExtractRequest<T>): MessageCreateParams {
  return {
    model: MODEL_ID,
    max_tokens: req.maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: systemBlocks(req.system),
    messages: [{ role: "user", content: req.content }],
    output_config: { effort: req.effort, format: { type: "json_schema", schema: toStrictJsonSchema(req.schema) } },
  };
}

/** Structural so the non-beta Message Batches usage (plan 11) fits too. */
export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function usageOf(u: UsageLike): ModelUsage {
  const base = {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
  return { ...base, costMicros: costMicros(base) };
}

/** First text block parsed as JSON and validated; null when anything is off. */
export function parseJsonOutput<T>(content: Anthropic.Beta.BetaContentBlock[], schema: z.ZodType<T>): T | null {
  const block = content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text");
  if (!block) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(block.text);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The SDK has already retried 408/409/429/5xx by the time an error reaches us. */
async function callModel<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      throw new AppError("internal", "The model request failed", {
        status: e.status ?? null,
        rateLimited: e instanceof Anthropic.RateLimitError,
      });
    }
    throw e;
  }
}

export function createModelClientWith(sdk: AnthropicLike, clock: () => number = Date.now): ModelClient {
  return {
    async turn(req) {
      const started = clock();
      const res = await callModel(() => sdk.beta.messages.create(buildTurnParams(req)));
      return {
        content: res.content,
        stopReason: res.stop_reason ?? "end_turn",
        usage: usageOf(res.usage),
        model: res.model,
        durationMs: Math.max(0, clock() - started),
      };
    },
    async extract<T>(req: ExtractRequest<T>): Promise<ExtractResult<T>> {
      const res = await callModel(() => sdk.beta.messages.create(buildExtractParams(req)));
      const usage = usageOf(res.usage);
      if (res.stop_reason === "refusal") return { value: null, refused: true, usage };
      return { value: parseJsonOutput(res.content, req.schema), refused: false, usage };
    },
  };
}

export const MODEL_TIMEOUT_MS = 120_000;
export const MODEL_MAX_RETRIES = 1;
export const MODEL_MAX_RETRY_WAIT_MS = 60_000;

/** Bounds server-directed retry waits; the SDK itself does not cap Retry-After. */
export function boundedRetryFetch(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  now: () => number = Date.now,
): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    const headers = new Headers(response.headers);
    const millis = headers.get("retry-after-ms");
    const seconds = headers.get("retry-after");
    let wait: number | null = null;
    if (millis !== null && millis.trim() !== "") {
      const parsed = Number(millis);
      if (Number.isFinite(parsed) && parsed >= 0) wait = parsed;
    }
    if (wait === null && seconds !== null && seconds.trim() !== "") {
      const numeric = Number(seconds);
      const parsed = Number.isFinite(numeric) ? numeric * 1000 : Date.parse(seconds) - now();
      if (Number.isFinite(parsed)) wait = Math.max(0, parsed);
    }
    headers.delete("retry-after-ms");
    headers.delete("retry-after");
    if (wait !== null) headers.set("retry-after-ms", String(Math.min(wait, MODEL_MAX_RETRY_WAIT_MS)));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}

/** Real client. Without apiKey the SDK reads ANTHROPIC_API_KEY (only the worker's deps.ts passes one). */
export function createModelClient(o: { apiKey?: string }): ModelClient {
  const sdk = new Anthropic({
    ...(o.apiKey ? { apiKey: o.apiKey } : {}),
    timeout: MODEL_TIMEOUT_MS,
    maxRetries: MODEL_MAX_RETRIES,
    fetch: boundedRetryFetch(),
  });
  return createModelClientWith({
    beta: { messages: { create: (params) => (sdk as unknown as AnthropicLike).beta.messages.create(params) } },
  });
}
