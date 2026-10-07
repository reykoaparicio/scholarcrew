import {
  and,
  collegeList,
  colleges,
  desc,
  eq,
  helperLinks,
  inArray,
  isNull,
  recRequests,
  scholarshipApplications,
  scholarships,
  stories,
  users,
} from "@scholarcrew/db";
import { type Deadline, type HelperActor, type HelperScope, type HelperView, notFound } from "@scholarcrew/domain";
import { daysUntil, isWarning } from "@scholarcrew/engines";
import { activeListWhere, loadEntries } from "../colleges/list";
import { deadlineFor } from "../colleges/mappers";
import { loadActivities } from "../impact/activities";
import { privateScholarshipIds } from "../scholarships/matching";
import { deadlineOrder } from "../scholarships/search";
import { type CoreDeps, currentSeason, toIso } from "../shared";

/** D38: the note and due date of the recommendation request this link was made for, if any. */
async function loadRequest(deps: CoreDeps, helperLinkId: string): Promise<HelperView["request"]> {
  const [req] = await deps.db
    .select()
    .from(recRequests)
    .where(eq(recRequests.helperLinkId, helperLinkId))
    .orderBy(desc(recRequests.updatedAt))
    .limit(1);
  if (!req) return { message: null, dueDate: null };
  const dates: string[] = [];
  if (req.collegeListId) {
    const [row] = await deps.db
      .select({ plan: collegeList.plan, deadlines: colleges.deadlines })
      .from(collegeList)
      .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
      .where(and(eq(collegeList.id, req.collegeListId), eq(collegeList.ownerId, req.ownerId)));
    const due = row ? deadlineFor(row.deadlines, row.plan) : null;
    if (due) dates.push(due);
  }
  if (req.scholarshipApplicationId) {
    const [row] = await deps.db
      .select({ deadline: scholarships.deadline, scholarshipId: scholarships.id })
      .from(scholarshipApplications)
      .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
      .where(
        and(
          eq(scholarshipApplications.id, req.scholarshipApplicationId),
          eq(scholarshipApplications.ownerId, req.ownerId),
        ),
      );
    const privateIds = await privateScholarshipIds(deps.db, req.ownerId);
    if (row?.deadline && !privateIds.has(row.scholarshipId)) dates.push(row.deadline);
  }
  dates.sort();
  return { message: req.message.trim() || null, dueDate: dates[0] ?? null };
}

export async function getHelperView(deps: CoreDeps, actor: HelperActor): Promise<HelperView> {
  if (actor.kind !== "helper") throw notFound("Link not found");
  const now = deps.clock.now();
  const [link] = await deps.db
    .select()
    .from(helperLinks)
    .where(and(eq(helperLinks.id, actor.helperLinkId), eq(helperLinks.studentId, actor.studentId)));
  if (!link || link.revokedAt || link.expiresAt.getTime() <= now.getTime()) throw notFound("This link has expired");
  const scope = new Set<HelperScope>(actor.scope.filter((s) => link.scope.includes(s)));
  const studentId = link.studentId;
  const [student] = await deps.db
    .select({ displayName: users.displayName, timeZone: users.timeZone })
    .from(users)
    .where(eq(users.id, studentId));
  const timeZone = student?.timeZone ?? "America/Chicago";

  const wantsDeadlines = scope.has("deadlines");
  const entries = scope.has("colleges") || wantsDeadlines ? await loadEntries(deps.db, activeListWhere(studentId)) : [];
  const rawSaved =
    scope.has("scholarships") || wantsDeadlines
      ? await deps.db
          .select({ app: scholarshipApplications, listing: scholarships })
          .from(scholarshipApplications)
          .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
          .where(
            and(
              eq(scholarshipApplications.ownerId, studentId),
              inArray(scholarshipApplications.stage, ["planned", "drafting", "submitted", "won"]),
            ),
          )
          .orderBy(...deadlineOrder)
      : [];

  const privateIds = await privateScholarshipIds(deps.db, studentId);
  const saved = rawSaved.filter(({ listing }) => !privateIds.has(listing.id));

  let deadlines: Deadline[] | null = null;
  if (wantsDeadlines) {
    const list: Deadline[] = [];
    for (const { app, listing } of saved) {
      if (!listing.deadline || (app.stage !== "planned" && app.stage !== "drafting")) continue;
      const daysLeft = daysUntil(listing.deadline, now, timeZone);
      if (daysLeft < 0) continue;
      list.push({
        kind: "scholarship",
        title: listing.name,
        dueOn: listing.deadline,
        daysLeft,
        refType: "scholarship",
        refId: listing.id,
        valueUsd: listing.amountMaxUsd,
        warning: isWarning(daysLeft),
      });
    }
    for (const e of entries) {
      if (!e.deadline || (e.status !== "researching" && e.status !== "applying")) continue;
      const daysLeft = daysUntil(e.deadline, now, timeZone);
      if (daysLeft < 0) continue;
      list.push({
        kind: "application",
        title: `${e.college.name} (${e.plan})`,
        dueOn: e.deadline,
        daysLeft,
        refType: "college_list",
        refId: e.id,
        valueUsd: null,
        warning: isWarning(daysLeft),
      });
    }
    deadlines = list.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title));
  }

  const storyRows = scope.has("stories")
    ? await deps.db
        .select({ title: stories.title, summary: stories.summary })
        .from(stories)
        .where(and(eq(stories.ownerId, studentId), isNull(stories.archivedAt)))
        .orderBy(desc(stories.updatedAt))
    : null;

  return {
    studentName: student?.displayName.trim() || "A student",
    helperRole: link.helperRole,
    label: link.label,
    expiresAt: toIso(link.expiresAt),
    request: await loadRequest(deps, link.id),
    activities: scope.has("activities") ? await loadActivities(deps.db, studentId) : null,
    stories: storyRows,
    deadlines,
    colleges: scope.has("colleges") ? entries : null,
    scholarships: scope.has("scholarships")
      ? saved.map(({ app, listing }) => ({ name: listing.name, deadline: listing.deadline, stage: app.stage }))
      : null,
  };
}
