// @vitest-environment jsdom
import { EligibilityRule, type EligibilityRuleType } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EligibilityEditor } from "./EligibilityEditor";
import { RULE_SPECS, RULE_TYPES } from "./eligibility";

afterEach(cleanup);

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

type Output = { rules: EligibilityRule[]; errors: string[] };
function lastOutput(fn: ReturnType<typeof vi.fn>): Output {
  const call = fn.mock.calls[fn.mock.calls.length - 1];
  return call?.[0] as Output;
}

describe("EligibilityEditor", () => {
  it("edits an existing rule and reports valid rules", () => {
    const onChange = vi.fn();
    render(<EligibilityEditor initial={[{ type: "state_in", states: ["TX"] }]} onChange={onChange} />);
    expect((screen.getByLabelText("States") as HTMLInputElement).value).toBe("TX");
    fireEvent.change(screen.getByLabelText("States"), { target: { value: "TX, OK" } });
    expect(lastOutput(onChange)).toEqual({ rules: [{ type: "state_in", states: ["TX", "OK"] }], errors: [] });
  });

  it("adds a rule, shows what's missing, and removes rules", () => {
    const onChange = vi.fn();
    render(<EligibilityEditor initial={[{ type: "first_gen" }]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Rule type"), { target: { value: "gpa_min" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByText("Minimum GPA: check “GPA at least”.")).toBeTruthy();
    expect(lastOutput(onChange).errors).toEqual(["Minimum GPA: check “GPA at least”."]);
    fireEvent.change(screen.getByLabelText("GPA at least"), { target: { value: "3.5" } });
    expect(lastOutput(onChange)).toEqual({ rules: [{ type: "first_gen" }, { type: "gpa_min", min: 3.5 }], errors: [] });
    expect(screen.getAllByText("Private match")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove rule 1" }));
    expect(lastOutput(onChange)).toEqual({ rules: [{ type: "gpa_min", min: 3.5 }], errors: [] });
  });

  it("produces EligibilityRule JSON the domain schema accepts for every rule type", () => {
    for (const type of RULE_TYPES) {
      const onChange = vi.fn();
      render(<EligibilityEditor initial={[]} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText("Rule type"), { target: { value: type } });
      fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
      for (const field of RULE_SPECS[type].fields) {
        fireEvent.change(screen.getByLabelText(field.label), { target: { value: SAMPLES[type][field.name] } });
      }
      const out = lastOutput(onChange);
      expect(out.errors, type).toEqual([]);
      expect(out.rules, type).toHaveLength(1);
      expect(EligibilityRule.array().safeParse(out.rules).success, type).toBe(true);
      expect(out.rules[0]?.type).toBe(type);
      cleanup();
    }
  });
});
