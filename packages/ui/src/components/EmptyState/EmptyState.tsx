import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  title: string;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Dashed placeholder for empty lists and kanban columns. */
export function EmptyState({ title, icon, action, className, children }: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, className)}>
      {icon ? <Icon name={icon} className={styles.icon} /> : null}
      <p className={styles.title}>{title}</p>
      {children ? <div>{children}</div> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
