import { getDeps } from "@/server/deps";
import { clientIp } from "@/server/http";
import { consumeRateLimit } from "@scholarcrew/core/ratelimit";
import { isAppError } from "@scholarcrew/domain";
import { headers } from "next/headers";

export type PageRate = { key: string; limit: number; windowSeconds: number };

/** Same keys and limits as the API routes in plan 14, so a token can't be guessed faster through the page. */
export const HELPER_VIEW_RATE: PageRate = { key: "helper-view", limit: 60, windowSeconds: 3600 };
export const VERIFY_HOURS_RATE: PageRate = { key: "verify-hours", limit: 10, windowSeconds: 3600 };

/**
 * Charges `${key}:${ip}` (the route() bucket for signed-out callers), with 13's `clientIp` (right-most
 * X-Forwarded-For hop), so a spoofed first hop can't open a fresh bucket. False once the limit is reached.
 */
export async function allowPageRequest(rate: PageRate): Promise<boolean> {
  const ip = clientIp(new Request("http://localhost/", { headers: await headers() }));
  try {
    await consumeRateLimit(getDeps(), {
      key: `${rate.key}:${ip}`,
      limit: rate.limit,
      windowSeconds: rate.windowSeconds,
    });
    return true;
  } catch (e) {
    if (isAppError(e) && e.code === "rate_limited") return false;
    throw e;
  }
}
