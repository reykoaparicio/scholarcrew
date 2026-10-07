import {
  type DbOrTx,
  aidRules,
  and,
  asc,
  colleges,
  count,
  crewJobs,
  desc,
  documents,
  eq,
  familyTasks,
  inArray,
  isNull,
  offerLines,
  offers,
  users,
} from "@scholarcrew/db";
import {
  type Actor,
  AwardYear,
  CreateOfferInput,
  type CrewJob,
  type LoanEstimate,
  type OfferComparison,
  type OfferLine,
  type OfferLineCategory,
  OfferLinePatch,
  type OfferWithLines,
  ParsedOfferLine,
  PublicOfferInput,
  Usd,
  conflict,
  invalidInput,
  notFound,
  systemActor,
} from "@scholarcrew/domain";
import { compareOffers, computePublicOffers, estimateLoanPayment } from "@scholarcrew/engines";
import { assertCanRead, assertOwner, assertSystem, assertUser } from "../access";
import { recordAudit } from "../audit";
import { assertCrewAllowance } from "../billing";
import { insertJob } from "../crew/jobs";
import { createTask } from "../family";
import { parentsOf } from "../plan/common";
import { type CoreDeps, currentAwardYear, one, requireUuid, toIso, toIsoOrNull } from "../shared";

type OfferRow = typeof offers.$inferSelect;
type LineRow = typeof offerLines.$inferSelect;
type RateKey = "subsidized" | "unsubsidized" | "parent_plus";

const RATE_KEYS: Partial<Record<OfferLineCategory, RateKey>> = {
  loan_federal_subsidized: "subsidized",
  loan_federal_unsubsidized: "unsubsidized",
  loan_parent_plus: "parent_plus",
};
export const LOAN_YEARS = 10;
const MAX_LINES = 40;
const MONEY_SYSTEM = systemActor("money.offers");

/** R2P-7: always added to `compareMyOffers` assumptions, because /money adds won scholarships and this page doesn't. */
export const OUTSIDE_SCHOLARSHIPS_NOTE =
  "Outside scholarships you've won aren't counted here. Your Costs page includes them.";

/** R2P-16: a parsed award year counts only when it's well formed and within one year of the current one. */
function plausibleAwardYear(value: string | undefined, now: Date): string | null {
  if (value === undefined || !AwardYear.safeParse(value).success) return null;
  const start = Number(value.slice(0, 4));
  const current = Number(currentAwardYear(now).slice(0, 4));
  if (value.slice(5) !== String((start + 1) % 100).padStart(2, "0")) return null;
  return Math.abs(start - current) <= 1 ? value : null;
}

export function toOfferLine(row: LineRow): OfferLine {
  return {
    id: row.id,
    offerId: row.offerId,
    position: row.position,
    label: row.label,
    amountUsd: row.amountUsd,
    category: row.category,
    renewable: row.renewable,
    renewalCondition: row.renewalCondition,
    page: row.page,
    citedText: row.citedText,
    userCorrected: row.userCorrected,
  };
}

function toOffer(row: OfferRow, collegeName: string, lines: LineRow[], parseJobId: string | null): OfferWithLines {
  return {
    id: row.id,
    collegeId: row.collegeId,
    collegeName,
    awardYear: row.awardYear,
    documentId: row.documentId,
    status: row.status,
    costOfAttendanceUsd: row.costOfAttendanceUsd,
    createdAt: toIso(row.createdAt),
    confirmedAt: toIsoOrNull(row.confirmedAt),
    parseJobId,
    lines: [...lines].sort((a, b) => a.position - b.position).map(toOfferLine),
  };
}

async function loadOffers(db: DbOrTx, where: ReturnType<typeof and>): Promise<OfferWithLines[]> {
  const rows = await db
    .select({ offer: offers, collegeName: colleges.name })
    .from(offers)
    .innerJoin(colleges, eq(colleges.id, offers.collegeId))
    .where(where)
    .orderBy(asc(offers.createdAt));
  if (rows.length === 0) return [];
  const offerIds = rows.map((r) => r.offer.id);
  const lines = await db.select().from(offerLines).where(inArray(offerLines.offerId, offerIds));
  // D31: the newest offer_parse job per offer, so the upload page can follow its events.
  const parseJobs = await db
    .select({ id: crewJobs.id, refId: crewJobs.refId, ownerId: crewJobs.ownerId })
    .from(crewJobs)
    .where(and(eq(crewJobs.kind, "offer_parse"), inArray(crewJobs.refId, offerIds)))
    .orderBy(desc(crewJobs.createdAt));
  return rows.map((r) => {
    const job = parseJobs.find((j) => j.refId === r.offer.id && j.ownerId === r.offer.ownerId);
    return toOffer(
      r.offer,
      r.collegeName,
      lines.filter((l) => l.offerId === r.offer.id),
      job?.id ?? null,
    );
  });
}

