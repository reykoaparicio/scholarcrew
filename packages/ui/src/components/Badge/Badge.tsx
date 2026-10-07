import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./Badge.module.css";

export type BadgeTone = "good" | "warn" | "crit" | "neutral" | "navy";

export interface BadgeProps {
  tone: BadgeTone;
  icon?: IconName;
  className?: string;
  children: ReactNode;
}

// Status tones always carry an icon so state is never shown by color alone.
const DEFAULT_ICON: Partial<Record<BadgeTone, IconName>> = { good: "check", warn: "alert", crit: "alert" };

export function Badge({ tone, icon, className, children }: BadgeProps) {
  const name = icon ?? DEFAULT_ICON[tone];
  return (
    <span className={cx(styles.badge, styles[tone], className)}>
      {name ? <Icon name={name} /> : null}
      {children}
    </span>
  );
}
