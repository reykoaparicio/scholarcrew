import { type ModelClient, runCrewRequest, runWeeklyPlan } from "@scholarcrew/agents";
import {
  consultSpecialist,
  makeConsult,
  runAppealOutline,
  runEssayReview,
  runOfferParse,
  runRetakeExplanation,
} from "@scholarcrew/agents/specialists";
import { JORDAN, createFakePort, jordanData } from "@scholarcrew/agents/testing";
import {
  CrewReply,
  type CrewRequestInput,
  type Deadline,
  type OfferColumn,
  ParsedOffer,
  PlanItemInput,
  QuillCommentDraft,
  SpecialistResult,
} from "@scholarcrew/domain";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DEMO_OFFER, NO_DEADLINES_TEXT, createDemoModelClient } from "./demo-model";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
const CONVERSATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02";
const OFFER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03";

function setup(port = createFakePort(), model: ModelClient = createDemoModelClient()) {
  const base = { model, port, now: () => NOW };
  return { base, deps: { ...base, consult: makeConsult(base) } };
}

/** The demo model with its first `n` submit inputs replaced by `{}`, which fails every submit schema (R3E-3). */
function breakSubmits(n: number): ModelClient {
  const demo = createDemoModelClient();
  let left = n;
  return {
    ...demo,
    async turn(req) {
      const t = await demo.turn(req);
      const content = t.content.map((b) => {
        if (b.type !== "tool_use" || !b.name.startsWith("submit_") || left === 0) return b;
        left -= 1;
        return { ...b, input: {} };
      });
      return { ...t, content };
    },
  };
}

const input = (o: Partial<CrewRequestInput> = {}): CrewRequestInput => ({
  jobId: JOB_ID,
  ownerId: JORDAN.ownerId,
  conversationId: CONVERSATION_ID,
  room: "my_crew",
  roomRef: null,
  audience: "crew",
  requester: { role: "student", firstName: "Jordan" },
  userText: "What should I do first?",
  history: [],
  mentions: [],
  ...o,
});

const UT_EA: Deadline = {
  kind: "application",
  title: "UT Austin · Early Action",
  dueOn: "2026-11-01",
  daysLeft: 26,
  refType: "college_list",
  refId: JORDAN.collegeEntryId,
  valueUsd: null,
  warning: false,
};

const STATE_U: OfferColumn = {
  offerId: OFFER_ID,
  collegeId: JORDAN.collegeId,
  collegeName: "State U",
  costOfAttendanceUsd: 27_800,
  freeMoneyUsd: 18_600,
  workStudyUsd: 2_000,
  loansUsd: 5_500,
  letterSaysOweUsd: 1_700,
  reallyCostsUsd: 9_200,
  fourYearUsd: 36_800,
  oneTimeFreeUsd: 0,
  warnings: [],
};

describe("demo model: Compass", () => {
  it("names the nearest deadline and offers one plan card", async () => {
    const { deps } = setup();
    const result = await runCrewRequest(deps, input());
    expect(result.status).toBe("ready");
    expect(CrewReply.safeParse(result.reply).success).toBe(true);
    expect(result.reply).toMatchObject({ contributors: ["compass"], safety: null, needsInput: false });
    expect(result.reply.text).toContain("Hill Country STEM Award on Oct 15 (9 days left)");
    expect(result.reply.actionCards).toEqual([
      {
        kind: "add_plan_item",
        id: "next-deadline",
        label: "Add to this week",
        item: {
          title: "Work on Hill Country STEM Award",
          kind: "scholarship",
          refType: "scholarship",
          refId: JORDAN.scholarshipId,
          minutes: 30,
          valueUsd: 1000,
          dueOn: "2026-10-15",
          contributors: ["compass"],
          weekStart: null,
        },
      },
    ]);
  });

  it("summarizes the next two deadlines in date order", async () => {
    const data = jordanData();
    const port = createFakePort({ snapshot: { ...data.snapshot, deadlines: [UT_EA, ...data.deadlines] } });
    const result = await runCrewRequest(setup(port).deps, input());
    expect(result.reply.text).toBe(
      "Your next two deadlines are Hill Country STEM Award on Oct 15 (9 days left) and UT Austin · Early Action on Nov 1 (26 days left). Start with Hill Country STEM Award.",
    );
    expect(result.reply.actionCards).toHaveLength(1);
  });

  it("says so when there are no deadlines", async () => {
    const data = jordanData();
    const port = createFakePort({ snapshot: { ...data.snapshot, deadlines: [] } });
    const result = await runCrewRequest(setup(port).deps, input({ audience: "family", room: "family" }));
    expect(result.reply).toMatchObject({ text: NO_DEADLINES_TEXT, actionCards: [], safety: null });
  });

  it("answers the retry after one invalid submit_reply (R3E-3)", async () => {
    const result = await runCrewRequest(setup(createFakePort(), breakSubmits(1)).deps, input());
    expect(result).toMatchObject({ status: "ready", safety: null });
    expect(result.reply.text).toContain("Hill Country STEM Award on Oct 15 (9 days left)");
    expect(result.reply.actionCards).toHaveLength(1);
  });

  it("fails the request safely after two invalid submit_reply inputs (R3E-3)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const result = await runCrewRequest(setup(createFakePort(), breakSubmits(2)).deps, input());
    expect(result).toMatchObject({ status: "failed", safety: "partial", consulted: [] });
    // 09's OUT_OF_TIME_TEXT; 12 completes the job as failed and doesn't count the request (L6).
    expect(result.reply).toMatchObject({
      text: "I ran out of time on that one. Want me to try a narrower question?",
      actionCards: [],
      needsInput: true,
    });
    expect(CrewReply.safeParse(result.reply).success).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"msg":"crew.invalid_submit"'));
    log.mockRestore();
  });
});

