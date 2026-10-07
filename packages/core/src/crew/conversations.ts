import {
  actionReceipts,
  and,
  asc,
  colleges,
  conversations,
  crewJobs,
  desc,
  eq,
  essays,
  familyMembers,
  gt,
  inArray,
  isNull,
  messages,
  ne,
  or,
  sql,
} from "@scholarcrew/db";
import {
  type Actor,
  CRISIS_REPLY,
  type Conversation,
  ConversationInput,
  type CrewJob,
  type Message,
  type RoomKind,
  SendMessageInput,
  type UserActor,
  detectCrisis,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertUser, familyIdsFor, getShareGrants } from "../access";
import { assertCrewAllowance } from "../billing";
import { consumeRateLimit } from "../ratelimit";
import { getScholarship } from "../scholarships";
import { type CoreDeps, one, requireUuid } from "../shared";
import { insertJob } from "./jobs";
import { type ConversationRow, toConversation, toCrewJob, toMessage } from "./mappers";

export const STALE_SHARE_TEXT = "This answer used something that's no longer shared.";
export const CREW_SEND_LIMIT = { limit: 30, windowSeconds: 600 };
const TEMPORARY_MS = 24 * 3_600_000;

const DEFAULT_TITLES: Record<RoomKind, string> = {
  my_crew: "My Crew",
  family: "Family",
  temporary: "Temporary chat",
  scholarship: "Scholarship",
  college: "College",
  essay: "Essay",
};

function isLive(row: ConversationRow, now: Date): boolean {
  return row.archivedAt === null && (row.expiresAt === null || row.expiresAt.getTime() > now.getTime());
}

import { nextMessageTime } from "./message-order";

/**
 * The conversation if `actor` may use it: any family member for a family room, otherwise only its owner.
 * Archived rooms and expired temporary chats are gone.
 */
export async function accessibleConversation(deps: CoreDeps, actor: UserActor, id: string): Promise<ConversationRow> {
  requireUuid(id, "Conversation not found");
  const [row] = await deps.db.select().from(conversations).where(eq(conversations.id, id));
  if (!row || !isLive(row, deps.clock.now())) throw notFound("Conversation not found");
  if (row.room === "family") {
    if (row.familyId && (await familyIdsFor(deps, actor.userId)).includes(row.familyId)) return row;
    throw notFound("Conversation not found");
  }
  if (row.ownerId !== actor.userId) throw notFound("Conversation not found");
  return row;
}

async function lastMessageTimes(deps: CoreDeps, ids: string[]): Promise<Map<string, Date>> {
  if (ids.length === 0) return new Map();
  const rows = await deps.db
    .select({
      conversationId: messages.conversationId,
      last: sql<Date>`max(${messages.createdAt})`.mapWith(messages.createdAt),
    })
    .from(messages)
    .where(inArray(messages.conversationId, ids))
    .groupBy(messages.conversationId);
  return new Map(rows.map((r) => [r.conversationId, r.last]));
}

async function withLast(deps: CoreDeps, row: ConversationRow): Promise<Conversation> {
  const times = await lastMessageTimes(deps, [row.id]);
  return toConversation(row, times.get(row.id) ?? null);
}

export async function listConversations(deps: CoreDeps, actor: Actor): Promise<Conversation[]> {
  assertUser(actor);
  const now = deps.clock.now();
  const familyIds = await familyIdsFor(deps, actor.userId);
  const mine = and(eq(conversations.ownerId, actor.userId), ne(conversations.room, "family"));
  const visible =
    familyIds.length > 0
      ? or(mine, and(eq(conversations.room, "family"), inArray(conversations.familyId, familyIds)))
      : mine;
  const rows = await deps.db
    .select()
    .from(conversations)
    .where(
      and(
        visible,
        isNull(conversations.archivedAt),
        or(isNull(conversations.expiresAt), gt(conversations.expiresAt, now)),
      ),
    );
  const times = await lastMessageTimes(
    deps,
    rows.map((r) => r.id),
  );
  const activity = (r: ConversationRow) => (times.get(r.id) ?? r.createdAt).getTime();
  return [...rows].sort((a, b) => activity(b) - activity(a)).map((r) => toConversation(r, times.get(r.id) ?? null));
}

