import type { CostSummary } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { comparison, offer } from "./fixtures";
import { axisMaxFor, budgetLine, endParts, pageChip, pendingLine, sourceLine } from "./offers";

describe("offer helpers", () => {
  it("rounds the shared axis up to the next $20k", () => {
    expect(axisMaxFor(comparison.columns)).toBe(80000);
    expect(axisMaxFor([])).toBe(20000);
  });

  it("says when year 1 is cheaper than later years", () => {
    const [stateU, riverside] = comparison.columns;
    expect(stateU && endParts(stateU)).toEqual({ amount: "$9,200", rest: "really costs you" });
    expect(riverside && endParts(riverside)).toEqual({
      amount: "$6,800",
      rest: "this year, then $12,800 a year after",
    });
  });

  it("finds the letter page for a group of lines (MO-07)", () => {
    expect(pageChip(offer().lines, ["grant", "scholarship"])).toEqual({
      label: "p.1",
      citedText: "State U Grant ... $15,600",
    });
    expect(pageChip(offer().lines, ["loan_private"])).toBeNull();
  });
});

describe("cost lines", () => {
  const cost: CostSummary = {
    collegeId: "100",
    collegeName: "State U",
    source: "scorecard",
    sourceLabel: "College Scorecard net price, $48k–75k",
    costOfAttendanceUsd: 27800,
    freeMoneyUsd: 18600,
    gapUsd: 9200,
    pendingUsd: 2500,
    gapIfPendingWinUsd: 6700,
    isEstimate: true,
    budgetUsd: 6000,
    gapAfterBudgetUsd: 3200,
  };

  it("labels the source, pending applications, and the family budget", () => {
    expect(sourceLine(cost)).toBe("College Scorecard net price, $48k–75k · estimate");
    expect(sourceLine({ ...cost, isEstimate: false })).toBe("College Scorecard net price, $48k–75k");
    expect(pendingLine(cost)).toBe("$2,500 in pending applications · gap $6,700 if they come through");
    expect(pendingLine({ ...cost, pendingUsd: 0 })).toBeNull();
    expect(budgetLine(cost)).toBe("Family budget $6,000/yr · $3,200 left after it");
    expect(budgetLine({ ...cost, gapAfterBudgetUsd: 0 })).toBe("Family budget $6,000/yr · covers the gap");
    expect(budgetLine({ ...cost, budgetUsd: null, gapAfterBudgetUsd: null })).toBeNull();
  });
});
