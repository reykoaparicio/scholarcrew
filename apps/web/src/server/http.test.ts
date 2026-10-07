import { createApiToken } from "@scholarcrew/core/apitokens";
import { fixedClock } from "@scholarcrew/core/shared";
import { eq, rateLimits } from "@scholarcrew/db";
import { type Actor, AppError, userActor } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  chunkedRequest,
  errorOf,
  params,
  readJson,
  request,
  signedInAdmin,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseCookie } from "./cookies";
import { setDepsForTests } from "./deps";
import {
  JSON_BODY_LIMIT,
  PUBLIC_BODY_LIMIT,
  PayloadTooLargeError,
  type RouteAuth,
  body,
  errorResponse,
  extensionPreflight,
  fileResponse,
  json,
  query,
  readTextCapped,
  requireScope,
  route,
  studentIdParam,
} from "./http";

const deps = useTestDeps();

const whoAmI = (auth: RouteAuth) => route({ auth }, async ({ actor }) => actor);
const mutate = (auth: RouteAuth, csrf?: boolean) => route({ auth, csrf }, async () => undefined);

describe("json and errorResponse", () => {
  it("writes JSON with a status and no caching", async () => {
    const res = json({ a: 1 }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("maps AppError to its status, with details only when present", async () => {
    const withDetails = errorResponse(new AppError("conflict", "Taken", { field: "email" }));
    expect(withDetails.status).toBe(409);
    expect(await withDetails.json()).toEqual({
      error: { code: "conflict", message: "Taken", details: { field: "email" } },
    });
    expect(await errorResponse(new AppError("not_found", "Gone")).json()).toEqual({
      error: { code: "not_found", message: "Gone" },
    });
  });

  it("maps a ZodError to invalid_input with the issues", async () => {
    const res = errorResponse(z.number().safeParse("x").error);
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error.code).toBe("invalid_input");
    expect(Array.isArray(error.details)).toBe(true);
  });

  it("hides unknown errors behind a 500 and logs one JSON line", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse(new Error("db exploded"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong" } });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({ level: "error", error: "unknown" });
  });

  it("sends Retry-After on rate_limited from details.retryAfterSeconds (R3A-11)", async () => {
    const message = "Too many requests. Try again in 10 minutes.";
    const limited = errorResponse(new AppError("rate_limited", message, { retryAfterSeconds: 600 }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("600");
    expect(await limited.json()).toEqual({
      error: { code: "rate_limited", message, details: { retryAfterSeconds: 600 } },
    });
    expect(
      errorResponse(new AppError("conflict", "Taken", { retryAfterSeconds: 5 })).headers.get("retry-after"),
    ).toBeNull();
    expect(errorResponse(new AppError("rate_limited", "Slow down")).headers.get("retry-after")).toBeNull();
  });
});

describe("route results", () => {
  it("returns 204 for undefined, passes a Response through, and awaits params", async () => {
    const nothing = route({ auth: "none" }, async () => undefined);
    expect((await nothing(request("/x"), NO_PARAMS)).status).toBe(204);
    const teapot = route({ auth: "none" }, async () => new Response("short and stout", { status: 418 }));
    expect((await teapot(request("/x"), NO_PARAMS)).status).toBe(418);
    const echo = route<{ id: string }>({ auth: "none" }, async (ctx) => ({
      id: ctx.params.id,
      q: ctx.url.searchParams.get("q"),
    }));
    const res = await echo(request("/things/abc?q=1"), params({ id: "abc" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "abc", q: "1" });
  });

  it("maps errors thrown by the handler", async () => {
    const limited = route({ auth: "none" }, async () => {
      throw new AppError("limit_reached", "Upgrade for more");
    });
    const res = await limited(request("/x"), NO_PARAMS);
    expect(res.status).toBe(402);
    expect((await errorOf(res)).code).toBe("limit_reached");
  });
});

describe("auth modes", () => {
  it("user: 401 without a live session, the user actor with one", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const handler = whoAmI("user");
    expect((await handler(request("/me"), NO_PARAMS)).status).toBe(401);
    const unknown = await handler(request("/me", { cookie: "sc_session=nope" }), NO_PARAMS);
    expect((await errorOf(unknown)).code).toBe("unauthenticated");
    const ok = await handler(request("/me", { cookie }), NO_PARAMS);
    expect(await readJson<Actor>(ok)).toEqual(userActor(user.id, "student"));
  });

  it("user: an expired session is 401", async () => {
    const { cookie } = await signedInStudent(deps().db);
    setDepsForTests({ ...deps(), clock: fixedClock("2026-11-06T15:00:00.000Z") });
    expect((await whoAmI("user")(request("/me", { cookie }), NO_PARAMS)).status).toBe(401);
  });

  it("admin: 401 signed out, not_found for non-admins, the actor for admins", async () => {
    const handler = whoAmI("admin");
    const student = await signedInStudent(deps().db);
    const admin = await signedInAdmin(deps().db);
    expect((await handler(request("/admin"), NO_PARAMS)).status).toBe(401);
    const denied = await handler(request("/admin", { cookie: student.cookie }), NO_PARAMS);
    expect(denied.status).toBe(404);
    expect((await errorOf(denied)).code).toBe("not_found");
    const ok = await handler(request("/admin", { cookie: admin.cookie }), NO_PARAMS);
    expect(await readJson<Actor>(ok)).toEqual(userActor(admin.user.id, "admin"));
  });

  it("optional: the public actor signed out, the user signed in", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const handler = whoAmI("optional");
    expect(await readJson<Actor>(await handler(request("/s"), NO_PARAMS))).toEqual({ kind: "public" });
    expect(await readJson<Actor>(await handler(request("/s", { cookie }), NO_PARAMS))).toEqual(
      userActor(user.id, "student"),
    );
  });

  it("bearer: resolves API tokens, ignores cookies, and exposes scopes", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const created = await createApiToken(deps(), userActor(user.id, "student"), {
      label: "Laptop",
      scopes: ["autofill"],
    });
    const autofill = route({ auth: "bearer" }, async (ctx) => {
      requireScope(ctx, "autofill");
      return { actor: ctx.actor, scopes: ctx.scopes };
    });
    const savePage = route({ auth: "bearer" }, async (ctx) => {
      requireScope(ctx, "save_page");
      return null;
    });
    const auth = { authorization: `Bearer ${created.secret}` };
    const ok = await autofill(request("/extension/autofill-profile", { headers: auth }), NO_PARAMS);
    expect(await ok.json()).toEqual({ actor: userActor(user.id, "student"), scopes: ["autofill"] });
    const wrongScope = await savePage(request("/extension/save-page", { method: "POST", headers: auth }), NO_PARAMS);
    expect(wrongScope.status).toBe(403);
    const bad = { authorization: "Bearer sct_not-a-real-token" };
    expect((await autofill(request("/x", { headers: bad }), NO_PARAMS)).status).toBe(401);
    expect((await autofill(request("/x"), NO_PARAMS)).status).toBe(401);
    expect((await autofill(request("/x", { cookie }), NO_PARAMS)).status).toBe(401);
  });
});

describe("CSRF origin check", () => {
  it("blocks cookie-authenticated mutations without the app Origin", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const handler = mutate("user");
    const evil = await handler(
      request("/profile", { method: "PATCH", cookie, origin: "https://evil.example" }),
      NO_PARAMS,
    );
    expect(evil.status).toBe(403);
    expect((await errorOf(evil)).code).toBe("forbidden");
    expect((await handler(request("/profile", { method: "PATCH", cookie, origin: null }), NO_PARAMS)).status).toBe(403);
    expect((await handler(request("/profile", { method: "PATCH", cookie }), NO_PARAMS)).status).toBe(204);
    const read = whoAmI("user");
    expect((await read(request("/me", { cookie, origin: "https://evil.example" }), NO_PARAMS)).status).toBe(200);
  });

  it("skips the check for csrf: false, public routes, and bearer routes", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    expect(
      (await mutate("user", false)(request("/x", { method: "POST", cookie, origin: null }), NO_PARAMS)).status,
    ).toBe(204);
    const evil = { method: "POST", origin: "https://evil.example" };
    expect((await mutate("none")(request("/x", evil), NO_PARAMS)).status).toBe(204);
    const created = await createApiToken(deps(), userActor(user.id, "student"), {
      label: "Ext",
      scopes: ["save_page"],
    });
    const headers = { authorization: `Bearer ${created.secret}` };
    expect((await mutate("bearer")(request("/x", { ...evil, headers }), NO_PARAMS)).status).toBe(204);
  });
});

describe("rate limits", () => {
  it("keys anonymous callers by the right-most X-Forwarded-For hop, so a spoofed first hop doesn't help", async () => {
    const handler = route({ auth: "none", rate: { key: "t", limit: 2, windowSeconds: 60 } }, async () => undefined);
    // The proxy appends the address it saw; anything before it came from the client.
    const fromA = (spoof: string) =>
      request("/x", { method: "POST", headers: { "x-forwarded-for": `${spoof}, 203.0.113.5` } });
    expect((await handler(fromA("198.51.100.1"), NO_PARAMS)).status).toBe(204);
    expect((await handler(fromA("198.51.100.2"), NO_PARAMS)).status).toBe(204);
    const limited = await handler(fromA("198.51.100.3"), NO_PARAMS);
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe("rate_limited");
    const [row] = await deps().db.select().from(rateLimits).where(eq(rateLimits.key, "t:203.0.113.5"));
    expect(row?.count).toBe(3);
    const fromB = request("/x", { method: "POST", headers: { "x-real-ip": "198.51.100.7" } });
    expect((await handler(fromB, NO_PARAMS)).status).toBe(204);
  });

  it("keys signed-in callers by user id and falls back to 'unknown' without IP headers", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const byUser = route({ auth: "user", rate: { key: "u", limit: 5, windowSeconds: 60 } }, async () => undefined);
    await byUser(request("/x", { method: "POST", cookie }), NO_PARAMS);
    const anon = route({ auth: "none", rate: { key: "n", limit: 5, windowSeconds: 60 } }, async () => undefined);
    await anon(request("/x", { method: "POST" }), NO_PARAMS);
    const keys = (await deps().db.select().from(rateLimits)).map((r) => r.key).sort();
    expect(keys).toEqual(["n:unknown", `u:${user.id}`]);
  });
});

