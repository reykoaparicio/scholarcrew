"use client";

import { api, errorMessage } from "@/lib/api";
import { CREW_NAMES, type IsoDate, type PlanItem } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { contributorsLine, heroMeta, nextWeekStart, openLabel, planHref } from "./summary";
import styles from "./week.module.css";

/** WK-01: the highest-priority open item with Open and Not this week. */
export function NextStepHero({
  item,
  weekStart,
  readOnly = false,
}: {
  item: PlanItem;
  weekStart: IsoDate;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { lead, others } = contributorsLine(item.contributors);

  async function defer() {
    setBusy(true);
    setError(null);
    try {
      await api(`/plan-items/${item.id}`, { method: "PATCH", body: { weekStart: nextWeekStart(weekStart) } });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <section className={styles.hero} aria-label="Your next step">
      <div className={styles.heroEyebrow}>
        Your next step
        {lead ? (
          <>
            {" · "}
            <b>{CREW_NAMES[lead]}</b>
            {others ? ` with ${others}` : ""}
          </>
        ) : null}
      </div>
      <h2>{item.title}</h2>
      <p>{heroMeta(item)}</p>
      <div className={styles.heroRow}>
        <Button variant="white" iconEnd="arrow" href={planHref(item)}>
          {openLabel(item)}
        </Button>
        {readOnly ? null : (
          <Button variant="glass" disabled={busy} onClick={() => void defer()}>
            Not this week
          </Button>
        )}
      </div>
      {error ? (
        <p className={styles.heroError} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
