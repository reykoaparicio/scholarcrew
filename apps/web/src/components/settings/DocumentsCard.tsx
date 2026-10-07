"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { DocumentKind, DocumentMeta } from "@scholarcrew/domain";
import { Button, Card, Icon } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./settings.module.css";

const KIND_LABELS: Record<DocumentKind, string> = {
  award_letter: "Award letter",
  transcript: "Transcript",
  score_report: "Score report",
  essay: "Essay",
  resume: "Resume",
  other: "Document",
};

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** ON-02: uploads are encrypted at rest and listed here for download or deletion. */
export function DocumentsCard({ documents, timeZone }: { documents: DocumentMeta[]; timeZone: string }) {
  const [docs, setDocs] = useState(documents);
  const [error, setError] = useState<string | null>(null);

  async function remove(d: DocumentMeta) {
    setError(null);
    try {
      await api(`/documents/${d.id}`, { method: "DELETE" });
      setDocs((list) => list.filter((x) => x.id !== d.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card title="Documents" aside={<Icon name="doc" />}>
      {docs.length === 0 ? (
        <p className={styles.muted}>Nothing uploaded yet. Transcripts, award letters, and past essays show up here.</p>
      ) : (
        <ul className={styles.list}>
          {docs.map((d) => (
            <li key={d.id}>
              <div>
                <a href={`/api/v1/documents/${d.id}/download`} aria-label={`Download ${d.filename}`}>
                  {d.filename}
                </a>
                <p
                  className={styles.muted}
                >{`${KIND_LABELS[d.kind]} · ${sizeLabel(d.sizeBytes)} · ${instantShort(d.uploadedAt, timeZone)}`}</p>
              </div>
              <Button
                variant="line"
                size="sm"
                className={styles.crit}
                aria-label={`Delete ${d.filename}`}
                onClick={() => void remove(d)}
              >
                Delete
              </Button>
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
