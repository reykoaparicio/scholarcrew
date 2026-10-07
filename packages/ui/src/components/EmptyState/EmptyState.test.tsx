import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("shows a title, description, and action", () => {
    render(
      <EmptyState title="No matches yet" action={<a href="/crew">Ask Scout</a>}>
        Scout looks every Sunday.
      </EmptyState>,
    );
    expect(screen.getByText("No matches yet")).toBeTruthy();
    expect(screen.getByText("Scout looks every Sunday.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ask Scout" }).getAttribute("href")).toBe("/crew");
  });

  it("renders an optional icon", () => {
    const { container } = render(<EmptyState title="Nothing here" icon="bookmark" />);
    expect(container.querySelector('[data-icon="bookmark"]')).not.toBeNull();
  });
});
