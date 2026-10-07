// @vitest-environment jsdom
import type { EssayWithBody } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EssayWorkspace } from "./EssayWorkspace";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  usePathname: () => "/essays/e1",
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const essay: EssayWithBody = {
  id: "99999999-9999-4999-8999-999999999999",
  title: "Rotary Club of Eastside essay",
  prompt: "Describe a time you used your skills to serve your community.",
  wordLimit: 500,
  charLimit: null,
  targetType: "scholarship",
  targetCollegeId: null,
  targetScholarshipId: "44444444-4444-4444-8444-444444444444",
  currentVersion: 2,
  latestWordCount: 6,
  status: "drafting",
  createdAt: "2026-10-01T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
  body: "The first night, 30 kids came.",
  wordCount: 6,
  comments: [
    {
      id: "c1",
      essayId: "99999999-9999-4999-8999-999999999999",
      version: 2,
      author: "quill",
      kind: "question",
      quote: "30 kids came",
      occurrence: 1,
      body: "What changed for one of those kids?",
      resolvedAt: null,
      createdAt: "2026-10-06T15:00:00.000Z",
    },
  ],
  targetLabel: "Rotary Club of Eastside",
};

describe("EssayWorkspace", () => {
  it("opens on the editor and switches to the review view with highlights", () => {
    const { container } = render(<EssayWorkspace essay={essay} readOnly={false} />);
    expect(screen.getByRole("textbox", { name: "Your draft" })).toBeTruthy();
    expect(screen.getByText("494 words left.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review notes" }));
    expect(screen.queryByRole("textbox", { name: "Your draft" })).toBeNull();
    expect(container.querySelector("mark")?.textContent).toBe("30 kids came1");
  });

  it("shows parents the review view without editing or Ask Quill", () => {
    render(<EssayWorkspace essay={essay} readOnly />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ask Quill" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Essay status" })).toBeNull();
    expect(screen.getByText("What changed for one of those kids?")).toBeTruthy();
  });

  it("lets the student set the essay status with PATCH /essays/:id, then refreshes (R2P-14)", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ ...essay, status: "ready" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<EssayWorkspace essay={essay} readOnly={false} />);
    const select = screen.getByRole("combobox", { name: "Essay status" }) as HTMLSelectElement;
    expect(select.value).toBe("drafting");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Drafting", "Ready", "Submitted"]);
    fireEvent.change(select, { target: { value: "ready" } });
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/essays/${essay.id}`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"status":"ready"}' });
    expect(select.value).toBe("ready");
  });
});
