import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GapBar } from "./GapBar";

function seg(container: HTMLElement, series: "free" | "gap") {
  return container.querySelector<HTMLElement>(`[data-series="${series}"]`);
}

describe("GapBar", () => {
  it("sizes segments as shares of free + gap", () => {
    const { container } = render(<GapBar freeUsd={18600} gapUsd={9200} />);
    expect(seg(container, "free")?.style.width).toBe("66.9%");
    expect(seg(container, "gap")?.style.width).toBe("33.1%");
    expect(seg(container, "gap")?.classList.contains("cap")).toBe(true);
    expect(seg(container, "free")?.classList.contains("cap")).toBe(false);
  });

  it("hides the bar from assistive tech and gives a text summary", () => {
    const { container } = render(<GapBar freeUsd={18600} gapUsd={9200} />);
    expect(container.querySelector(".bar")?.getAttribute("aria-hidden")).toBe("true");
    const summary = screen.getByText("Free money $18,600 (66.9%), Gap $9,200 (33.1%), of $27,800 to attend.");
    expect(summary.classList.contains("srOnly")).toBe(true);
  });

  it("shows legend values in ink with custom labels", () => {
    render(<GapBar freeUsd={24400} gapUsd={6800} freeLabel="Grants" gapLabel="You pay" totalLabel="this year" />);
    expect(screen.getByText("$24,400").tagName).toBe("B");
    expect(screen.getByText("$6,800").tagName).toBe("B");
    expect(screen.getByText("of $31,200 this year")).toBeTruthy();
  });

  it("rounds the free segment when there is no gap", () => {
    const { container } = render(<GapBar freeUsd={5000} gapUsd={0} />);
    expect(seg(container, "free")?.style.width).toBe("100%");
    expect(seg(container, "free")?.classList.contains("cap")).toBe(true);
    expect(seg(container, "gap")).toBeNull();
  });

  it("draws nothing for zero or negative amounts but still summarizes", () => {
    const { container } = render(<GapBar freeUsd={-50} gapUsd={0} />);
    expect(container.querySelectorAll("[data-series]")).toHaveLength(0);
    expect(screen.getByText("Free money $0 (0%), Gap $0 (0%), of $0 to attend.")).toBeTruthy();
  });
});
