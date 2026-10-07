import { addDaysIso, dateShort, dateWithWeekday, minutesLabel, plural, usd } from "@/lib/format";
import { CREW_NAMES, type CrewRole, type IsoDate, type PlanItem, type WeekPlan } from "@scholarcrew/domain";

export function openSummary(plan: WeekPlan): { count: number; minutes: number; done: number } {
  const open = plan.items.filter((i) => i.status === "todo");
  return {
    count: open.length,
    minutes: open.reduce((sum, i) => sum + i.minutes, 0),
    done: plan.items.filter((i) => i.status === "done").length,
  };
}

/** "Week of Oct 5 · 4 things · about 2 h 15 min · Compass planned this from your deadlines" */
export function weekSubline(view: { weekStart: IsoDate; plan: WeekPlan }): string {
  const s = openSummary(view.plan);
  const parts = [`Week of ${dateShort(view.weekStart)}`];
  if (s.count === 0) parts.push("nothing open yet");
  else
    parts.push(
      plural(s.count, "thing"),
      `about ${minutesLabel(s.minutes)}`,
      "Compass planned this from your deadlines",
    );
  return parts.join(" · ");
}

export function itemMeta(item: Pick<PlanItem, "valueUsd" | "dueOn">): string {
  const parts: string[] = [];
  if (item.valueUsd) parts.push(usd(item.valueUsd));
  if (item.dueOn) parts.push(`due ${dateShort(item.dueOn)}`);
  return parts.join(" · ");
}

export function heroMeta(item: Pick<PlanItem, "valueUsd" | "dueOn" | "minutes">): string {
  const parts: string[] = [];
  if (item.valueUsd) parts.push(usd(item.valueUsd));
  if (item.dueOn) parts.push(`due ${dateWithWeekday(item.dueOn)}`);
  parts.push(`about ${minutesLabel(item.minutes)}`);
  return parts.join(" · ");
}

export function contributorsLine(roles: CrewRole[]): { lead: CrewRole | null; others: string } {
  const [lead, ...rest] = roles;
  return { lead: lead ?? null, others: rest.map((r) => CREW_NAMES[r]).join(" + ") };
}

const BY_KIND: Record<PlanItem["kind"], string> = {
  scholarship: "/scholarships",
  essay: "/essays",
  application: "/colleges",
  recommendation: "/colleges",
  aid: "/money",
  test_prep: "/prep",
  service: "/impact",
  thank_you: "/scholarships",
  custom: "/crew",
};

/** WK-01 "Open": the record the item points at, else the screen for its kind. */
export function planHref(item: Pick<PlanItem, "kind" | "refType" | "refId">): string {
  if (item.refId) {
    const id = encodeURIComponent(item.refId);
    if (item.refType === "scholarship") return `/scholarships/${id}`;
    if (item.refType === "essay") return `/essays/${id}`;
    if (item.refType === "college_list") return `/colleges/${id}`;
  }
  return BY_KIND[item.kind];
}

export function openLabel(item: Pick<PlanItem, "kind">): string {
  return item.kind === "essay" ? "Open in Essay Studio" : "Open";
}

export function nextWeekStart(weekStart: IsoDate): IsoDate {
  return addDaysIso(weekStart, 7);
}
