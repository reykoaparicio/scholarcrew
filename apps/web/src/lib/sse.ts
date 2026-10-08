import { CrewJob, TERMINAL_JOB_STATUSES } from "@scholarcrew/domain";
import { useEffect, useState } from "react";
import { ApiError, api } from "./api";

/** Poll cadence once the live stream ends early (the route's 130 s cap) or drops. */
export const JOB_POLL_MS = 3000;
/** Stop following after this long; crew jobs expire at 900 s. */
export const JOB_FOLLOW_MAX_MS = 15 * 60 * 1000;
const MAX_POLL_FAILURES = 3;

export const STREAM_LOST = "Lost the live connection. Refresh to check on your crew.";
export const STILL_WORKING = "Still working. Refresh to check on your crew.";

type StreamState = { id: string | null; job: CrewJob | null; error: string | null };

function parseJob(data: unknown): CrewJob | null {
  const parsed = CrewJob.safeParse(data);
  return parsed.success ? parsed.data : null;
}

function parseEvent(data: string): CrewJob | null {
  try {
    return parseJob(JSON.parse(data));
  } catch {
    return null;
  }
}

function isTerminal(job: CrewJob | null): boolean {
  return job !== null && TERMINAL_JOB_STATUSES.includes(job.status);
}

/** Network errors, rate limits, and 5xx are worth another poll; other 4xx answers are final. */
function retryable(e: unknown): boolean {
  return !(e instanceof ApiError) || e.status === 0 || e.status === 429 || e.status >= 500;
}

/**
 * CR-06: follows GET /api/v1/jobs/:id/events. "job" events carry the CrewJob, and a terminal job closes the
 * stream. When the server ends the stream before a terminal status, or the connection errors, the stream is
 * closed and GET /api/v1/jobs/:id is polled until the job is terminal (E-16-1). `error` is set only when
 * polling can't continue or `maxMs` passes.
 */
export function useJobStream(
  jobId: string | null,
  opts?: { pollMs?: number; maxMs?: number },
): { job: CrewJob | null; error: string | null } {
  const [state, setState] = useState<StreamState>({ id: null, job: null, error: null });
  const pollMs = opts?.pollMs ?? JOB_POLL_MS;
  const maxMs = opts?.maxMs ?? JOB_FOLLOW_MAX_MS;

  useEffect(() => {
    if (!jobId) return;
    const id = jobId;
    const startedAt = Date.now();
    let stopped = false;
    let polling = false;
    let failures = 0;
    let last: CrewJob | null = null;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setState({ id, job: null, error: null });

    const stop = () => {
      stopped = true;
      source?.close();
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const show = (job: CrewJob) => {
      last = job;
      setState((s) => ({ ...s, id, job }));
      if (isTerminal(job)) stop();
    };
    const fail = (message: string) => {
      stop();
      setState((s) => ({ ...s, id, error: message }));
    };
    const poll = async () => {
      timer = null;
      if (stopped) return;
      if (Date.now() - startedAt >= maxMs) {
        fail(STILL_WORKING);
        return;
      }
      try {
        const job = parseJob(await api<unknown>(`/jobs/${encodeURIComponent(id)}`));
        if (stopped) return;
        if (!job) {
          fail(STREAM_LOST);
          return;
        }
        failures = 0;
        show(job);
      } catch (e) {
        if (stopped) return;
        failures += 1;
        if (!retryable(e) || failures >= MAX_POLL_FAILURES) {
          fail(STREAM_LOST);
          return;
        }
      }
      if (!stopped) timer = setTimeout(() => void poll(), pollMs);
    };
    const startPolling = () => {
      if (polling || stopped) return;
      polling = true;
      source?.close();
      timer = setTimeout(() => void poll(), 0);
    };

    if (typeof EventSource === "undefined") {
      startPolling();
      return stop;
    }
    source = new EventSource(`/api/v1/jobs/${encodeURIComponent(id)}/events`, { withCredentials: true });
    source.addEventListener("job", (event: Event) => {
      const next = parseEvent(String((event as MessageEvent<string>).data));
      if (next && !stopped) show(next);
    });
    source.addEventListener("end", () => {
      if (isTerminal(last)) stop();
      else startPolling();
    });
    source.addEventListener("error", () => {
      if (stopped) return;
      // EventSource hides the HTTP status, including transient 5xx. GET distinguishes retryable failures.
      startPolling();
    });
    return stop;
  }, [jobId, pollMs, maxMs]);

  if (!jobId || state.id !== jobId) return { job: null, error: null };
  return { job: state.job, error: state.error };
}
