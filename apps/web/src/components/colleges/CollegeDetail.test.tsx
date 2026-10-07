// @vitest-environment jsdom
import type { ApplicationItem, Recommender } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChecklistItems } from "./ChecklistItems";
import { Recommenders } from "./Recommenders";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/colleges/e1" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const item = (id: string, label: string, o: Partial<ApplicationItem> = {}): ApplicationItem => ({
  id,
  collegeListId: "e1",
  kind: "form",
  label,
  status: "todo",
  dueOn: "2026-11-01",
  essayId: null,
  updatedAt: "2026-10-01T15:00:00.000Z",
  ...o,
});
const okafor: Recommender = {
  id: "r1",
  name: "Mr. Okafor",
  email: "okafor@school.example.org",
  relationship: "Counselor",
  createdAt: "2026-09-01T15:00:00.000Z",
};

describe("ChecklistItems", () => {
  it("changes an item's status and links supplements to their draft", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ChecklistItems
        items={[
          item("i1", "Application form"),
          item("i2", "Supplement · 250 words", { kind: "supplement", essayId: "es1", status: "in_progress" }),
        ]}
        collegeId="100"
        readOnly={false}
      />,
    );
    expect(screen.getByRole("link", { name: "Open draft" }).getAttribute("href")).toBe("/essays/es1");
    expect(screen.queryByRole("button", { name: "Start essay" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Application form status" }), { target: { value: "done" } });
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/application-items/i1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"status":"done"}' });
  });

  it("starts a college essay from a supplement, links it to the item, then opens it (R2P-17)", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith("/essays")
        ? json({ id: "es9" }, 201)
        : json(item("i2", "Why State U? · 250 words", { kind: "supplement", essayId: "es9" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ChecklistItems
        items={[item("i2", "Why State U? · 250 words", { kind: "supplement" })]}
        collegeId="100"
        readOnly={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start essay" }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/essays/es9"));
    expect(fetchMock.mock.calls.map((c) => [c[0], c[1]?.method])).toEqual([
      ["/api/v1/essays", "POST"],
      ["/api/v1/application-items/i2", "PATCH"],
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      title: "Why State U? · 250 words",
      prompt: "Why State U? · 250 words",
      targetType: "college",
      targetCollegeId: "100",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ essayId: "es9" });
  });

  it("is read-only for parents", () => {
    render(
      <ChecklistItems
        items={[item("i1", "Application form", { status: "done" }), item("i3", "Supplement", { kind: "supplement" })]}
        collegeId="100"
        readOnly
      />,
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start essay" })).toBeNull();
    expect(screen.getByText("Done")).toBeTruthy();
  });
});

describe("Recommenders", () => {
  it("adds a recommender", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(okafor, 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<Recommenders recommenders={[]} entryId="e1" past={[]} timeZone="America/Chicago" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Ms. Patel" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "patel@school.example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Add recommender" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      name: "Ms. Patel",
      email: "patel@school.example.org",
      relationship: "",
    });
  });

  it("requests a letter and explains the helper link that was created", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json(
        {
          id: "q1",
          recommenderId: "r1",
          collegeListId: "e1",
          scholarshipApplicationId: null,
          helperLinkId: "h1",
          status: "requested",
          requestedAt: "2026-10-06T15:00:00.000Z",
          updatedAt: "2026-10-06T15:00:00.000Z",
        },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Recommenders recommenders={[okafor]} entryId="e1" past={[]} timeZone="America/Chicago" />);
    const form = screen.getByRole("form", { name: "Ask for a letter" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Message" }), {
      target: { value: "Could you write for State U?" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Request sent to Mr. Okafor"));
    expect(screen.getByRole("status").textContent).toContain("helper link");
    expect(screen.getByRole("link", { name: "Family → Helper links" }).getAttribute("href")).toBe("/family");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/recommenders/requests");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      recommenderId: "r1",
      collegeListId: "e1",
      message: "Could you write for State U?",
    });
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("lists past requests for this school with each helper link's state (D33)", () => {
    render(
      <Recommenders
        recommenders={[okafor]}
        entryId="e1"
        timeZone="America/Chicago"
        past={[
          {
            id: "q2",
            recommenderName: "Mr. Okafor",
            status: "confirmed",
            requestedAt: "2026-10-01T15:00:00.000Z",
            link: { state: "active", expiresAt: "2026-10-31T15:00:00.000Z" },
          },
          {
            id: "q1",
            recommenderName: "Ms. Patel",
            status: "requested",
            requestedAt: "2026-09-02T15:00:00.000Z",
            link: { state: "expired", expiresAt: "2026-10-02T15:00:00.000Z" },
          },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Letters you asked for" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.firstElementChild?.textContent),
    ).toEqual(["Mr. Okafor · asked Oct 1Helper link open until Oct 31", "Ms. Patel · asked Sep 2Helper link expired"]);
    expect((screen.getByRole("combobox", { name: "Mr. Okafor letter status" }) as HTMLSelectElement).value).toBe(
      "confirmed",
    );
    expect((screen.getByRole("combobox", { name: "Ms. Patel letter status" }) as HTMLSelectElement).value).toBe(
      "requested",
    );
  });

  it("updates a past request's status with PATCH /recommendations/:id, then refreshes (R2P-11)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ id: "q1", status: "submitted" }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <Recommenders
        recommenders={[okafor]}
        entryId="e1"
        timeZone="America/Chicago"
        past={[
          {
            id: "q1",
            recommenderName: "Mr. Okafor",
            status: "requested",
            requestedAt: "2026-09-02T15:00:00.000Z",
            link: null,
          },
        ]}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Mr. Okafor letter status" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => [o.textContent, (o as HTMLOptionElement).disabled]),
    ).toEqual([
      ["Asked", true],
      ["Agreed to write", false],
      ["Submitted", false],
      ["Declined", false],
    ]);
    fireEvent.change(select, { target: { value: "submitted" } });
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/recommendations/q1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"status":"submitted"}' });
  });
});
