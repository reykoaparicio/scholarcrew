import { decisions, desc, eq } from "@scholarcrew/db";
import { type Actor, type Decision, DecisionInput, invalidInput, notFound } from "@scholarcrew/domain";
import { assertOwner, assertUser } from "../access";
import { type CoreDeps, isUuid, one, ownedWhere, requireUuid, toIso } from "../shared";

function toDecision(row: typeof decisions.$inferSelect): Decision {
  return {
    id: row.id,
    summary: row.summary,
    rationale: row.rationale,
    decidedAt: toIso(row.decidedAt),
    sourceMessageId: row.sourceMessageId,
  };
}

export async function listDecisions(deps: CoreDeps, actor: Actor, ownerId: string): Promise<Decision[]> {
  assertOwner(actor, ownerId);
  const rows = await deps.db
    .select()
    .from(decisions)
    .where(eq(decisions.ownerId, ownerId))
    .orderBy(desc(decisions.decidedAt));
  return rows.map(toDecision);
}

/** `sourceMessageId` is the chat message of a `record_decision` card (08 H10 passes it, R2I-12). */
export async function recordDecision(
  deps: CoreDeps,
  actor: Actor,
  i: DecisionInput,
  sourceMessageId: string | null = null,
): Promise<Decision> {
  assertUser(actor);
  const parsed = DecisionInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the decision and try again", parsed.error.issues);
  if (sourceMessageId !== null && !isUuid(sourceMessageId)) throw invalidInput("Unknown source message");
  const row = one(
    await deps.db
      .insert(decisions)
      .values({
        ownerId: actor.userId,
        summary: parsed.data.summary,
        rationale: parsed.data.rationale,
        sourceMessageId,
        decidedAt: deps.clock.now(),
      })
      .returning(),
    "decisions insert",
  );
  return toDecision(row);
}

export async function deleteDecision(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  requireUuid(id, "Decision not found");
  const [row] = await deps.db.select().from(decisions).where(eq(decisions.id, id)).limit(1);
  if (!row) throw notFound("Decision not found");
  assertOwner(actor, row.ownerId);
  await deps.db.delete(decisions).where(ownedWhere(decisions, id, row.ownerId));
}
