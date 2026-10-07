import { JOB_NAMES } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SCHEDULES } from "./schedules";

describe("SCHEDULES", () => {
  it("matches the 00-overview section 9.3 table", () => {
    expect(SCHEDULES).toEqual([
      { name: "sweep.weekly", cron: "0 14 * * 0", tz: "UTC" },
      { name: "plan.weekly.fanout", cron: "0 11 * * 1", tz: "UTC" },
      { name: "reminders.deadlines", cron: "0 * * * *", tz: "UTC" },
      { name: "digest.weekly", cron: "5 * * * *", tz: "UTC" },
      { name: "catalog.recheck", cron: "0 8 * * *", tz: "UTC" },
      { name: "catalog.recheck.collect", cron: "*/30 * * * *", tz: "UTC" },
      { name: "account.purge", cron: "30 3 * * *", tz: "UTC" },
      { name: "maintenance.purge", cron: "*/10 * * * *", tz: "UTC" },
    ]);
  });

  it("uses known job names, each once", () => {
    const names = SCHEDULES.map((s) => s.name);
    for (const name of names) expect(JOB_NAMES).toContain(name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses five-field UTC cron expressions", () => {
    for (const s of SCHEDULES) {
      const fields = s.cron.split(" ");
      expect(fields).toHaveLength(5);
      for (const field of fields) expect(field).toMatch(/^[\d*/,-]+$/);
      expect(s.tz).toBe("UTC");
    }
  });

  it("fans out weekly plans at a time that is Monday morning in every US zone (R2C-5)", () => {
    expect(SCHEDULES.find((s) => s.name === "plan.weekly.fanout")).toEqual({
      name: "plan.weekly.fanout",
      cron: "0 11 * * 1",
      tz: "UTC",
    });
    const zones = [
      "Pacific/Honolulu",
      "America/Anchorage",
      "America/Los_Angeles",
      "America/Denver",
      "America/Chicago",
      "America/New_York",
      "America/Puerto_Rico",
    ];
    // One Monday in daylight time and one in standard time, both at 11:00 UTC.
    for (const at of ["2026-10-05T11:00:00.000Z", "2027-01-04T11:00:00.000Z"]) {
      for (const timeZone of zones) {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone,
          weekday: "short",
          hour: "numeric",
          hourCycle: "h23",
        }).formatToParts(new Date(at));
        expect(parts.find((p) => p.type === "weekday")?.value, `${timeZone} ${at}`).toBe("Mon");
        expect(Number(parts.find((p) => p.type === "hour")?.value), `${timeZone} ${at}`).toBeLessThan(12);
      }
    }
  });
});
