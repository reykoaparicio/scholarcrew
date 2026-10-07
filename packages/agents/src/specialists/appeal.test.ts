import type { ActionCard, CrewReply, OfferColumn, OfferComparison, ProgressEvent } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { wrapUntrusted } from "../context";
import { JORDAN, type ScriptedTurn, createFakePort, createScriptedModelClient } from "../testing";
import {
  NO_OFFER_TEXT,
  appealDollarProblems,
  comparisonAmounts,
  fallbackOutline,
  outlineProblems,
  runAppealOutline,
} from "./appeal";
import type { SpecialistDeps } from "./shared";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const UT_OFFER = "aaaaaaaa-0000-4000-8000-000000000001";
const RICE_OFFER = "aaaaaaaa-0000-4000-8000-000000000002";

const ut: OfferColumn = {
  offerId: UT_OFFER,
  collegeId: JORDAN.collegeId,
  collegeName: "The University of Texas at Austin",
  costOfAttendanceUsd: 31_000,
  freeMoneyUsd: 12_000,
  workStudyUsd: 2000,
  loansUsd: 5500,
  letterSaysOweUsd: 11_500,
  reallyCostsUsd: 19_000,
  fourYearUsd: 76_000,
  oneTimeFreeUsd: 0,
  warnings: [],
};
const rice: OfferColumn = {
  offerId: RICE_OFFER,
  collegeId: "227757",
  collegeName: "Rice University",
  costOfAttendanceUsd: 82_000,
  freeMoneyUsd: 70_000,
  workStudyUsd: 0,
  loansUsd: 0,
  letterSaysOweUsd: 12_000,
  reallyCostsUsd: 12_000,
  fourYearUsd: 48_000,
  oneTimeFreeUsd: 0,
  warnings: [],
};
const comparison: OfferComparison = { columns: [ut, rice], lowestFourYearOfferId: RICE_OFFER, assumptions: [] };

const CLEAN = [
  "Points to raise",
  "- Rice really costs $12,000 a year; UT really costs $19,000. Ask whether UT can review its offer.",
  "- $5,500 of the UT package is loans.",
  "Documents to gather",
  "- Both award letters and your FAFSA Submission Summary.",
  "Who to contact",
  "- The UT financial aid office. Ask how appeals work.",
  "Timeline",
  "- Call this week.",
].join("\n");

const LETTER = [
  "Dear Financial Aid Office,",
  "I am writing to ask you to reconsider my aid package because my family cannot afford the remaining cost and Rice University has offered me a much better package that I would love to be able to match at UT Austin.",
  "Sincerely,",
  "Jordan",
].join("\n");

function setup(script: ScriptedTurn[]) {
  const model = createScriptedModelClient(script);
  const progress: ProgressEvent[] = [];
  const deps: SpecialistDeps = {
    model,
    port: createFakePort({ offers: comparison }),
    now: () => NOW,
    onProgress: async (e) => {
      progress.push(e);
    },
  };
  return { model, deps, progress };
}

const reply = (o: Partial<CrewReply> = {}): CrewReply => ({
  text: CLEAN,
  contributors: ["aid", "ledger"],
  question: null,
  actionCards: [],
  receipt: [],
  safety: null,
  needsInput: false,
  ...o,
});
const submitReply = (r: CrewReply) => ({ type: "tool_use" as const, name: "submit_reply", input: r });
const planCard = (id: string): ActionCard => ({
  kind: "add_plan_item",
  id,
  label: "Gather documents",
  item: {
    title: "Gather award letters",
    kind: "aid",
    refType: null,
    refId: null,
    minutes: 20,
    valueUsd: null,
    dueOn: null,
    contributors: ["aid"],
    weekStart: null,
  },
});

const expectedReceipt = [
  {
    kind: "record" as const,
    label: "The University of Texas at Austin award letter",
    refId: `record:${UT_OFFER}`,
    sourceUrl: null,
    verifiedAt: null,
  },
  {
    kind: "catalog" as const,
    label: "The University of Texas at Austin catalog record",
    refId: `college:${JORDAN.collegeId}`,
    sourceUrl: JORDAN.collegeSourceUrl,
    verifiedAt: JORDAN.collegeVerifiedAt,
  },
];

