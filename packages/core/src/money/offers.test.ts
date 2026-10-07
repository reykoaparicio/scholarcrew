import {
  aidRules,
  and,
  crewJobs,
  documents,
  eq,
  familyTasks,
  offerLines,
  offers,
  usageCounters,
} from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type OfferLineCategory, type ParsedOfferLine, systemActor } from "@scholarcrew/domain";
import { estimateLoanPayment } from "@scholarcrew/engines";
import { describe, expect, it } from "vitest";
import {
  AWARD_YEAR,
  NOW,
  makeDeps,
  makeDocument,
  makeParentOf,
  makeStateU,
  makeStudent,
  setShare,
} from "../plan/testkit";
import {
  compareMyOffers,
  confirmOffer,
  createOffer,
  deleteOffer,
  getOffer,
  listOffers,
  loanEstimates,
  markOfferFailed,
  publicOfferTool,
  requestAppealOutline,
  saveParsedOffer,
  updateOfferLine,
} from "./index";
import { OUTSIDE_SCHOLARSHIPS_NOTE } from "./offers";

const SYSTEM = systemActor("test");

function line(label: string, amountUsd: number, category: OfferLineCategory, renewable: boolean): ParsedOfferLine {
  return { label, amountUsd, category, renewable, renewalCondition: "", page: 1, citedText: `${label} $${amountUsd}` };
}

const STATE_U_LINES = [
  line("Federal Pell Grant", 3600, "grant", true),
  line("State U Merit", 3000, "scholarship", true),
  line("Texas Grant", 12000, "grant", true),
  line("Federal Direct Subsidized Loan", 3500, "loan_federal_subsidized", true),
];

async function withOffer() {
  const { deps, clock } = makeDeps();
  const student = await makeStudent(deps);
  const college = await makeStateU(deps);
  const doc = await makeDocument(deps, student.user.id);
  const offer = await createOffer(deps, student.actor, {
    collegeId: college.id,
    documentId: doc.id,
    awardYear: AWARD_YEAR,
  });
  return { deps, clock, ...student, college, doc, offer };
}

