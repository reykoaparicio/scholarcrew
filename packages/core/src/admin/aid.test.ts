import { offers } from "@scholarcrew/db";
import { aidDeadlines, aidRules, auditEvents, eq } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type AidDeadlineInput, systemActor, userActor } from "@scholarcrew/domain";
import { estimateLoanPayment } from "@scholarcrew/engines";
import { describe, expect, it } from "vitest";
import { createOffer, loanEstimates, saveParsedOffer } from "../money";
import { AWARD_YEAR, NOW, makeDeps, makeDocument, makeStateU, makeStudent } from "../plan/testkit";
import { deleteAidDeadline, listAidDeadlinesForAdmin, listAidRules, upsertAidDeadline, upsertAidRule } from "./index";

const SOURCE = "https://studentaid.gov/understand-aid/types/loans/interest-rates";
const RATES = { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 };

async function admin() {
  const { deps, clock } = makeDeps();
  const me = await factories.admin(deps.db);
  return { deps, clock, actor: userActor(me.id, "admin") };
}

const deadline = (o: Partial<AidDeadlineInput> = {}): AidDeadlineInput => ({
  awardYear: AWARD_YEAR,
  state: null,
  program: "FAFSA",
  deadline: "2028-06-30",
  note: "",
  sourceUrl: "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines",
  ...o,
});

describe("admin aid rules", () => {
  it("upserts loan rates by award year, lists valid rows, and feeds loanEstimates", async () => {
    const { deps, clock, actor } = await admin();
    const first = await upsertAidRule(deps, actor, {
      awardYear: AWARD_YEAR,
      key: "federal_loan_rates",
      value: RATES,
      sourceUrl: SOURCE,
    });
    expect(first).toMatchObject({ awardYear: AWARD_YEAR, key: "federal_loan_rates", value: RATES, verifiedAt: NOW });
    clock.set("2026-10-07T15:00:00.000Z");
    const updated = await upsertAidRule(deps, actor, {
      awardYear: AWARD_YEAR,
      key: "federal_loan_rates",
      value: { ...RATES, parent_plus: 9.08 },
      sourceUrl: SOURCE,
    });
    expect(updated).toMatchObject({ id: first.id, verifiedAt: "2026-10-07T15:00:00.000Z" });
    await deps.db.insert(aidRules).values({
      awardYear: "2026-27",
      key: "federal_loan_rates",
      value: { subsidized: "x" },
      sourceUrl: SOURCE,
      verifiedAt: new Date(NOW),
    });
    expect((await listAidRules(deps, actor, {})).map((r) => r.awardYear)).toEqual([AWARD_YEAR]);
    expect(await listAidRules(deps, actor, { awardYear: "2026-27" })).toEqual([]);
    await expect(listAidRules(deps, actor, { awardYear: "2027" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      upsertAidRule(deps, actor, {
        awardYear: AWARD_YEAR,
        key: "federal_loan_rates",
        value: { ...RATES, subsidized: 31 },
        sourceUrl: SOURCE,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    const { user, actor: student } = await makeStudent(deps);
    const college = await makeStateU(deps);
    const doc = await makeDocument(deps, user.id);
    const offer = await createOffer(deps, student, {
      collegeId: college.id,
      documentId: doc.id,
      awardYear: AWARD_YEAR,
    });
    await saveTestOffer(deps, systemActor("test"), {
      offerId: offer.id,
      costOfAttendanceUsd: 27800,
      lines: [
        {
          label: "Parent PLUS Loan",
          amountUsd: 10000,
          category: "loan_parent_plus",
          renewable: false,
          renewalCondition: "",
          page: 1,
          citedText: "",
        },
      ],
    });
    expect(await loanEstimates(deps, student, offer.id)).toEqual([
      { ...estimateLoanPayment({ principalUsd: 10000, annualRatePct: 9.08, years: 10 }), label: "Parent PLUS Loan" },
    ]);
    expect(await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "aid_rule_upserted"))).toHaveLength(2);
  });

  it("adds, edits, lists, and deletes aid deadlines", async () => {
    const { deps, actor } = await admin();
    const federal = await upsertAidDeadline(deps, actor, deadline());
    const texas = await upsertAidDeadline(
      deps,
      actor,
      deadline({ state: "TX", program: "TEXAS Grant priority", deadline: "2027-01-15" }),
    );
    await upsertAidDeadline(deps, actor, deadline({ awardYear: "2026-27", deadline: "2027-06-30" }));
    const edited = await upsertAidDeadline(
      deps,
      actor,
      deadline({ id: texas.id, state: "TX", program: "TEXAS Grant priority", deadline: "2027-01-31" }),
    );
    expect(edited).toMatchObject({ id: texas.id, deadline: "2027-01-31", verifiedAt: NOW });
    await expect(
      upsertAidDeadline(deps, actor, deadline({ id: "00000000-0000-4000-8000-000000000000" })),
    ).rejects.toMatchObject({ code: "not_found" });
    expect((await listAidDeadlinesForAdmin(deps, actor, { awardYear: AWARD_YEAR })).map((d) => d.id)).toEqual([
      edited.id,
      federal.id,
    ]);
    expect(await listAidDeadlinesForAdmin(deps, actor, {})).toHaveLength(3);
    await deleteAidDeadline(deps, actor, federal.id);
    expect(await deps.db.select().from(aidDeadlines).where(eq(aidDeadlines.id, federal.id))).toEqual([]);
    await expect(deleteAidDeadline(deps, actor, federal.id)).rejects.toMatchObject({ code: "not_found" });
    const actions = (await deps.db.select().from(auditEvents)).map((e) => e.action).sort();
    expect(actions).toEqual(["aid_deadline_deleted", ...Array(4).fill("aid_deadline_upserted")]);
  });

  it("denies non-admins", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    const id = "00000000-0000-4000-8000-000000000000";
    await expect(listAidRules(deps, actor, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      upsertAidRule(deps, actor, { awardYear: AWARD_YEAR, key: "federal_loan_rates", value: RATES, sourceUrl: SOURCE }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(listAidDeadlinesForAdmin(deps, actor, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(upsertAidDeadline(deps, actor, deadline())).rejects.toMatchObject({ code: "forbidden" });
    await expect(deleteAidDeadline(deps, actor, id)).rejects.toMatchObject({ code: "forbidden" });
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
