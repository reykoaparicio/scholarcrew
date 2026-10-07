import type { OfferComparison, OfferLine, OfferWithLines } from "@scholarcrew/domain";

export const STATE_U = "11111111-0000-4000-8000-000000000001";
export const RIVERSIDE = "11111111-0000-4000-8000-000000000002";
export const NORTHGATE = "11111111-0000-4000-8000-000000000003";

export const comparison: OfferComparison = {
  columns: [
    {
      offerId: STATE_U,
      collegeId: "100",
      collegeName: "State U",
      costOfAttendanceUsd: 27800,
      freeMoneyUsd: 18600,
      workStudyUsd: 2000,
      loansUsd: 5500,
      letterSaysOweUsd: 1700,
      reallyCostsUsd: 9200,
      fourYearUsd: 36800,
      oneTimeFreeUsd: 0,
      warnings: ["Merit $3,000 renews at 3.0 GPA"],
    },
    {
      offerId: RIVERSIDE,
      collegeId: "200",
      collegeName: "Riverside College",
      costOfAttendanceUsd: 31200,
      freeMoneyUsd: 24400,
      workStudyUsd: 0,
      loansUsd: 3500,
      letterSaysOweUsd: 3300,
      reallyCostsUsd: 6800,
      fourYearUsd: 45200,
      oneTimeFreeUsd: 6000,
      warnings: ["$6,000 Riverside Welcome Grant is year 1 only"],
    },
    {
      offerId: NORTHGATE,
      collegeId: "300",
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
  ],
  lowestFourYearOfferId: STATE_U,
  assumptions: ["Assumes costs stay flat and renewable awards are kept."],
};

export function line(o: Partial<OfferLine> = {}): OfferLine {
  return {
    id: "22222222-0000-4000-8000-000000000001",
    offerId: STATE_U,
    position: 0,
    label: "State U Grant",
    amountUsd: 15600,
    category: "grant",
    renewable: true,
    renewalCondition: "",
    page: 1,
    citedText: "State U Grant ... $15,600",
    userCorrected: false,
    ...o,
  };
}

export function offer(o: Partial<OfferWithLines> = {}): OfferWithLines {
  return {
    id: STATE_U,
    collegeId: "100",
    collegeName: "State U",
    awardYear: "2027-28",
    documentId: "33333333-0000-4000-8000-000000000001",
    status: "confirmed",
    costOfAttendanceUsd: 27800,
    createdAt: "2027-03-01T15:00:00.000Z",
    confirmedAt: "2027-03-02T15:00:00.000Z",
    parseJobId: null,
    lines: [
      line(),
      line({
        id: "22222222-0000-4000-8000-000000000002",
        position: 1,
        label: "Merit Scholarship",
        amountUsd: 3000,
        category: "scholarship",
      }),
      line({
        id: "22222222-0000-4000-8000-000000000003",
        position: 2,
        label: "Federal Work-Study",
        amountUsd: 2000,
        category: "work_study",
        page: 2,
      }),
      line({
        id: "22222222-0000-4000-8000-000000000004",
        position: 3,
        label: "Direct Subsidized Loan",
        amountUsd: 3500,
        category: "loan_federal_subsidized",
        page: 2,
      }),
    ],
    ...o,
  };
}
