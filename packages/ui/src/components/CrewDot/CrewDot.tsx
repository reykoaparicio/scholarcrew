import type { CrewRole } from "@scholarcrew/domain";
import { CREW_COLORS } from "../../crewColors";
import { cx } from "../../shared/cx";
import styles from "./CrewDot.module.css";

export interface CrewDotProps {
  role: CrewRole;
  hollow?: boolean;
  className?: string;
}

/** 8px identity dot in the crew color. Decorative: the name always sits beside it. */
export function CrewDot({ role, hollow = false, className }: CrewDotProps) {
  const color = CREW_COLORS[role];
  return (
    <span
      aria-hidden="true"
      data-role={role}
      className={cx(styles.dot, hollow && styles.hollow, className)}
      style={hollow ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : { backgroundColor: color }}
    />
  );
}
