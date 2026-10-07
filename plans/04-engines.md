# Plan 04: Engines (Agent D)

`@scholarcrew/engines` holds the pure, synchronous calculators every other layer trusts for numbers: Ledger's money math (gap, offer comparison, loan payments, net price, won awards), the eligibility matcher with human-readable reasons, fit and value-per-hour ranking, scam rules, calendar math in the student's time zone, word and character limits, merit tiers, superscores, retake value, and plan ordering. Nothing here does I/O, reads a clock, or calls a model; callers pass `now` and `timeZone` in. Core services (plans 06–08) and the Compass calculator tools (plan 09) call these functions, so the numbers on screen and the numbers the crew quotes come from the same code. Feature IDs: WK-01, WK-02 (plan ordering, Monday week start), WK-03 (gap), WK-04 (days left, 14-day warning), SC-02 (matcher and reasons), SC-05 (value ranking), SC-06 (scam shield), SC-09 (won awards per year), ES-03 (limits), IM-04 (150 code points), CO-06 (merit tiers), MO-01 (net price estimate), MO-03 (gap), MO-06 (compare offers), MO-09 (loan payments), MO-10 (gap math reused with the budget), MO-11 (public offer tool), PR-02 (superscore), PR-03 (retake value), NO-03 (7/3/1 reminders).

Conventions this plan relies on (from `00-overview.md` section 3): money is whole dollars, GPA is a number (3.72), calendar dates are `IsoDate` strings, a week starts Monday in the student's `timeZone`. Every exported function and type below matches section 9.2 exactly. Domain types are imported from `@scholarcrew/domain`; none are redefined here.

## Files

- Create: `packages/engines/package.json`
- Create: `packages/engines/tsconfig.json`
- Create: `packages/engines/vitest.config.ts`
- Create: `packages/engines/src/index.ts` (rewritten in full by each task as exports are added)
- Create: `packages/engines/src/money.ts`
- Create: `packages/engines/src/estimates.ts`
- Create: `packages/engines/src/eligibility.ts`
- Create: `packages/engines/src/ranking.ts`
- Create: `packages/engines/src/scams.ts`
- Create: `packages/engines/src/dates.ts`
- Create: `packages/engines/src/limits.ts`
- Create: `packages/engines/src/merit.ts`
- Create: `packages/engines/src/plan.ts`
- Test: `packages/engines/src/money.test.ts`
- Test: `packages/engines/src/estimates.test.ts`
- Test: `packages/engines/src/eligibility.test.ts`
- Test: `packages/engines/src/ranking.test.ts`
- Test: `packages/engines/src/scams.test.ts`
- Test: `packages/engines/src/dates.test.ts`
- Test: `packages/engines/src/limits.test.ts`
- Test: `packages/engines/src/merit.test.ts`
- Test: `packages/engines/src/plan.test.ts`
- Test: `packages/engines/src/index.test.ts`
- Modify: nothing outside `packages/engines/**`.

Notes for consumers:

- `compareOffers` accepts lines shaped `Pick<OfferLine, "amountUsd" | "category" | "renewable">` as in the contract, plus an optional `label`. Passing full `OfferLine` rows (plan 08) or `PublicOfferInput` lines includes the label, so warnings read "$6,000 First-Year Welcome Grant is year 1 only". Without a label the warning uses the category ("$6,000 grant is year 1 only").
- `estimateLoanPayment` returns `LoanEstimate` whose `label` defaults to `"<years>-year standard plan"`. `money.loanEstimates` (plan 08) overrides it with the offer line label: `{ ...estimateLoanPayment(i), label: line.label }`.
- `evaluateEligibility` marks every reason that comes from a sensitive fact with `sensitive: true`. Core strips those before anything reaches the family room (SC-02). Unknowns never contain sensitive values.
- `weekStartFor`, `daysUntil`, and `reminderOffsetsDue` use the local calendar date in `timeZone` via `Intl.DateTimeFormat`, then do whole-day math on UTC midnights, so DST changes never produce half days. An invalid `timeZone` throws the `RangeError` from `Intl`. A malformed or impossible `IsoDate` (`"2026-02-30"`) also throws `RangeError`.
- `detectScamSignals` ignores fee phrases right after "no", "without", "zero", or "free of", so "No application fee." on a clean listing doesn't flag.

## Tasks

### D1: Package scaffold

Config-only task: no behavior yet, so steps 1–2 are "install and see the package link".

- [ ] **Step 1: Create the package files**

`packages/engines/package.json`:

```json
{
  "name": "@scholarcrew/engines",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scholarcrew/domain": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

`packages/engines/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src"]
}
```

`packages/engines/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
```

`packages/engines/src/index.ts`:

```ts
export {};
```

- [ ] **Step 2: Install and see the package link**

Run: `pnpm install`
Expected: `@scholarcrew/domain` is linked into `packages/engines/node_modules/@scholarcrew/domain`; no errors. Don't commit `pnpm-lock.yaml` (the integrator owns it).

- [ ] **Step 3: Run the typecheck**

Run: `pnpm --filter @scholarcrew/engines typecheck`
Expected: `tsc --noEmit` exits 0 and prints nothing.

- [ ] **Step 4: Commit**

```bash
git add packages/engines/package.json packages/engines/tsconfig.json packages/engines/vitest.config.ts packages/engines/src/index.ts
git commit -m "feat(engines): package scaffold"
```

### D2: Ledger gap and offer comparison

Worked numbers come from `design/mockups/source/06_money.html` and `01_this_week.html`.

- [ ] **Step 1: Write the failing test**

`packages/engines/src/money.test.ts`:

```ts
import { OfferComparison } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { type OfferInput, categorizeOfferLine, compareOffers, computeGap, computePublicOffers, formatUsd } from "./money";

const stateU: OfferInput = {
  offerId: "state-u",
  collegeId: "200001",
  collegeName: "State U",
  costOfAttendanceUsd: 27800,
  lines: [
    { label: "State U Grant", amountUsd: 15600, category: "grant", renewable: true },
    { label: "State U Merit", amountUsd: 3000, category: "scholarship", renewable: true },
    { label: "Federal Work-Study", amountUsd: 2000, category: "work_study", renewable: true },
    { label: "Direct Subsidized Loan", amountUsd: 3500, category: "loan_federal_subsidized", renewable: true },
    { label: "Direct Unsubsidized Loan", amountUsd: 2000, category: "loan_federal_unsubsidized", renewable: true },
  ],
};

const riverside: OfferInput = {
  offerId: "riverside",
  collegeId: "200002",
  collegeName: "Riverside College",
  costOfAttendanceUsd: 31200,
  lines: [
    { label: "Riverside Grant", amountUsd: 18400, category: "grant", renewable: true },
    { label: "First-Year Welcome Grant", amountUsd: 6000, category: "grant", renewable: false },
    { label: "Direct Subsidized Loan", amountUsd: 3500, category: "loan_federal_subsidized", renewable: true },
  ],
};

const northgate: OfferInput = {
  offerId: "northgate",
  collegeId: "200003",
  collegeName: "Northgate University",
  costOfAttendanceUsd: 68400,
  lines: [
    { label: "Northgate Grant", amountUsd: 55600, category: "grant", renewable: true },
    { label: "Federal Work-Study", amountUsd: 3000, category: "work_study", renewable: true },
    { label: "Direct Subsidized Loan", amountUsd: 3500, category: "loan_federal_subsidized", renewable: true },
    { label: "Direct Unsubsidized Loan", amountUsd: 2000, category: "loan_federal_unsubsidized", renewable: true },
  ],
};

describe("computeGap", () => {
  it("matches the State U gap card", () => {
    expect(computeGap({ costOfAttendanceUsd: 27800, freeMoneyUsd: 18600, pendingUsd: 4750 })).toEqual({
      gapUsd: 9200,
      gapIfPendingWinUsd: 4450,
    });
  });

  it("never goes below zero", () => {
    expect(computeGap({ costOfAttendanceUsd: 10000, freeMoneyUsd: 12000, pendingUsd: 500 })).toEqual({
      gapUsd: 0,
      gapIfPendingWinUsd: 0,
    });
    expect(computeGap({ costOfAttendanceUsd: 10000, freeMoneyUsd: 4000, pendingUsd: 9000 })).toEqual({
      gapUsd: 6000,
      gapIfPendingWinUsd: 0,
    });
  });

  it("handles zero pending and zero cost", () => {
    expect(computeGap({ costOfAttendanceUsd: 27800, freeMoneyUsd: 18600, pendingUsd: 0 })).toEqual({
      gapUsd: 9200,
      gapIfPendingWinUsd: 9200,
    });
    expect(computeGap({ costOfAttendanceUsd: 0, freeMoneyUsd: 0, pendingUsd: 0 })).toEqual({
      gapUsd: 0,
      gapIfPendingWinUsd: 0,
    });
  });
});

describe("formatUsd", () => {
  it("writes whole dollars with commas, rounds, and puts the sign first (R3V-5)", () => {
    expect(formatUsd(6000)).toBe("$6,000");
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(12.5)).toBe("$13");
    expect(formatUsd(-500)).toBe("-$500");
    expect(formatUsd(1234567)).toBe("$1,234,567");
  });
});

describe("categorizeOfferLine", () => {
  it("maps every category", () => {
    expect(categorizeOfferLine("grant")).toBe("free");
    expect(categorizeOfferLine("scholarship")).toBe("free");
    expect(categorizeOfferLine("work_study")).toBe("work_study");
    expect(categorizeOfferLine("loan_federal_subsidized")).toBe("loan");
    expect(categorizeOfferLine("loan_federal_unsubsidized")).toBe("loan");
    expect(categorizeOfferLine("loan_parent_plus")).toBe("loan");
    expect(categorizeOfferLine("loan_private")).toBe("loan");
    expect(categorizeOfferLine("other")).toBe("other");
  });
});

