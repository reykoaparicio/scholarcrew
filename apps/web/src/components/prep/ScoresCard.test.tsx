// @vitest-environment jsdom
import type { Superscore, TestScore } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoresCard } from "./ScoresCard";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/prep" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const scores: TestScore[] = [
  {
    id: "t1",
    test: "ACT",
    takenOn: "2026-09-12",
    official: true,
    composite: 27,
    sections: { english: 26, math: 28, reading: 27 },
    createdAt: "2026-09-20T15:00:00.000Z",
  },
  {
    id: "t2",
    test: "ACT",
    takenOn: "2026-09-26",
    official: false,
    composite: 28,
    sections: { english: 28, math: 29, reading: 27 },
    createdAt: "2026-09-27T15:00:00.000Z",
  },
];
const superscores: Superscore[] = [
  {
    test: "ACT",
    composite: 28,
    sections: { english: 29, math: 28, reading: 27 },
    fromDates: ["2026-06-13", "2026-09-12"],
  },
];

describe("ScoresCard", () => {
  it("lists official and practice scores with the superscore", () => {
    render(<ScoresCard scores={scores} superscores={superscores} readOnly={false} />);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1] as HTMLElement).getByText("ACT · Sep 12")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("Official")).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText("Practice")).toBeTruthy();
    expect(screen.getByText("ACT superscore")).toBeTruthy();
    expect(screen.getByText("Best official section from 2 test dates. Practice tests don't count.")).toBeTruthy();
  });

  it("deletes a score", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScoresCard scores={scores} superscores={[]} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete ACT Sep 12 score" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]).toEqual(["/api/v1/test-scores/t1", expect.objectContaining({ method: "DELETE" })]);
  });

  it("validates and adds a score with sections", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScoresCard scores={[]} superscores={[]} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a score" }));
    const dialog = screen.getByRole("dialog", { name: "Add a score" });
    fireEvent.change(within(dialog).getByLabelText("Test date"), { target: { value: "2026-10-24" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Composite" }), { target: { value: "40" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save score" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("ACT composites run from 1 to 36.");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Composite" }), { target: { value: "29" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Math" }), { target: { value: "30" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save score" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      test: "ACT",
      takenOn: "2026-10-24",
      official: true,
      composite: 29,
      sections: { math: 30 },
    });
  });

  it("hides editing for parents", () => {
    render(<ScoresCard scores={scores} superscores={[]} readOnly />);
    expect(screen.queryByRole("button", { name: "Add a score" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  });
});
