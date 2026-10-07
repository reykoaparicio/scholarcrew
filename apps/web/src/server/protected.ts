/** Same value as SESSION_COOKIE in @scholarcrew/core/auth (a test keeps them equal). */
export const SESSION_COOKIE_NAME = "sc_session";

/** App pages that need a signed-in user. */
export const PROTECTED_PREFIXES = [
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
] as const;

/** Pages under a protected prefix that signed-out visitors may open. /family/join previews the invite (D37). */
export const PUBLIC_EXCEPTIONS = ["/family/join"] as const;

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  if (PUBLIC_EXCEPTIONS.some((p) => under(pathname, p))) return false;
  return PROTECTED_PREFIXES.some((p) => under(pathname, p));
}
