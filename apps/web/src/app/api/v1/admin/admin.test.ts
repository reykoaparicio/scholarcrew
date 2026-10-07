import { reportListing, submitLocalScholarship } from "@scholarcrew/core/scholarships";
import { factories } from "@scholarcrew/db/testing";
import {
  type AidDeadline,
  type AidRule,
  type AuditEvent,
  type CatalogReport,
  type CatalogTask,
  type Page,
  type Scholarship,
  userActor,
} from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  params,
  readJson,
  request,
  signedInAdmin,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { DELETE as deleteDeadline } from "./aid-deadlines/[id]/route";
import { GET as listDeadlines, PUT as putDeadline } from "./aid-deadlines/route";
import { GET as listRules, PUT as putRule } from "./aid-rules/route";
import { GET as searchAudit } from "./audit/route";
import { POST as resolveTask } from "./catalog-tasks/[id]/resolve/route";
import { GET as getTask } from "./catalog-tasks/[id]/route";
import { GET as listTasks } from "./catalog-tasks/route";
import { POST as resolveReport } from "./reports/[id]/resolve/route";
import { GET as listReports } from "./reports/route";
import { POST as enqueueResearch } from "./research/route";
import { GET as getListing, PATCH as updateListing } from "./scholarships/[id]/route";
import { POST as setStatus } from "./scholarships/[id]/status/route";
import { POST as createListing, GET as listListings } from "./scholarships/route";

const deps = useTestDeps();

const LISTING = {
  slug: "maple-rotary-stem-award",
  name: "Maple Rotary STEM Award",
  provider: "Maple Rotary Club",
  url: "https://maplerotary.example/stem",
  sourceUrl: "https://maplerotary.example/stem",
  amountMinUsd: 1000,
  amountMaxUsd: 2500,
  renewable: false,
  renewalTerms: "",
  deadline: "2027-02-01",
  cycle: "2026-27",
  localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
  eligibility: [{ type: "state_in", states: ["TX"] }],
  requirements: {
    essays: [{ prompt: "Why STEM?", wordLimit: 500 }],
    recommendations: 1,
    transcript: true,
    serviceHours: null,
    other: [],
  },
  estMinutes: 90,
  scamFlags: [],
};

describe("admin guard (ID-04)", () => {
  it("is 401 signed out and 404 for non-admins", async () => {
    expect((await listTasks(request("/admin/catalog-tasks"), NO_PARAMS)).status).toBe(401);
    const { cookie } = await signedInStudent(deps().db);
    expect((await listTasks(request("/admin/catalog-tasks", { cookie }), NO_PARAMS)).status).toBe(404);
    const body = { state: "TX" };
    expect(
      (await enqueueResearch(request("/admin/research", { method: "POST", cookie, body }), NO_PARAMS)).status,
    ).toBe(404);
  });
});

describe("review queue (AD-01)", () => {
  it("filters tasks and resolves one once", async () => {
    const student = await signedInStudent(deps().db);
    await submitLocalScholarship(deps(), userActor(student.user.id, "student"), {
      url: "https://maplerotary.example/local",
      name: "Maple Local Award",
      notes: "",
    });
    const { cookie } = await signedInAdmin(deps().db);
    const res = await listTasks(
      request("/admin/catalog-tasks?status=open&kind=user_submission", { cookie }),
      NO_PARAMS,
    );
    const tasks = await readJson<CatalogTask[]>(res);
    expect(tasks).toHaveLength(1);
    const task = tasks[0];
    if (!task) throw new Error("expected a task");
    expect((await listTasks(request("/admin/catalog-tasks?status=done", { cookie }), NO_PARAMS)).status).toBe(400);

    const path = `/admin/catalog-tasks/${task.id}/resolve`;
    const body = { status: "resolved", note: "Verified with the club", publishScholarshipId: task.scholarshipId };
    const resolved = await resolveTask(request(path, { method: "POST", cookie, body }), params({ id: task.id }));
    expect(resolved.status).toBe(200);
    expect((await readJson<CatalogTask>(resolved)).status).toBe("resolved");
    const again = await resolveTask(request(path, { method: "POST", cookie, body }), params({ id: task.id }));
    expect(again.status).toBe(409);
  });
});

