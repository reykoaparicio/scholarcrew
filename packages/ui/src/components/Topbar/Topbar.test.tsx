import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Topbar } from "./Topbar";

describe("Topbar", () => {
  it("renders a GET search form", () => {
    const { container } = render(
      <Topbar search={{ action: "/scholarships", placeholder: "Search scholarships, schools, essays…" }} />,
    );
    const box = screen.getByRole("searchbox", { name: "Search" }) as HTMLInputElement;
    expect(box.name).toBe("q");
    expect(box.placeholder).toBe("Search scholarships, schools, essays…");
    const form = container.querySelector("form");
    expect(form?.getAttribute("action")).toBe("/scholarships");
    expect(form?.getAttribute("method")).toBe("get");
  });

  it("links to notifications with the unread count in its name", () => {
    const { container } = render(<Topbar notifications={{ href: "/settings#notifications", unread: 3 }} />);
    const link = screen.getByRole("link", { name: "Notifications, 3 unread" });
    expect(link.getAttribute("href")).toBe("/settings#notifications");
    expect(container.querySelector(".pip")).not.toBeNull();
  });

  it("drops the pip when nothing is unread", () => {
    const { container } = render(<Topbar notifications={{ href: "/n", unread: 0 }} />);
    expect(screen.getByRole("link", { name: "Notifications" })).toBeTruthy();
    expect(container.querySelector(".pip")).toBeNull();
  });

  it("renders actions inside the banner", () => {
    render(
      <Topbar>
        <a href="/crew">Ask your crew</a>
      </Topbar>,
    );
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Ask your crew" })).toBeTruthy();
  });
});
