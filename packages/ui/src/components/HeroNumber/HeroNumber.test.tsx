import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroNumber } from "./HeroNumber";

describe("HeroNumber", () => {
  it("shows the value and caption", () => {
    render(<HeroNumber value="$9,200" caption="left to pay, earn, or borrow · estimate" />);
    expect(screen.getByText("$9,200").classList.contains("num")).toBe(true);
    expect(screen.getByText("left to pay, earn, or borrow · estimate")).toBeTruthy();
  });
});
