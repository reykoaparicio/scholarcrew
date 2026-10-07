import type { ModelClient } from "@scholarcrew/agents";
import type { CatalogDeps } from "@scholarcrew/catalog";
import { createFakeBatchGateway, createFakeFetchPage, createFakeResearcher } from "@scholarcrew/catalog/testing";
import { TEST_NOW, createTestDeps, fixedClock } from "@scholarcrew/core/shared";
import { type Db, desc, devOutbox, eq } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type SystemActor, type UserActor, systemActor, userActor } from "@scholarcrew/domain";
import { createDemoModelClient } from "../src/demo-model";
import { catalogUsageRecorder } from "../src/deps";
import { devOutboxSmsSender } from "../src/sms";
import type { WorkerDeps } from "../src/types";

export const SYSTEM: SystemActor = systemActor("test");

/** Worker deps over the test DB: memory jobs, fixed clock (TEST_NOW), dev outbox (email and SMS), demo model, inert catalog fakes. */
export function makeWorkerDeps(o: { model?: ModelClient; catalog?: Partial<CatalogDeps> } = {}) {
  const clock = fixedClock(TEST_NOW);
  const core = createTestDeps({ clock });
  const model = o.model ?? createDemoModelClient();
  const catalog: CatalogDeps = {
    db: core.db,
    model,
    fetchPage: createFakeFetchPage({}),
    anthropicBatches: createFakeBatchGateway(),
    researcher: createFakeResearcher([]),
    now: () => clock.now(),
    allowedDomains: [],
    onUsage: catalogUsageRecorder(core),
    ...o.catalog,
  };
  const deps: WorkerDeps = { core, model, catalog, sms: devOutboxSmsSender(core.db) };
  return { deps, core, clock };
}

export async function makeStudent(db: Db, o: Parameters<typeof factories.student>[1] = {}) {
  const { user, profile } = await factories.student(db, o);
  const actor: UserActor = userActor(user.id, "student");
  return { user, profile, actor };
}

export async function emailsTo(db: Db, to: string) {
  return db.select().from(devOutbox).where(eq(devOutbox.to, to.toLowerCase())).orderBy(desc(devOutbox.createdAt));
}

/** A model whose every call throws `error` (API failures, rate limits). */
export function failingModel(error: unknown): ModelClient {
  return {
    async turn() {
      throw error;
    },
    async extract() {
      throw error;
    },
  };
}
