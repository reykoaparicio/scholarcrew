import { usd } from "@/lib/format";
import {
  FREE_CATEGORIES,
  type OfferColumn,
  type OfferComparison,
  type OfferLineCategory,
  type OfferWithLines,
} from "@scholarcrew/domain";
import { Badge, Card, EmptyState, OfferBars, Who } from "@scholarcrew/ui";
import type { ReactNode } from "react";
import styles from "./money.module.css";
import { LOANS, WORK, axisMaxFor, endParts, pageChip } from "./offers";

/** MO-07: the visible chip has the cited text as a hover title; a visually hidden span gives it to screen readers. */
function Chip({ offer, categories }: { offer: OfferWithLines | undefined; categories: OfferLineCategory[] }) {
  const chip = offer ? pageChip(offer.lines, categories) : null;
  if (!chip) return null;
  const cited = `Page ${chip.label.slice(2)}: ${chip.citedText}`;
  return (
    <>
      <span className={styles.chip} title={cited} aria-hidden="true">
        {chip.label}
      </span>
      <span className={styles.srOnly}>{cited}</span>
    </>
  );
}

function headline(c: OfferComparison): string[] {
  const lowest = c.columns.find((col) => col.offerId === c.lowestFourYearOfferId);
  if (!lowest) return [];
  const lines = [`Over four years, ${lowest.collegeName} costs least: ${usd(lowest.fourYearUsd)}.`];
  const cheapestNow = [...c.columns].sort((a, b) => a.reallyCostsUsd - b.reallyCostsUsd)[0];
  if (cheapestNow && cheapestNow.offerId !== lowest.offerId && cheapestNow.oneTimeFreeUsd > 0) {
    lines.push(
      `${cheapestNow.collegeName} looks cheapest this year (${usd(cheapestNow.reallyCostsUsd)}), but ${usd(cheapestNow.oneTimeFreeUsd)} of its free money only applies to the first year.`,
    );
  }
  return lines;
}

/** MO-06: year 1 bars on one axis, the full table, and Ledger's assumptions. MO-07: page chips. */
export function OfferComparisonView({ comparison, offers }: { comparison: OfferComparison; offers: OfferWithLines[] }) {
  if (comparison.columns.length === 0) {
    return (
      <Card>
        <EmptyState title="Confirm an award letter to compare offers" icon="clip">
          Upload a letter, check each line Aid labeled, then confirm it. Confirmed offers show up here side by side.
        </EmptyState>
      </Card>
    );
  }
  const byId = new Map(offers.map((o) => [o.id, o]));
  const cols = comparison.columns;
  const row = (label: ReactNode, cell: (c: OfferColumn) => ReactNode, className?: string) => (
    <tr className={className}>
      <th scope="row">{label}</th>
      {cols.map((c) => (
        <td key={c.offerId}>{cell(c)}</td>
      ))}
    </tr>
  );
  return (
    <div className={styles.stack}>
      <div className={styles.banner}>
        <Who role="compass" />
        <div>
          {headline(comparison).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
      <Card title="Year 1: free money vs. what really costs you">
        <OfferBars
          axisMaxUsd={axisMaxFor(cols)}
          rows={cols.map((c) => {
            const end = endParts(c);
            return {
              label: c.collegeName,
              sub: `${usd(c.costOfAttendanceUsd)} to attend`,
              freeUsd: c.freeMoneyUsd,
              costUsd: c.reallyCostsUsd,
              endLabel: (
                <>
                  <b>{end.amount}</b> <span>{end.rest}</span>
                </>
              ),
            };
          })}
        />
      </Card>
      <Card>
        <table className={styles.table} aria-label="Offer comparison">
          <thead>
            <tr>
              <th scope="col" />
              {cols.map((c) => (
                <th key={c.offerId} scope="col">
                  {c.collegeName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row("Cost to attend", (c) => usd(c.costOfAttendanceUsd))}
            {row("Free money (grants + scholarships)", (c) => (
              <>
                {usd(c.freeMoneyUsd)}
                <Chip offer={byId.get(c.offerId)} categories={FREE_CATEGORIES} />
              </>
            ))}
            {row("Work-study (you earn it)", (c) => (
              <>
                {usd(c.workStudyUsd)}
                <Chip offer={byId.get(c.offerId)} categories={WORK} />
              </>
            ))}
            {row("Loans (you repay them)", (c) => (
              <>
                {usd(c.loansUsd)}
                <Chip offer={byId.get(c.offerId)} categories={LOANS} />
              </>
            ))}
            {row("What the letter says you owe", (c) => usd(c.letterSaysOweUsd))}
            {row("Really costs you, year 1", (c) => usd(c.reallyCostsUsd), styles.really)}
            {row("Over 4 years", (c) =>
              c.offerId === comparison.lowestFourYearOfferId ? (
                <>
                  <Badge tone="good">Lowest</Badge> {usd(c.fourYearUsd)}
                </>
              ) : (
                usd(c.fourYearUsd)
              ),
            )}
            {row("Watch for", (c) => (c.warnings.length > 0 ? c.warnings.join(" · ") : "—"))}
          </tbody>
        </table>
        {comparison.assumptions.map((a) => (
          <p key={a} className={styles.line}>
            {a}
          </p>
        ))}
      </Card>
    </div>
  );
}
