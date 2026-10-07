import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Topbar } from "../Topbar/Topbar";
import { AppShell, type CrewRosterItem, type NavItem } from "./AppShell";

const NAV: NavItem[] = [
  { key: "week", label: "This week", href: "/week", icon: "calendar" },
  { key: "scholarships", label: "Scholarships", href: "/scholarships", icon: "award", count: 9 },
  { key: "memory", label: "Memory", href: "/memory", icon: "bookmark", count: 0 },
];

const CREW: CrewRosterItem[] = [
  { role: "compass", enabled: true },
  { role: "scout", enabled: true, duty: "local scholarships" },
  { role: "prep", enabled: false, addHref: "/crew?add=prep" },
  { role: "impact", enabled: false },
];

function renderShell(activeKey = "scholarships") {
  return render(
    <AppShell
      nav={NAV}
      activeKey={activeKey}
      crew={CREW}
      user={{ name: "Jordan R.", subtitle: "Class of 2027 · Private" }}
      topbar={
        <Topbar>
          <a href="/crew">Ask your crew</a>
        </Topbar>
      }
    >
      <h1>Scholarships</h1>
    </AppShell>,
  );
}

describe("AppShell", () => {
  it("renders nav links with the active one marked", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/week", "/scholarships", "/memory"]);
    const active = within(nav).getByRole("link", { name: "Scholarships 9" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.classList.contains("on")).toBe(true);
    expect(within(nav).getByRole("link", { name: "This week" }).hasAttribute("aria-current")).toBe(false);
  });

  it("shows counts only when above zero", () => {
    renderShell();
    expect(screen.getByText("9").classList.contains("count")).toBe(true);
    expect(screen.getByRole("link", { name: "Memory" })).toBeTruthy();
  });

  it("moves aria-current with activeKey", () => {
    renderShell("week");
    expect(screen.getByRole("link", { name: "This week" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Scholarships 9" }).hasAttribute("aria-current")).toBe(false);
  });

  it("lists the crew with duties, and add for switched-off members", () => {
    const { container } = renderShell();
    expect(screen.getByText("coordinator")).toBeTruthy();
    expect(screen.getByText("local scholarships")).toBeTruthy();
    expect(screen.getByRole("link", { name: "add Prep" }).getAttribute("href")).toBe("/crew?add=prep");
    expect(screen.getByText("Impact").closest("li")?.classList.contains("off")).toBe(true);
    expect(container.querySelector('[data-role="prep"]')?.classList.contains("hollow")).toBe(true);
    expect(container.querySelector('[data-role="compass"]')?.classList.contains("hollow")).toBe(false);
  });

  it("renders the user card, skip link, topbar, and main content", () => {
    renderShell();
    expect(screen.getByText("Jordan R.")).toBeTruthy();
    expect(screen.getByText("Class of 2027 · Private")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#main");
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(within(screen.getByRole("main")).getByRole("heading", { name: "Scholarships" })).toBeTruthy();
  });

  it("applies className to the frame and renders the phone nav slot", () => {
    const { container } = render(
      <AppShell
        nav={NAV}
        activeKey="week"
        crew={CREW}
        user={{ name: "Jordan R.", subtitle: "Student" }}
        topbar={<Topbar />}
        className="sc-shell"
        mobileNav={<nav aria-label="Main on phones">tabs</nav>}
      >
        <p>body</p>
      </AppShell>,
    );
    const frame = container.firstElementChild;
    expect(frame?.classList.contains("frame")).toBe(true);
    expect(frame?.classList.contains("sc-shell")).toBe(true);
    expect(frame?.classList.contains("withMobileNav")).toBe(true);
    expect(screen.getByRole("navigation", { name: "Main on phones" }).parentElement).toBe(frame);
  });

  it("leaves the frame plain without a phone nav", () => {
    const { container } = renderShell();
    expect(container.firstElementChild?.className).toBe("frame");
  });
});
