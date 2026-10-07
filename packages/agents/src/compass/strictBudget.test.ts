import type { CrewRequestInput } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import type { AgentDeps, ConsultFn } from "../context/port";
import { buildTurnParams } from "../model/client";
import { STRICT_UNION_LIMIT, countStrictUnions } from "../model/schema";
import type { ModelRequest } from "../model/types";
import { JORDAN, createFakePort } from "../testing/fakePort";
import { createScriptedModelClient } from "../testing/scripted";
import { QUILL_FEEDBACK_ONLY_TEXT, runCrewRequest } from "./crew";
import { runWeeklyPlan } from "./weekly";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const consult: ConsultFn = async ({ role }) => ({
  role,
  summary: "",
  proposedActions: [],
  factsUsed: [],
  uncertainty: [],
  needsPermission: [],
});

const crewInput: CrewRequestInput = {
  jobId: "99999999-9999-4999-8999-999999999999",
  ownerId: JORDAN.ownerId,
  conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  room: "my_crew",
  roomRef: null,
  audience: "crew",
  requester: { role: "student", firstName: "Jordan" },
  userText: "What should I do this weekend?",
  history: [],
  mentions: [],
};

/** The first request a runner sends, from a scripted model that refuses at once. */
async function firstRequest(run: (deps: AgentDeps) => Promise<unknown>): Promise<ModelRequest> {
  const model = createScriptedModelClient([{ stopReason: "refusal" }]);
  await run({ model, port: createFakePort(), consult, now: () => NOW });
  const req = model.requests[0];
  if (!req) throw new Error("the runner sent no request");
  return req;
}

describe("strict schema budget", () => {
  it("keeps the crew request within the union limit, with submit_reply sent without strict", async () => {
    const req = await firstRequest((deps) => runCrewRequest(deps, crewInput));
    expect(req.tools.filter((t) => t.name.startsWith("consult_"))).toHaveLength(7);
    const params = buildTurnParams(req);
    expect(countStrictUnions(params)).toBeLessThanOrEqual(STRICT_UNION_LIMIT);
    const submit = params.tools?.find((t) => ("name" in t ? t.name : undefined) === "submit_reply");
    expect(submit).toBeDefined();
    expect(submit && "strict" in submit).toBe(false);
    expect(params.tools?.filter((t) => "strict" in t && t.strict === true)).toHaveLength(req.tools.length - 1);
  });

  it("keeps the weekly plan request within the union limit, with submit_plan sent without strict", async () => {
    const req = await firstRequest((deps) => runWeeklyPlan(deps, { ownerId: JORDAN.ownerId, weekStart: "2026-10-12" }));
    const params = buildTurnParams(req);
    expect(countStrictUnions(params)).toBeLessThanOrEqual(STRICT_UNION_LIMIT);
    const submit = params.tools?.find((t) => ("name" in t ? t.name : undefined) === "submit_plan");
    expect(submit).toBeDefined();
    expect(submit && "strict" in submit).toBe(false);
  });
});
