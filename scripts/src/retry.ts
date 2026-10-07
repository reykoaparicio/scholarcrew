export interface WaitOptions {
  attempts: number;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
}

export type WaitResult = { ok: true; attempts: number } | { ok: false; attempts: number; lastError: string };

/** Node reports a refused dual-stack connect as an AggregateError with an empty message. */
export function errorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  if (error.message !== "") {
    return error.message;
  }
  const code = "code" in error ? error.code : undefined;
  return typeof code === "string" ? code : error.name;
}

/** Calls probe until it resolves. Sleeps delayMs between attempts, never after the last one. */
export async function waitUntilReady(probe: () => Promise<void>, opts: WaitOptions): Promise<WaitResult> {
  let lastError = "no attempts made";
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      await probe();
      return { ok: true, attempts: attempt };
    } catch (error) {
      lastError = errorText(error);
    }
    if (attempt < opts.attempts) {
      await opts.sleep(opts.delayMs);
    }
  }
  return { ok: false, attempts: opts.attempts, lastError };
}
