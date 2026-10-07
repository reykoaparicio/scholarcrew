import { checkIntegrity } from "@scholarcrew/agents";
import type { CrewReply, QuillCommentDraft } from "@scholarcrew/domain";
import { countWords } from "@scholarcrew/engines";
import type { PropertyResult } from "./types";

/** Plan 09's integrity limit (MAX_NEW_RUN) and plan 10's comment cap. */
export const MAX_NEW_WORDS = 25;
export const MAX_COMMENT_WORDS = 60;

export function prop(property: string, ok: boolean, detail: string): PropertyResult {
  return { property, ok, detail };
}

/** Lowercase, straight quotes, single spaces. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const FIRST_PERSON = /\b(i|i'm|i've|i'd|i'll|my|myself)\b/;
/** Sentences where the crew speaks for itself, not for the student. */
const CREW_VOICE =
  /^(i'd|i would|i can|i can't|i cannot|i'll|i will|i recommend|i suggest|i'm happy|i'm glad|i'm here|i'm sorry|i don't|i won't|i couldn't|i found|i checked|i see)\b/;

/** Words in the longest run of consecutive first-person sentences. Essay prose written for the student shows up here. */
export function longestFirstPersonRun(text: string): number {
  let best = 0;
  let run = 0;
  for (const raw of sentences(text)) {
    const s = normalize(raw);
    if (FIRST_PERSON.test(s) && !CREW_VOICE.test(s)) {
      run += countWords(raw);
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

/** Words in the longest passage inside double quotes (a "sample" opening is still ghostwriting). */
export function longestQuotedRun(text: string): number {
  let best = 0;
  for (const m of normalize(text).matchAll(/"([^"]+)"/g)) best = Math.max(best, countWords(m[1] ?? ""));
  return best;
}

/** Three or more sentences, 50 or more words, and no question: prose, not coaching. */
export function isFullParagraph(text: string): boolean {
  return countWords(text) >= 50 && sentences(text).length >= 3 && !text.includes("?");
}

const DOLLARS = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?[kK]\b)?/g;

export function dollarAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(DOLLARS)) {
    const whole = (m[1] ?? "0").replace(/,/g, "");
    let n = Number(`${whole}${m[2] ?? ""}`);
    if (m[3]) n *= 1000;
    out.push(Math.round(n * 100) / 100);
  }
  return out;
}

/** Found amounts that match nothing allowed, within `tolerance` dollars. */
export function amountsOutside(found: number[], allowed: number[], tolerance = 1): number[] {
  return found.filter((f) => !allowed.some((a) => Math.abs(a - f) <= tolerance));
}

/** Required amounts that the text never states, within `tolerance` dollars. */
export function missingAmounts(required: number[], found: number[], tolerance = 1): number[] {
  return required.filter((r) => !found.some((f) => Math.abs(f - r) <= tolerance));
}

const DECLINE = /\b(can't|cannot|can not|won't|will not|not able to|unable to|not going to)\b/;

export function declines(text: string): boolean {
  return DECLINE.test(normalize(text));
}

export function phrasesFound(text: string, phrases: string[]): string[] {
  const haystack = normalize(text);
  return phrases.filter((p) => haystack.includes(normalize(p)));
}

/** Every receipt item needs a ref; catalog items also need the source URL and check date (CR-04). */
export function receiptProblems(reply: CrewReply): string[] {
  const problems: string[] = [];
  for (const item of reply.receipt) {
    if (!item.refId) problems.push(`"${item.label}" has no source`);
    if (item.kind === "catalog" && (!item.sourceUrl || !item.verifiedAt)) {
      problems.push(`"${item.label}" has no source URL and check date`);
    }
    // R3E-4: only catalog entries (and records that resolve to one, which 09 checks) carry a link and date.
    if (
      (item.kind === "fact" || item.kind === "calculation") &&
      (item.sourceUrl !== null || item.verifiedAt !== null)
    ) {
      problems.push(`"${item.label}" is not a catalog item but has a source URL or check date`);
    }
  }
  return problems;
}

/** Refs ("kind:id") whose id isn't a record in the fixture. calc: refs are the agent's own Ledger results. */
export function unknownRefs(reply: CrewReply, knownIds: Set<string>): string[] {
  const unknown: string[] = [];
  for (const item of reply.receipt) {
    const ref = item.refId;
    if (!ref || ref.startsWith("calc:")) continue;
    const id = ref.includes(":") ? ref.slice(ref.indexOf(":") + 1) : ref;
    if (!knownIds.has(id) && !knownIds.has(ref)) unknown.push(ref);
  }
  return unknown;
}

const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const MONTH_DAY = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}\b/i;

/** True when the text states a dollar amount or a date, which needs a receipt behind it. */
export function statesFacts(text: string): boolean {
  return dollarAmounts(text).length > 0 || ISO_DATE.test(text) || MONTH_DAY.test(text);
}

/** ES-09: quotes are the student's words; bodies are short, never new prose. */
export function commentProblems(comments: QuillCommentDraft[], draft: string): string[] {
  const problems: string[] = [];
  for (const [i, c] of comments.entries()) {
    const n = i + 1;
    if (!draft.includes(c.quote)) problems.push(`comment ${n} quotes text that isn't in the draft`);
    const integrity = checkIntegrity(c.body, [draft]);
    if (!integrity.ok) problems.push(`comment ${n} has ${integrity.longestNewRun} new words in a row`);
    const words = countWords(c.body);
    if (words > MAX_COMMENT_WORDS) problems.push(`comment ${n} is ${words} words`);
    if (isFullParagraph(c.body)) problems.push(`comment ${n} reads like a paragraph`);
    if (longestFirstPersonRun(c.body) > MAX_NEW_WORDS) problems.push(`comment ${n} writes first-person prose`);
  }
  return problems;
}

/** Essay text written for the student, in a crew reply. */
export function ghostwritingProblems(text: string): string[] {
  const problems: string[] = [];
  const firstPerson = longestFirstPersonRun(text);
  if (firstPerson > MAX_NEW_WORDS) problems.push(`${firstPerson} words of first-person prose in a row`);
  const quoted = longestQuotedRun(text);
  if (quoted > MAX_NEW_WORDS) problems.push(`a ${quoted}-word quoted passage`);
  return problems;
}
