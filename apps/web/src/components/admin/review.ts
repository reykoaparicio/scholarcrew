import { calendarLong } from "@/components/public/dates";
import { describeRule } from "@/components/public/listings";
import { plural, usd } from "@/lib/format";
import {
  type CatalogTask,
  type CatalogTaskKind,
  type CatalogTaskStatus,
  type ListingDraft,
  type ReportReason,
  type Scholarship,
  type ScholarshipRequirements,
  ScholarshipUpsertInput,
  type VerificationReport,
  localLabel,
} from "@scholarcrew/domain";
import type { IconName } from "@scholarcrew/ui";
import { issuesToErrors, slugify } from "./listingForm";

export const KIND_LABELS: Record<CatalogTaskKind, string> = {
  research_candidate: "Research",
  user_submission: "Submission",
  report: "Report",
  recheck_changed: "Stale",
  import: "Import",
};

export const STATUS_LABELS: Record<CatalogTaskStatus, string> = {
  open: "Open",
  in_review: "In review",
  resolved: "Resolved",
  rejected: "Rejected",
};

export const REASON_LABELS: Record<ReportReason, string> = {
  wrong_deadline: "Wrong deadline",
  dead_link: "Dead link",
  scam: "Looks like a scam",
  wrong_amount: "Wrong amount",
  other: "Other problem",
};

/**
 * The draft to review: the research extraction, the re-check's new version, or what catalog extraction read from a
 * student's submitted page (R2C-6, plan 11 K6). A submission's placeholder listing is never the draft.
 */
export function draftOf(t: CatalogTask): ListingDraft | null {
  if (t.payload.type === "research_candidate") return t.payload.draft;
  if (t.payload.type === "recheck_changed") return t.payload.after;
  if (t.payload.type === "user_submission") return t.payload.draft ?? null;
  return null;
}

export function reportOf(t: CatalogTask): VerificationReport | null {
  if (t.payload.type === "research_candidate" || t.payload.type === "recheck_changed") return t.payload.report;
  if (t.payload.type === "user_submission") return t.payload.report ?? null;
  return null;
}

export function sourceUrlOf(t: CatalogTask): string | null {
  const p = t.payload;
  return p.type === "research_candidate" || p.type === "recheck_changed" || p.type === "user_submission" ? p.url : null;
}

/** `listingName` names the scholarship a report is about, when the caller has loaded it. */
export function taskTitle(t: CatalogTask, listingName?: string | null): string {
  const p = t.payload;
  switch (p.type) {
    case "research_candidate":
      return p.draft?.name || p.title || p.url;
    case "user_submission":
      return p.name;
    case "report":
      return listingName ? `${listingName} · ${REASON_LABELS[p.reason]}` : `Report: ${REASON_LABELS[p.reason]}`;
    case "recheck_changed":
      return p.after?.name ?? p.before?.name ?? p.url;
    case "import":
      return p.summary;
  }
}

export type TaskChip = { tone: "ok" | "warn" | "crit" | "info"; icon: IconName; text: string };

export function taskChip(t: CatalogTask): TaskChip {
  const p = t.payload;
  if (p.type === "report") return { tone: "warn", icon: "alert", text: REASON_LABELS[p.reason] };
  if (p.type === "user_submission") return { tone: "info", icon: "lock", text: "Only the student sees it" };
  if (p.type === "import") return { tone: "info", icon: "info", text: "Import" };
  const report = reportOf(t);
  if (!report)
    return { tone: "info", icon: "clock", text: p.type === "recheck_changed" ? "Page changed" : "Not checked yet" };
  const n = report.issues.length;
  return n > 0
    ? { tone: "crit", icon: "alert", text: plural(n, "issue") }
    : { tone: "ok", icon: "check", text: "No issues" };
}

function requirementsText(r: ScholarshipRequirements): string {
  const parts: string[] = [];
  const first = r.essays[0];
  if (r.essays.length === 1 && first) parts.push(first.wordLimit ? `1 essay (${first.wordLimit} words)` : "1 essay");
  else if (r.essays.length > 1) parts.push(plural(r.essays.length, "essay"));
  if (r.recommendations > 0) parts.push(plural(r.recommendations, "recommendation"));
  if (r.transcript) parts.push("transcript");
  if (r.serviceHours) parts.push(`${r.serviceHours} service hours`);
  parts.push(...r.other);
  return parts.length > 0 ? parts.join(" · ") : "Application form only";
}

const NOT_STATED = "Not stated";
const money = (n: number | null) => (n === null ? NOT_STATED : usd(n));

