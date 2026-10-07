import { usd } from "@/lib/format";
import type { OfferColumn, OfferComparison } from "@scholarcrew/domain";
import { Badge, OfferBars, Table, type TableColumn } from "@scholarcrew/ui";
import styles from "./offerTool.module.css";
import { axisMax, barRows } from "./offerToolState";

const METRICS: Array<{ key: keyof OfferColumn; label: string }> = [
  { key: "costOfAttendanceUsd", label: "Cost of attendance" },
  { key: "freeMoneyUsd", label: "Free money (grants and scholarships)" },
  { key: "workStudyUsd", label: "Work-study (you earn it by working)" },
  { key: "loansUsd", label: "Loans (you pay these back)" },
  { key: "letterSaysOweUsd", label: "What the letter says you owe" },
  { key: "reallyCostsUsd", label: "What it really costs, year 1" },
  { key: "fourYearUsd", label: "4-year estimate" },
];

type MetricRow = { key: string; label: string; values: Record<string, number> };

export function OfferResults({ comparison }: { comparison: OfferComparison }) {
  const cols = comparison.columns;
  const rows: MetricRow[] = METRICS.map((m) => ({
    key: m.key,
    label: m.label,
    values: Object.fromEntries(cols.map((c) => [c.offerId, Number(c[m.key])])),
  }));
  const columns: TableColumn<MetricRow>[] = [
    { key: "label", header: "Per year unless noted" },
    ...cols.map((c) => ({
      key: c.offerId,
      header: c.collegeName,
      align: "right" as const,
      render: (row: MetricRow) => usd(row.values[c.offerId] ?? 0),
    })),
  ];
  const lowest = cols.find((c) => c.offerId === comparison.lowestFourYearOfferId);
  const warnings = cols.flatMap((c) => c.warnings.map((w) => `${c.collegeName}: ${w}`));
  return (
    <section className={styles.results} aria-labelledby="offer-results-h">
      <h2 id="offer-results-h">What each offer really costs</h2>
      {lowest ? (
        <Badge tone="good" icon="check">
          {`Lowest 4-year cost: ${lowest.collegeName}`}
        </Badge>
      ) : null}
      <OfferBars
        rows={barRows(comparison)}
        axisMaxUsd={axisMax(comparison)}
        freeLabel="Free money"
        costLabel="You pay, year 1"
        caption="Year 1: free money against what's left to pay"
      />
      <Table columns={columns} rows={rows} rowKey={(r) => r.key} caption="Side by side" />
      {warnings.length > 0 ? (
        <ul className={styles.warnings}>
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      <div className={styles.assume}>
        <h3>Assumptions</h3>
        <ul>
          {comparison.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
      <p className={styles.fine}>
        Loans and work-study aren't free money. Nothing you typed was saved, and no AI was used: the math runs as plain
        code.
      </p>
    </section>
  );
}
