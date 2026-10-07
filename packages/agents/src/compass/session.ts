import {
  type ActionCard,
  AppError,
  CREW_NAMES,
  type ContextSnapshot,
  type CrewReply,
  type CrewRole,
  SPECIALIST_ROLES,
  type ShareCategory,
  type SpecialistResult,
  type SpecialistRole,
  containsSensitiveTerm,
  isSensitiveFactKey,
} from "@scholarcrew/domain";
import { z } from "zod";
import { createCalculatorTools } from "../calculators";
import type { AgentDeps } from "../context/port";
import { parseRefId, refFor, refId } from "../context/refs";
import { type CatalogSource, type KnownSources, emptyKnownSources, guardProblems, sanitizeReply } from "../guards";
import type { ModelTurn, ToolDef } from "../model/types";
import { CONSULT_DESCRIPTIONS } from "./prompt";

export const MAX_CONSULTS = 4;
const ConsultInput = z.strictObject({ question: z.string().min(1).max(600) });
/** Card kinds that write memory; never offered in a temporary room. */
const MEMORY_CARD_KINDS: ReadonlySet<ActionCard["kind"]> = new Set(["confirm_fact", "record_decision"]);

export function knownFromSnapshot(s: ContextSnapshot): KnownSources {
  const known = emptyKnownSources();
  for (const f of s.facts) known.factIds.add(refId("fact", f.id));
  for (const d of s.decisions) known.recordIds.add(refId("record", d.id));
  for (const item of s.weekPlan.items) {
    known.recordIds.add(refId("record", item.id));
    if (item.refType && item.refId) known.recordIds.add(refFor(item.refType, item.refId));
  }
  for (const d of s.deadlines) known.recordIds.add(refFor(d.refType, d.refId));
  for (const c of s.colleges) known.recordIds.add(refId("college", c.id));
  if (s.roomRef) known.recordIds.add(refFor(s.roomRef.type, s.roomRef.id));
  return known;
}

export interface CompassSession {
  tools: ToolDef[];
  known: KnownSources;
  consulted: () => SpecialistRole[];
  contributors: () => CrewRole[];
  check: (reply: CrewReply) => string[];
  studentTexts: () => string[];
  quillSummary: () => string | null;
  finish: (reply: CrewReply) => CrewReply;
  progress: (role: CrewRole, text: string) => Promise<void>;
  onTurn: (t: ModelTurn) => void;
  flush: () => Promise<void>;
}

