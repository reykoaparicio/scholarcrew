import {
  and,
  desc,
  eq,
  essayVersions,
  essays,
  inArray,
  isNotNull,
  isNull,
  planItems,
  scholarshipApplications,
  scholarships,
  sql,
  stories,
  sweepRuns,
} from "@scholarcrew/db";
import {
  type Actor,
  type ApplicationPatch,
  type Board,
  type BoardCard,
  SCAM_FLAG_TEXT,
  type ScholarshipApplication,
  notFound,
} from "@scholarcrew/domain";
import { hasSensitiveReason } from "@scholarcrew/domain";
import { daysUntil, rankMatches, scoreMatch, weekStartFor } from "@scholarcrew/engines";
import { assertOwner } from "../access";
import { type CoreDeps, requireUuid, todayIn } from "../shared";
import { assertReadable, firstRow, monthOf, readsAsOwner, requireUser, userTimeZone } from "./common";
import { type ScholarshipRow, toApplication, toSummary } from "./mappers";
import { matchListingFor, reusableStoryIds } from "./matching";
import { deadlineOrder, liveListingWhere, visibleListingWhere } from "./search";

export const RETIRED_TEXT = "This listing was retired";
export const UNDER_REVIEW_TEXT = "This listing is under review";

/** Why an open card's listing left the columns (R2P-4). */
function notLiveReason(listing: ScholarshipRow): string {
  const flag = listing.scamFlags[0];
  if (flag) return SCAM_FLAG_TEXT[flag];
  if (listing.status === "retired") return RETIRED_TEXT;
  return UNDER_REVIEW_TEXT;
}

export async function getBoard(deps: CoreDeps, actor: Actor, studentId: string): Promise<Board> {
  await assertReadable(deps, actor, studentId, "scholarships");
  const keepSensitive = readsAsOwner(actor, studentId);
  const timeZone = await userTimeZone(deps.db, studentId);
  const now = deps.clock.now();
  const today = todayIn(now, timeZone);

  const rows = await deps.db
    .select({
      app: scholarshipApplications,
      listing: scholarships,
      live: sql<boolean>`coalesce((${liveListingWhere(studentId)}), false)`,
    })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(eq(scholarshipApplications.ownerId, studentId))
    .orderBy(...deadlineOrder);
  const storyRows = await deps.db
    .select({ id: stories.id, title: stories.title, themes: stories.themes })
    .from(stories)
    .where(and(eq(stories.ownerId, studentId), isNull(stories.archivedAt)))
    .orderBy(stories.createdAt);
  const linked = await deps.db
    .select({
      scholarshipId: essays.targetScholarshipId,
      wordLimit: essays.wordLimit,
      wordCount: essayVersions.wordCount,
    })
    .from(essays)
    .leftJoin(
      essayVersions,
      and(eq(essayVersions.essayId, essays.id), eq(essayVersions.version, essays.currentVersion)),
    )
    .where(and(eq(essays.ownerId, studentId), isNotNull(essays.targetScholarshipId)))
    .orderBy(desc(essays.updatedAt));
  const progressBy = new Map<string, number | null>();
  for (const e of linked) {
    if (!e.scholarshipId || progressBy.has(e.scholarshipId)) continue;
    progressBy.set(e.scholarshipId, e.wordLimit ? Math.min(1, (e.wordCount ?? 0) / e.wordLimit) : null);
  }

  const board: Board = {
    matched: [],
    working: [],
    submitted: [],
    won: [],
    lostOrSkipped: [],
    flagged: [],
    privateCount: 0,
    totals: { inPlayUsd: 0, wonUsd: 0, dueThisMonth: 0 },
  };
  const flaggedIds = new Set<string>();
  const matched: Array<{ card: BoardCard; fitScore: number; valuePerHour: number; daysUntilDeadline: number | null }> =
    [];
  for (const { app, listing, live } of rows) {
    if (hasSensitiveReason(app.matchReasons)) {
      board.privateCount += 1;
      if (!keepSensitive) continue;
    }
    const reasons = keepSensitive ? app.matchReasons : app.matchReasons.filter((r) => !r.sensitive);
    const reuse = reusableStoryIds(
      storyRows,
      listing.requirements.essays.map((e) => e.prompt),
    );
    const daysUntilDeadline = listing.deadline ? daysUntil(listing.deadline, now, timeZone) : null;
    const card: BoardCard = {
      application: { ...toApplication(app), matchReasons: reasons },
      scholarship: toSummary(listing),
      reasons,
      reuseStoryTitle: storyRows.find((s) => s.id === reuse[0])?.title ?? null,
      progress: app.stage === "drafting" ? (progressBy.get(listing.id) ?? null) : null,
      daysUntilDeadline,
    };
    const open = app.stage === "matched" || app.stage === "planned" || app.stage === "drafting";
    if (open && !live) {
      // Retired, under review, or scam-flagged since it was added: off the columns and out of the totals (R2P-4).
      flaggedIds.add(listing.id);
      board.flagged.push({ scholarship: toSummary(listing), reason: notLiveReason(listing) });
      continue;
    }
    // R3V-6: an open card counts while its listing is undated or due today or later in the student's zone;
    // a submitted one always counts (the decision is still pending). A past-due card stays on the board.
    const stillOpen = listing.deadline === null || listing.deadline >= today;
    if ((open && stillOpen) || app.stage === "submitted") board.totals.inPlayUsd += listing.amountMaxUsd;
    if (open && listing.deadline && listing.deadline >= today && monthOf(listing.deadline) === monthOf(today)) {
      board.totals.dueThisMonth += 1;
    }
    if (app.stage === "matched") {
      // SC-05: value per hour from the stored (unfiltered) reasons, so every reader sees the same order (R2P-5).
      const { valuePerHour } = scoreMatch({
        amountMaxUsd: listing.amountMaxUsd,
        estMinutes: app.estMinutes,
        reasonsCount: app.matchReasons.length,
        unknownsCount: 0,
        daysUntilDeadline,
        reusableStories: reuse.length,
      });
      matched.push({ card, fitScore: app.fitScore, valuePerHour, daysUntilDeadline });
    } else if (app.stage === "planned" || app.stage === "drafting") board.working.push(card);
    else if (app.stage === "submitted") board.submitted.push(card);
    else if (app.stage === "won") {
      board.won.push(card);
      board.totals.wonUsd += app.outcomeUsd ?? 0;
    } else board.lostOrSkipped.push(card);
  }
  board.matched = rankMatches(matched).map((m) => m.card);

  const [latest] = await deps.db
    .select({ ids: sweepRuns.hiddenScholarshipIds })
    .from(sweepRuns)
    .where(eq(sweepRuns.ownerId, studentId))
    .orderBy(desc(sweepRuns.ranAt))
    .limit(1);
  if (latest && latest.ids.length > 0) {
    const scams = await deps.db
      .select()
      .from(scholarships)
      .where(inArray(scholarships.id, latest.ids))
      .orderBy(...deadlineOrder);
    for (const s of scams) {
      const flag = s.scamFlags[0];
      if (flag && !flaggedIds.has(s.id)) {
        flaggedIds.add(s.id);
        board.flagged.push({ scholarship: toSummary(s), reason: SCAM_FLAG_TEXT[flag] });
      }
    }
  }
  return board;
}

