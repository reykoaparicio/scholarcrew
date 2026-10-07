import { toStrictJsonSchema, wrapUntrusted } from "@scholarcrew/agents";
import {
  and,
  asc,
  catalogTasks,
  desc,
  eq,
  gte,
  isNull,
  lt,
  lte,
  or,
  recheckBatches,
  scholarshipSources,
  scholarships,
  sql,
} from "@scholarcrew/db";
import { ListingDraft, type VerificationReport } from "@scholarcrew/domain";
import { EXTRACT_SYSTEM, PAGE_TEXT_LIMIT, catalogTurn, reportUsage } from "./extract";
import { fetchSafely, isoDay, pageProblem, problemReport, sha256Hex } from "./pages";
import { type BatchItem, BatchNotFoundError, type CatalogDeps } from "./types";
import { verifyDraft } from "./verify";

const DAY_MS = 86_400_000;
export const RECHECK_LIMIT = 200;
export const EXCERPT_CHARS = 500;
/** Pages fetched at once. With a 10 s fetch timeout, 200 listings take at most about 4 minutes. */
export const RECHECK_CONCURRENCY = 8;
/** No new listing is picked after this much time; the rest wait for tomorrow's run. Keeps the job well under its expiry. */
export const RECHECK_BUDGET_MS = 10 * 60_000;
const FAILED_MESSAGE = "Re-check extraction failed. Compare the page with the listing by hand.";

type Listing = typeof scholarships.$inferSelect;

