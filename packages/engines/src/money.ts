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
