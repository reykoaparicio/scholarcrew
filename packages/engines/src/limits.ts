/** Digits joined by "." or "," ("3.72", "2,500") read as one number. */
const NUMBER_SEPARATOR = /(\p{N})[.,](?=\p{N})/gu;
/** Anything that is not a letter, mark, digit, apostrophe, or hyphen separates words. */
const SEPARATORS = /[^\p{L}\p{M}\p{N}'’‐‑-]+/u;
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

export function countWords(text: string): number {
  let count = 0;
  for (const token of text.replace(NUMBER_SEPARATOR, "$1").split(SEPARATORS)) {
    if (HAS_WORD_CHAR.test(token)) count += 1;
  }
  return count;
}

/** Unicode code points, the way activity and form limits are counted. */
export function countChars(text: string): number {
  return [...text].length;
}

/** "near" from 90% of the limit up to the limit; "over" past it. */
export function limitState(count: number, limit: number | null): "ok" | "near" | "over" {
  if (limit === null) return "ok";
  if (count > limit) return "over";
  if (count * 10 >= limit * 9) return "near";
  return "ok";
}
