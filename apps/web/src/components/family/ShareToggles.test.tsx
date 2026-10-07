// @vitest-environment jsdom
import type { FamilyTask, ShareSettings } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FamilyTasks } from "./FamilyTasks";
import { ParentSpace } from "./ParentSpace";
import { ShareToggles } from "./ShareToggles";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const settings: ShareSettings = {
  studentId: "11111111-1111-4111-8111-111111111111",
  familyId: "22222222-2222-4222-8222-222222222222",
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
};

describe("ShareToggles (FA-02)", () => {
  it("shows the defaults and names who sees them", () => {
    render(<ShareToggles settings={settings} parentNames={["Dana"]} />);
    expect(screen.getByRole("heading", { name: "What I share with Dana" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Deadlines and calendar" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("switch", { name: "Essays and drafts" }).getAttribute("aria-checked")).toBe("false");
    // R2I-11: `sensitive` gates the parent-visible sensitive match reasons (07); it never reaches chat.
    expect(
      screen
        .getByRole("switch", { name: "Sensitive match reasons (scholarship board only, never in chat)" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(screen.getAllByRole("switch")).toHaveLength(9);
    expect(screen.getByText("Dana sees only what's on. Turning something off hides it right away.")).toBeTruthy();
  });

  it("saves one category at a time", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ ...settings, categories: { ...settings.categories, essays: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ShareToggles settings={settings} parentNames={["Dana"]} />);
    fireEvent.click(screen.getByRole("switch", { name: "Essays and drafts" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/family/share-settings");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ categories: { essays: true } }),
    });
    expect(screen.getByRole("switch", { name: "Essays and drafts" }).getAttribute("aria-checked")).toBe("true");
  });

  it("reverts when saving fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "not_found", message: "Family not found" } }), { status: 404 }),
      ),
    );
    render(<ShareToggles settings={settings} parentNames={[]} />);
    fireEvent.click(screen.getByRole("switch", { name: "College list" }));
    expect(await screen.findByText("Family not found")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "College list" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("FamilyTasks (FA-05)", () => {
  const task = (o: Partial<FamilyTask>): FamilyTask => ({
    id: "33333333-3333-4333-8333-333333333333",
    familyId: settings.familyId,
    assigneeId: "44444444-4444-4444-8444-444444444444",
    assigneeName: "Dana Rivera",
    studentId: settings.studentId,
    kind: "fafsa_contributor",
    title: "Add your info to the 2027-28 FAFSA",
    detail: "As a contributor, from your own StudentAid.gov account",
    status: "todo",
    dueOn: null,
    createdAt: "2026-10-01T15:00:00.000Z",
    completedAt: null,
    ...o,
  });

  it("shows who each task is for and lets the assignee mark it done", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(task({ status: "done" })), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FamilyTasks
        tasks={[
          task({}),
          task({
            id: "55555555-5555-4555-8555-555555555555",
            assigneeId: settings.studentId,
            assigneeName: "Maya Rivera",
            title: "Add Dana as a FAFSA contributor",
            status: "done",
          }),
        ]}
        myUserId="44444444-4444-4444-8444-444444444444"
      />,
    );
    expect(screen.getByText("Dana")).toBeTruthy();
    expect(screen.getByText("Not started")).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Mark done/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Mark done: Add your info to the 2027-28 FAFSA" }));
    await waitFor(() => expect(screen.getAllByText("Done")).toHaveLength(2));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"status":"done"}' });
  });

  it("shows due dates, a skipped task without a check, and the nameless-assignee fallback (R3V-11, R3V-14)", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <FamilyTasks
        tasks={[
          task({ dueOn: "2026-10-15" }),
          task({
            id: "66666666-6666-4666-8666-666666666666",
            title: "Review the cost sheet together",
            status: "skipped",
            assigneeName: "Your family member",
          }),
        ]}
        myUserId="11111111-1111-4111-8111-111111111111"
      />,
    );
    expect(screen.getByText("Due Oct 15")).toBeTruthy();
    expect(screen.getAllByText(/^Due /)).toHaveLength(1);
    const skipped = screen.getByText("Skipped");
    expect(skipped.querySelector('[data-icon="check"]')).toBeNull();
    expect(skipped.querySelector('[data-icon="info"]')).toBeTruthy();
    expect(screen.getByText("Your family member")).toBeTruthy();
    expect(screen.getByText("Dana")).toBeTruthy();
  });
});

describe("ParentSpace budget (FA-04, R3V-3)", () => {
  const budgetField = () => screen.getByLabelText("Yearly family budget for college");
  const saveButton = () => screen.getByRole("button", { name: "Save budget" }) as HTMLButtonElement;

  it('saves "12,000" as 12000', async () => {
    const fetchMock = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Response(
          JSON.stringify({
            familyId: settings.familyId,
            annualUsd: JSON.parse(String(init?.body)).annualUsd,
            sharedById: "44444444-4444-4444-8444-444444444444",
            updatedAt: "2026-10-06T15:00:00.000Z",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ParentSpace studentId={settings.studentId} studentName="Maya" budget={null} />);
    fireEvent.change(budgetField(), { target: { value: "12,000" } });
    fireEvent.click(saveButton());
    expect(await screen.findByText("Saved: $12,000 a year. Ledger uses it in the gap.")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/family/budget");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PUT", body: '{"annualUsd":12000}' });
  });

  it("keeps Save off for a blank field and refuses text that isn't whole dollars", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ParentSpace studentId={settings.studentId} studentName="Maya" budget={null} />);
    fireEvent.change(budgetField(), { target: { value: " " } });
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(budgetField(), { target: { value: "12k" } });
    fireEvent.click(saveButton());
    expect(screen.getByText("Enter whole dollars, up to $500,000.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
