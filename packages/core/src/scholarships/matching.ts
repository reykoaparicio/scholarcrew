import {
  and,
  eq,
  gte,
  isNull,
  or,
  profiles,
  scholarshipApplications,
  scholarships,
  serviceLogs,
  sql,
  stories,
  testScores,
} from "@scholarcrew/db";
import {
  type Actor,
  type Match,
  type MatchReason,
  type ShareCategory,
  hasSensitiveReason,
  systemActor,
} from "@scholarcrew/domain";
import { type MatcherProfile, daysUntil, evaluateEligibility, rankMatches, scoreMatch } from "@scholarcrew/engines";
import { readSensitiveForMatcher } from "../memory";
import { type CoreDeps, todayIn } from "../shared";
import { assertReadable, readsAsOwner, requireSystem, seesSensitiveReasons, userTimeZone } from "./common";
import { type ScholarshipRow, toSummary } from "./mappers";

export async function buildMatcherProfile(deps: CoreDeps, system: Actor, ownerId: string): Promise<MatcherProfile> {
  const sys = requireSystem(system);
  const [p] = await deps.db.select().from(profiles).where(eq(profiles.userId, ownerId));
  const scores = await deps.db
    .select({ test: testScores.test, composite: testScores.composite })
    .from(testScores)
    .where(and(eq(testScores.ownerId, ownerId), eq(testScores.official, true)));
  const best = (test: "ACT" | "SAT") => {
    const values = scores.filter((s) => s.test === test).map((s) => s.composite);
    return values.length > 0 ? Math.max(...values) : null;
  };
  const logs = await deps.db
    .select({ minutes: serviceLogs.minutes })
    .from(serviceLogs)
    .where(and(eq(serviceLogs.ownerId, ownerId), eq(serviceLogs.verification, "verified")));
  const gpaX100 = p?.gpaUnweightedX100 ?? null;
  return {
    state: p?.state ?? "",
    county: p?.county ?? "",
    city: p?.city ?? "",
    classYear: p?.classYear ?? null,
    gpa: gpaX100 === null ? null : gpaX100 / 100,
    intendedMajors: p?.intendedMajors ?? [],
    interests: p?.interests ?? [],
    act: best("ACT"),
    sat: best("SAT"),
    serviceHours: logs.reduce((sum, l) => sum + l.minutes, 0) / 60,
    sensitive: await readSensitiveForMatcher(deps, sys, ownerId),
  };
}

/** Story ids whose themes appear in any of the prompts (case-insensitive). */
export function reusableStoryIds(list: Array<{ id: string; themes: string[] }>, prompts: string[]): string[] {
  const text = prompts.join("\n").toLowerCase();
  if (!text) return [];
  return list
    .filter((s) => s.themes.some((t) => t.trim() !== "" && text.includes(t.trim().toLowerCase())))
    .map((s) => s.id);
}

/** Private ids are withheld from every non-owner and every model-facing read. */
export async function privateScholarshipIds(
  db: import("@scholarcrew/db").DbOrTx,
  ownerId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ id: scholarshipApplications.scholarshipId })
    .from(scholarshipApplications)
    .where(
      and(
        eq(scholarshipApplications.ownerId, ownerId),
        sql`${scholarshipApplications.matchReasons} @> '[{"sensitive":true}]'::jsonb`,
      ),
    );
  return new Set(rows.map((r) => r.id));
}

export type Evaluation = { matches: Match[]; scamIds: string[]; timeZone: string };

type StoryThemes = Array<{ id: string; themes: string[] }>;

/** Eligibility plus engine scores for one listing; the single scoring path for the sweep, matches, and saves. */
function scoreListing(
  row: ScholarshipRow,
  profile: MatcherProfile,
  storyRows: StoryThemes,
  now: Date,
  timeZone: string,
) {
  const result = evaluateEligibility(row.eligibility, row.localArea, profile);
  const reuse = reusableStoryIds(
    storyRows,
    row.requirements.essays.map((e) => e.prompt),
  );
  const daysUntilDeadline = row.deadline ? daysUntil(row.deadline, now, timeZone) : null;
  const score = scoreMatch({
    amountMaxUsd: row.amountMaxUsd,
    estMinutes: row.estMinutes,
    reasonsCount: result.reasons.length,
    unknownsCount: result.unknowns.length,
    daysUntilDeadline,
    reusableStories: reuse.length,
  });
  return { result, reuse, daysUntilDeadline, score };
}

