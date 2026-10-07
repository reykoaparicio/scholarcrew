import type { Story } from "@scholarcrew/domain";
import { countChars, countWords, limitState } from "@scholarcrew/engines";
import type { BadgeTone } from "@scholarcrew/ui";

export interface EssayStats {
  count: number;
  limit: number | null;
  unit: "words" | "characters";
  state: "ok" | "near" | "over";
  label: string;
}

/** ES-03: counts follow the target's limit (words first, then characters). */
export function essayStats(body: string, wordLimit: number | null, charLimit: number | null): EssayStats {
  const unit = wordLimit === null && charLimit !== null ? "characters" : "words";
  const limit = unit === "words" ? wordLimit : charLimit;
  const count = unit === "words" ? countWords(body) : countChars(body);
  return {
    count,
    limit,
    unit,
    state: limitState(count, limit),
    label: limit === null ? `${count} ${unit}` : `${count} / ${limit} ${unit}`,
  };
}

export function limitBadge(s: EssayStats): { tone: BadgeTone; text: string } | null {
  if (s.limit === null || s.state === "ok") return null;
  if (s.state === "near") return { tone: "warn", text: `${s.limit - s.count} ${s.unit} left` };
  return { tone: "crit", text: `${s.count - s.limit} over` };
}

/** Index of the nth (1-based) occurrence of `quote`, or -1. */
export function findOccurrence(text: string, quote: string, n: number): number {
  if (!quote || n < 1) return -1;
  let from = 0;
  for (let seen = 1; ; seen += 1) {
    const at = text.indexOf(quote, from);
    if (at === -1) return -1;
    if (seen === n) return at;
    from = at + 1;
  }
}

export interface Segment {
  text: string;
  /** 1-based marker number (the comment's position in the list), null for plain text. */
  n: number | null;
  id: string | null;
  /** Offset of the segment in the body; unique per segment, so it's the React key (no index keys). */
  start: number;
}

/** ES-04: highlights each comment's exact quote; overlapping or missing quotes come back as `unplaced`. */
export function highlightSegments(
  body: string,
  comments: Array<{ id: string; quote: string; occurrence: number }>,
): { segments: Segment[]; unplaced: string[] } {
  const found: Array<{ start: number; end: number; n: number; id: string }> = [];
  const unplaced: string[] = [];
  for (const [index, c] of comments.entries()) {
    const start = findOccurrence(body, c.quote, c.occurrence);
    if (start === -1) unplaced.push(c.id);
    else found.push({ start, end: start + c.quote.length, n: index + 1, id: c.id });
  }
  found.sort((a, b) => a.start - b.start || a.n - b.n);
  const placed: typeof found = [];
  for (const f of found) {
    const last = placed.at(-1);
    if (last && f.start < last.end) unplaced.push(f.id);
    else placed.push(f);
  }
  const segments: Segment[] = [];
  let at = 0;
  for (const p of placed) {
    if (p.start > at) segments.push({ text: body.slice(at, p.start), n: null, id: null, start: at });
    segments.push({ text: body.slice(p.start, p.end), n: p.n, id: p.id, start: p.start });
    at = p.end;
  }
  if (at < body.length || segments.length === 0) segments.push({ text: body.slice(at), n: null, id: null, start: at });
  const order = new Map(comments.map((c, i) => [c.id, i]));
  unplaced.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return { segments, unplaced };
}

/** Drops one common ending so "serve" and "service" meet. Short words are kept as is. */
export function stem(word: string): string {
  const w = word.toLowerCase();
  const s = w.replace(/(ing|ers|er|ed|es|s|ice|e)$/, "");
  return s.length >= 3 ? s : w;
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+/g) ?? [];
}

/** ES-06: stories whose themes appear in the prompt, best first; ties go to fewer prior uses. */
export function rankStories(
  prompt: string,
  stories: Story[],
  limit = 3,
): Array<{ story: Story; matched: string[]; score: number }> {
  const promptStems = new Set(wordsOf(prompt).map(stem));
  return stories
    .filter((s) => s.archivedAt === null)
    .map((story) => {
      const matched = story.themes.filter((theme) => wordsOf(theme).some((w) => promptStems.has(stem(w))));
      return { story, matched, score: matched.length };
    })
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.story.uses.length - b.story.uses.length || a.story.title.localeCompare(b.story.title),
    )
    .slice(0, limit);
}
