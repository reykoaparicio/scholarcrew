import type { ModelClient } from "@scholarcrew/agents";
import type { CapturedRequest, RecordingModelClient } from "./types";

/**
 * Wraps any ModelClient and keeps a text snapshot of every request (gap G7: plan 09 has no raw-params hook).
 * Snapshots are taken before the call, because the agent loop appends to the same messages array afterwards.
 */
export function createRecordingModelClient(inner: ModelClient): RecordingModelClient {
  const captured: CapturedRequest[] = [];
  const extract: ModelClient["extract"] = (req) => {
    captured.push({ kind: "extract", role: req.role, text: [req.system, JSON.stringify(req.content)].join("\n") });
    return inner.extract(req);
  };
  return {
    captured,
    calls: () => captured.length,
    reset: () => {
      captured.length = 0;
    },
    turn: (req) => {
      const tools = req.tools.map((t) => ({ name: t.name, description: t.description }));
      captured.push({
        kind: "turn",
        role: req.role,
        text: [req.system, JSON.stringify(req.messages), JSON.stringify(tools)].join("\n"),
      });
      return inner.turn(req);
    },
    extract,
  };
}