async function loadOne(db: DbOrTx, id: string): Promise<OfferWithLines> {
  const [offer] = await loadOffers(db, eq(offers.id, id));
  if (!offer) throw notFound("Offer not found");
  return offer;
}

async function offerRow(db: DbOrTx, id: string): Promise<OfferRow> {
  requireUuid(id, "Offer not found");
  const [row] = await db.select().from(offers).where(eq(offers.id, id));
  if (!row) throw notFound("Offer not found");
  return row;
}

export async function listOffers(deps: CoreDeps, actor: Actor, studentId: string): Promise<OfferWithLines[]> {
  await assertCanRead(deps, actor, studentId, "costs");
  return loadOffers(deps.db, and(eq(offers.ownerId, studentId), isNull(offers.archivedAt)));
}

export async function getOffer(deps: CoreDeps, actor: Actor, id: string): Promise<OfferWithLines> {
  const row = await offerRow(deps.db, id);
  await assertCanRead(deps, actor, row.ownerId, "costs");
  return loadOne(deps.db, row.id);
}

export async function createOffer(deps: CoreDeps, actor: Actor, i: CreateOfferInput): Promise<OfferWithLines> {
  assertUser(actor);
  const parsed = CreateOfferInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the award letter details and try again", parsed.error.issues);
  const v = parsed.data;
  const [doc] = await deps.db
    .select()
    .from(documents)
    .where(and(eq(documents.id, v.documentId), eq(documents.ownerId, actor.userId)));
  if (!doc || doc.kind !== "award_letter") throw notFound("Award letter not found");
  const [college] = await deps.db.select({ id: colleges.id }).from(colleges).where(eq(colleges.id, v.collegeId));
  if (!college) throw notFound("College not found");
  const now = deps.clock.now();
  const { offerId, job } = await deps.db.transaction(async (tx) => {
    const offer = one(
      await tx
        .insert(offers)
        .values({
          ownerId: actor.userId,
          collegeId: college.id,
          awardYear: v.awardYear,
          documentId: doc.id,
          status: "parsing",
          createdAt: now,
        })
        .returning(),
      "offers insert",
    );
    await tx.update(documents).set({ parseStatus: "queued" }).where(eq(documents.id, doc.id));
    const created = await insertJob(tx, { ownerId: actor.userId, kind: "offer_parse", refId: offer.id, now });
    return { offerId: offer.id, job: created };
  });
  await deps.jobs.enqueue("offer.parse", { jobId: job.id, offerId });
  return loadOne(deps.db, offerId);
}

export async function saveParsedOffer(
  deps: CoreDeps,
  system: Actor,
  i: {
    offerId: string;
    ownerId: string;
    costOfAttendanceUsd: number | null;
    lines: ParsedOfferLine[];
    /** R2P-16: the year printed on the letter. Kept only when it's a valid award year within one year of now. */
    awardYear?: AwardYear;
  },
): Promise<OfferWithLines> {
  assertSystem(system);
  const offer = await offerRow(deps.db, i.offerId);
  if (offer.ownerId !== i.ownerId) throw notFound("Offer not found");
  const coa = Usd.max(200_000).nullable().safeParse(i.costOfAttendanceUsd);
  if (!coa.success) throw invalidInput("Bad cost of attendance", coa.error.issues);
  if (i.lines.length > MAX_LINES) throw invalidInput(`An award letter has at most ${MAX_LINES} lines`);
  const lines = i.lines.map((raw, idx) => {
    const parsed = ParsedOfferLine.safeParse(raw);
    if (!parsed.success) throw invalidInput(`Offer line ${idx + 1} is invalid`, parsed.error.issues);
    return parsed.data;
  });
  const awardYear = plausibleAwardYear(i.awardYear, deps.clock.now()) ?? offer.awardYear;
  await deps.db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(offers)
      .where(and(eq(offers.id, offer.id), eq(offers.ownerId, i.ownerId)))
      .for("update");
    if (!current) throw notFound("Offer not found");
    if (current.status !== "uploaded" && current.status !== "parsing") return;
    await tx.delete(offerLines).where(eq(offerLines.offerId, offer.id));
    if (lines.length > 0) {
      await tx.insert(offerLines).values(
        lines.map((l, position) => ({
          offerId: offer.id,
          position,
          label: l.label,
          amountUsd: l.amountUsd,
          category: l.category,
          renewable: l.renewable,
          renewalCondition: l.renewalCondition,
          page: l.page,
          citedText: l.citedText,
        })),
      );
    }
    await tx
      .update(offers)
      .set({ costOfAttendanceUsd: (coa.data ?? 0) > 0 ? coa.data : null, status: "needs_review", awardYear })
      .where(
        and(eq(offers.id, offer.id), eq(offers.ownerId, i.ownerId), inArray(offers.status, ["uploaded", "parsing"])),
      );
    if (offer.documentId) {
      await tx.update(documents).set({ parseStatus: "parsed" }).where(eq(documents.id, offer.documentId));
    }
  });
  return loadOne(deps.db, offer.id);
}

