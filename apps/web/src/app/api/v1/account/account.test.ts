import { setDepsForTests } from "@/server/deps";
import { buildExport } from "@scholarcrew/core/account";
import { createApiToken, resolveApiToken } from "@scholarcrew/core/apitokens";
import { fixedClock } from "@scholarcrew/core/shared";
import { type ApiToken, type ApiTokenCreated, type ExportRecord, systemActor, userActor } from "@scholarcrew/domain";
import { NO_PARAMS, errorOf, params, readJson, request, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { DELETE as revokeToken } from "../extension/tokens/[id]/route";
import { POST as createToken, GET as listTokens } from "../extension/tokens/route";
import { GET as getMe } from "../me/route";
import { POST as requestExport } from "./export/route";
import { GET as getExport } from "./exports/[id]/route";
import { GET as getLatestExport } from "./exports/latest/route";
import { DELETE as deleteAccount } from "./route";

const deps = useTestDeps();

const askForExport = (cookie: string) =>
  requestExport(request("/account/export", { method: "POST", cookie }), NO_PARAMS);

describe("account export (ME-08)", () => {
  it("records the request and queues the export job", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await askForExport(cookie);
    expect(res.status).toBe(201);
    const record = await readJson<ExportRecord>(res);
    expect(record).toMatchObject({ status: "queued", downloadUrl: null });
    expect(deps().jobs.sent).toEqual([{ name: "account.export", payload: { exportId: record.id } }]);
  });

  it("serves the file once it's ready, only to its owner", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const record = await readJson<ExportRecord>(await askForExport(cookie));
    const id = params({ id: record.id });
    const path = `/account/exports/${record.id}`;

    const pending = await getExport(request(path, { cookie }), id);
    expect(pending.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect((await readJson<ExportRecord>(pending)).status).toBe("queued");

    await buildExport(deps(), systemActor("test"), record.id, { lastAttempt: true });
    const file = await getExport(request(path, { cookie }), id);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toBe(
      "attachment; filename=\"scholarcrew-export-2026-10-06.json\"; filename*=UTF-8''scholarcrew-export-2026-10-06.json",
    );
    expect(file.headers.get("cache-control")).toBe("no-store");
    const contents = await readJson<{ generatedAt: string; markdown: string }>(file);
    expect(contents.generatedAt).toBe("2026-10-06T15:00:00.000Z");
    expect(typeof contents.markdown).toBe("string");

    expect((await getExport(request(path, { cookie: other.cookie }), id)).status).toBe(404);
  });

  it("serves the Markdown alone with ?format=md and refuses other formats (R3E-11)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const record = await readJson<ExportRecord>(await askForExport(cookie));
    const id = params({ id: record.id });
    const path = `/account/exports/${record.id}`;
    await buildExport(deps(), systemActor("test"), record.id, { lastAttempt: true });

    const md = await getExport(request(`${path}?format=md`, { cookie }), id);
    expect(md.status).toBe(200);
    expect(md.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(md.headers.get("content-disposition")).toBe(
      "attachment; filename=\"scholarcrew-export-2026-10-06.md\"; filename*=UTF-8''scholarcrew-export-2026-10-06.md",
    );
    expect(await md.text()).toMatch(/^# ScholarCrew export/);

    const asJson = await getExport(request(`${path}?format=json`, { cookie }), id);
    expect(asJson.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const pdf = await getExport(request(`${path}?format=pdf`, { cookie }), id);
    expect(pdf.status).toBe(400);
    expect((await errorOf(pdf)).code).toBe("invalid_input");
  });

  it("limits export requests to 5 a day (SE-04)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await askForExport(cookie)).status);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it("returns the caller's newest unexpired export, or null (D27)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const latest = async (c: string) =>
      readJson<ExportRecord | null>(
        await getLatestExport(request("/account/exports/latest", { cookie: c }), NO_PARAMS),
      );
    expect(await latest(cookie)).toBeNull();
    await askForExport(cookie);
    setDepsForTests({ ...deps(), clock: fixedClock("2026-10-06T16:00:00.000Z") });
    const newer = await readJson<ExportRecord>(await askForExport(cookie));
    expect((await latest(cookie))?.id).toBe(newer.id);
    expect(await latest(other.cookie)).toBeNull();
    expect((await getLatestExport(request("/account/exports/latest"), NO_PARAMS)).status).toBe(401);
  });
});

describe("DELETE /account (ID-05)", () => {
  it("revokes the session and extension tokens at once and clears the cookie", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const token = await createApiToken(deps(), userActor(user.id, "student"), {
      label: "Laptop",
      scopes: ["autofill"],
    });
    const evil = await deleteAccount(
      request("/account", { method: "DELETE", cookie, origin: "https://evil.example" }),
      NO_PARAMS,
    );
    expect(evil.status).toBe(403);
    expect((await getMe(request("/me", { cookie }), NO_PARAMS)).status).toBe(200);

    const res = await deleteAccount(request("/account", { method: "DELETE", cookie }), NO_PARAMS);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toBe("sc_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
    expect((await getMe(request("/me", { cookie }), NO_PARAMS)).status).toBe(401);
    expect(await resolveApiToken(deps(), token.secret)).toBeNull();
  });
});

describe("extension tokens", () => {
  it("returns the secret once, lists tokens without it, and revokes them", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const res = await createToken(
      request("/extension/tokens", { method: "POST", cookie, body: { label: "Chrome on laptop" } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(201);
    const created = await readJson<ApiTokenCreated>(res);
    expect(created.secret).toMatch(/^sct_[A-Za-z0-9_-]{8,200}$/);
    expect(created.token.scopes).toEqual(["autofill", "save_page"]);
    expect(await resolveApiToken(deps(), created.secret)).not.toBeNull();

    const listed = await (await listTokens(request("/extension/tokens", { cookie }), NO_PARAMS)).text();
    expect((JSON.parse(listed) as ApiToken[]).map((t) => t.id)).toEqual([created.token.id]);
    expect(listed).not.toContain(created.secret);

    const id = params({ id: created.token.id });
    const path = `/extension/tokens/${created.token.id}`;
    expect((await revokeToken(request(path, { method: "DELETE", cookie: other.cookie }), id)).status).toBe(404);
    expect((await revokeToken(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
    expect(await resolveApiToken(deps(), created.secret)).toBeNull();
    const after = await readJson<ApiToken[]>(await listTokens(request("/extension/tokens", { cookie }), NO_PARAMS));
    expect(after[0]?.revokedAt).toBe("2026-10-06T15:00:00.000Z");

    const blank = await createToken(
      request("/extension/tokens", { method: "POST", cookie, body: { label: "" } }),
      NO_PARAMS,
    );
    expect(blank.status).toBe(400);
  });
});
