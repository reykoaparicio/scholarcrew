import { type MeritTier, RetakeAnalysis, Superscore, type TestScore } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { meritTierFor, retakeAnalysis, superscore } from "./merit";

const tier = (
  label: string,
  annualUsd: number,
  minGpa: number | null,
  minAct: number | null,
  minSat: number | null,
): MeritTier => ({
  label,
  minGpa,
  minAct,
  minSat,
  annualUsd,
  renewalGpa: null,
});

const STATE_U = [tier("Merit", 3000, 3.0, 26, 1230), tier("Dean's", 5000, 3.5, 29, 1350)];
const LAKESHORE = [tier("Founders", 2500, 3.5, 29, 1350)];
const BAY_TECH = [tier("Tech Scholars", 4000, 3.5, 30, 1390)];

describe("meritTierFor", () => {
  it("picks the highest tier the student satisfies", () => {
    expect(meritTierFor(STATE_U, 3.72, 28, null)?.label).toBe("Merit");
    expect(meritTierFor(STATE_U, 3.72, 29, null)?.label).toBe("Dean's");
    expect(meritTierFor([...STATE_U].reverse(), 3.72, 30, null)?.label).toBe("Dean's");
    expect(meritTierFor(STATE_U, 3.4, 30, null)?.label).toBe("Merit");
  });

  it("accepts either the ACT or the SAT minimum", () => {
    expect(meritTierFor(STATE_U, 3.72, null, 1350)?.label).toBe("Dean's");
    expect(meritTierFor(STATE_U, 3.72, 20, 1350)?.label).toBe("Dean's");
    expect(meritTierFor(STATE_U, 3.72, 25, null)).toBeNull();
    expect(meritTierFor(STATE_U, 3.72, null, null)).toBeNull();
  });

  it("requires a GPA when the tier sets a GPA minimum", () => {
    expect(meritTierFor(STATE_U, null, 30, 1400)).toBeNull();
  });

  it("uses GPA only when a tier has no test minimum, and returns null for no tiers", () => {
    const honors = [tier("Honors", 2000, 3.5, null, null)];
    expect(meritTierFor(honors, 3.72, null, null)?.label).toBe("Honors");
    expect(meritTierFor(honors, 3.2, null, null)).toBeNull();
    expect(meritTierFor([tier("Everyone", 1000, null, null, null)], null, null, null)?.label).toBe("Everyone");
    expect(meritTierFor([], 4, 36, 1600)).toBeNull();
  });
});

const colleges = [
  { id: "300001", name: "Lakeshore University", meritTiers: LAKESHORE },
  { id: "200001", name: "State U", meritTiers: STATE_U },
  { id: "300002", name: "Bay Tech", meritTiers: BAY_TECH },
  { id: "200003", name: "Northgate University", meritTiers: [] },
];

describe("retakeAnalysis", () => {
  it("reproduces the prep mockup for an ACT 29", () => {
    const result = retakeAnalysis({
      colleges,
      gpa: 3.72,
      currentAct: 28,
      currentSat: null,
      target: { test: "ACT", composite: 29 },
    });
    expect(result).toEqual({
      test: "ACT",
      currentComposite: 28,
      targetComposite: 29,
      rows: [
        {
          collegeId: "300001",
          collegeName: "Lakeshore University",
          currentTierLabel: null,
          targetTierLabel: "Founders",
          annualDeltaUsd: 2500,
          fourYearDeltaUsd: 10000,
        },
        {
          collegeId: "200001",
          collegeName: "State U",
          currentTierLabel: "Merit",
          targetTierLabel: "Dean's",
          annualDeltaUsd: 2000,
          fourYearDeltaUsd: 8000,
        },
        {
          collegeId: "300002",
          collegeName: "Bay Tech",
          currentTierLabel: null,
          targetTierLabel: null,
          annualDeltaUsd: 0,
          fourYearDeltaUsd: 0,
        },
        {
          collegeId: "200003",
          collegeName: "Northgate University",
          currentTierLabel: null,
          targetTierLabel: null,
          annualDeltaUsd: 0,
          fourYearDeltaUsd: 0,
        },
      ],
      totalFourYearDeltaUsd: 18000,
    });
    expect(RetakeAnalysis.safeParse(result).success).toBe(true);
  });

  it("never reports a negative delta for a lower target", () => {
    const result = retakeAnalysis({
      colleges,
      gpa: 3.72,
      currentAct: 28,
      currentSat: null,
      target: { test: "ACT", composite: 25 },
    });
    expect(result.rows[1]).toMatchObject({
      currentTierLabel: "Merit",
      targetTierLabel: null,
      annualDeltaUsd: 0,
      fourYearDeltaUsd: 0,
    });
    expect(result.totalFourYearDeltaUsd).toBe(0);
  });

  it("keeps the current ACT when the target is an SAT", () => {
    const result = retakeAnalysis({
      colleges,
      gpa: 3.72,
      currentAct: 28,
      currentSat: null,
      target: { test: "SAT", composite: 1350 },
    });
    expect(result.test).toBe("SAT");
    expect(result.currentComposite).toBeNull();
    expect(result.rows[1]).toMatchObject({
      currentTierLabel: "Merit",
      targetTierLabel: "Dean's",
      annualDeltaUsd: 2000,
    });
  });

  it("returns an empty analysis for no colleges", () => {
    expect(
      retakeAnalysis({
        colleges: [],
        gpa: null,
        currentAct: null,
        currentSat: null,
        target: { test: "ACT", composite: 30 },
      }),
    ).toEqual({
      test: "ACT",
      currentComposite: null,
      targetComposite: 30,
      rows: [],
      totalFourYearDeltaUsd: 0,
    });
  });
});

