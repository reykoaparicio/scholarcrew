import { describe, expect, it } from "vitest";
import { daysUntil, isWarning, reminderOffsetsDue, weekStartFor } from "./dates";

const TZ = "America/Chicago";
const now = new Date("2026-10-06T15:00:00.000Z"); // Tue Oct 6, 10:00 in Chicago

describe("weekStartFor", () => {
  it("returns the Monday of the local week", () => {
    expect(weekStartFor(now, TZ)).toBe("2026-10-05");
  });

  it("switches weeks at local midnight on Monday", () => {
    expect(weekStartFor(new Date("2026-10-05T05:00:00.000Z"), TZ)).toBe("2026-10-05"); // Mon 00:00 CDT
    expect(weekStartFor(new Date("2026-10-05T04:59:00.000Z"), TZ)).toBe("2026-09-28"); // Sun 23:59 CDT
  });

  it("uses the local date when UTC is already the next day", () => {
    expect(weekStartFor(new Date("2026-10-12T03:00:00.000Z"), TZ)).toBe("2026-10-05"); // Sun Oct 11, 22:00 local
  });

  it("follows the given time zone", () => {
    const instant = new Date("2026-10-12T03:00:00.000Z");
    expect(weekStartFor(instant, "UTC")).toBe("2026-10-12");
    expect(weekStartFor(instant, "Asia/Tokyo")).toBe("2026-10-12");
  });
});

describe("daysUntil", () => {
  it("matches the Coming up card", () => {
    expect(daysUntil("2026-10-15", now, TZ)).toBe(9);
    expect(daysUntil("2026-10-30", now, TZ)).toBe(24);
    expect(daysUntil("2026-11-01", now, TZ)).toBe(26);
    expect(daysUntil("2026-11-15", now, TZ)).toBe(40);
  });

  it("counts from the local date, not the UTC date", () => {
    const lateEvening = new Date("2026-10-07T03:00:00.000Z"); // Tue Oct 6, 22:00 in Chicago
    expect(daysUntil("2026-10-15", lateEvening, TZ)).toBe(9);
    expect(daysUntil("2026-10-15", lateEvening, "UTC")).toBe(8);
  });

  it("returns 0 for today and negative numbers for past dates", () => {
    expect(daysUntil("2026-10-06", now, TZ)).toBe(0);
    expect(daysUntil("2026-10-01", now, TZ)).toBe(-5);
  });

  it("returns whole days across a DST change", () => {
    expect(daysUntil("2026-03-09", new Date("2026-03-07T18:00:00.000Z"), TZ)).toBe(2);
  });
});

describe("reminderOffsetsDue", () => {
  it("returns the offset due today", () => {
    expect(reminderOffsetsDue("2026-10-13", now, TZ)).toEqual([7]);
    expect(reminderOffsetsDue("2026-10-09", now, TZ)).toEqual([3]);
    expect(reminderOffsetsDue("2026-10-07", now, TZ)).toEqual([1]);
  });

  it("returns nothing on other days", () => {
    expect(reminderOffsetsDue("2026-10-15", now, TZ)).toEqual([]);
    expect(reminderOffsetsDue("2026-10-06", now, TZ)).toEqual([]);
    expect(reminderOffsetsDue("2026-10-01", now, TZ)).toEqual([]);
  });
});

describe("isWarning", () => {
  it("warns from 0 to 14 days inclusive", () => {
    expect(isWarning(0)).toBe(true);
    expect(isWarning(9)).toBe(true);
    expect(isWarning(14)).toBe(true);
    expect(isWarning(15)).toBe(false);
    expect(isWarning(-1)).toBe(false);
  });
});

describe("invalid input", () => {
  it("throws RangeError for an unknown time zone or a malformed date", () => {
    expect(() => weekStartFor(now, "Not/AZone")).toThrow(RangeError);
    expect(() => daysUntil("10/15/2026", now, TZ)).toThrow(RangeError);
  });

  it("throws RangeError for a well-formed date that doesn't exist", () => {
    expect(() => daysUntil("2026-02-30", now, TZ)).toThrow(RangeError);
  });
});
