import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { failureSummary } from "./runner";
import type { EvalReport } from "./types";

export function reportStem(report: EvalReport): string {
  return `evals-${report.startedAt.replace(/[:.]/g, "-")}`;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function toMarkdown(report: EvalReport): string {
  const t = report.totals;
  const lines = [
    `# Eval report ${report.startedAt}`,
    "",
    `Model: ${report.model}. ${t.passed} of ${t.cases} cases passed; ${t.failed} failed (${t.safetyFailed} in safety scenarios).`,
    "",
    "| Scenario | Case | Safety | Result | Model calls | Failed properties |",
    "|---|---|---|---|---|---|",
  ];
  for (const s of report.scenarios) {
    for (const c of s.cases) {
      const failures = c.ok ? "" : cell(failureSummary(c));
      lines.push(
        `| ${s.id} | ${c.caseId} | ${s.safety ? "yes" : "no"} | ${c.ok ? "pass" : "FAIL"} | ${c.modelCalls} | ${failures} |`,
      );
    }
  }
  for (const s of report.scenarios) {
    lines.push("", `## ${s.title} (${s.feature})`, "");
    for (const c of s.cases) {
      lines.push(`- ${c.caseId}: ${c.description} (${c.durationMs} ms, ${c.modelCalls} model calls)`);
      if (c.error) lines.push(`  - ERROR ${c.error}`);
      for (const p of c.properties)
        lines.push(`  - ${p.ok ? "ok" : "FAIL"} ${p.property}${p.detail ? `: ${p.detail}` : ""}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Writes <dir>/evals-<startedAt>.json and .md, creating the directory. */
export function writeReport(report: EvalReport, dir: string): { json: string; markdown: string } {
  mkdirSync(dir, { recursive: true });
  const stem = reportStem(report);
  const json = join(dir, `${stem}.json`);
  const markdown = join(dir, `${stem}.md`);
  writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdown, toMarkdown(report));
  return { json, markdown };
}
