import { describe, expect, it } from "vitest";
import { rankMatches, scoreMatch } from "./ranking";

const base = {
  amountMaxUsd: 1000,
  estMinutes: 60,
  reasonsCount: 0,
  unknownsCount: 0,
  daysUntilDeadline: 9,
  reusableStories: 0,
};

describe("scoreMatch", () => {
  it("scores the Rotary match", () => {
    expect(
      scoreMatch({
        amountMaxUsd: 2500,
        estMinutes: 45,
        reasonsCount: 3,
        unknownsCount: 1,
        daysUntilDeadline: 24,
        reusableStories: 1,
      }),
    ).toEqual({ fitScore: 75, valuePerHour: 2500 });
  });

  it("scores the Hill Country match", () => {
    expect(
      scoreMatch({
        amountMaxUsd: 1000,
        estMinutes: 30,
        reasonsCount: 2,
        unknownsCount: 0,
        daysUntilDeadline: 9,
        reusableStories: 1,
      }),
    ).toEqual({ fitScore: 80, valuePerHour: 1600 });
  });

  it("starts at 50 and clamps to 0..100", () => {
    expect(scoreMatch(base).fitScore).toBe(50);
    expect(scoreMatch({ ...base, reasonsCount: 8, reusableStories: 2 }).fitScore).toBe(100);
    expect(scoreMatch({ ...base, unknownsCount: 5 })).toEqual({ fitScore: 0, valuePerHour: 0 });
  });

  it("treats anything under 5 minutes as 5 minutes", () => {
    expect(scoreMatch({ ...base, amountMaxUsd: 100, estMinutes: 0 }).valuePerHour).toBe(600);
    expect(scoreMatch({ ...base, amountMaxUsd: 100, estMinutes: 2 }).valuePerHour).toBe(600);
  });

  it("rounds value per hour to 2 decimals", () => {
    expect(scoreMatch({ ...base, estMinutes: 7 }).valuePerHour).toBe(4285.71);
  });

  it("returns zero value for a zero amount", () => {
    expect(scoreMatch({ ...base, amountMaxUsd: 0 }).valuePerHour).toBe(0);
  });
});

describe("rankMatches", () => {
  const m = (id: string, valuePerHour: number, daysUntilDeadline: number | null) => ({
    id,
    fitScore: 50,
    valuePerHour,
    daysUntilDeadline,
  });

  it("orders by value per hour, highest first", () => {
    expect(rankMatches([m("a", 100, 5), m("b", 2500, 24), m("c", 1600, 9)]).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("orders open, undated, then expired listings", () => {
    const ranked = rankMatches([m("none", 500, null), m("late", 500, 30), m("soon", 500, 3), m("past", 500, -2)]);
    expect(ranked.map((x) => x.id)).toEqual(["soon", "late", "none", "past"]);
    expect(rankMatches([m("expired", 99999, -1), m("open", 1, 0)]).map((x) => x.id)).toEqual(["open", "expired"]);
  });

  it("is stable for full ties and does not mutate the input", () => {
    const input = [m("first", 500, null), m("second", 500, null), m("third", 500, 4)];
    const ranked = rankMatches(input);
    expect(ranked.map((x) => x.id)).toEqual(["third", "first", "second"]);
    expect(input.map((x) => x.id)).toEqual(["first", "second", "third"]);
  });

  it("returns an empty list for no matches", () => {
    expect(rankMatches([])).toEqual([]);
  });
});
