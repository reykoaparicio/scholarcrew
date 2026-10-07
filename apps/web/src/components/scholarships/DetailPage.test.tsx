// @vitest-environment jsdom
import DetailPage from "@/app/(app)/scholarships/[slug]/page";
import type { ScholarshipDetail } from "@scholarcrew/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application, board, card } from "./fixtures";

const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  getFamily: vi.fn(),
  getScholarship: vi.fn(),
  getBoard: vi.fn(),
  listConversations: vi.fn(),
  getMessages: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily }));
vi.mock("@scholarcrew/core/scholarships", () => ({ getScholarship: m.getScholarship, getBoard: m.getBoard }));
vi.mock("@scholarcrew/core/crew", () => ({ listConversations: m.listConversations, getMessages: m.getMessages }));
vi.mock("next/navigation", () => ({
  useRouter: () => m.router,
  usePathname: () => "/scholarships/rotary",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const deps = { clock: { now: () => new Date("2026-10-06T15:00:00.000Z") } };
const sensitive = { code: "first_gen", text: "you're first in your family to go to college", sensitive: true };
const county = { code: "county", text: "you live in Maple County", sensitive: false };
const app = application({ stage: "drafting", matchReasons: [county, sensitive] });
const detail: ScholarshipDetail = {
  id: app.scholarshipId,
  slug: "rotary",
  name: "Rotary Club of Eastside Scholarship",
  provider: "Rotary Club of Eastside",
  url: "https://eastsiderotary.example.org/scholarship",
  sourceUrl: "https://eastsiderotary.example.org/scholarship",
  amountMinUsd: 2500,
  amountMaxUsd: 2500,
  renewable: false,
  renewalTerms: "",
  deadline: "2026-10-30",
  cycle: "2026-27",
  localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
  eligibility: [{ type: "gpa_min", min: 3 }],
  requirements: {
    essays: [{ prompt: "Describe a time you used your skills to serve your community.", wordLimit: 500 }],
    recommendations: 0,
    transcript: true,
    serviceHours: null,
    other: ["Online form"],
  },
  status: "published",
  visibility: "public",
  submittedById: null,
  scamFlags: [],
  estMinutes: 45,
  verifiedAt: "2026-10-02T15:00:00.000Z",
  createdAt: "2026-09-01T15:00:00.000Z",
  updatedAt: "2026-10-02T15:00:00.000Z",
  application: app,
  stale: false,
};
const me = (role: "student" | "parent") => ({
  user: {
    id: role === "student" ? "s1" : "p1",
    displayName: role === "student" ? "Maya Rivera" : "Dana Rivera",
    role,
    timeZone: "America/Chicago",
  },
  onboardingComplete: true,
});

describe("scholarship detail page", () => {
  it("shows the listing, every match reason, the essay prompt, and the crew room to the student", async () => {
    m.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: "s1", role: "student" },
      me: me("student"),
      deps,
    });
    m.getScholarship.mockResolvedValue(detail);
    m.listConversations.mockResolvedValue([]);
    render(await DetailPage({ params: Promise.resolve({ slug: "rotary" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Rotary Club of Eastside Scholarship" })).toBeTruthy();
    expect(screen.getByText("Local · Maple County, TX · from Rotary Club of Eastside")).toBeTruthy();
    expect(screen.getByText("Fri, Oct 30")).toBeTruthy();
    expect(screen.getByText("24 days left")).toBeTruthy();
    expect(screen.getByText("GPA of 3.0 or higher")).toBeTruthy();
    expect(screen.getByText("you're first in your family to go to college")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start essay" })).toBeTruthy();
    expect(screen.getByText("Crew room · this scholarship")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask your crew here" })).toBeTruthy();
    expect(screen.getByText("Verified Oct 2")).toBeTruthy();
  });

  it("opens from a renewal reminder's slug link and shows the renewal terms and the open room (SC-11, D44)", async () => {
    m.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: "s1", role: "student" },
      me: me("student"),
      deps,
    });
    const won = {
      ...detail,
      renewable: true,
      renewalTerms: "Keep a 3.0 GPA and stay enrolled full time",
      application: { ...app, stage: "won" as const },
    };
    m.getScholarship.mockResolvedValue(won);
    const room = {
      id: "22222222-2222-4222-8222-222222222222",
      room: "scholarship" as const,
      roomRefId: detail.id,
      familyId: null,
      title: detail.name,
      createdAt: "2026-10-01T15:00:00.000Z",
      expiresAt: null,
      lastMessageAt: null,
    };
    m.listConversations.mockResolvedValue([
      { ...room, id: "33333333-3333-4333-8333-333333333333", roomRefId: "someone-else" },
      room,
    ]);
    m.getMessages.mockResolvedValue([]);
    render(await DetailPage({ params: Promise.resolve({ slug: "rotary" }) }));
    expect(m.getScholarship.mock.calls[0]?.[2]).toBe("rotary");
    expect(screen.getByText("Renewable · Keep a 3.0 GPA and stay enrolled full time")).toBeTruthy();
    expect(screen.getByText("You won this. We'll remind you 30 days before each renewal date.")).toBeTruthy();
    expect(m.getMessages.mock.calls[0]?.[2]).toBe(room.id);
    expect(screen.getByRole("textbox", { name: "Message your crew" })).toBeTruthy();
  });

  it("shows parents the reasons the core returns, and no editing or crew room", async () => {
    m.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: "p1", role: "parent" },
      me: me("parent"),
      deps,
    });
    m.getFamily.mockResolvedValue({ members: [{ userId: "s1", displayName: "Maya Rivera", memberRole: "student" }] });
    m.getScholarship.mockResolvedValue({ ...detail, application: null });
    // R4Z-4: parent fixtures contain only non-private listings, regardless of sensitive grants.
    const c = card("drafting", { id: detail.id }, { reasons: [county] });
    m.getBoard.mockResolvedValue(board({ working: [c] }));
    render(await DetailPage({ params: Promise.resolve({ slug: "rotary" }) }));
    expect(m.getBoard.mock.calls[0]?.[2]).toBe("s1");
    expect(screen.getByText("you live in Maple County")).toBeTruthy();
    expect(screen.queryByText("you're first in your family to go to college")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start essay" })).toBeNull();
    expect(screen.queryByText("Crew room · this scholarship")).toBeNull();
    expect(screen.getByRole("button", { name: "Report a problem" })).toBeTruthy();
    expect(m.listConversations).not.toHaveBeenCalled();
  });

  it("tells a saved card with no reasons that nothing matches yet, and an unsaved listing to save it (R2P-3)", async () => {
    m.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: "s1", role: "student" },
      me: me("student"),
      deps,
    });
    m.listConversations.mockResolvedValue([]);
    m.getScholarship.mockResolvedValue({
      ...detail,
      application: { ...app, stage: "planned" as const, matchReasons: [] },
    });
    render(await DetailPage({ params: Promise.resolve({ slug: "rotary" }) }));
    expect(screen.getByText("You don't match any listed rule yet.")).toBeTruthy();
    expect(screen.queryByText("Save it to see how you match.")).toBeNull();
    cleanup();
    m.getScholarship.mockResolvedValue({ ...detail, application: null });
    render(await DetailPage({ params: Promise.resolve({ slug: "rotary" }) }));
    expect(screen.getByText("Save it to see how you match.")).toBeTruthy();
  });

  it("shows a draft's amount as unknown and a missing deadline as not posted (R3V-1, R3V-8)", async () => {
    m.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: "s1", role: "student" },
      me: me("student"),
      deps,
    });
    m.listConversations.mockResolvedValue([]);
    m.getScholarship.mockResolvedValue({
      ...detail,
      status: "draft" as const,
      visibility: "submitter_only" as const,
      submittedById: "s1",
      amountMinUsd: 0,
      amountMaxUsd: 0,
      deadline: null,
      verifiedAt: null,
      application: { ...app, stage: "planned" as const },
    });
    render(await DetailPage({ params: Promise.resolve({ slug: "rotary" }) }));
    expect(screen.getByText("Amount not known yet")).toBeTruthy();
    expect(screen.queryByText("$0")).toBeNull();
    expect(screen.getByText("Not posted")).toBeTruthy();
    expect(screen.getByText("Check the sponsor's page")).toBeTruthy();
    expect(screen.queryByText("Rolling")).toBeNull();
  });
});
