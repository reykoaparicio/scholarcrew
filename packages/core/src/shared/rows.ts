import type { users } from "@scholarcrew/db";
import { type AnyColumn, type SQL, sql } from "@scholarcrew/db";
import { AppError, type User, notFound } from "@scholarcrew/domain";
import { toIso } from "./dates";

export function isUniqueConstraint(error: unknown, constraint: string): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  if (e.code === "23505" && (e.constraint_name === constraint || e.constraint === constraint)) return true;
  return e.cause !== error && e.cause !== undefined ? isUniqueConstraint(e.cause, constraint) : false;
}

export function ownedWhere(table: { id: AnyColumn; ownerId: AnyColumn }, id: string, ownerId: string): SQL {
  return sql`${table.id} = ${id} and ${table.ownerId} = ${ownerId}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** First row of an insert/update `returning()`, or an internal error. */
export function one<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new AppError("internal", `${what} returned no row`);
  return row;
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Non-UUID path ids would make Postgres throw; they can't match anything, so they're not_found. */
export function requireUuid(id: string, message = "Not found"): void {
  if (!isUuid(id)) throw notFound(message);
}

export function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    birthYear: row.birthYear,
    timeZone: row.timeZone,
    status: row.status,
    createdAt: toIso(row.createdAt),
  };
}
