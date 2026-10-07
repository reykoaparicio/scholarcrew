import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders a link when href is set", () => {
    render(
      <Button variant="primary" href="/crew">
        Ask your crew
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Ask your crew" });
    expect(link.getAttribute("href")).toBe("/crew");
    expect(link.classList.contains("btn")).toBe(true);
    expect(link.classList.contains("primary")).toBe(true);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a type=button button by default", () => {
    render(<Button variant="line">New chat</Button>);
    expect(screen.getByRole("button", { name: "New chat" }).getAttribute("type")).toBe("button");
  });

  it("passes type through", () => {
    render(
      <Button variant="primary" type="submit">
        Save
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("type")).toBe("submit");
  });

  it("calls onClick, but not when disabled", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button variant="soft" onClick={onClick}>
        Add
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Button variant="soft" onClick={onClick} disabled>
        Add
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Add" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a disabled button instead of a link when disabled", () => {
    render(
      <Button variant="primary" href="/x" disabled>
        Go
      </Button>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect((screen.getByRole("button", { name: "Go" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders leading and trailing icons and the small size", () => {
    const { container } = render(
      <Button variant="white" size="sm" icon="plus" iconEnd="arrow">
        Open
      </Button>,
    );
    expect(container.querySelector('[data-icon="plus"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="arrow"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open" }).classList.contains("sm")).toBe(true);
  });
});
