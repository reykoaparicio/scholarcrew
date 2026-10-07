// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PublicLayout from "../../app/(public)/layout";
import LandingPage, { metadata } from "../../app/(public)/page";

afterEach(cleanup);

describe("public layout", () => {
  it("has the site nav, sign in, legal links, and the no-selling promise, with no scripts", () => {
    const { container } = render(
      <PublicLayout>
        <p>body</p>
      </PublicLayout>,
    );
    const nav = screen.getByRole("navigation", { name: "Site" });
    expect(within(nav).getByRole("link", { name: "Directory" }).getAttribute("href")).toBe("/directory");
    expect(within(nav).getByRole("link", { name: "Offer tool" }).getAttribute("href")).toBe("/offer-tool");
    expect(within(nav).getByRole("link", { name: "Pricing" }).getAttribute("href")).toBe("/#pricing");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("We never sell student data")).toBeTruthy();
    const legal: Array<[string, string]> = [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["AI use policy", "/ai-policy"],
    ];
    for (const [name, href] of legal)
      expect(within(footer).getByRole("link", { name }).getAttribute("href")).toBe(href);
    expect(screen.getByRole("main").textContent).toBe("body");
    expect(container.querySelector("script, iframe, img")).toBeNull();
  });
});

describe("landing page (PU-01)", () => {
  it("explains the crew, the product rules, how it works, and test prices", () => {
    expect(metadata.title).toBe("ScholarCrew · A crew for paying for college");
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("A crew of specialists for paying for college");
    for (const name of ["Compass", "Scout", "Atlas", "Quill", "Aid", "Ledger", "Prep", "Impact"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    for (const rule of [
      "We never sell your data",
      "No lender referral fees",
      "No sweepstakes",
      "You write every essay",
    ]) {
      expect(screen.getByText(rule)).toBeTruthy();
    }
    expect(screen.getByRole("heading", { name: "How it works" })).toBeTruthy();
    const pricing = document.getElementById("pricing");
    if (!pricing) throw new Error("pricing section missing");
    const p = within(pricing);
    expect(p.getByText("Test prices · not final")).toBeTruthy();
    for (const plan of ["Free", "Family plan", "Season pass"])
      expect(p.getByRole("heading", { name: plan })).toBeTruthy();
    expect(p.getByText("20 crew requests a month")).toBeTruthy();
    expect(p.getAllByText("300 crew requests a month")).toHaveLength(2);
    const ctas = screen.getAllByRole("link", { name: /Start free|Try the Family plan|Get the season pass/ });
    expect(ctas.length).toBeGreaterThanOrEqual(4);
    for (const link of ctas) expect(link.getAttribute("href")).toBe("/sign-in");
    expect(screen.getByRole("link", { name: "Browse scholarships by state" }).getAttribute("href")).toBe("/directory");
  });
});
