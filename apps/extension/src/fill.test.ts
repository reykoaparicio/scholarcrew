import { beforeEach, describe, expect, it } from "vitest";
import { detectFields } from "./fields";
import { applyProposals, buildProposals, fillField, findOption } from "./fill";
import { control, fieldKey, mountForm } from "./test/form";
import { PROFILE } from "./test/profile";

function eventsOn(target: EventTarget): string[] {
  const seen: string[] = [];
  for (const type of ["input", "change"]) {
    target.addEventListener(type, (e) => seen.push(`${e.type}:${fieldKey(e.target as Element)}:${e.bubbles}`));
  }
  return seen;
}

describe("buildProposals", () => {
  beforeEach(() => {
    mountForm();
  });

  it("proposes a value for every matched field the profile can fill", () => {
    const proposals = buildProposals(detectFields(document), PROFILE);
    expect(proposals.map((p) => [fieldKey(p.field.element), p.key, p.display])).toEqual([
      ["full-name", "displayName", "Maya Torres"],
      ["contact", "email", "maya@example.com"],
      ["hs", "highSchool", "Lakeview High School"],
      ["q4", "classYear", "2027"],
      ["gpa_unweighted", "gpa", "3.80"],
      ["city", "city", "Austin"],
      ["state", "state", "Texas"],
      ["intendedMajor", "intendedMajors", "Biology, Public Health"],
      [
        "acts",
        "activities",
        "Robotics club — Captain: Lead a 12-person build team\nFood bank — Shift lead: Run the Saturday sorting crew",
      ],
    ]);
    expect(new Set(proposals.map((p) => p.id)).size).toBe(9);
  });

  it("marks already-filled fields and keeps their current value", () => {
    const proposals = buildProposals(detectFields(document), PROFILE);
    const city = proposals.find((p) => p.key === "city");
    expect(city).toMatchObject({ filled: true, currentValue: "Springfield", value: "Austin" });
    expect(proposals.filter((p) => p.filled)).toHaveLength(1);
  });

  it("uses the option value for selects", () => {
    const state = buildProposals(detectFields(document), PROFILE).find((p) => p.key === "state");
    expect(state).toMatchObject({ value: "TX", display: "Texas", filled: false });
  });

  it("matches a state code to an option that only has the state name", () => {
    document.body.innerHTML = `<select aria-label="State"><option value="">Pick</option><option value="texas">Texas</option></select>`;
    const [proposal] = buildProposals(detectFields(document), PROFILE);
    expect(proposal).toMatchObject({ value: "texas", display: "Texas" });
  });

  it("skips selects with no matching option, empty profile values, and fields that already match", () => {
    document.body.innerHTML = `
      <select aria-label="State"><option value="IL">Illinois</option></select>
      <input aria-label="GPA">
      <input aria-label="Email" value="maya@example.com">`;
    expect(buildProposals(detectFields(document), { ...PROFILE, gpa: null })).toEqual([]);
  });
});

describe("fillField", () => {
  beforeEach(() => {
    mountForm();
  });

  it("sets the value and dispatches bubbling input then change", () => {
    const form = control<HTMLFormElement>("application");
    const seen = eventsOn(form);
    expect(fillField(control("full-name"), "Maya Torres", { replace: false })).toBe(true);
    expect(control("full-name").value).toBe("Maya Torres");
    expect(seen).toEqual(["input:full-name:true", "change:full-name:true"]);
  });

  it("leaves an already-filled field alone unless replace is set", () => {
    const seen = eventsOn(control("city"));
    expect(fillField(control("city"), "Austin", { replace: false })).toBe(false);
    expect(control("city").value).toBe("Springfield");
    expect(seen).toEqual([]);
    expect(fillField(control("city"), "Austin", { replace: true })).toBe(true);
    expect(control("city").value).toBe("Austin");
  });

  it("picks a select option by value or text, case-insensitively", () => {
    const state = control<HTMLSelectElement>("state");
    expect(findOption(state, "tx")?.value).toBe("TX");
    expect(findOption(state, "illinois")?.value).toBe("IL");
    expect(findOption(state, "Ohio")).toBeNull();
    expect(fillField(state, "texas", { replace: false })).toBe(true);
    expect(state.value).toBe("TX");
  });

  it("does nothing to a select when no option matches", () => {
    const state = control<HTMLSelectElement>("state");
    const seen = eventsOn(state);
    expect(fillField(state, "Ohio", { replace: false })).toBe(false);
    expect(state.value).toBe("");
    expect(seen).toEqual([]);
  });

  it("writes through the native value setter so framework-controlled inputs see it", () => {
    const input = control("full-name");
    const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => nativeValue?.get?.call(input),
      set: () => {
        throw new Error("instance setter used");
      },
    });
    expect(fillField(input, "Maya Torres", { replace: false })).toBe(true);
    expect(nativeValue?.get?.call(input)).toBe("Maya Torres");
  });
});

describe("applyProposals", () => {
  it("fills only the selected proposals and returns how many changed", () => {
    mountForm();
    const proposals = buildProposals(detectFields(document), PROFILE);
    const selected = new Set(proposals.filter((p) => p.key === "email" || p.key === "state").map((p) => p.id));
    expect(applyProposals(proposals, selected)).toBe(2);
    expect(control("contact").value).toBe("maya@example.com");
    expect(control<HTMLSelectElement>("state").value).toBe("TX");
    expect(control("full-name").value).toBe("");
    expect(control("city").value).toBe("Springfield");
  });

  it("replaces a filled field when its proposal is selected", () => {
    mountForm();
    const proposals = buildProposals(detectFields(document), PROFILE);
    const city = proposals.find((p) => p.key === "city");
    if (!city) throw new Error("no city proposal");
    expect(applyProposals(proposals, new Set([city.id]))).toBe(1);
    expect(control("city").value).toBe("Austin");
  });
});

describe("changing and disabled forms", () => {
  it("does not choose options in disabled groups", () => {
    document.body.innerHTML = `<select aria-label="State"><option value="">Choose</option><optgroup disabled><option value="TX">Texas</option></optgroup></select>`;
    const select = document.querySelector("select");
    if (!select) throw new Error("missing select");
    expect(findOption(select, "TX")).toBeNull();
    expect(buildProposals(detectFields(document), PROFILE)).toEqual([]);
  });

  it("preserves fields changed after their values were reviewed", () => {
    mountForm();
    const proposals = buildProposals(detectFields(document), PROFILE);
    const city = proposals.find((proposal) => proposal.key === "city");
    if (!city) throw new Error("missing city");
    city.field.element.value = "Houston";
    expect(applyProposals(proposals, new Set([city.id]))).toBe(0);
    expect(city.field.element.value).toBe("Houston");
  });

  it.each(["disabled", "readonly", "hidden", "detached"])("rechecks a %s control at fill time", (state) => {
    mountForm();
    const input = control("full-name");
    if (state === "disabled") input.disabled = true;
    if (state === "readonly") input.readOnly = true;
    if (state === "hidden") input.hidden = true;
    if (state === "detached") input.remove();
    expect(fillField(input, "Maya Torres", { replace: true })).toBe(false);
    expect(input.value).toBe("");
  });
});
