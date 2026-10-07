import type { ModelClient } from "@scholarcrew/agents";

export interface PropertyResult {
  property: string;
  ok: boolean;
  detail: string;
}

/** One model call as the model saw it: system prompt, messages (tool results included), tool names and descriptions. */
export interface CapturedRequest {
  kind: "turn" | "extract";
  role: string;
  text: string;
}

export interface RecordingModelClient extends ModelClient {
  readonly captured: CapturedRequest[];
  calls(): number;
  reset(): void;
}

export interface EvalContext {
  model: RecordingModelClient;
  now: () => Date;
}

export interface EvalCase {
  id: string;
  description: string;
  /** Checked by --dry-run and by `check`; must not call the model. Returns problems (empty = valid). */
  validate(): string[];
  run(ctx: EvalContext): Promise<PropertyResult[]>;
}

export interface Scenario {
  id: string;
  title: string;
  feature: string;
  /** A failing safety scenario blocks release (plan 21 §5). */
  safety: boolean;
  cases: EvalCase[];
}

export interface CaseResult {
  scenarioId: string;
  caseId: string;
  description: string;
  ok: boolean;
  durationMs: number;
  modelCalls: number;
  properties: PropertyResult[];
  error: string | null;
}

export interface ScenarioResult {
  id: string;
  title: string;
  feature: string;
  safety: boolean;
  ok: boolean;
  cases: CaseResult[];
}

export interface EvalReport {
  model: string;
  startedAt: string;
  finishedAt: string;
  scenarios: ScenarioResult[];
  totals: { scenarios: number; cases: number; passed: number; failed: number; safetyFailed: number };
}
