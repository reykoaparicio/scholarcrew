import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  dateShort,
  dateWithWeekday,
  daysLabel,
  instantShort,
  internalHref,
  minutesLabel,
  plural,
  safeHref,
  usd,
} from "./format";

describe("safe links", () => {
  it("keeps source links HTTP(S) and action links on the app origin", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/plain,x")).toBeNull();
    expect(safeHref("https://source.test/a")).toBe("https://source.test/a");
    expect(internalHref("/\\evil.example", "https://app.test")).toBeNull();
    expect(internalHref("//evil.example", "https://app.test")).toBeNull();
    expect(internalHref("/week?x=1", "https://app.test")).toBe("/week?x=1");
  });
});

describe("usd", () => {
  it("formats whole dollars", () => {
    expect(usd(9200)).toBe("$9,200");
    expect(usd(0)).toBe("$0");
    expect(usd(1000.4)).toBe("$1,000");
    expect(usd(1_250_000)).toBe("$1,250,000");
  });
});

describe("dates", () => {
  it("formats calendar dates without shifting the day", () => {
    expect(dateShort("2026-10-15")).toBe("Oct 15");
    expect(dateShort("2027-01-01")).toBe("Jan 1");
    expect(dateWithWeekday("2026-10-15")).toBe("Thu, Oct 15");
  });

  it("formats instants in a time zone", () => {
    expect(instantShort("2026-10-02T03:00:00.000Z", "America/Chicago")).toBe("Oct 1");
    expect(instantShort("2026-10-02T03:00:00.000Z", "UTC")).toBe("Oct 2");
  });

  it("adds days across month ends", () => {
    expect(addDaysIso("2026-10-26", 7)).toBe("2026-11-02");
    expect(addDaysIso("2026-10-05", -1)).toBe("2026-10-04");
  });
});

describe("daysLabel", () => {
  it("reads like the mockups", () => {
    expect(daysLabel(9)).toBe("9 days");
    expect(daysLabel(1)).toBe("1 day");
    expect(daysLabel(0)).toBe("today");
    expect(daysLabel(-1)).toBe("1 day ago");
    expect(daysLabel(-3)).toBe("3 days ago");
  });
});

describe("minutesLabel and plural", () => {
  it("formats durations", () => {
    expect(minutesLabel(30)).toBe("30 min");
    expect(minutesLabel(0)).toBe("0 min");
    expect(minutesLabel(60)).toBe("1 h");
    expect(minutesLabel(135)).toBe("2 h 15 min");
  });

  it("pluralizes", () => {
    expect(plural(1, "thing")).toBe("1 thing");
    expect(plural(4, "thing")).toBe("4 things");
    expect(plural(2, "story", "stories")).toBe("2 stories");
  });
});
