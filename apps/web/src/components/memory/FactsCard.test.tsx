// @vitest-environment jsdom
import type { MemoryFact } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidatesCard, FactsCard } from "./FactsCard";
import { factLabel, textToValue, visibilityOptionsFor } from "./labels";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/memory" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const fact = (o: Partial<MemoryFact> = {}): MemoryFact => ({
  id: "11111111-1111-4111-8111-111111111111",
  key: "intended_majors",
  value: ["Mechanical engineering"],
  valueText: "Mechanical engineering",
  source: "user_stated",
  sourceRef: null,
  visibility: "crew",
  status: "confirmed",
  createdAt: "2026-10-01T15:00:00.000Z",
  confirmedAt: "2026-10-01T15:00:00.000Z",
  expiresAt: null,
  ...o,
});

describe("labels", () => {
  it("humanizes keys and keeps value types when editing", () => {
    expect(factLabel("intended_majors")).toBe("Intended majors");
    expect(textToValue(["a"], "x, y")).toEqual(["x", "y"]);
    expect(textToValue(3, "4")).toBe(4);
    expect(textToValue(3, "four")).toBe("four");
    expect(textToValue(true, "no")).toBe(false);
    expect(textToValue("Maple", " Travis ")).toBe("Travis");
  });
});

describe("FactsCard (ME-01, ME-02)", () => {
  it("shows value, source with date, and who can use it", () => {
    render(
      <FactsCard
        facts={[
          fact(),
          fact({
            id: "2",
            key: "county",
            value: "Maple",
            valueText: "Maple",
            visibility: "scout_only",
            source: "parent_shared",
          }),
        ]}
        timeZone="America/Chicago"
      />,
    );
    expect(screen.getByText("Intended majors")).toBeTruthy();
    expect(screen.getByText("You · Oct 1")).toBeTruthy();
    expect(screen.getByText("Shared by family · Oct 1")).toBeTruthy();
    expect(screen.getByText("Scout only")).toBeTruthy();
  });

  it("edits a fact, replacing it with the new version", async () => {
    const updated = fact({
      id: "33333333-3333-4333-8333-333333333333",
      value: ["Nursing"],
      valueText: "Nursing",
      visibility: "crew_family",
    });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(updated));
    vi.stubGlobal("fetch", fetchMock);
    render(<FactsCard facts={[fact()]} timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Intended majors" }));
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "Nursing" } });
    fireEvent.change(screen.getByLabelText("Who can use it"), { target: { value: "crew_family" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Nursing")).toBeTruthy();
    expect(screen.getByText("Crew + family")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/facts/11111111-1111-4111-8111-111111111111");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ value: ["Nursing"], visibility: "crew_family" }),
    });
  });

  it("forgets a fact right away", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<FactsCard facts={[fact()]} timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "Forget Intended majors" }));
    await waitFor(() => expect(screen.queryByText("Mechanical engineering")).toBeNull());
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("offers Scout only just for the matcher's profile keys (R2I-10)", () => {
    const options = () =>
      Array.from((screen.getByLabelText("Who can use it") as HTMLSelectElement).options).map((o) => o.text);
    render(
      <FactsCard
        facts={[
          fact(),
          fact({
            id: "66666666-6666-4666-8666-666666666666",
            key: "distance_pref",
            value: "Within 3 hours",
            valueText: "Within 3 hours",
          }),
        ]}
        timeZone="America/Chicago"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Intended majors" }));
    expect(options()).toEqual(["Crew", "Crew + family", "Scout only", "Private"]);
    expect(screen.queryByText("Used for scholarship matching only")).toBeNull();
    fireEvent.change(screen.getByLabelText("Who can use it"), { target: { value: "scout_only" } });
    expect(screen.getByText("Used for scholarship matching only")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Distance pref" }));
    expect(options()).toEqual(["Crew", "Crew + family", "Private"]);
    expect(visibilityOptionsFor("county", "crew").map((o) => o.value)).toContain("scout_only");
    expect(visibilityOptionsFor("distance_pref", "scout_only").map((o) => o.value)).toContain("scout_only");
  });
});

describe("CandidatesCard (ME-03)", () => {
  it("confirms or rejects guesses", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      json(fact({ status: url.endsWith("/confirm") ? "confirmed" : "rejected" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CandidatesCard
        candidates={[
          fact({
            id: "44444444-4444-4444-8444-444444444444",
            status: "candidate",
            key: "possible_major",
            value: "Nursing",
            valueText: "Nursing",
          }),
          fact({
            id: "55555555-5555-4555-8555-555555555555",
            status: "candidate",
            key: "distance_pref",
            value: "Within 3 hours",
            valueText: "Within 3 hours",
          }),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remember Possible major" }));
    fireEvent.click(screen.getByRole("button", { name: "No to Distance pref" }));
    await waitFor(() => expect(screen.getByText(/Nothing waiting/)).toBeTruthy());
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/facts/44444444-4444-4444-8444-444444444444/confirm",
      "/api/v1/facts/55555555-5555-4555-8555-555555555555/reject",
    ]);
  });
});
