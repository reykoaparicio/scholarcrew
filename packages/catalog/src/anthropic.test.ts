import { MODEL_ID, type ModelTurn, toStrictJsonSchema, usageOf } from "@scholarcrew/agents";
import { describe, expect, it, vi } from "vitest";
import {
  RESEARCH_MAX_TURNS,
  type ResearchParams,
  type ResearchResponse,
  SUBMIT_CANDIDATES,
  batchItemOf,
  buildBatchRequests,
  buildResearchParams,
  parseBatchMessage,
  runResearch,
} from "./anthropic";

const blocks = (list: unknown[]) => list as ResearchResponse["content"];
const INPUT = { state: "TX", county: "Maple", allowedDomains: ["example.org"] };
const FOUND = [
  {
    url: "https://cf.example.org/scholarships",
    title: "Maple Community Foundation",
    snippet: "Awards for Maple County seniors.",
  },
];

/** Replays responses in order and repeats the last one; records the params of every call. */
function scriptedSend(responses: ResearchResponse[]) {
  const calls: ResearchParams[] = [];
  const send = async (params: ResearchParams): Promise<ResearchResponse> => {
    calls.push(params);
    return responses[Math.min(calls.length, responses.length) - 1] ?? { stop_reason: "end_turn", content: [] };
  };
  return { calls, send };
}

describe("batch helpers", () => {
  it("builds batch requests without fallbacks or betas", () => {
    const schema = { type: "object", properties: {}, required: [], additionalProperties: false };
    const requests = buildBatchRequests([{ customId: "listing-1", system: "SYSTEM", userText: "PAGE", schema }]);
    expect(requests).toEqual([
      {
        custom_id: "listing-1",
        params: {
          model: MODEL_ID,
          max_tokens: 8000,
          system: [{ type: "text", text: "SYSTEM" }],
          messages: [{ role: "user", content: "PAGE" }],
          output_config: { effort: "low", format: { type: "json_schema", schema } },
        },
      },
    ]);
    expect(JSON.stringify(requests)).not.toMatch(/fallback|betas/);
  });

  it("reads the first text block of a succeeded batch message as JSON", () => {
    const content = [
      { type: "thinking" },
      { type: "text", text: '{"name":"Maple Award"}' },
      { type: "text", text: "[]" },
    ];
    expect(parseBatchMessage({ stop_reason: "end_turn", content })).toEqual({ name: "Maple Award" });
    expect(parseBatchMessage({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] })).toBeNull();
    expect(parseBatchMessage({ stop_reason: "refusal", content: [{ type: "text", text: "{}" }] })).toBeNull();
    expect(parseBatchMessage({ stop_reason: "end_turn", content: [] })).toBeNull();
    expect(parseBatchMessage(null)).toBeNull();
  });

  it("maps batch entries to items with full-price usage, and failed entries to nulls", () => {
    const usage = {
      input_tokens: 1000,
      output_tokens: 100,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
    };
    const message = { stop_reason: "end_turn", content: [{ type: "text", text: '{"name":"Maple Award"}' }], usage };
    expect(batchItemOf({ custom_id: "listing-1", result: { type: "succeeded", message } })).toEqual({
      customId: "listing-1",
      json: { name: "Maple Award" },
      usage: usageOf(usage),
    });
    expect(batchItemOf({ custom_id: "listing-2", result: { type: "errored" } })).toEqual({
      customId: "listing-2",
      json: null,
      usage: null,
    });
  });
});

