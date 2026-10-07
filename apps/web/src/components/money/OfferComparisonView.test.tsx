// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OfferComparisonView } from "./OfferComparisonView";
import { comparison, offer } from "./fixtures";

afterEach(cleanup);

describe("OfferComparisonView", () => {
  it("leads with the lowest 4-year cost and the one-time grant warning", () => {
    render(<OfferComparisonView comparison={comparison} offers={[offer()]} />);
    expect(screen.getByText("Over four years, State U costs least: $36,800.")).toBeTruthy();
    expect(
      screen.getByText(
        "Riverside College looks cheapest this year ($6,800), but $6,000 of its free money only applies to the first year.",
      ),
    ).toBeTruthy();
  });

  it("draws the bars on a shared axis with end labels", () => {
    const { container } = render(<OfferComparisonView comparison={comparison} offers={[offer()]} />);
    expect(container.querySelectorAll("[data-row]")).toHaveLength(3);
    expect(screen.getByText("$27,800 to attend")).toBeTruthy();
    expect(screen.getByText("this year, then $12,800 a year after")).toBeTruthy();
    expect(screen.getByText("$80k")).toBeTruthy();
  });

  it("fills the comparison table from the fixture", () => {
    render(<OfferComparisonView comparison={comparison} offers={[offer()]} />);
    const table = screen.getByRole("table", { name: "Offer comparison" });
    const cells = (name: RegExp) =>
      within(within(table).getByRole("row", { name }))
        .getAllByRole("cell")
        .map((c) => c.textContent);
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["", "State U", "Riverside College", "Northgate University"]);
    expect(cells(/^Cost to attend/)).toEqual(["$27,800", "$31,200", "$68,400"]);
    expect(cells(/^Free money/)).toEqual(["$18,600p.1Page 1: State U Grant ... $15,600", "$24,400", "$55,600"]);
    expect(cells(/^Work-study/)).toEqual(["$2,000p.2Page 2: State U Grant ... $15,600", "$0", "$3,000"]);
    expect(cells(/^Loans/)).toEqual(["$5,500p.2Page 2: State U Grant ... $15,600", "$3,500", "$5,500"]);
    expect(cells(/^What the letter says you owe/)).toEqual(["$1,700", "$3,300", "$4,300"]);
    expect(cells(/^Really costs you, year 1/)).toEqual(["$9,200", "$6,800", "$12,800"]);
    expect(cells(/^Over 4 years/)).toEqual(["Lowest $36,800", "$45,200", "$51,200"]);
    expect(cells(/^Watch for/)).toEqual([
      "Merit $3,000 renews at 3.0 GPA",
      "$6,000 Riverside Welcome Grant is year 1 only",
      "—",
    ]);
    expect(within(table).getAllByText("p.1")[0]?.getAttribute("title")).toBe("Page 1: State U Grant ... $15,600");
    expect(within(table).getAllByText("p.1")[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(within(table).getByText("Page 1: State U Grant ... $15,600")).toBeTruthy();
    expect(screen.getByText("Assumes costs stay flat and renewable awards are kept.")).toBeTruthy();
  });

  it("explains an empty comparison", () => {
    render(
      <OfferComparisonView comparison={{ columns: [], lowestFourYearOfferId: null, assumptions: [] }} offers={[]} />,
    );
    expect(screen.getByText("Confirm an award letter to compare offers")).toBeTruthy();
  });
});
