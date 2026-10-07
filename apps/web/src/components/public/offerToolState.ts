import { usd } from "@/lib/format";
import {
  OFFER_LINE_CATEGORIES,
  type OfferComparison,
  type OfferLineCategory,
  PublicOfferInput,
} from "@scholarcrew/domain";
import type { OfferBarRow } from "@scholarcrew/ui";

export const MAX_OFFERS = 4;
export const MAX_LINES = 30;

export const CATEGORY_LABELS: Record<OfferLineCategory, string> = {
  grant: "Grant",
  scholarship: "Scholarship",
  work_study: "Work-study",
  loan_federal_subsidized: "Federal loan (subsidized)",
  loan_federal_unsubsidized: "Federal loan (unsubsidized)",
  loan_parent_plus: "Parent PLUS loan",
  loan_private: "Private loan",
  other: "Other",
};

export const CATEGORY_OPTIONS = OFFER_LINE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));

export interface LineDraft {
  key: string;
  label: string;
  amount: string;
  category: OfferLineCategory;
  renewable: boolean;
}

export interface OfferDraft {
  key: string;
  name: string;
  cost: string;
  lines: LineDraft[];
}

export function newLine(key: string, category: OfferLineCategory = "grant"): LineDraft {
  return { key, label: "", amount: "", category, renewable: false };
}

export function newOffer(key: string): OfferDraft {
  return { key, name: "", cost: "", lines: [newLine(`${key}-l1`)] };
}

/** "$12,500" → 12500. Blank, decimals, and negatives → null. */
export function parseDollars(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, "");
  return /^\d{1,7}$/.test(clean) ? Number(clean) : null;
}

export type BuildResult = { ok: true; input: PublicOfferInput } | { ok: false; errors: string[] };

/** Turns the form into a PublicOfferInput. Lines with no label and no amount are skipped. */
export function buildOfferInput(drafts: OfferDraft[]): BuildResult {
  const errors: string[] = [];
  if (drafts.length === 0) errors.push("Add at least one school.");
  if (drafts.length > MAX_OFFERS) errors.push(`Compare up to ${MAX_OFFERS} schools at a time.`);
  const offers = drafts.map((d, i) => {
    const school = `School ${i + 1}`;
    const name = d.name.trim();
    if (!name) errors.push(`${school}: add the school's name.`);
    const cost = parseDollars(d.cost);
    if (cost === null || cost === 0) errors.push(`${school}: enter the cost of attendance in whole dollars.`);
    const lines: PublicOfferInput["offers"][number]["lines"] = [];
    for (const [j, l] of d.lines.entries()) {
      const label = l.label.trim();
      if (!label && !l.amount.trim()) continue;
      const where = `${school}, line ${j + 1}`;
      const amount = parseDollars(l.amount);
      if (!label) errors.push(`${where}: add a label, like "Pell Grant".`);
      if (amount === null) errors.push(`${where}: enter a whole-dollar amount.`);
      lines.push({ label, amountUsd: amount ?? 0, category: l.category, renewable: l.renewable });
    }
    if (lines.length > MAX_LINES) errors.push(`${school}: use ${MAX_LINES} lines or fewer.`);
    return { name, costOfAttendanceUsd: cost ?? 0, lines };
  });
  if (errors.length > 0) return { ok: false, errors };
  const parsed = PublicOfferInput.safeParse({ offers });
  if (!parsed.success) {
    return {
      ok: false,
      errors: ["Check the numbers: each amount must be $200,000 or less, and names and labels 120 characters or less."],
    };
  }
  return { ok: true, input: parsed.data };
}

export function barRows(c: OfferComparison): OfferBarRow[] {
  return c.columns.map((col) => ({
    label: col.collegeName,
    sub: `${usd(col.freeMoneyUsd)} free money · ${usd(col.loansUsd)} in loans`,
    freeUsd: col.freeMoneyUsd,
    costUsd: col.reallyCostsUsd,
    endLabel: `${usd(col.reallyCostsUsd)} year 1`,
  }));
}

export function axisMax(c: OfferComparison): number {
  return Math.max(1, ...c.columns.map((col) => col.costOfAttendanceUsd));
}
