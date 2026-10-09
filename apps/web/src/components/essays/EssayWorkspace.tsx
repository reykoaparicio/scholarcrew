"use client";

import { api, errorMessage } from "@/lib/api";
import type { Essay, EssayPatch, EssayStatus, EssayWithBody } from "@scholarcrew/domain";
import { Button, Select } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import shared from "../scholarships/shared.module.css";
import { CommentsPanel } from "./CommentsPanel";
import { EssayEditor } from "./EssayEditor";
import { ReviewView } from "./ReviewView";
import styles from "./essays.module.css";
import { essayStats } from "./text";

const STATUS_OPTIONS: Array<{ value: EssayStatus; label: string }> = [
  { value: "drafting", label: "Drafting" },
  { value: "ready", label: "Ready" },
  { value: "submitted", label: "Submitted" },
];

/** R2P-14: the student marks the essay Drafting, Ready, or Submitted (`PATCH /essays/:id` with an `EssayPatch`). */
function EssayStatusSelect({ essayId, status }: { essayId: string; status: EssayStatus }) {
  const router = useRouter();
  const [value, setValue] = useState<EssayStatus>(status);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function change(next: EssayStatus) {
    const previous = value;
    const body: EssayPatch = { status: next };
    setValue(next);
    setError(null);
    setBusy(true);
    try {
      await api<Essay>(`/essays/${essayId}`, { method: "PATCH", body });
      router.refresh();
    } catch (e) {
      setValue(previous);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.status}>
      <Select
        className={styles.statusField}
        label="Essay status"
        options={STATUS_OPTIONS}
        value={value}
        disabled={busy}
        onChange={(e) => void change(e.target.value as EssayStatus)}
      />
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function EssayWorkspace({ essay, readOnly }: { essay: EssayWithBody; readOnly: boolean }) {
  const [mode, setMode] = useState<"write" | "review">(readOnly ? "review" : "write");
  const stats = essayStats(essay.body, essay.wordLimit, essay.charLimit);
  const budget =
    stats.limit === null
      ? null
      : stats.count <= stats.limit
        ? `${stats.limit - stats.count} ${stats.unit} left.`
        : `${stats.count - stats.limit} ${stats.unit} over the limit.`;
  return (
    <>
      <div className={styles.col}>
        {readOnly ? null : (
          <div className={styles.tabs}>
            <Button variant={mode === "write" ? "primary" : "line"} size="sm" onClick={() => setMode("write")}>
              Write
            </Button>
            <Button variant={mode === "review" ? "primary" : "line"} size="sm" onClick={() => setMode("review")}>
              Review notes
            </Button>
            <EssayStatusSelect essayId={essay.id} status={essay.status} />
          </div>
        )}
        {mode === "write" && !readOnly ? (
          <EssayEditor
            essayId={essay.id}
            initialBody={essay.body}
            baseVersion={essay.currentVersion}
            wordLimit={essay.wordLimit}
            charLimit={essay.charLimit}
          />
        ) : (
          <div className={styles.paper}>
            <div className={styles.paperHead}>
              <span>{`Draft ${essay.currentVersion} · saved`}</span>
              <span className={styles.count}>{stats.label}</span>
            </div>
            <ReviewView body={essay.body} comments={essay.comments} currentVersion={essay.currentVersion} />
          </div>
        )}
      </div>
      <CommentsPanel essayId={essay.id} comments={essay.comments} budget={budget} readOnly={readOnly} />
    </>
  );
}
