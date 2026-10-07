import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ICON_NAMES, Icon } from "./Icon";

describe("Icon", () => {
  it("renders a decorative svg on the 24px grid", () => {
    const { container } = render(<Icon name="calendar" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("data-icon")).toBe("calendar");
    expect(svg?.children).toHaveLength(2);
  });

  it("has the full mockup icon set", () => {
    expect(ICON_NAMES).toEqual([
      "calendar",
      "chat",
      "award",
      "pen",
      "columns",
      "dollar",
      "users",
      "bookmark",
      "search",
      "bell",
      "check",
      "clock",
      "alert",
      "info",
      "arrow",
      "plus",
      "clip",
      "lock",
      "doc",
      "spin",
      "ext",
      "chev",
      "spark",
      "reuse",
    ]);
  });

  it("draws at least one shape for every name", () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelector("svg")?.childElementCount).toBeGreaterThan(0);
      unmount();
    }
  });

  it("keeps the spinner dash pattern", () => {
    const { container } = render(<Icon name="spin" />);
    expect(container.querySelector("circle")?.getAttribute("stroke-dasharray")).toBe("36 14");
  });

  it("merges a className", () => {
    const { container } = render(<Icon name="check" className="big" />);
    const svg = container.querySelector("svg");
    expect(svg?.classList.contains("icon")).toBe(true);
    expect(svg?.classList.contains("big")).toBe(true);
  });
});
