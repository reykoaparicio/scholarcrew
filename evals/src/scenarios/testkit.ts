import type { ModelRequest } from "@scholarcrew/agents";
import { type ScriptedTurn, createScriptedModelClient } from "@scholarcrew/agents/testing";
import type { CrewReply, QuillCommentDraft } from "@scholarcrew/domain";
import { EVAL_NOW } from "../fixtures";
import { createRecordingModelClient } from "../recording";
import type { EvalCase, EvalContext, Scenario } from "../types";

/** A context whose model answers with `fn`, recorded like the real run. */
export function scriptedContext(fn: (req: ModelRequest) => ScriptedTurn): EvalContext {
  return { model: createRecordingModelClient(createScriptedModelClient(fn)), now: () => EVAL_NOW };
}

/** A context whose model throws on any call: for cases that must never reach it. */
export function throwingContext(): EvalContext {
  return scriptedContext(() => {
    throw new Error("This case must not call the model");
  });
}

const NOTHING: ScriptedTurn = { content: [{ type: "text", text: "Nothing to add." }] };

/** Compass submits `reply` on its first turn (like plan 12's demo model); other agents say nothing. */
export function submitReply(req: ModelRequest, reply: Partial<CrewReply>): ScriptedTurn {
  if (!req.tools.some((t) => t.name === "submit_reply")) return NOTHING;
  const input: CrewReply = {
    text: "Ok.",
    contributors: ["compass"],
    question: null,
    actionCards: [],
    receipt: [],
    safety: null,
    needsInput: false,
    ...reply,
  };
  return { content: [{ type: "tool_use", name: "submit_reply", input }] };
}

/**
 * A submit_reply that fails 02's CrewReply (an unknown `safety` value). Submit tools are sent without
 * `strict` (R3E-3), so only the loop's Zod check catches it: one retry, then `invalid_submit`.
 */
export function invalidSubmitReply(): ScriptedTurn {
  const input = {
    text: "Ok.",
    contributors: ["compass"],
    question: null,
    actionCards: [],
    receipt: [],
    safety: "maybe",
    needsInput: false,
  };
  return { content: [{ type: "tool_use", name: "submit_reply", input }] };
}

/** Quill submits `comments` on its first turn. */
export function submitComments(req: ModelRequest, comments: QuillCommentDraft[]): ScriptedTurn {
  if (!req.tools.some((t) => t.name === "submit_comments")) return NOTHING;
  return { content: [{ type: "tool_use", name: "submit_comments", input: { comments } }] };
}

export function caseById(scenario: Scenario, id: string): EvalCase {
  const found = scenario.cases.find((c) => c.id === id);
  if (!found) throw new Error(`No case ${id} in ${scenario.id}`);
  return found;
}
