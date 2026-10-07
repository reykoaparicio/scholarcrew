// @vitest-environment jsdom
import type { HelperLink } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelperLinks } from "./HelperLinks";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const link = (o: Partial<HelperLink> = {}): HelperLink => ({
  id: "11111111-1111-4111-8111-111111111111",
  label: "Ms. Patel",
  helperRole: "recommender",
  scope: ["activities"],
  createdAt: "2026-10-01T15:00:00.000Z",
  expiresAt: "2026-10-31T15:00:00.000Z",
  revokedAt: null,
  lastUsedAt: null,
  ...o,
});

describe("HelperLinks (HL-01, HL-04)", () => {
  it("lists live links with their role and scope", () => {
    render(
      <HelperLinks
        links={[link(), link({ id: "2", label: "Old link", revokedAt: "2026-10-02T00:00:00.000Z" })]}
        timeZone="America/Chicago"
        nowIso="2026-10-06T15:00:00.000Z"
      />,
    );
    expect(screen.getByText("Ms. Patel")).toBeTruthy();
    expect(screen.getByText("Recommender · sees activities (brag sheet) · until Oct 31")).toBeTruthy();
    expect(screen.queryByText("Old link")).toBeNull();
  });

  it("only offers helper scopes, never essays, chats, costs, or sensitive facts", () => {
    render(<HelperLinks links={[]} timeZone="America/Chicago" nowIso="2026-10-06T15:00:00.000Z" />);
    fireEvent.click(screen.getByRole("button", { name: "New helper link" }));
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((b) => b.getAttribute("value"))).toEqual([
      "deadlines",
      "colleges",
      "activities",
      "stories",
      "scholarships",
    ]);
    for (const word of [/essay/i, /chat/i, /cost/i, /sensitive/i]) {
      expect(screen.queryByRole("checkbox", { name: word })).toBeNull();
    }
    expect((screen.getByRole("button", { name: "Create link" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("creates a link with the checked scopes and shows the URL once", async () => {
    const created = link({
      id: "33333333-3333-4333-8333-333333333333",
      label: "Mr. Okafor",
      helperRole: "counselor",
      scope: ["deadlines", "colleges"],
    });
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ link: created, url: "http://localhost:3000/h/abc123" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<HelperLinks links={[]} timeZone="America/Chicago" nowIso="2026-10-06T15:00:00.000Z" />);
    fireEvent.click(screen.getByRole("button", { name: "New helper link" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Mr. Okafor" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "counselor" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Deadlines and application status" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "College list" }));
    fireEvent.click(screen.getByRole("button", { name: "Create link" }));
    expect(await screen.findByText("http://localhost:3000/h/abc123")).toBeTruthy();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      label: "Mr. Okafor",
      helperRole: "counselor",
      scope: ["deadlines", "colleges"],
      expiresInDays: 30,
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("http://localhost:3000/h/abc123")).toBeNull();
    expect(screen.getByText("Mr. Okafor")).toBeTruthy();
  });

  it("revokes a link", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<HelperLinks links={[link()]} timeZone="America/Chicago" nowIso="2026-10-06T15:00:00.000Z" />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke Ms. Patel" }));
    await waitFor(() => expect(screen.queryByText("Ms. Patel")).toBeNull());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/helper-links/11111111-1111-4111-8111-111111111111");
  });
});
