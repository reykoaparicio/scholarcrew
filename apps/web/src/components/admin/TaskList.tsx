import { instantLong } from "@/components/public/dates";
import { cx } from "@/lib/cx";
import type { CatalogTask } from "@scholarcrew/domain";
import { EmptyState, Icon } from "@scholarcrew/ui";
import styles from "./admin.module.css";
import { ADMIN_TZ } from "./labels";
import { KIND_LABELS, taskChip, taskTitle } from "./review";

/** The queue column: oldest first, each item links to itself with `?task=`. */
export function TaskList({
  items,
  selectedId,
}: { items: Array<{ task: CatalogTask; href: string }>; selectedId: string | null }) {
  if (items.length === 0) {
    return (
      <EmptyState title="Nothing to review" icon="check">
        New research candidates, submissions, reports, and re-checks show up here.
      </EmptyState>
    );
  }
  return (
    <nav className={styles.queue} aria-label="Review queue">
      {items.map(({ task, href }) => {
        const chip = taskChip(task);
        const on = task.id === selectedId;
        return (
          <a
            key={task.id}
            href={href}
            className={cx(styles.qi, on && styles.qiOn)}
            aria-current={on ? "true" : undefined}
          >
            <div className={styles.row}>
              <span className={styles.ttype}>{KIND_LABELS[task.kind]}</span>
              <span className={styles.qm}>
                <Icon name={chip.icon} /> {chip.text}
              </span>
            </div>
            <div className={styles.qn}>{taskTitle(task)}</div>
            <div className={styles.qm}>{`Opened ${instantLong(task.createdAt, ADMIN_TZ)}`}</div>
          </a>
        );
      })}
    </nav>
  );
}
