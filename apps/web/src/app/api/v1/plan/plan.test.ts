import { and, eq, shareSettings } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { CrewJob, PlanItem, ThisWeekView, WeekPlan } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  exhaustAllowance,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { PATCH as patchItem } from "../plan-items/[id]/route";
import { POST as addItem } from "../plan-items/route";
import { POST as regenerate } from "./regenerate/route";
import { GET as getPlan } from "./route";
import { GET as thisWeek } from "./this-week/route";

const deps = useTestDeps();

async function addEssayItem(cookie: string): Promise<PlanItem> {
  const body = { title: "Draft Rotary essay", kind: "essay", minutes: 45 };
  const res = await addItem(request("/plan-items", { method: "POST", cookie, body }), NO_PARAMS);
  expect(res.status).toBe(201);
  return readJson<PlanItem>(res);
}

describe("week plan and items (WK-01, WK-02)", () => {
  it("adds an item to this week, reads weeks, and checks items off", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const item = await addEssayItem(cookie);
    expect(item).toMatchObject({ weekStart: "2026-10-05", status: "todo", minutes: 45 });
    const week = await readJson<WeekPlan>(await getPlan(request("/plan", { cookie }), NO_PARAMS));
    expect(week).toMatchObject({ weekStart: "2026-10-05", totalMinutes: 45, doneCount: 0 });
    const next = await readJson<WeekPlan>(await getPlan(request("/plan?week=2026-10-12", { cookie }), NO_PARAMS));
    expect(next).toMatchObject({ weekStart: "2026-10-12", items: [] });
    expect((await getPlan(request("/plan?week=next", { cookie }), NO_PARAMS)).status).toBe(400);

    const path = `/plan-items/${item.id}`;
    const id = params({ id: item.id });
    const done = await patchItem(request(path, { method: "PATCH", cookie, body: { status: "done" } }), id);
    expect((await readJson<PlanItem>(done)).status).toBe("done");
    expect((await patchItem(request(path, { method: "PATCH", cookie, body: { status: "finished" } }), id)).status).toBe(
      400,
    );
    const other = await signedInStudent(deps().db);
    expect(
      (await patchItem(request(path, { method: "PATCH", cookie: other.cookie, body: { status: "todo" } }), id)).status,
    ).toBe(404);
    const bad = await addItem(
      request("/plan-items", { method: "POST", cookie, body: { title: "", kind: "essay", minutes: 5 } }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
  });
});

describe("GET /plan/this-week (WK-01..WK-05)", () => {
  it("returns the student's view", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const item = await addEssayItem(cookie);
    const view = await readJson<ThisWeekView>(await thisWeek(request("/plan/this-week", { cookie }), NO_PARAMS));
    expect(view).toMatchObject({ greetingName: "Test", weekStart: "2026-10-05", crewWorking: false });
    expect(view.nextStep?.id).toBe(item.id);
  });

  it("serves a parent while deadlines are shared and 404s once they aren't", async () => {
    const student = await signedInStudent(deps().db);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    const path = `/plan/this-week?studentId=${student.user.id}`;
    const shared = await thisWeek(request(path, { cookie: parent.cookie }), NO_PARAMS);
    expect(shared.status).toBe(200);
    expect((await readJson<ThisWeekView>(shared)).greetingName).toBe("Test");
    await deps()
      .db.update(shareSettings)
      .set({ enabled: false })
      .where(and(eq(shareSettings.studentId, student.user.id), eq(shareSettings.category, "deadlines")));
    expect((await thisWeek(request(path, { cookie: parent.cookie }), NO_PARAMS)).status).toBe(404);
    const stranger = await signedInStudent(deps().db);
    expect((await thisWeek(request(path, { cookie: stranger.cookie }), NO_PARAMS)).status).toBe(404);
  });
});

describe("POST /plan/regenerate", () => {
  it("queues a weekly plan job with 202", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const res = await regenerate(request("/plan/regenerate", { method: "POST", cookie }), NO_PARAMS);
    expect(res.status).toBe(202);
    const job = await readJson<CrewJob>(res);
    expect(job).toMatchObject({ kind: "weekly_plan", status: "queued" });
    expect(deps().jobs.sent).toContainEqual({ name: "plan.weekly", payload: { jobId: job.id, ownerId: user.id } });
    expect((await regenerate(request("/plan/regenerate", { method: "POST" }), NO_PARAMS)).status).toBe(401);
  });

  it("answers 402 limit_reached and queues nothing once the crew allowance is used (CR-10)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    await exhaustAllowance(deps().db, user.id);
    const res = await regenerate(request("/plan/regenerate", { method: "POST", cookie }), NO_PARAMS);
    expect(res.status).toBe(402);
    expect((await errorOf(res)).code).toBe("limit_reached");
    expect(deps().jobs.sent).toEqual([]);
  });
});
