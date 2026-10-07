import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tag } from "./Tag";

describe("Tag", () => {
  it("renders a small rounded label", () => {
    render(<Tag>service</Tag>);
    expect(screen.getByText("service").classList.contains("tag")).toBe(true);
  });
});