describe("compareOffers", () => {
  it("reproduces the compare-offers mockup", () => {
    const result = compareOffers([stateU, riverside, northgate]);
    expect(result.columns).toEqual([
      {
        offerId: "state-u",
        collegeId: "200001",
        collegeName: "State U",
        costOfAttendanceUsd: 27800,
        freeMoneyUsd: 18600,
        workStudyUsd: 2000,
        loansUsd: 5500,
        letterSaysOweUsd: 1700,
        reallyCostsUsd: 9200,
        fourYearUsd: 36800,
        oneTimeFreeUsd: 0,
        warnings: [],
      },
      {
        offerId: "riverside",
        collegeId: "200002",
        collegeName: "Riverside College",
        costOfAttendanceUsd: 31200,
        freeMoneyUsd: 24400,
        workStudyUsd: 0,
        loansUsd: 3500,
        letterSaysOweUsd: 3300,
        reallyCostsUsd: 6800,
        fourYearUsd: 45200,
        oneTimeFreeUsd: 6000,
        warnings: ["$6,000 First-Year Welcome Grant is year 1 only"],
      },
      {
        offerId: "northgate",
        collegeId: "200003",
        collegeName: "Northgate University",
        costOfAttendanceUsd: 68400,
        freeMoneyUsd: 55600,
        workStudyUsd: 3000,
        loansUsd: 5500,
        letterSaysOweUsd: 4300,
        reallyCostsUsd: 12800,
        fourYearUsd: 51200,
        oneTimeFreeUsd: 0,
        warnings: [],
      },
    ]);
    expect(result.lowestFourYearOfferId).toBe("state-u");
    expect(result.assumptions).toEqual(["Costs stay flat for 4 years", "Renewable awards are kept"]);
  });

  it("returns a value that satisfies the domain schema", () => {
    expect(OfferComparison.safeParse(compareOffers([stateU, riverside, northgate])).success).toBe(true);
  });

  it("ignores lines in the other category", () => {
    const withOther = { ...stateU, lines: [...stateU.lines, { amountUsd: 500, category: "other" as const, renewable: false }] };
    const col = compareOffers([withOther]).columns[0];
    expect(col?.letterSaysOweUsd).toBe(1700);
    expect(col?.reallyCostsUsd).toBe(9200);
    expect(col?.warnings).toEqual([]);
  });

  it("falls back to the category name when a line has no label", () => {
    const noLabels = { ...riverside, lines: riverside.lines.map(({ label: _label, ...rest }) => rest) };
    expect(compareOffers([noLabels]).columns[0]?.warnings).toEqual(["$6,000 grant is year 1 only"]);
  });

  it("does not warn about zero-dollar one-time lines", () => {
    const zero = { ...stateU, lines: [{ label: "Placeholder", amountUsd: 0, category: "grant" as const, renewable: false }] };
    expect(compareOffers([zero]).columns[0]?.warnings).toEqual([]);
  });

  it("floors costs at zero when free money exceeds the cost", () => {
    const rich: OfferInput = {
      offerId: "rich",
      collegeId: "1",
      collegeName: "Rich",
      costOfAttendanceUsd: 20000,
      lines: [
        { label: "Full ride", amountUsd: 25000, category: "scholarship", renewable: true },
        { label: "Loan", amountUsd: 1000, category: "loan_private", renewable: true },
      ],
    };
    const col = compareOffers([rich]).columns[0];
    expect(col).toMatchObject({ letterSaysOweUsd: 0, reallyCostsUsd: 0, fourYearUsd: 0, oneTimeFreeUsd: 0 });
  });

  it("counts later years at full cost minus renewable free money only", () => {
    const oneTime: OfferInput = {
      offerId: "x",
      collegeId: "1",
      collegeName: "X",
      costOfAttendanceUsd: 20000,
      lines: [{ label: "Welcome", amountUsd: 20000, category: "grant", renewable: false }],
    };
    expect(compareOffers([oneTime]).columns[0]).toMatchObject({ reallyCostsUsd: 0, fourYearUsd: 60000, oneTimeFreeUsd: 20000 });
  });

  it("returns an empty comparison for no offers", () => {
    expect(compareOffers([])).toEqual({
      columns: [],
      lowestFourYearOfferId: null,
      assumptions: ["Costs stay flat for 4 years", "Renewable awards are kept"],
    });
  });

  it("keeps the first offer on a four-year tie", () => {
    const twin = { ...stateU, offerId: "twin" };
    expect(compareOffers([stateU, twin]).lowestFourYearOfferId).toBe("state-u");
    expect(compareOffers([twin, stateU]).lowestFourYearOfferId).toBe("twin");
  });
});

