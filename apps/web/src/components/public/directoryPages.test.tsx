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
    await factories.scholarship(db, {
      slug: "fee-award",
      name: "Fee Award",
      scamFlags: ["application_fee"],
      localArea: TX,
    });
    await factories.scholarship(db, { slug: "ohio-award", name: "Ohio Award", localArea: { ...TX, state: "OH" } });
    await factories.scholarship(db, {
      slug: "tx-closed",
      name: "Closed Texas Award",
      deadline: "2026-09-01",
      localArea: TX,
    });

    const html = renderToStaticMarkup(
      await StatePage({ params: Promise.resolve({ state: "tx" }), searchParams: sp() }),
    );
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
      requirements: {
        essays: [{ prompt: "Why STEM?", wordLimit: 500 }],
        recommendations: 1,
        transcript: true,
        serviceHours: null,
        other: [],
      },
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
