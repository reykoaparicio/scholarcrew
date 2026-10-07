import { and, asc, collegeList, colleges, crewJobs, eq, gt, inArray, isNull, users } from "@scholarcrew/db";
import { type Actor, type CostSummary, type JobStatus, type ThisWeekView, notFound } from "@scholarcrew/domain";
import { assertCanRead, canRead } from "../access";
import { costsFor } from "../money/costs";
import { privateScholarshipIds } from "../scholarships";
import { lastSweep } from "../scholarships";
import { readsAsOwner } from "../scholarships/common";
import { type CoreDeps, currentSeason } from "../shared";
import { firstName } from "./common";
import { collectDeadlines } from "./deadlines";
import { loadWeekPlan } from "./items";

const WORKING: JobStatus[] = ["queued", "working"];

/** The college with the earliest ED or EA deadline, else the first one added; its cost summary or null. */
async function topGap(deps: CoreDeps, studentId: string): Promise<CostSummary | null> {
  const entries = await deps.db
    .select({ collegeId: collegeList.collegeId, plan: collegeList.plan, deadlines: colleges.deadlines })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .where(and(eq(collegeList.ownerId, studentId), isNull(collegeList.archivedAt)))
    .orderBy(asc(collegeList.createdAt));
  let top = entries[0];
  if (!top) return null;
  let earliest: string | null = null;
  for (const e of entries) {
    if (e.plan !== "ED" && e.plan !== "EA") continue;
    const due = e.deadlines[e.plan];
    if (due && (earliest === null || due < earliest)) {
      earliest = due;
      top = e;
    }
  }
  const topId = top.collegeId;
  return (await costsFor(deps, studentId, { viewer: "other" })).find((c) => c.collegeId === topId) ?? null;
}

export async function getThisWeek(deps: CoreDeps, actor: Actor, studentId: string): Promise<ThisWeekView> {
  await assertCanRead(deps, actor, studentId, "deadlines");
  const [user] = await deps.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, studentId));
  if (!user) throw notFound("Student not found");
  const loaded = await loadWeekPlan(deps, studentId);
  const privateIds = readsAsOwner(actor, studentId)
    ? new Set<string>()
    : await privateScholarshipIds(deps.db, studentId);
  const publicRef = (item: { refType: string | null; refId: string | null }) =>
    item.refType !== "scholarship" || item.refId === null || !privateIds.has(item.refId);
  const plan = { ...loaded, items: loaded.items.filter(publicRef) };
  const gap = (await canRead(deps, actor, studentId, "costs")) ? await topGap(deps, studentId) : null;
  const sweep = (await canRead(deps, actor, studentId, "scholarships"))
    ? await lastSweep(deps, actor, studentId)
    : null;
  const working = await deps.db
    .select({ id: crewJobs.id })
    .from(crewJobs)
    .where(
      and(
        eq(crewJobs.ownerId, studentId),
        inArray(crewJobs.status, WORKING),
        gt(crewJobs.updatedAt, new Date(deps.clock.now().getTime() - 30 * 60_000)),
      ),
    )
    .limit(1);
  return {
    greetingName: firstName(user.displayName),
    weekStart: plan.weekStart,
    nextStep: plan.items.find((i) => i.status === "todo") ?? null,
    plan,
    gap,
    deadlines: (await collectDeadlines(deps, studentId)).filter(publicRef).slice(0, 4),
    sweep,
    crewWorking: working.length > 0,
  };
}
