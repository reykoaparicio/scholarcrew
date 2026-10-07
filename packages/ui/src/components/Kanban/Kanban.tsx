import { type ReactNode, useId } from "react";
import { cx } from "../../shared/cx";
import styles from "./Kanban.module.css";

export interface KanbanColumn {
  key: string;
  title: string;
  count: number;
  children: ReactNode;
}

export interface KanbanProps {
  columns: KanbanColumn[];
  className?: string;
}

/** Board of columns; each column is a region named "<title> <count>". */
export function Kanban({ columns, className }: KanbanProps) {
  const baseId = useId();
  return (
    <div className={cx(styles.kanban, className)}>
      {columns.map((column) => {
        const headingId = `${baseId}-${column.key}`;
        return (
          <section key={column.key} className={styles.col} aria-labelledby={headingId}>
            <h2 id={headingId} className={styles.head}>
              {column.title} <span className={styles.count}>{column.count}</span>
            </h2>
            {column.children}
          </section>
        );
      })}
    </div>
  );
}
