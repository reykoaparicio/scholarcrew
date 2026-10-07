import { createStripeGateway } from "@scholarcrew/core/billing";
import { assertProductionKeyring, parseKeyring } from "@scholarcrew/core/crypto";
import { type CoreDeps, devOutboxEmailSender, resendEmailSender, systemClock } from "@scholarcrew/core/shared";
import { createDb } from "@scholarcrew/db";
import {
  type JobName,
  type JobPayload,
  type JobsClient,
  createJobsClient,
  createPgBoss,
  ensureQueues,
} from "@scholarcrew/jobs";

type Env = Record<string, string | undefined>;

export const SESSION_DAYS = 30;
const DEFAULT_EMAIL_FROM = "ScholarCrew <crew@scholarcrew.example>";

function read(env: Env, key: string): string {
  return env[key]?.trim() ?? "";
}

function required(env: Env, key: string): string {
  const value = read(env, key);
  if (!value) throw new Error(`Missing environment variable ${key}`);
  return value;
}

function appUrlFrom(env: Env): string {
  const raw = required(env, "APP_URL");
  try {
    new URL(raw);
  } catch {
    throw new Error("APP_URL must be an absolute URL");
  }
  return raw.replace(/\/+$/, "");
}

/** Starts the real client on the first enqueue; a failed start is retried on the next one. */
export function createLazyJobsClient(start: () => Promise<JobsClient>): JobsClient {
  let ready: Promise<JobsClient> | null = null;
  const client = (): Promise<JobsClient> => {
    if (!ready) {
      ready = start().catch((e: unknown) => {
        ready = null;
        throw e;
      });
    }
    return ready;
  };
  return {
    async enqueue<N extends JobName>(
      name: N,
      payload: JobPayload<N>,
      opts?: { singletonKey?: string; startAfterSeconds?: number },
    ): Promise<string | null> {
      return (await client()).enqueue(name, payload, opts);
    },
  };
}

/** The web process only sends: role "sender" turns off pg-boss maintenance and cron. */
async function startSender(databaseUrl: string): Promise<JobsClient> {
  const boss = createPgBoss(databaseUrl, { role: "sender" });
  await boss.start();
  await ensureQueues(boss);
  return createJobsClient(boss);
}

/** Validates every setting before opening the database pool. */
export function buildDeps(env: Env): { deps: CoreDeps; close(): Promise<void> } {
  const databaseUrl = required(env, "DATABASE_URL");
  const appUrl = appUrlFrom(env);
  const keyring = parseKeyring(env);
  if (env.NODE_ENV === "production") {
    assertProductionKeyring(keyring);
    if (!read(env, "RESEND_API_KEY")) throw new Error("RESEND_API_KEY is required in production");
    if (!read(env, "EMAIL_FROM")) throw new Error("EMAIL_FROM is required in production");
  }
  const resendKey = read(env, "RESEND_API_KEY");
  const stripeKey = read(env, "STRIPE_SECRET_KEY");
  const { db, close } = createDb(databaseUrl, { max: 10 });
  const deps: CoreDeps = {
    db,
    jobs: createLazyJobsClient(() => startSender(databaseUrl)),
    clock: systemClock(),
    email: resendKey
      ? resendEmailSender(resendKey, read(env, "EMAIL_FROM") || DEFAULT_EMAIL_FROM)
      : devOutboxEmailSender(db),
    config: {
      appUrl,
      keyring,
      sessionDays: SESSION_DAYS,
      stripePriceFamily: read(env, "STRIPE_PRICE_FAMILY"),
      stripePriceSeason: read(env, "STRIPE_PRICE_SEASON"),
      stripeWebhookSecret: read(env, "STRIPE_WEBHOOK_SECRET"),
    },
    stripe: stripeKey ? createStripeGateway(stripeKey) : null,
  };
  return { deps, close };
}

// Next dev re-evaluates modules on every edit; keep one pool per process on globalThis.
const cache = globalThis as typeof globalThis & { __scholarcrewDeps?: CoreDeps };
let override: CoreDeps | null = null;

export function getDeps(): CoreDeps {
  if (override) return override;
  if (process.env.VITEST) {
    throw new Error("getDeps() has no test deps. Call useTestDeps() from @test/helpers.");
  }
  if (!cache.__scholarcrewDeps) cache.__scholarcrewDeps = buildDeps(process.env).deps;
  return cache.__scholarcrewDeps;
}

export function setDepsForTests(deps: CoreDeps): void {
  override = deps;
}

export function resetDepsForTests(): void {
  override = null;
}

/** GET /api/v1/dev/* exists only with ENABLE_DEV_ROUTES=1 and never in production. */
export function devRoutesEnabled(): boolean {
  return process.env.ENABLE_DEV_ROUTES === "1" && process.env.NODE_ENV !== "production";
}

/** parseStripeWebhook needs the secret key; CoreConfig doesn't carry it. */
export function stripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY?.trim() ?? "";
}
