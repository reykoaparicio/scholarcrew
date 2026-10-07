import { TEST_NOW } from "@scholarcrew/core/shared";
import { rateLimits } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { Activity, RequirementProgress, ServiceLog, VerificationRequestView } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  latestEmail,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { DELETE as deleteActivity } from "../activities/[id]/route";
import { GET as listActivities, PUT as putActivity } from "../activities/route";
import { POST as submitVerification, GET as viewRequest } from "../verify-hours/[token]/route";
import { DELETE as deleteLog, PATCH as patchLog } from "./[id]/route";
import { POST as requestVerify } from "./[id]/verify/route";
import { GET as progress } from "./progress/route";
import { POST as addLog, GET as listLogs } from "./route";

const deps = useTestDeps();

const LOG = {
  organization: "Maple Food Bank",
  activity: "Sorting donations",
  servedOn: "2026-09-26",
  minutes: 120,
  supervisorName: "Dana Lee",
  supervisorEmail: "dana@foodbank.example",
};

async function newLog(cookie: string): Promise<ServiceLog> {
  const res = await addLog(request("/service-logs", { method: "POST", cookie, body: LOG }), NO_PARAMS);
  expect(res.status).toBe(201);
  return readJson<ServiceLog>(res);
}

function verifyToken(text: string): string {
  const match = /\/verify-hours\/([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) throw new Error("No verification link in the email");
  return match[1];
}

describe("service logs (IM-01)", () => {
  it("adds, lists, edits, and deletes logs for the owner only", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const log = await newLog(cookie);
    expect(log).toMatchObject({ minutes: 120, verification: "self_reported" });
    expect(await readJson<ServiceLog[]>(await listLogs(request("/service-logs", { cookie }), NO_PARAMS))).toHaveLength(
      1,
    );
    const path = `/service-logs/${log.id}`;
    const id = params({ id: log.id });
    const edited = await patchLog(request(path, { method: "PATCH", cookie, body: { minutes: 90 } }), id);
    expect((await readJson<ServiceLog>(edited)).minutes).toBe(90);
    expect((await patchLog(request(path, { method: "PATCH", cookie, body: { minutes: 0 } }), id)).status).toBe(400);
    const other = await signedInStudent(deps().db);
    expect(
      (await patchLog(request(path, { method: "PATCH", cookie: other.cookie, body: { minutes: 30 } }), id)).status,
    ).toBe(404);
    expect((await deleteLog(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
  });

  it("lets a parent read logs and progress with the activities share", async () => {
    const student = await signedInStudent(deps().db);
    await newLog(student.cookie);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    const q = `?studentId=${student.user.id}`;
    expect(
      await readJson<ServiceLog[]>(await listLogs(request(`/service-logs${q}`, { cookie: parent.cookie }), NO_PARAMS)),
    ).toHaveLength(1);
    const rows = await readJson<RequirementProgress[]>(
      await progress(request(`/service-logs/progress${q}`, { cookie: parent.cookie }), NO_PARAMS),
    );
    expect(rows).toEqual([]);
  });
});

describe("supervisor verification (IM-02)", () => {
  it("emails a link the supervisor can open and answer once, without an account", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const log = await newLog(cookie);
    const asked = await requestVerify(
      request(`/service-logs/${log.id}/verify`, { method: "POST", cookie }),
      params({ id: log.id }),
    );
    expect((await readJson<ServiceLog>(asked)).verification).toBe("requested");
    const token = verifyToken((await latestEmail(deps().db, "dana@foodbank.example")).text);
    const at = params({ token });

    const view = await viewRequest(request(`/verify-hours/${token}`), at);
    expect(view.status).toBe(200);
    expect(await readJson<VerificationRequestView>(view)).toMatchObject({
      studentFirstName: "Test",
      organization: "Maple Food Bank",
      minutes: 120,
    });
    const bad = await submitVerification(
      request(`/verify-hours/${token}`, { method: "POST", body: { confirmed: "yes" } }),
      at,
    );
    expect(bad.status).toBe(400);
    const huge = await submitVerification(
      request(`/verify-hours/${token}`, { method: "POST", body: { confirmed: true, note: "n".repeat(70_000) } }),
      at,
    );
    expect(huge.status).toBe(413);
    const done = await submitVerification(
      request(`/verify-hours/${token}`, { method: "POST", body: { confirmed: true, note: "Great helper" } }),
      at,
    );
    expect(done.status).toBe(204);
    expect((await viewRequest(request(`/verify-hours/${token}`), at)).status).toBe(404);
    const again = await submitVerification(
      request(`/verify-hours/${token}`, { method: "POST", body: { confirmed: false } }),
      at,
    );
    expect(again.status).toBe(404);
  });

  it("returns 404 for unknown tokens and limits each IP to 10 requests an hour", async () => {
    const headers = { "x-forwarded-for": "198.51.100.20" };
    for (let n = 0; n < 10; n += 1) {
      const res = await viewRequest(
        request("/verify-hours/unknown-token", { headers }),
        params({ token: "unknown-token" }),
      );
      expect(res.status).toBe(404);
    }
    const limited = await viewRequest(
      request("/verify-hours/unknown-token", { headers }),
      params({ token: "unknown-token" }),
    );
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe("rate_limited");
  });
});

describe("activities (IM-04)", () => {
  it("upserts by position, enforces 150 characters, and deletes for the owner only", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const input = { position: 1, name: "Robotics Club", role: "Captain", description: "é".repeat(150) };
    const res = await putActivity(request("/activities", { method: "PUT", cookie, body: input }), NO_PARAMS);
    expect(res.status).toBe(200);
    const activity = await readJson<Activity>(res);
    const renamed = await putActivity(
      request("/activities", { method: "PUT", cookie, body: { ...input, name: "FIRST Robotics" } }),
      NO_PARAMS,
    );
    expect(await readJson<Activity>(renamed)).toMatchObject({ id: activity.id, name: "FIRST Robotics" });
    const tooLong = await putActivity(
      request("/activities", { method: "PUT", cookie, body: { ...input, description: "a".repeat(151) } }),
      NO_PARAMS,
    );
    expect(tooLong.status).toBe(400);
    expect(
      await readJson<Activity[]>(await listActivities(request("/activities", { cookie }), NO_PARAMS)),
    ).toHaveLength(1);
    const path = `/activities/${activity.id}`;
    const other = await signedInStudent(deps().db);
    expect(
      (await deleteActivity(request(path, { method: "DELETE", cookie: other.cookie }), params({ id: activity.id })))
        .status,
    ).toBe(404);
    expect(
      (await deleteActivity(request(path, { method: "DELETE", cookie }), params({ id: activity.id }))).status,
    ).toBe(204);
  });
  it("refuses an eleventh supervisor verification email in a day", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    await deps()
      .db.insert(rateLimits)
      .values({ key: `service-logs.verify:${user.id}`, windowStart: new Date(TEST_NOW), count: 10 });
    const res = await requestVerify(
      request("/service-logs/11111111-1111-4111-8111-111111111111/verify", { method: "POST", cookie }),
      params({ id: "11111111-1111-4111-8111-111111111111" }),
    );
    expect(res.status).toBe(429);
  });
});
