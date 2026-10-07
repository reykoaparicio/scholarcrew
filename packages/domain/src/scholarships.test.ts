import { describe, expect, it } from "vitest";
import {
  EligibilityRule,
  LocalArea,
  SENSITIVE_RULE_TYPES,
  ScholarshipQuery,
  ScholarshipQueryParams,
  hasSensitiveReason,
} from "./scholarships";

describe("EligibilityRule", () => {
  it("parses each rule shape by type", () => {
    expect(EligibilityRule.parse({ type: "county_in", state: "TX", counties: ["Maple"] }).type).toBe("county_in");
    expect(EligibilityRule.parse({ type: "gpa_min", min: 3.0 }).type).toBe("gpa_min");
    expect(EligibilityRule.parse({ type: "income_max", maxRange: "48_75k" }).type).toBe("income_max");
    expect(EligibilityRule.parse({ type: "custom", text: "Child of a credit union member" }).type).toBe("custom");
  });

  it("rejects an unknown rule type", () => {
    expect(EligibilityRule.safeParse({ type: "zodiac_sign", sign: "leo" }).success).toBe(false);
  });

  it("marks sensitive rule types", () => {
    expect(SENSITIVE_RULE_TYPES).toContain("first_gen");
    expect(SENSITIVE_RULE_TYPES).not.toContain("gpa_min");
  });
});

describe("LocalArea and query params", () => {
  it("defaults lists", () => {
    expect(LocalArea.parse({ national: true, state: null })).toEqual({
      national: true,
      state: null,
      counties: [],
      cities: [],
    });
  });

  it("coerces URL query strings", () => {
    const q = ScholarshipQueryParams.parse({ q: "nursing", local: "true", minUsd: "500", page: "2" });
    expect(q).toMatchObject({ q: "nursing", local: true, minUsd: 500, page: 2, pageSize: 20 });
  });

  it("carries the optional excludeScams flag (D39)", () => {
    expect(ScholarshipQueryParams.parse({ excludeScams: "true" }).excludeScams).toBe(true);
    expect(ScholarshipQuery.parse({ excludeScams: true }).excludeScams).toBe(true);
    expect(ScholarshipQuery.parse({}).excludeScams).toBeUndefined();
    expect(ScholarshipQuery.safeParse({ excludeScams: "yes" }).success).toBe(false);
  });

  it("carries the optional openOn date (F-18-3)", () => {
    expect(ScholarshipQueryParams.parse({ openOn: "2026-10-06" }).openOn).toBe("2026-10-06");
    expect(ScholarshipQuery.parse({ openOn: "2026-10-06" }).openOn).toBe("2026-10-06");
    expect(ScholarshipQuery.parse({}).openOn).toBeUndefined();
    expect(ScholarshipQuery.safeParse({ openOn: "10/06/2026" }).success).toBe(false);
    expect(ScholarshipQueryParams.safeParse({ openOn: "today" }).success).toBe(false);
  });
});

describe("private match reasons", () => {
  it("flags any private reason and leaves ordinary reasons public", () => {
    expect(
      hasSensitiveReason([
        { code: "religion_any", text: "Matches a private detail you chose to use", sensitive: true },
      ]),
    ).toBe(true);
    expect(hasSensitiveReason([{ code: "gpa", text: "Meets GPA", sensitive: false }])).toBe(false);
    expect(hasSensitiveReason([])).toBe(false);
  });
});
