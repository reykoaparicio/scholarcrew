import {
  and,
  collegeList,
  colleges,
  eq,
  inArray,
  isNotNull,
  isNull,
  notificationPrefs,
  scholarshipApplications,
  scholarships,
  users,
} from "@scholarcrew/db";
import { APP_PLAN_LABELS, type Actor, type Digest, type IsoDate, type Reminder } from "@scholarcrew/domain";
import { formatUsd, reminderOffsetsDue } from "@scholarcrew/engines";
import { assertSystem } from "../access";
import { lastSweep, liveListingWhere } from "../scholarships";
import { type CoreDeps, calendarShort, currentSeason, isUuid, safeTimeZone, todayIn } from "../shared";
import { ACTIVE_LIST_STATUSES, OPEN_APP_STAGES, addIsoDays, firstName, planDeadline } from "./common";
import { collectDeadlines } from "./deadlines";
import { loadWeekPlan } from "./items";

const DAY_MS = 86_400_000;
const DIGEST_DEADLINE_DAYS = 14;
const FRESH_SWEEP_DAYS = 7;
const RENEWAL_OFFSET = 30;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function daysLeftText(daysLeft: number): string {
  if (daysLeft <= 0) return "due today";
  return `${plural(daysLeft, "day", "days")} left`;
}

/** Plain-text weekly email for an active student, or null when there's nothing to say or email is off. */
export async function buildWeeklyDigest(deps: CoreDeps, system: Actor, userId: string): Promise<Digest | null> {
  assertSystem(system);
  if (!isUuid(userId)) return null;
  const [user] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!user || user.role !== "student" || user.status !== "active") return null;
  const [prefs] = await deps.db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
  if (prefs && !prefs.emailEnabled) return null;

  const now = deps.clock.now();
  const plan = await loadWeekPlan(deps, userId);
  const open = plan.items.filter((i) => i.status === "todo");
  const soon = (await collectDeadlines(deps, userId)).filter((d) => d.daysLeft <= DIGEST_DEADLINE_DAYS);
  const sweep = await lastSweep(deps, system, userId);
  const fresh =
    sweep && sweep.newMatches > 0 && now.getTime() - new Date(sweep.ranAt).getTime() <= FRESH_SWEEP_DAYS * DAY_MS
      ? sweep
      : null;
  if (open.length === 0 && soon.length === 0 && !fresh) return null;

  const lines: string[] = [`Hi ${firstName(user.displayName)},`, ""];
  if (open.length > 0) {
    lines.push(`This week's plan (${open.length} open):`);
    // R3E-8: calendar dates read "Oct 15", like the web screens.
    for (const i of open)
      lines.push(`- ${i.title} (${i.minutes} min${i.dueOn ? `, due ${calendarShort(i.dueOn)}` : ""})`);
    lines.push("");
  }
  if (soon.length > 0) {
    lines.push(`Coming up in the next ${DIGEST_DEADLINE_DAYS} days:`);
    for (const d of soon) lines.push(`- ${d.title}: ${daysLeftText(d.daysLeft)} (${calendarShort(d.dueOn)})`);
    lines.push("");
  }
  if (fresh) {
    lines.push(
      `Scout found ${plural(fresh.newMatches, "new match", "new matches")} worth up to ${formatUsd(fresh.totalUsd)}.`,
    );
    lines.push("");
  }
  lines.push(`Open your week: ${deps.config.appUrl}/week`, "", "Change digest settings any time in Settings.");
  return {
    userId,
    email: user.email,
    subject: `Your week: ${plural(open.length, "step", "steps")}, ${plural(soon.length, "deadline", "deadlines")} coming up`,
    text: lines.join("\n"),
    weekStart: plan.weekStart,
  };
}

function reminderTitle(name: string, offset: 7 | 3 | 1): string {
  return offset === 1 ? `${name} is due tomorrow` : `${name} is due in ${offset} days`;
}

