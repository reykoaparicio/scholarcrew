import { notify } from "@scholarcrew/core/notifications";
import { findDueReminders } from "@scholarcrew/core/plan";
import { calendarShort } from "@scholarcrew/core/shared";
import { eq, scholarshipApplications, scholarships } from "@scholarcrew/db";
import type { Reminder } from "@scholarcrew/domain";
import { JobPayloads } from "@scholarcrew/jobs";
import { log } from "../log";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/** Where each reminder opens (R3E-9). 08 sets a college reminder's refId to the list entry id. Anything else opens /week. */
const LINKS: Record<string, (refId: string) => string> = {
  scholarship_application: () => "/scholarships",
  college_list: (id) => `/colleges/${id}`,
};

/** "Due Oct 15. Plan time for it this week." (R3E-8, R3E-9). */
export function deadlineBody(dueOn: string): string {
  return `Due ${calendarShort(dueOn)}. Plan time for it this week.`;
}

/** Plan 08's renewal reminders (SC-11, D2): offset 30, dedupeKey renewal:<applicationId>:<year>. */
export function isRenewal(r: Reminder): boolean {
  return r.offset === 30 && r.dedupeKey.startsWith("renewal:");
}

export function renewalBody(dueOn: string): string {
  return `Your award renews around ${calendarShort(dueOn)}. Check what the provider needs to renew it, like grades or a form, and plan time for it.`;
}

/** The won award's detail page, or the board when the application or listing is gone. */
async function renewalLink(deps: WorkerDeps, applicationId: string): Promise<string> {
  const [row] = await deps.core.db
    .select({ slug: scholarships.slug })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(eq(scholarshipApplications.id, applicationId));
  return row ? `/scholarships/${row.slug}` : "/scholarships";
}

/** NO-03 and SC-11, hourly. Dedupe keys (reminder:<refType>:<refId>:<offset>, renewal:<appId>:<year>) make reruns no-ops. */
export async function handleRemindersDeadlines(deps: WorkerDeps, data: unknown): Promise<void> {
  JobPayloads["reminders.deadlines"].parse(data);
  const due = await findDueReminders(deps.core, SYSTEM);
  let created = 0;
  for (const r of due) {
    const renewal = isRenewal(r);
    const note = await notify(deps.core, SYSTEM, {
      userId: r.userId,
      kind: "deadline",
      title: r.title,
      body: renewal ? renewalBody(r.dueOn) : deadlineBody(r.dueOn),
      link: renewal ? await renewalLink(deps, r.refId) : (LINKS[r.refType]?.(r.refId) ?? "/week"),
      dedupeKey: r.dedupeKey,
      email: true,
      // NO-05 (R2I-9): only the 1-day deadline reminder is texted, and core enqueues notify.sms only when opted in.
      sms: r.offset === 1 && !renewal,
    });
    if (note) created += 1;
  }
  log("info", "reminders.deadlines", { due: due.length, created });
}
