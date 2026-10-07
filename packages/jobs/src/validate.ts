import { AppError, type JobName, JobPayloadSchemas } from "@scholarcrew/domain";
import type { z } from "zod";

/**
 * Queues that dedupe by singletonKey. pg-boss 10 only dedupes through the queue policy:
 * "short" keeps one queued job per key. Every other queue is "standard".
 */
export const QUEUE_POLICIES: Partial<Record<JobName, "short">> = { "catalog.extract": "short" };

/** Validates a payload against its domain schema. Throws AppError("invalid_input"). */
export function parseJobPayload(name: JobName, payload: unknown): Record<string, unknown> {
  if (typeof name !== "string" || !Object.hasOwn(JobPayloadSchemas, name)) {
    throw new AppError("invalid_input", `Unknown job name: ${String(name)}`);
  }
  const schema: z.ZodType = JobPayloadSchemas[name];
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError("invalid_input", `Invalid payload for job ${name}`, parsed.error.issues);
  }
  return parsed.data as Record<string, unknown>;
}

/** A "short" queue treats a missing key as '', so unkeyed sends would collide. Throws AppError("invalid_input"). */
export function assertSingletonKey(name: JobName, singletonKey: string | undefined): void {
  if (QUEUE_POLICIES[name] === "short" && !singletonKey) {
    throw new AppError("invalid_input", `Job ${name} needs a singletonKey`);
  }
}