let seq = 0;
function score(
  test: TestScore["test"],
  takenOn: string,
  official: boolean,
  composite: number,
  sections: Record<string, number>,
): TestScore {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    test,
    takenOn,
    official,
    composite,
    sections,
    createdAt: "2026-10-01T12:00:00.000Z",
  };
}

describe("superscore", () => {
  it("reproduces the prep mockup ACT superscore and skips practice tests", () => {
    const result = superscore([
      score("ACT", "2026-09-12", true, 27, { english: 26, math: 28, reading: 27 }),
      score("ACT", "2026-06-13", true, 26, { english: 29, math: 24, reading: 26 }),
      score("ACT", "2026-09-26", false, 28, { english: 28, math: 29, reading: 27 }),
    ]);
    expect(result).toEqual([
      {
        test: "ACT",
        composite: 28,
        sections: { english: 29, math: 28, reading: 27 },
        fromDates: ["2026-06-13", "2026-09-12"],
      },
    ]);
    expect(Superscore.safeParse(result[0]).success).toBe(true);
  });

  it("rounds the ACT average of present sections, including science", () => {
    const result = superscore([
      score("ACT", "2026-09-12", true, 27, { english: 26, math: 28, reading: 27, science: 25 }),
      score("ACT", "2026-06-13", true, 27, { english: 29, math: 24, reading: 26, science: 30 }),
    ]);
    expect(result[0]?.composite).toBe(29); // (29 + 28 + 27 + 30) / 4 = 28.5
  });

  it("adds SAT and PSAT rw + math and orders tests ACT, SAT, PSAT", () => {
    const result = superscore([
      score("PSAT", "2025-10-15", true, 1220, { rw: 600, math: 620 }),
      score("SAT", "2026-05-02", true, 1370, { rw: 690, math: 680 }),
      score("SAT", "2026-03-14", true, 1350, { rw: 650, math: 700 }),
      score("ACT", "2026-09-12", true, 27, { english: 26, math: 28, reading: 27 }),
    ]);
    expect(result.map((s) => s.test)).toEqual(["ACT", "SAT", "PSAT"]);
    expect(result[1]).toEqual({
      test: "SAT",
      composite: 1390,
      sections: { rw: 690, math: 700 },
      fromDates: ["2026-03-14", "2026-05-02"],
    });
    expect(result[2]).toEqual({
      test: "PSAT",
      composite: 1220,
      sections: { rw: 600, math: 620 },
      fromDates: ["2025-10-15"],
    });
  });

  it("falls back to the best official composite when sections are missing", () => {
    const result = superscore([score("SAT", "2026-03-14", true, 1200, {}), score("SAT", "2026-05-02", true, 1300, {})]);
    expect(result).toEqual([{ test: "SAT", composite: 1300, sections: {}, fromDates: ["2026-05-02"] }]);
  });

  it("returns nothing without official scores", () => {
    expect(superscore([])).toEqual([]);
    expect(superscore([score("ACT", "2026-09-26", false, 28, { english: 28, math: 29, reading: 27 })])).toEqual([]);
  });
});
