import { type Db, eq, users } from "@scholarcrew/db";
import {
  type Actor,
  AppError,
  type IsoDate,
  type ShareCategory,
  type SystemActor,
  type UserActor,
  forbidden,
  unauthenticated,
} from "@scholarcrew/domain";
import { assertCanRead, assertOwner, assertSystem, assertUser, getShareGrants, isOwner } from "../access";
import { type CoreDeps, safeTimeZone } from "../shared";

/** Narrows the actor to a signed-in user (works whether assertUser asserts or returns). */
export function requireUser(actor: Actor): UserActor {
  assertUser(actor);
  if (actor.kind !== "user") throw forbidden();
  return actor;
}

/** Narrows the actor to the worker's system actor (works whether assertSystem asserts or returns). */
export function requireSystem(actor: Actor): SystemActor {
  assertSystem(actor);
  if (actor.kind !== "system") throw forbidden();
  return actor;
}

/** System actors read anything; everyone else goes through the share-aware access check. */
export async function assertReadable(
  deps: CoreDeps,
  actor: Actor,
  ownerId: string,
  category: ShareCategory,
): Promise<void> {
  if (actor.kind === "system") return;
  await assertCanRead(deps, actor, ownerId, category);
}

export function assertOwnerOrSystem(actor: Actor, ownerId: string): void {
  if (actor.kind === "system") return;
  assertOwner(actor, ownerId);
}

/** True for the owner and the worker; false for parents and helpers. */
export function readsAsOwner(actor: Actor, ownerId: string): boolean {
  return actor.kind === "system" || isOwner(actor, ownerId);
}

/** Private matching reasons belong to the student alone. System matcher reads remain internal. */
export async function seesSensitiveReasons(_deps: CoreDeps, actor: Actor, ownerId: string): Promise<boolean> {
  return readsAsOwner(actor, ownerId);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthOf(date: IsoDate): string {
  return date.slice(0, 7);
}

export function firstRow<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new AppError("internal", `No ${what} row returned`);
  return row;
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** Minutes to hours, one decimal place. */
export function hoursFromMinutes(minutes: number): number {
  return Math.round(minutes / 6) / 10;
}

export async function userTimeZone(db: Db, userId: string): Promise<string> {
  const [row] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, userId));
  return safeTimeZone(row?.timeZone ?? "America/Chicago");
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "A student";
}