describe("award letters", () => {
  it("creates an offer from an owned award letter and queues the parse", async () => {
    const { deps } = makeDeps();
    const { user, actor } = await makeStudent(deps);
    const { user: other } = await makeStudent(deps);
    const college = await makeStateU(deps);
    const doc = await makeDocument(deps, user.id);
    const transcript = await makeDocument(deps, user.id, "transcript");
    const theirs = await makeDocument(deps, other.id);
    const input = (documentId: string, collegeId = college.id) => ({ collegeId, documentId, awardYear: AWARD_YEAR });
    await expect(createOffer(deps, actor, input(theirs.id))).rejects.toMatchObject({ code: "not_found" });
    await expect(createOffer(deps, actor, input(transcript.id))).rejects.toMatchObject({ code: "not_found" });
    await expect(createOffer(deps, actor, input(doc.id, "999999"))).rejects.toMatchObject({ code: "not_found" });
    await expect(createOffer(deps, actor, { ...input(doc.id), awardYear: "2027" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    const offer = await createOffer(deps, actor, input(doc.id));
    expect(offer).toMatchObject({
      collegeName: "State U",
      status: "parsing",
      awardYear: "2027-28",
      documentId: doc.id,
      lines: [],
    });
    const [document] = await deps.db.select().from(documents).where(eq(documents.id, doc.id));
    expect(document?.parseStatus).toBe("queued");
    const [job] = await deps.db.select().from(crewJobs).where(eq(crewJobs.ownerId, user.id));
    expect(job).toMatchObject({ kind: "offer_parse", refId: offer.id, status: "queued" });
    expect(offer.parseJobId).toBe(job?.id);
    expect((await listOffers(deps, actor, user.id))[0]?.parseJobId).toBe(job?.id);
    expect(deps.jobs.sent).toEqual([{ name: "offer.parse", payload: { jobId: job?.id, offerId: offer.id } }]);
  });

  it("leaves archived offers out of the list and the comparison", async () => {
    const { deps, user, actor, offer } = await withOffer();
    await saveTestOffer(deps, SYSTEM, { offerId: offer.id, costOfAttendanceUsd: 27800, lines: STATE_U_LINES });
    await confirmOffer(deps, actor, offer.id);
    expect((await listOffers(deps, actor, user.id)).map((o) => o.id)).toEqual([offer.id]);
    expect((await compareMyOffers(deps, actor, user.id)).columns).toHaveLength(1);
    await deps.db
      .update(offers)
      .set({ archivedAt: new Date(NOW) })
      .where(eq(offers.id, offer.id));
    expect(await listOffers(deps, actor, user.id)).toEqual([]);
    expect((await compareMyOffers(deps, actor, user.id)).columns).toEqual([]);
    expect((await getOffer(deps, actor, offer.id)).id).toBe(offer.id);
  });

  it("saves parsed lines, takes corrections, confirms, and compares with labels", async () => {
    const { deps, clock, user, actor, offer } = await withOffer();
    const { actor: other } = await makeStudent(deps);
    const riverside = await factories.college(deps.db, {
      id: "100002",
      name: "Riverside College",
      costOfAttendanceUsd: 31200,
    });
    const riverDoc = await makeDocument(deps, user.id);
    const river = await createOffer(deps, actor, {
      collegeId: riverside.id,
      documentId: riverDoc.id,
      awardYear: AWARD_YEAR,
    });
    const save = { offerId: offer.id, costOfAttendanceUsd: 27800, lines: [line("Wrong", 1, "other", false)] };
    await expect(saveTestOffer(deps, actor, save)).rejects.toMatchObject({ code: "forbidden" });
    // A parse only applies while uploaded/parsing; a replay never overwrites corrections.
    await saveTestOffer(deps, SYSTEM, { ...save, lines: STATE_U_LINES });
    const parsed = await saveTestOffer(deps, SYSTEM, { ...save, lines: STATE_U_LINES });
    expect(parsed).toMatchObject({ status: "needs_review", costOfAttendanceUsd: 27800 });
    expect(parsed.lines.map((l) => [l.position, l.label, l.page, l.userCorrected])).toEqual([
      [0, "Federal Pell Grant", 1, false],
      [1, "State U Merit", 1, false],
      [2, "Texas Grant", 1, false],
      [3, "Federal Direct Subsidized Loan", 1, false],
    ]);
    const [document] = await deps.db
      .select()
      .from(documents)
      .where(eq(documents.id, offer.documentId as string));
    expect(document?.parseStatus).toBe("parsed");
    await saveTestOffer(deps, SYSTEM, {
      offerId: river.id,
      costOfAttendanceUsd: 31200,
      lines: [
        line("Riverside Grant", 18400, "grant", true),
        line("Riverside Welcome Grant", 6000, "scholarship", true),
      ],
    });
    const welcome = (await getOffer(deps, actor, river.id)).lines[1];
    if (!welcome) throw new Error("welcome line missing");
    expect(await updateOfferLine(deps, actor, welcome.id, { category: "grant", renewable: false })).toMatchObject({
      category: "grant",
      renewable: false,
      userCorrected: true,
    });
    await expect(updateOfferLine(deps, other, welcome.id, { renewable: true })).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await compareMyOffers(deps, actor, user.id)).columns).toEqual([]);
    expect(await confirmOffer(deps, actor, offer.id)).toMatchObject({ status: "confirmed", confirmedAt: NOW });
    clock.set("2026-10-06T16:00:00.000Z");
    await confirmOffer(deps, actor, river.id);
    const comparison = await compareMyOffers(deps, actor, user.id);
    expect(comparison.lowestFourYearOfferId).toBe(offer.id);
    expect(comparison.columns.map((c) => [c.collegeName, c.reallyCostsUsd, c.fourYearUsd])).toEqual([
      ["State U", 9200, 36800],
      ["Riverside College", 6800, 45200],
    ]);
    expect(comparison.columns[1]?.warnings).toEqual(["$6,000 Riverside Welcome Grant is year 1 only"]);
  });

  it("refuses to confirm an empty offer and records parse failures", async () => {
    const { deps, actor, offer, doc } = await withOffer();
    await expect(confirmOffer(deps, actor, offer.id)).rejects.toMatchObject({ code: "invalid_input" });
    await failTestOffer(deps, SYSTEM, offer.id, "Could not read page 2");
    expect((await getOffer(deps, actor, offer.id)).status).toBe("failed");
    const [document] = await deps.db.select().from(documents).where(eq(documents.id, doc.id));
    expect(document?.parseStatus).toBe("failed");
  });

  it("deletes failed and unconfirmed letters but keeps confirmed ones (R2P-8)", async () => {
    const { deps, actor, offer, doc, college } = await withOffer();
    const { actor: other } = await makeStudent(deps);
    await failTestOffer(deps, SYSTEM, offer.id, "not_pdf");
    await expect(deleteOffer(deps, other, offer.id)).rejects.toMatchObject({ code: "not_found" });
    await deleteOffer(deps, actor, offer.id);
    await expect(getOffer(deps, actor, offer.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await deps.db.select().from(documents).where(eq(documents.id, doc.id))).toHaveLength(1);
    const parsed = await createOffer(deps, actor, { collegeId: college.id, documentId: doc.id, awardYear: AWARD_YEAR });
    await saveTestOffer(deps, SYSTEM, { offerId: parsed.id, costOfAttendanceUsd: 27800, lines: STATE_U_LINES });
    await deleteOffer(deps, actor, parsed.id);
    expect(await deps.db.select().from(offerLines).where(eq(offerLines.offerId, parsed.id))).toEqual([]);
    const kept = await createOffer(deps, actor, { collegeId: college.id, documentId: doc.id, awardYear: AWARD_YEAR });
    await saveTestOffer(deps, SYSTEM, { offerId: kept.id, costOfAttendanceUsd: 27800, lines: STATE_U_LINES });
    await confirmOffer(deps, actor, kept.id);
    await expect(deleteOffer(deps, actor, kept.id)).rejects.toMatchObject({ code: "conflict" });
    await expect(deleteOffer(deps, actor, "nope")).rejects.toMatchObject({ code: "not_found" });
  });

  it("stores a parsed award year within a year of now and ignores others (R2P-16)", async () => {
    const { deps, offer } = await withOffer();
    const save = { offerId: offer.id, costOfAttendanceUsd: 27800, lines: STATE_U_LINES };
    expect((await saveTestOffer(deps, SYSTEM, { ...save, awardYear: "2026-27" })).awardYear).toBe("2026-27");
    expect((await saveTestOffer(deps, SYSTEM, { ...save, awardYear: "1999-00" })).awardYear).toBe("2026-27");
    expect((await saveTestOffer(deps, SYSTEM, { ...save, awardYear: "2027" })).awardYear).toBe("2026-27");
    expect((await saveTestOffer(deps, SYSTEM, save)).awardYear).toBe("2026-27");
  });

  it("leaves letters with no known cost out of the comparison and explains both numbers (R2P-7)", async () => {
    const { deps, user, actor, offer } = await withOffer();
    await saveTestOffer(deps, SYSTEM, { offerId: offer.id, costOfAttendanceUsd: 27800, lines: STATE_U_LINES });
    await confirmOffer(deps, actor, offer.id);
    const blank = await factories.college(deps.db, { id: "100004", name: "No Cost U", costOfAttendanceUsd: null });
    const blankDoc = await makeDocument(deps, user.id);
    const unknown = await createOffer(deps, actor, {
      collegeId: blank.id,
      documentId: blankDoc.id,
      awardYear: AWARD_YEAR,
    });
    await saveTestOffer(deps, SYSTEM, {
      offerId: unknown.id,
      costOfAttendanceUsd: null,
      lines: [line("Big Grant", 40000, "grant", true)],
    });
    await confirmOffer(deps, actor, unknown.id);
    const comparison = await compareMyOffers(deps, actor, user.id);
    expect(comparison.columns.map((c) => c.collegeName)).toEqual(["State U"]);
    expect(comparison.lowestFourYearOfferId).toBe(offer.id);
    expect(comparison.assumptions).toContain(
      "No Cost U: the letter doesn't list a cost of attendance, so it isn't compared.",
    );
    expect(comparison.assumptions).toContain(OUTSIDE_SCHOLARSHIPS_NOTE);
  });

  it("asks each parent to review costs once after a letter is confirmed (R2I-7)", async () => {
    const { deps, user, actor, offer } = await withOffer();
    const { parent, family } = await makeParentOf(deps, user.id);
    await saveTestOffer(deps, SYSTEM, { offerId: offer.id, costOfAttendanceUsd: 27800, lines: STATE_U_LINES });
    await confirmOffer(deps, actor, offer.id);
    const reviews = () =>
      deps.db
        .select()
        .from(familyTasks)
        .where(and(eq(familyTasks.studentId, user.id), eq(familyTasks.kind, "review_costs")));
    expect(await reviews()).toMatchObject([
      {
        familyId: family.id,
        assigneeId: parent.id,
        title: "Review award letters with Test",
        detail: "",
        status: "todo",
      },
    ]);
    await confirmOffer(deps, actor, offer.id);
    expect(await reviews()).toHaveLength(1);
  });

  it("queues appeal outlines within the allowance", async () => {
    const { deps, user, actor, offer } = await withOffer();
    const { actor: other } = await makeStudent(deps);
    deps.jobs.clear();
    const job = await requestAppealOutline(deps, actor, offer.id);
    expect(job).toMatchObject({ kind: "appeal_outline", refId: offer.id, status: "queued" });
    expect(deps.jobs.sent).toEqual([{ name: "appeal.outline", payload: { jobId: job.id, offerId: offer.id } }]);
    await expect(requestAppealOutline(deps, other, offer.id)).rejects.toMatchObject({ code: "not_found" });
    await deps.db.insert(usageCounters).values({ userId: user.id, month: "2026-10", crewRequests: 20 });
    deps.jobs.clear();
    await expect(requestAppealOutline(deps, actor, offer.id)).rejects.toMatchObject({ code: "limit_reached" });
    expect(deps.jobs.sent).toEqual([]);
  });

  it("estimates federal loan payments at the award year's rates", async () => {
    const { deps, actor, offer } = await withOffer();
    await saveTestOffer(deps, SYSTEM, {
      offerId: offer.id,
      costOfAttendanceUsd: 27800,
      lines: [
        line("Federal Direct Subsidized Loan", 3500, "loan_federal_subsidized", true),
        line("Bank Loan", 5000, "loan_private", false),
        line("Parent PLUS Loan", 10000, "loan_parent_plus", false),
        line("Texas Grant", 12000, "grant", true),
      ],
    });
    expect(await loanEstimates(deps, actor, offer.id)).toEqual([]);
    await deps.db.insert(aidRules).values({
      awardYear: AWARD_YEAR,
      key: "federal_loan_rates",
      value: { subsidized: 6.53, unsubsidized: 6.53, parent_plus: 9.08 },
      sourceUrl: "https://studentaid.gov/understand-aid/types/loans/interest-rates",
      verifiedAt: new Date(NOW),
    });
    expect(await loanEstimates(deps, actor, offer.id)).toEqual([
      {
        ...estimateLoanPayment({ principalUsd: 3500, annualRatePct: 6.53, years: 10 }),
        label: "Federal Direct Subsidized Loan",
      },
      { ...estimateLoanPayment({ principalUsd: 10000, annualRatePct: 9.08, years: 10 }), label: "Parent PLUS Loan" },
    ]);
  });

  it("lets a parent read offers only with the costs share", async () => {
    const { deps, user, offer } = await withOffer();
    const { actor: parent } = await makeParentOf(deps, user.id);
    expect((await listOffers(deps, parent, user.id)).map((o) => o.id)).toEqual([offer.id]);
    expect((await getOffer(deps, parent, offer.id)).id).toBe(offer.id);
    await setShare(deps, user.id, "costs", false);
    await expect(listOffers(deps, parent, user.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getOffer(deps, parent, offer.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("publicOfferTool", () => {
  it("compares typed offers with no storage and rejects empty input", () => {
    const result = publicOfferTool({
      offers: [
        {
          name: "State U",
          costOfAttendanceUsd: 27800,
          lines: [{ label: "Grant", amountUsd: 18600, category: "grant", renewable: true }],
        },
      ],
    });
    expect(result.columns[0]).toMatchObject({ collegeName: "State U", reallyCostsUsd: 9200, fourYearUsd: 36800 });
    let code: string | undefined;
    try {
      publicOfferTool({ offers: [] });
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("invalid_input");
  });
});
async function saveTestOffer(
  deps: Parameters<typeof saveParsedOffer>[0],
  actor: Parameters<typeof saveParsedOffer>[1],
  input: Omit<Parameters<typeof saveParsedOffer>[2], "ownerId">,
) {
  const [offer] = await deps.db.select({ ownerId: offers.ownerId }).from(offers).where(eq(offers.id, input.offerId));
  if (!offer) throw new Error("test offer missing");
  return saveParsedOffer(deps, actor, { ...input, ownerId: offer.ownerId });
}

async function failTestOffer(
  deps: Parameters<typeof markOfferFailed>[0],
  actor: Parameters<typeof markOfferFailed>[1],
  offerId: string,
  error: string,
) {
  const [offer] = await deps.db.select({ ownerId: offers.ownerId }).from(offers).where(eq(offers.id, offerId));
  if (!offer) throw new Error("test offer missing");
  return markOfferFailed(deps, actor, { offerId, ownerId: offer.ownerId, error });
}
