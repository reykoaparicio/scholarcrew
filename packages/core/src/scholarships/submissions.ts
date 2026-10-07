import { randomUUID } from "node:crypto";
import {
  and,
  catalogReports,
  catalogTasks,
  count,
  eq,
  inArray,
  profiles,
  scholarshipApplications,
  scholarships,
  sql,
} from "@scholarcrew/db";
import {
  type Actor,
  AppError,
  type LocalArea,
  type LocalSubmissionInput,
  type ReportInput,
  type ScholarshipSummary,
  USState,
  notFound,
} from "@scholarcrew/domain";
import { type CoreDeps, currentSeason } from "../shared";
import { firstRow, requireUser } from "./common";
import { slugify } from "./labels";
import { toSummary } from "./mappers";
import { visibleListingWhere } from "./search";

export async function submitLocalScholarship(
  deps: CoreDeps,
  actor: Actor,
  i: LocalSubmissionInput,
): Promise<ScholarshipSummary> {
  const user = requireUser(actor);
  const [p] = await deps.db
    .select({ state: profiles.state, county: profiles.county })
    .from(profiles)
    .where(eq(profiles.userId, user.userId));
  const state = USState.safeParse(p?.state ?? "");
  const localArea: LocalArea = state.success
    ? { national: false, state: state.data, counties: p?.county ? [p.county] : [], cities: [] }
    : { national: false, state: null, counties: [], cities: [] };
  const name = i.name.trim();
  const now = deps.clock.now();
  const { summary, taskId } = await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`local-submission:${user.userId}`}))`);
    const [pending] = await tx
      .select({ n: count() })
      .from(catalogTasks)
      .where(
        and(
          eq(catalogTasks.createdById, user.userId),
          eq(catalogTasks.kind, "user_submission"),
          inArray(catalogTasks.status, ["open", "in_review"]),
        ),
      );
    if ((pending?.n ?? 0) >= 10)
      throw new AppError("limit_reached", "You have 10 submissions waiting for review. We'll get to them soon.");
    const row = firstRow(
      await tx
        .insert(scholarships)
        .values({
          slug: `${slugify(name)}-${randomUUID().replace(/-/g, "").slice(0, 8)}`,
          name,
          provider: "Unknown",
          url: i.url,
          sourceUrl: i.url,
          amountMinUsd: 0,
          amountMaxUsd: 0,
          deadline: null,
          cycle: currentSeason(now),
          localArea,
          requirements: { essays: [], recommendations: 0, transcript: false, serviceHours: null, other: [] },
          status: "draft",
          visibility: "submitter_only",
          submittedById: user.userId,
          verifiedAt: null,
        })
        .returning(),
      "scholarship",
    );
    const task = firstRow(
      await tx
        .insert(catalogTasks)
        .values({
          kind: "user_submission",
          scholarshipId: row.id,
          payload: { type: "user_submission", url: i.url, name, notes: i.notes, submittedById: user.userId },
          createdById: user.userId,
        })
        .returning({ id: catalogTasks.id }),
      "catalog task",
    );
    // Every submission lands on the submitter's board, from the web form and the extension (R2C-12/R2P-12).
    await tx
      .insert(scholarshipApplications)
      .values({ ownerId: user.userId, scholarshipId: row.id, stage: "planned", estMinutes: row.estMinutes })
      .onConflictDoNothing({ target: [scholarshipApplications.ownerId, scholarshipApplications.scholarshipId] });
    return { summary: toSummary(row), taskId: task.id };
  });
  // After commit, so the worker always finds the task. catalog.extract is a deduped queue and needs a key.
  await deps.jobs.enqueue("catalog.extract", { taskId }, { singletonKey: `catalog.extract:${taskId}` });
  return summary;
}

export async function reportListing(deps: CoreDeps, actor: Actor, i: ReportInput): Promise<void> {
  const user = requireUser(actor);
  const [listing] = await deps.db
    .select({ id: scholarships.id })
    .from(scholarships)
    .where(and(eq(scholarships.id, i.scholarshipId), visibleListingWhere(user)));
  if (!listing) throw notFound("Scholarship not found");
  await deps.db.transaction(async (tx) => {
    const report = firstRow(
      await tx
        .insert(catalogReports)
        .values({ scholarshipId: listing.id, reporterId: user.userId, reason: i.reason, details: i.details })
        .returning(),
      "catalog report",
    );
    await tx.insert(catalogTasks).values({
      kind: "report",
      scholarshipId: listing.id,
      payload: { type: "report", reportId: report.id, reason: i.reason, details: i.details },
      createdById: user.userId,
    });
  });
}
