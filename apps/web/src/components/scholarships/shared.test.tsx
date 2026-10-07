// @vitest-environment jsdom
import { AppError, type CrewJob, type Message } from "@scholarcrew/domain";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobReply } from "./JobReply";
import { loadViewer, readShared, todayIn } from "./viewer";

const m = vi.hoisted(() => ({ requireAppActor: vi.fn(), getFamily: vi.fn() }));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/money/offers",
}));

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

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const CONV_ID = "22222222-2222-4222-8222-222222222222";
const MSG_ID = "33333333-3333-4333-8333-333333333333";
const job = (o: Partial<CrewJob> = {}): CrewJob => ({
  id: JOB_ID,
  kind: "appeal_outline",
  status: "working",
  conversationId: null,
  requestMessageId: null,
  resultMessageId: null,
  refId: null,
  progress: [],
  error: null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:01.000Z",
  ...o,
});
const reply: Message = {
  id: MSG_ID,
  conversationId: CONV_ID,
  authorKind: "crew",
  authorUserId: null,
  body: "",
  reply: {
    text: "Here's an outline for your appeal.",
    contributors: ["aid"],
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

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("viewer helpers", () => {
  it("turns not_found into null and rethrows other errors", async () => {
    await expect(readShared(async () => 5)).resolves.toBe(5);
    await expect(readShared(async () => Promise.reject(new AppError("not_found", "Not found")))).resolves.toBeNull();
    await expect(readShared(async () => Promise.reject(new AppError("internal", "boom")))).rejects.toThrow("boom");
  });

  it("finds today's date in the student's zone", () => {
    expect(todayIn(new Date("2026-10-07T03:00:00.000Z"), "America/Chicago")).toBe("2026-10-06");
    expect(todayIn(new Date("2026-10-07T03:00:00.000Z"), "Mars/Olympus")).toBe("2026-10-07");
  });

  it("points parents at their family's student", async () => {
    const parent = { kind: "user", userId: "p1", role: "parent" };
    m.requireAppActor.mockResolvedValue({
      actor: parent,
      me: { user: { displayName: "Dana Rivera", role: "parent", timeZone: "America/Chicago" } },
      deps: {},
    });
    m.getFamily.mockResolvedValue({
      members: [
        { userId: "s1", displayName: "Maya Rivera", memberRole: "student" },
        { userId: "p1", displayName: "Dana Rivera", memberRole: "parent" },
      ],
    });
    await expect(loadViewer()).resolves.toMatchObject({ studentId: "s1", studentName: "Maya Rivera", isParent: true });
    m.getFamily.mockResolvedValue(null);
    await expect(loadViewer()).resolves.toMatchObject({ studentId: null, isParent: true });
    expect(m.requireAppActor).toHaveBeenCalledWith(["student", "parent"]);
  });
});

describe("JobReply", () => {
  it("shows progress, then loads and renders the reply", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith(`/jobs/${JOB_ID}`)
        ? json(job({ status: "ready", conversationId: CONV_ID, resultMessageId: MSG_ID }))
        : json([reply]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    render(<JobReply jobId={JOB_ID} workingText="Aid is outlining your appeal…" onDone={onDone} />);
    expect(screen.getByText("Aid is outlining your appeal…")).toBeTruthy();
    const source = FakeEventSource.instances[0];
    act(() =>
      source?.emit(
        "job",
        JSON.stringify(
          job({ progress: [{ at: "2026-10-06T15:00:02.000Z", role: "aid", text: "Reading your letter" }] }),
        ),
      ),
    );
    expect(screen.getByText("Reading your letter")).toBeTruthy();
    act(() => source?.emit("job", JSON.stringify(job({ status: "ready" }))));
    await waitFor(() => expect(screen.getByText("Here's an outline for your appeal.")).toBeTruthy());
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      `/api/v1/jobs/${JOB_ID}`,
      `/api/v1/conversations/${CONV_ID}/messages`,
    ]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("explains a failed job", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(job({ status: "failed", error: "Aid couldn't finish this time." }))),
    );
    render(<JobReply jobId={JOB_ID} workingText="Working…" />);
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(job({ status: "failed" }))));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Aid couldn't finish this time."));
  });
});
