import type { CrewDataPort } from "@scholarcrew/agents";
import { getAidChecklists } from "@scholarcrew/core/aid";
import { getCollege, getCollegeList, listApplicationItems } from "@scholarcrew/core/colleges";
import { getEssay, listEssays, listStories } from "@scholarcrew/core/essays";
import { getRequirementProgress, listActivities, listServiceLogs } from "@scholarcrew/core/impact";
import { crewVisibleFacts, listDecisions } from "@scholarcrew/core/memory";
import { compareMyOffers, costsFor, getCosts } from "@scholarcrew/core/money";
import { getWeekPlan, listUpcomingDeadlines } from "@scholarcrew/core/plan";
import { listTestScores } from "@scholarcrew/core/prep";
import { getProfile } from "@scholarcrew/core/profile";
import { privateScholarshipIds } from "@scholarcrew/core/scholarships";
import { getScholarship, listMatches, searchScholarships } from "@scholarcrew/core/scholarships";
import { type CoreDeps, todayIn } from "@scholarcrew/core/shared";
import { and, eq, inArray, isNull, memoryFacts, shareSettings, users } from "@scholarcrew/db";
import {
  type ContextSnapshot,
  DEFAULT_SHARED,
  type FactVisibility,
  type MemoryFact,
  type OfferComparison,
  PROFILE_FACT_KEYS,
  type ProfileFactKey,
  SPECIALIST_ROLES,
  type ShareCategory,
  type SpecialistRole,
  type WeekPlan,
  isAppError,
  notFound,
  systemActor,
} from "@scholarcrew/domain";
import { safeTimeZone } from "./time";

const SYSTEM = systemActor("worker:port");
const DEADLINE_LIMIT = 10;
const DECISION_LIMIT = 20;
const ALWAYS_ON: SpecialistRole[] = ["scout", "atlas", "quill", "aid", "ledger"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Onboarding switches (plan 16): a confirmed fact with value true turns the specialist on before any data exists. */
const SWITCH_FACTS: Record<"prep" | "impact", string> = { prep: "crew_prep_enabled", impact: "crew_impact_enabled" };
const EMPTY_OFFERS: OfferComparison = { columns: [], lowestFourYearOfferId: null, assumptions: [] };

type Audience = "crew" | "family";
export interface PortOptions {
  /** The job's audience. A family port filters every read by the student's share settings. */
  audience: Audience;
}

const blankWeek = (plan: WeekPlan): WeekPlan => ({
  weekStart: plan.weekStart,
  items: [],
  totalMinutes: 0,
  doneCount: 0,
});

/** Fact visibilities each audience may use (R2I-10). `scout_only` means "matching only"; `private` hides it from the crew. */
const USABLE_VISIBILITY: Record<Audience, FactVisibility[]> = {
  crew: ["crew", "crew_family"],
  family: ["crew_family"],
};

/**
 * Profile fact keys whose current confirmed fact the audience can't use. The snapshot blanks those profile fields.
 * A key with no fact stays visible. The matcher still reads `profiles`, which 06 keeps in sync with these facts (R2I-1).
 */
async function hiddenProfileKeys(core: CoreDeps, ownerId: string, audience: Audience): Promise<Set<ProfileFactKey>> {
  const rows = await core.db
    .select({ key: memoryFacts.key, visibility: memoryFacts.visibility })
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.ownerId, ownerId),
        eq(memoryFacts.status, "confirmed"),
        isNull(memoryFacts.supersededById),
        inArray(memoryFacts.key, [...PROFILE_FACT_KEYS]),
      ),
    );
  const usable = USABLE_VISIBILITY[audience];
  return new Set(rows.filter((r) => !usable.includes(r.visibility)).map((r) => r.key as ProfileFactKey));
}

/** not_found becomes null; every other error propagates. */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (isAppError(e) && e.code === "not_found") return null;
    throw e;
  }
}

