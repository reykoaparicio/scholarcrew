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
    expect(emptyListingForm("2026-27")).toMatchObject({
      cycle: "2026-27",
      estMinutes: "60",
      state: "TX",
      national: false,
    });
  });
});

describe("toUpsertInput", () => {
  it("round-trips a listing through the form", () => {
    const out = toUpsertInput(
      LISTING.id,
      listingFormFrom(LISTING),
      requirementsFormFrom(LISTING.requirements),
      LISTING.eligibility,
    );
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
    const inverted = toUpsertInput(
      null,
      { ...listingFormFrom(LISTING), amountMin: "5000", amountMax: "1000" },
      emptyRequirementsForm(),
      [],
    );
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
      expect(out.input.requirements).toEqual({
        essays: [],
        recommendations: 0,
        transcript: false,
        serviceHours: 40,
        other: ["Resume", "Photo"],
      });
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
