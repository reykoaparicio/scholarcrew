import { createScriptedModelClient } from "@scholarcrew/agents/testing";
import { describe, expect, it } from "vitest";
import { createRecordingModelClient } from "./recording";
import { caseCount, exitCodeFor, runScenarios, validateScenarios } from "./runner";
import type { EvalContext, Scenario } from "./types";

const NOW = () => new Date("2026-10-06T15:00:00.000Z");

function context(): EvalContext {
  return {
    model: createRecordingModelClient(createScriptedModelClient([{ content: [{ type: "text", text: "Hello." }] }])),
    now: NOW,
  };
}

const SAMPLE: Scenario[] = [
  {
    id: "alpha",
    title: "Alpha",
    feature: "AG-08",
    safety: true,
    cases: [
      {
        id: "pass",
        description: "passes after one model call",
        validate: () => [],
        run: async (ctx) => {
          const t = await ctx.model.turn({
            role: "compass",
            system: "S",
            messages: [{ role: "user", content: "hi" }],
            tools: [],
            effort: "medium",
            maxTokens: 10,
          });
          return [{ property: "replied", ok: t.stopReason === "end_turn", detail: "" }];
        },
      },
      {
        id: "fail",
        description: "fails a property",
        validate: () => [],
        run: async () => [{ property: "always false", ok: false, detail: "by design" }],
      },
    ],
  },
  {
    id: "beta",
    title: "Beta",
    feature: "AG-08",
    safety: false,
    cases: [
      {
        id: "throws",
        description: "throws",
        validate: () => [],
        run: async () => {
          throw new Error("boom");
        },
      },
      { id: "empty", description: "checks nothing", validate: () => [], run: async () => [] },
    ],
  },
];

describe("runScenarios", () => {
  it("runs every case and totals the results; errors and empty checks count as failures", async () => {
    const report = await runScenarios(SAMPLE, context, { model: "claude-opus-5-5", now: NOW });
    expect(report.totals).toEqual({ scenarios: 2, cases: 4, passed: 1, failed: 3, safetyFailed: 1 });
    const alpha = report.scenarios[0];
    expect(alpha?.cases[0]).toMatchObject({ caseId: "pass", ok: true, modelCalls: 1 });
    expect(report.scenarios[1]?.cases[0]).toMatchObject({ caseId: "throws", ok: false, error: "boom" });
    expect(report.scenarios[1]?.cases[1]).toMatchObject({ caseId: "empty", ok: false });
    expect(report.startedAt).toBe("2026-10-06T15:00:00.000Z");
    expect(exitCodeFor(report)).toBe(1);
  });

  it("runs one scenario or one case with --only", async () => {
    const one = await runScenarios(SAMPLE, context, { model: "m", only: "alpha/pass", now: NOW });
    expect(one.totals).toEqual({ scenarios: 1, cases: 1, passed: 1, failed: 0, safetyFailed: 0 });
    expect(exitCodeFor(one)).toBe(0);
    const beta = await runScenarios(SAMPLE, context, { model: "m", only: "beta", now: NOW });
    expect(beta.totals.cases).toBe(2);
    const none = await runScenarios(SAMPLE, context, { model: "m", only: "missing", now: NOW });
    expect(exitCodeFor(none)).toBe(1);
  });

  it("logs one line per case", async () => {
    const lines: string[] = [];
    await runScenarios(SAMPLE, context, { model: "m", now: NOW, log: (l) => lines.push(l) });
    expect(lines).toEqual([
      "PASS alpha/pass",
      "FAIL alpha/fail (always false: by design)",
      "FAIL beta/throws (error: boom)",
      "FAIL beta/empty (no properties checked)",
    ]);
  });
});

describe("validateScenarios", () => {
  it("reports duplicate ids, empty scenarios, and fixture problems without running anything", () => {
    const bad: Scenario[] = [
      {
        id: "x",
        title: "X",
        feature: "AG-08",
        safety: false,
        cases: [
          { id: "a", description: "", validate: () => ["bad fixture"], run: async () => [] },
          { id: "a", description: "", validate: () => [], run: async () => [] },
        ],
      },
      { id: "x", title: "X again", feature: "AG-08", safety: false, cases: [] },
    ];
    expect(validateScenarios(bad)).toEqual([
      "x/a: bad fixture",
      "x/a is a duplicate case id",
      "duplicate scenario id x",
      "x has no cases",
    ]);
    expect(caseCount(bad)).toBe(2);
    expect(validateScenarios(SAMPLE)).toEqual([]);
  });
});
