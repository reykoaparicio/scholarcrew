import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Progress } from "./Progress";

describe("Progress", () => {
  it("maps 0..1 to a labelled progressbar", () => {
    render(<Progress value={0.6} label="Checklist 3 of 5" />);
    const bar = screen.getByRole("progressbar", { name: "Checklist 3 of 5" });
    expect(bar.getAttribute("value")).toBe("60");
    expect(bar.getAttribute("max")).toBe("100");
  });

  it("clamps values outside 0..1", () => {
    const { rerender } = render(<Progress value={1.7} label="p" />);
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("100");
    rerender(<Progress value={-0.2} label="p" />);
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("0");
  });

  it("treats NaN as 0", () => {
    render(<Progress value={Number.NaN} label="p" />);
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("0");
  });
});
