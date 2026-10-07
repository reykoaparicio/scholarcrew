import { cx } from "../../shared/cx";
import styles from "./Progress.module.css";

export interface ProgressProps {
  /** 0..1; values outside are clamped, NaN is 0. */
  value: number;
  label?: string;
  className?: string;
}

/** Thin navy meter on a lighter navy track (native <progress>). */
export function Progress({ value, label, className }: ProgressProps) {
  const percent = Number.isFinite(value) ? Math.round(Math.min(1, Math.max(0, value)) * 100) : 0;
  return (
    <progress className={cx(styles.progress, className)} value={percent} max={100} aria-label={label}>
      {percent}%
    </progress>
  );
}
