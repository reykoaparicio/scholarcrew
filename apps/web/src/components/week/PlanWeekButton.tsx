"use client";

import { api, errorMessage, isLimit } from "@/lib/api";
import { useJobStream } from "@/lib/sse";
import { type CrewJob, TERMINAL_JOB_STATUSES } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./week.module.css";

/**
 * WK-02: "Plan my week" posts /plan/regenerate (402 when the allowance is used), follows the returned
 * `weekly_plan` job with useJobStream, and refreshes the page once the job is terminal. Students only; the
 * page never renders it for parents.
 */
export function PlanWeekButton() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const { job, error: streamError } = useJobStream(jobId);

  useEffect(() => {
    if (!job || !TERMINAL_JOB_STATUSES.includes(job.status)) return;
    if (job.status === "failed") setError("Your crew couldn't plan this week. Try again in a minute.");
    setJobId(null);
    router.refresh();
  }, [job, router]);

  async function start() {
    setStarting(true);
    setError(null);
    setLimited(false);
    try {
      const started = await api<CrewJob>("/plan/regenerate", { method: "POST" });
      setJobId(started.id);
    } catch (e) {
      setError(errorMessage(e));
      setLimited(isLimit(e));
    } finally {
      setStarting(false);
    }
  }

  const busy = starting || (jobId !== null && streamError === null);
  const message = error ?? streamError;
  return (
    <div>
      <Button variant="soft" size="sm" icon="spark" disabled={busy} onClick={() => void start()}>
        {busy ? "Planning…" : "Plan my week"}
      </Button>
      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
      {limited ? (
        <Button variant="soft" size="sm" href="/settings">
          See plans
        </Button>
      ) : null}
    </div>
  );
}
