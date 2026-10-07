import { CrewReply, type CrewRequestInput, type CrewRunResult } from "@scholarcrew/domain";
import { buildContextBlocks } from "../context/blocks";
import type { AgentDeps } from "../context/port";
import { CRISIS_REPLY, detectCrisis } from "../guards/crisis";
import { checkIntegrity } from "../guards/integrity";
import { FAMILY_DEFAULT_ALLOWED } from "../guards/privacy";
import { COMPASS_LIMITS } from "../loop/limits";
import { runCheckedAgentLoop } from "../loop/loop";
import { COMPASS_SYSTEM, SUBMIT_REPLY_DESCRIPTION } from "./prompt";
import { OUT_OF_TIME_TEXT, lastText, partialReply, refusalReply } from "./replies";
import { createCompassSession } from "./session";

export const COMPASS_MAX_TOKENS = 16_000;
/** Shorter interim text ("Searching...") is never sent as a whole reply. */
export const MIN_FALLBACK_TEXT = 20;

/** The model's unsubmitted text skips the source guard, so it must be substantial and pass the integrity check (ES-09). */
export function fallbackText(text: string | null, studentTexts: string[]): string {
  if (!text || text.length < MIN_FALLBACK_TEXT) return OUT_OF_TIME_TEXT;
  return checkIntegrity(text, studentTexts).ok ? text : OUT_OF_TIME_TEXT;
}

/** One crew request: crisis check, snapshot, Compass loop with consults and calculators, guards (CR-02..CR-05, CR-09, CR-11, AG-01). */
export const QUILL_FEEDBACK_ONLY_TEXT =
  "I can help with feedback and questions. You write the essay in your own words.";

export async function runCrewRequest(deps: AgentDeps, i: CrewRequestInput): Promise<CrewRunResult> {
  if (detectCrisis(i.userText)) return { reply: CRISIS_REPLY, status: "ready", safety: "crisis", consulted: [] };

  const fetched = await deps.port.snapshot(i.ownerId, i.room, i.audience);
  const requestedRef = i.roomRef ?? fetched.roomRef;
  const roomRef =
    requestedRef?.type === "scholarship" && !(await deps.port.scholarship(requestedRef.id)) ? null : requestedRef;
  const snapshot = { ...fetched, roomRef };
  // The snapshot is already filtered for the audience; family replies may cite only default-shared categories.
  const liveGrants = await deps.port.liveGrants();
  const session = createCompassSession(deps, {
    ownerId: i.ownerId,
    audience: i.audience,
    snapshot,
    allowed: i.audience === "family" ? liveGrants : FAMILY_DEFAULT_ALLOWED,
    submitName: "submit_reply",
  });
  await session.progress("compass", "Compass is reading your request.");

  const result = await runCheckedAgentLoop(deps.model, {
    role: "compass",
    system: COMPASS_SYSTEM,
    userContent: buildContextBlocks(snapshot, i.history, i.userText, i.mentions, i.requester),
    tools: session.tools,
    submit: { name: "submit_reply", description: SUBMIT_REPLY_DESCRIPTION, schema: CrewReply },
    effort: "medium",
    maxTokens: COMPASS_MAX_TOKENS,
    limits: COMPASS_LIMITS,
    onTurn: session.onTurn,
    now: () => deps.now().getTime(),
    check: (reply) => {
      if (reply.safety === "crisis") return [];
      const problems = session.check(reply);
      const quillTurn = i.room === "essay" || i.mentions.includes("quill") || session.consulted().includes("quill");
      if (
        quillTurn &&
        !checkIntegrity(reply.text, [i.userText, ...i.history.map((entry) => entry.text), ...session.studentTexts()]).ok
      )
        problems.push("Keep essay coaching to short feedback and questions, never write student prose.");
      return problems;
    },
  });
  await session.flush();

  const consulted = session.consulted();
  if (i.audience === "family") {
    const fresh = await deps.port.liveGrants();
    if (deps.port.usedCategories().some((category) => !fresh.includes(category))) {
      return {
        reply: partialReply("Sharing changed while I was working. Please ask again.", ["compass"]),
        status: "needs_input",
        safety: "partial",
        consulted: [],
      };
    }
  }
  if (result.reason === "submitted" && result.output) {
    if (result.output.safety === "crisis")
      return { reply: CRISIS_REPLY, status: "ready", safety: "crisis", consulted: [] };
    let reply = session.finish(result.output);
    const quillTurn = i.room === "essay" || i.mentions.includes("quill") || session.consulted().includes("quill");
    if (
      quillTurn &&
      !checkIntegrity(reply.text, [i.userText, ...i.history.map((entry) => entry.text), ...session.studentTexts()]).ok
    ) {
      reply = { ...reply, text: session.quillSummary() ?? QUILL_FEEDBACK_ONLY_TEXT, safety: "partial" };
      console.log(JSON.stringify({ level: "warn", msg: "integrity.compass_replaced", jobId: i.jobId }));
    }
    return { reply, status: reply.needsInput ? "needs_input" : "ready", safety: reply.safety, consulted };
  }
  if (result.reason === "refused") {
    console.log(JSON.stringify({ level: "warn", msg: "crew.refusal", jobId: i.jobId, role: "compass" }));
    return { reply: refusalReply(session.contributors()), status: "ready", safety: "refusal", consulted };
  }
  if (result.reason === "invalid_submit") {
    // R3E-3: two submit_reply inputs failed CrewReply. Nothing in them is safe to show, so the job fails with the
    // fixed partial reply (12 completes a failed outcome without counting the request).
    console.log(JSON.stringify({ level: "warn", msg: "crew.invalid_submit", jobId: i.jobId, role: "compass" }));
    return {
      reply: partialReply(OUT_OF_TIME_TEXT, session.contributors()),
      status: "failed",
      safety: "partial",
      consulted,
    };
  }
  const text = fallbackText(lastText(result.turns), [i.userText, ...i.history.map((h) => h.text)]);
  const reply = partialReply(text, session.contributors());
  return { reply, status: "needs_input", safety: "partial", consulted };
}
