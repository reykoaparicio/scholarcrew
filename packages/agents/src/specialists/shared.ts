import type { CrewRole } from "@scholarcrew/domain";
import type { AgentDeps } from "../context";
import type { ModelTurn } from "../model/types";

/** AgentDeps without consult: a specialist can't call another specialist (AG-02). */
export type SpecialistDeps = Omit<AgentDeps, "consult">;
export type Audience = "crew" | "family";

export const SPECIALIST_MAX_TOKENS = 16_000;

export async function reportProgress(deps: SpecialistDeps, role: CrewRole, text: string): Promise<void> {
  await deps.onProgress?.({ at: deps.now().toISOString(), role, text });
}

/** AG-06: one onUsage call per model turn, awaited together before the run returns. A rejected write is logged, never rethrown. */
export function usageReporter(deps: SpecialistDeps, role: string) {
  const pending: Promise<void>[] = [];
  return {
    onTurn: (t: ModelTurn): void => {
      if (!deps.onUsage) return;
      // Attach the handler now so a failed write can't become an unhandled rejection or fail a good result.
      pending.push(
        deps.onUsage(role, t).catch((e: unknown) => {
          console.log(JSON.stringify({ level: "error", msg: "agents.usage_failed", role, error: String(e) }));
        }),
      );
    },
    flush: async (): Promise<void> => {
      await Promise.all(pending);
    },
  };
}

/** Reports one usage turn outside a loop (offer parse); logs instead of rethrowing. */
export async function reportUsageOnce(deps: SpecialistDeps, role: string, t: ModelTurn): Promise<void> {
  try {
    await deps.onUsage?.(role, t);
  } catch (e) {
    console.log(JSON.stringify({ level: "error", msg: "agents.usage_failed", role, error: String(e) }));
  }
}

const DOLLARS = /\$\s?(\d[\d,]*(?:\.\d+)?)\s?([kK]\b)?/g;

/** Every dollar figure written in the text, as whole dollars ("$16k" is 16000). Product rule 4: code checks the model's money. */
export function dollarAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(DOLLARS)) {
    const value = Number.parseFloat((m[1] ?? "0").replace(/,/g, ""));
    out.push(Math.round(m[2] ? value * 1000 : value));
  }
  return out;
}

/** Calc ids for specialist tools: "calc:<prefix>-<n>", never colliding with Compass's "calc:<n>". */
export function calcRegistry(prefix: string): (toolName: string) => string {
  let n = 0;
  return () => {
    n += 1;
    return `calc:${prefix}-${n}`;
  };
}
