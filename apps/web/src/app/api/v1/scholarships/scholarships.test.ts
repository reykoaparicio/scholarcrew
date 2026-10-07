import { createApiToken } from "@scholarcrew/core/apitokens";
import { TEST_NOW } from "@scholarcrew/core/shared";
import { catalogTasks, eq, rateLimits } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type {
  Board,
  Match,
  Page,
  ScholarshipApplication,
  ScholarshipDetail,
  ScholarshipSummary,
} from "@scholarcrew/domain";
import { userActor } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { POST as savePage } from "../extension/save-page/route";
import { GET as listMatches } from "../matches/route";
import { PATCH as patchApplication } from "../scholarship-applications/[id]/route";
import { GET as getBoard, POST as saveScholarship } from "../scholarship-applications/route";
import { POST as report } from "./[idOrSlug]/report/route";
import { GET as getDetail } from "./[idOrSlug]/route";
import { POST as submitLocal } from "./local/route";
import { GET as search } from "./route";

const deps = useTestDeps();

describe("GET /scholarships", () => {
  it("searches signed out with parsed query params, including openOn (F-18-3)", async () => {
    await factories.scholarship(deps().db, { name: "Maple Rotary STEM Award", amountMaxUsd: 2500 });
    await factories.scholarship(deps().db, { name: "Small Maple Grant", amountMaxUsd: 300 });
    await factories.scholarship(deps().db, { name: "Maple Closed Award", amountMaxUsd: 5000, deadline: "2026-09-01" });
    const res = await search(request("/scholarships?q=maple&minUsd=1000&openOn=2026-10-06&page=1"), NO_PARAMS);
    expect(res.status).toBe(200);
    const page = await readJson<Page<ScholarshipSummary>>(res);
    expect(page.items.map((s) => s.name)).toEqual(["Maple Rotary STEM Award"]);
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    const withClosed = await readJson<Page<ScholarshipSummary>>(
      await search(request("/scholarships?q=maple&minUsd=1000"), NO_PARAMS),
    );
    expect(withClosed.items.map((s) => s.name)).toEqual(["Maple Closed Award", "Maple Rotary STEM Award"]);
  });

  it("rejects bad query params", async () => {
    for (const qs of ["page=0", "state=ZZ", "minUsd=lots", "deadlineBefore=11/15/2026", "openOn=today"]) {
      const res = await search(request(`/scholarships?${qs}`), NO_PARAMS);
      expect(res.status).toBe(400);
      expect((await errorOf(res)).code).toBe("invalid_input");
    }
  });
});

describe("GET /scholarships/:idOrSlug", () => {
  it("returns a published listing by slug or id signed out, 404 for drafts and unknown ids", async () => {
    const s = await factories.scholarship(deps().db, { slug: "maple-rotary-stem" });
    const bySlug = await getDetail(
      request("/scholarships/maple-rotary-stem"),
      params({ idOrSlug: "maple-rotary-stem" }),
    );
    expect(bySlug.status).toBe(200);
    expect(await readJson<ScholarshipDetail>(bySlug)).toMatchObject({ id: s.id, application: null });
    expect((await getDetail(request(`/scholarships/${s.id}`), params({ idOrSlug: s.id }))).status).toBe(200);
    const draft = await factories.scholarship(deps().db, { status: "draft" });
    expect((await getDetail(request(`/scholarships/${draft.id}`), params({ idOrSlug: draft.id }))).status).toBe(404);
    expect((await getDetail(request("/scholarships/nope"), params({ idOrSlug: "nope" }))).status).toBe(404);
  });
});