export function createCompassSession(
  deps: AgentDeps,
  s: {
    ownerId: string;
    audience: "crew" | "family";
    snapshot: ContextSnapshot;
    allowed: ShareCategory[];
    submitName: string;
  },
): CompassSession {
  const known = knownFromSnapshot(s.snapshot);
  const consultedSet = new Set<SpecialistRole>();
  const lookups = new Map<string, Promise<CatalogSource | null>>();
  const pending: Promise<void>[] = [];
  const collectedStudentTexts: string[] = [];
  let lastQuillSummary: string | null = null;
  let consults = 0;
  let calcs = 0;

  const progress = async (role: CrewRole, text: string): Promise<void> => {
    await deps.onProgress?.({ at: deps.now().toISOString(), role, text });
  };

  const lookupCatalog = (type: "scholarship" | "college", id: string): Promise<CatalogSource | null> => {
    const key = `${type}:${id}`;
    const cached = lookups.get(key);
    if (cached) return cached;
    const found =
      type === "scholarship"
        ? deps.port.scholarship(id).then((x) => (x ? { url: x.sourceUrl, verifiedAt: x.verifiedAt } : null))
        : deps.port.college(id).then((x) => (x ? { url: x.sourceUrl, verifiedAt: x.verifiedAt } : null));
    lookups.set(key, found);
    return found;
  };

  /** Adds what a specialist used to KnownSources; returns catalog sources Compass must copy into receipts. */
  const learn = async (result: SpecialistResult) => {
    const catalogSources: Array<{ refId: string; sourceUrl: string; verifiedAt: string | null }> = [];
    for (const f of result.factsUsed) {
      const parsed = f.refId ? parseRefId(f.refId) : null;
      if (!f.refId || !parsed) continue;
      if (f.source === "catalog" && (parsed.type === "scholarship" || parsed.type === "college")) {
        const entry = await lookupCatalog(parsed.type, parsed.id);
        if (entry) {
          known.catalog.set(f.refId, entry);
          catalogSources.push({ refId: f.refId, sourceUrl: entry.url, verifiedAt: entry.verifiedAt });
        }
      } else if (parsed.type === "calc") {
        known.calcs.add(f.refId);
      } else if (parsed.type !== "fact") {
        known.recordIds.add(f.refId);
      }
    }
    for (const a of result.proposedActions) {
      if (a.refType && a.refId) known.recordIds.add(refFor(a.refType, a.refId));
    }
    return catalogSources;
  };

  const consultTools: ToolDef[] = s.snapshot.enabledSpecialists.map((role) => {
    const tool: ToolDef<z.infer<typeof ConsultInput>> = {
      name: `consult_${role}`,
      description: CONSULT_DESCRIPTIONS[role],
      input: ConsultInput,
      run: async ({ question }) => {
        if (consults >= MAX_CONSULTS) {
          throw new AppError(
            "limit_reached",
            `You already consulted ${MAX_CONSULTS} specialists. Call ${s.submitName} now with what you have.`,
          );
        }
        consults += 1;
        await progress(role, `Asking ${CREW_NAMES[role]}…`);
        const result = await deps.consult({
          role,
          question,
          ownerId: s.ownerId,
          audience: s.audience,
          context: s.snapshot,
          onStudentTexts: (texts) => {
            collectedStudentTexts.push(...texts);
          },
        });
        if (role === "quill") lastQuillSummary = result.summary;
        consultedSet.add(role);
        return { ...result, catalogSources: await learn(result) };
      },
    };
    return tool;
  });

  const calculatorTools = createCalculatorTools({
    now: deps.now,
    timeZone: s.snapshot.timeZone,
    register: () => {
      calcs += 1;
      const id = `calc:${calcs}`;
      known.calcs.add(id);
      return id;
    },
  });

  const consulted = () => SPECIALIST_ROLES.filter((r) => consultedSet.has(r));
  const contributors = (): CrewRole[] => ["compass", ...consulted()];
  const check = (reply: CrewReply) => guardProblems(reply, known, s.audience, s.allowed);

  return {
    studentTexts: () => [...collectedStudentTexts],
    quillSummary: () => lastQuillSummary,
    tools: [...consultTools, ...calculatorTools],
    known,
    consulted,
    contributors,
    check,
    finish: (reply) => {
      // D22/CR-07: a temporary room remembers nothing, so cards that would save a fact or a decision are dropped.
      const actionCards =
        s.snapshot.room === "temporary"
          ? reply.actionCards.filter((c) => !MEMORY_CARD_KINDS.has(c.kind))
          : reply.actionCards;
      const safeCards = actionCards
        .filter(
          (card) =>
            card.kind !== "confirm_fact" ||
            (!isSensitiveFactKey(card.fact.key) && !containsSensitiveTerm(JSON.stringify(card.fact.value))),
        )
        .map((card) => {
          if (card.kind === "confirm_fact")
            return { ...card, label: "Save to memory", fact: { ...card.fact, visibility: "crew" as const } };
          if (card.kind === "record_decision") return { ...card, label: "Log this decision" };
          return card;
        });
      const base: CrewReply = { ...reply, actionCards: safeCards, contributors: contributors(), safety: null };
      if (check(base).length === 0) return base;
      return { ...sanitizeReply(base, known, s.audience, s.allowed).reply, safety: "partial" };
    },
    progress,
    onTurn: (t) => {
      if (!deps.onUsage) return;
      // Attach the handler now: a rejected usage write must never surface as an unhandled rejection.
      pending.push(
        deps.onUsage("compass", t).catch((e: unknown) => {
          console.log(
            JSON.stringify({ level: "error", msg: "agents.usage_failed", role: "compass", error: String(e) }),
          );
        }),
      );
    },
    flush: async () => {
      await Promise.all(pending);
    },
  };
}
