"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { Decision } from "@scholarcrew/domain";
import { Card } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./memory.module.css";

/** ME-04: decisions so the crew doesn't re-argue them. The student can delete any. */
export function DecisionsCard({ decisions: initial, timeZone }: { decisions: Decision[]; timeZone: string }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function remove(d: Decision) {
    setError(null);
    try {
      await api(`/decisions/${d.id}`, { method: "DELETE" });
      setItems((list) => list.filter((x) => x.id !== d.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card title="Decisions we made" aside={<span className={styles.muted}>So the crew doesn't re-argue them</span>}>
      {items.length === 0 ? (
        <p className={styles.muted}>No decisions yet. When you settle something in chat, Compass can save it here.</p>
      ) : (
        <ul>
          {items.map((d) => (
            <li key={d.id} className={styles.dec}>
              <span className={styles.date}>{instantShort(d.decidedAt, timeZone)}</span>
              <span>
                {d.summary}
                {d.rationale ? <span className={styles.muted}>{` ${d.rationale}`}</span> : null}
              </span>
              <button
                type="button"
                className={styles.link}
                aria-label={`Delete decision: ${d.summary}`}
                onClick={() => void remove(d)}
              >
                Delete
              </button>
            </li>
          ))}
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
