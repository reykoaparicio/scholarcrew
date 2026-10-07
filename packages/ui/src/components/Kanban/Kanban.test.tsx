import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Kanban } from "./Kanban";

describe("Kanban", () => {
  it("renders a named region per column with its count and cards", () => {
    render(
      <Kanban
        columns={[
          { key: "matched", title: "Matched", count: 4, children: <p>Lone Star Credit Union Award</p> },
          { key: "won", title: "Won", count: 1, children: <p>Maple Library Essay Prize</p> },
        ]}
      />,
    );
    const matched = screen.getByRole("region", { name: "Matched 4" });
    expect(within(matched).getByText("Lone Star Credit Union Award")).toBeTruthy();
    expect(within(matched).queryByText("Maple Library Essay Prize")).toBeNull();
    expect(screen.getByRole("region", { name: "Won 1" })).toBeTruthy();
  });

  it("shows column titles as level-2 headings", () => {
    render(<Kanban columns={[{ key: "submitted", title: "Submitted", count: 2, children: null }]} />);
    expect(screen.getByRole("heading", { level: 2, name: "Submitted 2" })).toBeTruthy();
  });
});
