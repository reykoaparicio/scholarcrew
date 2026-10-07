import { EligibilityRule, type ScholarshipSummary, localLabel } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import {
  amountLabel,
  daysFrom,
  deadlineLabel,
  describeRule,
  filterHref,
  listingCheck,
  readFilters,
  toQuery,
  todayIso,
} from "./listings";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const checked = (o: Partial<Pick<ScholarshipSummary, "status" | "verifiedAt" | "unverified">>) =>
  listingCheck({ status: "published", verifiedAt: "2026-10-02T12:00:00.000Z", unverified: false, ...o }, NOW);

describe("dates", () => {
  it("uses the Central calendar day", () => {
    expect(todayIso(NOW)).toBe("2026-10-06");
    expect(todayIso(new Date("2026-10-07T03:00:00.000Z"))).toBe("2026-10-06");
    expect(daysFrom("2026-10-06", "2026-10-15")).toBe(9);
    expect(daysFrom("2026-10-06", "2026-10-01")).toBe(-5);
  });
});

describe("listingCheck", () => {
  it("labels verified, stale, and unverified listings", () => {
    expect(checked({})).toEqual({ tone: "good", icon: "check", label: "Verified Oct 2", detail: null });
    expect(checked({ verifiedAt: "2026-08-01T12:00:00.000Z" })).toEqual({
      tone: "warn",
      icon: "clock",
      label: "Stale",
      detail: "Last checked Aug 1",
    });
    expect(checked({ status: "stale" }).label).toBe("Stale");
    expect(checked({ unverified: true }).label).toBe("Unverified");
    expect(checked({ verifiedAt: null })).toMatchObject({ tone: "neutral", icon: "info", label: "Unverified" });
  });
});

describe("amount, deadline, and area labels", () => {
  it("formats amounts", () => {
    expect(amountLabel({ amountMinUsd: 1000, amountMaxUsd: 1000 })).toBe("$1,000");
    expect(amountLabel({ amountMinUsd: 500, amountMaxUsd: 2500 })).toBe("$500–$2,500");
    expect(amountLabel({ amountMinUsd: 0, amountMaxUsd: 1500 })).toBe("$1,500");
  });

  it("formats deadlines with days left", () => {
    expect(deadlineLabel(null, NOW)).toEqual({ main: "Not posted", sub: "Check the sponsor's page" });
    expect(deadlineLabel("2026-10-15", NOW)).toEqual({ main: "Oct 15", sub: "9 days left" });
    expect(deadlineLabel("2026-10-07", NOW)).toEqual({ main: "Oct 7", sub: "1 day left" });
    expect(deadlineLabel("2026-10-06", NOW)).toEqual({ main: "Oct 6", sub: "Due today" });
    expect(deadlineLabel("2026-09-01", NOW)).toEqual({ main: "Sep 1", sub: "Closed" });
  });

  it("names the area with the domain's localLabel (D41)", () => {
    expect(localLabel({ national: true, state: null, counties: [], cities: [] })).toBe("National");
    expect(localLabel({ national: false, state: "TX", counties: [], cities: [] })).toBe("Texas");
    expect(localLabel({ national: false, state: "TX", counties: ["Maple County"], cities: [] })).toBe(
      "Maple County, TX",
    );
    expect(localLabel({ national: false, state: "TX", counties: [], cities: ["Cedar Park"] })).toBe("Cedar Park, TX");
  });
});

describe("describeRule", () => {
  it("describes every rule type in plain words", () => {
    const rules: EligibilityRule[] = [
      { type: "state_in", states: ["TX", "OK"] },
      { type: "county_in", state: "TX", counties: ["Maple"] },
      { type: "city_in", state: "TX", cities: ["Cedar Park"] },
      { type: "class_year_in", years: [2027, 2028] },
      { type: "gpa_min", min: 3 },
      { type: "major_any", majors: ["Engineering", "Nursing"] },
      { type: "interest_any", interests: ["robotics"] },
      { type: "first_gen" },
      { type: "income_max", maxRange: "48_75k" },
      { type: "heritage_any", values: ["Hispanic or Latino"] },
      { type: "disability" },
      { type: "religion_any", values: ["Catholic"] },
      { type: "military_family" },
      { type: "foster_care" },
      { type: "citizenship_required" },
      { type: "test_min", test: "SAT", min: 1200 },
      { type: "service_hours_min", hours: 40 },
      { type: "custom", text: "Child of a co-op member" },
    ];
    for (const rule of rules) {
      expect(EligibilityRule.safeParse(rule).success).toBe(true);
      expect(describeRule(rule).length).toBeGreaterThan(3);
    }
    expect(rules.map(describeRule).slice(0, 6)).toEqual([
      "Lives in Texas or Oklahoma",
      "Lives in Maple County, TX",
      "Lives in Cedar Park, TX",
      "Class of 2027 or 2028",
      "GPA 3 or higher",
      "Plans to study Engineering or Nursing",
    ]);
    expect(describeRule({ type: "income_max", maxRange: "48_75k" })).toBe("Household income up to $75,000");
    expect(describeRule({ type: "test_min", test: "SAT", min: 1200 })).toBe("SAT 1200 or higher");
    expect(describeRule({ type: "custom", text: "Child of a co-op member" })).toBe("Child of a co-op member");
  });
});

describe("filters", () => {
  it("reads search params into a ScholarshipQuery", () => {
    const f = readFilters({ q: " maple ", minUsd: "1000", within: "90", renewable: "true", page: "2" });
    expect(f).toEqual({ q: "maple", minUsd: 1000, within: 90, renewable: true, page: 2 });
    expect(toQuery(f, NOW, "TX")).toEqual({
      page: 2,
      pageSize: 20,
      openOn: "2026-10-06",
      q: "maple",
      state: "TX",
      minUsd: 1000,
      renewable: true,
      deadlineBefore: "2027-01-04",
    });
  });

  it("ignores values that aren't offered and always asks for listings still open today (F-18-3)", () => {
    const f = readFilters({ minUsd: "7", within: ["5"], page: "-1", renewable: "yes" });
    expect(f).toEqual({ q: "", minUsd: null, within: null, renewable: false, page: 1 });
    expect(toQuery(f, NOW)).toEqual({ page: 1, pageSize: 20, openOn: "2026-10-06" });
    expect(toQuery(f, new Date("2026-10-07T03:00:00.000Z")).openOn).toBe("2026-10-06");
  });

  it("builds filter links that reset the page", () => {
    const f = readFilters({ q: "maple", within: "90", page: "3" });
    expect(filterHref("/directory/TX", f, { minUsd: 5000 })).toBe("/directory/TX?q=maple&minUsd=5000&within=90");
    expect(filterHref("/directory/TX", f, { page: 4 })).toBe("/directory/TX?q=maple&within=90&page=4");
    expect(filterHref("/directory", readFilters({}), {})).toBe("/directory");
  });
});
