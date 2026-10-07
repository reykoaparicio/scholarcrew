import { AppError } from "@scholarcrew/domain";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ToolDef } from "../model/types";
import { createScriptedModelClient } from "../testing/scripted";
import { MAX_ISSUE_CHARS } from "./limits";
import { type AgentLoopInput, formatIssues, runAgentLoop, runCheckedAgentLoop } from "./loop";

const Answer = z.strictObject({ answer: z.string().min(1) });
type Answer = z.infer<typeof Answer>;

function echoTool(run: (i: { text: string }) => Promise<unknown> = async (i) => ({ echoed: i.text })) {
  const spy = vi.fn(run);
  const tool: ToolDef<{ text: string }> = {
    name: "echo",
    description: "Echo text back.",
    input: z.strictObject({ text: z.string().max(50) }),
    run: spy,
  };
  return { tool, spy };
}

function failingTool(name: string, error: Error): ToolDef {
  return {
    name,
    description: "Always fails.",
    input: z.strictObject({}),
    run: async () => {
      throw error;
    },
  };
}

function input(tools: ToolDef[], o: Partial<AgentLoopInput<Answer>> = {}): AgentLoopInput<Answer> {
  return {
    role: "test",
    system: "SYS",
    userContent: [{ type: "text", text: "Go" }],
    tools,
    submit: { name: "submit_answer", description: "Submit the final answer.", schema: Answer },
    effort: "medium",
    maxTokens: 4000,
    limits: { maxModelRounds: 3, maxToolCalls: 6, deadlineMs: 60_000 },
    ...o,
  };
}

const submit = (answer: string) => ({ type: "tool_use" as const, name: "submit_answer", input: { answer } });
const call = (name: string, args: unknown) => ({ type: "tool_use" as const, name, input: args });
const text = (t: string) => ({ type: "text" as const, text: t });

type ResultBlock = { type: string; tool_use_id: string; content: string; is_error?: boolean };
function resultsOf(
  model: ReturnType<typeof createScriptedModelClient>,
  request: number,
  message: number,
): ResultBlock[] {
  return model.requests[request]?.messages[message]?.content as ResultBlock[];
}