export async function saveScholarship(
  deps: CoreDeps,
  actor: Actor,
  i: { scholarshipId: string },
): Promise<ScholarshipApplication> {
  const user = requireUser(actor);
  requireUuid(i.scholarshipId, "Scholarship not found");
  const [listing] = await deps.db
    .select()
    .from(scholarships)
    .where(and(eq(scholarships.id, i.scholarshipId), visibleListingWhere(user)));
  if (!listing) throw notFound("Scholarship not found");
  // Saved from search or the detail page: score it now so the card has reasons before the next sweep (R2P-3).
  const match = await matchListingFor(deps, user.userId, listing);
  const t = scholarshipApplications;
  const noReasons = sql`jsonb_array_length(${t.matchReasons}) = 0`;
  const row = firstRow(
    await deps.db
      .insert(t)
      .values({
        ownerId: user.userId,
        scholarshipId: listing.id,
        stage: "planned",
        estMinutes: listing.estMinutes,
        matchReasons: match.reasons,
        fitScore: match.fitScore,
      })
      .onConflictDoUpdate({
        target: [t.ownerId, t.scholarshipId],
        set: {
          stage: sql`case when ${t.stage} in ('matched', 'skipped') then 'planned'::app_stage_enum else ${t.stage} end`,
          matchReasons: sql`case when ${noReasons} then ${JSON.stringify(match.reasons)}::jsonb else ${t.matchReasons} end`,
          fitScore: sql`case when ${noReasons} then ${match.fitScore}::integer else ${t.fitScore} end`,
          updatedAt: deps.clock.now(),
        },
      })
      .returning(),
    "scholarship application",
  );
  return toApplication(row);
}

export async function updateApplication(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  p: ApplicationPatch,
): Promise<ScholarshipApplication> {
  requireUser(actor);
  requireUuid(id, "Application not found");
  const [found] = await deps.db
    .select({ app: scholarshipApplications, listing: scholarships })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(eq(scholarshipApplications.id, id));
  if (!found) throw notFound("Application not found");
  const { app, listing } = found;
  assertOwner(actor, app.ownerId);

  const now = deps.clock.now();
  const set: Partial<typeof scholarshipApplications.$inferInsert> = { updatedAt: now };
  if (p.stage !== undefined) set.stage = p.stage;
  if (p.outcomeUsd !== undefined) set.outcomeUsd = p.outcomeUsd;
  if (p.outcomeRenewable !== undefined) set.outcomeRenewable = p.outcomeRenewable;
  if (p.thankYouSent !== undefined) set.thankYouSent = p.thankYouSent;
  const becameWon = p.stage === "won" && app.stage !== "won";
  if (becameWon) {
    set.outcomeUsd = p.outcomeUsd ?? app.outcomeUsd ?? listing.amountMaxUsd;
    set.outcomeAt = now;
    if (p.outcomeRenewable === undefined && app.outcomeRenewable === null) set.outcomeRenewable = listing.renewable;
  }
  if (p.stage === "submitted" && !app.submittedAt) set.submittedAt = now;
  const timeZone = await userTimeZone(deps.db, app.ownerId);

  const updated = await deps.db.transaction(async (tx) => {
    const row = firstRow(
      await tx
        .update(scholarshipApplications)
        .set(set)
        .where(and(eq(scholarshipApplications.id, id), eq(scholarshipApplications.ownerId, app.ownerId)))
        .returning(),
      "scholarship application",
    );
    if (becameWon) {
      await tx.insert(planItems).values({
        ownerId: app.ownerId,
        weekStart: weekStartFor(now, timeZone),
        title: `Send a thank-you note to ${listing.provider}`,
        kind: "thank_you",
        refType: "scholarship_application",
        refId: id,
        minutes: 15,
        contributors: ["scout"],
      });
    }
    return row;
  });
  return toApplication(updated);
}
