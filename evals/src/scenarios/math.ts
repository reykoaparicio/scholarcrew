import type { FakePortData } from "@scholarcrew/agents/testing";
import { compareOffers, computeGap, estimateLoanPayment } from "@scholarcrew/engines";
import { JORDAN, crewInput, portData, runCrew, validateInput, validatePortData } from "../fixtures";
import { amountsOutside, dollarAmounts, missingAmounts, phrasesFound, prop } from "../properties";
import type { EvalCase, PropertyResult, Scenario } from "../types";

const OFFERS = [
  {
    offerId: "offer-ut",
    collegeId: JORDAN.collegeId,
    collegeName: "The University of Texas at Austin",
    costOfAttendanceUsd: 31_000,
    lines: [
      { amountUsd: 7_395, category: "grant", renewable: true },
      { amountUsd: 6_000, category: "grant", renewable: false },
      { amountUsd: 2_500, category: "work_study", renewable: false },
      { amountUsd: 3_500, category: "loan_federal_subsidized", renewable: false },
      { amountUsd: 2_000, category: "loan_federal_unsubsidized", renewable: false },
    ],
  },
  {
    offerId: "offer-riverside",
    collegeId: "990002",
    collegeName: "Riverside College",
    costOfAttendanceUsd: 31_200,
    lines: [
      { amountUsd: 14_000, category: "scholarship", renewable: true },
      { amountUsd: 7_395, category: "grant", renewable: true },
      { amountUsd: 2_000, category: "work_study", renewable: false },
      { amountUsd: 3_500, category: "loan_federal_subsidized", renewable: false },
    ],
  },
] satisfies Parameters<typeof compareOffers>[0];
const ALIASES: Record<string, string[]> = {
  "offer-ut": ["UT Austin", "University of Texas"],
  "offer-riverside": ["Riverside"],
};
const LOAN = { principalUsd: 27_000, annualRatePct: 6.39, years: 10 };

function offerData(): FakePortData {
  return portData({ offers: compareOffers(OFFERS) });
}

/** Every dollar figure the fixture or the engine produced, plus differences between offer columns. */
function ledgerAmounts(data: FakePortData, extra: number[]): number[] {
  const out = new Set<number>([0, ...extra]);
  for (const c of data.costs) {
    for (const n of [c.costOfAttendanceUsd, c.freeMoneyUsd, c.gapUsd, c.pendingUsd, c.gapIfPendingWinUsd]) out.add(n);
  }
  for (const d of data.deadlines) if (d.valueUsd !== null) out.add(d.valueUsd);
  for (const s of data.scholarships) {
    out.add(s.amountMinUsd);
    out.add(s.amountMaxUsd);
  }
  const columns = data.offers.columns;
  for (const c of columns) {
    for (const n of [
      c.costOfAttendanceUsd,
      c.freeMoneyUsd,
      c.workStudyUsd,
      c.loansUsd,
      c.letterSaysOweUsd,
      c.reallyCostsUsd,
      c.fourYearUsd,
      c.oneTimeFreeUsd,
    ]) {
      out.add(n);
    }
  }
  for (const a of columns) {
    for (const b of columns) {
      for (const key of ["freeMoneyUsd", "loansUsd", "letterSaysOweUsd", "reallyCostsUsd", "fourYearUsd"] as const) {
        out.add(Math.abs(a[key] - b[key]));
      }
    }
  }
  for (const o of OFFERS) for (const l of o.lines) out.add(l.amountUsd);
  return [...out];
}

function amountChecks(text: string, allowed: number[], required: number[]): PropertyResult[] {
  const found = dollarAmounts(text);
  const outside = amountsOutside(found, allowed);
  const missing = missingAmounts(required, found);
  return [
    prop(
      "every dollar amount matches Ledger's numbers",
      outside.length === 0,
      outside.length ? `unexpected: ${outside.join(", ")}` : `${found.length} amounts checked`,
    ),
    prop(
      "states the answer",
      missing.length === 0,
      missing.length ? `missing: ${missing.join(", ")}` : `found ${required.join(", ")}`,
    ),
  ];
}

function mathCase(
  id: string,
  description: string,
  userText: string,
  data: () => FakePortData,
  answer: () => { required: number[]; extra: number[]; names?: string[]; problems?: string[] },
): EvalCase {
  return {
    id,
    description,
    validate: () => {
      const a = answer();
      const allowed = ledgerAmounts(data(), a.extra);
      const bad = a.required.filter((r) => r <= 0 || !allowed.includes(r));
      return [
        ...validatePortData(data()),
        ...validateInput(crewInput({ userText })),
        ...(a.required.length === 0 ? ["no required amount, so the answer check would be vacuous"] : []),
        ...(bad.length > 0 ? [`required amounts not produced by the engine: ${bad.join(", ")}`] : []),
        ...(a.problems ?? []),
      ];
    },
    run: async (ctx) => {
      const fixture = data();
      const a = answer();
      const { result } = await runCrew(ctx, fixture, crewInput({ userText }));
      const checks = amountChecks(result.reply.text, ledgerAmounts(fixture, a.extra), a.required);
      if (a.names) {
        const named = phrasesFound(result.reply.text, a.names);
        checks.push(
          prop("names the college that costs least over four years", named.length > 0, named.join(", ") || "not named"),
        );
      }
      return checks;
    },
  };
}

export const math: Scenario = {
  id: "math",
  title: "Ledger numbers in replies equal the engine's results",
  feature: "MO-03",
  safety: false,
  cases: [
    mathCase(
      "compare-two-offers",
      "Which of two award letters costs less over four years, and by how much",
      "@Ledger which of my two offers costs less over four years, and by how much?",
      offerData,
      () => {
        const comparison = compareOffers(OFFERS);
        const [a, b] = comparison.columns;
        const lowest = comparison.lowestFourYearOfferId ?? "";
        return {
          required: a && b ? [Math.abs(a.fourYearUsd - b.fourYearUsd)] : [],
          extra: [],
          names: ALIASES[lowest] ?? [],
        };
      },
    ),
    mathCase(
      "gap-if-win",
      "The yearly gap if a pending scholarship comes through",
      "If I win the Hill Country STEM Award, what will my yearly gap at UT Austin be?",
      () => portData(),
      () => {
        // The fixture's own cost row; extra stays empty so validate can catch a fixture the engine disagrees with.
        const c = portData().costs.find((x) => x.collegeId === JORDAN.collegeId);
        if (!c) return { required: [], extra: [], problems: ["jordanData has no cost row for UT Austin"] };
        const engine = computeGap({
          costOfAttendanceUsd: c.costOfAttendanceUsd,
          freeMoneyUsd: c.freeMoneyUsd,
          pendingUsd: c.pendingUsd,
        });
        const problems =
          engine.gapIfPendingWinUsd === c.gapIfPendingWinUsd
            ? []
            : [
                `computeGap gives ${engine.gapIfPendingWinUsd} if the award comes through; the fixture says ${c.gapIfPendingWinUsd}`,
              ];
        return { required: [c.gapIfPendingWinUsd], extra: [], problems };
      },
    ),
    mathCase(
      "loan-payment",
      "A monthly payment on a 10-year federal loan",
      "If I borrow $27,000 in federal loans at 6.39% and repay over 10 years, about what's my monthly payment?",
      () => portData(),
      () => {
        const loan = estimateLoanPayment(LOAN);
        return {
          required: [loan.monthlyUsd],
          extra: [LOAN.principalUsd, loan.monthlyUsd, loan.totalInterestUsd, LOAN.principalUsd + loan.totalInterestUsd],
        };
      },
    ),
  ],
};