/** True when `date` is a later-year anniversary of `wonOn`. A Feb 29 win renews on Feb 28 in other years. */
export function isRenewalAnniversary(wonOn: IsoDate, date: IsoDate): boolean {
  const year = Number(date.slice(0, 4));
  if (year <= Number(wonOn.slice(0, 4))) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const monthDay = wonOn.slice(5) === "02-29" && !leap ? "02-28" : wonOn.slice(5);
  return date.slice(5) === monthDay;
}

/**
 * Reminders due today (in each student's time zone) for items active students are working on, plus SC-11
 * renewal reminders 30 days before each anniversary of a won renewable award (D2).
 */
export async function findDueReminders(deps: CoreDeps, system: Actor): Promise<Reminder[]> {
  assertSystem(system);
  const now = deps.clock.now();
  const out: Reminder[] = [];
  const push = (userId: string, timeZone: string, name: string, dueOn: IsoDate, refType: string, refId: string) => {
    for (const offset of reminderOffsetsDue(dueOn, now, safeTimeZone(timeZone))) {
      out.push({
        userId,
        title: reminderTitle(name, offset),
        dueOn,
        offset,
        refType,
        refId,
        dedupeKey: `reminder:${refType}:${refId}:${dueOn}:${offset}`,
      });
    }
  };
  const activeStudent = and(eq(users.role, "student"), eq(users.status, "active"));

  const apps = await deps.db
    .select({
      userId: scholarshipApplications.ownerId,
      timeZone: users.timeZone,
      applicationId: scholarshipApplications.id,
      name: scholarships.name,
      deadline: scholarships.deadline,
    })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .innerJoin(users, eq(users.id, scholarshipApplications.ownerId))
    .where(
      and(
        activeStudent,
        inArray(scholarshipApplications.stage, OPEN_APP_STAGES),
        isNotNull(scholarships.deadline),
        // R2P-4: no "due in 3 days" for a retired, under-review, or scam-flagged listing.
        liveListingWhere(scholarshipApplications.ownerId),
      ),
    );
  for (const a of apps) {
    if (a.deadline) push(a.userId, a.timeZone, a.name, a.deadline, "scholarship_application", a.applicationId);
  }

  const entries = await deps.db
    .select({
      userId: collegeList.ownerId,
      timeZone: users.timeZone,
      entryId: collegeList.id,
      plan: collegeList.plan,
      name: colleges.name,
      deadlines: colleges.deadlines,
    })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .innerJoin(users, eq(users.id, collegeList.ownerId))
    .where(and(activeStudent, isNull(collegeList.archivedAt), inArray(collegeList.status, ACTIVE_LIST_STATUSES)));
  for (const e of entries) {
    const due = planDeadline(e.deadlines, e.plan);
    if (due) push(e.userId, e.timeZone, `${e.name} · ${APP_PLAN_LABELS[e.plan]}`, due, "college_list", e.entryId);
  }

  const wins = await deps.db
    .select({
      userId: scholarshipApplications.ownerId,
      timeZone: users.timeZone,
      applicationId: scholarshipApplications.id,
      name: scholarships.name,
      outcomeAt: scholarshipApplications.outcomeAt,
    })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .innerJoin(users, eq(users.id, scholarshipApplications.ownerId))
    .where(
      and(
        activeStudent,
        eq(scholarshipApplications.stage, "won"),
        eq(scholarshipApplications.outcomeRenewable, true),
        isNotNull(scholarshipApplications.outcomeAt),
      ),
    );
  for (const w of wins) {
    if (!w.outcomeAt) continue;
    const dueOn = addIsoDays(todayIn(now, w.timeZone), RENEWAL_OFFSET);
    if (!isRenewalAnniversary(todayIn(w.outcomeAt, w.timeZone), dueOn)) continue;
    out.push({
      userId: w.userId,
      title: `${w.name} renewal is coming up`,
      dueOn,
      offset: RENEWAL_OFFSET,
      refType: "scholarship_application",
      refId: w.applicationId,
      dedupeKey: `renewal:${w.applicationId}:${dueOn.slice(0, 4)}`,
    });
  }
  return out;
}
