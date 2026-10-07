import { catalogTasks, eq, inArray, scholarships } from "@scholarcrew/db";
import { closeTestDb, factories, getTestDb, resetDb } from "@scholarcrew/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testDeps } from "../test/deps";
import { PAGE_TEXT, SOURCE_URL, VALID_DRAFT } from "../test/fixtures";
import { extractForTask, researchCandidates } from "./research";
import { createFakeExtractModel, createFakeFetchPage, createFakeResearcher } from "./testing";

const db = getTestDb();

beforeEach(() => resetDb(db));
afterAll(() => closeTestDb());

function candidate(url: string) {
  return { url, title: `Title for ${url}`, snippet: "A local award." };
}

async function researchTask(url: string, status: "open" | "in_review" | "resolved" | "rejected" = "open") {
  const [row] = await db
    .insert(catalogTasks)
    .values({
      kind: "research_candidate",
      status,
      payload: {
        type: "research_candidate",
        url,
        title: "Existing",
        snippet: "",
        state: "TX",
        county: null,
        draft: null,
        report: null,
      },
    })
    .returning();
  if (!row) throw new Error("catalogTasks insert returned no row");
  return row;
}

async function taskRow(id: string) {
  const [row] = await db.select().from(catalogTasks).where(eq(catalogTasks.id, id));
  if (!row) throw new Error(`task ${id} is gone`);
  return row;
}

describe("researchCandidates", () => {
  it("creates research tasks for new URLs only", async () => {
    await factories.scholarship(db, {
      url: "https://Example.org/rotary/",
      sourceUrl: "https://example.org/rotary-source",
    });
    await researchTask("https://lions.example.org/award#apply");
    await researchTask("https://rejected.example.org/sweepstakes", "rejected");
    await researchTask("https://resolved.example.org/old", "resolved");
    const researcher = createFakeResearcher([
      candidate("https://example.org/rotary"),
      candidate("https://example.org/rotary-source/"),
      candidate("https://LIONS.example.org/award/"),
      candidate("https://rejected.example.org/sweepstakes"),
      candidate("https://resolved.example.org/old"),
      candidate("https://cu.example.org/scholarship"),
      candidate("https://cu.example.org/scholarship#top"),
      candidate("not a url"),
      candidate("ftp://files.example.org/award"),
    ]);
    const deps = testDeps({ researcher, allowedDomains: ["example.org"] });

    const result = await researchCandidates(deps, { state: "TX", county: "Maple" });

    expect(researcher.calls).toEqual([{ state: "TX", county: "Maple", allowedDomains: ["example.org"] }]);
    expect(result.created).toBe(2);
    expect(result.taskIds).toHaveLength(2);
    const created = await db.select().from(catalogTasks).where(inArray(catalogTasks.id, result.taskIds));
    const urls = created.map((t) => (t.payload.type === "research_candidate" ? t.payload.url : "")).sort();
    expect(urls).toEqual(["https://cu.example.org/scholarship", "https://resolved.example.org/old"]);
    for (const task of created)
      expect(task).toMatchObject({ kind: "research_candidate", status: "open", scholarshipId: null });
    const cu = created.find((t) => t.payload.type === "research_candidate" && t.payload.url.startsWith("https://cu."));
    expect(cu?.payload).toEqual({
      type: "research_candidate",
      url: "https://cu.example.org/scholarship",
      title: "Title for https://cu.example.org/scholarship",
      snippet: "A local award.",
      state: "TX",
      county: "Maple",
      draft: null,
      report: null,
    });
    // CA-01: research makes tasks, never listings.
    expect(await db.select().from(scholarships)).toHaveLength(1);
  });

  it("creates nothing when every URL is known", async () => {
    await researchTask("https://cf.example.org/awards");
    const researcher = createFakeResearcher([candidate("https://cf.example.org/awards/")]);
    expect(await researchCandidates(testDeps({ researcher }), { state: "TX" })).toEqual({ created: 0, taskIds: [] });
    expect(researcher.calls).toEqual([{ state: "TX", allowedDomains: [] }]);
  });
});

