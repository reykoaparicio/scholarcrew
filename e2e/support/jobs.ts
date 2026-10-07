import type { JobName, JobPayload } from "@scholarcrew/domain";
import { createJobsClient, createPgBoss, ensureQueues } from "@scholarcrew/jobs";
import { e2eDatabaseUrl } from "./env";

export async function sendJob<N extends JobName>(name: N, payload: JobPayload<N>): Promise<void> {
  const boss = createPgBoss(e2eDatabaseUrl(), { role: "sender" });
  await boss.start();
  try {
    await ensureQueues(boss);
    await createJobsClient(boss).enqueue(name, payload);
  } finally {
    await boss.stop();
  }
}
