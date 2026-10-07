import {
  EligibilityRule,
  type EligibilityRuleType,
  INCOME_RANGE_LABELS,
  IncomeRange,
  SENSITIVE_RULE_TYPES,
} from "@scholarcrew/domain";

export type FieldKind = "states" | "state" | "list" | "years" | "number" | "income" | "test" | "text";

export interface RuleFieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  hint?: string;
}

const LIST_HINT = "Separate with commas";

export const RULE_SPECS: Record<EligibilityRuleType, { label: string; fields: RuleFieldSpec[] }> = {
  state_in: {
    label: "Lives in a state",
    fields: [{ name: "states", label: "States", kind: "states", hint: "Two-letter codes: TX, OK" }],
  },
  county_in: {
    label: "Lives in a county",
    fields: [
      { name: "state", label: "State", kind: "state" },
      { name: "counties", label: "Counties", kind: "list", hint: LIST_HINT },
    ],
  },
  city_in: {
    label: "Lives in a city",
    fields: [
      { name: "state", label: "State", kind: "state" },
      { name: "cities", label: "Cities", kind: "list", hint: LIST_HINT },
    ],
  },
  class_year_in: {
    label: "Class year",
    fields: [{ name: "years", label: "Class years", kind: "years", hint: "2027, 2028" }],
  },
  gpa_min: {
    label: "Minimum GPA",
    fields: [{ name: "min", label: "GPA at least", kind: "number", hint: "0 to 5, like 3.25" }],
  },
  major_any: { label: "Intended major", fields: [{ name: "majors", label: "Majors", kind: "list", hint: LIST_HINT }] },
  interest_any: {
    label: "Interest",
    fields: [{ name: "interests", label: "Interests", kind: "list", hint: LIST_HINT }],
  },
  first_gen: { label: "First-generation student", fields: [] },
  income_max: {
    label: "Household income limit",
    fields: [{ name: "maxRange", label: "Highest income range", kind: "income" }],
  },
  heritage_any: {
    label: "Heritage",
    fields: [{ name: "values", label: "Heritage groups", kind: "list", hint: LIST_HINT }],
  },
  disability: { label: "Disability", fields: [] },
  religion_any: { label: "Faith", fields: [{ name: "values", label: "Faiths", kind: "list", hint: LIST_HINT }] },
  military_family: { label: "Military family", fields: [] },
  foster_care: { label: "Foster care", fields: [] },
  citizenship_required: { label: "U.S. citizenship required", fields: [] },
  test_min: {
    label: "Minimum test score",
    fields: [
      { name: "test", label: "Test", kind: "test" },
      { name: "min", label: "Score at least", kind: "number" },
    ],
  },
  service_hours_min: { label: "Service hours", fields: [{ name: "hours", label: "Hours at least", kind: "number" }] },
  custom: {
    label: "Other rule (text only)",
    fields: [{ name: "text", label: "Rule text", kind: "text", hint: "Shown as written; not matched" }],
  },
};

export const RULE_TYPES: EligibilityRuleType[] = [
  "state_in",
  "county_in",
  "city_in",
  "class_year_in",
  "gpa_min",
  "major_any",
  "interest_any",
  "first_gen",
  "income_max",
  "heritage_any",
  "disability",
  "religion_any",
  "military_family",
  "foster_care",
  "citizenship_required",
  "test_min",
  "service_hours_min",
  "custom",
];

/** R3V-8: built from 02's `INCOME_RANGE_LABELS` in `IncomeRange` order, not copied by hand. */
export const INCOME_OPTIONS: Array<{ value: IncomeRange; label: string }> = IncomeRange.options.map((value) => ({
  value,
  label: INCOME_RANGE_LABELS[value],
}));

export const TEST_OPTIONS = [
  { value: "ACT", label: "ACT" },
  { value: "SAT", label: "SAT" },
];

export function isSensitiveRule(type: EligibilityRuleType): boolean {
  return SENSITIVE_RULE_TYPES.some((sensitive) => sensitive === type);
}

/** Form state for one rule: every field as the text the admin typed. */
export interface RuleDraft {
  key: string;
  type: EligibilityRuleType;
  values: Record<string, string>;
}

const DEFAULTS: Partial<Record<FieldKind, string>> = { state: "TX", income: "48_75k", test: "ACT" };

export function emptyDraft(key: string, type: EligibilityRuleType): RuleDraft {
  const values: Record<string, string> = {};
  for (const f of RULE_SPECS[type].fields) values[f.name] = DEFAULTS[f.kind] ?? "";
  return { key, type, values };
}

export function ruleToDraft(key: string, rule: EligibilityRule): RuleDraft {
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(rule)) {
    if (name !== "type") values[name] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return { key, type: rule.type, values };
}

function list(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function draftToRule(d: RuleDraft): { rule: EligibilityRule; error: null } | { rule: null; error: string } {
  const spec = RULE_SPECS[d.type];
  const raw: Record<string, unknown> = { type: d.type };
  for (const f of spec.fields) {
    const text = d.values[f.name] ?? "";
    if (f.kind === "states") raw[f.name] = list(text).map((s) => s.toUpperCase());
    else if (f.kind === "state") raw[f.name] = text.trim().toUpperCase();
    else if (f.kind === "list") raw[f.name] = list(text);
    else if (f.kind === "years") raw[f.name] = list(text).map(Number);
    else if (f.kind === "number") raw[f.name] = text.trim() === "" ? Number.NaN : Number(text);
    else raw[f.name] = text.trim();
  }
  const parsed = EligibilityRule.safeParse(raw);
  if (parsed.success) return { rule: parsed.data, error: null };
  const name = parsed.error.issues[0]?.path[0];
  const field = spec.fields.find((f) => f.name === name);
  return { rule: null, error: field ? `${spec.label}: check “${field.label}”.` : `${spec.label}: check this rule.` };
}

export function draftsToRules(drafts: RuleDraft[]): { rules: EligibilityRule[]; errors: string[] } {
  const rules: EligibilityRule[] = [];
  const errors: string[] = [];
  for (const d of drafts) {
    const out = draftToRule(d);
    if (out.rule) rules.push(out.rule);
    else errors.push(out.error);
  }
  return { rules, errors };
}
