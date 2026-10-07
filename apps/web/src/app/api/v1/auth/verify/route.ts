import { parseCookie, sessionCookie } from "@/server/cookies";
import { route } from "@/server/http";
import { SESSION_COOKIE, signOut, verifyMagicLink } from "@scholarcrew/core/auth";
import { getMe } from "@scholarcrew/core/profile";
import { isAppError, userActor } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function seeOther(location: string, setCookie?: string): Response {
  const headers = new Headers({ location, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  if (setCookie) headers.set("set-cookie", setCookie);
  return new Response(null, { status: 303, headers });
}

export const GET = route({ auth: "none" }, async ({ req, deps, url }) => {
  let verified: Awaited<ReturnType<typeof verifyMagicLink>>;
  try {
    verified = await verifyMagicLink(deps, {
      token: url.searchParams.get("token") ?? "",
      userAgent: req.headers.get("user-agent") ?? "",
    });
  } catch (e) {
    if (isAppError(e)) return seeOther(`${deps.config.appUrl}/sign-in?error=link`);
    throw e;
  }
  const previous = parseCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (previous) await signOut(deps, previous);
  const me = await getMe(deps, userActor(verified.user.id, verified.user.role));
  // R2I-2: only students onboard. A new account made from a pending parent invite is a parent, so getMe
  // reports onboardingComplete and the parent lands on /week (18's FAMILY_JOIN_NOTE says to reopen the invite).
  const next = me.onboardingComplete ? "/week" : "/onboarding";
  return seeOther(`${deps.config.appUrl}${next}`, sessionCookie(verified.sessionToken, deps.config.sessionDays));
});
