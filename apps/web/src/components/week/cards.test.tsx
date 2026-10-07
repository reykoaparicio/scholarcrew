// @vitest-environment jsdom
import type { CostSummary, CrewJob, Deadline, PlanItem } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskBar } from "./AskBar";
import { ComingUp } from "./ComingUp";
import { CrewWorking } from "./CrewWorking";
import { GapCard } from "./GapCard";
import { NextStepHero } from "./NextStepHero";
import { PlanWeekButton } from "./PlanWeekButton";
import { SweepCard } from "./SweepCard";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/week" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const next: PlanItem = {
  id: "11111111-1111-4111-8111-111111111111",
  weekStart: "2026-10-05",
  title: "Finish the Hill Country STEM Award",
  kind: "essay",
  refType: "essay",
  refId: "e1",
  minutes: 30,
  valueUsd: 1000,
  dueOn: "2026-10-15",
  status: "todo",
  contributors: ["compass", "scout", "quill"],
  priority: 0,
  createdAt: "2026-10-05T12:00:00.000Z",
  completedAt: null,
};

const gap: CostSummary = {
  collegeId: "100001",
  collegeName: "State U",
  source: "scorecard",
  sourceLabel: "Estimate from College Scorecard",
  costOfAttendanceUsd: 27800,
  freeMoneyUsd: 18600,
  gapUsd: 9200,
  pendingUsd: 4750,
  gapIfPendingWinUsd: 4450,
  isEstimate: true,
  budgetUsd: null,
  gapAfterBudgetUsd: null,
};

const deadline = (o: Partial<Deadline>): Deadline => ({
  kind: "scholarship",
  title: "Hill Country STEM Award",
  dueOn: "2026-10-15",
  daysLeft: 9,
  refType: "scholarship",
  refId: "s1",
  valueUsd: 1000,
  warning: true,
  ...o,
});

