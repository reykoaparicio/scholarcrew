import type { CrewReply, CrewRequestInput, SpecialistResult } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { runCrewRequest } from "../compass";
import type { ModelRequest } from "../model/types";
import { JORDAN, type ScriptedTurn, createFakePort, createScriptedModelClient } from "../testing";
import * as specialists from "./index";
import type { SpecialistDeps } from "./shared";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const S1 = JORDAN.scholarshipId;

function setup(script: (req: ModelRequest) => ScriptedTurn) {
  const model = createScriptedModelClient(script);
  const port = createFakePort();
  const progress: string[] = [];
  const usage: string[] = [];
  const base: SpecialistDeps = {
    model,
    port,
    now: () => NOW,
    onProgress: async (e) => {
      progress.push(e.text);
    },
    onUsage: async (role) => {
      usage.push(role);
    },
  };
  return { model, port, progress, usage, deps: { ...base, consult: specialists.makeConsult(base) } };
}

const request = (o: Partial<CrewRequestInput> = {}): CrewRequestInput => ({
  jobId: "99999999-9999-4999-8999-999999999999",
  ownerId: JORDAN.ownerId,
  conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  room: "my_crew",
  roomRef: null,
  audience: "crew",
  requester: { role: "student", firstName: "Jordan" },
  userText: "@Scout what should I work on this weekend?",
  history: [],
  mentions: ["scout"],
  ...o,
});

const tool = (name: string, input: unknown) => ({ content: [{ type: "tool_use" as const, name, input }] });

describe("@scholarcrew/agents/specialists", () => {
  it("exports exactly the §9.5 plan 10 surface", () => {
    expect(Object.keys(specialists).sort()).toEqual([
      "SPECIALISTS",
      "consultSpecialist",
      "makeConsult",
      "runAppealOutline",
      "runEssayReview",
      "runOfferParse",
      "runRetakeExplanation",
    ]);
  });

  it("runs Compass, consults Scout for real through makeConsult, and keeps Scout's catalog source", async () => {
    const catalogItem = {
      kind: "catalog" as const,
      label: "Hill Country STEM Award listing",
      refId: `scholarship:${S1}`,
      sourceUrl: JORDAN.scholarshipSourceUrl,
      verifiedAt: JORDAN.scholarshipVerifiedAt,
    };
    const compassReply: CrewReply = {
      text: "Start the Hill Country STEM Award essay this weekend.",
      contributors: ["compass", "scout"],
      question: null,
      actionCards: [],
      receipt: [catalogItem],
      safety: null,
      needsInput: false,
    };
    const scoutResult: SpecialistResult = {
      role: "scout",
      summary: "Hill Country STEM Award fits: Travis County, due Oct 15.",
      proposedActions: [],
      factsUsed: [
        {
          claim: "Due Oct 15",
          source: "catalog",
          refId: `scholarship:${S1}`,
          verifiedAt: JORDAN.scholarshipVerifiedAt,
        },
      ],
      uncertainty: [],
      needsPermission: [],
    };
    const { deps, model, port, progress, usage } = setup((req) => {
      const firstCall = req.messages.length === 1;
      if (req.role === "compass") {
        return firstCall
          ? tool("consult_scout", { question: "Which scholarship should Jordan start this weekend?" })
          : tool("submit_reply", compassReply);
      }
      if (req.role === "scout") return firstCall ? tool("get_matches", {}) : tool("submit_result", scoutResult);
      throw new Error(`unexpected role ${req.role}`);
    });

    const result = await runCrewRequest(deps, request());

    expect(result).toMatchObject({ status: "ready", safety: null, consulted: ["scout"] });
    expect(result.reply.contributors).toEqual(["compass", "scout"]);
    expect(result.reply.receipt).toEqual([catalogItem]);
    expect(model.requests.map((r) => r.role)).toEqual(["compass", "scout", "scout", "compass"]);
    expect(model.requests[1]?.system).toBe(specialists.SPECIALISTS.scout.system);
    expect(model.requests[1]?.tools.map((t) => t.name)).toEqual([
      "get_matches",
      "search_scholarships",
      "get_scholarship",
      "get_deadlines",
      "submit_result",
    ]);
    const toCompass = (model.requests[3]?.messages[2]?.content as Array<{ content: string }>)[0]?.content ?? "{}";
    expect(JSON.parse(toCompass)).toMatchObject({ role: "scout", summary: scoutResult.summary });
    expect(progress).toEqual(["Compass is reading your request.", "Asking Scout…", "Scout is checking…"]);
    expect(usage).toEqual(["compass", "scout", "scout", "compass"]);
    expect(port.calls).toEqual(["snapshot:my_crew:crew", "matches:crew", `scholarship:${S1}`]);
  });

  it("runs Quill without essay or story tools in the family room", async () => {
    const quillResult: SpecialistResult = {
      role: "quill",
      summary: "Essays aren't shared with family. Ask Jordan how the draft is going?",
      proposedActions: [],
      factsUsed: [],
      uncertainty: [],
      needsPermission: [],
    };
    const familyReply: CrewReply = {
      text: "Jordan's essays aren't shared here. You could ask how the draft is going.",
      contributors: ["compass", "quill"],
      question: null,
      actionCards: [],
      receipt: [],
      safety: null,
      needsInput: false,
    };
    const { deps, model, port } = setup((req) => {
      const firstCall = req.messages.length === 1;
      if (req.role === "compass")
        return firstCall
          ? tool("consult_quill", { question: "How is the essay going?" })
          : tool("submit_reply", familyReply);
      if (req.role === "quill") return tool("submit_result", quillResult);
      throw new Error(`unexpected role ${req.role}`);
    });

    const result = await runCrewRequest(
      deps,
      request({ room: "family", audience: "family", userText: "How is the essay going?", mentions: [] }),
    );

    expect(result).toMatchObject({ status: "ready", safety: null, consulted: ["quill"] });
    expect(result.reply.text).toBe(familyReply.text);
    expect(model.requests[1]?.role).toBe("quill");
    expect(model.requests[1]?.tools.map((t) => t.name)).toEqual(["count_words", "submit_result"]);
    expect(port.calls).toEqual(["snapshot:family:family", "stories"]);
  });
});
