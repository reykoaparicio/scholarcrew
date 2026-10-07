"use client";

import { errorMessage } from "@/lib/api";
import type { ApplicationPatch, BoardCard } from "@scholarcrew/domain";
import { Button, Modal, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import { type WonChoice, parseWonInput } from "./board";
import styles from "./scholarships.module.css";
import shared from "./shared.module.css";

/** SC-09. Render with key={card id} so the fields reset per card. */
export function WonModal({
  card,
  onClose,
  onSave,
}: {
  card: BoardCard | null;
  onClose: () => void;
  onSave: (patch: ApplicationPatch) => Promise<void>;
}) {
  const [amount, setAmount] = useState(card ? String(card.scholarship.amountMaxUsd) : "");
  const [choice, setChoice] = useState<WonChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = parseWonInput(amount, choice);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed.patch);
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      open={card !== null}
      title={card ? `You won ${card.scholarship.name}` : "Mark won"}
      onClose={onClose}
      footer={
        <>
          <Button variant="line" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            Save win
          </Button>
        </>
      }
    >
      <div className={shared.form}>
        <TextInput
          label="Amount you won"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <fieldset className={styles.radios}>
          <legend>Is it renewable?</legend>
          <label>
            <input
              type="radio"
              name="won-renewable"
              checked={choice === "one_time"}
              onChange={() => setChoice("one_time")}
            />{" "}
            One-time
          </label>
          <label>
            <input
              type="radio"
              name="won-renewable"
              checked={choice === "renewable"}
              onChange={() => setChoice("renewable")}
            />{" "}
            Renewable (it pays again each year you qualify)
          </label>
        </fieldset>
        <p className={shared.muted}>Ledger subtracts the win from your gap and adds a thank-you note to your plan.</p>
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
