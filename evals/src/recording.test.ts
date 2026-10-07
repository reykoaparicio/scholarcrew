import type { ModelRequest } from "@scholarcrew/agents";
import { createScriptedModelClient } from "@scholarcrew/agents/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createRecordingModelClient } from "./recording";

function request(messages: ModelRequest["messages"]): ModelRequest {
  return { role: "compass", system: "SYSTEM PROMPT", messages, tools: [], effort: "medium", maxTokens: 100 };
}

describe("createRecordingModelClient", () => {
  it("captures the system prompt and messages as they were when the turn was sent", async () => {
    const rec = createRecordingModelClient(createScriptedModelClient([{ content: [{ type: "text", text: "Hi." }] }]));
    const messages: ModelRequest["messages"] = [{ role: "user", content: "What is due next?" }];
    const turn = await rec.turn(request(messages));
    messages.push({ role: "user", content: "added after the call" });
    expect(turn.stopReason).toBe("end_turn");
    expect(rec.calls()).toBe(1);
    expect(rec.captured[0]).toMatchObject({ kind: "turn", role: "compass" });
    expect(rec.captured[0]?.text).toContain("SYSTEM PROMPT");
    expect(rec.captured[0]?.text).toContain("What is due next?");
    expect(rec.captured[0]?.text).not.toContain("added after the call");
  });

  it("captures tool names and descriptions", async () => {
    const rec = createRecordingModelClient(createScriptedModelClient([{ content: [{ type: "text", text: "Ok." }] }]));
    await rec.turn({
      ...request([{ role: "user", content: "Any matches?" }]),
      tools: [
        {
          name: "get_matches",
          description: "Read the student's matches",
          input: z.strictObject({}),
          run: async () => [],
        },
      ],
    });
    expect(rec.captured[0]?.text).toContain("get_matches");
    expect(rec.captured[0]?.text).toContain("Read the student's matches");
  });

  it("captures extract requests, passes the result through, and reset clears the log", async () => {
    const rec = createRecordingModelClient(createScriptedModelClient([{ extract: { total: 3 } }]));
    const out = await rec.extract({
      role: "aid",
      system: "EXTRACT",
      content: [{ type: "text", text: "Award letter text" }],
      schema: z.strictObject({ total: z.number() }),
      effort: "high",
      maxTokens: 100,
    });
    expect(out.value).toEqual({ total: 3 });
    expect(rec.captured[0]).toMatchObject({ kind: "extract", role: "aid" });
    expect(rec.captured[0]?.text).toContain("Award letter text");
    rec.reset();
    expect(rec.calls()).toBe(0);
  });
});
