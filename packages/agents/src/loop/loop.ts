import { type Effort, isAppError } from "@scholarcrew/domain";
import type { z } from "zod";
import type {
  ContentBlock,
  ContentBlockParam,
  MessageParam,
  ModelClient,
  ModelTurn,
  ToolDef,
  ToolResultBlockParam,
  ToolUseBlock,
} from "../model/types";
import { type LoopLimits, MAX_ISSUE_CHARS, MAX_SUBMIT_RETRIES, MAX_TOOL_RESULT_CHARS } from "./limits";

export interface LoopResult<T> {
  output: T | null;
  reason: "submitted" | "refused" | "limit" | "no_submit" | "invalid_submit";
  turns: ModelTurn[];
}

export interface AgentLoopInput<T> {
  role: string;
  system: string;
  userContent: ContentBlockParam[];
  tools: ToolDef[];
  submit: { name: string; description: string; schema: z.ZodType<T> };
  effort: Effort;
  maxTokens: number;
  limits: LoopLimits;
  onTurn?: (t: ModelTurn) => void;
  now?: () => number;
}

export interface CheckedLoopInput<T> extends AgentLoopInput<T> {
  /** Problems with a schema-valid output. Non-empty means "send these back and let the model fix them". */
  check?: (output: T) => string[];
  /** How many times check problems go back to the model. Default 1. */
  maxCheckRetries?: number;
}

export interface CheckedLoopResult<T> extends LoopResult<T> {
  /** Check problems of the returned output (empty when it passed or there was no check). */
  problems: string[];
  messages: MessageParam[];
}

/** The first 10 issues as `path: message`, joined, and cut to MAX_ISSUE_CHARS. */
export function formatIssues(error: z.ZodError): string {
  const text = error.issues
    .slice(0, 10)
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  return text.length > MAX_ISSUE_CHARS ? `${text.slice(0, MAX_ISSUE_CHARS)}…` : text;
}

export function truncateResult(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  try {
    const value: unknown = JSON.parse(text);
    if (Array.isArray(value)) {
      const kept = [...value];
      while (JSON.stringify(kept).length > MAX_TOOL_RESULT_CHARS && kept.length > 0) kept.pop();
      return JSON.stringify(kept);
    }
    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value);
      const kept: Record<string, unknown> = {};
      let truncated = 0;
      for (const [key, item] of entries) {
        const candidate = { ...kept, [key]: item, truncated };
        if (JSON.stringify(candidate).length <= MAX_TOOL_RESULT_CHARS - 32) kept[key] = item;
        else truncated += 1;
      }
      return JSON.stringify({ ...kept, truncated });
    }
    return JSON.stringify({ truncated: 1 });
  } catch {
    return `${text.slice(0, MAX_TOOL_RESULT_CHARS - 16)}…[truncated]`;
  }
}

function errorResult(toolUseId: string, message: string): ToolResultBlockParam {
  return { type: "tool_result", tool_use_id: toolUseId, content: message, is_error: true };
}

function isToolUse(b: ContentBlock): b is ToolUseBlock {
  return b.type === "tool_use";
}

/** Response blocks go back unchanged (thinking and fallback blocks included); the SDK's param types are narrower. */
function asParams(content: ContentBlock[]): ContentBlockParam[] {
  return content as unknown as ContentBlockParam[];
}

export async function runAgentLoop<T>(model: ModelClient, i: AgentLoopInput<T>): Promise<LoopResult<T>> {
  const r = await runCheckedAgentLoop(model, i);
  return { output: r.output, reason: r.reason, turns: r.turns };
}