describe("extractForTask", () => {
  it("fetches, extracts, verifies, and stores the draft on the task", async () => {
    const task = await researchTask(SOURCE_URL);
    const model = createFakeExtractModel([{ raw: JSON.stringify(VALID_DRAFT) }]);
    const fetchPage = createFakeFetchPage({
      [SOURCE_URL]: { status: 200, text: PAGE_TEXT, contentType: "text/html; charset=utf-8" },
    });

    const report = await extractForTask(testDeps({ model, fetchPage }), task.id);

    expect(report).toEqual({ ok: true, issues: [], scamFlags: [] });
    const row = await taskRow(task.id);
    expect(row.status).toBe("open");
    expect(row.payload).toMatchObject({ type: "research_candidate", url: SOURCE_URL, draft: VALID_DRAFT, report });
    expect(fetchPage.calls).toEqual([SOURCE_URL]);
    expect(model.extractCalls).toHaveLength(1);
  });

  it("records an unavailable page without calling the model", async () => {
    const task = await researchTask(SOURCE_URL);
    const model = createFakeExtractModel([]);

    const report = await extractForTask(testDeps({ model, fetchPage: createFakeFetchPage({}) }), task.id);

    expect(report).toEqual({
      ok: false,
      issues: [{ code: "missing_field", field: "url", message: "Page unavailable (HTTP 404)." }],
      scamFlags: [],
    });
    expect(model.extractCalls).toEqual([]);
    const row = await taskRow(task.id);
    expect(row.status).toBe("open");
    expect(row.payload).toMatchObject({ draft: null, report });
  });

  it("records non-text pages and refused extractions as report issues", async () => {
    const pdfTask = await researchTask("https://cf.example.org/award.pdf");
    const refusedTask = await researchTask(SOURCE_URL);
    const deps = testDeps({
      model: createFakeExtractModel([{ refused: true }]),
      fetchPage: createFakeFetchPage({
        "https://cf.example.org/award.pdf": { status: 415, text: "", contentType: "application/pdf" },
        [SOURCE_URL]: { status: 200, text: PAGE_TEXT, contentType: "text/html" },
      }),
    });

    const pdf = await extractForTask(deps, pdfTask.id);
    const refused = await extractForTask(deps, refusedTask.id);

    expect(pdf?.issues).toEqual([
      { code: "missing_field", field: "url", message: "Page isn't HTML or plain text (application/pdf)." },
    ]);
    expect(refused?.issues).toEqual([
      { code: "missing_field", field: null, message: "The model returned no listing for this page." },
    ]);
    expect((await taskRow(refusedTask.id)).payload).toMatchObject({ draft: null, report: refused });
  });

  it("extracts and verifies a student submission and leaves its listing alone (D18)", async () => {
    const listing = await factories.scholarship(db, { status: "draft", verifiedAt: null });
    const [submission] = await db
      .insert(catalogTasks)
      .values({
        kind: "user_submission",
        scholarshipId: listing.id,
        payload: {
          type: "user_submission",
          url: SOURCE_URL,
          name: "Maple Award",
          notes: "",
          submittedById: "00000000-0000-4000-8000-000000000000",
        },
      })
      .returning();
    if (!submission) throw new Error("catalogTasks insert returned no row");
    const model = createFakeExtractModel([{ raw: JSON.stringify(VALID_DRAFT) }]);
    const fetchPage = createFakeFetchPage({ [SOURCE_URL]: { status: 200, text: PAGE_TEXT, contentType: "text/html" } });

    const report = await extractForTask(testDeps({ model, fetchPage }), submission.id);

    expect(report).toEqual({ ok: true, issues: [], scamFlags: [] });
    const row = await taskRow(submission.id);
    expect(row.status).toBe("open");
    expect(row.payload).toEqual({
      type: "user_submission",
      url: SOURCE_URL,
      name: "Maple Award",
      notes: "",
      submittedById: "00000000-0000-4000-8000-000000000000",
      draft: VALID_DRAFT,
      report,
    });
    const [after] = await db.select().from(scholarships).where(eq(scholarships.id, listing.id));
    expect(after).toEqual(listing);
  });

  it("ignores missing tasks, tasks that aren't open, and kinds with no page to extract", async () => {
    const resolved = await researchTask(SOURCE_URL, "resolved");
    const [imported] = await db
      .insert(catalogTasks)
      .values({ kind: "import", payload: { type: "import", summary: "3 colleges imported" } })
      .returning();
    if (!imported) throw new Error("catalogTasks insert returned no row");
    const fetchPage = createFakeFetchPage({});
    const deps = testDeps({ fetchPage });

    expect(await extractForTask(deps, resolved.id)).toBeNull();
    expect(await extractForTask(deps, imported.id)).toBeNull();
    expect(await extractForTask(deps, "00000000-0000-4000-8000-000000000001")).toBeNull();
    expect(fetchPage.calls).toEqual([]);
  });
});