const FIELDS: Array<{ field: keyof ListingDraft; label: string; show: (d: ListingDraft) => string }> = [
  { field: "name", label: "Name", show: (d) => d.name || NOT_STATED },
  { field: "provider", label: "Provider", show: (d) => d.provider || NOT_STATED },
  { field: "url", label: "Apply URL", show: (d) => d.url || NOT_STATED },
  { field: "amountMinUsd", label: "Minimum amount", show: (d) => money(d.amountMinUsd) },
  { field: "amountMaxUsd", label: "Maximum amount", show: (d) => money(d.amountMaxUsd) },
  {
    field: "renewable",
    label: "Renewable",
    show: (d) => (d.renewable === null ? NOT_STATED : d.renewable ? "Yes" : "No"),
  },
  { field: "deadline", label: "Deadline", show: (d) => (d.deadline ? calendarLong(d.deadline) : NOT_STATED) },
  {
    field: "applicationFeeUsd",
    label: "Fee to apply",
    show: (d) =>
      d.applicationFeeUsd === null ? NOT_STATED : d.applicationFeeUsd === 0 ? "None" : usd(d.applicationFeeUsd),
  },
  { field: "localArea", label: "Where", show: (d) => localLabel(d.localArea) },
  {
    field: "eligibility",
    label: "Who can apply",
    show: (d) => (d.eligibility.length > 0 ? d.eligibility.map(describeRule).join("; ") : "Anyone in the area above"),
  },
  { field: "requirements", label: "Requirements", show: (d) => requirementsText(d.requirements) },
];

export interface FieldRow {
  field: string;
  label: string;
  value: string;
  before: string | null;
  changed: boolean;
  quote: string | null;
  check: "found" | "not_found" | "none";
  problem: string | null;
}

/** One row per draft field: the value, the supporting quote, and what the code checks found (CA-03). */
export function fieldRows(
  draft: ListingDraft,
  report: VerificationReport | null,
  before: ListingDraft | null = null,
): FieldRow[] {
  return FIELDS.map((f) => {
    const quote = draft.fieldQuotes.find((q) => q.field === f.field)?.quote ?? null;
    const issues = report?.issues.filter((i) => i.field === f.field) ?? [];
    const value = f.show(draft);
    const beforeValue = before ? f.show(before) : null;
    return {
      field: f.field,
      label: f.label,
      value,
      before: beforeValue,
      changed: beforeValue !== null && beforeValue !== value,
      quote,
      check: issues.some((i) => i.code === "quote_not_found") ? "not_found" : quote ? "found" : "none",
      problem: issues.find((i) => i.code !== "quote_not_found")?.message ?? null,
    };
  });
}

export interface PublishFields {
  slug: string;
  cycle: string;
  estMinutes: string;
}

export function publishDefaults(
  t: CatalogTask,
  draft: ListingDraft,
  existing: Scholarship | null,
  defaultCycle: string,
): PublishFields {
  if (existing) return { slug: existing.slug, cycle: existing.cycle, estMinutes: String(existing.estMinutes) };
  return { slug: slugify(draft.name || taskTitle(t)), cycle: defaultCycle, estMinutes: "60" };
}

export type PublishPlan = { ok: true; input: ScholarshipUpsertInput } | { ok: false; errors: string[] };

/**
 * The listing to create (research) or update (re-check, or a submission's placeholder row, R2C-6) before the task
 * resolves with publishScholarshipId. With `existing`, its id, slug, and source URL are kept.
 */
export function publishInput(
  t: CatalogTask,
  draft: ListingDraft,
  o: PublishFields,
  existing: Scholarship | null,
): PublishPlan {
  const source = sourceUrlOf(t) ?? draft.url;
  const minutes = Number(o.estMinutes.trim());
  const renewable = draft.renewable ?? existing?.renewable ?? false;
  const parsed = ScholarshipUpsertInput.safeParse({
    id: existing?.id ?? null,
    slug: o.slug.trim(),
    name: draft.name || existing?.name || "",
    provider: draft.provider || existing?.provider || "",
    url: draft.url || existing?.url || source,
    sourceUrl: existing?.sourceUrl ?? source,
    amountMinUsd: draft.amountMinUsd ?? draft.amountMaxUsd ?? existing?.amountMinUsd ?? Number.NaN,
    amountMaxUsd: draft.amountMaxUsd ?? existing?.amountMaxUsd ?? Number.NaN,
    renewable,
    renewalTerms: renewable ? (existing?.renewalTerms ?? "") : "",
    deadline: draft.deadline ?? existing?.deadline ?? null,
    cycle: o.cycle.trim(),
    localArea: draft.localArea,
    eligibility: draft.eligibility,
    requirements: draft.requirements,
    estMinutes: Number.isInteger(minutes) ? minutes : Number.NaN,
    scamFlags: reportOf(t)?.scamFlags ?? existing?.scamFlags ?? [],
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, errors: issuesToErrors(parsed.error.issues) };
}
