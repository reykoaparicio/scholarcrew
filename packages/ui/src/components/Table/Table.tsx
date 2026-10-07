import type { ReactNode } from "react";
import a11y from "../../shared/a11y.module.css";
import { cx } from "../../shared/cx";
import styles from "./Table.module.css";

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  /** Cell content; without it the cell shows row[key] when that is a string or number. */
  render?: (row: T) => ReactNode;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey?: (row: T) => string;
  selectedKey?: string;
  caption?: string;
  className?: string;
}

function cellValue<T>(row: T, key: string): ReactNode {
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? value : null;
}

/** Data table in the mockup style: uppercase muted headers, hairline rows, tabular right-aligned numbers. */
export function Table<T extends object>({ columns, rows, rowKey, selectedKey, caption, className }: TableProps<T>) {
  const keyed = rows.map((row, position) => ({ row, rowId: rowKey ? rowKey(row) : `row-${position}` }));
  return (
    <table className={cx(styles.table, className)}>
      {caption ? <caption className={a11y.srOnly}>{caption}</caption> : null}
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" className={column.align === "right" ? styles.r : undefined}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {keyed.map(({ row, rowId }) => (
          <tr key={rowId} className={rowId === selectedKey ? styles.sel : undefined}>
            {columns.map((column) => (
              <td key={column.key} className={column.align === "right" ? styles.r : undefined}>
                {column.render ? column.render(row) : cellValue(row, column.key)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
