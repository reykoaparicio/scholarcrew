import {
  agentRuns,
  and,
  conversations,
  crewJobs,
  eq,
  familyMembers,
  messages,
  notifications,
  usageCounters,
} from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type CrewJob, type CrewReply, systemActor, userActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { NOW, makeDeps, makeParentOf, makeStudent } from "../plan/testkit";
import {
  appendProgress,
  completeJob,
  createJob,
  getJob,
  insertJob,
  listJobs,
  reapStaleJobs,
  recordAgentRun,
  startJob,
} from "./jobs";

const SYSTEM = systemActor("test");
const reply: CrewReply = {
  text: "Start with the Hill Country STEM Award.",
  contributors: ["compass", "scout"],
  question: null,
  actionCards: [],
  receipt: [],
  safety: null,
  needsInput: false,
};

describe("crew jobs", () => {
  it("claims one live lease and posts and charges once under concurrent completion", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const job = await createJob(deps, actor, { kind: "weekly_plan" });
    const claim = await startJob(deps, SYSTEM, job.id, { leaseSeconds: 1200 });
    if (!claim) throw new Error("expected lease");
    expect(await startJob(deps, SYSTEM, job.id, { leaseSeconds: 1200 })).toBeNull();
    const input = {
      jobId: job.id,
      leaseToken: claim.leaseToken,
      reply,
      status: "ready" as const,
      usage: { costMicros: 100, crewRequest: true },
    };
    const results = await Promise.all([completeJob(deps, SYSTEM, input), completeJob(deps, SYSTEM, input)]);
    expect(results.filter((result) => result.completed)).toHaveLength(1);
    expect(
      await deps.db
        .select()
        .from(messages)
        .where(eq(messages.id, results[0]?.job.resultMessageId as string)),
    ).toHaveLength(1);
    const [usage] = await deps.db.select().from(usageCounters).where(eq(usageCounters.userId, user.id));
    expect(usage).toMatchObject({ crewRequests: 1, costMicros: 100 });
  });

  it("rejects a superseded lease token and reaps an expired live attempt", async () => {
    const { deps, clock } = makeDeps();
    const { actor } = await makeStudent(deps);
    const job = await createJob(deps, actor, { kind: "weekly_plan" });
    const first = await startJob(deps, SYSTEM, job.id, { leaseSeconds: 1 });
    clock.set(new Date(deps.clock.now().getTime() + 2000).toISOString());
    const second = await startJob(deps, SYSTEM, job.id, { leaseSeconds: 1 });
    if (!first || !second) throw new Error("expected leases");
    expect(second.leaseToken).not.toBe(first.leaseToken);
    expect(
      await completeJob(deps, SYSTEM, { jobId: job.id, leaseToken: first.leaseToken, reply, status: "ready" }),
    ).toMatchObject({ completed: false });
    clock.set(new Date(deps.clock.now().getTime() + 11 * 60_000).toISOString());
    expect(await reapStaleJobs(deps, SYSTEM)).toMatchObject({ jobs: 1 });
    expect(await getJob(deps, actor, job.id)).toMatchObject({ status: "failed" });
  });

  it("creates a queued job the owner can read and others can't", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { actor: other } = await makeStudent(deps);
    const { actor: parent } = await makeParentOf(deps, user.id);
    const job = await createJob(deps, actor, { kind: "essay_review", refId: "essay-1" });
    expect(job).toMatchObject({
      kind: "essay_review",
      status: "queued",
      refId: "essay-1",
      conversationId: null,
      progress: [],
    });
    expect((await getJob(deps, actor, job.id)).id).toBe(job.id);
    expect((await getJob(deps, SYSTEM, job.id)).id).toBe(job.id);
    await expect(getJob(deps, other, job.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getJob(deps, parent, job.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getJob(deps, actor, "nope")).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses a conversation the actor doesn't own", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    const { user: other } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, other.id);
    await expect(createJob(deps, actor, { kind: "crew_request", conversationId: conv.id })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("starts only queued jobs and appends progress in order", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    const job = await createJob(deps, actor, { kind: "essay_review", refId: "essay-1" });
    await expect(startJob(deps, actor, job.id, { leaseSeconds: 1200 })).rejects.toMatchObject({ code: "forbidden" });
    expect((await startJob(deps, SYSTEM, job.id, { leaseSeconds: 1200 }))?.job.status).toBe("working");
    await appendProgress(deps, SYSTEM, job.id, { at: NOW, role: "compass", text: "Reading your plan" });
    await appendProgress(deps, SYSTEM, job.id, { at: NOW, role: "quill", text: "Reading your draft" });
    expect((await getJob(deps, actor, job.id)).progress.map((p) => p.role)).toEqual(["compass", "quill"]);
    await finishTestJob(deps, SYSTEM, { jobId: job.id, reply: null, status: "failed", error: "timeout" });
    const failed = await startJob(deps, SYSTEM, job.id, { leaseSeconds: 1200 });
    expect(failed).toBeNull();
  });

  it("completes a crew request with a crew message and no notification", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const conv = await factories.conversation(deps.db, user.id);
    const job = await createJob(deps, actor, { kind: "crew_request", conversationId: conv.id });
    const done = await finishTestJob(deps, SYSTEM, { jobId: job.id, reply, status: "ready" });
    expect(done.status).toBe("ready");
    const rows = await deps.db.select().from(messages).where(eq(messages.conversationId, conv.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ authorKind: "crew", authorUserId: null, body: reply.text, reply });
    expect(done.resultMessageId).toBe(rows[0]?.id);
    expect(await deps.db.select().from(notifications)).toHaveLength(0);
    const retried = await finishTestJob(deps, SYSTEM, { jobId: job.id, reply, status: "ready" });
    expect(retried.resultMessageId).toBe(done.resultMessageId);
    expect(await deps.db.select().from(messages).where(eq(messages.conversationId, conv.id))).toHaveLength(1);
  });

  it("files a room-less reply in a new conversation and notifies once per job", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const job = await createJob(deps, actor, { kind: "appeal_outline", refId: "offer-1" });
    const done = await finishTestJob(deps, SYSTEM, { jobId: job.id, reply, status: "ready" });
    const [conv] = await deps.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, done.conversationId as string));
    expect(conv).toMatchObject({ ownerId: user.id, room: "my_crew", title: "Appeal outline" });
    await finishTestJob(deps, SYSTEM, { jobId: job.id, reply: null, status: "ready" });
    const sent = await deps.db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(sent).toHaveLength(1);
    // R2P-9: the outline lives in the conversation, not on the offer page.
    expect(sent[0]).toMatchObject({ kind: "job_ready", dedupeKey: `job:${job.id}`, link: `/crew/${conv?.id}` });
  });

  it("links a retake notice to its conversation and falls back to /prep without one", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const ok = await createJob(deps, actor, { kind: "retake_analysis" });
    const done = await finishTestJob(deps, SYSTEM, { jobId: ok.id, reply, status: "ready" });
    const failed = await createJob(deps, actor, { kind: "retake_analysis" });
    await finishTestJob(deps, SYSTEM, { jobId: failed.id, reply: null, status: "failed", error: "timeout" });
    const essay = await createJob(deps, actor, { kind: "essay_review", refId: "essay-1" });
    await finishTestJob(deps, SYSTEM, { jobId: essay.id, reply, status: "ready" });
    const links = Object.fromEntries(
      (await deps.db.select().from(notifications).where(eq(notifications.userId, user.id))).map((n) => [
        n.dedupeKey,
        n.link,
      ]),
    );
    expect(links[`job:${ok.id}`]).toBe(`/crew/${done.conversationId}`);
    expect(links[`job:${failed.id}`]).toBe("/prep");
    expect(links[`job:${essay.id}`]).toBe("/essays/essay-1");
  });

  it("reuses the newest live room titled for the job kind (R2C-14)", async () => {
    const { deps, clock } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const first = await createJob(deps, actor, { kind: "weekly_plan" });
    const a = await finishTestJob(deps, SYSTEM, { jobId: first.id, reply, status: "ready" });
    clock.set("2026-10-13T15:00:00.000Z");
    const second = await createJob(deps, actor, { kind: "weekly_plan" });
    const b = await finishTestJob(deps, SYSTEM, { jobId: second.id, reply, status: "ready" });
    expect(b.conversationId).toBe(a.conversationId);
    expect(
      await deps.db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, a.conversationId as string)),
    ).toHaveLength(2);
    const review = await createJob(deps, actor, { kind: "essay_review", refId: "essay-1" });
    const c = await finishTestJob(deps, SYSTEM, { jobId: review.id, reply, status: "ready" });
    expect(c.conversationId).not.toBe(a.conversationId);
    await deps.db
      .update(conversations)
      .set({ archivedAt: new Date("2026-10-13T16:00:00.000Z") })
      .where(eq(conversations.id, a.conversationId as string));
    const third = await createJob(deps, actor, { kind: "weekly_plan" });
    const d = await finishTestJob(deps, SYSTEM, { jobId: third.id, reply, status: "ready" });
    expect(d.conversationId).not.toBe(a.conversationId);
    const rooms = await deps.db.select().from(conversations).where(eq(conversations.ownerId, user.id));
    expect(rooms.filter((r) => r.title === "Weekly plan")).toHaveLength(2);
  });

  it("records agent runs and adds their cost to the job", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const job = await createJob(deps, actor, { kind: "weekly_plan" });
    const run = {
      jobId: job.id,
      userId: user.id,
      role: "compass",
      model: "claude-opus-5-5",
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 500,
      cacheWriteTokens: 0,
      stopReason: "tool_use",
      costMicros: 8100,
      durationMs: 1200,
    };
    await recordAgentRun(deps, SYSTEM, run);
    await recordAgentRun(deps, SYSTEM, { ...run, role: "scout", costMicros: 900 });
    expect(await deps.db.select().from(agentRuns).where(eq(agentRuns.jobId, job.id))).toHaveLength(2);
    const [row] = await deps.db.select().from(crewJobs).where(eq(crewJobs.id, job.id));
    expect(row?.costMicros).toBe(9000);
    await expect(recordAgentRun(deps, actor, run)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("lets family members read family-room jobs", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { family, actor: parent } = await makeParentOf(deps, user.id);
    const outsider = userActor((await factories.parent(deps.db)).id, "parent");
    const conv = await factories.conversation(deps.db, user.id, { room: "family", familyId: family.id });
    const job = await createJob(deps, actor, { kind: "crew_request", conversationId: conv.id });
    expect((await getJob(deps, parent, job.id)).id).toBe(job.id);
    await expect(getJob(deps, outsider, job.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("lists the actor's own jobs newest first, with an active filter and a capped limit", async () => {
    const { deps, clock } = makeDeps();
    const { actor } = await makeStudent(deps);
    const { actor: other } = await makeStudent(deps);
    const done = await createJob(deps, actor, { kind: "weekly_plan" });
    await finishTestJob(deps, SYSTEM, { jobId: done.id, reply: null, status: "ready" });
    clock.set("2026-10-06T15:01:00.000Z");
    const working = await createJob(deps, actor, { kind: "essay_review", refId: "essay-1" });
    await startJob(deps, SYSTEM, working.id, { leaseSeconds: 1200 });
    clock.set("2026-10-06T15:02:00.000Z");
    const queued = await createJob(deps, actor, { kind: "retake_analysis" });
    await createJob(deps, other, { kind: "weekly_plan" });
    const ids = (jobs: CrewJob[]) => jobs.map((j) => j.id);
    expect(ids(await listJobs(deps, actor))).toEqual([queued.id, working.id, done.id]);
    expect(ids(await listJobs(deps, actor, { active: true }))).toEqual([queued.id, working.id]);
    expect(ids(await listJobs(deps, actor, { limit: 1 }))).toEqual([queued.id]);
    expect(await listJobs(deps, actor, { limit: 0 })).toHaveLength(1);
    expect(await listJobs(deps, actor, { limit: 500 })).toHaveLength(3);
    await expect(listJobs(deps, SYSTEM)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("lists a parent's family-room requests until the parent leaves (R2C-11)", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { parent, family, actor: parentActor } = await makeParentOf(deps, user.id);
    const conv = await factories.conversation(deps.db, user.id, { room: "family", familyId: family.id });
    const [asked] = await deps.db
      .insert(messages)
      .values({ conversationId: conv.id, authorKind: "user", authorUserId: parent.id, body: "How are things going?" })
      .returning();
    const [studentAsked] = await deps.db
      .insert(messages)
      .values({ conversationId: conv.id, authorKind: "user", authorUserId: user.id, body: "What's next?" })
      .returning();
    const now = deps.clock.now();
    const parentJob = await insertJob(deps.db, {
      ownerId: user.id,
      kind: "crew_request",
      conversationId: conv.id,
      requestMessageId: asked?.id ?? null,
      now,
    });
    const studentJob = await insertJob(deps.db, {
      ownerId: user.id,
      kind: "crew_request",
      conversationId: conv.id,
      requestMessageId: studentAsked?.id ?? null,
      now,
    });
    expect((await listJobs(deps, parentActor, { active: true })).map((j) => j.id)).toEqual([parentJob.id]);
    expect((await listJobs(deps, actor)).map((j) => j.id).sort()).toEqual([parentJob.id, studentJob.id].sort());
    await deps.db
      .delete(familyMembers)
      .where(and(eq(familyMembers.familyId, family.id), eq(familyMembers.userId, parent.id)));
    expect(await listJobs(deps, parentActor, { active: true })).toEqual([]);
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
