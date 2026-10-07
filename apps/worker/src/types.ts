import type { ModelClient } from "@scholarcrew/agents";
import type { CatalogDeps } from "@scholarcrew/catalog";
import type { CoreDeps, SmsSender } from "@scholarcrew/core/shared";

/** Everything a job handler needs. The pg-boss instance stays in main/app. */
export interface WorkerDeps {
  core: CoreDeps;
  model: ModelClient;
  catalog: CatalogDeps;
  /** NO-05 (R2I-9): Twilio, or the dev outbox when no TWILIO_* is set (src/sms.ts, L4). */
  sms: SmsSender;
}

/** pg-boss attempt metadata (work option includeMetadata: true). */
export interface JobContext {
  retryCount: number;
  retryLimit: number;
}

/** No retries left: handlers finish the job instead of rethrowing. */
export const NO_RETRY: JobContext = { retryCount: 0, retryLimit: 0 };

export type Handler = (deps: WorkerDeps, data: unknown, ctx?: JobContext) => Promise<void>;
