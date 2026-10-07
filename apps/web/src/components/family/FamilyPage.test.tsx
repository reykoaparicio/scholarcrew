import FamilyPage from "@/app/(app)/family/page";
import type { Conversation, FamilyView, MeResponse } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
// @vitest-environment jsdom
import { Members } from "./Members";

const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  getFamily: vi.fn(),
  getShareSettings: vi.fn(),
  listTasks: vi.fn(),
  getBudget: vi.fn(),
  listHelperLinks: vi.fn(),
  createConversation: vi.fn(),
  getMessages: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/family", () => ({
  getFamily: m.getFamily,
  getShareSettings: m.getShareSettings,
  listTasks: m.listTasks,
  getBudget: m.getBudget,
}));
vi.mock("@scholarcrew/core/helpers", () => ({ listHelperLinks: m.listHelperLinks }));
vi.mock("@scholarcrew/core/crew", () => ({ createConversation: m.createConversation, getMessages: m.getMessages }));
vi.mock("next/navigation", () => ({ useRouter: () => m.router, usePathname: () => "/family" }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const STUDENT = "11111111-1111-4111-8111-111111111111";
const PARENT = "22222222-2222-4222-8222-222222222222";
const FAMILY = "33333333-3333-4333-8333-333333333333";

const me = (role: "student" | "parent"): MeResponse => ({
  user: {
    id: role === "student" ? STUDENT : PARENT,
    email: `${role}@example.test`,
    displayName: role === "student" ? "Maya Rivera" : "Dana Rivera",
    role,
    birthYear: null,
    timeZone: "America/Chicago",
    status: "active",
    createdAt: "2026-10-01T15:00:00.000Z",
  },
  profile: null,
  onboardingComplete: true,
  family: { id: FAMILY, role },
  plan: "family",
});

const family = (myRole: "student" | "parent"): FamilyView => ({
  id: FAMILY,
  name: "Family",
  myRole,
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
});

const room: Conversation = {
  id: "44444444-4444-4444-8444-444444444444",
  room: "family",
  roomRefId: null,
  familyId: FAMILY,
  title: "Family room",
  createdAt: "2026-10-02T15:00:00.000Z",
  expiresAt: null,
  lastMessageAt: null,
};

function as(role: "student" | "parent") {
  const actor = { kind: "user", userId: role === "student" ? STUDENT : PARENT, role };
  m.requireAppActor.mockResolvedValue({ actor, me: me(role), deps: {} });
  m.getFamily.mockResolvedValue(family(role));
  m.listTasks.mockResolvedValue([]);
  m.getBudget.mockResolvedValue(null);
  m.listHelperLinks.mockResolvedValue([]);
  m.createConversation.mockResolvedValue(room);
  m.getMessages.mockResolvedValue([]);
  m.getShareSettings.mockResolvedValue({
    studentId: STUDENT,
    familyId: FAMILY,
    categories: {
      deadlines: true,
      colleges: true,
      costs: true,
      scholarships: true,
      activities: true,
      essays: false,
      chats: false,
      stories: false,
      sensitive: false,
    },
  });
  return actor;
}

describe("Family page", () => {
  it("shows no invite form for parents and lets the student cancel a pending invite", async () => {
    const data = family("student");
    const { unmount } = render(<Members family={data} myUserId={PARENT} myRole="parent" timeZone="America/Chicago" />);
    expect(screen.queryByLabelText("Invite a parent by email")).toBeNull();
    unmount();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <Members
        family={{
          ...data,
          pendingInvites: [{ id: "pending", email: "new@example.test", expiresAt: "2026-10-13T15:00:00.000Z" }],
        }}
        myUserId={STUDENT}
        myRole="student"
        timeZone="America/Chicago"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel invite" }));
    await waitFor(() => expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/family/invites/pending"));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("gives the student share toggles, helper links, members, and the family room", async () => {
    const actor = as("student");
    render(await FamilyPage());
    expect(screen.getByRole("heading", { level: 1, name: "Family" })).toBeTruthy();
    expect(screen.getByText(/Maya \+ Dana · each of you controls what you share/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What I share with Dana" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Helper links" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Dana's private space" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Dana Rivera" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message your crew" })).toBeTruthy();
    expect(m.createConversation).toHaveBeenCalledWith({}, actor, {
      room: "family",
      roomRefId: null,
      familyId: FAMILY,
      title: "",
    });
    expect(m.getShareSettings).toHaveBeenCalledWith({}, actor, STUDENT);
  });

  it("gives parents their private space and no student-only controls", async () => {
    as("parent");
    render(await FamilyPage());
    expect(screen.getByRole("heading", { name: "Your private space" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share range with Maya" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /What I share/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Helper links" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(m.getShareSettings).not.toHaveBeenCalled();
    expect(m.listHelperLinks).not.toHaveBeenCalled();
  });

  it("offers an invite when the student has no family yet", async () => {
    as("student");
    m.getFamily.mockResolvedValue(null);
    render(await FamilyPage());
    expect(screen.getByLabelText("Invite a parent by email")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Leave family room" })).toBeNull();
    expect(m.createConversation).not.toHaveBeenCalled();
  });
});
