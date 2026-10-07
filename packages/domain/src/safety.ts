import type { CrewReply } from "./crew";

/** Phrases that mean the student may be in danger. Hyperbole like "this essay is killing me" doesn't match. */
export const CRISIS_PATTERNS: RegExp[] = [
  /\bkill(?:ing)? ?myself\b/,
  /\bend(?:ing)? my (?:own )?life\b/,
  /\bend it all\b/,
  /\btake my (?:own )?life\b/,
  /\bsuicid(?:e|al)\b/,
  /\bwants? to die\b/,
  /\bwanna die\b/,
  /\bhurt(?:ing)? myself\b/,
  /\bcut(?:ting)? myself\b/,
  /\bself[- ]?harm/,
  /\bno reason to live\b/,
  /\bdon'?t want to (?:live|be alive|exist)\b/,
  /\bbetter off dead\b/,
  /\bbetter off without me\b/,
  /\bkms\b/,
  /\bunalive\b/,
  /\bdon'?t (?:want|wanna) to be (?:here|alive) anymore\b/,
  /\b(?:want|wanna|going) to (?:hurt|kill) myself\b/,
  /\boverdos(?:e|ing)\b/,
  /\bquiero morir(?:me)?\b/,
  /\bme quiero (?:matar|morir)\b/,
  /\bmatarme\b/,
  /\bsuicid(?:e|al|arme|io|arse)\b/,
  /\bno quiero (?:vivir|seguir viviendo|estar aqui)\b/,
  /\bhacerme dano\b/,
  /\blastimarme\b/,
  /\bquitarme la vida\b/,
  /\bacabar con mi vida\b/,
];

export function normalizeForCrisis(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\p{Cf}/gu, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .replace(/\bmy self\b/g, "myself");
}
export function detectCrisis(text: string): boolean {
  return CRISIS_PATTERNS.some((pattern) => pattern.test(normalizeForCrisis(text)));
}

/** Reviewed copy. Sent instead of planning; no specialists run (CR-09). */
export const CRISIS_REPLY: CrewReply = {
  text: "I'm really glad you told me. If you're thinking about hurting yourself, please call or text 988 to reach the 988 Suicide & Crisis Lifeline. It's free and open 24/7. If you're in danger right now, call 911. En español: llama o envía un mensaje de texto al 988. I'm here when you want to get back to your plans.",
  contributors: ["compass"],
  question: null,
  actionCards: [],
  receipt: [],
  safety: "crisis",
  needsInput: false,
};
