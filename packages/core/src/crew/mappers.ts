import type { actionReceipts, conversations, crewJobs, messages } from "@scholarcrew/db";
import type { ActionReceipt, Conversation, CrewJob, Message } from "@scholarcrew/domain";
import { toIso, toIsoOrNull } from "../shared";

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type JobRow = typeof crewJobs.$inferSelect;
export type ReceiptRow = typeof actionReceipts.$inferSelect;

export function toCrewJob(row: JobRow): CrewJob {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    conversationId: row.conversationId,
    requestMessageId: row.requestMessageId,
    resultMessageId: row.resultMessageId,
    refId: row.refId,
    progress: row.progress,
    error: row.error,
    safety: row.safety ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toConversation(row: ConversationRow, lastMessageAt: Date | null): Conversation {
  return {
    id: row.id,
    room: row.room,
    roomRefId: row.roomRefId,
    familyId: row.familyId,
    title: row.title,
    createdAt: toIso(row.createdAt),
    expiresAt: toIsoOrNull(row.expiresAt),
    lastMessageAt: toIsoOrNull(lastMessageAt),
  };
}

export function toMessage(row: MessageRow, appliedCardIds: string[]): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    authorKind: row.authorKind,
    authorUserId: row.authorUserId,
    body: row.body,
    reply: row.reply ?? null,
    sharedCategories: row.sharedCategories ?? null,
    createdAt: toIso(row.createdAt),
    appliedCardIds,
  };
}

export function toReceipt(row: ReceiptRow): ActionReceipt {
  return {
    id: row.id,
    messageId: row.messageId,
    cardId: row.cardId,
    appliedAt: toIso(row.appliedAt),
    result: row.result,
  };
}