async function roomTarget(
  deps: CoreDeps,
  actor: UserActor,
  room: RoomKind,
  ref: string,
): Promise<{ refId: string; title: string }> {
  if (room === "scholarship") {
    const listing = await getScholarship(deps, actor, ref);
    return { refId: listing.id, title: listing.name };
  }
  if (room === "college") {
    const [college] = await deps.db
      .select({ id: colleges.id, name: colleges.name })
      .from(colleges)
      .where(eq(colleges.id, ref));
    if (!college) throw notFound("College not found");
    return { refId: college.id, title: college.name };
  }
  requireUuid(ref, "Essay not found");
  const [essay] = await deps.db
    .select({ id: essays.id, title: essays.title })
    .from(essays)
    .where(and(eq(essays.id, ref), eq(essays.ownerId, actor.userId)));
  if (!essay) throw notFound("Essay not found");
  return { refId: essay.id, title: essay.title };
}

export async function createConversation(deps: CoreDeps, actor: Actor, i: ConversationInput): Promise<Conversation> {
  assertUser(actor);
  const parsed = ConversationInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the room and try again", parsed.error.issues);
  const v = parsed.data;
  const now = deps.clock.now();
  const insert = async (values: {
    ownerId: string;
    title: string;
    roomRefId?: string | null;
    familyId?: string | null;
    expiresAt?: Date | null;
  }): Promise<Conversation> => {
    const row = one(
      await deps.db
        .insert(conversations)
        .values({ room: v.room, createdAt: now, ...values })
        .returning(),
      "conversations insert",
    );
    return toConversation(row, null);
  };

  if (v.room === "my_crew") {
    return insert({ ownerId: actor.userId, title: v.title || DEFAULT_TITLES.my_crew });
  }
  if (v.room === "temporary") {
    return insert({
      ownerId: actor.userId,
      title: v.title || DEFAULT_TITLES.temporary,
      expiresAt: new Date(now.getTime() + TEMPORARY_MS),
    });
  }
  if (v.room === "family") {
    const familyId = v.familyId;
    if (!familyId) throw invalidInput("Pick the family for this room");
    if (!(await familyIdsFor(deps, actor.userId)).includes(familyId)) throw notFound("Family not found");
    const [student] = await deps.db
      .select({ userId: familyMembers.userId })
      .from(familyMembers)
      .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.memberRole, "student")))
      .orderBy(asc(familyMembers.joinedAt))
      .limit(1);
    if (!student) throw invalidInput("This family has no student yet");
    const [existing] = await deps.db
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.room, "family"), eq(conversations.familyId, familyId), isNull(conversations.archivedAt)),
      )
      .orderBy(asc(conversations.createdAt))
      .limit(1);
    if (existing) return withLast(deps, existing);
    return insert({ ownerId: student.userId, familyId, title: v.title || DEFAULT_TITLES.family });
  }

  if (!v.roomRefId) throw invalidInput("Pick what this room is about");
  const target = await roomTarget(deps, actor, v.room, v.roomRefId);
  const [existing] = await deps.db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.ownerId, actor.userId),
        eq(conversations.room, v.room),
        eq(conversations.roomRefId, target.refId),
        isNull(conversations.archivedAt),
      ),
    )
    .orderBy(asc(conversations.createdAt))
    .limit(1);
  if (existing) return withLast(deps, existing);
  return insert({ ownerId: actor.userId, roomRefId: target.refId, title: v.title || target.title });
}

