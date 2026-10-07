// @vitest-environment jsdom
import ScholarshipsPage from "@/app/(app)/scholarships/page";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchResults } from "./SearchResults";
import { board, summary } from "./fixtures";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
const pm = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  getFamily: vi.fn(),
  getBoard: vi.fn(),
  searchScholarships: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/scholarships" }));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: pm.requireAppActor }));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: pm.getFamily }));
vi.mock("@scholarcrew/core/scholarships", () => ({ getBoard: pm.getBoard, searchScholarships: pm.searchScholarships }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const open = summary({ name: "Coding for Good Award", amountMaxUsd: 1000 });
const saved = summary({ name: "Hill Country STEM Award" });
const scam = summary({ name: "Golden Future", scamFlags: ["application_fee"] });

describe("SearchResults", () => {
  it("lists results, marks saved ones, explains flags, and saves on click", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SearchResults
        query="stem"
        results={{ items: [open, saved, scam], page: 1, pageSize: 20, total: 3 }}
        savedIds={[saved.id]}
        readOnly={false}
      />,
    );
    expect(screen.getByRole("heading", { name: '3 results for "stem"' })).toBeTruthy();
    expect(
      within(screen.getByRole("listitem", { name: "Hill Country STEM Award" })).getByText("On your board"),
    ).toBeTruthy();
    expect(screen.getByText("Charges a fee to apply. Real scholarships don't charge you to apply.")).toBeTruthy();
    expect(within(screen.getByRole("listitem", { name: "Golden Future" })).queryByRole("button")).toBeNull();
    fireEvent.click(
      within(screen.getByRole("listitem", { name: "Coding for Good Award" })).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/scholarship-applications");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ scholarshipId: open.id });
  });

  it("says when nothing matched", () => {
    render(
      <SearchResults query="zzz" results={{ items: [], page: 1, pageSize: 20, total: 0 }} savedIds={[]} readOnly />,
    );
    expect(screen.getByText("No published scholarships match that search yet.")).toBeTruthy();
  });
});

describe("/scholarships search", () => {
  it("searches only listings still open on the student's today (R3V-2)", async () => {
    // 03:00 UTC on Oct 7 is still Oct 6 in Chicago, so a listing due Oct 6 is still open.
    pm.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: "s1", role: "student" },
      me: {
        user: { id: "s1", displayName: "Maya Rivera", role: "student", timeZone: "America/Chicago" },
        onboardingComplete: true,
      },
      deps: { clock: { now: () => new Date("2026-10-07T03:00:00.000Z") } },
    });
    pm.getBoard.mockResolvedValue(board());
    pm.searchScholarships.mockResolvedValue({ items: [open], page: 1, pageSize: 20, total: 1 });
    render(await ScholarshipsPage({ searchParams: Promise.resolve({ q: "stem" }) }));
    expect(pm.searchScholarships.mock.calls[0]?.[2]).toEqual({
      q: "stem",
      page: 1,
      pageSize: 20,
      openOn: "2026-10-06",
    });
    expect(screen.getByRole("heading", { name: '1 results for "stem"' })).toBeTruthy();
  });
});
