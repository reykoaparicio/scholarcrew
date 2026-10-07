import {
  createFakeBatchGateway,
  createFakeExtractModel,
  createFakeFetchPage,
  createFakeResearcher,
} from "@scholarcrew/catalog/testing";
import { submitLocalScholarship } from "@scholarcrew/core/scholarships";
import { agentRuns, catalogTasks, eq, scholarships } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { ListingDraft } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { makeStudent, makeWorkerDeps } from "../../test/helpers";
import { handleCatalogExtract } from "./catalog-extract";
import { handleCatalogRecheck } from "./catalog-recheck";
import { handleCatalogRecheckCollect } from "./catalog-recheck-collect";
import { handleCatalogResearch } from "./catalog-research";

const ROTARY = "https://example.org/rotary";
const LIONS = "https://example.org/lions";
const PAGE =
  "Rotary Club of Eastside Scholarship. Rotary Club of Eastside awards $2,500 to a Maple County senior. Applications are due October 30, 2026. Describe a time you served your community.";

const DRAFT: ListingDraft = {
  name: "Rotary Club of Eastside Scholarship",
  provider: "Rotary Club of Eastside",
  url: ROTARY,
  amountMinUsd: 2500,
  amountMaxUsd: 2500,
  renewable: false,
  deadline: "2026-10-30",
  applicationFeeUsd: null,
  localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
  eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
  requirements: {
    essays: [{ prompt: "Describe a time you served your community.", wordLimit: 500 }],
    recommendations: 0,
    transcript: false,
    serviceHours: null,
    other: [],
  },
  fieldQuotes: [{ field: "deadline", quote: "Applications are due October 30, 2026." }],
};

const candidates = [
  { url: ROTARY, title: "Rotary Club of Eastside Scholarship", snippet: "Due October 30" },
  { url: LIONS, title: "Lions Club Award", snippet: "Local award" },
];

describe("catalog.research and catalog.extract", () => {
  it("files candidates as tasks, queues one extract each, and never repeats a URL (CA-01)", async () => {
    const researcher = createFakeResearcher(candidates);
    const { deps, core } = makeWorkerDeps({ catalog: { researcher } });
    await handleCatalogResearch(deps, { state: "TX", county: null });
    expect(researcher.calls).toEqual([{ state: "TX", county: undefined, allowedDomains: [] }]);
    const tasks = await core.db.select().from(catalogTasks);
    expect(tasks.map((t) => t.kind)).toEqual(["research_candidate", "research_candidate"]);
    expect(core.jobs.sent).toEqual(
      expect.arrayContaining(
        tasks.map((t) => ({
          name: "catalog.extract",
          payload: { taskId: t.id },
          opts: { singletonKey: `catalog.extract:${t.id}` },
        })),
      ),
    );
    expect(core.jobs.sent).toHaveLength(2);

    core.jobs.clear();
    await handleCatalogResearch(deps, { state: "TX", county: "Maple" });
    expect(await core.db.select().from(catalogTasks)).toHaveLength(2);
    expect(core.jobs.sent).toEqual([]);
  });

  it("stores the draft and its verification report on the task (CA-02)", async () => {
    const researcher = createFakeResearcher(candidates);
    const fetchPage = createFakeFetchPage({ [ROTARY]: { status: 200, text: PAGE, contentType: "text/html" } });
    const model = createFakeExtractModel([{ raw: DRAFT }]);
    const { deps, core } = makeWorkerDeps({ catalog: { researcher, fetchPage, model } });
    await handleCatalogResearch(deps, { state: "TX", county: null });
    const tasks = await core.db.select().from(catalogTasks);
    for (const t of tasks) await handleCatalogExtract(deps, { taskId: t.id });

    const after = await core.db.select().from(catalogTasks);
    const byUrl = new Map(after.map((t) => [t.payload.type === "research_candidate" ? t.payload.url : "", t]));
    const rotary = byUrl.get(ROTARY)?.payload;
    const lions = byUrl.get(LIONS)?.payload;
    expect(rotary?.type === "research_candidate" && rotary.draft?.name).toBe("Rotary Club of Eastside Scholarship");
    expect(rotary?.type === "research_candidate" && rotary.report !== null).toBe(true);
    expect(lions?.type === "research_candidate" && lions.draft).toBeNull();
    expect(lions?.type === "research_candidate" && lions.report?.ok).toBe(false);
    expect(after.every((t) => t.status === "open")).toBe(true);
    expect(model.extractCalls).toHaveLength(1);
    // D20, AG-06: the one extraction call is recorded with role catalog and no job or user.
    const runs = await core.db.select().from(agentRuns);
    expect(runs.map((r) => [r.role, r.jobId, r.userId])).toEqual([["catalog", null, null]]);
  });

  it("extracts a student-submitted scholarship from its enqueued job and leaves the listing submitter-only (D18)", async () => {
    const fetchPage = createFakeFetchPage({ [ROTARY]: { status: 200, text: PAGE, contentType: "text/html" } });
    const model = createFakeExtractModel([{ raw: DRAFT }]);
    const { deps, core } = makeWorkerDeps({ catalog: { fetchPage, model } });
    const student = await makeStudent(core.db);
    const summary = await submitLocalScholarship(core, student.actor, { url: ROTARY, name: "Rotary award", notes: "" });
    const [sent] = core.jobs.sent;
    expect(sent).toMatchObject({
      name: "catalog.extract",
      opts: { singletonKey: `catalog.extract:${(sent?.payload as { taskId: string }).taskId}` },
    });

    await handleCatalogExtract(deps, sent?.payload);

    const [task] = await core.db.select().from(catalogTasks).where(eq(catalogTasks.kind, "user_submission"));
    expect(task?.status).toBe("open");
    expect(task?.payload).toMatchObject({
      type: "user_submission",
      url: ROTARY,
      draft: { name: DRAFT.name },
      report: { ok: expect.any(Boolean) },
    });
    const [listing] = await core.db.select().from(scholarships).where(eq(scholarships.id, summary.id));
    expect(listing).toMatchObject({ status: "draft", visibility: "submitter_only" });
  });
});

describe("catalog.recheck and catalog.recheck.collect", () => {
  it("batches changed pages nightly and files a review task when results come back unusable (CA-05)", async () => {
    const { core } = makeWorkerDeps();
    const listing = await factories.scholarship(core.db, {
      name: "Rotary Club of Eastside Scholarship",
      verifiedAt: null,
    });
    const fetchPage = createFakeFetchPage({
      [listing.sourceUrl]: { status: 200, text: PAGE, contentType: "text/html" },
    });
    const batches = createFakeBatchGateway();
    const { deps } = makeWorkerDeps({ catalog: { fetchPage, anthropicBatches: batches } });

    await handleCatalogRecheck(deps, {});
    expect(batches.created).toHaveLength(1);
    expect(batches.created[0]?.requests.map((r) => r.customId)).toEqual([listing.id]);

    await handleCatalogRecheckCollect(deps, {});
    expect(await core.db.select().from(catalogTasks).where(eq(catalogTasks.kind, "recheck_changed"))).toEqual([]);

    batches.finish(batches.created[0]?.batchId ?? "", []);
    await handleCatalogRecheckCollect(deps, {});
    const review = await core.db.select().from(catalogTasks).where(eq(catalogTasks.kind, "recheck_changed"));
    expect(review.map((t) => t.scholarshipId)).toEqual([listing.id]);
  });
});
