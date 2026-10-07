import { setDepsForTests } from "@/server/deps";
import { invite } from "@scholarcrew/core/family";
import { fixedClock } from "@scholarcrew/core/shared";
import { eq, sessions } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type MeResponse, userActor } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  latestEmail,
  readJson,
  request,
  sessionCookieFrom,
  signedInStudent,
  tokenFrom,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it, vi } from "vitest";
import { GET as latestOutbox } from "../dev/outbox/latest/route";
import { GET as getMe } from "../me/route";
import { POST as requestLink } from "./magic-link/route";
import { POST as signOutAll } from "./sign-out-all/route";
import { POST as signOut } from "./sign-out/route";
import { GET as verify } from "./verify/route";

const deps = useTestDeps();
const CLEARED_COOKIE = "sc_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

function askForLink(email: string, ip = "203.0.113.9"): Promise<Response> {
  return requestLink(
    request("/auth/magic-link", { method: "POST", body: { email }, headers: { "x-forwarded-for": ip } }),
    NO_PARAMS,
  );
}

function openLink(token: string): Promise<Response> {
  return verify(request(`/auth/verify?token=${token}`, { headers: { "user-agent": "vitest" } }), NO_PARAMS);
}

describe("magic-link sign in", () => {
  it("ends the browser's old session before setting the newly verified session", async () => {
    const old = await signedInStudent(deps().db);
    await askForLink("fresh@example.test");
    const token = tokenFrom((await latestEmail(deps().db, "fresh@example.test")).text);
    const response = await verify(request(`/auth/verify?token=${token}`, { cookie: old.cookie }), NO_PARAMS);
    expect(response.status).toBe(303);
    expect((await getMe(request("/me", { cookie: old.cookie }), NO_PARAMS)).status).toBe(401);
    expect((await getMe(request("/me", { cookie: sessionCookieFrom(response) }), NO_PARAMS)).status).toBe(200);
  });

  it("rejects a cross-origin magic-link request", async () => {
    const response = await requestLink(
      request("/auth/magic-link", {
        method: "POST",
        origin: "https://evil.test",
        body: { email: "student@example.test" },
      }),
      NO_PARAMS,
    );
    expect(response.status).toBe(403);
  });

  it("signs a new user in: request, dev outbox, verify, cookie, /me", async () => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "1");
    expect((await askForLink("Maya@Example.test")).status).toBe(204);

    const outbox = await latestOutbox(request("/dev/outbox/latest?to=maya@example.test"), NO_PARAMS);
    expect(outbox.status).toBe(200);
    const mail = await readJson<{ subject: string; text: string }>(outbox);
    expect(mail.subject).toBe("Your ScholarCrew sign-in link");
    expect(mail.text).toContain("http://localhost:3000/api/v1/auth/verify?token=");

    const verified = await openLink(tokenFrom(mail.text));
    expect(verified.status).toBe(303);
    expect(verified.headers.get("location")).toBe("http://localhost:3000/onboarding");
    expect(verified.headers.get("set-cookie")).toMatch(
      /^sc_session=[A-Za-z0-9_-]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/,
    );
    expect(verified.headers.get("cache-control")).toBe("no-store");

    const me = await getMe(request("/me", { cookie: sessionCookieFrom(verified) }), NO_PARAMS);
    expect(me.status).toBe(200);
    const body = await readJson<MeResponse>(me);
    expect(body.user.email).toBe("maya@example.test");
    expect(body.onboardingComplete).toBe(false);

    const reused = await openLink(tokenFrom(mail.text));
    expect(reused.status).toBe(303);
    expect(reused.headers.get("location")).toBe("http://localhost:3000/sign-in?error=link");
    expect(reused.headers.get("set-cookie")).toBeNull();
  });

  it("sends an onboarded student to /week", async () => {
    await factories.student(deps().db, { email: "lena@example.test" });
    await askForLink("lena@example.test");
    const verified = await openLink(tokenFrom((await latestEmail(deps().db, "lena@example.test")).text));
    expect(verified.headers.get("location")).toBe("http://localhost:3000/week");
  });

  it("signs a new parent invitee in as a parent and sends them to /week (R2I-2)", async () => {
    const student = await signedInStudent(deps().db);
    // Core call: the /family/invites route is M10's, and this test runs at M7.
    await invite(deps(), userActor(student.user.id, "student"), { email: "dana@example.test" });
    await askForLink("dana@example.test");
    const verified = await openLink(tokenFrom((await latestEmail(deps().db, "dana@example.test")).text));
    expect(verified.status).toBe(303);
    expect(verified.headers.get("location")).toBe("http://localhost:3000/week");
    const me = await readJson<MeResponse>(
      await getMe(request("/me", { cookie: sessionCookieFrom(verified) }), NO_PARAMS),
    );
    expect(me.user.role).toBe("parent");
    expect(me.onboardingComplete).toBe(true);
  });

  it("sends bad or missing tokens back to sign in", async () => {
    for (const path of ["/auth/verify?token=nope", "/auth/verify"]) {
      const res = await verify(request(path), NO_PARAMS);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("http://localhost:3000/sign-in?error=link");
    }
  });

  it("rejects malformed requests", async () => {
    const bad = await askForLink("not-an-email");
    expect(bad.status).toBe(400);
    expect((await errorOf(bad)).code).toBe("invalid_input");
    const empty = await requestLink(request("/auth/magic-link", { method: "POST" }), NO_PARAMS);
    expect(empty.status).toBe(400);
    const huge = await askForLink(`${"a".repeat(70_000)}@example.test`);
    expect(huge.status).toBe(413);
  });

  it("limits links to 5 per 15 minutes per email (SE-04)", async () => {
    for (let i = 1; i <= 5; i += 1) {
      expect((await askForLink("sam@example.test", `198.51.100.${i}`)).status).toBe(204);
    }
    const limited = await askForLink("sam@example.test", "198.51.100.99");
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe("rate_limited");
    // R3A-11: seconds until the window ends, from the limiter's details.
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
  });

  it("limits links to 5 per 15 minutes per IP (SE-04)", async () => {
    for (let i = 1; i <= 5; i += 1) {
      expect((await askForLink(`kid${i}@example.test`, "192.0.2.10")).status).toBe(204);
    }
    expect((await askForLink("kid6@example.test", "192.0.2.10")).status).toBe(429);
  });
});

