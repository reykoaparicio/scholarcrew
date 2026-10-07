import { costEstimates, eq, familyBudgets, offerLines, offers, scholarships } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { setSensitiveFact } from "../memory";
import { NOW, listCollege, makeDeps, makeParentOf, makeStateU, makeStudent, saveApp, setShare } from "../plan/testkit";
import { getCosts, setCalculatorResult } from "./costs";

async function stateUStudent(withRange: boolean) {
  const { deps } = makeDeps();
  const student = await makeStudent(deps);
  const college = await makeStateU(deps);
  await listCollege(deps, student.user.id, college.id, { plan: "EA" });
  if (withRange) {
    await setSensitiveFact(deps, student.actor, { kind: "income_range", enabled: true, value: "48_75k" });
  }
  const apps = [
    ["planned", 2500],
    ["drafting", 1000],
    ["submitted", 750],
    ["planned", 500],
    ["matched", 2000],
    ["lost", 300],
  ] as const;
  for (const [stage, amountUsd] of apps) await saveApp(deps, student.user.id, { stage, amountUsd });
  return { deps, ...student, college };
}

describe("getCosts", () => {
  it("estimates State U from the Scorecard band for the shared income range", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    expect(await getCosts(deps, actor, user.id)).toEqual([
      {
        collegeId: "100001",
        collegeName: "State U",
        source: "scorecard",
        sourceLabel: "College Scorecard estimate for your income range",
        costOfAttendanceUsd: 27800,
        freeMoneyUsd: 18600,
        gapUsd: 9200,
        pendingUsd: 4750,
        gapIfPendingWinUsd: 4450,
        isEstimate: true,
        budgetUsd: null,
        gapAfterBudgetUsd: null,
      },
    ]);
    const rows = await deps.db.select().from(costEstimates).where(eq(costEstimates.ownerId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "scorecard",
      costOfAttendanceUsd: 27800,
      freeMoneyUsd: 18600,
      netPriceUsd: 9200,
      inputs: { basis: "income_range" },
    });
    await getCosts(deps, actor, user.id);
    expect(await deps.db.select().from(costEstimates).where(eq(costEstimates.ownerId, user.id))).toHaveLength(1);
  });

  it("uses the overall average when no income range is shared", async () => {
    const { deps, user, actor } = await stateUStudent(false);
    const [summary] = await getCosts(deps, actor, user.id);
    expect(summary).toMatchObject({
      sourceLabel: "College Scorecard average (no income range shared)",
      freeMoneyUsd: 15800,
      gapUsd: 12000,
      gapIfPendingWinUsd: 7250,
    });
  });

  it("counts won outside scholarships as free money for year 1", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    await saveApp(deps, user.id, { stage: "won", amountUsd: 1000, outcomeUsd: 1000, outcomeRenewable: false });
    const [summary] = await getCosts(deps, actor, user.id);
    expect(summary).toMatchObject({ freeMoneyUsd: 19600, gapUsd: 8200, pendingUsd: 4750, gapIfPendingWinUsd: 3450 });
  });

  it("prefers a confirmed award letter over the Scorecard", async () => {
    const { deps, user, actor, college } = await stateUStudent(true);
    const [offer] = await deps.db
      .insert(offers)
      .values({
        ownerId: user.id,
        collegeId: college.id,
        awardYear: "2027-28",
        status: "confirmed",
        costOfAttendanceUsd: 27800,
        confirmedAt: new Date(NOW),
      })
      .returning();
    if (!offer) throw new Error("offer insert failed");
    await deps.db.insert(offerLines).values([
      { offerId: offer.id, position: 0, label: "Texas Grant", amountUsd: 15000, category: "grant" },
      { offerId: offer.id, position: 1, label: "State U Merit", amountUsd: 3000, category: "scholarship" },
      {
        offerId: offer.id,
        position: 2,
        label: "Federal Direct Loan",
        amountUsd: 5500,
        category: "loan_federal_unsubsidized",
      },
    ]);
    const [summary] = await getCosts(deps, actor, user.id);
    expect(summary).toMatchObject({
      source: "offer",
      sourceLabel: "Your confirmed award letter",
      freeMoneyUsd: 18000,
      gapUsd: 9800,
      isEstimate: false,
    });
    await deps.db
      .update(offers)
      .set({ archivedAt: new Date(NOW) })
      .where(eq(offers.id, offer.id));
    expect((await getCosts(deps, actor, user.id))[0]?.source).toBe("scorecard");
  });

  it("prefers a confirmed award letter over a calculator result, then falls back to it (R2P-6)", async () => {
    const { deps, user, actor, college } = await stateUStudent(true);
    await setCalculatorResult(deps, actor, { collegeId: college.id, costOfAttendanceUsd: 28000, grantsUsd: 20000 });
    const [offer] = await deps.db
      .insert(offers)
      .values({
        ownerId: user.id,
        collegeId: college.id,
        awardYear: "2027-28",
        status: "confirmed",
        costOfAttendanceUsd: 27800,
        confirmedAt: new Date(NOW),
      })
      .returning();
    if (!offer) throw new Error("offer insert failed");
    await deps.db
      .insert(offerLines)
      .values({ offerId: offer.id, position: 0, label: "Texas Grant", amountUsd: 15000, category: "grant" });
    expect((await getCosts(deps, actor, user.id))[0]).toMatchObject({
      source: "offer",
      isEstimate: false,
      freeMoneyUsd: 15000,
    });
    await deps.db
      .update(offers)
      .set({ archivedAt: new Date(NOW) })
      .where(eq(offers.id, offer.id));
    expect((await getCosts(deps, actor, user.id))[0]).toMatchObject({ source: "calculator", isEstimate: true });
  });

  it("leaves retired listings out of pending money (R2P-4)", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    const { scholarship } = await saveApp(deps, user.id, { stage: "planned", amountUsd: 900 });
    expect((await getCosts(deps, actor, user.id))[0]?.pendingUsd).toBe(5650);
    await deps.db.update(scholarships).set({ status: "retired" }).where(eq(scholarships.id, scholarship.id));
    expect((await getCosts(deps, actor, user.id))[0]).toMatchObject({ pendingUsd: 4750, gapIfPendingWinUsd: 4450 });
  });

  it("leaves past-due planned and drafting money out of pending, but keeps submitted (R3V-6)", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    await saveApp(deps, user.id, { stage: "planned", amountUsd: 900, deadline: "2026-10-05" });
    await saveApp(deps, user.id, { stage: "drafting", amountUsd: 400, deadline: "2026-10-05" });
    await saveApp(deps, user.id, { stage: "planned", amountUsd: 100, deadline: "2026-10-06" });
    await saveApp(deps, user.id, { stage: "planned", amountUsd: 50, deadline: null });
    await saveApp(deps, user.id, { stage: "submitted", amountUsd: 600, deadline: "2026-10-05" });
    expect((await getCosts(deps, actor, user.id))[0]?.pendingUsd).toBe(4750 + 100 + 50 + 600);
  });

  it("skips colleges without numbers and colleges from other seasons", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    const blank = await factories.college(deps.db, { id: "100002", name: "No Data", costOfAttendanceUsd: null });
    const old = await factories.college(deps.db, { id: "100003", name: "Last Year" });
    await listCollege(deps, user.id, blank.id, { minutesAfter: 1 });
    await listCollege(deps, user.id, old.id, { season: "2025-26", archivedAt: new Date(NOW), minutesAfter: 2 });
    expect((await getCosts(deps, actor, user.id)).map((c) => c.collegeName)).toEqual(["State U"]);
  });

  it("shows the gap after a shared family budget and follows the costs share", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    const { parent, family, actor: parentActor } = await makeParentOf(deps, user.id);
    const { actor: other } = await makeStudent(deps);
    await deps.db.insert(familyBudgets).values({ familyId: family.id, annualUsd: 4600, sharedById: parent.id });
    const [summary] = await getCosts(deps, parentActor, user.id);
    expect(summary).toMatchObject({ gapUsd: 9200, budgetUsd: 4600, gapAfterBudgetUsd: 4600 });
    expect((await getCosts(deps, actor, user.id))[0]?.gapAfterBudgetUsd).toBe(4600);
    await expect(getCosts(deps, other, user.id)).rejects.toMatchObject({ code: "not_found" });
    await setShare(deps, user.id, "costs", false);
    await expect(getCosts(deps, parentActor, user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("setCalculatorResult", () => {
  it("replaces the Scorecard estimate with the student's calculator result", async () => {
    const { deps, user, actor } = await stateUStudent(true);
    const summary = await setCalculatorResult(deps, actor, {
      collegeId: "100001",
      costOfAttendanceUsd: 28000,
      grantsUsd: 20000,
    });
    expect(summary).toMatchObject({
      source: "calculator",
      sourceLabel: "Your net price calculator result",
      costOfAttendanceUsd: 28000,
      freeMoneyUsd: 20000,
      gapUsd: 8000,
      isEstimate: true,
    });
    expect((await getCosts(deps, actor, user.id))[0]).toEqual(summary);
    const [row] = await deps.db.select().from(costEstimates).where(eq(costEstimates.source, "calculator"));
    expect(row).toMatchObject({ netPriceUsd: 8000, inputs: { grantsUsd: 20000 } });
  });

  it("rejects grants above the cost and unknown colleges", async () => {
    const { deps, actor } = await stateUStudent(false);
    await expect(
      setCalculatorResult(deps, actor, { collegeId: "100001", costOfAttendanceUsd: 20000, grantsUsd: 25000 }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      setCalculatorResult(deps, actor, { collegeId: "999999", costOfAttendanceUsd: 20000, grantsUsd: 5000 }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
