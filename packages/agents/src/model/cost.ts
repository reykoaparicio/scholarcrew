import type { ModelUsage } from "./types";

/** Micro-dollars per token for claude-opus-5-5. */
export const PRICE_MICROS = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 } as const;

export function costMicros(u: Omit<ModelUsage, "costMicros">): number {
  return Math.round(
    u.inputTokens * PRICE_MICROS.input +
      u.outputTokens * PRICE_MICROS.output +
      u.cacheReadTokens * PRICE_MICROS.cacheRead +
      u.cacheWriteTokens * PRICE_MICROS.cacheWrite,
  );
}
