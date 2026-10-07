import a11y from "../../shared/a11y.module.css";
import { cx } from "../../shared/cx";
import { pct, usd } from "../../shared/format";
import styles from "./GapBar.module.css";

export interface GapBarProps {
  freeUsd: number;
  gapUsd: number;
  freeLabel?: string;
  gapLabel?: string;
  /** Words after the total in the legend: "of $27,800 to attend". */
  totalLabel?: string;
  className?: string;
}

/** Two-segment bar (free money, then the gap) with a legend and a text twin. */
export function GapBar({
  freeUsd,
  gapUsd,
  freeLabel = "Free money",
  gapLabel = "Gap",
  totalLabel = "to attend",
  className,
}: GapBarProps) {
  const free = Math.max(0, freeUsd);
  const gap = Math.max(0, gapUsd);
  const total = free + gap;
  const freePct = pct(free, total);
  const gapPct = pct(gap, total);
  const summary = `${freeLabel} ${usd(free)} (${freePct}%), ${gapLabel} ${usd(gap)} (${gapPct}%), of ${usd(total)} ${totalLabel}.`;
  return (
    <div className={className}>
      <div className={styles.bar} aria-hidden="true">
        {free > 0 ? (
          <span
            data-series="free"
            className={cx(styles.seg, styles.free, gap === 0 && styles.cap)}
            style={{ width: `${freePct}%` }}
          />
        ) : null}
        {gap > 0 ? (
          <span data-series="gap" className={cx(styles.seg, styles.gap, styles.cap)} style={{ width: `${gapPct}%` }} />
        ) : null}
      </div>
      <div className={styles.legend} aria-hidden="true">
        <span>
          <span className={cx(styles.sw, styles.free)} />
          {freeLabel} <b>{usd(free)}</b>
        </span>
        <span>
          <span className={cx(styles.sw, styles.gap)} />
          {gapLabel} <b>{usd(gap)}</b>
        </span>
        <span className={styles.total}>
          of {usd(total)} {totalLabel}
        </span>
      </div>
      <p className={a11y.srOnly}>{summary}</p>
    </div>
  );
}
