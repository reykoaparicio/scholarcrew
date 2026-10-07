// @vitest-environment jsdom
import AppError from "@/app/(app)/error";
import AppLoading from "@/app/(app)/loading";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

describe("(app) boundaries (E-16-4)", () => {
  it("shows a plain error with Try again and never the error's message", () => {
    const reset = vi.fn();
    render(<AppError error={new Error("connect ECONNREFUSED 10.0.0.5:5432")} reset={reset} />);
    expect(screen.getByRole("heading", { name: "Something went wrong on our side" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("ECONNREFUSED");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("marks the loading state busy", () => {
    render(<AppLoading />);
    expect(screen.getByText("Loading…").closest('[aria-busy="true"]')).not.toBeNull();
  });
});