export async function markOfferFailed(
  deps: CoreDeps,
  system: Actor,
  i: { offerId: string; ownerId: string; error: string },
): Promise<{ changed: boolean }> {
  assertSystem(system);
  const changed = await deps.db.transaction(async (tx) => {
    const [offer] = await tx
      .select()
      .from(offers)
      .where(and(eq(offers.id, i.offerId), eq(offers.ownerId, i.ownerId)))
      .for("update");
    if (!offer) throw notFound("Offer not found");
    if (offer.status !== "uploaded" && offer.status !== "parsing") return false;
    await tx
      .update(offers)
      .set({ status: "failed" })
      .where(
        and(eq(offers.id, offer.id), eq(offers.ownerId, i.ownerId), inArray(offers.status, ["uploaded", "parsing"])),
      );
    if (offer.documentId)
      await tx.update(documents).set({ parseStatus: "failed" }).where(eq(documents.id, offer.documentId));
    return true;
  });
  if (changed)
    await recordAudit(deps, {
      actor: system,
      action: "offer_parse_failed",
      entityType: "offer",
      entityId: i.offerId,
      meta: { error: i.error.slice(0, 200) },
    });
  return { changed };
}

export async function updateOfferLine(deps: CoreDeps, actor: Actor, id: string, p: OfferLinePatch): Promise<OfferLine> {
  assertUser(actor);
  requireUuid(id, "Offer line not found");
  const parsed = OfferLinePatch.safeParse(p);
  if (!parsed.success) throw invalidInput("Check the line and try again", parsed.error.issues);
  const [found] = await deps.db
    .select({ line: offerLines, ownerId: offers.ownerId })
    .from(offerLines)
    .innerJoin(offers, eq(offers.id, offerLines.offerId))
    .where(eq(offerLines.id, id));
  if (!found) throw notFound("Offer line not found");
  assertOwner(actor, found.ownerId);
  const set: Partial<typeof offerLines.$inferInsert> = { userCorrected: true };
  if (parsed.data.label !== undefined) set.label = parsed.data.label;
  if (parsed.data.amountUsd !== undefined) set.amountUsd = parsed.data.amountUsd;
  if (parsed.data.category !== undefined) set.category = parsed.data.category;
  if (parsed.data.renewable !== undefined) set.renewable = parsed.data.renewable;
  const updated = one(
    await deps.db.update(offerLines).set(set).where(eq(offerLines.id, id)).returning(),
    "offer_lines update",
  );
  return toOfferLine(updated);
}

export async function confirmOffer(deps: CoreDeps, actor: Actor, id: string): Promise<OfferWithLines> {
  assertUser(actor);
  const offer = await offerRow(deps.db, id);
  assertOwner(actor, offer.ownerId);
  const [lines] = await deps.db.select({ n: count() }).from(offerLines).where(eq(offerLines.offerId, offer.id));
  if ((lines?.n ?? 0) === 0) throw invalidInput("Add at least one line before confirming this letter");
  await deps.db
    .update(offers)
    .set({ status: "confirmed", confirmedAt: deps.clock.now() })
    .where(eq(offers.id, offer.id));
  await askParentsToReviewCosts(deps, offer.ownerId);
  return loadOne(deps.db, offer.id);
}

/** R2I-7 (FA-05): one `review_costs` task per parent of the student, created the first time a letter is confirmed. */
async function askParentsToReviewCosts(deps: CoreDeps, studentId: string): Promise<void> {
  const parents = await parentsOf(deps.db, studentId);
  if (parents.length === 0) return;
  const existing = await deps.db
    .select({ assigneeId: familyTasks.assigneeId })
    .from(familyTasks)
    .where(and(eq(familyTasks.studentId, studentId), eq(familyTasks.kind, "review_costs")));
  const [student] = await deps.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, studentId));
  const name = student?.displayName.trim().split(/\s+/)[0] || "your student";
  for (const p of parents) {
    if (existing.some((t) => t.assigneeId === p.userId)) continue;
    await createTask(deps, MONEY_SYSTEM, {
      familyId: p.familyId,
      assigneeId: p.userId,
      studentId,
      kind: "review_costs",
      title: `Review award letters with ${name}`,
      detail: "",
    });
  }
}

/**
 * R2P-8: owner only. Removes a letter that failed or that the student doesn't want to confirm; lines cascade and
 * the uploaded document stays. Confirmed letters stay for comparisons and archive with the season (ME-07).
 */
