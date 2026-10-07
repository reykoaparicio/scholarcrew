/** Index of the nth (1-based) exact occurrence of `quote` in `body`, or -1. */
export function occurrenceIndex(body: string, quote: string, occurrence: number): number {
  if (!quote || occurrence < 1) return -1;
  let from = 0;
  let index = -1;
  for (let n = 0; n < occurrence; n += 1) {
    index = body.indexOf(quote, from);
    if (index === -1) return -1;
    from = index + 1;
  }
  return index;
}