export async function getMessages(
  deps: CoreDeps,
  actor: Actor,
  conversationId: string,
  o: { before?: string; limit?: number } = {},
): Promise<Message[]> {
  assertUser(actor);
  const conv = await accessibleConversation(deps, actor, conversationId);
  const limit = Math.min(100, Math.max(1, o.limit ?? 50));
  if (!Number.isInteger(limit)) throw invalidInput("Choose a whole message limit");
  const [before] = o.before
    ? await deps.db
        .select()
        .from(messages)
        .where(and(eq(messages.id, o.before), eq(messages.conversationId, conv.id)))
        .limit(1)
    : [];
  if (o.before && !before) throw notFound("Message not found");
  const older = before
    ? sql`(${messages.createdAt}, ${messages.id}) < (${before.createdAt.toISOString()}::timestamptz, ${before.id})`
    : undefined;
  const grants = actor.userId === conv.ownerId ? null : await getShareGrants(deps, conv.ownerId, actor.userId);
  const rows = await deps.db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conv.id), older))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);
  if (rows.length === 0) return [];
  const receipts = await deps.db
    .select({ messageId: actionReceipts.messageId, cardId: actionReceipts.cardId })
    .from(actionReceipts)
    .where(
      inArray(
        actionReceipts.messageId,
        rows.map((r) => r.id),
      ),
    );
  return rows.reverse().map((r) => {
    const stale =
      grants !== null &&
      r.authorKind === "crew" &&
      (r.sharedCategories ?? []).some((category) => !grants.includes(category));
    const shown = stale
      ? {
          ...r,
          body: STALE_SHARE_TEXT,
          reply: { ...CRISIS_REPLY, text: STALE_SHARE_TEXT, safety: null, actionCards: [], receipt: [] },
        }
      : r;
    return toMessage(
      shown,
      receipts.filter((x) => x.messageId === r.id).map((x) => x.cardId),
    );
  });
}

/** Stores the user's message and queues a crew request charged to the room owner's allowance. */
export async function sendMessage(
  deps: CoreDeps,
  actor: Actor,
  conversationId: string,
  i: SendMessageInput,
): Promise<{ message: Message; job: CrewJob }> {
  assertUser(actor);
  const conv = await accessibleConversation(deps, actor, conversationId);
  const parsed = SendMessageInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Type a message first", parsed.error.issues);
  const now = deps.clock.now();
  if (detectCrisis(parsed.data.body)) {
    const result = await deps.db.transaction(async (tx) => {
      const messageAt = await nextMessageTime(tx, conv.id, now);
      const request = one(
        await tx
          .insert(messages)
          .values({
            conversationId: conv.id,
            authorKind: "user",
            authorUserId: actor.userId,
            body: parsed.data.body,
            createdAt: messageAt,
          })
          .returning(),
        "crisis request insert",
      );
      const answer = one(
        await tx
          .insert(messages)
          .values({
            conversationId: conv.id,
            authorKind: "crew",
            authorUserId: null,
            body: CRISIS_REPLY.text,
            reply: CRISIS_REPLY,
            createdAt: new Date(messageAt.getTime() + 1),
          })
          .returning(),
        "crisis reply insert",
      );
      const row = one(
        await tx
          .insert(crewJobs)
          .values({
            ownerId: conv.ownerId,
            kind: "crew_request",
            status: "ready",
            conversationId: conv.id,
            requestMessageId: request.id,
            resultMessageId: answer.id,
            safety: "crisis",
            costMicros: 0,
            usageMonth: now.toISOString().slice(0, 7),
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
        "crisis job insert",
      );
      return { message: toMessage(request, []), job: toCrewJob(row) };
    });
    console.log(JSON.stringify({ level: "info", msg: "crew.crisis", jobId: result.job.id }));
    return result;
  }
  await consumeRateLimit(deps, { key: `crew-send:${actor.userId}`, ...CREW_SEND_LIMIT });
  const { message, job } = await deps.db.transaction(async (tx) => {
    const messageAt = await nextMessageTime(tx, conv.id, now);
    await assertCrewAllowance(deps, conv.ownerId, tx);
    const row = one(
      await tx
        .insert(messages)
        .values({
          conversationId: conv.id,
          authorKind: "user",
          authorUserId: actor.userId,
          body: parsed.data.body,
          createdAt: messageAt,
        })
        .returning(),
      "messages insert",
    );
    const created = await insertJob(tx, {
      ownerId: conv.ownerId,
      kind: "crew_request",
      conversationId: conv.id,
      requestMessageId: row.id,
      now,
    });
    return { message: row, job: created };
  });
  await deps.jobs.enqueue("crew.request", { jobId: job.id });
  return { message: toMessage(message, []), job };
}
