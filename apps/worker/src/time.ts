import { safeTimeZone } from "@scholarcrew/core/shared";
export { safeTimeZone } from "@scholarcrew/core/shared";
export const DEFAULT_TIME_ZONE = "America/Chicago";

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Local weekday (0 = Sunday, matching notificationPrefs.digestDay) and hour (0–23). */
export function localWeekdayHour(now: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = WEEKDAYS[parts.find((p) => p.type === "weekday")?.value ?? ""] ?? 0;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return { weekday, hour };
}
