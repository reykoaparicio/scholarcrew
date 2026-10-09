// @vitest-environment jsdom
import AppLayout from "@/app/(app)/layout";
import type { FamilyView, MeResponse, ShareSettings } from "@scholarcrew/domain";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  pathname: "/week" as string | null,
  requirePageActor: vi.fn(),
  loadMe: vi.fn(),
  listFacts: vi.fn(),
  optionalCrewSwitches: vi.fn(),
  getFamily: vi.fn(),
  getShareSettings: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/server/session", () => ({ requirePageActor: m.requirePageActor }));
vi.mock("@/server/deps", () => ({ getDeps: () => ({}) }));
vi.mock("@/lib/pageActor", () => ({ loadMe: m.loadMe }));
vi.mock("@scholarcrew/core/memory", () => ({
  listFacts: m.listFacts,
  optionalCrewSwitches: m.optionalCrewSwitches,
}));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily, getShareSettings: m.getShareSettings }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(m.pathname === null ? {} : { "x-pathname": m.pathname }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => m.router,
  usePathname: () => m.pathname ?? "/week",
}));

const STUDENT = "11111111-1111-4111-8111-111111111111";
const PARENT = "22222222-2222-4222-8222-222222222222";
const FAMILY = "33333333-3333-4333-8333-333333333333";

const me = (role: "student" | "parent", onboardingComplete: boolean): MeResponse => ({
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
  onboardingComplete,
  family: role === "parent" ? { id: FAMILY, role } : null,
  plan: "free",
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

const settings: ShareSettings = {
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
    stories: true,
    sensitive: false,
  },
};

function as(role: "student" | "parent", onboardingComplete = true) {
  const actor = { kind: "user", userId: role === "student" ? STUDENT : PARENT, role };
  m.requirePageActor.mockResolvedValue(actor);
  m.loadMe.mockResolvedValue(me(role, onboardingComplete));
  m.listFacts.mockResolvedValue([]);
  m.optionalCrewSwitches.mockResolvedValue([]);
  m.getFamily.mockResolvedValue(family);
  m.getShareSettings.mockResolvedValue(settings);
  return actor;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } })),
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  m.pathname = "/week";
});

describe("(app) layout", () => {
  it("redirects unfinished students on the server from x-pathname and keeps the client gate as a fallback (D30)", async () => {
    as("student", false);
    m.pathname = "/week";
    await expect(AppLayout({ children: <p>week page</p> })).rejects.toThrow("NEXT_REDIRECT /onboarding");

    m.pathname = "/onboarding";
    const { unmount } = render(await AppLayout({ children: <p>steps</p> }));
    expect(screen.getByText("Opens after setup")).toBeTruthy();
    expect(screen.getByText("steps")).toBeTruthy();
    unmount();

    m.pathname = null;
    render(await AppLayout({ children: <p>week page</p> }));
    expect(screen.getByText("Taking you to setup…")).toBeTruthy();
    expect(m.router.replace).toHaveBeenCalledWith("/onboarding");
  });

  it("gives parents the screens their student shares and no add links (E-16-2, E-16-7)", async () => {
    const actor = as("parent");
    render(await AppLayout({ children: <p>week page</p> }));
    expect(m.getShareSettings).toHaveBeenCalledWith({}, actor, STUDENT);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["/week", "/crew", "/scholarships", "/essays/stories", "/colleges", "/impact", "/money", "/family"]);
    expect(within(nav).getByRole("link", { name: "Crew chats" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Story Bank" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "add Prep" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ask your crew" }).getAttribute("href")).toBe("/crew");
    expect(m.listFacts).not.toHaveBeenCalled();
  });

  it("shows parents the optional teammates their student switched on, and the rest as off", async () => {
    const actor = as("parent");
    m.optionalCrewSwitches.mockResolvedValue(["crew_impact_enabled"]);
    render(await AppLayout({ children: <p>week page</p> }));
    expect(m.optionalCrewSwitches).toHaveBeenCalledWith({}, actor, STUDENT);
    const roster = screen.getByText("Impact").closest("li");
    expect(roster?.textContent).toContain("service");
    expect(screen.getByText("Prep").closest("li")?.textContent).toContain("off");
  });
});
