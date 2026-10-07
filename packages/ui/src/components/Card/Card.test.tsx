import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";

describe("Card", () => {
  it("renders a string title as a heading with an aside", () => {
    render(
      <Card title="This week" aside={<span>1 done</span>}>
        Body
      </Card>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "This week" })).toBeTruthy();
    expect(screen.getByText("1 done")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("uses md padding by default and lg on request", () => {
    const { container, rerender } = render(<Card>x</Card>);
    expect(container.firstElementChild?.classList.contains("md")).toBe(true);
    rerender(<Card padding="lg">x</Card>);
    expect(container.firstElementChild?.classList.contains("lg")).toBe(true);
  });

  it("renders a node title as given", () => {
    render(<Card title={<span>Year-1 gap</span>}>x</Card>);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("Year-1 gap")).toBeTruthy();
  });
});
