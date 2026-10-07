import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type AnthropicLike,
  FALLBACK_BETA,
  type MessageCreateParams,
  boundedRetryFetch,
  createModelClientWith,
  toolParam,
} from "./client";
import type { ToolDef } from "./types";

type Reply = Record<string, unknown> | Error;

function fakeSdk(replies: Reply[]) {
  const calls: MessageCreateParams[] = [];
  const sdk: AnthropicLike = {
    beta: {
      messages: {
        async create(params) {
          calls.push(params);
          const next = replies.shift();
          if (next === undefined) throw new Error("no scripted response");
          if (next instanceof Error) throw next;
          return next as unknown as Anthropic.Beta.BetaMessage;
        },
      },
    },
  };
  return { sdk, calls };
}

function message(o: { content: unknown[]; stop_reason?: string; usage?: Record<string, unknown> }) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: o.content,
    stop_reason: o.stop_reason ?? "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      ...o.usage,
    },
  };
}

function apiError(proto: object, status: number): Error {
  return Object.assign(Object.create(proto) as Error, { status, message: "api error" });
}

const countWords: ToolDef<{ text: string }> = {
  name: "count_words",
  description: "Count words.",
  input: z.strictObject({ text: z.string() }),
  run: async (i) => ({ words: i.text.split(" ").length }),
};

const turnRequest = {
  role: "compass",
  system: "SYSTEM PROMPT",
  messages: [{ role: "user" as const, content: "Hi" }],
  tools: [countWords],
  effort: "medium" as const,
  maxTokens: 16_000,
};

describe("boundedRetryFetch", () => {
  it("caps numeric and HTTP-date retry hints and removes malformed hints", async () => {
    for (const headers of [
      { "retry-after-ms": "900000" },
      { "retry-after": "3600" },
      { "retry-after": "Wed, 07 Oct 2026 12:00:00 GMT" },
    ]) {
      const fake = (async () =>
        new Response("busy", {
          status: 429,
          headers: new Headers(
            Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
          ),
        })) as typeof fetch;
      const response = await boundedRetryFetch(fake, () => Date.parse("2026-10-07T10:00:00Z"))("https://api.test");
      expect(response.headers.get("retry-after-ms")).toBe("60000");
      expect(response.headers.has("retry-after")).toBe(false);
      expect(await response.text()).toBe("busy");
    }
    const malformed = (async () =>
      new Response(null, {
        status: 503,
        headers: { "retry-after-ms": "nope", "retry-after": "invalid" },
      })) as typeof fetch;
    const response = await boundedRetryFetch(malformed)("https://api.test");
    expect(response.headers.has("retry-after-ms")).toBe(false);
    expect(response.headers.has("retry-after")).toBe(false);
  });
});

