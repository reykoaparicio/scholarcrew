import { type OfferComparison, PublicOfferInput } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { type OfferDraft, axisMax, barRows, buildOfferInput, newLine, newOffer, parseDollars } from "./offerToolState";

const COMPARISON: OfferComparison = {
  columns: [
    {
      offerId: "offer-1",
      collegeId: "",
      collegeName: "Maple State",
      costOfAttendanceUsd: 28000,
      freeMoneyUsd: 12000,
      workStudyUsd: 2000,
      loansUsd: 5500,
      letterSaysOweUsd: 8500,
      reallyCostsUsd: 16000,
      fourYearUsd: 76000,
      oneTimeFreeUsd: 4000,
      warnings: ["$4,000 Merit award is year 1 only"],
    },
    {
      offerId: "offer-2",
      collegeId: "",
      collegeName: "Bay Tech",
      costOfAttendanceUsd: 41000,
      freeMoneyUsd: 30000,
      workStudyUsd: 0,
      loansUsd: 3500,
      letterSaysOweUsd: 7500,
      reallyCostsUsd: 11000,
      fourYearUsd: 44000,
      oneTimeFreeUsd: 0,
      warnings: [],
    },
  ],
  lowestFourYearOfferId: "offer-2",
  assumptions: ["Costs stay flat for 4 years", "Renewable awards are kept"],
};

function offer(o: Partial<OfferDraft> = {}): OfferDraft {
  return { ...newOffer("o1"), name: "Maple State", cost: "$28,000", ...o };
}

describe("parseDollars", () => {
  it("reads whole dollars with $ and commas", () => {
    expect(parseDollars("$12,500")).toBe(12500);
    expect(parseDollars(" 0 ")).toBe(0);
    expect(parseDollars("")).toBeNull();
    expect(parseDollars("12.50")).toBeNull();
    expect(parseDollars("-3")).toBeNull();
    expect(parseDollars("lots")).toBeNull();
  });
});

describe("buildOfferInput", () => {
  it("builds a PublicOfferInput and skips blank lines", () => {
    const result = buildOfferInput([
      offer({
        lines: [
          { ...newLine("l1"), label: " Pell Grant ", amount: "7,395" },
          {
            ...newLine("l2", "loan_federal_subsidized"),
            label: "Direct Subsidized Loan",
            amount: "3500",
            renewable: true,
          },
          newLine("l3"),
        ],
      }),
    ]);
    expect(result).toEqual({
      ok: true,
      input: {
        offers: [
          {
            name: "Maple State",
            costOfAttendanceUsd: 28000,
            lines: [
              { label: "Pell Grant", amountUsd: 7395, category: "grant", renewable: false },
              {
                label: "Direct Subsidized Loan",
                amountUsd: 3500,
                category: "loan_federal_subsidized",
                renewable: true,
              },
            ],
          },
        ],
      },
    });
    if (result.ok) expect(PublicOfferInput.safeParse(result.input).success).toBe(true);
  });

  it("explains every problem in plain words", () => {
    const result = buildOfferInput([
      offer({
        name: " ",
        cost: "",
        lines: [
          { ...newLine("l1"), label: "", amount: "500" },
          { ...newLine("l2"), label: "Grant", amount: "1.5k" },
        ],
      }),
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [
        "School 1: add the school's name.",
        "School 1: enter the cost of attendance in whole dollars.",
        'School 1, line 1: add a label, like "Pell Grant".',
        "School 1, line 2: enter a whole-dollar amount.",
      ],
    });
  });

  it("limits schools and amounts", () => {
    const five = Array.from({ length: 5 }, (_, i) => offer({ key: `o${i}` }));
    expect(buildOfferInput(five)).toMatchObject({ ok: false, errors: ["Compare up to 4 schools at a time."] });
    expect(buildOfferInput([])).toMatchObject({ ok: false, errors: ["Add at least one school."] });
    const huge = buildOfferInput([offer({ cost: "250000" })]);
    expect(huge).toMatchObject({ ok: false });
    if (!huge.ok) expect(huge.errors[0]).toContain("$200,000 or less");
  });
});

describe("bars", () => {
  it("turns a comparison into free-vs-cost bars on one axis", () => {
    expect(barRows(COMPARISON)[0]).toEqual({
      label: "Maple State",
      sub: "$12,000 free money · $5,500 in loans",
      freeUsd: 12000,
      costUsd: 16000,
      endLabel: "$16,000 year 1",
    });
    expect(axisMax(COMPARISON)).toBe(41000);
    expect(axisMax({ columns: [], lowestFourYearOfferId: null, assumptions: [] })).toBe(1);
  });
});
