import { and, desc, eq, gt, helperLinks, isNull, users } from "@scholarcrew/db";
import {
  type Actor,
  type HelperActor,
  type HelperLink,
  type HelperLinkCreated,
  HelperLinkInput,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertRole, assertUser } from "../access";
import { recordAudit } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import { type CoreDeps, addDays, one, ownedWhere, requireUuid, toIso, toIsoOrNull } from "../shared";

function toLink(row: typeof helperLinks.$inferSelect): HelperLink {
  return {
    id: row.id,
    label: row.label,
    helperRole: row.helperRole,
    scope: row.scope,
    createdAt: toIso(row.createdAt),
    expiresAt: toIso(row.expiresAt),
    revokedAt: toIsoOrNull(row.revokedAt),
    lastUsedAt: toIsoOrNull(row.lastUsedAt),
  };
}

/** HL-01: read-only link with a HelperScope list (never essays, chats, costs, or sensitive) and at most 90 days. */
export async function createHelperLink(deps: CoreDeps, actor: Actor, i: HelperLinkInput): Promise<HelperLinkCreated> {
  assertRole(actor, "student");
  const parsed = HelperLinkInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the link settings", parsed.error.issues);
  const now = deps.clock.now();
  const token = randomToken();
  const scope = [...new Set(parsed.data.scope)];
  const row = one(
    await deps.db
      .insert(helperLinks)
      .values({
        studentId: actor.userId,
        label: parsed.data.label,
        helperRole: parsed.data.helperRole,
        scope,
        tokenHash: sha256Hex(token),
        createdAt: now,
        expiresAt: addDays(now, parsed.data.expiresInDays),
      })
      .returning(),
    "helper_links insert",
  );
  await recordAudit(deps, {
    actor,
    action: "helper_link_created",
    entityType: "helper_link",
    entityId: row.id,
    meta: { helperRole: row.helperRole, scope },
  });
  return { link: toLink(row), url: `${deps.config.appUrl}/h/${token}` };
}

export async function listHelperLinks(deps: CoreDeps, actor: Actor): Promise<HelperLink[]> {
  assertUser(actor);
  const rows = await deps.db
    .select()
    .from(helperLinks)
    .where(eq(helperLinks.studentId, actor.userId))
    .orderBy(desc(helperLinks.createdAt));
  return rows.map(toLink);
}

export async function revokeHelperLink(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  requireUuid(id, "Link not found");
  const [row] = await deps.db
    .select()
    .from(helperLinks)
    .where(and(eq(helperLinks.id, id), eq(helperLinks.studentId, actor.userId)));
  if (!row) throw notFound("Link not found");
  if (row.revokedAt === null) {
    await deps.db.update(helperLinks).set({ revokedAt: deps.clock.now() }).where(eq(helperLinks.id, id));
  }
  await recordAudit(deps, { actor, action: "helper_link_revoked", entityType: "helper_link", entityId: id });
}

/** A live, unrevoked link of an active student becomes a HelperActor. Anything else is null (the route returns 404). */
export async function resolveHelperToken(deps: CoreDeps, token: string): Promise<HelperActor | null> {
  if (!token) return null;
  const now = deps.clock.now();
  const [row] = await deps.db
    .select({ link: helperLinks, status: users.status })
    .from(helperLinks)
    .innerJoin(users, eq(users.id, helperLinks.studentId))
    .where(
      and(eq(helperLinks.tokenHash, sha256Hex(token)), isNull(helperLinks.revokedAt), gt(helperLinks.expiresAt, now)),
    )
    .limit(1);
  if (!row || row.status !== "active") return null;
  await deps.db.update(helperLinks).set({ lastUsedAt: now }).where(eq(helperLinks.id, row.link.id));
  const actor: HelperActor = {
    kind: "helper",
    helperLinkId: row.link.id,
    studentId: row.link.studentId,
    scope: row.link.scope,
  };
  await recordAudit(deps, {
    actor,
    action: "helper_link_used",
    entityType: "helper_link",
    entityId: row.link.id,
    meta: { scope: row.link.scope },
  });
  return actor;
}
