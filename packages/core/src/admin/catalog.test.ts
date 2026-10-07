import { auditEvents, catalogReports, eq, scholarships } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type ScholarshipUpsertInput, systemActor, userActor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { NOW, makeDeps, makeStudent } from "../plan/testkit";
import {
  createCatalogTask,
  getCatalogTask,
  getScholarshipForAdmin,
  listCatalogTasks,
  listReports,
  listScholarships,
  resolveCatalogTask,
  resolveReport,
  setScholarshipStatus,
  upsertScholarship,
} from "./catalog";

const SYSTEM = systemActor("test");

const upsertInput = (o: Partial<ScholarshipUpsertInput> = {}): ScholarshipUpsertInput => ({
  id: null,
  slug: "maple-rotary-stem",
  name: "Maple Rotary STEM Award",
  provider: "Rotary Club of Maple",
  url: "https://example.org/rotary",
  sourceUrl: "https://example.org/rotary",
  amountMinUsd: 2500,
  amountMaxUsd: 2500,
  renewable: false,
  renewalTerms: "",
  deadline: "2026-10-30",
  cycle: "2026-27",
  localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
  eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
  requirements: { essays: [], recommendations: 0, transcript: false, serviceHours: null, other: [] },
  estMinutes: 45,
  scamFlags: [],
  ...o,
});

async function admin() {
  const { deps } = makeDeps();
  const row = await factories.admin(deps.db);
  return { deps, admin: row, actor: userActor(row.id, "admin") };
}

