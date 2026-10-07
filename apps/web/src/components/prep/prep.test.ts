import type { TestScore } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { bestOfficial, mondayOf, parseTarget, planSummary, proposeStudyPlan, sectionsText } from "./prep";

const score = (o: Partial<TestScore>): TestScore => ({
  id: "x",
  test: "ACT",
  takenOn: "2026-09-12",
  official: true,
  composite: 27,
  sections: { english: 26, math: 28, reading: 27 },
  createdAt: "2026-09-20T15:00:00.000Z",
  ...o,
});

describe("prep helpers", () => {
  it("finds the best official composite and lists sections", () => {
    const scores = [
      score({}),
      score({ id: "y", composite: 26 }),
      score({ id: "z", composite: 28, official: false }),
      score({ id: "s", test: "SAT", composite: 1280 }),
    ];
    expect(bestOfficial(scores, "ACT")).toBe(27);
    expect(bestOfficial(scores, "SAT")).toBe(1280);
    expect(bestOfficial([], "ACT")).toBeNull();
    expect(sectionsText({ english: 26, math: 28, rw: 640 })).toBe("English 26 · Math 28 · Reading and Writing 640");
  });

  it("checks a target against the test's range", () => {
    expect(parseTarget("ACT", "29")).toBe(29);
    expect(parseTarget("ACT", "37")).toBeNull();
    expect(parseTarget("SAT", "1450")).toBe(1450);
    expect(parseTarget("SAT", "390")).toBeNull();
    expect(parseTarget("ACT", "2 9")).toBeNull();
  });

  it("proposes three weekly sessions until the test date, capped at 40", () => {
    expect(mondayOf("2026-10-08")).toBe("2026-10-05");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    const sessions = proposeStudyPlan("2026-10-08", "2026-10-24");
    expect(sessions.map((s) => [s.weekStart, s.dueOn, s.minutes])).toEqual([
      ["2026-10-12", "2026-10-13", 25],
      ["2026-10-12", "2026-10-15", 25],
      ["2026-10-12", "2026-10-17", 30],
      ["2026-10-19", "2026-10-20", 25],
      ["2026-10-19", "2026-10-22", 25],
    ]);
    expect(planSummary(sessions, "2026-10-24")).toBe("1 h 20 min a week until Oct 24");
    expect(proposeStudyPlan("2026-10-08", "2027-12-31")).toHaveLength(40);
    expect(proposeStudyPlan("2026-10-08", "2026-10-09")).toEqual([]);
  });
});
