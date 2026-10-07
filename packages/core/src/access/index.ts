import { and, eq, familyMembers, inArray, shareSettings } from "@scholarcrew/db";
import {
  type Actor,
  DEFAULT_SHARED,
  type Role,
  SHARE_CATEGORIES,
  type ShareCategory,
  type SystemActor,
  type UserActor,
  forbidden,
  notFound,
  unauthenticated,
} from "@scholarcrew/domain";
import type { CoreDeps } from "../shared";

export function assertUser(actor: Actor): asserts actor is UserActor {
  if (actor.kind !== "user") throw unauthenticated();
}

export function assertRole(actor: Actor, ...roles: Role[]): asserts actor is UserActor {
  assertUser(actor);
  if (!roles.includes(actor.role)) throw forbidden("Your account can't do that");
}

export function assertAdmin(actor: Actor): asserts actor is UserActor {
  assertRole(actor, "admin");
}

export function assertSystem(actor: Actor): asserts actor is SystemActor {
  if (actor.kind !== "system") throw forbidden("Only the system can do that");
}

export function isOwner(actor: Actor, ownerId: string): boolean {
  return actor.kind === "user" && actor.userId === ownerId;
}

/** Owner user or system. Everyone else gets not_found so ids can't be probed. */
export function assertOwner(actor: Actor, ownerId: string): void {
  if (actor.kind === "system" || isOwner(actor, ownerId)) return;
  throw notFound();
}

export async function familyIdsFor(deps: CoreDeps, userId: string): Promise<string[]> {
  const rows = await deps.db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(eq(familyMembers.userId, userId));
  return rows.map((r) => r.familyId);
}

async function familyIdsAs(deps: CoreDeps, userId: string, memberRole: "student" | "parent"): Promise<string[]> {
  const rows = await deps.db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, userId), eq(familyMembers.memberRole, memberRole)));
  return rows.map((r) => r.familyId);
}

/**
 * Categories `viewerUserId` may read for `studentId`: everything for the student, the enabled
 * shareSettings categories for a parent member of the student's family, nothing otherwise.
 * A category with no row uses DEFAULT_SHARED, the same rule readShareSettings shows (R2I-11).
 */
export async function getShareGrants(
  deps: CoreDeps,
  studentId: string,
  viewerUserId: string,
): Promise<ShareCategory[]> {
  if (studentId === viewerUserId) return [...SHARE_CATEGORIES];
  const studentFamilies = await familyIdsAs(deps, studentId, "student");
  if (studentFamilies.length === 0) return [];
  const viewerFamilies = await familyIdsAs(deps, viewerUserId, "parent");
  const shared = studentFamilies.filter((id) => viewerFamilies.includes(id));
  if (shared.length === 0) return [];
  const rows = await deps.db
    .select({ category: shareSettings.category, enabled: shareSettings.enabled })
    .from(shareSettings)
    .where(and(eq(shareSettings.studentId, studentId), inArray(shareSettings.familyId, shared)));
  return SHARE_CATEGORIES.filter((c) => {
    const forCategory = rows.filter((r) => r.category === c);
    return forCategory.length === 0 ? DEFAULT_SHARED[c] : forCategory.some((r) => r.enabled);
  });
}

export async function canRead(
  deps: CoreDeps,
  actor: Actor,
  ownerId: string,
  category: ShareCategory,
): Promise<boolean> {
  switch (actor.kind) {
    case "system":
      return true;
    case "public":
      return false;
    case "helper":
      return actor.studentId === ownerId && actor.scope.some((s) => s === category);
    case "user":
      if (actor.userId === ownerId) return true;
      return (await getShareGrants(deps, ownerId, actor.userId)).includes(category);
  }
}

export async function assertCanRead(
  deps: CoreDeps,
  actor: Actor,
  ownerId: string,
  category: ShareCategory,
): Promise<void> {
  if (!(await canRead(deps, actor, ownerId, category))) throw notFound();
}
