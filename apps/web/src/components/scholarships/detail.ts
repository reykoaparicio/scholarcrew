import { instantShort, usd } from "@/lib/format";
import {
  APPLICATION_STAGE_LABELS,
  type ApplicationStage,
  type CatalogStatus,
  type EligibilityRule,
  INCOME_RANGE_LABELS,
  type LocalArea,
  type ReportReason,
  type ScamFlag,
} from "@scholarcrew/domain";
import type { BadgeTone } from "@scholarcrew/ui";

const county = (name: string) => (/county$/i.test(name.trim()) ? name.trim() : `${name.trim()} County`);

/** SC-04: one plain sentence per listing rule. */
export function ruleText(rule: EligibilityRule): string {
  switch (rule.type) {
    case "state_in":
      return `Lives in ${rule.states.join(" or ")}`;
    case "county_in":
      return `Lives in ${rule.counties.map(county).join(" or ")}, ${rule.state}`;
    case "city_in":
      return `Lives in ${rule.cities.join(" or ")}, ${rule.state}`;
    case "class_year_in":
      return `Class of ${rule.years.join(" or ")}`;
    case "gpa_min":
      return `GPA of ${rule.min.toFixed(1)} or higher`;
    case "major_any":
      return `Plans to study ${rule.majors.join(", ")}`;
    case "interest_any":
      return `Interested in ${rule.interests.join(", ")}`;
    case "first_gen":
      return "First in your family to go to college";
    case "income_max":
      return `Household income up to ${INCOME_RANGE_LABELS[rule.maxRange]}`;
    case "heritage_any":
      return `Heritage: ${rule.values.join(", ")}`;
    case "disability":
      return "Students with a disability";
    case "religion_any":
      return `Faith community: ${rule.values.join(", ")}`;
    case "military_family":
      return "From a military family";
    case "foster_care":
      return "Has been in foster care";
    case "citizenship_required":
      return "U.S. citizen or eligible noncitizen";
    case "test_min":
      return `${rule.test} of ${rule.min} or higher`;
    case "service_hours_min":
      return `${rule.hours}+ service hours`;
    case "custom":
      return rule.text;
  }
}

export function areaLabel(area: LocalArea): string {
  if (area.national) return "National";
  const state = area.state ?? "";
  if (area.counties.length > 0) return `Local · ${area.counties.map(county).join(", ")}, ${state}`;
  if (area.cities.length > 0) return `Local · ${area.cities.join(", ")}, ${state}`;
  return state ? `Statewide · ${state}` : "Local";
}

export function amountLabel(minUsd: number, maxUsd: number): string {
  return minUsd > 0 && minUsd < maxUsd ? `${usd(minUsd)}–${usd(maxUsd)}` : usd(maxUsd);
}

/** R3V-8: the 02 map, so the student, helper, and admin screens use the same words. */
export const STAGE_LABEL: Record<ApplicationStage, string> = APPLICATION_STAGE_LABELS;

/** R3V-8: a null deadline means nobody has read one yet, so it isn't "Rolling" (same text as 18 R4 `deadlineLabel`). */
export const NO_DEADLINE = "Not posted";

export const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: "wrong_deadline", label: "The deadline is wrong" },
  { value: "dead_link", label: "The link doesn't work" },
  { value: "wrong_amount", label: "The amount is wrong" },
  { value: "scam", label: "It looks like a scam" },
  { value: "other", label: "Something else" },
];

/** SC-04 labels: verified with its date, stale, unverified, flagged. */
export function sourceBadges(
  d: { verifiedAt: string | null; stale: boolean; scamFlags: ScamFlag[]; status: CatalogStatus },
  timeZone: string,
): Array<{ tone: BadgeTone; label: string }> {
  const out: Array<{ tone: BadgeTone; label: string }> = [];
  if (d.stale) out.push({ tone: "warn", label: "Stale · re-checking" });
  else if (d.verifiedAt && d.status !== "draft")
    out.push({ tone: "good", label: `Verified ${instantShort(d.verifiedAt, timeZone)}` });
  else out.push({ tone: "neutral", label: "Unverified" });
  if (d.scamFlags.length > 0) out.push({ tone: "crit", label: "Flagged" });
  return out;
}
