import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill } from "./StatusPill";

const CASES = [
  ["queued", "Queued", "clock", "neutral"],
  ["working", "Working", "spin", "navy"],
  ["ready", "Ready", "check", "good"],
  ["needs_input", "Needs you", "alert", "warn"],
  ["failed", "Failed", "alert", "crit"],
  ["on", "On", "check", "neutral"],
] as const;

describe("StatusPill", () => {
  for (const [status, label, icon, tone] of CASES) {
    it(`${status} shows text, an icon, and its tone`, () => {
      const { container } = render(<StatusPill status={status} />);
      const pill = screen.getByText(label);
      expect(pill.classList.contains("pill")).toBe(true);
      expect(pill.classList.contains(tone)).toBe(true);
      expect(container.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
    });
  }

  it("accepts a label override", () => {
    render(<StatusPill status="ready" label="Done" />);
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.queryByText("Ready")).toBeNull();
  });
});
