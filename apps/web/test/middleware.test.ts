import { SESSION_COOKIE } from "@scholarcrew/core/auth";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, middleware } from "../src/middleware";
import { PROTECTED_PREFIXES, SESSION_COOKIE_NAME, isProtectedPath } from "../src/server/protected";

const at = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, cookie ? { headers: { cookie } } : undefined);

describe("middleware", () => {
  it("forwards unique nonces and emits a restrictive CSP", () => {
    const a = middleware(at("/", "sc_session=anything"));
    const b = middleware(at("/crew", "sc_session=anything"));
    const nonce = a.headers.get("x-middleware-request-x-nonce");
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]{22,}$/);
    expect(nonce).not.toBe(b.headers.get("x-middleware-request-x-nonce"));
    const csp = a.headers.get("Content-Security-Policy");
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(a.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  });

  it("redirects signed-out visitors on app pages to sign in with the path to come back to", () => {
    const res = middleware(at("/essays/123?tab=draft"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/sign-in?next=%2Fessays%2F123%3Ftab%3Ddraft");
    expect(middleware(at("/week")).headers.get("location")).toBe("http://localhost:3000/sign-in?next=%2Fweek");
    expect(middleware(at("/admin/tasks", "sc_session=")).status).toBe(307);
  });

  it("lets a request with a session cookie through and forwards the path to layouts (D30)", () => {
    const res = middleware(at("/week", "sc_session=anything"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/week");
    const spoofed = new NextRequest("http://localhost:3000/onboarding", {
      headers: { cookie: "sc_session=anything", "x-pathname": "/week" },
    });
    expect(middleware(spoofed).headers.get("x-middleware-request-x-pathname")).toBe("/onboarding");
  });

  it("ignores public paths and look-alike prefixes", () => {
    for (const path of ["/", "/sign-in", "/directory/TX", "/h/token", "/weekly", "/api/v1/me", "/family/join"]) {
      expect(isProtectedPath(path)).toBe(false);
      expect(middleware(at(path)).headers.get("x-middleware-next")).toBe("1");
    }
    // D37: /family/join shows the invite preview before sign-in; the rest of /family needs a session.
    expect(isProtectedPath("/family")).toBe(true);
    expect(isProtectedPath("/family/joined")).toBe(true);
  });

  it("protects the listed prefixes and applies CSP to document requests", () => {
    expect(PROTECTED_PREFIXES).toEqual([
      "/week",
      "/crew",
      "/scholarships",
      "/essays",
      "/colleges",
      "/money",
      "/prep",
      "/impact",
      "/memory",
      "/family",
      "/settings",
      "/onboarding",
      "/admin",
    ]);
    expect(config.matcher[0]?.source).toBe("/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)");
    expect(config.matcher[0]?.missing).toEqual([
      { type: "header", key: "next-router-prefetch" },
      { type: "header", key: "purpose", value: "prefetch" },
    ]);
    expect(SESSION_COOKIE_NAME).toBe(SESSION_COOKIE);
  });
});
