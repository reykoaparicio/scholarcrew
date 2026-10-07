import { auditEvents, colleges, eq } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type CollegeImportRow, userActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { NOW, makeDeps, makeStudent } from "../plan/testkit";
import { enqueueResearch, importColleges, searchAudit } from "./index";

const row = (o: Partial<CollegeImportRow> = {}): CollegeImportRow => ({
  id: "100001",
  name: "State U",
  state: "TX",
  city: "Austin",
  control: "public",
  admitRate: 0.452,
  costOfAttendanceUsd: 27800,
  netPriceByIncome: {
    overall: 12000,
    under_30k: 6500,
    "30_48k": 8000,
    "48_75k": 9200,
    "75_110k": 14000,
    over_110k: null,
  },
  ...o,
});

async function admin() {
  const { deps } = makeDeps();
  const me = await factories.admin(deps.db);
  return { deps, me, actor: userActor(me.id, "admin") };
}

describe("importColleges", () => {
  it("inserts new colleges with defaults and refreshes only Scorecard fields on existing ones", async () => {
    const { deps, actor } = await admin();
    const tier = { label: "Presidential", minGpa: 3.5, minAct: 28, minSat: null, annualUsd: 4000, renewalGpa: 3.0 };
    await factories.college(deps.db, {
      id: "100001",
      name: "Old Name",
      cssProfileRequired: true,
      meritTiers: [tier],
      deadlines: { ED: null, EA: "2026-11-01", REA: null, RD: null, rolling: false },
    });
    const result = await importColleges(deps, actor, [
      row(),
      row({ id: "100009", name: "New College" }),
      row({ id: "12" }),
    ]);
    expect(result).toMatchObject({ inserted: 1, updated: 1, skipped: 1 });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.line).toBe(3);
    const [kept] = await deps.db.select().from(colleges).where(eq(colleges.id, "100001"));
    expect(kept).toMatchObject({
      name: "State U",
      city: "Austin",
      admitRateX1000: 452,
      costOfAttendanceUsd: 27800,
      cssProfileRequired: true,
      meritTiers: [tier],
      deadlines: { ED: null, EA: "2026-11-01", REA: null, RD: null, rolling: false },
    });
    const [fresh] = await deps.db.select().from(colleges).where(eq(colleges.id, "100009"));
    expect(fresh).toMatchObject({
      name: "New College",
      testPolicy: "unknown",
      cssProfileRequired: false,
      meritTiers: [],
      deadlines: { ED: null, EA: null, REA: null, RD: null, rolling: false },
      requirements: {
        supplements: [],
        teacherRecs: 0,
        counselorRec: false,
        applicationFeeUsd: null,
        feeWaiverAvailable: false,
        portfolio: false,
        interview: "none",
      },
    });
    const [audit] = await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "colleges_imported"));
    expect(audit?.meta).toEqual({ inserted: 1, updated: 1, skipped: 1 });
  });

  it("denies non-admins", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    await expect(importColleges(deps, actor, [row()])).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("searchAudit", () => {
  it("pages 20 events at a time, newest first, with filters", async () => {
    const { deps, me, actor } = await admin();
    const start = new Date(NOW).getTime();
    await deps.db.insert(auditEvents).values(
      Array.from({ length: 25 }, (_, i) => ({
        actorId: me.id,
        actorKind: "user",
        action: i % 2 === 1 ? "colleges_imported" : "scholarship_updated",
        entityType: "scholarship",
        entityId: `s-${i}`,
        createdAt: new Date(start - (25 - i) * 60_000),
      })),
    );
    const first = await searchAudit(deps, actor, { page: 1 });
    expect(first).toMatchObject({ page: 1, pageSize: 20, total: 25 });
    expect(first.items).toHaveLength(20);
    expect(first.items[0]?.entityId).toBe("s-24");
    const second = await searchAudit(deps, actor, { page: 2 });
    expect(second.items.map((e) => e.entityId)).toEqual(["s-4", "s-3", "s-2", "s-1", "s-0"]);
    expect((await searchAudit(deps, actor, { page: 1, action: "colleges_imported" })).total).toBe(12);
    expect((await searchAudit(deps, actor, { page: 1, entityId: "s-7" })).items.map((e) => e.action)).toEqual([
      "colleges_imported",
    ]);
    const { actor: student } = await makeStudent(deps);
    await expect(searchAudit(deps, student, { page: 1 })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("enqueueResearch", () => {
  it("queues catalog research for a state and county", async () => {
    const { deps, actor } = await admin();
    await enqueueResearch(deps, actor, { state: "TX", county: "Maple" });
    await enqueueResearch(deps, actor, { state: "ca" });
    expect(deps.jobs.sent).toEqual([
      { name: "catalog.research", payload: { state: "TX", county: "Maple" } },
      { name: "catalog.research", payload: { state: "CA", county: null } },
    ]);
    await expect(enqueueResearch(deps, actor, { state: "ZZ" })).rejects.toMatchObject({ code: "invalid_input" });
    const { actor: student } = await makeStudent(deps);
    await expect(enqueueResearch(deps, student, { state: "TX" })).rejects.toMatchObject({ code: "forbidden" });
    expect(await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "research_enqueued"))).toHaveLength(2);
  });
});
