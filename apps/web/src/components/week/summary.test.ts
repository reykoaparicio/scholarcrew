import type { PlanItem, WeekPlan } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { contributorsLine, heroMeta, itemMeta, openLabel, openSummary, planHref, weekSubline } from "./summary";

const item = (o: Partial<PlanItem> = {}): PlanItem => ({
  id: "11111111-1111-4111-8111-111111111111",
  weekStart: "2026-10-05",
  title: "Hill Country STEM Award: two short answers",
  kind: "scholarship",
  refType: "scholarship",
  refId: "hill-country-stem",
  minutes: 30,
  valueUsd: 1000,
  dueOn: "2026-10-15",
  status: "todo",
  contributors: ["compass", "scout", "quill"],
  priority: 0,
  createdAt: "2026-10-05T12:00:00.000Z",
  completedAt: null,
  ...o,
});

const plan = (items: PlanItem[]): WeekPlan => ({
  weekStart: "2026-10-05",
  items,
  totalMinutes: items.reduce((s, i) => s + i.minutes, 0),
  doneCount: items.filter((i) => i.status === "done").length,
});

describe("week summary", () => {
  it("counts open items and minutes like the mockup header", () => {
    const p = plan([
      item(),
      item({ id: "2", minutes: 60 }),
      item({ id: "3", minutes: 10 }),
      item({ id: "4", minutes: 35 }),
      item({ id: "5", minutes: 15, status: "done" }),
      item({ id: "6", minutes: 20, status: "skipped" }),
    ]);
    expect(openSummary(p)).toEqual({ count: 4, minutes: 135, done: 1 });
    expect(weekSubline({ weekStart: "2026-10-05", plan: p })).toBe(
      "Week of Oct 5 · 4 things · about 2 h 15 min · Compass planned this from your deadlines",
    );
    expect(weekSubline({ weekStart: "2026-10-05", plan: plan([]) })).toBe("Week of Oct 5 · nothing open yet");
  });

  it("formats item and hero meta", () => {
    expect(itemMeta(item())).toBe("$1,000 · due Oct 15");
    expect(itemMeta(item({ valueUsd: null, dueOn: null }))).toBe("");
    expect(heroMeta(item())).toBe("$1,000 · due Thu, Oct 15 · about 30 min");
    expect(contributorsLine(["compass", "scout", "quill"])).toEqual({ lead: "compass", others: "Scout + Quill" });
    expect(contributorsLine([])).toEqual({ lead: null, others: "" });
  });

  it("links each item to the screen that does the work", () => {
    expect(planHref(item())).toBe("/scholarships/hill-country-stem");
    expect(planHref(item({ kind: "essay", refType: "essay", refId: "e1" }))).toBe("/essays/e1");
    expect(planHref(item({ kind: "application", refType: "college_list", refId: "c1" }))).toBe("/colleges/c1");
    expect(planHref(item({ kind: "application", refType: null, refId: null }))).toBe("/colleges");
    expect(planHref(item({ kind: "aid", refType: null, refId: null }))).toBe("/money");
    expect(planHref(item({ kind: "test_prep", refType: null, refId: null }))).toBe("/prep");
    expect(planHref(item({ kind: "service", refType: null, refId: null }))).toBe("/impact");
    expect(planHref(item({ kind: "custom", refType: null, refId: null }))).toBe("/crew");
    expect(openLabel(item({ kind: "essay" }))).toBe("Open in Essay Studio");
    expect(openLabel(item())).toBe("Open");
  });
});
