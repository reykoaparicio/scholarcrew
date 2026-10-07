import { type ListingDraft, SCAM_FLAG_TEXT, type VerificationReport } from "@scholarcrew/domain";
import { detectScamSignals } from "@scholarcrew/engines";
import { cleanDomains, hostAllowed, isHttpUrl } from "./urls";

export const MAX_AMOUNT_USD = 100_000;

export interface VerifyOptions {
  /** When non-empty, the draft URL's host must be one of these or a subdomain. */
  allowedDomains?: string[];
  /** Default true. The re-check turns it off because it no longer has the full page text. */
  checkQuotes?: boolean;
  finalUrl?: string;
}

type Issue = VerificationReport["issues"][number];

/** For quote matching: straight quotes and hyphens, single spaces, lowercase. */
export function normalizeForMatch(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Code checks every draft gets before an admin sees it (CA-03). ok means no issues at all. */
export function verifyDraft(
  draft: ListingDraft,
  pageText: string,
  now: Date,
  opts: VerifyOptions = {},
): VerificationReport {
  const issues: Issue[] = [];
  const add = (code: Issue["code"], field: string | null, message: string) => {
    issues.push({ code, field, message });
  };

  if (draft.name.trim() === "") add("missing_field", "name", "The listing has no name.");
  if (draft.provider.trim() === "") add("missing_field", "provider", "The listing has no provider.");
  if (draft.amountMaxUsd === null) add("missing_field", "amountMaxUsd", "The page doesn't state an award amount.");
  if (!isHttpUrl(draft.url)) add("missing_field", "url", "The listing URL isn't a valid web address.");

  const today = now.toISOString().slice(0, 10);
  if (draft.deadline !== null && draft.deadline < today) {
    add("deadline_past", "deadline", `The deadline ${draft.deadline} is before today (${today}).`);
  }

  const min = draft.amountMinUsd;
  const max = draft.amountMaxUsd;
  if (min !== null && max !== null && min > max) {
    add("amount_invalid", "amountMinUsd", `The minimum ($${min}) is above the maximum ($${max}).`);
  }
  if (max === 0) add("amount_invalid", "amountMaxUsd", "The maximum award is $0.");
  if (max !== null && max > MAX_AMOUNT_USD) {
    add("amount_invalid", "amountMaxUsd", `The maximum award ($${max}) is above $100,000.`);
  }

  if (opts.checkQuotes !== false) {
    const haystack = normalizeForMatch(pageText);
    for (const q of draft.fieldQuotes) {
      const needle = normalizeForMatch(q.quote);
      if (needle === "" || !haystack.includes(needle)) {
        add("quote_not_found", q.field, `Quote not found on the page: "${q.quote.slice(0, 120)}"`);
      }
    }
  }

  const scamFlags = detectScamSignals(pageText, {
    amountMaxUsd: max ?? 0,
    requiresFee: (draft.applicationFeeUsd ?? 0) > 0,
  });
  for (const flag of scamFlags) add("scam_signal", null, SCAM_FLAG_TEXT[flag]);

  const allowed = cleanDomains(opts.allowedDomains ?? []);
  if (
    allowed.length > 0 &&
    (!hostAllowed(draft.url, allowed) || (opts.finalUrl !== undefined && !hostAllowed(opts.finalUrl, allowed)))
  ) {
    add("domain_not_allowed", "url", `The listing URL isn't on an allowed domain (${allowed.join(", ")}).`);
  }

  return { ok: issues.length === 0, issues, scamFlags };
}
