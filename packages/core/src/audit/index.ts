import { auditEvents } from "@scholarcrew/db";
import type { Actor } from "@scholarcrew/domain";
import type { CoreDeps } from "../shared";

function actorIdOf(actor: Actor): string | null {
  if (actor.kind === "user") return actor.userId;
  if (actor.kind === "helper") return actor.helperLinkId;
  return null;
}

/** Appends one audit event. Never put tokens, essay text, or sensitive values in `meta`. */
export async function recordAudit(
  deps: CoreDeps,
  e: { actor: Actor; action: string; entityType: string; entityId: string; meta?: Record<string, unknown> },
): Promise<void> {
  await deps.db.insert(auditEvents).values({
    actorId: actorIdOf(e.actor),
    actorKind: e.actor.kind,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    meta: e.meta ?? {},
    createdAt: deps.clock.now(),
  });
}
