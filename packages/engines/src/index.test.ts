import { NO_SENSITIVE } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import * as engines from "./index";

const CONTRACT = [
  "computeGap",
  "categorizeOfferLine",
  "compareOffers",
  "computePublicOffers",
  "formatUsd",
  "estimateLoanPayment",
  "estimateNetPrice",
  "wonScholarshipsForYear",
  "evaluateEligibility",
  "scoreMatch",
  "rankMatches",
  "detectScamSignals",
  "weekStartFor",
  "daysUntil",
  "reminderOffsetsDue",
  "isWarning",
  "countWords",
  "countChars",
  "limitState",
  "meritTierFor",
  "retakeAnalysis",
  "superscore",
  "prioritizePlanItems",
];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

describe("@scholarcrew/engines contract", () => {
  it("exports every section 9.2 function", () => {
    const surface = engines as unknown as Record<string, unknown>;
    for (const name of CONTRACT) expect(typeof surface[name], name).toBe("function");
  });

  it("exports the MatcherProfile type", () => {
    const profile: engines.MatcherProfile = {
      state: "TX",
      county: "Maple",
      city: "",
      classYear: 2027,
      gpa: 3.72,
      intendedMajors: [],
      interests: [],
      act: null,
      sat: null,
      serviceHours: 0,
      sensitive: NO_SENSITIVE,
    };
    expect(
      engines.evaluateEligibility([], { national: true, state: null, counties: [], cities: [] }, profile).eligible,
    ).toBe(true);
  });

  it("never mutates its inputs", () => {
    const offers = deepFreeze([
      {
        offerId: "o",
        collegeId: "1",
        collegeName: "State U",
        costOfAttendanceUsd: 27800,
        lines: [{ label: "Grant", amountUsd: 18600, category: "grant" as const, renewable: false }],
      },
    ]);
    expect(() => engines.compareOffers(offers)).not.toThrow();
    const matches = deepFreeze([
      { fitScore: 50, valuePerHour: 1, daysUntilDeadline: null },
      { fitScore: 50, valuePerHour: 2, daysUntilDeadline: 3 },
    ]);
    expect(engines.rankMatches(matches).map((m) => m.valuePerHour)).toEqual([2, 1]);
    const scores = deepFreeze([
      {
        id: "s1",
        test: "ACT" as const,
        takenOn: "2026-09-12",
        official: true,
        composite: 27,
        sections: { english: 26, math: 28, reading: 27 },
        createdAt: "2026-10-01T12:00:00.000Z",
      },
      {
        id: "s2",
        test: "ACT" as const,
        takenOn: "2026-06-13",
        official: true,
        composite: 26,
        sections: { english: 29, math: 24, reading: 26 },
        createdAt: "2026-10-01T12:00:00.000Z",
      },
    ]);
    expect(engines.superscore(scores)[0]?.composite).toBe(28);
  });
});
