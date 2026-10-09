import { usd } from "@/lib/format";
import type { CostSummary } from "@scholarcrew/domain";
import { Card, EmptyState, GapBar } from "@scholarcrew/ui";
import styles from "./money.module.css";
import { budgetLine, pendingLine, sourceLine } from "./offers";

/** MO-01..MO-03 and MO-10: year-1 gap per listed college with its source. */
export function CostCards({ costs }: { costs: CostSummary[] }) {
  if (costs.length === 0) {
    return (
      <Card>
        <EmptyState title="No costs yet" icon="dollar">
          Add colleges to your list and Ledger estimates what each one really costs.
        </EmptyState>
      </Card>
    );
  }
  return (
    <div className={styles.grid}>
      {costs.map((c) => {
        const pending = pendingLine(c);
        const budget = budgetLine(c);
        return (
          <Card key={c.collegeId} title={c.collegeName}>
            <div className={styles.big}>{`${usd(c.gapUsd)} a year`}</div>
            <p className={styles.line}>gap after free money</p>
            <div className={styles.costBar}>
              <GapBar freeUsd={c.freeMoneyUsd} gapUsd={c.gapUsd} totalLabel="to attend" />
            </div>
            {pending || budget ? (
              <div className={styles.costNote}>
                {pending ? <p>{pending}</p> : null}
                {budget ? <p>{budget}</p> : null}
              </div>
            ) : null}
            <p className={`${styles.line} ${styles.costSource}`}>{sourceLine(c)}</p>
          </Card>
        );
      })}
    </div>
  );
}
