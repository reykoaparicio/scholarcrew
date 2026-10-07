import { type ModelTurn, toStrictJsonSchema } from "@scholarcrew/agents";
import { catalogTasks, desc, eq, recheckBatches, scholarshipSources, scholarships } from "@scholarcrew/db";
import { closeTestDb, factories, getTestDb, resetDb } from "@scholarcrew/db/testing";
import { ListingDraft } from "@scholarcrew/domain";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NOW, daysAgo, testDeps } from "../test/deps";
import { PAGE_TEXT, SOURCE_URL, VALID_DRAFT } from "../test/fixtures";
import { EXTRACT_SYSTEM } from "./extract";
import { sha256Hex } from "./pages";
import { RECHECK_BUDGET_MS, collectRecheck, diffListing, listingToDraft, startRecheck } from "./recheck";
import { createFakeBatchGateway, createFakeFetchPage } from "./testing";
import { BatchNotFoundError } from "./types";

const db = getTestDb();

beforeEach(() => resetDb(db));
afterAll(() => closeTestDb());

const FAR_DEADLINE = "2027-03-01";
const OK_PAGE = { status: 200, text: PAGE_TEXT, contentType: "text/html; charset=utf-8" };
const FAILED_MESSAGE = "Re-check extraction failed. Compare the page with the listing by hand.";

/** A published listing that matches VALID_DRAFT field for field, last verified 40 days ago. */
function rotaryListing(o: Partial<typeof scholarships.$inferInsert> = {}) {
  return factories.scholarship(db, {
    name: VALID_DRAFT.name,
    provider: VALID_DRAFT.provider,
    url: VALID_DRAFT.url,
    sourceUrl: SOURCE_URL,
    amountMinUsd: 2500,
    amountMaxUsd: 2500,
    renewable: false,
    deadline: "2026-10-30",
    localArea: VALID_DRAFT.localArea,
    eligibility: VALID_DRAFT.eligibility,
    requirements: VALID_DRAFT.requirements,
    verifiedAt: daysAgo(40),
    ...o,
  });
}

async function listingRow(id: string) {
  const [row] = await db.select().from(scholarships).where(eq(scholarships.id, id));
  if (!row) throw new Error(`listing ${id} is gone`);
  return row;
}

async function newestSource(scholarshipId: string) {
  const [row] = await db
    .select()
    .from(scholarshipSources)
    .where(eq(scholarshipSources.scholarshipId, scholarshipId))
    .orderBy(desc(scholarshipSources.fetchedAt))
    .limit(1);
  return row;
}

