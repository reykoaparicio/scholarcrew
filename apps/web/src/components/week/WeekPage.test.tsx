// @vitest-environment jsdom
import WeekPage from "@/app/(app)/week/page";
import type { FamilyView, MeResponse, ThisWeekView } from "@scholarcrew/domain";
import { AppError } from "@scholarcrew/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  getThisWeek: vi.fn(),
  getFamily: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/plan", () => ({ getThisWeek: m.getThisWeek }));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily }));
vi.mock("next/navigation", () => ({ useRouter: () => m.router, usePathname: () => "/week" }));

const STUDENT = "11111111-1111-4111-8111-111111111111";
const PARENT = "22222222-2222-4222-8222-222222222222";

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
  family: null,
  plan: "free",
});

const view = (o: Partial<ThisWeekView> = {}): ThisWeekView => ({
  greetingName: "Maya",
  weekStart: "2026-10-05",
  nextStep: {
    id: "33333333-3333-4333-8333-333333333333",
    weekStart: "2026-10-05",
    title: "Finish the Hill Country STEM Award",
    kind: "scholarship",
    refType: null,
    refId: null,
    minutes: 30,
    valueUsd: 1000,
    dueOn: "2026-10-15",
    status: "todo",
    contributors: ["compass"],
    priority: 0,
    createdAt: "2026-10-05T12:00:00.000Z",
    completedAt: null,
  },
  plan: { weekStart: "2026-10-05", items: [], totalMinutes: 0, doneCount: 0 },
  gap: null,
  deadlines: [],
  sweep: null,
  crewWorking: false,
  ...o,
});

const family: FamilyView = {
  id: "44444444-4444-4444-8444-444444444444",
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T20:00:00.000Z"));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("This Week page", () => {
  it("greets the student and shows the hero, plan, and ask bar", async () => {
    m.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: STUDENT, role: "student" },
      me: me("student"),
      deps: {},
    });
    m.getThisWeek.mockResolvedValue(view());
    render(await WeekPage());
    expect(screen.getByRole("heading", { level: 1, name: "Good afternoon, Maya." })).toBeTruthy();
    expect(screen.getByText("Week of Oct 5 · nothing open yet")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Your next step" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Ask your crew" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Plan my week" })).toBeTruthy();
    expect(m.getThisWeek).toHaveBeenCalledWith({}, { kind: "user", userId: STUDENT, role: "student" }, STUDENT);
  });

  it("shows the crew-working state when the first plan is still being built", async () => {
    m.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: STUDENT, role: "student" },
      me: me("student"),
      deps: {},
    });
    m.getThisWeek.mockResolvedValue(view({ crewWorking: true, nextStep: null }));
    render(await WeekPage());
    expect(screen.getByText("Your crew is working")).toBeTruthy();
  });

  it("shows parents their student's shared week without editing, asking, or planning", async () => {
    m.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: PARENT, role: "parent" },
      me: me("parent"),
      deps: {},
    });
    m.getFamily.mockResolvedValue(family);
    m.getThisWeek.mockResolvedValue(view());
    render(await WeekPage());
    expect(m.getThisWeek.mock.calls[0]?.[2]).toBe(STUDENT);
    expect(screen.getByRole("heading", { level: 1, name: "Good afternoon, Dana." })).toBeTruthy();
    expect(screen.getByText(/Shared by Maya/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Not this week" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Ask your crew" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Plan my week" })).toBeNull();
  });

  it("explains when a parent has no family or deadlines aren't shared", async () => {
    m.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: PARENT, role: "parent" },
      me: me("parent"),
      deps: {},
    });
    m.getFamily.mockResolvedValue(null);
    render(await WeekPage());
    expect(screen.getByText("Your student's week shows up here")).toBeTruthy();
    cleanup();
    m.getFamily.mockResolvedValue(family);
    m.getThisWeek.mockRejectedValue(new AppError("not_found", "Not found"));
    render(await WeekPage());
    expect(screen.getByText("Maya Rivera isn't sharing deadlines right now")).toBeTruthy();
  });
});
