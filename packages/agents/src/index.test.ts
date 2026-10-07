import { describe, expect, it } from "vitest";
import * as agents from "./index";
import * as testing from "./testing";

describe("@scholarcrew/agents", () => {
  it("exports the §9.5 runtime surface", () => {
    const surface = agents as unknown as Record<string, unknown>;
    for (const name of [
      "createModelClient",
      "costMicros",
      "toStrictJsonSchema",
      "countStrictUnions",
      "buildExtractParams",
      "usageOf",
      "runAgentLoop",
      "runCrewRequest",
      "runWeeklyPlan",
      "detectCrisis",
      "checkIntegrity",
      "checkSources",
      "checkPrivacy",
      "wrapUntrusted",
    ]) {
      expect(typeof surface[name], name).toBe("function");
    }
    expect(agents.MODEL_ID).toBe("claude-opus-5-5");
    expect(agents.STRICT_UNION_LIMIT).toBe(16);
    expect(agents.MODEL_TIMEOUT_MS).toBe(120_000);
    expect(agents.MODEL_MAX_RETRIES).toBe(1);
    expect(agents.MODEL_MAX_RETRY_WAIT_MS).toBe(60_000);
    expect(agents.COMPASS_LIMITS).toEqual({ maxModelRounds: 3, maxToolCalls: 8, deadlineMs: 120_000 });
    expect(agents.SPECIALIST_LIMITS).toEqual({ maxModelRounds: 3, maxToolCalls: 6, deadlineMs: 45_000 });
    expect(agents.CRISIS_REPLY.safety).toBe("crisis");
  });

  it("exports the testing helpers", () => {
    expect(typeof testing.createScriptedModelClient).toBe("function");
    expect(typeof testing.createFakePort).toBe("function");
    expect(testing.JORDAN.ownerId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("builds a real model client without touching the network", () => {
    const client = agents.createModelClient({ apiKey: "sk-ant-test-key" });
    expect(typeof client.turn).toBe("function");
    expect(typeof client.extract).toBe("function");
  });
});
