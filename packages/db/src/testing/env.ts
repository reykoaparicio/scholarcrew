import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_TEST_DATABASE_URL = "postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew_test";

/** packages/db/src/testing → repo root. */
const ROOT_ENV_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.env");

/** Minimal .env parser: KEY=VALUE lines, # comments, optional matching quotes. No dotenv dependency. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quote = value.charAt(0);
    if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function resolveTestDatabaseUrl(env: Record<string, string | undefined>, envFileText: string | null): string {
  const fromEnv = env.TEST_DATABASE_URL;
  if (fromEnv) return fromEnv;
  if (envFileText !== null) {
    const fromFile = parseEnvFile(envFileText).TEST_DATABASE_URL;
    if (fromFile) return fromFile;
  }
  return DEFAULT_TEST_DATABASE_URL;
}

/** TEST_DATABASE_URL from the process, else from the repo-root .env, else the local docker default. */
export function testDatabaseUrl(): string {
  const fromEnv = process.env.TEST_DATABASE_URL;
  if (fromEnv) return fromEnv;
  const fileText = existsSync(ROOT_ENV_FILE) ? readFileSync(ROOT_ENV_FILE, "utf8") : null;
  return resolveTestDatabaseUrl({}, fileText);
}
