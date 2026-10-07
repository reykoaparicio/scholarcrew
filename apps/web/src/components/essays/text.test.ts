import type { Story } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { essayStats, findOccurrence, highlightSegments, limitBadge, rankStories, stem } from "./text";

describe("essayStats and limitBadge", () => {
  it("counts against the word limit and warns at 90% and over 100%", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    expect(essayStats(words(142), 500, null)).toMatchObject({
      count: 142,
      limit: 500,
      unit: "words",
      state: "ok",
      label: "142 / 500 words",
    });
    expect(limitBadge(essayStats(words(142), 500, null))).toBeNull();
    expect(limitBadge(essayStats(words(450), 500, null))).toEqual({ tone: "warn", text: "50 words left" });
    expect(limitBadge(essayStats(words(503), 500, null))).toEqual({ tone: "crit", text: "3 over" });
  });

  it("falls back to characters (code points) and to no limit", () => {
    expect(essayStats("héllo 👋", null, 10)).toMatchObject({
      count: 7,
      unit: "characters",
      label: "7 / 10 characters",
    });
    expect(essayStats("one two", null, null)).toMatchObject({ count: 2, limit: null, state: "ok", label: "2 words" });
    expect(essayStats("", 500, null).count).toBe(0);
  });
});

describe("quote anchors", () => {
  const body = "The first night, 30 kids came. The first night was loud. By May, kids built sensors.";

  it("finds the nth occurrence", () => {
    expect(findOccurrence(body, "The first night", 1)).toBe(0);
    expect(findOccurrence(body, "The first night", 2)).toBe(31);
    expect(findOccurrence(body, "The first night", 3)).toBe(-1);
    expect(findOccurrence(body, "", 1)).toBe(-1);
  });

  it("splits the body into numbered highlights in comment order and reports quotes it can't place", () => {
    const { segments, unplaced } = highlightSegments(body, [
      { id: "a", quote: "The first night", occurrence: 2 },
      { id: "b", quote: "kids built sensors", occurrence: 1 },
      { id: "c", quote: "no longer in the draft", occurrence: 1 },
      { id: "d", quote: "first night was", occurrence: 1 },
    ]);
    expect(segments).toEqual([
      { text: "The first night, 30 kids came. ", n: null, id: null, start: 0 },
      { text: "The first night", n: 1, id: "a", start: 31 },
      { text: " was loud. By May, ", n: null, id: null, start: 46 },
      { text: "kids built sensors", n: 2, id: "b", start: 65 },
      { text: ".", n: null, id: null, start: 83 },
    ]);
    expect(unplaced).toEqual(["c", "d"]);
  });

  it("returns the whole body when there are no comments", () => {
    expect(highlightSegments("Hi.", []).segments).toEqual([{ text: "Hi.", n: null, id: null, start: 0 }]);
  });
});

describe("rankStories", () => {
  const story = (o: Partial<Story>): Story => ({
    id: "00000000-0000-4000-8000-000000000001",
    title: "Story",
    moment: "",
    themes: [],
    evidence: "",
    summary: "",
    createdAt: "2026-09-01T15:00:00.000Z",
    updatedAt: "2026-09-01T15:00:00.000Z",
    archivedAt: null,
    uses: [],
    ...o,
  });
  const robotics = story({
    id: "r",
    title: "Robotics → library STEM nights",
    themes: ["service", "teaching", "leadership"],
  });
  const clinic = story({ id: "c", title: "Translating at the clinic", themes: ["family", "community", "care"] });
  const bakery = story({ id: "b", title: "Night shift at the bakery", themes: ["work", "responsibility"] });
  const archived = story({ id: "x", title: "Old", themes: ["service"], archivedAt: "2026-09-02T15:00:00.000Z" });

  it("stems simple word endings", () => {
    expect(stem("service")).toBe(stem("serve"));
    expect(stem("teaching")).toBe("teach");
    expect(stem("is")).toBe("is");
  });

  it("ranks unarchived stories by theme overlap with the prompt, then by title", () => {
    const ranked = rankStories("Describe a time you used your skills to serve your community.", [
      bakery,
      clinic,
      robotics,
      archived,
    ]);
    expect(ranked.map((r) => [r.story.id, r.matched])).toEqual([
      ["r", ["service"]],
      ["c", ["community"]],
    ]);
  });

  it("breaks ties by fewer prior uses", () => {
    const used = {
      ...robotics,
      id: "r2",
      uses: [
        { essayId: "e", essayTitle: "E", collegeId: null, scholarshipId: null, usedAt: "2026-09-03T15:00:00.000Z" },
      ],
    };
    const ranked = rankStories("Tell us about service.", [used, robotics]);
    expect(ranked.map((r) => r.story.id)).toEqual(["r", "r2"]);
  });
});
