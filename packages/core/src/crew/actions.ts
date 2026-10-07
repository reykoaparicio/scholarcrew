import { actionReceipts, and, eq, messages } from "@scholarcrew/db";
import {
  type ActionCard,
  type ActionReceipt,
  type Actor,
  AppError,
  ApplyActionInput,
  type UserActor,
  conflict,
  invalidInput,
  isAppError,
  notFound,
} from "@scholarcrew/domain";
import { assertUser, getShareGrants } from "../access";
import { addCollege } from "../colleges";
import { createEssay } from "../essays";
import { createFact, recordDecision } from "../memory";
import { addPlanItem } from "../plan/items";
import { saveScholarship } from "../scholarships";
import { type CoreDeps, one } from "../shared";
import { accessibleConversation } from "./conversations";
import { toReceipt } from "./mappers";

/** The receipt's result while the card runs. `getMessages.appliedCardIds` treats a pending claim as applied. */
const PENDING_RESULT = { pending: true } as const;
/** A claim older than this is a crashed apply; it's returned as-is instead of blocking forever. */
const STALE_CLAIM_MS = 60_000;

async function receiptFor(deps: CoreDeps, messageId: string, cardId: string) {
  const [row] = await deps.db
    .select()
    .from(actionReceipts)
    .where(and(eq(actionReceipts.messageId, messageId), eq(actionReceipts.cardId, cardId)));
  return row;
}

/** Runs the card as the student. Every write goes through the owning module's service. */
async function runCard(
  deps: CoreDeps,
  actor: UserActor,
  card: ActionCard,
  messageId: string,
): Promise<Record<string, unknown>> {
  switch (card.kind) {
    case "add_plan_item": {
      const item = await addPlanItem(deps, actor, card.item);
      return { planItemId: item.id };
    }
    case "save_scholarship": {
      const app = await saveScholarship(deps, actor, { scholarshipId: card.scholarshipId });
      return { applicationId: app.id };
    }
    case "add_college": {
      try {
        const entry = await addCollege(deps, actor, { collegeId: card.collegeId, fit: card.fit, plan: card.plan });
        return { collegeListId: entry.id };
      } catch (e) {
        if (isAppError(e) && e.code === "conflict") return { collegeId: card.collegeId, alreadyListed: true };
        throw e;
      }
    }
    case "start_essay": {
      const essay = await createEssay(deps, actor, card.essay);
      return { essayId: essay.id };
    }
    case "open_link":
      return { href: card.href };
    case "record_decision": {
      // R2I-12: keep the link back to the chat message that proposed it.
      const decision = await recordDecision(deps, actor, card.decision, messageId);
      return { decisionId: decision.id };
    }
    case "confirm_fact": {
      const fact = await createFact(deps, actor, card.fact);
      return { factId: fact.id };
    }
  }
}

export async function applyActionCard(deps: CoreDeps, actor: Actor, i: ApplyActionInput): Promise<ActionReceipt> {
  assertUser(actor);
  const parsed = ApplyActionInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the action and try again", parsed.error.issues);
  const { messageId, cardId } = parsed.data;
  const [message] = await deps.db.select().from(messages).where(eq(messages.id, messageId));
  if (!message || message.authorKind !== "crew" || !message.reply) throw notFound("Action not found");
  const conv = await accessibleConversation(deps, actor, message.conversationId);
  if (actor.userId !== conv.ownerId) {
    const grants = await getShareGrants(deps, conv.ownerId, actor.userId);
    if ((message.sharedCategories ?? []).some((category) => !grants.includes(category))) {
      throw notFound("Action not found");
    }
  }
  const card = message.reply.actionCards.find((c) => c.id === cardId);
  if (!card) throw notFound("Action not found");
  if (conv.room === "family" && card.kind !== "open_link" && conv.ownerId !== actor.userId) {
    throw notFound("Action not found");
  }
  // R2C-9 (CR-07): a temporary chat remembers nothing, even when the model proposed it.
  if (conv.room === "temporary" && (card.kind === "confirm_fact" || card.kind === "record_decision")) {
    throw invalidInput("Temporary chats don't save memory");
  }
  // R2C-3: claim the receipt before running the card, so two tabs or a client retry can't both run it.
  const [claim] = await deps.db
    .insert(actionReceipts)
    .values({ ownerId: conv.ownerId, messageId, cardId, appliedAt: deps.clock.now(), result: PENDING_RESULT })
    .onConflictDoNothing({ target: [actionReceipts.messageId, actionReceipts.cardId] })
    .returning();
  if (!claim) {
    const existing = await receiptFor(deps, messageId, cardId);
    if (!existing) throw new AppError("internal", "Action receipt missing after claim");
    const stale = deps.clock.now().getTime() - existing.appliedAt.getTime() > STALE_CLAIM_MS;
    if (existing.result.pending !== true || stale) return toReceipt(existing);
    throw conflict("This action is still being applied");
  }
  let result: Record<string, unknown>;
  try {
    result = await runCard(deps, actor, card, messageId);
  } catch (e) {
    await deps.db.delete(actionReceipts).where(eq(actionReceipts.id, claim.id));
    throw e;
  }
  const done = one(
    await deps.db.update(actionReceipts).set({ result }).where(eq(actionReceipts.id, claim.id)).returning(),
    "action_receipts update",
  );
  return toReceipt(done);
}
