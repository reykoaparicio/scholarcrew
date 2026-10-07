// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LineReview } from "./LineReview";
import { STATE_U, offer } from "./fixtures";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/money/offers/x" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const review = () => offer({ status: "needs_review", confirmedAt: null });

describe("LineReview", () => {
  it("PATCHes a line when its category changes", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<LineReview offer={review()} readOnly={false} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Direct Subsidized Loan category" }), {
      target: { value: "loan_federal_unsubsidized" },
    });
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/offer-lines/22222222-0000-4000-8000-000000000004");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      body: '{"category":"loan_federal_unsubsidized"}',
    });
  });

  it("saves an edited amount on blur and rejects bad amounts", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<LineReview offer={review()} readOnly={false} />);
    const amount = screen.getByRole("textbox", { name: "Merit Scholarship amount" });
    fireEvent.change(amount, { target: { value: "3.5k" } });
    fireEvent.blur(amount);
    expect(screen.getByRole("alert").textContent).toBe("Amounts are whole dollars up to $200,000.");
    fireEvent.change(amount, { target: { value: "3,500" } });
    fireEvent.blur(amount);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ amountUsd: 3500 });
  });

  it("shows the cited text for a page chip and confirms the offer", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<LineReview offer={review()} readOnly={false} />);
    const chip = screen.getAllByRole("button", { name: "p.2" })[0] as HTMLElement;
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("From your letter, page 2: “State U Grant ... $15,600”")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm these lines" }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/money/offers"));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/offers/${STATE_U}/confirm`);
  });

  it("is read-only once confirmed or for parents", () => {
    render(<LineReview offer={offer()} readOnly />);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm these lines" })).toBeNull();
    expect(screen.getByText("Federal work-study")).toBeTruthy();
  });
});
