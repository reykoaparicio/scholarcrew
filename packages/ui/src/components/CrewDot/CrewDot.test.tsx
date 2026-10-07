import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CrewDot } from "./CrewDot";

describe("CrewDot", () => {
  it("is a decorative filled dot tagged with its role", () => {
    const { container } = render(<CrewDot role="scout" />);
    const dot = container.querySelector("span");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(dot?.getAttribute("data-role")).toBe("scout");
    expect(dot?.classList.contains("dot")).toBe(true);
    expect(dot?.style.backgroundColor).not.toBe("");
  });

  it("draws a hollow ring for switched-off members", () => {
    const { container } = render(<CrewDot role="prep" hollow />);
    const dot = container.querySelector("span");
    expect(dot?.classList.contains("hollow")).toBe(true);
    expect(dot?.style.backgroundColor).toBe("");
  });
});
