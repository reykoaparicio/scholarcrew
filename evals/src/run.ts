import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_ID, createModelClient } from "@scholarcrew/agents";
import { EVAL_NOW } from "./fixtures";
import { createRecordingModelClient } from "./recording";
import { writeReport } from "./report";
import { caseCount, exitCodeFor, runScenarios, validateScenarios } from "./runner";
import { SCENARIOS } from "./scenarios";

const REPORTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "reports");

/** pnpm evals [--dry-run] [--only <scenario>|<scenario/case>] */
async function main(argv: string[]): Promise<number> {
  const dryRun = argv.includes("--dry-run");
  const onlyAt = argv.indexOf("--only");
  const only = onlyAt >= 0 ? argv[onlyAt + 1] : undefined;

  const problems = validateScenarios(SCENARIOS);
  if (problems.length > 0) {
    for (const p of problems) console.error(`invalid scenario: ${p}`);
    return 2;
  }
  const cases = caseCount(SCENARIOS);
  if (dryRun) {
    console.log(`Dry run: ${SCENARIOS.length} scenarios and ${cases} cases are valid. No model calls made.`);
    return 0;
  }
  // Gap G10: the CLI reads the key itself (it's not a web or worker deps.ts).
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY is not set. Evals call the real model; use --dry-run to validate the scenarios only.",
    );
    return 2;
  }
  const real = createModelClient({ apiKey });
  console.log(`Running ${only ? `"${only}"` : `${cases} cases`} against ${MODEL_ID}.`);
  const report = await runScenarios(
    SCENARIOS,
    () => ({ model: createRecordingModelClient(real), now: () => EVAL_NOW }),
    { model: MODEL_ID, only, log: (line) => console.log(line) },
  );
  const paths = writeReport(report, REPORTS_DIR);
  const t = report.totals;
  console.log(`${t.passed} of ${t.cases} cases passed, ${t.safetyFailed} safety failures. Report: ${paths.markdown}`);
  return exitCodeFor(report);
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
    process.exitCode = 1;
  },
);
