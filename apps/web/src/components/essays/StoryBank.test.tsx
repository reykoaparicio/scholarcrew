// @vitest-environment jsdom
import type { Story } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoryBank } from "./StoryBank";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/essays/stories" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const clinic: Story = {
  id: "s1",
  title: "Translating at the clinic",
  moment: "Mrs. Reyes squeezed my hand when the nurse finally understood her.",
  themes: ["family", "language"],
  evidence: "Volunteer since 2025",
  summary: "Interpreting for patients",
  createdAt: "2026-09-01T15:00:00.000Z",
  updatedAt: "2026-09-01T15:00:00.000Z",
  archivedAt: null,
  uses: [
    {
      essayId: "e1",
      essayTitle: "State U supplement",
      collegeId: "100",
      scholarshipId: null,
      usedAt: "2026-09-20T15:00:00.000Z",
    },
  ],
};

describe("StoryBank", () => {
  it("creates a story with theme chips", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ ...clinic, id: "s2" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<StoryBank stories={[clinic]} readOnly={false} prefill={null} />);
    const form = screen.getByRole("form", { name: "New story" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Title" }), {
      target: { value: "Night shift at the bakery" },
    });
    fireEvent.change(within(form).getByRole("textbox", { name: "The moment, in your words" }), {
      target: { value: "At 4 a.m. the ovens were mine." },
    });
    const theme = within(form).getByRole("textbox", { name: "Add a theme" });
    for (const t of ["work", "responsibility"]) {
      fireEvent.change(theme, { target: { value: t } });
      fireEvent.click(within(form).getByRole("button", { name: "Add theme" }));
    }
    fireEvent.click(within(form).getByRole("button", { name: "Remove theme work" }));
    fireEvent.click(within(form).getByRole("button", { name: "Save story" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/stories");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      title: "Night shift at the bakery",
      moment: "At 4 a.m. the ovens were mine.",
      themes: ["responsibility"],
      evidence: "",
      summary: "",
    });
  });

  it("lists uses, edits, and archives", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? new Response(null, { status: 204 }) : json(clinic),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<StoryBank stories={[clinic]} readOnly={false} prefill={null} />);
    const item = screen.getByRole("article", { name: "Translating at the clinic" });
    expect(within(item).getByText("Used in State U supplement")).toBeTruthy();
    fireEvent.click(within(item).getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit story" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Title" }), {
      target: { value: "The clinic, Saturdays" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save story" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/stories/s1");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PATCH");
    fireEvent.click(within(item).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("DELETE");
  });

  it("starts from a reflection and hides editing for parents", () => {
    render(
      <StoryBank
        stories={[]}
        readOnly={false}
        prefill={{ title: "Maple Library: STEM night", moment: "A girl asked to take the sensor home." }}
      />,
    );
    expect((screen.getByRole("textbox", { name: "The moment, in your words" }) as HTMLTextAreaElement).value).toBe(
      "A girl asked to take the sensor home.",
    );
    cleanup();
    render(<StoryBank stories={[clinic]} readOnly prefill={null} />);
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Start a story interview" })).toBeNull();
  });

  it("starts a Quill story interview with an optional past essay, capped at 4,000 characters (ES-08)", () => {
    render(<StoryBank stories={[]} readOnly={false} prefill={null} />);
    const link = () => screen.getByRole("link", { name: "Start a story interview" });
    const ask = () => new URL(link().getAttribute("href") ?? "", "http://localhost").searchParams.get("prefill") ?? "";
    expect(link().getAttribute("href")?.startsWith("/crew?prefill=")).toBe(true);
    expect(ask()).toBe("@Quill interview me for a new Story Bank story");
    expect(screen.getByText(/Your answers, in your words, become the story's moment/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Paste a past essay (optional)" }), {
      target: { value: "x".repeat(5000) },
    });
    expect(
      ask().startsWith("@Quill interview me for a new Story Bank story. Here's a past essay to start from:\n\nxxx"),
    ).toBe(true);
    expect(ask()).toHaveLength(4000);
  });
});
