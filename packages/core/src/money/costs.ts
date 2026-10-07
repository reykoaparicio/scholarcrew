import {
  and,
  asc,
  collegeList,
  colleges,
  costEstimates,
  desc,
  eq,
  familyBudgets,
  gte,
  inArray,
  isNull,
  offerLines,
  offers,
  or,
  scholarshipApplications,
  scholarships,
} from "@scholarcrew/db";
import {
  type Actor,
  AppError,
  type ApplicationStage,
  CalculatorResultInput,
  type CostSource,
  type CostSummary,
  type IncomeRange,
  invalidInput,
  notFound,
  systemActor,
} from "@scholarcrew/domain";
import { categorizeOfferLine, computeGap, estimateNetPrice, wonScholarshipsForYear } from "@scholarcrew/engines";
import { assertCanRead, assertUser } from "../access";
import { readSensitiveForMatcher } from "../memory";
import { studentFamilyIds, userTimeZone } from "../plan/common";
import { liveListingWhere } from "../scholarships";
import { readsAsOwner } from "../scholarships/common";
import { type CoreDeps, currentSeason, todayIn } from "../shared";

type CollegeRow = typeof colleges.$inferSelect;

export const SOURCE_LABELS = {
  scorecard: "College Scorecard estimate",
  scorecardRange: "College Scorecard estimate for your income range",
  scorecardOverall: "College Scorecard average (no income range shared)",
  calculator: "Your net price calculator result",
  offer: "Your confirmed award letter",
} as const;

const PENDING_STAGES: ApplicationStage[] = ["planned", "drafting", "submitted"];
const COSTS_SYSTEM = systemActor("money.costs");

interface CostContext {
  ownerId: string;
  incomeRange: IncomeRange | null;
  wonUsd: number;
  pendingUsd: number;
  budgetUsd: number | null;
}

async function loadContext(deps: CoreDeps, ownerId: string): Promise<CostContext> {
  const sensitive = await readSensitiveForMatcher(deps, COSTS_SYSTEM, ownerId);
  const apps = await deps.db
    .select({
      stage: scholarshipApplications.stage,
      outcomeUsd: scholarshipApplications.outcomeUsd,
      outcomeRenewable: scholarshipApplications.outcomeRenewable,
      amountMaxUsd: scholarships.amountMaxUsd,
    })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(eq(scholarshipApplications.ownerId, ownerId));
  // Won money stays counted whatever happens to the listing later; pending money needs a live listing (R2P-4).
  // R3V-6: planned and drafting count only while the listing is undated or due today or later in the
  // student's zone; submitted always counts, because the decision is still pending.
  const today = todayIn(deps.clock.now(), await userTimeZone(deps.db, ownerId));
  const pending = await deps.db
    .select({ amountMaxUsd: scholarships.amountMaxUsd })
    .from(scholarshipApplications)
    .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
    .where(
      and(
        eq(scholarshipApplications.ownerId, ownerId),
        inArray(scholarshipApplications.stage, PENDING_STAGES),
        liveListingWhere(scholarshipApplications.ownerId),
        or(
          eq(scholarshipApplications.stage, "submitted"),
          isNull(scholarships.deadline),
          gte(scholarships.deadline, today),
        ),
      ),
    );
  const pendingUsd = pending.reduce((sum, a) => sum + a.amountMaxUsd, 0);
  const familyIds = await studentFamilyIds(deps.db, ownerId);
  let budgetUsd: number | null = null;
  if (familyIds.length > 0) {
    const [budget] = await deps.db
      .select({ annualUsd: familyBudgets.annualUsd })
      .from(familyBudgets)
      .where(inArray(familyBudgets.familyId, familyIds))
      .limit(1);
    budgetUsd = budget?.annualUsd ?? null;
  }
  return {
    ownerId,
    incomeRange: sensitive.incomeRange,
    wonUsd: wonScholarshipsForYear(apps, 0),
    pendingUsd,
    budgetUsd,
  };
}