/** The current listing in draft form, for before/after review. Listings have no fee field, so applicationFeeUsd is null. */
export function listingToDraft(listing: Listing): ListingDraft {
  return {
    name: listing.name,
    provider: listing.provider,
    url: listing.url,
    amountMinUsd: listing.amountMinUsd,
    amountMaxUsd: listing.amountMaxUsd,
    renewable: listing.renewable,
    deadline: listing.deadline,
    applicationFeeUsd: null,
    localArea: listing.localArea,
    eligibility: listing.eligibility,
    requirements: listing.requirements,
    fieldQuotes: [],
  };
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
const essayKey = (draft: ListingDraft) =>
  draft.requirements.essays.map((e) => `${squash(e.prompt)}|${e.wordLimit ?? ""}`).join("\n");

/** Names of the reviewed fields that differ. A single stated amount (min null) counts as min = max. */
export function diffListing(before: ListingDraft, after: ListingDraft): string[] {
  const changed: string[] = [];
  if (squash(before.name) !== squash(after.name)) changed.push("name");
  if (squash(before.provider) !== squash(after.provider)) changed.push("provider");
  if ((before.amountMinUsd ?? before.amountMaxUsd) !== (after.amountMinUsd ?? after.amountMaxUsd)) {
    changed.push("amountMinUsd");
  }
  if (before.amountMaxUsd !== after.amountMaxUsd) changed.push("amountMaxUsd");
  if ((before.renewable ?? false) !== (after.renewable ?? false)) changed.push("renewable");
  if (before.deadline !== after.deadline) changed.push("deadline");
  if ((before.applicationFeeUsd ?? 0) !== (after.applicationFeeUsd ?? 0)) changed.push("applicationFeeUsd");
  if (essayKey(before) !== essayKey(after)) changed.push("essays");
  return changed;
}

/** Batch user turn: the page as an untrusted data block (50k cap), then the URL. */
export function recheckUserText(url: string, pageText: string): string {
  const block = wrapUntrusted("scholarship_page", pageText.slice(0, PAGE_TEXT_LIMIT));
  return `${block.text}\n\nSource URL: ${url}`;
}

async function createReviewTask(
  deps: CatalogDeps,
  i: {
    listing: Listing;
    url: string;
    after: ListingDraft | null;
    report: VerificationReport;
    markStale: boolean;
    now: Date;
  },
): Promise<void> {
  await deps.db.transaction(async (tx) => {
    if (i.markStale) {
      await tx
        .update(scholarships)
        .set({ status: "stale", updatedAt: i.now })
        .where(and(eq(scholarships.id, i.listing.id), eq(scholarships.status, "published")));
    }
    await tx
      .insert(catalogTasks)
      .values({
        kind: "recheck_changed",
        scholarshipId: i.listing.id,
        payload: {
          type: "recheck_changed",
          url: i.url,
          before: listingToDraft(i.listing),
          after: i.after,
          report: i.report,
        },
      })
      .onConflictDoNothing();
  });
}

type Queued = { listing: Listing; url: string; text: string; hash: string };

/** Fetches one listing's page. Returns it for the batch when the page changed; handles every other outcome here. */
async function checkListing(deps: CatalogDeps, listing: Listing, now: Date): Promise<Queued | null> {
  const url = listing.sourceUrl || listing.url;
  const page = await fetchSafely(deps, url);
  if (page === null) return null;
  const problem = pageProblem(page);
  if (problem !== null) {
    await createReviewTask(deps, { listing, url, after: null, report: problemReport(problem), markStale: true, now });
    return null;
  }
  const text = page.text;
  const hash = sha256Hex(text);
  const [latest] = await deps.db
    .select({ contentHash: scholarshipSources.contentHash })
    .from(scholarshipSources)
    .where(eq(scholarshipSources.scholarshipId, listing.id))
    .orderBy(desc(scholarshipSources.fetchedAt))
    .limit(1);
  if (latest?.contentHash === hash) {
    await deps.db.transaction(async (tx) => {
      await tx.insert(scholarshipSources).values({
        scholarshipId: listing.id,
        url,
        fetchedAt: now,
        contentHash: hash,
        excerpt: text.slice(0, EXCERPT_CHARS),
      });
      await tx.update(scholarships).set({ verifiedAt: now, updatedAt: now }).where(eq(scholarships.id, listing.id));
    });
    return null;
  }
  return { listing, url, text, hash };
}

/**
 * CA-05, nightly. Re-fetches published listings verified over 30 days ago, never verified, or due within 45 days,
 * skipping any fetched in the last 7 days (at most 200, 8 at a time, no new fetch after 10 minutes). Unchanged pages refresh verifiedAt; dead or unreadable
 * pages mark the listing stale with a review task; changed pages go to one extraction batch.
 */
export async function startRecheck(deps: CatalogDeps): Promise<{ batchId: string | null; count: number }> {
  const now = deps.now();
  const staleBefore = new Date(now.getTime() - 30 * DAY_MS);
  const recentSince = new Date(now.getTime() - 7 * DAY_MS);
  const today = isoDay(now);
  const soon = isoDay(new Date(now.getTime() + 45 * DAY_MS));
  const candidates = await deps.db
    .select()
    .from(scholarships)
    .where(
      and(
        eq(scholarships.status, "published"),
        or(
          isNull(scholarships.verifiedAt),
          lt(scholarships.verifiedAt, staleBefore),
          and(gte(scholarships.deadline, today), lte(scholarships.deadline, soon)),
        ),
        sql`not exists (select 1 from ${scholarshipSources} where ${scholarshipSources.scholarshipId} = ${scholarships.id} and ${scholarshipSources.fetchedAt} >= ${recentSince.toISOString()}::timestamptz)`,
      ),
    )
    .orderBy(sql`${scholarships.verifiedAt} asc nulls first`)
    .limit(RECHECK_LIMIT);

  const queued: Queued[] = [];
  const deadline = now.getTime() + RECHECK_BUDGET_MS;
  let next = 0;
  // A small pool: each worker takes the next listing until the list or the time budget runs out.
  const worker = async (): Promise<void> => {
    while (next < candidates.length && deps.now().getTime() <= deadline) {
      const listing = candidates[next];
      next += 1;
      if (!listing) break;
      const item = await checkListing(deps, listing, now);
      if (item) queued.push(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(RECHECK_CONCURRENCY, candidates.length) }, worker));

  if (queued.length === 0) return { batchId: null, count: 0 };
  const schema = toStrictJsonSchema(ListingDraft);
  const { batchId } = await deps.anthropicBatches.create(
    queued.map((q) => ({
      customId: q.listing.id,
      system: EXTRACT_SYSTEM,
      userText: recheckUserText(q.url, q.text),
      schema,
    })),
  );
  // Only after the batch exists: a failed create leaves no source rows, so these listings are retried tomorrow.
  await deps.db.transaction(async (tx) => {
    await tx
      .insert(recheckBatches)
      .values({ anthropicBatchId: batchId, scholarshipIds: queued.map((q) => q.listing.id), status: "in_progress" });
    await tx.insert(scholarshipSources).values(
      queued.map((q) => ({
        scholarshipId: q.listing.id,
        url: q.url,
        fetchedAt: now,
        contentHash: q.hash,
        excerpt: q.text.slice(0, EXCERPT_CHARS),
      })),
    );
  });
  return { batchId, count: queued.length };
}

/**
 * Every 30 minutes. For each ended batch: unchanged drafts refresh verifiedAt; changed drafts mark the listing stale
 * with a recheck_changed task; unparseable or missing results count as failed and get a task without a status change.
 */
export async function collectRecheck(
  deps: CatalogDeps,
): Promise<{ changed: number; unchanged: number; failed: number }> {
  const totals = { changed: 0, unchanged: 0, failed: 0 };
  const batches = await deps.db
    .select()
    .from(recheckBatches)
    .where(eq(recheckBatches.status, "in_progress"))
    .orderBy(asc(recheckBatches.createdAt));
  for (const batch of batches) {
    const [claimed] = await deps.db
      .update(recheckBatches)
      .set({ status: "collecting" })
      .where(and(eq(recheckBatches.id, batch.id), eq(recheckBatches.status, "in_progress")))
      .returning();
    if (!claimed) continue;
    try {
      let result: { ended: boolean; items: BatchItem[] };
      try {
        result = await deps.anthropicBatches.results(batch.anthropicBatchId);
      } catch (error) {
        // One bad batch never stops the others. A batch the API no longer has can't be collected, so its
        // listings get review tasks (their new hashes are already stored) and the batch is marked failed.
        const notFound = error instanceof BatchNotFoundError;
        console.log(
          JSON.stringify({
            level: "warn",
            msg: "catalog recheck collect failed",
            batchId: batch.anthropicBatchId,
            notFound,
          }),
        );
        if (!notFound) {
          await deps.db.update(recheckBatches).set({ status: "in_progress" }).where(eq(recheckBatches.id, batch.id));
          continue;
        }
        const now = deps.now();
        for (const id of batch.scholarshipIds) {
          const [listing] = await deps.db.select().from(scholarships).where(eq(scholarships.id, id)).limit(1);
          if (!listing) continue;
          totals.failed += 1;
          const url = listing.sourceUrl || listing.url;
          await createReviewTask(deps, {
            listing,
            url,
            after: null,
            report: problemReport(FAILED_MESSAGE, null),
            markStale: false,
            now,
          });
        }
        await deps.db
          .update(recheckBatches)
          .set({ status: "failed", collectedAt: now })
          .where(eq(recheckBatches.id, batch.id));
        continue;
      }
      if (!result.ended) {
        await deps.db.update(recheckBatches).set({ status: "in_progress" }).where(eq(recheckBatches.id, batch.id));
        continue;
      }
      const now = deps.now();
      // AG-06: batch items cost half the standard price.
      for (const item of result.items) {
        if (item.usage) {
          const usage = { ...item.usage, costMicros: Math.round(item.usage.costMicros / 2) };
          await reportUsage(deps.onUsage, catalogTurn(usage, "end_turn", 0));
        }
      }
      const answers = new Map(result.items.map((item) => [item.customId, item.json]));
      for (const id of batch.scholarshipIds) {
        const [listing] = await deps.db.select().from(scholarships).where(eq(scholarships.id, id)).limit(1);
        if (!listing) continue;
        const url = listing.sourceUrl || listing.url;
        const parsed = ListingDraft.safeParse(answers.get(id) ?? null);
        if (!parsed.success) {
          totals.failed += 1;
          const report = problemReport(FAILED_MESSAGE, null);
          await createReviewTask(deps, { listing, url, after: null, report, markStale: false, now });
          continue;
        }
        const after = parsed.data;
        if (diffListing(listingToDraft(listing), after).length === 0) {
          totals.unchanged += 1;
          await deps.db
            .update(scholarships)
            .set({ verifiedAt: now, updatedAt: now })
            .where(eq(scholarships.id, listing.id));
          continue;
        }
        totals.changed += 1;
        const [source] = await deps.db
          .select({ excerpt: scholarshipSources.excerpt })
          .from(scholarshipSources)
          .where(eq(scholarshipSources.scholarshipId, listing.id))
          .orderBy(desc(scholarshipSources.fetchedAt))
          .limit(1);
        // The full page isn't stored, so quotes can't be checked here; scam rules still see the excerpt and the fee.
        const report = verifyDraft(after, source?.excerpt ?? "", now, {
          allowedDomains: deps.allowedDomains,
          checkQuotes: false,
        });
        await createReviewTask(deps, { listing, url, after, report, markStale: true, now });
      }
      await deps.db
        .update(recheckBatches)
        .set({ status: "collected", collectedAt: now })
        .where(eq(recheckBatches.id, batch.id));
    } catch (error) {
      await deps.db.update(recheckBatches).set({ status: "in_progress" }).where(eq(recheckBatches.id, batch.id));
      throw error;
    }
  }
  return totals;
}
