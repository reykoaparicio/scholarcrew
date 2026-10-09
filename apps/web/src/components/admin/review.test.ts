import {
  type CatalogTask,
  type ListingDraft,
  type Scholarship,
  ScholarshipUpsertInput,
  type VerificationReport,
} from "@scholarcrew/domain";
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
  requirements: {
    essays: [{ prompt: "Energy in your community", wordLimit: 300 }],
    recommendations: 0,
    transcript: false,
    serviceHours: null,
    other: [],
  },
  fieldQuotes: [
    { field: "amountMaxUsd", quote: "awards four $1,500 scholarships each spring" },
    { field: "requirements", quote: "a 300-word essay on energy in your community" },
  ],
};
const REPORT: VerificationReport = {
  ok: false,
  issues: [
    { code: "quote_not_found", field: "requirements", message: 'Quote not found on the page: "a 300-word essay"' },
  ],
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
    expect(taskTitle(report, "Coding for Good Award")).toBe("Coding for Good Award · Dead link");
    expect(taskChip(report)).toEqual({ tone: "warn", icon: "alert", text: "Dead link" });
    const submission: CatalogTask = {
      ...TASK,
      kind: "user_submission",
      payload: {
        type: "user_submission",
        url: "https://x.example",
        name: "Garden Club Award",
        notes: "",
        submittedById: TASK.id,
      },
    };
    expect(taskTitle(submission)).toBe("Garden Club Award");
    expect(taskChip(submission).text).toBe("Only the student sees it");
    expect(
      taskChip({
        ...TASK,
        payload: { ...TASK.payload, report: { ok: true, issues: [], scamFlags: [] } } as CatalogTask["payload"],
      }),
    ).toEqual({
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
    expect(by("amountMaxUsd")).toMatchObject({
      value: "$1,500",
      quote: "awards four $1,500 scholarships each spring",
      check: "found",
    });
    expect(by("requirements")).toMatchObject({ value: "1 essay (300 words)", check: "not_found" });
    expect(by("renewable")).toMatchObject({ value: "Not stated", quote: null, check: "none" });
    expect(by("eligibility")?.value).toBe("Lives in Maple, Pecan counties, TX");
    expect(by("applicationFeeUsd")?.value).toBe("None");
    const changed = fieldRows({ ...DRAFT, deadline: "2027-03-15" }, null, DRAFT);
    expect(changed.find((r) => r.field === "deadline")).toMatchObject({
      before: "Mar 1, 2027",
      value: "Mar 15, 2027",
      changed: true,
    });
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
      payload: {
        type: "recheck_changed",
        url: TASK.payload.type === "research_candidate" ? TASK.payload.url : "",
        before: DRAFT,
        after: DRAFT,
        report: null,
      },
    };
    const defaults = publishDefaults(recheck, DRAFT, existing, "2026-27");
    expect(defaults).toEqual({ slug: "pecan-valley", cycle: "2025-26", estMinutes: "45" });
    const out = publishInput(recheck, DRAFT, defaults, existing);
    expect(out).toMatchObject({
      ok: true,
      input: { id: existing.id, slug: "pecan-valley", sourceUrl: "https://pecanvalley.example/old" },
    });
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
    const bare: CatalogTask = {
      ...TASK,
      kind: "user_submission",
      scholarshipId: "55555555-5555-4555-8555-555555555555",
      payload,
    };
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
      input: {
        id: placeholder.id,
        slug: "garden-club-award-k3f9",
        provider: "Pecan Valley Electric Cooperative",
        amountMaxUsd: 1500,
      },
    });
  });
});