describe("createModelClientWith().turn", () => {
  it("sends betas, fallbacks, one cached system block, strict tools, and explicit effort", async () => {
    const { sdk, calls } = fakeSdk([message({ content: [{ type: "text", text: "ok", citations: null }] })]);
    await createModelClientWith(sdk).turn(turnRequest);
    const params = calls[0];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 16_000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: [{ type: "text", text: "SYSTEM PROMPT", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "Hi" }],
      output_config: { effort: "medium" },
    });
    expect(params?.tools).toEqual([
      {
        name: "count_words",
        description: "Count words.",
        strict: true,
        input_schema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
          additionalProperties: false,
        },
      },
    ]);
    expect(FALLBACK_BETA).toBe("server-side-fallback-2026-07-01");
    expect(params && "thinking" in params).toBe(false);
    expect(params && "tool_choice" in params).toBe(false);
  });

  it("sends strict: true by default and leaves the strict key out for strict: false tools (R3E-3)", () => {
    expect(toolParam(countWords).strict).toBe(true);
    const loose = toolParam({ ...countWords, strict: false } as ToolDef);
    expect("strict" in loose).toBe(false);
    expect(loose.input_schema).toEqual(toolParam(countWords).input_schema);
  });

  it("maps usage with null cache counts to zero and measures duration", async () => {
    const content = [{ type: "tool_use", id: "toolu_1", name: "count_words", input: { text: "a b" } }];
    const { sdk } = fakeSdk([message({ content, stop_reason: "tool_use" })]);
    const times = [100, 350];
    const turn = await createModelClientWith(sdk, () => times.shift() ?? 350).turn(turnRequest);
    expect(turn.content).toEqual(content);
    expect(turn.stopReason).toBe("tool_use");
    expect(turn.model).toBe("claude-opus-5-5");
    expect(turn.durationMs).toBe(250);
    expect(turn.usage).toEqual({
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costMicros: 8000,
    });
  });

  it("counts cache reads and writes in the cost", async () => {
    const { sdk } = fakeSdk([
      message({ content: [], usage: { cache_read_input_tokens: 5000, cache_creation_input_tokens: 1000 } }),
    ]);
    const turn = await createModelClientWith(sdk).turn(turnRequest);
    expect(turn.usage.cacheReadTokens).toBe(5000);
    expect(turn.usage.cacheWriteTokens).toBe(1000);
    expect(turn.usage.costMicros).toBe(14_000);
  });

  it("maps rate limits and API errors to AppError internal", async () => {
    const { sdk } = fakeSdk([
      apiError(Anthropic.RateLimitError.prototype, 429),
      apiError(Anthropic.APIError.prototype, 500),
    ]);
    const client = createModelClientWith(sdk);
    await expect(client.turn(turnRequest)).rejects.toMatchObject({ code: "internal" });
    await expect(client.turn(turnRequest)).rejects.toBeInstanceOf(AppError);
  });

  it("rethrows errors that aren't API errors", async () => {
    const { sdk } = fakeSdk([new TypeError("boom")]);
    const error = await createModelClientWith(sdk)
      .turn(turnRequest)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(AppError);
  });
});

describe("createModelClientWith().extract", () => {
  const Count = z.strictObject({ n: z.number() });
  const extractRequest = {
    role: "catalog",
    system: "EXTRACT",
    content: [{ type: "text" as const, text: "page" }],
    schema: Count,
    effort: "low" as const,
    maxTokens: 8000,
  };

  it("asks for a JSON output without tools and parses the first text block", async () => {
    const { sdk, calls } = fakeSdk([message({ content: [{ type: "text", text: '{"n":3}', citations: null }] })]);
    const result = await createModelClientWith(sdk).extract(extractRequest);
    expect(result).toMatchObject({ value: { n: 3 }, refused: false });
    expect(result.usage.costMicros).toBe(8000);
    const params = calls[0];
    expect(params?.output_config).toEqual({
      effort: "low",
      format: {
        type: "json_schema",
        schema: { type: "object", properties: { n: { type: "number" } }, required: ["n"], additionalProperties: false },
      },
    });
    expect(params?.messages).toEqual([{ role: "user", content: extractRequest.content }]);
    expect(params?.betas).toEqual([FALLBACK_BETA]);
    expect(params?.fallbacks).toBe("default");
    expect(params && "tools" in params).toBe(false);
  });

  it("returns null for invalid JSON or a schema mismatch", async () => {
    const { sdk } = fakeSdk([
      message({ content: [{ type: "text", text: "not json", citations: null }] }),
      message({ content: [{ type: "text", text: '{"n":"three"}', citations: null }] }),
    ]);
    const client = createModelClientWith(sdk);
    expect((await client.extract(extractRequest)).value).toBeNull();
    expect((await client.extract(extractRequest)).value).toBeNull();
  });

  it("reports refusals before reading content", async () => {
    const { sdk } = fakeSdk([
      message({ content: [{ type: "text", text: '{"n":1}', citations: null }], stop_reason: "refusal" }),
    ]);
    const result = await createModelClientWith(sdk).extract(extractRequest);
    expect(result).toMatchObject({ value: null, refused: true });
  });
});
