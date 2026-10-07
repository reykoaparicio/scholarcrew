import { type APIRequestContext, type BrowserContext, request } from "@playwright/test";
import { BASE_URL } from "./env";

/** The sc_session cookie value from a signed-in browser context. */
export async function sessionCookie(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find((c) => c.name === "sc_session");
  if (!cookie) throw new Error("This context has no sc_session cookie");
  return cookie.value;
}

/** A bare HTTP client that sends the session cookie explicitly and no Origin unless a request adds one. */
export async function rawClient(sessionToken: string, ip: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { cookie: `sc_session=${sessionToken}`, "x-forwarded-for": ip },
  });
}
