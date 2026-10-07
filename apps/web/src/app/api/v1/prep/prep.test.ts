import { addCollege } from "@scholarcrew/core/colleges";
import { factories } from "@scholarcrew/db/testing";
import { userActor } from "@scholarcrew/domain";
import type { CrewJob, PlanItem, Superscore, TestScore } from "@scholarcrew/domain";
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
import { DELETE as deleteScore } from "../test-scores/[id]/route";
import { POST as addScore, GET as listScores } from "../test-scores/route";
import { POST as retake } from "./retake/route";
import { POST as studyPlan } from "./study-plan/route";
import { GET as superscores } from "./superscores/route";

const deps = useTestDeps();
async function meritStudent() {
  const student = await signedInStudent(deps().db);
  const college = await factories.college(deps().db, {
    meritTiers: [{ label: "Merit", minGpa: 3, minAct: 30, minSat: null, annualUsd: 3000, renewalGpa: 3 }],
  });
  await addCollege(deps(), userActor(student.user.id, "student"), { collegeId: college.id, fit: "target", plan: "RD" });
  return student;
}

const ACT = {
  test: "ACT",
  takenOn: "2026-09-12",
  official: true,
  composite: 29,
  sections: { english: 30, math: 28, reading: 29, science: 29 },
};

describe("test scores (PR-01, PR-02)", () => {
  it("records, lists, superscores, and deletes scores", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await addScore(request("/test-scores", { method: "POST", cookie, body: ACT }), NO_PARAMS);
    expect(res.status).toBe(201);
    const score = await readJson<TestScore>(res);
    expect(score).toMatchObject({ test: "ACT", composite: 29, official: true });
    expect(await readJson<TestScore[]>(await listScores(request("/test-scores", { cookie }), NO_PARAMS))).toHaveLength(
      1,
    );
    const supers = await readJson<Superscore[]>(await superscores(request("/prep/superscores", { cookie }), NO_PARAMS));
    expect(supers.map((s) => s.test)).toContain("ACT");

    const path = `/test-scores/${score.id}`;
    const other = await signedInStudent(deps().db);
    expect(
      (await deleteScore(request(path, { method: "DELETE", cookie: other.cookie }), params({ id: score.id }))).status,
    ).toBe(404);
    expect((await deleteScore(request(path, { method: "DELETE", cookie }), params({ id: score.id }))).status).toBe(204);
  });

  it("rejects out-of-range composites and keeps scores owner-only", async () => {
    const student = await signedInStudent(deps().db);
    const bad = await addScore(
      request("/test-scores", { method: "POST", cookie: student.cookie, body: { ...ACT, composite: 40 } }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    const asParent = await listScores(
      request(`/test-scores?studentId=${student.user.id}`, { cookie: parent.cookie }),
      NO_PARAMS,
    );
    expect(asParent.status).toBe(404);
  });
});

describe("retake value and study plans (PR-03, PR-04)", () => {
  it("starts a retake analysis job with 202", async () => {
    const { cookie } = await meritStudent();
    const res = await retake(
      request("/prep/retake", { method: "POST", cookie, body: { test: "ACT", targetComposite: 32 } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(202);
    const job = await readJson<CrewJob>(res);
    expect(job).toMatchObject({ kind: "retake_analysis", status: "queued" });
    expect(deps().jobs.sent).toContainEqual({
      name: "prep.retake",
      payload: { jobId: job.id, test: "ACT", targetComposite: 32 },
    });
    const bad = await retake(
      request("/prep/retake", { method: "POST", cookie, body: { test: "PSAT", targetComposite: 1200 } }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
  });

  it("answers 402 limit_reached and queues nothing once the crew allowance is used (CR-10)", async () => {
    const { user, cookie } = await meritStudent();
    await exhaustAllowance(deps().db, user.id);
    const res = await retake(
      request("/prep/retake", { method: "POST", cookie, body: { test: "ACT", targetComposite: 32 } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(402);
    expect((await errorOf(res)).code).toBe("limit_reached");
    expect(deps().jobs.sent).toEqual([]);
  });

  it("accepts study sessions into the weekly plan", async () => {
    const { cookie } = await meritStudent();
    const sessions = [{ title: "ACT math set", minutes: 45, weekStart: "2026-10-05", dueOn: null }];
    const res = await studyPlan(request("/prep/study-plan", { method: "POST", cookie, body: { sessions } }), NO_PARAMS);
    expect(res.status).toBe(201);
    const items = await readJson<PlanItem[]>(res);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "ACT math set", minutes: 45, weekStart: "2026-10-05" });
    const empty = await studyPlan(
      request("/prep/study-plan", { method: "POST", cookie, body: { sessions: [] } }),
      NO_PARAMS,
    );
    expect(empty.status).toBe(400);
  });
});
