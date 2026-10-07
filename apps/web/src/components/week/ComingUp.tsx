import { dateShort, daysLabel, usd } from "@/lib/format";
import type { Deadline } from "@scholarcrew/domain";
import { Badge, Card } from "@scholarcrew/ui";
import styles from "./week.module.css";

/** WK-04: the next four deadlines; within 14 days gets a warning badge (icon + text, never color alone). */
export function ComingUp({ deadlines }: { deadlines: Deadline[] }) {
  return (
    <Card title="Coming up">
      {deadlines.length === 0 ? (
        <p className={styles.muted}>Nothing due in the next few weeks.</p>
      ) : (
        <ul className={styles.deadlines}>
          {deadlines.map((d) => (
            <li key={`${d.refType}:${d.refId}:${d.dueOn}`}>
              <span className={styles.date}>{dateShort(d.dueOn)}</span>
              <span>{d.valueUsd ? `${d.title} · ${usd(d.valueUsd)}` : d.title}</span>
              {d.warning ? (
                <Badge tone="warn" icon="clock">
                  {daysLabel(d.daysLeft)}
                </Badge>
              ) : (
                <span className={styles.days}>{daysLabel(d.daysLeft)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
