"use client";

import { api, errorMessage } from "@/lib/api";
import { US_STATES } from "@scholarcrew/domain";
import { Button, Select, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./admin.module.css";

const STATE_OPTIONS = US_STATES.map((s) => ({ value: s, label: s }));

/** CA-01 trigger: the worker researches candidates; each one lands in the review queue. */
export function ResearchForm() {
  const [state, setState] = useState("TX");
  const [county, setCounty] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    const c = county.trim();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api("/admin/research", { body: c ? { state, county: c } : { state } });
      setMessage(
        `Research started for ${c ? `${c} County, ` : ""}${state}. New candidates show up in the review queue.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.stack}>
      <div className={styles.formGrid}>
        <Select label="State" options={STATE_OPTIONS} value={state} onChange={(e) => setState(e.target.value)} />
        <TextInput
          label="County (optional)"
          maxLength={100}
          value={county}
          onChange={(e) => setCounty(e.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className={styles.alert}>
          {error}
        </p>
      ) : null}
      {message ? <output className={styles.ok}>{message}</output> : null}
      <div className={styles.row}>
        <Button variant="primary" disabled={busy} onClick={start}>
          Start research
        </Button>
      </div>
    </div>
  );
}
