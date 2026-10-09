import { instantShort } from "@/lib/format";
import { splitList } from "@/lib/sensitive";
import {
  type FactSource,
  type FactValue,
  type FactVisibility,
  type MemoryFact,
  PROFILE_FACT_KEYS,
} from "@scholarcrew/domain";

export const SOURCE_LABELS: Record<FactSource, string> = {
  user_stated: "You",
  document: "Document",
  parent_shared: "Shared by family",
  crew_inferred: "Crew guess",
  system: "ScholarCrew",
};

export const VISIBILITY_LABELS: Record<FactVisibility, string> = {
  crew: "Crew",
  crew_family: "Crew + family",
  scout_only: "Scout only",
  private: "Private",
};

export const VISIBILITY_OPTIONS = (Object.keys(VISIBILITY_LABELS) as FactVisibility[]).map((value) => ({
  value,
  label: VISIBILITY_LABELS[value],
}));

/** Shown under the select while "Scout only" is picked. */
export const SCOUT_ONLY_HINT = "Used for scholarship matching only";

/**
 * R2I-10: "Scout only" means "matching only", and only the eight profile keys reach the matcher (12's port
 * blanks them from crew prompts, the matcher reads `profiles`). Other keys don't get the option, except a fact
 * that already has it, so the select can show its current value.
 */
export function visibilityOptionsFor(
  key: string,
  current: FactVisibility,
): Array<{ value: FactVisibility; label: string }> {
  const matcherKey = (PROFILE_FACT_KEYS as readonly string[]).includes(key);
  return VISIBILITY_OPTIONS.filter((o) => o.value !== "scout_only" || matcherKey || current === "scout_only");
}

/** Labels that read better than the key spelled out (mockup 07: "GPA 3.72 unweighted", "ACT 27"). */
const FACT_LABELS: Record<string, string> = {
  act_composite: "ACT",
  sat_total: "SAT",
  gpa_unweighted: "GPA (unweighted)",
  gpa_weighted: "GPA (weighted)",
  class_year: "Class of",
  home_county: "Lives in",
  county: "County",
  intended_major: "Intended major",
  parent_employer: "Parent works for",
};

/** Acronyms that stay uppercase when a key is spelled out. */
const ACRONYMS = new Set(["act", "sat", "psat", "gpa", "fafsa", "css", "ap", "ib", "ged", "stem", "us"]);

/** "intended_majors" → "Intended majors"; "ap_courses" → "AP courses". */
export function factLabel(key: string): string {
  const known = FACT_LABELS[key];
  if (known) return known;
  const words = key
    .split("_")
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function factSource(f: Pick<MemoryFact, "source" | "createdAt">, timeZone: string): string {
  return `${SOURCE_LABELS[f.source]} · ${instantShort(f.createdAt, timeZone)}`;
}

export function valueToText(v: FactValue): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

/** Parse edited text back to the original value's type. */
export function textToValue(original: FactValue, text: string): FactValue {
  if (Array.isArray(original)) return splitList(text, 20).map((s) => s.slice(0, 100));
  if (typeof original === "number") {
    const n = Number(text.trim());
    return text.trim() !== "" && Number.isFinite(n) ? n : text.trim().slice(0, 500);
  }
  if (typeof original === "boolean") return /^(yes|true|y)$/i.test(text.trim());
  return text.trim().slice(0, 500);
}

/** factLabel mid-sentence: "possible major", but "ACT" stays uppercase. */
export function inlineLabel(key: string): string {
  const label = factLabel(key);
  return /^[A-Z]{2,}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}