describe("scholarship editor (AD-02)", () => {
  it("creates, edits, and retires a listing, then finds it in the audit log (AD-05)", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const created = await createListing(
      request("/admin/scholarships", { method: "POST", cookie, body: LISTING }),
      NO_PARAMS,
    );
    expect(created.status).toBe(201);
    const listing = await readJson<Scholarship>(created);
    expect(listing).toMatchObject({ slug: "maple-rotary-stem-award", amountMaxUsd: 2500 });

    const path = `/admin/scholarships/${listing.id}`;
    const id = params({ id: listing.id });
    const edited = await updateListing(
      request(path, { method: "PATCH", cookie, body: { ...LISTING, name: "Maple STEM Award" } }),
      id,
    );
    expect(edited.status).toBe(200);
    expect(await readJson<Scholarship>(edited)).toMatchObject({ id: listing.id, name: "Maple STEM Award" });
    const inverted = { ...LISTING, amountMinUsd: 5000 };
    expect((await updateListing(request(path, { method: "PATCH", cookie, body: inverted }), id)).status).toBe(400);

    const retired = await setStatus(
      request(`${path}/status`, { method: "POST", cookie, body: { status: "retired", note: "Program ended" } }),
      id,
    );
    expect((await readJson<Scholarship>(retired)).status).toBe("retired");
    expect(
      (await setStatus(request(`${path}/status`, { method: "POST", cookie, body: { status: "gone" } }), id)).status,
    ).toBe(400);

    const audit = await searchAudit(
      request(`/admin/audit?entityType=scholarship&entityId=${listing.id}`, { cookie }),
      NO_PARAMS,
    );
    const page = await readJson<Page<AuditEvent>>(audit);
    expect(page.items.map((e) => e.action)).toContain("scholarship_status_set");
    expect((await searchAudit(request("/admin/audit?page=0", { cookie }), NO_PARAMS)).status).toBe(400);
  });
});

