import { catalogTasks, eq, inArray, scholarships } from "@scholarcrew/db";
import type { CatalogTaskPayload, ListingDraft, VerificationReport } from "@scholarcrew/domain";
import { extractListing } from "./extract";
import { fetchSafely, pageProblem, problemReport } from "./pages";
import type { CatalogDeps } from "./types";
import { cleanDomains, hostAllowed, normalizeUrl } from "./urls";
import { verifyDraft } from "./verify";

/** A task in one of these states blocks a new task for the same URL: still pending, or already turned down. */
const BLOCKING_STATUSES = ["open", "in_review", "rejected"] as const;

function payloadUrl(payload: CatalogTaskPayload): string | null {
  switch (payload.type) {
    case "research_candidate":
    case "user_submission":
    case "recheck_changed":
      return payload.url;
    default:
      return null;
  }
}

/** Normalized URLs of every listing (url and sourceUrl) and every blocking task. */
async function knownUrls(deps: CatalogDeps): Promise<Set<string>> {
  const known = new Set<string>();
  const add = (raw: string) => {
    const key = normalizeUrl(raw);
    if (key) known.add(key);
  };
  const listings = await deps.db
    .select({ url: scholarships.url, sourceUrl: scholarships.sourceUrl })
    .from(scholarships);
  for (const listing of listings) {
    add(listing.url);
    add(listing.sourceUrl);
  }
  const tasks = await deps.db
    .select({ payload: catalogTasks.payload })
    .from(catalogTasks)
    .where(inArray(catalogTasks.status, [...BLOCKING_STATUSES]));
  for (const task of tasks) {
    const url = payloadUrl(task.payload);
    if (url) add(url);
  }
  return known;
}

/** CA-01: asks the researcher for pages and files each new one as a research_candidate task. Never creates listings. */
export async function researchCandidates(
  deps: CatalogDeps,
  i: { state: string; county?: string },
): Promise<{ created: number; taskIds: string[] }> {
  const county = i.county?.trim() || undefined;
  const found = await deps.researcher.findCandidates({ state: i.state, county, allowedDomains: deps.allowedDomains });
  const known = await knownUrls(deps);
  const values: Array<typeof catalogTasks.$inferInsert> = [];
  for (const candidate of found) {
    const key = normalizeUrl(candidate.url);
    if (
      !key ||
      known.has(key) ||
      (cleanDomains(deps.allowedDomains).length > 0 && !hostAllowed(candidate.url, cleanDomains(deps.allowedDomains)))
    )
      continue;
    known.add(key);
    values.push({
      kind: "research_candidate",
      payload: {
        type: "research_candidate",
        url: candidate.url.trim(),
        title: candidate.title.trim(),
        snippet: candidate.snippet.trim(),
        state: i.state,
        county: county ?? null,
        draft: null,
        report: null,
      },
    });
  }
  if (values.length === 0) return { created: 0, taskIds: [] };
  const rows = await deps.db.insert(catalogTasks).values(values).returning({ id: catalogTasks.id });
  return { created: rows.length, taskIds: rows.map((row) => row.id) };
}

/**
 * The "catalog.extract" job: fetch the page, extract a draft, verify it, and store both on the task.
 * Handles research candidates and student submissions (D18); a submission's listing is never touched, so it stays
 * submitter-only until an admin acts. The task stays open either way. Returns null (and does nothing) for a missing
 * task, a task that isn't open, or any other kind.
 */
export async function extractForTask(deps: CatalogDeps, taskId: string): Promise<VerificationReport | null> {
  const [task] = await deps.db.select().from(catalogTasks).where(eq(catalogTasks.id, taskId)).limit(1);
  if (!task || task.status !== "open") return null;
  const payload = task.payload;
  if (payload.type !== "research_candidate" && payload.type !== "user_submission") return null;
  const allowed = cleanDomains(deps.allowedDomains);
  if (payload.type === "research_candidate" && allowed.length > 0 && !hostAllowed(payload.url, allowed)) {
    const report = problemReport("Not on an allowed domain");
    await deps.db
      .update(catalogTasks)
      .set({ payload: { ...payload, draft: null, report } })
      .where(eq(catalogTasks.id, task.id));
    return report;
  }
  const page = await fetchSafely(deps, payload.url);
  const problem = pageProblem(page);
  let draft: ListingDraft | null = null;
  let report: VerificationReport;
  if (page === null || problem !== null) {
    report = problemReport(problem ?? "Page couldn't be fetched.");
  } else {
    draft = await extractListing(deps, { url: payload.url, pageText: page.text });
    report = draft
      ? verifyDraft(draft, page.text, deps.now(), { allowedDomains: deps.allowedDomains })
      : problemReport("The model returned no listing for this page.", null);
  }
  await deps.db
    .update(catalogTasks)
    .set({ payload: { ...payload, draft, report } })
    .where(eq(catalogTasks.id, task.id));
  return report;
}
