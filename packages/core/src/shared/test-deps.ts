import { parseKeyring } from "../crypto";

import { getTestDb } from "@scholarcrew/db/testing";
import { createMemoryJobsClient } from "@scholarcrew/jobs";
import { fixedClock } from "./clock";
import { devOutboxEmailSender } from "./email";
import { createFakeStripeGateway } from "./stripe-fake";
import type { CoreDeps } from "./types";

export const TEST_NOW = "2026-10-06T15:00:00.000Z";

type MemoryJobs = ReturnType<typeof createMemoryJobsClient>;

/** Deps for service tests: test DB, memory jobs, fixed clock, dev outbox email, fake Stripe. */
export function createTestDeps(o: Partial<CoreDeps> = {}): CoreDeps & { jobs: MemoryJobs } {
  const db = o.db ?? getTestDb();
  const base: CoreDeps & { jobs: MemoryJobs } = {
    db,
    jobs: createMemoryJobsClient(),
    clock: fixedClock(TEST_NOW),
    email: devOutboxEmailSender(db),
    config: {
      appUrl: "http://localhost:3000",
      keyring: parseKeyring({ ENCRYPTION_KEY: "07".repeat(32) }),
      sessionDays: 30,
      stripePriceFamily: "price_family_test",
      stripePriceSeason: "price_season_test",
      stripeWebhookSecret: "whsec_test",
    },
    stripe: createFakeStripeGateway(),
  };
  // Callers that override `jobs` take responsibility for its shape.
  return { ...base, ...o } as CoreDeps & { jobs: MemoryJobs };
}
