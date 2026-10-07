import { usd } from "@/lib/format";
import {
  APP_PLAN_LABELS,
  type AppPlan,
  type CollegeListEntry,
  type CostSummary,
  type Fit,
  type HelperLink,
  type ItemStatus,
  MAX_COLLEGE_LIST,
  type MeritTier,
  OUTSIDE_POLICY_TEXT,
  type OutsidePolicy,
  type RecRequest,
  type RecStatus,
  type Recommender,
  type TestKind,
  type TestPolicy,
  type TestScore,
} from "@scholarcrew/domain";
import { meritTierFor } from "@scholarcrew/engines";
import type { IconName } from "@scholarcrew/ui";

export const FIT_LABEL: Record<Fit, string> = { reach: "Reach", target: "Target", likely: "Likely" };
/** R3V-8: one label map per enum, from 02 next to `AppPlan` (same wording as 08's deadline titles). */
export const PLAN_LABEL: Record<AppPlan, string> = APP_PLAN_LABELS;
export const ITEM_STATUS_OPTIONS: Array<{ value: ItemStatus; label: string }> = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "not_needed", label: "Not needed" },
];
export const CONTROL_LABEL = {
  public: "public",
  private_nonprofit: "private",
  private_forprofit: "for-profit",
} as const;

export function checklistLabel(done: number, total: number): string {
  if (total === 0) return "No items";
  return done >= total ? "Done" : `${done} of ${total}`;
}

/** PR-05: required, optional, blind, or unknown, plus superscoring when known. */
export function testPolicyLabel(policy: TestPolicy, superscore: boolean | null): string {
  const base = { required: "Required", optional: "Optional", blind: "Not used", unknown: "Unconfirmed" }[policy];
  return superscore && policy !== "blind" ? `${base} · superscores` : base;
}

/** CO-05 with an icon so the meaning never rests on color. */
export function outsidePolicyView(p: OutsidePolicy): { icon: IconName; tone: "good" | "warn" | "info"; text: string } {
  const icon: Record<OutsidePolicy, IconName> = {
    added_on_top: "check",
    reduces_loans_first: "info",
    may_reduce_grant: "alert",
    unknown: "info",
  };
  const tone = p === "added_on_top" ? "good" : p === "may_reduce_grant" ? "warn" : "info";
  return { icon: icon[p], tone, text: OUTSIDE_POLICY_TEXT[p] };
}

/** Longer sentence for the detail drawer. */
export const OUTSIDE_POLICY_NOTE: Record<OutsidePolicy, string> = {
  added_on_top: "Added on top of your aid",
  reduces_loans_first: "Outside money lowers your loans first, then other aid",
  may_reduce_grant: "Outside money may lower the school's own grant; ask the aid office",
  unknown: "Unconfirmed; ask the aid office how outside scholarships are handled",
};

/** D5: the 26th school is refused with invalid_input; the modal says so before trying. */
export function limitMessage(count: number): string | null {
  return count >= MAX_COLLEGE_LIST
    ? `Your list has ${MAX_COLLEGE_LIST} schools, the most it can hold. Remove one to add another.`
    : null;
}

/** getCollegeList leaves gapUsd null; the money summaries fill it. */
export function withGaps(
  entries: CollegeListEntry[],
  costs: Array<Pick<CostSummary, "collegeId" | "gapUsd">>,
): CollegeListEntry[] {
  const gap = new Map(costs.map((c) => [c.collegeId, c.gapUsd]));
  return entries.map((e) => ({ ...e, gapUsd: e.gapUsd ?? gap.get(e.collegeId) ?? null }));
}

/** CO-08: balance counts and grant-displacement risks. */
export function listBalance(entries: CollegeListEntry[]): string[] {
  if (entries.length === 0) return [];
  const n = (fit: Fit) => entries.filter((e) => e.fit === fit).length;
  const lines = [`Your list: ${n("likely")} likely, ${n("target")} target, ${n("reach")} reach.`];
  if (n("likely") === 0) lines.push("Add a likely school so you have a sure option.");
  for (const e of entries.filter((x) => x.outsidePolicy === "may_reduce_grant")) {
    lines.push(
      `${e.college.name} may lower its own grant if you win outside scholarships. Ask its aid office before counting on outside money there.`,
    );
  }
  return lines;
}

/** CO-06: each automatic merit tier and whether today's GPA and scores reach it. */
export function meritRows(
  tiers: MeritTier[],
  gpa: number | null,
  act: number | null,
  sat: number | null,
): Array<{ label: string; text: string; qualifies: boolean }> {
  const best = meritTierFor(tiers, gpa, act, sat);
  return tiers.map((t) => {
    const needs = [
      t.minGpa !== null ? `GPA ${t.minGpa.toFixed(1)}+` : null,
      t.minAct !== null ? `ACT ${t.minAct}+` : null,
      t.minSat !== null ? `SAT ${t.minSat}+` : null,
    ].filter(Boolean);
    const parts = [`${usd(t.annualUsd)}/yr`, needs.length > 0 ? needs.join(", ") : "automatic"];
    if (t.renewalGpa !== null) parts.push(`renews at ${t.renewalGpa.toFixed(1)}`);
    return { label: t.label, text: parts.join(" · "), qualifies: best?.label === t.label };
  });
}

/** Best official composite for one test. The college page (Q19) and the prep page (Q27, through `prep.ts`) share it. */
export function bestOfficial(scores: TestScore[], test: TestKind): number | null {
  const values = scores.filter((s) => s.official && s.test === test).map((s) => s.composite);
  return values.length > 0 ? Math.max(...values) : null;
}

/** Labels for the past-request status select (R2P-11). */
export const REC_STATUS_LABEL: Record<RecStatus, string> = {
  draft: "Not sent",
  requested: "Asked",
  confirmed: "Agreed to write",
  submitted: "Submitted",
  declined: "Declined",
};

export interface PastRequest {
  id: string;
  recommenderName: string;
  status: RecStatus;
  requestedAt: string | null;
  /** The helper link the request created, matched by `helperLinkId`. Its URL was only emailed, so it can't be shown again. */
  link: { state: "active" | "expired" | "revoked"; expiresAt: string } | null;
}

/** D33: this entry's requests from `listRecRequests` (newest first), each with its helper link's state. */
export function pastRequests(
  requests: RecRequest[],
  links: HelperLink[],
  recommenders: Recommender[],
  entryId: string,
  now: Date,
): PastRequest[] {
  const linkById = new Map(links.map((l) => [l.id, l]));
  const nameById = new Map(recommenders.map((r) => [r.id, r.name]));
  return requests
    .filter((r) => r.collegeListId === entryId)
    .map((r) => {
      const l = r.helperLinkId ? linkById.get(r.helperLinkId) : undefined;
      const state = l?.revokedAt ? "revoked" : l && Date.parse(l.expiresAt) <= now.getTime() ? "expired" : "active";
      return {
        id: r.id,
        recommenderName: nameById.get(r.recommenderId) ?? "A recommender",
        status: r.status,
        requestedAt: r.requestedAt,
        link: l ? { state, expiresAt: l.expiresAt } : null,
      };
    });
}
