import { JOB_NAMES } from "@scholarcrew/domain";
import type PgBoss from "pg-boss";
import { QUEUE_POLICIES } from "./validate";

/**
 * Creates a queue for every job name with its QUEUE_POLICIES policy ("standard" otherwise).
 * pg-boss 10 skips queues that already exist and doesn't change their policy.
 */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of JOB_NAMES) {
    await boss.createQueue(name, { name, policy: QUEUE_POLICIES[name] ?? "standard" });
  }
}
