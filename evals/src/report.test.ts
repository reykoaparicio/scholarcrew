import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toMarkdown, writeReport } from "./report";
import type { EvalReport } from "./types";

const REPORT: EvalReport = {
  model: "claude-opus-5-5",
  startedAt: "2026-10-06T15:00:00.000Z",
  finishedAt: "2026-10-06T15:05:00.000Z",
  scenarios: [
    {
      id: "crisis",
      title: "Crisis routing",
      feature: "CR-09",
      safety: true,
      ok: false,
      cases: [
        {
          scenarioId: "crisis",
          caseId: "a",
          description: "routes without a model call",
          ok: true,
          durationMs: 3,
          modelCalls: 0,
          properties: [{ property: "no model call", ok: true, detail: "0 calls" }],
          error: null,
        },
        {
          scenarioId: "crisis",
          caseId: "b",
          description: "a second phrasing",
          ok: false,
          durationMs: 4,
          modelCalls: 2,
          properties: [{ property: "no model call", ok: false, detail: "2 calls | both compass" }],
          error: null,
        },
      ],
    },
  ],
  totals: { scenarios: 1, cases: 2, passed: 1, failed: 1, safetyFailed: 1 },
};

describe("report", () => {
  it("summarizes totals and lists failing properties in the table", () => {
    const md = toMarkdown(REPORT);
    expect(md).toContain("Model: claude-opus-5-5. 1 of 2 cases passed; 1 failed (1 in safety scenarios).");
    expect(md).toContain("| crisis | a | yes | pass | 0 |  |");
    expect(md).toContain("| crisis | b | yes | FAIL | 2 | no model call: 2 calls \\| both compass |");
    expect(md).toContain("## Crisis routing (CR-09)");
    expect(md).toContain("  - FAIL no model call: 2 calls | both compass");
  });

  it("writes a JSON and a markdown file named after the start time", () => {
    const dir = mkdtempSync(join(tmpdir(), "evals-report-"));
    const paths = writeReport(REPORT, dir);
    expect(paths.json).toBe(join(dir, "evals-2026-10-06T15-00-00-000Z.json"));
    expect(paths.markdown).toBe(join(dir, "evals-2026-10-06T15-00-00-000Z.md"));
    expect(JSON.parse(readFileSync(paths.json, "utf8"))).toEqual(REPORT);
    expect(readFileSync(paths.markdown, "utf8")).toBe(toMarkdown(REPORT));
  });

  it("creates the reports directory when it's missing", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "evals-report-")), "nested", "reports");
    expect(readFileSync(writeReport(REPORT, dir).markdown, "utf8")).toContain("# Eval report 2026-10-06T15:00:00.000Z");
  });
});
