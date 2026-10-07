"use client";

import { api, errorMessage, isLimit } from "@/lib/api";
import { useJobStream } from "@/lib/sse";
import { type CrewJob, type EssayComment, TERMINAL_JOB_STATUSES } from "@scholarcrew/domain";
import { Button, Card, Eyebrow, StatusPill, Who } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./essays.module.css";

const AUTHOR: Record<Exclude<EssayComment["author"], "quill">, string> = { helper: "Helper", user: "You" };

function shortQuote(q: string): string {
  return q.length > 40 ? `${q.slice(0, 37)}…` : q;
}

/** Quill's comments (numbered like the highlights), Ask Quill, and the integrity note (ES-09). */
export function CommentsPanel({
  essayId,
  comments,
  budget,
  readOnly,
}: {
  essayId: string;
  comments: EssayComment[];
  budget: string | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [resolved, setResolved] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const { job, error: streamError } = useJobStream(jobId);
  const done = job !== null && TERMINAL_JOB_STATUSES.includes(job.status);

  useEffect(() => {
    if (done && job?.status !== "failed") router.refresh();
  }, [done, job?.status, router]);

  async function askQuill() {
    setAsking(true);
    setError(null);
    setLimited(false);
    try {
      const started = await api<CrewJob>(`/essays/${essayId}/review`, { method: "POST" });
      setJobId(started.id);
    } catch (e) {
      setError(errorMessage(e));
      setLimited(isLimit(e));
    } finally {
      setAsking(false);
    }
  }

  async function resolve(id: string) {
    setError(null);
    try {
      await api(`/essay-comments/${id}/resolve`, { method: "POST" });
      setResolved((list) => [...list, id]);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // A dropped or timed-out stream (16's hook sets `error`) ends the wait so Ask Quill works again.
  const working = jobId !== null && !done && streamError === null;
  const failed =
    done && job?.status === "failed" ? (job.error ?? "Quill couldn't finish this review. Try again.") : null;
  const problem = failed ?? (jobId !== null && !done ? streamError : null) ?? error;
  return (
    <div className={styles.col}>
      {readOnly ? null : (
        <Button variant="primary" icon="pen" disabled={asking || working} onClick={() => void askQuill()}>
          Ask Quill
        </Button>
      )}
      {working ? (
        <div className={styles.conflict} aria-live="polite">
          <StatusPill status={job?.status ?? "queued"} />
          <span>{job?.progress.at(-1)?.text ?? "Quill is reading your draft…"}</span>
        </div>
      ) : null}
      {problem ? (
        <p className={styles.footnote} role="alert">
          {problem}
        </p>
      ) : null}
      {limited && problem === error ? (
        <Button variant="soft" size="sm" href="/settings">
          See plans
        </Button>
      ) : null}
      {comments.map((c, index) =>
        resolved.includes(c.id) ? null : (
          <article key={c.id} className={styles.comment} aria-label={`Comment ${index + 1}`}>
            <div className={styles.commentHead}>
              <span className={styles.num}>{index + 1}</span>
              {c.author === "quill" ? <Who role="quill" size="sm" /> : <b>{AUTHOR[c.author]}</b>}
              <span>{`on "${shortQuote(c.quote)}"`}</span>
            </div>
            <p>{c.body}</p>
            {readOnly ? null : (
              <Button variant="line" size="sm" onClick={() => void resolve(c.id)}>
                Resolve
              </Button>
            )}
          </article>
        ),
      )}
      {budget ? (
        <Card>
          <Eyebrow>Word budget</Eyebrow>
          <p>{budget}</p>
        </Card>
      ) : null}
      <p className={styles.footnote}>
        Quill asks questions and points at your sentences. It won't write paragraphs for you, because scholarships and
        colleges expect your own words.
      </p>
    </div>
  );
}
