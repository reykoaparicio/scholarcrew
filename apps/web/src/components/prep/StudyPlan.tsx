"use client";

import { api, errorMessage } from "@/lib/api";
import { dateShort, plural } from "@/lib/format";
import type { PlanItem } from "@scholarcrew/domain";
import { Button, Card, Eyebrow, TextInput, Who } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import shared from "../scholarships/shared.module.css";
import { planSummary, proposeStudyPlan } from "./prep";
import styles from "./prep.module.css";

/** PR-04: weekly sessions up to the next test date; accepting adds them to the weekly plan. */
export function StudyPlan({ today }: { today: string }) {
  const router = useRouter();
  const [testDate, setTestDate] = useState("");
  const [added, setAdded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sessions = /^\d{4}-\d{2}-\d{2}$/.test(testDate) ? proposeStudyPlan(today, testDate) : [];

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const items = await api<PlanItem[]>("/prep/study-plan", { body: { sessions } });
      setAdded(items.length);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Eyebrow>
        <Who role="prep" size="sm" /> <span>· Study plan proposal</span>
      </Eyebrow>
      <TextInput
        className={styles.planField}
        label="Next test date"
        type="date"
        value={testDate}
        onChange={(e) => setTestDate(e.target.value)}
      />
      {sessions.length > 0 ? (
        <>
          <h3>{planSummary(sessions, testDate)}</h3>
          <ul className={styles.sessions}>
            {sessions.map((s) => (
              <li key={`${s.dueOn}:${s.title}`}>
                <b>{s.dueOn ? dateShort(s.dueOn) : ""}</b>
                <span>{s.title}</span>
                <span>{`${s.minutes} min`}</span>
              </li>
            ))}
          </ul>
          {added === null ? (
            <Button variant="primary" icon="plus" disabled={busy} onClick={() => void accept()}>
              Add to my weekly plan
            </Button>
          ) : (
            <p>{`Added ${plural(added, "session")} to your weekly plan.`}</p>
          )}
        </>
      ) : testDate ? (
        <p className={styles.note}>
          That date is too soon for a weekly plan. One timed practice test is the best use of the time.
        </p>
      ) : (
        <p className={styles.note}>Pick your next test date and Prep proposes short weekly sessions until then.</p>
      )}
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
