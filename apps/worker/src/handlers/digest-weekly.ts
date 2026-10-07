import { notify, retractNotification, secondsUntilQuietEnd } from "@scholarcrew/core/notifications";
import { buildWeeklyDigest } from "@scholarcrew/core/plan";
import { and, eq, notificationPrefs, notifications, users } from "@scholarcrew/db";
import { weekStartFor } from "@scholarcrew/engines";
import { JobPayloads } from "@scholarcrew/jobs";
import { errorLabel, log } from "../log";
import { localWeekdayHour, safeTimeZone } from "../time";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/** notificationPrefs defaults (00-overview §8) for students without a prefs row. */
const DEFAULT_DIGEST_DAY = 0;
const DEFAULT_DIGEST_HOUR = 16;
const DEFAULT_QUIET_START = 21;
const DEFAULT_QUIET_END = 7;

/** Whether a local hour falls in the quiet window [start, end), which may wrap midnight. start === end means none. */
export function inQuietWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** The hour the digest may go: the quiet window's end when the chosen hour falls inside it (R2I-16). */
export function effectiveDigestHour(digestHour: number, quietStart: number, quietEnd: number): number {
  return inQuietWindow(digestHour, quietStart, quietEnd) ? quietEnd : digestHour;
}

/**
 * NO-02, hourly at :05. On their digest day (in their zone), each active student gets one email per week at the
 * first run at or after the effective hour that isn't in quiet hours (R2I-16), so a missed hour catches up later
 * that day. A student whose `digest:<id>:<weekStart>` notification exists is skipped before the digest is built.
 * When the send fails, the notification is retracted so the next hourly run that day tries again.
 */
export async function handleDigestWeekly(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["digest.weekly"].parse(data);
  const now = deps.core.clock.now();
  const rows = await deps.core.db
    .select({
      id: users.id,
      timeZone: users.timeZone,
      digestDay: notificationPrefs.digestDay,
      digestHour: notificationPrefs.digestHour,
      quietStartHour: notificationPrefs.quietStartHour,
      quietEndHour: notificationPrefs.quietEndHour,
    })
    .from(users)
    .leftJoin(notificationPrefs, eq(notificationPrefs.userId, users.id))
    .where(and(eq(users.role, "student"), eq(users.status, "active")));
  let sent = 0;
  for (const row of rows) {
    const zone = safeTimeZone(row.timeZone);
    const quietStart = row.quietStartHour ?? DEFAULT_QUIET_START;
    const quietEnd = row.quietEndHour ?? DEFAULT_QUIET_END;
    const effectiveHour = effectiveDigestHour(row.digestHour ?? DEFAULT_DIGEST_HOUR, quietStart, quietEnd);
    const local = localWeekdayHour(now, zone);
    if (local.weekday !== (row.digestDay ?? DEFAULT_DIGEST_DAY) || local.hour < effectiveHour) continue;
    if (secondsUntilQuietEnd(now, zone, quietStart, quietEnd) !== 0) continue;
    const dedupeKey = `digest:${row.id}:${weekStartFor(now, zone)}`;
    const [already] = await deps.core.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, row.id), eq(notifications.dedupeKey, dedupeKey)));
    if (already) continue;
    try {
      const digest = await buildWeeklyDigest(deps.core, SYSTEM, row.id);
      if (!digest) continue;
      const note = await notify(deps.core, SYSTEM, {
        userId: row.id,
        kind: "digest",
        title: digest.subject,
        body: "Your weekly digest is in your email.",
        link: "/week",
        dedupeKey,
      });
      if (!note) continue;
      try {
        await deps.core.email.send({ to: digest.email, subject: digest.subject, text: digest.text });
        sent += 1;
      } catch (e) {
        await retractNotification(deps.core, SYSTEM, note.id);
        throw e;
      }
    } catch (e) {
      log("error", "digest.failed", { userId: row.id, error: errorLabel(e) });
    }
  }
  log("info", "digest.weekly", { candidates: rows.length, sent });
}
