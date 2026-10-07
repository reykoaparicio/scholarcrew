import type { ServiceLog } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { activityCounter, hoursLabel, logTotals, parseHours, progressView } from "./impact";

const log = (minutes: number, verification: ServiceLog["verification"]) => ({ minutes, verification });

describe("hours", () => {
  it("formats and parses hours", () => {
    expect(hoursLabel(90)).toBe("1.5");
    expect(hoursLabel(240)).toBe("4");
    expect(hoursLabel(20)).toBe("0.3");
    expect(parseHours("2.5")).toBe(150);
    expect(parseHours("0")).toBeNull();
    expect(parseHours("25")).toBeNull();
    expect(parseHours("two")).toBeNull();
  });

  it("totals logged and confirmed hours", () => {
    expect(logTotals([log(240, "verified"), log(150, "requested"), log(90, "declined")])).toBe(
      "8 hours logged · 4 confirmed by supervisors",
    );
    expect(logTotals([])).toBe("0 hours logged · 0 confirmed by supervisors");
  });
});

describe("progressView (IM-03)", () => {
  it("counts only confirmed hours toward the requirement", () => {
    expect(progressView({ requiredHours: 40, verifiedHours: 26, totalHours: 28.5 })).toEqual({
      value: 0.65,
      met: false,
      status: "14 to go",
      detail: "Confirmed 26 · waiting or self-reported 2.5 · still needed 14",
    });
    expect(progressView({ requiredHours: 25, verifiedHours: 26, totalHours: 26 })).toMatchObject({
      value: 1,
      met: true,
      status: "Met",
    });
  });
});

describe("activityCounter (IM-04)", () => {
  it("counts code points against 150 and warns near and over", () => {
    expect(activityCounter("a".repeat(120))).toEqual({ label: "120 / 150", state: "ok", note: null });
    expect(activityCounter("a".repeat(140))).toEqual({ label: "140 / 150", state: "near", note: "10 left" });
    expect(activityCounter("a".repeat(155))).toEqual({ label: "155 / 150", state: "over", note: "5 over" });
    expect(activityCounter("👋".repeat(150)).label).toBe("150 / 150");
  });
});
