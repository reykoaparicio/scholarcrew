// @vitest-environment jsdom
import type { ScholarshipSummary } from "@scholarcrew/domain";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FiltersCard } from "./DirectoryFilters";
import { ListingRow, ResultsCard } from "./ListingRow";
import { readFilters } from "./listings";

afterEach(cleanup);

const NOW = new Date("2026-10-06T15:00:00.000Z");
const listing = (o: Partial<ScholarshipSummary> = {}): ScholarshipSummary => ({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "maple-stem",
  name: "Maple STEM Award",
  provider: "Maple Rotary",
  amountMinUsd: 1000,
  amountMaxUsd: 1000,
  renewable: false,
  deadline: "2026-10-15",
  localLabel: "Maple County, TX",
  status: "published",
  verifiedAt: "2026-10-02T12:00:00.000Z",
  scamFlags: [],
  unverified: false,
  estMinutes: 60,
  ...o,
});

describe("ListingRow", () => {
  it("shows amount, sponsor, area, deadline, and the verified date", () => {
    render(
      <ul>
        <ListingRow s={listing()} now={NOW} />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "Maple STEM Award" }).getAttribute("href")).toBe("/directory/s/maple-stem");
    expect(screen.getByText("$1,000")).toBeTruthy();
    expect(screen.getByText("One-time")).toBeTruthy();
    expect(screen.getByText("Maple Rotary · Maple County, TX")).toBeTruthy();
    expect(screen.getByText("Oct 15")).toBeTruthy();
    expect(screen.getByText("9 days left")).toBeTruthy();
    expect(screen.getByText("Verified Oct 2")).toBeTruthy();
  });

  it("labels stale and unverified listings", () => {
    render(
      <ul>
        <ListingRow s={listing({ slug: "a", verifiedAt: "2026-08-01T12:00:00.000Z", renewable: true })} now={NOW} />
        <ListingRow s={listing({ slug: "b", unverified: true, verifiedAt: null, deadline: null })} now={NOW} />
      </ul>,
    );
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.getByText("Last checked Aug 1")).toBeTruthy();
    expect(screen.getByText("Renewable")).toBeTruthy();
    expect(screen.getByText("Unverified")).toBeTruthy();
    expect(screen.getByText("Not posted")).toBeTruthy();
  });
});

describe("FiltersCard", () => {
  it("links each chip to the filtered page and marks the active one", () => {
    render(<FiltersCard base="/directory/TX" filters={readFilters({ q: "maple", minUsd: "1000" })} />);
    const five = screen.getByRole("link", { name: "$5,000+" });
    expect(five.getAttribute("href")).toBe("/directory/TX?q=maple&minUsd=5000");
    expect(screen.getByRole("link", { name: "$1,000+" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "Any amount" }).getAttribute("href")).toBe("/directory/TX?q=maple");
    expect(screen.getByRole("link", { name: "Next 90 days" }).getAttribute("href")).toBe(
      "/directory/TX?q=maple&minUsd=1000&within=90",
    );
    expect(screen.getByRole("link", { name: "Clear" }).getAttribute("href")).toBe("/directory/TX");
    const search = screen.getByRole("searchbox", { name: "Search by name or sponsor" }) as HTMLInputElement;
    expect(search.defaultValue).toBe("maple");
    expect(screen.getByText("Listings that charge a fee or look like scams never appear here.")).toBeTruthy();
  });
});

describe("ResultsCard", () => {
  it("shows an empty state and pages through results", () => {
    const { rerender } = render(
      <ResultsCard items={[]} page={1} pageSize={20} total={0} base="/directory" filters={readFilters({})} now={NOW} />,
    );
    expect(screen.getByText("No listings match these filters yet.")).toBeTruthy();
    rerender(
      <ResultsCard
        items={[listing()]}
        page={2}
        pageSize={20}
        total={45}
        base="/directory"
        filters={readFilters({ page: "2" })}
        now={NOW}
      />,
    );
    const pager = screen.getByRole("navigation", { name: "Pages" });
    expect(within(pager).getByText("Page 2 of 3")).toBeTruthy();
    expect(within(pager).getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/directory");
    expect(within(pager).getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/directory?page=3");
  });
});