function summarize(
  ctx: CostContext,
  college: CollegeRow,
  base: {
    source: CostSource;
    sourceLabel: string;
    costOfAttendanceUsd: number;
    freeMoneyUsd: number;
    isEstimate: boolean;
  },
): CostSummary {
  const freeMoneyUsd = base.freeMoneyUsd + ctx.wonUsd;
  const { gapUsd, gapIfPendingWinUsd } = computeGap({
    costOfAttendanceUsd: base.costOfAttendanceUsd,
    freeMoneyUsd,
    pendingUsd: ctx.pendingUsd,
  });
  return {
    collegeId: college.id,
    collegeName: college.name,
    source: base.source,
    sourceLabel: base.sourceLabel,
    costOfAttendanceUsd: base.costOfAttendanceUsd,
    freeMoneyUsd,
    gapUsd,
    pendingUsd: ctx.pendingUsd,
    gapIfPendingWinUsd,
    isEstimate: base.isEstimate,
    budgetUsd: ctx.budgetUsd,
    gapAfterBudgetUsd: ctx.budgetUsd === null ? null : Math.max(0, gapUsd - ctx.budgetUsd),
  };
}

async function upsertEstimate(
  deps: CoreDeps,
  ownerId: string,
  collegeId: string,
  source: CostSource,
  v: { costOfAttendanceUsd: number; freeMoneyUsd: number; netPriceUsd: number; inputs: Record<string, unknown> },
): Promise<void> {
  const now = deps.clock.now();
  await deps.db
    .insert(costEstimates)
    .values({ ownerId, collegeId, source, ...v, computedAt: now })
    .onConflictDoUpdate({
      target: [costEstimates.ownerId, costEstimates.collegeId, costEstimates.source],
      set: { ...v, computedAt: now },
    });
}

/** The newest confirmed offer, then the calculator row, then the Scorecard estimate (R2P-6). Colleges without numbers are skipped. */
async function summariesFor(
  deps: CoreDeps,
  ctx: CostContext,
  list: CollegeRow[],
  viewer: "owner" | "other",
): Promise<CostSummary[]> {
  if (list.length === 0) return [];
  const ids = list.map((c) => c.id);
  const calculators = await deps.db
    .select()
    .from(costEstimates)
    .where(
      and(
        eq(costEstimates.ownerId, ctx.ownerId),
        inArray(costEstimates.collegeId, ids),
        eq(costEstimates.source, "calculator"),
      ),
    );
  const confirmed = await deps.db
    .select()
    .from(offers)
    .where(
      and(
        eq(offers.ownerId, ctx.ownerId),
        inArray(offers.collegeId, ids),
        eq(offers.status, "confirmed"),
        isNull(offers.archivedAt),
      ),
    )
    .orderBy(desc(offers.confirmedAt));
  const lines =
    confirmed.length === 0
      ? []
      : await deps.db
          .select()
          .from(offerLines)
          .where(
            inArray(
              offerLines.offerId,
              confirmed.map((o) => o.id),
            ),
          );
  const out: CostSummary[] = [];
  for (const college of list) {
    // R2P-6: a confirmed letter is real money, so it outranks the calculator estimate.
    const offer = confirmed.find((o) => o.collegeId === college.id);
    const offerCoa = offer
      ? (offer.costOfAttendanceUsd ?? 0) > 0
        ? offer.costOfAttendanceUsd
        : (college.costOfAttendanceUsd ?? 0) > 0
          ? college.costOfAttendanceUsd
          : null
      : null;
    if (offer && offerCoa !== null) {
      const free = lines
        .filter((l) => l.offerId === offer.id && categorizeOfferLine(l.category) === "free")
        .reduce((sum, l) => sum + l.amountUsd, 0);
      out.push(
        summarize(ctx, college, {
          source: "offer",
          sourceLabel: SOURCE_LABELS.offer,
          costOfAttendanceUsd: offerCoa,
          freeMoneyUsd: free,
          isEstimate: false,
        }),
      );
      continue;
    }
    const calc = calculators.find((e) => e.collegeId === college.id);
    if (calc) {
      out.push(
        summarize(ctx, college, {
          source: "calculator",
          sourceLabel: SOURCE_LABELS.calculator,
          costOfAttendanceUsd: calc.costOfAttendanceUsd,
          freeMoneyUsd: calc.freeMoneyUsd,
          isEstimate: true,
        }),
      );
      continue;
    }
    const estimate = estimateNetPrice(college, ctx.incomeRange);
    if (!estimate) continue;
    const usedBand = ctx.incomeRange !== null && college.netPriceByIncome[ctx.incomeRange] !== null;
    await upsertEstimate(deps, ctx.ownerId, college.id, "scorecard", {
      costOfAttendanceUsd: estimate.costOfAttendanceUsd,
      freeMoneyUsd: estimate.freeMoneyUsd,
      netPriceUsd: estimate.netPriceUsd,
      inputs: { basis: usedBand ? "income_range" : "overall" },
    });
    out.push(
      summarize(ctx, college, {
        source: "scorecard",
        sourceLabel: usedBand
          ? viewer === "owner"
            ? SOURCE_LABELS.scorecardRange
            : SOURCE_LABELS.scorecard
          : viewer === "owner"
            ? SOURCE_LABELS.scorecardOverall
            : SOURCE_LABELS.scorecard,
        costOfAttendanceUsd: estimate.costOfAttendanceUsd,
        freeMoneyUsd: estimate.freeMoneyUsd,
        isEstimate: true,
      }),
    );
  }
  return out;
}

