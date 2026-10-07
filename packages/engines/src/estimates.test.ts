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
    expect(estimateNetPrice({ costOfAttendanceUsd: 27800, netPriceByIncome: bands }, "over_110k")?.netPriceUsd).toBe(
      12000,
    );
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
