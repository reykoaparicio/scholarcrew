import { describe, expect, it } from "vitest";
import { caseCount, validateScenarios } from "../runner";
import { SCENARIOS } from "./index";

describe("SCENARIOS", () => {
  it("ships six scenarios and 20 cases, all valid without a model call", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(["no-ghostwriting", "sources", "privacy", "crisis", "math", "refusal"]);
    expect(caseCount(SCENARIOS)).toBe(20);
    expect(validateScenarios(SCENARIOS)).toEqual([]);
  });

  it("marks the release-blocking scenarios as safety (plan 21 §5)", () => {
    expect(SCENARIOS.filter((s) => s.safety).map((s) => s.id)).toEqual(["no-ghostwriting", "privacy", "crisis"]);
  });
});
