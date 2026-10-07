import {
  and,
  auditEvents,
  blobs,
  conversations,
  crewJobs,
  documents,
  eq,
  exportsTable,
  families,
  familyInvites,
  familyTasks,
  magicLinks,
  memoryFacts,
  messages,
  rateLimits,
  sessions,
  subscriptions,
  users,
} from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf, latestEmail, tokenIn } from "../../test/helpers";
import { createApiToken, resolveApiToken } from "../apitokens";
import { getSessionUser, requestMagicLink, verifyMagicLink } from "../auth";
import { sha256Hex } from "../crypto";
import { putBlob, readDocumentBytes, uploadDocument } from "../documents";
import { getFamily } from "../family";
import { createHelperLink, resolveHelperToken } from "../helpers";
import { createFact } from "../memory";
import { completeOnboarding, getMe } from "../profile";
import { type FakeStripeGateway, addDays, addMinutes, createTestDeps, fixedClock, one } from "../shared";
import { deleteAccount, purgeDeletedAccounts, purgeExpired } from "./index";

const pdf = {
  kind: "transcript" as const,
  filename: "t.pdf",
  mime: "application/pdf",
  bytes: Buffer.from("%PDF-1.7 x"),
};

describe("deleteAccount", () => {
  it("ends access at once, and the family goes with its only student", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    const family = await factories.family(deps.db, { studentIds: [user.id], parentIds: [parent.id] });
    await deps.db
      .insert(sessions)
      .values({ userId: user.id, tokenHash: sha256Hex("tok"), expiresAt: addDays(deps.clock.now(), 30) });
    const api = await createApiToken(deps, actorOf(user), { label: "Laptop", scopes: ["autofill"] });
    const link = await createHelperLink(deps, actorOf(user), {
      label: "Ms. Ortiz",
      helperRole: "recommender",
      scope: ["activities"],
      expiresInDays: 30,
    });
    await factories.conversation(deps.db, user.id, { room: "family", familyId: family.id });
    await deleteAccount(deps, actorOf(user));
    expect(await getSessionUser(deps, "tok")).toBeNull();
    expect(await resolveApiToken(deps, api.secret)).toBeNull();
    expect(await resolveHelperToken(deps, link.url.slice(link.url.lastIndexOf("/") + 1))).toBeNull();
    await expect(getMe(deps, actorOf(user))).rejects.toMatchObject({ code: "unauthenticated" });
    expect(await getFamily(deps, actorOf(parent))).toBeNull();
    expect(await deps.db.select().from(families).where(eq(families.id, family.id))).toHaveLength(0);
    expect(await deps.db.select().from(conversations).where(eq(conversations.ownerId, user.id))).toHaveLength(0);
    const [row] = await deps.db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ status: "deleted", deletedAt: new Date("2026-10-06T15:00:00.000Z") });
    expect((deps.stripe as FakeStripeGateway).canceled).toEqual([]);
  });

  it("removes a parent's family-room messages, the crew replies, jobs, tasks, and open invites (R2I-4)", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    const room = await factories.conversation(deps.db, student.id, { room: "family", familyId: family.id });
    const say = async (authorUserId: string | null, body: string) =>
      one(
        await deps.db
          .insert(messages)
          .values({ conversationId: room.id, authorKind: authorUserId ? "user" : "crew", authorUserId, body })
          .returning(),
        "messages insert",
      );
    const studentAsk = await say(student.id, "What's due this week?");
    const parentAsk = await say(parent.id, "How are things going?");
    const crewReply = await say(null, "Two essays and the FAFSA.");
    await deps.db.insert(crewJobs).values([
      {
        ownerId: student.id,
        usageMonth: "2026-10",
        kind: "crew_request",
        status: "ready",
        conversationId: room.id,
        requestMessageId: parentAsk.id,
        resultMessageId: crewReply.id,
      },
      {
        ownerId: student.id,
        usageMonth: "2026-10",
        kind: "crew_request",
        status: "queued",
        conversationId: room.id,
        requestMessageId: studentAsk.id,
      },
    ]);
    await deps.db.insert(familyTasks).values([
      {
        familyId: family.id,
        assigneeId: parent.id,
        studentId: student.id,
        kind: "share_budget",
        title: "Share a yearly budget for college",
      },
      {
        familyId: family.id,
        assigneeId: student.id,
        studentId: student.id,
        kind: "custom",
        title: "Ask about the FAFSA",
      },
    ]);
    await deps.db.insert(familyInvites).values({
      familyId: family.id,
      email: "grandma@example.test",
      memberRole: "parent",
      invitedById: parent.id,
      tokenHash: sha256Hex("open-invite"),
      expiresAt: addDays(deps.clock.now(), 7),
    });
    await deleteAccount(deps, actorOf(parent));
    const left = await deps.db.select().from(messages).where(eq(messages.conversationId, room.id));
    expect(left.map((m) => m.id)).toEqual([studentAsk.id]);
    expect((await deps.db.select().from(crewJobs)).map((j) => j.requestMessageId)).toEqual([studentAsk.id]);
    expect((await deps.db.select().from(familyTasks)).map((t) => t.title)).toEqual(["Ask about the FAFSA"]);
    expect(await deps.db.select().from(familyInvites)).toEqual([]);
    expect((await getFamily(deps, actorOf(student)))?.members.map((m) => m.userId)).toEqual([student.id]);
  });

  it("cancels an active Stripe subscription and records it in the audit log", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await deps.db.insert(subscriptions).values({
      ownerId: parent.id,
      plan: "family",
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
    const gateway = deps.stripe;
    deps.stripe = null;
    await expect(deleteAccount(deps, actorOf(parent))).rejects.toThrow("Stripe gateway required");
    expect((await deps.db.select().from(users).where(eq(users.id, parent.id)))[0]?.status).toBe("active");
    expect((await deps.db.select().from(subscriptions).where(eq(subscriptions.ownerId, parent.id)))[0]?.status).toBe(
      "active",
    );
    deps.stripe = gateway;
    await deleteAccount(deps, actorOf(parent));
    expect((deps.stripe as FakeStripeGateway).canceled).toEqual(["sub_1"]);
    const [sub] = await deps.db.select().from(subscriptions).where(eq(subscriptions.ownerId, parent.id));
    expect(sub?.status).toBe("canceled");
    const audit = await deps.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "subscription_canceled"), eq(auditEvents.entityId, sub?.id ?? "")));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.meta).toEqual({ stripeSubscriptionId: "sub_1" });
  });

  it("can't be signed into again", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db, { email: "maya@example.test" });
    await deleteAccount(deps, actorOf(user));
    await requestMagicLink(deps, { email: "maya@example.test", ip: "203.0.113.9" });
    const token = tokenIn((await latestEmail(deps.db, "maya@example.test")).text);
    await expect(verifyMagicLink(deps, { token, userAgent: "" })).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

