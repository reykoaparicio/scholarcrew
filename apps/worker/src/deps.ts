import { type ModelClient, createModelClient } from "@scholarcrew/agents";
import {
  type CatalogDeps,
  createAnthropicBatchGateway,
  createAnthropicResearcher,
  createFetchPage,
} from "@scholarcrew/catalog";
import { createFakeBatchGateway, createFakeFetchPage, createFakeResearcher } from "@scholarcrew/catalog/testing";
import { recordAgentRun } from "@scholarcrew/core/crew";
import { parseKeyring } from "@scholarcrew/core/crypto";
import { type CoreDeps, devOutboxEmailSender, resendEmailSender, systemClock } from "@scholarcrew/core/shared";
import { createDb } from "@scholarcrew/db";
import { systemActor } from "@scholarcrew/domain";
import { createJobsClient, createPgBoss } from "@scholarcrew/jobs";
import type PgBoss from "pg-boss";
import { createDemoModelClient } from "./demo-model";
import { devOutboxSmsSender, twilioSmsSender } from "./sms";
import type { WorkerDeps } from "./types";

export type WorkerEnv = Record<string, string | undefined>;

export interface BuiltWorker extends WorkerDeps {
  /** The worker's own pg-boss (role "worker": runs maintenance and cron). Started by startWorker. */
  boss: PgBoss;
  fakeModel: boolean;
  close(): Promise<void>;
}

const DEFAULT_FROM = "ScholarCrew <crew@scholarcrew.example>";

function required(env: WorkerEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

function encryptionKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  return Buffer.from(hex, "hex");
}

export function allowedDomains(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}

const CATALOG_ACTOR = systemActor("worker:catalog");

export const TWILIO_PARTIAL_ERROR =
  "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM must all be set or all be empty";

/**
 * NO-05 (R2I-9, 00 §4): all three TWILIO_* set → Twilio; all three empty → null (the dev outbox); anything
 * else throws, so a half-configured worker never starts and silently drops texts.
 */
export function twilioConfig(env: WorkerEnv): { accountSid: string; authToken: string; from: string } | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  const authToken = env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  const from = env.TWILIO_FROM?.trim() ?? "";
  const set = [accountSid, authToken, from].filter((v) => v.length > 0).length;
  if (set === 0) return null;
  if (set < 3) throw new Error(TWILIO_PARTIAL_ERROR);
  return { accountSid, authToken, from };
}

/** D20, AG-06: one agent_runs row per catalog model call (no job, no user). Plan 11's reportUsage catches failures. */
export function catalogUsageRecorder(core: CoreDeps): NonNullable<CatalogDeps["onUsage"]> {
  return (role, t) =>
    recordAgentRun(core, CATALOG_ACTOR, {
      jobId: null,
      userId: null,
      role,
      model: t.model,
      inputTokens: t.usage.inputTokens,
      outputTokens: t.usage.outputTokens,
      cacheReadTokens: t.usage.cacheReadTokens,
      cacheWriteTokens: t.usage.cacheWriteTokens,
      stopReason: t.stopReason,
      costMicros: Math.max(0, Math.round(t.usage.costMicros)),
      durationMs: Math.max(0, Math.round(t.durationMs)),
    });
}

/** The only place the worker reads configuration. Nothing here connects; pg-boss starts in startWorker. */
export function buildWorkerDeps(env: WorkerEnv = process.env): BuiltWorker {
  const databaseUrl = required(env, "DATABASE_URL");
  const keyring = parseKeyring(env);
  const fakeModel = env.SCHOLARCREW_FAKE_MODEL?.trim() === "1";
  const apiKey = env.ANTHROPIC_API_KEY?.trim() || undefined;
  if (!fakeModel && !apiKey) throw new Error("ANTHROPIC_API_KEY is not set (or set SCHOLARCREW_FAKE_MODEL=1)");
  // Checked before the pool exists, so a bad TWILIO_* set throws without leaving connections open.
  const twilio = twilioConfig(env);

  const database = createDb(databaseUrl, { max: 10 });
  const db = database.db;
  const boss = createPgBoss(databaseUrl);
  const resendKey = env.RESEND_API_KEY?.trim();
  const core: CoreDeps = {
    db,
    jobs: createJobsClient(boss),
    clock: systemClock(),
    email: resendKey ? resendEmailSender(resendKey, env.EMAIL_FROM?.trim() || DEFAULT_FROM) : devOutboxEmailSender(db),
    config: {
      appUrl: env.APP_URL?.trim() || "http://localhost:3000",
      keyring,
      sessionDays: 30,
      stripePriceFamily: env.STRIPE_PRICE_FAMILY ?? "",
      stripePriceSeason: env.STRIPE_PRICE_SEASON ?? "",
      stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
    },
    stripe: null,
  };

  const model: ModelClient = fakeModel ? createDemoModelClient() : createModelClient({ apiKey });
  const domains = allowedDomains(env.CATALOG_ALLOWED_DOMAINS);
  const now = () => core.clock.now();
  const onUsage = catalogUsageRecorder(core);
  const catalog: CatalogDeps = fakeModel
    ? {
        db,
        model,
        fetchPage: createFakeFetchPage({}),
        anthropicBatches: createFakeBatchGateway(),
        researcher: createFakeResearcher([]),
        now,
        allowedDomains: domains,
        onUsage,
      }
    : {
        db,
        model,
        fetchPage: createFetchPage(),
        anthropicBatches: createAnthropicBatchGateway(apiKey),
        researcher: createAnthropicResearcher(apiKey, onUsage),
        now,
        allowedDomains: domains,
        onUsage,
      };

  return {
    core,
    model,
    catalog,
    sms: twilio ? twilioSmsSender(twilio) : devOutboxSmsSender(db),
    boss,
    fakeModel,
    async close() {
      await database.close();
    },
  };
}
