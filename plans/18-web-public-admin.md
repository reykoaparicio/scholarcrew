# Plan 18: Public site, auth pages, helper view, admin console (Agent R)

This plan builds every page a visitor sees without the app shell: the public site (landing, scholarship directory by state and by listing, the public offer tool, privacy, terms, and AI policy), `robots.txt` and `sitemap.xml`, the sign-in pages, the family invite page, the read-only helper view, the supervisor hours confirmation page, and the admin console (review queue, scholarship editor with an eligibility rule editor, reports, college import and research, aid rules and deadlines, audit log). Server components call `@scholarcrew/core` with `PUBLIC_ACTOR`, a helper actor, or the admin's page actor; client components call `/api/v1` through `api()` from plan 16. Feature IDs: PU-01, PU-02, PU-03 (MO-11 screen), PU-04, ID-01 (sign-in pages), ID-03 (under-13 notice), ID-04 (admin page guard), FA-01 (join page), HL-02, HL-03, HL-04 (dead links 404), IM-02 (supervisor page), AD-01..AD-05, MO-09 and AID-03 (admin aid rules and deadlines, R2P-1), CA-03 (verification issues shown to reviewers), CA-04 (only an admin publishes), SE-04 (page-side rate limits on token pages), SE-05 (no trackers).

Rules this plan follows on top of `00-overview.md`, plan 13, and plan 16:

- Pages and layouts are server components. Anything with state or handlers is a `"use client"` component under `src/components/{public,admin,auth}/**`. Server components pass only plain data (no functions, no `Date`) to client components.
- UI comes from `@scholarcrew/ui` and uses only the 24 `ICON_NAMES`. Formatting comes from `@/lib/format` (`usd`, `dateShort`, `dateWithWeekday`, `instantShort`, `daysLabel`, `minutesLabel`, `plural`, `addDaysIso`) and API calls from `@/lib/api` (`api`, `ApiError`, `errorMessage`), exactly as plan 16 drafts them.
- Every page that reads the database exports `dynamic = "force-dynamic"`, so `next build` never needs a database. `sitemap.ts` and `robots.ts` do too.
- Token pages (`/h/[token]`, `/verify-hours/[token]`) and `/family/join` are `noindex` and send `referrer: no-referrer`. `/h/` and `/verify-hours/` charge the same rate-limit bucket as their API routes (`helper-view:<ip>` 60/hour, `verify-hours:<ip>` 10/hour).
- Admin pages call `requirePageActor(["admin"])` themselves (layouts and pages render in parallel in the app router, so the layout guard alone isn't enough). Non-admins get the 404 page.
- Client tests start with `// @vitest-environment jsdom`, mock `next/navigation`, stub `fetch` with `vi.stubGlobal` (plan 13's `test/setup.ts` unstubs after each test), use `fireEvent`/`waitFor`, and call `cleanup` in `afterEach`. Server page tests run in the node environment with `useTestDeps()` and render with `renderToStaticMarkup`. The test clock is `2026-10-06T15:00:00.000Z`.

Deviations and decisions (also in the final report):

- **Admin reads (D36, adopted).** Admin server pages call core `admin.getScholarshipForAdmin`, `admin.listScholarships`, and `admin.getCatalogTask`, the same functions plan 14's `GET /admin/scholarships`, `GET /admin/scholarships/:id`, and `GET /admin/catalog-tasks/:id` wrap. Server components call core directly, and no client component needs these reads. The getters throw `not_found` for bad or unknown ids, which the pages turn into a 404 or "nothing selected".
- **Invite preview (D37, F-18-1, adopted).** Plan 13 keeps `/family/join` public. The page renders `InvitePreview`, a client component that calls `GET /family/invites/preview?token=` (rate-limited per IP by 13) and shows the inviter's first name, role, and expiry. An unknown, used, or expired invite shows only the generic card. The response has no domain schema, so `JoinInvite.tsx` types it locally as `{ inviterFirstName; memberRole; expiresAt }`.
- **D15 (accepted).** Magic links can't carry `next`, so `/sign-in?next=/family/join...` shows a note telling the parent to reopen the invite link after signing in.
- **Helper request details (D38, adopted).** The helper view shows "What <name> is asking for" with the note and "Helpful by <date>" when `HelperView.request` has either.
- **Scam-flagged listings (D39, adopted).** Public-actor `searchScholarships` drops scam-flagged listings in SQL, so the directory and sitemap don't filter after the query.
- **Publish as unverified (D40, accepted).** Release 1 offers Publish and Reject only, because `resolveCatalogTask` always sets the verified date. Re-check tasks label their two non-publish choices "Keep current listing" and "Retire listing" (R2C-7, below).
- **Submission drafts (R2C-6, round 2).** `draftOf` and `reportOf` read `draft` and `report` from a `user_submission` payload (plan 11 K6 writes them). With a draft, the task shows the field rows and code checks, and its one Publish PATCHes the submission's own listing (`task.scholarshipId`, keeping its slug) before resolving with `publishScholarshipId`. The plain "publish the row as entered" button shows only while there's no draft, with a note to fill the listing in first.
- **Re-check choices (R2C-7, round 2).** "Keep current listing" resolves the task `rejected`; 08 H11 puts a `stale` listing back to `published` with a fresh verification in the same transaction. "Retire listing" needs a note, calls `POST /admin/scholarships/:id/status { status: "retired", note }`, then resolves `resolved` with `publishScholarshipId: null`. Keeping needs no note, like Publish, because it's a verification, not a rejection.
- **Aid rules (R2P-1, round 2).** `/admin/aid` (R16) edits the award year's `federal_loan_rates` rule and its aid deadlines. The page reads through core like the other admin pages (D36), and the editor writes through 14's `PUT /admin/aid-rules`, `PUT /admin/aid-deadlines`, and `DELETE /admin/aid-deadlines/:id`. The admin `NAV` gains `{ key: "aid", label: "Aid rules", href: "/admin/aid", icon: "doc" }` before the audit log. The award year defaults to `currentAwardYear(now)`, with chips for the year before and after.
- **Privacy copy (R2I-9, R2I-17, round 2).** The privacy page names Twilio for text reminders and says an under-13 account is deleted with everything in it within 7 days.
- **State names (D41, adopted).** `STATE_NAMES` and `localLabel` come from `@scholarcrew/domain`; `states.ts` keeps only `stateFromParam` and `stateHref`.
- **Closed listings (F-18-3, adopted).** `toQuery` always sends `openOn: todayIso(now)` (Central calendar day), so closed listings never appear in the directory or the Next 30/90 days chips. The sitemap still lists every published listing.
- **Page rate-limit IP.** `allowPageRequest` uses 13's `clientIp` (right-most `X-Forwarded-For` hop, D-13-3), so the page and the API route charge the same bucket.
- **Round 3 labels and dates (R3V-8, R3V-10).** The helper view's plan and stage words are 02's `APP_PLAN_LABELS` ("Regular Decision", "Rolling admission") and `APPLICATION_STAGE_LABELS` ("Working on", "Didn't win"), and the eligibility editor's income choices are built from `INCOME_RANGE_LABELS`. `HelperView.scholarships[].stage` is a plain `string` in 02, so `stageLabel` narrows it with `ApplicationStage.safeParse` before the lookup. Admin screens read instants on one calendar, `ADMIN_TZ = "America/Chicago"` in `components/admin/labels.ts`, through `instantLong(iso, ADMIN_TZ)`. Catalog statuses show `CATALOG_STATUS_LABELS`, and admin deadlines use `calendarLong` (`adminDeadline`).
- **Round 3 errors (R3A-13, R3A-21, R3A-22, R3A-24).** `AdminFrame.signOut` leaves only when sign-out worked or the session was already gone, and otherwise shows the message. A 409 from a task or report resolve means the item is closed: the server message shows, its buttons stay disabled, and the page refreshes. `postCsv` maps a bare 413 to the 5 MB message. Admin notes carry `maxLength={1000}` and the research county `maxLength={100}`, matching 02. `OfferTool` keeps its code: 06's rate-limit message now names the real wait (R3A-23, closed by R3A-11).

## Files

Create:

- `apps/web/src/app/robots.ts`, `apps/web/src/app/sitemap.ts`
- `apps/web/src/app/(public)/layout.tsx`, `(public)/error.tsx`, `(public)/page.tsx`
- `apps/web/src/app/(public)/directory/page.tsx`, `(public)/directory/[state]/page.tsx`, `(public)/directory/s/[slug]/page.tsx`
- `apps/web/src/app/(public)/offer-tool/page.tsx`
- `apps/web/src/app/(public)/privacy/page.tsx`, `(public)/terms/page.tsx`, `(public)/ai-policy/page.tsx`
- `apps/web/src/app/sign-in/layout.tsx`, `sign-in/page.tsx`, `sign-in/check-email/page.tsx`
- `apps/web/src/app/family/join/layout.tsx`, `family/join/page.tsx`
- `apps/web/src/app/h/[token]/page.tsx`, `h/[token]/not-found.tsx`, `h/[token]/error.tsx`
- `apps/web/src/app/verify-hours/layout.tsx`, `verify-hours/[token]/page.tsx`, `verify-hours/[token]/error.tsx`
- `apps/web/src/app/(admin)/layout.tsx`, `(admin)/error.tsx`, `(admin)/admin/page.tsx`, `(admin)/admin/tasks/page.tsx`
- `apps/web/src/app/(admin)/admin/scholarships/page.tsx`, `(admin)/admin/scholarships/new/page.tsx`, `(admin)/admin/scholarships/[id]/page.tsx`
- `apps/web/src/app/(admin)/admin/reports/page.tsx`, `(admin)/admin/colleges/page.tsx`, `(admin)/admin/aid/page.tsx`, `(admin)/admin/audit/page.tsx`
- `apps/web/src/components/public/`: `PublicChrome.tsx`, `public.module.css`, `states.ts`, `params.ts`, `seo.ts`, `Landing.tsx`, `landing.module.css`, `LegalPage.tsx`, `legal.module.css`, `listings.ts`, `ListingRow.tsx`, `DirectoryFilters.tsx`, `directory.module.css`, `offerTool.ts`, `OfferTool.tsx`, `OfferResults.tsx`, `offerTool.module.css`, `dates.ts`, `pageRate.ts`, `HelperSheet.tsx`, `helper.module.css`, `VerifyHoursForm.tsx`, `verify.module.css`, `ErrorState.tsx`, `error.module.css`
- `apps/web/src/components/auth/`: `messages.ts`, `SignInForm.tsx`, `CheckEmail.tsx`, `JoinInvite.tsx`, `auth.module.css`
- `apps/web/src/components/admin/`: `AdminFrame.tsx`, `admin.module.css`, `labels.ts`, `eligibility.ts`, `EligibilityEditor.tsx`, `listingForm.ts`, `RequirementsEditor.tsx`, `ScholarshipEditor.tsx`, `review.ts`, `TaskList.tsx`, `TaskReview.tsx`, `ReportsTable.tsx`, `CollegeImport.tsx`, `ResearchForm.tsx`, `AidRulesEditor.tsx`

Modify: none (plan 13 owns `package.json`, configs, `test/**`, `src/server/**`, middleware; plan 16 owns `src/lib/**` and the root layout).

Test:

- `apps/web/src/components/public/seo.test.ts`, `noTrackers.test.ts`, `Landing.test.tsx`, `legal.test.tsx`, `listings.test.ts`, `ListingRow.test.tsx`, `directoryPages.test.tsx`, `offerTool.test.ts`, `OfferTool.test.tsx`, `pageRate.test.ts`, `HelperSheet.test.tsx`, `helperPage.test.tsx`, `VerifyHoursForm.test.tsx`, `errorPages.test.tsx`
- `apps/web/src/components/auth/SignInForm.test.tsx`, `JoinInvite.test.tsx`
- `apps/web/src/components/admin/AdminFrame.test.tsx`, `eligibility.test.ts`, `EligibilityEditor.test.tsx`, `listingForm.test.ts`, `ScholarshipEditor.test.tsx`, `review.test.ts`, `TaskReview.test.tsx`, `adminTools.test.tsx`, `AidRulesEditor.test.tsx`

## Tasks

### R1: Public chrome, robots.txt, and sitemap.xml (PU-02, SE-05)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/public/seo.test.ts`:

```ts
import { factories } from "@scholarcrew/db/testing";
import { useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";
import { firstParam } from "./params";
import { DISALLOWED_PATHS, SITEMAP_LIMIT, buildRobots, buildSitemap, collectSitemapListings } from "./seo";

const deps = useTestDeps();

describe("robots", () => {
  it("allows the public site and keeps app, admin, API, and token pages out", () => {
    const r = buildRobots("https://scholarcrew.example");
    expect(r.sitemap).toBe("https://scholarcrew.example/sitemap.xml");
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule?.userAgent).toBe("*");
    expect(rule?.allow).toEqual(["/"]);
    expect(rule?.disallow).toEqual(DISALLOWED_PATHS);
    for (const p of ["/api/", "/admin", "/h/", "/verify-hours/", "/family", "/week", "/settings", "/onboarding"]) {
      expect(DISALLOWED_PATHS).toContain(p);
    }
    expect(DISALLOWED_PATHS).not.toContain("/directory");
  });

  it("reads the app URL from deps", () => {
    expect(robots().sitemap).toBe("http://localhost:3000/sitemap.xml");
  });
});

describe("buildSitemap", () => {
  it("lists static pages, all 52 state pages, and listing pages", () => {
    const map = buildSitemap("https://x.example", [{ slug: "maple-award", verifiedAt: "2026-10-02T12:00:00.000Z" }]);
    const urls = map.map((e) => e.url);
    expect(urls).toContain("https://x.example/");
    expect(urls).toContain("https://x.example/offer-tool");
    expect(urls).toContain("https://x.example/directory/TX");
    expect(urls.filter((u) => /\/directory\/[A-Z]{2}$/.test(u))).toHaveLength(52);
    expect(map.find((e) => e.url === "https://x.example/directory/s/maple-award")?.lastModified).toBe(
      "2026-10-02T12:00:00.000Z",
    );
  });

  it("caps listings at 5000", () => {
    const many = Array.from({ length: SITEMAP_LIMIT + 3 }, (_, i) => ({ slug: `s-${i}`, verifiedAt: null }));
    expect(buildSitemap("https://x.example", many).filter((e) => e.url.includes("/directory/s/"))).toHaveLength(5000);
  });
});

describe("sitemap listings", () => {
  it("includes published public listings only, never drafts, private submissions, or scam-flagged ones", async () => {
    const db = deps().db;
    await factories.scholarship(db, { slug: "alpha-award" });
    await factories.scholarship(db, { slug: "bravo-award" });
    await factories.scholarship(db, { slug: "draft-award", status: "draft" });
    await factories.scholarship(db, { slug: "flagged-award", status: "flagged" });
    await factories.scholarship(db, { slug: "fee-award", scamFlags: ["application_fee"] });
    await factories.scholarship(db, { slug: "mine-only", visibility: "submitter_only" });
    const slugs = (await collectSitemapListings(deps())).map((s) => s.slug).sort();
    expect(slugs).toEqual(["alpha-award", "bravo-award"]);
    expect(await collectSitemapListings(deps(), 1)).toHaveLength(1);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain("http://localhost:3000/directory/s/alpha-award");
    expect(urls).not.toContain("http://localhost:3000/directory/s/draft-award");
    expect(urls).not.toContain("http://localhost:3000/directory/s/fee-award");
  });
});

describe("firstParam", () => {
  it("reads the first value of a search param", () => {
    expect(firstParam({ a: "x" }, "a")).toBe("x");
    expect(firstParam({ a: ["y", "z"] }, "a")).toBe("y");
    expect(firstParam({}, "a")).toBeUndefined();
  });
});
```

`apps/web/src/components/public/noTrackers.test.ts` (SE-05 scan over every file this plan owns):

```ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const OWNED_DIRS = [
  "app/(public)",
  "app/(admin)",
  "app/h",
  "app/verify-hours",
  "app/sign-in",
  "app/family/join",
  "components/public",
  "components/admin",
  "components/auth",
];
const OWNED_FILES = ["app/robots.ts", "app/sitemap.ts"];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = [
  ...OWNED_FILES.map((f) => join(SRC, f)).filter((f) => existsSync(f)),
  ...OWNED_DIRS.flatMap((d) => walk(join(SRC, d))).filter((f) => !/\.test\.tsx?$/.test(f)),
];

describe("SE-05: public and admin pages load nothing from third parties", () => {
  it("finds the owned files", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it("has no third-party scripts, fonts, trackers, or CSS imports", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/next\/script|next\/font|<script|@import|@font-face|\burl\(/);
      expect(text, file).not.toMatch(/googletagmanager|gtag\(|segment\.io|posthog|mixpanel|hotjar|fullstory|plausible/i);
    }
  });

  it("keeps remote URLs out of styles and layouts", () => {
    for (const file of files.filter((f) => f.endsWith(".css") || f.endsWith("layout.tsx"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/https?:\/\//);
    }
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/components/public/seo src/components/public/noTrackers`
Expected: FAIL `seo.test.ts` with `Failed to resolve import "../../app/robots"`; `noTrackers.test.ts` fails "finds the owned files" (0 files).

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/public/params.ts`:

```ts
export type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a Next.js search param. */
export function firstParam(sp: SearchParams, key: string): string | undefined {
  const value = sp[key];
  return Array.isArray(value) ? value[0] : value;
}
```

`apps/web/src/components/public/states.ts` (names come from `@scholarcrew/domain`'s `STATE_NAMES`, D41):

```ts
import { USState } from "@scholarcrew/domain";

/** "tx" or "TX" → "TX"; anything else → null. */
export function stateFromParam(param: string): USState | null {
  const parsed = USState.safeParse(param.trim().toUpperCase());
  return parsed.success ? parsed.data : null;
}

export function stateHref(code: USState): string {
  return `/directory/${code}`;
}
```

`apps/web/src/components/public/seo.ts`:

```ts
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
  const pages: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({ url: `${appUrl}${p}`, changeFrequency: "weekly" as const }));
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
```

`apps/web/src/app/robots.ts`:

```ts
import { buildRobots } from "@/components/public/seo";
import { getDeps } from "@/server/deps";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(getDeps().config.appUrl);
}
```

`apps/web/src/app/sitemap.ts`:

```ts
import { buildSitemap, collectSitemapListings } from "@/components/public/seo";
import { getDeps } from "@/server/deps";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const deps = getDeps();
  return buildSitemap(deps.config.appUrl, await collectSitemapListings(deps));
}
```

`apps/web/src/components/public/PublicChrome.tsx`:

```tsx
import { Button, Icon } from "@scholarcrew/ui";
import type { ReactNode } from "react";
import styles from "./public.module.css";

const NAV = [
  { href: "/directory", label: "Directory" },
  { href: "/offer-tool", label: "Offer tool" },
  { href: "/#pricing", label: "Pricing" },
];

export function Brand() {
  return (
    <a href="/" className={styles.brand}>
      <span className={styles.mark}>
        <Icon name="spark" />
      </span>
      <span className={styles.word}>scholarcrew</span>
    </a>
  );
}

export function PublicHeader() {
  return (
    <header className={styles.head}>
      <Brand />
      <nav className={styles.links} aria-label="Site">
        {NAV.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </nav>
      <span className={styles.spacer} />
      <Button variant="line" href="/sign-in">
        Sign in
      </Button>
    </header>
  );
}

/** Header for pages a visitor reaches from an email link (no account, no site nav). */
export function SimpleHeader({ note }: { note: string }) {
  return (
    <header className={styles.head}>
      <Brand />
      <span className={styles.note}>{note}</span>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className={styles.foot}>
      <span>© 2026 ScholarCrew</span>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/ai-policy">AI use policy</a>
      <a href="/directory">Scholarship directory</a>
      <span className={styles.promise}>
        <Icon name="lock" />
        We never sell student data
      </span>
    </footer>
  );
}

export function PublicChrome({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.page}>
      {header ?? <PublicHeader />}
      <main id="main" className={styles.main}>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
```

`apps/web/src/components/public/public.module.css`:

```css
.page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--page);
}

.head {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 28px;
  min-height: 64px;
  padding: 10px 48px;
  border-bottom: 1px solid var(--line);
  background: var(--rail);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--ink);
}

.mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--navy);
  color: #fff;
}

.mark svg {
  width: 16px;
  height: 16px;
}

.word {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.links {
  display: flex;
  gap: 24px;
  font-size: 13.5px;
}

.links a {
  color: var(--ink-2);
  font-weight: 550;
}

.spacer {
  flex: 1;
}

.note {
  font-size: 13.5px;
  color: var(--muted);
}

.main {
  flex: 1;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
}

.foot {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  min-height: 46px;
  padding: 10px 48px;
  border-top: 1px solid var(--line);
  font-size: 12.5px;
  color: var(--muted);
}

.foot a {
  color: var(--ink-2);
  font-weight: 550;
}

.promise {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: var(--navy);
  font-weight: 650;
}

.promise svg {
  width: 14px;
  height: 14px;
}

@media (max-width: 720px) {
  .head,
  .foot {
    gap: 14px;
    padding: 10px 18px;
  }

  .links {
    order: 3;
    width: 100%;
    gap: 16px;
  }

  .promise {
    margin-left: 0;
  }
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/components/public/seo src/components/public/noTrackers && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 9 tests; `tsc --noEmit` prints nothing. (The scan re-runs over every later task's files; keep it green.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/public apps/web/src/app/robots.ts apps/web/src/app/sitemap.ts
git commit -m "feat(web): public chrome, robots.txt, and sitemap of published listings"
```

### R2: Public layout and landing page (PU-01)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/public/Landing.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PublicLayout from "../../app/(public)/layout";
import LandingPage, { metadata } from "../../app/(public)/page";

afterEach(cleanup);

describe("public layout", () => {
  it("has the site nav, sign in, legal links, and the no-selling promise, with no scripts", () => {
    const { container } = render(
      <PublicLayout>
        <p>body</p>
      </PublicLayout>,
    );
    const nav = screen.getByRole("navigation", { name: "Site" });
    expect(within(nav).getByRole("link", { name: "Directory" }).getAttribute("href")).toBe("/directory");
    expect(within(nav).getByRole("link", { name: "Offer tool" }).getAttribute("href")).toBe("/offer-tool");
    expect(within(nav).getByRole("link", { name: "Pricing" }).getAttribute("href")).toBe("/#pricing");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("We never sell student data")).toBeTruthy();
    const legal: Array<[string, string]> = [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["AI use policy", "/ai-policy"],
    ];
    for (const [name, href] of legal) expect(within(footer).getByRole("link", { name }).getAttribute("href")).toBe(href);
    expect(screen.getByRole("main").textContent).toBe("body");
    expect(container.querySelector("script, iframe, img")).toBeNull();
  });
});

describe("landing page (PU-01)", () => {
  it("explains the crew, the product rules, how it works, and test prices", () => {
    expect(metadata.title).toBe("ScholarCrew · A crew for paying for college");
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("A crew of specialists for paying for college");
    for (const name of ["Compass", "Scout", "Atlas", "Quill", "Aid", "Ledger", "Prep", "Impact"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    for (const rule of ["We never sell your data", "No lender referral fees", "No sweepstakes", "You write every essay"]) {
      expect(screen.getByText(rule)).toBeTruthy();
    }
    expect(screen.getByRole("heading", { name: "How it works" })).toBeTruthy();
    const pricing = document.getElementById("pricing");
    if (!pricing) throw new Error("pricing section missing");
    const p = within(pricing);
    expect(p.getByText("Test prices · not final")).toBeTruthy();
    for (const plan of ["Free", "Family plan", "Season pass"]) expect(p.getByRole("heading", { name: plan })).toBeTruthy();
    expect(p.getByText("20 crew requests a month")).toBeTruthy();
    expect(p.getAllByText("300 crew requests a month")).toHaveLength(2);
    const ctas = screen.getAllByRole("link", { name: /Start free|Try the Family plan|Get the season pass/ });
    expect(ctas.length).toBeGreaterThanOrEqual(4);
    for (const link of ctas) expect(link.getAttribute("href")).toBe("/sign-in");
    expect(screen.getByRole("link", { name: "Browse scholarships by state" }).getAttribute("href")).toBe("/directory");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/public/Landing`
Expected: FAIL with `Failed to resolve import "../../app/(public)/layout"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/(public)/layout.tsx`:

```tsx
import { PublicChrome } from "@/components/public/PublicChrome";
import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicChrome>{children}</PublicChrome>;
}
```

`apps/web/src/app/(public)/page.tsx`:

```tsx
import { Landing } from "@/components/public/Landing";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ScholarCrew · A crew for paying for college",
  description:
    "Find local scholarships you qualify for, write your own essays with a coach, and see what each college will really cost. We never sell student data.",
};

export default function LandingPage() {
  return <Landing />;
}
```

`apps/web/src/components/public/Landing.tsx`:

```tsx
import { CREW_NAMES, type CrewRole, PLAN_LIMITS } from "@scholarcrew/domain";
import { Button, CrewDot, Eyebrow, Icon, type IconName } from "@scholarcrew/ui";
import styles from "./landing.module.css";

const CREW: Array<{ role: CrewRole; text: string }> = [
  { role: "compass", text: "Plans your week and pulls the crew together" },
  { role: "scout", text: "Finds scholarships you fit and checks each source" },
  { role: "atlas", text: "College lists, deadlines, and requirements" },
  { role: "quill", text: "Essay coach. Asks questions; you write every word" },
  { role: "aid", text: "FAFSA, CSS Profile, and award letters" },
  { role: "ledger", text: "The money math, done by code, not guesses" },
  { role: "prep", text: "ACT and SAT plans, and whether a retake pays" },
  { role: "impact", text: "Service hours and activity descriptions" },
];

const RULES: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: "lock", title: "We never sell your data", text: "Not to colleges, lenders, or advertisers" },
  { icon: "dollar", title: "No lender referral fees", text: "We don't get paid when you borrow" },
  { icon: "alert", title: "No sweepstakes", text: "No \"enter to win\" and no \"guaranteed money\"" },
  { icon: "pen", title: "You write every essay", text: "Quill coaches; it never writes for you" },
];

const STEPS = [
  { title: "Tell us the basics", text: "School, county, grades, interests. Sensitive facts stay off unless you turn them on." },
  { title: "Scout finds matches", text: "Local and state scholarships, each checked against its source. Scams filtered out." },
  { title: "Compass plans your week", text: "A short list with time estimates, built around your real deadlines." },
  { title: "See the real cost", text: "Ledger shows each school's gap after grants and scholarships." },
];

const PRICES = [
  {
    name: "Free",
    amount: "$0",
    per: "",
    featured: false,
    items: ["Matches and your board", "Calendar and Story Bank", `${PLAN_LIMITS.free.crewRequestsPerMonth} crew requests a month`],
    cta: "Start free",
  },
  {
    name: "Family plan",
    amount: "$12",
    per: " / month",
    featured: true,
    items: ["1 student, up to 2 parents", `${PLAN_LIMITS.family.crewRequestsPerMonth} crew requests a month`, "Family room, award letters"],
    cta: "Try the Family plan",
  },
  {
    name: "Season pass",
    amount: "$79",
    per: " once",
    featured: false,
    items: ["August through May", `${PLAN_LIMITS.season_pass.crewRequestsPerMonth} crew requests a month`, "Doesn't renew on its own"],
    cta: "Get the season pass",
  },
];

export function Landing() {
  return (
    <div className={styles.land}>
      <section className={styles.hero}>
        <div>
          <Eyebrow>For high school students and the parents helping them</Eyebrow>
          <h1 className={styles.title}>A crew of specialists for paying for college</h1>
          <p className={styles.lead}>
            Find local scholarships you actually qualify for, write your own essays with a coach who asks good
            questions, and see what each college will really cost you.
          </p>
          <div className={styles.ctaRow}>
            <Button variant="primary" iconEnd="arrow" href="/sign-in">
              Start free
            </Button>
            <Button variant="line" href="/directory">
              Browse scholarships by state
            </Button>
          </div>
          <p className={styles.fine}>Free for students · no credit card · for ages 13 and up</p>
        </div>
        <div className={styles.crewCard}>
          <div className={styles.cardHead}>
            <h2 className={styles.h3}>Meet your crew</h2>
            <span className={styles.muted}>Each one sticks to its job</span>
          </div>
          <ul className={styles.crewGrid}>
            {CREW.map((c) => (
              <li key={c.role}>
                <b>
                  <CrewDot role={c.role} />
                  {CREW_NAMES[c.role]}
                </b>
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.rules} aria-label="Product rules">
        {RULES.map((r) => (
          <div key={r.title}>
            <Icon name={r.icon} />
            <div>
              <b>{r.title}</b>
              <span>{r.text}</span>
            </div>
          </div>
        ))}
      </section>

      <div className={styles.bottom}>
        <section id="how" aria-labelledby="how-h">
          <div className={styles.secHead}>
            <h2 id="how-h">How it works</h2>
            <span className={styles.muted}>About 6 minutes to set up</span>
          </div>
          <ol className={styles.how}>
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <b>
                  <span className={styles.n}>{i + 1}</span>
                  {s.title}
                </b>
                {s.text}
              </li>
            ))}
          </ol>
        </section>

        <section id="pricing" aria-labelledby="pricing-h">
          <div className={styles.secHead}>
            <h2 id="pricing-h">Pricing</h2>
            <span className={styles.testp}>Test prices · not final</span>
          </div>
          <div className={styles.prices}>
            {PRICES.map((p) => (
              <div key={p.name} className={p.featured ? `${styles.price} ${styles.feat}` : styles.price}>
                <h3>{p.name}</h3>
                <div className={styles.amt}>
                  {p.amount}
                  {p.per ? <small>{p.per}</small> : null}
                </div>
                <ul>
                  {p.items.map((item) => (
                    <li key={item}>
                      <Icon name="check" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button variant={p.featured ? "primary" : "line"} href="/sign-in">
                  {p.cta}
                </Button>
              </div>
            ))}
          </div>
          <p className={styles.fine}>
            Paying for a plan never unlocks anyone else's private data. Students choose what their family sees.
          </p>
        </section>
      </div>
    </div>
  );
}
```

`apps/web/src/components/public/landing.module.css`:

```css
.land {
  padding: 26px 72px 40px;
}

.hero {
  display: grid;
  grid-template-columns: 1fr minmax(0, 560px);
  gap: 48px;
  align-items: center;
}

.title {
  max-width: 620px;
  margin-top: 12px;
  font-size: 46px;
  line-height: 1.06;
  letter-spacing: -0.025em;
}

.lead {
  max-width: 560px;
  margin-top: 14px;
  font-size: 17px;
  line-height: 1.5;
  color: var(--ink-2);
}

.ctaRow {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}

.fine {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--muted);
}

.muted {
  font-size: 12.5px;
  color: var(--muted);
}

.crewCard {
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--card);
  box-shadow: 0 10px 30px rgba(20, 32, 47, 0.06);
}

.cardHead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.h3 {
  font-size: 15px;
}

.crewGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 22px;
  margin-top: 10px;
}

.crewGrid li {
  padding: 8px 0;
  border-top: 1px solid var(--line-2);
  font-size: 12.5px;
  line-height: 1.35;
  color: var(--muted);
}

.crewGrid b {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 1px;
  font-size: 13.5px;
  color: var(--ink);
}

.rules {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin-top: 22px;
  border: 1px solid var(--navy-line);
  border-radius: 14px;
  background: var(--navy-soft);
}

.rules > div {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 13px 18px;
  border-left: 1px solid var(--navy-line);
}

.rules > div:first-child {
  border-left: 0;
}

.rules svg {
  width: 18px;
  height: 18px;
  margin-top: 1px;
  color: var(--navy);
}

.rules b {
  display: block;
  font-size: 14px;
  color: var(--navy);
}

.rules span {
  font-size: 12.5px;
  color: var(--ink-2);
}

.bottom {
  display: grid;
  grid-template-columns: 1fr 1.18fr;
  gap: 28px;
  align-items: start;
  margin-top: 22px;
}

.secHead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.secHead h2 {
  font-size: 20px;
}

.how {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  list-style: none;
}

.how li {
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--card);
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--muted);
}

.how b {
  display: flex;
  align-items: center;
  margin-bottom: 5px;
  font-size: 14px;
  color: var(--ink);
}

.n {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--navy);
  color: #fff;
  font-size: 11.5px;
  font-weight: 700;
}

.prices {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.price {
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--card);
}

.feat {
  border: 1.5px solid var(--navy);
}

.price h3 {
  font-size: 14.5px;
}

.amt {
  margin-top: 4px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.amt small {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--muted);
}

.price ul {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  margin: 8px 0 12px;
  font-size: 12.5px;
  color: var(--ink-2);
}

.price li {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}

.price li svg {
  width: 13px;
  height: 13px;
  margin-top: 3px;
  color: var(--good);
}

.testp {
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--warn-soft);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--warn-text);
}

@media (max-width: 960px) {
  .land {
    padding: 20px 18px 32px;
  }

  .hero,
  .bottom {
    grid-template-columns: 1fr;
  }

  .rules,
  .prices {
    grid-template-columns: 1fr 1fr;
  }

  .title {
    font-size: 34px;
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/public && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 3 files, 11 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(public)/layout.tsx" "apps/web/src/app/(public)/page.tsx" apps/web/src/components/public/Landing.tsx apps/web/src/components/public/landing.module.css apps/web/src/components/public/Landing.test.tsx
git commit -m "feat(web): public layout and landing page with product rules and test prices"
```

### R3: Privacy policy, terms, and AI use policy drafts (PU-04)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/public/legal.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AiPolicyPage, { metadata as aiMeta } from "../../app/(public)/ai-policy/page";
import PrivacyPage, { metadata as privacyMeta } from "../../app/(public)/privacy/page";
import TermsPage, { metadata as termsMeta } from "../../app/(public)/terms/page";

afterEach(cleanup);

function text(): string {
  return document.body.textContent ?? "";
}

describe("legal drafts", () => {
  it("privacy covers data use, sensitive facts, minors, no selling, and retention windows", () => {
    expect(privacyMeta.title).toBe("Privacy policy · ScholarCrew");
    render(<PrivacyPage />);
    expect(screen.getByRole("note").textContent).toContain("Draft — needs legal review");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Privacy policy");
    const body = text();
    for (const phrase of [
      "We never sell",
      "13 or older",
      "AES-256-GCM",
      "never sent to an AI model",
      "Temporary chats",
      "24 hours",
      "within 7 days",
      "Sign-in links",
      "30 days",
      "90 days",
      "Twilio (text messages)",
      "If you turn on text reminders, we send your phone number and the reminder to Twilio to deliver it.",
      "If you're under 13, we delete the account and everything in it within 7 days.",
    ]) {
      expect(body).toContain(phrase);
    }
    expect(screen.getAllByRole("link", { name: /How long we keep it/ })[0]?.getAttribute("href")).toBe("#retention");
  });

  it("terms cover integrity, guidance, plans, and acceptable use", () => {
    expect(termsMeta.title).toBe("Terms of use · ScholarCrew");
    render(<TermsPage />);
    expect(screen.getByRole("note").textContent).toContain("Draft — needs legal review");
    const body = text();
    for (const phrase of ["You write every essay", "Nothing is submitted for you", "test prices", "no guaranteed money", "13"]) {
      expect(body).toContain(phrase);
    }
  });

  it("the AI policy says coach not ghostwriter, names the model and fallbacks, and describes human review", () => {
    expect(aiMeta.title).toBe("AI use policy · ScholarCrew");
    render(<AiPolicyPage />);
    expect(screen.getByRole("note").textContent).toContain("Draft — needs legal review");
    const body = text();
    for (const phrase of [
      "coach, not a ghostwriter",
      "claude-opus-5-5",
      "fallback",
      "Money math is code",
      "A person reviews",
      "Only an admin can publish",
      "never sent to an AI model",
    ]) {
      expect(body).toContain(phrase);
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/public/legal`
Expected: FAIL with `Failed to resolve import "../../app/(public)/ai-policy/page"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/public/LegalPage.tsx`:

```tsx
import { Icon } from "@scholarcrew/ui";
import type { ReactNode } from "react";
import styles from "./legal.module.css";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <article className={styles.doc}>
      <p className={styles.draft} role="note">
        <Icon name="alert" />
        <span>
          <b>Draft — needs legal review.</b> This is a plain-language draft. A lawyer hasn't reviewed it yet, and it
          may change before launch.
        </span>
      </p>
      <h1>{title}</h1>
      <p className={styles.updated}>Last updated {updated}</p>
      <p className={styles.intro}>{intro}</p>
      <nav aria-label="On this page" className={styles.toc}>
        <ol>
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      {sections.map((s) => (
        <section key={s.id} id={s.id} className={styles.section} aria-labelledby={`${s.id}-h`}>
          <h2 id={`${s.id}-h`}>{s.title}</h2>
          {s.body}
        </section>
      ))}
    </article>
  );
}
```

`apps/web/src/components/public/legal.module.css`:

```css
.doc {
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 24px 56px;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--ink-2);
}

.doc h1 {
  margin-top: 18px;
  color: var(--ink);
}

.draft {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--warn-soft);
  color: var(--warn-text);
  font-size: 13.5px;
}

.draft svg {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 3px;
  color: var(--warn-icon);
}

.updated {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--muted);
}

.intro {
  margin-top: 14px;
  font-size: 15.5px;
  color: var(--ink);
}

.toc {
  margin-top: 18px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--card);
}

.toc ol {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 20px;
  padding-left: 18px;
  font-size: 13px;
}

.section {
  margin-top: 26px;
  scroll-margin-top: 16px;
}

.section h2 {
  margin-bottom: 8px;
  font-size: 19px;
  color: var(--ink);
}

.section p + p,
.section p + ul,
.section ul + p {
  margin-top: 8px;
}

.section ul {
  padding-left: 20px;
  list-style: disc;
}

.section li + li {
  margin-top: 4px;
}

@media (max-width: 640px) {
  .toc ol {
    grid-template-columns: 1fr;
  }
}
```

`apps/web/src/app/(public)/privacy/page.tsx`:

```tsx
import { LegalPage, type LegalSection } from "@/components/public/LegalPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy · ScholarCrew",
  description: "What ScholarCrew collects, how it's used, who can see it, and how long we keep it. We never sell student data.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "covers",
    title: "Who we are and what this covers",
    body: (
      <p>
        ScholarCrew is a website that helps high school students and their families plan scholarships, essays,
        applications, and the cost of college. This policy covers the website, the public scholarship directory, the
        offer tool, helper links, and the browser extension.
      </p>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <ul>
        <li>
          Account: your email address, display name, birth year, and time zone, plus a mobile number if you turn on
          text reminders. There's no password.
        </li>
        <li>Profile: school, state, county, city, class year, GPA, intended majors, and interests.</li>
        <li>
          Your work: stories, essay drafts, activities, service hours, test scores, your college list, cost estimates,
          and award letter lines.
        </li>
        <li>Documents you upload, like award letters and transcripts. Files are encrypted before we store them.</li>
        <li>Crew chats and the decisions you ask the crew to remember.</li>
        <li>Usage and security records: how many crew requests you make, sign-ins, and an audit log of key changes.</li>
      </ul>
    ),
  },
  {
    id: "sensitive",
    title: "Sensitive facts",
    body: (
      <>
        <p>
          Some scholarships ask about first-generation status, income range, heritage, disability, religion, military
          family, foster care, or citizenship. These facts are off by default. You turn each one on yourself.
        </p>
        <ul>
          <li>They're encrypted with AES-256-GCM.</li>
          <li>Only the scholarship matcher reads them, to check eligibility rules. They're never sent to an AI model.</li>
          <li>Matches that use these details are visible only to you. Family members and models never see their names or reasons.</li>
          <li>You can turn any of them off at any time, and the matcher stops using them right away.</li>
        </ul>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use your information",
    body: (
      <p>
        We use it to run the features you ask for: matching scholarships, planning your week, coaching essays,
        comparing offers, reminders, and email. We use security records to stop abuse, like rate limits on sign-in
        links. We don't use your information for advertising, and we don't build profiles to sell.
      </p>
    ),
  },
  {
    id: "never",
    title: "What we never do",
    body: (
      <ul>
        <li>We never sell student data, to colleges, lenders, advertisers, or anyone else.</li>
        <li>We don't take referral fees from lenders, and we don't run sweepstakes or "guaranteed money" offers.</li>
        <li>We don't use third-party analytics, ad trackers, or session recording on any page.</li>
        <li>We never ask for your passwords to other sites, like StudentAid.gov or a college portal.</li>
      </ul>
    ),
  },
  {
    id: "who",
    title: "Who can see your information",
    body: (
      <ul>
        <li>You.</li>
        <li>
          Family members you invite, one category at a time. Deadlines, colleges, costs, scholarships, and activities
          are shared by default; essays, chats, stories, and sensitive facts stay private unless you share them. You can
          change this any time.
        </li>
        <li>
          Helpers you send a link to, like a teacher writing a recommendation. A helper link is read-only, shows only
          the categories you pick, never includes essays, chats, costs, or sensitive facts, lasts at most 90 days, and
          stops working the moment you turn it off.
        </li>
        <li>
          Service providers that run parts of ScholarCrew for us, and only for that: our hosting and database provider,
          Anthropic (the AI model), Stripe (payments), Resend (email), and Twilio (text messages).
        </li>
        <li>If you turn on text reminders, we send your phone number and the reminder to Twilio to deliver it.</li>
        <li>Our staff, only to keep the service running and secure, or when the law requires it.</li>
      </ul>
    ),
  },
  {
    id: "minors",
    title: "Ages 13 and up",
    body: (
      <p>
        You must be 13 or older to use ScholarCrew. We ask for your birth year when you set up your account. If you'd
        be under 13 this year, we can't open an account, and we deactivate it and delete what was entered. If you're
        under 13, we delete the account and everything in it within 7 days. Students aged 13 to 17 choose whether to
        invite a parent; parents see only what the student shares.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Temporary chats: deleted after 24 hours.</li>
        <li>Sign-in links: expire after 15 minutes and are deleted after 1 day.</li>
        <li>Data exports: the download is deleted after 24 hours.</li>
        <li>Deleted accounts: sign-ins stop at once, and your data is purged within 7 days.</li>
        <li>Facts the crew suggests but you haven't confirmed: removed after 30 days.</li>
        <li>Sessions: you stay signed in for up to 30 days.</li>
        <li>Family invites expire after 7 days; supervisor confirmation links after 14 days; helper links after at most 90 days.</li>
        <li>Everything else: until you delete it or delete your account.</li>
      </ul>
    ),
  },
  {
    id: "controls",
    title: "Your controls",
    body: (
      <ul>
        <li>See, edit, or forget anything the crew remembers about you, on the Memory page.</li>
        <li>Download everything you own as JSON and Markdown from Settings.</li>
        <li>Delete your account from Settings.</li>
        <li>Change family sharing per category, and turn off helper links, at any time.</li>
      </ul>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Sign-in uses one-time email links instead of passwords. Sensitive facts and uploaded files are encrypted. We
        limit how often sign-in links, crew requests, uploads, and public tools can be used, and we log admin edits,
        sharing changes, exports, deletions, and helper-link use.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <p>
        We'll post changes on this page and email you before any change that affects how your information is used.
        Questions: privacy@scholarcrew.example.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="October 6, 2026"
      intro="The short version: we collect what the crew needs to help you, we never sell it, sensitive facts are off unless you turn them on, and you can export or delete everything."
      sections={SECTIONS}
    />
  );
}
```

`apps/web/src/app/(public)/terms/page.tsx`:

```tsx
import { LegalPage, type LegalSection } from "@/components/public/LegalPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of use · ScholarCrew",
  description: "The rules for using ScholarCrew: accounts, your content, academic integrity, plans, and acceptable use.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "using",
    title: "Using ScholarCrew",
    body: (
      <p>
        By creating an account or using the public pages, you agree to these terms. If you don't agree, don't use
        ScholarCrew. If you're under 18, read these with a parent or guardian.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Accounts",
    body: (
      <ul>
        <li>You must be 13 or older. One person per account; parents use their own accounts.</li>
        <li>You sign in with a one-time email link. Keep your email account secure, because it's your key.</li>
        <li>Sign out on shared computers.</li>
      </ul>
    ),
  },
  {
    id: "content",
    title: "Your content",
    body: (
      <p>
        You own what you write and upload. You give us permission to store and process it only to run ScholarCrew for
        you and the people you choose to share with. When you delete something, we stop using it.
      </p>
    ),
  },
  {
    id: "integrity",
    title: "Academic integrity",
    body: (
      <ul>
        <li>You write every essay. Quill asks questions and leaves comments; it never writes essays for you.</li>
        <li>Don't submit text the crew wrote as your own work, and don't ask the crew to write it.</li>
        <li>Nothing is submitted for you. You send every application, form, and essay yourself.</li>
      </ul>
    ),
  },
  {
    id: "guidance",
    title: "Guidance, not guarantees",
    body: (
      <p>
        Scholarship listings carry a source and the date we last checked them, but sponsors change details. Always
        confirm deadlines and rules on the sponsor's own page. Cost and offer math are estimates from the numbers you
        give us. ScholarCrew isn't financial, legal, or admissions advice, and there's no guaranteed money.
      </p>
    ),
  },
  {
    id: "plans",
    title: "Plans and payments",
    body: (
      <ul>
        <li>The Free plan includes a monthly number of crew requests. Paid plans add more requests and family features.</li>
        <li>Prices shown today are test prices and may change before launch. We'll show the price before you pay.</li>
        <li>Payments go through Stripe. A Family plan renews monthly until you cancel; a Season pass doesn't renew.</li>
        <li>Paying for a plan never unlocks anyone else's private data.</li>
      </ul>
    ),
  },
  {
    id: "acceptable",
    title: "Acceptable use",
    body: (
      <ul>
        <li>Don't scrape the site, overload it, or get around rate limits.</li>
        <li>Don't use someone else's account, helper link, or invite.</li>
        <li>Don't post other people's private information, or anything illegal, hateful, or harassing.</li>
        <li>Don't use ScholarCrew to send spam or to run scholarship scams.</li>
      </ul>
    ),
  },
  {
    id: "sharing",
    title: "Family and helper links",
    body: (
      <p>
        Students control what family members and helpers see. Invites and helper links are for the person they were
        sent to. Students can remove a parent or turn off a helper link at any time.
      </p>
    ),
  },
  {
    id: "ending",
    title: "Ending your account",
    body: (
      <p>
        You can delete your account at any time from Settings. We may suspend an account that breaks these terms or
        puts other users at risk, and we'll tell you why when we can.
      </p>
    ),
  },
  {
    id: "limits",
    title: "Disclaimers and limits",
    body: (
      <p>
        We work hard to keep ScholarCrew accurate and available, but we provide it as is. To the extent the law allows,
        we aren't responsible for missed deadlines, award decisions, or costs that differ from our estimates.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <p>
        We'll post changes here and email you before changes that matter. Questions: help@scholarcrew.example.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="October 6, 2026"
      intro="The short version: be 13 or older, write your own work, check details with each sponsor, and don't misuse the site."
      sections={SECTIONS}
    />
  );
}
```

`apps/web/src/app/(public)/ai-policy/page.tsx`:

```tsx
import { LegalPage, type LegalSection } from "@/components/public/LegalPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI use policy · ScholarCrew",
  description: "How ScholarCrew uses AI: a coach, not a ghostwriter. Which model we use, what it sees, and where people review.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "coach",
    title: "A coach, not a ghostwriter",
    body: (
      <p>
        The crew is a coach, not a ghostwriter. Quill asks questions about your essay and comments on structure,
        clarity, and fit with the prompt, but it never writes or rewrites your essay. A check runs on every crew reply
        and blocks long passages that would read as ghostwriting.
      </p>
    ),
  },
  {
    id: "crew",
    title: "What the crew does",
    body: (
      <p>
        Compass, the coordinator, reads your request and asks the specialists it needs: Scout for scholarships, Atlas
        for admissions, Quill for essays, Aid for financial aid, Ledger for money, Prep for tests, and Impact for
        service hours. Each specialist has a narrow job and only the data that job needs. Nothing changes in your
        account until you click a button to apply a suggestion.
      </p>
    ),
  },
  {
    id: "models",
    title: "The models we use",
    body: (
      <>
        <p>
          The crew runs on Anthropic's Claude model, claude-opus-5-5, through Anthropic's API. We turn on Anthropic's
          server-side fallback: if that model is busy or unavailable, Anthropic may answer with another Claude model,
          and we record which model answered each request.
        </p>
        <p>We don't use your information to train AI models.</p>
      </>
    ),
  },
  {
    id: "sees",
    title: "What the AI sees, and what it never sees",
    body: (
      <ul>
        <li>Only what's needed for your request: the relevant parts of your profile, plan, and work.</li>
        <li>Sensitive facts are never sent to an AI model. Only the matcher, which is plain code, reads them.</li>
        <li>Another student's or another family's information is never included.</li>
        <li>Temporary chats load no memory and save nothing, and they're deleted after 24 hours.</li>
        <li>Web pages, PDFs, and documents are passed to the model as data to read, never as instructions to follow.</li>
      </ul>
    ),
  },
  {
    id: "math",
    title: "Money math is code",
    body: (
      <p>
        Gaps, offer comparisons, loan payments, word counts, and deadlines are calculated by code, not by the model. The
        public offer tool uses no AI at all.
      </p>
    ),
  },
  {
    id: "checks",
    title: "Checks on every reply",
    body: (
      <ul>
        <li>Integrity: blocks ghostwritten essay text.</li>
        <li>Sources: facts like deadlines and amounts must point to a source with a date.</li>
        <li>Privacy: family-room replies can't include what the student hasn't shared.</li>
        <li>Safety: if a message suggests someone may be in danger, the crew stops and shares crisis resources.</li>
      </ul>
    ),
  },
  {
    id: "unavailable",
    title: "When the AI is unavailable or says no",
    body: (
      <p>
        If the model can't answer, the request shows as failed and you can try again. Your plan, deadlines, the
        directory, and every calculation keep working without it. If the model declines a request, we show that
        plainly instead of guessing.
      </p>
    ),
  },
  {
    id: "catalog",
    title: "Human review of the scholarship catalog",
    body: (
      <ul>
        <li>An AI research step finds candidate scholarships and drafts each listing with a quote from the source page.</li>
        <li>Code checks every draft: quotes must appear on the page, deadlines can't be past, amounts must be sane, and scam signals are flagged.</li>
        <li>A person reviews every draft. Only an admin can publish, and publishing records who checked it and when.</li>
        <li>Published listings are re-checked against their sources, and changed ones are marked stale until a person looks again.</li>
      </ul>
    ),
  },
  {
    id: "limits",
    title: "AI can be wrong",
    body: (
      <p>
        Treat crew replies as a starting point. Check important details with the sponsor, college, or financial aid
        office, and report any listing that looks wrong.
      </p>
    ),
  },
];

export default function AiPolicyPage() {
  return (
    <LegalPage
      title="AI use policy"
      updated="October 6, 2026"
      intro="The short version: the crew coaches and never writes your essays, sensitive facts never reach a model, money math is code, and a person reviews every scholarship before it's published."
      sections={SECTIONS}
    />
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/public && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 4 files, 14 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(public)/privacy" "apps/web/src/app/(public)/terms" "apps/web/src/app/(public)/ai-policy" apps/web/src/components/public/LegalPage.tsx apps/web/src/components/public/legal.module.css apps/web/src/components/public/legal.test.tsx
git commit -m "feat(web): privacy, terms, and AI use policy drafts"
```

### R4: Directory helpers, listing rows, and filters (PU-02)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/public/listings.test.ts`:

```ts
import { EligibilityRule, type ScholarshipSummary, localLabel } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import {
  amountLabel,
  daysFrom,
  deadlineLabel,
  describeRule,
  filterHref,
  listingCheck,
  readFilters,
  toQuery,
  todayIso,
} from "./listings";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const checked = (o: Partial<Pick<ScholarshipSummary, "status" | "verifiedAt" | "unverified">>) =>
  listingCheck({ status: "published", verifiedAt: "2026-10-02T12:00:00.000Z", unverified: false, ...o }, NOW);

describe("dates", () => {
  it("uses the Central calendar day", () => {
    expect(todayIso(NOW)).toBe("2026-10-06");
    expect(todayIso(new Date("2026-10-07T03:00:00.000Z"))).toBe("2026-10-06");
    expect(daysFrom("2026-10-06", "2026-10-15")).toBe(9);
    expect(daysFrom("2026-10-06", "2026-10-01")).toBe(-5);
  });
});

describe("listingCheck", () => {
  it("labels verified, stale, and unverified listings", () => {
    expect(checked({})).toEqual({ tone: "good", icon: "check", label: "Verified Oct 2", detail: null });
    expect(checked({ verifiedAt: "2026-08-01T12:00:00.000Z" })).toEqual({
      tone: "warn",
      icon: "clock",
      label: "Stale",
      detail: "Last checked Aug 1",
    });
    expect(checked({ status: "stale" }).label).toBe("Stale");
    expect(checked({ unverified: true }).label).toBe("Unverified");
    expect(checked({ verifiedAt: null })).toMatchObject({ tone: "neutral", icon: "info", label: "Unverified" });
  });
});

describe("amount, deadline, and area labels", () => {
  it("formats amounts", () => {
    expect(amountLabel({ amountMinUsd: 1000, amountMaxUsd: 1000 })).toBe("$1,000");
    expect(amountLabel({ amountMinUsd: 500, amountMaxUsd: 2500 })).toBe("$500–$2,500");
    expect(amountLabel({ amountMinUsd: 0, amountMaxUsd: 1500 })).toBe("$1,500");
  });

  it("formats deadlines with days left", () => {
    expect(deadlineLabel(null, NOW)).toEqual({ main: "Not posted", sub: "Check the sponsor's page" });
    expect(deadlineLabel("2026-10-15", NOW)).toEqual({ main: "Oct 15", sub: "9 days left" });
    expect(deadlineLabel("2026-10-07", NOW)).toEqual({ main: "Oct 7", sub: "1 day left" });
    expect(deadlineLabel("2026-10-06", NOW)).toEqual({ main: "Oct 6", sub: "Due today" });
    expect(deadlineLabel("2026-09-01", NOW)).toEqual({ main: "Sep 1", sub: "Closed" });
  });

  it("names the area with the domain's localLabel (D41)", () => {
    expect(localLabel({ national: true, state: null, counties: [], cities: [] })).toBe("National");
    expect(localLabel({ national: false, state: "TX", counties: [], cities: [] })).toBe("Texas");
    expect(localLabel({ national: false, state: "TX", counties: ["Maple County"], cities: [] })).toBe("Maple County, TX");
    expect(localLabel({ national: false, state: "TX", counties: [], cities: ["Cedar Park"] })).toBe("Cedar Park, TX");
  });
});

describe("describeRule", () => {
  it("describes every rule type in plain words", () => {
    const rules: EligibilityRule[] = [
      { type: "state_in", states: ["TX", "OK"] },
      { type: "county_in", state: "TX", counties: ["Maple"] },
      { type: "city_in", state: "TX", cities: ["Cedar Park"] },
      { type: "class_year_in", years: [2027, 2028] },
      { type: "gpa_min", min: 3 },
      { type: "major_any", majors: ["Engineering", "Nursing"] },
      { type: "interest_any", interests: ["robotics"] },
      { type: "first_gen" },
      { type: "income_max", maxRange: "48_75k" },
      { type: "heritage_any", values: ["Hispanic or Latino"] },
      { type: "disability" },
      { type: "religion_any", values: ["Catholic"] },
      { type: "military_family" },
      { type: "foster_care" },
      { type: "citizenship_required" },
      { type: "test_min", test: "SAT", min: 1200 },
      { type: "service_hours_min", hours: 40 },
      { type: "custom", text: "Child of a co-op member" },
    ];
    for (const rule of rules) {
      expect(EligibilityRule.safeParse(rule).success).toBe(true);
      expect(describeRule(rule).length).toBeGreaterThan(3);
    }
    expect(rules.map(describeRule).slice(0, 6)).toEqual([
      "Lives in Texas or Oklahoma",
      "Lives in Maple County, TX",
      "Lives in Cedar Park, TX",
      "Class of 2027 or 2028",
      "GPA 3 or higher",
      "Plans to study Engineering or Nursing",
    ]);
    expect(describeRule({ type: "income_max", maxRange: "48_75k" })).toBe("Household income up to $75,000");
    expect(describeRule({ type: "test_min", test: "SAT", min: 1200 })).toBe("SAT 1200 or higher");
    expect(describeRule({ type: "custom", text: "Child of a co-op member" })).toBe("Child of a co-op member");
  });
});

describe("filters", () => {
  it("reads search params into a ScholarshipQuery", () => {
    const f = readFilters({ q: " maple ", minUsd: "1000", within: "90", renewable: "true", page: "2" });
    expect(f).toEqual({ q: "maple", minUsd: 1000, within: 90, renewable: true, page: 2 });
    expect(toQuery(f, NOW, "TX")).toEqual({
      page: 2,
      pageSize: 20,
      openOn: "2026-10-06",
      q: "maple",
      state: "TX",
      minUsd: 1000,
      renewable: true,
      deadlineBefore: "2027-01-04",
    });
  });

  it("ignores values that aren't offered and always asks for listings still open today (F-18-3)", () => {
    const f = readFilters({ minUsd: "7", within: ["5"], page: "-1", renewable: "yes" });
    expect(f).toEqual({ q: "", minUsd: null, within: null, renewable: false, page: 1 });
    expect(toQuery(f, NOW)).toEqual({ page: 1, pageSize: 20, openOn: "2026-10-06" });
    expect(toQuery(f, new Date("2026-10-07T03:00:00.000Z")).openOn).toBe("2026-10-06");
  });

  it("builds filter links that reset the page", () => {
    const f = readFilters({ q: "maple", within: "90", page: "3" });
    expect(filterHref("/directory/TX", f, { minUsd: 5000 })).toBe("/directory/TX?q=maple&minUsd=5000&within=90");
    expect(filterHref("/directory/TX", f, { page: 4 })).toBe("/directory/TX?q=maple&within=90&page=4");
    expect(filterHref("/directory", readFilters({}), {})).toBe("/directory");
  });
});
```

`apps/web/src/components/public/ListingRow.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { ScholarshipSummary } from "@scholarcrew/domain";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FiltersCard } from "./DirectoryFilters";
import { ListingRow, ResultsCard } from "./ListingRow";
import { readFilters } from "./listings";

afterEach(cleanup);

const NOW = new Date("2026-10-06T15:00:00.000Z");
const listing = (o: Partial<ScholarshipSummary> = {}): ScholarshipSummary => ({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "maple-stem",
  name: "Maple STEM Award",
  provider: "Maple Rotary",
  amountMinUsd: 1000,
  amountMaxUsd: 1000,
  renewable: false,
  deadline: "2026-10-15",
  localLabel: "Maple County, TX",
  status: "published",
  verifiedAt: "2026-10-02T12:00:00.000Z",
  scamFlags: [],
  unverified: false,
  estMinutes: 60,
  ...o,
});

describe("ListingRow", () => {
  it("shows amount, sponsor, area, deadline, and the verified date", () => {
    render(
      <ul>
        <ListingRow s={listing()} now={NOW} />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "Maple STEM Award" }).getAttribute("href")).toBe("/directory/s/maple-stem");
    expect(screen.getByText("$1,000")).toBeTruthy();
    expect(screen.getByText("One-time")).toBeTruthy();
    expect(screen.getByText("Maple Rotary · Maple County, TX")).toBeTruthy();
    expect(screen.getByText("Oct 15")).toBeTruthy();
    expect(screen.getByText("9 days left")).toBeTruthy();
    expect(screen.getByText("Verified Oct 2")).toBeTruthy();
  });

  it("labels stale and unverified listings", () => {
    render(
      <ul>
        <ListingRow s={listing({ slug: "a", verifiedAt: "2026-08-01T12:00:00.000Z", renewable: true })} now={NOW} />
        <ListingRow s={listing({ slug: "b", unverified: true, verifiedAt: null, deadline: null })} now={NOW} />
      </ul>,
    );
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.getByText("Last checked Aug 1")).toBeTruthy();
    expect(screen.getByText("Renewable")).toBeTruthy();
    expect(screen.getByText("Unverified")).toBeTruthy();
    expect(screen.getByText("Not posted")).toBeTruthy();
  });
});

describe("FiltersCard", () => {
  it("links each chip to the filtered page and marks the active one", () => {
    render(<FiltersCard base="/directory/TX" filters={readFilters({ q: "maple", minUsd: "1000" })} />);
    const five = screen.getByRole("link", { name: "$5,000+" });
    expect(five.getAttribute("href")).toBe("/directory/TX?q=maple&minUsd=5000");
    expect(screen.getByRole("link", { name: "$1,000+" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "Any amount" }).getAttribute("href")).toBe("/directory/TX?q=maple");
    expect(screen.getByRole("link", { name: "Next 90 days" }).getAttribute("href")).toBe(
      "/directory/TX?q=maple&minUsd=1000&within=90",
    );
    expect(screen.getByRole("link", { name: "Clear" }).getAttribute("href")).toBe("/directory/TX");
    const search = screen.getByRole("searchbox", { name: "Search by name or sponsor" }) as HTMLInputElement;
    expect(search.defaultValue).toBe("maple");
    expect(screen.getByText("Listings that charge a fee or look like scams never appear here.")).toBeTruthy();
  });
});

describe("ResultsCard", () => {
  it("shows an empty state and pages through results", () => {
    const { rerender } = render(
      <ResultsCard items={[]} page={1} pageSize={20} total={0} base="/directory" filters={readFilters({})} now={NOW} />,
    );
    expect(screen.getByText("No listings match these filters yet.")).toBeTruthy();
    rerender(
      <ResultsCard
        items={[listing()]}
        page={2}
        pageSize={20}
        total={45}
        base="/directory"
        filters={readFilters({ page: "2" })}
        now={NOW}
      />,
    );
    const pager = screen.getByRole("navigation", { name: "Pages" });
    expect(within(pager).getByText("Page 2 of 3")).toBeTruthy();
    expect(within(pager).getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/directory");
    expect(within(pager).getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/directory?page=3");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/components/public/listings src/components/public/ListingRow`
Expected: FAIL with `Failed to resolve import "./listings"` and `Failed to resolve import "./DirectoryFilters"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/public/listings.ts`:

```ts
import { addDaysIso, dateShort, daysLabel, instantShort, usd } from "@/lib/format";
import {
  type EligibilityRule,
  type IncomeRange,
  type IsoDate,
  STATE_NAMES,
  type ScholarshipQuery,
  type ScholarshipSummary,
  type USState,
} from "@scholarcrew/domain";
import type { IconName } from "@scholarcrew/ui";
import { type SearchParams, firstParam } from "./params";

/** The directory shows dates on the Central calendar, the launch market's time zone. */
export const DIRECTORY_TZ = "America/Chicago";
export const STALE_DAYS = 30;
export const PAGE_SIZE = 20;
export const MIN_AMOUNTS = [500, 1000, 5000];
export const WITHIN_DAYS = [30, 90];

export function todayIso(now: Date, timeZone = DIRECTORY_TZ): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function daysFrom(today: IsoDate, due: IsoDate): number {
  return Math.round((Date.parse(`${due}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000);
}

export type ListingCheck = { tone: "good" | "warn" | "neutral"; icon: IconName; label: string; detail: string | null };

/** Verified (checked in the last 30 days), Stale (re-check pending or older), or Unverified. */
export function listingCheck(s: Pick<ScholarshipSummary, "status" | "verifiedAt" | "unverified">, now: Date): ListingCheck {
  if (s.unverified || !s.verifiedAt) {
    return { tone: "neutral", icon: "info", label: "Unverified", detail: "Not confirmed against its source yet" };
  }
  const when = instantShort(s.verifiedAt, DIRECTORY_TZ);
  const ageDays = (now.getTime() - Date.parse(s.verifiedAt)) / 86_400_000;
  if (s.status === "stale" || ageDays > STALE_DAYS) {
    return { tone: "warn", icon: "clock", label: "Stale", detail: `Last checked ${when}` };
  }
  return { tone: "good", icon: "check", label: `Verified ${when}`, detail: null };
}

export function amountLabel(s: Pick<ScholarshipSummary, "amountMinUsd" | "amountMaxUsd">): string {
  if (s.amountMinUsd > 0 && s.amountMinUsd < s.amountMaxUsd) return `${usd(s.amountMinUsd)}–${usd(s.amountMaxUsd)}`;
  return usd(s.amountMaxUsd);
}

export function deadlineLabel(deadline: IsoDate | null, now: Date): { main: string; sub: string } {
  if (!deadline) return { main: "Not posted", sub: "Check the sponsor's page" };
  const days = daysFrom(todayIso(now), deadline);
  if (days < 0) return { main: dateShort(deadline), sub: "Closed" };
  return { main: dateShort(deadline), sub: days === 0 ? "Due today" : `${daysLabel(days)} left` };
}

const INCOME_MAX_TEXT: Record<IncomeRange, string> = {
  under_30k: "Household income under $30,000",
  "30_48k": "Household income up to $48,000",
  "48_75k": "Household income up to $75,000",
  "75_110k": "Household income up to $110,000",
  over_110k: "Household income of any amount",
};

const or = (items: Array<string | number>) => items.join(" or ");

/** One line per eligibility rule, for the public detail page and the admin review. */
export function describeRule(rule: EligibilityRule): string {
  switch (rule.type) {
    case "state_in":
      return `Lives in ${or(rule.states.map((s) => STATE_NAMES[s]))}`;
    case "county_in": {
      const names = rule.counties.map((c) => c.replace(/\s+county$/i, ""));
      return `Lives in ${names.join(", ")} ${names.length === 1 ? "County" : "counties"}, ${rule.state}`;
    }
    case "city_in":
      return `Lives in ${or(rule.cities)}, ${rule.state}`;
    case "class_year_in":
      return `Class of ${or(rule.years)}`;
    case "gpa_min":
      return `GPA ${rule.min} or higher`;
    case "major_any":
      return `Plans to study ${or(rule.majors)}`;
    case "interest_any":
      return `Interested in ${or(rule.interests)}`;
    case "first_gen":
      return "First in their family to go to college";
    case "income_max":
      return INCOME_MAX_TEXT[rule.maxRange];
    case "heritage_any":
      return `Heritage: ${or(rule.values)}`;
    case "disability":
      return "Students with a disability";
    case "religion_any":
      return `Faith: ${or(rule.values)}`;
    case "military_family":
      return "From a military family";
    case "foster_care":
      return "Has been in foster care";
    case "citizenship_required":
      return "U.S. citizenship required";
    case "test_min":
      return `${rule.test} ${rule.min} or higher`;
    case "service_hours_min":
      return `${rule.hours}+ service hours`;
    case "custom":
      return rule.text;
  }
}

export interface DirectoryFilters {
  q: string;
  minUsd: number | null;
  within: number | null;
  renewable: boolean;
  page: number;
}

export function readFilters(sp: SearchParams): DirectoryFilters {
  const min = Number(firstParam(sp, "minUsd"));
  const within = Number(firstParam(sp, "within"));
  const page = Number(firstParam(sp, "page"));
  return {
    q: (firstParam(sp, "q") ?? "").trim().slice(0, 100),
    minUsd: MIN_AMOUNTS.includes(min) ? min : null,
    within: WITHIN_DAYS.includes(within) ? within : null,
    renewable: firstParam(sp, "renewable") === "true",
    page: Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1,
  };
}

/** Public directory query. `openOn` is always today (Central), so closed listings never show (F-18-3). */
export function toQuery(f: DirectoryFilters, now: Date, state?: USState): ScholarshipQuery {
  const today = todayIso(now);
  const q: ScholarshipQuery = { page: f.page, pageSize: PAGE_SIZE, openOn: today };
  if (f.q) q.q = f.q;
  if (state) q.state = state;
  if (f.minUsd !== null) q.minUsd = f.minUsd;
  if (f.renewable) q.renewable = true;
  if (f.within !== null) q.deadlineBefore = addDaysIso(today, f.within);
  return q;
}

export function hasFilters(f: DirectoryFilters): boolean {
  return f.q !== "" || f.minUsd !== null || f.within !== null || f.renewable;
}

/** A link to the same page with one filter changed. Changing a filter goes back to page 1. */
export function filterHref(base: string, f: DirectoryFilters, patch: Partial<DirectoryFilters>): string {
  const next: DirectoryFilters = { ...f, page: 1, ...patch };
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  if (next.minUsd !== null) p.set("minUsd", String(next.minUsd));
  if (next.within !== null) p.set("within", String(next.within));
  if (next.renewable) p.set("renewable", "true");
  if (next.page > 1) p.set("page", String(next.page));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
```

`apps/web/src/components/public/ListingRow.tsx`:

```tsx
import type { ScholarshipSummary } from "@scholarcrew/domain";
import { Badge, Button, Card, EmptyState, Eyebrow } from "@scholarcrew/ui";
import styles from "./directory.module.css";
import { type DirectoryFilters, amountLabel, deadlineLabel, filterHref, listingCheck } from "./listings";

export function ListingRow({ s, now }: { s: ScholarshipSummary; now: Date }) {
  const check = listingCheck(s, now);
  const due = deadlineLabel(s.deadline, now);
  return (
    <li className={styles.row}>
      <div className={styles.amt}>
        {amountLabel(s)}
        <span>{s.renewable ? "Renewable" : "One-time"}</span>
      </div>
      <div>
        <a className={styles.name} href={`/directory/s/${encodeURIComponent(s.slug)}`}>
          {s.name}
        </a>
        <div className={styles.meta}>{`${s.provider} · ${s.localLabel}`}</div>
      </div>
      <div className={styles.due}>
        {due.main}
        <span>{due.sub}</span>
      </div>
      <div className={styles.check}>
        <Badge tone={check.tone} icon={check.icon}>
          {check.label}
        </Badge>
        {check.detail ? <span className={styles.detail}>{check.detail}</span> : null}
      </div>
    </li>
  );
}

export function ResultsCard({
  items,
  page,
  pageSize,
  total,
  base,
  filters,
  now,
}: {
  items: ScholarshipSummary[];
  page: number;
  pageSize: number;
  total: number;
  base: string;
  filters: DirectoryFilters;
  now: Date;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className={styles.results}>
      <div className={styles.resHead}>
        <span>Sorted by deadline, soonest first</span>
      </div>
      {items.length === 0 ? (
        <EmptyState title="No listings match these filters yet." icon="search">
          Try fewer filters, or check back after the next catalog update.
        </EmptyState>
      ) : (
        <ul className={styles.list}>
          {items.map((s) => (
            <ListingRow key={s.id} s={s} now={now} />
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav className={styles.pager} aria-label="Pages">
          <span>{`Page ${page} of ${pages}`}</span>
          <span className={styles.pagerLinks}>
            {page > 1 ? (
              <Button variant="line" size="sm" href={filterHref(base, filters, { page: page - 1 })}>
                Previous
              </Button>
            ) : null}
            {page < pages ? (
              <Button variant="line" size="sm" href={filterHref(base, filters, { page: page + 1 })}>
                Next
              </Button>
            ) : null}
          </span>
        </nav>
      ) : null}
    </div>
  );
}

export function SignupCard() {
  return (
    <div className={styles.signup}>
      <Eyebrow>Free account</Eyebrow>
      <h3>See which of these you actually qualify for</h3>
      <p>
        Scout checks each rule against your profile and tells you why you match, like "you live in Maple County." Then
        Compass fits the best ones into your week.
      </p>
      <Button variant="white" iconEnd="arrow" href="/sign-in">
        Start free
      </Button>
      <p className={styles.signupFine}>No credit card · ages 13 and up · we never sell your data</p>
    </div>
  );
}

export function LabelLegend() {
  return (
    <Card title="What the labels mean">
      <ul className={styles.legend}>
        <li>
          <Badge tone="good" icon="check">
            Verified
          </Badge>
          <span>Matches its source, checked in the last 30 days</span>
        </li>
        <li>
          <Badge tone="warn" icon="clock">
            Stale
          </Badge>
          <span>Changed, or checked more than 30 days ago</span>
        </li>
        <li>
          <Badge tone="neutral" icon="info">
            Unverified
          </Badge>
          <span>Not confirmed yet</span>
        </li>
      </ul>
      <p className={styles.fine}>
        See a mistake? <a href="/sign-in">Sign in</a> to report a listing or suggest a local scholarship.
      </p>
    </Card>
  );
}
```

`apps/web/src/components/public/DirectoryFilters.tsx`:

```tsx
import { cx } from "@/lib/cx";
import { usd } from "@/lib/format";
import { Button, Card } from "@scholarcrew/ui";
import type { ReactNode } from "react";
import styles from "./directory.module.css";
import { type DirectoryFilters, MIN_AMOUNTS, WITHIN_DAYS, filterHref, hasFilters } from "./listings";

function ChipLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <a href={href} className={cx(styles.chip, active && styles.chipOn)} aria-current={active ? "true" : undefined}>
      {children}
    </a>
  );
}

export function FiltersCard({ base, filters: f }: { base: string; filters: DirectoryFilters }) {
  return (
    <Card title="Filters" aside={hasFilters(f) ? <a href={base}>Clear</a> : null}>
      <form method="get" action={base} role="search" className={styles.search}>
        <label htmlFor="directory-q" className={styles.srOnly}>
          Search by name or sponsor
        </label>
        <input id="directory-q" name="q" type="search" defaultValue={f.q} placeholder="Search by name or sponsor" />
        {f.minUsd !== null ? <input type="hidden" name="minUsd" value={String(f.minUsd)} /> : null}
        {f.within !== null ? <input type="hidden" name="within" value={String(f.within)} /> : null}
        {f.renewable ? <input type="hidden" name="renewable" value="true" /> : null}
        <Button type="submit" variant="soft" size="sm">
          Search
        </Button>
      </form>
      <div className={styles.group}>
        <h4>Deadline</h4>
        <div className={styles.chips}>
          <ChipLink href={filterHref(base, f, { within: null })} active={f.within === null}>
            Any time
          </ChipLink>
          {WITHIN_DAYS.map((d) => (
            <ChipLink key={d} href={filterHref(base, f, { within: d })} active={f.within === d}>
              {`Next ${d} days`}
            </ChipLink>
          ))}
        </div>
      </div>
      <div className={styles.group}>
        <h4>Amount</h4>
        <div className={styles.chips}>
          <ChipLink href={filterHref(base, f, { minUsd: null })} active={f.minUsd === null}>
            Any amount
          </ChipLink>
          {MIN_AMOUNTS.map((n) => (
            <ChipLink key={n} href={filterHref(base, f, { minUsd: n })} active={f.minUsd === n}>
              {`${usd(n)}+`}
            </ChipLink>
          ))}
        </div>
      </div>
      <div className={styles.group}>
        <h4>Type</h4>
        <div className={styles.chips}>
          <ChipLink href={filterHref(base, f, { renewable: !f.renewable })} active={f.renewable}>
            Renewable only
          </ChipLink>
        </div>
      </div>
      <p className={styles.fine}>Listings that charge a fee or look like scams never appear here.</p>
    </Card>
  );
}
```

`apps/web/src/components/public/directory.module.css`:

```css
.dir {
  padding: 22px 48px 40px;
}

.crumbs {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12.5px;
  color: var(--muted);
}

.crumbs b {
  font-weight: 600;
  color: var(--ink-2);
}

.head {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 16px;
}

.sub {
  margin-top: 4px;
  font-size: 13.5px;
  color: var(--muted);
}

.grid {
  display: grid;
  grid-template-columns: 260px 1fr 300px;
  gap: 20px;
  align-items: start;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.search input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--card);
  font-size: 13px;
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.group {
  padding: 10px 0;
  border-top: 1px solid var(--line-2);
}

.group h4 {
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--muted);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-2);
}

.chipOn {
  border-color: var(--navy);
  background: var(--navy-soft);
  color: var(--navy);
}

.fine {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}

.results {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--card);
}

.resHead,
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  font-size: 12.5px;
  color: var(--muted);
}

.resHead {
  border-bottom: 1px solid var(--line);
}

.pager {
  border-top: 1px solid var(--line);
}

.pagerLinks {
  display: flex;
  gap: 8px;
}

.list {
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 110px 1fr 110px 150px;
  gap: 14px;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--line-2);
}

.row:first-child {
  border-top: 0;
}

.amt {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.amt span,
.due span {
  display: block;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--muted);
}

.name {
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
}

.meta {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--muted);
}

.due {
  font-size: 13.5px;
  font-weight: 650;
}

.check {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: flex-start;
}

.detail {
  font-size: 11.5px;
  color: var(--muted);
}

.signup {
  padding: 18px 20px;
  border-radius: var(--r);
  background: var(--navy);
  color: #fff;
}

.signup h3 {
  margin: 6px 0 8px;
  font-size: 16px;
}

.signup p {
  margin-bottom: 12px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--navy-line);
}

.signupFine {
  margin-top: 10px;
  font-size: 11.5px;
}

.legend {
  display: grid;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-2);
}

.legend li {
  display: flex;
  gap: 8px;
  align-items: center;
}

.states {
  margin-bottom: 20px;
}

.states h2 {
  margin-bottom: 10px;
  font-size: 18px;
}

.states ul {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px 16px;
  font-size: 13.5px;
}

.detailGrid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 20px;
  align-items: start;
}

.facts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin-bottom: 16px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--card);
}

.facts > div {
  padding: 12px 18px;
  border-left: 1px solid var(--line-2);
}

.facts > div:first-child {
  border-left: 0;
}

.factK {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--muted);
}

.factV {
  margin-top: 3px;
  font-size: 19px;
  font-weight: 700;
}

.factS {
  font-size: 12px;
  color: var(--muted);
}

.bullets {
  display: grid;
  gap: 8px;
  font-size: 13.5px;
}

.bullets li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.bullets svg {
  flex: none;
  width: 15px;
  height: 15px;
  margin-top: 2px;
  color: var(--good);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

@media (max-width: 1100px) {
  .grid,
  .detailGrid {
    grid-template-columns: 1fr;
  }

  .facts {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .dir {
    padding: 18px 16px 32px;
  }

  .row {
    grid-template-columns: 1fr 1fr;
  }
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/components/public && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 6 files, 27 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/public/listings.ts apps/web/src/components/public/listings.test.ts apps/web/src/components/public/ListingRow.tsx apps/web/src/components/public/ListingRow.test.tsx apps/web/src/components/public/DirectoryFilters.tsx apps/web/src/components/public/directory.module.css
git commit -m "feat(web): directory labels, filters, listing rows, and pager"
```

### R5: Directory pages by state and by listing (PU-02)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/public/directoryPages.test.tsx` (node environment; real core services over the test database):

```tsx
import { factories } from "@scholarcrew/db/testing";
import { useTestDeps } from "@test/helpers";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import StatePage, { generateMetadata as stateMeta } from "../../app/(public)/directory/[state]/page";
import DirectoryPage from "../../app/(public)/directory/page";
import ListingPage, { generateMetadata as listingMeta } from "../../app/(public)/directory/s/[slug]/page";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const deps = useTestDeps();
const TX = { national: false, state: "TX" as const, counties: [] as string[], cities: [] as string[] };
const MAPLE = { ...TX, counties: ["Maple"] };
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);

describe("/directory", () => {
  it("links every state and lists national listings", async () => {
    await factories.scholarship(deps().db, { slug: "alpha-national", name: "Alpha National Award" });
    const html = renderToStaticMarkup(await DirectoryPage({ searchParams: sp() }));
    expect(html).toContain('href="/directory/TX"');
    expect(html).toContain("Texas");
    expect(html).toContain("Puerto Rico");
    expect(html).toContain("Alpha National Award");
  });

  it("skips listings whose deadline has passed, on the page and in the Next 30 days chip (F-18-3)", async () => {
    const db = deps().db;
    await factories.scholarship(db, { slug: "closed-award", name: "Closed Award", deadline: "2026-09-01" });
    await factories.scholarship(db, { slug: "today-award", name: "Due Today Award", deadline: "2026-10-06" });
    await factories.scholarship(db, { slug: "open-award", name: "Open Award", deadline: "2026-10-20" });
    await factories.scholarship(db, { slug: "later-award", name: "Later Award", deadline: "2027-03-01" });
    const html = renderToStaticMarkup(await DirectoryPage({ searchParams: sp() }));
    expect(html).not.toContain("Closed Award");
    expect(html).toContain("Due Today Award");
    expect(html.indexOf("Due Today Award")).toBeLessThan(html.indexOf("Open Award"));
    const soon = renderToStaticMarkup(await DirectoryPage({ searchParams: sp({ within: "30" }) }));
    expect(soon).not.toContain("Closed Award");
    expect(soon).toContain("Open Award");
    expect(soon).not.toContain("Later Award");
  });
});

describe("/directory/[state]", () => {
  it("shows verified and stale listings, hides scam-flagged and other states, and filters by search", async () => {
    const db = deps().db;
    await factories.scholarship(db, {
      slug: "maple-stem",
      name: "Maple STEM Award",
      deadline: "2026-10-15",
      verifiedAt: new Date("2026-10-02T12:00:00.000Z"),
      localArea: MAPLE,
    });
    await factories.scholarship(db, {
      slug: "old-check",
      name: "Old Check Award",
      verifiedAt: new Date("2026-08-01T12:00:00.000Z"),
      localArea: TX,
    });
    await factories.scholarship(db, { slug: "fee-award", name: "Fee Award", scamFlags: ["application_fee"], localArea: TX });
    await factories.scholarship(db, { slug: "ohio-award", name: "Ohio Award", localArea: { ...TX, state: "OH" } });
    await factories.scholarship(db, { slug: "tx-closed", name: "Closed Texas Award", deadline: "2026-09-01", localArea: TX });

    const html = renderToStaticMarkup(await StatePage({ params: Promise.resolve({ state: "tx" }), searchParams: sp() }));
    expect(html).toContain("Texas scholarships");
    expect(html).toContain("2 listings");
    expect(html).toContain("Maple STEM Award");
    expect(html).toContain("Verified Oct 2");
    expect(html).toContain("9 days left");
    expect(html).toContain("Old Check Award");
    expect(html).toContain("Stale");
    expect(html).not.toContain("Fee Award");
    expect(html).not.toContain("Ohio Award");
    expect(html).not.toContain("Closed Texas Award");

    const filtered = renderToStaticMarkup(
      await StatePage({ params: Promise.resolve({ state: "TX" }), searchParams: sp({ q: "maple" }) }),
    );
    expect(filtered).toContain("Maple STEM Award");
    expect(filtered).not.toContain("Old Check Award");
    expect(filtered).toContain("1 of 2 match your filters");

    await expect(StatePage({ params: Promise.resolve({ state: "zz" }), searchParams: sp() })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    const meta = await stateMeta({ params: Promise.resolve({ state: "TX" }), searchParams: sp() });
    expect(meta.title).toBe("Texas scholarships · ScholarCrew");
  });
});

describe("/directory/s/[slug]", () => {
  it("renders a published listing with its rules and requirements, and 404s drafts and scam-flagged listings", async () => {
    const db = deps().db;
    await factories.scholarship(db, {
      slug: "maple-stem",
      name: "Maple STEM Award",
      provider: "Maple Rotary",
      amountMinUsd: 1000,
      amountMaxUsd: 2500,
      verifiedAt: new Date("2026-10-02T12:00:00.000Z"),
      localArea: MAPLE,
      eligibility: [
        { type: "gpa_min", min: 3 },
        { type: "major_any", majors: ["Engineering"] },
      ],
      requirements: { essays: [{ prompt: "Why STEM?", wordLimit: 500 }], recommendations: 1, transcript: true, serviceHours: null, other: [] },
    });
    await factories.scholarship(db, { slug: "draft-award", status: "draft" });
    await factories.scholarship(db, { slug: "fee-award", scamFlags: ["application_fee"] });

    const html = renderToStaticMarkup(await ListingPage({ params: Promise.resolve({ slug: "maple-stem" }) }));
    for (const text of [
      "Maple STEM Award",
      "From Maple Rotary",
      "$1,000–$2,500",
      "Maple County, TX",
      "Verified Oct 2",
      "GPA 3 or higher",
      "Plans to study Engineering",
      "Essay (500 words): Why STEM?",
      "1 recommendation letter",
      "Transcript",
      'href="https://example.org/scholarships/maple-stem"',
    ]) {
      expect(html).toContain(text);
    }
    for (const slug of ["draft-award", "fee-award", "no-such-listing"]) {
      await expect(ListingPage({ params: Promise.resolve({ slug }) })).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect((await listingMeta({ params: Promise.resolve({ slug: "maple-stem" }) })).title).toBe(
      "Maple STEM Award · $1,000–$2,500 · ScholarCrew",
    );
    expect((await listingMeta({ params: Promise.resolve({ slug: "draft-award" }) })).title).toBe(
      "Scholarship not found · ScholarCrew",
    );
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/public/directoryPages`
Expected: FAIL with `Failed to resolve import "../../app/(public)/directory/[state]/page"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/(public)/directory/page.tsx`:

```tsx
import { FiltersCard } from "@/components/public/DirectoryFilters";
import { LabelLegend, ResultsCard, SignupCard } from "@/components/public/ListingRow";
import styles from "@/components/public/directory.module.css";
import { PAGE_SIZE, readFilters, toQuery } from "@/components/public/listings";
import type { SearchParams } from "@/components/public/params";
import { stateHref } from "@/components/public/states";
import { getDeps } from "@/server/deps";
import { searchScholarships } from "@scholarcrew/core/scholarships";
import { PUBLIC_ACTOR, STATE_NAMES, US_STATES } from "@scholarcrew/domain";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scholarship directory · ScholarCrew",
  description:
    "Local, state, and national scholarships, each checked against its source with the date we checked. No account needed.",
};

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const filters = readFilters(await searchParams);
  const deps = getDeps();
  const now = deps.clock.now();
  const page = await searchScholarships(deps, PUBLIC_ACTOR, toQuery(filters, now));
  return (
    <div className={styles.dir}>
      <div className={styles.head}>
        <div>
          <h1>Scholarship directory</h1>
          <p className={styles.sub}>
            Each listing is checked against its source, with the date we checked · no account needed
          </p>
        </div>
      </div>
      <section className={styles.states} aria-labelledby="states-h">
        <h2 id="states-h">Browse by state</h2>
        <ul>
          {US_STATES.map((s) => (
            <li key={s}>
              <a href={stateHref(s)}>{STATE_NAMES[s]}</a>
            </li>
          ))}
        </ul>
      </section>
      <div className={styles.grid}>
        <FiltersCard base="/directory" filters={filters} />
        <ResultsCard
          items={page.items}
          page={page.page}
          pageSize={PAGE_SIZE}
          total={page.total}
          base="/directory"
          filters={filters}
          now={now}
        />
        <aside className={styles.side}>
          <SignupCard />
          <LabelLegend />
        </aside>
      </div>
    </div>
  );
}
```

`apps/web/src/app/(public)/directory/[state]/page.tsx`:

```tsx
import { FiltersCard } from "@/components/public/DirectoryFilters";
import { LabelLegend, ResultsCard, SignupCard } from "@/components/public/ListingRow";
import styles from "@/components/public/directory.module.css";
import { PAGE_SIZE, hasFilters, readFilters, toQuery } from "@/components/public/listings";
import type { SearchParams } from "@/components/public/params";
import { stateFromParam, stateHref } from "@/components/public/states";
import { plural } from "@/lib/format";
import { getDeps } from "@/server/deps";
import { searchScholarships } from "@scholarcrew/core/scholarships";
import { PUBLIC_ACTOR, STATE_NAMES } from "@scholarcrew/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ state: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = stateFromParam((await params).state);
  if (!code) return { title: "Scholarship directory · ScholarCrew" };
  const name = STATE_NAMES[code];
  return {
    title: `${name} scholarships · ScholarCrew`,
    description: `Local and statewide scholarships for ${name} students, each checked against its source with the date we checked. No account needed.`,
    alternates: { canonical: stateHref(code) },
  };
}

export default async function StateDirectoryPage({ params, searchParams }: Props) {
  const code = stateFromParam((await params).state);
  if (!code) notFound();
  const filters = readFilters(await searchParams);
  const deps = getDeps();
  const now = deps.clock.now();
  // The state total is one count query (pageSize 1) with the same open-today rule, not a full load of every row.
  const [stateTotal, page] = await Promise.all([
    searchScholarships(deps, PUBLIC_ACTOR, { ...toQuery(readFilters({}), now, code), pageSize: 1 }).then((p) => p.total),
    searchScholarships(deps, PUBLIC_ACTOR, toQuery(filters, now, code)),
  ]);
  const name = STATE_NAMES[code];
  const base = stateHref(code);
  const count = hasFilters(filters)
    ? `${page.total} of ${stateTotal} match your filters`
    : plural(stateTotal, "listing");
  return (
    <div className={styles.dir}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <a href="/directory">Directory</a>
        <span aria-hidden="true">›</span>
        <b>{name}</b>
      </nav>
      <div className={styles.head}>
        <div>
          <h1>{`${name} scholarships`}</h1>
          <p className={styles.sub}>
            {`${count} · each one checked against its source, with the date we checked · no account needed`}
          </p>
        </div>
      </div>
      <div className={styles.grid}>
        <FiltersCard base={base} filters={filters} />
        <ResultsCard
          items={page.items}
          page={page.page}
          pageSize={PAGE_SIZE}
          total={page.total}
          base={base}
          filters={filters}
          now={now}
        />
        <aside className={styles.side}>
          <SignupCard />
          <LabelLegend />
        </aside>
      </div>
    </div>
  );
}
```

`apps/web/src/app/(public)/directory/s/[slug]/page.tsx`:

```tsx
import { safeHref } from "@/lib/format";
import { LabelLegend, SignupCard } from "@/components/public/ListingRow";
import styles from "@/components/public/directory.module.css";
import { amountLabel, deadlineLabel, describeRule, listingCheck } from "@/components/public/listings";
import { stateHref } from "@/components/public/states";
import { dateShort, minutesLabel, plural } from "@/lib/format";
import { getDeps } from "@/server/deps";
import { getScholarship } from "@scholarcrew/core/scholarships";
import { PUBLIC_ACTOR, STATE_NAMES, type ScholarshipDetail, isAppError, localLabel } from "@scholarcrew/domain";
import { Badge, Button, Card, Icon } from "@scholarcrew/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/** Published, public, and scam-free, or null. generateMetadata and the page share one lookup per request. */
const loadListing = cache(async (slug: string): Promise<ScholarshipDetail | null> => {
  try {
    const s = await getScholarship(getDeps(), PUBLIC_ACTOR, slug);
    return s.scamFlags.length > 0 ? null : s;
  } catch (e) {
    if (isAppError(e) && e.code === "not_found") return null;
    throw e;
  }
});

/** Only http(s) links leave the site. */

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await loadListing((await params).slug);
  if (!s) return { title: "Scholarship not found · ScholarCrew", robots: { index: false, follow: false } };
  const due = s.deadline ? `Deadline ${dateShort(s.deadline)}` : "Deadline not posted yet";
  return {
    title: `${s.name} · ${amountLabel(s)} · ScholarCrew`,
    description: `${s.provider}. ${localLabel(s.localArea)}. ${due}. Checked against its source, with the date we checked.`,
    alternates: { canonical: `/directory/s/${s.slug}` },
  };
}

export default async function ListingPage({ params }: Props) {
  const s = await loadListing((await params).slug);
  if (!s) notFound();
  const now = getDeps().clock.now();
  const check = listingCheck(
    {
      status: s.stale ? "stale" : s.status,
      verifiedAt: s.verifiedAt,
      unverified: s.verifiedAt === null || s.visibility === "submitter_only",
    },
    now,
  );
  const due = deadlineLabel(s.deadline, now);
  const rules = [...new Set(s.eligibility.map(describeRule))];
  const r = s.requirements;
  const needs = [
    ...r.essays.map((e) => (e.wordLimit ? `Essay (${e.wordLimit} words): ${e.prompt}` : `Essay: ${e.prompt}`)),
    ...(r.recommendations > 0 ? [plural(r.recommendations, "recommendation letter")] : []),
    ...(r.transcript ? ["Transcript"] : []),
    ...(r.serviceHours ? [`${r.serviceHours} service hours`] : []),
    ...r.other,
  ];
  const apply = safeHref(s.url);
  const source = safeHref(s.sourceUrl);
  const state = s.localArea.national ? null : s.localArea.state;
  return (
    <div className={styles.dir}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <a href="/directory">Directory</a>
        {state ? (
          <>
            <span aria-hidden="true">›</span>
            <a href={stateHref(state)}>{STATE_NAMES[state]}</a>
          </>
        ) : null}
        <span aria-hidden="true">›</span>
        <b>{s.name}</b>
      </nav>
      <div className={styles.head}>
        <div>
          <h1>{s.name}</h1>
          <p className={styles.sub}>{`From ${s.provider}`}</p>
        </div>
        <Badge tone={check.tone} icon={check.icon}>
          {check.label}
        </Badge>
      </div>
      <div className={styles.facts}>
        <div>
          <div className={styles.factK}>Amount</div>
          <div className={styles.factV}>{amountLabel(s)}</div>
          <div className={styles.factS}>{s.renewable ? "Renewable" : "One-time"}</div>
        </div>
        <div>
          <div className={styles.factK}>Deadline</div>
          <div className={styles.factV}>{due.main}</div>
          <div className={styles.factS}>{due.sub}</div>
        </div>
        <div>
          <div className={styles.factK}>Where</div>
          <div className={styles.factV}>{localLabel(s.localArea)}</div>
          <div className={styles.factS}>{s.localArea.national ? "Open nationwide" : "Local or state"}</div>
        </div>
        <div>
          <div className={styles.factK}>Time to apply</div>
          <div className={styles.factV}>{minutesLabel(s.estMinutes)}</div>
          <div className={styles.factS}>Our estimate</div>
        </div>
      </div>
      <div className={styles.detailGrid}>
        <div className={styles.stack}>
          <Card title="Who can apply">
            <ul className={styles.bullets}>
              {rules.length === 0 ? (
                <li>
                  <Icon name="check" />
                  Open to students in the area above
                </li>
              ) : (
                rules.map((text) => (
                  <li key={text}>
                    <Icon name="check" />
                    {text}
                  </li>
                ))
              )}
            </ul>
          </Card>
          <Card title="What you'll need">
            <ul className={styles.bullets}>
              {needs.length === 0 ? (
                <li>
                  <Icon name="check" />
                  The application form
                </li>
              ) : (
                needs.map((text) => (
                  <li key={text}>
                    <Icon name="doc" />
                    {text}
                  </li>
                ))
              )}
            </ul>
          </Card>
          {s.renewable && s.renewalTerms ? (
            <Card title="Renewal">
              <p>{s.renewalTerms}</p>
            </Card>
          ) : null}
          <Card title="Source">
            <p className={styles.sub}>{check.detail ?? "Checked against the sponsor's page on the date shown above."}</p>
            <div className={styles.chips}>
              {apply ? (
                <Button variant="primary" iconEnd="ext" href={apply}>
                  Apply on the sponsor's site
                </Button>
              ) : null}
              {source ? (
                <Button variant="line" iconEnd="ext" href={source}>
                  Source page
                </Button>
              ) : null}
            </div>
            <p className={styles.fine}>Always confirm the deadline and rules on the sponsor's page before you apply.</p>
          </Card>
        </div>
        <aside className={styles.side}>
          <SignupCard />
          <LabelLegend />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/public && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 7 files, 31 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(public)/directory" apps/web/src/components/public/directoryPages.test.tsx
git commit -m "feat(web): server-rendered directory pages by state and by listing"
```

### R6: Public offer tool (PU-03, MO-11)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/public/offerTool.test.ts`:

```ts
import { type OfferComparison, PublicOfferInput } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { type OfferDraft, axisMax, barRows, buildOfferInput, newLine, newOffer, parseDollars } from "./offerTool";

const COMPARISON: OfferComparison = {
  columns: [
    {
      offerId: "offer-1",
      collegeId: "",
      collegeName: "Maple State",
      costOfAttendanceUsd: 28000,
      freeMoneyUsd: 12000,
      workStudyUsd: 2000,
      loansUsd: 5500,
      letterSaysOweUsd: 8500,
      reallyCostsUsd: 16000,
      fourYearUsd: 76000,
      oneTimeFreeUsd: 4000,
      warnings: ["$4,000 Merit award is year 1 only"],
    },
    {
      offerId: "offer-2",
      collegeId: "",
      collegeName: "Bay Tech",
      costOfAttendanceUsd: 41000,
      freeMoneyUsd: 30000,
      workStudyUsd: 0,
      loansUsd: 3500,
      letterSaysOweUsd: 7500,
      reallyCostsUsd: 11000,
      fourYearUsd: 44000,
      oneTimeFreeUsd: 0,
      warnings: [],
    },
  ],
  lowestFourYearOfferId: "offer-2",
  assumptions: ["Costs stay flat for 4 years", "Renewable awards are kept"],
};

function offer(o: Partial<OfferDraft> = {}): OfferDraft {
  return { ...newOffer("o1"), name: "Maple State", cost: "$28,000", ...o };
}

describe("parseDollars", () => {
  it("reads whole dollars with $ and commas", () => {
    expect(parseDollars("$12,500")).toBe(12500);
    expect(parseDollars(" 0 ")).toBe(0);
    expect(parseDollars("")).toBeNull();
    expect(parseDollars("12.50")).toBeNull();
    expect(parseDollars("-3")).toBeNull();
    expect(parseDollars("lots")).toBeNull();
  });
});

describe("buildOfferInput", () => {
  it("builds a PublicOfferInput and skips blank lines", () => {
    const result = buildOfferInput([
      offer({
        lines: [
          { ...newLine("l1"), label: " Pell Grant ", amount: "7,395" },
          { ...newLine("l2", "loan_federal_subsidized"), label: "Direct Subsidized Loan", amount: "3500", renewable: true },
          newLine("l3"),
        ],
      }),
    ]);
    expect(result).toEqual({
      ok: true,
      input: {
        offers: [
          {
            name: "Maple State",
            costOfAttendanceUsd: 28000,
            lines: [
              { label: "Pell Grant", amountUsd: 7395, category: "grant", renewable: false },
              { label: "Direct Subsidized Loan", amountUsd: 3500, category: "loan_federal_subsidized", renewable: true },
            ],
          },
        ],
      },
    });
    if (result.ok) expect(PublicOfferInput.safeParse(result.input).success).toBe(true);
  });

  it("explains every problem in plain words", () => {
    const result = buildOfferInput([
      offer({ name: " ", cost: "", lines: [{ ...newLine("l1"), label: "", amount: "500" }, { ...newLine("l2"), label: "Grant", amount: "1.5k" }] }),
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [
        "School 1: add the school's name.",
        "School 1: enter the cost of attendance in whole dollars.",
        'School 1, line 1: add a label, like "Pell Grant".',
        "School 1, line 2: enter a whole-dollar amount.",
      ],
    });
  });

  it("limits schools and amounts", () => {
    const five = Array.from({ length: 5 }, (_, i) => offer({ key: `o${i}` }));
    expect(buildOfferInput(five)).toMatchObject({ ok: false, errors: ["Compare up to 4 schools at a time."] });
    expect(buildOfferInput([])).toMatchObject({ ok: false, errors: ["Add at least one school."] });
    const huge = buildOfferInput([offer({ cost: "250000" })]);
    expect(huge).toMatchObject({ ok: false });
    if (!huge.ok) expect(huge.errors[0]).toContain("$200,000 or less");
  });
});

describe("bars", () => {
  it("turns a comparison into free-vs-cost bars on one axis", () => {
    expect(barRows(COMPARISON)[0]).toEqual({
      label: "Maple State",
      sub: "$12,000 free money · $5,500 in loans",
      freeUsd: 12000,
      costUsd: 16000,
      endLabel: "$16,000 year 1",
    });
    expect(axisMax(COMPARISON)).toBe(41000);
    expect(axisMax({ columns: [], lowestFourYearOfferId: null, assumptions: [] })).toBe(1);
  });
});
```

`apps/web/src/components/public/OfferTool.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { OfferComparison } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfferTool, TOO_BIG } from "./OfferTool";

const COMPARISON: OfferComparison = {
  columns: [
    {
      offerId: "offer-1",
      collegeId: "",
      collegeName: "Maple State",
      costOfAttendanceUsd: 28000,
      freeMoneyUsd: 12000,
      workStudyUsd: 2000,
      loansUsd: 5500,
      letterSaysOweUsd: 8500,
      reallyCostsUsd: 16000,
      fourYearUsd: 76000,
      oneTimeFreeUsd: 4000,
      warnings: ["$4,000 Merit award is year 1 only"],
    },
    {
      offerId: "offer-2",
      collegeId: "",
      collegeName: "Bay Tech",
      costOfAttendanceUsd: 41000,
      freeMoneyUsd: 30000,
      workStudyUsd: 0,
      loansUsd: 3500,
      letterSaysOweUsd: 7500,
      reallyCostsUsd: 11000,
      fourYearUsd: 44000,
      oneTimeFreeUsd: 0,
      warnings: [],
    },
  ],
  lowestFourYearOfferId: "offer-2",
  assumptions: ["Costs stay flat for 4 years", "Renewable awards are kept"],
};

afterEach(cleanup);

function change(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } });
}

describe("OfferTool", () => {
  it("shows validation errors and sends nothing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<OfferTool />);
    fireEvent.click(screen.getByRole("button", { name: "Compare offers" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("School 1: add the school's name.");
    expect(alert.textContent).toContain("School 2: enter the cost of attendance in whole dollars.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the offers and renders the comparison", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(COMPARISON), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<OfferTool />);
    fireEvent.click(screen.getByRole("button", { name: "Remove School 2" }));
    change(screen.getByLabelText("School name"), "Maple State");
    change(screen.getByLabelText("Cost of attendance per year"), "$28,000");
    change(screen.getByLabelText("Line type"), "grant");
    change(screen.getByLabelText("Label"), "Pell Grant");
    change(screen.getByLabelText("Amount"), "7,395");
    fireEvent.click(screen.getByRole("switch", { name: "Renews each year" }));
    fireEvent.click(screen.getByRole("button", { name: "Compare offers" }));
    await waitFor(() => expect(screen.getByText("What each offer really costs")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/public/offer-tool");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      offers: [
        {
          name: "Maple State",
          costOfAttendanceUsd: 28000,
          lines: [{ label: "Pell Grant", amountUsd: 7395, category: "grant", renewable: true }],
        },
      ],
    });
    expect(screen.getByText("Lowest 4-year cost: Bay Tech")).toBeTruthy();
    expect(screen.getAllByText("$76,000").length).toBeGreaterThan(0);
    expect(screen.getByText("Maple State: $4,000 Merit award is year 1 only")).toBeTruthy();
    expect(screen.getByText("Costs stay flat for 4 years")).toBeTruthy();
    expect(screen.getByText(/Nothing you typed was saved/)).toBeTruthy();
  });

  it("explains a 413 from the 64 KB public body cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "invalid_input", message: "Request body is too large" } }), {
            status: 413,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    render(<OfferTool />);
    fireEvent.click(screen.getByRole("button", { name: "Remove School 2" }));
    change(screen.getByLabelText("School name"), "Maple State");
    change(screen.getByLabelText("Cost of attendance per year"), "28000");
    change(screen.getByLabelText("Label"), "Pell Grant");
    change(screen.getByLabelText("Amount"), "7395");
    fireEvent.click(screen.getByRole("button", { name: "Compare offers" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(TOO_BIG));
    expect(screen.queryByText("What each offer really costs")).toBeNull();
  });

  it("adds up to 4 schools and more lines", () => {
    render(<OfferTool />);
    const add = screen.getByRole("button", { name: "Add a school" });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(screen.getAllByLabelText("School name")).toHaveLength(4);
    expect((screen.getByRole("button", { name: "Add a school" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Add a line" })[0] as HTMLElement);
    expect(screen.getAllByLabelText("Amount")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Remove line 2 from School 1" }));
    expect(screen.getAllByLabelText("Amount")).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/components/public/offerTool src/components/public/OfferTool`
Expected: FAIL with `Failed to resolve import "./offerTool"` and `Failed to resolve import "./OfferTool"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/public/offerTool.ts`:

```ts
import { usd } from "@/lib/format";
import {
  OFFER_LINE_CATEGORIES,
  type OfferComparison,
  type OfferLineCategory,
  PublicOfferInput,
} from "@scholarcrew/domain";
import type { OfferBarRow } from "@scholarcrew/ui";

export const MAX_OFFERS = 4;
export const MAX_LINES = 30;

export const CATEGORY_LABELS: Record<OfferLineCategory, string> = {
  grant: "Grant",
  scholarship: "Scholarship",
  work_study: "Work-study",
  loan_federal_subsidized: "Federal loan (subsidized)",
  loan_federal_unsubsidized: "Federal loan (unsubsidized)",
  loan_parent_plus: "Parent PLUS loan",
  loan_private: "Private loan",
  other: "Other",
};

export const CATEGORY_OPTIONS = OFFER_LINE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));

export interface LineDraft {
  key: string;
  label: string;
  amount: string;
  category: OfferLineCategory;
  renewable: boolean;
}

export interface OfferDraft {
  key: string;
  name: string;
  cost: string;
  lines: LineDraft[];
}

export function newLine(key: string, category: OfferLineCategory = "grant"): LineDraft {
  return { key, label: "", amount: "", category, renewable: false };
}

export function newOffer(key: string): OfferDraft {
  return { key, name: "", cost: "", lines: [newLine(`${key}-l1`)] };
}

/** "$12,500" → 12500. Blank, decimals, and negatives → null. */
export function parseDollars(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, "");
  return /^\d{1,7}$/.test(clean) ? Number(clean) : null;
}

export type BuildResult = { ok: true; input: PublicOfferInput } | { ok: false; errors: string[] };

/** Turns the form into a PublicOfferInput. Lines with no label and no amount are skipped. */
export function buildOfferInput(drafts: OfferDraft[]): BuildResult {
  const errors: string[] = [];
  if (drafts.length === 0) errors.push("Add at least one school.");
  if (drafts.length > MAX_OFFERS) errors.push(`Compare up to ${MAX_OFFERS} schools at a time.`);
  const offers = drafts.map((d, i) => {
    const school = `School ${i + 1}`;
    const name = d.name.trim();
    if (!name) errors.push(`${school}: add the school's name.`);
    const cost = parseDollars(d.cost);
    if (cost === null || cost === 0) errors.push(`${school}: enter the cost of attendance in whole dollars.`);
    const lines: PublicOfferInput["offers"][number]["lines"] = [];
    for (const [j, l] of d.lines.entries()) {
      const label = l.label.trim();
      if (!label && !l.amount.trim()) continue;
      const where = `${school}, line ${j + 1}`;
      const amount = parseDollars(l.amount);
      if (!label) errors.push(`${where}: add a label, like "Pell Grant".`);
      if (amount === null) errors.push(`${where}: enter a whole-dollar amount.`);
      lines.push({ label, amountUsd: amount ?? 0, category: l.category, renewable: l.renewable });
    }
    if (lines.length > MAX_LINES) errors.push(`${school}: use ${MAX_LINES} lines or fewer.`);
    return { name, costOfAttendanceUsd: cost ?? 0, lines };
  });
  if (errors.length > 0) return { ok: false, errors };
  const parsed = PublicOfferInput.safeParse({ offers });
  if (!parsed.success) {
    return {
      ok: false,
      errors: ["Check the numbers: each amount must be $200,000 or less, and names and labels 120 characters or less."],
    };
  }
  return { ok: true, input: parsed.data };
}

export function barRows(c: OfferComparison): OfferBarRow[] {
  return c.columns.map((col) => ({
    label: col.collegeName,
    sub: `${usd(col.freeMoneyUsd)} free money · ${usd(col.loansUsd)} in loans`,
    freeUsd: col.freeMoneyUsd,
    costUsd: col.reallyCostsUsd,
    endLabel: `${usd(col.reallyCostsUsd)} year 1`,
  }));
}

export function axisMax(c: OfferComparison): number {
  return Math.max(1, ...c.columns.map((col) => col.costOfAttendanceUsd));
}
```

`apps/web/src/components/public/OfferResults.tsx`:

```tsx
import { usd } from "@/lib/format";
import type { OfferColumn, OfferComparison } from "@scholarcrew/domain";
import { Badge, OfferBars, Table, type TableColumn } from "@scholarcrew/ui";
import { axisMax, barRows } from "./offerTool";
import styles from "./offerTool.module.css";

const METRICS: Array<{ key: keyof OfferColumn; label: string }> = [
  { key: "costOfAttendanceUsd", label: "Cost of attendance" },
  { key: "freeMoneyUsd", label: "Free money (grants and scholarships)" },
  { key: "workStudyUsd", label: "Work-study (you earn it by working)" },
  { key: "loansUsd", label: "Loans (you pay these back)" },
  { key: "letterSaysOweUsd", label: "What the letter says you owe" },
  { key: "reallyCostsUsd", label: "What it really costs, year 1" },
  { key: "fourYearUsd", label: "4-year estimate" },
];

type MetricRow = { key: string; label: string; values: Record<string, number> };

export function OfferResults({ comparison }: { comparison: OfferComparison }) {
  const cols = comparison.columns;
  const rows: MetricRow[] = METRICS.map((m) => ({
    key: m.key,
    label: m.label,
    values: Object.fromEntries(cols.map((c) => [c.offerId, Number(c[m.key])])),
  }));
  const columns: TableColumn<MetricRow>[] = [
    { key: "label", header: "Per year unless noted" },
    ...cols.map((c) => ({
      key: c.offerId,
      header: c.collegeName,
      align: "right" as const,
      render: (row: MetricRow) => usd(row.values[c.offerId] ?? 0),
    })),
  ];
  const lowest = cols.find((c) => c.offerId === comparison.lowestFourYearOfferId);
  const warnings = cols.flatMap((c) => c.warnings.map((w) => `${c.collegeName}: ${w}`));
  return (
    <section className={styles.results} aria-labelledby="offer-results-h">
      <h2 id="offer-results-h">What each offer really costs</h2>
      {lowest ? (
        <Badge tone="good" icon="check">
          {`Lowest 4-year cost: ${lowest.collegeName}`}
        </Badge>
      ) : null}
      <OfferBars
        rows={barRows(comparison)}
        axisMaxUsd={axisMax(comparison)}
        freeLabel="Free money"
        costLabel="You pay, year 1"
        caption="Year 1: free money against what's left to pay"
      />
      <Table columns={columns} rows={rows} rowKey={(r) => r.key} caption="Side by side" />
      {warnings.length > 0 ? (
        <ul className={styles.warnings}>
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      <div className={styles.assume}>
        <h3>Assumptions</h3>
        <ul>
          {comparison.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
      <p className={styles.fine}>
        Loans and work-study aren't free money. Nothing you typed was saved, and no AI was used: the math runs as plain
        code.
      </p>
    </section>
  );
}
```

`apps/web/src/components/public/OfferTool.tsx`:

```tsx
"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import type { OfferComparison, OfferLineCategory } from "@scholarcrew/domain";
import { Button, Select, TextInput, Toggle } from "@scholarcrew/ui";
import { type FormEvent, useRef, useState } from "react";
import { OfferResults } from "./OfferResults";
import {
  CATEGORY_OPTIONS,
  type LineDraft,
  MAX_LINES,
  MAX_OFFERS,
  type OfferDraft,
  buildOfferInput,
  newLine,
  newOffer,
} from "./offerTool";
import styles from "./offerTool.module.css";

/** Plan 13 caps public bodies at 64 KB and answers 413 (`invalid_input`, status 413). */
export const TOO_BIG = "That's more than the tool can compare at once. Remove some lines or schools and try again.";

/** MO-11: type each award letter's lines, compare year 1 and 4 years. Nothing is stored; no AI. */
export function OfferTool() {
  const counter = useRef(3);
  const [offers, setOffers] = useState<OfferDraft[]>(() => [newOffer("o1"), newOffer("o2")]);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<OfferComparison | null>(null);
  const [busy, setBusy] = useState(false);

  const nextKey = (prefix: string) => {
    counter.current += 1;
    return `${prefix}${counter.current}`;
  };
  const patchOffer = (key: string, patch: Partial<OfferDraft>) =>
    setOffers((all) => all.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const patchLine = (offerKey: string, lineKey: string, patch: Partial<LineDraft>) =>
    setOffers((all) =>
      all.map((o) =>
        o.key === offerKey ? { ...o, lines: o.lines.map((l) => (l.key === lineKey ? { ...l, ...patch } : l)) } : o,
      ),
    );

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const built = buildOfferInput(offers);
    if (!built.ok) {
      setErrors(built.errors);
      setResult(null);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      setResult(await api<OfferComparison>("/public/offer-tool", { body: built.input }));
    } catch (err) {
      setErrors([err instanceof ApiError && err.status === 413 ? TOO_BIG : errorMessage(err)]);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.tool}>
      <form onSubmit={submit} noValidate className={styles.form}>
        <div className={styles.offers}>
          {offers.map((o, i) => {
            const school = `School ${i + 1}`;
            return (
              <fieldset key={o.key} className={styles.offer}>
                <legend>{school}</legend>
                <TextInput label="School name" value={o.name} onChange={(e) => patchOffer(o.key, { name: e.target.value })} />
                <TextInput
                  label="Cost of attendance per year"
                  inputMode="numeric"
                  placeholder="$28,000"
                  value={o.cost}
                  onChange={(e) => patchOffer(o.key, { cost: e.target.value })}
                />
                <ul className={styles.lines}>
                  {o.lines.map((l, j) => (
                    <li key={l.key} className={styles.line}>
                      <Select
                        label="Line type"
                        options={CATEGORY_OPTIONS}
                        value={l.category}
                        onChange={(e) => patchLine(o.key, l.key, { category: e.target.value as OfferLineCategory })}
                      />
                      <TextInput
                        label="Label"
                        placeholder="Pell Grant"
                        value={l.label}
                        onChange={(e) => patchLine(o.key, l.key, { label: e.target.value })}
                      />
                      <TextInput
                        label="Amount"
                        inputMode="numeric"
                        placeholder="$7,395"
                        value={l.amount}
                        onChange={(e) => patchLine(o.key, l.key, { amount: e.target.value })}
                      />
                      <Toggle
                        label="Renews each year"
                        checked={l.renewable}
                        onChange={(renewable) => patchLine(o.key, l.key, { renewable })}
                      />
                      {o.lines.length > 1 ? (
                        <Button
                          variant="line"
                          size="sm"
                          aria-label={`Remove line ${j + 1} from ${school}`}
                          onClick={() => patchOffer(o.key, { lines: o.lines.filter((x) => x.key !== l.key) })}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className={styles.row}>
                  <Button
                    variant="soft"
                    size="sm"
                    icon="plus"
                    disabled={o.lines.length >= MAX_LINES}
                    onClick={() => patchOffer(o.key, { lines: [...o.lines, newLine(nextKey(`${o.key}-l`))] })}
                  >
                    Add a line
                  </Button>
                  {offers.length > 1 ? (
                    <Button
                      variant="line"
                      size="sm"
                      aria-label={`Remove ${school}`}
                      onClick={() => setOffers((all) => all.filter((x) => x.key !== o.key))}
                    >
                      Remove school
                    </Button>
                  ) : null}
                </div>
              </fieldset>
            );
          })}
        </div>
        {errors.length > 0 ? (
          <div role="alert" className={styles.errors}>
            <ul>
              {errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className={styles.row}>
          <Button
            variant="line"
            icon="plus"
            disabled={offers.length >= MAX_OFFERS}
            onClick={() => setOffers((all) => [...all, newOffer(nextKey("o"))])}
          >
            Add a school
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Comparing…" : "Compare offers"}
          </Button>
        </div>
      </form>
      {result ? <OfferResults comparison={result} /> : null}
    </div>
  );
}
```

`apps/web/src/components/public/offerTool.module.css`:

```css
.page {
  padding: 26px 48px 48px;
}

.intro {
  max-width: 720px;
  margin: 6px 0 18px;
  font-size: 14.5px;
  color: var(--ink-2);
}

.tool {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.offers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
}

.offer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--card);
}

.offer legend {
  padding: 0 4px;
  font-size: 13px;
  font-weight: 700;
  color: var(--navy);
}

.lines {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.line {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: var(--wash);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.errors {
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--crit-soft);
  color: var(--crit-text);
  font-size: 13px;
}

.errors ul {
  padding-left: 18px;
  list-style: disc;
}

.results {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--card);
}

.warnings {
  padding-left: 18px;
  font-size: 13px;
  list-style: disc;
  color: var(--warn-text);
}

.assume h3 {
  margin-bottom: 4px;
  font-size: 13px;
}

.assume ul {
  padding-left: 18px;
  font-size: 12.5px;
  list-style: disc;
  color: var(--muted);
}

.fine {
  font-size: 12.5px;
  color: var(--muted);
}

@media (max-width: 640px) {
  .page {
    padding: 18px 16px 32px;
  }
}
```

`apps/web/src/app/(public)/offer-tool/page.tsx`:

```tsx
import { OfferTool } from "@/components/public/OfferTool";
import styles from "@/components/public/offerTool.module.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare award letters · ScholarCrew",
  description:
    "Type the lines from each college's award letter and see the year-1 and 4-year cost. No account, nothing saved, no AI.",
};

export default function OfferToolPage() {
  return (
    <div className={styles.page}>
      <h1>Compare award letters</h1>
      <p className={styles.intro}>
        Type the lines from each college's award letter: grants, scholarships, work-study, and loans. We separate free
        money from money you earn or pay back, and show what each school really costs for year 1 and for 4 years. No
        account needed. Nothing you type is saved, and no AI is used.
      </p>
      <OfferTool />
    </div>
  );
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/components/public && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 9 files, 40 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(public)/offer-tool" apps/web/src/components/public/offerTool.ts apps/web/src/components/public/offerTool.test.ts apps/web/src/components/public/OfferTool.tsx apps/web/src/components/public/OfferTool.test.tsx apps/web/src/components/public/OfferResults.tsx apps/web/src/components/public/offerTool.module.css
git commit -m "feat(web): public offer tool with validation and comparison bars"
```

### R7: Sign-in and check-email pages (ID-01, ID-03 notice)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/auth/SignInForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { UserActor } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import SignInPage from "../../app/sign-in/page";
import { CheckEmail } from "./CheckEmail";
import { SignInForm } from "./SignInForm";
import { FAMILY_JOIN_NOTE, LINK_ERROR, signInNotice } from "./messages";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
const session = vi.hoisted(() => ({ actor: null as UserActor | null }));

vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/server/session", () => ({ getPageActor: async () => session.actor }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  sessionStorage.clear();
  session.actor = null;
});

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

describe("signInNotice", () => {
  it("explains a used link and an invite waiting after sign in", () => {
    expect(signInNotice({ error: "link" })).toEqual({ error: LINK_ERROR, note: null });
    expect(signInNotice({ next: "/family/join?token=abc" })).toEqual({ error: null, note: FAMILY_JOIN_NOTE });
    expect(signInNotice({})).toEqual({ error: null, note: null });
    expect(signInNotice({ error: "other", next: "/week" }).error).toBeNull();
  });
});

describe("SignInForm", () => {
  it("checks the email before sending", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "maya@" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(screen.getByText("Enter a valid email address, like you@example.com.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the link and goes to check-email", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " Maya@Example.test " } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeTruthy();
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/sign-in/check-email"));
    expect(sessionStorage.getItem("sc_signin_email")).toBe("maya@example.test");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/auth/magic-link");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: '{"email":"maya@example.test"}' });
  });

  it("shows the rate limit and lets the user try again later", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { code: "rate_limited", message: "Too many requests" } }, 429)),
    );
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "maya@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    await waitFor(() =>
      expect(screen.getByText("Too many sign-in links were requested. Wait 15 minutes, then try again.")).toBeTruthy(),
    );
    expect((screen.getByRole("button", { name: "Email me a sign-in link" }) as HTMLButtonElement).disabled).toBe(false);
    expect(nav.router.push).not.toHaveBeenCalled();
  });
});

describe("CheckEmail", () => {
  it("waits a minute before offering to resend", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem("sc_signin_email", "maya@example.test");
    render(<CheckEmail />);
    expect(screen.getByText("maya@example.test")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Resend in 1:00" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: "Resend link" }));
    await waitFor(() => expect(screen.getByText("Sent. Check your inbox again.")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Resend in 1:00" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Use a different email" }).getAttribute("href")).toBe("/sign-in");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ body: '{"email":"maya@example.test"}' });
  });

  it("sends you back to sign in when no address was saved", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<CheckEmail />);
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/sign-in"));
    expect(screen.queryByText("Check your email")).toBeNull();
  });
});

describe("/sign-in page", () => {
  it("sends signed-in users to their home and shows the link error and age notice otherwise", async () => {
    session.actor = { kind: "user", userId: "u1", role: "student" };
    await expect(SignInPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/week");
    session.actor = { kind: "user", userId: "u2", role: "admin" };
    await expect(SignInPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/admin");
    session.actor = null;
    const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ error: "link" }) }));
    expect(html).toContain("That sign-in link has expired or was already used.");
    expect(html).toContain("You need to be 13 or older.");
    expect(html).toContain('href="/terms"');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/auth/SignInForm`
Expected: FAIL with `Failed to resolve import "../../app/sign-in/page"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/auth/messages.ts`:

```ts
import { ApiError, errorMessage } from "@/lib/api";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** sessionStorage key for the address on /sign-in/check-email (never in the URL). */
export const SIGNIN_EMAIL_KEY = "sc_signin_email";
export const BAD_EMAIL = "Enter a valid email address, like you@example.com.";
export const LINK_ERROR =
  "That sign-in link has expired or was already used. Enter your email and we'll send you a new one.";
export const FAMILY_JOIN_NOTE =
  "You're joining a family. After you sign in, open the invite link in your email again to accept it. Use the email address the invite was sent to.";
export const NEXT_NOTE = "Sign in to see that page. After you sign in, you'll start on This week.";
export const INVITE_GONE = "This invite is invalid or has expired. Ask for a new invite.";

/** `?error=link` comes from GET /auth/verify; `?next=` from the middleware (D15: the link can't carry it). */
export function signInNotice(sp: { error?: string; next?: string }): { error: string | null; note: string | null } {
  const error = sp.error === "link" ? LINK_ERROR : null;
  let note: string | null = null;
  if (sp.next?.startsWith("/family/join")) note = FAMILY_JOIN_NOTE;
  else if (sp.next && sp.next !== "/week") note = NEXT_NOTE;
  return { error, note };
}

export function sendErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.code === "rate_limited") {
    return "Too many sign-in links were requested. Wait 15 minutes, then try again.";
  }
  if (e instanceof ApiError && e.code === "invalid_input") return BAD_EMAIL;
  return errorMessage(e);
}

export function joinErrorMessage(e: unknown): string {
  // invalid_input: a truncated link fails AcceptInviteInput, which reads the same as a dead invite.
  if (e instanceof ApiError && (e.code === "not_found" || e.code === "invalid_input")) {
    return "This invite is invalid or has expired, or it was sent to a different email. Ask for a new invite.";
  }
  return errorMessage(e);
}
```

`apps/web/src/components/auth/SignInForm.tsx`:

```tsx
"use client";

import { api } from "@/lib/api";
import { Button, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import styles from "./auth.module.css";
import { BAD_EMAIL, EMAIL_PATTERN, SIGNIN_EMAIL_KEY, sendErrorMessage } from "./messages";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(value)) {
      setError(BAD_EMAIL);
      return;
    }
    setError(null);
    setSending(true);
    try {
      await api("/auth/magic-link", { body: { email: value } });
      // The address stays out of the URL (history, autocomplete, access logs); this tab's storage only.
      sessionStorage.setItem(SIGNIN_EMAIL_KEY, value);
      router.push("/sign-in/check-email");
    } catch (err) {
      setError(sendErrorMessage(err));
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <TextInput
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error ?? undefined}
      />
      <Button type="submit" variant="primary" disabled={sending} className={styles.full}>
        {sending ? "Sending…" : "Email me a sign-in link"}
      </Button>
      <p className={styles.fineCenter}>The link works once and expires in 15 minutes.</p>
    </form>
  );
}
```

`apps/web/src/components/auth/CheckEmail.tsx`:

```tsx
"use client";

import { api } from "@/lib/api";
import { Button, Icon } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./auth.module.css";
import { EMAIL_PATTERN, SIGNIN_EMAIL_KEY, sendErrorMessage } from "./messages";

const RESEND_SECONDS = 60;

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Reads the address SignInForm saved in sessionStorage; without one, goes back to /sign-in. */
export function CheckEmail() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [left, setLeft] = useState(RESEND_SECONDS);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = (sessionStorage.getItem(SIGNIN_EMAIL_KEY) ?? "").trim().toLowerCase();
    if (EMAIL_PATTERN.test(saved)) setEmail(saved);
    else router.replace("/sign-in");
  }, [router]);

  useEffect(() => {
    const timer = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function resend() {
    if (!email) return;
    setSending(true);
    setError(null);
    setNote(null);
    try {
      await api("/auth/magic-link", { body: { email } });
      setNote("Sent. Check your inbox again.");
      setLeft(RESEND_SECONDS);
    } catch (err) {
      setError(sendErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (!email) return null;

  return (
    <>
      <span className={styles.mail}>
        <Icon name="doc" />
      </span>
      <h1 className={styles.title}>Check your email</h1>
      <p className={styles.sub}>
        We sent a sign-in link to <b>{email}</b>.
      </p>
      <ul className={styles.bul}>
        <li>
          <Icon name="check" />
          <span>Open it on this device to sign in here.</span>
        </li>
        <li>
          <Icon name="clock" />
          <span>It works once and expires in 15 minutes.</span>
        </li>
        <li>
          <Icon name="search" />
          <span>Not there? Check spam or promotions. School email can take a few minutes.</span>
        </li>
      </ul>
      <div className={styles.row}>
        <Button variant="line" disabled={left > 0 || sending} onClick={resend}>
          {left > 0 ? `Resend in ${clock(left)}` : "Resend link"}
        </Button>
        <a href="/sign-in" className={styles.small}>
          Use a different email
        </a>
      </div>
      {note ? (
        <p className={styles.note} role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.divider} />
      <p className={styles.fine}>On a shared computer? Sign out when you're done.</p>
      <p className={styles.fine}>
        We'll never ask for your password to other sites, like StudentAid.gov or a college portal.
      </p>
    </>
  );
}
```

`apps/web/src/components/auth/auth.module.css`:

```css
.wrap {
  display: flex;
  justify-content: center;
  padding: 48px 20px 64px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 460px;
  padding: 30px 32px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--card);
  box-shadow: 0 1px 2px rgba(20, 32, 47, 0.04), 0 10px 30px rgba(20, 32, 47, 0.06);
}

.title {
  font-size: 25px;
}

.sub {
  font-size: 14px;
  color: var(--ink-2);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.full {
  justify-content: center;
  width: 100%;
  height: 42px;
}

.fineCenter {
  font-size: 12.5px;
  text-align: center;
  color: var(--muted);
}

.fine {
  font-size: 12.5px;
  color: var(--muted);
}

.small {
  font-size: 13px;
}

.divider {
  height: 1px;
  margin: 8px 0;
  background: var(--line-2);
}

.agegate,
.note,
.alert {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
}

.agegate {
  border: 1px solid var(--line);
  background: var(--wash);
}

.agegate svg,
.note svg {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  color: var(--navy);
}

.note {
  background: var(--navy-soft);
  color: var(--ink);
}

.alert {
  background: var(--crit-soft);
  color: var(--crit-text);
}

.alert svg {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  color: var(--crit);
}

.mail {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--navy-soft);
  color: var(--navy);
}

.mail svg {
  width: 26px;
  height: 26px;
}

.bul {
  display: grid;
  gap: 6px;
}

.bul li {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  font-size: 13.5px;
}

.bul svg {
  flex: none;
  width: 15px;
  height: 15px;
  margin-top: 2px;
  color: var(--muted);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
```

`apps/web/src/app/sign-in/layout.tsx`:

```tsx
import { PublicChrome } from "@/components/public/PublicChrome";
import type { ReactNode } from "react";

export default function SignInLayout({ children }: { children: ReactNode }) {
  return <PublicChrome>{children}</PublicChrome>;
}
```

`apps/web/src/app/sign-in/page.tsx`:

```tsx
import { SignInForm } from "@/components/auth/SignInForm";
import styles from "@/components/auth/auth.module.css";
import { signInNotice } from "@/components/auth/messages";
import { type SearchParams, firstParam } from "@/components/public/params";
import { getPageActor } from "@/server/session";
import { Eyebrow, Icon } from "@scholarcrew/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · ScholarCrew",
  description: "Sign in or create an account with a one-time email link. No password.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await getPageActor();
  if (actor) redirect(actor.role === "admin" ? "/admin" : "/week");
  const sp = await searchParams;
  const notice = signInNotice({ error: firstParam(sp, "error"), next: firstParam(sp, "next") });
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <Eyebrow>Enter your email</Eyebrow>
        <h1 className={styles.title}>Sign in or create an account</h1>
        <p className={styles.sub}>Same steps either way. We email you a link, so there's no password to remember.</p>
        {notice.error ? (
          <p className={styles.alert} role="alert">
            <Icon name="alert" />
            <span>{notice.error}</span>
          </p>
        ) : null}
        {notice.note ? (
          <p className={styles.note}>
            <Icon name="info" />
            <span>{notice.note}</span>
          </p>
        ) : null}
        <SignInForm />
        <div className={styles.divider} />
        <div className={styles.agegate}>
          <Icon name="info" />
          <span>
            <b>You need to be 13 or older.</b> We ask for your birth year next. If you're under 13, we can't open an
            account for you, and we'll tell you why.
          </span>
        </div>
        <p className={styles.small}>
          <b>Parents:</b> sign in with your own email. Your account stays separate from your student's, and you see
          only what they share.
        </p>
        <p className={styles.fine}>
          By continuing, you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy policy</a>.
        </p>
      </div>
    </div>
  );
}
```

`apps/web/src/app/sign-in/check-email/page.tsx`:

```tsx
import { CheckEmail } from "@/components/auth/CheckEmail";
import styles from "@/components/auth/auth.module.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check your email · ScholarCrew",
  robots: { index: false, follow: false },
};

/** No `?email=`: CheckEmail reads the address from sessionStorage, so it never lands in history or logs. */
export default function CheckEmailPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <CheckEmail />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/auth && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 7 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/sign-in apps/web/src/components/auth/messages.ts apps/web/src/components/auth/SignInForm.tsx apps/web/src/components/auth/CheckEmail.tsx apps/web/src/components/auth/auth.module.css apps/web/src/components/auth/SignInForm.test.tsx
git commit -m "feat(web): magic-link sign-in and check-email pages"
```

### R8: Family invite page (FA-01)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/auth/JoinInvite.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { MeResponse, UserActor } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import JoinPage from "../../app/family/join/page";
import { InvitePreview, JoinInvite } from "./JoinInvite";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
const state = vi.hoisted(() => ({ actor: null as UserActor | null, inFamily: false }));

vi.mock("next/navigation", () => ({ useRouter: () => nav.router }));
vi.mock("@/server/session", () => ({ getPageActor: async () => state.actor }));
vi.mock("@/server/deps", () => ({ getDeps: () => ({}) }));
vi.mock("@scholarcrew/core/profile", () => ({
  getMe: async (): Promise<MeResponse> => ({
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "dana@example.test",
      displayName: "Dana",
      role: "parent",
      birthYear: null,
      timeZone: "America/Chicago",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    profile: null,
    onboardingComplete: true,
    family: state.inFamily ? { id: "22222222-2222-4222-8222-222222222222", role: "parent" } : null,
    plan: "free",
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.actor = null;
  state.inFamily = false;
});

const TOKEN = "invite-token-abcdefghijklmnop";

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

describe("JoinInvite", () => {
  it("accepts the invite and goes to Family", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({}, 200));
    vi.stubGlobal("fetch", fetchMock);
    render(<JoinInvite token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept invite" }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/family"));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/family/invites/accept");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ token: TOKEN }) });
  });

  it("explains an invalid or expired invite", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { code: "not_found", message: "This invite is invalid or has expired" } }, 404)),
    );
    render(<JoinInvite token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept invite" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Ask for a new invite."));
    expect((screen.getByRole("button", { name: "Accept invite" }) as HTMLButtonElement).disabled).toBe(false);
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it("shows conflicts from the service as written", async () => {
    const message = "You're already in a family. Leave it before joining another.";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { code: "conflict", message } }, 409)));
    render(<JoinInvite token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept invite" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(message));
  });
});

describe("/family/join page", () => {
  const params = (token?: string) => ({ searchParams: Promise.resolve(token ? { token } : {}) });
  const page = async (token?: string) => renderToStaticMarkup(await JoinPage(params(token)));

  it("asks signed-out visitors to sign in and checks the invite first", async () => {
    const html = await page(TOKEN);
    expect(html).toContain("You&#x27;ve been invited to a family");
    expect(html).toContain("Checking your invite…");
    expect(html).toContain('href="/sign-in?next=%2Ffamily%2Fjoin"');
  });

  it("shows who sent a live invite to a signed-out visitor (D37)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ inviterFirstName: "Maya", memberRole: "parent", expiresAt: "2026-10-13T15:00:00.000Z" }, 200),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(await JoinPage(params(TOKEN)));
    await waitFor(() => expect(screen.getByText("Maya invited you to join as a parent. The invite expires Oct 13.")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/family/invites/preview?token=${TOKEN}`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in?next=%2Ffamily%2Fjoin");
  });

  it("shows only the generic card for an unknown invite", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { code: "not_found", message: "This invite is invalid or has expired" } }, 404)),
    );
    const { container } = render(await JoinPage(params(TOKEN)));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This invite is invalid or has expired. Ask for a new invite."));
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(container.innerHTML).not.toContain("invited you to join");
    expect(container.innerHTML).not.toContain(TOKEN);
  });

  it("handles a missing or cut-off token, an existing family, and a ready invite", async () => {
    expect(await page()).toContain("This invite link is incomplete");
    expect(await page("short-token")).toContain("This invite link is incomplete");
    state.actor = { kind: "user", userId: "11111111-1111-4111-8111-111111111111", role: "parent" };
    expect(await page()).toContain("This invite link is incomplete");
    state.inFamily = true;
    expect(await page(TOKEN)).toContain("You&#x27;re already in a family");
    state.inFamily = false;
    const html = await page(TOKEN);
    expect(html).toContain("Join your family on ScholarCrew");
    expect(html).toContain("dana@example.test");
    expect(html).toContain("Checking your invite…");
    expect(html).toContain("Accept invite");
  });
});

describe("InvitePreview", () => {
  it("keeps its children while the check is rate limited", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { code: "rate_limited", message: "Too many requests" } }, 429)));
    render(
      <InvitePreview token={TOKEN}>
        <p>child content</p>
      </InvitePreview>,
    );
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Too many requests"));
    expect(screen.getByText("child content")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/auth/JoinInvite`
Expected: FAIL with `Failed to resolve import "../../app/family/join/page"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/auth/JoinInvite.tsx`:

```tsx
"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { FamilyMemberRole, FamilyView } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import styles from "./auth.module.css";
import { INVITE_GONE, joinErrorMessage } from "./messages";

/** GET /family/invites/preview (D37). Never includes the invitee's email. */
type InvitePreviewData = { inviterFirstName: string; memberRole: FamilyMemberRole; expiresAt: string };

type PreviewState =
  | { kind: "loading" }
  | { kind: "ready"; preview: InvitePreviewData }
  | { kind: "gone" }
  | { kind: "error"; message: string };

/**
 * Checks the invite before anything else. While loading, when ready, or when the check itself fails
 * (rate limit, network), it shows `children`; for an unknown, expired, or used invite it shows only the
 * generic message.
 */
export function InvitePreview({ token, children }: { token: string; children: ReactNode }) {
  const [state, setState] = useState<PreviewState>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    api<InvitePreviewData>(`/family/invites/preview?token=${encodeURIComponent(token)}`, { method: "GET" })
      .then((preview) => {
        if (live) setState({ kind: "ready", preview });
      })
      .catch((e: unknown) => {
        if (!live) return;
        const gone = e instanceof ApiError && (e.code === "not_found" || e.code === "invalid_input");
        setState(gone ? { kind: "gone" } : { kind: "error", message: errorMessage(e) });
      });
    return () => {
      live = false;
    };
  }, [token]);

  if (state.kind === "gone") {
    return (
      <p className={styles.alert} role="alert">
        {INVITE_GONE}
      </p>
    );
  }
  return (
    <>
      {state.kind === "loading" ? <p className={styles.sub}>Checking your invite…</p> : null}
      {state.kind === "ready" ? (
        <p className={styles.note}>
          {`${state.preview.inviterFirstName} invited you to join as a ${state.preview.memberRole}. The invite expires ${instantShort(state.preview.expiresAt, "America/Chicago")}.`}
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p className={styles.note} role="status">
          {state.message}
        </p>
      ) : null}
      {children}
    </>
  );
}

export function JoinInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api<FamilyView>("/family/invites/accept", { body: { token } });
      router.push("/family");
    } catch (e) {
      setError(joinErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.row}>
        <Button variant="primary" onClick={accept} disabled={busy}>
          {busy ? "Joining…" : "Accept invite"}
        </Button>
        <Button variant="line" href="/week">
          Not now
        </Button>
      </div>
    </>
  );
}
```

`apps/web/src/app/family/join/layout.tsx`:

```tsx
import { PublicChrome } from "@/components/public/PublicChrome";
import type { ReactNode } from "react";

export default function JoinLayout({ children }: { children: ReactNode }) {
  return <PublicChrome>{children}</PublicChrome>;
}
```

`apps/web/src/app/family/join/page.tsx`:

```tsx
import { InvitePreview, JoinInvite } from "@/components/auth/JoinInvite";
import styles from "@/components/auth/auth.module.css";
import { type SearchParams, firstParam } from "@/components/public/params";
import { getDeps } from "@/server/deps";
import { getPageActor } from "@/server/session";
import { getMe } from "@scholarcrew/core/profile";
import { AcceptInviteInput } from "@scholarcrew/domain";
import { Button, Icon } from "@scholarcrew/ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join your family · ScholarCrew",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function JoinCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export default async function JoinPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const token = (firstParam(await searchParams, "token") ?? "").trim();
  // A missing or cut-off link (fails AcceptInviteInput) gets this card before any lookup or sign-in prompt.
  if (!AcceptInviteInput.safeParse({ token }).success) {
    return (
      <JoinCard title="This invite link is incomplete">
        <p className={styles.sub}>Open the link from your invite email again. If it still doesn't work, ask for a new invite.</p>
      </JoinCard>
    );
  }
  const actor = await getPageActor();
  if (!actor) {
    // 13 leaves /family/join public (F-18-1), so the invitee sees who sent it before signing in (D37).
    return (
      <JoinCard title="You've been invited to a family">
        <InvitePreview token={token}>
          <p className={styles.sub}>
            Sign in or create an account with the email address the invite was sent to. Then open the invite link in
            your email again to accept it.
          </p>
          <Button variant="primary" href={`/sign-in?next=${encodeURIComponent("/family/join")}`}>
            Sign in
          </Button>
        </InvitePreview>
      </JoinCard>
    );
  }
  const me = await getMe(getDeps(), actor);
  if (me.family) {
    return (
      <JoinCard title="You're already in a family">
        <p className={styles.sub}>Leave your current family from the Family page before joining another one.</p>
        <Button variant="primary" href="/family">
          Go to Family
        </Button>
      </JoinCard>
    );
  }
  return (
    <JoinCard title="Join your family on ScholarCrew">
      <p className={styles.sub}>
        You're signed in as <b>{me.user.email}</b>. The invite has to be for this email address.
      </p>
      <InvitePreview token={token}>
        <ul className={styles.bul}>
          <li>
            <Icon name="users" />
            <span>Your student chooses what you can see, one category at a time.</span>
          </li>
          <li>
            <Icon name="lock" />
            <span>Essays, chats, stories, and sensitive facts stay private unless your student shares them.</span>
          </li>
          <li>
            <Icon name="check" />
            <span>You can leave the family any time from the Family page.</span>
          </li>
        </ul>
        <JoinInvite token={token} />
      </InvitePreview>
    </JoinCard>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/auth && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 15 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/family/join apps/web/src/components/auth/JoinInvite.tsx apps/web/src/components/auth/JoinInvite.test.tsx
git commit -m "feat(web): family invite page with a signed-out preview and accept"
```

### R9: Helper view page and page-side rate limits (HL-02, HL-03, HL-04, SE-04)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/public/pageRate.test.ts`:

```ts
import { eq, rateLimits } from "@scholarcrew/db";
import { useTestDeps } from "@test/helpers";
import { describe, expect, it, vi } from "vitest";
import { allowPageRequest } from "./pageRate";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.99, 203.0.113.7" }),
}));

const deps = useTestDeps();

describe("allowPageRequest", () => {
  it("charges the same per-IP bucket as the API route (right-most hop) and stops at the limit", async () => {
    const rate = { key: "helper-view", limit: 2, windowSeconds: 3600 };
    expect(await allowPageRequest(rate)).toBe(true);
    expect(await allowPageRequest(rate)).toBe(true);
    expect(await allowPageRequest(rate)).toBe(false);
    const rows = await deps().db.select().from(rateLimits).where(eq(rateLimits.key, "helper-view:203.0.113.7"));
    expect(rows).toHaveLength(1);
  });
});
```

`apps/web/src/components/public/HelperSheet.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { CollegeListEntry, HelperView } from "@scholarcrew/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HelperSheet, gradesLabel, stageLabel } from "./HelperSheet";
import { calendarLong, instantLong } from "./dates";

afterEach(cleanup);

const NOW = "2026-10-06T15:00:00.000Z";

const brag: HelperView = {
  studentName: "Jordan Rivera",
  helperRole: "recommender",
  label: "Ms. Patel",
  expiresAt: "2026-11-05T17:00:00.000Z",
  activities: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      position: 1,
      name: "Robotics team",
      role: "Build lead",
      organization: "Maple High",
      description: "Designed the drivetrain for our regional finalist robot.",
      hoursPerWeek: 8,
      weeksPerYear: 30,
      grades: [9, 10, 11, 12],
      category: "STEM",
    },
  ],
  stories: [{ title: "Losing the regional final", summary: "Our robot failed in the last match. I led the rebuild." }],
  deadlines: null,
  colleges: null,
  scholarships: null,
  request: { message: null, dueDate: null },
};

const entry: CollegeListEntry = {
  id: "22222222-2222-4222-8222-222222222222",
  collegeId: "100001",
  college: {
    id: "100001",
    name: "Maple State University",
    state: "TX",
    city: "Maple City",
    control: "public",
    admitRate: 0.68,
    costOfAttendanceUsd: 24510,
    testPolicy: "optional",
  },
  fit: "target",
  plan: "EA",
  status: "applying",
  season: "2026-27",
  deadline: "2026-11-01",
  itemsDone: 3,
  itemsTotal: 7,
  gapUsd: 9200,
  outsidePolicy: "unknown",
  testPolicy: "optional",
  createdAt: "2026-09-01T00:00:00.000Z",
};

describe("dates", () => {
  it("formats calendar dates and instants with the year", () => {
    expect(calendarLong("2026-11-01")).toBe("Nov 1, 2026");
    expect(instantLong("2026-11-05T17:00:00.000Z")).toBe("Nov 5, 2026");
    expect(gradesLabel([9, 10, 11, 12])).toBe("grades 9–12");
    expect(gradesLabel([11])).toBe("grade 11");
    expect(gradesLabel([9, 11])).toBe("grades 9, 11");
    expect(gradesLabel([])).toBe("");
    // R3V-8: 02's stage map, narrowed from HelperView's string `stage`.
    expect(stageLabel("lost")).toBe("Didn't win");
    expect(stageLabel("planned")).toBe("Working on");
    expect(stageLabel("not-a-stage")).toBe("not-a-stage");
  });
});

describe("HelperSheet", () => {
  it("shows a recommender only the sections in the link's scope", () => {
    render(<HelperSheet view={brag} nowIso={NOW} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hi Ms. Patel. Here's Jordan's brag sheet.");
    expect(screen.getByText("Helper link · shared by Jordan Rivera")).toBeTruthy();
    expect(screen.getByText("Read-only")).toBeTruthy();
    expect(screen.getByText("Expires Nov 5, 2026")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Activities" })).toBeTruthy();
    expect(screen.getByText("Robotics team")).toBeTruthy();
    expect(screen.getByText("Build lead · Maple High · grades 9–12 · 8 h/wk")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Stories Jordan chose to share" })).toBeTruthy();
    expect(screen.getByText("Losing the regional final")).toBeTruthy();
    for (const name of ["Deadlines", "College list", "Scholarships"]) {
      expect(screen.queryByRole("heading", { name })).toBeNull();
    }
    for (const item of ["Essays and drafts", "Crew chats", "Costs, aid, and family finances", "Private or sensitive details"]) {
      expect(screen.getByText(item)).toBeTruthy();
    }
    expect(screen.queryByRole("heading", { name: "What Jordan is asking for" })).toBeNull();
  });

  it("shows the recommendation request first, with the note and the helpful-by date (D38, HL-02)", () => {
    render(
      <HelperSheet
        view={{ ...brag, request: { message: "Could you speak to my robotics leadership?", dueDate: "2026-10-25" } }}
        nowIso={NOW}
      />,
    );
    const ask = screen.getByRole("heading", { name: "What Jordan is asking for" });
    expect(screen.getByText("“Could you speak to my robotics leadership?”")).toBeTruthy();
    expect(screen.getByText("Helpful by Oct 25, 2026")).toBeTruthy();
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings.indexOf(ask.textContent)).toBeLessThan(headings.indexOf("Activities"));
    cleanup();
    const { container } = render(
      <HelperSheet view={{ ...brag, request: { message: null, dueDate: "2026-10-25" } }} nowIso={NOW} />,
    );
    expect(screen.getByText("Helpful by Oct 25, 2026")).toBeTruthy();
    expect(container.textContent).not.toContain("“");
  });

  it("shows a counselor deadlines, colleges, and item status, never costs", () => {
    const counselor: HelperView = {
      ...brag,
      helperRole: "counselor",
      label: "Mr. Lee",
      activities: null,
      stories: null,
      deadlines: [
        {
          kind: "application",
          title: "Maple State EA application",
          dueOn: "2026-11-01",
          daysLeft: 26,
          refType: "college_list",
          refId: entry.id,
          valueUsd: null,
          warning: false,
        },
      ],
      colleges: [entry],
      scholarships: [{ name: "Maple STEM Award", deadline: "2026-10-15", stage: "drafting" }],
    };
    const { container } = render(<HelperSheet view={counselor} nowIso={NOW} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hi Mr. Lee. Here's where Jordan's applications stand.");
    expect(screen.getByText("Maple State EA application")).toBeTruthy();
    expect(screen.getByText("Nov 1 · 26 days")).toBeTruthy();
    expect(screen.getByText("Maple State University")).toBeTruthy();
    expect(screen.getByText("Early Action · Applying · 3 of 7 items done")).toBeTruthy();
    expect(screen.getByText("Maple STEM Award")).toBeTruthy();
    // R3V-8: stage words come from 02 APPLICATION_STAGE_LABELS (the student's wording).
    expect(screen.getByText("Working on · due Oct 15")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Activities" })).toBeNull();
    expect(container.textContent).not.toContain("$9,200");
    expect(container.textContent).not.toContain("$24,510");
  });

  it("warns when the link is about to expire and handles empty sections", () => {
    render(<HelperSheet view={{ ...brag, activities: [], expiresAt: "2026-10-08T15:00:00.000Z" }} nowIso={NOW} />);
    expect(screen.getByText("Expires in 2 days")).toBeTruthy();
    expect(screen.getByText("Nothing shared here yet.")).toBeTruthy();
  });
});
```

`apps/web/src/components/public/helperPage.test.tsx` (node environment, real services):

```tsx
import { createHelperLink, revokeHelperLink } from "@scholarcrew/core/helpers";
import { factories } from "@scholarcrew/db/testing";
import { userActor } from "@scholarcrew/domain";
import { useTestDeps } from "@test/helpers";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HelperPage, { metadata } from "../../app/h/[token]/page";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "198.51.100.4" }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const deps = useTestDeps();

describe("/h/[token]", () => {
  it("renders the scoped view, and a revoked or unknown link is a 404 (HL-04)", async () => {
    const { user } = await factories.student(deps().db);
    const actor = userActor(user.id, "student");
    const created = await createHelperLink(deps(), actor, {
      label: "Ms. Patel",
      helperRole: "recommender",
      scope: ["activities", "stories"],
      expiresInDays: 30,
    });
    const token = created.url.split("/h/")[1] ?? "";
    const html = renderToStaticMarkup(await HelperPage({ params: Promise.resolve({ token }) }));
    expect(html).toContain("Hi Ms. Patel.");
    expect(html).toContain("Activities");
    expect(html).toContain("Nothing shared here yet.");
    expect(html).not.toContain("College list");
    expect(metadata.robots).toEqual({ index: false, follow: false });

    await expect(HelperPage({ params: Promise.resolve({ token: "not-a-real-token" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await revokeHelperLink(deps(), actor, created.link.id);
    await expect(HelperPage({ params: Promise.resolve({ token }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/components/public/pageRate src/components/public/HelperSheet src/components/public/helperPage`
Expected: FAIL with `Failed to resolve import "./pageRate"`, `"./HelperSheet"`, and `"../../app/h/[token]/page"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/public/dates.ts`:

```ts
import type { IsoDate } from "@scholarcrew/domain";

const LONG = { month: "short", day: "numeric", year: "numeric" } as const;

/** "2026-11-01" → "Nov 1, 2026", never shifted by time zone. */
export function calendarLong(d: IsoDate): string {
  return new Intl.DateTimeFormat("en-US", { ...LONG, timeZone: "UTC" }).format(new Date(`${d}T00:00:00.000Z`));
}

/** An instant as "Nov 5, 2026" on the Central calendar. */
export function instantLong(iso: string, timeZone = "America/Chicago"): string {
  return new Intl.DateTimeFormat("en-US", { ...LONG, timeZone }).format(new Date(iso));
}
```

`apps/web/src/components/public/pageRate.ts` (server only):

```ts
import { getDeps } from "@/server/deps";
import { clientIp } from "@/server/http";
import { consumeRateLimit } from "@scholarcrew/core/ratelimit";
import { isAppError } from "@scholarcrew/domain";
import { headers } from "next/headers";

export type PageRate = { key: string; limit: number; windowSeconds: number };

/** Same keys and limits as the API routes in plan 14, so a token can't be guessed faster through the page. */
export const HELPER_VIEW_RATE: PageRate = { key: "helper-view", limit: 60, windowSeconds: 3600 };
export const VERIFY_HOURS_RATE: PageRate = { key: "verify-hours", limit: 10, windowSeconds: 3600 };

/**
 * Charges `${key}:${ip}` (the route() bucket for signed-out callers), with 13's `clientIp` (right-most
 * X-Forwarded-For hop), so a spoofed first hop can't open a fresh bucket. False once the limit is reached.
 */
export async function allowPageRequest(rate: PageRate): Promise<boolean> {
  const ip = clientIp(new Request("http://localhost/", { headers: await headers() }));
  try {
    await consumeRateLimit(getDeps(), { key: `${rate.key}:${ip}`, limit: rate.limit, windowSeconds: rate.windowSeconds });
    return true;
  } catch (e) {
    if (isAppError(e) && e.code === "rate_limited") return false;
    throw e;
  }
}
```

`apps/web/src/components/public/HelperSheet.tsx`:

```tsx
import { dateShort, daysLabel } from "@/lib/format";
import { APPLICATION_STAGE_LABELS, APP_PLAN_LABELS, ApplicationStage } from "@scholarcrew/domain";
import type { AppStatus, HelperView } from "@scholarcrew/domain";
import { Badge, Card, EmptyState, Icon } from "@scholarcrew/ui";
import type { ReactNode } from "react";
import { Brand } from "./PublicChrome";
import { calendarLong, instantLong } from "./dates";
import styles from "./helper.module.css";

/** R3V-8: one label map per enum, from 02. Both are `Record<Enum, string>`, so a new value fails `tsc`. */
const PLAN_LABELS = APP_PLAN_LABELS;
const STAGE_LABELS = APPLICATION_STAGE_LABELS;

/**
 * `HelperView.scholarships[].stage` is typed `string` in 02 B7, so it's narrowed before the lookup.
 * Every value 07 writes is an `ApplicationStage`; the raw value is only a type-level fallback.
 */
export function stageLabel(stage: string): string {
  const parsed = ApplicationStage.safeParse(stage);
  return parsed.success ? STAGE_LABELS[parsed.data] : stage;
}

const STATUS_LABELS: Record<AppStatus, string> = {
  researching: "Researching",
  applying: "Applying",
  submitted: "Submitted",
  admitted: "Admitted",
  waitlisted: "Waitlisted",
  denied: "Denied",
  enrolled: "Enrolled",
  withdrawn: "Withdrawn",
};

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "your student";
}

/** [9, 10, 11, 12] → "grades 9–12"; [11] → "grade 11"; [9, 11] → "grades 9, 11". */
export function gradesLabel(grades: number[]): string {
  const g = [...grades].sort((a, b) => a - b);
  const lo = g[0];
  const hi = g[g.length - 1];
  if (lo === undefined || hi === undefined) return "";
  if (g.length === 1) return `grade ${lo}`;
  const consecutive = g.every((n, i) => i === 0 || n === (g[i - 1] ?? n) + 1);
  return consecutive ? `grades ${lo}–${hi}` : `grades ${g.join(", ")}`;
}

function greeting(view: HelperView, name: string): string {
  if (view.helperRole === "counselor") return `Hi ${view.label}. Here's where ${name}'s applications stand.`;
  if (view.helperRole === "mentor") return `Hi ${view.label}. Here's what ${name} shared with you.`;
  return `Hi ${view.label}. Here's ${name}'s brag sheet.`;
}

function Section({ title, aside, empty, children }: { title: string; aside?: string; empty: boolean; children: ReactNode }) {
  return (
    <Card title={title} aside={aside ? <span className={styles.muted}>{aside}</span> : undefined}>
      {empty ? <p className={styles.muted}>Nothing shared here yet.</p> : children}
    </Card>
  );
}

export function HelperSheet({ view, nowIso }: { view: HelperView; nowIso: string }) {
  const name = firstName(view.studentName);
  const daysLeft = Math.ceil((Date.parse(view.expiresAt) - Date.parse(nowIso)) / 86_400_000);
  const soon = daysLeft <= 3;
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Brand />
        <span className={styles.shared}>{`Helper link · shared by ${view.studentName}`}</span>
        <span className={styles.spacer} />
        <Badge tone="neutral" icon="lock">
          Read-only
        </Badge>
        <Badge tone={soon ? "warn" : "neutral"} icon="clock">
          {soon ? `Expires in ${daysLabel(Math.max(daysLeft, 0))}` : `Expires ${instantLong(view.expiresAt)}`}
        </Badge>
      </header>
      <main id="main" className={styles.main}>
        <div className={styles.banner}>
          <span className={styles.avatar} aria-hidden="true">
            {name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1>{greeting(view, name)}</h1>
            <p className={styles.sub}>
              {`${view.studentName} made this read-only page for you. No account needed. It stops working on ${instantLong(view.expiresAt)}.`}
            </p>
          </div>
        </div>
        <div className={styles.grid}>
          <div className={styles.col}>
            {view.request.message || view.request.dueDate ? (
              <Card title={`What ${name} is asking for`}>
                {view.request.message ? <p className={styles.desc}>{`“${view.request.message}”`}</p> : null}
                {view.request.dueDate ? (
                  <p className={styles.muted}>{`Helpful by ${calendarLong(view.request.dueDate)}`}</p>
                ) : null}
              </Card>
            ) : null}
            {view.activities ? (
              <Section title="Activities" aside={`As ${name} wrote them`} empty={view.activities.length === 0}>
                <ul className={styles.list}>
                  {view.activities.map((a) => (
                    <li key={a.id} className={styles.item}>
                      <div>
                        <b>{a.name}</b>
                        <div className={styles.muted}>
                          {[a.role, a.organization, gradesLabel(a.grades), a.hoursPerWeek > 0 ? `${a.hoursPerWeek} h/wk` : ""]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      <p className={styles.desc}>{a.description}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
            {view.deadlines ? (
              <Section title="Deadlines" empty={view.deadlines.length === 0}>
                <ul className={styles.list}>
                  {view.deadlines.map((d) => (
                    <li key={`${d.refType}:${d.refId}:${d.title}`} className={styles.row}>
                      <b>{d.title}</b>
                      <span className={styles.muted}>{`${dateShort(d.dueOn)} · ${daysLabel(d.daysLeft)}`}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
            {view.colleges ? (
              <Section title="College list" empty={view.colleges.length === 0}>
                <ul className={styles.list}>
                  {view.colleges.map((c) => (
                    <li key={c.id} className={styles.row}>
                      <b>{c.college.name}</b>
                      <span className={styles.muted}>
                        {`${PLAN_LABELS[c.plan]} · ${STATUS_LABELS[c.status]} · ${c.itemsDone} of ${c.itemsTotal} items done`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>
          <div className={styles.col}>
            {view.stories ? (
              <Section title={`Stories ${name} chose to share`} empty={view.stories.length === 0}>
                <ul className={styles.list}>
                  {view.stories.map((s) => (
                    <li key={s.title} className={styles.item}>
                      <b>{s.title}</b>
                      <p className={styles.desc}>{s.summary}</p>
                    </li>
                  ))}
                </ul>
                <p className={styles.muted}>{`These are short summaries in ${name}'s words, not essays.`}</p>
              </Section>
            ) : null}
            {view.scholarships ? (
              <Section title="Scholarships" empty={view.scholarships.length === 0}>
                <ul className={styles.list}>
                  {view.scholarships.map((s) => (
                    <li key={s.name} className={styles.row}>
                      <b>{s.name}</b>
                      <span className={styles.muted}>
                        {`${stageLabel(s.stage)}${s.deadline ? ` · due ${dateShort(s.deadline)}` : ""}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
            <Card title="Not in this link" aside={<Icon name="lock" />}>
              <ul className={styles.nolist}>
                {["Essays and drafts", "Crew chats", "Costs, aid, and family finances", "Private or sensitive details"].map(
                  (item) => (
                    <li key={item}>{item}</li>
                  ),
                )}
              </ul>
              <p className={styles.muted}>{`${name} can see when this link was opened and can turn it off at any time.`}</p>
            </Card>
          </div>
        </div>
      </main>
      <footer className={styles.foot}>
        <span>{`Questions? Reply to ${name}'s request email.`}</span>
        <a href="/privacy">Privacy policy</a>
        <a href="/terms">Terms</a>
      </footer>
    </div>
  );
}

/** Shown instead of the sheet for dead links (not-found.tsx) and rate limits. */
export function HelperUnavailable({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="main" className={styles.gone}>
      <div>
        <EmptyState title={title} icon="lock">
          {children}
        </EmptyState>
      </div>
    </main>
  );
}
```

`apps/web/src/components/public/helper.module.css`:

```css
.page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--page);
}

.head {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  min-height: 64px;
  padding: 10px 48px;
  border-bottom: 1px solid var(--line);
  background: var(--rail);
}

.shared {
  font-size: 13.5px;
  color: var(--muted);
}

.spacer {
  flex: 1;
}

.main {
  flex: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 48px 40px;
}

.banner {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 18px;
}

.banner h1 {
  font-size: 24px;
}

.avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--navy-soft);
  color: var(--navy);
  font-size: 17px;
  font-weight: 700;
}

.sub {
  margin-top: 3px;
  font-size: 13.5px;
  color: var(--muted);
}

.grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 16px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.list {
  display: flex;
  flex-direction: column;
}

.item,
.row {
  padding: 10px 0;
  border-top: 1px solid var(--line-2);
}

.item:first-child,
.row:first-child {
  border-top: 0;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  justify-content: space-between;
}

.desc {
  margin-top: 4px;
  font-size: 13px;
  color: var(--ink-2);
}

.muted {
  font-size: 12.5px;
  color: var(--muted);
}

.nolist {
  display: grid;
  gap: 6px;
  margin-bottom: 8px;
  padding-left: 18px;
  font-size: 13px;
  list-style: disc;
}

.foot {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
  padding: 12px 48px;
  border-top: 1px solid var(--line);
  font-size: 12.5px;
  color: var(--muted);
}

.gone {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
}

.gone > div {
  width: 100%;
  max-width: 460px;
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .head,
  .main,
  .foot {
    padding-right: 18px;
    padding-left: 18px;
  }
}
```

`apps/web/src/app/h/[token]/page.tsx`:

```tsx
import { HelperSheet, HelperUnavailable } from "@/components/public/HelperSheet";
import { HELPER_VIEW_RATE, allowPageRequest } from "@/components/public/pageRate";
import { getDeps } from "@/server/deps";
import { getHelperView } from "@scholarcrew/core/helperview";
import { resolveHelperToken } from "@scholarcrew/core/helpers";
import { type HelperView, isAppError } from "@scholarcrew/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared by a student · ScholarCrew",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** No account: the token is the credential. Unknown, expired, and revoked links all render the 404 page. */
export default async function HelperPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await allowPageRequest(HELPER_VIEW_RATE))) {
    return (
      <HelperUnavailable title="Too many visits in the last hour">
        Wait an hour, then open the link again.
      </HelperUnavailable>
    );
  }
  const deps = getDeps();
  const helper = await resolveHelperToken(deps, token);
  if (!helper) notFound();
  let view: HelperView;
  try {
    view = await getHelperView(deps, helper);
  } catch (e) {
    if (isAppError(e) && e.code === "not_found") notFound();
    throw e;
  }
  return <HelperSheet view={view} nowIso={deps.clock.now().toISOString()} />;
}
```

`apps/web/src/app/h/[token]/not-found.tsx`:

```tsx
import { HelperUnavailable } from "@/components/public/HelperSheet";

export default function HelperLinkNotFound() {
  return (
    <HelperUnavailable title="This link has expired or was turned off">
      Helper links stop working when they expire or when the student turns them off. Ask the student to send you a new
      one.
    </HelperUnavailable>
  );
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/components/public && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 12 files, 47 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/h" apps/web/src/components/public/dates.ts apps/web/src/components/public/pageRate.ts apps/web/src/components/public/pageRate.test.ts apps/web/src/components/public/HelperSheet.tsx apps/web/src/components/public/HelperSheet.test.tsx apps/web/src/components/public/helperPage.test.tsx apps/web/src/components/public/helper.module.css
git commit -m "feat(web): read-only helper view with scoped sections and a 404 for dead links"
```

### R10: Supervisor hours confirmation page and error pages (IM-02)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/public/VerifyHoursForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { VerificationRequestView } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import VerifyHoursPage, { metadata } from "../../app/verify-hours/[token]/page";
import { VerifyHoursForm, hoursLabel } from "./VerifyHoursForm";

const state = vi.hoisted(() => ({ allowed: true, view: null as VerificationRequestView | null }));
vi.mock("@/server/deps", () => ({ getDeps: () => ({}) }));
vi.mock("@/components/public/pageRate", () => ({
  VERIFY_HOURS_RATE: { key: "verify-hours", limit: 10, windowSeconds: 3600 },
  allowPageRequest: async () => state.allowed,
}));
vi.mock("@scholarcrew/core/impact", () => ({ getVerificationRequest: async () => state.view }));

afterEach(() => {
  cleanup();
  state.allowed = true;
  state.view = null;
});

const VIEW: VerificationRequestView = {
  studentFirstName: "Jordan",
  organization: "Maple Food Bank",
  activity: "Sorting donations",
  servedOn: "2026-10-03",
  minutes: 150,
  expiresAt: "2026-10-20T15:00:00.000Z",
};
const TOKEN = "verify-token-abcdefghijkl";

function respond(status: number, data?: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    data === undefined
      ? new Response(null, { status })
      : new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }),
  );
}

describe("hoursLabel", () => {
  it("reads minutes as hours", () => {
    expect(hoursLabel(150)).toBe("2.5 hours");
    expect(hoursLabel(60)).toBe("1 hour");
    expect(hoursLabel(100)).toBe("1.67 hours");
    expect(hoursLabel(45)).toBe("45 minutes");
    expect(hoursLabel(1)).toBe("1 minute");
  });
});

describe("VerifyHoursForm", () => {
  it("shows what to confirm and posts a confirmation", async () => {
    const fetchMock = respond(204);
    vi.stubGlobal("fetch", fetchMock);
    render(<VerifyHoursForm token={TOKEN} view={VIEW} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Confirm Jordan's service hours");
    for (const text of ["Maple Food Bank", "Sorting donations", "Oct 3, 2026", "2.5 hours", "This link expires Oct 20, 2026."]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Confirm these hours" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("We let Jordan know you confirmed 2.5 hours at Maple Food Bank."),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/verify-hours/${TOKEN}`);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ confirmed: true, note: "" });
  });

  it("declines with a note", async () => {
    const fetchMock = respond(204);
    vi.stubGlobal("fetch", fetchMock);
    render(<VerifyHoursForm token={TOKEN} view={VIEW} />);
    fireEvent.change(screen.getByLabelText("Note to Jordan (optional)"), { target: { value: " Only 1 hour that day. " } });
    fireEvent.click(screen.getByRole("button", { name: "I can't confirm these" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("We let Jordan know you didn't confirm these hours."));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ confirmed: false, note: "Only 1 hour that day." });
  });

  it("explains an expired or used link", async () => {
    vi.stubGlobal("fetch", respond(404, { error: { code: "not_found", message: "Not found" } }));
    render(<VerifyHoursForm token={TOKEN} view={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm these hours" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This link has expired or was already used."));
    expect((screen.getByRole("button", { name: "Confirm these hours" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("/verify-hours/[token] page", () => {
  it("renders the form, a friendly expired message, or the rate-limit message", async () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    const page = async () => renderToStaticMarkup(await VerifyHoursPage({ params: Promise.resolve({ token: TOKEN }) }));
    expect(await page()).toContain("This link has expired or was already used");
    state.view = VIEW;
    expect(await page()).toContain("Sorting donations");
    state.allowed = false;
    expect(await page()).toContain("Too many tries");
  });
});
```

`apps/web/src/components/public/errorPages.test.tsx` (F-18-2: every 18 route group has an error boundary that says nothing about the failure):

```tsx
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminError from "../../app/(admin)/error";
import PublicError from "../../app/(public)/error";
import HelperError from "../../app/h/[token]/error";
import VerifyHoursError from "../../app/verify-hours/[token]/error";

afterEach(cleanup);

const PAGES = [
  ["(public)/error.tsx", PublicError],
  ["(admin)/error.tsx", AdminError],
  ["h/[token]/error.tsx", HelperError],
  ["verify-hours/[token]/error.tsx", VerifyHoursError],
] as const;

const TOKEN = "hl_7f3c9a1b2d4e5f60718293a4b5c6d7e8";

function boom(): Error & { digest?: string } {
  return Object.assign(new Error(`getHelperView failed for ${TOKEN}: connect ECONNREFUSED 10.0.0.5:5432`), {
    digest: "digest-9912",
  });
}

describe("error pages", () => {
  it("show a generic message and a Try again button that calls reset", () => {
    for (const [, Page] of PAGES) {
      const reset = vi.fn();
      render(<Page error={boom()} reset={reset} />);
      expect(screen.getByText("Something went wrong on our side")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(reset).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

  it("never show the error message, digest, or token, and never read the URL", () => {
    for (const [file, Page] of PAGES) {
      const { container } = render(<Page error={boom()} reset={() => {}} />);
      for (const leak of [TOKEN, "ECONNREFUSED", "digest-9912", "getHelperView"]) {
        expect(container.innerHTML, file).not.toContain(leak);
      }
      cleanup();
      const source = readFileSync(fileURLToPath(new URL(`../../app/${file}`, import.meta.url)), "utf8");
      expect(source, file).not.toMatch(/error\.(message|digest|stack)|useParams|usePathname|useSearchParams|console\./);
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/public/VerifyHoursForm src/components/public/errorPages`
Expected: FAIL with `Failed to resolve import "../../app/verify-hours/[token]/page"` and `Failed to resolve import "../../app/(admin)/error"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/public/VerifyHoursForm.tsx`:

```tsx
"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import type { VerificationRequestView } from "@scholarcrew/domain";
import { Button, TextArea } from "@scholarcrew/ui";
import { useState } from "react";
import { calendarLong, instantLong } from "./dates";
import styles from "./verify.module.css";

/** 150 → "2.5 hours", 60 → "1 hour", 45 → "45 minutes". */
export function hoursLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.round((minutes / 60) * 100) / 100;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function verifyErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.code === "not_found") return "This link has expired or was already used.";
  if (e instanceof ApiError && e.code === "rate_limited") return "Too many tries. Wait an hour and try again.";
  return errorMessage(e);
}

/** IM-02: the supervisor confirms or declines without an account. */
export function VerifyHoursForm({ token, view }: { token: string; view: VerificationRequestView }) {
  const name = view.studentFirstName || "The student";
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<boolean | null>(null);

  async function answer(confirmed: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api(`/verify-hours/${encodeURIComponent(token)}`, { body: { confirmed, note: note.trim() } });
      setAnswered(confirmed);
    } catch (e) {
      setError(verifyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (answered !== null) {
    return (
      <div className={styles.card}>
        <h1>Thank you</h1>
        <p role="status" className={styles.sub}>
          {answered
            ? `We let ${name} know you confirmed ${hoursLabel(view.minutes)} at ${view.organization}.`
            : `We let ${name} know you didn't confirm these hours.`}
        </p>
        <p className={styles.fine}>You can close this page. The link doesn't work anymore.</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h1>{`Confirm ${name}'s service hours`}</h1>
      <p className={styles.sub}>
        {`${name} asked you to confirm these hours. You don't need an account. ScholarCrew records only your answer and your note.`}
      </p>
      <dl className={styles.kv}>
        <dt>Student</dt>
        <dd>{name}</dd>
        <dt>Organization</dt>
        <dd>{view.organization}</dd>
        <dt>Activity</dt>
        <dd>{view.activity}</dd>
        <dt>Date</dt>
        <dd>{calendarLong(view.servedOn)}</dd>
        <dt>Hours</dt>
        <dd>{hoursLabel(view.minutes)}</dd>
      </dl>
      <TextArea
        label={`Note to ${name} (optional)`}
        maxLength={500}
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error ? (
        <p role="alert" className={styles.alert}>
          {error}
        </p>
      ) : null}
      <div className={styles.row}>
        <Button variant="primary" icon="check" disabled={busy} onClick={() => answer(true)}>
          Confirm these hours
        </Button>
        <Button variant="line" disabled={busy} onClick={() => answer(false)}>
          I can't confirm these
        </Button>
      </div>
      <p className={styles.fine}>{`This link expires ${instantLong(view.expiresAt)}.`}</p>
    </div>
  );
}
```

`apps/web/src/components/public/verify.module.css`:

```css
.wrap {
  display: flex;
  justify-content: center;
  padding: 48px 20px 64px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 520px;
  padding: 28px 30px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--card);
}

.card h1 {
  font-size: 24px;
}

.sub {
  font-size: 14px;
  color: var(--ink-2);
}

.kv {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--wash);
  font-size: 13.5px;
}

.kv dt {
  color: var(--muted);
}

.kv dd {
  font-weight: 650;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.alert {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--crit-soft);
  color: var(--crit-text);
  font-size: 13px;
}

.fine {
  font-size: 12.5px;
  color: var(--muted);
}
```

`apps/web/src/app/verify-hours/layout.tsx`:

```tsx
import { PublicChrome, SimpleHeader } from "@/components/public/PublicChrome";
import type { ReactNode } from "react";

export default function VerifyHoursLayout({ children }: { children: ReactNode }) {
  return <PublicChrome header={<SimpleHeader note="Service hours confirmation" />}>{children}</PublicChrome>;
}
```

`apps/web/src/app/verify-hours/[token]/page.tsx`:

```tsx
import { VerifyHoursForm } from "@/components/public/VerifyHoursForm";
import { VERIFY_HOURS_RATE, allowPageRequest } from "@/components/public/pageRate";
import styles from "@/components/public/verify.module.css";
import { getDeps } from "@/server/deps";
import { getVerificationRequest } from "@scholarcrew/core/impact";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm service hours · ScholarCrew",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1>{title}</h1>
        <p className={styles.sub}>{body}</p>
      </div>
    </div>
  );
}

export default async function VerifyHoursPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await allowPageRequest(VERIFY_HOURS_RATE))) {
    return (
      <Message
        title="Too many tries"
        body="This link was opened too many times in the last hour. Wait an hour, then open it again from your email."
      />
    );
  }
  const view = await getVerificationRequest(getDeps(), token);
  if (!view) {
    return (
      <Message
        title="This link has expired or was already used"
        body="Confirmation links work once and expire after 14 days. If the student still needs you to confirm these hours, they can send a new request."
      />
    );
  }
  return (
    <div className={styles.wrap}>
      <VerifyHoursForm token={token} view={view} />
    </div>
  );
}
```

`apps/web/src/components/public/ErrorState.tsx` (shared by the four `error.tsx` boundaries; takes only `reset`, so it can't print the error):

```tsx
"use client";

import { Button, EmptyState } from "@scholarcrew/ui";
import styles from "./error.module.css";

export function ErrorState({ reset }: { reset: () => void }) {
  return (
    <div className={styles.error}>
      <EmptyState title="Something went wrong on our side" icon="alert">
        <p>This page couldn't load. Nothing you entered was lost. Try again in a moment.</p>
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      </EmptyState>
    </div>
  );
}
```

`apps/web/src/components/public/error.module.css`:

```css
.error {
  display: flex;
  justify-content: center;
  padding: 64px 20px;
}

.error p {
  margin-bottom: 12px;
}
```

`apps/web/src/app/(public)/error.tsx`:

```tsx
"use client";

import { ErrorState } from "@/components/public/ErrorState";

/** Renders inside the public chrome. The error itself is never shown (Next logs it on the server). */
export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState reset={reset} />;
}
```

`apps/web/src/app/(admin)/error.tsx`:

```tsx
"use client";

import { ErrorState } from "@/components/public/ErrorState";

/** Renders inside the admin frame. The error itself is never shown. */
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState reset={reset} />;
}
```

`apps/web/src/app/h/[token]/error.tsx`:

```tsx
"use client";

import { ErrorState } from "@/components/public/ErrorState";

/** Token page: shows no student data, no token, and nothing from the URL or the error. */
export default function HelperError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main">
      <ErrorState reset={reset} />
    </main>
  );
}
```

`apps/web/src/app/verify-hours/[token]/error.tsx`:

```tsx
"use client";

import { ErrorState } from "@/components/public/ErrorState";

/** Token page: renders inside the verify-hours chrome with no student data, token, or error text. */
export default function VerifyHoursError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState reset={reset} />;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/public && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 14 files, 54 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/verify-hours "apps/web/src/app/(public)/error.tsx" "apps/web/src/app/(admin)/error.tsx" "apps/web/src/app/h/[token]/error.tsx" apps/web/src/components/public/VerifyHoursForm.tsx apps/web/src/components/public/VerifyHoursForm.test.tsx apps/web/src/components/public/verify.module.css apps/web/src/components/public/ErrorState.tsx apps/web/src/components/public/error.module.css apps/web/src/components/public/errorPages.test.tsx
git commit -m "feat(web): supervisor hours page and error boundaries that never echo the error"
```

### R11: Admin console frame and guard (ID-04, AD-01)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/admin/AdminFrame.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminFrame, adminActiveKey } from "./AdminFrame";

const nav = vi.hoisted(() => ({ pathname: "/admin/tasks", router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => nav.router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("adminActiveKey", () => {
  it("maps admin paths to nav keys", () => {
    expect(adminActiveKey("/admin/tasks")).toBe("tasks");
    expect(adminActiveKey("/admin/scholarships/new")).toBe("scholarships");
    expect(adminActiveKey("/admin/audit")).toBe("audit");
    expect(adminActiveKey("/admin/aid")).toBe("aid");
    expect(adminActiveKey("/admin")).toBe("tasks");
  });
});

describe("AdminFrame", () => {
  it("shows the admin nav with counts, marks the current page, and signs out", async () => {
    nav.pathname = "/admin/scholarships/abc";
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminFrame user={{ name: "Sam K.", email: "sam@example.test" }} counts={{ tasks: 12, reports: 3 }}>
        <p>page</p>
      </AdminFrame>,
    );
    const menu = screen.getByRole("navigation", { name: "Admin" });
    const links = within(menu).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/admin/tasks",
      "/admin/scholarships",
      "/admin/reports",
      "/admin/colleges",
      "/admin/aid",
      "/admin/audit",
    ]);
    expect(within(menu).getByRole("link", { name: /Scholarships/ }).getAttribute("aria-current")).toBe("page");
    expect(within(menu).getByRole("link", { name: /Review queue/ }).textContent).toContain("12");
    expect(within(menu).getByRole("link", { name: /Reports/ }).textContent).toContain("3");
    expect(screen.getByText("Sam K.")).toBeTruthy();
    expect(screen.getByRole("main").textContent).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/sign-in"));
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/sign-out", expect.objectContaining({ method: "POST" }));
  });

  it("stays and shows the message when sign-out fails, and leaves on unauthenticated (R3A-13)", async () => {
    const body = (code: string, message: string) => JSON.stringify({ error: { code, message } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(body("internal", "Something went wrong"), { status: 500 }))
      .mockResolvedValueOnce(new Response(body("unauthenticated", "Sign in to continue"), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminFrame user={{ name: "Sam K.", email: "sam@example.test" }} counts={{ tasks: 0, reports: 0 }}>
        <p>page</p>
      </AdminFrame>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong");
    expect(nav.router.replace).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Sign out" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/sign-in"));
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/components/admin`
Expected: FAIL with `Failed to resolve import "./AdminFrame"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/admin/AdminFrame.tsx`:

```tsx
"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { Badge, Button, Icon, type IconName } from "@scholarcrew/ui";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import styles from "./admin.module.css";

type Counts = { tasks: number; reports: number };

const NAV: Array<{ key: string; label: string; href: string; icon: IconName; count?: keyof Counts }> = [
  { key: "tasks", label: "Review queue", href: "/admin/tasks", icon: "check", count: "tasks" },
  { key: "scholarships", label: "Scholarships", href: "/admin/scholarships", icon: "award" },
  { key: "reports", label: "Reports", href: "/admin/reports", icon: "alert", count: "reports" },
  { key: "colleges", label: "Colleges", href: "/admin/colleges", icon: "columns" },
  { key: "aid", label: "Aid rules", href: "/admin/aid", icon: "doc" },
  { key: "audit", label: "Audit log", href: "/admin/audit", icon: "doc" },
];

/** "/admin/scholarships/new" → "scholarships"; "/admin" → "tasks". */
export function adminActiveKey(pathname: string): string {
  const segment = pathname.split("/")[2] ?? "";
  return NAV.some((n) => n.key === segment) ? segment : "tasks";
}

export function AdminFrame({
  user,
  counts,
  children,
}: {
  user: { name: string; email: string };
  counts: Counts;
  children: ReactNode;
}) {
  const active = adminActiveKey(usePathname() ?? "/admin");
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  /**
   * R3A-13: leave only when sign-out worked (13 always answers 204 and clears the cookie), or when the
   * session was already gone (`unauthenticated`). Any other failure keeps the admin here with the message,
   * because the session is still live and `/sign-in` would send them straight back in.
   */
  async function signOut() {
    setLeaving(true);
    setSignOutError(null);
    try {
      await api("/auth/sign-out", { method: "POST" });
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "unauthenticated")) {
        setSignOutError(errorMessage(e));
        setLeaving(false);
        return;
      }
    }
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className={styles.frame}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <aside className={styles.side}>
        <a href="/admin/tasks" className={styles.brand}>
          <span className={styles.mark}>
            <Icon name="spark" />
          </span>
          <span className={styles.word}>scholarcrew</span>
        </a>
        <div className={styles.consoleNote}>
          <Icon name="lock" />
          Admin console
        </div>
        <nav aria-label="Admin">
          <ul className={styles.nav}>
            {NAV.map((item) => {
              const count = item.count ? counts[item.count] : 0;
              const on = item.key === active;
              return (
                <li key={item.key}>
                  <a
                    href={item.href}
                    className={cx(styles.navItem, on && styles.navOn)}
                    aria-current={on ? "page" : undefined}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    {count > 0 ? <span className={styles.count}>{count}</span> : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className={styles.fine}>The catalog has no student data. Only an admin can publish.</p>
        <div className={styles.me}>
          <span className={styles.avatar} aria-hidden="true">
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
          <div>
            <div className={styles.meName}>{user.name}</div>
            <div className={styles.meSub}>{`${user.email} · admin`}</div>
          </div>
        </div>
      </aside>
      <div className={styles.mainCol}>
        <header className={styles.top}>
          <Badge tone="navy" icon="lock">
            Admin
          </Badge>
          <span className={styles.spacer} />
          <Button variant="line" size="sm" disabled={leaving} onClick={signOut}>
            Sign out
          </Button>
        </header>
        {signOutError ? (
          <p role="alert" className={styles.alert}>
            {signOutError}
          </p>
        ) : null}
        <main id="main" className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
```

`apps/web/src/components/admin/admin.module.css` (shared by every admin component and page):

```css
.frame {
  display: grid;
  grid-template-columns: 248px 1fr;
  min-height: 100vh;
  background: var(--page);
}

.skip {
  position: absolute;
  top: -40px;
  left: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--navy);
  color: #fff;
}

.skip:focus {
  top: 8px;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 14px;
  border-right: 1px solid var(--line);
  background: var(--rail);
}

.brand {
  display: inline-flex;
  gap: 9px;
  align-items: center;
  padding: 0 6px;
  color: var(--ink);
}

.mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--navy);
  color: #fff;
}

.mark svg {
  width: 16px;
  height: 16px;
}

.word {
  font-size: 16px;
  font-weight: 700;
}

.consoleNote {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--wash);
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
}

.consoleNote svg {
  width: 14px;
  height: 14px;
  color: var(--muted);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.navItem {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 9px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink-2);
}

.navItem svg {
  width: 16px;
  height: 16px;
  color: var(--muted);
}

.navOn {
  background: var(--navy-soft);
  color: var(--navy);
}

.navOn svg {
  color: var(--navy);
}

.count {
  margin-left: auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.fine {
  font-size: 12px;
  color: var(--muted);
}

.me {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--navy-soft);
  color: var(--navy);
  font-weight: 700;
}

.meName {
  font-size: 13px;
  font-weight: 650;
}

.meSub {
  font-size: 11.5px;
  color: var(--muted);
}

.mainCol {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.top {
  display: flex;
  gap: 12px;
  align-items: center;
  height: 56px;
  padding: 0 28px;
  border-bottom: 1px solid var(--line);
}

.spacer {
  flex: 1;
}

.content {
  padding: 18px 28px 40px;
}

.pageHead {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 14px;
}

.sub {
  margin-top: 3px;
  font-size: 13px;
  color: var(--muted);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-2);
}

.chipOn {
  border-color: var(--navy);
  background: var(--navy-soft);
  color: var(--navy);
}

.grid2 {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 16px;
  align-items: start;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.formGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.wide {
  grid-column: 1 / -1;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.alert {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--crit-soft);
  color: var(--crit-text);
  font-size: 13px;
}

.alert ul {
  padding-left: 18px;
  list-style: disc;
}

.ok {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--good-soft);
  color: var(--good-text);
  font-size: 13px;
}

.ruleCard {
  padding: 12px;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: var(--wash);
}

.ruleHead {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.checkList {
  display: grid;
  gap: 6px;
  font-size: 13px;
}

.checkList label {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.fields {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.fields th {
  padding: 6px 10px;
  border-bottom: 1px solid var(--line);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.07em;
  text-align: left;
  text-transform: uppercase;
  color: var(--muted);
}

.fields td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line-2);
  vertical-align: top;
}

.quote {
  font-style: italic;
  color: var(--ink-2);
}

.bad td {
  background: var(--crit-soft);
}

.changed td {
  background: var(--warn-soft);
}

.queue {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--card);
}

.qi {
  display: block;
  padding: 10px 12px;
  border-radius: 10px;
  color: var(--ink);
}

.qiOn {
  background: var(--navy-soft);
}

.qn {
  margin-top: 4px;
  font-size: 13.5px;
  font-weight: 650;
}

.qm {
  font-size: 12px;
  color: var(--muted);
}

.ttype {
  margin-right: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

@media (max-width: 1000px) {
  .frame,
  .grid2,
  .formGrid {
    grid-template-columns: 1fr;
  }
}
```

`apps/web/src/app/(admin)/layout.tsx`:

```tsx
import { AdminFrame } from "@/components/admin/AdminFrame";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { listCatalogTasks, listReports } from "@scholarcrew/core/admin";
import { getMe } from "@scholarcrew/core/profile";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Admin · ScholarCrew", robots: { index: false, follow: false } };

/** ID-04: signed out → /sign-in; anyone but an admin → the 404 page. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requirePageActor(["admin"]);
  const deps = getDeps();
  const [me, tasks, reports] = await Promise.all([
    getMe(deps, actor),
    listCatalogTasks(deps, actor, { status: "open" }),
    listReports(deps, actor, "open"),
  ]);
  return (
    <AdminFrame
      user={{ name: me.user.displayName || me.user.email, email: me.user.email }}
      counts={{ tasks: tasks.length, reports: reports.length }}
    >
      {children}
    </AdminFrame>
  );
}
```

`apps/web/src/app/(admin)/admin/page.tsx`:

```tsx
import { requirePageActor } from "@/server/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await requirePageActor(["admin"]);
  redirect("/admin/tasks");
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/components/admin && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 3 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(admin)/layout.tsx" "apps/web/src/app/(admin)/admin/page.tsx" apps/web/src/components/admin/AdminFrame.tsx apps/web/src/components/admin/AdminFrame.test.tsx apps/web/src/components/admin/admin.module.css
git commit -m "feat(web): admin console frame and admin-only guard"
```

### R12: Eligibility rule editor (AD-02)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/admin/eligibility.test.ts`:

```ts
import { EligibilityRule, type EligibilityRuleType, INCOME_RANGE_LABELS, IncomeRange } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { INCOME_OPTIONS, RULE_SPECS, RULE_TYPES, draftToRule, draftsToRules, emptyDraft, ruleToDraft } from "./eligibility";

const SAMPLES: Record<EligibilityRuleType, Record<string, string>> = {
  state_in: { states: "tx, ok" },
  county_in: { state: "TX", counties: "Maple, Pecan" },
  city_in: { state: "TX", cities: "Cedar Park" },
  class_year_in: { years: "2027, 2028" },
  gpa_min: { min: "3.25" },
  major_any: { majors: "Engineering, Nursing" },
  interest_any: { interests: "robotics" },
  first_gen: {},
  income_max: { maxRange: "48_75k" },
  heritage_any: { values: "Hispanic or Latino" },
  disability: {},
  religion_any: { values: "Catholic" },
  military_family: {},
  foster_care: {},
  citizenship_required: {},
  test_min: { test: "SAT", min: "1200" },
  service_hours_min: { hours: "40" },
  custom: { text: "Child of a co-op member" },
};

describe("rule specs", () => {
  it("cover all 18 rule types", () => {
    expect(RULE_TYPES).toHaveLength(18);
    expect([...RULE_TYPES].sort()).toEqual(Object.keys(RULE_SPECS).sort());
    // R3V-8: income choices come from 02's label map.
    expect(INCOME_OPTIONS.map((o) => o.label)).toEqual(IncomeRange.options.map((r) => INCOME_RANGE_LABELS[r]));
    expect(INCOME_OPTIONS[0]).toEqual({ value: "under_30k", label: "Under $30k" });
  });
});

describe("draftToRule", () => {
  it("produces a valid EligibilityRule for every type and round-trips it", () => {
    for (const type of RULE_TYPES) {
      const out = draftToRule({ key: "k", type, values: SAMPLES[type] });
      expect(out.error, type).toBeNull();
      if (!out.rule) throw new Error(`no rule for ${type}`);
      expect(EligibilityRule.safeParse(out.rule).success, type).toBe(true);
      expect(draftToRule(ruleToDraft("k", out.rule)).rule, type).toEqual(out.rule);
    }
    expect(draftToRule({ key: "k", type: "state_in", values: SAMPLES.state_in }).rule).toEqual({
      type: "state_in",
      states: ["TX", "OK"],
    });
    expect(draftToRule({ key: "k", type: "test_min", values: SAMPLES.test_min }).rule).toEqual({
      type: "test_min",
      test: "SAT",
      min: 1200,
    });
  });

  it("starts types without fields valid and the rest waiting for input", () => {
    for (const type of RULE_TYPES) {
      const out = draftToRule(emptyDraft("k", type));
      const needsInput = RULE_SPECS[type].fields.some((f) => f.kind !== "state" && f.kind !== "income" && f.kind !== "test");
      expect(out.error === null, type).toBe(!needsInput);
    }
  });

  it("names the field to fix", () => {
    expect(draftToRule({ key: "k", type: "gpa_min", values: { min: "" } }).error).toBe("Minimum GPA: check “GPA at least”.");
    expect(draftToRule({ key: "k", type: "state_in", values: { states: "Texas" } }).error).toBe(
      "Lives in a state: check “States”.",
    );
    expect(draftToRule({ key: "k", type: "class_year_in", values: { years: "2019" } }).error).toBe(
      "Class year: check “Class years”.",
    );
    expect(draftToRule({ key: "k", type: "test_min", values: { test: "SAT", min: "0" } }).error).toBe(
      "Minimum test score: check “Score at least”.",
    );
  });

  it("collects rules and errors from a list of drafts", () => {
    const out = draftsToRules([
      { key: "a", type: "first_gen", values: {} },
      { key: "b", type: "gpa_min", values: { min: "abc" } },
    ]);
    expect(out).toEqual({ rules: [{ type: "first_gen" }], errors: ["Minimum GPA: check “GPA at least”."] });
  });
});
```

`apps/web/src/components/admin/EligibilityEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { EligibilityRule, type EligibilityRuleType } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EligibilityEditor } from "./EligibilityEditor";
import { RULE_SPECS, RULE_TYPES } from "./eligibility";

afterEach(cleanup);

const SAMPLES: Record<EligibilityRuleType, Record<string, string>> = {
  state_in: { states: "tx, ok" },
  county_in: { state: "TX", counties: "Maple, Pecan" },
  city_in: { state: "TX", cities: "Cedar Park" },
  class_year_in: { years: "2027, 2028" },
  gpa_min: { min: "3.25" },
  major_any: { majors: "Engineering, Nursing" },
  interest_any: { interests: "robotics" },
  first_gen: {},
  income_max: { maxRange: "48_75k" },
  heritage_any: { values: "Hispanic or Latino" },
  disability: {},
  religion_any: { values: "Catholic" },
  military_family: {},
  foster_care: {},
  citizenship_required: {},
  test_min: { test: "SAT", min: "1200" },
  service_hours_min: { hours: "40" },
  custom: { text: "Child of a co-op member" },
};

type Output = { rules: EligibilityRule[]; errors: string[] };
function lastOutput(fn: ReturnType<typeof vi.fn>): Output {
  const call = fn.mock.calls[fn.mock.calls.length - 1];
  return call?.[0] as Output;
}

describe("EligibilityEditor", () => {
  it("edits an existing rule and reports valid rules", () => {
    const onChange = vi.fn();
    render(<EligibilityEditor initial={[{ type: "state_in", states: ["TX"] }]} onChange={onChange} />);
    expect((screen.getByLabelText("States") as HTMLInputElement).value).toBe("TX");
    fireEvent.change(screen.getByLabelText("States"), { target: { value: "TX, OK" } });
    expect(lastOutput(onChange)).toEqual({ rules: [{ type: "state_in", states: ["TX", "OK"] }], errors: [] });
  });

  it("adds a rule, shows what's missing, and removes rules", () => {
    const onChange = vi.fn();
    render(<EligibilityEditor initial={[{ type: "first_gen" }]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Rule type"), { target: { value: "gpa_min" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByText("Minimum GPA: check “GPA at least”.")).toBeTruthy();
    expect(lastOutput(onChange).errors).toEqual(["Minimum GPA: check “GPA at least”."]);
    fireEvent.change(screen.getByLabelText("GPA at least"), { target: { value: "3.5" } });
    expect(lastOutput(onChange)).toEqual({ rules: [{ type: "first_gen" }, { type: "gpa_min", min: 3.5 }], errors: [] });
    expect(screen.getAllByText("Private match")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove rule 1" }));
    expect(lastOutput(onChange)).toEqual({ rules: [{ type: "gpa_min", min: 3.5 }], errors: [] });
  });

  it("produces EligibilityRule JSON the domain schema accepts for every rule type", () => {
    for (const type of RULE_TYPES) {
      const onChange = vi.fn();
      render(<EligibilityEditor initial={[]} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText("Rule type"), { target: { value: type } });
      fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
      for (const field of RULE_SPECS[type].fields) {
        fireEvent.change(screen.getByLabelText(field.label), { target: { value: SAMPLES[type][field.name] } });
      }
      const out = lastOutput(onChange);
      expect(out.errors, type).toEqual([]);
      expect(out.rules, type).toHaveLength(1);
      expect(EligibilityRule.array().safeParse(out.rules).success, type).toBe(true);
      expect(out.rules[0]?.type).toBe(type);
      cleanup();
    }
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/components/admin/eligibility src/components/admin/EligibilityEditor`
Expected: FAIL with `Failed to resolve import "./eligibility"` and `Failed to resolve import "./EligibilityEditor"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/admin/eligibility.ts`:

```ts
import { EligibilityRule, type EligibilityRuleType, INCOME_RANGE_LABELS, IncomeRange, SENSITIVE_RULE_TYPES } from "@scholarcrew/domain";

export type FieldKind = "states" | "state" | "list" | "years" | "number" | "income" | "test" | "text";

export interface RuleFieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  hint?: string;
}

const LIST_HINT = "Separate with commas";

export const RULE_SPECS: Record<EligibilityRuleType, { label: string; fields: RuleFieldSpec[] }> = {
  state_in: { label: "Lives in a state", fields: [{ name: "states", label: "States", kind: "states", hint: "Two-letter codes: TX, OK" }] },
  county_in: {
    label: "Lives in a county",
    fields: [
      { name: "state", label: "State", kind: "state" },
      { name: "counties", label: "Counties", kind: "list", hint: LIST_HINT },
    ],
  },
  city_in: {
    label: "Lives in a city",
    fields: [
      { name: "state", label: "State", kind: "state" },
      { name: "cities", label: "Cities", kind: "list", hint: LIST_HINT },
    ],
  },
  class_year_in: { label: "Class year", fields: [{ name: "years", label: "Class years", kind: "years", hint: "2027, 2028" }] },
  gpa_min: { label: "Minimum GPA", fields: [{ name: "min", label: "GPA at least", kind: "number", hint: "0 to 5, like 3.25" }] },
  major_any: { label: "Intended major", fields: [{ name: "majors", label: "Majors", kind: "list", hint: LIST_HINT }] },
  interest_any: { label: "Interest", fields: [{ name: "interests", label: "Interests", kind: "list", hint: LIST_HINT }] },
  first_gen: { label: "First-generation student", fields: [] },
  income_max: { label: "Household income limit", fields: [{ name: "maxRange", label: "Highest income range", kind: "income" }] },
  heritage_any: { label: "Heritage", fields: [{ name: "values", label: "Heritage groups", kind: "list", hint: LIST_HINT }] },
  disability: { label: "Disability", fields: [] },
  religion_any: { label: "Faith", fields: [{ name: "values", label: "Faiths", kind: "list", hint: LIST_HINT }] },
  military_family: { label: "Military family", fields: [] },
  foster_care: { label: "Foster care", fields: [] },
  citizenship_required: { label: "U.S. citizenship required", fields: [] },
  test_min: {
    label: "Minimum test score",
    fields: [
      { name: "test", label: "Test", kind: "test" },
      { name: "min", label: "Score at least", kind: "number" },
    ],
  },
  service_hours_min: { label: "Service hours", fields: [{ name: "hours", label: "Hours at least", kind: "number" }] },
  custom: { label: "Other rule (text only)", fields: [{ name: "text", label: "Rule text", kind: "text", hint: "Shown as written; not matched" }] },
};

export const RULE_TYPES: EligibilityRuleType[] = [
  "state_in",
  "county_in",
  "city_in",
  "class_year_in",
  "gpa_min",
  "major_any",
  "interest_any",
  "first_gen",
  "income_max",
  "heritage_any",
  "disability",
  "religion_any",
  "military_family",
  "foster_care",
  "citizenship_required",
  "test_min",
  "service_hours_min",
  "custom",
];

/** R3V-8: built from 02's `INCOME_RANGE_LABELS` in `IncomeRange` order, not copied by hand. */
export const INCOME_OPTIONS: Array<{ value: IncomeRange; label: string }> = IncomeRange.options.map((value) => ({
  value,
  label: INCOME_RANGE_LABELS[value],
}));

export const TEST_OPTIONS = [
  { value: "ACT", label: "ACT" },
  { value: "SAT", label: "SAT" },
];

export function isSensitiveRule(type: EligibilityRuleType): boolean {
  return SENSITIVE_RULE_TYPES.includes(type);
}

/** Form state for one rule: every field as the text the admin typed. */
export interface RuleDraft {
  key: string;
  type: EligibilityRuleType;
  values: Record<string, string>;
}

const DEFAULTS: Partial<Record<FieldKind, string>> = { state: "TX", income: "48_75k", test: "ACT" };

export function emptyDraft(key: string, type: EligibilityRuleType): RuleDraft {
  const values: Record<string, string> = {};
  for (const f of RULE_SPECS[type].fields) values[f.name] = DEFAULTS[f.kind] ?? "";
  return { key, type, values };
}

export function ruleToDraft(key: string, rule: EligibilityRule): RuleDraft {
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(rule)) {
    if (name !== "type") values[name] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return { key, type: rule.type, values };
}

function list(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function draftToRule(d: RuleDraft): { rule: EligibilityRule; error: null } | { rule: null; error: string } {
  const spec = RULE_SPECS[d.type];
  const raw: Record<string, unknown> = { type: d.type };
  for (const f of spec.fields) {
    const text = d.values[f.name] ?? "";
    if (f.kind === "states") raw[f.name] = list(text).map((s) => s.toUpperCase());
    else if (f.kind === "state") raw[f.name] = text.trim().toUpperCase();
    else if (f.kind === "list") raw[f.name] = list(text);
    else if (f.kind === "years") raw[f.name] = list(text).map(Number);
    else if (f.kind === "number") raw[f.name] = text.trim() === "" ? Number.NaN : Number(text);
    else raw[f.name] = text.trim();
  }
  const parsed = EligibilityRule.safeParse(raw);
  if (parsed.success) return { rule: parsed.data, error: null };
  const name = parsed.error.issues[0]?.path[0];
  const field = spec.fields.find((f) => f.name === name);
  return { rule: null, error: field ? `${spec.label}: check “${field.label}”.` : `${spec.label}: check this rule.` };
}

export function draftsToRules(drafts: RuleDraft[]): { rules: EligibilityRule[]; errors: string[] } {
  const rules: EligibilityRule[] = [];
  const errors: string[] = [];
  for (const d of drafts) {
    const out = draftToRule(d);
    if (out.rule) rules.push(out.rule);
    else errors.push(out.error);
  }
  return { rules, errors };
}
```

`apps/web/src/components/admin/EligibilityEditor.tsx`:

```tsx
"use client";

import { type EligibilityRule, type EligibilityRuleType, US_STATES } from "@scholarcrew/domain";
import { Badge, Button, Select, TextInput } from "@scholarcrew/ui";
import { useRef, useState } from "react";
import styles from "./admin.module.css";
import {
  INCOME_OPTIONS,
  RULE_SPECS,
  RULE_TYPES,
  type RuleDraft,
  type RuleFieldSpec,
  TEST_OPTIONS,
  draftToRule,
  draftsToRules,
  emptyDraft,
  isSensitiveRule,
  ruleToDraft,
} from "./eligibility";

const MAX_RULES = 20;
const STATE_OPTIONS = US_STATES.map((s) => ({ value: s, label: s }));
const TYPE_OPTIONS = RULE_TYPES.map((t) => ({ value: t, label: RULE_SPECS[t].label }));

function RuleField({ field, value, onChange }: { field: RuleFieldSpec; value: string; onChange: (v: string) => void }) {
  if (field.kind === "state" || field.kind === "income" || field.kind === "test") {
    const options = field.kind === "state" ? STATE_OPTIONS : field.kind === "income" ? INCOME_OPTIONS : TEST_OPTIONS;
    return <Select label={field.label} options={options} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <TextInput
      label={field.label}
      hint={field.hint}
      inputMode={field.kind === "number" ? "decimal" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** AD-02: one card per rule. Reports `{ rules, errors }` on every change; only valid rules are in `rules`. */
export function EligibilityEditor({
  initial,
  onChange,
}: {
  initial: EligibilityRule[];
  onChange: (out: { rules: EligibilityRule[]; errors: string[] }) => void;
}) {
  const counter = useRef(initial.length);
  const [drafts, setDrafts] = useState<RuleDraft[]>(() => initial.map((r, i) => ruleToDraft(`r${i}`, r)));
  const [addType, setAddType] = useState<EligibilityRuleType>("state_in");

  const update = (next: RuleDraft[]) => {
    setDrafts(next);
    onChange(draftsToRules(next));
  };
  const add = () => {
    counter.current += 1;
    update([...drafts, emptyDraft(`r${counter.current}`, addType)]);
  };
  const setValue = (key: string, name: string, value: string) =>
    update(drafts.map((d) => (d.key === key ? { ...d, values: { ...d.values, [name]: value } } : d)));

  return (
    <div className={styles.stack}>
      {drafts.length === 0 ? <p className={styles.sub}>No rules: open to everyone in the listing's area.</p> : null}
      {drafts.map((d, i) => {
        const spec = RULE_SPECS[d.type];
        const { error } = draftToRule(d);
        return (
          <div key={d.key} className={styles.ruleCard}>
            <div className={styles.ruleHead}>
              <b>{spec.label}</b>
              <span className={styles.row}>
                {isSensitiveRule(d.type) ? (
                  <Badge tone="navy" icon="lock">
                    Private match
                  </Badge>
                ) : null}
                <Button
                  variant="line"
                  size="sm"
                  aria-label={`Remove rule ${i + 1}`}
                  onClick={() => update(drafts.filter((x) => x.key !== d.key))}
                >
                  Remove
                </Button>
              </span>
            </div>
            {spec.fields.length > 0 ? (
              <div className={styles.formGrid}>
                {spec.fields.map((f) => (
                  <RuleField
                    key={f.name}
                    field={f}
                    value={d.values[f.name] ?? ""}
                    onChange={(v) => setValue(d.key, f.name, v)}
                  />
                ))}
              </div>
            ) : null}
            {isSensitiveRule(d.type) ? (
              <p className={styles.sub}>Students' answers stay encrypted. Only the matcher reads them.</p>
            ) : null}
            {error ? <p className={styles.alert}>{error}</p> : null}
          </div>
        );
      })}
      <div className={styles.row}>
        <Select
          label="Rule type"
          options={TYPE_OPTIONS}
          value={addType}
          onChange={(e) => setAddType(e.target.value as EligibilityRuleType)}
        />
        <Button variant="soft" icon="plus" disabled={drafts.length >= MAX_RULES} onClick={add}>
          Add rule
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/components/admin && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 3 files, 11 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/eligibility.ts apps/web/src/components/admin/eligibility.test.ts apps/web/src/components/admin/EligibilityEditor.tsx apps/web/src/components/admin/EligibilityEditor.test.tsx
git commit -m "feat(web): eligibility rule editor for every EligibilityRule type"
```

### R13: Scholarship editor, requirements, status buttons, and listing pages (AD-02)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/admin/listingForm.test.ts`:

```ts
import { instantLong } from "@/components/public/dates";
import { CatalogStatus, type Scholarship, ScholarshipUpsertInput } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { ADMIN_TZ, CATALOG_STATUS_LABELS, adminDeadline } from "./labels";
import {
  emptyListingForm,
  emptyRequirementsForm,
  listingFormFrom,
  requirementsFormFrom,
  slugify,
  toUpsertInput,
} from "./listingForm";

const LISTING: Scholarship = {
  id: "33333333-3333-4333-8333-333333333333",
  slug: "maple-rotary-stem-award",
  name: "Maple Rotary STEM Award",
  provider: "Maple Rotary Club",
  url: "https://maplerotary.example/stem",
  sourceUrl: "https://maplerotary.example/stem",
  amountMinUsd: 1000,
  amountMaxUsd: 2500,
  renewable: true,
  renewalTerms: "Keep a 3.0 GPA",
  deadline: "2027-02-01",
  cycle: "2026-27",
  localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
  eligibility: [{ type: "state_in", states: ["TX"] }],
  requirements: {
    essays: [{ prompt: "Why STEM?", wordLimit: 500 }],
    recommendations: 1,
    transcript: true,
    serviceHours: null,
    other: ["Resume"],
  },
  status: "draft",
  visibility: "public",
  submittedById: null,
  scamFlags: [],
  estMinutes: 90,
  verifiedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

describe("helpers", () => {
  it("makes slugs and an empty form for the season", () => {
    expect(slugify("Maple Rotary — STEM Award!")).toBe("maple-rotary-stem-award");
    expect(slugify("Ñandú Fund")).toBe("nandu-fund");
    expect(emptyListingForm("2026-27")).toMatchObject({ cycle: "2026-27", estMinutes: "60", state: "TX", national: false });
  });
});

describe("toUpsertInput", () => {
  it("round-trips a listing through the form", () => {
    const out = toUpsertInput(LISTING.id, listingFormFrom(LISTING), requirementsFormFrom(LISTING.requirements), LISTING.eligibility);
    const { status, visibility, submittedById, verifiedAt, createdAt, updatedAt, ...fields } = LISTING;
    expect(out).toEqual({ ok: true, input: fields });
    if (out.ok) expect(ScholarshipUpsertInput.safeParse(out.input).success).toBe(true);
  });

  it("explains invalid fields", () => {
    const form = {
      ...listingFormFrom(LISTING),
      slug: "Bad Slug",
      url: "maplerotary.example",
      amountMin: "5000",
      amountMax: "1000",
      cycle: "2026",
    };
    const out = toUpsertInput(null, form, emptyRequirementsForm(), []);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors).toContain("Slug: use lowercase letters, numbers, and dashes (3 to 120 characters).");
      expect(out.errors).toContain("Apply URL: use a full web address that starts with https://.");
      expect(out.errors).toContain("Cycle: use YYYY-YY, like 2026-27.");
    }
    const inverted = toUpsertInput(null, { ...listingFormFrom(LISTING), amountMin: "5000", amountMax: "1000" }, emptyRequirementsForm(), []);
    expect(inverted).toEqual({ ok: false, errors: ["Minimum amount: Minimum is above maximum."] });
  });

  it("clears local fields for national listings and reads requirement lines", () => {
    const form = { ...listingFormFrom(LISTING), national: true, renewable: false, sourceUrl: "" };
    const req = { ...emptyRequirementsForm(), other: "Resume\n\n  Photo  ", serviceHours: "40" };
    const out = toUpsertInput(null, form, req, []);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.input.localArea).toEqual({ national: true, state: null, counties: [], cities: [] });
      expect(out.input.renewalTerms).toBe("");
      expect(out.input.sourceUrl).toBe(LISTING.url);
      expect(out.input.requirements).toEqual({ essays: [], recommendations: 0, transcript: false, serviceHours: 40, other: ["Resume", "Photo"] });
    }
  });
});

describe("admin labels (R3V-10)", () => {
  it("labels every catalog status, gives deadlines a year, and reads instants on the Central calendar", () => {
    expect(Object.keys(CATALOG_STATUS_LABELS).sort()).toEqual([...CatalogStatus.options].sort());
    expect(CATALOG_STATUS_LABELS.draft).toBe("Draft");
    expect(CATALOG_STATUS_LABELS.stale).toBe("Needs re-check");
    expect(adminDeadline(LISTING.deadline)).toBe("Feb 1, 2027");
    expect(adminDeadline(null)).toBe("Not posted");
    expect(ADMIN_TZ).toBe("America/Chicago");
    // 9 pm Central on Oct 6 is already Oct 7 in UTC; the admin screens show the Central day.
    expect(instantLong("2026-10-07T02:00:00.000Z", ADMIN_TZ)).toBe("Oct 6, 2026");
  });
});
```

`apps/web/src/components/admin/ScholarshipEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { type Scholarship, ScholarshipUpsertInput } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScholarshipEditor } from "./ScholarshipEditor";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const LISTING: Scholarship = {
  id: "33333333-3333-4333-8333-333333333333",
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
  eligibility: [],
  requirements: { essays: [], recommendations: 0, transcript: false, serviceHours: null, other: [] },
  status: "draft",
  visibility: "public",
  submittedById: null,
  scamFlags: [],
  estMinutes: 90,
  verifiedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("ScholarshipEditor", () => {
  it("creates a new listing with a generated slug and opens it", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(LISTING, 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScholarshipEditor listing={null} defaultCycle="2026-27" />);
    type("Name", "Maple Rotary STEM Award");
    expect((screen.getByLabelText("Slug") as HTMLInputElement).value).toBe("maple-rotary-stem-award");
    type("Provider", "Maple Rotary Club");
    type("Apply URL", "https://maplerotary.example/stem");
    type("Minimum amount ($)", "1,000");
    type("Maximum amount ($)", "$2,500");
    type("Deadline", "2027-02-01");
    type("Counties", "Maple");
    fireEvent.click(screen.getByRole("button", { name: "Add essay" }));
    type("Essay prompt", "Why STEM?");
    type("Word limit", "500");
    fireEvent.click(screen.getByRole("checkbox", { name: /Charges a fee to apply/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create listing" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith(`/admin/scholarships/${LISTING.id}`));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/admin/scholarships");
    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(ScholarshipUpsertInput.safeParse(sent).success).toBe(true);
    expect(sent).toMatchObject({
      id: null,
      slug: "maple-rotary-stem-award",
      amountMinUsd: 1000,
      amountMaxUsd: 2500,
      sourceUrl: "https://maplerotary.example/stem",
      cycle: "2026-27",
      estMinutes: 60,
      localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
      requirements: { essays: [{ prompt: "Why STEM?", wordLimit: 500 }] },
      scamFlags: ["application_fee"],
    });
  });

  it("shows field errors and sends nothing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ScholarshipEditor listing={LISTING} defaultCycle="2026-27" />);
    type("Minimum amount ($)", "5000");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert").textContent).toContain("Minimum amount: Minimum is above maximum.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves edits with PATCH and publishes with a note", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith("/status")
        ? json({ ...LISTING, status: "published", verifiedAt: "2026-10-06T15:00:00.000Z" })
        : json({ ...LISTING, name: "Maple STEM Award" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ScholarshipEditor listing={LISTING} defaultCycle="2026-27" />);
    type("Name", "Maple STEM Award");
    expect((screen.getByLabelText("Slug") as HTMLInputElement).value).toBe("maple-rotary-stem-award");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Saved.")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/admin/scholarships/${LISTING.id}`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH" });

    type("Note for the audit log", "Checked the club page");
    // R3A-24: the note's client limit matches ScholarshipStatusInput.note (max 1000).
    expect(screen.getByLabelText("Note for the audit log").getAttribute("maxlength")).toBe("1000");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByText("Published. The verified date is today.")).toBeTruthy());
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/v1/admin/scholarships/${LISTING.id}/status`);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ status: "published", note: "Checked the club page" });
    // R3V-10: the status badge is labeled, and the verified date is the Central calendar day.
    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText(/Verified Oct 6, 2026\./)).toBeTruthy();
    expect(nav.router.refresh).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/components/admin/listingForm src/components/admin/ScholarshipEditor`
Expected: FAIL with `Failed to resolve import "./listingForm"` and `Failed to resolve import "./ScholarshipEditor"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/admin/labels.ts` (R3V-10; plain module, used by client and server admin components):

```ts
import { calendarLong } from "@/components/public/dates";
import type { CatalogStatus, IsoDate } from "@scholarcrew/domain";

/** Admin screens show instants on one calendar: `instantLong(iso, ADMIN_TZ)` / `instantShort(iso, ADMIN_TZ)`. */
export const ADMIN_TZ = "America/Chicago";

export const CATALOG_STATUS_LABELS: Record<CatalogStatus, string> = {
  draft: "Draft",
  published: "Published",
  stale: "Needs re-check",
  retired: "Retired",
  flagged: "Flagged",
};

/** A listing deadline with its year ("Feb 1, 2027"); `null` is "Not posted", like the public directory. */
export function adminDeadline(d: IsoDate | null): string {
  return d ? calendarLong(d) : "Not posted";
}
```

`apps/web/src/components/admin/listingForm.ts`:

```ts
import {
  type EligibilityRule,
  type LocalArea,
  type ScamFlag,
  type Scholarship,
  type ScholarshipRequirements,
  ScholarshipUpsertInput,
} from "@scholarcrew/domain";

export interface ListingForm {
  slug: string;
  name: string;
  provider: string;
  url: string;
  sourceUrl: string;
  amountMin: string;
  amountMax: string;
  renewable: boolean;
  renewalTerms: string;
  deadline: string;
  cycle: string;
  estMinutes: string;
  national: boolean;
  state: string;
  counties: string;
  cities: string;
  scamFlags: ScamFlag[];
}

export interface EssayDraft {
  key: string;
  prompt: string;
  wordLimit: string;
}

export interface RequirementsForm {
  essays: EssayDraft[];
  recommendations: string;
  transcript: boolean;
  serviceHours: string;
  other: string;
}

/** Same rule as core `slugify`. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "scholarship";
}

export function emptyListingForm(cycle: string): ListingForm {
  return {
    slug: "",
    name: "",
    provider: "",
    url: "",
    sourceUrl: "",
    amountMin: "",
    amountMax: "",
    renewable: false,
    renewalTerms: "",
    deadline: "",
    cycle,
    estMinutes: "60",
    national: false,
    state: "TX",
    counties: "",
    cities: "",
    scamFlags: [],
  };
}

export function emptyRequirementsForm(): RequirementsForm {
  return { essays: [], recommendations: "0", transcript: false, serviceHours: "", other: "" };
}

export function listingFormFrom(s: Omit<Scholarship, "id" | "status" | "visibility" | "submittedById" | "verifiedAt" | "createdAt" | "updatedAt" | "eligibility" | "requirements">): ListingForm {
  return {
    slug: s.slug,
    name: s.name,
    provider: s.provider,
    url: s.url,
    sourceUrl: s.sourceUrl,
    amountMin: String(s.amountMinUsd),
    amountMax: String(s.amountMaxUsd),
    renewable: s.renewable,
    renewalTerms: s.renewalTerms,
    deadline: s.deadline ?? "",
    cycle: s.cycle,
    estMinutes: String(s.estMinutes),
    national: s.localArea.national,
    state: s.localArea.state ?? "TX",
    counties: s.localArea.counties.join(", "),
    cities: s.localArea.cities.join(", "),
    scamFlags: [...s.scamFlags],
  };
}

export function requirementsFormFrom(r: ScholarshipRequirements): RequirementsForm {
  return {
    essays: r.essays.map((e, i) => ({ key: `e${i + 1}`, prompt: e.prompt, wordLimit: e.wordLimit === null ? "" : String(e.wordLimit) })),
    recommendations: String(r.recommendations),
    transcript: r.transcript,
    serviceHours: r.serviceHours === null ? "" : String(r.serviceHours),
    other: r.other.join("\n"),
  };
}

/** "$1,000" → 1000; anything that isn't a whole number → NaN so validation names the field. */
function whole(text: string): number {
  const clean = text.replace(/[$,\s]/g, "");
  return /^\d+$/.test(clean) ? Number(clean) : Number.NaN;
}

function list(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function localAreaFrom(f: Pick<ListingForm, "national" | "state" | "counties" | "cities">): LocalArea {
  if (f.national) return { national: true, state: null, counties: [], cities: [] };
  return { national: false, state: (f.state || null) as LocalArea["state"], counties: list(f.counties), cities: list(f.cities) };
}

export function requirementsFrom(r: RequirementsForm): ScholarshipRequirements {
  return {
    essays: r.essays
      .filter((e) => e.prompt.trim())
      .map((e) => ({ prompt: e.prompt.trim(), wordLimit: e.wordLimit.trim() ? whole(e.wordLimit) : null })),
    recommendations: whole(r.recommendations.trim() || "0"),
    transcript: r.transcript,
    serviceHours: r.serviceHours.trim() ? whole(r.serviceHours) : null,
    other: r.other
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

const FIELD_LABELS: Record<string, string> = {
  id: "Listing",
  slug: "Slug",
  name: "Name",
  provider: "Provider",
  url: "Apply URL",
  sourceUrl: "Source URL",
  amountMinUsd: "Minimum amount",
  amountMaxUsd: "Maximum amount",
  renewalTerms: "Renewal terms",
  deadline: "Deadline",
  cycle: "Cycle",
  localArea: "Where",
  eligibility: "Eligibility",
  requirements: "Requirements",
  estMinutes: "Minutes to apply",
  scamFlags: "Scam flags",
};

const FIELD_HINTS: Record<string, string> = {
  slug: "use lowercase letters, numbers, and dashes (3 to 120 characters)",
  name: "add a name (200 characters or less)",
  provider: "add the sponsor (200 characters or less)",
  url: "use a full web address that starts with https://",
  sourceUrl: "use a full web address that starts with https://",
  amountMinUsd: "use whole dollars",
  amountMaxUsd: "use whole dollars",
  deadline: "use a real date",
  cycle: "use YYYY-YY, like 2026-27",
  localArea: "pick a state or mark the listing national",
  requirements: "check the essays, recommendation count, and service hours",
  estMinutes: "use 5 to 600",
};

export function issuesToErrors(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string; code: string }>): string[] {
  const out = new Set<string>();
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    const label = FIELD_LABELS[key] ?? "Listing";
    const hint = issue.code === "custom" ? issue.message : (FIELD_HINTS[key] ?? "check this field");
    out.add(`${label}: ${hint}.`);
  }
  return [...out];
}

export type UpsertResult = { ok: true; input: ScholarshipUpsertInput } | { ok: false; errors: string[] };

export function toUpsertInput(
  id: string | null,
  f: ListingForm,
  r: RequirementsForm,
  eligibility: EligibilityRule[],
): UpsertResult {
  const url = f.url.trim();
  const parsed = ScholarshipUpsertInput.safeParse({
    id,
    slug: f.slug.trim(),
    name: f.name.trim(),
    provider: f.provider.trim(),
    url,
    sourceUrl: f.sourceUrl.trim() || url,
    amountMinUsd: whole(f.amountMin.trim() || "0"),
    amountMaxUsd: whole(f.amountMax),
    renewable: f.renewable,
    renewalTerms: f.renewable ? f.renewalTerms.trim() : "",
    deadline: f.deadline.trim() || null,
    cycle: f.cycle.trim(),
    localArea: localAreaFrom(f),
    eligibility,
    requirements: requirementsFrom(r),
    estMinutes: whole(f.estMinutes),
    scamFlags: f.scamFlags,
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, errors: issuesToErrors(parsed.error.issues) };
}
```

`apps/web/src/components/admin/RequirementsEditor.tsx`:

```tsx
"use client";

import { Button, TextArea, TextInput, Toggle } from "@scholarcrew/ui";
import { useRef } from "react";
import styles from "./admin.module.css";
import type { EssayDraft, RequirementsForm } from "./listingForm";

export function RequirementsEditor({ value, onChange }: { value: RequirementsForm; onChange: (next: RequirementsForm) => void }) {
  const counter = useRef(value.essays.length);
  const setEssay = (key: string, patch: Partial<EssayDraft>) =>
    onChange({ ...value, essays: value.essays.map((e) => (e.key === key ? { ...e, ...patch } : e)) });
  const addEssay = () => {
    counter.current += 1;
    onChange({ ...value, essays: [...value.essays, { key: `e${counter.current}`, prompt: "", wordLimit: "" }] });
  };
  return (
    <div className={styles.stack}>
      {value.essays.map((e, i) => (
        <div key={e.key} className={styles.ruleCard}>
          <div className={styles.ruleHead}>
            <b>{`Essay ${i + 1}`}</b>
            <Button
              variant="line"
              size="sm"
              aria-label={`Remove essay ${i + 1}`}
              onClick={() => onChange({ ...value, essays: value.essays.filter((x) => x.key !== e.key) })}
            >
              Remove
            </Button>
          </div>
          <TextArea label="Essay prompt" rows={3} value={e.prompt} onChange={(ev) => setEssay(e.key, { prompt: ev.target.value })} />
          <TextInput
            label="Word limit"
            hint="Leave blank if there's no limit"
            inputMode="numeric"
            value={e.wordLimit}
            onChange={(ev) => setEssay(e.key, { wordLimit: ev.target.value })}
          />
        </div>
      ))}
      <div className={styles.row}>
        <Button variant="soft" size="sm" icon="plus" disabled={value.essays.length >= 10} onClick={addEssay}>
          Add essay
        </Button>
      </div>
      <div className={styles.formGrid}>
        <TextInput
          label="Recommendation letters"
          inputMode="numeric"
          value={value.recommendations}
          onChange={(e) => onChange({ ...value, recommendations: e.target.value })}
        />
        <TextInput
          label="Service hours required"
          hint="Leave blank if none"
          inputMode="numeric"
          value={value.serviceHours}
          onChange={(e) => onChange({ ...value, serviceHours: e.target.value })}
        />
      </div>
      <Toggle label="Transcript required" checked={value.transcript} onChange={(transcript) => onChange({ ...value, transcript })} />
      <TextArea
        label="Other requirements"
        hint="One per line, like Resume"
        rows={3}
        value={value.other}
        onChange={(e) => onChange({ ...value, other: e.target.value })}
      />
    </div>
  );
}
```

`apps/web/src/components/admin/ScholarshipEditor.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { instantLong } from "@/components/public/dates";
import {
  type CatalogStatus,
  type EligibilityRule,
  SCAM_FLAG_TEXT,
  type ScamFlag,
  type Scholarship,
  US_STATES,
} from "@scholarcrew/domain";
import { Badge, Button, Card, Select, TextArea, TextInput, Toggle } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EligibilityEditor } from "./EligibilityEditor";
import { RequirementsEditor } from "./RequirementsEditor";
import styles from "./admin.module.css";
import { ADMIN_TZ, CATALOG_STATUS_LABELS } from "./labels";
import {
  type ListingForm,
  emptyListingForm,
  emptyRequirementsForm,
  listingFormFrom,
  requirementsFormFrom,
  slugify,
  toUpsertInput,
} from "./listingForm";

const STATE_OPTIONS = US_STATES.map((s) => ({ value: s, label: s }));
const SCAM_FLAGS = Object.keys(SCAM_FLAG_TEXT) as ScamFlag[];
const STATUS_DONE: Partial<Record<CatalogStatus, string>> = {
  published: "Published. The verified date is today.",
  retired: "Retired. It no longer appears anywhere.",
  flagged: "Flagged and hidden from students and the directory.",
};

/** AD-02: every ScholarshipUpsertInput field, the rule editor, and publish / retire / flag. */
export function ScholarshipEditor({ listing, defaultCycle }: { listing: Scholarship | null; defaultCycle: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState<Scholarship | null>(listing);
  const [form, setForm] = useState<ListingForm>(() => (listing ? listingFormFrom(listing) : emptyListingForm(defaultCycle)));
  const [req, setReq] = useState(() => (listing ? requirementsFormFrom(listing.requirements) : emptyRequirementsForm()));
  const [rules, setRules] = useState<{ rules: EligibilityRule[]; errors: string[] }>({
    rules: listing?.eligibility ?? [],
    errors: [],
  });
  const [slugTouched, setSlugTouched] = useState(listing !== null);
  const [statusNote, setStatusNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<ListingForm>) => setForm((f) => ({ ...f, ...patch }));
  const setName = (name: string) => set(slugTouched ? { name } : { name, slug: slugify(name) });
  const toggleFlag = (flag: ScamFlag) =>
    set({ scamFlags: form.scamFlags.includes(flag) ? form.scamFlags.filter((f) => f !== flag) : [...form.scamFlags, flag] });

  async function save() {
    setMessage(null);
    if (rules.errors.length > 0) {
      setErrors(rules.errors);
      return;
    }
    const built = toUpsertInput(current?.id ?? null, form, req, rules.rules);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      if (!current) {
        const created = await api<Scholarship>("/admin/scholarships", { body: built.input });
        router.replace(`/admin/scholarships/${created.id}`);
        return;
      }
      setCurrent(await api<Scholarship>(`/admin/scholarships/${current.id}`, { method: "PATCH", body: built.input }));
      setMessage("Saved.");
      router.refresh();
    } catch (e) {
      setErrors([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: CatalogStatus) {
    if (!current) return;
    setBusy(true);
    setErrors([]);
    setMessage(null);
    try {
      const updated = await api<Scholarship>(`/admin/scholarships/${current.id}/status`, {
        body: { status, note: statusNote.trim() },
      });
      setCurrent(updated);
      setMessage(STATUS_DONE[status] ?? "Status updated.");
      router.refresh();
    } catch (e) {
      setErrors([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.stack}>
      {errors.length > 0 ? (
        <div role="alert" className={styles.alert}>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {message ? (
        <p role="status" className={styles.ok}>
          {message}
        </p>
      ) : null}

      {current ? (
        <Card
          title="Status"
          aside={<Badge tone={current.status === "published" ? "good" : "neutral"}>{CATALOG_STATUS_LABELS[current.status]}</Badge>}
        >
          <p className={styles.sub}>
            {current.verifiedAt ? `Verified ${instantLong(current.verifiedAt, ADMIN_TZ)}.` : "Not verified yet."} Publishing records
            you and today's date. Retire and flag hide the listing everywhere.
          </p>
          <TextInput
            label="Note for the audit log"
            maxLength={1000}
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
          />
          <div className={styles.row}>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => setStatus("published")}>
              Publish
            </Button>
            <Button variant="line" size="sm" disabled={busy} onClick={() => setStatus("retired")}>
              Retire
            </Button>
            <Button variant="line" size="sm" disabled={busy} onClick={() => setStatus("flagged")}>
              Flag
            </Button>
          </div>
        </Card>
      ) : null}

      <Card title="Listing">
        <div className={styles.formGrid}>
          <TextInput label="Name" value={form.name} onChange={(e) => setName(e.target.value)} />
          <TextInput
            label="Slug"
            hint="Lowercase words joined by dashes; used in the public URL"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set({ slug: e.target.value });
            }}
          />
          <TextInput label="Provider" value={form.provider} onChange={(e) => set({ provider: e.target.value })} />
          <TextInput label="Apply URL" type="url" value={form.url} onChange={(e) => set({ url: e.target.value })} />
          <TextInput
            label="Source URL"
            type="url"
            hint="The page we checked. Defaults to the apply URL."
            value={form.sourceUrl}
            onChange={(e) => set({ sourceUrl: e.target.value })}
          />
          <TextInput label="Deadline" type="date" value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} />
          <TextInput label="Minimum amount ($)" inputMode="numeric" value={form.amountMin} onChange={(e) => set({ amountMin: e.target.value })} />
          <TextInput label="Maximum amount ($)" inputMode="numeric" value={form.amountMax} onChange={(e) => set({ amountMax: e.target.value })} />
          <TextInput label="Cycle" hint="YYYY-YY, like 2026-27" value={form.cycle} onChange={(e) => set({ cycle: e.target.value })} />
          <TextInput label="Minutes to apply" inputMode="numeric" value={form.estMinutes} onChange={(e) => set({ estMinutes: e.target.value })} />
        </div>
        <Toggle label="Renewable" checked={form.renewable} onChange={(renewable) => set({ renewable })} />
        {form.renewable ? (
          <TextArea label="Renewal terms" rows={2} value={form.renewalTerms} onChange={(e) => set({ renewalTerms: e.target.value })} />
        ) : null}
      </Card>

      <Card title="Where">
        <Toggle label="National listing" checked={form.national} onChange={(national) => set({ national })} />
        {form.national ? null : (
          <div className={styles.formGrid}>
            <Select label="State" options={STATE_OPTIONS} value={form.state} onChange={(e) => set({ state: e.target.value })} />
            <TextInput label="Counties" hint="Separate with commas" value={form.counties} onChange={(e) => set({ counties: e.target.value })} />
            <TextInput label="Cities" hint="Separate with commas" value={form.cities} onChange={(e) => set({ cities: e.target.value })} />
          </div>
        )}
      </Card>

      <Card title="Who can apply">
        <EligibilityEditor initial={listing?.eligibility ?? []} onChange={setRules} />
      </Card>

      <Card title="Requirements">
        <RequirementsEditor value={req} onChange={setReq} />
      </Card>

      <Card title="Scam flags">
        <div className={styles.checkList}>
          {SCAM_FLAGS.map((flag) => (
            <label key={flag}>
              <input type="checkbox" checked={form.scamFlags.includes(flag)} onChange={() => toggleFlag(flag)} />
              <span>{SCAM_FLAG_TEXT[flag]}</span>
            </label>
          ))}
        </div>
        <p className={styles.sub}>Listings with a scam flag never show in the public directory or in matches.</p>
      </Card>

      <div className={styles.row}>
        <Button variant="primary" disabled={busy} onClick={save}>
          {current ? "Save changes" : "Create listing"}
        </Button>
        <Button variant="line" href="/admin/scholarships">
          Back to listings
        </Button>
      </div>
    </div>
  );
}
```

`apps/web/src/app/(admin)/admin/scholarships/page.tsx` (D36: core `admin.listScholarships`, the same call `GET /admin/scholarships` wraps; 50 per page):

```tsx
import styles from "@/components/admin/admin.module.css";
import { ADMIN_TZ, CATALOG_STATUS_LABELS, adminDeadline } from "@/components/admin/labels";
import { type SearchParams, firstParam } from "@/components/public/params";
import { cx } from "@/lib/cx";
import { instantShort, plural } from "@/lib/format";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { listScholarships } from "@scholarcrew/core/admin";
import { CatalogStatus, type Scholarship } from "@scholarcrew/domain";
import { Button, EmptyState, Table, type TableColumn } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

// R3V-10: labeled statuses, deadlines with the year, instants on the admin (Central) calendar.
const COLUMNS: TableColumn<Scholarship>[] = [
  { key: "name", header: "Listing", render: (s) => <a href={`/admin/scholarships/${s.id}`}>{s.name}</a> },
  { key: "provider", header: "Provider" },
  { key: "status", header: "Status", render: (s) => CATALOG_STATUS_LABELS[s.status] },
  { key: "deadline", header: "Deadline", render: (s) => adminDeadline(s.deadline) },
  { key: "verifiedAt", header: "Verified", render: (s) => (s.verifiedAt ? instantShort(s.verifiedAt, ADMIN_TZ) : "Never") },
];

export default async function AdminScholarshipsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor(["admin"]);
  const sp = await searchParams;
  const parsed = CatalogStatus.safeParse(firstParam(sp, "status"));
  const status = parsed.success ? parsed.data : undefined;
  const q = (firstParam(sp, "q") ?? "").trim().slice(0, 100);
  const asked = Number(firstParam(sp, "page"));
  const pageNo = Number.isInteger(asked) && asked >= 1 && asked <= 1000 ? asked : 1;
  const page = await listScholarships(getDeps(), actor, { status, q, page: pageNo });
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const href = (s: CatalogStatus | undefined, n = 1) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    if (n > 1) p.set("page", String(n));
    const text = p.toString();
    return text ? `/admin/scholarships?${text}` : "/admin/scholarships";
  };
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Scholarships</h1>
          <p className={styles.sub}>{`${plural(page.total, "listing")}, newest edits first`}</p>
        </div>
        <Button variant="primary" icon="plus" href="/admin/scholarships/new">
          New listing
        </Button>
      </div>
      <div className={styles.row}>
        <form method="get" action="/admin/scholarships" className={styles.row}>
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label htmlFor="admin-q">Search</label>
          <input id="admin-q" name="q" type="search" defaultValue={q} />
          <Button type="submit" variant="soft" size="sm">
            Search
          </Button>
        </form>
        <div className={styles.chips}>
          {[undefined, ...CatalogStatus.options].map((s) => (
            <a key={s ?? "all"} href={href(s)} className={cx(styles.chip, s === status && styles.chipOn)}>
              {s ? CATALOG_STATUS_LABELS[s] : "All"}
            </a>
          ))}
        </div>
      </div>
      {page.items.length === 0 ? (
        <EmptyState title="No listings match" icon="search">
          Try another status or search.
        </EmptyState>
      ) : (
        <Table columns={COLUMNS} rows={page.items} rowKey={(s) => s.id} caption="Listings" />
      )}
      {pages > 1 ? (
        <nav className={styles.row} aria-label="Pages">
          <span>{`Page ${page.page} of ${pages}`}</span>
          {page.page > 1 ? <a href={href(status, page.page - 1)}>Previous</a> : null}
          {page.page < pages ? <a href={href(status, page.page + 1)}>Next</a> : null}
        </nav>
      ) : null}
    </>
  );
}
```

`apps/web/src/app/(admin)/admin/scholarships/new/page.tsx`:

```tsx
import { ScholarshipEditor } from "@/components/admin/ScholarshipEditor";
import styles from "@/components/admin/admin.module.css";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { currentSeason } from "@scholarcrew/core/shared";

export const dynamic = "force-dynamic";

export default async function NewScholarshipPage() {
  await requirePageActor(["admin"]);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>New listing</h1>
          <p className={styles.sub}>New listings start as drafts. Publish them from the status card after saving.</p>
        </div>
      </div>
      <ScholarshipEditor listing={null} defaultCycle={currentSeason(getDeps().clock.now())} />
    </>
  );
}
```

`apps/web/src/app/(admin)/admin/scholarships/[id]/page.tsx`:

```tsx
import { ScholarshipEditor } from "@/components/admin/ScholarshipEditor";
import styles from "@/components/admin/admin.module.css";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { getScholarshipForAdmin } from "@scholarcrew/core/admin";
import { currentSeason } from "@scholarcrew/core/shared";
import { type Scholarship, isAppError } from "@scholarcrew/domain";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditScholarshipPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor(["admin"]);
  const deps = getDeps();
  // D36: any status; a bad or unknown id is not_found (the same call GET /admin/scholarships/:id wraps).
  let listing: Scholarship;
  try {
    listing = await getScholarshipForAdmin(deps, actor, (await params).id);
  } catch (e) {
    if (isAppError(e) && e.code === "not_found") notFound();
    throw e;
  }
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>{listing.name}</h1>
          <p className={styles.sub}>{`${listing.provider} · /directory/s/${listing.slug}`}</p>
        </div>
      </div>
      <ScholarshipEditor listing={listing} defaultCycle={currentSeason(deps.clock.now())} />
    </>
  );
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/components/admin && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 5 files, 19 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/scholarships" apps/web/src/components/admin/labels.ts apps/web/src/components/admin/listingForm.ts apps/web/src/components/admin/listingForm.test.ts apps/web/src/components/admin/RequirementsEditor.tsx apps/web/src/components/admin/ScholarshipEditor.tsx apps/web/src/components/admin/ScholarshipEditor.test.tsx
git commit -m "feat(web): admin scholarship editor with rules, requirements, and status actions"
```

### R14: Review queue with field quotes, code checks, and the publish flow (AD-01, CA-03, CA-04)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/admin/review.test.ts`:

```ts
import { type CatalogTask, type ListingDraft, type Scholarship, ScholarshipUpsertInput, type VerificationReport } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { draftOf, fieldRows, publishDefaults, publishInput, reportOf, taskChip, taskTitle } from "./review";

const DRAFT: ListingDraft = {
  name: "Pecan Valley Co-op Scholarship",
  provider: "Pecan Valley Electric Cooperative",
  url: "https://pecanvalley.example/scholarships",
  amountMinUsd: null,
  amountMaxUsd: 1500,
  renewable: null,
  deadline: "2027-03-01",
  applicationFeeUsd: 0,
  localArea: { national: false, state: "TX", counties: ["Maple", "Pecan"], cities: [] },
  eligibility: [{ type: "county_in", state: "TX", counties: ["Maple", "Pecan"] }],
  requirements: { essays: [{ prompt: "Energy in your community", wordLimit: 300 }], recommendations: 0, transcript: false, serviceHours: null, other: [] },
  fieldQuotes: [
    { field: "amountMaxUsd", quote: "awards four $1,500 scholarships each spring" },
    { field: "requirements", quote: "a 300-word essay on energy in your community" },
  ],
};
const REPORT: VerificationReport = {
  ok: false,
  issues: [{ code: "quote_not_found", field: "requirements", message: 'Quote not found on the page: "a 300-word essay"' }],
  scamFlags: [],
};
const TASK: CatalogTask = {
  id: "44444444-4444-4444-8444-444444444444",
  kind: "research_candidate",
  status: "open",
  scholarshipId: null,
  payload: {
    type: "research_candidate",
    url: "https://pecanvalley.example/scholarships",
    title: "Scholarships | Pecan Valley",
    snippet: "Four awards each spring",
    state: "TX",
    county: "Maple",
    draft: DRAFT,
    report: REPORT,
  },
  createdById: null,
  resolvedById: null,
  resolutionNote: "",
  createdAt: "2026-10-05T23:42:00.000Z",
  resolvedAt: null,
};

describe("task labels", () => {
  it("titles and summarizes each kind", () => {
    expect(taskTitle(TASK)).toBe("Pecan Valley Co-op Scholarship");
    expect(taskChip(TASK)).toEqual({ tone: "crit", icon: "alert", text: "1 issue" });
    const report: CatalogTask = {
      ...TASK,
      kind: "report",
      payload: { type: "report", reportId: TASK.id, reason: "dead_link", details: "" },
    };
    expect(taskTitle(report)).toBe("Report: Dead link");
    expect(taskChip(report)).toEqual({ tone: "warn", icon: "alert", text: "Dead link" });
    const submission: CatalogTask = {
      ...TASK,
      kind: "user_submission",
      payload: { type: "user_submission", url: "https://x.example", name: "Garden Club Award", notes: "", submittedById: TASK.id },
    };
    expect(taskTitle(submission)).toBe("Garden Club Award");
    expect(taskChip(submission).text).toBe("Only the student sees it");
    expect(taskChip({ ...TASK, payload: { ...TASK.payload, report: { ok: true, issues: [], scamFlags: [] } } as CatalogTask["payload"] })).toEqual({
      tone: "ok",
      icon: "check",
      text: "No issues",
    });
  });
});

describe("fieldRows", () => {
  it("pairs each field with its quote and the quote check", () => {
    const rows = fieldRows(DRAFT, REPORT);
    const by = (field: string) => rows.find((r) => r.field === field);
    expect(by("amountMaxUsd")).toMatchObject({ value: "$1,500", quote: "awards four $1,500 scholarships each spring", check: "found" });
    expect(by("requirements")).toMatchObject({ value: "1 essay (300 words)", check: "not_found" });
    expect(by("renewable")).toMatchObject({ value: "Not stated", quote: null, check: "none" });
    expect(by("eligibility")?.value).toBe("Lives in Maple, Pecan counties, TX");
    expect(by("applicationFeeUsd")?.value).toBe("None");
    const changed = fieldRows({ ...DRAFT, deadline: "2027-03-15" }, null, DRAFT);
    expect(changed.find((r) => r.field === "deadline")).toMatchObject({ before: "Mar 1, 2027", value: "Mar 15, 2027", changed: true });
    expect(changed.find((r) => r.field === "name")?.changed).toBe(false);
  });
});

describe("publishInput", () => {
  it("builds a valid listing from a research draft", () => {
    const defaults = publishDefaults(TASK, DRAFT, null, "2026-27");
    expect(defaults).toEqual({ slug: "pecan-valley-co-op-scholarship", cycle: "2026-27", estMinutes: "60" });
    const out = publishInput(TASK, DRAFT, defaults, null);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(ScholarshipUpsertInput.safeParse(out.input).success).toBe(true);
    expect(out.input).toMatchObject({
      id: null,
      slug: "pecan-valley-co-op-scholarship",
      amountMinUsd: 1500,
      amountMaxUsd: 1500,
      renewable: false,
      sourceUrl: "https://pecanvalley.example/scholarships",
      eligibility: DRAFT.eligibility,
      scamFlags: [],
    });
    const missing = publishInput(TASK, { ...DRAFT, amountMaxUsd: null }, defaults, null);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors).toContain("Maximum amount: use whole dollars.");
  });

  it("updates the existing listing for a changed re-check", () => {
    const existing = {
      id: "55555555-5555-4555-8555-555555555555",
      slug: "pecan-valley",
      sourceUrl: "https://pecanvalley.example/old",
      cycle: "2025-26",
      estMinutes: 45,
      renewalTerms: "",
      scamFlags: [],
    } as unknown as Scholarship;
    const recheck: CatalogTask = {
      ...TASK,
      kind: "recheck_changed",
      scholarshipId: existing.id,
      payload: { type: "recheck_changed", url: TASK.payload.type === "research_candidate" ? TASK.payload.url : "", before: DRAFT, after: DRAFT, report: null },
    };
    const defaults = publishDefaults(recheck, DRAFT, existing, "2026-27");
    expect(defaults).toEqual({ slug: "pecan-valley", cycle: "2025-26", estMinutes: "45" });
    const out = publishInput(recheck, DRAFT, defaults, existing);
    expect(out).toMatchObject({ ok: true, input: { id: existing.id, slug: "pecan-valley", sourceUrl: "https://pecanvalley.example/old" } });
  });
});

describe("submissions (R2C-6)", () => {
  it("reads the extracted draft and report from a user_submission and updates its placeholder listing", () => {
    const payload = {
      type: "user_submission" as const,
      url: "https://pecanvalley.example/scholarships",
      name: "Garden Club Award",
      notes: "",
      submittedById: "77777777-7777-4777-8777-777777777777",
    };
    const bare: CatalogTask = { ...TASK, kind: "user_submission", scholarshipId: "55555555-5555-4555-8555-555555555555", payload };
    expect(draftOf(bare)).toBeNull();
    expect(reportOf(bare)).toBeNull();
    expect(draftOf({ ...bare, payload: { ...payload, draft: null, report: null } })).toBeNull();
    const extracted: CatalogTask = { ...bare, payload: { ...payload, draft: DRAFT, report: REPORT } };
    expect(draftOf(extracted)).toEqual(DRAFT);
    expect(reportOf(extracted)).toEqual(REPORT);
    const placeholder = {
      id: "55555555-5555-4555-8555-555555555555",
      slug: "garden-club-award-k3f9",
      sourceUrl: "https://pecanvalley.example/scholarships",
      cycle: "2026-27",
      estMinutes: 60,
      renewalTerms: "",
      scamFlags: [],
    } as unknown as Scholarship;
    const defaults = publishDefaults(extracted, DRAFT, placeholder, "2026-27");
    expect(defaults.slug).toBe("garden-club-award-k3f9");
    const out = publishInput(extracted, DRAFT, defaults, placeholder);
    expect(out).toMatchObject({
      ok: true,
      input: { id: placeholder.id, slug: "garden-club-award-k3f9", provider: "Pecan Valley Electric Cooperative", amountMaxUsd: 1500 },
    });
  });
});
```

`apps/web/src/components/admin/TaskReview.test.tsx`:

```tsx
// @vitest-environment jsdom
import {
  type CatalogTask,
  type ListingDraft,
  type Scholarship,
  ScholarshipUpsertInput,
  type VerificationReport,
} from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskReview } from "./TaskReview";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DRAFT: ListingDraft = {
  name: "Pecan Valley Co-op Scholarship",
  provider: "Pecan Valley Electric Cooperative",
  url: "https://pecanvalley.example/scholarships",
  amountMinUsd: null,
  amountMaxUsd: 1500,
  renewable: null,
  deadline: "2027-03-01",
  applicationFeeUsd: 0,
  localArea: { national: false, state: "TX", counties: ["Maple", "Pecan"], cities: [] },
  eligibility: [{ type: "county_in", state: "TX", counties: ["Maple", "Pecan"] }],
  requirements: { essays: [{ prompt: "Energy in your community", wordLimit: 300 }], recommendations: 0, transcript: false, serviceHours: null, other: [] },
  fieldQuotes: [
    { field: "amountMaxUsd", quote: "awards four $1,500 scholarships each spring" },
    { field: "requirements", quote: "a 300-word essay on energy in your community" },
  ],
};
const REPORT: VerificationReport = {
  ok: false,
  issues: [
    { code: "quote_not_found", field: "requirements", message: 'Quote not found on the page: "a 300-word essay"' },
    { code: "scam_signal", field: null, message: "A linked search service charges a fee." },
  ],
  scamFlags: ["pay_for_info"],
};
const TASK: CatalogTask = {
  id: "44444444-4444-4444-8444-444444444444",
  kind: "research_candidate",
  status: "open",
  scholarshipId: null,
  payload: {
    type: "research_candidate",
    url: "https://pecanvalley.example/scholarships",
    title: "Scholarships | Pecan Valley",
    snippet: "Four awards each spring",
    state: "TX",
    county: "Maple",
    draft: DRAFT,
    report: REPORT,
  },
  createdById: null,
  resolvedById: null,
  resolutionNote: "",
  // 9 pm Central on Oct 6 (Oct 7 in UTC), so "Opened" proves the admin calendar (R3V-10).
  createdAt: "2026-10-07T02:00:00.000Z",
  resolvedAt: null,
};
const CREATED = { id: "55555555-5555-4555-8555-555555555555", name: "Pecan Valley Co-op Scholarship" } as Scholarship;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

type Call = { url: string; method: string; body: unknown };
function recorder(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    return handler(call);
  });
  return { fn, calls };
}

describe("TaskReview", () => {
  it("shows extracted fields beside their quotes, the quote-not-found issue, and scam flags", () => {
    render(<TaskReview task={TASK} existing={null} defaultCycle="2026-27" />);
    const table = screen.getByRole("table", { name: "Extracted fields" });
    const reqRow = within(table).getByText("Requirements").closest("tr");
    if (!reqRow) throw new Error("requirements row missing");
    expect(within(reqRow).getByText("Not on page")).toBeTruthy();
    const amountRow = within(table).getByText("Maximum amount").closest("tr");
    if (!amountRow) throw new Error("amount row missing");
    expect(within(amountRow).getByText("Found")).toBeTruthy();
    const checks = screen.getByRole("region", { name: "Checks run by code" });
    expect(within(checks).getByText('Quote not found on the page: "a 300-word essay"')).toBeTruthy();
    expect(within(checks).getByText("A linked search service charges a fee.")).toBeTruthy();
    expect(within(checks).getByText("Sells scholarship information you can get free.")).toBeTruthy();
    expect(screen.getByText(/^Opened Oct 6, 2026/)).toBeTruthy();
    // R3A-24: CatalogTaskResolution.note is max 1000.
    expect(screen.getByLabelText("Decision note").getAttribute("maxlength")).toBe("1000");
  });

  it("shows a 409 as already closed: the message, no live buttons, and a refresh (R3A-21)", async () => {
    const { fn, calls } = recorder(() => json({ error: { code: "conflict", message: "This task is already closed" } }, 409));
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={TASK} existing={null} defaultCycle="2026-27" />);
    fireEvent.change(screen.getByLabelText("Decision note"), { target: { value: "Last year's cycle" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("This task is already closed"));
    expect(nav.router.refresh).toHaveBeenCalledTimes(1);
    for (const name of ["Publish", "Reject"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(calls).toHaveLength(1);
  });

  it("publishes by creating the listing, then resolving the task with its id, and retries without a duplicate", async () => {
    let resolveFails = true;
    const { fn, calls } = recorder((c) => {
      if (c.url.endsWith("/resolve")) {
        if (resolveFails) {
          resolveFails = false;
          return json({ error: { code: "internal", message: "Try again" } }, 500);
        }
        return json({ ...TASK, status: "resolved" });
      }
      return json(CREATED, c.method === "POST" ? 201 : 200);
    });
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={TASK} existing={null} defaultCycle="2026-27" />);
    fireEvent.change(screen.getByLabelText("Decision note"), { target: { value: "Checked the page" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Try again"));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByText("Published Pecan Valley Co-op Scholarship.")).toBeTruthy());

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/v1/admin/scholarships",
      `POST /api/v1/admin/catalog-tasks/${TASK.id}/resolve`,
      `PATCH /api/v1/admin/scholarships/${CREATED.id}`,
      `POST /api/v1/admin/catalog-tasks/${TASK.id}/resolve`,
    ]);
    expect(ScholarshipUpsertInput.safeParse(calls[0]?.body).success).toBe(true);
    expect(calls[0]?.body).toMatchObject({ slug: "pecan-valley-co-op-scholarship", scamFlags: ["pay_for_info"] });
    expect(calls[3]?.body).toEqual({ status: "resolved", note: "Checked the page", publishScholarshipId: CREATED.id });
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("needs a reason to reject, then rejects without publishing", async () => {
    const { fn, calls } = recorder(() => json({ ...TASK, status: "rejected" }));
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={TASK} existing={null} defaultCycle="2026-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByRole("alert").textContent).toContain("Add a reason before rejecting.");
    expect(calls).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Decision note"), { target: { value: "Last year's cycle" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(screen.getByText("Rejected.")).toBeTruthy());
    expect(calls).toEqual([
      {
        url: `/api/v1/admin/catalog-tasks/${TASK.id}/resolve`,
        method: "POST",
        body: { status: "rejected", note: "Last year's cycle", publishScholarshipId: null },
      },
    ]);
  });

  it("updates the existing listing for a changed re-check and shows what changed", async () => {
    const existing = {
      ...CREATED,
      slug: "pecan-valley",
      sourceUrl: "https://pecanvalley.example/scholarships",
      cycle: "2026-27",
      estMinutes: 45,
      renewalTerms: "",
      scamFlags: [],
    } as Scholarship;
    const recheck: CatalogTask = {
      ...TASK,
      kind: "recheck_changed",
      scholarshipId: existing.id,
      payload: {
        type: "recheck_changed",
        url: "https://pecanvalley.example/scholarships",
        before: DRAFT,
        after: { ...DRAFT, deadline: "2027-03-15" },
        report: null,
      },
    };
    const { fn, calls } = recorder((c) => (c.url.endsWith("/resolve") ? json({ ...recheck, status: "resolved" }) : json(existing)));
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={recheck} existing={existing} defaultCycle="2026-27" />);
    const deadlineRow = screen.getByText("Deadline").closest("tr");
    if (!deadlineRow) throw new Error("deadline row missing");
    expect(within(deadlineRow).getByText("Mar 1, 2027")).toBeTruthy();
    expect(within(deadlineRow).getByText("Mar 15, 2027")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).toMatchObject({ method: "PATCH", url: `/api/v1/admin/scholarships/${existing.id}` });
    expect(calls[0]?.body).toMatchObject({ id: existing.id, slug: "pecan-valley", deadline: "2027-03-15" });
  });

  it("resolves a report through the report endpoint", async () => {
    const reportId = "66666666-6666-4666-8666-666666666666";
    const report: CatalogTask = {
      ...TASK,
      kind: "report",
      scholarshipId: CREATED.id,
      payload: { type: "report", reportId, reason: "wrong_deadline", details: "Site now says Oct 16" },
    };
    const { fn, calls } = recorder(() => json({ id: reportId, status: "resolved" }));
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={report} existing={null} defaultCycle="2026-27" />);
    expect(screen.getByText("Site now says Oct 16")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the listing" }).getAttribute("href")).toBe(`/admin/scholarships/${CREATED.id}`);
    fireEvent.change(screen.getByLabelText("Decision note"), { target: { value: "Deadline fixed" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve report" }));
    await waitFor(() => expect(screen.getByText("Report resolved.")).toBeTruthy());
    expect(calls).toEqual([
      { url: `/api/v1/admin/reports/${reportId}/resolve`, method: "POST", body: { status: "resolved", note: "Deadline fixed" } },
    ]);
  });

  const SUBMITTER = "77777777-7777-4777-8777-777777777777";

  it("shows a submission's extracted fields and checks, and Publish PATCHes the submitted listing before resolving (R2C-6)", async () => {
    const placeholder = {
      ...CREATED,
      slug: "garden-club-award-k3f9",
      sourceUrl: "https://pecanvalley.example/scholarships",
      cycle: "2026-27",
      estMinutes: 60,
      renewalTerms: "",
      scamFlags: [],
    } as Scholarship;
    const submission: CatalogTask = {
      ...TASK,
      kind: "user_submission",
      scholarshipId: placeholder.id,
      payload: {
        type: "user_submission",
        url: "https://pecanvalley.example/scholarships",
        name: "Garden Club Award",
        notes: "From the counselor's flyer",
        submittedById: SUBMITTER,
        draft: DRAFT,
        report: REPORT,
      },
    };
    const { fn, calls } = recorder((c) => (c.url.endsWith("/resolve") ? json({ ...submission, status: "resolved" }) : json(placeholder)));
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={submission} existing={placeholder} defaultCycle="2026-27" />);
    const table = screen.getByRole("table", { name: "Extracted fields" });
    const amountRow = within(table).getByText("Maximum amount").closest("tr");
    if (!amountRow) throw new Error("amount row missing");
    expect(within(amountRow).getByText("$1,500")).toBeTruthy();
    const checks = screen.getByRole("region", { name: "Checks run by code" });
    expect(within(checks).getByText("Sells scholarship information you can get free.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Publish" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByText("Published Pecan Valley Co-op Scholarship.")).toBeTruthy());
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `PATCH /api/v1/admin/scholarships/${placeholder.id}`,
      `POST /api/v1/admin/catalog-tasks/${submission.id}/resolve`,
    ]);
    expect(ScholarshipUpsertInput.safeParse(calls[0]?.body).success).toBe(true);
    expect(calls[0]?.body).toMatchObject({
      id: placeholder.id,
      slug: "garden-club-award-k3f9",
      provider: "Pecan Valley Electric Cooperative",
      amountMaxUsd: 1500,
      scamFlags: ["pay_for_info"],
    });
    expect(calls[1]?.body).toEqual({ status: "resolved", note: "", publishScholarshipId: placeholder.id });
  });

  it("offers plain Publish for a submission the extractor hasn't read", async () => {
    const submission: CatalogTask = {
      ...TASK,
      kind: "user_submission",
      scholarshipId: CREATED.id,
      payload: { type: "user_submission", url: "https://x.example", name: "Garden Club Award", notes: "", submittedById: SUBMITTER },
    };
    const { fn, calls } = recorder(() => json({ ...submission, status: "resolved" }));
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={submission} existing={null} defaultCycle="2026-27" />);
    expect(screen.queryByRole("table", { name: "Extracted fields" })).toBeNull();
    expect(screen.getByText(/The page hasn't been read yet/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Publish" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByText("Published Garden Club Award.")).toBeTruthy());
    expect(calls).toEqual([
      {
        url: `/api/v1/admin/catalog-tasks/${submission.id}/resolve`,
        method: "POST",
        body: { status: "resolved", note: "", publishScholarshipId: CREATED.id },
      },
    ]);
  });

  it("keeps or retires a re-checked listing instead of rejecting it (R2C-7)", async () => {
    const recheck: CatalogTask = {
      ...TASK,
      kind: "recheck_changed",
      scholarshipId: CREATED.id,
      payload: {
        type: "recheck_changed",
        url: "https://pecanvalley.example/scholarships",
        before: DRAFT,
        after: { ...DRAFT, deadline: "2027-03-15" },
        report: null,
      },
    };
    const { fn, calls } = recorder((c) => (c.url.endsWith("/resolve") ? json({ ...recheck, status: "resolved" }) : json({ ...CREATED, status: "retired" })));
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={recheck} existing={null} defaultCycle="2026-27" />);
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.getByRole("button", { name: "Keep current listing" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retire listing" }));
    expect(screen.getByRole("alert").textContent).toContain("Add a reason before retiring the listing.");
    expect(calls).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Decision note"), { target: { value: "The program ended" } });
    fireEvent.click(screen.getByRole("button", { name: "Retire listing" }));
    await waitFor(() => expect(screen.getByText("Listing retired.")).toBeTruthy());
    expect(calls).toEqual([
      { url: `/api/v1/admin/scholarships/${CREATED.id}/status`, method: "POST", body: { status: "retired", note: "The program ended" } },
      {
        url: `/api/v1/admin/catalog-tasks/${recheck.id}/resolve`,
        method: "POST",
        body: { status: "resolved", note: "The program ended", publishScholarshipId: null },
      },
    ]);

    // Keeping the listing is one call: core puts a stale listing back to published (08 H11).
    cleanup();
    calls.length = 0;
    render(<TaskReview task={recheck} existing={null} defaultCycle="2026-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Keep current listing" }));
    await waitFor(() => expect(screen.getByText("Kept the current listing.")).toBeTruthy());
    expect(calls).toEqual([
      { url: `/api/v1/admin/catalog-tasks/${recheck.id}/resolve`, method: "POST", body: { status: "rejected", note: "", publishScholarshipId: null } },
    ]);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/components/admin/review src/components/admin/TaskReview`
Expected: FAIL with `Failed to resolve import "./review"` and `Failed to resolve import "./TaskReview"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/admin/review.ts`:

```ts
import { calendarLong } from "@/components/public/dates";
import { describeRule } from "@/components/public/listings";
import { plural, usd } from "@/lib/format";
import {
  type CatalogTask,
  type CatalogTaskKind,
  type CatalogTaskStatus,
  type ListingDraft,
  type ReportReason,
  type Scholarship,
  type ScholarshipRequirements,
  ScholarshipUpsertInput,
  type VerificationReport,
  localLabel,
} from "@scholarcrew/domain";
import type { IconName } from "@scholarcrew/ui";
import { issuesToErrors, slugify } from "./listingForm";

export const KIND_LABELS: Record<CatalogTaskKind, string> = {
  research_candidate: "Research",
  user_submission: "Submission",
  report: "Report",
  recheck_changed: "Stale",
  import: "Import",
};

export const STATUS_LABELS: Record<CatalogTaskStatus, string> = {
  open: "Open",
  in_review: "In review",
  resolved: "Resolved",
  rejected: "Rejected",
};

export const REASON_LABELS: Record<ReportReason, string> = {
  wrong_deadline: "Wrong deadline",
  dead_link: "Dead link",
  scam: "Looks like a scam",
  wrong_amount: "Wrong amount",
  other: "Other problem",
};

/**
 * The draft to review: the research extraction, the re-check's new version, or what catalog extraction read from a
 * student's submitted page (R2C-6, plan 11 K6). A submission's placeholder listing is never the draft.
 */
export function draftOf(t: CatalogTask): ListingDraft | null {
  if (t.payload.type === "research_candidate") return t.payload.draft;
  if (t.payload.type === "recheck_changed") return t.payload.after;
  if (t.payload.type === "user_submission") return t.payload.draft ?? null;
  return null;
}

export function reportOf(t: CatalogTask): VerificationReport | null {
  if (t.payload.type === "research_candidate" || t.payload.type === "recheck_changed") return t.payload.report;
  if (t.payload.type === "user_submission") return t.payload.report ?? null;
  return null;
}

export function sourceUrlOf(t: CatalogTask): string | null {
  const p = t.payload;
  return p.type === "research_candidate" || p.type === "recheck_changed" || p.type === "user_submission" ? p.url : null;
}

export function taskTitle(t: CatalogTask): string {
  const p = t.payload;
  switch (p.type) {
    case "research_candidate":
      return p.draft?.name || p.title || p.url;
    case "user_submission":
      return p.name;
    case "report":
      return `Report: ${REASON_LABELS[p.reason]}`;
    case "recheck_changed":
      return p.after?.name ?? p.before?.name ?? p.url;
    case "import":
      return p.summary;
  }
}

export type TaskChip = { tone: "ok" | "warn" | "crit" | "info"; icon: IconName; text: string };

export function taskChip(t: CatalogTask): TaskChip {
  const p = t.payload;
  if (p.type === "report") return { tone: "warn", icon: "alert", text: REASON_LABELS[p.reason] };
  if (p.type === "user_submission") return { tone: "info", icon: "lock", text: "Only the student sees it" };
  if (p.type === "import") return { tone: "info", icon: "info", text: "Import" };
  const report = reportOf(t);
  if (!report) return { tone: "info", icon: "clock", text: p.type === "recheck_changed" ? "Page changed" : "Not checked yet" };
  const n = report.issues.length;
  return n > 0 ? { tone: "crit", icon: "alert", text: plural(n, "issue") } : { tone: "ok", icon: "check", text: "No issues" };
}

function requirementsText(r: ScholarshipRequirements): string {
  const parts: string[] = [];
  const first = r.essays[0];
  if (r.essays.length === 1 && first) parts.push(first.wordLimit ? `1 essay (${first.wordLimit} words)` : "1 essay");
  else if (r.essays.length > 1) parts.push(plural(r.essays.length, "essay"));
  if (r.recommendations > 0) parts.push(plural(r.recommendations, "recommendation"));
  if (r.transcript) parts.push("transcript");
  if (r.serviceHours) parts.push(`${r.serviceHours} service hours`);
  parts.push(...r.other);
  return parts.length > 0 ? parts.join(" · ") : "Application form only";
}

const NOT_STATED = "Not stated";
const money = (n: number | null) => (n === null ? NOT_STATED : usd(n));

const FIELDS: Array<{ field: keyof ListingDraft; label: string; show: (d: ListingDraft) => string }> = [
  { field: "name", label: "Name", show: (d) => d.name || NOT_STATED },
  { field: "provider", label: "Provider", show: (d) => d.provider || NOT_STATED },
  { field: "url", label: "Apply URL", show: (d) => d.url || NOT_STATED },
  { field: "amountMinUsd", label: "Minimum amount", show: (d) => money(d.amountMinUsd) },
  { field: "amountMaxUsd", label: "Maximum amount", show: (d) => money(d.amountMaxUsd) },
  { field: "renewable", label: "Renewable", show: (d) => (d.renewable === null ? NOT_STATED : d.renewable ? "Yes" : "No") },
  { field: "deadline", label: "Deadline", show: (d) => (d.deadline ? calendarLong(d.deadline) : NOT_STATED) },
  {
    field: "applicationFeeUsd",
    label: "Fee to apply",
    show: (d) => (d.applicationFeeUsd === null ? NOT_STATED : d.applicationFeeUsd === 0 ? "None" : usd(d.applicationFeeUsd)),
  },
  { field: "localArea", label: "Where", show: (d) => localLabel(d.localArea) },
  {
    field: "eligibility",
    label: "Who can apply",
    show: (d) => (d.eligibility.length > 0 ? d.eligibility.map(describeRule).join("; ") : "Anyone in the area above"),
  },
  { field: "requirements", label: "Requirements", show: (d) => requirementsText(d.requirements) },
];

export interface FieldRow {
  field: string;
  label: string;
  value: string;
  before: string | null;
  changed: boolean;
  quote: string | null;
  check: "found" | "not_found" | "none";
  problem: string | null;
}

/** One row per draft field: the value, the supporting quote, and what the code checks found (CA-03). */
export function fieldRows(draft: ListingDraft, report: VerificationReport | null, before: ListingDraft | null = null): FieldRow[] {
  return FIELDS.map((f) => {
    const quote = draft.fieldQuotes.find((q) => q.field === f.field)?.quote ?? null;
    const issues = report?.issues.filter((i) => i.field === f.field) ?? [];
    const value = f.show(draft);
    const beforeValue = before ? f.show(before) : null;
    return {
      field: f.field,
      label: f.label,
      value,
      before: beforeValue,
      changed: beforeValue !== null && beforeValue !== value,
      quote,
      check: issues.some((i) => i.code === "quote_not_found") ? "not_found" : quote ? "found" : "none",
      problem: issues.find((i) => i.code !== "quote_not_found")?.message ?? null,
    };
  });
}

export interface PublishFields {
  slug: string;
  cycle: string;
  estMinutes: string;
}

export function publishDefaults(t: CatalogTask, draft: ListingDraft, existing: Scholarship | null, defaultCycle: string): PublishFields {
  if (existing) return { slug: existing.slug, cycle: existing.cycle, estMinutes: String(existing.estMinutes) };
  return { slug: slugify(draft.name || taskTitle(t)), cycle: defaultCycle, estMinutes: "60" };
}

export type PublishPlan = { ok: true; input: ScholarshipUpsertInput } | { ok: false; errors: string[] };

/**
 * The listing to create (research) or update (re-check, or a submission's placeholder row, R2C-6) before the task
 * resolves with publishScholarshipId. With `existing`, its id, slug, and source URL are kept.
 */
export function publishInput(t: CatalogTask, draft: ListingDraft, o: PublishFields, existing: Scholarship | null): PublishPlan {
  const source = sourceUrlOf(t) ?? draft.url;
  const minutes = Number(o.estMinutes.trim());
  const renewable = draft.renewable ?? existing?.renewable ?? false;
  const parsed = ScholarshipUpsertInput.safeParse({
    id: existing?.id ?? null,
    slug: o.slug.trim(),
    name: draft.name || existing?.name || "",
    provider: draft.provider || existing?.provider || "",
    url: draft.url || existing?.url || source,
    sourceUrl: existing?.sourceUrl ?? source,
    amountMinUsd: draft.amountMinUsd ?? draft.amountMaxUsd ?? existing?.amountMinUsd ?? Number.NaN,
    amountMaxUsd: draft.amountMaxUsd ?? existing?.amountMaxUsd ?? Number.NaN,
    renewable,
    renewalTerms: renewable ? (existing?.renewalTerms ?? "") : "",
    deadline: draft.deadline ?? existing?.deadline ?? null,
    cycle: o.cycle.trim(),
    localArea: draft.localArea,
    eligibility: draft.eligibility,
    requirements: draft.requirements,
    estMinutes: Number.isInteger(minutes) ? minutes : Number.NaN,
    scamFlags: reportOf(t)?.scamFlags ?? existing?.scamFlags ?? [],
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, errors: issuesToErrors(parsed.error.issues) };
}
```

`apps/web/src/components/admin/TaskReview.tsx`:

```tsx
"use client";

import { safeHref } from "@/lib/format";
import { instantLong } from "@/components/public/dates";
import { ApiError, api, errorMessage } from "@/lib/api";
import { type CatalogTask, SCAM_FLAG_TEXT, type Scholarship } from "@scholarcrew/domain";
import { Badge, Button, Card, EmptyState, Icon, TextArea, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./admin.module.css";
import { ADMIN_TZ } from "./labels";
import {
  KIND_LABELS,
  REASON_LABELS,
  STATUS_LABELS,
  draftOf,
  fieldRows,
  publishDefaults,
  publishInput,
  reportOf,
  sourceUrlOf,
  taskTitle,
} from "./review";

const CHECK_TEXT = { found: "Found", not_found: "Not on page", none: "Not stated on the page" } as const;


/** Mockup 18: fields beside quotes, code checks, and the decision (only an admin publishes, CA-04). */
export function TaskReview({ task, existing, defaultCycle }: { task: CatalogTask; existing: Scholarship | null; defaultCycle: string }) {
  const router = useRouter();
  const draft = draftOf(task);
  const report = reportOf(task);
  const before = task.payload.type === "recheck_changed" ? task.payload.before : null;
  const [fields, setFields] = useState(() =>
    draft ? publishDefaults(task, draft, existing, defaultCycle) : { slug: "", cycle: defaultCycle, estMinutes: "60" },
  );
  const [note, setNote] = useState("");
  // A submission's placeholder listing already exists (task.scholarshipId), so its draft Publish PATCHes it (R2C-6).
  const [createdId, setCreatedId] = useState<string | null>(
    existing?.id ?? (task.payload.type === "user_submission" ? task.scholarshipId : null),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // R3A-21: set when the server says the task or report is already closed (409).
  const [closed, setClosed] = useState(false);
  const locked = busy || done !== null || closed;
  const open = task.status === "open" || task.status === "in_review";
  const recheck = task.payload.type === "recheck_changed";
  const source = safeHref(sourceUrlOf(task));

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setErrors([]);
    try {
      setDone(await action());
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict") {
        // Another admin closed it, or our earlier resolve landed and its response was lost.
        setErrors([e.message]);
        setClosed(true);
        router.refresh();
        return;
      }
      setErrors([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  }

  const resolveTask = (status: "resolved" | "rejected", publishScholarshipId: string | null) =>
    api<CatalogTask>(`/admin/catalog-tasks/${task.id}/resolve`, {
      body: { status, note: note.trim(), publishScholarshipId },
    });

  function publishDraft() {
    if (!draft) return;
    const plan = publishInput(task, draft, fields, existing);
    if (!plan.ok) {
      setErrors(plan.errors);
      return;
    }
    void run(async () => {
      // Create once; a retry after a failed resolve updates the listing it already created.
      const listing = createdId
        ? await api<Scholarship>(`/admin/scholarships/${createdId}`, { method: "PATCH", body: { ...plan.input, id: createdId } })
        : await api<Scholarship>("/admin/scholarships", { body: plan.input });
      setCreatedId(listing.id);
      await resolveTask("resolved", listing.id);
      return `Published ${listing.name}.`;
    });
  }

  /** Only a submission that extraction hasn't read yet publishes its row as is; with a draft, publishDraft runs. */
  function publishSubmission() {
    const id = task.scholarshipId;
    if (!id) return;
    void run(async () => {
      await resolveTask("resolved", id);
      return `Published ${taskTitle(task)}.`;
    });
  }

  function reject() {
    if (!note.trim()) {
      setErrors(["Add a reason before rejecting."]);
      return;
    }
    void run(async () => {
      await resolveTask("rejected", null);
      return "Rejected.";
    });
  }

  /** R2C-7: rejecting a re-check keeps the listing; core puts a stale listing back to published with a fresh check. */
  function keepListing() {
    void run(async () => {
      await resolveTask("rejected", null);
      return "Kept the current listing.";
    });
  }

  /**
   * R2C-7: retire the listing first, then resolve the task without publishing anything.
   * A retry of the resolve after a lost response gets 409; the item is shown closed.
   */
  function retireListing() {
    const id = task.scholarshipId;
    if (!id) return;
    if (!note.trim()) {
      setErrors(["Add a reason before retiring the listing."]);
      return;
    }
    void run(async () => {
      await api<Scholarship>(`/admin/scholarships/${id}/status`, { body: { status: "retired", note: note.trim() } });
      await resolveTask("resolved", null);
      return "Listing retired.";
    });
  }

  function closeReport(status: "resolved" | "rejected") {
    if (task.payload.type !== "report") return;
    if (!note.trim()) {
      setErrors(["Add a note before closing the report."]);
      return;
    }
    const reportId = task.payload.reportId;
    void run(async () => {
      await api(`/admin/reports/${reportId}/resolve`, { body: { status, note: note.trim() } });
      return status === "resolved" ? "Report resolved." : "Report rejected.";
    });
  }

  const rows = draft ? fieldRows(draft, report, before) : [];
  return (
    <div className={styles.stack}>
      <Card>
        <div className={styles.row}>
          <span className={styles.ttype}>{KIND_LABELS[task.kind]}</span>
          <Badge tone={open ? "neutral" : "good"}>{STATUS_LABELS[task.status]}</Badge>
          {task.kind === "research_candidate" ? <span className={styles.sub}>Not published · students can't see it</span> : null}
        </div>
        <h2>{taskTitle(task)}</h2>
        <p className={styles.sub}>
          {`Opened ${instantLong(task.createdAt, ADMIN_TZ)}`}
          {source ? (
            <>
              {" · from "}
              <a href={source}>
                {source} <Icon name="ext" />
              </a>
            </>
          ) : null}
        </p>
        {draft ? (
          <table className={styles.fields} aria-label="Extracted fields">
            <thead>
              <tr>
                <th scope="col">Field</th>
                {before ? <th scope="col">Before</th> : null}
                <th scope="col">{before ? "Now" : "Extracted"}</th>
                <th scope="col">Quoted from the page</th>
                <th scope="col">Quote check</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.field} className={r.check === "not_found" || r.problem ? styles.bad : r.changed ? styles.changed : undefined}>
                  <td>{r.label}</td>
                  {before ? <td>{r.before}</td> : null}
                  <td>
                    {r.value}
                    {r.problem ? <div className={styles.sub}>{r.problem}</div> : null}
                  </td>
                  <td className={styles.quote}>{r.quote ? `"${r.quote}"` : "Not stated on the page"}</td>
                  <td>{CHECK_TEXT[r.check]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {task.payload.type === "research_candidate" && !draft ? (
          <EmptyState title="No draft yet" icon="clock">
            The extractor hasn't produced a listing for this page. Check the issues below or reject the task.
          </EmptyState>
        ) : null}
        {task.payload.type === "user_submission" ? (
          <div className={styles.stack}>
            <p>{task.payload.notes || "No notes from the student."}</p>
            <p className={styles.sub}>Only the student who added it can see it until it's published.</p>
            {draft ? null : (
              <p className={styles.sub}>
                The page hasn't been read yet, so Publish ships the listing as the student entered it. Open the listing
                to fill in the amount, deadline, and rules first.
              </p>
            )}
          </div>
        ) : null}
        {task.payload.type === "report" ? (
          <div className={styles.stack}>
            <p>
              <b>{REASON_LABELS[task.payload.reason]}</b>
            </p>
            <p>{task.payload.details || "No details given."}</p>
          </div>
        ) : null}
        {task.payload.type === "import" ? <p>{task.payload.summary}</p> : null}
        {task.scholarshipId ? (
          <p>
            <a href={`/admin/scholarships/${task.scholarshipId}`}>Open the listing</a>
          </p>
        ) : null}
      </Card>

      {report ? (
        <section className={styles.ruleCard} aria-label="Checks run by code">
          <h3>Checks run by code</h3>
          <ul className={styles.checkList}>
            {report.issues.map((i) => (
              <li key={`${i.code}:${i.field ?? ""}:${i.message}`}>
                <Icon name="alert" /> <span>{i.message}</span>
              </li>
            ))}
            {report.scamFlags.map((f) => (
              <li key={f}>
                <Icon name="alert" /> <span>{SCAM_FLAG_TEXT[f]}</span>
              </li>
            ))}
            {report.issues.length === 0 && report.scamFlags.length === 0 ? (
              <li>
                <Icon name="check" /> <span>Required fields present · amount in a normal range · quotes found</span>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <Card title="Decision">
        {errors.length > 0 ? (
          <div role="alert" className={styles.alert}>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {done ? (
          <p role="status" className={styles.ok}>
            {done}
          </p>
        ) : null}
        {!open ? (
          <p className={styles.sub}>
            {`${STATUS_LABELS[task.status]}${task.resolvedAt ? ` ${instantLong(task.resolvedAt, ADMIN_TZ)}` : ""}. ${task.resolutionNote}`}
          </p>
        ) : (
          <>
            {draft ? (
              <div className={styles.formGrid}>
                <TextInput label="Slug" value={fields.slug} onChange={(e) => setFields({ ...fields, slug: e.target.value })} />
                <TextInput label="Cycle" value={fields.cycle} onChange={(e) => setFields({ ...fields, cycle: e.target.value })} />
                <TextInput
                  label="Minutes to apply"
                  inputMode="numeric"
                  value={fields.estMinutes}
                  onChange={(e) => setFields({ ...fields, estMinutes: e.target.value })}
                />
              </div>
            ) : null}
            <TextArea label="Decision note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className={styles.row}>
              {task.payload.type === "report" ? (
                <>
                  <Button variant="primary" size="sm" disabled={locked} onClick={() => closeReport("resolved")}>
                    Resolve report
                  </Button>
                  <Button variant="line" size="sm" disabled={locked} onClick={() => closeReport("rejected")}>
                    Reject report
                  </Button>
                </>
              ) : (
                <>
                  {draft ? (
                    <Button variant="primary" size="sm" disabled={locked} onClick={publishDraft}>
                      Publish
                    </Button>
                  ) : null}
                  {task.payload.type === "user_submission" && !draft ? (
                    <Button variant="primary" size="sm" disabled={locked || !task.scholarshipId} onClick={publishSubmission}>
                      Publish
                    </Button>
                  ) : null}
                  {recheck ? (
                    <>
                      <Button variant="line" size="sm" disabled={locked} onClick={keepListing}>
                        Keep current listing
                      </Button>
                      <Button variant="line" size="sm" disabled={locked || !task.scholarshipId} onClick={retireListing}>
                        Retire listing
                      </Button>
                    </>
                  ) : (
                    <Button variant="line" size="sm" disabled={locked} onClick={reject}>
                      Reject
                    </Button>
                  )}
                </>
              )}
            </div>
            <p className={styles.sub}>
              {recheck
                ? "Publishing or keeping the current listing records you and today's date as the verifier."
                : "Publishing records you and today's date as the verifier."}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
```

`apps/web/src/components/admin/TaskList.tsx`:

```tsx
import { instantLong } from "@/components/public/dates";
import { cx } from "@/lib/cx";
import type { CatalogTask } from "@scholarcrew/domain";
import { EmptyState, Icon } from "@scholarcrew/ui";
import styles from "./admin.module.css";
import { ADMIN_TZ } from "./labels";
import { KIND_LABELS, taskChip, taskTitle } from "./review";

/** The queue column: oldest first, each item links to itself with `?task=`. */
export function TaskList({ items, selectedId }: { items: Array<{ task: CatalogTask; href: string }>; selectedId: string | null }) {
  if (items.length === 0) {
    return (
      <EmptyState title="Nothing to review" icon="check">
        New research candidates, submissions, reports, and re-checks show up here.
      </EmptyState>
    );
  }
  return (
    <nav className={styles.queue} aria-label="Review queue">
      {items.map(({ task, href }) => {
        const chip = taskChip(task);
        const on = task.id === selectedId;
        return (
          <a key={task.id} href={href} className={cx(styles.qi, on && styles.qiOn)} aria-current={on ? "true" : undefined}>
            <div className={styles.row}>
              <span className={styles.ttype}>{KIND_LABELS[task.kind]}</span>
              <span className={styles.qm}>
                <Icon name={chip.icon} /> {chip.text}
              </span>
            </div>
            <div className={styles.qn}>{taskTitle(task)}</div>
            <div className={styles.qm}>{`Opened ${instantLong(task.createdAt, ADMIN_TZ)}`}</div>
          </a>
        );
      })}
    </nav>
  );
}
```

`apps/web/src/app/(admin)/admin/tasks/page.tsx`:

```tsx
import { TaskList } from "@/components/admin/TaskList";
import { TaskReview } from "@/components/admin/TaskReview";
import styles from "@/components/admin/admin.module.css";
import { KIND_LABELS, STATUS_LABELS } from "@/components/admin/review";
import { type SearchParams, firstParam } from "@/components/public/params";
import { cx } from "@/lib/cx";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { getCatalogTask, getScholarshipForAdmin, listCatalogTasks } from "@scholarcrew/core/admin";
import { currentSeason } from "@scholarcrew/core/shared";
import { CatalogTaskKind, CatalogTaskStatus, isAppError } from "@scholarcrew/domain";
import { EmptyState } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

/** D36: the core getters throw not_found for a bad or unknown id; here that just means "nothing selected". */
async function orNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (e) {
    if (isAppError(e) && e.code === "not_found") return null;
    throw e;
  }
}

function href(f: { status: string; kind?: string; task?: string }): string {
  const p = new URLSearchParams();
  if (f.status !== "open") p.set("status", f.status);
  if (f.kind) p.set("kind", f.kind);
  if (f.task) p.set("task", f.task);
  const text = p.toString();
  return text ? `/admin/tasks?${text}` : "/admin/tasks";
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor(["admin"]);
  const sp = await searchParams;
  const statusParam = firstParam(sp, "status") ?? "open";
  const parsedStatus = CatalogTaskStatus.safeParse(statusParam);
  const status = statusParam === "all" ? undefined : parsedStatus.success ? parsedStatus.data : "open";
  const statusKey = status ?? "all";
  const parsedKind = CatalogTaskKind.safeParse(firstParam(sp, "kind"));
  const kind = parsedKind.success ? parsedKind.data : undefined;

  const deps = getDeps();
  const tasks = await listCatalogTasks(deps, actor, { status, kind });
  const wanted = firstParam(sp, "task") ?? tasks[0]?.id ?? null;
  const selected = wanted
    ? (tasks.find((t) => t.id === wanted) ?? (await orNull(() => getCatalogTask(deps, actor, wanted))))
    : null;
  const listingId = selected?.scholarshipId;
  const existing = listingId ? await orNull(() => getScholarshipForAdmin(deps, actor, listingId)) : null;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Review queue</h1>
          <p className={styles.sub}>
            {`${tasks.length} ${status ? STATUS_LABELS[status].toLowerCase() : "in all"} · research finds candidates, code checks them, a person decides`}
          </p>
        </div>
        <div className={styles.stack}>
          <div className={styles.chips} aria-label="Kind">
            <a href={href({ status: statusKey })} className={cx(styles.chip, !kind && styles.chipOn)}>
              All
            </a>
            {CatalogTaskKind.options.map((k) => (
              <a key={k} href={href({ status: statusKey, kind: k })} className={cx(styles.chip, kind === k && styles.chipOn)}>
                {KIND_LABELS[k]}
              </a>
            ))}
          </div>
          <div className={styles.chips} aria-label="Status">
            {[...CatalogTaskStatus.options, "all" as const].map((s) => (
              <a
                key={s}
                href={href({ status: s, kind })}
                className={cx(styles.chip, statusKey === s && styles.chipOn)}
              >
                {s === "all" ? "All" : STATUS_LABELS[s]}
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.grid2}>
        <TaskList
          items={tasks.map((t) => ({ task: t, href: href({ status: statusKey, kind, task: t.id }) }))}
          selectedId={selected?.id ?? null}
        />
        {selected ? (
          <TaskReview key={selected.id} task={selected} existing={existing} defaultCycle={currentSeason(deps.clock.now())} />
        ) : (
          <EmptyState title="Pick a task" icon="arrow">
            Choose a task on the left to review it.
          </EmptyState>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/components/admin && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 7 files, 33 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/tasks" apps/web/src/components/admin/review.ts apps/web/src/components/admin/review.test.ts apps/web/src/components/admin/TaskList.tsx apps/web/src/components/admin/TaskReview.tsx apps/web/src/components/admin/TaskReview.test.tsx
git commit -m "feat(web): review queue with quotes, code checks, and create-then-resolve publishing"
```

### R15: Reports triage, college import, research requests, and the audit log (AD-03, AD-04, AD-05)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/admin/adminTools.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { CatalogReport, ImportResult } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollegeImport } from "./CollegeImport";
import { ReportsTable } from "./ReportsTable";
import { ResearchForm } from "./ResearchForm";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

const CSV = "UNITID,INSTNM,CITY,STABBR,CONTROL,ADM_RATE,COSTT4_A,NPT4_PUB,NPT4_PRIV\n100001,Maple State University,Maple City,TX,1,0.68,24510,12001,NULL";

describe("CollegeImport", () => {
  it("posts the CSV as text/csv and lists the rows that failed", async () => {
    const result: ImportResult = { inserted: 1, updated: 0, skipped: 1, errors: [{ line: 3, message: "control: Invalid option" }] };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(result));
    vi.stubGlobal("fetch", fetchMock);
    render(<CollegeImport />);
    expect((screen.getByRole("button", { name: "Import colleges" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("College Scorecard CSV"), { target: { value: CSV } });
    fireEvent.click(screen.getByRole("button", { name: "Import colleges" }));
    await waitFor(() => expect(screen.getByText("Inserted 1 · Updated 0 · Skipped 1")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/admin/colleges/import");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: CSV, headers: { "Content-Type": "text/csv" } });
    const table = screen.getByRole("table", { name: "Rows that weren't imported" });
    expect(within(table).getByText("3")).toBeTruthy();
    expect(within(table).getByText("control: Invalid option")).toBeTruthy();
  });

  it("shows the server's message when the upload is refused (14 answers 413)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { code: "invalid_input", message: "The CSV is over 5 MB. Split it and import each part." } }, 413)),
    );
    render(<CollegeImport />);
    fireEvent.change(screen.getByLabelText("College Scorecard CSV"), { target: { value: CSV } });
    fireEvent.click(screen.getByRole("button", { name: "Import colleges" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("The CSV is over 5 MB. Split it and import each part."));
  });

  it("shows the size message for a bare 413 with no error body (R3A-22)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Request Entity Too Large</html>", { status: 413 })));
    render(<CollegeImport />);
    fireEvent.change(screen.getByLabelText("College Scorecard CSV"), { target: { value: CSV } });
    fireEvent.click(screen.getByRole("button", { name: "Import colleges" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("The CSV is over 5 MB. Split it and import each part."));
  });
});

describe("ResearchForm", () => {
  it("starts research for a state and an optional county", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchForm />);
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "OK" } });
    fireEvent.click(screen.getByRole("button", { name: "Start research" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Research started for OK."));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/admin/research");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ state: "OK" });
    // R3A-24: ResearchInput.county is max 100.
    expect(screen.getByLabelText("County (optional)").getAttribute("maxlength")).toBe("100");
    fireEvent.change(screen.getByLabelText("County (optional)"), { target: { value: " Maple " } });
    fireEvent.click(screen.getByRole("button", { name: "Start research" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Research started for Maple County, OK."));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ state: "OK", county: "Maple" });
  });
});

describe("ReportsTable", () => {
  const report: CatalogReport = {
    id: "77777777-7777-4777-8777-777777777777",
    scholarshipId: "33333333-3333-4333-8333-333333333333",
    scholarshipName: "Hill Country STEM Award",
    reporterId: null,
    reason: "wrong_deadline",
    details: "Site now says Oct 16",
    status: "open",
    createdAt: "2026-10-05T12:00:00.000Z",
    resolvedAt: null,
  };

  it("needs a note, then resolves the report and shows its new status", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ ...report, status: "resolved" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReportsTable reports={[report]} />);
    expect(screen.getByRole("link", { name: "Hill Country STEM Award" }).getAttribute("href")).toBe(
      `/admin/scholarships/${report.scholarshipId}`,
    );
    expect(screen.getByText("Wrong deadline")).toBeTruthy();
    // R3V-10: the reported date is the Central calendar day, with the year.
    expect(screen.getByText("Oct 5, 2026")).toBeTruthy();
    // R3A-24: ResolveReportInput.note is max 1000.
    expect(screen.getByLabelText("Note for report on Hill Country STEM Award").getAttribute("maxlength")).toBe("1000");
    fireEvent.click(screen.getByRole("button", { name: "Resolve report on Hill Country STEM Award" }));
    expect(screen.getByRole("alert").textContent).toBe("Add a note first.");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Note for report on Hill Country STEM Award"), { target: { value: "Deadline fixed" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve report on Hill Country STEM Award" }));
    await waitFor(() => expect(screen.getByText("Resolved")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/admin/reports/${report.id}/resolve`);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ status: "resolved", note: "Deadline fixed" });
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("shows a 409 as already closed: the message, disabled buttons, and a refresh (R3A-21)", async () => {
    const fetchMock = vi.fn(async () => json({ error: { code: "conflict", message: "This report is already closed" } }, 409));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReportsTable reports={[report]} />);
    fireEvent.change(screen.getByLabelText("Note for report on Hill Country STEM Award"), { target: { value: "Deadline fixed" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject report on Hill Country STEM Award" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This report is already closed"));
    expect(nav.router.refresh).toHaveBeenCalledTimes(1);
    for (const name of ["Resolve report on Hill Country STEM Award", "Reject report on Hill Country STEM Award"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/admin/adminTools`
Expected: FAIL with `Failed to resolve import "./CollegeImport"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/admin/CollegeImport.tsx`:

```tsx
"use client";

import { ApiError, errorMessage } from "@/lib/api";
import { ErrorBody, ImportResult } from "@scholarcrew/domain";
import { Button, Table, TextArea } from "@scholarcrew/ui";
import { type ChangeEvent, useState } from "react";
import styles from "./admin.module.css";

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const TOO_BIG = "The CSV is over 5 MB. Split it and import each part.";

/** api() only sends JSON or FormData; the import route takes the raw CSV as text/csv (plan 14, N12). */
async function postCsv(text: string): Promise<ImportResult> {
  let res: Response;
  try {
    res = await fetch("/api/v1/admin/colleges/import", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "text/csv" },
      body: text,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("network", "Can't reach ScholarCrew right now. Check your connection and try again.", 0);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ErrorBody.safeParse(data);
    if (parsed.success) throw new ApiError(parsed.data.error.code, parsed.data.error.message, res.status);
    // R3A-22: a proxy can cut the body off at 413 before 14's ErrorBody is written (as OfferTool handles it).
    if (res.status === 413) throw new ApiError("invalid_input", TOO_BIG, 413);
    throw new ApiError("internal", `The import failed (${res.status}). Try again.`, res.status);
  }
  return ImportResult.parse(data);
}

type ErrorRow = { line: number; message: string };

export function CollegeImport() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) {
      setError(TOO_BIG);
      return;
    }
    setText(await file.text());
  }

  async function submit() {
    if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) {
      setError(TOO_BIG);
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await postCsv(text));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.stack}>
      <TextArea
        label="College Scorecard CSV"
        hint="Paste the extract, header row first"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={styles.row}>
        <label htmlFor="college-csv-file">Or choose a CSV file</label>
        <input id="college-csv-file" type="file" accept=".csv,text/csv" onChange={pickFile} />
      </div>
      {error ? (
        <p role="alert" className={styles.alert}>
          {error}
        </p>
      ) : null}
      <div className={styles.row}>
        <Button variant="primary" disabled={busy || text.trim() === ""} onClick={submit}>
          {busy ? "Importing…" : "Import colleges"}
        </Button>
      </div>
      {result ? (
        <div className={styles.stack}>
          <p role="status" className={styles.ok}>
            {`Inserted ${result.inserted} · Updated ${result.updated} · Skipped ${result.skipped}`}
          </p>
          {result.errors.length > 0 ? (
            <Table<ErrorRow>
              caption="Rows that weren't imported"
              columns={[
                { key: "line", header: "Line" },
                { key: "message", header: "Problem" },
              ]}
              rows={result.errors}
              rowKey={(r) => `${r.line}:${r.message}`}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

`apps/web/src/components/admin/ResearchForm.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { US_STATES } from "@scholarcrew/domain";
import { Button, Select, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./admin.module.css";

const STATE_OPTIONS = US_STATES.map((s) => ({ value: s, label: s }));

/** CA-01 trigger: the worker researches candidates; each one lands in the review queue. */
export function ResearchForm() {
  const [state, setState] = useState("TX");
  const [county, setCounty] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    const c = county.trim();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api("/admin/research", { body: c ? { state, county: c } : { state } });
      setMessage(`Research started for ${c ? `${c} County, ` : ""}${state}. New candidates show up in the review queue.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.stack}>
      <div className={styles.formGrid}>
        <Select label="State" options={STATE_OPTIONS} value={state} onChange={(e) => setState(e.target.value)} />
        <TextInput label="County (optional)" maxLength={100} value={county} onChange={(e) => setCounty(e.target.value)} />
      </div>
      {error ? (
        <p role="alert" className={styles.alert}>
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className={styles.ok}>
          {message}
        </p>
      ) : null}
      <div className={styles.row}>
        <Button variant="primary" disabled={busy} onClick={start}>
          Start research
        </Button>
      </div>
    </div>
  );
}
```

`apps/web/src/components/admin/ReportsTable.tsx`:

```tsx
"use client";

import { instantLong } from "@/components/public/dates";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { CatalogReport, ReportStatus } from "@scholarcrew/domain";
import { Badge, Button, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./admin.module.css";
import { ADMIN_TZ } from "./labels";
import { REASON_LABELS } from "./review";

const STATUS_TEXT: Record<ReportStatus, string> = { open: "Open", resolved: "Resolved", rejected: "Rejected" };

/** AD-04: resolve or reject each open report with a note. Closing a report also closes its review task. */
export function ReportsTable({ reports }: { reports: CatalogReport[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(reports);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  // R3A-21: reports the server says are already closed (409); their buttons stay disabled.
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  async function close(r: CatalogReport, status: "resolved" | "rejected") {
    const note = (notes[r.id] ?? "").trim();
    if (!note) {
      setErrors((e) => ({ ...e, [r.id]: "Add a note first." }));
      return;
    }
    setBusyId(r.id);
    setErrors((e) => ({ ...e, [r.id]: "" }));
    try {
      const updated = await api<CatalogReport>(`/admin/reports/${r.id}/resolve`, { body: { status, note } });
      setRows((all) => all.map((x) => (x.id === r.id ? updated : x)));
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict") {
        // Another admin closed it, or our earlier resolve landed and its response was lost.
        setErrors((all) => ({ ...all, [r.id]: e.message }));
        setClosed((all) => ({ ...all, [r.id]: true }));
        router.refresh();
        return;
      }
      setErrors((all) => ({ ...all, [r.id]: errorMessage(e) }));
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) return <p className={styles.sub}>No reports here.</p>;
  return (
    <table className={styles.fields} aria-label="Reports">
      <thead>
        <tr>
          <th scope="col">Listing</th>
          <th scope="col">Reason</th>
          <th scope="col">Details</th>
          <th scope="col">Reported</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <a href={`/admin/scholarships/${r.scholarshipId}`}>{r.scholarshipName}</a>
            </td>
            <td>{REASON_LABELS[r.reason]}</td>
            <td>{r.details || "No details"}</td>
            <td>{instantLong(r.createdAt, ADMIN_TZ)}</td>
            <td>
              {r.status === "open" ? (
                <div className={styles.stack}>
                  <TextInput
                    label={`Note for report on ${r.scholarshipName}`}
                    maxLength={1000}
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  />
                  {errors[r.id] ? (
                    <p role="alert" className={styles.alert}>
                      {errors[r.id]}
                    </p>
                  ) : null}
                  <div className={styles.row}>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busyId === r.id || closed[r.id] === true}
                      aria-label={`Resolve report on ${r.scholarshipName}`}
                      onClick={() => close(r, "resolved")}
                    >
                      Resolve
                    </Button>
                    <Button
                      variant="line"
                      size="sm"
                      disabled={busyId === r.id || closed[r.id] === true}
                      aria-label={`Reject report on ${r.scholarshipName}`}
                      onClick={() => close(r, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ) : (
                <Badge tone={r.status === "resolved" ? "good" : "neutral"}>{STATUS_TEXT[r.status]}</Badge>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

`apps/web/src/app/(admin)/admin/reports/page.tsx`:

```tsx
import { ReportsTable } from "@/components/admin/ReportsTable";
import styles from "@/components/admin/admin.module.css";
import { type SearchParams, firstParam } from "@/components/public/params";
import { cx } from "@/lib/cx";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { listReports } from "@scholarcrew/core/admin";
import { ReportStatus } from "@scholarcrew/domain";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor(["admin"]);
  const key = firstParam(await searchParams, "status") ?? "open";
  const parsed = ReportStatus.safeParse(key);
  const status = key === "all" ? undefined : parsed.success ? parsed.data : "open";
  const reports = await listReports(getDeps(), actor, status);
  const current = status ?? "all";
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Reports</h1>
          <p className={styles.sub}>Students report wrong deadlines, dead links, wrong amounts, and scams. Close each one with a note.</p>
        </div>
        <div className={styles.chips}>
          {FILTERS.map((f) => (
            <a
              key={f.key}
              href={f.key === "open" ? "/admin/reports" : `/admin/reports?status=${f.key}`}
              className={cx(styles.chip, current === f.key && styles.chipOn)}
            >
              {f.label}
            </a>
          ))}
        </div>
      </div>
      <ReportsTable key={current} reports={reports} />
    </>
  );
}
```

`apps/web/src/app/(admin)/admin/colleges/page.tsx`:

```tsx
import { CollegeImport } from "@/components/admin/CollegeImport";
import { ResearchForm } from "@/components/admin/ResearchForm";
import styles from "@/components/admin/admin.module.css";
import { requirePageActor } from "@/server/session";
import { Card } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function CollegesAdminPage() {
  await requirePageActor(["admin"]);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Colleges and research</h1>
          <p className={styles.sub}>Refresh college data from a College Scorecard extract, or ask the catalog to look for local scholarships.</p>
        </div>
      </div>
      <div className={styles.stack}>
        <Card title="Import from College Scorecard">
          <p className={styles.sub}>
            Columns: UNITID, INSTNM, CITY, STABBR, CONTROL, ADM_RATE, COSTT4_A, NPT4_PUB, NPT4_PRIV. Existing colleges are
            updated by UNITID. Up to 5 MB per import.
          </p>
          <CollegeImport />
        </Card>
        <Card title="Start research">
          <p className={styles.sub}>
            Research searches the web for scholarships in a state or county. Code checks every draft, and nothing is
            published until an admin reviews it.
          </p>
          <ResearchForm />
        </Card>
      </div>
    </>
  );
}
```

`apps/web/src/app/(admin)/admin/audit/page.tsx`:

```tsx
import styles from "@/components/admin/admin.module.css";
import { ADMIN_TZ } from "@/components/admin/labels";
import { type SearchParams, firstParam } from "@/components/public/params";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { searchAudit } from "@scholarcrew/core/admin";
import { type AuditEvent, AuditQueryParams, type Page } from "@scholarcrew/domain";
import { Button, EmptyState, Table, type TableColumn, TextInput } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

const KEYS = ["actorId", "entityType", "entityId", "action"] as const;
const WHEN = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: ADMIN_TZ });

const COLUMNS: TableColumn<AuditEvent>[] = [
  { key: "createdAt", header: "When", render: (e) => WHEN.format(new Date(e.createdAt)) },
  { key: "actor", header: "Actor", render: (e) => (e.actorId ? `${e.actorKind} ${e.actorId}` : e.actorKind) },
  { key: "action", header: "Action" },
  { key: "entity", header: "Entity", render: (e) => `${e.entityType} ${e.entityId}` },
  {
    key: "meta",
    header: "Details",
    render: (e) => {
      const text = JSON.stringify(e.meta);
      return text === "{}" ? "" : text.length > 160 ? `${text.slice(0, 157)}...` : text;
    },
  },
];

/** AD-05: search audit events by actor, entity, and action. Blank fields are left out of the query. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor(["admin"]);
  const sp = await searchParams;
  const raw: Record<string, string> = {};
  for (const key of [...KEYS, "page"]) {
    const value = firstParam(sp, key)?.trim();
    if (value) raw[key] = value;
  }
  const parsed = AuditQueryParams.safeParse(raw);
  const page: Page<AuditEvent> | null = parsed.success ? await searchAudit(getDeps(), actor, parsed.data) : null;
  const link = (n: number) => {
    const p = new URLSearchParams(raw);
    p.set("page", String(n));
    return `/admin/audit?${p.toString()}`;
  };
  const pages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Audit log</h1>
          <p className={styles.sub}>Sign-ins, sharing changes, exports, deletions, admin edits, and helper-link use.</p>
        </div>
      </div>
      <form method="get" action="/admin/audit" className={styles.formGrid}>
        <TextInput label="Actor ID" name="actorId" defaultValue={raw.actorId ?? ""} />
        <TextInput label="Action" name="action" placeholder="sensitive_facts_changed" defaultValue={raw.action ?? ""} />
        <TextInput label="Entity type" name="entityType" placeholder="scholarship" defaultValue={raw.entityType ?? ""} />
        <TextInput label="Entity ID" name="entityId" defaultValue={raw.entityId ?? ""} />
        <div className={styles.row}>
          <Button type="submit" variant="primary" size="sm">
            Search
          </Button>
          <Button variant="line" size="sm" href="/admin/audit">
            Clear
          </Button>
        </div>
      </form>
      {page && page.items.length === 0 ? (
        <EmptyState title="No events match these filters" icon="search">
          Try a different actor, action, or entity.
        </EmptyState>
      ) : page ? (
        <>
          <Table columns={COLUMNS} rows={page.items} rowKey={(e) => e.id} caption={`${page.total} events`} />
          <nav className={styles.row} aria-label="Pages">
            <span className={styles.sub}>{`Page ${page.page} of ${pages}`}</span>
            {page.page > 1 ? (
              <Button variant="line" size="sm" href={link(page.page - 1)}>
                Previous
              </Button>
            ) : null}
            {page.page < pages ? (
              <Button variant="line" size="sm" href={link(page.page + 1)}>
                Next
              </Button>
            ) : null}
          </nav>
        </>
      ) : (
        <p role="alert" className={styles.alert}>
          Check the filters: the actor ID must be a full ID, and text filters are 60 characters or less.
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/admin && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 8 files, 39 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/reports" "apps/web/src/app/(admin)/admin/colleges" "apps/web/src/app/(admin)/admin/audit" apps/web/src/components/admin/ReportsTable.tsx apps/web/src/components/admin/CollegeImport.tsx apps/web/src/components/admin/ResearchForm.tsx apps/web/src/components/admin/adminTools.test.tsx
git commit -m "feat(web): admin reports triage, college import, research requests, and audit search"
```

### R16: Aid rules and deadlines editor (MO-09, AID-03, R2P-1)

Admins keep the federal loan rates (08 `loanEstimates`, MO-09) and the FAFSA and state aid deadlines (Money and Coming up, AID-03) current for each award year. Dev starts from 03's sample rows, which are marked as samples; nothing here imports or researches values. The page reads through core (`admin.listAidRules`, `admin.listAidDeadlinesForAdmin`, D36), and the client editor writes through 14's routes: `PUT /admin/aid-rules` (`AidRuleInput` → `AidRule`), `PUT /admin/aid-deadlines` (`AidDeadlineInput` → `AidDeadline`; an `id` updates), and `DELETE /admin/aid-deadlines/:id` (204). Every write is audited by 08.

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/admin/AidRulesEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { type AidDeadline, AidDeadlineInput, type AidRule, AidRuleInput } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AidRulesEditor } from "./AidRulesEditor";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

type Call = { url: string; method: string; body: unknown };
function recorder(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    return handler(call);
  });
  return { fn, calls };
}

const YEAR = "2027-28";
const RATES_URL = "https://studentaid.gov/understand-aid/types/loans/interest-rates";
const FAFSA_URL = "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines";
const FAFSA: AidDeadline = {
  id: "88888888-8888-4888-8888-888888888888",
  awardYear: YEAR,
  state: null,
  program: "FAFSA",
  deadline: "2028-06-30",
  note: "",
  sourceUrl: FAFSA_URL,
  verifiedAt: "2026-10-01T00:00:00.000Z",
};

describe("AidRulesEditor (R2P-1)", () => {
  it("checks the loan rates, then saves them with PUT /admin/aid-rules", async () => {
    const saved: AidRule = {
      id: "99999999-9999-4999-8999-999999999999",
      awardYear: YEAR,
      key: "federal_loan_rates",
      value: { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 },
      sourceUrl: RATES_URL,
      verifiedAt: "2026-10-06T15:00:00.000Z",
    };
    const { fn, calls } = recorder(() => json(saved));
    vi.stubGlobal("fetch", fn);
    render(<AidRulesEditor awardYear={YEAR} rule={null} deadlines={[]} />);
    expect(screen.getByText("No rates saved for 2027-28 yet, so award letters show no loan payment estimates.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Subsidized rate (%)"), { target: { value: "6.39" } });
    fireEvent.change(screen.getByLabelText("Unsubsidized rate (%)"), { target: { value: "6.39" } });
    fireEvent.change(screen.getByLabelText("Parent PLUS rate (%)"), { target: { value: "31" } });
    fireEvent.change(screen.getByLabelText("Rates source URL"), { target: { value: ` ${RATES_URL} ` } });
    fireEvent.click(screen.getByRole("button", { name: "Save loan rates" }));
    expect(screen.getByRole("alert").textContent).toBe("Parent PLUS rate: use a percentage from 0 to 30.");
    expect(calls).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Parent PLUS rate (%)"), { target: { value: "8.94" } });
    fireEvent.click(screen.getByRole("button", { name: "Save loan rates" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Loan rates saved for 2027-28."));
    expect(calls).toEqual([
      {
        url: "/api/v1/admin/aid-rules",
        method: "PUT",
        body: { awardYear: YEAR, key: "federal_loan_rates", value: { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 }, sourceUrl: RATES_URL },
      },
    ]);
    expect(AidRuleInput.safeParse(calls[0]?.body).success).toBe(true);
    // R3V-10: the verified instant on the admin (Central) calendar, not the UTC slice.
    expect(screen.getByText("Interest rates for 2027-28 loans. Last checked Oct 6, 2026.")).toBeTruthy();
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("adds a state deadline, then deletes it", async () => {
    const added: AidDeadline = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      awardYear: YEAR,
      state: "TX",
      program: "TEXAS Grant priority",
      deadline: "2027-01-15",
      note: "Check with the school.",
      sourceUrl: FAFSA_URL,
      verifiedAt: "2026-10-06T15:00:00.000Z",
    };
    const { fn, calls } = recorder((c) => (c.method === "DELETE" ? new Response(null, { status: 204 }) : json(added)));
    vi.stubGlobal("fetch", fn);
    render(<AidRulesEditor awardYear={YEAR} rule={null} deadlines={[FAFSA]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add deadline" }));
    expect(screen.getByRole("alert").textContent).toContain("Program: give it a name (up to 80 characters).");
    expect(calls).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("State"), { target: { value: "TX" } });
    fireEvent.change(screen.getByLabelText("Program"), { target: { value: " TEXAS Grant priority " } });
    fireEvent.change(screen.getByLabelText("Deadline"), { target: { value: "2027-01-15" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Check with the school." } });
    fireEvent.change(screen.getByLabelText("Deadline source URL"), { target: { value: FAFSA_URL } });
    fireEvent.click(screen.getByRole("button", { name: "Add deadline" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Added TEXAS Grant priority."));
    expect(calls[0]).toEqual({
      url: "/api/v1/admin/aid-deadlines",
      method: "PUT",
      body: { awardYear: YEAR, state: "TX", program: "TEXAS Grant priority", deadline: "2027-01-15", note: "Check with the school.", sourceUrl: FAFSA_URL },
    });
    expect(AidDeadlineInput.safeParse(calls[0]?.body).success).toBe(true);
    const table = screen.getByRole("table", { name: "Aid deadlines" });
    const rows = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.textContent ?? "");
    expect(rows[0]).toContain("Texas");
    expect(rows[0]).toContain("Jan 15, 2027");
    expect(rows[1]).toContain("Federal");
    expect(rows[1]).toContain("Jun 30, 2028");

    fireEvent.click(screen.getByRole("button", { name: "Delete TEXAS Grant priority (Texas)" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Deleted TEXAS Grant priority."));
    expect(calls[1]).toEqual({ url: `/api/v1/admin/aid-deadlines/${added.id}`, method: "DELETE", body: null });
    expect(within(table).queryByText("TEXAS Grant priority")).toBeNull();
    expect(within(table).getByText("FAFSA")).toBeTruthy();
  });

  it("edits a deadline in place, sending its id", async () => {
    const edited: AidDeadline = { ...FAFSA, deadline: "2028-06-29", verifiedAt: "2026-10-06T15:00:00.000Z" };
    const { fn, calls } = recorder(() => json(edited));
    vi.stubGlobal("fetch", fn);
    render(<AidRulesEditor awardYear={YEAR} rule={null} deadlines={[FAFSA]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit FAFSA (Federal)" }));
    expect((screen.getByLabelText("Program") as HTMLInputElement).value).toBe("FAFSA");
    expect((screen.getByLabelText("State") as HTMLSelectElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Deadline"), { target: { value: "2028-06-29" } });
    fireEvent.click(screen.getByRole("button", { name: "Save deadline" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved FAFSA."));
    expect(calls).toEqual([
      {
        url: "/api/v1/admin/aid-deadlines",
        method: "PUT",
        body: { id: FAFSA.id, awardYear: YEAR, state: null, program: "FAFSA", deadline: "2028-06-29", note: "", sourceUrl: FAFSA_URL },
      },
    ]);
    const table = screen.getByRole("table", { name: "Aid deadlines" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByText("Jun 29, 2028")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add deadline" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/admin/AidRulesEditor`
Expected: FAIL with `Failed to resolve import "./AidRulesEditor"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/admin/AidRulesEditor.tsx`:

```tsx
"use client";

import { safeHref } from "@/lib/format";
import { calendarLong, instantLong } from "@/components/public/dates";
import { api, errorMessage } from "@/lib/api";
import {
  type AidDeadline,
  AidDeadlineInput,
  type AidRule,
  AidRuleInput,
  STATE_NAMES,
  US_STATES,
  USState,
} from "@scholarcrew/domain";
import { Button, Card, Select, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./admin.module.css";
import { ADMIN_TZ } from "./labels";

type Plan<T> = { ok: true; input: T } | { ok: false; errors: string[] };

export interface RateForm {
  subsidized: string;
  unsubsidized: string;
  parent_plus: string;
  sourceUrl: string;
}

export interface DeadlineForm {
  id: string | null;
  state: string;
  program: string;
  deadline: string;
  note: string;
  sourceUrl: string;
}

const EMPTY_DEADLINE: DeadlineForm = { id: null, state: "", program: "", deadline: "", note: "", sourceUrl: "" };

const RATE_FIELDS = [
  { key: "subsidized", label: "Subsidized rate (%)" },
  { key: "unsubsidized", label: "Unsubsidized rate (%)" },
  { key: "parent_plus", label: "Parent PLUS rate (%)" },
] as const;

const FALLBACK_ERROR = "Check the form and try again.";
const FIELD_ERRORS: Record<string, string> = {
  subsidized: "Subsidized rate: use a percentage from 0 to 30.",
  unsubsidized: "Unsubsidized rate: use a percentage from 0 to 30.",
  parent_plus: "Parent PLUS rate: use a percentage from 0 to 30.",
  sourceUrl: "Source URL: paste the full link to the official page.",
  program: "Program: give it a name (up to 80 characters).",
  deadline: "Deadline: pick a date or leave it blank.",
  note: "Note: keep it under 300 characters.",
  state: "State: pick a state or Federal.",
  awardYear: "Award year: use YYYY-YY.",
};

const STATE_OPTIONS = [{ value: "", label: "Federal" }, ...US_STATES.map((s) => ({ value: s, label: `${STATE_NAMES[s]} (${s})` }))];

/** One plain message per field, from the innermost named path segment (value.parent_plus → parent_plus). */
function aidErrors(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): string[] {
  const out = new Set<string>();
  for (const issue of issues) {
    const key = [...issue.path].reverse().find((p): p is string => typeof p === "string" && p in FIELD_ERRORS);
    out.add(key ? (FIELD_ERRORS[key] ?? FALLBACK_ERROR) : FALLBACK_ERROR);
  }
  return [...out];
}

function percent(text: string): number {
  const t = text.trim();
  return t === "" ? Number.NaN : Number(t);
}

export function loanRateInput(awardYear: string, f: RateForm): Plan<AidRuleInput> {
  const parsed = AidRuleInput.safeParse({
    awardYear,
    key: "federal_loan_rates",
    value: { subsidized: percent(f.subsidized), unsubsidized: percent(f.unsubsidized), parent_plus: percent(f.parent_plus) },
    sourceUrl: f.sourceUrl.trim(),
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, errors: aidErrors(parsed.error.issues) };
}

export function deadlineInput(awardYear: string, f: DeadlineForm): Plan<AidDeadlineInput> {
  const parsed = AidDeadlineInput.safeParse({
    ...(f.id ? { id: f.id } : {}),
    awardYear,
    state: f.state === "" ? null : f.state,
    program: f.program,
    deadline: f.deadline === "" ? null : f.deadline,
    note: f.note.trim(),
    sourceUrl: f.sourceUrl.trim(),
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, errors: aidErrors(parsed.error.issues) };
}

export function stateLabel(state: string | null): string {
  if (state === null) return "Federal";
  const s = USState.safeParse(state);
  return s.success ? STATE_NAMES[s.data] : state;
}

/** Soonest first; deadlines with no fixed date go last. */
function byDate(a: AidDeadline, b: AidDeadline): number {
  return (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31") || a.program.localeCompare(b.program);
}

function rateFormOf(rule: AidRule | null): RateForm {
  if (!rule) return { subsidized: "", unsubsidized: "", parent_plus: "", sourceUrl: "" };
  const v = rule.value;
  return { subsidized: String(v.subsidized), unsubsidized: String(v.unsubsidized), parent_plus: String(v.parent_plus), sourceUrl: rule.sourceUrl };
}

function formOf(d: AidDeadline): DeadlineForm {
  return { id: d.id, state: d.state ?? "", program: d.program, deadline: d.deadline ?? "", note: d.note, sourceUrl: d.sourceUrl };
}


function Messages({ errors, done }: { errors: string[]; done: string | null }) {
  return (
    <>
      {errors.length > 0 ? (
        <div role="alert" className={styles.alert}>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {done ? (
        <p role="status" className={styles.ok}>
          {done}
        </p>
      ) : null}
    </>
  );
}

/** R2P-1 (MO-09, AID-03): the award year's federal loan rates and its FAFSA and state aid deadlines. */
export function AidRulesEditor({ awardYear, rule, deadlines }: { awardYear: string; rule: AidRule | null; deadlines: AidDeadline[] }) {
  const router = useRouter();
  const [rates, setRates] = useState<RateForm>(() => rateFormOf(rule));
  const [verifiedAt, setVerifiedAt] = useState<string | null>(rule?.verifiedAt ?? null);
  const [rateErrors, setRateErrors] = useState<string[]>([]);
  const [rateDone, setRateDone] = useState<string | null>(null);
  const [rows, setRows] = useState<AidDeadline[]>(() => [...deadlines].sort(byDate));
  const [form, setForm] = useState<DeadlineForm>(EMPTY_DEADLINE);
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [rowDone, setRowDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveRates() {
    setRateDone(null);
    const plan = loanRateInput(awardYear, rates);
    if (!plan.ok) {
      setRateErrors(plan.errors);
      return;
    }
    setBusy(true);
    setRateErrors([]);
    try {
      const saved = await api<AidRule>("/admin/aid-rules", { method: "PUT", body: plan.input });
      setVerifiedAt(saved.verifiedAt);
      setRateDone(`Loan rates saved for ${awardYear}.`);
      router.refresh();
    } catch (e) {
      setRateErrors([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  }

  async function saveDeadline() {
    setRowDone(null);
    const plan = deadlineInput(awardYear, form);
    if (!plan.ok) {
      setRowErrors(plan.errors);
      return;
    }
    setBusy(true);
    setRowErrors([]);
    try {
      const saved = await api<AidDeadline>("/admin/aid-deadlines", { method: "PUT", body: plan.input });
      setRows((all) => [...all.filter((d) => d.id !== saved.id), saved].sort(byDate));
      setRowDone(form.id ? `Saved ${saved.program}.` : `Added ${saved.program}.`);
      setForm(EMPTY_DEADLINE);
      router.refresh();
    } catch (e) {
      setRowErrors([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: AidDeadline) {
    setBusy(true);
    setRowErrors([]);
    setRowDone(null);
    try {
      await api(`/admin/aid-deadlines/${d.id}`, { method: "DELETE" });
      setRows((all) => all.filter((x) => x.id !== d.id));
      if (form.id === d.id) setForm(EMPTY_DEADLINE);
      setRowDone(`Deleted ${d.program}.`);
      router.refresh();
    } catch (e) {
      setRowErrors([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  }

  function edit(d: AidDeadline) {
    setForm(formOf(d));
    setRowErrors([]);
    setRowDone(null);
  }

  return (
    <div className={styles.stack}>
      <Card title="Federal loan rates">
        <p className={styles.sub}>
          {verifiedAt
            ? `Interest rates for ${awardYear} loans. Last checked ${instantLong(verifiedAt, ADMIN_TZ)}.`
            : `No rates saved for ${awardYear} yet, so award letters show no loan payment estimates.`}
        </p>
        <Messages errors={rateErrors} done={rateDone} />
        <div className={styles.formGrid}>
          {RATE_FIELDS.map((f) => (
            <TextInput
              key={f.key}
              label={f.label}
              inputMode="decimal"
              value={rates[f.key]}
              onChange={(e) => setRates({ ...rates, [f.key]: e.target.value })}
            />
          ))}
          <TextInput
            label="Rates source URL"
            className={styles.wide}
            value={rates.sourceUrl}
            onChange={(e) => setRates({ ...rates, sourceUrl: e.target.value })}
          />
        </div>
        <div className={styles.row}>
          <Button variant="primary" size="sm" disabled={busy} onClick={saveRates}>
            Save loan rates
          </Button>
        </div>
      </Card>

      <Card title="Aid deadlines">
        <Messages errors={rowErrors} done={rowDone} />
        {rows.length === 0 ? (
          <p className={styles.sub}>{`No deadlines for ${awardYear} yet.`}</p>
        ) : (
          <table className={styles.fields} aria-label="Aid deadlines">
            <thead>
              <tr>
                <th scope="col">Applies to</th>
                <th scope="col">Program</th>
                <th scope="col">Deadline</th>
                <th scope="col">Note</th>
                <th scope="col">Source</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const where = stateLabel(d.state);
                const href = safeHref(d.sourceUrl);
                return (
                  <tr key={d.id}>
                    <td>{where}</td>
                    <td>{d.program}</td>
                    <td>{d.deadline ? calendarLong(d.deadline) : "No fixed date"}</td>
                    <td>{d.note || "None"}</td>
                    <td>{href ? <a href={href}>Source</a> : d.sourceUrl}</td>
                    <td>
                      <div className={styles.row}>
                        <Button variant="line" size="sm" disabled={busy} aria-label={`Edit ${d.program} (${where})`} onClick={() => edit(d)}>
                          Edit
                        </Button>
                        <Button
                          variant="line"
                          size="sm"
                          disabled={busy}
                          aria-label={`Delete ${d.program} (${where})`}
                          onClick={() => void remove(d)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <h3>{form.id ? "Edit deadline" : "Add a deadline"}</h3>
        <div className={styles.formGrid}>
          <Select
            label="State"
            hint="Federal for FAFSA and other national deadlines"
            options={STATE_OPTIONS}
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
          />
          <TextInput label="Program" value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} />
          <TextInput
            label="Deadline"
            type="date"
            hint="Leave blank if there's no fixed date"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
          />
          <TextInput label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <TextInput
            label="Deadline source URL"
            className={styles.wide}
            value={form.sourceUrl}
            onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
          />
        </div>
        <div className={styles.row}>
          <Button variant="primary" size="sm" disabled={busy} onClick={saveDeadline}>
            {form.id ? "Save deadline" : "Add deadline"}
          </Button>
          {form.id ? (
            <Button variant="line" size="sm" disabled={busy} onClick={() => setForm(EMPTY_DEADLINE)}>
              Cancel edit
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
```

`apps/web/src/app/(admin)/admin/aid/page.tsx`:

```tsx
import { AidRulesEditor } from "@/components/admin/AidRulesEditor";
import styles from "@/components/admin/admin.module.css";
import { type SearchParams, firstParam } from "@/components/public/params";
import { cx } from "@/lib/cx";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { listAidDeadlinesForAdmin, listAidRules } from "@scholarcrew/core/admin";
import { currentAwardYear } from "@scholarcrew/core/shared";
import { AwardYear } from "@scholarcrew/domain";

export const dynamic = "force-dynamic";

/** "2027-28" moved by n years: -1 gives "2026-27". */
function shiftAwardYear(year: string, n: number): string {
  const start = Number(year.slice(0, 4)) + n;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** R2P-1: the award year defaults to currentAwardYear(now); `?awardYear=` picks another. */
export default async function AidAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor(["admin"]);
  const deps = getDeps();
  const current = currentAwardYear(deps.clock.now());
  const wanted = AwardYear.safeParse(firstParam(await searchParams, "awardYear"));
  const awardYear = wanted.success ? wanted.data : current;
  const [rules, deadlines] = await Promise.all([
    listAidRules(deps, actor, { awardYear }),
    listAidDeadlinesForAdmin(deps, actor, { awardYear }),
  ]);
  const rule = rules.find((r) => r.key === "federal_loan_rates") ?? null;
  const years = [-1, 0, 1].map((n) => shiftAwardYear(current, n));
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Aid rules and deadlines</h1>
          <p className={styles.sub}>
            Loan rates feed the loan payment estimates on award letters. Deadlines feed the Money page and Coming up.
            Check every value against its official source before saving.
          </p>
        </div>
        <div className={styles.chips} aria-label="Award year">
          {years.map((y) => (
            <a
              key={y}
              href={y === current ? "/admin/aid" : `/admin/aid?awardYear=${y}`}
              className={cx(styles.chip, y === awardYear && styles.chipOn)}
              aria-current={y === awardYear ? "page" : undefined}
            >
              {y}
            </a>
          ))}
        </div>
      </div>
      <AidRulesEditor key={awardYear} awardYear={awardYear} rule={rule} deadlines={deadlines} />
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/admin && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 9 files, 42 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/aid" apps/web/src/components/admin/AidRulesEditor.tsx apps/web/src/components/admin/AidRulesEditor.test.tsx
git commit -m "feat(web): admin editor for federal loan rates and aid deadlines"
```

### R17: Gate

No new code. This task proves the whole plan composes with plans 13, 14, 15, 16, and 17 in the same app.

- [ ] **Step 1: Start the test database**

Run: `docker compose up -d db && pnpm db:wait && pnpm db:migrate:test`
Expected: the database is healthy and `migrate:test` exits 0.

- [ ] **Step 2: Format, then run the gate**

Run: `pnpm format && pnpm --filter @scholarcrew/web typecheck`
Expected: Biome rewrites only import order and wrapping; `tsc --noEmit` prints nothing.

Run: `pnpm --filter @scholarcrew/web test src/components/public src/components/auth src/components/admin`
Expected: PASS, 25 files, 111 tests.

Run: `pnpm --filter @scholarcrew/web test`
Expected: every web test file passes (plans 13, 14, 16, 17, and 18), 0 failed.

Run: `pnpm --filter @scholarcrew/web build`
Expected: `next build` completes. The route list shows `/`, `/directory`, `/directory/[state]`, `/directory/s/[slug]`, `/offer-tool`, `/privacy`, `/terms`, `/ai-policy`, `/sign-in`, `/sign-in/check-email`, `/family/join`, `/h/[token]`, `/verify-hours/[token]`, `/admin`, `/admin/tasks`, `/admin/scholarships`, `/admin/scholarships/new`, `/admin/scholarships/[id]`, `/admin/reports`, `/admin/colleges`, `/admin/aid`, `/admin/audit`, `/robots.txt`, and `/sitemap.xml`; the pages that read the database are marked dynamic (ƒ), and the build never connects to a database.

Run: `pnpm lint`
Expected: `biome check .` reports no errors.

- [ ] **Step 3: Commit any formatting changes**

```bash
git add "apps/web/src/app/(public)" "apps/web/src/app/(admin)" apps/web/src/app/h apps/web/src/app/verify-hours apps/web/src/app/sign-in apps/web/src/app/family/join apps/web/src/app/robots.ts apps/web/src/app/sitemap.ts apps/web/src/components/public apps/web/src/components/auth apps/web/src/components/admin
git commit -m "chore(web): format public, auth, and admin pages"
```

Skip the commit if `git status` shows nothing to commit.

## Success Criteria

- [ ] `pnpm --filter @scholarcrew/web typecheck` exits 0.
- [ ] `pnpm --filter @scholarcrew/web test` exits 0 (this plan adds 25 files and 111 tests).
- [ ] `pnpm --filter @scholarcrew/web build` exits 0 without a database.
- [ ] `pnpm lint` exits 0.

## Testing Requirements

Command: `pnpm --filter @scholarcrew/web test src/components/public src/components/auth src/components/admin` (test database up; plan 13's setup truncates it before every test). Expected: PASS, 25 files, 111 tests.

The tests prove:

- **SEO (R1):** `robots.txt` allows `/` and disallows `/api/`, `/admin`, `/h/`, `/verify-hours/`, `/family`, and every app route; `sitemap.xml` lists static pages, all 52 state pages, and only published, public, scam-free listings (core drops scam flags in SQL, D39), capped at 5000.
- **SE-05 (R1):** no file this plan owns loads a third-party script, font, tracker, or remote CSS asset.
- **Landing and legal (R2, R3):** the crew, the four product rules, how it works, and test-labeled prices render; each legal page carries "Draft — needs legal review" and covers retention windows, minors, sensitive facts, models and fallbacks, and human catalog review; the privacy page names Twilio for text reminders (R2I-9) and says an under-13 account and everything in it is deleted within 7 days (R2I-17).
- **Directory (R4, R5):** verified, stale, and unverified labels; deadline and amount formatting; filters map to `ScholarshipQuery` with `openOn` set to today (F-18-3), so closed listings never show on a page or in the Next 30/90 days chips; state and detail pages render from real core services with `PUBLIC_ACTOR`, hide drafts, other states, and scam-flagged listings, and 404 unknown states and listings; the state header counts open listings with one count query and shows "N of M match your filters" when filtered (F-18-4); metadata titles are set.
- **Offer tool (R6):** plain-language validation, the exact `PublicOfferInput` posted, rendering from a fixture `OfferComparison`, and a plain message for a 413 from the 64 KB public body cap.
- **Sign in (R7):** invalid email, sending state, 429 message, `?error=link` message, the family-invite note (D15), the under-13 notice, the resend countdown, the signed-in redirect to `/week` or `/admin`, and the address kept in `sessionStorage` rather than the check-email URL (F-18-6), with a bounce to `/sign-in` when it's missing.
- **Family join (R8):** a missing or cut-off token gets the incomplete-link card (F-18-9); signed out, the page shows `GET /family/invites/preview` (inviter first name, role, expiry) above the sign-in button, and an unknown invite shows only the generic card with no inviter name (D37, F-18-1); existing family, accept → `/family`, and 404/409 messages.
- **Helper view (R9):** the recommendation request card (note and helpful-by date) renders first when set (D38, HL-02); sections render only for the link's scope, costs never appear, the expiry notice, empty sections, a 404 for unknown and revoked links (HL-04), and the page charges the API's `helper-view:<ip>` bucket using the right-most forwarded hop.
- **Verify hours and error pages (R10):** details, confirm and decline bodies, the expired message, and the rate-limit message. The `(public)`, `(admin)`, `/h/[token]`, and `/verify-hours/[token]` error boundaries show a generic message, call `reset` on Try again, and never render the error's message, digest, or a token, or read the URL (F-18-2).
- **Admin (R11–R15):** the admin frame marks the current page, shows queue counts, and signs out (pages read through core `admin.getScholarshipForAdmin`, `admin.listScholarships`, and `admin.getCatalogTask`, which reject non-admins, D36); the eligibility editor produces JSON the domain `EligibilityRule` schema accepts for all 18 types; the scholarship editor posts a valid `ScholarshipUpsertInput`, PATCHes edits, and sets status with a note; the review queue shows quote-not-found issues and scam flags, and publishing calls `POST /admin/scholarships` then `POST /admin/catalog-tasks/:id/resolve` with `publishScholarshipId` (a retry PATCHes the listing it already created); re-checks PATCH the existing listing; a student submission with an extracted draft shows its field rows and scam checks and PATCHes its own listing before resolving, while one with no draft keeps the plain Publish (R2C-6); a re-check offers "Keep current listing" (resolve `rejected`, which core turns back to published) and "Retire listing" (`POST /admin/scholarships/:id/status` `retired`, then resolve) instead of Reject (R2C-7); reports close through `/admin/reports/:id/resolve`; the CSV goes up as `text/csv` and per-line errors render.
- **Round 3 (R11–R16):** sign-out leaves only on success or `unauthenticated`, and a 500 keeps the admin in place with the message (R3A-13); a 409 from the task or report resolve shows the server message, disables that item's buttons, and refreshes (R3A-21); the CSV refusal is a 413, and a bare 413 with no `ErrorBody` still shows the 5 MB message (R3A-22); the decision note, report note, and audit-log note carry `maxLength` 1000 and the research county 100 (R3A-24); admin instants read on the Central calendar ("Opened Oct 6, 2026" for a 9 pm Central task), catalog statuses are labeled, and deadlines carry the year (R3V-10); plan, stage, and income labels come from 02's maps (R3V-8).
- **Aid rules (R16, R2P-1):** the frame links `/admin/aid` ("Aid rules"); the editor refuses a 31% rate before any request, saves `AidRuleInput` with `PUT /admin/aid-rules`, adds a state deadline with `PUT /admin/aid-deadlines` (no `id`), edits one with its `id`, and deletes one with `DELETE /admin/aid-deadlines/:id`, keeping the table sorted by date.

## Review Checklist

- [ ] Every path created is owned by plan 18 in `00-overview.md` section 5; nothing under `src/lib`, `src/server`, `src/middleware.ts`, `test/**`, or another plan's components is touched.
- [ ] Imports match the drafted contracts: `getDeps`, `getPageActor`, `requirePageActor` (plan 13); `api`, `ApiError`, `errorMessage`, `usd`, `dateShort`, `instantShort`, `daysLabel`, `minutesLabel`, `plural`, `addDaysIso`, `cx` (plan 16); `clientIp` (plan 13); `searchScholarships`, `getScholarship`, `getHelperView`, `getVerificationRequest`, `resolveHelperToken`, `createHelperLink`, `revokeHelperLink`, `listCatalogTasks`, `getCatalogTask`, `getScholarshipForAdmin`, `listScholarships`, `listReports`, `listAidRules`, `listAidDeadlinesForAdmin`, `getMe`, `consumeRateLimit`, `currentSeason`, `currentAwardYear` (plans 06–08); `STATE_NAMES`, `localLabel`, `AcceptInviteInput` (plan 02); UI components and prop names (plan 15).
- [ ] Request bodies match section 10: `MagicLinkRequest`, `AcceptInviteInput`, `PublicOfferInput`, `VerificationSubmitInput`, `ScholarshipUpsertInput`, `ScholarshipStatusInput`, `CatalogTaskResolution`, `ResolveReportInput`, `ResearchInput`, `AidRuleInput`, `AidDeadlineInput`, and the raw `text/csv` import body.
- [ ] Every database-reading page, `sitemap.ts`, and `robots.ts` export `dynamic = "force-dynamic"`; every admin page calls `requirePageActor(["admin"])`.
- [ ] Token pages are `noindex` with `referrer: no-referrer`, and the helper and verify pages share the API's rate-limit keys.
- [ ] No sensitive values, costs, essays, or chats can render on the helper view; the directory never shows flagged, scam-flagged, or closed listings.
- [ ] Every 18 route group has an `error.tsx` (`(public)`, `(admin)`, `/h/[token]`, `/verify-hours/[token]`) that takes only `reset` into `ErrorState` and never prints the error or reads the URL.
- [ ] The sign-in email never appears in a URL; `/family/join` is reachable signed out (13 `PUBLIC_EXCEPTIONS`) and shows the preview only from `GET /family/invites/preview`.
- [ ] No copy promises sign-out on every device (no plan builds it).
- [ ] Only the 24 `ICON_NAMES` are used; no `next/script`, `next/font`, remote URLs in CSS, or tracker SDKs.
- [ ] The D-items are adopted, not open: D36 (core admin getters; `adminReads.ts` is gone), D37 (invite preview), D38 (`HelperView.request` card), D39 (no scam post-filter; `publicListing.ts` is gone), D40 (accepted: Publish and Reject only; re-checks say Keep current listing or Retire listing), D41 (`STATE_NAMES`/`localLabel` from `@scholarcrew/domain`; no local copies), and F-18-3 (`openOn`).
- [ ] Round 2 is applied: `draftOf`/`reportOf` read a submission's `draft` and `report`, and its plain Publish shows only without a draft (R2C-6); re-checks offer "Keep current listing" and "Retire listing" (R2C-7); `/admin/aid` and `AidRulesEditor` use 02's `AidRuleInput`/`AidDeadlineInput` and 14's three aid routes, and the `aid` NAV item maps through `adminActiveKey` (R2P-1); the privacy page has the Twilio and under-13 sentences (R2I-9, R2I-17).
- [ ] Round 3 is applied: `APP_PLAN_LABELS`, `APPLICATION_STAGE_LABELS`, and `INCOME_RANGE_LABELS` come from `@scholarcrew/domain` with no local copies (R3V-8); no `.slice(0, 10)` on an `IsoDateTime` remains, admin instants use `instantLong(iso, ADMIN_TZ)`, and the audit `WHEN` uses `ADMIN_TZ` (R3V-10); `AdminFrame.signOut` has no swallowed `catch` (R3A-13); `TaskReview.run` and `ReportsTable.close` handle `conflict` (R3A-21); `postCsv` has the 413 fallback (R3A-22); the four admin `maxLength`s are set (R3A-24); `OfferTool` is unchanged, since 06's rate-limit message now names the wait (R3A-23 via R3A-11).
