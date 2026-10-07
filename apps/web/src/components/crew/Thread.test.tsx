// @vitest-environment jsdom
import type { Conversation, CrewJob, Message } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Thread } from "./Thread";
import { recalledJobs } from "./jobMemory";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/crew/c1" }));

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

const CONV = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const conversation: Conversation = {
  id: CONV,
  room: "my_crew",
  roomRefId: null,
  familyId: null,
  title: "My Crew",
  createdAt: "2026-10-01T15:00:00.000Z",
  expiresAt: null,
  lastMessageAt: null,
};

const msg = (o: Partial<Message>): Message => ({
  id: "11111111-1111-4111-8111-111111111111",
  conversationId: CONV,
  authorKind: "user",
  authorUserId: "99999999-9999-4999-8999-999999999999",
  body: "I have 2 hours this weekend. What should I work on?",
  reply: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  appliedCardIds: [],
  sharedCategories: null,
  ...o,
});

const job = (o: Partial<CrewJob> = {}): CrewJob => ({
  id: "22222222-2222-4222-8222-222222222222",
  kind: "crew_request",
  status: "queued",
  conversationId: CONV,
  requestMessageId: "33333333-3333-4333-8333-333333333333",
  resultMessageId: null,
  refId: null,
  progress: [],
  error: null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
  ...o,
});

// 14 N9 answers POST /conversations/:id/messages with 202 (R3A-14).
function stubSend(
  status = 202,
  body: unknown = {
    message: msg({ id: "33333333-3333-4333-8333-333333333333", body: "@Ledger how much would Rotary change my gap?" }),
    job: job(),
  },
) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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

