import { costMicros } from "../model/cost";
import {
  type ContentBlock,
  type ExtractRequest,
  type ExtractResult,
  MODEL_ID,
  type ModelClient,
  type ModelRequest,
  type ModelUsage,
  type TextBlock,
  type ToolUseBlock,
} from "../model/types";

export type ScriptedBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown; id?: string };

/** One scripted model answer. `stopReason` defaults to "tool_use" when there's a tool_use block, else "end_turn". */
export interface ScriptedTurn {
  content?: ScriptedBlock[];
  stopReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
  /** Raw value an extract() call returns; it's validated against the request schema like the real client does. */
  extract?: unknown;
}

export type ScriptedModelClient = ModelClient & {
  requests: ModelRequest[];
  extractRequests: ExtractRequest<unknown>[];
};

export function createScriptedModelClient(
  script: ScriptedTurn[] | ((req: ModelRequest) => ScriptedTurn),
): ScriptedModelClient {
  const queue = Array.isArray(script) ? [...script] : [];
  const requests: ModelRequest[] = [];
  const extractRequests: ExtractRequest<unknown>[] = [];
  let toolIds = 0;

  const pick = (req: ModelRequest): ScriptedTurn => {
    if (!Array.isArray(script)) return script(req);
    const next = queue.shift();
    if (!next) throw new Error("Scripted model client ran out of turns");
    return next;
  };

  const toBlock = (b: ScriptedBlock): ContentBlock => {
    if (b.type === "text") return { type: "text", text: b.text, citations: null } as TextBlock;
    toolIds += 1;
    return { type: "tool_use", id: b.id ?? `toolu_${toolIds}`, name: b.name, input: b.input } as ToolUseBlock;
  };

  const usageFor = (t: ScriptedTurn): ModelUsage => {
    const base = {
      inputTokens: t.usage?.inputTokens ?? 100,
      outputTokens: t.usage?.outputTokens ?? 50,
      cacheReadTokens: t.usage?.cacheReadTokens ?? 0,
      cacheWriteTokens: t.usage?.cacheWriteTokens ?? 0,
    };
    return { ...base, costMicros: costMicros(base) };
  };

  return {
    requests,
    extractRequests,
    async turn(req) {
      const recorded: ModelRequest = { ...req, messages: structuredClone(req.messages) };
      requests.push(recorded);
      const t = pick(recorded);
      const content = (t.content ?? []).map(toBlock);
      const stopReason = t.stopReason ?? (content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn");
      return { content, stopReason, usage: usageFor(t), model: MODEL_ID, durationMs: 0 };
    },
    async extract<T>(req: ExtractRequest<T>): Promise<ExtractResult<T>> {
      extractRequests.push(req as ExtractRequest<unknown>);
      const t = pick({
        role: req.role,
        system: req.system,
        messages: [{ role: "user", content: req.content }],
        tools: [],
        effort: req.effort,
        maxTokens: req.maxTokens,
      });
      const usage = usageFor(t);
      if (t.stopReason === "refusal") return { value: null, refused: true, usage };
      const parsed = req.schema.safeParse(t.extract);
      return { value: parsed.success ? parsed.data : null, refused: false, usage };
    },
  };
}
