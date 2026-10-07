import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type OfferBarRow, OfferBars } from "./OfferBars";

const ROWS: OfferBarRow[] = [
  {
    label: "State U",
    sub: "$27,800 to attend",
    freeUsd: 18600,
    costUsd: 9200,
    endLabel: (
      <>
        <b>$9,200</b> really costs you
      </>
    ),
  },
  {
    label: "Riverside College",
    sub: "$31,200 to attend",
    freeUsd: 24400,
    costUsd: 6800,
    endLabel: (
      <>
        <b>$6,800</b> this year
      </>
    ),
  },
  { label: "Northgate University", sub: "$68,400 to attend", freeUsd: 55600, costUsd: 12800, endLabel: <b>$12,800</b> },
];

function seg(container: HTMLElement, row: string, series: "free" | "cost") {
  return container.querySelector<HTMLElement>(`[data-row="${row}"] [data-series="${series}"]`);
}

describe("OfferBars", () => {
  it("sizes segments against the shared axis max", () => {
    const { container } = render(<OfferBars rows={ROWS} axisMaxUsd={80000} />);
    expect(seg(container, "State U", "free")?.style.width).toBe("23.3%");
    expect(seg(container, "State U", "cost")?.style.width).toBe("11.5%");
    expect(seg(container, "Riverside College", "free")?.style.width).toBe("30.5%");
    expect(seg(container, "Riverside College", "cost")?.style.width).toBe("8.5%");
    expect(seg(container, "Northgate University", "free")?.style.width).toBe("69.5%");
    expect(seg(container, "Northgate University", "cost")?.style.width).toBe("16%");
    expect(seg(container, "State U", "cost")?.classList.contains("cap")).toBe(true);
    expect(seg(container, "State U", "free")?.classList.contains("cap")).toBe(false);
  });

  it("draws ticks every quarter of the axis", () => {
    const { container } = render(<OfferBars rows={ROWS} axisMaxUsd={80000} />);
    const ticks = Array.from(container.querySelectorAll(".axis span")).map((t) => t.textContent);
    expect(ticks).toEqual(["$0", "$20k", "$40k", "$60k", "$80k"]);
  });

  it("shows row labels, end labels, and a two-entry legend", () => {
    const { container } = render(<OfferBars rows={ROWS} axisMaxUsd={80000} />);
    expect(screen.getByText("$27,800 to attend")).toBeTruthy();
    expect(screen.getByText("really costs you")).toBeTruthy();
    const legend = container.querySelector(".legend");
    expect(legend?.textContent).toBe("Free money (grants + scholarships)Really costs you (pay, earn, or borrow)");
    expect(legend?.querySelectorAll(".sw")).toHaveLength(2);
  });

  it("has a table twin with every value", () => {
    render(<OfferBars rows={ROWS} axisMaxUsd={80000} />);
    const table = screen.getByRole("table", { name: "Year 1 free money and cost by school" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual([
      "School",
      "Free money (grants + scholarships)",
      "Really costs you (pay, earn, or borrow)",
    ]);
    const row = within(table).getByRole("row", { name: /State U/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["$18,600", "$9,200"]);
    expect(within(table).getAllByRole("row")).toHaveLength(4);
  });

  it("caps a bar that runs past the axis", () => {
    const rows: OfferBarRow[] = [{ label: "Big", sub: "", freeUsd: 70000, costUsd: 20000, endLabel: "$20,000" }];
    const { container } = render(<OfferBars rows={rows} axisMaxUsd={80000} />);
    expect(seg(container, "Big", "free")?.style.width).toBe("87.5%");
    expect(seg(container, "Big", "cost")?.style.width).toBe("12.5%");
  });

  it("shows a value tooltip on hover and hides it on leave", () => {
    const { container } = render(<OfferBars rows={ROWS} axisMaxUsd={80000} />);
    const track = container.querySelector<HTMLElement>('[data-row="State U"]');
    if (!track) throw new Error("missing State U track");
    fireEvent.pointerEnter(track);
    const tip = container.querySelector(".tip");
    expect(tip?.textContent).toContain("$18,600");
    expect(tip?.textContent).toContain("$9,200");
    fireEvent.pointerLeave(track);
    expect(container.querySelector(".tip")).toBeNull();
  });
});
