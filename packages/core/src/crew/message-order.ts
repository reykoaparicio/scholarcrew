import { type DbOrTx, conversations, desc, eq, messages } from "@scholarcrew/db";

/** Serialize all message inserts in a room, even when the clock has not advanced. Call within a transaction. */
export async function nextMessageTime(tx: DbOrTx, conversationId: string, now: Date): Promise<Date> {
  await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .for("update");
  const [latest] = await tx
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return new Date(Math.max(now.getTime(), (latest?.createdAt.getTime() ?? -1) + 1));
}
