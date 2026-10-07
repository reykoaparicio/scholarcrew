import type { ProgressEvent, QuillCommentDraft } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { wrapUntrusted } from "../context";
import { JORDAN, type ScriptedTurn, createFakePort, createScriptedModelClient, jordanData } from "../testing";
import { commentProblems, quoteOccurs, runEssayReview } from "./essayReview";
import type { SpecialistDeps } from "./shared";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const BODY = "When our robot died at regionals, I learned that a team can rebuild faster than it can blame.";
const words = (prefix: string, n: number) => Array.from({ length: n }, (_, k) => `${prefix}${k}`).join(" ");

function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("empty fixture");
  return item;
}

function setup(script: ScriptedTurn[], port = createFakePort()) {
  const model = createScriptedModelClient(script);
  const progress: ProgressEvent[] = [];
  const usage: string[] = [];
  const deps: SpecialistDeps = {
    model,
    port,
    now: () => NOW,
    onProgress: async (e) => {
      progress.push(e);
    },
    onUsage: async (role) => {
      usage.push(role);
    },
  };
  return { model, deps, progress, usage };
}

const submitComments = (comments: QuillCommentDraft[]) => ({
  type: "tool_use" as const,
  name: "submit_comments",
  input: { comments },
});

const good1: QuillCommentDraft = {
  quote: "our robot died at regionals",
  occurrence: 1,
  kind: "question",
  body: "What did the team do in the first hour after it died?",
};
const good2: QuillCommentDraft = {
  quote: "rebuild faster than it can blame",
  occurrence: 1,
  kind: "clarity",
  body: "Who was blaming whom? A reader may want one concrete moment here.",
};
const badQuote: QuillCommentDraft = {
  quote: "our robot broke at regionals",
  occurrence: 1,
  kind: "question",
  body: "What broke first?",
};
const long: QuillCommentDraft = { quote: "I learned", occurrence: 1, kind: "structure", body: words("w", 61) };
const ghost: QuillCommentDraft = {
  quote: "a team can rebuild",
  occurrence: 1,
  kind: "clarity",
  body: "Try this instead: After the robot failed, our team discovered that rebuilding together mattered more than assigning blame, and that lesson shaped how I lead every project now and later.",
};

describe("runEssayReview", () => {
  it("returns nothing for a missing or empty essay without calling the model", async () => {
    const missing = setup([]);
    expect(
      await runEssayReview(missing.deps, {
        ownerId: JORDAN.ownerId,
        essayId: "88888888-8888-4888-8888-888888888899",
        version: 1,
        body: "",
      }),
    ).toEqual({
      comments: [],
      refused: false,
    });
    const empty = setup([], createFakePort({ essays: [{ ...first(jordanData().essays), body: "  ", wordCount: 0 }] }));
    expect(
      await runEssayReview(empty.deps, { ownerId: JORDAN.ownerId, essayId: JORDAN.essayId, version: 1, body: "  " }),
    ).toEqual({ comments: [], refused: false });
    expect(missing.model.requests).toHaveLength(0);
    expect(empty.model.requests).toHaveLength(0);
  });

  it("sends the draft as data with high effort and returns clean comments", async () => {
    const { deps, model, progress, usage } = setup([{ content: [submitComments([good1, good2])] }]);
    const out = await runEssayReview(deps, {
      ownerId: JORDAN.ownerId,
      essayId: JORDAN.essayId,
      version: 1,
      body: BODY,
    });
    expect(out).toEqual({ comments: [good1, good2], refused: false });
    const req = model.requests[0];
    expect(req).toMatchObject({ role: "quill", effort: "high" });
    expect(req?.tools.map((t) => t.name)).toEqual(["count_words", "submit_comments"]);
    const blocks = req?.messages[0]?.content as Array<{ type: string; text: string }>;
    expect(blocks[0]).toEqual(wrapUntrusted("essay_prompt", "Review the student draft."));
    expect(blocks[1]).toEqual(wrapUntrusted("essay_draft", BODY));
    expect(blocks[2]?.text).toContain("It has 18 words.");
    expect(progress.map((p) => p.text)).toEqual(["Quill is reading your draft…"]);
    expect(usage).toEqual(["quill"]);
  });

  it("asks once to fix bad quotes, long bodies, and rewritten sentences, then drops what still fails", async () => {
    const fixed: QuillCommentDraft = { ...badQuote, quote: "died at regionals" };
    const { deps, model } = setup([
      { content: [submitComments([good1, badQuote, long, ghost])] },
      { content: [submitComments([good1, fixed, long, ghost])] },
    ]);
    const out = await runEssayReview(deps, {
      ownerId: JORDAN.ownerId,
      essayId: JORDAN.essayId,
      version: 1,
      body: BODY,
    });
    expect(out).toEqual({ comments: [good1, fixed], refused: false });
    expect(model.requests).toHaveLength(2);
    const feedback = (model.requests[1]?.messages[2]?.content as Array<{ is_error?: boolean; content: string }>)[0];
    expect(feedback?.is_error).toBe(true);
    expect(feedback?.content).toContain("comment 2: the quote isn't in the draft at occurrence 1");
    expect(feedback?.content).toContain("comment 3: the body has 61 words");
    expect(feedback?.content).toContain("comment 4: the body has 30 words in a row that aren't the student's");
    expect(feedback?.content).not.toContain("comment 1:");
  });

  it("finds repeated quotes by occurrence and allows exactly 60 words", () => {
    const repeated = "I tried. I tried again. Then I won.";
    expect(quoteOccurs(repeated, "I tried", 2)).toBe(true);
    expect(quoteOccurs(repeated, "I tried", 3)).toBe(false);
    expect(quoteOccurs(repeated, "", 1)).toBe(false);
    // R3E-6: overlapping matches count, like 07 and 17.
    expect(quoteOccurs("ha ha ha ha", "ha ha", 3)).toBe(true);
    expect(quoteOccurs("ha ha ha ha", "ha ha", 4)).toBe(false);
    const sixty = `${BODY} ${BODY} ${BODY} one two three four five six`;
    expect(commentProblems({ ...good1, body: sixty }, BODY)).toEqual([]);
    expect(commentProblems({ ...good1, body: `${sixty} seven` }, BODY)).toEqual([
      "the body has 61 words; keep it to 60 or fewer",
    ]);
  });

  it("reports a refusal", async () => {
    const { deps } = setup([{ stopReason: "refusal" }]);
    expect(
      await runEssayReview(deps, { ownerId: JORDAN.ownerId, essayId: JORDAN.essayId, version: 1, body: BODY }),
    ).toEqual({ comments: [], refused: true });
  });

  it("returns no comments when the model never submits", async () => {
    const { deps } = setup([
      { content: [{ type: "text", text: "Looks good!" }] },
      { content: [{ type: "text", text: "Really." }] },
    ]);
    expect(
      await runEssayReview(deps, { ownerId: JORDAN.ownerId, essayId: JORDAN.essayId, version: 1, body: BODY }),
    ).toEqual({ comments: [], refused: false });
  });
});
