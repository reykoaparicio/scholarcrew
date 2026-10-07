import type { ReactNode } from "react";
import styles from "./HeroNumber.module.css";

export interface HeroNumberProps {
  value: string;
  caption?: ReactNode;
  className?: string;
}

/** The one large figure a card leads with. Proportional digits, 52px, same sans as the body. */
export function HeroNumber({ value, caption, className }: HeroNumberProps) {
  return (
    <div className={className}>
      <p className={styles.num}>{value}</p>
      {caption ? <p className={styles.cap}>{caption}</p> : null}
    </div>
  );
}
