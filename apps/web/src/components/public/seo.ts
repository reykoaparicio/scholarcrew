import { searchScholarships } from "@scholarcrew/core/scholarships";
import type { CoreDeps } from "@scholarcrew/core/shared";
import { PUBLIC_ACTOR, type ScholarshipSummary, US_STATES } from "@scholarcrew/domain";
import type { MetadataRoute } from "next";
import { stateHref } from "./states";

export const SITEMAP_LIMIT = 5000;
const SEARCH_PAGE = 50;
const STATIC_PATHS = ["/", "/directory", "/offer-tool", "/privacy", "/terms", "/ai-policy", "/sign-in"];

/** App, admin, API, and token pages never belong in a search index. */
export const DISALLOWED_PATHS = [
  "/api/",
  "/admin",
  "/h/",
  "/verify-hours/",
  "/family",
  "/sign-in/check-email",
  "/week",
  "/crew",
  "/scholarships",
  "/essays",
  "/colleges",
  "/money",
  "/prep",
  "/impact",
  "/memory",
  "/settings",
  "/onboarding",
];

export function buildRobots(appUrl: string): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/"], disallow: DISALLOWED_PATHS }],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}

export function buildSitemap(
  appUrl: string,
  listings: Array<Pick<ScholarshipSummary, "slug" | "verifiedAt">>,
): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({
    url: `${appUrl}${p}`,
    changeFrequency: "weekly" as const,
  }));
  const states: MetadataRoute.Sitemap = US_STATES.map((s) => ({
    url: `${appUrl}${stateHref(s)}`,
    changeFrequency: "daily" as const,
  }));
  const items: MetadataRoute.Sitemap = listings.slice(0, SITEMAP_LIMIT).map((l) => ({
    url: `${appUrl}/directory/s/${encodeURIComponent(l.slug)}`,
    ...(l.verifiedAt ? { lastModified: l.verifiedAt } : {}),
  }));
  return [...pages, ...states, ...items];
}

/** Published public listings, oldest deadline first, up to `limit`. Public-actor search drops scam-flagged ones in SQL (D39). */
export async function collectSitemapListings(deps: CoreDeps, limit = SITEMAP_LIMIT): Promise<ScholarshipSummary[]> {
  const out: ScholarshipSummary[] = [];
  const maxPages = Math.ceil(limit / SEARCH_PAGE);
  for (let page = 1; page <= maxPages && out.length < limit; page += 1) {
    const res = await searchScholarships(deps, PUBLIC_ACTOR, { page, pageSize: SEARCH_PAGE });
    out.push(...res.items);
    if (res.items.length < SEARCH_PAGE || page * SEARCH_PAGE >= res.total) break;
  }
  return out.slice(0, limit);
}
