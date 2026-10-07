import { TEST_NOW } from "@scholarcrew/core/shared";
import { crewJobs, messages, rateLimits, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { ActionReceipt, Conversation, CrewJob, CrewReply, Message } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  exhaustAllowance,
  params,
  readJson,
  request,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { POST as applyCard } from "../actions/apply/route";
import { GET as getJob } from "../jobs/[id]/route";
import { GET as listJobs } from "../jobs/route";
import { GET as getMessages, POST as sendMessage } from "./[id]/messages/route";
import { POST as createConversation, GET as listConversations } from "./route";

const deps = useTestDeps();

function send(cookie: string, conversationId: string, text: string): Promise<Response> {
  return sendMessage(
    request(`/conversations/${conversationId}/messages`, { method: "POST", cookie, body: { body: text } }),
    params({ id: conversationId }),
  );
}

describe("conversations (CR-01)", () => {
  it("creates and lists rooms and validates the room kind", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await createConversation(
      request("/conversations", { method: "POST", cookie, body: { room: "my_crew" } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(201);
    const conv = await readJson<Conversation>(res);
    expect(conv.room).toBe("my_crew");
    const list = await readJson<Conversation[]>(
      await listConversations(request("/conversations", { cookie }), NO_PARAMS),
    );
    expect(list.map((c) => c.id)).toContain(conv.id);
    const bad = await createConversation(
      request("/conversations", { method: "POST", cookie, body: { room: "lounge" } }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
  });
});

describe("messages (CR-06, CR-10)", () => {
  it("answers a crisis at both limits with a ready job, no queue send, and unchanged usage", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, user.id, { room: "my_crew" });
    await exhaustAllowance(deps().db, user.id);
    await deps()
      .db.insert(rateLimits)
      .values({ key: `crew-send:${user.id}`, windowStart: new Date(TEST_NOW), count: 30 });
    const before = await deps().db.select().from(usageCounters);
    const res = await send(cookie, conv.id, "I want to kill myself");
    expect(res.status).toBe(202);
    const result = await readJson<{ message: Message; job: CrewJob }>(res);
    expect(result.job).toMatchObject({ status: "ready", safety: "crisis" });
    const history = await readJson<Message[]>(
      await getMessages(request(`/conversations/${conv.id}/messages`, { cookie }), params({ id: conv.id })),
    );
    expect(history.find((message) => message.authorKind === "crew")?.body).toContain("988");
    expect(await deps().db.select().from(usageCounters)).toEqual(before);
    expect(deps().jobs.sent).toEqual([]);
  });

  it("sends a message and returns the message and its queued job with 202", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, user.id, { room: "my_crew" });
    const res = await send(cookie, conv.id, "@Scout what's due this week?");
    expect(res.status).toBe(202);
    const { message, job } = await readJson<{ message: Message; job: CrewJob }>(res);
    expect(message).toMatchObject({ authorKind: "user", body: "@Scout what's due this week?" });
    expect(job).toMatchObject({ kind: "crew_request", status: "queued", conversationId: conv.id });
    expect(deps().jobs.sent).toContainEqual({ name: "crew.request", payload: { jobId: job.id } });
    const history = await getMessages(
      request(`/conversations/${conv.id}/messages`, { cookie }),
      params({ id: conv.id }),
    );
    expect((await readJson<Message[]>(history)).map((m) => m.id)).toEqual([message.id]);
    expect((await send(cookie, conv.id, "   ")).status).toBe(400);
  });

  it("hides other students' rooms", async () => {
    const owner = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, owner.user.id, { room: "my_crew" });
    const other = await signedInStudent(deps().db);
    expect((await send(other.cookie, conv.id, "hi")).status).toBe(404);
    const read = await getMessages(
      request(`/conversations/${conv.id}/messages`, { cookie: other.cookie }),
      params({ id: conv.id }),
    );
    expect(read.status).toBe(404);
  });

  it("limits each user to 30 sends per 10 minutes (SE-04)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, user.id, { room: "my_crew" });
    await deps()
      .db.insert(rateLimits)
      .values({ key: `crew-send:${user.id}`, windowStart: new Date(TEST_NOW), count: 30 });
    const limited = await send(cookie, conv.id, "one more");
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe("rate_limited");
  });

  it("answers 402 limit_reached and saves or queues nothing once the crew allowance is used (CR-10)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, user.id, { room: "my_crew" });
    await exhaustAllowance(deps().db, user.id);
    const res = await send(cookie, conv.id, "@Scout anything new?");
    expect(res.status).toBe(402);
    expect((await errorOf(res)).code).toBe("limit_reached");
    expect(deps().jobs.sent).toEqual([]);
    const history = await getMessages(
      request(`/conversations/${conv.id}/messages`, { cookie }),
      params({ id: conv.id }),
    );
    expect(await readJson<Message[]>(history)).toEqual([]);
  });
});

