import type { CrewReply, PlanItemInput } from "@scholarcrew/domain";
import { describe, expect, it, vi } from "vitest";
import type { AgentDeps, ConsultFn } from "../context/port";
import { JORDAN, createFakePort } from "../testing/fakePort";
import { type ScriptedTurn, createScriptedModelClient } from "../testing/scripted";
import { REFUSAL_TEXT } from "./replies";
import { MAX_PLAN_ITEMS, runWeeklyPlan } from "./weekly";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const WEEK = "2026-10-12";
const UNKNOWN = "55555555-5555-4555-8555-555555555599";

function setup(script: ScriptedTurn[] | (() => ScriptedTurn)) {
  const model = createScriptedModelClient(script);
  const port = createFakePort();
  const consult: ConsultFn = async ({ role }) => ({
    role,
    summary: "",
    proposedActions: [],
    factsUsed: [],
    uncertainty: [],
    needsPermission: [],
  });
  const deps: AgentDeps = { model, port, consult: vi.fn(consult), now: () => NOW };
  return { model, port, deps };
}

const planItem = (title: string, o: Partial<PlanItemInput> = {}): PlanItemInput => ({
  title,
  kind: "custom",
  refType: null,
  refId: null,
  minutes: 30,
  valueUsd: null,
  dueOn: null,
  contributors: ["compass"],
  weekStart: null,
  ...o,
});

const reply: CrewReply = {
  text: "Three things this week, essay first.",
  contributors: ["compass"],
  question: null,
  actionCards: [],
  receipt: [],
  safety: null,
  needsInput: false,
};

const submitPlan = (items: PlanItemInput[]) => ({
  type: "tool_use" as const,
  name: "submit_plan",
  input: { items, reply },
});

describe("runWeeklyPlan", () => {
  it("returns de-duplicated items pinned to the requested week and a guarded reply", async () => {
    const essay = planItem("Outline the Hill Country STEM essay", {
      kind: "scholarship",
      refType: "scholarship",
      refId: JORDAN.scholarshipId,
      weekStart: "2026-09-28",
    });
    const { deps, model, port } = setup([
      {
        content: [
          submitPlan([
            essay,
            { ...essay, title: " outline the hill country STEM essay " },
            planItem("Ask Ms. Ruiz for a recommendation"),
          ]),
        ],
      },
    ]);
    const result = await runWeeklyPlan(deps, { ownerId: JORDAN.ownerId, weekStart: WEEK });
    expect(result.items).toHaveLength(2);
    expect(result.items.every((i) => i.weekStart === WEEK)).toBe(true);
    expect(result.items[0]?.refId).toBe(JORDAN.scholarshipId);
    expect(result.reply).toMatchObject({ contributors: ["compass"], safety: null });
    expect(port.calls[0]).toBe("snapshot:my_crew:crew");
    const req = model.requests[0];
    expect(req?.effort).toBe("medium");
    expect(req?.tools.at(-1)?.name).toBe("submit_plan");
    const blocks = req?.messages[0]?.content as Array<{ text: string }>;
    expect(blocks.at(-1)?.text).toContain(`Plan my week starting ${WEEK}.`);
  });

  it("rejects more than 8 items, then accepts a valid plan", async () => {
    const nine = Array.from({ length: MAX_PLAN_ITEMS + 1 }, (_, k) => planItem(`Task ${k}`));
    const { deps, model } = setup([{ content: [submitPlan(nine)] }, { content: [submitPlan(nine.slice(0, 2))] }]);
    const result = await runWeeklyPlan(deps, { ownerId: JORDAN.ownerId, weekStart: WEEK });
    expect(result.items.map((i) => i.title)).toEqual(["Task 0", "Task 1"]);
    const first = model.requests[1]?.messages[2]?.content as Array<{ is_error?: boolean; content: string }>;
    expect(first[0]).toMatchObject({ is_error: true, content: expect.stringContaining("items") });
  });

  it("drops items that still point at unknown records after one retry", async () => {
    const bad = planItem("Apply to a mystery award", { kind: "scholarship", refType: "scholarship", refId: UNKNOWN });
    const good = planItem("Log Saturday's tutoring hours", { kind: "service" });
    const { deps, model } = setup([{ content: [submitPlan([bad, good])] }, { content: [submitPlan([bad, good])] }]);
    const result = await runWeeklyPlan(deps, { ownerId: JORDAN.ownerId, weekStart: WEEK });
    expect(model.requests).toHaveLength(2);
    expect(result.items.map((i) => i.title)).toEqual(["Log Saturday's tutoring hours"]);
    expect(result.reply?.safety).toBeNull();
  });

  it("returns no items on a refusal, and no reply when it runs out of rounds or submits two invalid plans", async () => {
    const refused = await runWeeklyPlan(setup([{ stopReason: "refusal" }]).deps, {
      ownerId: JORDAN.ownerId,
      weekStart: WEEK,
    });
    expect(refused.items).toEqual([]);
    expect(refused.reply).toMatchObject({ text: REFUSAL_TEXT, safety: "refusal" });
    const looping = setup(() => ({
      content: [{ type: "tool_use", name: "days_until", input: { date: "2026-10-15" } }],
    }));
    expect(await runWeeklyPlan(looping.deps, { ownerId: JORDAN.ownerId, weekStart: WEEK })).toEqual({
      items: [],
      reply: null,
    });
    expect(looping.model.requests).toHaveLength(4);
    const nine = Array.from({ length: MAX_PLAN_ITEMS + 1 }, (_, k) => planItem(`Task ${k}`));
    const invalid = setup([{ content: [submitPlan(nine)] }, { content: [submitPlan(nine)] }]);
    expect(await runWeeklyPlan(invalid.deps, { ownerId: JORDAN.ownerId, weekStart: WEEK })).toEqual({
      items: [],
      reply: null,
    });
    expect(invalid.model.requests).toHaveLength(2);
  });
});