describe("admin catalog", () => {
  it("denies non-admins", async () => {
    const { deps } = makeDeps();
    const { actor } = await makeStudent(deps);
    await expect(listCatalogTasks(deps, actor, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(upsertScholarship(deps, actor, upsertInput())).rejects.toMatchObject({ code: "forbidden" });
    await expect(listReports(deps, actor)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      createCatalogTask(deps, actor, { kind: "import", payload: { type: "import", summary: "x" } }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("queues tasks and publishes the listing when a task resolves", async () => {
    const { deps, admin: me, actor } = await admin();
    const { user } = await makeStudent(deps);
    const draft = await factories.scholarship(deps.db, {
      status: "draft",
      visibility: "submitter_only",
      verifiedAt: null,
      submittedById: user.id,
    });
    const task = await createCatalogTask(deps, SYSTEM, {
      kind: "user_submission",
      scholarshipId: draft.id,
      createdById: user.id,
      payload: { type: "user_submission", url: draft.url, name: draft.name, notes: "", submittedById: user.id },
    });
    await createCatalogTask(deps, SYSTEM, {
      kind: "import",
      payload: { type: "import", summary: "Imported 12 colleges" },
    });
    await expect(
      createCatalogTask(deps, SYSTEM, { kind: "report", payload: { type: "import", summary: "x" } }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect((await listCatalogTasks(deps, actor, { kind: "user_submission" })).map((t) => t.id)).toEqual([task.id]);
    expect(await listCatalogTasks(deps, actor, { status: "open" })).toHaveLength(2);
    const resolved = await resolveCatalogTask(deps, actor, task.id, {
      status: "resolved",
      note: "Checked the source page",
      publishScholarshipId: draft.id,
    });
    expect(resolved).toMatchObject({
      status: "resolved",
      resolvedById: me.id,
      resolutionNote: "Checked the source page",
      resolvedAt: NOW,
    });
    const [listing] = await deps.db.select().from(scholarships).where(eq(scholarships.id, draft.id));
    expect(listing).toMatchObject({ status: "published", visibility: "public", verifiedById: me.id });
    expect(listing?.verifiedAt?.toISOString()).toBe(NOW);
    await expect(
      resolveCatalogTask(deps, actor, task.id, { status: "rejected", note: "again", publishScholarshipId: null }),
    ).rejects.toMatchObject({ code: "conflict" });
    const audit = await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "catalog_task_resolved"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: me.id, entityId: task.id });
  });

  it("republishes a stale listing when its re-check is rejected, and leaves other kinds alone (R2C-7)", async () => {
    const { deps, admin: me, actor } = await admin();
    const stale = await factories.scholarship(deps.db, {
      status: "stale",
      verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const recheck = (scholarshipId: string) =>
      createCatalogTask(deps, SYSTEM, {
        kind: "recheck_changed",
        scholarshipId,
        payload: { type: "recheck_changed", url: stale.url, before: null, after: null, report: null },
      });
    const task = await recheck(stale.id);
    await resolveCatalogTask(deps, actor, task.id, {
      status: "rejected",
      note: "Change doesn't matter",
      publishScholarshipId: null,
    });
    const [kept] = await deps.db.select().from(scholarships).where(eq(scholarships.id, stale.id));
    expect(kept).toMatchObject({ status: "published", verifiedById: me.id });
    expect(kept?.verifiedAt?.toISOString()).toBe(NOW);
    const retired = await factories.scholarship(deps.db, { status: "retired" });
    await resolveCatalogTask(deps, actor, (await recheck(retired.id)).id, {
      status: "rejected",
      note: "Already retired",
      publishScholarshipId: null,
    });
    expect((await deps.db.select().from(scholarships).where(eq(scholarships.id, retired.id)))[0]?.status).toBe(
      "retired",
    );
    const other = await factories.scholarship(deps.db, { status: "stale" });
    const importTask = await createCatalogTask(deps, SYSTEM, {
      kind: "import",
      scholarshipId: other.id,
      payload: { type: "import", summary: "x" },
    });
    await resolveCatalogTask(deps, actor, importTask.id, {
      status: "rejected",
      note: "No",
      publishScholarshipId: null,
    });
    expect((await deps.db.select().from(scholarships).where(eq(scholarships.id, other.id)))[0]?.status).toBe("stale");
  });

  it("creates and edits listings and sets their status", async () => {
    const { deps, admin: me, actor } = await admin();
    const created = await upsertScholarship(deps, actor, upsertInput());
    expect(created).toMatchObject({
      slug: "maple-rotary-stem",
      status: "draft",
      visibility: "public",
      verifiedAt: null,
    });
    const edited = await upsertScholarship(deps, actor, upsertInput({ id: created.id, amountMaxUsd: 3000 }));
    expect(edited).toMatchObject({ id: created.id, amountMaxUsd: 3000 });
    await expect(upsertScholarship(deps, actor, upsertInput())).rejects.toMatchObject({ code: "conflict" });
    await expect(
      upsertScholarship(deps, actor, upsertInput({ id: "00000000-0000-4000-8000-000000000000", slug: "other-slug" })),
    ).rejects.toMatchObject({ code: "not_found" });
    const published = await setScholarshipStatus(deps, actor, created.id, "published", "Verified with the club");
    expect(published).toMatchObject({ status: "published", verifiedAt: NOW });
    const [row] = await deps.db.select().from(scholarships).where(eq(scholarships.id, created.id));
    expect(row?.verifiedById).toBe(me.id);
    expect((await setScholarshipStatus(deps, actor, created.id, "retired")).status).toBe("retired");
    const actions = (await deps.db.select().from(auditEvents)).map((e) => e.action).sort();
    expect(actions).toEqual([
      "scholarship_created",
      "scholarship_status_set",
      "scholarship_status_set",
      "scholarship_updated",
    ]);
  });

  it("lists reports with names and resolves the report and its task", async () => {
    const { deps, actor } = await admin();
    const { user } = await makeStudent(deps);
    const listing = await factories.scholarship(deps.db, { name: "Maple Rotary" });
    const [report] = await deps.db
      .insert(catalogReports)
      .values({ scholarshipId: listing.id, reporterId: user.id, reason: "wrong_deadline", details: "It's Oct 30" })
      .returning();
    if (!report) throw new Error("report insert failed");
    const task = await createCatalogTask(deps, SYSTEM, {
      kind: "report",
      scholarshipId: listing.id,
      payload: { type: "report", reportId: report.id, reason: "wrong_deadline", details: "It's Oct 30" },
    });
    expect((await listReports(deps, actor, "open")).map((r) => [r.scholarshipName, r.reason])).toEqual([
      ["Maple Rotary", "wrong_deadline"],
    ]);
    const resolved = await resolveReport(deps, actor, report.id, { status: "resolved", note: "Deadline fixed" });
    expect(resolved).toMatchObject({ status: "resolved", resolvedAt: NOW, scholarshipName: "Maple Rotary" });
    expect(await listReports(deps, actor, "open")).toEqual([]);
    const [closed] = await listCatalogTasks(deps, actor, { kind: "report" });
    expect(closed).toMatchObject({ id: task.id, status: "resolved", resolutionNote: "Deadline fixed" });
    await expect(resolveReport(deps, actor, report.id, { status: "rejected", note: "x" })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("reads one listing in any status, pages listings with filters, and reads one task (D36)", async () => {
    const { deps, actor } = await admin();
    const { actor: student } = await makeStudent(deps);
    const draft = await factories.scholarship(deps.db, {
      name: "Maple Rotary Draft",
      status: "draft",
      visibility: "submitter_only",
    });
    await factories.scholarship(deps.db, { name: "Hill Country STEM", provider: "Hill Country Fund" });
    await factories.scholarship(deps.db, { name: "Retired Award", status: "retired" });
    expect(await getScholarshipForAdmin(deps, actor, draft.id)).toMatchObject({
      id: draft.id,
      status: "draft",
      visibility: "submitter_only",
    });
    await expect(getScholarshipForAdmin(deps, actor, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await listScholarships(deps, actor, { page: 1 })).toMatchObject({ page: 1, pageSize: 50, total: 3 });
    expect((await listScholarships(deps, actor, { status: "draft", page: 1 })).items.map((s) => s.id)).toEqual([
      draft.id,
    ]);
    const byProvider = await listScholarships(deps, actor, { q: "hill country fund", page: 1 });
    expect(byProvider.items.map((s) => s.name)).toEqual(["Hill Country STEM"]);
    expect((await listScholarships(deps, actor, { page: 2 })).items).toEqual([]);
    await expect(listScholarships(deps, actor, { page: 0 })).rejects.toMatchObject({ code: "invalid_input" });
    const task = await createCatalogTask(deps, SYSTEM, {
      kind: "import",
      payload: { type: "import", summary: "Imported 12 colleges" },
    });
    expect(await getCatalogTask(deps, actor, task.id)).toEqual(task);
    await expect(getCatalogTask(deps, actor, "nope")).rejects.toMatchObject({ code: "not_found" });
    await expect(getScholarshipForAdmin(deps, student, draft.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(listScholarships(deps, student, { page: 1 })).rejects.toMatchObject({ code: "forbidden" });
    await expect(getCatalogTask(deps, student, task.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});
