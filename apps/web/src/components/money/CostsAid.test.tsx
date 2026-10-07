// @vitest-environment jsdom
import MoneyPage from "@/app/(app)/money/page";
import type { AidChecklist, AidDeadline, CostSummary } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AidChecklists, AidHelpCards } from "./AidChecklists";
import { CalculatorForm } from "./CalculatorForm";
import { CostCards } from "./CostCards";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  getFamily: vi.fn(),
  getCosts: vi.fn(),
  getAidChecklists: vi.fn(),
  listAidDeadlines: vi.fn(),
  getCollegeList: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/money" }));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily }));
vi.mock("@scholarcrew/core/money", () => ({ getCosts: m.getCosts }));
vi.mock("@scholarcrew/core/aid", () => ({
  getAidChecklists: m.getAidChecklists,
  listAidDeadlines: m.listAidDeadlines,
}));
vi.mock("@scholarcrew/core/colleges", () => ({ getCollegeList: m.getCollegeList }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const cost: CostSummary = {
  collegeId: "100",
  collegeName: "State U",
  source: "calculator",
  sourceLabel: "State U net price calculator",
  costOfAttendanceUsd: 27800,
  freeMoneyUsd: 18600,
  gapUsd: 9200,
  pendingUsd: 0,
  gapIfPendingWinUsd: 9200,
  isEstimate: false,
  budgetUsd: 6000,
  gapAfterBudgetUsd: 3200,
};
const fafsa: AidChecklist = {
  program: "fafsa",
  awardYear: "2027-28",
  collegeId: null,
  collegeName: null,
  doneCount: 1,
  totalCount: 2,
  items: [
    {
      id: "a1",
      awardYear: "2027-28",
      program: "fafsa",
      collegeId: null,
      key: "studentaid_account",
      title: "Create your StudentAid.gov account",
      assignee: "student",
      status: "done",
      dueOn: null,
      completedAt: "2026-10-01T15:00:00.000Z",
    },
    {
      id: "a2",
      awardYear: "2027-28",
      program: "fafsa",
      collegeId: null,
      key: "contributor_consent",
      title: "Give consent to share federal tax information",
      assignee: "parent",
      status: "todo",
      dueOn: "2026-12-01",
      completedAt: null,
    },
  ],
};
const deadline: AidDeadline = {
  id: "d1",
  awardYear: "2027-28",
  state: "TX",
  program: "Texas Application for State Financial Aid priority",
  deadline: "2027-01-15",
  note: "Earlier is better.",
  sourceUrl: "https://aid.example.org/tx",
  verifiedAt: "2026-09-30T15:00:00.000Z",
};

describe("CostCards", () => {
  it("shows the gap, its source, and the family budget line", () => {
    render(<CostCards costs={[cost]} />);
    expect(screen.getByText("$9,200 a year")).toBeTruthy();
    expect(screen.getByText("State U net price calculator")).toBeTruthy();
    expect(screen.getByText("Family budget $6,000/yr · $3,200 left after it")).toBeTruthy();
  });
});

describe("CalculatorForm", () => {
  it("validates and saves a calculator result", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(cost));
    vi.stubGlobal("fetch", fetchMock);
    render(<CalculatorForm colleges={[{ id: "100", name: "State U" }]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Cost to attend for a year" }), {
      target: { value: "27,800" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Grants and scholarships it showed" }), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save result" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter whole dollars, up to $200,000.");
    fireEvent.change(screen.getByRole("textbox", { name: "Grants and scholarships it showed" }), {
      target: { value: "18600" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save result" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/costs/calculator");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      collegeId: "100",
      costOfAttendanceUsd: 27800,
      grantsUsd: 18600,
    });
  });
});

describe("AidChecklists", () => {
  it("checks off a step, marks parent steps, and lists state deadlines", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ ...fafsa.items[1], status: "done" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AidChecklists checklists={[fafsa]} deadlines={[deadline]} readOnly={false} />);
    expect(screen.getByRole("heading", { name: "FAFSA · 2027-28" })).toBeTruthy();
    expect(screen.getByText("1 of 2 done")).toBeTruthy();
    expect(screen.getByText(/Parent step/)).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Give consent to share federal tax information" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/aid/items/a2");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ status: "done" });
    expect(screen.getByText("Texas Application for State Financial Aid priority")).toBeTruthy();
    expect(screen.getByText("Jan 15")).toBeTruthy();
  });
});

describe("AidHelpCards (AID-04, AID-05)", () => {
  it("explains a special-circumstances review and verification, with Ask Aid links for students only", () => {
    render(<AidHelpCards readOnly={false} />);
    const changed = screen.getByRole("region", { name: "Family finances changed?" });
    expect(within(changed).getByText(/Schools can adjust it through a professional judgment review/)).toBeTruthy();
    expect(within(changed).getByText("A letter from a parent explaining what changed and when")).toBeTruthy();
    const ask = (name: string) =>
      new URL(screen.getByRole("link", { name }).getAttribute("href") ?? "", "http://localhost").searchParams.get(
        "prefill",
      );
    expect(ask("Ask Aid about a review")).toBe(
      "@Aid my family's finances changed. How do I ask my schools for a review, and what should I gather?",
    );
    const verify = screen.getByRole("region", { name: "Selected for verification?" });
    expect(within(verify).getByText("The school's verification worksheet, filled out and signed")).toBeTruthy();
    expect(ask("Ask Aid to track it")).toBe(
      "@Aid I was selected for verification. Help me list what my school asked for and add the steps to my plan.",
    );
    cleanup();
    render(<AidHelpCards readOnly />);
    expect(screen.getByRole("region", { name: "Family finances changed?" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Ask Aid about a review" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ask Aid to track it" })).toBeNull();
  });
});

describe("money page calculator picker (R2P-13)", () => {
  it("offers every listed college, including one with no cost estimate yet, and none to parents", async () => {
    const deps = { clock: { now: () => new Date("2026-10-06T15:00:00.000Z") } };
    m.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: "s1", role: "student" },
      me: {
        user: { id: "s1", displayName: "Maya Rivera", role: "student", timeZone: "America/Chicago" },
        onboardingComplete: true,
      },
      deps,
    });
    m.getCosts.mockResolvedValue([cost]);
    m.getAidChecklists.mockResolvedValue([]);
    m.listAidDeadlines.mockResolvedValue([]);
    m.getCollegeList.mockResolvedValue([
      { collegeId: "100", college: { name: "State U" } },
      { collegeId: "200", college: { name: "Riverside College" } },
    ]);
    render(await MoneyPage());
    expect(m.getCollegeList.mock.calls[0]?.[2]).toBe("s1");
    const picker = screen.getByRole("combobox", { name: "College" }) as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => [o.value, o.textContent])).toEqual([
      ["100", "State U"],
      ["200", "Riverside College"],
    ]);
    cleanup();
    m.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: "p1", role: "parent" },
      me: {
        user: { id: "p1", displayName: "Dana Rivera", role: "parent", timeZone: "America/Chicago" },
        onboardingComplete: true,
      },
      deps,
    });
    m.getFamily.mockResolvedValue({ members: [{ userId: "s1", displayName: "Maya Rivera", memberRole: "student" }] });
    m.getCollegeList.mockClear();
    render(await MoneyPage());
    expect(screen.queryByRole("combobox", { name: "College" })).toBeNull();
    expect(m.getCollegeList).not.toHaveBeenCalled();
  });
});
