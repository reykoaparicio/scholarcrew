import { CREW_NAMES, type CrewRole } from "@scholarcrew/domain";
import { cx } from "../../shared/cx";
import { CrewDot } from "../CrewDot/CrewDot";
import styles from "./Who.module.css";

export interface WhoProps {
  role: CrewRole;
  size?: "sm" | "md";
  className?: string;
}

/** Crew dot plus the member's name, e.g. "● Quill". */
export function Who({ role, size = "md", className }: WhoProps) {
  return (
    <span className={cx(styles.who, size === "sm" && styles.sm, className)}>
      <CrewDot role={role} />
      {CREW_NAMES[role]}
    </span>
  );
}
