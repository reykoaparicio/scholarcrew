export const DEFAULT_TIME_ZONE = "America/Chicago";

export const TIME_ZONES: Array<{ value: string; label: string }> = [
  { value: "America/Chicago", label: "Central" },
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Puerto_Rico", label: "Atlantic (Puerto Rico)" },
];

/** 0..23 in the given zone. Throws RangeError on an unknown zone. */
export function localHour(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return hour === 24 ? 0 : hour;
}

/** "Good morning" before noon, "Good afternoon" until 5 p.m., otherwise (and before 5 a.m.) "Good evening". */
export function greeting(now: Date, timeZone: string): string {
  let hour: number;
  try {
    hour = localHour(now, timeZone);
  } catch {
    hour = localHour(now, DEFAULT_TIME_ZONE);
  }
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function timeZoneLabel(value: string): string {
  return TIME_ZONES.find((z) => z.value === value)?.label ?? value;
}
