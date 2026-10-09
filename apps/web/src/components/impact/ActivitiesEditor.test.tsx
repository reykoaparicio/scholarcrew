// @vitest-environment jsdom
import type { Activity } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivitiesEditor } from "./ActivitiesEditor";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/impact" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const robotics: Activity = {
  id: "a1",
  position: 1,
  name: "Robotics team",
  role: "Build lead",
  organization: "Maple High",
  description: "Build lead for a 14-person team.",
  hoursPerWeek: 8,
  weeksPerYear: 30,
  grades: [9, 10, 11, 12],
  category: "Robotics",
};

describe("ActivitiesEditor", () => {
  it("counts the description against 150 characters and blocks saving over the limit", () => {
    render(<ActivitiesEditor activities={[robotics]} readOnly={false} />);
    expect(screen.getByText("1 of 10 · 150 characters each, counted exactly")).toBeTruthy();
    expect(screen.getByText("32 / 150")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit Robotics team" }));
    const slot = screen.getByRole("form", { name: "Activity 1" });
    const description = within(slot).getByRole("textbox", { name: "Description" });
    expect(within(slot).getByText("32 / 150")).toBeTruthy();
    fireEvent.change(description, { target: { value: "a".repeat(145) } });
    expect(within(slot).getByText("145 / 150")).toBeTruthy();
    expect(within(slot).getByText("5 left")).toBeTruthy();
    fireEvent.change(description, { target: { value: "a".repeat(155) } });
    expect(within(slot).getByText("155 / 150")).toBeTruthy();
    expect(within(slot).getByText("5 over")).toBeTruthy();
    expect((within(slot).getByRole("button", { name: "Save activity" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(description, { target: { value: "🤖".repeat(150) } });
    expect(within(slot).getByText("150 / 150")).toBeTruthy();
    expect((within(slot).getByRole("button", { name: "Save activity" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("saves an activity in the next free slot with PUT", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ActivitiesEditor activities={[robotics]} readOnly={false} />);
    expect(screen.queryByRole("form", { name: "Activity 2" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add an activity" }));
    const slot = screen.getByRole("form", { name: "Activity 2" });
    fireEvent.change(within(slot).getByRole("textbox", { name: "Activity name" }), {
      target: { value: "Library STEM nights" },
    });
    fireEvent.change(within(slot).getByRole("textbox", { name: "Description" }), {
      target: { value: "Started free robotics nights." },
    });
    fireEvent.change(within(slot).getByRole("textbox", { name: "Hours per week" }), { target: { value: "3" } });
    fireEvent.click(within(slot).getByRole("checkbox", { name: "Grade 11" }));
    fireEvent.click(within(slot).getByRole("button", { name: "Save activity" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/activities");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      position: 2,
      name: "Library STEM nights",
      role: "",
      organization: "",
      description: "Started free robotics nights.",
      hoursPerWeek: 3,
      weeksPerYear: 0,
      grades: [11],
      category: "",
    });
  });

  it("stops offering slots at 10 and is read-only for parents", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ ...robotics, id: `a${i + 1}`, position: i + 1 }));
    render(<ActivitiesEditor activities={ten} readOnly={false} />);
    expect(screen.queryByRole("button", { name: "Add an activity" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Activity 11" })).toBeNull();
    cleanup();
    render(<ActivitiesEditor activities={[robotics]} readOnly />);
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Robotics team" })).toBeNull();
    expect(screen.getByText("Build lead for a 14-person team.")).toBeTruthy();
  });
});
