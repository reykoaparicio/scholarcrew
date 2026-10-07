export function scoreMatch(input: {
  amountMaxUsd: number;
  estMinutes: number;
  reasonsCount: number;
  unknownsCount: number;
  daysUntilDeadline: number | null;
  reusableStories: number;
}): { fitScore: number; valuePerHour: number } {
  const raw = 50 + 10 * input.reasonsCount - 15 * input.unknownsCount + (input.reusableStories > 0 ? 10 : 0);
  const fitScore = Math.min(100, Math.max(0, Math.round(raw)));
  const hours = Math.max(input.estMinutes, 5) / 60;
  const valuePerHour = Math.round(((input.amountMaxUsd * fitScore) / 100 / hours) * 100) / 100;
  return { fitScore, valuePerHour };
}

function compareDeadlines(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function deadlineGroup(days: number | null): number {
  return days === null ? 1 : days < 0 ? 2 : 0;
}

/** Returns a new array. Array.prototype.sort is stable, so full ties keep input order. */
export function rankMatches<T extends { fitScore: number; valuePerHour: number; daysUntilDeadline: number | null }>(
  m: T[],
): T[] {
  return [...m].sort(
    (a, b) =>
      deadlineGroup(a.daysUntilDeadline) - deadlineGroup(b.daysUntilDeadline) ||
      b.valuePerHour - a.valuePerHour ||
      compareDeadlines(a.daysUntilDeadline, b.daysUntilDeadline),
  );
}
