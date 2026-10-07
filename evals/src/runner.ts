import type { CaseResult, EvalContext, EvalReport, PropertyResult, Scenario, ScenarioResult } from "./types";

export function caseCount(scenarios: Scenario[]): number {
  return scenarios.reduce((n, s) => n + s.cases.length, 0);
}

/** Dry-run checks: unique ids, at least one case, and every case's own fixture validation. Never calls a model. */
export function validateScenarios(scenarios: Scenario[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const s of scenarios) {
    const caseIds = new Set<string>();
    for (const c of s.cases) {
      for (const p of c.validate()) problems.push(`${s.id}/${c.id}: ${p}`);
      if (caseIds.has(c.id)) problems.push(`${s.id}/${c.id} is a duplicate case id`);
      caseIds.add(c.id);
    }
    if (ids.has(s.id)) problems.push(`duplicate scenario id ${s.id}`);
    ids.add(s.id);
    if (s.cases.length === 0) problems.push(`${s.id} has no cases`);
  }
  return problems;
}

export interface RunOptions {
  model: string;
  /** "scenario" or "scenario/case". */
  only?: string;
  now?: () => Date;
  log?: (line: string) => void;
}

function selected(only: string | undefined, scenarioId: string, caseId: string): boolean {
  if (!only) return true;
  return only === scenarioId || only === `${scenarioId}/${caseId}`;
}

export function failureSummary(c: CaseResult): string {
  if (c.error) return `error: ${c.error}`;
  const bad = c.properties.filter((p) => !p.ok);
  if (c.properties.length === 0) return "no properties checked";
  return bad.map((p) => `${p.property}: ${p.detail}`).join("; ");
}

/** Runs cases one at a time, each with a fresh context. A case passes only if it checked something and every check held. */
export async function runScenarios(
  scenarios: Scenario[],
  makeContext: () => EvalContext,
  o: RunOptions,
): Promise<EvalReport> {
  const clock = o.now ?? (() => new Date());
  const startedAt = clock().toISOString();
  const results: ScenarioResult[] = [];
  for (const s of scenarios) {
    const cases: CaseResult[] = [];
    for (const c of s.cases) {
      if (!selected(o.only, s.id, c.id)) continue;
      const ctx = makeContext();
      const started = Date.now();
      let properties: PropertyResult[] = [];
      let error: string | null = null;
      try {
        properties = await c.run(ctx);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      const ok = error === null && properties.length > 0 && properties.every((p) => p.ok);
      const result: CaseResult = {
        scenarioId: s.id,
        caseId: c.id,
        description: c.description,
        ok,
        durationMs: Date.now() - started,
        modelCalls: ctx.model.calls(),
        properties,
        error,
      };
      o.log?.(ok ? `PASS ${s.id}/${c.id}` : `FAIL ${s.id}/${c.id} (${failureSummary(result)})`);
      cases.push(result);
    }
    if (cases.length > 0) {
      results.push({
        id: s.id,
        title: s.title,
        feature: s.feature,
        safety: s.safety,
        ok: cases.every((c) => c.ok),
        cases,
      });
    }
  }
  const all = results.flatMap((r) => r.cases);
  const failed = all.filter((c) => !c.ok).length;
  const safetyFailed = results
    .filter((r) => r.safety)
    .flatMap((r) => r.cases)
    .filter((c) => !c.ok).length;
  return {
    model: o.model,
    startedAt,
    finishedAt: clock().toISOString(),
    scenarios: results,
    totals: { scenarios: results.length, cases: all.length, passed: all.length - failed, failed, safetyFailed },
  };
}

/** Non-zero when any case failed, or when nothing ran (a bad --only). */
export function exitCodeFor(report: EvalReport): number {
  return report.totals.failed > 0 || report.totals.cases === 0 ? 1 : 0;
}
