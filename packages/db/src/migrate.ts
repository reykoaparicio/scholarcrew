import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** packages/db/drizzle, resolved from this file so it works from any package's cwd. */
export const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

/** Any constant works; every process that migrates uses the same one. */
const MIGRATION_LOCK_KEY = 7_340_211;

/** Applies packages/db/drizzle to `url`. An advisory lock keeps parallel test runs from migrating at once. */
export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await client`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    await client`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
  } finally {
    await client.end({ timeout: 5 });
  }
}
