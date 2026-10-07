import type { IsoDate } from "@scholarcrew/domain";

const DAY_MS = 86_400_000;
const REMINDER_OFFSETS = [7, 3, 1] as const;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** UTC-midnight timestamp of the calendar date `now` falls on in `timeZone`. */
export function localDayMs(now: Date, timeZone: string): number {
  let year = 0;
  let month = 0;
  let day = 0;
  for (const part of formatterFor(timeZone).formatToParts(now)) {
    if (part.type === "year") year = Number(part.value);
    if (part.type === "month") month = Number(part.value);
    if (part.type === "day") day = Number(part.value);
  }
  return Date.UTC(year, month - 1, day);
}

/** UTC-midnight timestamp of an IsoDate. Throws RangeError for anything but a real YYYY-MM-DD date. */
export function isoDateMs(date: IsoDate): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`Invalid IsoDate: ${date}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Date.UTC rolls "2026-02-30" over to March 2; a round trip catches that.
  if (msToIsoDate(ms) !== date) throw new RangeError(`Invalid IsoDate: ${date}`);
  return ms;
}

export function msToIsoDate(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Monday of the student's local week. */
export function weekStartFor(now: Date, timeZone: string): IsoDate {
  const today = localDayMs(now, timeZone);
  const dayOfWeek = new Date(today).getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return msToIsoDate(today - daysSinceMonday * DAY_MS);
}

/** Calendar days from the local today to `due`. Negative when past. */
export function daysUntil(due: IsoDate, now: Date, timeZone: string): number {
  return Math.round((isoDateMs(due) - localDayMs(now, timeZone)) / DAY_MS);
}

/** Which of the 7/3/1-day reminders fall on the local today. */
export function reminderOffsetsDue(due: IsoDate, now: Date, timeZone: string): Array<7 | 3 | 1> {
  const left = daysUntil(due, now, timeZone);
  return REMINDER_OFFSETS.filter((offset) => offset === left);
}

/** Due today through 14 days out gets a warning badge. */
export function isWarning(daysLeft: number): boolean {
  return daysLeft >= 0 && daysLeft <= 14;
}
