// @vitest-environment jsdom
import type { Notification } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./NotificationBell";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/week" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const note = (o: Partial<Notification>): Notification => ({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "new_matches",
  title: "3 new matches",
  body: "Scout found 3 scholarships worth $7,500",
  link: "/scholarships",
  createdAt: "2026-10-04T19:00:00.000Z",
  readAt: null,
  ...o,
});

const list = [
  note({}),
  note({
    id: "22222222-2222-4222-8222-222222222222",
    kind: "digest",
    title: "Weekly digest",
    createdAt: "2026-10-05T12:00:00.000Z",
    link: "",
    readAt: "2026-10-05T12:00:00.000Z",
  }),
];

function stubApi() {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(list), { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("NotificationBell", () => {
  it("shows the unread count and lists notifications", async () => {
    stubApi();
    render(<NotificationBell timeZone="America/Chicago" />);
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    fireEvent.click(bell);
    expect(screen.getByRole("region", { name: "Notifications" })).toBeTruthy();
    expect(screen.getAllByText("Scout found 3 scholarships worth $7,500")).toHaveLength(2);
    expect(screen.getByText("Weekly digest")).toBeTruthy();
    expect(screen.getByText("Oct 4")).toBeTruthy();
  });

  it("marks a notification read and follows its internal link", async () => {
    const fetchMock = stubApi();
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(screen.getByRole("button", { name: /3 new matches/ }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/scholarships"));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/v1/notifications/11111111-1111-4111-8111-111111111111/read");
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
  });

  it("doesn't re-mark read items or navigate without a link", async () => {
    const fetchMock = stubApi();
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(screen.getByRole("button", { name: /Weekly digest/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(router.push).not.toHaveBeenCalledWith("");
  });

  it("moves focus into the panel and closes on Escape back to the bell", async () => {
    stubApi();
    render(<NotificationBell />);
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    fireEvent.click(bell);
    const panel = screen.getByRole("region", { name: "Notifications" });
    expect(bell.getAttribute("aria-controls")).toBe(panel.id);
    expect(bell.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mark all read" }));
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
    expect(document.activeElement).toBe(bell);
  });

  it("closes when you click outside it", async () => {
    stubApi();
    render(
      <>
        <NotificationBell />
        <p>page</p>
      </>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.mouseDown(screen.getByRole("region", { name: "Notifications" }));
    expect(screen.getByRole("region", { name: "Notifications" })).toBeTruthy();
    fireEvent.mouseDown(screen.getByText("page"));
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
  });
});