export async function runCheckedAgentLoop<T>(
  model: ModelClient,
  i: CheckedLoopInput<T>,
): Promise<CheckedLoopResult<T>> {
  const now = i.now ?? Date.now;
  const started = now();
  const submitTool: ToolDef = {
    name: i.submit.name,
    description: i.submit.description,
    input: i.submit.schema,
    // R3E-3: big domain schemas would pass the strict union limit, so the submit tool isn't strict.
    // The input is validated below with the same Zod schema.
    strict: false,
    run: async () => null,
  };
  const tools = [...i.tools, submitTool];
  const byName = new Map(i.tools.map((t) => [t.name, t] as const));
  const messages: MessageParam[] = [{ role: "user", content: i.userContent }];
  const turns: ModelTurn[] = [];
  const maxCheckRetries = i.maxCheckRetries ?? 1;
  let toolCalls = 0;
  let nudged = false;
  let checkRetries = 0;
  let submitRetries = 0;
  let problems: string[] = [];

  const finish = (output: T | null, reason: LoopResult<T>["reason"]): CheckedLoopResult<T> => ({
    output,
    reason,
    turns,
    problems,
    messages,
  });
  const canCall = () => turns.length <= i.limits.maxModelRounds && now() - started < i.limits.deadlineMs;

  const runTool = async (use: ToolUseBlock): Promise<ToolResultBlockParam> => {
    const tool = byName.get(use.name);
    if (!tool) return errorResult(use.id, `Unknown tool ${use.name}.`);
    if (toolCalls >= i.limits.maxToolCalls) {
      return errorResult(use.id, `Tool limit reached. Call ${i.submit.name} now with your best answer.`);
    }
    toolCalls += 1;
    const parsed = tool.input.safeParse(use.input);
    if (!parsed.success) return errorResult(use.id, `Invalid input for ${use.name}. ${formatIssues(parsed.error)}`);
    try {
      const output = await tool.run(parsed.data);
      return { type: "tool_result", tool_use_id: use.id, content: truncateResult(JSON.stringify(output ?? null)) };
    } catch (e) {
      return errorResult(use.id, isAppError(e) ? e.message : `${use.name} failed.`);
    }
  };

  for (;;) {
    if (!canCall()) return finish(null, "limit");
    const turn = await model.turn({
      role: i.role,
      system: i.system,
      messages,
      tools,
      effort: i.effort,
      maxTokens: i.maxTokens,
    });
    turns.push(turn);
    i.onTurn?.(turn);
    if (turn.stopReason === "refusal") return finish(null, "refused");
    messages.push({ role: "assistant", content: asParams(turn.content) });
    if (turn.stopReason === "pause_turn") continue;

    const uses = turn.content.filter(isToolUse);
    if (uses.length === 0) {
      if (nudged) return finish(null, "no_submit");
      nudged = true;
      messages.push({
        role: "user",
        content: [{ type: "text", text: `Call ${i.submit.name} now with your final answer.` }],
      });
      continue;
    }

    const submitUse = uses.find((u) => u.name === i.submit.name);
    let submitFeedback = "";
    if (submitUse) {
      const parsed = i.submit.schema.safeParse(submitUse.input);
      if (parsed.success) {
        problems = i.check ? i.check(parsed.data) : [];
        if (problems.length === 0) return finish(parsed.data, "submitted");
        if (checkRetries >= maxCheckRetries || !canCall()) return finish(parsed.data, "submitted");
        checkRetries += 1;
        submitFeedback = `Fix these problems, then call ${i.submit.name} again: ${problems.join("; ")}`;
      } else {
        // One retry for a schema failure (counted apart from check retries); the second ends the turn.
        // The assistant turn is already appended; nothing earlier is edited.
        if (submitRetries >= MAX_SUBMIT_RETRIES) return finish(null, "invalid_submit");
        submitRetries += 1;
        submitFeedback = `Invalid ${i.submit.name} input. ${formatIssues(parsed.error)}`;
      }
    } else if (toolCalls >= i.limits.maxToolCalls) {
      return finish(null, "limit");
    }

    const results = await Promise.all(
      uses.map((use) =>
        use.name === i.submit.name ? Promise.resolve(errorResult(use.id, submitFeedback)) : runTool(use),
      ),
    );
    messages.push({ role: "user", content: results });
  }
}