describe("startRecheck", () => {
  it("selects stale or soon-due published listings without a fetch in the last 7 days", async () => {
    const old = await factories.scholarship(db, { verifiedAt: daysAgo(40), deadline: FAR_DEADLINE });
    const soon = await factories.scholarship(db, { verifiedAt: daysAgo(2), deadline: "2026-10-26" });
    const never = await factories.scholarship(db, { verifiedAt: null, deadline: null });
    await factories.scholarship(db, { verifiedAt: daysAgo(2), deadline: FAR_DEADLINE });
    await factories.scholarship(db, { status: "draft", verifiedAt: null });
    await factories.scholarship(db, { status: "stale", verifiedAt: daysAgo(40) });
    const recent = await factories.scholarship(db, { verifiedAt: daysAgo(40), deadline: FAR_DEADLINE });
    await db
      .insert(scholarshipSources)
      .values({ scholarshipId: recent.id, url: recent.sourceUrl, fetchedAt: daysAgo(3), contentHash: "earlier" });
    const fetchPage = createFakeFetchPage({}, OK_PAGE);
    const anthropicBatches = createFakeBatchGateway();

    const result = await startRecheck(testDeps({ fetchPage, anthropicBatches }));

    expect([...fetchPage.calls].sort()).toEqual([old.sourceUrl, soon.sourceUrl, never.sourceUrl].sort());
    expect(result).toEqual({ batchId: "msgbatch_fake_1", count: 3 });
    const ids = anthropicBatches.created[0]?.requests.map((r) => r.customId).sort();
    expect(ids).toEqual([old.id, soon.id, never.id].sort());
  });

  it("refreshes verifiedAt when the page hash is unchanged", async () => {
    const listing = await rotaryListing();
    await db.insert(scholarshipSources).values({
      scholarshipId: listing.id,
      url: SOURCE_URL,
      fetchedAt: daysAgo(40),
      contentHash: sha256Hex(PAGE_TEXT),
    });
    const anthropicBatches = createFakeBatchGateway();

    const result = await startRecheck(
      testDeps({ fetchPage: createFakeFetchPage({ [SOURCE_URL]: OK_PAGE }), anthropicBatches }),
    );

    expect(result).toEqual({ batchId: null, count: 0 });
    expect(anthropicBatches.created).toEqual([]);
    const row = await listingRow(listing.id);
    expect(row.status).toBe("published");
    expect(row.verifiedAt?.toISOString()).toBe(NOW.toISOString());
    const sources = await db.select().from(scholarshipSources).where(eq(scholarshipSources.scholarshipId, listing.id));
    expect(sources).toHaveLength(2);
    const latest = await newestSource(listing.id);
    expect(latest).toMatchObject({
      url: SOURCE_URL,
      contentHash: sha256Hex(PAGE_TEXT),
      excerpt: PAGE_TEXT.slice(0, 500),
    });
    expect(latest?.fetchedAt.toISOString()).toBe(NOW.toISOString());
  });

  it("queues changed pages in one batch and records the new source", async () => {
    const listing = await rotaryListing();
    await db.insert(scholarshipSources).values({
      scholarshipId: listing.id,
      url: SOURCE_URL,
      fetchedAt: daysAgo(40),
      contentHash: sha256Hex("old page"),
    });
    const newText = `${PAGE_TEXT}\n\n${"The award now covers books and fees. ".repeat(20)}`;
    const anthropicBatches = createFakeBatchGateway();

    const result = await startRecheck(
      testDeps({ fetchPage: createFakeFetchPage({ [SOURCE_URL]: { ...OK_PAGE, text: newText } }), anthropicBatches }),
    );

    expect(result).toEqual({ batchId: "msgbatch_fake_1", count: 1 });
    const request = anthropicBatches.created[0]?.requests[0];
    expect(request?.customId).toBe(listing.id);
    expect(request?.system).toBe(EXTRACT_SYSTEM);
    expect(request?.schema).toEqual(toStrictJsonSchema(ListingDraft));
    expect(request?.userText).toContain("The award now covers books and fees.");
    expect(request?.userText.endsWith(`Source URL: ${SOURCE_URL}`)).toBe(true);
    const batches = await db.select().from(recheckBatches);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      anthropicBatchId: "msgbatch_fake_1",
      scholarshipIds: [listing.id],
      status: "in_progress",
      collectedAt: null,
    });
    expect(await newestSource(listing.id)).toMatchObject({
      contentHash: sha256Hex(newText),
      excerpt: newText.slice(0, 500),
    });
    const row = await listingRow(listing.id);
    expect(row.status).toBe("published");
    expect(row.verifiedAt?.toISOString()).toBe(daysAgo(40).toISOString());
  });

  it("marks dead links stale with a review task", async () => {
    const listing = await rotaryListing();
    const anthropicBatches = createFakeBatchGateway();

    const result = await startRecheck(testDeps({ fetchPage: createFakeFetchPage({}), anthropicBatches }));

    expect(result).toEqual({ batchId: null, count: 0 });
    expect(anthropicBatches.created).toEqual([]);
    expect((await listingRow(listing.id)).status).toBe("stale");
    const tasks = await db.select().from(catalogTasks);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ kind: "recheck_changed", status: "open", scholarshipId: listing.id });
    expect(tasks[0]?.payload).toEqual({
      type: "recheck_changed",
      url: SOURCE_URL,
      before: listingToDraft(listing),
      after: null,
      report: {
        ok: false,
        issues: [{ code: "missing_field", field: "url", message: "Page unavailable (HTTP 404)." }],
        scamFlags: [],
      },
    });
    expect(await db.select().from(scholarshipSources)).toEqual([]);
  });

  it("skips listings whose fetch throws", async () => {
    const listing = await rotaryListing();

    const result = await startRecheck(
      testDeps({ fetchPage: createFakeFetchPage({ [SOURCE_URL]: new Error("ETIMEDOUT") }) }),
    );

    expect(result).toEqual({ batchId: null, count: 0 });
    expect((await listingRow(listing.id)).status).toBe("published");
    expect(await db.select().from(catalogTasks)).toEqual([]);
    expect(await db.select().from(scholarshipSources)).toEqual([]);
  });

  it("stops picking listings once the time budget is spent", async () => {
    await rotaryListing();
    const fetchPage = createFakeFetchPage({}, OK_PAGE);
    let reads = 0;
    // The first read sets the start; every later read is past the budget.
    const now = () => (reads++ === 0 ? NOW : new Date(NOW.getTime() + RECHECK_BUDGET_MS + 1));

    expect(await startRecheck(testDeps({ fetchPage, now }))).toEqual({ batchId: null, count: 0 });
    expect(fetchPage.calls).toEqual([]);
  });
});