describe("purges", () => {
  it("hard-deletes accounts 6 days after deletion, so the daily run finishes within 7, with their rows and blobs", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user: gone } = await factories.student(deps.db);
    const { user: kept } = await factories.student(deps.db);
    await createFact(deps, actorOf(gone), {
      key: "county",
      value: "Maple",
      visibility: "crew",
      source: "user_stated",
      sourceRef: null,
    });
    await uploadDocument(deps, actorOf(gone), pdf);
    const keptDoc = await uploadDocument(deps, actorOf(kept), pdf);
    await deleteAccount(deps, actorOf(gone));
    clock.set("2026-10-11T15:00:00.000Z");
    expect(await purgeDeletedAccounts(deps, SYSTEM)).toBe(0);
    clock.set("2026-10-12T15:01:00.000Z");
    expect(await purgeDeletedAccounts(deps, SYSTEM)).toBe(1);
    expect(await deps.db.select().from(users).where(eq(users.id, gone.id))).toHaveLength(0);
    expect(await deps.db.select().from(memoryFacts).where(eq(memoryFacts.ownerId, gone.id))).toHaveLength(0);
    expect((await deps.db.select().from(documents)).map((d) => d.ownerId)).toEqual([kept.id]);
    expect(await deps.db.select().from(blobs)).toHaveLength(1);
    expect((await readDocumentBytes(deps, actorOf(kept), keptDoc.id)).bytes.toString()).toBe("%PDF-1.7 x");
  });

  it("purges a blocked under-13 account on the same schedule and keeps nothing (R2I-17)", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const kid = await factories.user(deps.db, { email: "kid@example.test" });
    await requestMagicLink(deps, { email: "kid@example.test", ip: "203.0.113.9" });
    await expect(
      completeOnboarding(deps, actorOf(kid), {
        displayName: "Kid",
        birthYear: 2015,
        classYear: 2033,
        highSchool: "Maple Middle School",
        state: "TX",
        county: "Maple",
        city: "Cedar Falls",
        gpaUnweighted: null,
        intendedMajors: [],
        interests: [],
        timeZone: "America/Chicago",
        collegeIds: [],
        sensitive: [],
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    clock.set("2026-10-11T15:00:00.000Z");
    expect(await purgeDeletedAccounts(deps, SYSTEM)).toBe(0);
    clock.set("2026-10-12T15:01:00.000Z");
    expect(await purgeDeletedAccounts(deps, SYSTEM)).toBe(1);
    expect(await deps.db.select().from(users).where(eq(users.email, "kid@example.test"))).toHaveLength(0);
    expect(await deps.db.select().from(rateLimits).where(eq(rateLimits.key, "ml:email:kid@example.test"))).toEqual([]);
    expect(await deps.db.select().from(magicLinks).where(eq(magicLinks.email, "kid@example.test"))).toEqual([]);
  });

  it("removes old magic links, expired temporary chats, expired exports, and expired sessions", async () => {
    const deps = createTestDeps();
    const now = deps.clock.now();
    const { user } = await factories.student(deps.db);
    await deps.db.insert(magicLinks).values([
      { email: "a@example.test", tokenHash: "h1", createdAt: addDays(now, -2), expiresAt: addDays(now, -2) },
      { email: "b@example.test", tokenHash: "h2", createdAt: now, expiresAt: addMinutes(now, 15) },
    ]);
    await factories.conversation(deps.db, user.id, { room: "temporary", expiresAt: addMinutes(now, -60) });
    await factories.conversation(deps.db, user.id, { room: "temporary", expiresAt: addMinutes(now, 60) });
    await factories.conversation(deps.db, user.id, { room: "my_crew" });
    const oldBlob = await putBlob(deps, Buffer.from("old export"));
    const newBlob = await putBlob(deps, Buffer.from("new export"));
    await deps.db.insert(exportsTable).values([
      { userId: user.id, status: "ready", blobId: oldBlob, expiresAt: addMinutes(now, -60) },
      { userId: user.id, status: "ready", blobId: newBlob, expiresAt: addMinutes(now, 60) },
    ]);
    await deps.db.insert(sessions).values([
      { userId: user.id, tokenHash: "s1", expiresAt: addMinutes(now, -1) },
      { userId: user.id, tokenHash: "s2", expiresAt: addDays(now, 30) },
    ]);
    expect(await purgeExpired(deps, SYSTEM)).toEqual({ magicLinks: 1, temporaryChats: 1, exports: 1, sessions: 1 });
    expect((await deps.db.select().from(blobs)).map((b) => b.id)).toEqual([newBlob]);
    expect(await deps.db.select().from(conversations)).toHaveLength(2);
  });

  it("is system-only", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(purgeDeletedAccounts(deps, actorOf(user))).rejects.toMatchObject({ code: "forbidden" });
    await expect(purgeExpired(deps, actorOf(user))).rejects.toMatchObject({ code: "forbidden" });
  });
});
