// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingGate } from "./OnboardingGate";
import { SetupFrame } from "./SetupFrame";
import { ShellFrame } from "./ShellFrame";
import { mobileTabsFor, navFor, rosterFor } from "./nav";

const nav = vi.hoisted(() => ({
  pathname: "/crew/abc",
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => nav.pathname }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ShellFrame", () => {
  it("marks the active page in the sidebar and the phone tab bar", () => {
    nav.pathname = "/crew/abc";
    const { tabs, more } = mobileTabsFor("student", []);
    const { container } = render(
      <ShellFrame
        nav={navFor("student")}
        crew={rosterFor([])}
        user={{ name: "Maya R.", subtitle: "Class of 2027 · Private" }}
        topbar={<header>top</header>}
        tabs={tabs}
        more={more}
      >
        <p>page body</p>
      </ShellFrame>,
    );
    const crewLinks = screen.getAllByRole("link", { name: "Crew" });
    expect(crewLinks).toHaveLength(2);
    for (const link of crewLinks) expect(link.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("page body")).toBeTruthy();
    expect(screen.getByText("More")).toBeTruthy();
    expect(container.querySelector('details a[href="/settings"]')?.textContent).toBe("Settings");
  });
});

describe("OnboardingGate", () => {
  it("redirects unfinished students and hides the page", () => {
    nav.pathname = "/week";
    render(
      <OnboardingGate role="student" onboardingComplete={false}>
        <p>week page</p>
      </OnboardingGate>,
    );
    expect(nav.router.replace).toHaveBeenCalledWith("/onboarding");
    expect(screen.queryByText("week page")).toBeNull();
    expect(screen.getByText("Taking you to setup…")).toBeTruthy();
  });

  it("renders onboarding itself", () => {
    nav.pathname = "/onboarding";
    render(
      <OnboardingGate role="student" onboardingComplete={false}>
        <p>steps</p>
      </OnboardingGate>,
    );
    expect(nav.router.replace).not.toHaveBeenCalled();
    expect(screen.getByText("steps")).toBeTruthy();
  });
});

describe("SetupFrame", () => {
  it("dims the nav and offers Finish later", () => {
    render(
      <SetupFrame user={{ name: "Maya R.", subtitle: "Student · Private" }}>
        <p>wizard</p>
      </SetupFrame>,
    );
    expect(screen.getByText("Opens after setup")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Crew" })).toBeNull();
    expect(screen.getByText("Crew")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Finish later" }).getAttribute("href")).toBe("/");
    expect(screen.getByText("wizard")).toBeTruthy();
  });
});