describe("body and query", () => {
  const Input = z.strictObject({ name: z.string().min(1), n: z.number().default(1) });
  const handler = route({ auth: "none" }, async ({ req }) => body(req, Input));

  it("parses JSON bodies with the schema and rejects bad ones", async () => {
    const ok = await handler(request("/x", { method: "POST", body: { name: "Maya" } }), NO_PARAMS);
    expect(await ok.json()).toEqual({ name: "Maya", n: 1 });
    const notJson = await handler(request("/x", { method: "POST", body: "{nope" }), NO_PARAMS);
    expect(notJson.status).toBe(400);
    expect((await errorOf(notJson)).message).toBe("Request body must be JSON");
    expect((await handler(request("/x", { method: "POST" }), NO_PARAMS)).status).toBe(400);
    const wrong = await errorOf(await handler(request("/x", { method: "POST", body: { name: "" } }), NO_PARAMS));
    expect(wrong.code).toBe("invalid_input");
    expect(Array.isArray(wrong.details)).toBe(true);
  });

  it("parses query strings with the schema", () => {
    const Q = z.strictObject({ page: z.coerce.number().int().min(1) });
    expect(query(new URL("http://localhost:3000/x?page=2"), Q)).toEqual({ page: 2 });
    expect(() => query(new URL("http://localhost:3000/x?page=0"), Q)).toThrow(AppError);
  });

  it("caps JSON bodies with 413, with or without Content-Length (SE-04)", async () => {
    expect(JSON_BODY_LIMIT).toBe(256 * 1024);
    expect(PUBLIC_BODY_LIMIT).toBe(64 * 1024);
    const big = JSON.stringify({ name: "x".repeat(300 * 1024) });
    const declared = await handler(
      request("/x", { method: "POST", body: big, headers: { "content-length": String(big.length) } }),
      NO_PARAMS,
    );
    expect(declared.status).toBe(413);
    expect(await errorOf(declared)).toEqual({ code: "invalid_input", message: "Request body is too large" });
    expect((await handler(request("/x", { method: "POST", body: big }), NO_PARAMS)).status).toBe(413);
    // Chunked: no Content-Length at all. The reader stops a few chunks past the cap instead of buffering 2 MB.
    const { req, pulled } = chunkedRequest("/x", {
      chunk: new Uint8Array(64 * 1024).fill(0x20),
      count: 32,
      origin: null,
    });
    expect((await handler(req, NO_PARAMS)).status).toBe(413);
    expect(pulled()).toBeLessThan(32);
    const publicRoute = route({ auth: "none" }, async (ctx) => body(ctx.req, Input, PUBLIC_BODY_LIMIT));
    const overPublic = JSON.stringify({ name: "x".repeat(PUBLIC_BODY_LIMIT) });
    expect((await publicRoute(request("/x", { method: "POST", body: overPublic }), NO_PARAMS)).status).toBe(413);
    expect((await handler(request("/x", { method: "POST", body: overPublic }), NO_PARAMS)).status).toBe(200);
  });

  it("reads raw text through the same cap with the caller's message (webhook, CSV import)", async () => {
    expect(await readTextCapped(request("/x", { method: "POST", body: "a,b\n1,2" }), 16)).toBe("a,b\n1,2");
    expect(await readTextCapped(request("/x"), 16)).toBe("");
    await expect(
      readTextCapped(request("/x", { method: "POST", body: "x".repeat(17) }), 16, "Too big"),
    ).rejects.toMatchObject({
      status: 413,
      code: "invalid_input",
      message: "Too big",
    });
    const { req, pulled } = chunkedRequest("/x", { chunk: new TextEncoder().encode("0123456789"), count: 100 });
    await expect(readTextCapped(req, 25)).rejects.toBeInstanceOf(PayloadTooLargeError);
    expect(pulled()).toBeLessThan(100);
  });

  it("studentIdParam defaults to the caller, takes a valid id, and ignores other params (D23)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const other = "00000000-0000-4000-8000-000000000000";
    const echo = route({ auth: "user" }, async (ctx) => ({ studentId: studentIdParam(ctx) }));
    expect(await readJson(await echo(request("/x?week=2026-10-05", { cookie }), NO_PARAMS))).toEqual({
      studentId: user.id,
    });
    expect(await readJson(await echo(request(`/x?studentId=${other}`, { cookie }), NO_PARAMS))).toEqual({
      studentId: other,
    });
    expect((await echo(request("/x?studentId=nope", { cookie }), NO_PARAMS)).status).toBe(400);
  });
});

