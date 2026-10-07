import { describe, expect, it } from "vitest";
import { TIME_ZONES, greeting, localHour } from "./time";

describe("greeting", () => {
  it("uses the hour in the student's time zone", () => {
    expect(localHour(new Date("2026-10-06T15:00:00.000Z"), "America/Chicago")).toBe(10);
    expect(greeting(new Date("2026-10-06T15:00:00.000Z"), "America/Chicago")).toBe("Good morning");
    expect(greeting(new Date("2026-10-06T20:00:00.000Z"), "America/Chicago")).toBe("Good afternoon");
    expect(greeting(new Date("2026-10-07T01:00:00.000Z"), "America/Chicago")).toBe("Good evening");
    expect(greeting(new Date("2026-10-06T15:00:00.000Z"), "America/Los_Angeles")).toBe("Good morning");
    expect(greeting(new Date("2026-10-06T22:30:00.000Z"), "America/New_York")).toBe("Good evening");
  });

  it("treats the small hours as evening and survives a bad zone", () => {
    expect(greeting(new Date("2026-10-06T08:00:00.000Z"), "America/Chicago")).toBe("Good evening");
    expect(greeting(new Date("2026-10-06T20:00:00.000Z"), "Mars/Olympus")).toBe("Good afternoon");
  });

  it("lists US time zones with Central first", () => {
    expect(TIME_ZONES[0]).toEqual({ value: "America/Chicago", label: "Central" });
    expect(TIME_ZONES.map((z) => z.value)).toContain("Pacific/Honolulu");
  });
});
