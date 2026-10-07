// @vitest-environment jsdom
import type { OfferComparison } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfferTool, TOO_BIG } from "./OfferTool";

const COMPARISON: OfferComparison = {
  columns: [
    {
      offerId: "offer-1",
      collegeId: "",
      collegeName: "Maple State",
      costOfAttendanceUsd: 28000,
      freeMoneyUsd: 12000,
      workStudyUsd: 2000,
      loansUsd: 5500,
      letterSaysOweUsd: 8500,
      reallyCostsUsd: 16000,
      fourYearUsd: 76000,
      oneTimeFreeUsd: 4000,
      warnings: ["$4,000 Merit award is year 1 only"],
    },
    {
      offerId: "offer-2",
      collegeId: "",
      collegeName: "Bay Tech",
      costOfAttendanceUsd: 41000,
      freeMoneyUsd: 30000,
      workStudyUsd: 0,
      loansUsd: 3500,
      letterSaysOweUsd: 7500,
      reallyCostsUsd: 11000,
      fourYearUsd: 44000,
      oneTimeFreeUsd: 0,
      warnings: [],
    },
  ],
  lowestFourYearOfferId: "offer-2",
  assumptions: ["Costs stay flat for 4 years", "Renewable awards are kept"],
};

afterEach(cleanup);

function change(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } });
}

describe("OfferTool", () => {
  it("shows validation errors and sends nothing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<OfferTool />);
    fireEvent.click(screen.getByRole("button", { name: "Compare offers" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("School 1: add the school's name.");
    expect(alert.textContent).toContain("School 2: enter the cost of attendance in whole dollars.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the offers and renders the comparison", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(COMPARISON), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<OfferTool />);
    fireEvent.click(screen.getByRole("button", { name: "Remove School 2" }));
    change(screen.getByLabelText("School name"), "Maple State");
    change(screen.getByLabelText("Cost of attendance per year"), "$28,000");
    change(screen.getByLabelText("Line type"), "grant");
    change(screen.getByLabelText("Label"), "Pell Grant");
    change(screen.getByLabelText("Amount"), "7,395");
    fireEvent.click(screen.getByRole("switch", { name: "Renews each year" }));
    fireEvent.click(screen.getByRole("button", { name: "Compare offers" }));
    await waitFor(() => expect(screen.getByText("What each offer really costs")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/public/offer-tool");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      offers: [
        {
          name: "Maple State",
          costOfAttendanceUsd: 28000,
          lines: [{ label: "Pell Grant", amountUsd: 7395, category: "grant", renewable: true }],
        },
      ],
    });
    expect(screen.getByText("Lowest 4-year cost: Bay Tech")).toBeTruthy();
    expect(screen.getAllByText("$76,000").length).toBeGreaterThan(0);
    expect(screen.getByText("Maple State: $4,000 Merit award is year 1 only")).toBeTruthy();
    expect(screen.getByText("Costs stay flat for 4 years")).toBeTruthy();
    expect(screen.getByText(/Nothing you typed was saved/)).toBeTruthy();
  });

  it("explains a 413 from the 64 KB public body cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "invalid_input", message: "Request body is too large" } }), {
            status: 413,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    render(<OfferTool />);
    fireEvent.click(screen.getByRole("button", { name: "Remove School 2" }));
    change(screen.getByLabelText("School name"), "Maple State");
    change(screen.getByLabelText("Cost of attendance per year"), "28000");
    change(screen.getByLabelText("Label"), "Pell Grant");
    change(screen.getByLabelText("Amount"), "7395");
    fireEvent.click(screen.getByRole("button", { name: "Compare offers" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(TOO_BIG));
    expect(screen.queryByText("What each offer really costs")).toBeNull();
  });

  it("adds up to 4 schools and more lines", () => {
    render(<OfferTool />);
    const add = screen.getByRole("button", { name: "Add a school" });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(screen.getAllByLabelText("School name")).toHaveLength(4);
    expect((screen.getByRole("button", { name: "Add a school" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Add a line" })[0] as HTMLElement);
    expect(screen.getAllByLabelText("Amount")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Remove line 2 from School 1" }));
    expect(screen.getAllByLabelText("Amount")).toHaveLength(4);
  });
});
