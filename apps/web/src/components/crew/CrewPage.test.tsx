import ConversationPage from "@/app/(app)/crew/[conversationId]/page";
// @vitest-environment jsdom
import CrewIndexPage from "@/app/(app)/crew/page";
import { AppError, type Conversation, type FamilyView, type MeResponse } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddTeammate } from "./AddTeammate";

const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  getMessages: vi.fn(),
  getFamily: vi.fn(),
  listFacts: vi.fn(),
  lastSweep: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/crew", () => ({
  listConversations: m.listConversations,
  createConversation: m.createConversation,
  getMessages: m.getMessages,
}));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily }));
vi.mock("@scholarcrew/core/memory", () => ({ listFacts: m.listFacts }));
vi.mock("@scholarcrew/core/scholarships", () => ({ lastSweep: m.lastSweep }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => m.router,
  usePathname: () => "/crew",
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const STUDENT = "11111111-1111-4111-8111-111111111111";
const PARENT = "22222222-2222-4222-8222-222222222222";
const FAMILY = "33333333-3333-4333-8333-333333333333";

const room = (o: Partial<Conversation>): Conversation => ({
  id: "44444444-4444-4444-8444-444444444444",
  room: "family",
  roomRefId: null,
  familyId: FAMILY,
  title: "Family room",
  createdAt: "2026-10-02T15:00:00.000Z",
  expiresAt: null,
  lastMessageAt: null,
  ...o,
});
const familyRoom = room({});
const privateRoom = room({
  id: "55555555-5555-4555-8555-555555555555",
  room: "my_crew",
  familyId: null,
  title: "My Crew",
});

const family: FamilyView = {
  id: FAMILY,
  name: "Family",
  myRole: "parent",
  members: [
    {
      userId: STUDENT,
      displayName: "Maya Rivera",
      email: "student@example.test",
      memberRole: "student",
      joinedAt: "2026-10-01T15:00:00.000Z",
    },
    {
      userId: PARENT,
      displayName: "Dana Rivera",
      email: "parent@example.test",
      memberRole: "parent",
      joinedAt: "2026-10-02T15:00:00.000Z",
    },
  ],
  pendingInvites: [],
};

function asParent(conversations: Conversation[]) {
  const me: MeResponse = {
    user: {
      id: PARENT,
      email: "parent@example.test",
      displayName: "Dana Rivera",
      role: "parent",
      birthYear: null,
      timeZone: "America/Chicago",
      status: "active",
      createdAt: "2026-10-01T15:00:00.000Z",
    },
    profile: null,
    onboardingComplete: true,
    family: { id: FAMILY, role: "parent" },
    plan: "family",
  };
  m.requireAppActor.mockResolvedValue({ actor: { kind: "user", userId: PARENT, role: "parent" }, me, deps: {} });
  m.listConversations.mockResolvedValue(conversations);
  m.getMessages.mockResolvedValue([]);
  m.getFamily.mockResolvedValue(family);
}

const page = (conversationId: string) =>
  ConversationPage({ params: Promise.resolve({ conversationId }), searchParams: Promise.resolve({}) });

describe("Crew pages for parents (E-16-2)", () => {
  it("open the family room as their crew chat, with read-only cards and no student tools", async () => {
    asParent([familyRoom]);
    render(await page(familyRoom.id));
    expect(m.requireAppActor).toHaveBeenCalledWith(["student", "parent"]);
    expect(screen.getByRole("heading", { level: 1, name: "Family room" })).toBeTruthy();
    expect(screen.getByText("Shared with family")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message your crew" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New chat" })).toBeNull();
    expect(screen.queryByText("Add a teammate")).toBeNull();
    expect(screen.getByText(/Maya's private chats stay private/)).toBeTruthy();
    expect(m.listFacts).not.toHaveBeenCalled();
  });

  it("send /crew to the family room and never open a private room", async () => {
    asParent([familyRoom]);
    await expect(CrewIndexPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      `NEXT_REDIRECT /crew/${familyRoom.id}`,
    );
    asParent([familyRoom, privateRoom]);
    await expect(page(privateRoom.id)).rejects.toThrow("NEXT_NOT_FOUND");
    asParent([]);
    m.createConversation.mockRejectedValue(new AppError("invalid_input", "This family has no student yet"));
    await expect(CrewIndexPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT /family");
  });
});

describe("AddTeammate (D29, D43)", () => {
  it("saves a confirmed crew-visible fact and refreshes", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({}), { status: 201, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<AddTeammate missing={["prep"]} />);
    expect(container.querySelector("#add-teammate")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Prep · tests" }));
    await waitFor(() => expect(m.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/facts");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ key: "crew_prep_enabled", value: true, visibility: "crew" }),
    );
  });
});
