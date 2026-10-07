"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { EssayVersion } from "@scholarcrew/domain";
import { Button, Modal } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./essays.module.css";

/** ES-02: every saved version, newest first; a version opens read-only. */
export function HistoryModal({ essayId, timeZone }: { essayId: string; timeZone: string }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<EssayVersion[] | null>(null);
  const [viewing, setViewing] = useState<EssayVersion | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    setViewing(null);
    setError(null);
    try {
      const list = await api<EssayVersion[]>(`/essays/${essayId}/versions`);
      setVersions([...list].sort((a, b) => b.version - a.version));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <Button variant="line" onClick={() => void show()}>
        Draft history
      </Button>
      <Modal open={open} title="Draft history" onClose={() => setOpen(false)}>
        {error ? (
          <p className={styles.footnote} role="alert">
            {error}
          </p>
        ) : null}
        {viewing ? (
          <>
            <p className={styles.meta}>{`Draft ${viewing.version} · ${viewing.wordCount} words · read-only`}</p>
            <div className={styles.readOnlyBody}>{viewing.body}</div>
            <Button variant="line" onClick={() => setViewing(null)}>
              Back to all drafts
            </Button>
          </>
        ) : versions === null ? (
          <p className={styles.meta}>Loading drafts…</p>
        ) : versions.length === 0 ? (
          <p className={styles.meta}>No saved drafts yet.</p>
        ) : (
          <ul className={styles.versions}>
            {versions.map((v) => (
              <li key={v.id}>
                <span>{`Draft ${v.version} · ${instantShort(v.createdAt, timeZone)} · ${v.wordCount} words`}</span>
                <Button variant="line" size="sm" onClick={() => setViewing(v)}>
                  View
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
