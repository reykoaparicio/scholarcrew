import { and, desc, eq, serviceLogs } from "@scholarcrew/db";
import { type Actor, type ServiceLog, type ServiceLogInput, type ServiceLogPatch, notFound } from "@scholarcrew/domain";
import { assertOwner } from "../access";
import { assertReadable, firstRow, requireUser } from "../scholarships/common";
import { type CoreDeps, requireUuid } from "../shared";
import { toServiceLog } from "./mappers";

export async function ownedLog(deps: CoreDeps, actor: Actor, id: string) {
  requireUuid(id, "Service log not found");
  const [row] = await deps.db.select().from(serviceLogs).where(eq(serviceLogs.id, id));
  if (!row) throw notFound("Service log not found");
  assertOwner(actor, row.ownerId);
  return row;
}

export async function listServiceLogs(deps: CoreDeps, actor: Actor, ownerId: string): Promise<ServiceLog[]> {
  await assertReadable(deps, actor, ownerId, "activities");
  const rows = await deps.db
    .select()
    .from(serviceLogs)
    .where(eq(serviceLogs.ownerId, ownerId))
    .orderBy(desc(serviceLogs.servedOn), desc(serviceLogs.createdAt));
  return rows.map(toServiceLog);
}

export async function addServiceLog(deps: CoreDeps, actor: Actor, i: ServiceLogInput): Promise<ServiceLog> {
  const user = requireUser(actor);
  const row = firstRow(
    await deps.db
      .insert(serviceLogs)
      .values({
        ownerId: user.userId,
        organization: i.organization.trim(),
        activity: i.activity.trim(),
        servedOn: i.servedOn,
        minutes: i.minutes,
        supervisorName: i.supervisorName.trim(),
        supervisorEmail: i.supervisorEmail.trim().toLowerCase(),
        reflection: i.reflection,
      })
      .returning(),
    "service log",
  );
  return toServiceLog(row);
}

export async function updateServiceLog(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  p: ServiceLogPatch,
): Promise<ServiceLog> {
  requireUser(actor);
  const row = await ownedLog(deps, actor, id);
  const set: Partial<typeof serviceLogs.$inferInsert> = {};
  if (p.organization !== undefined) set.organization = p.organization.trim();
  if (p.activity !== undefined) set.activity = p.activity.trim();
  if (p.servedOn !== undefined) set.servedOn = p.servedOn;
  if (p.minutes !== undefined) set.minutes = p.minutes;
  if (p.supervisorName !== undefined) set.supervisorName = p.supervisorName.trim();
  if (p.supervisorEmail !== undefined) set.supervisorEmail = p.supervisorEmail.trim().toLowerCase();
  if (p.reflection !== undefined) set.reflection = p.reflection;
  const changed =
    (set.organization !== undefined && set.organization !== row.organization) ||
    (set.activity !== undefined && set.activity !== row.activity) ||
    (set.servedOn !== undefined && set.servedOn !== row.servedOn) ||
    (set.minutes !== undefined && set.minutes !== row.minutes) ||
    (set.supervisorEmail !== undefined && set.supervisorEmail !== row.supervisorEmail);
  if (changed && row.verification !== "self_reported") {
    set.verification = "self_reported";
    set.verifiedAt = null;
    set.verifierNote = "";
    set.verificationTokenHash = null;
    set.verificationExpiresAt = null;
  }
  if (Object.keys(set).length === 0) return toServiceLog(row);
  const updated = firstRow(
    await deps.db
      .update(serviceLogs)
      .set(set)
      .where(and(eq(serviceLogs.id, id), eq(serviceLogs.ownerId, row.ownerId)))
      .returning(),
    "service log",
  );
  return toServiceLog(updated);
}

export async function deleteServiceLog(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  requireUser(actor);
  const row = await ownedLog(deps, actor, id);
  await deps.db.delete(serviceLogs).where(and(eq(serviceLogs.id, id), eq(serviceLogs.ownerId, row.ownerId)));
}