describe("reports (AD-04) and research (CA)", () => {
  it("lists open reports and resolves one with a note", async () => {
    const student = await signedInStudent(deps().db);
    const listing = await factories.scholarship(deps().db);
    await reportListing(deps(), userActor(student.user.id, "student"), {
      scholarshipId: listing.id,
      reason: "dead_link",
      details: "",
    });
    const { cookie } = await signedInAdmin(deps().db);
    const open = await readJson<CatalogReport[]>(
      await listReports(request("/admin/reports?status=open", { cookie }), NO_PARAMS),
    );
    expect(open).toHaveLength(1);
    const report = open[0];
    if (!report) throw new Error("expected a report");
    expect((await listReports(request("/admin/reports?status=maybe", { cookie }), NO_PARAMS)).status).toBe(400);
    const path = `/admin/reports/${report.id}/resolve`;
    const body = { status: "rejected", note: "The link works" };
    const done = await resolveReport(request(path, { method: "POST", cookie, body }), params({ id: report.id }));
    expect((await readJson<CatalogReport>(done)).status).toBe("rejected");
    const missing = await resolveReport(
      request(path, { method: "POST", cookie, body: { status: "rejected" } }),
      params({ id: report.id }),
    );
    expect((await errorOf(missing)).code).toBe("invalid_input");
  });

  it("enqueues catalog research for a state and county", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const res = await enqueueResearch(
      request("/admin/research", { method: "POST", cookie, body: { state: "TX", county: "Maple" } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(204);
    expect(deps().jobs.sent).toContainEqual({ name: "catalog.research", payload: { state: "TX", county: "Maple" } });
    const bad = await enqueueResearch(
      request("/admin/research", { method: "POST", cookie, body: { state: "Texas" } }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
  });
});

describe("admin reads (D36)", () => {
  it("reads one listing in any status and pages through listings with filters", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const draft = await factories.scholarship(deps().db, { name: "Maple Draft Award", status: "draft" });
    await factories.scholarship(deps().db, { name: "Cedar Published Grant" });
    const one = await getListing(request(`/admin/scholarships/${draft.id}`, { cookie }), params({ id: draft.id }));
    expect(one.status).toBe(200);
    expect(await readJson<Scholarship>(one)).toMatchObject({ id: draft.id, status: "draft" });
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(
      (await getListing(request(`/admin/scholarships/${missing}`, { cookie }), params({ id: missing }))).status,
    ).toBe(404);

    const all = await readJson<Page<Scholarship>>(
      await listListings(request("/admin/scholarships", { cookie }), NO_PARAMS),
    );
    expect(all).toMatchObject({ page: 1, pageSize: 50, total: 2 });
    const drafts = await readJson<Page<Scholarship>>(
      await listListings(request("/admin/scholarships?status=draft&q=maple", { cookie }), NO_PARAMS),
    );
    expect(drafts.items.map((s) => s.id)).toEqual([draft.id]);
    expect((await listListings(request("/admin/scholarships?page=0", { cookie }), NO_PARAMS)).status).toBe(400);
    expect((await listListings(request("/admin/scholarships?status=gone", { cookie }), NO_PARAMS)).status).toBe(400);

    const student = await signedInStudent(deps().db);
    const asStudent = await getListing(
      request(`/admin/scholarships/${draft.id}`, { cookie: student.cookie }),
      params({ id: draft.id }),
    );
    expect(asStudent.status).toBe(404);
    expect((await listListings(request("/admin/scholarships", { cookie: student.cookie }), NO_PARAMS)).status).toBe(
      404,
    );
  });

  it("reads one catalog task with its payload", async () => {
    const student = await signedInStudent(deps().db);
    await submitLocalScholarship(deps(), userActor(student.user.id, "student"), {
      url: "https://maplerotary.example/local",
      name: "Maple Local Award",
      notes: "",
    });
    const { cookie } = await signedInAdmin(deps().db);
    const [task] = await readJson<CatalogTask[]>(
      await listTasks(request("/admin/catalog-tasks", { cookie }), NO_PARAMS),
    );
    if (!task) throw new Error("expected a task");
    const one = await getTask(request(`/admin/catalog-tasks/${task.id}`, { cookie }), params({ id: task.id }));
    expect(await readJson<CatalogTask>(one)).toMatchObject({ id: task.id, kind: "user_submission", status: "open" });
    expect((await getTask(request("/admin/catalog-tasks/nope", { cookie }), params({ id: "nope" }))).status).toBe(404);
    const asStudent = await getTask(
      request(`/admin/catalog-tasks/${task.id}`, { cookie: student.cookie }),
      params({ id: task.id }),
    );
    expect(asStudent.status).toBe(404);
  });
});

const RATES = { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 };
const RATE_RULE = {
  awardYear: "2027-28",
  key: "federal_loan_rates",
  value: RATES,
  sourceUrl: "https://studentaid.gov/understand-aid/types/loans/interest-rates",
};
const FAFSA = {
  awardYear: "2027-28",
  state: null,
  program: "FAFSA",
  deadline: "2028-06-30",
  note: "",
  sourceUrl: "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines",
};

const putRuleAs = (cookie: string, body: unknown) =>
  putRule(request("/admin/aid-rules", { method: "PUT", cookie, body }), NO_PARAMS);
const putDeadlineAs = (cookie: string, body: unknown) =>
  putDeadline(request("/admin/aid-deadlines", { method: "PUT", cookie, body }), NO_PARAMS);

describe("aid rules and deadlines (R2P-1, MO-09, AID-03)", () => {
  it("PUT /admin/aid-rules upserts loan rates for an award year", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const first = await putRuleAs(cookie, RATE_RULE);
    expect(first.status).toBe(200);
    const rule = await readJson<AidRule>(first);
    expect(rule).toMatchObject({
      awardYear: "2027-28",
      key: "federal_loan_rates",
      value: RATES,
      verifiedAt: "2026-10-06T15:00:00.000Z",
    });
    const again = await readJson<AidRule>(
      await putRuleAs(cookie, { ...RATE_RULE, value: { ...RATES, parent_plus: 9.08 } }),
    );
    expect(again).toMatchObject({ id: rule.id, value: { ...RATES, parent_plus: 9.08 } });
    expect((await putRuleAs(cookie, { ...RATE_RULE, value: { ...RATES, subsidized: 31 } })).status).toBe(400);
    expect((await putRuleAs(cookie, { ...RATE_RULE, key: "pell_max" })).status).toBe(400);
    const student = await signedInStudent(deps().db);
    expect((await putRuleAs(student.cookie, RATE_RULE)).status).toBe(404);
  });

  it("GET /admin/aid-rules lists rules, optionally for one award year", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    await putRuleAs(cookie, RATE_RULE);
    await putRuleAs(cookie, { ...RATE_RULE, awardYear: "2026-27" });
    const all = await readJson<AidRule[]>(await listRules(request("/admin/aid-rules", { cookie }), NO_PARAMS));
    expect(all.map((r) => r.awardYear).sort()).toEqual(["2026-27", "2027-28"]);
    const one = await readJson<AidRule[]>(
      await listRules(request("/admin/aid-rules?awardYear=2027-28", { cookie }), NO_PARAMS),
    );
    expect(one.map((r) => r.awardYear)).toEqual(["2027-28"]);
    expect((await listRules(request("/admin/aid-rules?awardYear=2027", { cookie }), NO_PARAMS)).status).toBe(400);
    expect((await listRules(request("/admin/aid-rules"), NO_PARAMS)).status).toBe(401);
  });

  it("PUT /admin/aid-deadlines adds a deadline without an id and edits one with an id", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const created = await putDeadlineAs(cookie, FAFSA);
    expect(created.status).toBe(200);
    const fafsa = await readJson<AidDeadline>(created);
    expect(fafsa).toMatchObject({
      awardYear: "2027-28",
      state: null,
      program: "FAFSA",
      deadline: "2028-06-30",
      note: "",
    });
    const edit = { ...FAFSA, id: fafsa.id, deadline: "2028-06-29", note: "Check the source" };
    expect(await readJson<AidDeadline>(await putDeadlineAs(cookie, edit))).toMatchObject({
      id: fafsa.id,
      deadline: "2028-06-29",
      note: "Check the source",
    });
    expect((await putDeadlineAs(cookie, { ...FAFSA, id: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
    expect((await putDeadlineAs(cookie, { ...FAFSA, state: "ZZ" })).status).toBe(400);
  });

  it("GET /admin/aid-deadlines lists deadlines by award year, then date", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const fafsa = await readJson<AidDeadline>(await putDeadlineAs(cookie, FAFSA));
    const texas = await readJson<AidDeadline>(
      await putDeadlineAs(cookie, { ...FAFSA, state: "TX", program: "TEXAS Grant priority", deadline: "2027-01-15" }),
    );
    await putDeadlineAs(cookie, { ...FAFSA, awardYear: "2026-27", deadline: "2027-06-30" });
    const year = await readJson<AidDeadline[]>(
      await listDeadlines(request("/admin/aid-deadlines?awardYear=2027-28", { cookie }), NO_PARAMS),
    );
    expect(year.map((d) => d.id)).toEqual([texas.id, fafsa.id]);
    expect(
      await readJson<AidDeadline[]>(await listDeadlines(request("/admin/aid-deadlines", { cookie }), NO_PARAMS)),
    ).toHaveLength(3);
    const student = await signedInStudent(deps().db);
    expect((await listDeadlines(request("/admin/aid-deadlines", { cookie: student.cookie }), NO_PARAMS)).status).toBe(
      404,
    );
  });

  it("DELETE /admin/aid-deadlines/:id removes a deadline once", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const fafsa = await readJson<AidDeadline>(await putDeadlineAs(cookie, FAFSA));
    const path = `/admin/aid-deadlines/${fafsa.id}`;
    const id = params({ id: fafsa.id });
    const student = await signedInStudent(deps().db);
    expect((await deleteDeadline(request(path, { method: "DELETE", cookie: student.cookie }), id)).status).toBe(404);
    expect((await deleteDeadline(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
    expect(
      await readJson<AidDeadline[]>(await listDeadlines(request("/admin/aid-deadlines", { cookie }), NO_PARAMS)),
    ).toEqual([]);
    expect((await deleteDeadline(request(path, { method: "DELETE", cookie }), id)).status).toBe(404);
  });
});
