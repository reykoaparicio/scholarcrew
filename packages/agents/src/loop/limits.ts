export interface LoopLimits {
  /** Model calls allowed after the first one. */
  maxModelRounds: number;
  /** Non-submit tool calls allowed across the whole loop. */
  maxToolCalls: number;
  deadlineMs: number;
}

export const COMPASS_LIMITS: LoopLimits = { maxModelRounds: 3, maxToolCalls: 8, deadlineMs: 120_000 };
export const SPECIALIST_LIMITS: LoopLimits = { maxModelRounds: 3, maxToolCalls: 6, deadlineMs: 45_000 };
export const MAX_TOOL_RESULT_CHARS = 20_000;
/** Invalid submit inputs answered with an is_error result before the loop ends with invalid_submit (R3E-3). */
export const MAX_SUBMIT_RETRIES = 1;
/** formatIssues output cap, so one bad submit can't flood the history. */
export const MAX_ISSUE_CHARS = 2_000;