describe("GET /jobs (D28)", () => {
  it("lists the caller's jobs newest first, filters to active ones, and bounds the limit", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const insert = async (ownerId: string, status: CrewJob["status"], at: string): Promise<string> => {
      const [row] = await deps()
        .db.insert(crewJobs)
        .values({ ownerId, kind: "crew_request", status, usageMonth: at.slice(0, 7), createdAt: new Date(at) })
        .returning();
      if (!row) throw new Error("job insert failed");
      return row.id;
    };
    const done = await insert(user.id, "ready", "2026-10-06T13:00:00.000Z");
    const working = await insert(user.id, "working", "2026-10-06T14:00:00.000Z");
    const queued = await insert(user.id, "queued", "2026-10-06T14:30:00.000Z");
    await insert(other.user.id, "queued", "2026-10-06T14:45:00.000Z");
    const ids = async (qs: string) =>
      (await readJson<CrewJob[]>(await listJobs(request(`/jobs${qs}`, { cookie }), NO_PARAMS))).map((j) => j.id);
    expect(await ids("")).toEqual([queued, working, done]);
    expect(await ids("?active=1&limit=10")).toEqual([queued, working]);
    expect(await ids("?limit=1")).toEqual([queued]);
    expect((await listJobs(request("/jobs?limit=51", { cookie }), NO_PARAMS)).status).toBe(400);
    expect((await listJobs(request("/jobs?active=maybe", { cookie }), NO_PARAMS)).status).toBe(400);
    expect((await listJobs(request("/jobs"), NO_PARAMS)).status).toBe(401);
  });
});

describe("GET /jobs/:id", () => {
  it("returns the owner's job and 404 for anyone else", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, user.id, { room: "my_crew" });
    const { job } = await readJson<{ job: CrewJob }>(await send(cookie, conv.id, "hello"));
    const mine = await getJob(request(`/jobs/${job.id}`, { cookie }), params({ id: job.id }));
    expect((await readJson<CrewJob>(mine)).id).toBe(job.id);
    const other = await signedInStudent(deps().db);
    expect((await getJob(request(`/jobs/${job.id}`, { cookie: other.cookie }), params({ id: job.id }))).status).toBe(
      404,
    );
    expect((await getJob(request("/jobs/nope", { cookie }), params({ id: "nope" }))).status).toBe(404);
  });
});

describe("POST /actions/apply (CR-05)", () => {
  it("applies an action card from a crew reply once, for the room's owner only", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const conv = await factories.conversation(deps().db, user.id, { room: "my_crew" });
    const reply: CrewReply = {
      text: "Block 45 minutes for the Rotary essay this week.",
      contributors: ["compass", "quill"],
      question: null,
      actionCards: [
        {
          kind: "add_plan_item",
          id: "plan-1",
          label: "Add to this week",
          item: {
            title: "Draft Rotary essay",
            kind: "essay",
            refType: null,
            refId: null,
            minutes: 45,
            valueUsd: null,
            dueOn: null,
            contributors: ["quill"],
            weekStart: null,
          },
        },
      ],
      receipt: [],
      safety: null,
      needsInput: false,
    };
    const [crewMessage] = await deps()
      .db.insert(messages)
      .values({ conversationId: conv.id, authorKind: "crew", body: reply.text, reply })
      .returning();
    if (!crewMessage) throw new Error("message insert failed");
    const input = { messageId: crewMessage.id, cardId: "plan-1" };
    const res = await applyCard(request("/actions/apply", { method: "POST", cookie, body: input }), NO_PARAMS);
    expect(res.status).toBe(200);
    expect(await readJson<ActionReceipt>(res)).toMatchObject({ messageId: crewMessage.id, cardId: "plan-1" });
    const other = await signedInStudent(deps().db);
    expect(
      (await applyCard(request("/actions/apply", { method: "POST", cookie: other.cookie, body: input }), NO_PARAMS))
        .status,
    ).toBe(404);
    const bad = await applyCard(
      request("/actions/apply", { method: "POST", cookie, body: { messageId: crewMessage.id, cardId: "Bad Card!" } }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
  });
});
