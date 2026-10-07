import type { ActionCard, CrewReply, PlanItemInput, ReceiptItem } from "@scholarcrew/domain";
import { refFor } from "../context/refs";

export interface CatalogSource {
  url: string;
  verifiedAt: string | null;
}

/** Everything a reply may cite, keyed by full refId ("fact:<id>", "scholarship:<id>", "calc:1", ...). */
export interface KnownSources {
  factIds: Set<string>;
  recordIds: Set<string>;
  catalog: Map<string, CatalogSource>;
  calcs: Set<string>;
}

export function emptyKnownSources(): KnownSources {
  return { factIds: new Set(), recordIds: new Set(), catalog: new Map(), calcs: new Set() };
}

function isKnownRecord(known: KnownSources, ref: string): boolean {
  return known.recordIds.has(ref) || known.catalog.has(ref);
}

/** R3E-4: only catalog listings carry a link and a verified date, and 16 renders both, so other items must leave them null. */
function sourceFieldsProblem(item: ReceiptItem): string | null {
  if (item.sourceUrl === null && item.verifiedAt === null) return null;
  return `Receipt "${item.label}" must use sourceUrl null and verifiedAt null.`;
}

function catalogFieldsProblem(item: ReceiptItem, entry: CatalogSource): string | null {
  if (item.sourceUrl === entry.url && item.verifiedAt === entry.verifiedAt) return null;
  return `Receipt "${item.label}" must use sourceUrl ${entry.url} and verifiedAt ${entry.verifiedAt ?? "null"}.`;
}

export function receiptItemProblem(item: ReceiptItem, known: KnownSources): string | null {
  const ref = item.refId;
  if (!ref) return `Receipt "${item.label}" has no refId.`;
  switch (item.kind) {
    case "fact":
      return known.factIds.has(ref) ? sourceFieldsProblem(item) : `Receipt "${item.label}" cites unknown fact ${ref}.`;
    case "record": {
      if (!isKnownRecord(known, ref)) return `Receipt "${item.label}" cites unknown record ${ref}.`;
      // A record that is also a known catalog listing (a saved scholarship's deadline, say) may show the
      // listing's own admin-verified link and date, or none. Any other link or date is a problem.
      const entry = known.catalog.get(ref);
      if (entry && (item.sourceUrl !== null || item.verifiedAt !== null)) return catalogFieldsProblem(item, entry);
      return sourceFieldsProblem(item);
    }
    case "calculation":
      return known.calcs.has(ref)
        ? sourceFieldsProblem(item)
        : `Receipt "${item.label}" cites unknown calculation ${ref}.`;
    case "catalog": {
      const entry = known.catalog.get(ref);
      if (!entry) return `Receipt "${item.label}" cites unknown catalog item ${ref}.`;
      return catalogFieldsProblem(item, entry);
    }
    default:
      return null;
  }
}

export function planItemProblem(item: Pick<PlanItemInput, "refType" | "refId">, known: KnownSources): string | null {
  if (!item.refType || !item.refId) return null;
  const ref = refFor(item.refType, item.refId);
  return isKnownRecord(known, ref) ? null : `plan item points at unknown ${ref}.`;
}

export function cardProblem(card: ActionCard, known: KnownSources): string | null {
  switch (card.kind) {
    case "save_scholarship": {
      const ref = `scholarship:${card.scholarshipId}`;
      return isKnownRecord(known, ref) ? null : `Card "${card.id}" saves unknown ${ref}.`;
    }
    case "add_college": {
      const ref = `college:${card.collegeId}`;
      return isKnownRecord(known, ref) ? null : `Card "${card.id}" adds unknown ${ref}.`;
    }
    case "add_plan_item": {
      const problem = planItemProblem(card.item, known);
      return problem ? `Card "${card.id}": ${problem}` : null;
    }
    case "start_essay": {
      const { targetScholarshipId, targetCollegeId } = card.essay;
      if (targetScholarshipId && !isKnownRecord(known, `scholarship:${targetScholarshipId}`)) {
        return `Card "${card.id}" targets unknown scholarship:${targetScholarshipId}.`;
      }
      if (targetCollegeId && !isKnownRecord(known, `college:${targetCollegeId}`)) {
        return `Card "${card.id}" targets unknown college:${targetCollegeId}.`;
      }
      return null;
    }
    default:
      return null;
  }
}

/** CR-04 / product rule 3: every receipt and card points at something the crew actually read or computed. */
export function checkSources(reply: CrewReply, known: KnownSources): { ok: boolean; problems: string[] } {
  const problems = [
    ...reply.receipt.map((r) => receiptItemProblem(r, known)),
    ...reply.actionCards.map((c) => cardProblem(c, known)),
  ].filter((p): p is string => p !== null);
  return { ok: problems.length === 0, problems };
}
