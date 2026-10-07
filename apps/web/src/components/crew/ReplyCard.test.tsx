// @vitest-environment jsdom
import type { CrewReply, Message } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplyCard } from "./ReplyCard";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/crew/c1" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";

const planItem = (title: string, minutes: number, valueUsd: number | null, dueOn: string | null) => ({
  title,
  kind: "scholarship" as const,
  refType: null,
  refId: null,
  minutes,
  valueUsd,
  dueOn,
  contributors: [],
  weekStart: null,
});

const reply = (o: Partial<CrewReply> = {}): CrewReply => ({
  text: "Start with the Hill Country STEM Award. It's due Thursday.",
  contributors: ["compass", "atlas", "scout", "quill"],
  question: "Want me to block Saturday morning for it?",
  actionCards: [
    {
      kind: "add_plan_item",
      id: "add-hill",
      label: "Add Hill Country to my week",
      item: planItem("Hill Country STEM Award", 30, 1000, "2026-10-15"),
    },
    {
      kind: "add_plan_item",
      id: "add-stateu",
      label: "Add the State U draft",
      item: planItem("State U supplement", 60, null, "2026-11-01"),
    },
    { kind: "open_link", id: "open-hill", label: "Open Hill Country answers", href: "/essays/e1" },
  ],
  receipt: [
    { kind: "fact", label: "Profile: GPA 3.72, Maple County", refId: null, sourceUrl: null, verifiedAt: null },
    {
      kind: "catalog",
      label: "Hill Country listing",
      refId: "s1",
      sourceUrl: "https://hillcountry.example/award",
      verifiedAt: "2026-10-02T15:00:00.000Z",
    },
  ],
  safety: null,
  needsInput: false,
  ...o,
});

const message = (o: Partial<Message> = {}): Message => ({
  id: MESSAGE_ID,
  conversationId: "22222222-2222-4222-8222-222222222222",
  authorKind: "crew",
  authorUserId: null,
  body: "Start with the Hill Country STEM Award.",
  reply: reply(),
  createdAt: "2026-10-06T15:00:00.000Z",
  appliedCardIds: [],
  sharedCategories: null,
  ...o,
});

describe("ReplyCard", () => {
  it("shows the fact key, value, and visibility above the fixed save button", () => {
    render(
      <ReplyCard
        message={message({
          reply: reply({
            actionCards: [
              {
                kind: "confirm_fact",
                id: "memory",
                label: "Friendly model label",
                fact: {
                  key: "intended_majors",
                  value: ["Nursing"],
                  visibility: "crew",
                  source: "crew_inferred",
                  sourceRef: null,
                },
              },
            ],
          }),
        })}
      />,
    );
    expect(screen.getByText("Save to memory: Intended majors = Nursing · visible to your crew")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save to memory" })).toBeTruthy();
  });

  it("does not render unsafe internal actions or unsafe external receipt sources", () => {
    render(
      <ReplyCard
        message={message({
          reply: reply({
            actionCards: [{ kind: "open_link", id: "unsafe", label: "Unsafe action", href: "/\\evil.example" }],
            receipt: [
              {
                kind: "catalog",
                label: "Unsafe source",
                refId: null,
                sourceUrl: "javascript:alert(1)",
                verifiedAt: null,
              },
            ],
          }),
        })}
      />,
    );
    expect(screen.queryByRole("link", { name: "Unsafe action" })).toBeNull();
    expect(screen.queryByRole("link", { name: "source" })).toBeNull();
    expect(screen.getByText("Unsafe source")).toBeTruthy();
  });

  it("names the contributors and shows one answer, steps, and one question", () => {
    render(<ReplyCard message={message()} />);
    expect(screen.getByText("Compass")).toBeTruthy();
    expect(screen.getByText("· with Atlas, Scout, Quill")).toBeTruthy();
    expect(screen.getByText("Start with the Hill Country STEM Award. It's due Thursday.")).toBeTruthy();
    expect(screen.getByText("Hill Country STEM Award")).toBeTruthy();
    expect(screen.getByText("· $1,000 · due Oct 15")).toBeTruthy();
    expect(screen.getByText("· due Nov 1")).toBeTruthy();
    expect(screen.getByText("Want me to block Saturday morning for it?")).toBeTruthy();
  });

  it("lists what the team used with verified dates and sources", () => {
    render(<ReplyCard message={message()} timeZone="America/Chicago" />);
    expect(screen.getByText("What the team used")).toBeTruthy();
    expect(screen.getByText("Profile: GPA 3.72, Maple County")).toBeTruthy();
    expect(screen.getByText("Hill Country listing, verified Oct 2")).toBeTruthy();
    const source = screen.getByRole("link", { name: "source" });
    expect(source.getAttribute("href")).toBe("https://hillcountry.example/award");
    expect(source.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("applies a card once, disabling buttons while it saves", async () => {
    let resolve: (r: Response) => void = () => {};
    const fetchMock = vi.fn(
      (_url: string, _init?: RequestInit) =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ReplyCard message={message()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Hill Country to my week" }));
    expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Add the State U draft" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/actions/apply");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ messageId: MESSAGE_ID, cardId: "add-hill" }));
    resolve(
      new Response(
        JSON.stringify({
          id: "r1",
          messageId: MESSAGE_ID,
          cardId: "add-hill",
          appliedAt: "2026-10-06T15:01:00.000Z",
          result: {},
        }),
        // 14 N9 answers POST /actions/apply with 200 (R3A-14).
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const applied = await screen.findByRole("button", { name: "Added to your week" });
    expect((applied as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect((screen.getByRole("button", { name: "Add the State U draft" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows cards applied earlier as applied and links open_link cards", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ReplyCard message={message({ appliedCardIds: ["add-hill"] })} />);
    expect((screen.getByRole("button", { name: "Added to your week" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: "Open Hill Country answers" }).getAttribute("href")).toBe("/essays/e1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the API message when applying fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "not_found", message: "Scholarship not found" } }), {
            status: 404,
          }),
      ),
    );
    render(<ReplyCard message={message()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Hill Country to my week" }));
    expect(await screen.findByText("Scholarship not found")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Hill Country to my week" })).toBeTruthy();
  });

  it("treats a 409 as already being applied: status text, disabled card, refresh, no alert (R3A-15)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "conflict", message: "This action is still being applied" } }), {
            status: 409,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    render(<ReplyCard message={message()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Hill Country to my week" }));
    expect((await screen.findByRole("status")).textContent).toBe("Already being added…");
    expect((screen.getByRole("button", { name: "Add Hill Country to my week" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: "Add the State U draft" }) as HTMLButtonElement).disabled).toBe(false);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders crisis replies with 988 up front and nothing to click", () => {
    render(
      <ReplyCard
        message={message({
          reply: reply({
            safety: "crisis",
            text: "I'm really glad you told me. You deserve support right now.",
            question: null,
          }),
        })}
      />,
    );
    expect(screen.getByRole("link", { name: "988" }).getAttribute("href")).toBe("tel:988");
    expect(screen.getByText(/988 Suicide & Crisis Lifeline/)).toBeTruthy();
    expect(screen.getByText("I'm really glad you told me. You deserve support right now.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("What the team used")).toBeNull();
  });

  it("falls back to the message body when there's no structured reply", () => {
    render(<ReplyCard message={message({ reply: null, body: "Plain text reply" })} />);
    expect(screen.getByText("Plain text reply")).toBeTruthy();
  });
});
