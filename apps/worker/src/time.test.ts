import { describe, expect, it } from "vitest";
import { DEFAULT_TIME_ZONE, localWeekdayHour, safeTimeZone } from "./time";

// todayIn comes from @scholarcrew/core/shared (R3V-9); 06 tests it.
describe("time helpers", () => {
  it("reads the local weekday (0 = Sunday) and hour", () => {
    expect(localWeekdayHour(new Date("2026-10-06T15:00:00.000Z"), "America/Chicago")).toEqual({ weekday: 2, hour: 10 });
    expect(localWeekdayHour(new Date("2026-10-11T21:00:00.000Z"), "America/Chicago")).toEqual({ weekday: 0, hour: 16 });
    expect(localWeekdayHour(new Date("2026-10-12T04:30:00.000Z"), "UTC")).toEqual({ weekday: 1, hour: 4 });
  });

  it("falls back to the default zone for unknown zones", () => {
    expect(safeTimeZone("America/New_York")).toBe("America/New_York");
    expect(safeTimeZone("Mars/Olympus_Mons")).toBe("UTC");
    expect(localWeekdayHour(new Date("2026-10-06T15:00:00.000Z"), "Mars/Olympus_Mons")).toEqual({
      weekday: 2,
      hour: 15,
    });
  });
});
