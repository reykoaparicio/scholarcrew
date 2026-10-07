import type Anthropic from "@anthropic-ai/sdk";
import type { Effort } from "@scholarcrew/domain";
import type { z } from "zod";

export const MODEL_ID = "claude-opus-5-5";

export type ContentBlock = Anthropic.Beta.BetaContentBlock;
export type TextBlock = Anthropic.Beta.BetaTextBlock;
export type ToolUseBlock = Anthropic.Beta.BetaToolUseBlock;
export type ContentBlockParam = Anthropic.Beta.BetaContentBlockParam;
export type TextBlockParam = Anthropic.Beta.BetaTextBlockParam;
export type ToolResultBlockParam = Anthropic.Beta.BetaToolResultBlockParam;
export type MessageParam = Anthropic.Beta.BetaMessageParam;
/** Beta create params plus the server-side fallbacks field. client.ts builds them; schema.ts counts their unions. */
export type MessageCreateParams = Omit<Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, "fallbacks"> & {
  fallbacks: "default";
};

/** A client-side tool. `input` is validated before `run` is called; its strict JSON schema is what the model sees. */
export interface ToolDef<I = unknown> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  /** Default true. False sends the tool without `strict` (submit tools, R3E-3); Zod still validates the input. */
  strict?: boolean;
  run(input: I): Promise<unknown>;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
}

export interface ModelTurn {
  content: Anthropic.Beta.BetaContentBlock[];
  stopReason: string;
  usage: ModelUsage;
  model: string;
  durationMs: number;
}

export interface ModelRequest {
  role: string;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: ToolDef[];
  effort: Effort;
  maxTokens: number;
}

export interface ExtractRequest<T> {
  role: string;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: z.ZodType<T>;
  effort: Effort;
  maxTokens: number;
}

export interface ExtractResult<T> {
  value: T | null;
  refused: boolean;
  usage: ModelUsage;
}

export interface ModelClient {
  turn(req: ModelRequest): Promise<ModelTurn>;
  extract<T>(req: ExtractRequest<T>): Promise<ExtractResult<T>>;
}
