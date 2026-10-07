// @vitest-environment jsdom
import type { PlanItem, WeekPlan } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanList } from "./PlanList";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/week" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const item = (o: Partial<PlanItem>): PlanItem => ({
  id: "11111111-1111-4111-8111-111111111111",
  weekStart: "2026-10-05",
  title: "Hill Country STEM Award: two short answers",
  kind: "scholarship",
  refType: null,
  refId: null,
  minutes: 30,
  valueUsd: 1000,
  dueOn: "2026-10-15",
  status: "todo",
  contributors: ["scout", "quill"],
  priority: 0,
  createdAt: "2026-10-05T12:00:00.000Z",
  completedAt: null,
  ...o,
});

const plan: WeekPlan = {
  weekStart: "2026-10-05",
  items: [
    item({}),
    item({ id: "22222222-2222-4222-8222-222222222222", title: "Upload your transcript", status: "done", minutes: 5 }),
  ],
  totalMinutes: 35,
  doneCount: 1,
};

function stub(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PlanList", () => {
  it("renders items with time, meta, contributors, and the header", () => {
    stub(200, {});
    render(<PlanList plan={plan} />);
    expect(screen.getByText("30 min planned · 1 done")).toBeTruthy();
    expect(screen.getAllByText("$1,000 · due Oct 15")).toHaveLength(2);
    expect(screen.getAllByText("Scout")).toHaveLength(2);
    expect(screen.getByText("done")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Upload your transcript" }) as HTMLInputElement).checked).toBe(true);
  });

  it("checking an item PATCHes it done and refreshes", async () => {
    const fetchMock = stub(200, item({ status: "done" }));
    render(<PlanList plan={plan} />);
    const box = screen.getByRole("checkbox", {
      name: "Hill Country STEM Award: two short answers",
    }) as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/plan-items/11111111-1111-4111-8111-111111111111");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"status":"done"}' });
  });

  it("unchecking sends todo, and a failure reverts with the message", async () => {
    stub(404, { error: { code: "not_found", message: "Plan item not found" } });
    render(<PlanList plan={plan} />);
    const box = screen.getByRole("checkbox", { name: "Upload your transcript" }) as HTMLInputElement;
    fireEvent.click(box);
    expect(await screen.findByText("Plan item not found")).toBeTruthy();
    expect(box.checked).toBe(true);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("is read-only for parents", () => {
    const fetchMock = stub(200, {});
    render(<PlanList plan={plan} readOnly />);
    const box = screen.getByRole("checkbox", {
      name: "Hill Country STEM Award: two short answers",
    }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    fireEvent.click(box);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an empty state", () => {
    render(<PlanList plan={{ weekStart: "2026-10-05", items: [], totalMinutes: 0, doneCount: 0 }} />);
    expect(screen.getByText("Nothing planned yet")).toBeTruthy();
  });
});
