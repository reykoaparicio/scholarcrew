import { eq, notificationPrefs, scholarshipApplications, scholarships, sweepRuns, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type PlanItemInput, systemActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { addPlanItem, buildWeeklyDigest, findDueReminders, updatePlanItem } from "./index";
import { NOW, WEEK, listCollege, makeDeps, makeStateU, makeStudent, saveApp } from "./testkit";

const SYSTEM = systemActor("test");
const item = (o: Partial<PlanItemInput>): PlanItemInput => ({
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
const daysAgo = (n: number) => new Date(new Date(NOW).getTime() - n * 86_400_000);

describe("buildWeeklyDigest", () => {
  it("returns null for parents, empty weeks, stale sweeps, and email opt-outs", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const parent = await factories.parent(deps.db);
    expect(await buildWeeklyDigest(deps, SYSTEM, parent.id)).toBeNull();
    expect(await buildWeeklyDigest(deps, SYSTEM, user.id)).toBeNull();
    await deps.db
      .insert(sweepRuns)
      .values({ ownerId: user.id, ranAt: daysAgo(8), newMatches: 2, totalUsd: 3000, reuseCount: 0, hiddenScams: 0 });
    expect(await buildWeeklyDigest(deps, SYSTEM, user.id)).toBeNull();
    await addPlanItem(deps, actor, item({}));
    await deps.db.insert(notificationPrefs).values({ userId: user.id, emailEnabled: false });
    expect(await buildWeeklyDigest(deps, SYSTEM, user.id)).toBeNull();
    await expect(buildWeeklyDigest(deps, actor, user.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("summarizes open items, deadlines within 14 days, and a fresh sweep", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const stateU = await makeStateU(deps);
    await listCollege(deps, user.id, stateU.id, { plan: "EA" });
    await saveApp(deps, user.id, { name: "Hill Country STEM Award", amountUsd: 1000, deadline: "2026-10-15" });
    await addPlanItem(deps, actor, item({ dueOn: "2026-10-15" }));
    const done = await addPlanItem(deps, actor, item({ title: "Done thing" }));
    await updatePlanItem(deps, actor, done.id, { status: "done" });
    await deps.db
      .insert(sweepRuns)
      .values({ ownerId: user.id, ranAt: daysAgo(1), newMatches: 3, totalUsd: 4750, reuseCount: 2, hiddenScams: 1 });
    const digest = await buildWeeklyDigest(deps, SYSTEM, user.id);
    expect(digest).toMatchObject({
      userId: user.id,
      email: user.email,
      weekStart: WEEK,
      subject: "Your week: 1 step, 1 deadline coming up",
    });
    const text = digest?.text ?? "";
    expect(text).toContain("Hi Test,");
    expect(text).toContain("- Draft the Rotary essay (45 min, due Oct 15)");
    expect(text).toContain("- Hill Country STEM Award: 9 days left (Oct 15)");
    expect(text).not.toContain("2026-10-15");
    expect(text).toContain("Scout found 3 new matches worth up to $4,750.");
    expect(text).toContain("http://localhost:3000/week");
    expect(text).not.toContain("Done thing");
    expect(text).not.toContain("State U");
  });
});

describe("findDueReminders", () => {
  it("finds 7, 3, and 1 day reminders keyed per student item", async () => {
    const { deps } = makeDeps();
    const a = await makeStudent(deps);
    const b = await makeStudent(deps);
    const seven = await saveApp(deps, a.user.id, { name: "Seven", deadline: "2026-10-13" });
    const three = await saveApp(deps, a.user.id, { name: "Three", stage: "drafting", deadline: "2026-10-09" });
    const one = await saveApp(deps, a.user.id, { name: "One", stage: "matched", deadline: "2026-10-07" });
    await saveApp(deps, a.user.id, { name: "Four", deadline: "2026-10-10" });
    await saveApp(deps, a.user.id, { name: "Sent", stage: "submitted", deadline: "2026-10-13" });
    const [shared] = await deps.db
      .insert(scholarshipApplications)
      .values({ ownerId: b.user.id, scholarshipId: seven.scholarship.id, stage: "planned" })
      .returning();
    const early = await factories.college(deps.db, {
      id: "100005",
      name: "Early College",
      deadlines: { ED: "2026-10-09", EA: null, REA: null, RD: null, rolling: false },
    });
    const entry = await listCollege(deps, a.user.id, early.id, { plan: "ED" });
    const blocked = await makeStudent(deps);
    await deps.db.update(users).set({ status: "blocked_underage" }).where(eq(users.id, blocked.user.id));
    await saveApp(deps, blocked.user.id, { deadline: "2026-10-13" });

    const reminders = await findDueReminders(deps, SYSTEM);
    expect(reminders.map((r) => r.dedupeKey).sort()).toEqual(
      [
        `reminder:college_list:${entry.id}:2026-10-09:3`,
        `reminder:scholarship_application:${one.application.id}:2026-10-07:1`,
        `reminder:scholarship_application:${seven.application.id}:2026-10-13:7`,
        `reminder:scholarship_application:${shared?.id}:2026-10-13:7`,
        `reminder:scholarship_application:${three.application.id}:2026-10-09:3`,
      ].sort(),
    );
    expect(reminders.find((r) => r.refId === seven.application.id)).toEqual({
      userId: a.user.id,
      title: "Seven is due in 7 days",
      dueOn: "2026-10-13",
      offset: 7,
      refType: "scholarship_application",
      refId: seven.application.id,
      dedupeKey: `reminder:scholarship_application:${seven.application.id}:2026-10-13:7`,
    });
    expect(reminders.find((r) => r.refId === one.application.id)?.title).toBe("One is due tomorrow");
    expect(reminders.find((r) => r.refType === "college_list")?.title).toBe(
      "Early College · Early Decision is due in 3 days",
    );
    await expect(findDueReminders(deps, a.actor)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("sends no reminder for a retired or scam-flagged listing (R2P-4)", async () => {
    const { deps } = makeDeps();
    const { user } = await makeStudent(deps);
    const retired = await saveApp(deps, user.id, { name: "Retired", deadline: "2026-10-13" });
    const flagged = await saveApp(deps, user.id, { name: "Flagged", deadline: "2026-10-09" });
    const live = await saveApp(deps, user.id, { name: "Live", deadline: "2026-10-07" });
    await deps.db.update(scholarships).set({ status: "retired" }).where(eq(scholarships.id, retired.scholarship.id));
    await deps.db
      .update(scholarships)
      .set({ scamFlags: ["guaranteed_award"] })
      .where(eq(scholarships.id, flagged.scholarship.id));
    expect((await findDueReminders(deps, SYSTEM)).map((r) => r.refId)).toEqual([live.application.id]);
  });

  it("finds a renewal reminder 30 days before the anniversary of a renewable win (SC-11)", async () => {
    const { deps } = makeDeps();
    const { user } = await makeStudent(deps);
    const lastYear = new Date("2025-11-05T15:00:00.000Z");
    const won = { stage: "won" as const, outcomeUsd: 2000, outcomeRenewable: true, outcomeAt: lastYear };
    const renewable = await saveApp(deps, user.id, { ...won, name: "Maple Rotary" });
    await saveApp(deps, user.id, { ...won, name: "One Time", outcomeRenewable: false });
    await saveApp(deps, user.id, { ...won, name: "Next Week", outcomeAt: new Date("2025-11-12T15:00:00.000Z") });
    await saveApp(deps, user.id, { ...won, name: "Lost One", stage: "lost" });
    await saveApp(deps, user.id, { ...won, name: "No Date", outcomeAt: null });
    expect(await findDueReminders(deps, SYSTEM)).toEqual([
      {
        userId: user.id,
        title: "Maple Rotary renewal is coming up",
        dueOn: "2026-11-05",
        offset: 30,
        refType: "scholarship_application",
        refId: renewable.application.id,
        dedupeKey: `renewal:${renewable.application.id}:2026`,
      },
    ]);
  });
});
