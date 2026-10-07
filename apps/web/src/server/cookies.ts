import { SESSION_COOKIE } from "@scholarcrew/core/auth";

const DAY_SECONDS = 86_400;
// ID-02. Browsers accept Secure cookies on http://localhost, so dev and e2e use the same attributes.
const ATTRIBUTES = "Path=/; HttpOnly; Secure; SameSite=Lax";

/** One cookie's value from a Cookie request header, or null. */
export function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    const raw = part.slice(at + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/** Set-Cookie value for a new session. */
export function sessionCookie(token: string, maxAgeDays: number): string {
  return `${SESSION_COOKIE}=${token}; ${ATTRIBUTES}; Max-Age=${Math.floor(maxAgeDays * DAY_SECONDS)}`;
}

/** Set-Cookie value that removes the session cookie. */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`;
}
