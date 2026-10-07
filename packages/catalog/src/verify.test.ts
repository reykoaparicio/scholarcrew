import { type ListingDraft, SCAM_FLAG_TEXT } from "@scholarcrew/domain";
import { detectScamSignals } from "@scholarcrew/engines";
import { describe, expect, it } from "vitest";
import { PAGE_TEXT, VALID_DRAFT } from "../test/fixtures";
import { hostAllowed, normalizeUrl } from "./urls";
import { type VerifyOptions, verifyDraft } from "./verify";

const NOW = new Date("2026-10-06T15:00:00.000Z");

function codes(draft: ListingDraft, opts: VerifyOptions = {}, now = NOW): string[] {
  return verifyDraft(draft, PAGE_TEXT, now, opts).issues.map((issue) => `${issue.code}:${issue.field}`);
}

describe("url helpers", () => {
  it("normalizes URLs for dedupe", () => {
    expect(normalizeUrl("https://Example.ORG/Rotary/?a=1#apply")).toBe("https://example.org/Rotary?a=1");
    expect(normalizeUrl(" https://example.org/ ")).toBe("https://example.org");
    expect(normalizeUrl("http://example.org:8080/x//")).toBe("http://example.org:8080/x");
    expect(normalizeUrl("mailto:a@example.org")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });

  it("matches allowed domains and their subdomains only", () => {
    expect(hostAllowed("https://rotary.example.org/x", ["example.org"])).toBe(true);
    expect(hostAllowed("https://example.org", [" Example.org ", ""])).toBe(true);
    expect(hostAllowed("https://badexample.org", ["example.org"])).toBe(false);
    expect(hostAllowed("https://example.org.evil.test", ["example.org"])).toBe(false);
    expect(hostAllowed("nope", ["example.org"])).toBe(false);
  });
});

describe("verifyDraft", () => {
  it("passes a clean draft", () => {
    expect(verifyDraft(VALID_DRAFT, PAGE_TEXT, NOW, { allowedDomains: ["example.org"] })).toEqual({
      ok: true,
      issues: [],
      scamFlags: [],
    });
  });

  it("flags a missing name, provider, amount, and URL", () => {
    const draft = { ...VALID_DRAFT, name: " ", provider: "", amountMinUsd: null, amountMaxUsd: null, url: "" };
    expect(codes(draft).filter((c) => c.startsWith("missing_field"))).toEqual([
      "missing_field:name",
      "missing_field:provider",
      "missing_field:amountMaxUsd",
      "missing_field:url",
    ]);
  });

  it("flags a deadline before today in UTC", () => {
    expect(codes({ ...VALID_DRAFT, deadline: "2026-10-05" })).toContain("deadline_past:deadline");
    expect(codes({ ...VALID_DRAFT, deadline: "2026-10-06" })).not.toContain("deadline_past:deadline");
    // 11:30 pm in Chicago on Oct 6 is already Oct 7 in UTC.
    const lateEvening = new Date("2026-10-06T23:30:00-05:00");
    expect(codes({ ...VALID_DRAFT, deadline: "2026-10-06" }, {}, lateEvening)).toContain("deadline_past:deadline");
  });

  it("flags impossible amounts", () => {
    const amountCodes = (min: number | null, max: number | null) =>
      codes({ ...VALID_DRAFT, amountMinUsd: min, amountMaxUsd: max }).filter((c) => c.startsWith("amount_invalid"));
    expect(amountCodes(3000, 2500)).toEqual(["amount_invalid:amountMinUsd"]);
    expect(amountCodes(0, 0)).toEqual(["amount_invalid:amountMaxUsd"]);
    expect(amountCodes(1000, 150_000)).toEqual(["amount_invalid:amountMaxUsd"]);
    expect(amountCodes(100_000, 100_000)).toEqual([]);
    expect(amountCodes(null, 2500)).toEqual([]);
  });

  it("checks quotes against the page ignoring case, spacing, and curly quotes", () => {
    const draft = {
      ...VALID_DRAFT,
      fieldQuotes: [
        { field: "deadline", quote: "Applications are due November 1, 2026." },
        { field: "requirements", quote: "STUDENTS  don\u2019t need\nto be Rotary members." },
      ],
    };
    expect(verifyDraft(draft, PAGE_TEXT, NOW).issues.filter((i) => i.code === "quote_not_found")).toEqual([
      {
        code: "quote_not_found",
        field: "deadline",
        message: 'Quote not found on the page: "Applications are due November 1, 2026."',
      },
    ]);
  });

  it("skips quote checks when asked", () => {
    const draft = { ...VALID_DRAFT, fieldQuotes: [{ field: "deadline", quote: "Not on the page." }] };
    const quoteIssues = (opts: VerifyOptions) =>
      verifyDraft(draft, "", NOW, opts).issues.filter((i) => i.code === "quote_not_found");
    expect(quoteIssues({})).toHaveLength(1);
    expect(quoteIssues({ checkQuotes: false })).toEqual([]);
  });

  it("flags scam signals with their reasons", () => {
    const text =
      "Pay a $25 processing fee to apply. Every applicant is guaranteed an award. Send your bank account number to claim it.";
    const draft = { ...VALID_DRAFT, applicationFeeUsd: 25, fieldQuotes: [] };
    const expected = detectScamSignals(text, { amountMaxUsd: 2500, requiresFee: true });
    expect(expected.length).toBeGreaterThan(0);
    const report = verifyDraft(draft, text, NOW);
    expect(report.ok).toBe(false);
    expect(report.scamFlags).toEqual(expected);
    expect(report.issues.filter((i) => i.code === "scam_signal")).toEqual(
      expected.map((flag) => ({ code: "scam_signal", field: null, message: SCAM_FLAG_TEXT[flag] })),
    );
  });

  it("flags a listing URL outside the allowed domains", () => {
    expect(codes(VALID_DRAFT, { allowedDomains: ["foundation.example.com"] })).toContain("domain_not_allowed:url");
    expect(codes(VALID_DRAFT, { allowedDomains: ["example.org"] })).not.toContain("domain_not_allowed:url");
    expect(codes(VALID_DRAFT, { allowedDomains: [""] })).not.toContain("domain_not_allowed:url");
    expect(codes(VALID_DRAFT)).not.toContain("domain_not_allowed:url");
  });
});