describe("runAgentLoop", () => {
  it("returns the submit tool's validated input and sends the submit tool last", async () => {
    const { tool } = echoTool();
    const model = createScriptedModelClient([{ content: [submit("42")] }]);
    const result = await runAgentLoop(model, input([tool]));
    expect(result.output).toEqual({ answer: "42" });
    expect(result.reason).toBe("submitted");
    expect(result.turns).toHaveLength(1);
    expect(model.requests[0]?.tools.map((t) => t.name)).toEqual(["echo", "submit_answer"]);
    expect(model.requests[0]?.tools.map((t) => t.strict)).toEqual([undefined, false]);
    expect(model.requests[0]?.messages).toEqual([{ role: "user", content: [{ type: "text", text: "Go" }] }]);
  });

  it("runs tools and sends every result in one user message without editing history", async () => {
    const { tool, spy } = echoTool();
    const model = createScriptedModelClient([
      { content: [call("echo", { text: "a" }), call("echo", { text: "b" })] },
      { content: [submit("ok")] },
    ]);
    const result = await runAgentLoop(model, input([tool]));
    expect(result.output).toEqual({ answer: "ok" });
    expect(spy).toHaveBeenCalledTimes(2);
    const second = model.requests[1]?.messages ?? [];
    expect(second).toHaveLength(3);
    expect(second[0]).toEqual(model.requests[0]?.messages[0]);
    expect(second[1]).toEqual({
      role: "assistant",
      content: [
        { type: "tool_use", id: "toolu_1", name: "echo", input: { text: "a" } },
        { type: "tool_use", id: "toolu_2", name: "echo", input: { text: "b" } },
      ],
    });
    expect(second[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_1", content: JSON.stringify({ echoed: "a" }) },
        { type: "tool_result", tool_use_id: "toolu_2", content: JSON.stringify({ echoed: "b" }) },
      ],
    });
  });

  it("answers an invalid submit with the zod issues, then accepts a valid one", async () => {
    const model = createScriptedModelClient([{ content: [submit("")] }, { content: [submit("fine")] }]);
    const result = await runAgentLoop(model, input([]));
    expect(result.output).toEqual({ answer: "fine" });
    expect(result.reason).toBe("submitted");
    expect(resultsOf(model, 1, 2)[0]).toMatchObject({
      tool_use_id: "toolu_1",
      is_error: true,
      content: expect.stringContaining("answer:"),
    });
  });

  it("ends with invalid_submit after a second invalid submit, appending only (R3E-3)", async () => {
    const model = createScriptedModelClient([
      { content: [submit("")] },
      { content: [submit("")] },
      { content: [submit("late")] },
    ]);
    const result = await runAgentLoop(model, input([]));
    expect(result).toMatchObject({ output: null, reason: "invalid_submit" });
    expect(model.requests).toHaveLength(2);
    const second = model.requests[1]?.messages ?? [];
    expect(second).toHaveLength(3);
    expect(second[0]).toEqual(model.requests[0]?.messages[0]);
    expect(second[1]).toEqual({
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_1", name: "submit_answer", input: { answer: "" } }],
    });
    expect(resultsOf(model, 1, 2)).toEqual([
      {
        type: "tool_result",
        tool_use_id: "toolu_1",
        is_error: true,
        content: expect.stringMatching(/^Invalid submit_answer input\. answer: /),
      },
    ]);
  });

  it("caps the issue text at 2,000 characters", () => {
    const Many = z.strictObject(
      Object.fromEntries(Array.from({ length: 12 }, (_, k) => [`field_${"x".repeat(300)}_${k}`, z.string()])),
    );
    const parsed = Many.safeParse({});
    if (parsed.success) throw new Error("expected issues");
    const text = formatIssues(parsed.error);
    expect(text.length).toBe(MAX_ISSUE_CHARS + 1);
    expect(text.endsWith("…")).toBe(true);
    expect(text.split("; ").length).toBeLessThanOrEqual(10);
  });

  it("turns invalid input, unknown tools, and thrown errors into error results", async () => {
    const { tool, spy } = echoTool();
    const model = createScriptedModelClient([
      {
        content: [call("echo", { text: "x".repeat(60) }), call("nope", {}), call("boom", {}), call("crash", {})],
      },
      { content: [submit("ok")] },
    ]);
    await runAgentLoop(
      model,
      input([
        tool,
        failingTool("boom", new AppError("not_found", "No such essay")),
        failingTool("crash", new Error("secret detail")),
      ]),
    );
    expect(spy).not.toHaveBeenCalled();
    const results = resultsOf(model, 1, 2);
    expect(results.map((r) => r.is_error)).toEqual([true, true, true, true]);
    expect(results[0]?.content).toContain("Invalid input for echo");
    expect(results[1]?.content).toBe("Unknown tool nope.");
    expect(results[2]?.content).toBe("No such essay");
    expect(results[3]?.content).toBe("crash failed.");
  });

  it("truncates tool results at 20,000 characters", async () => {
    const { tool } = echoTool(async () => ({ s: "x".repeat(30_000) }));
    const model = createScriptedModelClient([{ content: [call("echo", { text: "a" })] }, { content: [submit("ok")] }]);
    await runAgentLoop(model, input([tool]));
    const content = resultsOf(model, 1, 2)[0]?.content ?? "";
    expect(content.length).toBeLessThanOrEqual(20_000);
    expect(JSON.parse(content)).toEqual({ truncated: 1 });
  });

  it("continues after pause_turn without adding a user message", async () => {
    const model = createScriptedModelClient([
      { stopReason: "pause_turn", content: [text("Searching")] },
      { content: [submit("ok")] },
    ]);
    const result = await runAgentLoop(model, input([]));
    expect(result.reason).toBe("submitted");
    const second = model.requests[1]?.messages ?? [];
    expect(second).toHaveLength(2);
    expect(second[1]?.role).toBe("assistant");
  });

  it("stops on a refusal", async () => {
    const model = createScriptedModelClient([{ stopReason: "refusal" }]);
    const result = await runAgentLoop(model, input([]));
    expect(result).toMatchObject({ output: null, reason: "refused" });
    expect(model.requests).toHaveLength(1);
  });

  it("asks once for the submit call, then gives up with no_submit", async () => {
    const model = createScriptedModelClient([
      { content: [text("Thinking out loud")] },
      { content: [text("Still thinking")] },
    ]);
    const result = await runAgentLoop(model, input([]));
    expect(result.reason).toBe("no_submit");
    expect(model.requests[1]?.messages[2]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Call submit_answer now with your final answer." }],
    });
  });

  it("accepts a submit that follows the nudge", async () => {
    const model = createScriptedModelClient([{ content: [text("Plain answer")] }, { content: [submit("ok")] }]);
    expect((await runAgentLoop(model, input([]))).reason).toBe("submitted");
  });

  it("ends with limit after maxModelRounds rounds past the first call", async () => {
    const { tool } = echoTool();
    const model = createScriptedModelClient(() => ({ content: [call("echo", { text: "again" })] }));
    const result = await runAgentLoop(
      model,
      input([tool], { limits: { maxModelRounds: 1, maxToolCalls: 6, deadlineMs: 60_000 } }),
    );
    expect(result.reason).toBe("limit");
    expect(model.requests).toHaveLength(2);
  });

  it("refuses tool calls past maxToolCalls and ends with limit when the model keeps asking", async () => {
    const { tool, spy } = echoTool();
    const model = createScriptedModelClient([
      { content: [call("echo", { text: "a" }), call("echo", { text: "b" })] },
      { content: [call("echo", { text: "c" })] },
    ]);
    const result = await runAgentLoop(
      model,
      input([tool], { limits: { maxModelRounds: 3, maxToolCalls: 1, deadlineMs: 60_000 } }),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(resultsOf(model, 1, 2)[1]).toMatchObject({
      is_error: true,
      content: "Tool limit reached. Call submit_answer now with your best answer.",
    });
    expect(result.reason).toBe("limit");
    expect(model.requests).toHaveLength(2);
  });

  it("ends with limit when the deadline passes", async () => {
    let clock = 0;
    const { tool } = echoTool(async () => {
      clock = 61_000;
      return { ok: true };
    });
    const model = createScriptedModelClient([
      { content: [call("echo", { text: "a" })] },
      { content: [submit("late")] },
    ]);
    const result = await runAgentLoop(model, input([tool], { now: () => clock }));
    expect(result.reason).toBe("limit");
    expect(model.requests).toHaveLength(1);
  });

  it("calls onTurn for every model turn", async () => {
    const { tool } = echoTool();
    const onTurn = vi.fn();
    const model = createScriptedModelClient([{ content: [call("echo", { text: "a" })] }, { content: [submit("ok")] }]);
    const result = await runAgentLoop(model, input([tool], { onTurn }));
    expect(onTurn).toHaveBeenCalledTimes(2);
    expect(onTurn).toHaveBeenLastCalledWith(result.turns[1]);
  });
});

describe("runCheckedAgentLoop", () => {
  it("sends check problems back once, then accepts a clean output", async () => {
    const model = createScriptedModelClient([{ content: [submit("bad")] }, { content: [submit("good")] }]);
    const result = await runCheckedAgentLoop(model, {
      ...input([]),
      check: (a) => (a.answer === "bad" ? ["answer is bad"] : []),
    });
    expect(result).toMatchObject({ output: { answer: "good" }, reason: "submitted", problems: [] });
    expect(resultsOf(model, 1, 2)[0]).toMatchObject({
      tool_use_id: "toolu_1",
      is_error: true,
      content: "Fix these problems, then call submit_answer again: answer is bad",
    });
  });

  it("returns the last output with its problems once the retry is used", async () => {
    const model = createScriptedModelClient([{ content: [submit("bad")] }, { content: [submit("still bad")] }]);
    const result = await runCheckedAgentLoop(model, { ...input([]), check: () => ["not fixed"] });
    expect(result).toMatchObject({ output: { answer: "still bad" }, reason: "submitted", problems: ["not fixed"] });
    expect(model.requests).toHaveLength(2);
  });
});
