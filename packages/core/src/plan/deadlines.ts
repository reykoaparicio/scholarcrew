import {
  and,
  collegeList,
  colleges,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  scholarshipApplications,
  scholarships,
} from "@scholarcrew/db";
import { APP_PLAN_LABELS, type Actor, type Deadline } from "@scholarcrew/domain";
import { daysUntil, isWarning } from "@scholarcrew/engines";
import { assertCanRead } from "../access";
import { cssColleges, loadAidDeadlines } from "../aid/checklists";
import { privateScholarshipIds } from "../scholarships";
import { liveListingWhere } from "../scholarships";
import { readsAsOwner } from "../scholarships/common";
import { type CoreDeps, currentSeason, todayIn } from "../shared";
import { ACTIVE_LIST_STATUSES, OPEN_APP_STAGES, planDeadline, userTimeZone } from "./common";

type Pending = Omit<Deadline, "daysLeft" | "warning">;

/**
 * Every future deadline for the student, soonest first: saved scholarships still being worked on,
 * current-season applications, aid deadlines for their state, and CSS Profile priority dates. No access check.
 */
export async function collectDeadlines(deps: CoreDeps, studentId: string): Promise<Deadline[]> {
  const now = deps.clock.now();
  const timeZone = await userTimeZone(deps.db, studentId);
  const today = todayIn(now, timeZone);
  const out: Pending[] = [];

  const apps = await deps.db
    .select({
      id: scholarships.id,
      name: scholarships.name,
      deadline: scholarships.deadline,
      amountMaxUsd: scholarships.amountMaxUsd,
    })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(
      and(
        eq(scholarshipApplications.ownerId, studentId),
        inArray(scholarshipApplications.stage, OPEN_APP_STAGES),
        isNotNull(scholarships.deadline),
        gte(scholarships.deadline, today),
        // R2P-4: retired, under-review, and scam-flagged listings leave Coming up.
        liveListingWhere(scholarshipApplications.ownerId),
      ),
    );
  for (const a of apps) {
    if (!a.deadline) continue;
    out.push({
      kind: "scholarship",
      title: a.name,
      dueOn: a.deadline,
      refType: "scholarship",
      refId: a.id,
      valueUsd: a.amountMaxUsd,
    });
  }

  const entries = await deps.db
    .select({ entryId: collegeList.id, plan: collegeList.plan, name: colleges.name, deadlines: colleges.deadlines })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .where(
      and(
        eq(collegeList.ownerId, studentId),
        isNull(collegeList.archivedAt),
        inArray(collegeList.status, ACTIVE_LIST_STATUSES),
      ),
    );
  for (const e of entries) {
    const due = planDeadline(e.deadlines, e.plan);
    if (!due || due < today) continue;
    out.push({
      kind: "application",
      title: `${e.name} · ${APP_PLAN_LABELS[e.plan]}`,
      dueOn: due,
      refType: "college_list",
      refId: e.entryId,
      valueUsd: null,
    });
  }

  for (const d of await loadAidDeadlines(deps, studentId)) {
    if (!d.deadline || d.deadline < today) continue;
    out.push({
      kind: "aid",
      title: d.program,
      dueOn: d.deadline,
      refType: "aid_deadline",
      refId: d.id,
      valueUsd: null,
    });
  }

  for (const c of await cssColleges(deps, studentId)) {
    if (!c.aidPriorityDate || c.aidPriorityDate < today) continue;
    out.push({
      kind: "aid",
      title: `CSS Profile · ${c.name}`,
      dueOn: c.aidPriorityDate,
      refType: "college",
      refId: c.id,
      valueUsd: null,
    });
  }

  out.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : a.title.localeCompare(b.title)));
  return out.map((d) => {
    const daysLeft = daysUntil(d.dueOn, now, timeZone);
    return { ...d, daysLeft, warning: isWarning(daysLeft) };
  });
}

export async function listUpcomingDeadlines(
  deps: CoreDeps,
  actor: Actor,
  studentId: string,
  limit: number,
): Promise<Deadline[]> {
  await assertCanRead(deps, actor, studentId, "deadlines");
  const n = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 4;
  const privateIds = readsAsOwner(actor, studentId)
    ? new Set<string>()
    : await privateScholarshipIds(deps.db, studentId);
  return (await collectDeadlines(deps, studentId))
    .filter((deadline) => deadline.refType !== "scholarship" || !privateIds.has(deadline.refId))
    .slice(0, n);
}