export async function deleteOffer(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  const offer = await offerRow(deps.db, id);
  assertOwner(actor, offer.ownerId);
  if (offer.status === "confirmed") throw conflict("Confirmed offers stay. Start a new season to archive them.");
  await deps.db.delete(offers).where(eq(offers.id, offer.id));
}

export async function compareMyOffers(deps: CoreDeps, actor: Actor, studentId: string): Promise<OfferComparison> {
  await assertCanRead(deps, actor, studentId, "costs");
  const rows = await deps.db
    .select({ offer: offers, college: colleges })
    .from(offers)
    .innerJoin(colleges, eq(colleges.id, offers.collegeId))
    .where(and(eq(offers.ownerId, studentId), eq(offers.status, "confirmed"), isNull(offers.archivedAt)))
    .orderBy(asc(offers.confirmedAt), asc(offers.createdAt));
  const lines =
    rows.length === 0
      ? []
      : await deps.db
          .select()
          .from(offerLines)
          .where(
            inArray(
              offerLines.offerId,
              rows.map((r) => r.offer.id),
            ),
          )
          .orderBy(asc(offerLines.position));
  // R2P-7: a letter with no known cost of attendance can't be compared; it used to count as $0 and win.
  const unknownCost = rows.filter(
    ({ offer, college }) => (offer.costOfAttendanceUsd ?? college.costOfAttendanceUsd) === null,
  );
  const comparable = rows.filter((r) => !unknownCost.includes(r));
  const result = compareOffers(
    comparable.map(({ offer, college }) => ({
      offerId: offer.id,
      collegeId: college.id,
      collegeName: college.name,
      costOfAttendanceUsd: offer.costOfAttendanceUsd ?? college.costOfAttendanceUsd ?? 0,
      lines: lines
        .filter((l) => l.offerId === offer.id)
        .map((l) => ({ label: l.label, amountUsd: l.amountUsd, category: l.category, renewable: l.renewable })),
    })),
  );
  return {
    ...result,
    assumptions: [
      ...result.assumptions,
      ...unknownCost.map(
        ({ college }) => `${college.name}: the letter doesn't list a cost of attendance, so it isn't compared.`,
      ),
      OUTSIDE_SCHOLARSHIPS_NOTE,
    ],
  };
}

export async function requestAppealOutline(deps: CoreDeps, actor: Actor, offerId: string): Promise<CrewJob> {
  assertUser(actor);
  const offer = await offerRow(deps.db, offerId);
  assertOwner(actor, offer.ownerId);
  await assertCrewAllowance(deps, actor.userId);
  const job = await insertJob(deps.db, {
    ownerId: actor.userId,
    kind: "appeal_outline",
    refId: offer.id,
    now: deps.clock.now(),
  });
  await deps.jobs.enqueue("appeal.outline", { jobId: job.id, offerId: offer.id });
  return job;
}

function readRates(value: unknown): Partial<Record<RateKey, number>> {
  const out: Partial<Record<RateKey, number>> = {};
  if (typeof value !== "object" || value === null) return out;
  const record = value as Record<string, unknown>;
  for (const key of ["subsidized", "unsubsidized", "parent_plus"] as const) {
    const rate = record[key];
    if (typeof rate === "number" && Number.isFinite(rate) && rate >= 0 && rate <= 30) out[key] = rate;
  }
  return out;
}

/** Federal loan lines on a 10-year standard plan. Private loans and years without stored rates are skipped. */
export async function loanEstimates(deps: CoreDeps, actor: Actor, offerId: string): Promise<LoanEstimate[]> {
  const offer = await offerRow(deps.db, offerId);
  await assertCanRead(deps, actor, offer.ownerId, "costs");
  const [rule] = await deps.db
    .select({ value: aidRules.value })
    .from(aidRules)
    .where(and(eq(aidRules.awardYear, offer.awardYear), eq(aidRules.key, "federal_loan_rates")));
  const rates = readRates(rule?.value);
  const lines = await deps.db
    .select()
    .from(offerLines)
    .where(eq(offerLines.offerId, offer.id))
    .orderBy(asc(offerLines.position));
  const out: LoanEstimate[] = [];
  for (const l of lines) {
    const key = RATE_KEYS[l.category];
    if (!key) continue;
    const rate = rates[key];
    if (rate === undefined) continue;
    out.push({
      ...estimateLoanPayment({ principalUsd: l.amountUsd, annualRatePct: rate, years: LOAN_YEARS }),
      label: l.label,
    });
  }
  return out;
}

/** No storage, no model. */
export function publicOfferTool(i: PublicOfferInput): OfferComparison {
  const parsed = PublicOfferInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the offers and try again", parsed.error.issues);
  return computePublicOffers(parsed.data);
}
