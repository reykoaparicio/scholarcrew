import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import styles from "./Eyebrow.module.css";

export interface EyebrowProps {
  className?: string;
  children: ReactNode;
}

/** Small uppercase kicker above a card's content, often with a Who inside. */
export function Eyebrow({ className, children }: EyebrowProps) {
  return <div className={cx(styles.eyebrow, className)}>{children}</div>;
}
