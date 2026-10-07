import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Who } from "./Who";

describe("Who", () => {
  it("shows the crew name next to its dot", () => {
    const { container } = render(<Who role="quill" />);
    expect(screen.getByText("Quill")).toBeTruthy();
    expect(container.querySelector('[data-role="quill"]')).not.toBeNull();
  });

  it("supports the small size", () => {
    const { container } = render(<Who role="ledger" size="sm" />);
    expect(container.firstElementChild?.classList.contains("sm")).toBe(true);
    expect(container.firstElementChild?.textContent).toBe("Ledger");
  });
});
