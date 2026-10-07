import { clearSessionCookie, parseCookie } from "@/server/cookies";
import { route } from "@/server/http";
import { SESSION_COOKIE, signOut } from "@scholarcrew/core/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// R3A-13: "optional" still runs the Origin check, and an expired or unknown session still gets its
// cookie cleared (the middleware only checks that the cookie exists). Always 204.
export const POST = route({ auth: "optional" }, async ({ req, deps }) => {
  const token = parseCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (token) await signOut(deps, token);
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": clearSessionCookie(), "cache-control": "no-store" },
  });
});
