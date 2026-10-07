import { usd } from "@/lib/format";
import type { CostSummary } from "@scholarcrew/domain";
import { Button, Card, EmptyState, Eyebrow, GapBar, HeroNumber, Who } from "@scholarcrew/ui";
import styles from "./week.module.css";

/** WK-03: year-1 gap for the top school, computed by Ledger (plan 08), with the estimate source. */
export function GapCard({ gap }: { gap: CostSummary | null }) {
  if (!gap) {
    return (
      <Card title={<Eyebrow>Year-1 gap</Eyebrow>} aside={<Who role="ledger" size="sm" />}>
        <EmptyState
          title="Add a college to see your gap"
          icon="dollar"
          action={
            <Button variant="soft" href="/colleges">
              Add colleges
            </Button>
          }
        >
          Ledger works out what's left to pay once your list has a school.
        </EmptyState>
      </Card>
    );
  }
  return (
    <Card title={<Eyebrow>Year-1 gap · {gap.collegeName}</Eyebrow>} aside={<Who role="ledger" size="sm" />}>
      <HeroNumber
        value={usd(gap.gapUsd)}
        caption={`left to pay, earn, or borrow${gap.isEstimate ? " · estimate" : ""}`}
      />
      <GapBar freeUsd={gap.freeMoneyUsd} gapUsd={gap.gapUsd} totalLabel="to attend" />
      {gap.pendingUsd > 0 ? (
        <p className={styles.note}>
          Your open applications are worth <b>{usd(gap.pendingUsd)}</b>. If they all come through, this year's gap drops
          to <b>{usd(gap.gapIfPendingWinUsd)}</b>.
        </p>
      ) : null}
      {gap.budgetUsd !== null && gap.gapAfterBudgetUsd !== null ? (
        <p className={styles.note}>
          After the family budget of <b>{usd(gap.budgetUsd)}</b> a year, <b>{usd(gap.gapAfterBudgetUsd)}</b> is left.
        </p>
      ) : null}
      <p className={styles.srcline}>
        {gap.sourceLabel}. <a href="/money">Run {gap.collegeName}'s calculator</a>
      </p>
    </Card>
  );
}
