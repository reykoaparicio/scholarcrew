// @vitest-environment jsdom
import type { Story } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoryMatch } from "./StoryMatch";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/essays/e1" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const ESSAY = "99999999-9999-4999-8999-999999999999";
const SCHOLARSHIP = "44444444-4444-4444-8444-444444444444";
const story = (id: string, title: string, themes: string[], uses: Story["uses"] = []): Story => ({
  id,
  title,
  moment: "",
  themes,
  evidence: "",
  summary: "",
  createdAt: "2026-09-01T15:00:00.000Z",
  updatedAt: "2026-09-01T15:00:00.000Z",
  archivedAt: null,
  uses,
});
const robotics = story(
  "s1",
  "Robotics → library STEM nights",
  ["service", "teaching"],
  [
    {
      essayId: "e0",
      essayTitle: "Hill Country essay",
      collegeId: null,
      scholarshipId: SCHOLARSHIP,
      usedAt: "2026-09-20T15:00:00.000Z",
    },
  ],
);
const bakery = story("s2", "Night shift at the bakery", ["work"]);
const prompt = "Describe a time you used your skills to serve your community.";

function setup(check: { alreadyUsedForTarget: boolean; priorUses: number; message: string | null }) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
    url.endsWith("/reuse-check") ? json({ storyId: "s1", ...check }) : json({ id: "u1" }, 201),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <StoryMatch
      essayId={ESSAY}
      prompt={prompt}
      stories={[bakery, robotics]}
      target={{ collegeId: null, scholarshipId: SCHOLARSHIP }}
      readOnly={false}
    />,
  );
  return fetchMock;
}

describe("StoryMatch", () => {
  it("suggests matching stories with their themes and prior uses", () => {
    setup({ alreadyUsedForTarget: false, priorUses: 1, message: null });
    const card = screen.getByRole("article", { name: "Robotics → library STEM nights" });
    expect(within(card).getByText("Matches the prompt: service")).toBeTruthy();
    expect(within(card).getByText("Used for Hill Country essay")).toBeTruthy();
    expect(screen.queryByRole("article", { name: "Night shift at the bakery" })).toBeNull();
  });

  it("links a story after a clean reuse check", async () => {
    const fetchMock = setup({ alreadyUsedForTarget: false, priorUses: 1, message: null });
    fireEvent.click(screen.getByRole("button", { name: "Use this story" }));
    await waitFor(() => expect(screen.getByText("Linked to this essay")).toBeTruthy());
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/v1/stories/reuse-check", "/api/v1/stories/link"]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      storyId: "s1",
      scholarshipId: SCHOLARSHIP,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ storyId: "s1", essayId: ESSAY });
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("warns before the same story goes to the same place twice", async () => {
    const fetchMock = setup({
      alreadyUsedForTarget: true,
      priorUses: 1,
      message: "You already sent this story to this scholarship.",
    });
    fireEvent.click(screen.getByRole("button", { name: "Use this story" }));
    await waitFor(() => expect(screen.getByText("You already sent this story to this scholarship.")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Pick another" }));
    expect(screen.queryByText("You already sent this story to this scholarship.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use this story" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Use it anyway" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Use it anyway" }));
    await waitFor(() => expect(screen.getByText("Linked to this essay")).toBeTruthy());
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/v1/stories/link");
  });
});
