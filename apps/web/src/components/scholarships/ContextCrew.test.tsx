// @vitest-environment jsdom
import type { Conversation, CrewJob, Message } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextCrew, type ContextCrewProps } from "./ContextCrew";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/scholarships/rotary" }));

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  readyState = 0;
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
  /** A connection the browser gave up on (CLOSED), so 16's hook treats it as lost. */
  fail() {
    this.readyState = FakeEventSource.CLOSED;
    this.emit("error");
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
}

const SCHOLARSHIP = "44444444-4444-4444-8444-444444444444";
const ESSAY = "99999999-9999-4999-8999-999999999999";
const CONV = "22222222-2222-4222-8222-222222222222";
const JOB = "11111111-1111-4111-8111-111111111111";
const conversation: Conversation = {
  id: CONV,
  room: "scholarship",
  roomRefId: SCHOLARSHIP,
  familyId: null,
  title: "Rotary Club of Eastside",
  createdAt: "2026-10-06T15:00:00.000Z",
  expiresAt: null,
  lastMessageAt: null,
};
const userMsg: Message = {
  id: "55555555-5555-4555-8555-555555555555",
  conversationId: CONV,
  authorKind: "user",
  authorUserId: "66666666-6666-4666-8666-666666666666",
  body: "Do I need a recommendation letter?",
  reply: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  appliedCardIds: [],
  sharedCategories: null,
};
const crewMsg = (safety: "crisis" | null = null): Message => ({
  ...userMsg,
  id: "77777777-7777-4777-8777-777777777777",
  authorKind: "crew",
  authorUserId: null,
  body: "",
  reply: {
    text:
      safety === "crisis"
        ? "You deserve support right now."
        : "No. The listing asks for the essay, a transcript, and the online form.",
    contributors: ["scout"],
    question: null,
    actionCards: [],
    receipt: [],
    safety,
    needsInput: false,
  },
});
const job = (status: CrewJob["status"]): CrewJob => ({
  id: JOB,
  kind: "crew_request",
  status,
  conversationId: CONV,
  requestMessageId: userMsg.id,
  resultMessageId: null,
  refId: null,
  progress: [{ at: "2026-10-06T15:00:01.000Z", role: "scout", text: "Reading the listing" }],
  error: null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:01.000Z",
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const props: ContextCrewProps = {
  room: "scholarship",
  refId: SCHOLARSHIP,
  title: "Rotary Club of Eastside",
  lead: "scout",
  placeholder: "Ask about this scholarship…",
  chips: [{ role: "quill", text: "@Quill check my outline" }],
  timeZone: "America/Chicago",
  conversation: null,
  messages: [],
};

describe("ContextCrew", () => {
  it("opens the room on the first click, then hands it to the crew thread", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      // 201 for POST /conversations; 14 N9 answers the message send with 202 (R3A-14).
      url === "/api/v1/conversations" ? json(conversation, 201) : json({ message: userMsg, job: job("queued") }, 202),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ContextCrew {...props} />);
    expect(screen.getByText("Crew room · this scholarship")).toBeTruthy();
    expect(screen.getByText("Your crew reads this first in this room.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ask your crew here" }));
    const box = await screen.findByRole("textbox", { name: "Message your crew" });
    expect(box.getAttribute("placeholder")).toBe("Ask about this scholarship…");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      room: "scholarship",
      roomRefId: SCHOLARSHIP,
    });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    fireEvent.change(box, { target: { value: "Do I need a recommendation letter?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/v1/conversations/${CONV}/messages`);
    expect(FakeEventSource.instances[0]?.url).toBe(`/api/v1/jobs/${JOB}/events`);
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(job("working"))));
    expect(screen.getByText("Reading the listing")).toBeTruthy();
  });

  it("renders an open room through Thread, with the room's chips filling the composer", () => {
    render(<ContextCrew {...props} conversation={conversation} messages={[userMsg, crewMsg()]} />);
    expect(screen.getByText("Do I need a recommendation letter?")).toBeTruthy();
    expect(screen.getByText(/The listing asks for the essay/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ask your crew here" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "@Quill check my outline" }));
    expect((screen.getByRole("textbox", { name: "Message your crew" }) as HTMLTextAreaElement).value).toBe(
      "@Quill check my outline",
    );
  });

  it("hides the chips after a crisis reply, like every other thread (CR-09)", () => {
    render(<ContextCrew {...props} conversation={conversation} messages={[userMsg, crewMsg("crisis")]} />);
    expect(screen.getByText("You deserve support right now.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "@Quill check my outline" })).toBeNull();
  });

  it("shows a lost stream and lets the student send again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/jobs/")
          ? json({ error: { code: "not_found", message: "Job not found" } }, 404)
          : json({ message: userMsg, job: job("queued") }, 202),
      ),
    );
    render(<ContextCrew {...props} conversation={conversation} messages={[]} />);
    const box = screen.getByRole("textbox", { name: "Message your crew" });
    fireEvent.change(box, { target: { value: "Do I need a recommendation letter?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    act(() => FakeEventSource.instances[0]?.fail());
    await waitFor(() => expect(screen.getByText(/Refresh to check on your crew/)).toBeTruthy());
    fireEvent.change(box, { target: { value: "Still there?" } });
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("opens essay rooms with the essay's id and shows the open error", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ error: { code: "not_found", message: "Essay not found" } }, 404),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ContextCrew {...props} room="essay" refId={ESSAY} lead="quill" title="Rotary Club of Eastside essay" />);
    expect(screen.getByText("Crew room · this essay")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ask your crew here" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Essay not found"));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ room: "essay", roomRefId: ESSAY });
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
