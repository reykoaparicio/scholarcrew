"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import type { EssayVersion } from "@scholarcrew/domain";
import { Badge, Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./essays.module.css";
import { essayStats, limitBadge } from "./text";

/**
 * ES-02/ES-03: the student's own words. Every save is a version based on the version this tab loaded;
 * a 409 means another tab saved first, so nothing is overwritten and the student reloads.
 */
export function EssayEditor({
  essayId,
  initialBody,
  baseVersion,
  wordLimit,
  charLimit,
  onReload = () => window.location.reload(),
}: {
  essayId: string;
  initialBody: string;
  baseVersion: number;
  wordLimit: number | null;
  charLimit: number | null;
  onReload?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [lastSaved, setLastSaved] = useState(initialBody);
  const [base, setBase] = useState(baseVersion);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stats = essayStats(body, wordLimit, charLimit);
  const badge = limitBadge(stats);
  const dirty = body !== lastSaved;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api<EssayVersion>(`/essays/${essayId}/versions`, { body: { body, baseVersion: base } });
      setBase(saved.version);
      setLastSaved(body);
      setSavedNote(`Draft ${saved.version} saved`);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict") setConflict(true);
      else setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.paper}>
      <div className={styles.paperHead}>
        <span>
          {`${base === 0 ? "New draft" : `Draft ${base}`} · every word typed by you`}
          {dirty ? " · unsaved changes" : ""}
        </span>
        <span className={styles.count}>{stats.label}</span>
        <span aria-live="polite">{badge ? <Badge tone={badge.tone}>{badge.text}</Badge> : null}</span>
      </div>
      {conflict ? (
        <div className={styles.conflict} role="alert">
          <span>
            This draft changed in another tab. Reload to see the latest version; copy anything you want to keep first.
          </span>
          <Button variant="line" size="sm" onClick={onReload}>
            Reload the latest draft
          </Button>
        </div>
      ) : null}
      <textarea
        aria-label="Your draft"
        className={styles.editor}
        value={body}
        maxLength={50_000}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className={styles.paperFoot}>
        <Button variant="primary" disabled={saving || !dirty || conflict} onClick={() => void save()}>
          {saving ? "Saving…" : "Save draft"}
        </Button>
        {savedNote && !dirty ? <span className={styles.footnote}>{savedNote}</span> : null}
        {error ? (
          <p className={styles.footnote} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
