// @vitest-environment jsdom
import { SCAM_FLAG_TEXT } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardView } from "./BoardView";
import { board, card, summary } from "./fixtures";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/scholarships" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

const matched = card("matched", { name: "Lone Star Credit Union Award", slug: "lone-star", amountMaxUsd: 1500 });
const renewable = card("matched", { name: "First-Gen Futures", renewable: true, amountMaxUsd: 5000 });
const submitted = card("submitted", { name: "Eastside PTA Senior Award", amountMaxUsd: 500 });
const b = board({
  matched: [matched, renewable],
  submitted: [submitted],
  flagged: [
    {
      scholarship: summary({ name: "Golden Future Scholars Award", amountMaxUsd: 10000 }),
      reason: SCAM_FLAG_TEXT.application_fee,
    },
  ],
  privateCount: 0,
  totals: { inPlayUsd: 7000, wonUsd: 0, dueThisMonth: 1 },
});

describe("BoardView", () => {
  it("shows the private-match count only in the student's view", () => {
    const { unmount } = render(
      <BoardView board={board({ privateCount: 2 })} readOnly={false} timeZone="America/Chicago" />,
    );
    expect(screen.getByText("2 more matches use details you keep private")).toBeTruthy();
    unmount();
    render(<BoardView board={board({ privateCount: 2 })} readOnly timeZone="America/Chicago" />);
    expect(screen.queryByText("2 more matches use details you keep private")).toBeNull();
  });

  it("shows the columns, totals, and flagged listings with the reason", () => {
    render(<BoardView board={b} readOnly={false} timeZone="America/Chicago" />);
    expect(
      screen.getByText("$7,000 in play · $0 won · 1 due this month · Scout looks for new matches every Sunday"),
    ).toBeTruthy();
    const col = screen.getByRole("region", { name: "Matched 3" });
    expect(within(col).getByText(SCAM_FLAG_TEXT.application_fee)).toBeTruthy();
    expect(within(col).getByText("Hidden from your plan")).toBeTruthy();
    expect(within(col).getByRole("link", { name: "Why flagged?" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Submitted 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Renewable" }));
    expect(screen.getByRole("region", { name: "Matched 1" })).toBeTruthy();
  });

  it("shows a retired or under-review listing as not available, with no link to its page (R2P-4)", () => {
    const gone = board({
      flagged: [
        { scholarship: summary({ name: "Old Mill Award", slug: "old-mill" }), reason: "This listing was retired" },
      ],
    });
    render(<BoardView board={gone} readOnly={false} timeZone="America/Chicago" />);
    const article = screen.getByRole("article", { name: "Old Mill Award (not available)" });
    expect(within(article).getByText("This listing was retired")).toBeTruthy();
    expect(within(article).getByText("Not available")).toBeTruthy();
    expect(within(article).queryByText("Flagged")).toBeNull();
    expect(within(article).queryByRole("link")).toBeNull();
  });

  it("keeps scam reasons inline when moderation blocks the detail page", () => {
    render(
      <BoardView
        board={board({
          flagged: [
            {
              scholarship: summary({
                name: "Blocked scam",
                slug: "blocked-scam",
                status: "flagged",
                scamFlags: ["application_fee"],
              }),
              reason: SCAM_FLAG_TEXT.application_fee,
            },
          ],
        })}
        readOnly={false}
        timeZone="America/Chicago"
      />,
    );
    expect(screen.getByText(SCAM_FLAG_TEXT.application_fee)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Why flagged?" })).toBeNull();
  });

  it("saves a match to Working on", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(matched.application));
    vi.stubGlobal("fetch", fetchMock);
    render(<BoardView board={b} readOnly={false} timeZone="America/Chicago" />);
    const lone = screen.getByRole("article", { name: "Lone Star Credit Union Award" });
    fireEvent.click(within(lone).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/scholarship-applications/${matched.application.id}`,
      expect.objectContaining({ method: "PATCH", body: '{"stage":"planned"}' }),
    );
  });

  it("validates the won dialog before saving the amount and renewability", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(submitted.application));
    vi.stubGlobal("fetch", fetchMock);
    render(<BoardView board={b} readOnly={false} timeZone="America/Chicago" />);
    fireEvent.click(
      within(screen.getByRole("article", { name: "Eastside PTA Senior Award" })).getByRole("button", {
        name: "Mark won",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "You won Eastside PTA Senior Award" });
    const amount = within(dialog).getByRole("textbox", { name: "Amount you won" });
    fireEvent.change(amount, { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save win" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Enter the amount you won in whole dollars.");
    fireEvent.change(amount, { target: { value: "1,000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save win" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Pick one-time or renewable.");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Renewable/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save win" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      stage: "won",
      outcomeUsd: 1000,
      outcomeRenewable: true,
    });
  });

  it("adds a local scholarship with one request (the core puts it on the board)", async () => {
    const local = summary({ name: "Maple Rotary", unverified: true });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(local, 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<BoardView board={b} readOnly={false} timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "Add a local scholarship" }));
    const dialog = screen.getByRole("dialog", { name: "Add a local scholarship" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Link to the listing" }), {
      target: { value: "maple.example.org" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add it" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Paste the full link, starting with https://");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Link to the listing" }), {
      target: { value: "https://maple.example.org/award" },
    });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Scholarship name" }), {
      target: { value: "Maple Rotary" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add it" }));
    await waitFor(() => expect(within(dialog).getByText(/marked unverified until we check/)).toBeTruthy());
    expect(within(dialog).getByText(/Added to your board/)).toBeTruthy();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/v1/scholarships/local"]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      url: "https://maple.example.org/award",
      name: "Maple Rotary",
      notes: "",
    });
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("shows a student's own unpublished submission as amount unknown, not $0 (R3V-1)", () => {
    const draft = card("planned", {
      name: "Maple Rotary",
      status: "draft",
      unverified: true,
      amountMinUsd: 0,
      amountMaxUsd: 0,
      deadline: null,
    });
    render(<BoardView board={board({ working: [draft] })} readOnly={false} timeZone="America/Chicago" />);
    const article = screen.getByRole("article", { name: "Maple Rotary" });
    expect(within(article).getByText("Amount not known yet")).toBeTruthy();
    expect(within(article).queryByText("$0")).toBeNull();
  });

  it("is read-only for parents", () => {
    render(<BoardView board={b} readOnly timeZone="America/Chicago" />);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a local scholarship" })).toBeNull();
  });
});
