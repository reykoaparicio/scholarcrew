"use client";

import { api, errorMessage } from "@/lib/api";
import { dateShort } from "@/lib/format";
import type { Superscore, TestScore } from "@scholarcrew/domain";
import { Badge, Button, Card, EmptyState, Table } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import shared from "../scholarships/shared.module.css";
import { AddScoreModal } from "./AddScoreModal";
import { sectionsText } from "./prep";
import styles from "./prep.module.css";

/** PR-01 scores table and PR-02 superscores (computed by the service from official sections). */
export function ScoresCard({
  scores,
  superscores,
  readOnly,
}: { scores: TestScore[]; superscores: Superscore[]; readOnly: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sorted = [...scores].sort((a, b) => a.takenOn.localeCompare(b.takenOn));

  async function remove(id: string) {
    setError(null);
    try {
      await api(`/test-scores/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className={styles.col}>
      <Card
        title="Your scores"
        aside={
          readOnly ? null : (
            <Button variant="line" size="sm" icon="plus" onClick={() => setAdding(true)}>
              Add a score
            </Button>
          )
        }
      >
        {sorted.length === 0 ? (
          <EmptyState title="No scores yet" icon="award">
            Add official and practice scores. Prep uses only official ones for superscores.
          </EmptyState>
        ) : (
          <Table
            caption="Test scores"
            rows={sorted}
            rowKey={(s) => s.id}
            columns={[
              { key: "test", header: "Test", render: (s) => `${s.test} · ${dateShort(s.takenOn)}` },
              {
                key: "type",
                header: "Type",
                render: (s) => <Badge tone="neutral">{s.official ? "Official" : "Practice"}</Badge>,
              },
              { key: "sections", header: "Sections", render: (s) => sectionsText(s.sections) },
              { key: "composite", header: "Composite", align: "right", render: (s) => s.composite },
              {
                key: "actions",
                header: "",
                render: (s) =>
                  readOnly ? null : (
                    <Button
                      variant="line"
                      size="sm"
                      aria-label={`Delete ${s.test} ${dateShort(s.takenOn)} score`}
                      onClick={() => void remove(s.id)}
                    >
                      Delete
                    </Button>
                  ),
              },
            ]}
          />
        )}
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
      </Card>
      {superscores.map((s) => (
        <Card key={s.test} title={`${s.test} superscore`}>
          <div className={styles.big}>{s.composite}</div>
          <p className={styles.note}>{sectionsText(s.sections)}</p>
          <p
            className={styles.note}
          >{`Best official section from ${s.fromDates.length} test dates. Practice tests don't count.`}</p>
        </Card>
      ))}
      {readOnly ? null : (
        <AddScoreModal key={adding ? "open" : "closed"} open={adding} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}