describe("NextStepHero", () => {
  it("shows the step, its crew, and an Open link", () => {
    render(<NextStepHero item={next} weekStart="2026-10-05" />);
    expect(screen.getByRole("heading", { name: "Finish the Hill Country STEM Award" })).toBeTruthy();
    expect(screen.getByText("$1,000 · due Thu, Oct 15 · about 30 min")).toBeTruthy();
    expect(screen.getByText(/with Scout \+ Quill/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open in Essay Studio" }).getAttribute("href")).toBe("/essays/e1");
  });

  it("Not this week moves the item to next week", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<NextStepHero item={next} weekStart="2026-10-05" />);
    fireEvent.click(screen.getByRole("button", { name: "Not this week" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"weekStart":"2026-10-12"}' });
  });

  it("hides Not this week when read-only", () => {
    render(<NextStepHero item={next} weekStart="2026-10-05" readOnly />);
    expect(screen.queryByRole("button", { name: "Not this week" })).toBeNull();
  });
});

describe("GapCard", () => {
  it("shows the gap, the pending note, and the Ledger source line", () => {
    render(<GapCard gap={gap} />);
    expect(screen.getByText("Year-1 gap · State U")).toBeTruthy();
    expect(screen.getAllByText("$9,200").length).toBeGreaterThan(0);
    expect(screen.getByText("left to pay, earn, or borrow · estimate")).toBeTruthy();
    expect(screen.getByText("$4,750")).toBeTruthy();
    expect(screen.getByText("$4,450")).toBeTruthy();
    expect(screen.getByText(/Estimate from College Scorecard/)).toBeTruthy();
  });

  it("asks for a college when there's no gap yet", () => {
    render(<GapCard gap={null} />);
    expect(screen.getByText("Add a college to see your gap")).toBeTruthy();
  });
});

describe("ComingUp", () => {
  it("warns on items due within 14 days", () => {
    render(
      <ComingUp
        deadlines={[
          deadline({}),
          deadline({
            title: "State U · Early Action",
            dueOn: "2026-11-01",
            daysLeft: 26,
            warning: false,
            valueUsd: null,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Hill Country STEM Award · $1,000")).toBeTruthy();
    expect(screen.getByText("9 days").closest("span")?.className).toContain("warn");
    expect(screen.getByText("26 days").className).toContain("days");
    expect(screen.getByText("Nov 1")).toBeTruthy();
  });

  it("has an empty state", () => {
    render(<ComingUp deadlines={[]} />);
    expect(screen.getByText("Nothing due in the next few weeks.")).toBeTruthy();
  });
});

describe("SweepCard", () => {
  it("summarizes the last sweep", () => {
    render(
      <SweepCard
        sweep={{ ranAt: "2026-10-04T19:00:00.000Z", newMatches: 3, totalUsd: 7500, reuseCount: 2, hiddenScams: 1 }}
        timeZone="America/Chicago"
      />,
    );
    expect(screen.getByText("Sunday's sweep")).toBeTruthy();
    expect(screen.getByText("3 new matches worth $7,500")).toBeTruthy();
    expect(screen.getByText("2 reuse your essays · 1 hidden for charging a fee")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review matches" }).getAttribute("href")).toBe("/scholarships");
  });

  it("explains that the first sweep is coming", () => {
    render(<SweepCard sweep={null} timeZone="America/Chicago" />);
    expect(screen.getByText("Scout runs your first sweep soon.")).toBeTruthy();
  });
});

describe("AskBar", () => {
  it("sends the question to the Crew screen", () => {
    render(<AskBar />);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask your crew" }), {
      target: { value: "Can I still apply Early Action?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(router.push).toHaveBeenCalledWith("/crew?prefill=Can%20I%20still%20apply%20Early%20Action%3F");
  });

  it("chips prefill the composer and blank questions go nowhere", () => {
    render(<AskBar />);
    fireEvent.click(screen.getByRole("button", { name: "@Scout local scholarships" }));
    expect(router.push).toHaveBeenCalledWith("/crew?prefill=%40Scout%20local%20scholarships");
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});

describe("CrewWorking", () => {
  it("refreshes the page while the first plan is built", () => {
    vi.useFakeTimers();
    render(<CrewWorking intervalMs={1000} maxRefreshes={2} />);
    expect(screen.getByText("Your crew is working")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });
});

describe("PlanWeekButton (R2C-5)", () => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    url: string;
    listeners = new Map<string, Array<(e: MessageEvent<string>) => void>>();
    constructor(url: string) {
      this.url = url;
      FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    }
    emit(type: string, data = "{}") {
      for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data }));
    }
    close() {}
  }

  const planJob = (o: Partial<CrewJob> = {}): CrewJob => ({
    id: "66666666-6666-4666-8666-666666666666",
    kind: "weekly_plan",
    status: "queued",
    conversationId: null,
    requestMessageId: null,
    resultMessageId: null,
    refId: null,
    progress: [],
    error: null,
    safety: null,
    createdAt: "2026-10-06T15:00:00.000Z",
    updatedAt: "2026-10-06T15:00:00.000Z",
    ...o,
  });

  const respond = (data: unknown, status: number) =>
    vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }),
    );

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  it("posts /plan/regenerate, follows the job, and refreshes when it's done", async () => {
    const fetchMock = respond(planJob(), 202);
    vi.stubGlobal("fetch", fetchMock);
    render(<PlanWeekButton />);
    fireEvent.click(screen.getByRole("button", { name: "Plan my week" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/plan/regenerate");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(FakeEventSource.instances[0]?.url).toBe(`/api/v1/jobs/${planJob().id}/events`);
    expect((screen.getByRole("button", { name: "Planning…" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(planJob({ status: "working" }))));
    expect(router.refresh).not.toHaveBeenCalled();
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(planJob({ status: "ready" }))));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect((screen.getByRole("button", { name: "Plan my week" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the allowance message with a See plans link on 402", async () => {
    vi.stubGlobal(
      "fetch",
      respond(
        {
          error: {
            code: "limit_reached",
            message:
              "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.",
          },
        },
        402,
      ),
    );
    render(<PlanWeekButton />);
    fireEvent.click(screen.getByRole("button", { name: "Plan my week" }));
    expect(
      await screen.findByText(
        "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/settings");
    expect(FakeEventSource.instances).toHaveLength(0);
    expect((screen.getByRole("button", { name: "Plan my week" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