describe("computePublicOffers", () => {
  it("runs the same math with generated ids", () => {
    const result = computePublicOffers({
      offers: [
        {
          name: "State U",
          costOfAttendanceUsd: 27800,
          lines: stateU.lines.map((l) => ({ label: l.label ?? "", amountUsd: l.amountUsd, category: l.category, renewable: l.renewable })),
        },
        {
          name: "Riverside College",
          costOfAttendanceUsd: 31200,
          lines: riverside.lines.map((l) => ({ label: l.label ?? "", amountUsd: l.amountUsd, category: l.category, renewable: l.renewable })),
        },
      ],
    });
    expect(result.columns.map((c) => [c.offerId, c.collegeId, c.collegeName, c.reallyCostsUsd, c.fourYearUsd])).toEqual([
      ["offer-1", "", "State U", 9200, 36800],
      ["offer-2", "", "Riverside College", 6800, 45200],
    ]);
    expect(result.columns[1]?.warnings).toEqual(["$6,000 First-Year Welcome Grant is year 1 only"]);
    expect(result.lowestFourYearOfferId).toBe("offer-1");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/engines test`
Expected: FAIL `src/money.test.ts` with `Failed to resolve import "./money"`.

- [ ] **Step 3: Write the implementation**

`packages/engines/src/money.ts`:

```ts
import type { OfferColumn, OfferComparison, OfferLine, OfferLineCategory, PublicOfferInput } from "@scholarcrew/domain";

/** The contract's line shape plus an optional label used in warnings. Full OfferLine rows fit. */
export type OfferLineInput = Pick<OfferLine, "amountUsd" | "category" | "renewable"> & { label?: string };

export type OfferInput = {
  offerId: string;
  collegeId: string;
  collegeName: string;
  costOfAttendanceUsd: number;
  lines: OfferLineInput[];
};

export const OFFER_ASSUMPTIONS: readonly string[] = ["Costs stay flat for 4 years", "Renewable awards are kept"];

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * "$6,000". Whole dollars, en-US grouping, rounded; negatives read "-$500".
 * The one money formatter for core and agents (R3V-5): 07, 08, and 10 import it from `@scholarcrew/engines`.
 */
export function formatUsd(n: number): string {
  return USD.format(Math.round(n));
}

export function computeGap(input: { costOfAttendanceUsd: number; freeMoneyUsd: number; pendingUsd: number }): {
  gapUsd: number;
  gapIfPendingWinUsd: number;
} {
  const gapUsd = Math.max(0, input.costOfAttendanceUsd - input.freeMoneyUsd);
  const gapIfPendingWinUsd = Math.max(0, gapUsd - input.pendingUsd);
  return { gapUsd, gapIfPendingWinUsd };
}

export function categorizeOfferLine(category: OfferLineCategory): "free" | "work_study" | "loan" | "other" {
  switch (category) {
    case "grant":
    case "scholarship":
      return "free";
    case "work_study":
      return "work_study";
    case "loan_federal_subsidized":
    case "loan_federal_unsubsidized":
    case "loan_parent_plus":
    case "loan_private":
      return "loan";
    case "other":
      return "other";
  }
}

function buildColumn(offer: OfferInput): OfferColumn {
  let freeMoneyUsd = 0;
  let renewableFreeUsd = 0;
  let workStudyUsd = 0;
  let loansUsd = 0;
  const warnings: string[] = [];

  for (const line of offer.lines) {
    const kind = categorizeOfferLine(line.category);
    if (kind === "free") {
      freeMoneyUsd += line.amountUsd;
      if (line.renewable) {
        renewableFreeUsd += line.amountUsd;
      } else if (line.amountUsd > 0) {
        const label = line.label?.trim() || line.category;
        warnings.push(`${formatUsd(line.amountUsd)} ${label} is year 1 only`);
      }
    } else if (kind === "work_study") {
      workStudyUsd += line.amountUsd;
    } else if (kind === "loan") {
      loansUsd += line.amountUsd;
    }
  }

  const coa = offer.costOfAttendanceUsd;
  const reallyCostsUsd = Math.max(0, coa - freeMoneyUsd);
  return {
    offerId: offer.offerId,
    collegeId: offer.collegeId,
    collegeName: offer.collegeName,
    costOfAttendanceUsd: coa,
    freeMoneyUsd,
    workStudyUsd,
    loansUsd,
    letterSaysOweUsd: Math.max(0, coa - freeMoneyUsd - workStudyUsd - loansUsd),
    reallyCostsUsd,
    fourYearUsd: reallyCostsUsd + 3 * Math.max(0, coa - renewableFreeUsd),
    oneTimeFreeUsd: freeMoneyUsd - renewableFreeUsd,
    warnings,
  };
}

export function compareOffers(offers: OfferInput[]): OfferComparison {
  const columns = offers.map(buildColumn);
  let lowest: OfferColumn | null = null;
  for (const column of columns) {
    if (lowest === null || column.fourYearUsd < lowest.fourYearUsd) lowest = column;
  }
  return {
    columns,
    lowestFourYearOfferId: lowest ? lowest.offerId : null,
    assumptions: [...OFFER_ASSUMPTIONS],
  };
}

export function computePublicOffers(input: PublicOfferInput): OfferComparison {
  return compareOffers(
    input.offers.map((offer, i) => ({
      offerId: `offer-${i + 1}`,
      collegeId: "",
      collegeName: offer.name,
      costOfAttendanceUsd: offer.costOfAttendanceUsd,
      lines: offer.lines,
    })),
  );
}
```

`packages/engines/src/index.ts`:

```ts
export {
  type OfferInput,
  type OfferLineInput,
  categorizeOfferLine,
  compareOffers,
  computeGap,
  computePublicOffers,
  formatUsd,
} from "./money";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/engines test && pnpm --filter @scholarcrew/engines typecheck`
Expected: PASS, 1 file, 15 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/engines/src/money.ts packages/engines/src/money.test.ts packages/engines/src/index.ts
git commit -m "feat(engines): Ledger gap and offer comparison"
```

### D3: Loan payments, net price estimate, won awards per year

- [ ] **Step 1: Write the failing test**

`packages/engines/src/estimates.test.ts`:

```ts
import { LoanEstimate, type NetPriceByIncome } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { estimateLoanPayment, estimateNetPrice, wonScholarshipsForYear } from "./estimates";

describe("estimateLoanPayment", () => {
  it("uses the standard amortization formula in whole dollars", () => {
    expect(estimateLoanPayment({ principalUsd: 10000, annualRatePct: 6, years: 10 })).toMatchObject({
      monthlyUsd: 111,
      totalInterestUsd: 3322,
    });
    expect(estimateLoanPayment({ principalUsd: 27000, annualRatePct: 5, years: 10 })).toMatchObject({
      monthlyUsd: 286,
      totalInterestUsd: 7365,
    });
  });

  it("divides evenly at 0% and charges no interest", () => {
    expect(estimateLoanPayment({ principalUsd: 12000, annualRatePct: 0, years: 10 })).toMatchObject({
      monthlyUsd: 100,
      totalInterestUsd: 0,
    });
    expect(estimateLoanPayment({ principalUsd: 5500, annualRatePct: 0, years: 10 })).toMatchObject({
      monthlyUsd: 46,
      totalInterestUsd: 0,
    });
  });

  it("returns zero for a zero principal", () => {
    expect(estimateLoanPayment({ principalUsd: 0, annualRatePct: 6.53, years: 10 })).toMatchObject({
      monthlyUsd: 0,
      totalInterestUsd: 0,
    });
  });

  it("echoes inputs with a default label and fits the domain schema", () => {
    const est = estimateLoanPayment({ principalUsd: 5500, annualRatePct: 6.53, years: 10 });
    expect(est).toMatchObject({ label: "10-year standard plan", principalUsd: 5500, annualRatePct: 6.53, years: 10 });
    expect(LoanEstimate.safeParse(est).success).toBe(true);
  });
});

const bands: NetPriceByIncome = {
  overall: 12000,
  under_30k: 6500,
  "30_48k": 8000,
  "48_75k": 9200,
  "75_110k": 14000,
  over_110k: null,
};

describe("estimateNetPrice", () => {
  it("uses the band for the shared income range", () => {
    expect(estimateNetPrice({ costOfAttendanceUsd: 27800, netPriceByIncome: bands }, "48_75k")).toEqual({
      netPriceUsd: 9200,
      costOfAttendanceUsd: 27800,
      freeMoneyUsd: 18600,
      isEstimate: true,
    });
  });

  it("uses the overall average when no range is shared", () => {
    expect(estimateNetPrice({ costOfAttendanceUsd: 27800, netPriceByIncome: bands }, null)).toEqual({
      netPriceUsd: 12000,
      costOfAttendanceUsd: 27800,
      freeMoneyUsd: 15800,
      isEstimate: true,
    });
  });

  it("falls back to the overall average when the band is missing", () => {
    expect(estimateNetPrice({ costOfAttendanceUsd: 27800, netPriceByIncome: bands }, "over_110k")?.netPriceUsd).toBe(12000);
  });

  it("returns null when the net price or the cost is missing", () => {
    const empty: NetPriceByIncome = { ...bands, overall: null, under_30k: null };
    expect(estimateNetPrice({ costOfAttendanceUsd: 27800, netPriceByIncome: empty }, "under_30k")).toBeNull();
    expect(estimateNetPrice({ costOfAttendanceUsd: null, netPriceByIncome: bands }, "48_75k")).toBeNull();
  });

  it("never reports negative free money", () => {
    expect(estimateNetPrice({ costOfAttendanceUsd: 10000, netPriceByIncome: bands }, null)?.freeMoneyUsd).toBe(0);
  });
});

describe("wonScholarshipsForYear", () => {
  const apps = [
    { stage: "won" as const, outcomeUsd: 2500, outcomeRenewable: false },
    { stage: "won" as const, outcomeUsd: 1000, outcomeRenewable: true },
    { stage: "won" as const, outcomeUsd: null, outcomeRenewable: null },
    { stage: "submitted" as const, outcomeUsd: 5000, outcomeRenewable: true },
    { stage: "lost" as const, outcomeUsd: 300, outcomeRenewable: false },
  ];

  it("counts every won award in year 1", () => {
    expect(wonScholarshipsForYear(apps, 0)).toBe(3500);
  });

  it("counts only renewable won awards in later years", () => {
    expect(wonScholarshipsForYear(apps, 1)).toBe(1000);
    expect(wonScholarshipsForYear(apps, 3)).toBe(1000);
  });

  it("returns 0 for no apps or a negative year", () => {
    expect(wonScholarshipsForYear([], 0)).toBe(0);
    expect(wonScholarshipsForYear(apps, -1)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/engines test`
Expected: FAIL `src/estimates.test.ts` with `Failed to resolve import "./estimates"`; `src/money.test.ts` still passes.

- [ ] **Step 3: Write the implementation**

`packages/engines/src/estimates.ts`:

```ts
import type { College, IncomeRange, LoanEstimate, ScholarshipApplication } from "@scholarcrew/domain";

/**
 * Standard amortized payment: P·r / (1 − (1 + r)^−n), r = pct / 1200, n = 12 · years.
 * monthlyUsd is rounded to whole dollars; totalInterestUsd uses the unrounded payment so 0% loans show $0.
 */
export function estimateLoanPayment(input: { principalUsd: number; annualRatePct: number; years: number }): LoanEstimate {
  const { principalUsd, annualRatePct, years } = input;
  const n = 12 * years;
  const r = annualRatePct / 1200;
  let exactMonthly = 0;
  if (principalUsd > 0 && n > 0) {
    if (r === 0) {
      exactMonthly = principalUsd / n;
    } else {
      exactMonthly = (principalUsd * r) / (1 - (1 + r) ** -n);
    }
  }
  return {
    label: `${years}-year standard plan`,
    principalUsd,
    annualRatePct,
    years,
    monthlyUsd: Math.round(exactMonthly),
    totalInterestUsd: Math.max(0, Math.round(exactMonthly * n - principalUsd)),
  };
}

/** Scorecard net price for the income band, else the overall average. Null when a number is missing. */
export function estimateNetPrice(
  college: Pick<College, "costOfAttendanceUsd" | "netPriceByIncome">,
  incomeRange: IncomeRange | null,
): { netPriceUsd: number; costOfAttendanceUsd: number; freeMoneyUsd: number; isEstimate: true } | null {
  const bands = college.netPriceByIncome;
  const net = (incomeRange ? bands[incomeRange] : null) ?? bands.overall;
  const coa = college.costOfAttendanceUsd;
  if (net === null || coa === null) return null;
  return { netPriceUsd: net, costOfAttendanceUsd: coa, freeMoneyUsd: Math.max(0, coa - net), isEstimate: true };
}

/** Year 0 (first year) counts every won award; later years count renewable ones only. */
export function wonScholarshipsForYear(
  apps: Array<Pick<ScholarshipApplication, "stage" | "outcomeUsd" | "outcomeRenewable">>,
  yearIndex: number,
): number {
  if (yearIndex < 0) return 0;
  let total = 0;
  for (const app of apps) {
    if (app.stage !== "won" || app.outcomeUsd === null) continue;
    if (yearIndex >= 1 && app.outcomeRenewable !== true) continue;
    total += app.outcomeUsd;
  }
  return total;
}
```

`packages/engines/src/index.ts`:

```ts
export { estimateLoanPayment, estimateNetPrice, wonScholarshipsForYear } from "./estimates";
export {
  type OfferInput,
  type OfferLineInput,
  categorizeOfferLine,
  compareOffers,
  computeGap,
  computePublicOffers,
  formatUsd,
} from "./money";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/engines test && pnpm --filter @scholarcrew/engines typecheck`
Expected: PASS, 2 files, 27 tests (estimates 12 added); `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/engines/src/estimates.ts packages/engines/src/estimates.test.ts packages/engines/src/index.ts
git commit -m "feat(engines): loan payments, net price estimate, won awards per year"
```

### D4: Eligibility matcher with reasons

Each check returns pass (with an optional human reason), fail, or unknown. The listing's local area contributes at most one location reason, the most specific one (city, then county, then state), and reasons are deduplicated by text, so the Rotary listing reads exactly like `10_scholarship_detail.html`: three reasons and one thing only the student can confirm.

- [ ] **Step 1: Write the failing test**

`packages/engines/src/eligibility.test.ts`:

```ts
import { type EligibilityRule, type LocalArea, NO_SENSITIVE, SENSITIVE_RULE_TYPES } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { type MatcherProfile, evaluateEligibility } from "./eligibility";

const jordan: MatcherProfile = {
  state: "TX",
  county: "Maple",
  city: "Eastside",
  classYear: 2027,
  gpa: 3.72,
  intendedMajors: ["Mechanical engineering"],
  interests: ["robotics"],
  act: 28,
  sat: null,
  serviceHours: 42,
  sensitive: NO_SENSITIVE,
};

const NATIONAL: LocalArea = { national: true, state: null, counties: [], cities: [] };

function run(rules: EligibilityRule[], area: LocalArea = NATIONAL, p: Partial<MatcherProfile> = {}) {
  return evaluateEligibility(rules, area, { ...jordan, ...p });
}

describe("evaluateEligibility: Rotary Club of Eastside", () => {
  it("gives three reasons and one unknown", () => {
    const result = run(
      [
        { type: "county_in", state: "TX", counties: ["Maple"] },
        { type: "class_year_in", years: [2027] },
        { type: "gpa_min", min: 3.0 },
        { type: "custom", text: "Not related to a Rotary Club of Eastside member" },
      ],
      { national: false, state: "TX", counties: ["Maple"], cities: [] },
    );
    expect(result).toEqual({
      eligible: true,
      reasons: [
        { code: "local_county", text: "You live in Maple County", sensitive: false },
        { code: "class_year_in", text: "Class of 2027", sensitive: false },
        { code: "gpa_min", text: "Your GPA 3.72 meets the 3.0 minimum", sensitive: false },
      ],
      unknowns: ["Not related to a Rotary Club of Eastside member"],
    });
  });
});

describe("evaluateEligibility: local area", () => {
  it("passes national listings with no location reason", () => {
    expect(run([])).toEqual({ eligible: true, reasons: [], unknowns: [] });
  });

  it("requires the state to match", () => {
    expect(run([], { national: false, state: "OK", counties: [], cities: [] }).eligible).toBe(false);
    expect(run([], { national: false, state: "TX", counties: [], cities: [] }).reasons).toEqual([
      { code: "local_state", text: "You live in TX", sensitive: false },
    ]);
  });

  it("matches counties case-insensitively, with or without the word County", () => {
    const area = (counties: string[]): LocalArea => ({ national: false, state: "TX", counties, cities: [] });
    expect(run([], area(["maple county"])).eligible).toBe(true);
    expect(run([], area(["MAPLE"]), { county: "Maple County" }).reasons[0]?.text).toBe("You live in Maple County");
    expect(run([], area(["Travis"])).eligible).toBe(false);
  });

  it("matches cities case-insensitively and fails when the profile has no city", () => {
    const area: LocalArea = { national: false, state: "TX", counties: ["Maple"], cities: ["eastside"] };
    expect(run([], area).reasons).toEqual([{ code: "local_city", text: "You live in Eastside", sensitive: false }]);
    expect(run([], area, { city: "" }).eligible).toBe(false);
  });
});

describe("evaluateEligibility: profile rules", () => {
  it("checks state, county, and city rules", () => {
    expect(run([{ type: "state_in", states: ["TX", "OK"] }]).reasons[0]?.text).toBe("You live in TX");
    expect(run([{ type: "state_in", states: ["OK"] }]).eligible).toBe(false);
    expect(run([{ type: "county_in", state: "TX", counties: ["Maple"] }]).reasons[0]?.code).toBe("county_in");
    expect(run([{ type: "county_in", state: "OK", counties: ["Maple"] }]).eligible).toBe(false);
    expect(run([{ type: "city_in", state: "TX", cities: ["EASTSIDE"] }]).reasons[0]?.text).toBe("You live in Eastside");
    expect(run([{ type: "city_in", state: "TX", cities: ["Austin"] }]).eligible).toBe(false);
  });

  it("checks class year and reports a missing one as unknown", () => {
    expect(run([{ type: "class_year_in", years: [2028] }]).eligible).toBe(false);
    expect(run([{ type: "class_year_in", years: [2027] }], NATIONAL, { classYear: null })).toEqual({
      eligible: true,
      reasons: [],
      unknowns: ["Class year not on file"],
    });
  });

  it("checks GPA minimums and reports a missing GPA as unknown", () => {
    expect(run([{ type: "gpa_min", min: 3.8 }]).eligible).toBe(false);
    expect(run([{ type: "gpa_min", min: 3.72 }]).reasons[0]?.text).toBe("Your GPA 3.72 meets the 3.72 minimum");
    expect(run([{ type: "gpa_min", min: 3.5 }], NATIONAL, { gpa: 4 }).reasons[0]?.text).toBe(
      "Your GPA 4.0 meets the 3.5 minimum",
    );
    expect(run([{ type: "gpa_min", min: 3.0 }], NATIONAL, { gpa: null })).toEqual({
      eligible: true,
      reasons: [],
      unknowns: ["GPA not on file"],
    });
  });

  it("matches majors and interests by case-insensitive substring either way", () => {
    expect(run([{ type: "major_any", majors: ["engineering"] }]).reasons[0]?.text).toBe(
      "You plan to study Mechanical engineering",
    );
    expect(run([{ type: "major_any", majors: ["Mechanical Engineering Technology"] }]).eligible).toBe(true);
    expect(run([{ type: "major_any", majors: ["Nursing"] }]).eligible).toBe(false);
    expect(run([{ type: "major_any", majors: ["Nursing"] }], NATIONAL, { intendedMajors: [] }).unknowns).toEqual([
      "Intended major not on file",
    ]);
    expect(run([{ type: "interest_any", interests: ["Robotics club"] }]).reasons[0]?.text).toBe(
      "You're interested in robotics",
    );
    expect(run([{ type: "interest_any", interests: ["music"] }]).eligible).toBe(false);
    expect(run([{ type: "interest_any", interests: ["music"] }], NATIONAL, { interests: [] }).unknowns).toEqual([
      "Interests not on file",
    ]);
  });

  it("checks test minimums and reports a missing score as unknown", () => {
    expect(run([{ type: "test_min", test: "ACT", min: 24 }]).reasons[0]?.text).toBe("Your ACT 28 meets the 24 minimum");
    expect(run([{ type: "test_min", test: "ACT", min: 30 }]).eligible).toBe(false);
    expect(run([{ type: "test_min", test: "SAT", min: 1200 }])).toEqual({
      eligible: true,
      reasons: [],
      unknowns: ["SAT score not on file"],
    });
  });

  it("checks service hours", () => {
    expect(run([{ type: "service_hours_min", hours: 40 }]).reasons[0]?.text).toBe("You have 42 service hours (40 needed)");
    expect(run([{ type: "service_hours_min", hours: 50 }]).eligible).toBe(false);
  });

  it("keeps eligibility when only unknowns remain and deduplicates them", () => {
    const result = run([
      { type: "custom", text: "Child of a credit union member" },
      { type: "custom", text: "Child of a credit union member" },
    ]);
    expect(result).toEqual({ eligible: true, reasons: [], unknowns: ["Child of a credit union member"] });
  });
});

describe("evaluateEligibility: sensitive rules", () => {
  it("fails every sensitive rule when nothing is shared", () => {
    const rules: EligibilityRule[] = [
      { type: "first_gen" },
      { type: "income_max", maxRange: "over_110k" },
      { type: "heritage_any", values: ["Mexican American"] },
      { type: "disability" },
      { type: "religion_any", values: ["Catholic"] },
      { type: "military_family" },
      { type: "foster_care" },
    ];
    for (const rule of rules) expect(run([rule]).eligible).toBe(false);
  });

  it("marks reasons from sensitive facts as sensitive", () => {
    const sensitive = {
      firstGen: true,
      incomeRange: "30_48k" as const,
      heritage: ["Mexican American"],
      disability: true,
      religion: ["Catholic"],
      militaryFamily: true,
      fosterCare: true,
      noncitizenFilter: false,
    };
    const result = run(
      [
        { type: "first_gen" },
        { type: "income_max", maxRange: "48_75k" },
        { type: "heritage_any", values: ["mexican"] },
        { type: "disability" },
        { type: "religion_any", values: ["CATHOLIC"] },
        { type: "military_family" },
        { type: "foster_care" },
        { type: "class_year_in", years: [2027] },
      ],
      NATIONAL,
      { sensitive },
    );
    expect(result.eligible).toBe(true);
    expect(result.reasons.map((r) => [r.code, r.sensitive])).toEqual([
      ["first_gen", true],
      ["income_max", true],
      ["heritage_any", true],
      ["disability", true],
      ["religion_any", true],
      ["military_family", true],
      ["foster_care", true],
      ["class_year_in", false],
    ]);
    expect(result.reasons[0]?.text).toBe("You're first in your family to go to college");
    expect(result.reasons.map((r) => r.text).join(" ")).not.toMatch(/Mexican|Catholic|30_48k/i);
    expect(result.reasons.filter((r) => r.sensitive).map((r) => r.code)).toEqual(SENSITIVE_RULE_TYPES);
  });

  it("orders income ranges and fails when no range is shared", () => {
    const withRange = (incomeRange: MatcherProfile["sensitive"]["incomeRange"]) => ({
      sensitive: { ...NO_SENSITIVE, incomeRange },
    });
    const rule: EligibilityRule = { type: "income_max", maxRange: "48_75k" };
    expect(run([rule], NATIONAL, withRange("under_30k")).eligible).toBe(true);
    expect(run([rule], NATIONAL, withRange("48_75k")).eligible).toBe(true);
    expect(run([rule], NATIONAL, withRange("75_110k")).eligible).toBe(false);
    expect(run([rule], NATIONAL, withRange(null)).eligible).toBe(false);
  });

  it("applies the citizenship filter without adding a reason", () => {
    const rule: EligibilityRule = { type: "citizenship_required" };
    expect(run([rule])).toEqual({ eligible: true, reasons: [], unknowns: [] });
    expect(run([rule], NATIONAL, { sensitive: { ...NO_SENSITIVE, noncitizenFilter: true } }).eligible).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/engines test`
Expected: FAIL `src/eligibility.test.ts` with `Failed to resolve import "./eligibility"`; the other files pass.

- [ ] **Step 3: Write the implementation**

`packages/engines/src/eligibility.ts`:

```ts
import type { EligibilityRule, IncomeRange, LocalArea, MatchReason, SensitiveFactValues } from "@scholarcrew/domain";

export type MatcherProfile = {
  state: string;
  county: string;
  city: string;
  classYear: number | null;
  gpa: number | null;
  intendedMajors: string[];
  interests: string[];
  act: number | null;
  sat: number | null;
  serviceHours: number;
  sensitive: SensitiveFactValues;
};

/** Lowest to highest. income_max passes when the shared range is at or below the rule's range. */
export const INCOME_ORDER: readonly IncomeRange[] = ["under_30k", "30_48k", "48_75k", "75_110k", "over_110k"];

type Outcome = { kind: "pass"; reason: MatchReason | null } | { kind: "fail" } | { kind: "unknown"; text: string };

const FAIL: Outcome = { kind: "fail" };
const pass = (reason: MatchReason | null): Outcome => ({ kind: "pass", reason });
const unknown = (text: string): Outcome => ({ kind: "unknown", text });
const why = (code: string, text: string, sensitive = false): MatchReason => ({ code, text, sensitive });

const norm = (s: string): string => s.trim().toLowerCase();
const sameText = (a: string, b: string): boolean => norm(b).length > 0 && norm(a) === norm(b);
const countyKey = (s: string): string => norm(s).replace(/\s+county$/, "");
const sameCounty = (a: string, b: string): boolean => countyKey(b).length > 0 && countyKey(a) === countyKey(b);

function overlaps(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}

/** First profile value that overlaps any rule value, as the student typed it. */
function firstOverlap(have: string[], want: string[]): string | null {
  for (const h of have) {
    if (want.some((w) => overlaps(h, w))) return h.trim();
  }
  return null;
}

export function countyLabel(county: string): string {
  const c = county.trim();
  return /\bcounty$/i.test(c) ? c : `${c} County`;
}

/** 3.72 → "3.72", 3 → "3.0", 3.5 → "3.5". */
export function formatGpa(n: number): string {
  const s = n.toFixed(2);
  return s.endsWith("0") ? s.slice(0, -1) : s;
}

function checkLocalArea(area: LocalArea, p: MatcherProfile): Outcome {
  if (area.national) return pass(null);
  if (area.state !== null && !sameText(area.state, p.state)) return FAIL;
  if (area.counties.length > 0 && !area.counties.some((c) => sameCounty(c, p.county))) return FAIL;
  if (area.cities.length > 0 && !area.cities.some((c) => sameText(c, p.city))) return FAIL;
  if (area.cities.length > 0) return pass(why("local_city", `You live in ${p.city.trim()}`));
  if (area.counties.length > 0) return pass(why("local_county", `You live in ${countyLabel(p.county)}`));
  if (area.state !== null) return pass(why("local_state", `You live in ${p.state.trim().toUpperCase()}`));
  return pass(null);
}

function checkRule(rule: EligibilityRule, p: MatcherProfile): Outcome {
  const s = p.sensitive;
  switch (rule.type) {
    case "state_in":
      return rule.states.some((st) => sameText(st, p.state))
        ? pass(why("state_in", `You live in ${p.state.trim().toUpperCase()}`))
        : FAIL;
    case "county_in":
      return sameText(rule.state, p.state) && rule.counties.some((c) => sameCounty(c, p.county))
        ? pass(why("county_in", `You live in ${countyLabel(p.county)}`))
        : FAIL;
    case "city_in":
      return sameText(rule.state, p.state) && rule.cities.some((c) => sameText(c, p.city))
        ? pass(why("city_in", `You live in ${p.city.trim()}`))
        : FAIL;
    case "class_year_in":
      if (p.classYear === null) return unknown("Class year not on file");
      return rule.years.includes(p.classYear) ? pass(why("class_year_in", `Class of ${p.classYear}`)) : FAIL;
    case "gpa_min":
      if (p.gpa === null) return unknown("GPA not on file");
      return p.gpa >= rule.min
        ? pass(why("gpa_min", `Your GPA ${formatGpa(p.gpa)} meets the ${formatGpa(rule.min)} minimum`))
        : FAIL;
    case "major_any": {
      if (p.intendedMajors.length === 0) return unknown("Intended major not on file");
      const major = firstOverlap(p.intendedMajors, rule.majors);
      return major ? pass(why("major_any", `You plan to study ${major}`)) : FAIL;
    }
    case "interest_any": {
      if (p.interests.length === 0) return unknown("Interests not on file");
      const interest = firstOverlap(p.interests, rule.interests);
      return interest ? pass(why("interest_any", `You're interested in ${interest}`)) : FAIL;
    }
    case "first_gen":
      return s.firstGen ? pass(why("first_gen", "You're first in your family to go to college", true)) : FAIL;
    case "income_max":
      if (s.incomeRange === null) return FAIL;
      return INCOME_ORDER.indexOf(s.incomeRange) <= INCOME_ORDER.indexOf(rule.maxRange)
        ? pass(why("income_max", "Your family income is within this award's limit", true))
        : FAIL;
    case "heritage_any": {
      const heritage = firstOverlap(s.heritage, rule.values);
      return heritage ? pass(why("heritage_any", "Your heritage fits this award", true)) : FAIL;
    }
    case "disability":
      return s.disability ? pass(why("disability", "This award supports students with disabilities", true)) : FAIL;
    case "religion_any": {
      const religion = firstOverlap(s.religion, rule.values);
      return religion ? pass(why("religion_any", "Your faith community fits this award", true)) : FAIL;
    }
    case "military_family":
      return s.militaryFamily ? pass(why("military_family", "You're from a military family", true)) : FAIL;
    case "foster_care":
      return s.fosterCare ? pass(why("foster_care", "You've spent time in foster care", true)) : FAIL;
    case "citizenship_required":
      return s.noncitizenFilter ? FAIL : pass(null);
    case "test_min": {
      const score = rule.test === "ACT" ? p.act : p.sat;
      if (score === null) return unknown(`${rule.test} score not on file`);
      return score >= rule.min ? pass(why("test_min", `Your ${rule.test} ${score} meets the ${rule.min} minimum`)) : FAIL;
    }
    case "service_hours_min":
      return p.serviceHours >= rule.hours
        ? pass(why("service_hours_min", `You have ${Math.floor(p.serviceHours)} service hours (${rule.hours} needed)`))
        : FAIL;
    case "custom":
      return unknown(rule.text);
  }
}

export function evaluateEligibility(
  rules: EligibilityRule[],
  localArea: LocalArea,
  p: MatcherProfile,
): { eligible: boolean; reasons: MatchReason[]; unknowns: string[] } {
  const outcomes = [checkLocalArea(localArea, p), ...rules.map((rule) => checkRule(rule, p))];
  let eligible = true;
  const reasons: MatchReason[] = [];
  const unknowns: string[] = [];
  for (const outcome of outcomes) {
    if (outcome.kind === "fail") {
      eligible = false;
    } else if (outcome.kind === "unknown") {
      if (!unknowns.includes(outcome.text)) unknowns.push(outcome.text);
    } else {
      const reason = outcome.reason;
      if (reason && !reasons.some((r) => r.text === reason.text)) reasons.push(reason);
    }
  }
  return { eligible, reasons, unknowns };
}
```

`packages/engines/src/index.ts`:

```ts
export { type MatcherProfile, evaluateEligibility } from "./eligibility";
export { estimateLoanPayment, estimateNetPrice, wonScholarshipsForYear } from "./estimates";
export {
  type OfferInput,
  type OfferLineInput,
  categorizeOfferLine,
  compareOffers,
  computeGap,
  computePublicOffers,
  formatUsd,
} from "./money";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/engines test && pnpm --filter @scholarcrew/engines typecheck`
Expected: PASS, 3 files, 43 tests (eligibility 16 added); `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/engines/src/eligibility.ts packages/engines/src/eligibility.test.ts packages/engines/src/index.ts
git commit -m "feat(engines): eligibility matcher with human reasons"
```

### D5: Fit score and value ranking

`fitScore = clamp(round(50 + 10·reasons − 15·unknowns + (reusableStories > 0 ? 10 : 0)), 0, 100)`. `valuePerHour = amountMaxUsd × fitScore / 100 ÷ (max(estMinutes, 5) / 60)`, rounded to 2 decimals. Ranking groups open listings first, undated listings second, expired listings last; within each group it sorts by value per hour descending and then nearer deadline (SC-05).

- [ ] **Step 1: Write the failing test**

`packages/engines/src/ranking.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rankMatches, scoreMatch } from "./ranking";

