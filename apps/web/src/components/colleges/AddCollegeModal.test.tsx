// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddCollegeModal } from "./AddCollegeModal";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/colleges" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const stateU = {
  id: "100",
  name: "State U",
  state: "TX",
  city: "Austin",
  control: "public",
  admitRate: 0.6,
  costOfAttendanceUsd: 27800,
  testPolicy: "optional",
};

describe("AddCollegeModal", () => {
  it("explains the limit when the list already has 25 schools", () => {
    render(<AddCollegeModal open count={25} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Add a school" });
    expect(
      within(dialog).getByText("Your list has 25 schools, the most it can hold. Remove one to add another."),
    ).toBeTruthy();
    expect(within(dialog).queryByRole("textbox", { name: "Search colleges" })).toBeNull();
  });

  it("searches, picks a school with fit and plan, and adds it", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.startsWith("/api/v1/colleges?")
        ? json({ items: [stateU], page: 1, pageSize: 20, total: 1 })
        : json({ id: "e1" }, 201),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AddCollegeModal open count={6} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Add a school" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Search colleges" }), {
      target: { value: "state u" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Search" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "State U · Austin, TX" }));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/colleges?q=state%20u");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Fit" }), { target: { value: "reach" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Plan" }), { target: { value: "EA" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to my list" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      collegeId: "100",
      fit: "reach",
      plan: "EA",
    });
  });

  it("shows the server's limit message if another tab filled the list", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.startsWith("/api/v1/colleges?")
        ? json({ items: [stateU], page: 1, pageSize: 20, total: 1 })
        : json(
            {
              error: {
                code: "invalid_input",
                message: "Your list holds up to 25 colleges. Remove one to add another.",
              },
            },
            400,
          ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AddCollegeModal open count={24} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Add a school" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Search colleges" }), { target: { value: "state" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Search" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "State U · Austin, TX" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to my list" }));
    // 07's exact text, which 14 N2 asserts too (R3A-20).
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toBe(
        "Your list holds up to 25 colleges. Remove one to add another.",
      ),
    );
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });
});
