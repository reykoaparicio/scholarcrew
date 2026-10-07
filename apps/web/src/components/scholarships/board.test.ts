import { describe, expect, it } from "vitest";
import { boardColumns, cardActions, columnFor, parseWonInput, totalsLine } from "./board";
import { board, card } from "./fixtures";

describe("boardColumns", () => {
  const b = board({
    matched: [card("matched", { localLabel: "National", renewable: true }), card("matched")],
    working: [card("planned", {}, { reuseStoryTitle: "Robotics story" }), card("drafting")],
    submitted: [card("submitted")],
    won: [card("won")],
    lostOrSkipped: [card("skipped")],
  });

  it("maps the four columns and hides lost and skipped until asked", () => {
    expect(boardColumns(b, "all", false).map((c) => [c.title, c.cards.length])).toEqual([
      ["Matched", 2],
      ["Working on", 2],
      ["Submitted", 1],
      ["Won", 1],
    ]);
    expect(boardColumns(b, "all", true).at(-1)).toMatchObject({ key: "lostOrSkipped", title: "Lost and skipped" });
  });

  it("filters cards by local, national, renewable, and story reuse", () => {
    const counts = (f: Parameters<typeof boardColumns>[1]) => boardColumns(b, f, false).map((c) => c.cards.length);
    expect(counts("national")).toEqual([1, 0, 0, 0]);
    expect(counts("local")).toEqual([1, 2, 1, 1]);
    expect(counts("renewable")).toEqual([1, 0, 0, 0]);
    expect(counts("reuse")).toEqual([0, 1, 0, 0]);
  });

  it("keeps the core's ranked Matched order, even against deadline order (R2P-5)", () => {
    const value = card("matched", { name: "Higher value per hour", deadline: "2026-12-15" });
    const soon = card("matched", { name: "Due sooner", deadline: "2026-10-12" });
    const ranked = board({ matched: [value, soon] });
    expect(boardColumns(ranked, "all", false)[0]?.cards.map((c) => c.scholarship.name)).toEqual([
      "Higher value per hour",
      "Due sooner",
    ]);
    expect(boardColumns(ranked, "local", false)[0]?.cards.map((c) => c.scholarship.name)).toEqual([
      "Higher value per hour",
      "Due sooner",
    ]);
  });

  it("puts each stage in its column", () => {
    expect(
      ["matched", "planned", "drafting", "submitted", "won", "lost", "skipped"].map((s) => columnFor(s as never)),
    ).toEqual(["matched", "working", "working", "submitted", "won", "lostOrSkipped", "lostOrSkipped"]);
  });
});

describe("cardActions", () => {
  it("offers the next step for each stage", () => {
    expect(cardActions(card("matched").application).map((a) => [a.label, a.patch])).toEqual([
      ["Save", { stage: "planned" }],
      ["Skip", { stage: "skipped" }],
    ]);
    expect(cardActions(card("planned").application)[0]).toMatchObject({
      label: "Start drafting",
      patch: { stage: "drafting" },
    });
    expect(cardActions(card("drafting").application)[0]).toMatchObject({
      label: "Mark submitted",
      patch: { stage: "submitted" },
    });
    expect(cardActions(card("submitted").application).map((a) => a.label)).toEqual(["Mark won", "Didn't win"]);
    expect(cardActions(card("submitted").application)[0]?.patch).toBeNull();
    expect(cardActions(card("won").application)).toEqual([
      { key: "thanks", label: "Thank-you note sent", patch: { thankYouSent: true } },
    ]);
    expect(cardActions({ ...card("won").application, thankYouSent: true })).toEqual([]);
    expect(cardActions(card("lost").application)[0]).toMatchObject({
      label: "Move back to matched",
      patch: { stage: "matched" },
    });
  });
});

describe("parseWonInput", () => {
  it("needs whole dollars and one-time or renewable", () => {
    expect(parseWonInput("", "renewable")).toEqual({ ok: false, error: "Enter the amount you won in whole dollars." });
    expect(parseWonInput("12.50", "renewable")).toEqual({
      ok: false,
      error: "Enter the amount you won in whole dollars.",
    });
    expect(parseWonInput("0", "one_time")).toEqual({ ok: false, error: "Enter an amount between $1 and $10,000,000." });
    expect(parseWonInput("$1,000", null)).toEqual({ ok: false, error: "Pick one-time or renewable." });
    expect(parseWonInput("$1,000", "renewable")).toEqual({
      ok: true,
      patch: { stage: "won", outcomeUsd: 1000, outcomeRenewable: true },
    });
    expect(parseWonInput(" 750 ", "one_time")).toMatchObject({ patch: { outcomeUsd: 750, outcomeRenewable: false } });
  });
});

describe("totalsLine", () => {
  it("reads like the mockup", () => {
    expect(totalsLine({ inPlayUsd: 12250, wonUsd: 1000, dueThisMonth: 2 })).toBe(
      "$12,250 in play · $1,000 won · 2 due this month · Scout looks for new matches every Sunday",
    );
  });
});