/** The student's share switches, defaulting to DEFAULT_SHARED for categories without a row. */
async function familyShares(core: CoreDeps, studentId: string): Promise<Record<ShareCategory, boolean>> {
  const rows = await core.db
    .select({ category: shareSettings.category, enabled: shareSettings.enabled })
    .from(shareSettings)
    .where(eq(shareSettings.studentId, studentId));
  const out: Record<ShareCategory, boolean> = { ...DEFAULT_SHARED };
  for (const row of rows) out[row.category] = row.enabled;
  return out;
}

const switchedOn = (facts: MemoryFact[], key: string) => facts.some((f) => f.key === key && f.value === true);

/** Prep and Impact are on when the student switched them on (D29) or already has their data. */
async function enabledSpecialists(core: CoreDeps, ownerId: string, crewFacts: MemoryFact[]): Promise<SpecialistRole[]> {
  const on = new Set<SpecialistRole>(ALWAYS_ON);
  if (switchedOn(crewFacts, SWITCH_FACTS.prep) || (await listTestScores(core, SYSTEM, ownerId)).length > 0)
    on.add("prep");
  if (switchedOn(crewFacts, SWITCH_FACTS.impact)) {
    on.add("impact");
  } else {
    const [logs, acts] = await Promise.all([
      listServiceLogs(core, SYSTEM, ownerId),
      listActivities(core, SYSTEM, ownerId),
    ]);
    if (logs.length > 0 || acts.length > 0) on.add("impact");
  }
  return SPECIALIST_ROLES.filter((r) => on.has(r));
}

/**
 * Read-only data for the crew, over core services with the system actor (plan 09's CrewDataPort).
 * Sensitive facts are never read here; they stay in core's matcher path.
 *
 * Audience (FA, SE-01): build one port per job with the job's audience. For "family" (the bound audience, or a
 * call that passes audience "family"), every read checks the student's share settings first and returns empty
 * when the category is off: costs and offers → costs; collegeList and applicationItems → colleges (a list
 * entry's gapUsd also needs costs); activities and serviceProgress → activities; deadlines, weekPlan, and aid
 * checklists → deadlines; matches → scholarships; stories → stories; essay → essays. Test scores have no share
 * category, so family never gets them. Snapshot profile fields follow each profile fact's visibility (R2I-10).
 * Catalog reads (searchScholarships, scholarship, college) are public data and aren't gated.
 */
