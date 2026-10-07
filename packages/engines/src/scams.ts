import { ScamFlag } from "@scholarcrew/domain";

const PATTERNS: Record<ScamFlag, RegExp[]> = {
  application_fee: [/application fee(?!s?\s+waiver)/gi, /processing fee/gi, /\$\s?\d[\d,]*(?:\.\d{2})?\s+fee\b/gi],
  guaranteed_award: [/\bguarantee(?:d|s)?\b/gi],
  bank_or_card_request: [/\bbank account\b/gi, /\brouting number\b/gi, /\b(?:credit|debit) card\b/gi],
  ssn_request: [/\bsocial security\b/gi, /\bssn\b/gi],
  sweepstakes: [/\bsweepstakes\b/gi, /\benter to win\b/gi, /\bdrawing\b/gi],
  unsolicited_winner: [/\byou have been selected\b/gi, /\byou['’]ve won\b/gi, /\bcongratulations,\s*you\b/gi],
  pay_for_info: [/\bfor a fee,?\s+we['’]ll find\b/gi, /\bpay for a list\b/gi],
};

/** Text right before a fee phrase that makes it a "no fee" statement. */
const FEE_NEGATION = /\b(?:no|without|zero|free of)\s+(?:(?:an?|any)\s+)?["'“”]?$/i;

function hits(text: string, pattern: RegExp, negatable: boolean): boolean {
  for (const match of text.matchAll(pattern)) {
    if (!negatable) return true;
    const at = match.index ?? 0;
    const before = text.slice(Math.max(0, at - 20), at);
    if (!FEE_NEGATION.test(before)) return true;
  }
  return false;
}

/**
 * Case-insensitive scam rules over a listing's text. `requiresFee` (from extraction) always flags a fee.
 * `amountMaxUsd` is part of the contract for future amount-based rules and isn't used yet.
 */
export function detectScamSignals(text: string, listing: { amountMaxUsd: number; requiresFee?: boolean }): ScamFlag[] {
  const found = new Set<ScamFlag>();
  if (listing.requiresFee === true) found.add("application_fee");
  for (const flag of ScamFlag.options) {
    if (PATTERNS[flag].some((pattern) => hits(text, pattern, flag === "application_fee"))) found.add(flag);
  }
  return ScamFlag.options.filter((flag) => found.has(flag));
}
