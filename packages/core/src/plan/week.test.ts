import { sweepRuns } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type PlanItemInput, ThisWeekView } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { createJob } from "../crew/jobs";
import { setSensitiveFact } from "../memory";
import { addPlanItem } from "./items";
import { NOW, WEEK, listCollege, makeDeps, makeParentOf, makeStateU, makeStudent, saveApp, setShare } from "./testkit";
import { getThisWeek } from "./week";

const item = (o: Partial<PlanItemInput>): PlanItemInput => ({
  title: "Later",
  kind: "custom",
  refType: null,
  refId: null,
  minutes: 10,
  valueUsd: null,
  dueOn: null,
  contributors: [],
  weekStart: null,
  ...o,
});

async function weekSetup() {
  const { deps } = makeDeps();
  const student = await makeStudent(deps);
  const id = student.user.id;
  const first = await factories.college(deps.db, { id: "100004", name: "First Added", costOfAttendanceUsd: 30000 });
  await listCollege(deps, id, first.id, { plan: "RD" });
  const stateU = await makeStateU(deps);
  await listCollege(deps, id, stateU.id, { plan: "EA", minutesAfter: 1 });
  await setSensitiveFact(deps, student.actor, { kind: "income_range", enabled: true, value: "48_75k" });
  await saveApp(deps, id, { name: "Hill Country", amountUsd: 2500, deadline: "2026-10-15" });
  await addPlanItem(deps, student.actor, item({}));
  await addPlanItem(
    deps,
    student.actor,
    item({
      title: "Hill Country STEM Award",
      kind: "scholarship",
      minutes: 30,
      valueUsd: 1000,
      dueOn: "2026-10-15",
      contributors: ["scout"],
    }),
  );
  await deps.db
    .insert(sweepRuns)
    .values({ ownerId: id, ranAt: new Date(NOW), newMatches: 3, totalUsd: 4750, reuseCount: 2, hiddenScams: 1 });
  return { deps, ...student };
}

describe("getThisWeek", () => {
  it("assembles next step, plan, top-school gap, deadlines, sweep, and crew status", async () => {
    const { deps, user, actor } = await weekSetup();
    await createJob(deps, actor, { kind: "weekly_plan" });
    const view = await getThisWeek(deps, actor, user.id);
    expect(ThisWeekView.safeParse(view).success).toBe(true);
    expect(view).toMatchObject({
      greetingName: "Test",
      weekStart: WEEK,
      crewWorking: true,
      sweep: { newMatches: 3, totalUsd: 4750, reuseCount: 2, hiddenScams: 1 },
    });
    expect(view.nextStep?.title).toBe("Hill Country STEM Award");
    expect(view.plan.items).toHaveLength(2);
    expect(view.gap).toMatchObject({
      collegeName: "State U",
      gapUsd: 9200,
      pendingUsd: 2500,
      gapIfPendingWinUsd: 6700,
    });
    expect(view.deadlines.map((d) => d.title)).toEqual([
      "Hill Country",
      "State U · Early Action",
      "First Added · Regular Decision",
    ]);
  });

  it("returns an empty week for a new student", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    expect(await getThisWeek(deps, actor, user.id)).toEqual({
      greetingName: "Test",
      weekStart: WEEK,
      nextStep: null,
      plan: { weekStart: WEEK, items: [], totalMinutes: 0, doneCount: 0 },
      gap: null,
      deadlines: [],
      sweep: null,
      crewWorking: false,
    });
  });

  it("hides the gap and sweep from a parent without those shares", async () => {
    const { deps, user } = await weekSetup();
    const { actor: parent } = await makeParentOf(deps, user.id);
    const shared = await getThisWeek(deps, parent, user.id);
    expect(shared.gap?.collegeName).toBe("State U");
    expect(shared.sweep?.newMatches).toBe(3);
    await setShare(deps, user.id, "costs", false);
    await setShare(deps, user.id, "scholarships", false);
    const limited = await getThisWeek(deps, parent, user.id);
    expect(limited).toMatchObject({ gap: null, sweep: null });
    expect(limited.plan.items).toHaveLength(2);
    await setShare(deps, user.id, "deadlines", false);
    await expect(getThisWeek(deps, parent, user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