/** Active colleges on the list, oldest first; only archiveSeason archives. */
export async function listedColleges(deps: CoreDeps, ownerId: string): Promise<CollegeRow[]> {
  const rows = await deps.db
    .select({ college: colleges })
    .from(collegeList)
    .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
    .where(and(eq(collegeList.ownerId, ownerId), isNull(collegeList.archivedAt)))
    .orderBy(asc(collegeList.createdAt));
  return rows.map((r) => r.college);
}

/** getCosts without the access check (This Week, the worker's data port). */
export async function costsFor(
  deps: CoreDeps,
  ownerId: string,
  o: { viewer: "owner" | "other" },
): Promise<CostSummary[]> {
  const list = await listedColleges(deps, ownerId);
  if (list.length === 0) return [];
  return summariesFor(deps, await loadContext(deps, ownerId), list, o.viewer);
}

export async function getCosts(deps: CoreDeps, actor: Actor, studentId: string): Promise<CostSummary[]> {
  await assertCanRead(deps, actor, studentId, "costs");
  return costsFor(deps, studentId, { viewer: readsAsOwner(actor, studentId) ? "owner" : "other" });
}

export async function setCalculatorResult(
  deps: CoreDeps,
  actor: Actor,
  i: CalculatorResultInput,
): Promise<CostSummary> {
  assertUser(actor);
  const parsed = CalculatorResultInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the calculator numbers and try again", parsed.error.issues);
  const v = parsed.data;
  if (v.grantsUsd > v.costOfAttendanceUsd) throw invalidInput("Grants can't be more than the cost to attend");
  const [college] = await deps.db.select().from(colleges).where(eq(colleges.id, v.collegeId));
  if (!college) throw notFound("College not found");
  await upsertEstimate(deps, actor.userId, college.id, "calculator", {
    costOfAttendanceUsd: v.costOfAttendanceUsd,
    freeMoneyUsd: v.grantsUsd,
    netPriceUsd: v.costOfAttendanceUsd - v.grantsUsd,
    inputs: { grantsUsd: v.grantsUsd },
  });
  const [summary] = await summariesFor(deps, await loadContext(deps, actor.userId), [college], "owner");
  if (!summary) throw new AppError("internal", "Calculator result missing after save");
  return summary;
}
