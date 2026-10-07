export { errorLabel } from "@scholarcrew/core/shared";

export type LogLevel = "info" | "warn" | "error";

/** JSON lines (00-overview §3). Callers never pass tokens, essay text, sensitive facts, or document bytes. */
export function log(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, msg, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}
