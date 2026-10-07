import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("pairs status tones with a default icon", () => {
    const { container } = render(<Badge tone="good">Sources checked</Badge>);
    expect(screen.getByText("Sources checked").classList.contains("good")).toBe(true);
    expect(container.querySelector('[data-icon="check"]')).not.toBeNull();
  });

  it("uses the alert icon for warn and crit", () => {
    const { container } = render(
      <>
        <Badge tone="warn">Soon</Badge>
        <Badge tone="crit">Flagged</Badge>
      </>,
    );
    expect(container.querySelectorAll('[data-icon="alert"]')).toHaveLength(2);
  });

  it("lets the caller pick the icon", () => {
    const { container } = render(
      <Badge tone="warn" icon="clock">
        9 days
      </Badge>,
    );
    expect(container.querySelector('[data-icon="clock"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="alert"]')).toBeNull();
  });

  it("has no icon for neutral and navy by default", () => {
    const { container } = render(
      <>
        <Badge tone="neutral">Nov 20</Badge>
        <Badge tone="navy">Spring sample</Badge>
      </>,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Spring sample").classList.contains("navy")).toBe(true);
  });
});
