import { ApiError, errorMessage } from "@/lib/api";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** sessionStorage key for the address on /sign-in/check-email (never in the URL). */
export const SIGNIN_EMAIL_KEY = "sc_signin_email";
export const BAD_EMAIL = "Enter a valid email address, like you@example.com.";
export const LINK_ERROR =
  "That sign-in link has expired or was already used. Enter your email and we'll send you a new one.";
export const FAMILY_JOIN_NOTE =
  "You're joining a family. After you sign in, open the invite link in your email again to accept it. Use the email address the invite was sent to.";
export const NEXT_NOTE = "Sign in to see that page. After you sign in, you'll start on This week.";
export const INVITE_GONE = "This invite is invalid or has expired. Ask for a new invite.";

/** `?error=link` comes from GET /auth/verify; `?next=` from the middleware (D15: the link can't carry it). */
export function signInNotice(sp: { error?: string; next?: string }): { error: string | null; note: string | null } {
  const error = sp.error === "link" ? LINK_ERROR : null;
  let note: string | null = null;
  if (sp.next?.startsWith("/family/join")) note = FAMILY_JOIN_NOTE;
  else if (sp.next && sp.next !== "/week") note = NEXT_NOTE;
  return { error, note };
}

export function sendErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.code === "rate_limited") {
    return "Too many sign-in links were requested. Wait 15 minutes, then try again.";
  }
  if (e instanceof ApiError && e.code === "invalid_input") return BAD_EMAIL;
  return errorMessage(e);
}

export function joinErrorMessage(e: unknown): string {
  // invalid_input: a truncated link fails AcceptInviteInput, which reads the same as a dead invite.
  if (e instanceof ApiError && (e.code === "not_found" || e.code === "invalid_input")) {
    return "This invite is invalid or has expired, or it was sent to a different email. Ask for a new invite.";
  }
  return errorMessage(e);
}
