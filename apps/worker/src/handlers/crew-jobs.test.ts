import type { ModelClient } from "@scholarcrew/agents";
import { createScriptedModelClient } from "@scholarcrew/agents/testing";
import { addCollege } from "@scholarcrew/core/colleges";
import { getJob, getMessages, listConversations } from "@scholarcrew/core/crew";
import { uploadDocument } from "@scholarcrew/core/documents";
import { confirmOffer, createOffer, requestAppealOutline } from "@scholarcrew/core/money";
import { listNotifications } from "@scholarcrew/core/notifications";
import {
  addPlanItem,
  getWeekPlan,
  replaceGeneratedPlan,
  requestWeeklyPlan,
  startWeeklyPlan,
} from "@scholarcrew/core/plan";
import { requestRetakeAnalysis } from "@scholarcrew/core/prep";
import { saveScholarship } from "@scholarcrew/core/scholarships";
import { aidChecklistItems, eq, profiles, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { PlanItemInput } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, makeStudent, makeWorkerDeps } from "../../test/helpers";
import { handleAppealOutline } from "./appeal-outline";
import { handleOfferParse } from "./offer-parse";
import { PLAN_FAILED_TEXT, handlePlanWeekly } from "./plan-weekly";
import { handlePlanWeeklyFanout } from "./plan-weekly-fanout";
import { handlePrepRetake } from "./prep-retake";

const item = (title: string, o: Partial<PlanItemInput> = {}): PlanItemInput => ({
  title,
  kind: "custom",
  refType: null,
  refId: null,
  minutes: 15,
  valueUsd: null,
  dueOn: null,
  contributors: [],
  weekStart: null,
  ...o,
});

async function setup(model?: ModelClient) {
  const ctx = makeWorkerDeps(model ? { model } : {});
  return { ...ctx, ...(await makeStudent(ctx.core.db)) };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function payloadOf<T>(s: Setup, name: string): T {
  const sent = s.core.jobs.sent.filter((j) => j.name === name).at(-1);
  if (!sent) throw new Error(`no ${name} job queued`);
  return sent.payload as T;
}

async function lastReply(s: Setup) {
  const [room] = await listConversations(s.core, s.actor);
  if (!room) return null;
  return (await getMessages(s.core, s.actor, room.id)).at(-1)?.reply ?? null;
}

describe("appeal.outline", () => {
  it("builds an outline for a confirmed offer (MO-08)", async () => {
    const s = await setup();
    const college = await factories.college(s.core.db, { name: "State U" });
    const doc = await uploadDocument(s.core, s.actor, {
      kind: "award_letter",
      filename: "state-u.pdf",
      mime: "application/pdf",
      bytes: Buffer.from("%PDF-1.4 State U"),
    });
    const offer = await createOffer(s.core, s.actor, {
      collegeId: college.id,
      documentId: doc.id,
      awardYear: "2027-28",
    });
    await handleOfferParse(s.deps, payloadOf(s, "offer.parse"));
    await confirmOffer(s.core, s.actor, offer.id);
    s.clock.set("2026-10-06T15:05:00.000Z");
    const job = await requestAppealOutline(s.core, s.actor, offer.id);
    await handleAppealOutline(s.deps, payloadOf(s, "appeal.outline"));
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "ready", safety: null });
    const reply = await lastReply(s);
    expect(reply?.text).toContain("Points to raise");
    expect(reply?.text).toContain("Documents to gather");
    expect(reply?.text).not.toMatch(/\b(dear|sincerely)\b/i);
    expect(reply?.contributors).toContain("aid");
  });
});

describe("prep.retake", () => {
  it("computes the retake value in code and explains it (PR-03)", async () => {
    const s = await setup();
    const college = await factories.college(s.core.db, {
      meritTiers: [{ label: "Merit", minGpa: 3, minAct: 30, minSat: null, annualUsd: 3000, renewalGpa: 3 }],
    });
    await addCollege(s.core, s.actor, { collegeId: college.id, fit: "target", plan: "RD" });
    const job = await requestRetakeAnalysis(s.core, s.actor, { test: "ACT", targetComposite: 31 });
    await handlePrepRetake(s.deps, payloadOf(s, "prep.retake"));
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "ready", safety: null });
    const reply = await lastReply(s);
    expect(reply?.contributors).toEqual(["prep"]);
    expect(reply?.receipt.map((r) => r.refId)).toEqual(["calc:retake"]);
  });
});

