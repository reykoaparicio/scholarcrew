import {
  INCOME_RANGE_LABELS,
  IncomeRange,
  SENSITIVE_KINDS,
  type SensitiveFactInput,
  type SensitiveKind,
} from "@scholarcrew/domain";

/** Copy from mockups 07 and 09. `value` says what extra answer the kind takes. */
export const SENSITIVE_OPTIONS: Record<
  SensitiveKind,
  { label: string; detail: string; value: "none" | "income" | "list" }
> = {
  first_gen: {
    label: "First in my family to go to college",
    detail: "Opens awards for first-generation students",
    value: "none",
  },
  income_range: {
    label: "Household income range",
    detail: "A range, not exact income. A parent can share it from the Family page.",
    value: "income",
  },
  heritage: { label: "Heritage or ethnicity", detail: "For awards from heritage and community groups", value: "list" },
  disability: { label: "Disability", detail: "You never have to say which one", value: "none" },
  religion: { label: "Religion", detail: "For awards from faith groups", value: "list" },
  military_family: { label: "Military family", detail: "A parent or guardian who serves or served", value: "none" },
  foster_care: { label: "Foster care", detail: "Now or in the past", value: "none" },
  noncitizen_filter: {
    label: "Only show scholarships open to non-citizens",
    detail: "Hides awards that require U.S. citizenship. It doesn't record your status.",
    value: "none",
  },
};

export const SENSITIVE_ORDER: readonly SensitiveKind[] = SENSITIVE_KINDS;

export const INCOME_OPTIONS = (Object.keys(INCOME_RANGE_LABELS) as IncomeRange[]).map((value) => ({
  value,
  label: INCOME_RANGE_LABELS[value],
}));

/** "a, b ,, a\nc" → ["a", "b", "c"]: trimmed, de-duplicated, capped. */
export function splitList(text: string, max: number): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const v = part.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, max);
}

export function sensitiveValue(kind: SensitiveKind, raw: string): SensitiveFactInput["value"] {
  const shape = SENSITIVE_OPTIONS[kind].value;
  if (shape === "income") {
    const parsed = IncomeRange.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
  if (shape === "list") {
    const list = splitList(raw, 5).map((v) => v.slice(0, 60));
    return list.length > 0 ? list : null;
  }
  return null;
}