describe("cookies, files, and extension CORS", () => {
  it("reads one cookie from a Cookie header", () => {
    expect(parseCookie("a=1; sc_session=abc%3D; b=2", "sc_session")).toBe("abc=");
    expect(parseCookie("a=1", "sc_session")).toBeNull();
    expect(parseCookie(null, "sc_session")).toBeNull();
  });

  it("sends file downloads as uncached attachments", async () => {
    const res = fileResponse(Buffer.from("hello"), "text/plain", 'résumé "final".txt');
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename=\"r_sum_ _final_.txt\"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%22final%22.txt",
    );
    expect(await res.text()).toBe("hello");
    const quoted = fileResponse(Buffer.from("x"), "application/pdf", "Maya's essay (final).pdf");
    expect(quoted.headers.get("content-disposition")).toBe(
      "attachment; filename=\"Maya's essay (final).pdf\"; filename*=UTF-8''Maya%27s%20essay%20%28final%29.pdf",
    );
  });

  it("adds CORS headers for chrome-extension origins only", async () => {
    const handler = route({ auth: "none", cors: "extension" }, async () => ({ ok: true }));
    const ext = await handler(request("/x", { headers: { origin: "chrome-extension://abcdefgh" } }), NO_PARAMS);
    expect(ext.headers.get("access-control-allow-origin")).toBe("chrome-extension://abcdefgh");
    const web = await handler(request("/x", { headers: { origin: "https://evil.example" } }), NO_PARAMS);
    expect(web.headers.get("access-control-allow-origin")).toBeNull();
    const preflight = extensionPreflight(request("/x", { method: "OPTIONS", origin: "chrome-extension://abcdefgh" }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type");
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
  });
});
