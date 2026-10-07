import { getJob } from "@scholarcrew/core/crew";
import type { CoreDeps } from "@scholarcrew/core/shared";
import { type Actor, type CrewJob, TERMINAL_JOB_STATUSES } from "@scholarcrew/domain";

export interface JobEventTiming {
  pollMs: number;
  timeoutMs: number;
  /** Quiet time after which a `: ping` comment is written (R3E-2). */
  pingMs: number;
}

/** Section 10: poll crew.getJob every second for up to 130 seconds, with a `: ping` every 15 s of quiet. */
export const DEFAULT_JOB_EVENT_TIMING: JobEventTiming = { pollMs: 1000, timeoutMs: 130_000, pingMs: 15_000 };

let timing: JobEventTiming = DEFAULT_JOB_EVENT_TIMING;

/** Tests only: shorten the poll interval, timeout, or ping. Call with no argument to restore the defaults. */
export function setJobEventTimingForTests(t?: Partial<JobEventTiming>): void {
  timing = { ...DEFAULT_JOB_EVENT_TIMING, ...t };
}

/**
 * R3E-1: `no-transform` makes Next's bundled `compression` middleware skip the stream, and
 * `x-accel-buffering: no` tells nginx not to buffer it. No Content-Encoding is sent (`none` isn't a
 * real coding). Verify under `next start` and the deploy proxy at execution (see N10 intro).
 */
export const SSE_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

const encoder = new TextEncoder();

/** An SSE comment line. EventSource ignores it; idle proxies see bytes and keep the connection open. */
export const SSE_PING = encoder.encode(": ping\n\n");

export function sseFrame(event: "job" | "end", data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function isTerminal(job: CrewJob): boolean {
  return TERMINAL_JOB_STATUSES.includes(job.status);
}

function changed(before: CrewJob, after: CrewJob): boolean {
  return before.status !== after.status || before.progress.length !== after.progress.length;
}

/** Resolves after `ms`, or as soon as the signal aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * `event: job` with the current job first, then again whenever status or progress length changes;
 * `event: end` with `{}` on a terminal status or at the timeout. After a poll with no change, a
 * `: ping` comment goes out once `pingMs` passed since the last write. A client disconnect (request
 * signal or stream cancel) stops polling and closes the stream without an end frame.
 */
export function jobEventStream(
  deps: CoreDeps,
  actor: Actor,
  first: CrewJob,
  requestSignal: AbortSignal,
): ReadableStream<Uint8Array> {
  const { pollMs, timeoutMs, pingMs } = timing;
  const stop = new AbortController();
  const onAbort = () => stop.abort();
  if (requestSignal.aborted) stop.abort();
  else requestSignal.addEventListener("abort", onAbort, { once: true });

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let lastWriteAt = Date.now();
      const send = (chunk: Uint8Array) => {
        if (stop.signal.aborted) return;
        try {
          controller.enqueue(chunk);
          lastWriteAt = Date.now();
        } catch {
          stop.abort();
        }
      };
      const run = async () => {
        const deadline = Date.now() + timeoutMs;
        let last = first;
        send(sseFrame("job", first));
        try {
          while (!stop.signal.aborted && !isTerminal(last) && Date.now() < deadline) {
            await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())), stop.signal);
            if (stop.signal.aborted) break;
            const next = await getJob(deps, actor, first.id);
            if (changed(last, next)) send(sseFrame("job", next));
            else if (Date.now() - lastWriteAt >= pingMs) send(SSE_PING);
            last = next;
          }
        } catch (e) {
          console.error(
            JSON.stringify({ level: "error", msg: "job event stream failed", jobId: first.id, error: String(e) }),
          );
        }
        send(sseFrame("end", {}));
        requestSignal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          // The reader already canceled the stream.
        }
      };
      void run();
    },
    cancel() {
      stop.abort();
    },
  });
}
