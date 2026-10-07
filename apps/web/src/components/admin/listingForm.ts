import {
  type EligibilityRule,
  type LocalArea,
  type ScamFlag,
  type Scholarship,
  type ScholarshipRequirements,
  ScholarshipUpsertInput,
} from "@scholarcrew/domain";

export interface ListingForm {
  slug: string;
  name: string;
  provider: string;
  url: string;
  sourceUrl: string;
  amountMin: string;
  amountMax: string;
  renewable: boolean;
  renewalTerms: string;
  deadline: string;
  cycle: string;
  estMinutes: string;
  national: boolean;
  state: string;
  counties: string;
  cities: string;
  scamFlags: ScamFlag[];
}

export interface EssayDraft {
  key: string;
  prompt: string;
  wordLimit: string;
}

export interface RequirementsForm {
  essays: EssayDraft[];
  recommendations: string;
  transcript: boolean;
  serviceHours: string;
  other: string;
}

/** Same rule as core `slugify`. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "scholarship";
}

export function emptyListingForm(cycle: string): ListingForm {
  return {
    slug: "",
    name: "",
    provider: "",
    url: "",
    sourceUrl: "",
    amountMin: "",
    amountMax: "",
    renewable: false,
    renewalTerms: "",
    deadline: "",
    cycle,
    estMinutes: "60",
    national: false,
    state: "TX",
    counties: "",
    cities: "",
    scamFlags: [],
  };
}

export function emptyRequirementsForm(): RequirementsForm {
  return { essays: [], recommendations: "0", transcript: false, serviceHours: "", other: "" };
}

export function listingFormFrom(
  s: Omit<
    Scholarship,
    | "id"
    | "status"
    | "visibility"
    | "submittedById"
    | "verifiedAt"
    | "createdAt"
    | "updatedAt"
    | "eligibility"
    | "requirements"
  >,
): ListingForm {
  return {
    slug: s.slug,
    name: s.name,
    provider: s.provider,
    url: s.url,
    sourceUrl: s.sourceUrl,
    amountMin: String(s.amountMinUsd),
    amountMax: String(s.amountMaxUsd),
    renewable: s.renewable,
    renewalTerms: s.renewalTerms,
    deadline: s.deadline ?? "",
    cycle: s.cycle,
    estMinutes: String(s.estMinutes),
    national: s.localArea.national,
    state: s.localArea.state ?? "TX",
    counties: s.localArea.counties.join(", "),
    cities: s.localArea.cities.join(", "),
    scamFlags: [...s.scamFlags],
  };
}

export function requirementsFormFrom(r: ScholarshipRequirements): RequirementsForm {
  return {
    essays: r.essays.map((e, i) => ({
      key: `e${i + 1}`,
      prompt: e.prompt,
      wordLimit: e.wordLimit === null ? "" : String(e.wordLimit),
    })),
    recommendations: String(r.recommendations),
    transcript: r.transcript,
    serviceHours: r.serviceHours === null ? "" : String(r.serviceHours),
    other: r.other.join("\n"),
  };
}

/** "$1,000" → 1000; anything that isn't a whole number → NaN so validation names the field. */
function whole(text: string): number {
  const clean = text.replace(/[$,\s]/g, "");
  return /^\d+$/.test(clean) ? Number(clean) : Number.NaN;
}

function list(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function localAreaFrom(f: Pick<ListingForm, "national" | "state" | "counties" | "cities">): LocalArea {
  if (f.national) return { national: true, state: null, counties: [], cities: [] };
  return {
    national: false,
    state: (f.state || null) as LocalArea["state"],
    counties: list(f.counties),
    cities: list(f.cities),
  };
}

export function requirementsFrom(r: RequirementsForm): ScholarshipRequirements {
  return {
    essays: r.essays
      .filter((e) => e.prompt.trim())
      .map((e) => ({ prompt: e.prompt.trim(), wordLimit: e.wordLimit.trim() ? whole(e.wordLimit) : null })),
    recommendations: whole(r.recommendations.trim() || "0"),
    transcript: r.transcript,
    serviceHours: r.serviceHours.trim() ? whole(r.serviceHours) : null,
    other: r.other
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

const FIELD_LABELS: Record<string, string> = {
  id: "Listing",
  slug: "Slug",
  name: "Name",
  provider: "Provider",
  url: "Apply URL",
  sourceUrl: "Source URL",
  amountMinUsd: "Minimum amount",
  amountMaxUsd: "Maximum amount",
  renewalTerms: "Renewal terms",
  deadline: "Deadline",
  cycle: "Cycle",
  localArea: "Where",
  eligibility: "Eligibility",
  requirements: "Requirements",
  estMinutes: "Minutes to apply",
  scamFlags: "Scam flags",
};

const FIELD_HINTS: Record<string, string> = {
  slug: "use lowercase letters, numbers, and dashes (3 to 120 characters)",
  name: "add a name (200 characters or less)",
  provider: "add the sponsor (200 characters or less)",
  url: "use a full web address that starts with https://",
  sourceUrl: "use a full web address that starts with https://",
  amountMinUsd: "use whole dollars",
  amountMaxUsd: "use whole dollars",
  deadline: "use a real date",
  cycle: "use YYYY-YY, like 2026-27",
  localArea: "pick a state or mark the listing national",
  requirements: "check the essays, recommendation count, and service hours",
  estMinutes: "use 5 to 600",
};

export function issuesToErrors(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string; code: string }>,
): string[] {
  const out = new Set<string>();
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    const label = FIELD_LABELS[key] ?? "Listing";
    const hint = issue.code === "custom" ? issue.message : (FIELD_HINTS[key] ?? "check this field");
    out.add(`${label}: ${hint}.`);
  }
  return [...out];
}

export type UpsertResult = { ok: true; input: ScholarshipUpsertInput } | { ok: false; errors: string[] };

export function toUpsertInput(
  id: string | null,
  f: ListingForm,
  r: RequirementsForm,
  eligibility: EligibilityRule[],
): UpsertResult {
  const url = f.url.trim();
  const parsed = ScholarshipUpsertInput.safeParse({
    id,
    slug: f.slug.trim(),
    name: f.name.trim(),
    provider: f.provider.trim(),
    url,
    sourceUrl: f.sourceUrl.trim() || url,
    amountMinUsd: whole(f.amountMin.trim() || "0"),
    amountMaxUsd: whole(f.amountMax),
    renewable: f.renewable,
    renewalTerms: f.renewable ? f.renewalTerms.trim() : "",
    deadline: f.deadline.trim() || null,
    cycle: f.cycle.trim(),
    localArea: localAreaFrom(f),
    eligibility,
    requirements: requirementsFrom(r),
    estMinutes: whole(f.estMinutes),
    scamFlags: f.scamFlags,
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, errors: issuesToErrors(parsed.error.issues) };
}
