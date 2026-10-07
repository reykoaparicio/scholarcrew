import { runCrewRequest } from "@scholarcrew/agents";
import { makeConsult } from "@scholarcrew/agents/specialists";
import { createCandidate } from "@scholarcrew/core/memory";
import { privateScholarshipIds } from "@scholarcrew/core/scholarships";
import type { CoreDeps } from "@scholarcrew/core/shared";
import {
  and,
  conversations,
  desc,
  eq,
  inArray,
  lte,
  messages,
  ne,
  scholarships,
  shareSettings,
  users,
} from "@scholarcrew/db";
import {
  type CrewJob,
  type CrewReply,
  CrewRequestInput,
  type CrewRequester,
  type CrewSpeaker,
  DEFAULT_SHARED,
  type RoomKind,
  parseMentions,
} from "@scholarcrew/domain";
import { JobPayloads } from "@scholarcrew/jobs";
import { errorLabel, log } from "../log";
import { createCrewDataPort } from "../port";
import { type JobContext, NO_RETRY, type WorkerDeps } from "../types";
import { SYSTEM, runCrewJob } from "./shared";

export const HISTORY_LIMIT = 10;
export const MISSING_MESSAGE_TEXT = "We couldn't find the message for this request. Send it again.";
const REF_ROOMS: RoomKind[] = ["scholarship", "college", "essay"];

/** First whitespace token of a display name, at most 60 characters (CrewRequester.firstName). May be "". */
export function firstNameOf(displayName: string | null | undefined): string {
  return ((displayName ?? "").trim().split(/\s+/)[0] ?? "").slice(0, 60);
}

/** The request message, the 10 messages before it, the room, and the audience (family rooms → "family"). */
export async function loadCrewInput(core: CoreDeps, job: CrewJob, ownerId: string): Promise<CrewRequestInput | null> {
  if (!job.conversationId || !job.requestMessageId) return null;
  const [conv] = await core.db.select().from(conversations).where(eq(conversations.id, job.conversationId));
  const [request] = await core.db.select().from(messages).where(eq(messages.id, job.requestMessageId));
  if (!conv || !request || request.conversationId !== conv.id) return null;
  const earlier = await core.db
    .select({
      authorKind: messages.authorKind,
      authorUserId: messages.authorUserId,
      body: messages.body,
      sharedCategories: messages.sharedCategories,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conv.id),
        ne(messages.id, request.id),
        lte(messages.createdAt, request.createdAt),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(HISTORY_LIMIT);
  // D42: one lookup for the owner, the request author, and every history author.
  const authorIds = new Set<string>([ownerId]);
  if (request.authorUserId) authorIds.add(request.authorUserId);
  for (const m of earlier) if (m.authorUserId) authorIds.add(m.authorUserId);
  const people = await core.db
    .select({ id: users.id, role: users.role, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, [...authorIds]));
  const byId = new Map(people.map((p) => [p.id, p]));
  const roleOf = (userId: string): "student" | "parent" => (byId.get(userId)?.role === "parent" ? "parent" : "student");
  // The owner is always "student"; any other user is "parent" when their role is parent, otherwise "student".
  const speakerOf = (m: { authorKind: "user" | "crew"; authorUserId: string | null }): CrewSpeaker => {
    if (m.authorKind === "crew") return "crew";
    return m.authorUserId === null || m.authorUserId === ownerId ? "student" : roleOf(m.authorUserId);
  };
  const askedBy = request.authorUserId ?? ownerId;
  const requester: CrewRequester = {
    role: askedBy === ownerId ? "student" : roleOf(askedBy),
    firstName: firstNameOf(byId.get(askedBy)?.displayName),
  };
  const privateIds = await privateScholarshipIds(core.db, ownerId);
  const privateListings = privateIds.size
    ? await core.db
        .select({ id: scholarships.id, name: scholarships.name })
        .from(scholarships)
        .where(inArray(scholarships.id, [...privateIds]))
    : [];
  const shares = { ...DEFAULT_SHARED };
  for (const row of await core.db.select().from(shareSettings).where(eq(shareSettings.studentId, ownerId)))
    shares[row.category] = row.enabled;
  const safeEarlier = earlier.filter((message) => {
    if (message.authorKind !== "crew") return true;
    if (conv.room === "family" && (message.sharedCategories ?? []).some((category) => !shares[category])) return false;
    const text = JSON.stringify(message);
    return !privateListings.some((listing) => text.includes(listing.id) || text.includes(listing.name));
  });
  const room = conv.room;
  return CrewRequestInput.parse({
    jobId: job.id,
    ownerId,
    conversationId: conv.id,
    room,
    roomRef: conv.roomRefId && REF_ROOMS.includes(room) ? { type: room, id: conv.roomRefId } : null,
    audience: room === "family" ? "family" : "crew",
    requester,
    userText: request.body,
    history: safeEarlier.reverse().map((m) => ({ author: m.authorKind, speaker: speakerOf(m), text: m.body })),
    mentions: parseMentions(request.body),
  });
}

/**
 * ME-03, D19: each confirm_fact card becomes a memory candidate ("Waiting for your OK"). Never for temporary
 * chats (CR-07) or family audiences (memory never comes from family rooms). A bad or duplicate fact is logged
 * and skipped so it can't fail a finished reply.
 */
export async function fileCandidates(core: CoreDeps, input: CrewRequestInput, reply: CrewReply): Promise<number> {
  if (input.room === "temporary" || input.audience !== "crew") return 0;
  let filed = 0;
  for (const card of reply.actionCards) {
    if (card.kind !== "confirm_fact") continue;
    try {
      await createCandidate(core, SYSTEM, input.ownerId, card.fact);
      filed += 1;
    } catch (e) {
      log("warn", "crew.candidate_skipped", { jobId: input.jobId, cardId: card.id, error: errorLabel(e) });
    }
  }
  return filed;
}

/** CR-01..CR-11 on the worker side: Compass with specialists through makeConsult (00-overview §9.5). */
export async function handleCrewRequest(deps: WorkerDeps, data: unknown, ctx: JobContext = NO_RETRY): Promise<void> {
  const { jobId } = JobPayloads["crew.request"].parse(data);
  await runCrewJob(deps, { name: "crew.request", jobId, ctx, crewRequest: true }, async ({ job, ownerId, base }) => {
    const input = await loadCrewInput(deps.core, job, ownerId);
    if (!input) return { reply: null, status: "failed", error: MISSING_MESSAGE_TEXT };
    // 12-1: Compass and every specialist read through one port bound to this request's audience.
    const bound = { ...base, port: createCrewDataPort(deps.core, { audience: input.audience }) };
    const result = await runCrewRequest({ ...bound, consult: makeConsult(bound) }, input);
    // R2C-15: file candidates only once the reply is saved, so a completeJob failure and retry can't file them twice.
    return {
      reply: result.reply,
      status: result.status,
      safety: result.safety,
      sharedCategories: bound.port.usedCategories(),
      afterComplete: async () => {
        await fileCandidates(deps.core, input, result.reply);
      },
    };
  });
}