describe("collectRecheck", () => {
  it("leaves unfinished batches alone", async () => {
    const listing = await rotaryListing();
    await db.insert(recheckBatches).values({ anthropicBatchId: "msgbatch_pending", scholarshipIds: [listing.id] });

    expect(await collectRecheck(testDeps())).toEqual({ changed: 0, unchanged: 0, failed: 0 });

    const [batch] = await db.select().from(recheckBatches);
    expect(batch?.status).toBe("in_progress");
    expect(batch?.collectedAt).toBeNull();
  });

  it("marks changed listings stale with a review task and refreshes unchanged ones", async () => {
    const same = await rotaryListing();
    const moved = await rotaryListing();
    await db.insert(scholarshipSources).values({
      scholarshipId: moved.id,
      url: SOURCE_URL,
      fetchedAt: daysAgo(1),
      contentHash: "new",
      excerpt: PAGE_TEXT.slice(0, 500),
    });
    await db.insert(recheckBatches).values({ anthropicBatchId: "msgbatch_done", scholarshipIds: [same.id, moved.id] });
    const after = {
      ...VALID_DRAFT,
      amountMinUsd: 3000,
      amountMaxUsd: 3000,
      fieldQuotes: [{ field: "amountMaxUsd", quote: "This sentence isn't in the stored excerpt." }],
    };
    const anthropicBatches = createFakeBatchGateway();
    anthropicBatches.finish("msgbatch_done", [
      { customId: same.id, json: VALID_DRAFT },
      { customId: moved.id, json: after },
    ]);

    expect(await collectRecheck(testDeps({ anthropicBatches }))).toEqual({ changed: 1, unchanged: 1, failed: 0 });

    const sameRow = await listingRow(same.id);
    expect(sameRow.status).toBe("published");
    expect(sameRow.verifiedAt?.toISOString()).toBe(NOW.toISOString());
    expect((await listingRow(moved.id)).status).toBe("stale");
    const tasks = await db.select().from(catalogTasks);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ kind: "recheck_changed", status: "open", scholarshipId: moved.id });
    // Quote checks are skipped: only a 500-character excerpt of the page is stored.
    expect(tasks[0]?.payload).toEqual({
      type: "recheck_changed",
      url: SOURCE_URL,
      before: listingToDraft(moved),
      after,
      report: { ok: true, issues: [], scamFlags: [] },
    });
    const [batch] = await db.select().from(recheckBatches);
    expect(batch?.status).toBe("collected");
    expect(batch?.collectedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("counts unparseable and missing results as failed and flags them for review", async () => {
    const garbled = await rotaryListing();
    const missing = await rotaryListing();
    await db
      .insert(recheckBatches)
      .values({ anthropicBatchId: "msgbatch_failed", scholarshipIds: [garbled.id, missing.id] });
    const anthropicBatches = createFakeBatchGateway();
    anthropicBatches.finish("msgbatch_failed", [{ customId: garbled.id, json: { name: "" } }]);

    expect(await collectRecheck(testDeps({ anthropicBatches }))).toEqual({ changed: 0, unchanged: 0, failed: 2 });

    for (const id of [garbled.id, missing.id]) expect((await listingRow(id)).status).toBe("published");
    const tasks = await db.select().from(catalogTasks);
    expect(tasks.map((t) => t.scholarshipId).sort()).toEqual([garbled.id, missing.id].sort());
    for (const task of tasks) {
      expect(task.payload).toMatchObject({
        type: "recheck_changed",
        after: null,
        report: { ok: false, issues: [{ code: "missing_field", field: null, message: FAILED_MESSAGE }], scamFlags: [] },
      });
    }
    const [batch] = await db.select().from(recheckBatches);
    expect(batch?.status).toBe("collected");
  });

  it("records half-price usage for each batch item", async () => {
    const listing = await rotaryListing();
    await db.insert(recheckBatches).values({ anthropicBatchId: "msgbatch_usage", scholarshipIds: [listing.id] });
    const usage = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 6000 };
    const anthropicBatches = createFakeBatchGateway();
    anthropicBatches.finish("msgbatch_usage", [{ customId: listing.id, json: VALID_DRAFT, usage }]);
    const turns: ModelTurn[] = [];

    await collectRecheck(
      testDeps({
        anthropicBatches,
        onUsage: async (_role, t) => {
          turns.push(t);
        },
      }),
    );

    expect(turns).toHaveLength(1);
    expect(turns[0]?.usage).toEqual({ ...usage, costMicros: 3000 });
  });

  it("marks a batch the API no longer has as failed, flags its listings, and keeps collecting the rest", async () => {
    const expired = await rotaryListing();
    const flaky = await rotaryListing();
    const done = await rotaryListing();
    await db.insert(recheckBatches).values([
      { anthropicBatchId: "msgbatch_expired", scholarshipIds: [expired.id], createdAt: daysAgo(3) },
      { anthropicBatchId: "msgbatch_flaky", scholarshipIds: [flaky.id], createdAt: daysAgo(2) },
      { anthropicBatchId: "msgbatch_done", scholarshipIds: [done.id], createdAt: daysAgo(1) },
    ]);
    const anthropicBatches = createFakeBatchGateway();
    anthropicBatches.fail("msgbatch_expired", new BatchNotFoundError("msgbatch_expired"));
    anthropicBatches.fail("msgbatch_flaky", new Error("socket hang up"));
    anthropicBatches.finish("msgbatch_done", [{ customId: done.id, json: VALID_DRAFT }]);

    expect(await collectRecheck(testDeps({ anthropicBatches }))).toEqual({ changed: 0, unchanged: 1, failed: 1 });

    const statuses = Object.fromEntries(
      (await db.select().from(recheckBatches)).map((b) => [b.anthropicBatchId, b.status]),
    );
    expect(statuses).toEqual({ msgbatch_expired: "failed", msgbatch_flaky: "in_progress", msgbatch_done: "collected" });
    const tasks = await db.select().from(catalogTasks);
    expect(tasks.map((t) => t.scholarshipId)).toEqual([expired.id]);
    expect(tasks[0]?.payload).toMatchObject({ after: null, report: { ok: false } });
    expect((await listingRow(expired.id)).status).toBe("published");
  });
});

describe("diffListing", () => {
  it("compares the fields a reviewer cares about", () => {
    const loose = {
      ...VALID_DRAFT,
      name: "  ROTARY club of Eastside   Scholarship ",
      amountMinUsd: null,
      renewable: null,
      fieldQuotes: [],
    };
    expect(diffListing(VALID_DRAFT, loose)).toEqual([]);
    expect(diffListing(VALID_DRAFT, { ...VALID_DRAFT, amountMinUsd: 1000, amountMaxUsd: 3000 })).toEqual([
      "amountMinUsd",
      "amountMaxUsd",
    ]);
    expect(diffListing(VALID_DRAFT, { ...VALID_DRAFT, deadline: null, applicationFeeUsd: 20 })).toEqual([
      "deadline",
      "applicationFeeUsd",
    ]);
    const longer = {
      ...VALID_DRAFT,
      provider: "Lions Club of Eastside",
      requirements: {
        ...VALID_DRAFT.requirements,
        essays: [{ prompt: "Write 500 words about a time you served your community.", wordLimit: 650 }],
      },
    };
    expect(diffListing(VALID_DRAFT, longer)).toEqual(["provider", "essays"]);
  });
});
