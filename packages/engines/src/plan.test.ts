import type { PlanItem } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { prioritizePlanItems } from "./plan";

const now = new Date("2026-10-06T15:00:00.000Z");
const TZ = "America/Chicago";

function item(id: string, o: Partial<PlanItem>): PlanItem {
  return {
    id,
    weekStart: "2026-10-05",
    title: id,
    kind: "custom",
    refType: null,
    refId: null,
    minutes: 30,
    valueUsd: null,
    dueOn: null,
    status: "todo",
    contributors: [],
    priority: 0,
    createdAt: "2026-10-05T10:00:00.000Z",
    completedAt: null,
    ...o,
  };
}

const ids = (items: PlanItem[]) => items.map((i) => i.id);

describe("prioritizePlanItems", () => {
  it("orders open items by due date, value, priority, then age, and puts done and skipped last", () => {
    const items = [
      item("a", { dueOn: "2026-10-15", valueUsd: 1000, createdAt: "2026-10-05T10:00:00.000Z" }),
      item("b", { dueOn: null, valueUsd: 2500, priority: 5, createdAt: "2026-10-05T09:00:00.000Z" }),
      item("c", { dueOn: "2026-10-15", valueUsd: 2500, createdAt: "2026-10-05T11:00:00.000Z" }),
      item("d", { status: "done", dueOn: "2026-10-08", createdAt: "2026-10-05T08:00:00.000Z" }),
      item("e", { dueOn: "2026-10-09", createdAt: "2026-10-05T13:00:00.000Z" }),
      item("f", { status: "skipped", createdAt: "2026-10-05T07:00:00.000Z" }),
      item("g", { dueOn: "2026-10-15", valueUsd: 2500, priority: 3, createdAt: "2026-10-05T12:00:00.000Z" }),
    ];
    expect(ids(prioritizePlanItems(items, now, TZ))).toEqual(["e", "g", "c", "a", "b", "f", "d"]);
  });

  it("puts overdue items first and missing values after zero", () => {
    const items = [
      item("none", { dueOn: "2026-10-15", valueUsd: null }),
      item("zero", { dueOn: "2026-10-15", valueUsd: 0 }),
      item("overdue", { dueOn: "2026-10-01", valueUsd: null }),
    ];
    expect(ids(prioritizePlanItems(items, now, TZ))).toEqual(["overdue", "zero", "none"]);
  });

  it("falls back to creation time, then input order", () => {
    const items = [
      item("newer", { createdAt: "2026-10-05T12:00:00.000Z" }),
      item("older", { createdAt: "2026-10-04T12:00:00.000Z" }),
      item("same-1", { createdAt: "2026-10-05T12:00:00.000Z" }),
    ];
    expect(ids(prioritizePlanItems(items, now, TZ))).toEqual(["older", "newer", "same-1"]);
  });

  it("returns a new array and handles an empty plan", () => {
    const items = [item("x", { dueOn: "2026-10-20" }), item("y", { dueOn: "2026-10-10" })];
    const sorted = prioritizePlanItems(items, now, TZ);
    expect(ids(sorted)).toEqual(["y", "x"]);
    expect(ids(items)).toEqual(["x", "y"]);
    expect(prioritizePlanItems([], now, TZ)).toEqual([]);
  });
});
