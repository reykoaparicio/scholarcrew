import type { CrewReply, CrewRole } from "@scholarcrew/domain";
import type { ModelTurn, TextBlock } from "../model/types";

export const REFUSAL_TEXT = "I can't help with that one, but I'm happy to keep working on your plan.";
export const OUT_OF_TIME_TEXT = "I ran out of time on that one. Want me to try a narrower question?";

export function refusalReply(contributors: CrewRole[]): CrewReply {
  return {
    text: REFUSAL_TEXT,
    contributors,
    question: null,
    actionCards: [],
    receipt: [],
    safety: "refusal",
    needsInput: false,
  };
}

export function partialReply(text: string, contributors: CrewRole[]): CrewReply {
  return { text, contributors, question: null, actionCards: [], receipt: [], safety: "partial", needsInput: true };
}

/** The most recent non-empty text the model wrote, capped to CrewReply's 2000 characters. */
export function lastText(turns: ModelTurn[]): string | null {
  for (let k = turns.length - 1; k >= 0; k -= 1) {
    const text = (turns[k]?.content ?? [])
      .filter((b): b is TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) return text.slice(0, 2000);
  }
  return null;
}
