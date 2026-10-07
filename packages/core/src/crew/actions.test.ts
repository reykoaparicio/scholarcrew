import {
  actionReceipts,
  and,
  collegeList,
  decisions,
  eq,
  essays,
  isNull,
  memoryFacts,
  messages,
  planItems,
  scholarshipApplications,
} from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type ActionCard, type CrewReply, systemActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { createCandidate, listFacts } from "../memory";
import { WEEK, makeDeps, makeParentOf, makeStateU, makeStudent, setShare } from "../plan/testkit";
import { applyActionCard, getMessages } from "./index";

type Deps = ReturnType<typeof makeDeps>["deps"];

async function crewMessage(deps: Deps, conversationId: string, cards: ActionCard[]) {
  const reply: CrewReply = {
    text: "Here's what I'd do.",
    contributors: ["compass"],
    question: null,
    actionCards: cards,
    receipt: [],
    safety: null,
    needsInput: false,
  };
  const [row] = await deps.db
    .insert(messages)
    .values({ conversationId, authorKind: "crew", body: reply.text, reply })
    .returning();
  if (!row) throw new Error("message insert failed");
  return row;
}

const planCard: ActionCard = {
  kind: "add_plan_item",
  id: "hill-country",
  label: "Add to my weekend",
  item: {
    title: "Hill Country STEM Award",
    kind: "scholarship",
    refType: "scholarship",
    refId: null,
    minutes: 30,
    valueUsd: 1000,
    dueOn: "2026-10-15",
    contributors: ["scout"],
    weekStart: null,
  },
};
const linkCard: ActionCard = { kind: "open_link", id: "open-board", label: "Open the board", href: "/scholarships" };

