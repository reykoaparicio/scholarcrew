"use client";

import { api, errorMessage } from "@/lib/api";
import type { ScholarshipSummary } from "@scholarcrew/domain";
import { Button, Modal, TextArea, TextInput } from "@scholarcrew/ui";
import { type FormEvent, useState } from "react";
import shared from "./shared.module.css";

/**
 * SC-07: submitted by URL, visible only to this student and labeled unverified until an admin publishes it.
 * One request (R2C-12): 07 `submitLocalScholarship` also puts the listing on the board as `planned`.
 */
export function AddLocalModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^https?:\/\/\S+$/i.test(url.trim())) return setError("Paste the full link, starting with https://");
    if (!name.trim()) return setError("Add the scholarship's name.");
    setSaving(true);
    setError(null);
    try {
      await api<ScholarshipSummary>("/scholarships/local", {
        body: { url: url.trim(), name: name.trim(), notes: notes.trim() },
      });
      setDone(true);
      onAdded();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Add a local scholarship" onClose={onClose}>
      {done ? (
        <div className={shared.form}>
          <p>Added to your board. It's marked unverified until we check the listing.</p>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <form className={shared.form} onSubmit={submit} noValidate>
          <TextInput label="Link to the listing" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          <TextInput label="Scholarship name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          <TextArea
            label="Notes (optional)"
            value={notes}
            maxLength={1000}
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
          />
          {error ? (
            <p className={shared.error} role="alert">
              {error}
            </p>
          ) : null}
          <Button variant="primary" type="submit" disabled={saving}>
            Add it
          </Button>
        </form>
      )}
    </Modal>
  );
}
