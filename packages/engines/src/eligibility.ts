import type { EligibilityRule, IncomeRange, LocalArea, MatchReason, SensitiveFactValues } from "@scholarcrew/domain";

export type MatcherProfile = {
  state: string;
  county: string;
  city: string;
  classYear: number | null;
  gpa: number | null;
  intendedMajors: string[];
  interests: string[];
  act: number | null;
  sat: number | null;
  serviceHours: number;
  sensitive: SensitiveFactValues;
};

/** Lowest to highest. income_max passes when the shared range is at or below the rule's range. */
export const INCOME_ORDER: readonly IncomeRange[] = ["under_30k", "30_48k", "48_75k", "75_110k", "over_110k"];

type Outcome = { kind: "pass"; reason: MatchReason | null } | { kind: "fail" } | { kind: "unknown"; text: string };

const FAIL: Outcome = { kind: "fail" };
const pass = (reason: MatchReason | null): Outcome => ({ kind: "pass", reason });
const unknown = (text: string): Outcome => ({ kind: "unknown", text });
const why = (code: string, text: string, sensitive = false): MatchReason => ({ code, text, sensitive });

const norm = (s: string): string => s.trim().toLowerCase();
const sameText = (a: string, b: string): boolean => norm(b).length > 0 && norm(a) === norm(b);
const countyKey = (s: string): string => norm(s).replace(/\s+county$/, "");
const sameCounty = (a: string, b: string): boolean => countyKey(b).length > 0 && countyKey(a) === countyKey(b);

function overlaps(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}

/** First profile value that overlaps any rule value, as the student typed it. */
function firstOverlap(have: string[], want: string[]): string | null {
  for (const h of have) {
    if (want.some((w) => overlaps(h, w))) return h.trim();
  }
  return null;
}

export function countyLabel(county: string): string {
  const c = county.trim();
  return /\bcounty$/i.test(c) ? c : `${c} County`;
}

/** 3.72 → "3.72", 3 → "3.0", 3.5 → "3.5". */
export function formatGpa(n: number): string {
  const s = n.toFixed(2);
  return s.endsWith("0") ? s.slice(0, -1) : s;
}

function checkLocalArea(area: LocalArea, p: MatcherProfile): Outcome {
  if (area.national) return pass(null);
  if (area.state !== null && !sameText(area.state, p.state)) return FAIL;
  if (area.counties.length > 0 && !area.counties.some((c) => sameCounty(c, p.county))) return FAIL;
  if (area.cities.length > 0 && !area.cities.some((c) => sameText(c, p.city))) return FAIL;
  if (area.cities.length > 0) return pass(why("local_city", `You live in ${p.city.trim()}`));
  if (area.counties.length > 0) return pass(why("local_county", `You live in ${countyLabel(p.county)}`));
  if (area.state !== null) return pass(why("local_state", `You live in ${p.state.trim().toUpperCase()}`));
  return pass(null);
}

function checkRule(rule: EligibilityRule, p: MatcherProfile): Outcome {
  const s = p.sensitive;
  switch (rule.type) {
    case "state_in":
      return rule.states.some((st) => sameText(st, p.state))
        ? pass(why("state_in", `You live in ${p.state.trim().toUpperCase()}`))
        : FAIL;
    case "county_in":
      return sameText(rule.state, p.state) && rule.counties.some((c) => sameCounty(c, p.county))
        ? pass(why("county_in", `You live in ${countyLabel(p.county)}`))
        : FAIL;
    case "city_in":
      return sameText(rule.state, p.state) && rule.cities.some((c) => sameText(c, p.city))
        ? pass(why("city_in", `You live in ${p.city.trim()}`))
        : FAIL;
    case "class_year_in":
      if (p.classYear === null) return unknown("Class year not on file");
      return rule.years.includes(p.classYear) ? pass(why("class_year_in", `Class of ${p.classYear}`)) : FAIL;
    case "gpa_min":
      if (p.gpa === null) return unknown("GPA not on file");
      return p.gpa >= rule.min
        ? pass(why("gpa_min", `Your GPA ${formatGpa(p.gpa)} meets the ${formatGpa(rule.min)} minimum`))
        : FAIL;
    case "major_any": {
      if (p.intendedMajors.length === 0) return unknown("Intended major not on file");
      const major = firstOverlap(p.intendedMajors, rule.majors);
      return major ? pass(why("major_any", `You plan to study ${major}`)) : FAIL;
    }
    case "interest_any": {
      if (p.interests.length === 0) return unknown("Interests not on file");
      const interest = firstOverlap(p.interests, rule.interests);
      return interest ? pass(why("interest_any", `You're interested in ${interest}`)) : FAIL;
    }
    case "first_gen":
      return s.firstGen ? pass(why("first_gen", "You're first in your family to go to college", true)) : FAIL;
    case "income_max":
      if (s.incomeRange === null) return FAIL;
      return INCOME_ORDER.indexOf(s.incomeRange) <= INCOME_ORDER.indexOf(rule.maxRange)
        ? pass(why("income_max", "Your family income is within this award's limit", true))
        : FAIL;
    case "heritage_any": {
      const heritage = firstOverlap(s.heritage, rule.values);
      return heritage ? pass(why("heritage_any", "Your heritage fits this award", true)) : FAIL;
    }
    case "disability":
      return s.disability ? pass(why("disability", "This award supports students with disabilities", true)) : FAIL;
    case "religion_any": {
      const religion = firstOverlap(s.religion, rule.values);
      return religion ? pass(why("religion_any", "Your faith community fits this award", true)) : FAIL;
    }
    case "military_family":
      return s.militaryFamily ? pass(why("military_family", "You're from a military family", true)) : FAIL;
    case "foster_care":
      return s.fosterCare ? pass(why("foster_care", "You've spent time in foster care", true)) : FAIL;
    case "citizenship_required":
      return s.noncitizenFilter ? FAIL : pass(null);
    case "test_min": {
      const score = rule.test === "ACT" ? p.act : p.sat;
      if (score === null) return unknown(`${rule.test} score not on file`);
      return score >= rule.min
        ? pass(why("test_min", `Your ${rule.test} ${score} meets the ${rule.min} minimum`))
        : FAIL;
    }
    case "service_hours_min":
      return p.serviceHours >= rule.hours
        ? pass(why("service_hours_min", `You have ${Math.floor(p.serviceHours)} service hours (${rule.hours} needed)`))
        : FAIL;
    case "custom":
      return unknown(rule.text);
  }
}

export function evaluateEligibility(
  rules: EligibilityRule[],
  localArea: LocalArea,
  p: MatcherProfile,
): { eligible: boolean; reasons: MatchReason[]; unknowns: string[] } {
  const outcomes = [checkLocalArea(localArea, p), ...rules.map((rule) => checkRule(rule, p))];
  let eligible = true;
  const reasons: MatchReason[] = [];
  const unknowns: string[] = [];
  for (const outcome of outcomes) {
    if (outcome.kind === "fail") {
      eligible = false;
    } else if (outcome.kind === "unknown") {
      if (!unknowns.includes(outcome.text)) unknowns.push(outcome.text);
    } else {
      const reason = outcome.reason;
      if (reason && !reasons.some((r) => r.text === reason.text)) reasons.push(reason);
    }
  }
  return { eligible, reasons, unknowns };
}