describe("Thread", () => {
  it("offers Send again after a failed job and resends only when clicked", async () => {
    const fetchMock = stubSend();
    render(<Thread conversation={conversation} messages={[]} prefill="Please check my deadlines" />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    act(() =>
      FakeEventSource.instances[0]?.emit(
        "job",
        JSON.stringify(job({ status: "failed", error: "My Crew didn't finish" })),
      ),
    );
    const retry = await screen.findByRole("button", { name: "Send again" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ body: "Please check my deadlines" });
  });

  it("loads an earlier page before the first message", async () => {
    const page = Array.from({ length: 50 }, (_, index) => msg({ id: `m-${index}`, body: `Current ${index}` }));
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify([msg({ id: "older", body: "Earlier question" })]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Thread conversation={conversation} messages={page} />);
    fireEvent.click(screen.getByRole("button", { name: "Show earlier messages" }));
    expect(await screen.findByText("Earlier question")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/conversations/${conversation.id}/messages?before=m-0&limit=50`);
    expect(screen.queryByRole("button", { name: "Show earlier messages" })).toBeNull();
  });

  it("renders user bubbles and crew replies", () => {
    render(
      <Thread
        conversation={conversation}
        messages={[
          msg({}),
          msg({
            id: "44444444-4444-4444-8444-444444444444",
            authorKind: "crew",
            authorUserId: null,
            body: "Start with Hill Country.",
            reply: {
              text: "Start with Hill Country.",
              contributors: ["compass"],
              question: null,
              actionCards: [],
              receipt: [],
              safety: null,
              needsInput: false,
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText("I have 2 hours this weekend. What should I work on?")).toBeTruthy();
    expect(screen.getByRole("article", { name: "Reply from Compass" })).toBeTruthy();
  });

  it("labels each family-room bubble with its author's first name, so a parent's question reads as theirs (R2C-1)", () => {
    const STUDENT_ID = "99999999-9999-4999-8999-999999999999";
    const PARENT_ID = "88888888-8888-4888-8888-888888888888";
    render(
      <Thread
        conversation={{
          ...conversation,
          room: "family",
          familyId: "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1",
          title: "Family room",
        }}
        authors={{ [STUDENT_ID]: "Maya", [PARENT_ID]: "Dana" }}
        messages={[
          msg({}),
          msg({ id: "77777777-7777-4777-8777-777777777777", authorUserId: PARENT_ID, body: "How are things going?" }),
        ]}
      />,
    );
    const parentBubble = screen.getByText("How are things going?");
    expect(within(parentBubble).getByText("Dana")).toBeTruthy();
    expect(within(parentBubble).queryByText("Maya")).toBeNull();
    expect(
      within(screen.getByText("I have 2 hours this weekend. What should I work on?")).getByText("Maya"),
    ).toBeTruthy();
  });

  it("sends a message, streams progress, and refreshes when the reply is ready", async () => {
    const fetchMock = stubSend();
    render(<Thread conversation={conversation} messages={[]} />);
    const box = screen.getByRole("textbox", { name: "Message your crew" });
    fireEvent.change(box, { target: { value: "@Ledger how much would Rotary change my gap?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/conversations/${CONV}/messages`);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ body: "@Ledger how much would Rotary change my gap?" }),
    );
    expect(FakeEventSource.instances[0]?.url).toBe(`/api/v1/jobs/${job().id}/events`);
    expect(screen.getByText("@Ledger how much would Rotary change my gap?")).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("");
    expect(recalledJobs().map((j) => j.id)).toEqual([job().id]);

    act(() =>
      FakeEventSource.instances[0]?.emit(
        "job",
        JSON.stringify(
          job({
            status: "working",
            progress: [{ at: "2026-10-06T15:00:02.000Z", role: "ledger", text: "Running the gap math" }],
          }),
        ),
      ),
    );
    expect(screen.getByText("Running the gap math")).toBeTruthy();
    expect(screen.getByText("Your crew is on it")).toBeTruthy();
    router.refresh.mockClear();
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(job({ status: "ready" }))));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Your crew is on it")).toBeNull();
  });

  it("shows the allowance message and keeps the draft (CR-10)", async () => {
    stubSend(402, {
      error: {
        code: "limit_reached",
        message:
          "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.",
      },
    });
    render(<Thread conversation={conversation} messages={[]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Message your crew" }), { target: { value: "Plan my week" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText(
        "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.",
      ),
    ).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Message your crew" }) as HTMLTextAreaElement).value).toBe(
      "Plan my week",
    );
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/settings");
  });

  it("opens a lazy context room on the first send (openRoom)", async () => {
    const ROOM = "d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2";
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      const created = url === "/api/v1/conversations";
      const data = created
        ? {
            ...conversation,
            id: ROOM,
            room: "scholarship",
            roomRefId: "hill-country-stem",
            title: "Hill Country STEM Award",
          }
        : {
            message: msg({
              id: "55555555-5555-4555-8555-555555555555",
              conversationId: ROOM,
              body: "Is my essay a fit?",
            }),
            job: job({ conversationId: ROOM }),
          };
      // 201 only for POST /conversations; the message send is 202 (R3A-14).
      return new Response(JSON.stringify(data), {
        status: created ? 201 : 202,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <Thread
        conversation={null}
        openRoom={{ room: "scholarship", roomRefId: "hill-country-stem" }}
        messages={[]}
        compact
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Message your crew" }), {
      target: { value: "Is my essay a fit?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/conversations",
      `/api/v1/conversations/${ROOM}/messages`,
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ room: "scholarship", roomRefId: "hill-country-stem", familyId: null, title: "" }),
    );
    expect(screen.getByText("Is my essay a fit?")).toBeTruthy();
  });

  it("read-only threads show messages with no chips or composer, and cards can't be applied", () => {
    render(
      <Thread
        conversation={conversation}
        readOnly
        messages={[
          msg({}),
          msg({
            id: "66666666-6666-4666-8666-666666666666",
            authorKind: "crew",
            authorUserId: null,
            body: "Save the Rotary award.",
            reply: {
              text: "Save the Rotary award.",
              contributors: ["compass"],
              question: null,
              actionCards: [
                {
                  id: "c1",
                  kind: "save_scholarship",
                  label: "Save Rotary",
                  scholarshipId: "77777777-7777-4777-8777-777777777777",
                },
              ],
              receipt: [],
              safety: null,
              needsInput: false,
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText("I have 2 hours this weekend. What should I work on?")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Message your crew" })).toBeNull();
    expect(screen.queryByRole("button", { name: "@Quill essay help" })).toBeNull();
    expect((screen.getByRole("button", { name: "Save Rotary" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("prefill fills the composer and makes no request", () => {
    const fetchMock = stubSend();
    render(<Thread conversation={conversation} messages={[]} prefill="Can I still apply Early Action?" />);
    expect((screen.getByRole("textbox", { name: "Message your crew" }) as HTMLTextAreaElement).value).toBe(
      "Can I still apply Early Action?",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefills from chips and hides chips after a crisis reply", () => {
    const { unmount } = render(<Thread conversation={conversation} messages={[]} prefill="@Scout new matches" />);
    expect((screen.getByRole("textbox", { name: "Message your crew" }) as HTMLTextAreaElement).value).toBe(
      "@Scout new matches",
    );
    fireEvent.click(screen.getByRole("button", { name: "@Quill essay help" }));
    expect((screen.getByRole("textbox", { name: "Message your crew" }) as HTMLTextAreaElement).value).toBe(
      "@Quill essay help",
    );
    unmount();
    render(
      <Thread
        conversation={conversation}
        messages={[
          msg({
            authorKind: "crew",
            authorUserId: null,
            reply: {
              text: "You deserve support right now.",
              contributors: ["compass"],
              question: null,
              actionCards: [],
              receipt: [],
              safety: "crisis",
              needsInput: false,
            },
          }),
        ]}
      />,
    );
    expect(screen.queryByRole("button", { name: "@Quill essay help" })).toBeNull();
  });
});
