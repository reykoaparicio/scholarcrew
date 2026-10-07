import { createApiToken } from "@scholarcrew/core/apitokens";
import { catalogTasks, eq, scholarshipApplications } from "@scholarcrew/db";
import { type ApiTokenScope, type AutofillProfile, type ScholarshipSummary, userActor } from "@scholarcrew/domain";
import { NO_PARAMS, errorOf, readJson, request, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as autofill, OPTIONS as autofillPreflight } from "../autofill-profile/route";
import { POST as savePage, OPTIONS as savePreflight } from "./route";

const deps = useTestDeps();
const EXT = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

async function tokenFor(scopes: ApiTokenScope[]) {
  const { user, cookie } = await signedInStudent(deps().db);
  const created = await createApiToken(deps(), userActor(user.id, "student"), { label: "Chrome", scopes });
  return { user, cookie, headers: { authorization: `Bearer ${created.secret}` } };
}

function save(headers: Record<string, string>, body: unknown): Promise<Response> {
  return savePage(request("/extension/save-page", { method: "POST", origin: EXT, headers, body }), NO_PARAMS);
}

describe("GET /extension/autofill-profile (EX-01)", () => {
  it("returns the profile for an autofill token with CORS for the extension origin", async () => {
    const { headers } = await tokenFor(["autofill"]);
    const res = await autofill(request("/extension/autofill-profile", { origin: EXT, headers }), NO_PARAMS);
    expect(res.status).toBe(200);
    expect(await readJson<AutofillProfile>(res)).toMatchObject({
      highSchool: "Maple High School",
      state: "TX",
      gpa: 3.72,
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(EXT);
    expect(res.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type");
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("is 403 without the autofill scope and 401 without a valid token", async () => {
    const saveOnly = await tokenFor(["save_page"]);
    const denied = await autofill(
      request("/extension/autofill-profile", { origin: EXT, headers: saveOnly.headers }),
      NO_PARAMS,
    );
    expect(denied.status).toBe(403);
    expect((await errorOf(denied)).code).toBe("forbidden");
    expect(denied.headers.get("access-control-allow-origin")).toBe(EXT);
    expect((await autofill(request("/extension/autofill-profile", { origin: EXT }), NO_PARAMS)).status).toBe(401);
    expect(
      (await autofill(request("/extension/autofill-profile", { cookie: saveOnly.cookie }), NO_PARAMS)).status,
    ).toBe(401);
  });
});

describe("POST /extension/save-page (EX-02)", () => {
  it("submits the page as a local scholarship with the selection as notes, and puts it on the board", async () => {
    const { user, headers } = await tokenFor(["save_page"]);
    const body = { url: "https://maplerotary.example/award", title: "Maple Rotary Award", selectedText: "Due March 1" };
    const res = await save(headers, body);
    expect(res.status).toBe(201);
    const summary = await readJson<ScholarshipSummary>(res);
    expect(summary).toMatchObject({ name: "Maple Rotary Award", unverified: true });
    expect(res.headers.get("access-control-allow-origin")).toBe(EXT);
    const [task] = await deps().db.select().from(catalogTasks).where(eq(catalogTasks.kind, "user_submission"));
    expect(task?.payload).toMatchObject({ url: body.url, name: body.title, notes: "Due March 1" });
    // R2C-12: 07 submitLocalScholarship adds one planned application for the submitter, same as the web form.
    const apps = await deps()
      .db.select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.ownerId, user.id));
    expect(apps.map((a) => ({ scholarshipId: a.scholarshipId, stage: a.stage }))).toEqual([
      { scholarshipId: summary.id, stage: "planned" },
    ]);
  });

  it("caps notes at the local submission limit and validates the body", async () => {
    const { headers } = await tokenFor(["save_page"]);
    const long = { url: "https://a.example/s", title: "Long page", selectedText: "n".repeat(1500) };
    expect((await save(headers, long)).status).toBe(201);
    const [task] = await deps().db.select().from(catalogTasks).where(eq(catalogTasks.kind, "user_submission"));
    expect(task?.payload).toMatchObject({ notes: "n".repeat(1000) });
    expect((await save(headers, { url: "https://a.example/s" })).status).toBe(400);
  });

  it("is 403 for a token without save_page, even with a bad body", async () => {
    const { headers } = await tokenFor(["autofill"]);
    expect((await save(headers, {})).status).toBe(403);
  });
});

describe("OPTIONS preflight (D11)", () => {
  it("answers 204 with CORS headers for chrome-extension origins only", async () => {
    for (const preflight of [autofillPreflight, savePreflight]) {
      const ok = preflight(request("/extension/save-page", { method: "OPTIONS", origin: EXT }));
      expect(ok.status).toBe(204);
      expect(ok.headers.get("access-control-allow-origin")).toBe(EXT);
      expect(ok.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
      expect(ok.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type");
      expect(ok.headers.get("access-control-max-age")).toBe("600");
      const web = preflight(request("/extension/save-page", { method: "OPTIONS", origin: "https://evil.example" }));
      expect(web.status).toBe(204);
      expect(web.headers.get("access-control-allow-origin")).toBeNull();
    }
  });
});
