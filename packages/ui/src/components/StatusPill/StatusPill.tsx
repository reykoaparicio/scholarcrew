import type { JobStatus } from "@scholarcrew/domain";
import { cx } from "../../shared/cx";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./StatusPill.module.css";

export type PillStatus = JobStatus | "on";

const PILL: Record<PillStatus, { label: string; icon: IconName; tone: "neutral" | "navy" | "good" | "warn" | "crit" }> =
  {
    queued: { label: "Queued", icon: "clock", tone: "neutral" },
    working: { label: "Working", icon: "spin", tone: "navy" },
    ready: { label: "Ready", icon: "check", tone: "good" },
    needs_input: { label: "Needs you", icon: "alert", tone: "warn" },
    failed: { label: "Failed", icon: "alert", tone: "crit" },
    on: { label: "On", icon: "check", tone: "neutral" },
  };

export interface StatusPillProps {
  status: PillStatus;
  /** Replaces the default text, e.g. "Done" or "Not started" for family tasks. */
  label?: string;
  className?: string;
}

/** Job or task state as tone + icon + text. */
export function StatusPill({ status, label, className }: StatusPillProps) {
  const pill = PILL[status];
  return (
    <span className={cx(styles.pill, styles[pill.tone], className)}>
      <Icon name={pill.icon} />
      {label ?? pill.label}
    </span>
  );
}