const base = { amountMaxUsd: 1000, estMinutes: 60, reasonsCount: 0, unknownsCount: 0, daysUntilDeadline: 9, reusableStories: 0 };

describe("scoreMatch", () => {
  it("scores the Rotary match", () => {
    expect(
      scoreMatch({ amountMaxUsd: 2500, estMinutes: 45, reasonsCount: 3, unknownsCount: 1, daysUntilDeadline: 24, reusableStories: 1 }),
    ).toEqual({ fitScore: 75, valuePerHour: 2500 });
  });

  it("scores the Hill Country match", () => {
    expect(
      scoreMatch({ amountMaxUsd: 1000, estMinutes: 30, reasonsCount: 2, unknownsCount: 0, daysUntilDeadline: 9, reusableStories: 1 }),
    ).toEqual({ fitScore: 80, valuePerHour: 1600 });
  });

  it("starts at 50 and clamps to 0..100", () => {
    expect(scoreMatch(base).fitScore).toBe(50);
    expect(scoreMatch({ ...base, reasonsCount: 8, reusableStories: 2 }).fitScore).toBe(100);
    expect(scoreMatch({ ...base, unknownsCount: 5 })).toEqual({ fitScore: 0, valuePerHour: 0 });
  });

  it("treats anything under 5 minutes as 5 minutes", () => {
    expect(scoreMatch({ ...base, amountMaxUsd: 100, estMinutes: 0 }).valuePerHour).toBe(600);
    expect(scoreMatch({ ...base, amountMaxUsd: 100, estMinutes: 2 }).valuePerHour).toBe(600);
  });

  it("rounds value per hour to 2 decimals", () => {
    expect(scoreMatch({ ...base, estMinutes: 7 }).valuePerHour).toBe(4285.71);
  });

  it("returns zero value for a zero amount", () => {
    expect(scoreMatch({ ...base, amountMaxUsd: 0 }).valuePerHour).toBe(0);
  });
});

