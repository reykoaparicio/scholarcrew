import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  it("is a switch named by its label", () => {
    render(<Toggle checked={false} onChange={vi.fn()} label="Crew chats" />);
    const sw = screen.getByRole("switch", { name: "Crew chats" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.classList.contains("on")).toBe(false);
  });

  it("reflects checked", () => {
    render(<Toggle checked onChange={vi.fn()} label="College list" />);
    const sw = screen.getByRole("switch", { name: "College list" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(sw.classList.contains("on")).toBe(true);
  });

  it("calls onChange with the next value on click", () => {
    const onChange = vi.fn();
    render(<Toggle checked onChange={onChange} label="Story Bank" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("toggles with Space and Enter, not other keys", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Religion" />);
    const sw = screen.getByRole("switch");
    fireEvent.keyDown(sw, { key: " " });
    fireEvent.keyDown(sw, { key: "Enter" });
    fireEvent.keyDown(sw, { key: "a" });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, true);
    expect(onChange).toHaveBeenNthCalledWith(2, true);
  });

  it("does nothing when disabled", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Disability" disabled />);
    const sw = screen.getByRole("switch");
    fireEvent.click(sw);
    fireEvent.keyDown(sw, { key: " " });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("describes the switch with its detail text", () => {
    render(<Toggle checked onChange={vi.fn()} label="Household income range" detail="$60k–75k · shared by Dana" />);
    const sw = screen.getByRole("switch", { name: "Household income range" });
    const detailId = sw.getAttribute("aria-describedby");
    expect(detailId).toBeTruthy();
    expect(document.getElementById(detailId ?? "")?.textContent).toBe("$60k–75k · shared by Dana");
  });
});
