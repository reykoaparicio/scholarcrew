import { addDaysIso, dateShort, daysLabel, instantShort, usd } from "@/lib/format";
import {
  type EligibilityRule,
  type IncomeRange,
  type IsoDate,
  STATE_NAMES,
  type ScholarshipQuery,
  type ScholarshipSummary,
  type USState,
} from "@scholarcrew/domain";
import type { IconName } from "@scholarcrew/ui";
import { type SearchParams, firstParam } from "./params";

/** The directory shows dates on the Central calendar, the launch market's time zone. */
export const DIRECTORY_TZ = "America/Chicago";
export const STALE_DAYS = 30;
export const PAGE_SIZE = 20;
export const MIN_AMOUNTS = [500, 1000, 5000];
export const WITHIN_DAYS = [30, 90];

export function todayIso(now: Date, timeZone = DIRECTORY_TZ): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function daysFrom(today: IsoDate, due: IsoDate): number {
  return Math.round((Date.parse(`${due}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000);
}

export type ListingCheck = { tone: "good" | "warn" | "neutral"; icon: IconName; label: string; detail: string | null };

/** Verified (checked in the last 30 days), Stale (re-check pending or older), or Unverified. */
export function listingCheck(
  s: Pick<ScholarshipSummary, "status" | "verifiedAt" | "unverified">,
  now: Date,
): ListingCheck {
  if (s.unverified || !s.verifiedAt) {
    return { tone: "neutral", icon: "info", label: "Unverified", detail: "Not confirmed against its source yet" };
  }
  const when = instantShort(s.verifiedAt, DIRECTORY_TZ);
  const ageDays = (now.getTime() - Date.parse(s.verifiedAt)) / 86_400_000;
  if (s.status === "stale" || ageDays > STALE_DAYS) {
    return { tone: "warn", icon: "clock", label: "Stale", detail: `Last checked ${when}` };
  }
  return { tone: "good", icon: "check", label: `Verified ${when}`, detail: null };
}

export function amountLabel(s: Pick<ScholarshipSummary, "amountMinUsd" | "amountMaxUsd">): string {
  if (s.amountMinUsd > 0 && s.amountMinUsd < s.amountMaxUsd) return `${usd(s.amountMinUsd)}–${usd(s.amountMaxUsd)}`;
  return usd(s.amountMaxUsd);
}

export function deadlineLabel(deadline: IsoDate | null, now: Date): { main: string; sub: string } {
  if (!deadline) return { main: "Not posted", sub: "Check the sponsor's page" };
  const days = daysFrom(todayIso(now), deadline);
  if (days < 0) return { main: dateShort(deadline), sub: "Closed" };
  return { main: dateShort(deadline), sub: days === 0 ? "Due today" : `${daysLabel(days)} left` };
}

const INCOME_MAX_TEXT: Record<IncomeRange, string> = {
  under_30k: "Household income under $30,000",
  "30_48k": "Household income up to $48,000",
  "48_75k": "Household income up to $75,000",
  "75_110k": "Household income up to $110,000",
  over_110k: "Household income of any amount",
};

const or = (items: Array<string | number>) => items.join(" or ");

/** One line per eligibility rule, for the public detail page and the admin review. */
export function describeRule(rule: EligibilityRule): string {
  switch (rule.type) {
    case "state_in":
      return `Lives in ${or(rule.states.map((s) => STATE_NAMES[s]))}`;
    case "county_in": {
      const names = rule.counties.map((c) => c.replace(/\s+county$/i, ""));
      return `Lives in ${names.join(", ")} ${names.length === 1 ? "County" : "counties"}, ${rule.state}`;
    }
    case "city_in":
      return `Lives in ${or(rule.cities)}, ${rule.state}`;
    case "class_year_in":
      return `Class of ${or(rule.years)}`;
    case "gpa_min":
      return `GPA ${rule.min} or higher`;
    case "major_any":
      return `Plans to study ${or(rule.majors)}`;
    case "interest_any":
      return `Interested in ${or(rule.interests)}`;
    case "first_gen":
      return "First in their family to go to college";
    case "income_max":
      return INCOME_MAX_TEXT[rule.maxRange];
    case "heritage_any":
      return `Heritage: ${or(rule.values)}`;
    case "disability":
      return "Students with a disability";
    case "religion_any":
      return `Faith: ${or(rule.values)}`;
    case "military_family":
      return "From a military family";
    case "foster_care":
      return "Has been in foster care";
    case "citizenship_required":
      return "U.S. citizenship required";
    case "test_min":
      return `${rule.test} ${rule.min} or higher`;
    case "service_hours_min":
      return `${rule.hours}+ service hours`;
    case "custom":
      return rule.text;
  }
}

export interface DirectoryFilters {
  q: string;
  minUsd: number | null;
  within: number | null;
  renewable: boolean;
  page: number;
}

export function readFilters(sp: SearchParams): DirectoryFilters {
  const min = Number(firstParam(sp, "minUsd"));
  const within = Number(firstParam(sp, "within"));
  const page = Number(firstParam(sp, "page"));
  return {
    q: (firstParam(sp, "q") ?? "").trim().slice(0, 100),
    minUsd: MIN_AMOUNTS.includes(min) ? min : null,
    within: WITHIN_DAYS.includes(within) ? within : null,
    renewable: firstParam(sp, "renewable") === "true",
    page: Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1,
  };
}

/** Public directory query. `openOn` is always today (Central), so closed listings never show (F-18-3). */
export function toQuery(f: DirectoryFilters, now: Date, state?: USState): ScholarshipQuery {
  const today = todayIso(now);
  const q: ScholarshipQuery = { page: f.page, pageSize: PAGE_SIZE, openOn: today };
  if (f.q) q.q = f.q;
  if (state) q.state = state;
  if (f.minUsd !== null) q.minUsd = f.minUsd;
  if (f.renewable) q.renewable = true;
  if (f.within !== null) q.deadlineBefore = addDaysIso(today, f.within);
  return q;
}

export function hasFilters(f: DirectoryFilters): boolean {
  return f.q !== "" || f.minUsd !== null || f.within !== null || f.renewable;
}

/** A link to the same page with one filter changed. Changing a filter goes back to page 1. */
export function filterHref(base: string, f: DirectoryFilters, patch: Partial<DirectoryFilters>): string {
  const next: DirectoryFilters = { ...f, page: 1, ...patch };
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  if (next.minUsd !== null) p.set("minUsd", String(next.minUsd));
  if (next.within !== null) p.set("within", String(next.within));
  if (next.renewable) p.set("renewable", "true");
  if (next.page > 1) p.set("page", String(next.page));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
