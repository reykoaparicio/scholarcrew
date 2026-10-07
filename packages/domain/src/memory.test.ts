import { describe, expect, it } from "vitest";
import {
  FactInput,
  FactKey,
  NO_SENSITIVE,
  PROFILE_FACT_KEYS,
  SENSITIVE_KINDS,
  SensitiveFactInput,
  SensitiveFactValues,
  containsSensitiveTerm,
  isSensitiveFactKey,
} from "./memory";

describe("PROFILE_FACT_KEYS", () => {
  it("lists the eight profile-backed fact keys, all valid fact keys (R2I-1)", () => {
    expect(PROFILE_FACT_KEYS).toHaveLength(8);
    expect(new Set(PROFILE_FACT_KEYS).size).toBe(8);
    for (const k of PROFILE_FACT_KEYS) expect(FactKey.safeParse(k).success).toBe(true);
  });
});

describe("FactInput", () => {
  it("accepts snake_case keys and simple values with defaults", () => {
    const f = FactInput.parse({ key: "intended_major", value: "mechanical engineering" });
    expect(f.visibility).toBe("crew");
    expect(f.source).toBe("user_stated");
    expect(f.sourceRef).toBeNull();
  });

  it("rejects camelCase keys and objects as values", () => {
    expect(FactInput.safeParse({ key: "intendedMajor", value: "x" }).success).toBe(false);
    expect(FactInput.safeParse({ key: "a_b", value: { nested: true } }).success).toBe(false);
  });
});

describe("SensitiveFactInput", () => {
  it("requires an income range value shape for income_range", () => {
    expect(SensitiveFactInput.safeParse({ kind: "income_range", enabled: true, value: "48_75k" }).success).toBe(true);
    expect(SensitiveFactInput.safeParse({ kind: "income_range", enabled: true, value: ["a"] }).success).toBe(false);
  });

  it("requires a list for heritage and religion", () => {
    expect(SensitiveFactInput.safeParse({ kind: "heritage", enabled: true, value: ["Mexican American"] }).success).toBe(
      true,
    );
    expect(SensitiveFactInput.safeParse({ kind: "heritage", enabled: true, value: "48_75k" }).success).toBe(false);
  });

  it("forbids values on yes/no kinds", () => {
    expect(SensitiveFactInput.safeParse({ kind: "first_gen", enabled: true }).success).toBe(true);
    expect(SensitiveFactInput.safeParse({ kind: "first_gen", enabled: true, value: ["x"] }).success).toBe(false);
  });
});

describe("SensitiveFactValues", () => {
  it("has an all-off constant", () => {
    expect(SensitiveFactValues.parse(NO_SENSITIVE)).toEqual(NO_SENSITIVE);
    expect(NO_SENSITIVE.incomeRange).toBeNull();
  });
});

describe("canonical sensitive terms", () => {
  it("covers every kind and sensitive token run without prefix false positives", () => {
    for (const key of [
      ...SENSITIVE_KINDS,
      "family_income",
      "household_income",
      "religious_affiliation",
      "is_first_generation",
      "health_condition",
      "undocumented",
      "lgbtq",
    ])
      expect(isSensitiveFactKey(key), key).toBe(true);
    for (const key of ["first_choice_college", "intended_majors", "family_size"])
      expect(isSensitiveFactKey(key), key).toBe(false);
    expect(containsSensitiveTerm("first-generation, foster care")).toBe(true);
  });
});