async function storyThemes(deps: CoreDeps, studentId: string): Promise<StoryThemes> {
  return deps.db
    .select({ id: stories.id, themes: stories.themes })
    .from(stories)
    .where(and(eq(stories.ownerId, studentId), isNull(stories.archivedAt)));
}

/** Runs the matcher over open published listings. No access check: callers do that. */
export async function evaluateForStudent(deps: CoreDeps, studentId: string): Promise<Evaluation> {
  const profile = await buildMatcherProfile(deps, systemActor("matcher"), studentId);
  const timeZone = await userTimeZone(deps.db, studentId);
  const now = deps.clock.now();
  const today = todayIn(now, timeZone);
  const listings = await deps.db
    .select()
    .from(scholarships)
    .where(
      and(
        eq(scholarships.status, "published"),
        or(
          eq(scholarships.visibility, "public"),
          and(eq(scholarships.visibility, "submitter_only"), eq(scholarships.submittedById, studentId)),
        ),
        or(isNull(scholarships.deadline), gte(scholarships.deadline, today)),
      ),
    );
  const storyRows = await storyThemes(deps, studentId);
  const apps = await deps.db
    .select({
      id: scholarshipApplications.id,
      scholarshipId: scholarshipApplications.scholarshipId,
      stage: scholarshipApplications.stage,
    })
    .from(scholarshipApplications)
    .where(eq(scholarshipApplications.ownerId, studentId));
  const appByListing = new Map(apps.map((a) => [a.scholarshipId, a]));

  const matches: Match[] = [];
  const scamIds: string[] = [];
  for (const row of listings) {
    const { result, reuse, daysUntilDeadline, score } = scoreListing(row, profile, storyRows, now, timeZone);
    if (!result.eligible) continue;
    if (row.scamFlags.length > 0) {
      scamIds.push(row.id);
      continue;
    }
    const app = appByListing.get(row.id);
    matches.push({
      scholarship: toSummary(row),
      fitScore: score.fitScore,
      valuePerHour: score.valuePerHour,
      estMinutes: row.estMinutes,
      reasons: result.reasons,
      unknowns: result.unknowns,
      reuseStoryIds: reuse,
      daysUntilDeadline,
      applicationId: app?.id ?? null,
      stage: app?.stage ?? null,
    });
  }
  return { matches: rankMatches(matches), scamIds, timeZone };
}

/**
 * Reasons and fit score for one listing, with the same inputs as `evaluateForStudent` (R2P-3).
 * Ineligible listings get no reasons and a fit of 0. No access check: `saveScholarship` checks visibility first.
 */
export async function matchListingFor(
  deps: CoreDeps,
  studentId: string,
  listing: ScholarshipRow,
): Promise<{ reasons: MatchReason[]; fitScore: number }> {
  const profile = await buildMatcherProfile(deps, systemActor("matcher"), studentId);
  const timeZone = await userTimeZone(deps.db, studentId);
  const storyRows = await storyThemes(deps, studentId);
  const { result, score } = scoreListing(listing, profile, storyRows, deps.clock.now(), timeZone);
  if (!result.eligible) return { reasons: [], fitScore: 0 };
  return { reasons: result.reasons, fitScore: score.fitScore };
}

export async function listMatches(
  deps: CoreDeps,
  actor: Actor,
  studentId: string,
  o: { audience?: "crew" | "family" } = {},
): Promise<{ matches: Match[]; privateCount: number }> {
  await assertReadable(deps, actor, studentId, "scholarships");
  const { matches } = await evaluateForStudent(deps, studentId);
  const privateCount = matches.filter((m) => hasSensitiveReason(m.reasons)).length;
  const ownerView = readsAsOwner(actor, studentId) && o.audience !== "family";
  return { matches: ownerView ? matches : matches.filter((m) => !hasSensitiveReason(m.reasons)), privateCount };
}
