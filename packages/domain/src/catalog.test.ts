import { describe, expect, it } from "vitest";
import { CatalogTaskPayload, ListingDraft, ScholarshipUpsertInput } from "./catalog";

const draft = {
  name: "Rotary Club of Eastside Scholarship",
  provider: "Rotary Club of Eastside",
  url: "https://example.org/rotary",
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

describe("catalog schemas", () => {
  it("parses a listing draft", () => {
    expect(ListingDraft.parse(draft).fieldQuotes).toHaveLength(1);
  });

  it("parses task payloads by type", () => {
    const p = CatalogTaskPayload.parse({
      type: "user_submission",
      url: "https://example.org/x",
      name: "X Award",
      notes: "",
      submittedById: "00000000-0000-4000-8000-000000000000",
    });
    expect(p.type).toBe("user_submission");
  });

  it("accepts a user_submission payload with or without the extracted draft and report", () => {
    const base = {
      type: "user_submission",
      url: "https://example.org/x",
      name: "X Award",
      notes: "",
      submittedById: "00000000-0000-4000-8000-000000000000",
    };
    const bare = CatalogTaskPayload.parse(base);
    expect(bare.type === "user_submission" && bare.draft).toBeUndefined();
    const report = { ok: true, issues: [], scamFlags: [] };
    const full = CatalogTaskPayload.parse({ ...base, draft, report });
    expect(full.type === "user_submission" && full.draft?.name).toBe(draft.name);
    expect(full.type === "user_submission" && full.report?.ok).toBe(true);
    expect(CatalogTaskPayload.parse({ ...base, draft: null, report: null })).toMatchObject({
      draft: null,
      report: null,
    });
  });

  it("requires min amount not above max", () => {
    const base = {
      id: null,
      slug: "rotary-eastside",
      name: draft.name,
      provider: draft.provider,
      url: draft.url,
      sourceUrl: draft.url,
      amountMinUsd: 3000,
      amountMaxUsd: 2500,
      renewable: false,
      renewalTerms: "",
      deadline: "2026-10-30",
      cycle: "2026-27",
      localArea: draft.localArea,
      eligibility: draft.eligibility,
      requirements: draft.requirements,
      estMinutes: 45,
      scamFlags: [],
    };
    expect(ScholarshipUpsertInput.safeParse(base).success).toBe(false);
    expect(ScholarshipUpsertInput.safeParse({ ...base, amountMinUsd: 2500 }).success).toBe(true);
  });
});
