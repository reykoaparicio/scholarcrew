import { eq, planItems, profiles, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type PlanItemInput, systemActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import {
  addPlanItem,
  getWeekPlan,
  replaceGeneratedPlan,
  requestWeeklyPlan,
  startWeeklyPlan,
  updatePlanItem,
} from "./items";
import { NOW, WEEK, makeDeps, makeParentOf, makeStudent, setShare } from "./testkit";

const SYSTEM = systemActor("test");
const item = (o: Partial<PlanItemInput> = {}): PlanItemInput => ({
  title: "Draft the Rotary essay",
  kind: "essay",
  refType: null,
  refId: null,
  minutes: 45,
  valueUsd: null,
  dueOn: null,
  contributors: [],
  weekStart: null,
  ...o,
});

describe("plan items", () => {
  it("adds items to the student's current week and moves other dates to their Monday", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    const a = await addPlanItem(deps, actor, item());
    expect(a).toMatchObject({ weekStart: WEEK, status: "todo", contributors: [], priority: 0, completedAt: null });
    const b = await addPlanItem(deps, actor, item({ weekStart: "2026-10-14" }));
    expect(b.weekStart).toBe("2026-10-12");
    await expect(addPlanItem(deps, actor, item({ minutes: -5 }))).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("marks items done, reopens them, and moves them to another week", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    const { actor: other } = await makeStudent(deps);
    const a = await addPlanItem(deps, actor, item());
    expect(await updatePlanItem(deps, actor, a.id, { status: "done" })).toMatchObject({
      status: "done",
      completedAt: NOW,
    });
    expect(await updatePlanItem(deps, actor, a.id, { status: "todo" })).toMatchObject({
      status: "todo",
      completedAt: null,
    });
    expect((await updatePlanItem(deps, actor, a.id, { weekStart: "2026-10-13" })).weekStart).toBe("2026-10-12");
    await expect(updatePlanItem(deps, other, a.id, { status: "done" })).rejects.toMatchObject({ code: "not_found" });
    await expect(updatePlanItem(deps, actor, "nope", { status: "done" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("orders the week by due date and follows the deadlines share", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { actor: parent } = await makeParentOf(deps, user.id);
    await addPlanItem(deps, actor, item({ title: "No date", minutes: 10 }));
    await addPlanItem(deps, actor, item({ title: "Oct 15", minutes: 30, dueOn: "2026-10-15" }));
    const early = await addPlanItem(deps, actor, item({ title: "Oct 9", minutes: 20, dueOn: "2026-10-09" }));
    const done = await addPlanItem(deps, actor, item({ title: "Done", minutes: 5, dueOn: "2026-10-07" }));
    await updatePlanItem(deps, actor, done.id, { status: "done" });
    const plan = await getWeekPlan(deps, actor, user.id);
    expect(plan.weekStart).toBe(WEEK);
    expect(plan.items.map((i) => i.title)).toEqual(["Oct 9", "Oct 15", "No date", "Done"]);
    expect(plan).toMatchObject({ totalMinutes: 65, doneCount: 1 });
    expect(plan.items[0]?.id).toBe(early.id);
    expect((await getWeekPlan(deps, parent, user.id)).items).toHaveLength(4);
    expect((await getWeekPlan(deps, actor, user.id, "2026-10-14")).items).toEqual([]);
    await setShare(deps, user.id, "deadlines", false);
    await expect(getWeekPlan(deps, parent, user.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("enqueues a weekly plan job within the crew allowance", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const job = await requestWeeklyPlan(deps, actor);
    expect(job).toMatchObject({ kind: "weekly_plan", status: "queued", refId: null });
    expect(deps.jobs.sent).toEqual([{ name: "plan.weekly", payload: { jobId: job.id, ownerId: user.id } }]);
    await deps.db.insert(usageCounters).values({ userId: user.id, month: "2026-10", crewRequests: 20 });
    deps.jobs.clear();
    await expect(requestWeeklyPlan(deps, actor)).rejects.toMatchObject({ code: "limit_reached" });
    expect(deps.jobs.sent).toEqual([]);
  });

  it("replaces generated items and keeps user-added and done ones", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    await addPlanItem(deps, actor, item({ title: "Mine" }));
    const nextWeek = await addPlanItem(
      deps,
      actor,
      item({ title: "Next week", contributors: ["prep"], weekStart: "2026-10-12" }),
    );
    const first = await replaceGeneratedPlan(deps, SYSTEM, {
      ownerId: user.id,
      weekStart: WEEK,
      items: [item({ title: "Gen A", contributors: ["scout"] }), item({ title: "Gen B", contributors: ["quill"] })],
    });
    expect(first.items.map((i) => i.title).sort()).toEqual(["Gen A", "Gen B", "Mine"]);
    const genA = first.items.find((i) => i.title === "Gen A");
    if (!genA) throw new Error("Gen A missing");
    await updatePlanItem(deps, actor, genA.id, { status: "done" });
    const second = await replaceGeneratedPlan(deps, SYSTEM, {
      ownerId: user.id,
      weekStart: WEEK,
      items: [item({ title: "Gen C" })],
    });
    expect(second.items.map((i) => i.title).sort()).toEqual(["Gen A", "Gen C", "Mine"]);
    expect(second.items.find((i) => i.title === "Gen C")?.contributors).toEqual(["compass"]);
    expect(await deps.db.select().from(planItems).where(eq(planItems.id, nextWeek.id))).toHaveLength(1);
    await expect(
      replaceGeneratedPlan(deps, actor, { ownerId: user.id, weekStart: WEEK, items: [] }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("keeps applied card items and study sessions when it regenerates (R2C-4)", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    // An applied add_plan_item card and an accepted Prep session both carry contributors but aren't generated.
    const card = await addPlanItem(deps, actor, item({ title: "From Scout's card", contributors: ["scout"] }));
    const study = await addPlanItem(
      deps,
      actor,
      item({ title: "SAT reading set", kind: "test_prep", contributors: ["prep"] }),
    );
    await replaceGeneratedPlan(deps, SYSTEM, { ownerId: user.id, weekStart: WEEK, items: [item({ title: "Gen A" })] });
    const again = await replaceGeneratedPlan(deps, SYSTEM, {
      ownerId: user.id,
      weekStart: WEEK,
      items: [item({ title: "Gen B" })],
    });
    expect(again.items.map((i) => i.title).sort()).toEqual(["From Scout's card", "Gen B", "SAT reading set"]);
    const rows = await deps.db.select().from(planItems).where(eq(planItems.ownerId, user.id));
    expect(rows.find((r) => r.id === card.id)?.generated).toBe(false);
    expect(rows.find((r) => r.id === study.id)?.generated).toBe(false);
    expect(rows.find((r) => r.title === "Gen B")?.generated).toBe(true);
  });

  it("lists each scholarship or essay once a week, whether a card or the weekly plan adds it first", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const hill = { refType: "scholarship", refId: "hill-country" };
    // The weekly plan lists it, then the student applies a crew card for the same scholarship.
    await replaceGeneratedPlan(deps, SYSTEM, {
      ownerId: user.id,
      weekStart: WEEK,
      items: [item({ title: "Work on Hill Country", ...hill })],
    });
    const fromCard = await addPlanItem(deps, actor, item({ title: "Hill Country answers", ...hill }));
    expect(fromCard.title).toBe("Work on Hill Country");
    const [keptRow] = await deps.db.select().from(planItems).where(eq(planItems.id, fromCard.id));
    expect(keptRow?.generated).toBe(false);
    // A card item that stays isn't planned again when the week regenerates.
    const rotary = { refType: "scholarship", refId: "rotary" };
    await addPlanItem(deps, actor, item({ title: "Rotary from Scout", ...rotary }));
    const week = await replaceGeneratedPlan(deps, SYSTEM, {
      ownerId: user.id,
      weekStart: WEEK,
      items: [item({ title: "Work on Rotary", ...rotary })],
    });
    expect(week.items.map((i) => i.title).sort()).toEqual(["Rotary from Scout", "Work on Hill Country"]);
    // Next week is a different week.
    const next = await addPlanItem(
      deps,
      actor,
      item({ title: "Rotary next week", ...rotary, weekStart: "2026-10-12" }),
    );
    expect(next.title).toBe("Rotary next week");
  });

  it("starts a system weekly plan for onboarded students, at most once in 12 hours (R2C-5)", async () => {
    const { deps, clock } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    await deps.db.insert(usageCounters).values({ userId: user.id, month: "2026-10", crewRequests: 20 });
    await expect(startWeeklyPlan(deps, actor, user.id)).rejects.toMatchObject({ code: "forbidden" });
    const job = await startWeeklyPlan(deps, SYSTEM, user.id);
    expect(job).toMatchObject({ kind: "weekly_plan", status: "queued" });
    expect(deps.jobs.sent).toEqual([
      { name: "plan.weekly", payload: { jobId: job?.id, ownerId: user.id, source: "system" } },
    ]);
    deps.jobs.clear();
    expect(await startWeeklyPlan(deps, SYSTEM, user.id)).toBeNull();
    clock.set("2026-10-07T03:01:00.000Z");
    expect(await startWeeklyPlan(deps, SYSTEM, user.id)).not.toBeNull();
    const parent = await factories.parent(deps.db);
    expect(await startWeeklyPlan(deps, SYSTEM, parent.id)).toBeNull();
    const { user: fresh } = await makeStudent(deps);
    await deps.db.update(profiles).set({ onboardingCompletedAt: null }).where(eq(profiles.userId, fresh.id));
    expect(await startWeeklyPlan(deps, SYSTEM, fresh.id)).toBeNull();
    expect(await startWeeklyPlan(deps, SYSTEM, "nope")).toBeNull();
    expect(deps.jobs.sent).toHaveLength(1);
  });
});
