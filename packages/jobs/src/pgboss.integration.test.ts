import { randomUUID } from "node:crypto";
import { createDb, sql } from "@scholarcrew/db";
import { testDatabaseUrl } from "@scholarcrew/db/testing";
import { JOB_NAMES } from "@scholarcrew/domain";
import type PgBoss from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJobsClient } from "./client";
import { createPgBoss } from "./pgboss";
import { ensureQueues } from "./queues";

// Own pg-boss schema so this file never shares queues with other packages' tests.
const SCHEMA = `pgboss_jobs_test_${randomUUID().replaceAll("-", "")}`;
const USED_QUEUES = ["catalog.extract", "notify.email"] as const;

let worker: PgBoss;
let sender: PgBoss;

async function dropUsedQueues(boss: PgBoss): Promise<void> {
  for (const name of USED_QUEUES) {
    if (await boss.getQueue(name)) {
      await boss.purgeQueue(name);
    }
  }
}

beforeAll(async () => {
  const url = testDatabaseUrl();
  worker = createPgBoss(url, { role: "worker", schema: SCHEMA });
  sender = createPgBoss(url, { role: "sender", schema: SCHEMA });
  await worker.start();
  await dropUsedQueues(worker);
  await ensureQueues(worker);
  await sender.start();
});

afterAll(async () => {
  await dropUsedQueues(worker);
  await sender.stop({ graceful: false });
  await worker.stop({ graceful: false });
  const database = createDb(testDatabaseUrl());
  try {
    await database.db.execute(sql.raw(`DROP SCHEMA "${SCHEMA}" CASCADE`));
  } finally {
    await database.close();
  }
});

describe("pg-boss integration", () => {
  it("creates every job queue with its policy and is safe to run again", async () => {
    await ensureQueues(worker);
    for (const name of JOB_NAMES) {
      expect((await worker.getQueue(name))?.name).toBe(name);
    }
    expect(JOB_NAMES).toHaveLength(20);
    expect((await worker.getQueue("catalog.extract"))?.policy).toBe("short");
    expect((await worker.getQueue("sweep.student"))?.policy).toBe("standard");
    expect((await worker.getQueue("plan.weekly.fanout"))?.policy).toBe("standard");
    expect((await worker.getQueue("notify.sms"))?.policy).toBe("standard");
  });

  it("delivers a validated job to a worker and dedupes catalog.extract by singletonKey", async () => {
    const jobs = createJobsClient(sender);
    const taskId = randomUUID();
    const otherId = randomUUID();
    const singletonKey = `catalog.extract:${taskId}`;

    const id = await jobs.enqueue("catalog.extract", { taskId }, { singletonKey });
    expect(id).toEqual(expect.any(String));
    expect(await jobs.enqueue("catalog.extract", { taskId }, { singletonKey })).toBeNull();
    const otherKey = `catalog.extract:${otherId}`;
    const other = await jobs.enqueue("catalog.extract", { taskId: otherId }, { singletonKey: otherKey });
    expect(other).toEqual(expect.any(String));

    const fetched = await worker.fetch<{ taskId: string }>("catalog.extract", { batchSize: 10 });
    expect(fetched.map((j) => j.id).sort()).toEqual([id, other].sort());
    expect(fetched.find((j) => j.id === id)?.data).toEqual({ taskId });
    expect(fetched.find((j) => j.id === other)?.data).toEqual({ taskId: otherId });
    expect(await worker.fetch("catalog.extract")).toEqual([]);
  });

  it("holds a job back until startAfterSeconds has passed", async () => {
    const jobs = createJobsClient(sender);
    const id = await jobs.enqueue("notify.email", { notificationId: randomUUID() }, { startAfterSeconds: 3600 });
    expect(id).toEqual(expect.any(String));
    expect(await worker.fetch("notify.email")).toEqual([]);
  });
});
