import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const E2E_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = resolve(E2E_ROOT, "..");

/** Fills unset keys from the repo-root .env (the rule next.config.ts uses). Values already in the environment win. */
function loadRootEnv(): void {
  const file = resolve(REPO_ROOT, ".env");
  if (!existsSync(file)) return;
  const parsed = parseEnv(readFileSync(file, "utf8")) as Record<string, string | undefined>;
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

loadRootEnv();

export const E2E_PORT = Number(process.env.E2E_PORT ?? "3100");
export const BASE_URL = `http://localhost:${E2E_PORT}`;

const DEFAULT_DATABASE_URL = "postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew";
/** The throwaway key CI uses. Only used when ENCRYPTION_KEY isn't set. */
const E2E_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/** A database the e2e user can connect to in order to CREATE DATABASE. */
export function adminDatabaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

/**
 * The stack drops pgboss and empties every table in this database, so it must be a dedicated one:
 * the name ends in _e2e and isn't the dev (DATABASE_URL) or test (TEST_DATABASE_URL) database.
 */
export function assertE2eDatabase(url: string): string {
  const name = databaseName(url);
  const others = [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL]
    .filter((u): u is string => Boolean(u))
    .map(databaseName);
  if (!name.endsWith("_e2e") || others.includes(name)) {
    throw new Error(
      `Refusing to reset ${name}: the e2e database name must end in _e2e and differ from DATABASE_URL and TEST_DATABASE_URL`,
    );
  }
  return url;
}

/** E2E_DATABASE_URL, or DATABASE_URL pointed at the scholarcrew_e2e database. Throws for anything assertE2eDatabase refuses. */
export function e2eDatabaseUrl(): string {
  const explicit = process.env.E2E_DATABASE_URL;
  if (explicit) return assertE2eDatabase(explicit);
  const url = new URL(adminDatabaseUrl());
  url.pathname = "/scholarcrew_e2e";
  return assertE2eDatabase(url.toString());
}

/** Environment for the web app and worker: demo model, dev routes, dev outbox, no paid services. */
export function childEnv(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "development",
    DATABASE_URL: databaseUrl,
    APP_URL: BASE_URL,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || E2E_ENCRYPTION_KEY,
    SCHOLARCREW_FAKE_MODEL: "1",
    ENABLE_DEV_ROUTES: "1",
    ANTHROPIC_API_KEY: "",
    RESEND_API_KEY: "",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    TWILIO_ACCOUNT_SID: "",
    TWILIO_AUTH_TOKEN: "",
    TWILIO_FROM: "",
    CATALOG_ALLOWED_DOMAINS: "",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}
