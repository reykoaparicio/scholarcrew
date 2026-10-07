import { type EligibilityRule, type LocalArea, NO_SENSITIVE, SENSITIVE_RULE_TYPES } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { type MatcherProfile, evaluateEligibility } from "./eligibility";

const jordan: MatcherProfile = {
  state: "TX",
  county: "Maple",
  city: "Eastside",
  classYear: 2027,
  gpa: 3.72,
  intendedMajors: ["Mechanical engineering"],
  interests: ["robotics"],
  act: 28,
  sat: null,
  serviceHours: 42,
  sensitive: NO_SENSITIVE,
};

const NATIONAL: LocalArea = { national: true, state: null, counties: [], cities: [] };

function run(rules: EligibilityRule[], area: LocalArea = NATIONAL, p: Partial<MatcherProfile> = {}) {
  return evaluateEligibility(rules, area, { ...jordan, ...p });
}

describe("evaluateEligibility: Rotary Club of Eastside", () => {
  it("gives three reasons and one unknown", () => {
    const result = run(
      [
        { type: "county_in", state: "TX", counties: ["Maple"] },
        { type: "class_year_in", years: [2027] },
        { type: "gpa_min", min: 3.0 },
        { type: "custom", text: "Not related to a Rotary Club of Eastside member" },
      ],
      { national: false, state: "TX", counties: ["Maple"], cities: [] },
    );
    expect(result).toEqual({
      eligible: true,
      reasons: [
        { code: "local_county", text: "You live in Maple County", sensitive: false },
        { code: "class_year_in", text: "Class of 2027", sensitive: false },
        { code: "gpa_min", text: "Your GPA 3.72 meets the 3.0 minimum", sensitive: false },
      ],
      unknowns: ["Not related to a Rotary Club of Eastside member"],
    });
  });
});

describe("evaluateEligibility: local area", () => {
  it("passes national listings with no location reason", () => {
    expect(run([])).toEqual({ eligible: true, reasons: [], unknowns: [] });
  });

  it("requires the state to match", () => {
    expect(run([], { national: false, state: "OK", counties: [], cities: [] }).eligible).toBe(false);
    expect(run([], { national: false, state: "TX", counties: [], cities: [] }).reasons).toEqual([
      { code: "local_state", text: "You live in TX", sensitive: false },
    ]);
  });

  it("matches counties case-insensitively, with or without the word County", () => {
    const area = (counties: string[]): LocalArea => ({ national: false, state: "TX", counties, cities: [] });
    expect(run([], area(["maple county"])).eligible).toBe(true);
    expect(run([], area(["MAPLE"]), { county: "Maple County" }).reasons[0]?.text).toBe("You live in Maple County");
    expect(run([], area(["Travis"])).eligible).toBe(false);
  });

  it("matches cities case-insensitively and fails when the profile has no city", () => {
    const area: LocalArea = { national: false, state: "TX", counties: ["Maple"], cities: ["eastside"] };
    expect(run([], area).reasons).toEqual([{ code: "local_city", text: "You live in Eastside", sensitive: false }]);
    expect(run([], area, { city: "" }).eligible).toBe(false);
  });
});

