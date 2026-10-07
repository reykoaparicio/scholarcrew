import type { CrewRole } from "@scholarcrew/domain";
import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import { CrewDot } from "../CrewDot/CrewDot";
import styles from "./Chip.module.css";

export interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  dot?: CrewRole;
  className?: string;
  children: ReactNode;
}

/** Filter or suggestion pill. Clickable chips are toggle buttons (aria-pressed). */
export function Chip({ active = false, onClick, dot, className, children }: ChipProps) {
  const classes = cx(styles.chip, active && styles.on, className);
  const content = (
    <>
      {dot ? <CrewDot role={dot} /> : null}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={classes} aria-pressed={active} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <span className={classes}>{content}</span>;
}
