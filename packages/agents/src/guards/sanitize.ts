import type { CrewReply, ShareCategory } from "@scholarcrew/domain";
import { cardPrivacyProblem, checkPrivacy, receiptPrivacyProblem } from "./privacy";
import { type KnownSources, cardProblem, checkSources, receiptItemProblem } from "./sources";

export function guardProblems(
  reply: CrewReply,
  known: KnownSources,
  audience: "crew" | "family",
  allowed: ShareCategory[],
): string[] {
  return [...checkSources(reply, known).problems, ...checkPrivacy(reply, audience, allowed).problems];
}

/** Last resort after the corrective turn: keep the text, drop every receipt item and card that still fails. */
export function sanitizeReply(
  reply: CrewReply,
  known: KnownSources,
  audience: "crew" | "family",
  allowed: ShareCategory[],
): { reply: CrewReply; dropped: number } {
  const receipt = reply.receipt.filter(
    (r) => receiptItemProblem(r, known) === null && receiptPrivacyProblem(r, audience, allowed) === null,
  );
  const actionCards = reply.actionCards.filter(
    (c) => cardProblem(c, known) === null && cardPrivacyProblem(c, audience, allowed) === null,
  );
  const dropped = reply.receipt.length - receipt.length + (reply.actionCards.length - actionCards.length);
  return { reply: { ...reply, receipt, actionCards }, dropped };
}