describe("plan.weekly", () => {
  it("replaces crew items, keeps the student's own, and ensures aid checklists (ON-06)", async () => {
    const s = await setup();
    const listing = await factories.scholarship(s.core.db, { name: "Maple County STEM Award", deadline: "2026-10-20" });
    await saveScholarship(s.core, s.actor, { scholarshipId: listing.id });
    await addPlanItem(s.core, s.actor, item("My own task"));
    await replaceGeneratedPlan(s.core, SYSTEM, {
      ownerId: s.user.id,
      weekStart: "2026-10-05",
      items: [item("Old crew item", { contributors: ["compass"] })],
    });
    const job = await requestWeeklyPlan(s.core, s.actor);
    await handlePlanWeekly(s.deps, payloadOf(s, "plan.weekly"));

    const plan = await getWeekPlan(s.core, s.actor, s.user.id);
    const titles = plan.items.map((i) => i.title);
    expect(titles).toContain("My own task");
    expect(titles).toContain("Work on Maple County STEM Award");
    expect(titles).toContain("Spend 20 minutes on your Story Bank");
    expect(titles).not.toContain("Old crew item");
    expect(await getJob(s.core, SYSTEM, job.id)).toMatchObject({ status: "ready" });
    const checklist = await s.core.db.select().from(aidChecklistItems).where(eq(aidChecklistItems.ownerId, s.user.id));
    expect(checklist.length).toBeGreaterThan(0);
    expect((await listNotifications(s.core, s.actor)).map((n) => n.title)).toContain("Your weekly plan is ready");
    const [usage] = await s.core.db.select().from(usageCounters).where(eq(usageCounters.userId, s.user.id));
    expect(usage?.crewRequests).toBe(1);
  });

  it("plans for the job's owner even if the payload names someone else", async () => {
    const s = await setup();
    const other = await makeStudent(s.core.db);
    const job = await requestWeeklyPlan(s.core, s.actor);
    await handlePlanWeekly(s.deps, { jobId: job.id, ownerId: other.user.id });
    expect((await getWeekPlan(s.core, s.actor, s.user.id)).items.length).toBeGreaterThan(0);
    expect((await getWeekPlan(s.core, other.actor, other.user.id)).items).toEqual([]);
  });

  it("keeps the old plan on a refusal and fails when Compass never submits", async () => {
    const refusing = await setup(createScriptedModelClient([{ stopReason: "refusal" }]));
    await replaceGeneratedPlan(refusing.core, SYSTEM, {
      ownerId: refusing.user.id,
      weekStart: "2026-10-05",
      items: [item("Old crew item", { contributors: ["compass"] })],
    });
    const refusedJob = await requestWeeklyPlan(refusing.core, refusing.actor);
    await handlePlanWeekly(refusing.deps, payloadOf(refusing, "plan.weekly"));
    expect(await getJob(refusing.core, SYSTEM, refusedJob.id)).toMatchObject({ status: "ready", safety: "refusal" });
    expect((await getWeekPlan(refusing.core, refusing.actor, refusing.user.id)).items.map((i) => i.title)).toEqual([
      "Old crew item",
    ]);

    const silent = await setup(createScriptedModelClient(() => ({ content: [{ type: "text", text: "Thinking." }] })));
    const silentJob = await requestWeeklyPlan(silent.core, silent.actor);
    await handlePlanWeekly(silent.deps, payloadOf(silent, "plan.weekly"));
    expect(await getJob(silent.core, SYSTEM, silentJob.id)).toMatchObject({
      status: "failed",
      error: PLAN_FAILED_TEXT,
    });
  });

  it("records a system plan's cost without counting it against the allowance (R2C-5)", async () => {
    const s = await setup();
    const job = await startWeeklyPlan(s.core, SYSTEM, s.user.id);
    expect(job).not.toBeNull();
    expect(payloadOf<{ source?: string }>(s, "plan.weekly").source).toBe("system");
    await handlePlanWeekly(s.deps, payloadOf(s, "plan.weekly"));
    expect(await getJob(s.core, SYSTEM, job?.id ?? "")).toMatchObject({ status: "ready" });
    const [usage] = await s.core.db.select().from(usageCounters).where(eq(usageCounters.userId, s.user.id));
    expect(usage?.crewRequests).toBe(0);
    expect(usage?.costMicros).toBeGreaterThan(0);
  });
});

describe("plan.weekly.fanout", () => {
  it("starts one system plan per active, onboarded student, and a rerun starts none (R2C-5)", async () => {
    const s = await setup();
    const b = await makeStudent(s.core.db);
    const notOnboarded = await makeStudent(s.core.db);
    await s.core.db
      .update(profiles)
      .set({ onboardingCompletedAt: null })
      .where(eq(profiles.userId, notOnboarded.user.id));
    await factories.parent(s.core.db);

    await handlePlanWeeklyFanout(s.deps, {});
    const planned = () =>
      s.core.jobs.sent
        .filter((j) => j.name === "plan.weekly")
        .map((j) => j.payload as { ownerId: string; source?: string });
    expect(
      planned()
        .map((p) => p.ownerId)
        .sort(),
    ).toEqual([s.user.id, b.user.id].sort());
    expect(planned().every((p) => p.source === "system")).toBe(true);

    // startWeeklyPlan skips owners with a weekly_plan job in the last 12 hours, so a retried fan-out is a no-op.
    s.clock.set("2026-10-06T16:00:00.000Z");
    await handlePlanWeeklyFanout(s.deps, {});
    expect(planned()).toHaveLength(2);
    await expect(handlePlanWeeklyFanout(s.deps, { extra: 1 })).rejects.toThrow();
  });
});
