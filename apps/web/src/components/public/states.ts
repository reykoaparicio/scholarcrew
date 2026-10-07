import { USState } from "@scholarcrew/domain";

/** "tx" or "TX" → "TX"; anything else → null. */
export function stateFromParam(param: string): USState | null {
  const parsed = USState.safeParse(param.trim().toUpperCase());
  return parsed.success ? parsed.data : null;
}

export function stateHref(code: USState): string {
  return `/directory/${code}`;
}
