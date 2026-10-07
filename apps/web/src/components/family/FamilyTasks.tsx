"use client";

import { api, errorMessage } from "@/lib/api";
import { dateShort } from "@/lib/format";
import type { FamilyTask } from "@scholarcrew/domain";
import { Badge, Button, Card, StatusPill, Who } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./family.module.css";

function pill(t: FamilyTask) {
  if (t.status === "done") return <StatusPill status="ready" label="Done" />;
  // R3V-11: StatusPill "on" carries a check icon, which reads as done. Skipped gets a neutral info badge.
  if (t.status === "skipped") {
    return (
      <Badge tone="neutral" icon="info">
        Skipped
      </Badge>
    );
  }
  return <StatusPill status="needs_input" label="Not started" />;
}

/**
 * R3V-14: 06 `listTasks` already falls back to `unnamedInviter` ("Your family member", "Your student") for a
 * nameless assignee. Those read as a whole phrase, so they aren't cut to a first word; a real name shows its first name.
 */
const UNNAMED_ASSIGNEES = new Set(["Your family member", "Your student"]);
function assigneeTag(name: string): string {
  const n = name.trim();
  if (n === "") return "Your family member";
  if (UNNAMED_ASSIGNEES.has(n)) return n;
  return n.split(/\s+/)[0] ?? n;
}

/** FA-05: FAFSA/CSS contributor steps, budget input, and shared reviews, each assigned to a person. */
export function FamilyTasks({ tasks: initial, myUserId }: { tasks: FamilyTask[]; myUserId: string }) {
  const [tasks, setTasks] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function done(t: FamilyTask) {
    setError(null);
    try {
      const saved = await api<FamilyTask>(`/family/tasks/${t.id}`, { method: "PATCH", body: { status: "done" } });
      setTasks((list) => list.map((x) => (x.id === t.id ? saved : x)));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card title="This week, together" aside={<Who role="aid" size="sm" />}>
      {tasks.length === 0 ? (
        <p className={styles.muted}>No shared tasks yet. Aid adds FAFSA and CSS steps here when they're due.</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <li key={t.id} className={styles.ftask}>
              <span className={styles.whoTag}>{assigneeTag(t.assigneeName)}</span>
              <div>
                <b>{t.title}</b>
                {t.detail ? <p className={styles.muted}>{t.detail}</p> : null}
                {t.dueOn ? <p className={styles.muted}>{`Due ${dateShort(t.dueOn)}`}</p> : null}
                {t.assigneeId === myUserId && t.status === "todo" ? (
                  <Button variant="line" size="sm" aria-label={`Mark done: ${t.title}`} onClick={() => void done(t)}>
                    Mark done
                  </Button>
                ) : null}
              </div>
              {pill(t)}
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
