import type { IsoDate } from "@scholarcrew/domain";

const LONG = { month: "short", day: "numeric", year: "numeric" } as const;

/** "2026-11-01" → "Nov 1, 2026", never shifted by time zone. */
export function calendarLong(d: IsoDate): string {
  return new Intl.DateTimeFormat("en-US", { ...LONG, timeZone: "UTC" }).format(new Date(`${d}T00:00:00.000Z`));
}

/** An instant as "Nov 5, 2026" on the Central calendar. */
export function instantLong(iso: string, timeZone = "America/Chicago"): string {
  return new Intl.DateTimeFormat("en-US", { ...LONG, timeZone }).format(new Date(iso));
}
