import type { IsoDate } from "@scholarcrew/domain";

/** External source links accept only parsed HTTP(S) URLs. */
export function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Internal action links stay on the supplied application origin after parsing. */
export function internalHref(href: string, origin: string): string | null {
  if (!/^\/(?![\/\\])[^\s\\]*$/.test(href)) return null;
  try {
    const parsed = new URL(href, origin);
    return parsed.origin === origin ? parsed.pathname + parsed.search + parsed.hash : null;
  } catch {
    return null;
  }
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const WITH_WEEKDAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function utcDate(d: IsoDate): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

/** Whole US dollars: 9200 → "$9,200". */
export function usd(n: number): string {
  return USD.format(Math.round(n));
}

/** Calendar date: "2026-10-15" → "Oct 15". Formatted in UTC so the day never shifts. */
export function dateShort(d: IsoDate): string {
  return SHORT.format(utcDate(d));
}

/** "2026-10-15" → "Thu, Oct 15". */
export function dateWithWeekday(d: IsoDate): string {
  return WITH_WEEKDAY.format(utcDate(d));
}

/** An instant as a short date in a time zone: "Oct 2". */
export function instantShort(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(new Date(iso));
}

/** 9 → "9 days", 1 → "1 day", 0 → "today", -3 → "3 days ago". */
export function daysLabel(n: number): string {
  if (n === 0) return "today";
  const abs = Math.abs(n);
  const unit = abs === 1 ? "day" : "days";
  return n > 0 ? `${abs} ${unit}` : `${abs} ${unit} ago`;
}

/** 135 → "2 h 15 min", 60 → "1 h", 30 → "30 min". */
export function minutesLabel(total: number): string {
  const m = Math.max(0, Math.round(total));
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function addDaysIso(d: IsoDate, days: number): IsoDate {
  const t = utcDate(d);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}
