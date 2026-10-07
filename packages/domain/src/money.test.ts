import { describe, expect, it } from "vitest";
import {
  AidDeadlineInput,
  AidRuleInput,
  CreateOfferInput,
  FREE_CATEGORIES,
  LOAN_CATEGORIES,
  Offer,
  ParsedOffer,
  PublicOfferInput,
} from "./money";
import { PlanItemInput, Reminder } from "./plan";

describe("money schemas", () => {
  it("splits categories into free money and loans", () => {
    expect(FREE_CATEGORIES).toEqual(["grant", "scholarship"]);
    expect(LOAN_CATEGORIES).toContain("loan_parent_plus");
    expect(LOAN_CATEGORIES).not.toContain("work_study");
  });

  it("limits the public tool to 4 offers", () => {
    const offer = { name: "State U", costOfAttendanceUsd: 27800, lines: [] };
    expect(PublicOfferInput.safeParse({ offers: [offer] }).success).toBe(true);
    expect(PublicOfferInput.safeParse({ offers: [offer, offer, offer, offer, offer] }).success).toBe(false);
    expect(PublicOfferInput.safeParse({ offers: [] }).success).toBe(false);
  });

  it("validates award year shape", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(CreateOfferInput.safeParse({ collegeId: "123456", documentId: id, awardYear: "2027-28" }).success).toBe(
      true,
    );
    expect(CreateOfferInput.safeParse({ collegeId: "123456", documentId: id, awardYear: "2027" }).success).toBe(false);
  });

  it("parses model offer output with nullable fields", () => {
    const v = ParsedOffer.parse({
      costOfAttendanceUsd: 27800,
      awardYear: null,
      lines: [
        {
          label: "State U Merit",
          amountUsd: 3000,
          category: "scholarship",
          renewable: true,
          renewalCondition: "3.0 GPA",
          page: 1,
          citedText: "State U Merit Award $3,000",
        },
      ],
    });
    expect(v.lines[0]?.category).toBe("scholarship");
  });

  it("carries the offer's parse job id, or null (D31)", () => {
    const offer = {
      id: "00000000-0000-4000-8000-000000000000",
      collegeId: "123456",
      collegeName: "State U",
      awardYear: "2027-28",
      documentId: null,
      status: "parsing",
      costOfAttendanceUsd: null,
      createdAt: "2026-10-06T15:00:00.000Z",
      confirmedAt: null,
      parseJobId: "00000000-0000-4000-8000-000000000001",
    };
    expect(Offer.safeParse(offer).success).toBe(true);
    expect(Offer.safeParse({ ...offer, parseJobId: null }).success).toBe(true);
    expect(Offer.safeParse({ ...offer, parseJobId: undefined }).success).toBe(false);
    expect(Offer.safeParse({ ...offer, parseJobId: "job-1" }).success).toBe(false);
  });
});

describe("aid rule and deadline inputs (R2P-1)", () => {
  const sourceUrl = "https://studentaid.gov/understand-aid/types/loans/interest-rates";

  it("bounds loan rates at 30 percent", () => {
    const value = { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 };
    expect(AidRuleInput.safeParse({ awardYear: "2027-28", key: "federal_loan_rates", value, sourceUrl }).success).toBe(
      true,
    );
    expect(
      AidRuleInput.safeParse({
        awardYear: "2027-28",
        key: "federal_loan_rates",
        value: { ...value, parent_plus: 31 },
        sourceUrl,
      }).success,
    ).toBe(false);
    expect(AidRuleInput.safeParse({ awardYear: "2027-28", key: "pell_max", value, sourceUrl }).success).toBe(false);
    expect(
      AidRuleInput.safeParse({ awardYear: "2027-28", key: "federal_loan_rates", value, sourceUrl: "not a url" })
        .success,
    ).toBe(false);
  });

  it("takes a federal or state deadline with an optional id", () => {
    const base = {
      awardYear: "2027-28",
      program: "FAFSA",
      deadline: "2028-06-30",
      sourceUrl: "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines",
    };
    expect(AidDeadlineInput.parse({ ...base, state: null }).note).toBe("");
    expect(
      AidDeadlineInput.safeParse({ ...base, state: "TX", id: "00000000-0000-4000-8000-000000000000" }).success,
    ).toBe(true);
    expect(AidDeadlineInput.safeParse({ ...base, state: "ZZ" }).success).toBe(false);
    expect(AidDeadlineInput.safeParse({ ...base, state: null, program: "   " }).success).toBe(false);
  });
});

describe("PlanItemInput", () => {
  it("requires explicit nullable fields", () => {
    const v = PlanItemInput.parse({ title: "Ask Ms. Patel", kind: "recommendation", minutes: 10 });
    expect(v).toMatchObject({
      refType: null,
      refId: null,
      valueUsd: null,
      dueOn: null,
      contributors: [],
      weekStart: null,
    });
  });
});

describe("Reminder", () => {
  it("allows the 30-day renewal offset next to 7, 3, and 1 (D2)", () => {
    const base = {
      userId: "00000000-0000-4000-8000-000000000000",
      title: "Hill Country STEM Award renewal is coming up",
      dueOn: "2027-05-01",
      refType: "scholarship_application",
      refId: "00000000-0000-4000-8000-000000000001",
      dedupeKey: "renewal:00000000-0000-4000-8000-000000000001:2027",
    };
    for (const offset of [30, 7, 3, 1]) expect(Reminder.safeParse({ ...base, offset }).success).toBe(true);
    expect(Reminder.safeParse({ ...base, offset: 14 }).success).toBe(false);
  });
});
