// @vitest-environment jsdom
import type { RequirementProgress, ServiceLog } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequirementCard } from "./RequirementCard";
import { ServiceLogs } from "./ServiceLogs";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/impact" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const log = (o: Partial<ServiceLog>): ServiceLog => ({
  id: "l1",
  organization: "Eastside Food Pantry",
  activity: "sorting",
  servedOn: "2026-10-03",
  minutes: 240,
  supervisorName: "Mr. Greene",
  supervisorEmail: "greene@pantry.example.org",
  verification: "self_reported",
  verificationExpiresAt: null,
  verifiedAt: null,
  verifierNote: "",
  reflection: "",
  createdAt: "2026-10-03T20:00:00.000Z",
  ...o,
});
const NOW = "2026-10-06T15:00:00.000Z";
const logs = [
  log({}),
  log({
    id: "l2",
    organization: "Riverside Park",
    activity: "cleanup",
    minutes: 90,
    verification: "declined",
    verifierNote: "1 hour, not 1.5",
  }),
  log({
    id: "l3",
    organization: "Maple Library",
    activity: "STEM night",
    minutes: 150,
    verification: "verified",
    verifiedAt: "2026-09-25T15:00:00.000Z",
    reflection: "A girl asked to take the sensor home.",
  }),
];

describe("ServiceLogs", () => {
  it("shows each status and asks a supervisor to confirm", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ ...logs[0], verification: "requested" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceLogs logs={logs} readOnly={false} timeZone="America/Chicago" now={NOW} />);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1] as HTMLElement).getByText("Not sent yet")).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText("Declined")).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText("“1 hour, not 1.5”")).toBeTruthy();
    expect(within(rows[3] as HTMLElement).getByText("Confirmed")).toBeTruthy();
    expect(
      within(rows[3] as HTMLElement)
        .getByRole("link", { name: "Start a story from this" })
        .getAttribute("href"),
    ).toBe("/essays/stories?fromLog=l3");
    fireEvent.click(within(rows[1] as HTMLElement).getByRole("button", { name: "Ask to confirm" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/service-logs/l1/verify");
  });

  it("shows a lapsed supervisor link as expired and lets the student ask again (R2P-10)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json(log({ id: "l4", verification: "requested" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const lapsed = log({
      id: "l4",
      servedOn: "2026-09-10",
      verification: "requested",
      verificationExpiresAt: "2026-09-24T20:00:00.000Z",
    });
    const open = log({
      id: "l5",
      servedOn: "2026-10-01",
      verification: "requested",
      verificationExpiresAt: "2026-10-15T20:00:00.000Z",
    });
    render(<ServiceLogs logs={[lapsed, open]} readOnly={false} timeZone="America/Chicago" now={NOW} />);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1] as HTMLElement).getByText("Waiting")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).queryByRole("button", { name: "Ask to confirm" })).toBeNull();
    expect(within(rows[2] as HTMLElement).getByText("Link expired")).toBeTruthy();
    expect(within(rows[2] as HTMLElement).queryByText(/link sent/)).toBeNull();
    fireEvent.click(within(rows[2] as HTMLElement).getByRole("button", { name: "Ask to confirm" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/service-logs/l4/verify");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    cleanup();
    render(<ServiceLogs logs={[lapsed]} readOnly timeZone="America/Chicago" now={NOW} />);
    expect(screen.getByText("Link expired")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ask to confirm" })).toBeNull();
  });

  it("validates and logs hours", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(log({}), 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceLogs logs={[]} readOnly={false} timeZone="America/Chicago" now={NOW} />);
    const form = screen.getByRole("form", { name: "Log hours" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Organization" }), {
      target: { value: "Eastside Food Pantry" },
    });
    fireEvent.change(within(form).getByRole("textbox", { name: "What you did" }), { target: { value: "sorting" } });
    fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2026-10-03" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Hours" }), { target: { value: "30" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save hours" }));
    expect(within(form).getByRole("alert").textContent).toBe("Hours are a number between 0 and 24, like 1.5.");
    fireEvent.change(within(form).getByRole("textbox", { name: "Hours" }), { target: { value: "4" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Supervisor email (optional)" }), {
      target: { value: "greene@pantry.example.org" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save hours" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      organization: "Eastside Food Pantry",
      activity: "sorting",
      servedOn: "2026-10-03",
      minutes: 240,
      supervisorName: "",
      supervisorEmail: "greene@pantry.example.org",
      reflection: "",
    });
  });
});

describe("RequirementCard", () => {
  it("shows confirmed hours against each requirement", () => {
    const progress: RequirementProgress[] = [
      {
        scholarshipId: "s1",
        scholarshipName: "Lone Star Credit Union Award",
        requiredHours: 40,
        verifiedHours: 26,
        totalHours: 28.5,
      },
      {
        scholarshipId: "s2",
        scholarshipName: "First-Gen Futures",
        requiredHours: 25,
        verifiedHours: 26,
        totalHours: 26,
      },
    ];
    render(<RequirementCard progress={progress} />);
    expect(screen.getByText("14 to go")).toBeTruthy();
    expect(screen.getByText("Met")).toBeTruthy();
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  });
});
