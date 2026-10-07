import { type Db, desc, devOutbox, eq } from "@scholarcrew/db";
import { type Role, type SystemActor, type UserActor, systemActor, userActor } from "@scholarcrew/domain";

export const SYSTEM: SystemActor = systemActor("test");

export function actorOf(user: { id: string; role: Role }): UserActor {
  return userActor(user.id, user.role);
}

/** Newest dev_outbox message sent to `to`. */
export async function latestEmail(db: Db, to: string): Promise<{ subject: string; text: string }> {
  const rows = await db
    .select()
    .from(devOutbox)
    .where(eq(devOutbox.to, to.toLowerCase()))
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`No email to ${to}`);
  return { subject: row.subject, text: row.text };
}

/** The `token=` query value in an email body. */
export function tokenIn(text: string): string {
  const match = /token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) throw new Error("No token in email text");
  return match[1];
}
