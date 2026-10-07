import { describe, expect, it } from "vitest";
import { CollegeDeadlines, NetPriceByIncome, RecRequestPatch } from "./colleges";
import { OnboardingInput, ProfilePatch } from "./profile";

const valid = {
  displayName: "Jordan",
  birthYear: 2009,
  classYear: 2027,
  highSchool: "Maple High School",
  state: "TX",
  county: "Maple",
  gpaUnweighted: 3.72,
  intendedMajors: ["Mechanical engineering"],
  interests: ["robotics"],
};

describe("OnboardingInput", () => {
  it("applies defaults", () => {
    const v = OnboardingInput.parse(valid);
    expect(v.city).toBe("");
    expect(v.timeZone).toBe("America/Chicago");
    expect(v.collegeIds).toEqual([]);
    expect(v.sensitive).toEqual([]);
  });

  it("rejects bad GPA and state", () => {
    expect(OnboardingInput.safeParse({ ...valid, gpaUnweighted: 5.5 }).success).toBe(false);
    expect(OnboardingInput.safeParse({ ...valid, state: "XX" }).success).toBe(false);
  });

  it("caps the starter college list at 15", () => {
    const ids = Array.from({ length: 16 }, (_, i) => String(100000 + i));
    expect(OnboardingInput.safeParse({ ...valid, collegeIds: ids }).success).toBe(false);
  });
});

describe("ProfilePatch", () => {
  it("accepts empty state to clear it", () => {
    expect(ProfilePatch.safeParse({ state: "" }).success).toBe(true);
  });

  it("accepts IANA time zones and rejects unknown ones", () => {
    expect(ProfilePatch.safeParse({ timeZone: "America/New_York" }).success).toBe(true);
    expect(ProfilePatch.safeParse({ timeZone: "Mars/Base" }).success).toBe(false);
    expect(OnboardingInput.safeParse({ ...valid, timeZone: "Mars/Base" }).success).toBe(false);
  });

  it("trims display names and refuses control characters (R3E-10)", () => {
    expect(ProfilePatch.parse({ displayName: "  Maya " }).displayName).toBe("Maya");
    expect(ProfilePatch.safeParse({ displayName: "Maya\nLopez" }).success).toBe(false);
    expect(ProfilePatch.safeParse({ displayName: "   " }).success).toBe(false);
    expect(OnboardingInput.safeParse({ ...valid, displayName: "Maya\r\nLopez" }).success).toBe(false);
    expect(OnboardingInput.parse({ ...valid, displayName: " Maya López " }).displayName).toBe("Maya López");
  });
});

describe("college shapes", () => {
  it("fills null deadlines and income bands", () => {
    expect(CollegeDeadlines.parse({ rolling: false })).toEqual({
      ED: null,
      EA: null,
      REA: null,
      RD: null,
      rolling: false,
    });
    expect(NetPriceByIncome.parse({ overall: 12000 }).under_30k).toBeNull();
  });

  it("moves a recommendation past requested, never back to it (R2P-11)", () => {
    for (const status of ["confirmed", "submitted", "declined"]) {
      expect(RecRequestPatch.safeParse({ status }).success).toBe(true);
    }
    expect(RecRequestPatch.safeParse({ status: "requested" }).success).toBe(false);
    expect(RecRequestPatch.safeParse({ status: "draft" }).success).toBe(false);
    expect(RecRequestPatch.safeParse({}).success).toBe(false);
  });
});
