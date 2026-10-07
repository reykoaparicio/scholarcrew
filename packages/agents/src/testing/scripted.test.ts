import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { MessageParam, ModelRequest } from "../model/types";
import { createScriptedModelClient } from "./scripted";

function request(messages: MessageParam[]): ModelRequest {
  return { role: "test", system: "SYS", messages, tools: [], effort: "medium", maxTokens: 1000 };
}

describe("createScriptedModelClient", () => {
  it("replays turns with tool ids, default stop reasons, and priced usage", async () => {
    const model = createScriptedModelClient([
      { content: [{ type: "tool_use", name: "echo", input: { text: "hi" } }] },
      { content: [{ type: "text", text: "done" }] },
    ]);
    const first = await model.turn(request([{ role: "user", content: "Go" }]));
    expect(first.content).toEqual([{ type: "tool_use", id: "toolu_1", name: "echo", input: { text: "hi" } }]);
    expect(first.stopReason).toBe("tool_use");
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costMicros: 1400,
    });
    const second = await model.turn(request([{ role: "user", content: "Go" }]));
    expect(second.content[0]).toMatchObject({ type: "text", text: "done" });
    expect(second.stopReason).toBe("end_turn");
  });

  it("records a copy of each request's messages", async () => {
    const model = createScriptedModelClient([{ content: [{ type: "text", text: "ok" }] }]);
    const messages: MessageParam[] = [{ role: "user", content: "Go" }];
    await model.turn(request(messages));
    messages.push({ role: "assistant", content: "later" });
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]?.messages).toEqual([{ role: "user", content: "Go" }]);
  });

  it("passes through refusal and pause_turn stop reasons", async () => {
    const model = createScriptedModelClient([
      { stopReason: "refusal" },
      { stopReason: "pause_turn", content: [{ type: "text", text: "Searching" }] },
    ]);
    expect((await model.turn(request([]))).stopReason).toBe("refusal");
    expect((await model.turn(request([]))).stopReason).toBe("pause_turn");
  });

  it("throws when the script runs out", async () => {
    const model = createScriptedModelClient([]);
    await expect(model.turn(request([]))).rejects.toThrow("Scripted model client ran out of turns");
  });

  it("lets a function script answer from the request", async () => {
    const model = createScriptedModelClient((req) => ({
      content: [{ type: "text", text: `seen ${req.messages.length}` }],
    }));
    const turn = await model.turn(
      request([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ]),
    );
    expect(turn.content[0]).toMatchObject({ text: "seen 3" });
  });

  it("answers extract calls from scripted values, validated by the request schema", async () => {
    const model = createScriptedModelClient([
      { extract: { n: 1 } },
      { extract: { n: "x" } },
      { stopReason: "refusal" },
    ]);
    const req = {
      role: "catalog",
      system: "S",
      content: [],
      schema: z.strictObject({ n: z.number() }),
      effort: "low" as const,
      maxTokens: 100,
    };
    expect(await model.extract(req)).toMatchObject({ value: { n: 1 }, refused: false });
    expect(await model.extract(req)).toMatchObject({ value: null, refused: false });
    expect(await model.extract(req)).toMatchObject({ value: null, refused: true });
    expect(model.extractRequests).toHaveLength(3);
    expect(model.requests).toHaveLength(0);
  });
});
