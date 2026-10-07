"use client";

import { Fragment, type ReactNode, useState } from "react";
import a11y from "../../shared/a11y.module.css";
import { cx } from "../../shared/cx";
import { pct, usd, usdCompact } from "../../shared/format";
import styles from "./OfferBars.module.css";

export interface OfferBarRow {
  label: string;
  sub: string;
  freeUsd: number;
  costUsd: number;
  endLabel: ReactNode;
}

export interface OfferBarsProps {
  rows: OfferBarRow[];
  axisMaxUsd: number;
  freeLabel?: string;
  costLabel?: string;
  caption?: string;
  categoryLabel?: string;
  className?: string;
}

const QUARTERS = [0, 1, 2, 3, 4];

/** Horizontal free-vs-cost bars on one shared axis, with a legend, hover tooltips, and a table twin. */
export function OfferBars({
  rows,
  axisMaxUsd,
  freeLabel = "Free money (grants + scholarships)",
  costLabel = "Really costs you (pay, earn, or borrow)",
  caption = "Year 1 free money and cost by school",
  categoryLabel = "School",
  className,
}: OfferBarsProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const axisMax =
    axisMaxUsd > 0 ? axisMaxUsd : Math.max(1, ...rows.map((r) => Math.max(0, r.freeUsd) + Math.max(0, r.costUsd)));
  const ticks = QUARTERS.map((q) => ({ value: (axisMax * q) / 4, left: `${q * 25}%` }));
  const bars = rows.map((row) => {
    const free = Math.max(0, row.freeUsd);
    const cost = Math.max(0, row.costUsd);
    const freePct = Math.min(100, pct(free, axisMax));
    const costPct = Math.min(100 - freePct, pct(cost, axisMax));
    return { row, free, cost, freePct, costPct };
  });
  return (
    <figure className={cx(styles.offerBars, className)}>
      <div className={styles.legend} aria-hidden="true">
        <span>
          <span className={cx(styles.sw, styles.free)} />
          {freeLabel}
        </span>
        <span>
          <span className={cx(styles.sw, styles.cost)} />
          {costLabel}
        </span>
      </div>
      <div className={styles.plot} style={{ gridTemplateRows: `repeat(${rows.length}, 46px) 22px` }} aria-hidden="true">
        <div className={styles.grid} style={{ gridRow: `1 / ${rows.length + 1}` }}>
          {ticks.map((tick) => (
            <span
              key={tick.left}
              className={cx(styles.gl, tick.value === 0 && styles.base)}
              style={{ left: tick.left }}
            />
          ))}
        </div>
        {bars.map(({ row, free, cost, freePct, costPct }, index) => (
          <Fragment key={row.label}>
            <div className={styles.lab} style={{ gridRow: index + 1 }}>
              {row.label}
              <span>{row.sub}</span>
            </div>
            <div
              data-row={row.label}
              className={cx(styles.track, hovered === row.label && styles.active)}
              style={{ gridRow: index + 1 }}
              onPointerEnter={() => setHovered(row.label)}
              onPointerLeave={() => setHovered(null)}
            >
              {free > 0 ? (
                <span
                  data-series="free"
                  className={cx(styles.s, styles.free, cost === 0 && styles.cap)}
                  style={{ width: `${freePct}%` }}
                />
              ) : null}
              {cost > 0 ? (
                <span
                  data-series="cost"
                  className={cx(styles.s, styles.cost, styles.cap)}
                  style={{ width: `${costPct}%` }}
                />
              ) : null}
              <span className={styles.endLabel}>{row.endLabel}</span>
              {hovered === row.label ? (
                <span className={styles.tip}>
                  <span>
                    <span className={cx(styles.key, styles.free)} />
                    <b>{usd(free)}</b> {freeLabel}
                  </span>
                  <span>
                    <span className={cx(styles.key, styles.cost)} />
                    <b>{usd(cost)}</b> {costLabel}
                  </span>
                </span>
              ) : null}
            </div>
          </Fragment>
        ))}
        <div className={styles.axis} style={{ gridRow: rows.length + 1 }}>
          {ticks.map((tick) => (
            <span key={tick.left} style={{ left: tick.left }}>
              {usdCompact(tick.value)}
            </span>
          ))}
        </div>
      </div>
      <table className={a11y.srOnly}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{categoryLabel}</th>
            <th scope="col">{freeLabel}</th>
            <th scope="col">{costLabel}</th>
          </tr>
        </thead>
        <tbody>
          {bars.map(({ row, free, cost }) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{usd(free)}</td>
              <td>{usd(cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
