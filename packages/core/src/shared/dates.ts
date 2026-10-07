import { type IsoDate, type IsoDateTime, awardYearFor } from "@scholarcrew/domain";

const DAY_MS = 86_400_000;
const pad2 = (n: number): string => String(n).padStart(2, "0");

export function toIso(d: Date): IsoDateTime {
  return d.toISOString();
}

export function toIsoOrNull(d: Date | null): IsoDateTime | null {
  return d ? d.toISOString() : null;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

/**
 * FAFSA award year. Aug 1 rollover (UTC): the award year of the current season (R3V-7), so the
 * checklist year and the college-list season never disagree. 2026-08-15 → "2027-28".
 */
export function currentAwardYear(now: Date): string {
  return awardYearFor(currentSeason(now));
}

/** Admissions season. Rolls over on August 1 (UTC): 2026-10-06 → "2026-27". */
export function currentSeason(now: Date): string {
  const year = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 7 ? year : year - 1;
  return `${start}-${pad2((start + 1) % 100)}`;
}

export function seasonStartYear(season: string): number {
  return Number.parseInt(season.slice(0, 4), 10);
}

/** Usage month in UTC, "YYYY-MM". */
export function nextMonthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
export function safeTimeZone(timeZone: string): string {
  return isValidTimeZone(timeZone) ? timeZone : "UTC";
}

export function monthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
}

/** Wall-clock hour, minute, and second of `d` in `timeZone` (hour is 0–23). */
export function localTimeParts(d: Date, timeZone: string): { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { hour: pick("hour"), minute: pick("minute"), second: pick("second") };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date of `now` in `timeZone`, "YYYY-MM-DD". The one core copy (R3V-9); 07, 08, and 12 import it. */
export function todayIn(now: Date, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const CALENDAR_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A calendar date in messages, like 16 `dateShort`: "2026-10-15" → "Oct 15". Formatted in UTC so the day never shifts (R3E-8). */
export function calendarShort(d: IsoDate): string {
  return CALENDAR_SHORT.format(new Date(`${d}T00:00:00.000Z`));
}

/**
 * An instant in messages, in the reader's zone with the zone named (R3E-8):
 * "Oct 20, 2026, 8:00 PM CDT". The narrow no-break space newer ICU puts before AM/PM becomes a
 * plain space, so the text is the same on every Node version.
 */
export function instantInZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  })
    .format(d)
    .replace(/\u202f/g, " ");
}
