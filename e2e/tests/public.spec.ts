import { expect } from "@playwright/test";
import type { OfferComparison } from "@scholarcrew/domain";
import { computePublicOffers } from "@scholarcrew/engines";
import { adminSession, isoDaysFromNow, publishScholarship, uniqueListingName } from "../support/admin";
import { test } from "../support/fixtures";
import { TOOL_INPUT, fillOfferTool } from "../support/offerTool";
import { usd } from "../support/offers";
import { newSession } from "../support/users";

test.describe("public pages, signed out (PU-01..PU-03)", () => {
  test("the landing page and the scholarship directory work without an account", async ({ browser, adminState }) => {
    const admin = await adminSession(browser, adminState);
    const name = uniqueListingName("Bluebonnet Makers Scholarship");
    const listing = await publishScholarship(admin.page, { name, amountUsd: 2_000, deadline: isoDaysFromNow(30) });
    await admin.context.close();

    const visitor = await newSession(browser, "visitor");
    const p = visitor.page;
    await p.goto("/");
    await expect(
      p.getByRole("heading", { level: 1, name: "A crew of specialists for paying for college" }),
    ).toBeVisible();
    await p.getByRole("main").getByRole("link", { name: "Browse scholarships by state", exact: true }).click();
    await expect(p).toHaveURL(/\/directory$/);
    await expect(p.getByRole("heading", { level: 1, name: "Scholarship directory" })).toBeVisible();
    // The state list is a <section aria-labelledby> region; listing rows elsewhere on the page can name a state too.
    await p.getByRole("region", { name: "Browse by state" }).getByRole("link", { name: "Texas", exact: true }).click();
    await expect(p).toHaveURL(/\/directory\/TX$/);
    await expect(p.getByRole("heading", { level: 1, name: "Texas scholarships" })).toBeVisible();
    const search = p.getByRole("search");
    await search.getByLabel("Search by name or sponsor").fill(name);
    await search.getByRole("button", { name: "Search", exact: true }).click();
    await p.getByRole("link", { name, exact: true }).click();
    await expect(p).toHaveURL(new RegExp(`/directory/s/${listing.slug}$`));
    await expect(p.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(p.getByRole("link", { name: /Apply on the sponsor/ })).toHaveAttribute("href", listing.url);

    const detail = await p.request.get(`/api/v1/scholarships/${listing.slug}`);
    expect(detail.status()).toBe(200);
    expect((await visitor.context.cookies()).some((c) => c.name === "sc_session")).toBe(false);
    await visitor.context.close();
  });

  test("the offer tool compares two schools without an account and matches Ledger's engine", async ({ browser }) => {
    const visitor = await newSession(browser, "tool");
    const p = visitor.page;
    await p.goto("/offer-tool");
    await expect(p.getByRole("heading", { level: 1, name: "Compare award letters" })).toBeVisible();
    await fillOfferTool(p, TOOL_INPUT);
    const responded = p.waitForResponse((r) => r.url().endsWith("/api/v1/public/offer-tool"));
    await p.getByRole("button", { name: "Compare offers", exact: true }).click();
    const res = await responded;
    expect(res.status()).toBe(200);

    const expected = computePublicOffers(TOOL_INPUT);
    const server = (await res.json()) as OfferComparison;
    expect(server.columns.map((c) => [c.collegeName, c.freeMoneyUsd, c.reallyCostsUsd, c.fourYearUsd])).toEqual(
      expected.columns.map((c) => [c.collegeName, c.freeMoneyUsd, c.reallyCostsUsd, c.fourYearUsd]),
    );

    await expect(p.getByRole("heading", { level: 2, name: "What each offer really costs" })).toBeVisible();
    const table = p.getByRole("table", { name: "Side by side" });
    const year1 = table.getByRole("row", { name: /What it really costs, year 1/ });
    const fourYear = table.getByRole("row", { name: /4-year estimate/ });
    for (const column of expected.columns) {
      await expect(table.getByRole("columnheader", { name: column.collegeName, exact: true })).toBeVisible();
      await expect(year1).toContainText(usd(column.reallyCostsUsd));
      await expect(fourYear).toContainText(usd(column.fourYearUsd));
    }
    const lowest = expected.columns.find((c) => c.offerId === expected.lowestFourYearOfferId);
    expect(lowest).toBeDefined();
    await expect(p.getByText(`Lowest 4-year cost: ${lowest?.collegeName ?? ""}`)).toBeVisible();
    expect((await visitor.context.cookies()).some((c) => c.name === "sc_session")).toBe(false);
    await visitor.context.close();
  });
});