describe("evaluateEligibility: profile rules", () => {
  it("checks state, county, and city rules", () => {
    expect(run([{ type: "state_in", states: ["TX", "OK"] }]).reasons[0]?.text).toBe("You live in TX");
    expect(run([{ type: "state_in", states: ["OK"] }]).eligible).toBe(false);
    expect(run([{ type: "county_in", state: "TX", counties: ["Maple"] }]).reasons[0]?.code).toBe("county_in");
    expect(run([{ type: "county_in", state: "OK", counties: ["Maple"] }]).eligible).toBe(false);
    expect(run([{ type: "city_in", state: "TX", cities: ["EASTSIDE"] }]).reasons[0]?.text).toBe("You live in Eastside");
    expect(run([{ type: "city_in", state: "TX", cities: ["Austin"] }]).eligible).toBe(false);
  });

  it("checks class year and reports a missing one as unknown", () => {
    expect(run([{ type: "class_year_in", years: [2028] }]).eligible).toBe(false);
    expect(run([{ type: "class_year_in", years: [2027] }], NATIONAL, { classYear: null })).toEqual({
      eligible: true,
      reasons: [],
      unknowns: ["Class year not on file"],
    });
  });

  it("checks GPA minimums and reports a missing GPA as unknown", () => {
    expect(run([{ type: "gpa_min", min: 3.8 }]).eligible).toBe(false);
    expect(run([{ type: "gpa_min", min: 3.72 }]).reasons[0]?.text).toBe("Your GPA 3.72 meets the 3.72 minimum");
    expect(run([{ type: "gpa_min", min: 3.5 }], NATIONAL, { gpa: 4 }).reasons[0]?.text).toBe(
      "Your GPA 4.0 meets the 3.5 minimum",
    );
    expect(run([{ type: "gpa_min", min: 3.0 }], NATIONAL, { gpa: null })).toEqual({
      eligible: true,
      reasons: [],
      unknowns: ["GPA not on file"],
    });
  });

  it("matches majors and interests by case-insensitive substring either way", () => {
    expect(run([{ type: "major_any", majors: ["engineering"] }]).reasons[0]?.text).toBe(
      "You plan to study Mechanical engineering",
    );
    expect(run([{ type: "major_any", majors: ["Mechanical Engineering Technology"] }]).eligible).toBe(true);
    expect(run([{ type: "major_any", majors: ["Nursing"] }]).eligible).toBe(false);
    expect(run([{ type: "major_any", majors: ["Nursing"] }], NATIONAL, { intendedMajors: [] }).unknowns).toEqual([
      "Intended major not on file",
    ]);
    expect(run([{ type: "interest_any", interests: ["Robotics club"] }]).reasons[0]?.text).toBe(
      "You're interested in robotics",
    );
    expect(run([{ type: "interest_any", interests: ["music"] }]).eligible).toBe(false);
    expect(run([{ type: "interest_any", interests: ["music"] }], NATIONAL, { interests: [] }).unknowns).toEqual([
      "Interests not on file",
    ]);
  });

  it("checks test minimums and reports a missing score as unknown", () => {
    expect(run([{ type: "test_min", test: "ACT", min: 24 }]).reasons[0]?.text).toBe("Your ACT 28 meets the 24 minimum");
    expect(run([{ type: "test_min", test: "ACT", min: 30 }]).eligible).toBe(false);
    expect(run([{ type: "test_min", test: "SAT", min: 1200 }])).toEqual({
      eligible: true,
      reasons: [],
      unknowns: ["SAT score not on file"],
    });
  });

  it("checks service hours", () => {
    expect(run([{ type: "service_hours_min", hours: 40 }]).reasons[0]?.text).toBe(
      "You have 42 service hours (40 needed)",
    );
    expect(run([{ type: "service_hours_min", hours: 50 }]).eligible).toBe(false);
  });

  it("keeps eligibility when only unknowns remain and deduplicates them", () => {
    const result = run([
      { type: "custom", text: "Child of a credit union member" },
      { type: "custom", text: "Child of a credit union member" },
    ]);
    expect(result).toEqual({ eligible: true, reasons: [], unknowns: ["Child of a credit union member"] });
  });
});

describe("evaluateEligibility: sensitive rules", () => {
  it("fails every sensitive rule when nothing is shared", () => {
    const rules: EligibilityRule[] = [
      { type: "first_gen" },
      { type: "income_max", maxRange: "over_110k" },
      { type: "heritage_any", values: ["Mexican American"] },
      { type: "disability" },
      { type: "religion_any", values: ["Catholic"] },
      { type: "military_family" },
      { type: "foster_care" },
    ];
    for (const rule of rules) expect(run([rule]).eligible).toBe(false);
  });

  it("marks reasons from sensitive facts as sensitive", () => {
    const sensitive = {
      firstGen: true,
      incomeRange: "30_48k" as const,
      heritage: ["Mexican American"],
      disability: true,
      religion: ["Catholic"],
      militaryFamily: true,
      fosterCare: true,
      noncitizenFilter: false,
    };
    const result = run(
      [
        { type: "first_gen" },
        { type: "income_max", maxRange: "48_75k" },
        { type: "heritage_any", values: ["mexican"] },
        { type: "disability" },
        { type: "religion_any", values: ["CATHOLIC"] },
        { type: "military_family" },
        { type: "foster_care" },
        { type: "class_year_in", years: [2027] },
      ],
      NATIONAL,
      { sensitive },
    );
    expect(result.eligible).toBe(true);
    expect(result.reasons.map((r) => [r.code, r.sensitive])).toEqual([
      ["first_gen", true],
      ["income_max", true],
      ["heritage_any", true],
      ["disability", true],
      ["religion_any", true],
      ["military_family", true],
      ["foster_care", true],
      ["class_year_in", false],
    ]);
    expect(result.reasons[0]?.text).toBe("You're first in your family to go to college");
    expect(result.reasons.map((r) => r.text).join(" ")).not.toMatch(/Mexican|Catholic|30_48k/i);
    expect(result.reasons.filter((r) => r.sensitive).map((r) => r.code)).toEqual(SENSITIVE_RULE_TYPES);
  });

  it("orders income ranges and fails when no range is shared", () => {
    const withRange = (incomeRange: MatcherProfile["sensitive"]["incomeRange"]) => ({
      sensitive: { ...NO_SENSITIVE, incomeRange },
    });
    const rule: EligibilityRule = { type: "income_max", maxRange: "48_75k" };
    expect(run([rule], NATIONAL, withRange("under_30k")).eligible).toBe(true);
    expect(run([rule], NATIONAL, withRange("48_75k")).eligible).toBe(true);
    expect(run([rule], NATIONAL, withRange("75_110k")).eligible).toBe(false);
    expect(run([rule], NATIONAL, withRange(null)).eligible).toBe(false);
  });

  it("applies the citizenship filter without adding a reason", () => {
    const rule: EligibilityRule = { type: "citizenship_required" };
    expect(run([rule])).toEqual({ eligible: true, reasons: [], unknowns: [] });
    expect(run([rule], NATIONAL, { sensitive: { ...NO_SENSITIVE, noncitizenFilter: true } }).eligible).toBe(false);
  });
});
