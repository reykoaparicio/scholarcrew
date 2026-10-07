import type { ModelClient, ModelRequest } from "@scholarcrew/agents";
import { createScriptedModelClient } from "@scholarcrew/agents/testing";
import { createConversation, createJob, getJob, getMessages, sendMessage } from "@scholarcrew/core/crew";
import { createFact } from "@scholarcrew/core/memory";
import { saveScholarship } from "@scholarcrew/core/scholarships";
import { agentRuns, eq, memoryFacts, usageCounters, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { AppError, type CrewReply, type UserActor, userActor } from "@scholarcrew/domain";
import { describe, expect, it, vi } from "vitest";
import { SYSTEM, failingModel, makeStudent, makeWorkerDeps } from "../../test/helpers";
import { createDemoModelClient } from "../demo-model";
import { MISSING_MESSAGE_TEXT, handleCrewRequest } from "./crew-request";
import { FAILED_TEXT } from "./shared";

/** R2C-15: lets one test make completeJob fail once, the way a dropped DB connection would. */
const completeFailures = vi.hoisted(() => ({ remaining: 0 }));
vi.mock("@scholarcrew/core/crew", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scholarcrew/core/crew")>();
  return {
    ...actual,
    completeJob: async (...args: Parameters<typeof actual.completeJob>) => {
      if (completeFailures.remaining > 0) {
        completeFailures.remaining -= 1;
        throw new Error("completeJob failed");
      }
      return actual.completeJob(...args);
    },
  };
});

const REFUSAL = "I can't help with that one, but I'm happy to keep working on your plan.";

const MAJOR_REPLY: CrewReply = {
  text: "Got it. Physics it is.",
  contributors: ["compass"],
  question: null,
  actionCards: [
    {
      kind: "confirm_fact",
      id: "major",
      label: "Remember your major",
      fact: { key: "intended_major", value: "Physics", visibility: "crew", source: "user_stated", sourceRef: null },
    },
  ],
  receipt: [],
  safety: null,
  needsInput: false,
};

function textsOf(req: ModelRequest): string {
  const out: string[] = [];
  for (const m of req.messages) {
    if (typeof m.content === "string") out.push(m.content);
    else for (const b of m.content) if (b.type === "text") out.push(b.text);
  }
  return out.join("\n");
}

/** The demo model, plus the user-message text of every turn request it saw. */
function capturingDemo(): { model: ModelClient; seen: string[] } {
  const demo = createDemoModelClient();
  const seen: string[] = [];
  return {
    seen,
    model: {
      async turn(req) {
        seen.push(textsOf(req));
        return demo.turn(req);
      },
      extract: demo.extract,
    },
  };
}

async function setup(model?: ModelClient) {
  const ctx = makeWorkerDeps(model ? { model } : {});
  const student = await makeStudent(ctx.core.db);
  const listing = await factories.scholarship(ctx.core.db, { name: "Maple County STEM Award", deadline: "2026-10-20" });
  await saveScholarship(ctx.core, student.actor, { scholarshipId: listing.id });
  const room = await createConversation(ctx.core, student.actor, {
    room: "my_crew",
    roomRefId: null,
    familyId: null,
    title: "",
  });
  const send = (body: string, actor: UserActor = student.actor, conversationId = room.id) =>
    sendMessage(ctx.core, actor, conversationId, { body });
  return { ...ctx, ...student, room, send };
}

async function usageOf(s: Awaited<ReturnType<typeof setup>>, userId: string) {
  const [row] = await s.core.db.select().from(usageCounters).where(eq(usageCounters.userId, userId));
  return row ? { crewRequests: row.crewRequests, costMicros: row.costMicros } : null;
}

