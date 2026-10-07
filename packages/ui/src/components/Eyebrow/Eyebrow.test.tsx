import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Eyebrow } from "./Eyebrow";

describe("Eyebrow", () => {
  it("renders a small uppercase label", () => {
    render(<Eyebrow>Prompt</Eyebrow>);
    expect(screen.getByText("Prompt").classList.contains("eyebrow")).toBe(true);
  });
});
