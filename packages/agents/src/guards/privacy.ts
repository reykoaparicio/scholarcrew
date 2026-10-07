import {
  type ActionCard,
  type CrewReply,
  DEFAULT_SHARED,
  type ReceiptItem,
  SHARE_CATEGORIES,
  type ShareCategory,
} from "@scholarcrew/domain";
import { parseRefId, refFor } from "../context/refs";

/** Share categories on by default; what family replies may cite when the caller doesn't pass grants. */
export const FAMILY_DEFAULT_ALLOWED: ShareCategory[] = SHARE_CATEGORIES.filter((c) => DEFAULT_SHARED[c]);

const REF_CATEGORY: Record<string, ShareCategory | "never"> = {
  fact: "never",
  essay: "essays",
  story: "stories",
  scholarship: "scholarships",
  college: "colleges",
};

export function refPrivacyProblem(ref: string, audience: "crew" | "family", allowed: ShareCategory[]): string | null {
  if (audience === "crew") return null;
  const parsed = parseRefId(ref);
  if (!parsed) return null;
  const category = REF_CATEGORY[parsed.type];
  if (!category) return null;
  if (category === "never" || !allowed.includes(category)) return `${ref} isn't shared with family.`;
  return null;
}

export function receiptPrivacyProblem(
  item: ReceiptItem,
  audience: "crew" | "family",
  allowed: ShareCategory[],
): string | null {
  if (audience === "crew") return null;
  if (item.kind === "fact") return `Receipt "${item.label}" cites a memory fact, which isn't shared with family.`;
  return item.refId ? refPrivacyProblem(item.refId, audience, allowed) : null;
}

export function cardRefs(card: ActionCard): string[] {
  switch (card.kind) {
    case "save_scholarship":
      return [`scholarship:${card.scholarshipId}`];
    case "add_college":
      return [`college:${card.collegeId}`];
    case "add_plan_item":
      return card.item.refType && card.item.refId ? [refFor(card.item.refType, card.item.refId)] : [];
    case "start_essay":
      return ["essay:new"];
    case "confirm_fact":
      return ["fact:new"];
    default:
      return [];
  }
}

export function cardPrivacyProblem(
  card: ActionCard,
  audience: "crew" | "family",
  allowed: ShareCategory[],
): string | null {
  for (const ref of cardRefs(card)) {
    const problem = refPrivacyProblem(ref, audience, allowed);
    if (problem) return `Card "${card.id}": ${problem}`;
  }
  return null;
}

/** Family replies only cite what the student shares; memory facts never reach family (FA, SE-01). */
export function checkPrivacy(
  reply: CrewReply,
  audience: "crew" | "family",
  allowed: ShareCategory[] = FAMILY_DEFAULT_ALLOWED,
): { ok: boolean; problems: string[] } {
  const problems = [
    ...reply.receipt.map((r) => receiptPrivacyProblem(r, audience, allowed)),
    ...reply.actionCards.map((c) => cardPrivacyProblem(c, audience, allowed)),
  ].filter((p): p is string => p !== null);
  return { ok: problems.length === 0, problems };
}
