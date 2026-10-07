import { z } from "zod";
import { Id, IsoDateTime } from "./common";

export const FactSource = z.enum(["user_stated", "document", "parent_shared", "crew_inferred", "system"]);
export type FactSource = z.infer<typeof FactSource>;

export const FactVisibility = z.enum(["crew", "crew_family", "scout_only", "private"]);
export type FactVisibility = z.infer<typeof FactVisibility>;

export const FactStatus = z.enum(["confirmed", "candidate", "rejected"]);
export type FactStatus = z.infer<typeof FactStatus>;

export const FactKey = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, "Use snake_case");
export const FactValue = z.union([z.string().max(500), z.number(), z.boolean(), z.array(z.string().max(100)).max(20)]);
export type FactValue = z.infer<typeof FactValue>;

/**
 * Fact keys backed by a `profiles` column (R2I-1). Core memory writes on these keys update the
 * matching column in the same transaction; the worker port and the Memory screen use the list to
 * give `scout_only` and `private` meaning for profile facts (R2I-10).
 */
export const PROFILE_FACT_KEYS = [
  "class_year",
  "high_school",
  "state",
  "county",
  "city",
  "gpa_unweighted",
  "intended_majors",
  "interests",
] as const;
export type ProfileFactKey = (typeof PROFILE_FACT_KEYS)[number];

export const MemoryFact = z.strictObject({
  id: Id,
  key: FactKey,
  value: FactValue,
  valueText: z.string(),
  source: FactSource,
  sourceRef: z.string().nullable(),
  visibility: FactVisibility,
  status: FactStatus,
  createdAt: IsoDateTime,
  confirmedAt: IsoDateTime.nullable(),
  expiresAt: IsoDateTime.nullable(),
});
export type MemoryFact = z.infer<typeof MemoryFact>;

export const FactInput = z.strictObject({
  key: FactKey,
  value: FactValue,
  visibility: FactVisibility.default("crew"),
  source: FactSource.default("user_stated"),
  sourceRef: z.string().max(200).nullable().default(null),
});
export type FactInput = z.infer<typeof FactInput>;

export const FactPatch = z.strictObject({
  value: FactValue.optional(),
  visibility: FactVisibility.optional(),
});
export type FactPatch = z.infer<typeof FactPatch>;

export const Decision = z.strictObject({
  id: Id,
  summary: z.string(),
  rationale: z.string(),
  decidedAt: IsoDateTime,
  sourceMessageId: Id.nullable(),
});
export type Decision = z.infer<typeof Decision>;

export const DecisionInput = z.strictObject({
  summary: z.string().min(1).max(200),
  rationale: z.string().max(500).default(""),
});
export type DecisionInput = z.infer<typeof DecisionInput>;

export const IncomeRange = z.enum(["under_30k", "30_48k", "48_75k", "75_110k", "over_110k"]);
export type IncomeRange = z.infer<typeof IncomeRange>;
export const INCOME_RANGE_LABELS: Record<IncomeRange, string> = {
  under_30k: "Under $30k",
  "30_48k": "$30k–48k",
  "48_75k": "$48k–75k",
  "75_110k": "$75k–110k",
  over_110k: "Over $110k",
};

export const SENSITIVE_KINDS = [
  "first_gen",
  "income_range",
  "heritage",
  "disability",
  "religion",
  "military_family",
  "foster_care",
  "noncitizen_filter",
] as const;
export const SENSITIVE_FACT_KEYS = [
  ...SENSITIVE_KINDS,
  "first_generation",
  "firstgen",
  "income",
  "salary",
  "wages",
  "earnings",
  "heritage",
  "ethnicity",
  "ethnic",
  "race",
  "racial",
  "nationality",
  "religion",
  "religious",
  "faith",
  "disability",
  "disabled",
  "health",
  "medical",
  "diagnosis",
  "iep",
  "citizen",
  "citizenship",
  "noncitizen",
  "immigration",
  "immigrant",
  "undocumented",
  "daca",
  "visa",
  "green_card",
  "gender",
  "sex",
  "sexual",
  "sexuality",
  "lgbt",
  "lgbtq",
  "transgender",
  "military",
  "veteran",
  "foster",
  "orphan",
] as const;

function sensitiveTokens(text: string): boolean {
  const tokens = text.toLowerCase().split(/[_\-\s.]+/);
  return SENSITIVE_FACT_KEYS.some((term) => {
    const needle = term.split(/[_\-\s.]+/);
    return tokens.some((_, start) => needle.every((token, offset) => tokens[start + offset] === token));
  });
}
export function isSensitiveFactKey(key: string): boolean {
  return sensitiveTokens(key);
}
export function containsSensitiveTerm(text: string): boolean {
  return sensitiveTokens(text.replace(/[^\p{L}\p{N}_\-\s.]/gu, " "));
}

export const SensitiveKind = z.enum(SENSITIVE_KINDS);
export type SensitiveKind = z.infer<typeof SensitiveKind>;

const LIST_KINDS: SensitiveKind[] = ["heritage", "religion"];

export const SensitiveFactInput = z
  .strictObject({
    kind: SensitiveKind,
    enabled: z.boolean(),
    value: z
      .union([IncomeRange, z.array(z.string().min(1).max(60)).max(5)])
      .nullable()
      .default(null),
  })
  .superRefine((v, ctx) => {
    if (v.value === null) return;
    if (v.kind === "income_range" && typeof v.value !== "string") {
      ctx.addIssue({ code: "custom", message: "income_range takes an income range", path: ["value"] });
    } else if (LIST_KINDS.includes(v.kind) && !Array.isArray(v.value)) {
      ctx.addIssue({ code: "custom", message: `${v.kind} takes a list`, path: ["value"] });
    } else if (v.kind !== "income_range" && !LIST_KINDS.includes(v.kind)) {
      ctx.addIssue({ code: "custom", message: `${v.kind} takes no value`, path: ["value"] });
    }
  });
export type SensitiveFactInput = z.infer<typeof SensitiveFactInput>;

export const SensitiveFactSummary = z.strictObject({
  kind: SensitiveKind,
  enabled: z.boolean(),
  hasValue: z.boolean(),
  displayValue: z.string().nullable(),
  sharedByParent: z.boolean(),
});
export type SensitiveFactSummary = z.infer<typeof SensitiveFactSummary>;

/** What the matcher sees. Disabled kinds read as false / null / []. Never sent to a model. */
export const SensitiveFactValues = z.strictObject({
  firstGen: z.boolean(),
  incomeRange: IncomeRange.nullable(),
  heritage: z.array(z.string()),
  disability: z.boolean(),
  religion: z.array(z.string()),
  militaryFamily: z.boolean(),
  fosterCare: z.boolean(),
  noncitizenFilter: z.boolean(),
});
export type SensitiveFactValues = z.infer<typeof SensitiveFactValues>;

export const NO_SENSITIVE: SensitiveFactValues = {
  firstGen: false,
  incomeRange: null,
  heritage: [],
  disability: false,
  religion: [],
  militaryFamily: false,
  fosterCare: false,
  noncitizenFilter: false,
};

export const ShareIncomeInput = z.strictObject({ studentId: Id, range: IncomeRange });
export type ShareIncomeInput = z.infer<typeof ShareIncomeInput>;
