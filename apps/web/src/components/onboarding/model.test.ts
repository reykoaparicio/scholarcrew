import { OnboardingInput } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { sensitiveValue, splitList } from "../../lib/sensitive";
import { buildInput, draftForStorage, emptyDraft, isUnder13, restoreDraft, stepSummary, validateStep } from "./model";

const NOW = new Date("2026-10-06T15:00:00.000Z");

const filled = () => {
  const d = emptyDraft({ displayName: "Maya", timeZone: "America/Chicago" });
  return {
    ...d,
    birthYear: "2009",
    classYear: "2027",
    highSchool: "Maple High School",
    state: "TX",
    county: "Maple",
    gpa: "3.72",
    majors: "Mechanical engineering",
    interests: "Robotics, programming, teaching kids",
  };
};

describe("validateStep", () => {
  it("requires the About you basics", () => {
    const errors = validateStep(0, emptyDraft({}), NOW);
    expect(errors).toEqual({
      displayName: "Tell us what to call you",
      birthYear: "Enter the year you were born, like 2009",
      classYear: "Enter your high school graduation year",
      highSchool: "Enter your high school",
      state: "Pick your state",
      county: "Enter your county",
    });
    expect(validateStep(0, filled(), NOW)).toEqual({});
    expect(validateStep(0, { ...filled(), birthYear: "2027" }, NOW).birthYear).toBeDefined();
    expect(validateStep(0, { ...filled(), state: "ZZ" }, NOW).state).toBe("Pick your state");
  });

  it("checks GPA and list sizes", () => {
    expect(validateStep(1, filled(), NOW)).toEqual({});
    expect(validateStep(1, { ...filled(), gpa: "" }, NOW)).toEqual({});
    expect(validateStep(1, { ...filled(), gpa: "5.5" }, NOW).gpa).toBe("GPA is a number from 0 to 5, like 3.72");
    expect(validateStep(1, { ...filled(), majors: "a, b, c, d, e, f" }, NOW).majors).toBe("List up to 5 majors");
    expect(validateStep(1, { ...filled(), interests: "1,2,3,4,5,6,7,8,9,10,11" }, NOW).interests).toBe(
      "List up to 10 interests",
    );
  });

  it("needs a range when income is on", () => {
    const d = filled();
    d.sensitive.income_range = { enabled: true, value: "" };
    expect(validateStep(2, d, NOW)).toEqual({ income_range: "Pick a range or turn this off" });
    d.sensitive.income_range = { enabled: true, value: "48_75k" };
    expect(validateStep(2, d, NOW)).toEqual({});
  });

  it("checks the parent email and the 15-college cap", () => {
    expect(validateStep(4, { ...filled(), parentEmail: "dana@" }, NOW).parentEmail).toBe(
      "Enter a valid email or leave it blank",
    );
    expect(validateStep(4, { ...filled(), parentEmail: "dana@example.test" }, NOW)).toEqual({});
    const many = Array.from({ length: 16 }, (_, n) => ({ id: String(100000 + n), name: `College ${n}`, state: "TX" }));
    expect(validateStep(4, { ...filled(), colleges: many }, NOW).colleges).toBe("Pick up to 15 colleges for now");
  });
});

describe("isUnder13", () => {
  it("uses the calendar year like the server", () => {
    expect(isUnder13(2014, NOW)).toBe(true);
    expect(isUnder13(2013, NOW)).toBe(false);
  });
});

describe("buildInput", () => {
  it("produces a valid OnboardingInput with only the opt-ins that are on", () => {
    const d = filled();
    d.sensitive.first_gen = { enabled: true, value: "" };
    d.sensitive.income_range = { enabled: true, value: "48_75k" };
    d.sensitive.heritage = { enabled: true, value: "Mexican American, Tejano" };
    d.colleges = [{ id: "100001", name: "State U", state: "TX" }];
    const input = buildInput(d);
    expect(OnboardingInput.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({
      displayName: "Maya",
      birthYear: 2009,
      classYear: 2027,
      state: "TX",
      gpaUnweighted: 3.72,
      intendedMajors: ["Mechanical engineering"],
      interests: ["Robotics", "programming", "teaching kids"],
      collegeIds: ["100001"],
      timeZone: "America/Chicago",
    });
    expect(input.sensitive).toEqual([
      { kind: "first_gen", enabled: true, value: null },
      { kind: "income_range", enabled: true, value: "48_75k" },
      { kind: "heritage", enabled: true, value: ["Mexican American", "Tejano"] },
    ]);
    expect(buildInput({ ...filled(), gpa: "" }).gpaUnweighted).toBeNull();
  });
});

describe("drafts and summaries", () => {
  it("never stores sensitive answers on the device", () => {
    const d = filled();
    d.sensitive.disability = { enabled: true, value: "" };
    const stored = draftForStorage(d);
    expect(JSON.stringify(stored)).not.toContain("disability");
    const restored = restoreDraft(JSON.stringify(stored), emptyDraft({}));
    expect(restored.highSchool).toBe("Maple High School");
    expect(restored.sensitive.disability.enabled).toBe(false);
    expect(restoreDraft("not json", emptyDraft({ displayName: "X" })).displayName).toBe("X");
  });

  it("summarizes finished steps for the stepper", () => {
    expect(stepSummary(0, filled())).toBe("Class of 2027 · Maple High School");
    expect(stepSummary(1, filled())).toBe("GPA 3.72 · Robotics");
    expect(stepSummary(2, filled())).toBe("Optional · all start off");
    expect(stepSummary(4, { ...filled(), colleges: [{ id: "1", name: "A", state: "TX" }] })).toBe("1 college");
  });
});

describe("sensitive helpers", () => {
  it("splits lists and shapes values by kind", () => {
    expect(splitList(" a, b ,, a\nc ", 5)).toEqual(["a", "b", "c"]);
    expect(sensitiveValue("income_range", "48_75k")).toBe("48_75k");
    expect(sensitiveValue("income_range", "lots")).toBeNull();
    expect(sensitiveValue("religion", "")).toBeNull();
    expect(sensitiveValue("religion", "Catholic")).toEqual(["Catholic"]);
    expect(sensitiveValue("first_gen", "anything")).toBeNull();
  });
});
