// @vitest-environment jsdom
import EssayStudioPage from "@/app/(app)/essays/[id]/page";
import EssaysPage from "@/app/(app)/essays/page";
import type { Conversation, Essay, EssayWithBody } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { board, card } from "../scholarships/fixtures";
import { NewEssayForm } from "./NewEssayForm";

const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  getFamily: vi.fn(),
  listEssays: vi.fn(),
  getEssay: vi.fn(),
  listStories: vi.fn(),
  getCollegeList: vi.fn(),
  getBoard: vi.fn(),
  getScholarship: vi.fn(),
  listConversations: vi.fn(),
  getMessages: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily }));
vi.mock("@scholarcrew/core/essays", () => ({
  listEssays: m.listEssays,
  getEssay: m.getEssay,
  listStories: m.listStories,
}));
vi.mock("@scholarcrew/core/colleges", () => ({ getCollegeList: m.getCollegeList }));
vi.mock("@scholarcrew/core/scholarships", () => ({ getBoard: m.getBoard, getScholarship: m.getScholarship }));
vi.mock("@scholarcrew/core/crew", () => ({ listConversations: m.listConversations, getMessages: m.getMessages }));
vi.mock("next/navigation", () => ({
  useRouter: () => m.router,
  usePathname: () => "/essays",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const deps = { clock: { now: () => new Date("2026-10-06T15:00:00.000Z") } };
const asStudent = () =>
  m.requireAppActor.mockResolvedValue({
    actor: { kind: "user", userId: "s1", role: "student" },
    me: {
      user: { id: "s1", displayName: "Maya Rivera", role: "student", timeZone: "America/Chicago" },
      onboardingComplete: true,
    },
    deps,
  });
const asParent = () => {
  m.requireAppActor.mockResolvedValue({
    actor: { kind: "user", userId: "p1", role: "parent" },
    me: {
      user: { id: "p1", displayName: "Dana Rivera", role: "parent", timeZone: "America/Chicago" },
      onboardingComplete: true,
    },
    deps,
  });
  m.getFamily.mockResolvedValue({ members: [{ userId: "s1", displayName: "Maya Rivera", memberRole: "student" }] });
};
const SCHOLARSHIP = "44444444-4444-4444-8444-444444444444";
const ESSAY = "99999999-9999-4999-8999-999999999999";
const essay = (o: Partial<Essay> = {}): Essay => ({
  id: ESSAY,
  title: "Rotary Club of Eastside essay",
  prompt: "Describe a time you used your skills to serve your community.",
  wordLimit: 500,
  charLimit: null,
  targetType: "scholarship",
  targetCollegeId: null,
  targetScholarshipId: SCHOLARSHIP,
  currentVersion: 2,
  latestWordCount: 450,
  status: "drafting",
  createdAt: "2026-10-01T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
  ...o,
});

describe("essay list page", () => {
  it("shows counts and targets from the list without reading bodies (D34), and the new-essay form to students only", async () => {
    asStudent();
    m.listEssays.mockResolvedValue([
      essay(),
      essay({
        id: "88888888-8888-4888-8888-888888888888",
        title: "State U supplement",
        targetType: "college",
        targetCollegeId: "100",
        targetScholarshipId: null,
        wordLimit: 250,
        currentVersion: 0,
        latestWordCount: null,
      }),
      essay({
        id: "77777777-7777-4777-8777-777777777777",
        title: "Why me",
        targetType: "general",
        targetScholarshipId: null,
        wordLimit: null,
        latestWordCount: 12,
      }),
    ]);
    m.getCollegeList.mockResolvedValue([{ collegeId: "100", college: { name: "State U" } }]);
    m.getBoard.mockResolvedValue(
      board({ working: [card("drafting", { id: SCHOLARSHIP, name: "Rotary Club of Eastside Scholarship" })] }),
    );
    render(await EssaysPage());
    expect(m.listEssays.mock.calls[0]?.[2]).toBe("s1");
    expect(m.getEssay).not.toHaveBeenCalled();
    const table = screen.getByRole("table", { name: "Your essays" });
    expect(within(table).getByText("450 / 500 words")).toBeTruthy();
    expect(within(table).getByText("50 words left")).toBeTruthy();
    expect(within(table).getByText("No draft yet")).toBeTruthy();
    expect(within(table).getByText("12 words")).toBeTruthy();
    expect(within(table).getByText("Rotary Club of Eastside Scholarship")).toBeTruthy();
    expect(within(table).getByText("State U")).toBeTruthy();
    expect(within(table).getByText("General")).toBeTruthy();
    expect(screen.getByRole("form", { name: "New essay" })).toBeTruthy();
    cleanup();
    asParent();
    render(await EssaysPage());
    expect(m.listEssays.mock.calls.at(-1)?.[2]).toBe("s1");
    expect(screen.queryByRole("form", { name: "New essay" })).toBeNull();
  });
});

describe("NewEssayForm (ES-01, D47)", () => {
  it("creates an essay for a college with a word limit and opens it in Essay Studio", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json(essay({ id: "66666666-6666-4666-8666-666666666666" }), 201),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <NewEssayForm
        colleges={[{ id: "100", name: "State U" }]}
        scholarships={[{ id: SCHOLARSHIP, name: "Rotary Club of Eastside Scholarship" }]}
      />,
    );
    const form = screen.getByRole("form", { name: "New essay" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Title" }), {
      target: { value: " State U supplement " },
    });
    fireEvent.change(within(form).getByRole("textbox", { name: "Prompt" }), { target: { value: "Why State U?" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Word limit (optional)" }), {
      target: { value: "250" },
    });
    fireEvent.change(within(form).getByRole("combobox", { name: "For" }), { target: { value: "college:100" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create essay" }));
    await waitFor(() => expect(m.router.push).toHaveBeenCalledWith("/essays/66666666-6666-4666-8666-666666666666"));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/essays");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      title: "State U supplement",
      prompt: "Why State U?",
      wordLimit: 250,
      targetType: "college",
      targetCollegeId: "100",
      targetScholarshipId: null,
    });
  });

  it("needs a title and a word limit from 1 to 5,000, and allows no limit", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(essay(), 201));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <NewEssayForm colleges={[]} scholarships={[{ id: SCHOLARSHIP, name: "Rotary Club of Eastside Scholarship" }]} />,
    );
    const form = screen.getByRole("form", { name: "New essay" });
    fireEvent.click(within(form).getByRole("button", { name: "Create essay" }));
    expect(screen.getByRole("alert").textContent).toBe("Give the essay a title.");
    fireEvent.change(within(form).getByRole("textbox", { name: "Title" }), { target: { value: "Rotary essay" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Word limit (optional)" }), { target: { value: "0" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create essay" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Word limits are whole numbers from 1 to 5,000. Leave it blank if there's none.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByRole("textbox", { name: "Word limit (optional)" }), { target: { value: "" } });
    fireEvent.change(within(form).getByRole("combobox", { name: "For" }), {
      target: { value: `scholarship:${SCHOLARSHIP}` },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Create essay" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      wordLimit: null,
      targetType: "scholarship",
      targetCollegeId: null,
      targetScholarshipId: SCHOLARSHIP,
    });
  });
});

describe("Essay Studio page", () => {
  it("puts the essay's crew room in the left column for students only (CR-08)", async () => {
    const full: EssayWithBody = {
      ...essay(),
      body: "The first night, 30 kids came.",
      wordCount: 6,
      comments: [],
      targetLabel: "Rotary Club of Eastside",
    };
    const room: Conversation = {
      id: "22222222-2222-4222-8222-222222222222",
      room: "essay",
      roomRefId: ESSAY,
      familyId: null,
      title: "Rotary Club of Eastside essay",
      createdAt: "2026-10-02T15:00:00.000Z",
      expiresAt: null,
      lastMessageAt: null,
    };
    asStudent();
    m.getEssay.mockResolvedValue(full);
    m.getScholarship.mockResolvedValue({ deadline: "2026-10-30", verifiedAt: null, amountMaxUsd: 2500 });
    m.listStories.mockResolvedValue([]);
    m.listConversations.mockResolvedValue([
      { ...room, room: "scholarship", roomRefId: SCHOLARSHIP, id: "33333333-3333-4333-8333-333333333333" },
      room,
    ]);
    m.getMessages.mockResolvedValue([]);
    render(await EssayStudioPage({ params: Promise.resolve({ id: ESSAY }) }));
    expect(screen.getByText("Crew room · this essay")).toBeTruthy();
    expect(m.getMessages.mock.calls[0]?.[2]).toBe(room.id);
    expect(screen.getByRole("textbox", { name: "Message your crew" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "@Quill what is this prompt really asking?" })).toBeTruthy();
    cleanup();
    m.listConversations.mockClear();
    asParent();
    render(await EssayStudioPage({ params: Promise.resolve({ id: ESSAY }) }));
    expect(screen.queryByText("Crew room · this essay")).toBeNull();
    expect(m.listConversations).not.toHaveBeenCalled();
  });
});
