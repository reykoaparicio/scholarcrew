export const MAX_NEW_RUN = 25;

function tokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .match(/[\p{L}\p{N}']+/gu) ?? []
  );
}

function trigrams(words: string[]): string[] {
  const out: string[] = [];
  for (let k = 0; k + 2 < words.length; k += 1) out.push(`${words[k]} ${words[k + 1]} ${words[k + 2]}`);
  return out;
}

/**
 * ES-09: the longest run of words in `text` in which every word trigram is absent from the student's own texts.
 * More than 25 such words means the output reads like prose the crew wrote, not a quote or a comment.
 */
export function checkIntegrity(text: string, studentTexts: string[]): { ok: boolean; longestNewRun: number } {
  const words = tokens(text);
  const known = new Set(studentTexts.flatMap((t) => trigrams(tokens(t))));
  const grams = trigrams(words);
  let longestStretch = 0;
  let stretch = 0;
  for (const g of grams) {
    stretch = known.has(g) ? 0 : stretch + 1;
    longestStretch = Math.max(longestStretch, stretch);
  }
  const longestNewRun = longestStretch > 0 ? longestStretch + 2 : Math.min(words.length, 2);
  return { ok: longestNewRun <= MAX_NEW_RUN, longestNewRun };
}
