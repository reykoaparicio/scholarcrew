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

/** "intended_majors" → "Intended majors". */
export function factLabel(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
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
