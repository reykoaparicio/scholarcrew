import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import styles from "./Tag.module.css";

export interface TagProps {
  className?: string;
  children: ReactNode;
}

/** Story theme or similar short label. */
export function Tag({ className, children }: TagProps) {
  return <span className={cx(styles.tag, className)}>{children}</span>;
}
