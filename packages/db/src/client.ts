import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

/** One postgres-js pool and a typed drizzle client over every table. Call close() on shutdown. */
export function createDb(url: string, opts: { max?: number } = {}): { db: Db; close(): Promise<void> } {
  const client = postgres(url, { max: opts.max ?? 10, onnotice: () => undefined });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}
