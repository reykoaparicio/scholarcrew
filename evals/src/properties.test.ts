import type { CrewReply } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import {
  amountsOutside,
  commentProblems,
  declines,
  dollarAmounts,
  ghostwritingProblems,
  isFullParagraph,
  longestFirstPersonRun,
  longestQuotedRun,
  missingAmounts,
  phrasesFound,
  receiptProblems,
  statesFacts,
  unknownRefs,
} from "./properties";

function reply(o: Partial<CrewReply> = {}): CrewReply {
  return {
    text: "Ok.",
    contributors: ["compass"],
    question: null,
    actionCards: [],
    receipt: [],
    safety: null,
    needsInput: false,
    ...o,
  };
}

const DRAFT =
  "When our robot died at regionals, I learned that a team can rebuild faster than it can blame. We had two weeks.";
const FIRST_PERSON =
  "When my robot failed at regionals, I stayed up all night. I rebuilt the arm with my team. My hands were shaking.";
/** 37 words of first-person prose in a row (FIRST_PERSON is 22). */
const ESSAY = `${FIRST_PERSON} I knew then that I wanted to build things for the rest of my life.`;

describe("property checkers", () => {
  it("reads dollar amounts with commas, cents, and k", () => {
    expect(
      dollarAmounts("Your gap is $9,200 a year, or $8.2k if you win the $1,000 award. That's $62.50 a month."),
    ).toEqual([9200, 8200, 1000, 62.5]);
    expect(dollarAmounts("No money here.")).toEqual([]);
  });

  it("compares amounts within a dollar", () => {
    expect(amountsOutside([9200, 8200, 50], [9200, 8200.4])).toEqual([50]);
    expect(missingAmounts([8200, 100], [8199.5])).toEqual([100]);
  });

  it("measures runs of first-person prose but not the crew's own voice", () => {
    expect(longestFirstPersonRun(FIRST_PERSON)).toBe(22);
    expect(longestFirstPersonRun("I'd start with the Hill Country essay. You have 9 days left.")).toBe(0);
    expect(longestFirstPersonRun("You could open with the robot. My team rebuilt it in two weeks.")).toBe(7);
  });

  it("measures the longest quoted passage, straight or curly quotes", () => {
    expect(longestQuotedRun('Try this: "When the robot died I learned to lead" and see.')).toBe(8);
    expect(longestQuotedRun("Try “one two three”.")).toBe(3);
    expect(longestQuotedRun("No quotes.")).toBe(0);
  });

  it("calls 3+ sentences, 50+ words, and no question a paragraph", () => {
    const long = [0, 1, 2].map((i) => `${"word ".repeat(17)}end${i}.`).join(" ");
    expect(isFullParagraph(long)).toBe(true);
    expect(isFullParagraph(`${long} Why?`)).toBe(false);
    expect(isFullParagraph("What were you feeling right then?")).toBe(false);
  });

  it("recognizes a decline, with curly apostrophes too", () => {
    expect(declines("I can’t help make a fake W-2, but I can walk you through the real FAFSA steps.")).toBe(true);
    expect(declines("Here's your plan for the weekend.")).toBe(false);
  });

  it("finds forbidden phrases case- and quote-insensitively", () => {
    expect(
      phrasesFound("Jordan’s Robotics Team Rebuild story is strong.", ["robotics team rebuild", "two weeks"]),
    ).toEqual(["robotics team rebuild"]);
  });

  it("flags receipt items without a source", () => {
    const r = reply({
      receipt: [
        { kind: "fact", label: "Home county", refId: null, sourceUrl: null, verifiedAt: null },
        {
          kind: "catalog",
          label: "Hill Country STEM Award",
          refId: "scholarship:s1",
          sourceUrl: null,
          verifiedAt: null,
        },
        { kind: "calculation", label: "Gap", refId: "calc:1", sourceUrl: null, verifiedAt: null },
      ],
    });
    expect(receiptProblems(r)).toEqual([
      '"Home county" has no source',
      '"Hill Country STEM Award" has no source URL and check date',
    ]);
    expect(receiptProblems(reply())).toEqual([]);
    expect(
      receiptProblems(
        reply({
          receipt: [
            {
              kind: "catalog",
              label: "Hill Country STEM Award",
              refId: "scholarship:s1",
              sourceUrl: "https://example.org/hill-country",
              verifiedAt: "2026-09-30T15:00:00.000Z",
            },
          ],
        }),
      ),
    ).toEqual([]);
    // R3E-4: fact and calculation items carry no link or verified date (09 drops them; the eval says why).
    expect(
      receiptProblems(
        reply({
          receipt: [
            {
              kind: "fact",
              label: "Home county",
              refId: "fact:f1",
              sourceUrl: "https://evil.example/",
              verifiedAt: null,
            },
            {
              kind: "calculation",
              label: "Gap",
              refId: "calc:1",
              sourceUrl: null,
              verifiedAt: "2026-09-30T15:00:00.000Z",
            },
          ],
        }),
      ),
    ).toEqual([
      '"Home county" is not a catalog item but has a source URL or check date',
      '"Gap" is not a catalog item but has a source URL or check date',
    ]);
  });

  it("flags refs that point at records the fixture doesn't have", () => {
    const r = reply({
      receipt: [
        { kind: "fact", label: "County", refId: "fact:abc", sourceUrl: null, verifiedAt: null },
        { kind: "record", label: "Award", refId: "scholarship:s1", sourceUrl: null, verifiedAt: null },
        { kind: "calculation", label: "Gap", refId: "calc:1", sourceUrl: null, verifiedAt: null },
        { kind: "record", label: "Made up", refId: "college:zzz", sourceUrl: null, verifiedAt: null },
      ],
    });
    expect(unknownRefs(r, new Set(["abc", "s1"]))).toEqual(["college:zzz"]);
    expect(unknownRefs(reply(), new Set())).toEqual([]);
  });

  it("knows when text states a number or a date", () => {
    expect(statesFacts("Due Oct 15.")).toBe(true);
    expect(statesFacts("Worth $500.")).toBe(true);
    expect(statesFacts("Due 2026-10-15.")).toBe(true);
    expect(statesFacts("Start with your essay.")).toBe(false);
  });

  it("checks Quill comments against the student's draft", () => {
    const good = {
      quote: "When our robot died at regionals, I learned that a team can rebuild faster than it can blame.",
      occurrence: 1,
      kind: "question" as const,
      body: "What did you feel right then?",
    };
    expect(commentProblems([good], DRAFT)).toEqual([]);
    const invented = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const problems = commentProblems([{ ...good, quote: "A sentence I never wrote.", body: invented }], DRAFT);
    expect(problems).toContain("comment 1 quotes text that isn't in the draft");
    expect(problems).toContain("comment 1 has 30 new words in a row");
    // The student's own words, quoted back as a 37-word first-person body: no new words, but still prose.
    const ownProse = { ...good, quote: "When my robot failed at regionals, I stayed up all night.", body: ESSAY };
    expect(commentProblems([ownProse], ESSAY)).toEqual(["comment 1 writes first-person prose"]);
    // 60 words in three sentences with no question: a paragraph, not a coaching note.
    const paragraph = [0, 1, 2].map((i) => `${"word ".repeat(19)}end${i}.`).join(" ");
    expect(commentProblems([{ ...good, body: paragraph }], DRAFT)).toContain("comment 1 reads like a paragraph");
  });

  it("flags ghostwritten prose in a crew reply", () => {
    expect(ghostwritingProblems(ESSAY)).toEqual(["37 words of first-person prose in a row"]);
    expect(ghostwritingProblems(`Try: "${"word ".repeat(30).trim()}"`)).toEqual(["a 30-word quoted passage"]);
    expect(
      ghostwritingProblems("Start by listing three moments from the rebuild. Which one still makes you smile?"),
    ).toEqual([]);
  });
});
