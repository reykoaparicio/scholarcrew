import type { ActionCard, CrewReply, RetakeAnalysis } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { wrapUntrusted } from "../context";
import { JORDAN, type ScriptedTurn, createFakePort, createScriptedModelClient } from "../testing";
import { retakeProblems, runRetakeExplanation, templatedExplanation } from "./retake";
import { type SpecialistDeps, dollarAmounts } from "./shared";

const NOW = new Date("2026-10-06T15:00:00.000Z");

const analysis: RetakeAnalysis = {
  test: "ACT",
  currentComposite: 29,
  targetComposite: 31,
  rows: [
    {
      collegeId: JORDAN.collegeId,
      collegeName: "The University of Texas at Austin",
      currentTierLabel: null,
      targetTierLabel: "Presidential",
      annualDeltaUsd: 4000,
      fourYearDeltaUsd: 16_000,
    },
    {
      collegeId: "227757",
      collegeName: "Rice University",
      currentTierLabel: null,
      targetTierLabel: null,
      annualDeltaUsd: 0,
      fourYearDeltaUsd: 0,
    },
  ],
  totalFourYearDeltaUsd: 16_000,
};

const CLEAN_TEXT =
  "A 31 could move you into UT Austin's Presidential tier: $4,000 a year, $16,000 over four years. Rice doesn't change. Confirm the tier rules on UT's site.";

const RECEIPT = [
  {
    kind: "calculation" as const,
    label: "ACT retake value from college merit tiers",
    refId: "calc:retake",
    sourceUrl: null,
    verifiedAt: null,
  },
];

function setup(script: ScriptedTurn[]) {
  const model = createScriptedModelClient(script);
  const port = createFakePort();
  const deps: SpecialistDeps = { model, port, now: () => NOW };
  return { model, port, deps };
}

const study = (id: string): ActionCard => ({
  kind: "add_plan_item",
  id,
  label: "Add study session",
  item: {
    title: "ACT math practice set",
    kind: "test_prep",
    refType: null,
    refId: null,
    minutes: 45,
    valueUsd: null,
    dueOn: null,
    contributors: ["prep"],
    weekStart: null,
  },
});
const badCard: ActionCard = {
  kind: "add_plan_item",
  id: "bad",
  label: "Apply",
  item: {
    title: "Apply to UT",
    kind: "application",
    refType: null,
    refId: null,
    minutes: 60,
    valueUsd: 16_000,
    dueOn: null,
    contributors: ["prep"],
    weekStart: null,
  },
};

const reply = (o: Partial<CrewReply> = {}): CrewReply => ({
  text: CLEAN_TEXT,
  contributors: ["prep"],
  question: null,
  actionCards: [],
  receipt: [],
  safety: null,
  needsInput: false,
  ...o,
});
const submitReply = (r: CrewReply) => ({ type: "tool_use" as const, name: "submit_reply", input: r });
const input = { ownerId: JORDAN.ownerId, analysis };

describe("runRetakeExplanation", () => {
  it("keeps a clean explanation and up to 3 study cards, with contributors and receipt set in code", async () => {
    const cards = [study("s1"), study("s2"), study("s3")];
    const { deps, model, port } = setup([
      { content: [submitReply(reply({ contributors: ["compass"], actionCards: cards }))] },
    ]);
    const out = await runRetakeExplanation(deps, input);
    expect(out).toEqual(reply({ actionCards: cards, receipt: RECEIPT }));
    const req = model.requests[0];
    expect(req).toMatchObject({ role: "prep", effort: "medium" });
    expect(req?.tools.map((t) => t.name)).toEqual(["get_test_scores", "submit_reply"]);
    const blocks = req?.messages[0]?.content as Array<{ text: string }>;
    expect(blocks[0]?.text).toContain('<untrusted label="student_context">');
    expect(blocks[1]).toEqual(wrapUntrusted("retake_analysis", JSON.stringify(analysis)));
    expect(blocks[2]?.text).toBe("Explain what raising my ACT to 31 is worth, and suggest up to 3 study sessions.");
    expect(port.calls[0]).toBe("snapshot:my_crew:crew");
  });

  it("asks once to fix dollar amounts that aren't in the analysis", async () => {
    const { deps, model } = setup([
      { content: [submitReply(reply({ text: "A 31 is worth about $5,000 a year at UT." }))] },
      { content: [submitReply(reply())] },
    ]);
    const out = await runRetakeExplanation(deps, input);
    const feedback = (model.requests[1]?.messages[2]?.content as Array<{ content: string }>)[0]?.content ?? "";
    expect(feedback).toContain("these dollar amounts aren't in the analysis: $5,000");
    expect(out).toMatchObject({ text: CLEAN_TEXT, safety: null });
  });

  it("falls back to a templated explanation after a second miss, keeping valid study cards", async () => {
    const bad = reply({ text: "Worth $20,000!", actionCards: [study("s1"), badCard] });
    const { deps } = setup([{ content: [submitReply(bad)] }, { content: [submitReply(bad)] }]);
    const out = await runRetakeExplanation(deps, input);
    expect(out).toEqual({
      text: templatedExplanation(analysis),
      contributors: ["prep"],
      question: null,
      actionCards: [study("s1")],
      receipt: RECEIPT,
      safety: "partial",
      needsInput: false,
    });
    expect(retakeProblems(out, analysis)).toEqual([]);
    expect(out.text).toContain("could add $16,000 in merit aid over four years");
    expect(out.text).toContain(
      "The biggest change is at The University of Texas at Austin: $16,000 over four years (Presidential).",
    );
  });

  it("falls back on a refusal", async () => {
    const { deps } = setup([{ stopReason: "refusal" }]);
    expect(await runRetakeExplanation(deps, input)).toMatchObject({
      text: templatedExplanation(analysis),
      safety: "refusal",
      actionCards: [],
    });
  });

  it("flags long text, too many cards, and cards that aren't study sessions", () => {
    const long = Array.from({ length: 121 }, (_, k) => `w${k}`).join(" ");
    expect(retakeProblems(reply({ text: long }), analysis)).toEqual([
      "the text has 121 words; keep it to 120 or fewer",
    ]);
    const four = [study("a"), study("b"), study("c"), study("d")];
    expect(retakeProblems(reply({ actionCards: four }), analysis)).toEqual(["use at most 3 study session cards"]);
    expect(retakeProblems(reply({ actionCards: [badCard] }), analysis)).toEqual([
      'card "bad" must be a test_prep study session with refType, refId, and valueUsd null',
    ]);
  });

  it("parses dollar amounts, including commas, cents, and k", () => {
    expect(dollarAmounts("Save $4,000 a year, $16k total, or $ 1,250.00. Not 500.")).toEqual([4000, 16_000, 1250]);
    expect(dollarAmounts("No money here.")).toEqual([]);
  });

  it("explains a zero result without inventing money", () => {
    const zero: RetakeAnalysis = {
      ...analysis,
      currentComposite: null,
      rows: analysis.rows.map((r) => ({ ...r, targetTierLabel: null, annualDeltaUsd: 0, fourYearDeltaUsd: 0 })),
      totalFourYearDeltaUsd: 0,
    };
    const text = templatedExplanation(zero);
    expect(text).toContain("Reaching 31 on the ACT doesn't unlock a higher merit tier at any college on your list");
    expect(dollarAmounts(text)).toEqual([]);
  });
});