describe("research helpers", () => {
  it("builds research params with fallbacks, server tools, and a strict submit tool", () => {
    const params = buildResearchParams(INPUT, [{ role: "user", content: "hi" }]);
    expect(params).toMatchObject({
      model: MODEL_ID,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: "hi" }],
    });
    expect(params.tools).toEqual([
      {
        type: "web_search_20260209",
        name: "web_search",
        allowed_callers: ["direct"],
        max_uses: 8,
        allowed_domains: ["example.org"],
      },
      {
        type: "web_fetch_20260209",
        name: "web_fetch",
        allowed_callers: ["direct"],
        max_uses: 8,
        max_content_tokens: 20000,
        allowed_domains: ["example.org"],
      },
      {
        name: "submit_candidates",
        description: expect.any(String),
        input_schema: toStrictJsonSchema(SUBMIT_CANDIDATES),
        strict: true,
      },
    ]);
  });

  it("omits allowed_domains when none are configured", () => {
    const params = buildResearchParams({ state: "TX", allowedDomains: [""] }, []);
    expect(params.tools?.[0]).toEqual({
      type: "web_search_20260209",
      name: "web_search",
      allowed_callers: ["direct"],
      max_uses: 8,
    });
  });

  it("continues after pause_turn and returns submitted candidates", async () => {
    const { calls, send } = scriptedSend([
      {
        stop_reason: "pause_turn",
        content: blocks([
          {
            type: "server_tool_use",
            id: "srvtoolu_1",
            name: "web_search",
            input: { query: "Maple County scholarships" },
          },
        ]),
      },
      {
        stop_reason: "tool_use",
        content: blocks([{ type: "tool_use", id: "toolu_1", name: "submit_candidates", input: { candidates: FOUND } }]),
      },
    ]);
    expect(await runResearch(send, INPUT)).toEqual(FOUND);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.messages).toHaveLength(1);
    expect(calls[1]?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("answers an invalid submit with an error tool result", async () => {
    const tooMany = Array.from({ length: 26 }, (_, n) => ({
      url: `https://cf.example.org/${n}`,
      title: "T",
      snippet: "S",
    }));
    const { calls, send } = scriptedSend([
      {
        stop_reason: "tool_use",
        content: blocks([
          { type: "tool_use", id: "toolu_1", name: "submit_candidates", input: { candidates: tooMany } },
        ]),
      },
      {
        stop_reason: "tool_use",
        content: blocks([{ type: "tool_use", id: "toolu_2", name: "submit_candidates", input: { candidates: FOUND } }]),
      },
    ]);
    expect(await runResearch(send, INPUT)).toEqual(FOUND);
    const retry = calls[1]?.messages[2];
    expect(retry?.role).toBe("user");
    expect(retry?.content).toEqual([
      expect.objectContaining({ type: "tool_result", tool_use_id: "toolu_1", is_error: true }),
    ]);
  });

  it("returns no candidates on refusal or after 6 turns", async () => {
    const refused = scriptedSend([{ stop_reason: "refusal", content: [] }]);
    expect(await runResearch(refused.send, INPUT)).toEqual([]);
    expect(refused.calls).toHaveLength(1);

    const chatty = scriptedSend([
      { stop_reason: "end_turn", content: blocks([{ type: "text", text: "Still looking." }]) },
    ]);
    expect(await runResearch(chatty.send, INPUT)).toEqual([]);
    expect(chatty.calls).toHaveLength(RESEARCH_MAX_TURNS);
    expect(chatty.calls.at(-1)?.messages).toHaveLength(1 + 2 * (RESEARCH_MAX_TURNS - 1));
  });

  it("reports usage for every research turn, and a failed write doesn't lose the candidates", async () => {
    const usage = { input_tokens: 500, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const responses: ResearchResponse[] = [
      { stop_reason: "pause_turn", content: blocks([]), usage },
      {
        stop_reason: "tool_use",
        content: blocks([{ type: "tool_use", id: "toolu_1", name: "submit_candidates", input: { candidates: FOUND } }]),
        usage,
      },
    ];
    const turns: ModelTurn[] = [];
    const ok = scriptedSend(responses);
    expect(
      await runResearch(ok.send, INPUT, async (_role, t) => {
        turns.push(t);
      }),
    ).toEqual(FOUND);
    expect(turns.map((t) => [t.stopReason, t.model, t.usage])).toEqual([
      ["pause_turn", MODEL_ID, usageOf(usage)],
      ["tool_use", MODEL_ID, usageOf(usage)],
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const failing = scriptedSend(responses);
    expect(await runResearch(failing.send, INPUT, () => Promise.reject(new Error("insert failed")))).toEqual(FOUND);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("catalog usage write failed"));
    log.mockRestore();
  });
});
