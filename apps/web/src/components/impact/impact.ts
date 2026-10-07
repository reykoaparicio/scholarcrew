import type { RequirementProgress, ServiceLog, VerificationStatus } from "@scholarcrew/domain";
import { countChars, limitState } from "@scholarcrew/engines";
import type { BadgeTone, IconName } from "@scholarcrew/ui";

export const ACTIVITY_LIMIT = 150;
export const MAX_ACTIVITIES = 10;

function trim1(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export function hoursLabel(minutes: number): string {
  return trim1(minutes / 60);
}

/** Decimal hours for one day of service (0 < h <= 24) as whole minutes. */
export function parseHours(text: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(text.trim())) return null;
  const h = Number(text.trim());
  return h > 0 && h <= 24 ? Math.round(h * 60) : null;
}

export const VERIFICATION_VIEW: Record<VerificationStatus, { tone: BadgeTone; icon: IconName; label: string }> = {
  self_reported: { tone: "neutral", icon: "info", label: "Not sent yet" },
  requested: { tone: "warn", icon: "clock", label: "Waiting" },
  verified: { tone: "good", icon: "check", label: "Confirmed" },
  declined: { tone: "crit", icon: "alert", label: "Declined" },
};

export function logTotals(logs: Array<Pick<ServiceLog, "minutes" | "verification">>): string {
  const total = logs.reduce((sum, l) => sum + l.minutes, 0);
  const verified = logs.filter((l) => l.verification === "verified").reduce((sum, l) => sum + l.minutes, 0);
  return `${hoursLabel(total)} hours logged · ${hoursLabel(verified)} confirmed by supervisors`;
}

/** IM-03: only confirmed hours count toward the requirement. */
export function progressView(p: Pick<RequirementProgress, "requiredHours" | "verifiedHours" | "totalHours">): {
  value: number;
  met: boolean;
  status: string;
  detail: string;
} {
  const required = Math.max(1, p.requiredHours);
  const met = p.verifiedHours >= p.requiredHours;
  const needed = Math.max(0, p.requiredHours - p.verifiedHours);
  const waiting = Math.max(0, p.totalHours - p.verifiedHours);
  return {
    value: Math.min(1, Math.round((p.verifiedHours / required) * 100) / 100),
    met,
    status: met ? "Met" : `${trim1(needed)} to go`,
    detail: `Confirmed ${trim1(p.verifiedHours)} · waiting or self-reported ${trim1(waiting)} · still needed ${trim1(needed)}`,
  };
}

/** IM-04: 150 characters, counted exactly (code points), warning at 90%. */
export function activityCounter(text: string): { label: string; state: "ok" | "near" | "over"; note: string | null } {
  const n = countChars(text);
  const state = limitState(n, ACTIVITY_LIMIT);
  const note = state === "near" ? `${ACTIVITY_LIMIT - n} left` : state === "over" ? `${n - ACTIVITY_LIMIT} over` : null;
  return { label: `${n} / ${ACTIVITY_LIMIT}`, state, note };
}
