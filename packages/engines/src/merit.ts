import type { College, IsoDate, MeritTier, RetakeAnalysis, Superscore, TestKind, TestScore } from "@scholarcrew/domain";

function qualifies(tier: MeritTier, gpa: number | null, act: number | null, sat: number | null): boolean {
  if (tier.minGpa !== null && (gpa === null || gpa < tier.minGpa)) return false;
  if (tier.minAct === null && tier.minSat === null) return true;
  const actOk = tier.minAct !== null && act !== null && act >= tier.minAct;
  const satOk = tier.minSat !== null && sat !== null && sat >= tier.minSat;
  return actOk || satOk;
}

/** Highest-paying tier the student satisfies; the first listed wins a tie. */
export function meritTierFor(
  tiers: MeritTier[],
  gpa: number | null,
  act: number | null,
  sat: number | null,
): MeritTier | null {
  let best: MeritTier | null = null;
  for (const tier of tiers) {
    if (qualifies(tier, gpa, act, sat) && (best === null || tier.annualUsd > best.annualUsd)) best = tier;
  }
  return best;
}

export function retakeAnalysis(input: {
  colleges: Array<Pick<College, "id" | "name" | "meritTiers">>;
  gpa: number | null;
  currentAct: number | null;
  currentSat: number | null;
  target: { test: "ACT" | "SAT"; composite: number };
}): RetakeAnalysis {
  const { colleges, gpa, currentAct, currentSat, target } = input;
  const targetAct = target.test === "ACT" ? target.composite : currentAct;
  const targetSat = target.test === "SAT" ? target.composite : currentSat;
  const rows = colleges.map((college) => {
    const now = meritTierFor(college.meritTiers, gpa, currentAct, currentSat);
    const then = meritTierFor(college.meritTiers, gpa, targetAct, targetSat);
    const annualDeltaUsd = Math.max(0, (then?.annualUsd ?? 0) - (now?.annualUsd ?? 0));
    return {
      collegeId: college.id,
      collegeName: college.name,
      currentTierLabel: now?.label ?? null,
      targetTierLabel: then?.label ?? null,
      annualDeltaUsd,
      fourYearDeltaUsd: 4 * annualDeltaUsd,
    };
  });
  return {
    test: target.test,
    currentComposite: target.test === "ACT" ? currentAct : currentSat,
    targetComposite: target.composite,
    rows,
    totalFourYearDeltaUsd: rows.reduce((sum, row) => sum + row.fourYearDeltaUsd, 0),
  };
}

const TEST_ORDER: TestKind[] = ["ACT", "SAT", "PSAT"];
const ACT_COMPOSITE_SECTIONS = ["english", "math", "reading", "science"];

export function superscore(scores: TestScore[]): Superscore[] {
  const out: Superscore[] = [];
  for (const test of TEST_ORDER) {
    const official = scores
      .filter((s) => s.official && s.test === test)
      .sort((a, b) => a.takenOn.localeCompare(b.takenOn));
    if (official.length === 0) continue;

    const sections: Record<string, number> = {};
    const sectionDate: Record<string, IsoDate> = {};
    for (const s of official) {
      for (const [key, value] of Object.entries(s.sections)) {
        const current = sections[key];
        if (current === undefined || value > current) {
          sections[key] = value;
          sectionDate[key] = s.takenOn;
        }
      }
    }

    let composite: number | null = null;
    let used: string[] = [];
    if (test === "ACT") {
      used = ACT_COMPOSITE_SECTIONS.filter((key) => sections[key] !== undefined);
      if (used.length > 0) {
        composite = Math.round(used.reduce((sum, key) => sum + (sections[key] ?? 0), 0) / used.length);
      }
    } else {
      const rw = sections.rw;
      const math = sections.math;
      if (rw !== undefined && math !== undefined) {
        used = ["rw", "math"];
        composite = rw + math;
      }
    }

    if (composite === null) {
      const best = official.reduce((a, b) => (b.composite > a.composite ? b : a));
      out.push({ test, composite: best.composite, sections, fromDates: [best.takenOn] });
      continue;
    }
    const dates = new Set<IsoDate>();
    for (const key of used) {
      const date = sectionDate[key];
      if (date !== undefined) dates.add(date);
    }
    out.push({ test, composite, sections, fromDates: [...dates].sort() });
  }
  return out;
}