describe("applyActionCard", () => {
  it("applies a card once and returns the same receipt after that", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const msg = await crewMessage(deps, conv.id, [planCard, linkCard]);
    const first = await applyActionCard(deps, actor, { messageId: msg.id, cardId: "hill-country" });
    const second = await applyActionCard(deps, actor, { messageId: msg.id, cardId: "hill-country" });
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      messageId: msg.id,
      cardId: "hill-country",
      result: { planItemId: expect.any(String) },
    });
    const items = await deps.db.select().from(planItems).where(eq(planItems.ownerId, user.id));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ weekStart: WEEK, title: "Hill Country STEM Award", contributors: ["scout"] });
    const shown = await getMessages(deps, actor, conv.id);
    expect(shown[0]?.appliedCardIds).toEqual(["hill-country"]);
  });

  it("saves scholarships, adds colleges, starts essays, records decisions, and confirms facts", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const listing = await factories.scholarship(deps.db, { name: "Maple Rotary" });
    const college = await makeStateU(deps);
    const msg = await crewMessage(deps, conv.id, [
      { kind: "save_scholarship", id: "save-rotary", label: "Save it", scholarshipId: listing.id },
      {
        kind: "add_college",
        id: "add-state-u",
        label: "Add State U",
        collegeId: college.id,
        fit: "target",
        plan: "EA",
      },
      {
        kind: "start_essay",
        id: "start-essay",
        label: "Start the essay",
        essay: {
          title: "Rotary essay",
          prompt: "Describe a time you served your community.",
          wordLimit: 500,
          charLimit: null,
          targetType: "scholarship",
          targetCollegeId: null,
          targetScholarshipId: listing.id,
        },
      },
      {
        kind: "record_decision",
        id: "decide",
        label: "Remember this",
        decision: { summary: "Apply EA to State U", rationale: "Merit deadline" },
      },
    ]);
    const more = await crewMessage(deps, conv.id, [
      {
        kind: "confirm_fact",
        id: "fact-major",
        label: "Yes, remember that",
        fact: {
          key: "intended_major",
          value: "mechanical engineering",
          visibility: "crew",
          source: "user_stated",
          sourceRef: null,
        },
      },
      { kind: "add_college", id: "add-again", label: "Add State U", collegeId: college.id, fit: "reach", plan: "RD" },
    ]);
    for (const cardId of ["save-rotary", "add-state-u", "start-essay", "decide"]) {
      await applyActionCard(deps, actor, { messageId: msg.id, cardId });
    }
    const [app] = await deps.db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.ownerId, user.id));
    expect(app).toMatchObject({ scholarshipId: listing.id, stage: "planned" });
    expect(await deps.db.select().from(collegeList).where(eq(collegeList.ownerId, user.id))).toHaveLength(1);
    const [essay] = await deps.db.select().from(essays).where(eq(essays.ownerId, user.id));
    expect(essay?.title).toBe("Rotary essay");
    const [decision] = await deps.db.select().from(decisions).where(eq(decisions.ownerId, user.id));
    expect(decision?.summary).toBe("Apply EA to State U");
    // R2I-12: the decision links back to the chat message that proposed it.
    expect(decision?.sourceMessageId).toBe(msg.id);
    await applyActionCard(deps, actor, { messageId: more.id, cardId: "fact-major" });
    const [fact] = await deps.db.select().from(memoryFacts).where(eq(memoryFacts.ownerId, user.id));
    expect(fact).toMatchObject({ key: "intended_major", value: "mechanical engineering" });
    const again = await applyActionCard(deps, actor, { messageId: more.id, cardId: "add-again" });
    expect(again.result).toEqual({ collegeId: college.id, alreadyListed: true });
  });

  it("hides unknown cards, user messages, and other students' messages", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { actor: other } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const msg = await crewMessage(deps, conv.id, [planCard]);
    const [mine] = await deps.db
      .insert(messages)
      .values({ conversationId: conv.id, authorKind: "user", authorUserId: user.id, body: "hi" })
      .returning();
    await expect(applyActionCard(deps, actor, { messageId: msg.id, cardId: "nope" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      applyActionCard(deps, actor, { messageId: mine?.id as string, cardId: "hill-country" }),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(applyActionCard(deps, other, { messageId: msg.id, cardId: "hill-country" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(applyActionCard(deps, actor, { messageId: msg.id, cardId: "Bad Id!" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("lets only the student apply family-room cards other than links", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { family, actor: parent } = await makeParentOf(deps, user.id);
    const room = await factories.conversation(deps.db, user.id, { room: "family", familyId: family.id });
    const msg = await crewMessage(deps, room.id, [planCard, linkCard]);
    await expect(applyActionCard(deps, parent, { messageId: msg.id, cardId: "hill-country" })).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await applyActionCard(deps, parent, { messageId: msg.id, cardId: "open-board" })).result).toEqual({
      href: "/scholarships",
    });
    expect((await applyActionCard(deps, actor, { messageId: msg.id, cardId: "hill-country" })).cardId).toBe(
      "hill-country",
    );
    expect(await deps.db.select().from(planItems).where(eq(planItems.ownerId, user.id))).toHaveLength(1);
  });

  it("hides action links and existing receipts after a parent share is revoked", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { family, actor: parent } = await makeParentOf(deps, user.id);
    const room = await factories.conversation(deps.db, user.id, { room: "family", familyId: family.id });
    const msg = await crewMessage(deps, room.id, [linkCard]);
    await deps.db
      .update(messages)
      .set({ sharedCategories: ["costs"] })
      .where(eq(messages.id, msg.id));
    await applyActionCard(deps, parent, { messageId: msg.id, cardId: linkCard.id });
    await setShare(deps, user.id, "costs", false);
    expect((await getMessages(deps, parent, room.id))[0]?.reply?.actionCards).toEqual([]);
    await expect(applyActionCard(deps, parent, { messageId: msg.id, cardId: linkCard.id })).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await applyActionCard(deps, actor, { messageId: msg.id, cardId: linkCard.id })).result).toEqual({
      href: "/scholarships",
    });
  });

  it("claims the receipt first, so concurrent applies run the card once (R2C-3)", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const msg = await crewMessage(deps, conv.id, [planCard]);
    const input = { messageId: msg.id, cardId: "hill-country" };
    const results = await Promise.allSettled([
      applyActionCard(deps, actor, input),
      applyActionCard(deps, actor, input),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "conflict" });
      else expect(r.value.result).toMatchObject({ planItemId: expect.any(String) });
    }
    expect(await deps.db.select().from(planItems).where(eq(planItems.ownerId, user.id))).toHaveLength(1);
    expect(await deps.db.select().from(actionReceipts).where(eq(actionReceipts.messageId, msg.id))).toHaveLength(1);
  });

  it("reports a fresh claim as a conflict, returns a stale one, and drops the claim when a card fails", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const missing: ActionCard = {
      kind: "save_scholarship",
      id: "save-missing",
      label: "Save it",
      scholarshipId: "00000000-0000-4000-8000-000000000000",
    };
    const msg = await crewMessage(deps, conv.id, [planCard, missing]);
    await expect(applyActionCard(deps, actor, { messageId: msg.id, cardId: "save-missing" })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await deps.db.select().from(actionReceipts).where(eq(actionReceipts.messageId, msg.id))).toEqual([]);
    const now = deps.clock.now();
    await deps.db.insert(actionReceipts).values({
      ownerId: user.id,
      messageId: msg.id,
      cardId: "hill-country",
      appliedAt: now,
      result: { pending: true },
    });
    await expect(applyActionCard(deps, actor, { messageId: msg.id, cardId: "hill-country" })).rejects.toMatchObject({
      code: "conflict",
    });
    await deps.db
      .update(actionReceipts)
      .set({ appliedAt: new Date(now.getTime() - 61_000) })
      .where(eq(actionReceipts.messageId, msg.id));
    expect((await applyActionCard(deps, actor, { messageId: msg.id, cardId: "hill-country" })).result).toEqual({
      pending: true,
    });
    expect(await deps.db.select().from(planItems).where(eq(planItems.ownerId, user.id))).toEqual([]);
  });

  it("refuses fact and decision cards in a temporary chat (R2C-9)", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const temp = await factories.conversation(deps.db, user.id, {
      room: "temporary",
      expiresAt: new Date(deps.clock.now().getTime() + 86_400_000),
    });
    const msg = await crewMessage(deps, temp.id, [
      planCard,
      {
        kind: "record_decision",
        id: "decide",
        label: "Remember this",
        decision: { summary: "Apply EA", rationale: "" },
      },
      {
        kind: "confirm_fact",
        id: "fact-major",
        label: "Yes, remember that",
        fact: { key: "intended_major", value: "nursing", visibility: "crew", source: "user_stated", sourceRef: null },
      },
    ]);
    for (const cardId of ["decide", "fact-major"]) {
      await expect(applyActionCard(deps, actor, { messageId: msg.id, cardId })).rejects.toMatchObject({
        code: "invalid_input",
        message: "Temporary chats don't save memory",
      });
    }
    expect(await deps.db.select().from(decisions).where(eq(decisions.ownerId, user.id))).toEqual([]);
    expect(await deps.db.select().from(memoryFacts).where(eq(memoryFacts.ownerId, user.id))).toEqual([]);
    expect(await deps.db.select().from(actionReceipts).where(eq(actionReceipts.messageId, msg.id))).toEqual([]);
    expect((await applyActionCard(deps, actor, { messageId: msg.id, cardId: "hill-country" })).cardId).toBe(
      "hill-country",
    );
  });

  it("clears the matching memory candidate when a confirm_fact card is applied (R2C-2)", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const fact = {
      key: "intended_major",
      value: "mechanical engineering",
      visibility: "crew" as const,
      sourceRef: null,
    };
    await createCandidate(deps, systemActor("test"), user.id, { ...fact, source: "crew_inferred" });
    const msg = await crewMessage(deps, conv.id, [
      { kind: "confirm_fact", id: "fact-major", label: "Yes, remember that", fact: { ...fact, source: "user_stated" } },
    ]);
    await applyActionCard(deps, actor, { messageId: msg.id, cardId: "fact-major" });
    const live = await deps.db
      .select()
      .from(memoryFacts)
      .where(
        and(eq(memoryFacts.ownerId, user.id), eq(memoryFacts.status, "candidate"), isNull(memoryFacts.supersededById)),
      );
    expect(live).toEqual([]);
    expect((await listFacts(deps, actor, user.id)).map((f) => f.status)).toEqual(["confirmed"]);
  });
});
