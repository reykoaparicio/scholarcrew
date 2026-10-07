import { CREW_NAMES, SpecialistResult, type SpecialistRole, type Story } from "@scholarcrew/domain";
import { type ConsultFn, wrapUntrusted } from "../context";
import { checkIntegrity } from "../guards";
import { SPECIALIST_LIMITS, runCheckedAgentLoop } from "../loop";
import type { ToolDef } from "../model/types";
import { SPECIALISTS } from "./definitions";
import { SUBMIT_RESULT_DESCRIPTION } from "./prompts";
import { SPECIALIST_MAX_TOKENS, type SpecialistDeps, reportProgress, usageReporter } from "./shared";

export type ConsultInput = Parameters<ConsultFn>[0];

export const COULDNT_FINISH_SUMMARY = "I couldn't finish that check.";
export const INTEGRITY_SUMMARY = "I only give feedback and questions, not essay text.";

type Unfinished = "refused" | "limit" | "no_submit" | "invalid_submit";

const UNFINISHED_UNCERTAINTY: Record<Unfinished, string> = {
  refused: "This check was declined, so nothing in it is confirmed.",
  limit: "I ran out of time before checking the records, so nothing in it is confirmed.",
  no_submit: "I didn't return a checked answer, so nothing in it is confirmed.",
  invalid_submit: "My answer didn't pass the format check, so nothing in it is confirmed.",
};

export function unfinishedResult(role: SpecialistRole, reason: Unfinished): SpecialistResult {
  return {
    role,
    summary: COULDNT_FINISH_SUMMARY,
    proposedActions: [],
    factsUsed: [],
    uncertainty: [UNFINISHED_UNCERTAINTY[reason]],
    needsPermission: [],
  };
}

/** The student's own words in the Story Bank; Quill may quote them freely. */
export function storyTexts(stories: Story[]): string[] {
  return stories.flatMap((s) => [s.title, s.moment, s.evidence, s.summary]).filter((t) => t.trim().length > 0);
}

export function integrityProblem(longestNewRun: number, field = "summary"): string {
  return `${field} has ${longestNewRun} words in a row that aren't the student's. Keep it to short questions or observations, at most 25 words of your own, and quote the student exactly.`;
}

/** ES-09 covers all Quill output Compass may relay: the summary, every action title, and every uncertainty line. */
export function quillIntegrityProblems(r: SpecialistResult, studentTexts: string[]): string[] {
  const fields: Array<[string, string]> = [
    ["summary", r.summary],
    ...r.proposedActions.map((a): [string, string] => ["an action title", a.title]),
    ...r.uncertainty.map((u): [string, string] => ["an uncertainty line", u]),
  ];
  for (const [field, text] of fields) {
    const c = checkIntegrity(text, studentTexts);
    if (!c.ok) return [integrityProblem(c.longestNewRun, field)];
  }
  return [];
}

/** Records every essay body Quill reads, so quoting the draft back isn't counted as new prose. */
function captureEssayBodies(tools: ToolDef[], into: string[]): ToolDef[] {
  return tools.map((t) => {
    if (t.name !== "get_essay" && t.name !== "get_story") return t;
    const wrapped: ToolDef = {
      ...t,
      run: async (input: unknown) => {
        const out = await t.run(input);
        const body = out !== null && typeof out === "object" ? (out as { body?: unknown }).body : undefined;
        if (typeof body === "string") into.push(body);
        if (t.name === "get_story" && out !== null && typeof out === "object") into.push(...storyTexts([out as Story]));
        return out;
      },
    };
    return wrapped;
  });
}

/** Records the JSON of every tool result, so the refs a specialist cites can be checked against data it actually saw. */
function captureToolResults(tools: ToolDef[], into: string[]): ToolDef[] {
  return tools.map((t) => {
    const wrapped: ToolDef = {
      ...t,
      run: async (input: unknown) => {
        const out = await t.run(input);
        into.push(JSON.stringify(out) ?? "");
        return out;
      },
    };
    return wrapped;
  });
}

