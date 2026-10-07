import { EligibilityRule, type EligibilityRuleType, INCOME_RANGE_LABELS, IncomeRange } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import {
  INCOME_OPTIONS,
  RULE_SPECS,
  RULE_TYPES,
  draftToRule,
  draftsToRules,
  emptyDraft,
  ruleToDraft,
} from "./eligibility";

const SAMPLES: Record<EligibilityRuleType, Record<string, string>> = {
  state_in: { states: "tx, ok" },
  county_in: { state: "TX", counties: "Maple, Pecan" },
  city_in: { state: "TX", cities: "Cedar Park" },
  class_year_in: { years: "2027, 2028" },
  gpa_min: { min: "3.25" },
  major_any: { majors: "Engineering, Nursing" },
  interest_any: { interests: "robotics" },
  first_gen: {},
  income_max: { maxRange: "48_75k" },
  heritage_any: { values: "Hispanic or Latino" },
  disability: {},
  religion_any: { values: "Catholic" },
  military_family: {},
  foster_care: {},
  citizenship_required: {},
  test_min: { test: "SAT", min: "1200" },
  service_hours_min: { hours: "40" },
  custom: { text: "Child of a co-op member" },
};

describe("rule specs", () => {
  it("cover all 18 rule types", () => {
    expect(RULE_TYPES).toHaveLength(18);
    expect([...RULE_TYPES].sort()).toEqual(Object.keys(RULE_SPECS).sort());
    // R3V-8: income choices come from 02's label map.
    expect(INCOME_OPTIONS.map((o) => o.label)).toEqual(IncomeRange.options.map((r) => INCOME_RANGE_LABELS[r]));
    expect(INCOME_OPTIONS[0]).toEqual({ value: "under_30k", label: "Under $30k" });
  });
});

describe("draftToRule", () => {
  it("produces a valid EligibilityRule for every type and round-trips it", () => {
    for (const type of RULE_TYPES) {
      const out = draftToRule({ key: "k", type, values: SAMPLES[type] });
      expect(out.error, type).toBeNull();
      if (!out.rule) throw new Error(`no rule for ${type}`);
      expect(EligibilityRule.safeParse(out.rule).success, type).toBe(true);
      expect(draftToRule(ruleToDraft("k", out.rule)).rule, type).toEqual(out.rule);
    }
    expect(draftToRule({ key: "k", type: "state_in", values: SAMPLES.state_in }).rule).toEqual({
      type: "state_in",
      states: ["TX", "OK"],
    });
    expect(draftToRule({ key: "k", type: "test_min", values: SAMPLES.test_min }).rule).toEqual({
      type: "test_min",
      test: "SAT",
      min: 1200,
    });
  });

  it("starts types without fields valid and the rest waiting for input", () => {
    for (const type of RULE_TYPES) {
      const out = draftToRule(emptyDraft("k", type));
      const needsInput = RULE_SPECS[type].fields.some(
        (f) => f.kind !== "state" && f.kind !== "income" && f.kind !== "test",
      );
      expect(out.error === null, type).toBe(!needsInput);
    }
  });

  it("names the field to fix", () => {
    expect(draftToRule({ key: "k", type: "gpa_min", values: { min: "" } }).error).toBe(
      "Minimum GPA: check “GPA at least”.",
    );
    expect(draftToRule({ key: "k", type: "state_in", values: { states: "Texas" } }).error).toBe(
      "Lives in a state: check “States”.",
    );
    expect(draftToRule({ key: "k", type: "class_year_in", values: { years: "2019" } }).error).toBe(
      "Class year: check “Class years”.",
    );
    expect(draftToRule({ key: "k", type: "test_min", values: { test: "SAT", min: "0" } }).error).toBe(
      "Minimum test score: check “Score at least”.",
    );
  });

  it("collects rules and errors from a list of drafts", () => {
    const out = draftsToRules([
      { key: "a", type: "first_gen", values: {} },
      { key: "b", type: "gpa_min", values: { min: "abc" } },
    ]);
    expect(out).toEqual({ rules: [{ type: "first_gen" }], errors: ["Minimum GPA: check “GPA at least”."] });
  });
});