describe("rankMatches", () => {
  const m = (id: string, valuePerHour: number, daysUntilDeadline: number | null) => ({
    id,
    fitScore: 50,
    valuePerHour,
    daysUntilDeadline,
  });

  it("orders by value per hour, highest first", () => {
    expect(rankMatches([m("a", 100, 5), m("b", 2500, 24), m("c", 1600, 9)]).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("orders open, undated, then expired listings", () => {
    const ranked = rankMatches([m("none", 500, null), m("late", 500, 30), m("soon", 500, 3), m("past", 500, -2)]);
    expect(ranked.map((x) => x.id)).toEqual(["soon", "late", "none", "past"]);
    expect(rankMatches([m("expired", 99999, -1), m("open", 1, 0)]).map((x) => x.id)).toEqual(["open", "expired"]);
  });

  it("is stable for full ties and does not mutate the input", () => {
    const input = [m("first", 500, null), m("second", 500, null), m("third", 500, 4)];
    const ranked = rankMatches(input);
    expect(ranked.map((x) => x.id)).toEqual(["third", "first", "second"]);
    expect(input.map((x) => x.id)).toEqual(["first", "second", "third"]);
  });

  it("returns an empty list for no matches", () => {
    expect(rankMatches([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/engines test`
Expected: FAIL `src/ranking.test.ts` with `Failed to resolve import "./ranking"`; the other files pass.

- [ ] **Step 3: Write the implementation**

`packages/engines/src/ranking.ts`:

```ts
export function scoreMatch(input: {
  amountMaxUsd: number;
  estMinutes: number;
  reasonsCount: number;
  unknownsCount: number;
  daysUntilDeadline: number | null;
  reusableStories: number;
}): { fitScore: number; valuePerHour: number } {
  const raw = 50 + 10 * input.reasonsCount - 15 * input.unknownsCount + (input.reusableStories > 0 ? 10 : 0);
  const fitScore = Math.min(100, Math.max(0, Math.round(raw)));
  const hours = Math.max(input.estMinutes, 5) / 60;
  const valuePerHour = Math.round(((input.amountMaxUsd * fitScore) / 100 / hours) * 100) / 100;
  return { fitScore, valuePerHour };
}

function compareDeadlines(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function deadlineGroup(days: number | null): number {
  return days === null ? 1 : days < 0 ? 2 : 0;
}

/** Returns a new array. Array.prototype.sort is stable, so full ties keep input order. */
export function rankMatches<T extends { fitScore: number; valuePerHour: number; daysUntilDeadline: number | null }>(
  m: T[],
): T[] {
  return [...m].sort(
    (a, b) => deadlineGroup(a.daysUntilDeadline) - deadlineGroup(b.daysUntilDeadline)
      || b.valuePerHour - a.valuePerHour || compareDeadlines(a.daysUntilDeadline, b.daysUntilDeadline),
  );
}
```

`packages/engines/src/index.ts`:

```ts
export { type MatcherProfile, evaluateEligibility } from "./eligibility";
export { estimateLoanPayment, estimateNetPrice, wonScholarshipsForYear } from "./estimates";
export {
  type OfferInput,
  type OfferLineInput,
  categorizeOfferLine,
  compareOffers,
  computeGap,
  computePublicOffers,
  formatUsd,
} from "./money";
export { rankMatches, scoreMatch } from "./ranking";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/engines test && pnpm --filter @scholarcrew/engines typecheck`
Expected: PASS, 4 files, 53 tests (ranking 10 added); `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/engines/src/ranking.ts packages/engines/src/ranking.test.ts packages/engines/src/index.ts
git commit -m "feat(engines): fit score and value-per-hour ranking"
```

### D6: Scam shield rules

Flags come back unique and in `ScamFlag` enum order. Fee phrases right after "no", "without", "zero", or "free of" (optionally followed by "a", "an", or "any") don't count, and "application fee waiver" doesn't count, so honest listings that say "No application fee." stay clean (SC-06).

- [ ] **Step 1: Write the failing test**

`packages/engines/src/scams.test.ts`:

```ts
import type { ScamFlag } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { detectScamSignals } from "./scams";

const listing = { amountMaxUsd: 2500 };

describe("detectScamSignals", () => {
  it("flags the Golden Future processing fee", () => {
    const text =
      'Golden Future Scholars Award. Win up to $10,000 for college! A $25 "processing fee" is required to apply.';
    expect(detectScamSignals(text, { amountMaxUsd: 10000 })).toEqual(["application_fee"]);
  });

  it("leaves the Rotary listing clean", () => {
    const text =
      "The Rotary Club of Eastside awards $2,500 to a Maple County senior who has served the community. " +
      "Submit a 500-word essay describing a time you used your skills to serve your community. " +
      "No application fee. No recommendation letters.";
    expect(detectScamSignals(text, listing)).toEqual([]);
  });

  it("flags a listing marked as requiring a fee even when the text is clean", () => {
    expect(detectScamSignals("Write 300 words about your hometown.", { amountMaxUsd: 500, requiresFee: true })).toEqual([
      "application_fee",
    ]);
  });

  it("flags dollar-amount fees", () => {
    expect(detectScamSignals("Applicants pay a $15 fee.", listing)).toEqual(["application_fee"]);
    expect(detectScamSignals("A one-time $1,000.00 fee secures your spot.", listing)).toEqual(["application_fee"]);
  });

  it.each<[string, ScamFlag]>([
    ["GUARANTEED scholarship for every applicant", "guaranteed_award"],
    ["We guarantee you'll get money", "guaranteed_award"],
    ["Enter your bank account to receive funds", "bank_or_card_request"],
    ["Provide your ROUTING NUMBER", "bank_or_card_request"],
    ["Pay with a credit card", "bank_or_card_request"],
    ["Your debit card number is required", "bank_or_card_request"],
    ["We need your Social Security number", "ssn_request"],
    ["Send your ssn today", "ssn_request"],
    ["Official SWEEPSTAKES rules apply", "sweepstakes"],
    ["Enter to win $1,000", "sweepstakes"],
    ["Winners chosen in a monthly drawing", "sweepstakes"],
    ["You have been selected for an award", "unsolicited_winner"],
    ["you've won a scholarship", "unsolicited_winner"],
    ["You’ve won!", "unsolicited_winner"],
    ["Congratulations, you qualify", "unsolicited_winner"],
    ["For a fee we'll find every scholarship you qualify for", "pay_for_info"],
    ["Pay for a list of 500 scholarships", "pay_for_info"],
  ])("flags %j as %s", (text, flag) => {
    expect(detectScamSignals(text, listing)).toEqual([flag]);
  });

  it("returns each flag once, in a fixed order", () => {
    const text = "Congratulations, you are guaranteed $5,000! Send your SSN and a $20 fee. Application fee due now.";
    expect(detectScamSignals(text, listing)).toEqual([
      "application_fee",
      "guaranteed_award",
      "ssn_request",
      "unsolicited_winner",
    ]);
  });

  it("ignores negated fees and fee waivers", () => {
    expect(detectScamSignals("Application fee waivers are available.", listing)).toEqual([]);
    expect(detectScamSignals("Apply without a processing fee.", listing)).toEqual([]);
    expect(detectScamSignals("There is zero application fee and no $25 fee.", listing)).toEqual([]);
    expect(detectScamSignals("No application fee, but a $30 fee applies later.", listing)).toEqual(["application_fee"]);
  });

  it("returns nothing for empty text", () => {
    expect(detectScamSignals("", listing)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/engines test`
Expected: FAIL `src/scams.test.ts` with `Failed to resolve import "./scams"`; the other files pass.

- [ ] **Step 3: Write the implementation**

`packages/engines/src/scams.ts`:

```ts
import { ScamFlag } from "@scholarcrew/domain";

const PATTERNS: Record<ScamFlag, RegExp[]> = {
  application_fee: [/application fee(?!s?\s+waiver)/gi, /processing fee/gi, /\$\s?\d[\d,]*(?:\.\d{2})?\s+fee\b/gi],
  guaranteed_award: [/\bguarantee(?:d|s)?\b/gi],
  bank_or_card_request: [/\bbank account\b/gi, /\brouting number\b/gi, /\b(?:credit|debit) card\b/gi],
  ssn_request: [/\bsocial security\b/gi, /\bssn\b/gi],
  sweepstakes: [/\bsweepstakes\b/gi, /\benter to win\b/gi, /\bdrawing\b/gi],
  unsolicited_winner: [/\byou have been selected\b/gi, /\byou['’]ve won\b/gi, /\bcongratulations,\s*you\b/gi],
  pay_for_info: [/\bfor a fee,?\s+we['’]ll find\b/gi, /\bpay for a list\b/gi],
};

/** Text right before a fee phrase that makes it a "no fee" statement. */
const FEE_NEGATION = /\b(?:no|without|zero|free of)\s+(?:(?:an?|any)\s+)?["'“”]?$/i;

function hits(text: string, pattern: RegExp, negatable: boolean): boolean {
  for (const match of text.matchAll(pattern)) {
    if (!negatable) return true;
    const at = match.index ?? 0;
    const before = text.slice(Math.max(0, at - 20), at);
    if (!FEE_NEGATION.test(before)) return true;
  }
  return false;
}

/**
 * Case-insensitive scam rules over a listing's text. `requiresFee` (from extraction) always flags a fee.
 * `amountMaxUsd` is part of the contract for future amount-based rules and isn't used yet.
 */
export function detectScamSignals(text: string, listing: { amountMaxUsd: number; requiresFee?: boolean }): ScamFlag[] {
  const found = new Set<ScamFlag>();
  if (listing.requiresFee === true) found.add("application_fee");
  for (const flag of ScamFlag.options) {
    if (PATTERNS[flag].some((pattern) => hits(text, pattern, flag === "application_fee"))) found.add(flag);
  }
  return ScamFlag.options.filter((flag) => found.has(flag));
}
```

`packages/engines/src/index.ts`:

```ts
export { type MatcherProfile, evaluateEligibility } from "./eligibility";
export { estimateLoanPayment, estimateNetPrice, wonScholarshipsForYear } from "./estimates";
export {
  type OfferInput,
  type OfferLineInput,
  categorizeOfferLine,
  compareOffers,
  computeGap,
  computePublicOffers,
  formatUsd,
} from "./money";
export { rankMatches, scoreMatch } from "./ranking";
export { detectScamSignals } from "./scams";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/engines test && pnpm --filter @scholarcrew/engines typecheck`
Expected: PASS, 5 files, 77 tests (scams 24 added, counting each `it.each` row); `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/engines/src/scams.ts packages/engines/src/scams.test.ts packages/engines/src/index.ts
git commit -m "feat(engines): scam shield rules"
```

### D7: Weeks, days left, reminders, warnings

The local calendar date comes from `Intl.DateTimeFormat(..., { timeZone })`; all day math then runs on UTC-midnight timestamps of calendar dates, so a DST change (Nov 1, 2026 in Chicago) never shifts a count. Worked numbers come from the "Coming up" card in `01_this_week.html` (now = Tue Oct 6, 2026).

- [ ] **Step 1: Write the failing test**

`packages/engines/src/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { daysUntil, isWarning, reminderOffsetsDue, weekStartFor } from "./dates";

const TZ = "America/Chicago";
const now = new Date("2026-10-06T15:00:00.000Z"); // Tue Oct 6, 10:00 in Chicago

describe("weekStartFor", () => {
  it("returns the Monday of the local week", () => {
    expect(weekStartFor(now, TZ)).toBe("2026-10-05");
  });

  it("switches weeks at local midnight on Monday", () => {
    expect(weekStartFor(new Date("2026-10-05T05:00:00.000Z"), TZ)).toBe("2026-10-05"); // Mon 00:00 CDT
    expect(weekStartFor(new Date("2026-10-05T04:59:00.000Z"), TZ)).toBe("2026-09-28"); // Sun 23:59 CDT
  });

  it("uses the local date when UTC is already the next day", () => {
    expect(weekStartFor(new Date("2026-10-12T03:00:00.000Z"), TZ)).toBe("2026-10-05"); // Sun Oct 11, 22:00 local
  });

  it("follows the given time zone", () => {
    const instant = new Date("2026-10-12T03:00:00.000Z");
    expect(weekStartFor(instant, "UTC")).toBe("2026-10-12");
    expect(weekStartFor(instant, "Asia/Tokyo")).toBe("2026-10-12");
  });
});

describe("daysUntil", () => {
  it("matches the Coming up card", () => {
    expect(daysUntil("2026-10-15", now, TZ)).toBe(9);
    expect(daysUntil("2026-10-30", now, TZ)).toBe(24);
    expect(daysUntil("2026-11-01", now, TZ)).toBe(26);
    expect(daysUntil("2026-11-15", now, TZ)).toBe(40);
  });

  it("counts from the local date, not the UTC date", () => {
    const lateEvening = new Date("2026-10-07T03:00:00.000Z"); // Tue Oct 6, 22:00 in Chicago
    expect(daysUntil("2026-10-15", lateEvening, TZ)).toBe(9);
    expect(daysUntil("2026-10-15", lateEvening, "UTC")).toBe(8);
  });

  it("returns 0 for today and negative numbers for past dates", () => {
    expect(daysUntil("2026-10-06", now, TZ)).toBe(0);
    expect(daysUntil("2026-10-01", now, TZ)).toBe(-5);
  });

  it("returns whole days across a DST change", () => {
    expect(daysUntil("2026-03-09", new Date("2026-03-07T18:00:00.000Z"), TZ)).toBe(2);
  });
});

describe("reminderOffsetsDue", () => {
  it("returns the offset due today", () => {
    expect(reminderOffsetsDue("2026-10-13", now, TZ)).toEqual([7]);
    expect(reminderOffsetsDue("2026-10-09", now, TZ)).toEqual([3]);
    expect(reminderOffsetsDue("2026-10-07", now, TZ)).toEqual([1]);
  });

  it("returns nothing on other days", () => {
    expect(reminderOffsetsDue("2026-10-15", now, TZ)).toEqual([]);
    expect(reminderOffsetsDue("2026-10-06", now, TZ)).toEqual([]);
    expect(reminderOffsetsDue("2026-10-01", now, TZ)).toEqual([]);
  });
});

describe("isWarning", () => {
  it("warns from 0 to 14 days inclusive", () => {
    expect(isWarning(0)).toBe(true);
    expect(isWarning(9)).toBe(true);
    expect(isWarning(14)).toBe(true);
    expect(isWarning(15)).toBe(false);
    expect(isWarning(-1)).toBe(false);
  });
});

describe("invalid input", () => {
  it("throws RangeError for an unknown time zone or a malformed date", () => {
    expect(() => weekStartFor(now, "Not/AZone")).toThrow(RangeError);
    expect(() => daysUntil("10/15/2026", now, TZ)).toThrow(RangeError);
  });

  it("throws RangeError for a well-formed date that doesn't exist", () => {
    expect(() => daysUntil("2026-02-30", now, TZ)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/engines test`
Expected: FAIL `src/dates.test.ts` with `Failed to resolve import "./dates"`; the other files pass.

- [ ] **Step 3: Write the implementation**

`packages/engines/src/dates.ts`:

```ts
import type { IsoDate } from "@scholarcrew/domain";

const DAY_MS = 86_400_000;
const REMINDER_OFFSETS = [7, 3, 1] as const;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** UTC-midnight timestamp of the calendar date `now` falls on in `timeZone`. */
export function localDayMs(now: Date, timeZone: string): number {
  let year = 0;
  let month = 0;
  let day = 0;
  for (const part of formatterFor(timeZone).formatToParts(now)) {
    if (part.type === "year") year = Number(part.value);
    if (part.type === "month") month = Number(part.value);
    if (part.type === "day") day = Number(part.value);
  }
  return Date.UTC(year, month - 1, day);
}

/** UTC-midnight timestamp of an IsoDate. Throws RangeError for anything but a real YYYY-MM-DD date. */
export function isoDateMs(date: IsoDate): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`Invalid IsoDate: ${date}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Date.UTC rolls "2026-02-30" over to March 2; a round trip catches that.
  if (msToIsoDate(ms) !== date) throw new RangeError(`Invalid IsoDate: ${date}`);
  return ms;
}

export function msToIsoDate(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Monday of the student's local week. */
export function weekStartFor(now: Date, timeZone: string): IsoDate {
  const today = localDayMs(now, timeZone);
  const dayOfWeek = new Date(today).getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return msToIsoDate(today - daysSinceMonday * DAY_MS);
}

/** Calendar days from the local today to `due`. Negative when past. */
export function daysUntil(due: IsoDate, now: Date, timeZone: string): number {
  return Math.round((isoDateMs(due) - localDayMs(now, timeZone)) / DAY_MS);
}

/** Which of the 7/3/1-day reminders fall on the local today. */
export function reminderOffsetsDue(due: IsoDate, now: Date, timeZone: string): Array<7 | 3 | 1> {
  const left = daysUntil(due, now, timeZone);
  return REMINDER_OFFSETS.filter((offset) => offset === left);
}

/** Due today through 14 days out gets a warning badge. */
export function isWarning(daysLeft: number): boolean {
  return daysLeft >= 0 && daysLeft <= 14;
}
```

`packages/engines/src/index.ts`:

```ts
export { daysUntil, isWarning, reminderOffsetsDue, weekStartFor } from "./dates";
export { type MatcherProfile, evaluateEligibility } from "./eligibility";
export { estimateLoanPayment, estimateNetPrice, wonScholarshipsForYear } from "./estimates";
export {
  type OfferInput,
  type OfferLineInput,
  categorizeOfferLine,
  compareOffers,
  computeGap,
  computePublicOffers,
  formatUsd,
} from "./money";
export { rankMatches, scoreMatch } from "./ranking";
export { detectScamSignals } from "./scams";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/engines test && pnpm --filter @scholarcrew/engines typecheck`
Expected: PASS, 6 files, 90 tests (dates 13 added); `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/engines/src/dates.ts packages/engines/src/dates.test.ts packages/engines/src/index.ts
git commit -m "feat(engines): local weeks, days left, reminders, warnings"
```

### D8: Word and character limits

A word is a run of letters, combining marks, digits, apostrophes (`'` and `’`), and hyphens that contains at least one letter or digit, so "nine-year-old" is one word, "I'm" is one word, an em dash splits words, and a lone " - " is not a word. Digits joined by `.` or `,` ("3.72", "$2,500") count as one word. Splitting on separators keeps the count linear in the text length. Characters are Unicode code points (IM-04's 150-character activity description).

- [ ] **Step 1: Write the failing test**

`packages/engines/src/limits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countChars, countWords, limitState } from "./limits";

// Draft 2 of the Rotary essay from design/mockups/source/04_essays.html (footnote markers removed).
const ROTARY_DRAFT = [
  "I have always been passionate about robotics. In ninth grade I joined our school's robotics team, and by junior year I was the build lead. But the moment I'm proudest of didn't happen at a competition.",
  "Last spring, our librarian asked if the team could run a STEM night for elementary students. I said yes before I knew what I was signing up for. The first night, 30 kids came, and we had four robots and one extension cord.",
  "We kept going every other Thursday. I learned how to explain a motor controller to a nine-year-old, which is harder than building one. By May, some of the kids were building their own sensors and teaching their parents how they worked.",
  "Robotics taught me engineering, but the library nights taught me that knowing something is only half of it. The other half is",
].join("\n\n");

describe("countWords", () => {
  it("counts the Rotary draft as 142 words", () => {
    expect(countWords(ROTARY_DRAFT)).toBe(142);
  });

  it("keeps hyphenated words and contractions whole", () => {
    expect(countWords("a nine-year-old")).toBe(2);
    expect(countWords("I'm sure it didn't")).toBe(4);
    expect(countWords("don’t stop")).toBe(2);
  });

  it("counts numbers, including decimals and thousands separators", () => {
    expect(countWords("30 kids came")).toBe(3);
    expect(countWords("I scored 3.72 and won $2,500.")).toBe(6);
  });

  it("splits on em dashes and ignores lone punctuation", () => {
    expect(countWords("half—it")).toBe(2);
    expect(countWords("a - b")).toBe(2);
    expect(countWords("Wait... what?!")).toBe(2);
  });

  it("returns 0 for empty, whitespace, or punctuation-only text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t ")).toBe(0);
    expect(countWords("... -- !!")).toBe(0);
  });

  it("counts non-Latin letters and combining accents", () => {
    expect(countWords("café señor 東京")).toBe(3);
    expect(countWords("cafe\u0301 au lait")).toBe(3); // decomposed é: letter + combining accent
  });
});

describe("countChars", () => {
  it("counts Unicode code points", () => {
    expect(countChars("")).toBe(0);
    expect(countChars("abc")).toBe(3);
    expect(countChars("é".repeat(150))).toBe(150);
    expect(countChars("\u{1F44B}\u{1F3FD}")).toBe(2); // waving hand + skin tone modifier
    expect(countChars("e\u0301")).toBe(2); // decomposed é is two code points, one grapheme
  });

  it("puts a 150-character activity description at the limit, not over", () => {
    expect(limitState(countChars("é".repeat(150)), 150)).toBe("near");
    expect(limitState(countChars("é".repeat(151)), 150)).toBe("over");
  });
});

describe("limitState", () => {
  it("is ok with no limit", () => {
    expect(limitState(10_000, null)).toBe("ok");
  });

  it("warns at 90% and flags anything over 100%", () => {
    expect(limitState(142, 500)).toBe("ok");
    expect(limitState(449, 500)).toBe("ok");
    expect(limitState(450, 500)).toBe("near");
    expect(limitState(500, 500)).toBe("near");
    expect(limitState(501, 500)).toBe("over");
    expect(limitState(0, 500)).toBe("ok");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/engines test`
Expected: FAIL `src/limits.test.ts` with `Failed to resolve import "./limits"`; the other files pass.

- [ ] **Step 3: Write the implementation**

`packages/engines/src/limits.ts`:

```ts
/** Digits joined by "." or "," ("3.72", "2,500") read as one number. */
const NUMBER_SEPARATOR = /(\p{N})[.,](?=\p{N})/gu;
/** Anything that is not a letter, mark, digit, apostrophe, or hyphen separates words. */
const SEPARATORS = /[^\p{L}\p{M}\p{N}'’‐‑-]+/u;
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

export function countWords(text: string): number {
  let count = 0;
  for (const token of text.replace(NUMBER_SEPARATOR, "$1").split(SEPARATORS)) {
    if (HAS_WORD_CHAR.test(token)) count += 1;
  }
  return count;
}

/** Unicode code points, the way activity and form limits are counted. */
export function countChars(text: string): number {
  return [...text].length;
}

/** "near" from 90% of the limit up to the limit; "over" past it. */
export function limitState(count: number, limit: number | null): "ok" | "near" | "over" {
  if (limit === null) return "ok";
  if (count > limit) return "over";
  if (count * 10 >= limit * 9) return "near";
  return "ok";
}
```

`packages/engines/src/index.ts`:

```ts
export { daysUntil, isWarning, reminderOffsetsDue, weekStartFor } from "./dates";
export { type MatcherProfile, evaluateEligibility } from "./eligibility";
export { estimateLoanPayment, estimateNetPrice, wonScholarshipsForYear } from "./estimates";
export { countChars, countWords, limitState } from "./limits";
export {
  type OfferInput,
  type OfferLineInput,
  categorizeOfferLine,
  compareOffers,
  computeGap,
  computePublicOffers,
  formatUsd,
} from "./money";
export { rankMatches, scoreMatch } from "./ranking";
export { detectScamSignals } from "./scams";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/engines test && pnpm --filter @scholarcrew/engines typecheck`
Expected: PASS, 7 files, 100 tests (limits 10 added); `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/engines/src/limits.ts packages/engines/src/limits.test.ts packages/engines/src/index.ts
git commit -m "feat(engines): word and character limits"
```

### D9: Merit tiers, retake value, superscores

A tier is satisfied when its GPA minimum (if set) is met and, if it has any test minimum, either the ACT or the SAT minimum is met; a tier with no test minimums is GPA-only. The student gets the satisfied tier with the highest `annualUsd` (CO-06). Retake value compares each college's tier now against the tier at the target score; the other test's current score still counts (PR-03). Superscores use official scores only, taking each section's max per test; ACT composite is the rounded average of whichever of english/math/reading/science are present, SAT and PSAT composite is `rw + math`; with no usable sections it falls back to the best official composite (PR-02). Worked numbers come from `design/mockups/source/11_prep.html`.

- [ ] **Step 1: Write the failing test**

`packages/engines/src/merit.test.ts`:

```ts
import { type MeritTier, RetakeAnalysis, Superscore, type TestScore } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { meritTierFor, retakeAnalysis, superscore } from "./merit";

const tier = (label: string, annualUsd: number, minGpa: number | null, minAct: number | null, minSat: number | null): MeritTier => ({
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
    const result = retakeAnalysis({ colleges, gpa: 3.72, currentAct: 28, currentSat: null, target: { test: "ACT", composite: 29 } });
    expect(result).toEqual({
      test: "ACT",
      currentComposite: 28,
      targetComposite: 29,
      rows: [
        { collegeId: "300001", collegeName: "Lakeshore University", currentTierLabel: null, targetTierLabel: "Founders", annualDeltaUsd: 2500, fourYearDeltaUsd: 10000 },
        { collegeId: "200001", collegeName: "State U", currentTierLabel: "Merit", targetTierLabel: "Dean's", annualDeltaUsd: 2000, fourYearDeltaUsd: 8000 },
        { collegeId: "300002", collegeName: "Bay Tech", currentTierLabel: null, targetTierLabel: null, annualDeltaUsd: 0, fourYearDeltaUsd: 0 },
        { collegeId: "200003", collegeName: "Northgate University", currentTierLabel: null, targetTierLabel: null, annualDeltaUsd: 0, fourYearDeltaUsd: 0 },
      ],
      totalFourYearDeltaUsd: 18000,
    });
    expect(RetakeAnalysis.safeParse(result).success).toBe(true);
  });

  it("never reports a negative delta for a lower target", () => {
    const result = retakeAnalysis({ colleges, gpa: 3.72, currentAct: 28, currentSat: null, target: { test: "ACT", composite: 25 } });
    expect(result.rows[1]).toMatchObject({ currentTierLabel: "Merit", targetTierLabel: null, annualDeltaUsd: 0, fourYearDeltaUsd: 0 });
    expect(result.totalFourYearDeltaUsd).toBe(0);
  });

  it("keeps the current ACT when the target is an SAT", () => {
    const result = retakeAnalysis({ colleges, gpa: 3.72, currentAct: 28, currentSat: null, target: { test: "SAT", composite: 1350 } });
    expect(result.test).toBe("SAT");
    expect(result.currentComposite).toBeNull();
    expect(result.rows[1]).toMatchObject({ currentTierLabel: "Merit", targetTierLabel: "Dean's", annualDeltaUsd: 2000 });
  });

  it("returns an empty analysis for no colleges", () => {
    expect(retakeAnalysis({ colleges: [], gpa: null, currentAct: null, currentSat: null, target: { test: "ACT", composite: 30 } })).toEqual({
      test: "ACT",
      currentComposite: null,
      targetComposite: 30,
      rows: [],
      totalFourYearDeltaUsd: 0,
    });
  });
});

let seq = 0;
function score(test: TestScore["test"], takenOn: string, official: boolean, composite: number, sections: Record<string, number>): TestScore {
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
      { test: "ACT", composite: 28, sections: { english: 29, math: 28, reading: 27 }, fromDates: ["2026-06-13", "2026-09-12"] },
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
    expect(result[1]).toEqual({ test: "SAT", composite: 1390, sections: { rw: 690, math: 700 }, fromDates: ["2026-03-14", "2026-05-02"] });
    expect(result[2]).toEqual({ test: "PSAT", composite: 1220, sections: { rw: 600, math: 620 }, fromDates: ["2025-10-15"] });
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
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/engines test`
Expected: FAIL `src/merit.test.ts` with `Failed to resolve import "./merit"`; the other files pass.

- [ ] **Step 3: Write the implementation**

`packages/engines/src/merit.ts`:

```ts
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
```

`packages/engines/src/index.ts`:

```ts
export { daysUntil, isWarning, reminderOffsetsDue, weekStartFor } from "./dates";
export { type MatcherProfile, evaluateEligibility } from "./eligibility";
export { estimateLoanPayment, estimateNetPrice, wonScholarshipsForYear } from "./estimates";
export { countChars, countWords, limitState } from "./limits";
export { meritTierFor, retakeAnalysis, superscore } from "./merit";
export {
  type OfferInput,
  type OfferLineInput,
  categorizeOfferLine,
  compareOffers,
  computeGap,
  computePublicOffers,
  formatUsd,
} from "./money";
export { rankMatches, scoreMatch } from "./ranking";
export { detectScamSignals } from "./scams";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/engines test && pnpm --filter @scholarcrew/engines typecheck`
Expected: PASS, 8 files, 113 tests (merit 13 added); `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/engines/src/merit.ts packages/engines/src/merit.test.ts packages/engines/src/index.ts
git commit -m "feat(engines): merit tiers, retake value, superscores"
```

### D10: Plan ordering and the contract surface

Open (`todo`) items come first: nearest `dueOn` (none last), then higher `valueUsd` (none last), then higher `priority`, then older `createdAt`. Done and skipped items follow in `createdAt` order. `now` and `timeZone` are in the contract so callers don't have to change if ordering ever depends on the local day; today the order only needs calendar-string comparison, so overdue items naturally sort first (WK-01 next step, WK-02 plan list). The index test pins every section 9.2 export and proves the functions don't mutate their inputs.

- [ ] **Step 1: Write the failing tests**

`packages/engines/src/plan.test.ts`:

```ts
import type { PlanItem } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { prioritizePlanItems } from "./plan";

const now = new Date("2026-10-06T15:00:00.000Z");
const TZ = "America/Chicago";

function item(id: string, o: Partial<PlanItem>): PlanItem {
  return {
    id,
    weekStart: "2026-10-05",
    title: id,
    kind: "custom",
    refType: null,
    refId: null,
    minutes: 30,
    valueUsd: null,
    dueOn: null,
    status: "todo",
    contributors: [],
    priority: 0,
    createdAt: "2026-10-05T10:00:00.000Z",
    completedAt: null,
    ...o,
  };
}

const ids = (items: PlanItem[]) => items.map((i) => i.id);

describe("prioritizePlanItems", () => {
  it("orders open items by due date, value, priority, then age, and puts done and skipped last", () => {
    const items = [
      item("a", { dueOn: "2026-10-15", valueUsd: 1000, createdAt: "2026-10-05T10:00:00.000Z" }),
      item("b", { dueOn: null, valueUsd: 2500, priority: 5, createdAt: "2026-10-05T09:00:00.000Z" }),
      item("c", { dueOn: "2026-10-15", valueUsd: 2500, createdAt: "2026-10-05T11:00:00.000Z" }),
      item("d", { status: "done", dueOn: "2026-10-08", createdAt: "2026-10-05T08:00:00.000Z" }),
      item("e", { dueOn: "2026-10-09", createdAt: "2026-10-05T13:00:00.000Z" }),
      item("f", { status: "skipped", createdAt: "2026-10-05T07:00:00.000Z" }),
      item("g", { dueOn: "2026-10-15", valueUsd: 2500, priority: 3, createdAt: "2026-10-05T12:00:00.000Z" }),
    ];
    expect(ids(prioritizePlanItems(items, now, TZ))).toEqual(["e", "g", "c", "a", "b", "f", "d"]);
  });

  it("puts overdue items first and missing values after zero", () => {
    const items = [
      item("none", { dueOn: "2026-10-15", valueUsd: null }),
      item("zero", { dueOn: "2026-10-15", valueUsd: 0 }),
      item("overdue", { dueOn: "2026-10-01", valueUsd: null }),
    ];
    expect(ids(prioritizePlanItems(items, now, TZ))).toEqual(["overdue", "zero", "none"]);
  });

  it("falls back to creation time, then input order", () => {
    const items = [
      item("newer", { createdAt: "2026-10-05T12:00:00.000Z" }),
      item("older", { createdAt: "2026-10-04T12:00:00.000Z" }),
      item("same-1", { createdAt: "2026-10-05T12:00:00.000Z" }),
    ];
    expect(ids(prioritizePlanItems(items, now, TZ))).toEqual(["older", "newer", "same-1"]);
  });

  it("returns a new array and handles an empty plan", () => {
    const items = [item("x", { dueOn: "2026-10-20" }), item("y", { dueOn: "2026-10-10" })];
    const sorted = prioritizePlanItems(items, now, TZ);
    expect(ids(sorted)).toEqual(["y", "x"]);
    expect(ids(items)).toEqual(["x", "y"]);
    expect(prioritizePlanItems([], now, TZ)).toEqual([]);
  });
});
```

`packages/engines/src/index.test.ts`:

```ts
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
    expect(engines.evaluateEligibility([], { national: true, state: null, counties: [], cities: [] }, profile).eligible).toBe(true);
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
      { id: "s1", test: "ACT" as const, takenOn: "2026-09-12", official: true, composite: 27, sections: { english: 26, math: 28, reading: 27 }, createdAt: "2026-10-01T12:00:00.000Z" },
      { id: "s2", test: "ACT" as const, takenOn: "2026-06-13", official: true, composite: 26, sections: { english: 29, math: 24, reading: 26 }, createdAt: "2026-10-01T12:00:00.000Z" },
    ]);
    expect(engines.superscore(scores)[0]?.composite).toBe(28);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/engines test`
Expected: FAIL `src/plan.test.ts` with `Failed to resolve import "./plan"`, and `src/index.test.ts` fails `exports every section 9.2 function` with `prioritizePlanItems: expected 'undefined' to be 'function'`; the other files pass.

- [ ] **Step 3: Write the implementation**

`packages/engines/src/plan.ts`:

```ts
import type { PlanItem } from "@scholarcrew/domain";

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Ascending, nulls last. */
function compareDueOn(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compareStrings(a, b);
}

/** Descending, nulls last. */
function compareValue(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function compareOpen(a: PlanItem, b: PlanItem): number {
  return (
    compareDueOn(a.dueOn, b.dueOn) ||
    compareValue(a.valueUsd, b.valueUsd) ||
    b.priority - a.priority ||
    compareStrings(a.createdAt, b.createdAt)
  );
}

/**
 * Open items first (due date, value, priority, age), then done and skipped items by age.
 * `now` and `timeZone` are part of the contract; calendar-string order already puts overdue items first.
 */
export function prioritizePlanItems(items: PlanItem[], _now: Date, _timeZone: string): PlanItem[] {
  const open = items.filter((i) => i.status === "todo").sort(compareOpen);
  const closed = items.filter((i) => i.status !== "todo").sort((a, b) => compareStrings(a.createdAt, b.createdAt));
  return [...open, ...closed];
}
```

`packages/engines/src/index.ts` (final):

```ts
export { daysUntil, isWarning, reminderOffsetsDue, weekStartFor } from "./dates";
export { type MatcherProfile, evaluateEligibility } from "./eligibility";
export { estimateLoanPayment, estimateNetPrice, wonScholarshipsForYear } from "./estimates";
export { countChars, countWords, limitState } from "./limits";
export { meritTierFor, retakeAnalysis, superscore } from "./merit";
export {
  type OfferInput,
  type OfferLineInput,
  categorizeOfferLine,
  compareOffers,
  computeGap,
  computePublicOffers,
  formatUsd,
} from "./money";
export { prioritizePlanItems } from "./plan";
export { rankMatches, scoreMatch } from "./ranking";
export { detectScamSignals } from "./scams";
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/engines test && pnpm --filter @scholarcrew/engines typecheck`
Expected: PASS, 10 files, 120 tests (plan 4 and index 3 added); `tsc --noEmit` prints nothing.

- [ ] **Step 5: Format, lint, commit**

Run: `pnpm format && pnpm lint`
Expected: Biome rewrites long lines in `packages/engines`, then `biome check .` reports no errors. Re-run `pnpm --filter @scholarcrew/engines test` (still 120 passing) after formatting.

```bash
git add packages/engines
git commit -m "feat(engines): plan ordering and contract surface test"
```

## Success Criteria

- [ ] `pnpm --filter @scholarcrew/engines typecheck` exits 0.
- [ ] `pnpm --filter @scholarcrew/engines test` exits 0: 10 files, 120 tests passing.
- [ ] `pnpm lint` exits 0 (no Biome errors under `packages/engines`).
- [ ] `grep -rnE "Date\.now\(|new Date\(\)|Math\.random|fetch\(|process\.env|async " packages/engines/src --include=*.ts --exclude=*.test.ts` prints nothing (pure and synchronous: no clock, randomness, network, env, or async).
- [ ] `grep -rn "from \"zod\"" packages/engines/src` prints nothing (schemas and types come from `@scholarcrew/domain`).

## Testing Requirements

- Command: `pnpm --filter @scholarcrew/engines test`
- Expected: 10 test files, 120 tests, all passing, no database or network.
- What the tests prove:
  - Ledger reproduces the mockups exactly: State U gap $9,200 and $4,450 if pending wins; compare offers State U 1,700 / 9,200 / 36,800, Riverside 3,300 / 6,800 / 45,200 with the "$6,000 First-Year Welcome Grant is year 1 only" warning, Northgate 4,300 / 12,800 / 51,200, lowest four-year State U; the public tool runs the same math with `offer-N` ids. Outputs parse with the domain `OfferComparison` and `LoanEstimate` schemas. Floors at zero, empty input, ties, zero-dollar lines, and "other" lines are covered. `formatUsd` is the one Intl money formatter (R3V-5): `$6,000`, `formatUsd(12.5)` is `"$13"`, and `formatUsd(-500)` is `"-$500"`.
  - Loan payments match the amortization formula (10,000 at 6% for 10 years → $111/month, $3,322 interest), 0% divides evenly with no interest, and a zero principal is zero.
  - Net price uses the income band, then the overall average, and returns null when a number is missing; won awards count all in year 1 and renewable only after.
  - The matcher gives the Rotary listing exactly three reasons ("You live in Maple County", "Class of 2027", "Your GPA 3.72 meets the 3.0 minimum") and one unknown; every rule type passes, fails, or goes unknown as specified; every sensitive-rule reason has `sensitive: true` and no other reason does; the citizenship filter adds no reason.
  - Fit and value per hour follow the formula with clamping and the 5-minute floor; ranking is value-first, nearer deadline next, no-deadline last, and stable.
  - The scam shield flags the Golden Future "$25 processing fee", leaves the Rotary listing (including "No application fee.") clean, catches every listed pattern case-insensitively, and returns unique flags in enum order.
  - Calendar math uses the local date: week of 2026-10-05 for Tue Oct 6 in Chicago, 9 days to Oct 15, a UTC-next-day evening still counts from the local date, DST doesn't shift counts, 7/3/1 reminders fire on the right days, the warning window is 0..14, and a malformed or impossible date ("2026-02-30") throws `RangeError`.
  - The Rotary draft from `04_essays.html` counts as 142 words; hyphenated words, contractions, and numbers count once; code points count exactly for the 150-character activity limit; near starts at 90% and over is past 100%.
  - Merit tiers, retake value (Lakeshore +$10,000, State U +$8,000 over 4 years at an ACT 29), and the ACT superscore of 28 from two official tests match `11_prep.html`.
  - Plan items order by due date, value, priority, and age with done and skipped last; the index exports every section 9.2 function and nothing mutates its inputs.

## Review Checklist

- [ ] Every name and signature in `00-overview.md` section 9.2 is exported from `packages/engines/src/index.ts` with the same parameter and return types. The only widening is `compareOffers` lines accepting an optional `label` (callers passing the contract shape still compile).
- [ ] No domain type is redefined; `MatcherProfile` is the contract type defined here, and `OfferInput` / `OfferLineInput` are helper aliases.
- [ ] Money stays in whole dollars: `monthlyUsd` and `totalInterestUsd` are rounded; every `Usd` output is a non-negative integer for non-negative inputs.
- [ ] Sensitive values never appear in `unknowns`, and every reason from a sensitive fact is marked `sensitive: true` so core can drop it in the family room (SC-02).
- [ ] Date functions call `Intl.DateTimeFormat` with the passed `timeZone`, never read the system clock, and do day math on UTC midnights.
- [ ] Scam fee negation only applies to fee phrases; guarantee, bank, SSN, sweepstakes, winner, and pay-for-info phrases always flag.
- [ ] The Rotary draft constant in `limits.test.ts` matches the four paragraphs of `design/mockups/source/04_essays.html` word for word (footnote markers removed).
- [ ] Only files under `packages/engines/**` are created or changed, and `pnpm-lock.yaml` is not committed by this plan.
