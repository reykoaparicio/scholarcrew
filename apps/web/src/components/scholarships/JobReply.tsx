"use client";

import { ReplyCard } from "@/components/crew/ReplyCard";
import { api, errorMessage } from "@/lib/api";
import { useJobStream } from "@/lib/sse";
import { type CrewJob, type Message, TERMINAL_JOB_STATUSES } from "@scholarcrew/domain";
import { StatusPill } from "@scholarcrew/ui";
import { useEffect, useRef, useState } from "react";
import styles from "./shared.module.css";

/** Reads the finished job, then the reply message it points at. */
export async function loadJobReply(jobId: string): Promise<{ job: CrewJob; message: Message | null }> {
  const job = await api<CrewJob>(`/jobs/${jobId}`);
  if (!job.conversationId || !job.resultMessageId) return { job, message: null };
  const messages = await api<Message[]>(`/conversations/${job.conversationId}/messages`);
  return { job, message: messages.find((m) => m.id === job.resultMessageId) ?? null };
}

/** CR-06 for one background job: live progress, then the crew's reply (or the failure). */
export function JobReply({
  jobId,
  workingText,
  onDone,
  timeZone,
}: {
  jobId: string | null;
  workingText: string;
  onDone?: (job: CrewJob) => void;
  timeZone?: string;
}) {
  const { job, error } = useJobStream(jobId);
  const [result, setResult] = useState<{ job: CrewJob; message: Message | null } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const finished = job !== null && TERMINAL_JOB_STATUSES.includes(job.status);

  useEffect(() => {
    if (!jobId || !finished) return;
    let live = true;
    loadJobReply(jobId)
      .then((r) => {
        if (!live) return;
        setResult(r);
        onDoneRef.current?.(r.job);
      })
      .catch((e: unknown) => {
        if (live) setLoadError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [jobId, finished]);

  if (!jobId) return null;
  const problem = error ?? loadError;
  if (problem) {
    return (
      <p className={styles.error} role="alert">
        {problem}
      </p>
    );
  }
  if (result) {
    if (result.job.status === "failed") {
      return (
        <p className={styles.error} role="alert">
          {result.job.error ?? "Your crew couldn't finish this one. Try again in a minute."}
        </p>
      );
    }
    return result.message ? <ReplyCard message={result.message} timeZone={timeZone} compact /> : null;
  }
  return (
    <div className={styles.working} aria-live="polite">
      <StatusPill status={job?.status ?? "queued"} />
      <span>{job?.progress.at(-1)?.text ?? workingText}</span>
    </div>
  );
}