export function createCrewDataPort(core: CoreDeps, o: PortOptions = { audience: "crew" }): CrewDataPort {
  const used = new Set<ShareCategory>();
  let currentOwner: string | null = null;
  const sharesFor = (ownerId: string) => familyShares(core, ownerId);
  const isFamily = (audience?: Audience) => o.audience === "family" || audience === "family";
  /** Whether this read may return data. `null` means the data has no share category, so family never sees it. */
  const allows = async (ownerId: string, category: ShareCategory | null, audience?: Audience): Promise<boolean> => {
    currentOwner = ownerId;
    if (!isFamily(audience)) return true;
    if (category === null) return false;
    const allowed = (await sharesFor(ownerId))[category];
    if (allowed) used.add(category);
    return allowed;
  };

  return {
    usedCategories: () => [...used],
    async liveGrants() {
      return currentOwner
        ? Object.entries(await sharesFor(currentOwner))
            .filter(([, enabled]) => enabled)
            .map(([category]) => category as ShareCategory)
        : [];
    },
    async snapshot(ownerId, room, requested): Promise<ContextSnapshot> {
      currentOwner = ownerId;
      const audience: Audience = isFamily(requested) ? "family" : "crew";
      // CR-07: a temporary chat loads no memory (no facts, no decisions) and saves nothing.
      const temporary = room === "temporary";
      const [user] = await core.db
        .select({ displayName: users.displayName, timeZone: users.timeZone })
        .from(users)
        .where(eq(users.id, ownerId));
      if (!user) throw notFound("Student not found");
      const profile = await orNull(getProfile(core, SYSTEM, ownerId));
      // Crew-visible facts drive the Prep/Impact switches in every room; they reach the snapshot only for the crew.
      const crewFacts = await crewVisibleFacts(core, SYSTEM, ownerId, "crew");
      const facts = temporary
        ? []
        : audience === "crew"
          ? crewFacts
          : await crewVisibleFacts(core, SYSTEM, ownerId, "family");
      const decisions =
        temporary || audience === "family" ? [] : (await listDecisions(core, SYSTEM, ownerId)).slice(0, DECISION_LIMIT);
      const plan = await getWeekPlan(core, SYSTEM, ownerId);
      const showDeadlines = await allows(ownerId, "deadlines", audience);
      const deadlines = showDeadlines ? await listUpcomingDeadlines(core, SYSTEM, ownerId, DEADLINE_LIMIT) : [];
      const list = (await allows(ownerId, "colleges", audience)) ? await getCollegeList(core, SYSTEM, ownerId) : [];
      const privateIds = await privateScholarshipIds(core.db, ownerId);
      const publicRef = (item: { refType: string | null; refId: string | null }) =>
        item.refType !== "scholarship" || item.refId === null || !privateIds.has(item.refId);
      const hidden = await hiddenProfileKeys(core, ownerId, audience);
      const hide = (key: ProfileFactKey) => hidden.has(key);
      return {
        ownerId,
        privateMatchCount: privateIds.size,
        displayName: user.displayName,
        today: todayIn(core.clock.now(), safeTimeZone(user.timeZone)),
        timeZone: user.timeZone,
        audience,
        room,
        roomRef: null,
        // R2I-10: each field follows its fact's visibility. high_school and city aren't in the snapshot.
        profile: {
          classYear: hide("class_year") ? null : (profile?.classYear ?? null),
          state: hide("state") ? "" : (profile?.state ?? ""),
          county: hide("county") ? "" : (profile?.county ?? ""),
          gpa: hide("gpa_unweighted") ? null : (profile?.gpaUnweighted ?? null),
          intendedMajors: hide("intended_majors") ? [] : (profile?.intendedMajors ?? []),
          interests: hide("interests") ? [] : (profile?.interests ?? []),
        },
        facts: facts.map((f) => ({ id: f.id, key: f.key, value: f.valueText, source: f.source })),
        decisions: decisions.map((d) => ({ id: d.id, summary: d.summary, decidedAt: d.decidedAt })),
        weekPlan: showDeadlines ? { ...plan, items: plan.items.filter(publicRef) } : blankWeek(plan),
        deadlines: deadlines.filter(publicRef),
        colleges: list.map((e) => ({ id: e.collegeId, name: e.college.name, fit: e.fit, plan: e.plan })),
        enabledSpecialists: await enabledSpecialists(core, ownerId, crewFacts),
      };
    },
    async matches(ownerId, requested) {
      const audience: Audience = isFamily(requested) ? "family" : "crew";
      if (!(await allows(ownerId, "scholarships", audience))) return { matches: [], privateCount: 0 };
      const result = await listMatches(core, SYSTEM, ownerId, { audience });
      const visible = result.matches.filter((match) => !match.reasons.some((reason) => reason.sensitive));
      return { matches: visible, privateCount: result.privateCount + result.matches.length - visible.length };
    },
    async searchScholarships(q) {
      // Core rejects `local` from a non-student actor, so the crew can't run a local search; drop it (and scams).
      const { local: _local, ...rest } = q;
      const privateIds = currentOwner ? await privateScholarshipIds(core.db, currentOwner) : new Set<string>();
      return (await searchScholarships(core, SYSTEM, { ...rest, excludeScams: true })).items.filter(
        (listing) => !privateIds.has(listing.id),
      );
    },
    async scholarship(idOrSlug) {
      const listing = await orNull(getScholarship(core, SYSTEM, idOrSlug));
      if (!listing || (currentOwner && (await privateScholarshipIds(core.db, currentOwner)).has(listing.id)))
        return null;
      return listing;
    },
    async collegeList(ownerId) {
      if (!(await allows(ownerId, "colleges"))) return [];
      const entries = await getCollegeList(core, SYSTEM, ownerId);
      // R2P-15: 07 can't import 08, so the port fills gapUsd from costs, and only when costs are shared.
      if (!(await allows(ownerId, "costs"))) return entries;
      const gaps = new Map(
        (await costsFor(core, ownerId, { viewer: "other" })).map((c) => [c.collegeId, c.gapUsd] as const),
      );
      return entries.map((e) => ({ ...e, gapUsd: gaps.get(e.collegeId) ?? null }));
    },
    college: (id) => orNull(getCollege(core, SYSTEM, id)),
    async applicationItems(ownerId) {
      if (!(await allows(ownerId, "colleges"))) return [];
      const entries = await getCollegeList(core, SYSTEM, ownerId);
      const lists = await Promise.all(entries.map((e) => listApplicationItems(core, SYSTEM, e.id)));
      return lists.flat();
    },
    async stories(ownerId) {
      if (!(await allows(ownerId, "stories"))) return [];
      const rows = await listStories(core, SYSTEM, ownerId);
      return isFamily() && !(await allows(ownerId, "essays")) ? rows.map((story) => ({ ...story, uses: [] })) : rows;
    },
    async story(ownerId, storyId) {
      if (!(await allows(ownerId, "stories"))) return null;
      const story =
        (await listStories(core, SYSTEM, ownerId)).find((story) => story.id === storyId && story.archivedAt === null) ??
        null;
      if (!story) return null;
      return isFamily() && !(await allows(ownerId, "essays")) ? { ...story, uses: [] } : story;
    },
    async essay(ownerId, essayId) {
      if (!UUID_RE.test(essayId) || !(await allows(ownerId, "essays"))) return null;
      const owned = await listEssays(core, SYSTEM, ownerId);
      if (!owned.some((e) => e.id === essayId)) return null;
      return orNull(getEssay(core, SYSTEM, essayId));
    },
    async costs(ownerId) {
      return (await allows(ownerId, "costs")) ? costsFor(core, ownerId, { viewer: "other" }) : [];
    },
    async offers(ownerId) {
      return (await allows(ownerId, "costs")) ? compareMyOffers(core, SYSTEM, ownerId) : EMPTY_OFFERS;
    },
    async aidChecklist(ownerId) {
      // R2P-20: same rule as 08 getAidChecklists (assertCanRead "deadlines").
      return (await allows(ownerId, "deadlines")) ? getAidChecklists(core, SYSTEM, ownerId) : [];
    },
    async testScores(ownerId) {
      return (await allows(ownerId, null)) ? listTestScores(core, SYSTEM, ownerId) : [];
    },
    async activities(ownerId) {
      return (await allows(ownerId, "activities")) ? listActivities(core, SYSTEM, ownerId) : [];
    },
    async serviceProgress(ownerId) {
      return (await allows(ownerId, "activities")) ? getRequirementProgress(core, SYSTEM, ownerId) : [];
    },
    async weekPlan(ownerId) {
      const plan = await getWeekPlan(core, SYSTEM, ownerId);
      const privateIds = await privateScholarshipIds(core.db, ownerId);
      return (await allows(ownerId, "deadlines"))
        ? {
            ...plan,
            items: plan.items.filter(
              (item) => item.refType !== "scholarship" || !item.refId || !privateIds.has(item.refId),
            ),
          }
        : blankWeek(plan);
    },
    async deadlines(ownerId) {
      if (!(await allows(ownerId, "deadlines"))) return [];
      const privateIds = await privateScholarshipIds(core.db, ownerId);
      return (await listUpcomingDeadlines(core, SYSTEM, ownerId, DEADLINE_LIMIT)).filter(
        (item) => item.refType !== "scholarship" || !item.refId || !privateIds.has(item.refId),
      );
    },
  };
}
