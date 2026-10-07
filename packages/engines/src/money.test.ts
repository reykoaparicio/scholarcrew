import { OfferComparison } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import {
  type OfferInput,
  categorizeOfferLine,
  compareOffers,
  computeGap,
  computePublicOffers,
  formatUsd,
} from "./money";

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
    const withOther = {
      ...stateU,
      lines: [...stateU.lines, { amountUsd: 500, category: "other" as const, renewable: false }],
    };
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
    const zero = {
      ...stateU,
      lines: [{ label: "Placeholder", amountUsd: 0, category: "grant" as const, renewable: false }],
    };
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
    expect(compareOffers([oneTime]).columns[0]).toMatchObject({
      reallyCostsUsd: 0,
      fourYearUsd: 60000,
      oneTimeFreeUsd: 20000,
    });
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
          lines: stateU.lines.map((l) => ({
            label: l.label ?? "",
            amountUsd: l.amountUsd,
            category: l.category,
            renewable: l.renewable,
          })),
        },
        {
          name: "Riverside College",
          costOfAttendanceUsd: 31200,
          lines: riverside.lines.map((l) => ({
            label: l.label ?? "",
            amountUsd: l.amountUsd,
            category: l.category,
            renewable: l.renewable,
          })),
        },
      ],
    });
    expect(result.columns.map((c) => [c.offerId, c.collegeId, c.collegeName, c.reallyCostsUsd, c.fourYearUsd])).toEqual(
      [
        ["offer-1", "", "State U", 9200, 36800],
        ["offer-2", "", "Riverside College", 6800, 45200],
      ],
    );
    expect(result.columns[1]?.warnings).toEqual(["$6,000 First-Year Welcome Grant is year 1 only"]);
    expect(result.lowestFourYearOfferId).toBe("offer-1");
  });
});
