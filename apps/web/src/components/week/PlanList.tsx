"use client";

import { api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { minutesLabel } from "@/lib/format";
import type { PlanItem, TaskStatus, WeekPlan } from "@scholarcrew/domain";
import { Card, EmptyState, Icon, Who } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { itemMeta } from "./summary";
import styles from "./week.module.css";

/** WK-02: the week's open and done items. Checking an item marks it done (PATCH /plan-items/:id). */
export function PlanList({ plan, readOnly = false }: { plan: WeekPlan; readOnly?: boolean }) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, TaskStatus>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusOf = (i: PlanItem): TaskStatus => overrides[i.id] ?? i.status;

  async function toggle(i: PlanItem) {
    if (readOnly) return;
    const next: TaskStatus = statusOf(i) === "done" ? "todo" : "done";
    setOverrides((o) => ({ ...o, [i.id]: next }));
    setPending(i.id);
    setError(null);
    try {
      await api<PlanItem>(`/plan-items/${i.id}`, { method: "PATCH", body: { status: next } });
      router.refresh();
    } catch (e) {
      setOverrides((o) => ({ ...o, [i.id]: i.status }));
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const items = plan.items.filter((i) => statusOf(i) !== "skipped");
  const open = items.filter((i) => statusOf(i) === "todo");
  const doneCount = items.length - open.length;
  const minutes = open.reduce((sum, i) => sum + i.minutes, 0);

  return (
    <Card
      title="This week"
      aside={
        <span className={styles.muted}>
          {minutesLabel(minutes)} planned · {doneCount} done
        </span>
      }
    >
      {items.length === 0 ? (
        <EmptyState title="Nothing planned yet" icon="calendar">
          Ask your crew to plan your week, or add something from a scholarship or essay.
        </EmptyState>
      ) : (
        <ul className={styles.tasks}>
          {items.map((i) => {
            const done = statusOf(i) === "done";
            const meta = itemMeta(i);
            return (
              <li key={i.id} className={cx(styles.task, done && styles.done)}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    className={styles.srOnly}
                    checked={done}
                    disabled={readOnly || pending === i.id}
                    onChange={() => void toggle(i)}
                  />
                  <span className={cx(styles.cbx, done && styles.cbxOn)} aria-hidden="true">
                    {done ? <Icon name="check" /> : null}
                  </span>
                  <span className={styles.srOnly}>{i.title}</span>
                </label>
                <div className={styles.tMain}>
                  <div className={styles.tTitle}>{i.title}</div>
                  <div className={styles.tMeta}>
                    {meta ? <span>{meta}</span> : null}
                    {i.contributors.map((r) => (
                      <Who key={r} role={r} size="sm" />
                    ))}
                  </div>
                </div>
                <span className={styles.tTime}>{done ? "done" : `${i.minutes} min`}</span>
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
