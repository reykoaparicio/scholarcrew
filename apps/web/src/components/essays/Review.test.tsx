// @vitest-environment jsdom
import type { CrewJob, EssayComment } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommentsPanel } from "./CommentsPanel";
import { HistoryModal } from "./HistoryModal";
import { ReviewView } from "./ReviewView";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/essays/e1" }));

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
const comment = (id: string, quote: string, body: string, occurrence = 1): EssayComment => ({
  id,
  essayId: "e1",
  version: 2,
  author: "quill",
  kind: "question",
  quote,
  occurrence,
  body,
  resolvedAt: null,
  createdAt: "2026-10-06T15:00:00.000Z",
});
const body = "I have always been passionate about robotics. The first night, 30 kids came.";
const comments = [
  comment("c1", "I have always been passionate about robotics.", "Can you open inside the room instead?"),
  comment("c2", "30 kids came", "What changed for one of those kids?"),
  comment("c3", "a line I deleted", "Gone now."),
];
const job = (status: CrewJob["status"]): CrewJob => ({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "essay_review",
  status,
  conversationId: null,
  requestMessageId: null,
  resultMessageId: null,
  refId: "e1",
  progress: [],
  error: status === "failed" ? "Quill couldn't finish this review." : null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
});

describe("ReviewView", () => {
  it("lists old-version comments without anchoring them to the current draft", () => {
    const { container } = render(
      <ReviewView body={body} comments={[comment("old", "30 kids came", "Old note")]} currentVersion={3} />,
    );
    expect(container.querySelectorAll("mark")).toHaveLength(0);
    expect(screen.getByText("From draft 2: 30 kids came")).toBeTruthy();
  });

  it("highlights each quote with its comment number and notes quotes that moved", () => {
    const { container } = render(<ReviewView body={body} comments={comments} currentVersion={2} />);
    const marks = container.querySelectorAll("mark");
    expect([...marks].map((m) => m.textContent)).toEqual([
      "I have always been passionate about robotics.1",
      "30 kids came2",
    ]);
    expect(screen.getByText("1 comment points at text that changed since Quill read it.")).toBeTruthy();
  });
});

describe("CommentsPanel", () => {
  it("resolves a comment", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommentsPanel essayId="e1" comments={comments} budget="358 words left." readOnly={false} />);
    const first = screen.getByRole("article", { name: "Comment 1" });
    expect(within(first).getByText("Can you open inside the room instead?")).toBeTruthy();
    fireEvent.click(within(first).getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(screen.queryByRole("article", { name: "Comment 1" })).toBeNull());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/essay-comments/c1/resolve");
    expect(nav.router.refresh).toHaveBeenCalled();
    expect(screen.getByText("358 words left.")).toBeTruthy();
    expect(screen.getByText(/It won't write paragraphs for you/)).toBeTruthy();
  });

  it("asks Quill, follows the job, and refreshes when comments are ready", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(job("queued"), 202));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommentsPanel essayId="e1" comments={[]} budget={null} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Quill" }));
    await waitFor(() => expect(screen.getByText("Quill is reading your draft…")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/essays/e1/review");
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(job("ready"))));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    act(() => FakeEventSource.instances[0]?.emit("end"));
  });

  it("shows a failed review", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(job("queued"), 202)),
    );
    render(<CommentsPanel essayId="e1" comments={[]} budget={null} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Quill" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(job("failed"))));
    expect(screen.getByRole("alert").textContent).toBe("Quill couldn't finish this review.");
  });

  it("shows a lost stream and lets the student ask again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/jobs/")
          ? json({ error: { code: "not_found", message: "Job not found" } }, 404)
          : json(job("queued"), 202),
      ),
    );
    render(<CommentsPanel essayId="e1" comments={[]} budget={null} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Quill" }));
    await waitFor(() => expect(screen.getByText("Quill is reading your draft…")).toBeTruthy());
    expect((screen.getByRole("button", { name: "Ask Quill" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => FakeEventSource.instances[0]?.fail());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Refresh to check on your crew/));
    expect(screen.queryByText("Quill is reading your draft…")).toBeNull();
    expect((screen.getByRole("button", { name: "Ask Quill" }) as HTMLButtonElement).disabled).toBe(false);
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
    render(<CommentsPanel essayId="e1" comments={[]} budget={null} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Quill" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.",
    );
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/settings");
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});

describe("HistoryModal", () => {
  it("lists versions and opens one read-only", async () => {
    const versions = [1, 2].map((v) => ({
      id: `00000000-0000-4000-8000-00000000000${v}`,
      essayId: "e1",
      version: v,
      body: v === 1 ? "The very first try." : "Second try.",
      wordCount: v === 1 ? 4 : 2,
      authorId: "00000000-0000-4000-8000-000000000009",
      createdAt: `2026-10-0${v + 1}T15:00:00.000Z`,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(versions)),
    );
    render(<HistoryModal essayId="e1" timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "Draft history" }));
    const dialog = screen.getByRole("dialog", { name: "Draft history" });
    await waitFor(() => expect(within(dialog).getByText("Draft 2 · Oct 3 · 2 words")).toBeTruthy());
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((li) => li.textContent?.startsWith("Draft 2")),
    ).toEqual([true, false]);
    fireEvent.click(within(dialog).getAllByRole("button", { name: "View" })[1] as HTMLElement);
    expect(within(dialog).getByText("The very first try.")).toBeTruthy();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Back to all drafts" }));
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
  });
});
