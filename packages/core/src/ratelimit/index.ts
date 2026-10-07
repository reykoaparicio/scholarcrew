import { rateLimits, sql } from "@scholarcrew/db";
import { AppError } from "@scholarcrew/domain";
import { type CoreDeps, one } from "../shared";

/**
 * Fixed-window counter in one atomic upsert. A row whose window started at or before
 * now - windowSeconds restarts at count 1; otherwise the count goes up by one.
 */
export async function consumeRateLimit(
  deps: CoreDeps,
  i: { key: string; limit: number; windowSeconds: number },
): Promise<void> {
  const now = deps.clock.now();
  const nowIso = now.toISOString();
  const cutoffIso = new Date(now.getTime() - i.windowSeconds * 1000).toISOString();
  const rows = await deps.db
    .insert(rateLimits)
    .values({ key: i.key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        windowStart: sql`case when ${rateLimits.windowStart} <= ${cutoffIso}::timestamptz then ${nowIso}::timestamptz else ${rateLimits.windowStart} end`,
        count: sql`case when ${rateLimits.windowStart} <= ${cutoffIso}::timestamptz then 1 else ${rateLimits.count} + 1 end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
  const row = one(rows, "rate_limits upsert");
  if (row.count > i.limit) {
    // R3A-11: seconds until this window ends, at least 1. 13's errorResponse copies it into Retry-After.
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((row.windowStart.getTime() + i.windowSeconds * 1000 - now.getTime()) / 1000),
    );
    throw new AppError("rate_limited", `Too many requests. Try again in ${waitText(retryAfterSeconds)}.`, {
      retryAfterSeconds,
    });
  }
}

/** "a minute" up to 60 s, "<n> minutes" under an hour, then "<n> hour(s)"; always rounded up. */
export function waitText(seconds: number): string {
  if (seconds <= 60) return "a minute";
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutes`;
  const hours = Math.ceil(seconds / 3600);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}
