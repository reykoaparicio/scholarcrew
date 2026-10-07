import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("renders static text when not clickable", () => {
    render(<Chip>Local</Chip>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Local").classList.contains("chip")).toBe(true);
  });

  it("is a toggle button with aria-pressed when clickable", () => {
    const onClick = vi.fn();
    render(
      <Chip active onClick={onClick}>
        Matched to you
      </Chip>,
    );
    const chip = screen.getByRole("button", { name: "Matched to you" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.classList.contains("on")).toBe(true);
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows a crew dot", () => {
    const { container } = render(<Chip dot="scout">@Scout new matches</Chip>);
    expect(container.querySelector('[data-role="scout"]')).not.toBeNull();
  });
});
