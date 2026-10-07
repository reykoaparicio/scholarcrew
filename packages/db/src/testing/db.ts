import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { type Db, createDb } from "../client";
import * as schema from "../schema";
import { testDatabaseUrl } from "./env";

/** Every schema table, sorted. Never drizzle.__drizzle_migrations, never the pgboss schema. */
export const TABLE_NAMES: string[] = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableName(table))
  .sort();

let instance: { db: Db; close(): Promise<void> } | null = null;

/** One shared client per test process over TEST_DATABASE_URL. */
export function getTestDb(): Db {
  if (!instance) instance = createDb(testDatabaseUrl(), { max: 4 });
  return instance.db;
}

export async function closeTestDb(): Promise<void> {
  const current = instance;
  instance = null;
  if (current) await current.close();
}

/** Empties every schema table. Call it in beforeEach. */
export async function resetDb(db: Db): Promise<void> {
  const list = TABLE_NAMES.map((name) => `"${name}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`));
}
