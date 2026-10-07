import { messages } from "@scholarcrew/db";
import { actionReceipts, crewJobs, eq, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type ConversationInput, type CrewReply, type RoomKind, systemActor, userActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { NOW, makeDeps, makeParentOf, makeStateU, makeStudent } from "../plan/testkit";
import { consumeRateLimit } from "../ratelimit";
import { CREW_SEND_LIMIT, createConversation, getMessages, listConversations, sendMessage } from "./conversations";
import { completeJob, startJob } from "./jobs";

const SYSTEM = systemActor("test");
const room = (r: RoomKind, o: Partial<ConversationInput> = {}): ConversationInput => ({
  room: r,
  roomRefId: null,
  familyId: null,
  title: "",
  ...o,
});

describe("conversations", () => {
  it("pages the newest 50 messages and then the earlier 10", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    for (let index = 0; index < 60; index += 1)
      await deps.db.insert(messages).values({
        conversationId: conv.id,
        authorKind: "user",
        authorUserId: user.id,
        body: `message ${index}`,
        createdAt: new Date(deps.clock.now().getTime() + index * 1000),
      });
    const latest = await getMessages(deps, actor, conv.id);
    expect(latest).toHaveLength(50);
    expect(latest[0]?.body).toBe("message 10");
    expect(await getMessages(deps, actor, conv.id, { before: latest[0]?.id })).toHaveLength(10);
  });

  it("answers a crisis before exhausted usage and a full send bucket", async () => {
    const { deps } = makeDeps();
    const jobs = deps.jobs;
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    for (let n = 0; n < 30; n += 1) await consumeRateLimit(deps, { key: `crew-send:${user.id}`, ...CREW_SEND_LIMIT });
    await deps.db
      .insert(usageCounters)
      .values({ userId: user.id, month: deps.clock.now().toISOString().slice(0, 7), crewRequests: 20, costMicros: 0 });
    const result = await sendMessage(deps, actor, conv.id, { body: "I want to kill myself" });
    expect(result.job).toMatchObject({ status: "ready", safety: "crisis" });
    expect((await getMessages(deps, actor, conv.id)).at(-1)?.body).toContain("988");
    expect(jobs.sent).toEqual([]);
    const [usage] = await deps.db.select().from(usageCounters).where(eq(usageCounters.userId, user.id));
    expect(usage?.crewRequests).toBe(20);
    await expect(sendMessage(deps, actor, conv.id, { body: "Plan my week" })).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("creates private rooms and expires temporary chats after 24 hours", async () => {
    const { deps, clock } = makeDeps();
    const { actor } = await makeStudent(deps);
    const mine = await createConversation(deps, actor, room("my_crew"));
    expect(mine).toMatchObject({
      room: "my_crew",
      title: "My Crew",
      expiresAt: null,
      lastMessageAt: null,
      familyId: null,
    });
    const temp = await createConversation(deps, actor, room("temporary"));
    expect(temp).toMatchObject({ title: "Temporary chat", expiresAt: "2026-10-07T15:00:00.000Z" });
    expect((await listConversations(deps, actor)).map((c) => c.id).sort()).toEqual([mine.id, temp.id].sort());
    clock.set("2026-10-07T15:00:01.000Z");
    expect((await listConversations(deps, actor)).map((c) => c.id)).toEqual([mine.id]);
    await expect(getMessages(deps, actor, temp.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(sendMessage(deps, actor, temp.id, { body: "hi" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("sends a message as a queued crew request within the allowance", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await createConversation(deps, actor, room("my_crew"));
    const { message, job } = await sendMessage(deps, actor, conv.id, { body: "  What's due this week?  " });
    expect(message).toMatchObject({
      conversationId: conv.id,
      authorKind: "user",
      authorUserId: user.id,
      body: "What's due this week?",
      reply: null,
      appliedCardIds: [],
    });
    expect(job).toMatchObject({
      kind: "crew_request",
      status: "queued",
      conversationId: conv.id,
      requestMessageId: message.id,
    });
    expect(deps.jobs.sent).toEqual([{ name: "crew.request", payload: { jobId: job.id } }]);
    expect((await listConversations(deps, actor))[0]?.lastMessageAt).toBe(NOW);
    await expect(sendMessage(deps, actor, conv.id, { body: "   " })).rejects.toMatchObject({ code: "invalid_input" });
    await deps.db.insert(usageCounters).values({ userId: user.id, month: "2026-10", crewRequests: 20 });
    deps.jobs.clear();
    await expect(sendMessage(deps, actor, conv.id, { body: "One more?" })).rejects.toMatchObject({
      code: "limit_reached",
    });
    expect(await getMessages(deps, actor, conv.id)).toHaveLength(1);
    expect(deps.jobs.sent).toEqual([]);
  });

  it("shares the family room with family members only", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { family, actor: parent } = await makeParentOf(deps, user.id);
    const outsider = userActor((await factories.parent(deps.db)).id, "parent");
    const familyRoom = await createConversation(deps, parent, room("family", { familyId: family.id }));
    expect(familyRoom).toMatchObject({ room: "family", familyId: family.id, title: "Family" });
    expect((await createConversation(deps, actor, room("family", { familyId: family.id }))).id).toBe(familyRoom.id);
    await expect(createConversation(deps, outsider, room("family", { familyId: family.id }))).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(createConversation(deps, actor, room("family"))).rejects.toMatchObject({ code: "invalid_input" });
    const { job } = await sendMessage(deps, parent, familyRoom.id, { body: "Can we afford State U?" });
    const [row] = await deps.db.select().from(crewJobs).where(eq(crewJobs.id, job.id));
    expect(row?.ownerId).toBe(user.id);
    expect(await getMessages(deps, actor, familyRoom.id)).toHaveLength(1);
    expect((await listConversations(deps, parent)).map((c) => c.id)).toEqual([familyRoom.id]);
    const mine = await createConversation(deps, actor, room("my_crew"));
    await expect(getMessages(deps, parent, mine.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(sendMessage(deps, parent, mine.id, { body: "hi" })).rejects.toMatchObject({ code: "not_found" });
    await expect(getMessages(deps, outsider, familyRoom.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("binds context rooms to objects the owner can read and reopens them", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { user: other } = await makeStudent(deps);
    const listing = await factories.scholarship(deps.db, { name: "Maple Rotary" });
    const byslug = await createConversation(deps, actor, room("scholarship", { roomRefId: listing.slug }));
    expect(byslug).toMatchObject({ room: "scholarship", roomRefId: listing.id, title: "Maple Rotary" });
    expect((await createConversation(deps, actor, room("scholarship", { roomRefId: listing.id }))).id).toBe(byslug.id);
    const college = await makeStateU(deps);
    expect((await createConversation(deps, actor, room("college", { roomRefId: college.id }))).title).toBe("State U");
    const theirs = await factories.essay(deps.db, other.id);
    await expect(createConversation(deps, actor, room("essay", { roomRefId: theirs.id }))).rejects.toMatchObject({
      code: "not_found",
    });
    const mine = await factories.essay(deps.db, user.id, { title: "Rotary essay" });
    expect((await createConversation(deps, actor, room("essay", { roomRefId: mine.id }))).title).toBe("Rotary essay");
    await expect(createConversation(deps, actor, room("college", { roomRefId: "999999" }))).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(createConversation(deps, actor, room("college"))).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("lists messages oldest first with applied card ids", async () => {
    const { deps, clock } = makeDeps();
    const { actor } = await makeStudent(deps);
    const conv = await createConversation(deps, actor, room("my_crew"));
    const { job } = await sendMessage(deps, actor, conv.id, { body: "What should I do first?" });
    clock.set("2026-10-06T15:01:00.000Z");
    const reply: CrewReply = {
      text: "Open your board first.",
      contributors: ["compass"],
      question: null,
      actionCards: [{ kind: "open_link", id: "open-board", label: "Open the board", href: "/scholarships" }],
      receipt: [],
      safety: null,
      needsInput: false,
    };
    const done = await finishTestJob(deps, SYSTEM, { jobId: job.id, reply, status: "ready" });
    await deps.db
      .insert(actionReceipts)
      .values({ ownerId: actor.userId, messageId: done.resultMessageId as string, cardId: "open-board" });
    const list = await getMessages(deps, actor, conv.id);
    expect(list.map((m) => [m.authorKind, m.appliedCardIds])).toEqual([
      ["user", []],
      ["crew", ["open-board"]],
    ]);
    expect(list[1]?.reply?.actionCards).toHaveLength(1);
  });
});
async function finishTestJob(
  deps: Parameters<typeof completeJob>[0],
  system: Parameters<typeof completeJob>[1],
  input: Omit<Parameters<typeof completeJob>[2], "leaseToken">,
) {
  const claim = await startJob(deps, system, input.jobId, { leaseSeconds: 1200 });
  const [row] = await deps.db
    .select({ leaseToken: crewJobs.leaseToken })
    .from(crewJobs)
    .where(eq(crewJobs.id, input.jobId));
  return (
    await completeJob(deps, system, {
      ...input,
      leaseToken: claim?.leaseToken ?? row?.leaseToken ?? "00000000-0000-4000-8000-000000000099",
    })
  ).job;
}