describe("crew.request", () => {
  it("runs Compass end to end with the demo model and saves the reply", async () => {
    const s = await setup();
    const { job } = await s.send("What should I do first?");
    await handleCrewRequest(s.deps, { jobId: job.id });
    const done = await getJob(s.core, SYSTEM, job.id);
    expect(done).toMatchObject({ status: "ready", safety: null, error: null });
    expect(done.progress.map((p) => p.text)).toContain("Compass is reading your request.");
    const last = (await getMessages(s.core, s.actor, s.room.id)).at(-1);
    expect(last?.authorKind).toBe("crew");
    expect(last?.id).toBe(done.resultMessageId);
    expect(last?.reply?.contributors).toEqual(["compass"]);
    expect(last?.reply?.text).toContain("Maple County STEM Award");
    expect(last?.reply?.actionCards).toHaveLength(1);
    const runs = await s.core.db.select().from(agentRuns).where(eq(agentRuns.jobId, job.id));
    expect(runs.map((r) => r.role)).toEqual(["compass"]);
    expect(await usageOf(s, s.user.id)).toEqual({ crewRequests: 1, costMicros: runs[0]?.costMicros });
  });

  it("answers a crisis message with the crisis reply and no model call (CR-09)", async () => {
    const model = createScriptedModelClient([]);
    const s = await setup(model);
    const { job } = await s.send("I want to end my life");
    await handleCrewRequest(s.deps, { jobId: job.id });
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "ready", safety: "crisis" });
    const last = (await getMessages(s.core, s.actor, s.room.id)).at(-1);
    expect(last?.reply?.text).toContain("988");
    expect(model.requests).toHaveLength(0);
    expect(await s.core.db.select().from(agentRuns).where(eq(agentRuns.jobId, job.id))).toEqual([]);
  });

  it("turns a refusal into the polite reply and logs the turn (CR-11)", async () => {
    const s = await setup(createScriptedModelClient([{ stopReason: "refusal" }]));
    const { job } = await s.send("Write my essay for me");
    await handleCrewRequest(s.deps, { jobId: job.id });
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "ready", safety: "refusal" });
    expect((await getMessages(s.core, s.actor, s.room.id)).at(-1)?.reply?.text).toBe(REFUSAL);
    const runs = await s.core.db.select().from(agentRuns).where(eq(agentRuns.jobId, job.id));
    expect(runs.map((r) => r.stopReason)).toEqual(["refusal"]);
  });

  it("sends earlier messages as history and passes mentions", async () => {
    const { model, seen } = capturingDemo();
    const s = await setup(model);
    const first = await s.send("Hi @Scout");
    s.clock.set("2026-10-06T15:01:00.000Z");
    await handleCrewRequest(s.deps, { jobId: first.job.id });
    s.clock.set("2026-10-06T15:02:00.000Z");
    const second = await s.send("@Ledger what about costs?");
    await handleCrewRequest(s.deps, { jobId: second.job.id });
    const text = seen.at(-1) ?? "";
    expect(text).toContain('<untrusted label="conversation_history">');
    expect(text.indexOf('"speaker":"student","text":"Hi @Scout"')).toBeLessThan(text.indexOf('"speaker":"crew"'));
    expect(text).toContain("The student mentioned @Ledger.");
    expect(text).not.toContain("Student: @Ledger what about costs?");
  });

  it("uses the family audience in family rooms and charges the student", async () => {
    const { model, seen } = capturingDemo();
    const s = await setup(model);
    const parent = await factories.parent(s.core.db);
    const family = await factories.family(s.core.db, { studentIds: [s.user.id], parentIds: [parent.id] });
    const parentActor = userActor(parent.id, "parent");
    const fact = (key: string, value: string, visibility: "crew" | "crew_family") =>
      createFact(s.core, s.actor, { key, value, visibility, source: "user_stated", sourceRef: null });
    await fact("dream_school", "Rice", "crew");
    await fact("favorite_subject", "Physics", "crew_family");
    const room = await createConversation(s.core, parentActor, {
      room: "family",
      roomRefId: null,
      familyId: family.id,
      title: "",
    });
    const { job } = await s.send("How are things going?", parentActor, room.id);
    await handleCrewRequest(s.deps, { jobId: job.id });
    expect((await getJob(s.core, SYSTEM, job.id)).status).toBe("ready");
    const text = seen.at(-1) ?? "";
    expect(text).toContain('"audience":"family"');
    expect(text).toContain("Physics");
    expect(text).not.toContain("Rice");
    expect((await usageOf(s, s.user.id))?.crewRequests).toBe(1);
    expect(await usageOf(s, parent.id)).toBeNull();

    // D42: in history, a parent's words are labeled "Parent:", not the student's.
    s.clock.set("2026-10-06T15:05:00.000Z");
    const second = await s.send("Anything due soon?", parentActor, room.id);
    await handleCrewRequest(s.deps, { jobId: second.job.id });
    const later = seen.at(-1) ?? "";
    expect(later).toContain('"speaker":"parent","text":"How are things going?"');
    expect(later).not.toContain("Student: How are things going?");
  });

  it("tells Compass which parent asked, by first name, and who said each line (D42)", async () => {
    const { model, seen } = capturingDemo();
    const s = await setup(model);
    const parent = await factories.parent(s.core.db);
    await s.core.db.update(users).set({ displayName: "Maria Lopez" }).where(eq(users.id, parent.id));
    const family = await factories.family(s.core.db, { studentIds: [s.user.id], parentIds: [parent.id] });
    const parentActor = userActor(parent.id, "parent");
    const room = await createConversation(s.core, parentActor, {
      room: "family",
      roomRefId: null,
      familyId: family.id,
      title: "",
    });
    const mine = await s.send("I sent the FAFSA.", s.actor, room.id);
    await handleCrewRequest(s.deps, { jobId: mine.job.id });
    s.clock.set("2026-10-06T15:05:00.000Z");
    const theirs = await s.send("@Ledger what's the gap?", parentActor, room.id);
    await handleCrewRequest(s.deps, { jobId: theirs.job.id });
    const text = seen.at(-1) ?? "";
    expect(text).toContain('"speaker":"student","text":"I sent the FAFSA."');
    expect(text).toContain("Maria (parent) asks: @Ledger what's the gap?");
    expect(text).toContain("They mentioned @Ledger.");
    expect(text).not.toContain("The student mentioned");
  });

  it("files confirm_fact cards as memory candidates, but never from temporary chats (ME-03, CR-07)", async () => {
    const s = await setup(
      createScriptedModelClient(() => ({ content: [{ type: "tool_use", name: "submit_reply", input: MAJOR_REPLY }] })),
    );
    const { job } = await s.send("I want to study physics");
    await handleCrewRequest(s.deps, { jobId: job.id });
    const candidates = () => s.core.db.select().from(memoryFacts).where(eq(memoryFacts.ownerId, s.user.id));
    expect((await candidates()).map((f) => [f.key, f.status, f.source])).toEqual([
      ["intended_major", "candidate", "crew_inferred"],
    ]);

    const temp = await createConversation(s.core, s.actor, {
      room: "temporary",
      roomRefId: null,
      familyId: null,
      title: "",
    });
    s.clock.set("2026-10-06T15:05:00.000Z");
    const again = await s.send("I want to study physics", s.actor, temp.id);
    await handleCrewRequest(s.deps, { jobId: again.job.id });
    expect((await getJob(s.core, SYSTEM, again.job.id)).status).toBe("ready");
    expect(await candidates()).toHaveLength(1);
  });

  it("files candidates after completeJob, so a retry after a completeJob failure files them once (R2C-15)", async () => {
    const s = await setup(
      createScriptedModelClient(() => ({ content: [{ type: "tool_use", name: "submit_reply", input: MAJOR_REPLY }] })),
    );
    const { job } = await s.send("I want to study physics");
    const candidates = () => s.core.db.select().from(memoryFacts).where(eq(memoryFacts.ownerId, s.user.id));
    completeFailures.remaining = 1;
    await expect(handleCrewRequest(s.deps, { jobId: job.id })).rejects.toThrow("completeJob failed");
    expect((await getJob(s.core, SYSTEM, job.id)).status).toBe("queued");
    expect(await candidates()).toEqual([]);
    // pg-boss retries the job; the work runs again and the candidate is filed once, after completeJob.
    await handleCrewRequest(s.deps, { jobId: job.id });
    expect((await getJob(s.core, SYSTEM, job.id)).status).toBe("ready");
    expect((await candidates()).map((f) => [f.key, f.status])).toEqual([["intended_major", "candidate"]]);
  });

  it("fails a job whose request message is missing", async () => {
    const s = await setup();
    const job = await createJob(s.core, s.actor, { kind: "crew_request" });
    await handleCrewRequest(s.deps, { jobId: job.id });
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "failed", error: MISSING_MESSAGE_TEXT });
  });

  it("retries busy model errors, then fails on the last attempt", async () => {
    const busy = new AppError("internal", "The model request failed", { status: 529, rateLimited: false });
    const s = await setup(failingModel(busy));
    const { job } = await s.send("What should I do first?");
    await expect(handleCrewRequest(s.deps, { jobId: job.id }, { retryCount: 0, retryLimit: 2 })).rejects.toBe(busy);
    expect((await getJob(s.core, SYSTEM, job.id)).status).toBe("queued");
    await handleCrewRequest(s.deps, { jobId: job.id }, { retryCount: 2, retryLimit: 2 });
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "failed", error: FAILED_TEXT });
    expect((await getMessages(s.core, s.actor, s.room.id)).filter((m) => m.authorKind === "crew")).toEqual([]);
  });

  it("rejects a malformed payload", async () => {
    const s = await setup();
    await expect(handleCrewRequest(s.deps, { jobId: "nope" })).rejects.toThrow();
  });
});
