// @vitest-environment jsdom
import type { CrewJob, Message } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetakeForm } from "./RetakeForm";
import { StudyPlan } from "./StudyPlan";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/prep" }));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
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
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const JOB = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const MSG = "33333333-3333-4333-8333-333333333333";
const job = (status: CrewJob["status"]): CrewJob => ({
  id: JOB,
  kind: "retake_analysis",
  status,
  conversationId: status === "ready" ? CONV : null,
  requestMessageId: null,
  resultMessageId: status === "ready" ? MSG : null,
  refId: "ACT",
  progress: [],
  error: null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
});
const reply: Message = {
  id: MSG,
  conversationId: CONV,
  authorKind: "crew",
  authorUserId: null,
  body: "",
  reply: {
    text: "Here's what the retake numbers say for your list.",
    contributors: ["prep"],
    question: null,
    actionCards: [],
    receipt: [],
    safety: null,
    needsInput: false,
  },
  createdAt: "2026-10-06T15:01:00.000Z",
  appliedCardIds: [],
  sharedCategories: null,
};
const inputs = {
  colleges: [
    {
      id: "100",
      name: "State U",
      meritTiers: [
        { label: "Merit", minGpa: 3.5, minAct: null, minSat: null, annualUsd: 3000, renewalGpa: 3 },
        { label: "Dean's", minGpa: 3.5, minAct: 29, minSat: null, annualUsd: 5000, renewalGpa: 3 },
      ],
    },
  ],
  gpa: 3.72,
  currentAct: 28,
  currentSat: null,
};

describe("RetakeForm", () => {
  it("shows empty-list and unhelpful-target refusals without starting a stream", async () => {
    for (const message of ["Add colleges with merit scholarships first.", "Pick a target above your best score."]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json({ error: { code: "invalid_input", message } }, 400)),
      );
      const { unmount } = render(<RetakeForm inputs={inputs} timeZone="America/Chicago" />);
      fireEvent.click(screen.getByRole("button", { name: "29" }));
      fireEvent.click(screen.getByRole("button", { name: "Run the numbers" }));
      expect((await screen.findByRole("alert")).textContent).toBe(message);
      expect(FakeEventSource.instances).toHaveLength(0);
      unmount();
    }
  });

  it("checks the target, starts the job, then shows the code's table and Prep's explanation", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === "/api/v1/prep/retake") return json(job("queued"), 202);
      if (url === `/api/v1/jobs/${JOB}`) return json(job("ready"));
      return json([reply]);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<RetakeForm inputs={inputs} timeZone="America/Chicago" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Target composite" }), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Run the numbers" }));
    expect(screen.getByRole("alert").textContent).toBe("ACT targets run from 1 to 36.");
    fireEvent.click(screen.getByRole("button", { name: "29" }));
    fireEvent.click(screen.getByRole("button", { name: "Run the numbers" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ test: "ACT", targetComposite: 29 });
    expect(screen.queryByRole("table")).toBeNull();
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(job("ready"))));
    await waitFor(() => expect(screen.getByText("Here's what the retake numbers say for your list.")).toBeTruthy());
    const table = screen.getByRole("table", { name: "Retake value by school" });
    const row = within(table).getByRole("row", { name: /State U/ });
    expect(within(row).getByText("Merit")).toBeTruthy();
    expect(within(row).getByText("Dean's")).toBeTruthy();
    expect(within(row).getByText("+$2,000")).toBeTruthy();
    expect(within(row).getByText("+$8,000")).toBeTruthy();
  });

  it("shows the allowance message with a See plans link on 402 (CR-10, E-16-6)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          {
            error: {
              code: "limit_reached",
              message:
                "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.",
            },
          },
          402,
        ),
      ),
    );
    render(<RetakeForm inputs={inputs} timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "29" }));
    fireEvent.click(screen.getByRole("button", { name: "Run the numbers" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.",
    );
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/settings");
    expect(FakeEventSource.instances).toHaveLength(0);
    fireEvent.change(screen.getByRole("textbox", { name: "Target composite" }), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Run the numbers" }));
    expect(screen.getByRole("alert").textContent).toBe("ACT targets run from 1 to 36.");
    expect(screen.queryByRole("link", { name: "See plans" })).toBeNull();
  });
});

describe("StudyPlan", () => {
  it("proposes sessions up to the test date and adds them to the plan", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json([{}, {}, {}, {}, {}], 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<StudyPlan today="2026-10-08" />);
    fireEvent.change(screen.getByLabelText("Next test date"), { target: { value: "2026-10-24" } });
    expect(screen.getByText("1 h 20 min a week until Oct 24")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Add to my weekly plan" }));
    await waitFor(() => expect(screen.getByText("Added 5 sessions to your weekly plan.")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/prep/study-plan");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).sessions).toHaveLength(5);
  });
});