describe("demo model: weekly plan and specialists", () => {
  it("plans 2 items from deadlines, padded with a filler", async () => {
    const result = await runWeeklyPlan(setup().deps, { ownerId: JORDAN.ownerId, weekStart: "2026-10-12" });
    expect(result.items.map((i) => i.title)).toEqual([
      "Work on Hill Country STEM Award",
      "Spend 20 minutes on your Story Bank",
    ]);
    for (const item of result.items) expect(PlanItemInput.safeParse(item).success).toBe(true);
    expect(result.items.every((i) => i.weekStart === "2026-10-12")).toBe(true);
    expect(result.reply?.text).toBe("Here's your week: 2 steps, nearest deadline first.");
  });

  it("returns a valid one-line specialist result", async () => {
    const out = await consultSpecialist(setup().base, {
      role: "atlas",
      question: "Which application is due first?",
      ownerId: JORDAN.ownerId,
      audience: "crew",
      context: jordanData().snapshot,
    });
    expect(SpecialistResult.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ role: "atlas", summary: "Atlas checked your records and has nothing urgent to add." });
  });
});

describe("demo model: job runs", () => {
  it("leaves one Quill question quoting the draft's first sentence", async () => {
    const essay = jordanData().essays[0];
    if (!essay) throw new Error("Expected essay fixture");
    const { comments, refused } = await runEssayReview(setup().base, {
      ownerId: JORDAN.ownerId,
      essayId: JORDAN.essayId,
      version: essay.currentVersion,
      body: essay.body,
      context: essay,
    });
    expect(refused).toBe(false);
    expect(comments).toHaveLength(1);
    expect(QuillCommentDraft.safeParse(comments[0]).success).toBe(true);
    expect(comments[0]).toMatchObject({
      quote: "When our robot died at regionals, I learned that a team can rebuild faster than it can blame.",
      occurrence: 1,
      kind: "question",
    });
  });

  it("parses the fixed State U sample letter", async () => {
    const result = await runOfferParse(setup().base, {
      ownerId: JORDAN.ownerId,
      pdfBase64: Buffer.from("%PDF-1.4 demo").toString("base64"),
      collegeName: "State U",
    });
    expect(result).toEqual({ parsed: DEMO_OFFER, refused: false });
    expect(ParsedOffer.safeParse(DEMO_OFFER).success).toBe(true);
    const free = DEMO_OFFER.lines.filter((l) => l.category === "grant" || l.category === "scholarship");
    expect(free.reduce((sum, l) => sum + l.amountUsd, 0)).toBe(18_600);
  });

  it("writes a safe appeal outline and retake explanation", async () => {
    const port = createFakePort({ offers: { columns: [STATE_U], lowestFourYearOfferId: OFFER_ID, assumptions: [] } });
    const appeal = await runAppealOutline(setup(port).base, { ownerId: JORDAN.ownerId, offerId: OFFER_ID });
    expect(appeal.safety).toBeNull();
    expect(appeal.text).toContain("Points to raise");
    const retake = await runRetakeExplanation(setup().base, {
      ownerId: JORDAN.ownerId,
      analysis: { test: "ACT", currentComposite: 29, targetComposite: 31, rows: [], totalFourYearDeltaUsd: 0 },
    });
    expect(retake).toMatchObject({ contributors: ["prep"], safety: null });
    expect(CrewReply.safeParse(retake).success).toBe(true);
  });

  it("returns no value for extraction roles other than Aid", async () => {
    const model = createDemoModelClient();
    const res = await model.extract({
      role: "catalog",
      system: "S",
      content: [],
      schema: z.strictObject({ n: z.number() }),
      effort: "low",
      maxTokens: 100,
    });
    expect(res).toMatchObject({ value: null, refused: false });
  });
});