describe("POST /scholarships/local and POST /scholarships/:id/report", () => {
  it("shares the daily 10-page allowance with bearer extension saves", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const token = await createApiToken(deps(), userActor(user.id, "student"), {
      label: "Browser",
      scopes: ["save_page"],
    });
    await deps()
      .db.insert(rateLimits)
      .values({ key: `scholarships.local:${user.id}`, windowStart: new Date(TEST_NOW), count: 10 });
    const local = await submitLocal(
      request("/scholarships/local", {
        method: "POST",
        cookie,
        body: { url: "https://listing.test/a", name: "Award" },
      }),
      NO_PARAMS,
    );
    const extension = await savePage(
      request("/extension/save-page", {
        method: "POST",
        headers: { authorization: `Bearer ${token.secret}` },
        body: { url: "https://listing.test/a", title: "Award", selectedText: "" },
      }),
      NO_PARAMS,
    );
    expect(local.status).toBe(429);
    expect(extension.status).toBe(429);
  });

  it("submits a local listing into the review queue (SC-07)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const body = { url: "https://maplerotary.example/award", name: "Maple Rotary Award" };
    const res = await submitLocal(request("/scholarships/local", { method: "POST", cookie, body }), NO_PARAMS);
    expect(res.status).toBe(201);
    expect(await readJson<ScholarshipSummary>(res)).toMatchObject({ name: "Maple Rotary Award", unverified: true });
    const tasks = await deps().db.select().from(catalogTasks).where(eq(catalogTasks.kind, "user_submission"));
    expect(tasks).toHaveLength(1);
  });

  it("validates the body and needs a session", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const bad = { url: "not a url", name: "X" };
    expect(
      (
        await submitLocal(
          request("/scholarships/local", { method: "POST", cookie, body: { url: "javascript:alert(1)", name: "X" } }),
          NO_PARAMS,
        )
      ).status,
    ).toBe(400);
    expect(
      (await submitLocal(request("/scholarships/local", { method: "POST", cookie, body: bad }), NO_PARAMS)).status,
    ).toBe(400);
    const good = { url: "https://a.example", name: "X" };
    expect((await submitLocal(request("/scholarships/local", { method: "POST", body: good }), NO_PARAMS)).status).toBe(
      401,
    );
  });

  it("reports a listing by path id or slug (SC-08)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const s = await factories.scholarship(deps().db, { slug: "maple-rotary-stem" });
    const path = `/scholarships/${s.id}/report`;
    const ok = await report(
      request(path, { method: "POST", cookie, body: { reason: "dead_link", details: "404 page" } }),
      params({ idOrSlug: s.id }),
    );
    expect(ok.status).toBe(204);
    const bySlug = await report(
      request("/scholarships/maple-rotary-stem/report", { method: "POST", cookie, body: { reason: "scam" } }),
      params({ idOrSlug: "maple-rotary-stem" }),
    );
    expect(bySlug.status).toBe(204);
    const unknown = await report(
      request("/scholarships/no-such-listing/report", { method: "POST", cookie, body: { reason: "scam" } }),
      params({ idOrSlug: "no-such-listing" }),
    );
    expect(unknown.status).toBe(404);
    const bad = await report(
      request(path, { method: "POST", cookie, body: { reason: "boring" } }),
      params({ idOrSlug: s.id }),
    );
    expect(bad.status).toBe(400);
  });
});

describe("matches and the board", () => {
  it("lists matches for the student and a sharing parent, 404 for strangers", async () => {
    await factories.scholarship(deps().db);
    const student = await signedInStudent(deps().db);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    const own = await listMatches(request("/matches", { cookie: student.cookie }), NO_PARAMS);
    expect(own.status).toBe(200);
    expect(await readJson<{ matches: Match[]; privateCount: number }>(own)).toMatchObject({
      matches: expect.any(Array),
      privateCount: 0,
    });
    const forStudent = `/matches?studentId=${student.user.id}`;
    expect((await listMatches(request(forStudent, { cookie: parent.cookie }), NO_PARAMS)).status).toBe(200);
    const stranger = await signedInStudent(deps().db);
    expect((await listMatches(request(forStudent, { cookie: stranger.cookie }), NO_PARAMS)).status).toBe(404);
    expect((await listMatches(request("/matches?studentId=nope", { cookie: student.cookie }), NO_PARAMS)).status).toBe(
      400,
    );
  });

  it("saves to the board, records an outcome, and hides other students' cards", async () => {
    const s = await factories.scholarship(deps().db, { amountMaxUsd: 1500 });
    const { cookie } = await signedInStudent(deps().db);
    const saved = await saveScholarship(
      request("/scholarship-applications", { method: "POST", cookie, body: { scholarshipId: s.id } }),
      NO_PARAMS,
    );
    expect(saved.status).toBe(201);
    const app = await readJson<ScholarshipApplication>(saved);
    expect(app.scholarshipId).toBe(s.id);
    const board = await readJson<Board>(await getBoard(request("/scholarship-applications", { cookie }), NO_PARAMS));
    expect([...board.matched, ...board.working].map((c) => c.application.id)).toContain(app.id);
    const badSave = await saveScholarship(
      request("/scholarship-applications", { method: "POST", cookie, body: { scholarshipId: "x" } }),
      NO_PARAMS,
    );
    expect(badSave.status).toBe(400);

    const path = `/scholarship-applications/${app.id}`;
    const won = await patchApplication(
      request(path, { method: "PATCH", cookie, body: { stage: "won", outcomeUsd: 1500, outcomeRenewable: false } }),
      params({ id: app.id }),
    );
    expect(won.status).toBe(200);
    expect((await readJson<ScholarshipApplication>(won)).stage).toBe("won");
    const bad = await patchApplication(
      request(path, { method: "PATCH", cookie, body: { stage: "maybe" } }),
      params({ id: app.id }),
    );
    expect(bad.status).toBe(400);
    const other = await signedInStudent(deps().db);
    const theirs = await patchApplication(
      request(path, { method: "PATCH", cookie: other.cookie, body: { stage: "lost" } }),
      params({ id: app.id }),
    );
    expect(theirs.status).toBe(404);
  });
});
