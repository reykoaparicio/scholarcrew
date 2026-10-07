import { type JobName, type JobPayload, QUEUE_EXPIRE_SECONDS } from "@scholarcrew/domain";
import type PgBoss from "pg-boss";
import { assertSingletonKey, parseJobPayload } from "./validate";

export type EnqueueOptions = { singletonKey?: string; startAfterSeconds?: number };

export interface JobsClient {
  enqueue<N extends JobName>(name: N, payload: JobPayload<N>, opts?: EnqueueOptions): Promise<string | null>;
}

const SEND_DEFAULTS = { retryLimit: 2, retryDelay: 30 } as const;

export function createJobsClient(boss: PgBoss): JobsClient {
  return {
    async enqueue<N extends JobName>(name: N, payload: JobPayload<N>, opts?: EnqueueOptions): Promise<string | null> {
      const data = parseJobPayload(name, payload);
      assertSingletonKey(name, opts?.singletonKey);
      const options: PgBoss.SendOptions = { ...SEND_DEFAULTS, expireInSeconds: QUEUE_EXPIRE_SECONDS[name] };
      if (opts?.singletonKey !== undefined) options.singletonKey = opts.singletonKey;
      if (opts?.startAfterSeconds !== undefined) options.startAfter = opts.startAfterSeconds;
      return boss.send(name, data, options);
    },
  };
}