/**
 * CR-04, AG-04: a ref passes when it's null or its id appears as a JSON string in the context or a tool result.
 * Calc refs ("calc:quill-1") must appear whole, because only this run's tools mint them.
 */
export function refWasSeen(ref: string | null, seen: string[]): boolean {
  if (ref === null) return true;
  const colon = ref.indexOf(":");
  const type = colon > 0 ? ref.slice(0, colon) : "";
  const id = type === "calc" || colon < 0 ? ref : ref.slice(colon + 1);
  if (id.length === 0) return false;
  const needle = JSON.stringify(id);
  return seen.some((s) => s.includes(needle));
}

export function keepSeenRefs(r: SpecialistResult, seen: string[]): SpecialistResult {
  const factsUsed = r.factsUsed.filter((f) => refWasSeen(f.refId, seen));
  const proposedActions = r.proposedActions.filter((a) => refWasSeen(a.refId, seen));
  const dropped = r.factsUsed.length - factsUsed.length + (r.proposedActions.length - proposedActions.length);
  if (dropped > 0)
    console.log(JSON.stringify({ level: "warn", msg: "specialist.unseen_refs_dropped", role: r.role, dropped }));
  return { ...r, factsUsed, proposedActions };
}

/** One specialist consultation for Compass (AG-02, AG-03). Never throws for model outcomes; always returns a SpecialistResult. */
export async function consultSpecialist(deps: SpecialistDeps, i: ConsultInput): Promise<SpecialistResult> {
  const def = SPECIALISTS[i.role];
  await reportProgress(deps, i.role, `${CREW_NAMES[i.role]} is checking…`);

  const isQuill = i.role === "quill";
  const studentTexts = isQuill ? storyTexts(await deps.port.stories(i.ownerId)) : [];
  const seen: string[] = [JSON.stringify(i.context)];
  const baseTools = captureToolResults(def.tools(deps.port, i.ownerId, i.audience), seen);
  const tools = isQuill ? captureEssayBodies(baseTools, studentTexts) : baseTools;
  const usage = usageReporter(deps, i.role);

  const result = await runCheckedAgentLoop(deps.model, {
    role: i.role,
    system: def.system,
    userContent: [wrapUntrusted("student_context", JSON.stringify(i.context)), { type: "text", text: i.question }],
    tools,
    submit: { name: "submit_result", description: SUBMIT_RESULT_DESCRIPTION, schema: SpecialistResult },
    effort: def.effort,
    maxTokens: SPECIALIST_MAX_TOKENS,
    limits: SPECIALIST_LIMITS,
    onTurn: usage.onTurn,
    now: () => deps.now().getTime(),
    // ES-09: Quill output with more than 25 consecutive new words in any relayed field is sent back once.
    check: isQuill ? (r) => quillIntegrityProblems(r, studentTexts) : undefined,
  });
  await usage.flush();
  i.onStudentTexts?.([...studentTexts]);

  if (result.reason !== "submitted" || !result.output) {
    if (result.reason === "refused")
      console.log(JSON.stringify({ level: "warn", msg: "specialist.refusal", role: i.role }));
    return unfinishedResult(i.role, result.reason === "submitted" ? "no_submit" : result.reason);
  }
  const output: SpecialistResult = keepSeenRefs({ ...result.output, role: i.role }, seen);
  if (result.problems.length > 0) {
    const longestNewRun = Math.max(
      ...[output.summary, ...output.proposedActions.map((a) => a.title), ...output.uncertainty].map(
        (t) => checkIntegrity(t, studentTexts).longestNewRun,
      ),
    );
    console.log(JSON.stringify({ level: "warn", msg: "quill.integrity_violation", role: i.role, longestNewRun }));
    return {
      ...output,
      summary: INTEGRITY_SUMMARY,
      proposedActions: [],
      uncertainty: output.uncertainty.filter((u) => checkIntegrity(u, studentTexts).ok),
    };
  }
  return output;
}

export function makeConsult(deps: SpecialistDeps): ConsultFn {
  return (i) => consultSpecialist(deps, i);
}