describe("sessions", () => {
  it("sign out everywhere ends sessions and clears the current cookie", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await signOutAll(request("/auth/sign-out-all", { method: "POST", cookie }), NO_PARAMS);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toBe(CLEARED_COOKIE);
    expect((await getMe(request("/me", { cookie }), NO_PARAMS)).status).toBe(401);
  });

  it("returns 401 from /me without a session", async () => {
    const res = await getMe(request("/me"), NO_PARAMS);
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("unauthenticated");
  });

  it("sign out deletes the session server-side and clears the cookie", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const evil = await signOut(
      request("/auth/sign-out", { method: "POST", cookie, origin: "https://evil.example" }),
      NO_PARAMS,
    );
    expect(evil.status).toBe(403);
    const res = await signOut(request("/auth/sign-out", { method: "POST", cookie }), NO_PARAMS);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toBe(CLEARED_COOKIE);
    expect((await getMe(request("/me", { cookie }), NO_PARAMS)).status).toBe(401);
  });

  it("sign out still clears the cookie for an expired or missing session (R3A-13)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    setDepsForTests({ ...deps(), clock: fixedClock("2026-11-06T15:00:00.000Z") });
    const expired = await signOut(request("/auth/sign-out", { method: "POST", cookie }), NO_PARAMS);
    expect(expired.status).toBe(204);
    expect(expired.headers.get("set-cookie")).toBe(CLEARED_COOKIE);
    expect(await deps().db.select().from(sessions).where(eq(sessions.userId, user.id))).toEqual([]);
    const none = await signOut(request("/auth/sign-out", { method: "POST" }), NO_PARAMS);
    expect(none.status).toBe(204);
    expect(none.headers.get("set-cookie")).toBe(CLEARED_COOKIE);
  });
});

describe("GET /dev/outbox/latest", () => {
  it("exists only with ENABLE_DEV_ROUTES=1 outside production", async () => {
    await askForLink("ana@example.test");
    const read = () => latestOutbox(request("/dev/outbox/latest?to=ana@example.test"), NO_PARAMS);
    vi.stubEnv("ENABLE_DEV_ROUTES", "");
    expect((await read()).status).toBe(404);
    vi.stubEnv("ENABLE_DEV_ROUTES", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect((await read()).status).toBe(404);
    vi.stubEnv("NODE_ENV", "test");
    expect((await read()).status).toBe(200);
    expect((await latestOutbox(request("/dev/outbox/latest?to=nobody@example.test"), NO_PARAMS)).status).toBe(404);
    expect((await latestOutbox(request("/dev/outbox/latest"), NO_PARAMS)).status).toBe(400);
  });
});
