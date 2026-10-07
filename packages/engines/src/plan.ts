import type { PlanItem } from "@scholarcrew/domain";

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Ascending, nulls last. */
function compareDueOn(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compareStrings(a, b);
}

/** Descending, nulls last. */
function compareValue(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function compareOpen(a: PlanItem, b: PlanItem): number {
  return (
    compareDueOn(a.dueOn, b.dueOn) ||
    compareValue(a.valueUsd, b.valueUsd) ||
    b.priority - a.priority ||
    compareStrings(a.createdAt, b.createdAt)
  );
}

/**
 * Open items first (due date, value, priority, age), then done and skipped items by age.
 * `now` and `timeZone` are part of the contract; calendar-string order already puts overdue items first.
 */
export function prioritizePlanItems(items: PlanItem[], _now: Date, _timeZone: string): PlanItem[] {
  const open = items.filter((i) => i.status === "todo").sort(compareOpen);
  const closed = items.filter((i) => i.status !== "todo").sort((a, b) => compareStrings(a.createdAt, b.createdAt));
  return [...open, ...closed];
}
