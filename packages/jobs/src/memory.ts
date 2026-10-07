import type { JobName, JobPayload } from "@scholarcrew/domain";
import type { EnqueueOptions, JobsClient } from "./client";
import { assertSingletonKey, parseJobPayload } from "./validate";

export type SentJob = { name: JobName; payload: unknown; opts: EnqueueOptions | undefined };
export type MemoryJobsClient = JobsClient & { sent: SentJob[]; clear(): void };

/** Same validation as the pg-boss client; records jobs instead of sending them. */
export function createMemoryJobsClient(): MemoryJobsClient {
  const sent: SentJob[] = [];
  let counter = 0;
  return {
    sent,
    async enqueue<N extends JobName>(name: N, payload: JobPayload<N>, opts?: EnqueueOptions): Promise<string | null> {
      const data = parseJobPayload(name, payload);
      assertSingletonKey(name, opts?.singletonKey);
      sent.push({ name, payload: data, opts });
      counter += 1;
      return `mem-${counter}`;
    },
    clear() {
      sent.length = 0;
      counter = 0;
    },
  };
}
