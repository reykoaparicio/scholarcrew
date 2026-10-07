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
