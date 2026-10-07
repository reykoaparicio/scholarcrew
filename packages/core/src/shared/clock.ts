import type { Clock } from "./types";

export function systemClock(): Clock {
  return { now: () => new Date() };
}

/** A clock that stays at `iso` until `set` moves it. */
export function fixedClock(iso: string): Clock & { set(iso: string): void } {
  let current = new Date(iso).getTime();
  return {
    now: () => new Date(current),
    set(next: string) {
      current = new Date(next).getTime();
    },
  };
}
