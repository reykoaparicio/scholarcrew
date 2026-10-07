"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import type { VerificationRequestView } from "@scholarcrew/domain";
import { Button, TextArea } from "@scholarcrew/ui";
import { useState } from "react";
import { calendarLong, instantLong } from "./dates";
import styles from "./verify.module.css";

/** 150 → "2.5 hours", 60 → "1 hour", 45 → "45 minutes". */
export function hoursLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.round((minutes / 60) * 100) / 100;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function verifyErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.code === "not_found") return "This link has expired or was already used.";
  if (e instanceof ApiError && e.code === "rate_limited") return "Too many tries. Wait an hour and try again.";
  return errorMessage(e);
}

/** IM-02: the supervisor confirms or declines without an account. */
export function VerifyHoursForm({ token, view }: { token: string; view: VerificationRequestView }) {
  const name = view.studentFirstName || "The student";
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<boolean | null>(null);

  async function answer(confirmed: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api(`/verify-hours/${encodeURIComponent(token)}`, { body: { confirmed, note: note.trim() } });
      setAnswered(confirmed);
    } catch (e) {
      setError(verifyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (answered !== null) {
    return (
      <div className={styles.card}>
        <h1>Thank you</h1>
        <output className={styles.sub}>
          {answered
            ? `We let ${name} know you confirmed ${hoursLabel(view.minutes)} at ${view.organization}.`
            : `We let ${name} know you didn't confirm these hours.`}
        </output>
        <p className={styles.fine}>You can close this page. The link doesn't work anymore.</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h1>{`Confirm ${name}'s service hours`}</h1>
      <p className={styles.sub}>
        {`${name} asked you to confirm these hours. You don't need an account. ScholarCrew records only your answer and your note.`}
      </p>
      <dl className={styles.kv}>
        <dt>Student</dt>
        <dd>{name}</dd>
        <dt>Organization</dt>
        <dd>{view.organization}</dd>
        <dt>Activity</dt>
        <dd>{view.activity}</dd>
        <dt>Date</dt>
        <dd>{calendarLong(view.servedOn)}</dd>
        <dt>Hours</dt>
        <dd>{hoursLabel(view.minutes)}</dd>
      </dl>
      <TextArea
        label={`Note to ${name} (optional)`}
        maxLength={500}
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error ? (
        <p role="alert" className={styles.alert}>
          {error}
        </p>
      ) : null}
      <div className={styles.row}>
        <Button variant="primary" icon="check" disabled={busy} onClick={() => answer(true)}>
          Confirm these hours
        </Button>
        <Button variant="line" disabled={busy} onClick={() => answer(false)}>
          I can't confirm these
        </Button>
      </div>
      <p className={styles.fine}>{`This link expires ${instantLong(view.expiresAt)}.`}</p>
    </div>
  );
}