describe("runAppealOutline", () => {
  it("returns the model's outline with contributors, safety, and receipt set in code", async () => {
    const bogus = { kind: "fact" as const, label: "Made up", refId: "fact:x", sourceUrl: null, verifiedAt: null };
    const { deps, model, progress } = setup([
      { content: [submitReply(reply({ contributors: ["compass"], receipt: [bogus], safety: "partial" }))] },
    ]);
    const out = await runAppealOutline(deps, { ownerId: JORDAN.ownerId, offerId: UT_OFFER });
    expect(out).toEqual(reply({ receipt: expectedReceipt }));
    const req = model.requests[0];
    expect(req).toMatchObject({ role: "aid", effort: "medium" });
    expect(req?.tools.map((t) => t.name)).toEqual(["get_offers", "get_costs", "get_college", "submit_reply"]);
    const blocks = req?.messages[0]?.content as Array<{ text: string }>;
    expect(blocks[0]).toEqual(
      wrapUntrusted("offer_comparison", JSON.stringify({ offer: ut, otherOffers: [rice], assumptions: [] })),
    );
    expect(blocks[1]?.text).toBe("Build an appeal outline for my offer from The University of Texas at Austin.");
    expect(progress.map((p) => p.text)).toEqual(["Aid is building your appeal outline…"]);
  });

  it("asks once to drop letter language, then falls back to an outline built from the numbers", async () => {
    const { deps, model } = setup([
      { content: [submitReply(reply({ text: LETTER }))] },
      { content: [submitReply(reply({ text: LETTER }))] },
    ]);
    const out = await runAppealOutline(deps, { ownerId: JORDAN.ownerId, offerId: UT_OFFER });
    expect(model.requests).toHaveLength(2);
    const feedback = (model.requests[1]?.messages[2]?.content as Array<{ content: string }>)[0]?.content ?? "";
    expect(feedback).toContain("remove letter language (dear, sincerely)");
    expect(feedback).toContain("line 2 has 41 words; keep each point to 35 or fewer");
    expect(out.text).toBe(fallbackOutline(ut, [ut, rice]));
    expect(out).toMatchObject({
      contributors: ["aid", "ledger"],
      safety: "partial",
      actionCards: [],
      receipt: expectedReceipt,
    });
    expect(outlineProblems(out.text)).toEqual([]);
    expect(out.text).toContain("really costs $19,000 a year");
    expect(out.text).toContain("Rice University really costs $12,000 a year");
    expect(out.text).toContain("$5,500 a year of the package is loans");
  });

  it("accepts an outline fixed after the corrective turn", async () => {
    const { deps } = setup([{ content: [submitReply(reply({ text: LETTER }))] }, { content: [submitReply(reply())] }]);
    expect(await runAppealOutline(deps, { ownerId: JORDAN.ownerId, offerId: UT_OFFER })).toMatchObject({
      text: CLEAN,
      safety: null,
    });
  });

  it("asks once to remove dollar amounts that aren't in the comparison", async () => {
    const invented = `${CLEAN}\n- Ask for $8,000 more in grants.`;
    const { deps, model } = setup([
      { content: [submitReply(reply({ text: invented }))] },
      { content: [submitReply(reply())] },
    ]);
    const out = await runAppealOutline(deps, { ownerId: JORDAN.ownerId, offerId: UT_OFFER });
    expect(model.requests).toHaveLength(2);
    const feedback = (model.requests[1]?.messages[2]?.content as Array<{ content: string }>)[0]?.content ?? "";
    expect(feedback).toContain("these dollar amounts aren't in the comparison: $8,000");
    expect(out).toMatchObject({ text: CLEAN, safety: null });
    expect(appealDollarProblems(fallbackOutline(ut, [ut, rice]), comparisonAmounts([ut, rice]))).toEqual([]);
  });

  it("keeps at most two plan cards that point at nothing else", async () => {
    const save: ActionCard = {
      kind: "save_scholarship",
      id: "save",
      label: "Save it",
      scholarshipId: JORDAN.scholarshipId,
    };
    const { deps } = setup([
      { content: [submitReply(reply({ actionCards: [planCard("a"), save, planCard("b"), planCard("c")] }))] },
    ]);
    const out = await runAppealOutline(deps, { ownerId: JORDAN.ownerId, offerId: UT_OFFER });
    expect(out.actionCards.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("falls back on a refusal", async () => {
    const { deps } = setup([{ stopReason: "refusal" }]);
    const out = await runAppealOutline(deps, { ownerId: JORDAN.ownerId, offerId: UT_OFFER });
    expect(out).toMatchObject({ text: fallbackOutline(ut, [ut, rice]), safety: "refusal" });
  });

  it("says so when the offer isn't in the comparison, without a model call", async () => {
    const { deps, model } = setup([]);
    const out = await runAppealOutline(deps, {
      ownerId: JORDAN.ownerId,
      offerId: "aaaaaaaa-0000-4000-8000-000000000099",
    });
    expect(out).toEqual({
      text: NO_OFFER_TEXT,
      contributors: ["aid"],
      question: null,
      actionCards: [],
      receipt: [],
      safety: null,
      needsInput: true,
    });
    expect(model.requests).toHaveLength(0);
  });

  it("flags letter words and lines over 35 words", () => {
    const words = (n: number) => Array.from({ length: n }, (_, k) => `w${k}`).join(" ");
    expect(outlineProblems("Respectfully yours")).toEqual([
      "remove letter language (respectfully); give an outline, not a letter",
    ]);
    expect(outlineProblems(`- ${words(35)}`)).toEqual([]);
    expect(outlineProblems(`Points\n- ${words(36)}`)).toEqual(["line 2 has 36 words; keep each point to 35 or fewer"]);
    expect(outlineProblems("Ask the dean's office")).toEqual([]);
  });
});
