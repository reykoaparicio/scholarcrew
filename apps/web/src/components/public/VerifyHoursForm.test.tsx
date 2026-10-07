// @vitest-environment jsdom
import type { VerificationRequestView } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import VerifyHoursPage, { metadata } from "../../app/verify-hours/[token]/page";
import { VerifyHoursForm, hoursLabel } from "./VerifyHoursForm";

const state = vi.hoisted(() => ({ allowed: true, view: null as VerificationRequestView | null }));
vi.mock("@/server/deps", () => ({ getDeps: () => ({}) }));
vi.mock("@/components/public/pageRate", () => ({
  VERIFY_HOURS_RATE: { key: "verify-hours", limit: 10, windowSeconds: 3600 },
  allowPageRequest: async () => state.allowed,
}));
vi.mock("@scholarcrew/core/impact", () => ({ getVerificationRequest: async () => state.view }));

afterEach(() => {
  cleanup();
  state.allowed = true;
  state.view = null;
});

const VIEW: VerificationRequestView = {
  studentFirstName: "Jordan",
  organization: "Maple Food Bank",
  activity: "Sorting donations",
  servedOn: "2026-10-03",
  minutes: 150,
  expiresAt: "2026-10-20T15:00:00.000Z",
};
const TOKEN = "verify-token-abcdefghijkl";

function respond(status: number, data?: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    data === undefined
      ? new Response(null, { status })
      : new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }),
  );
}

describe("hoursLabel", () => {
  it("reads minutes as hours", () => {
    expect(hoursLabel(150)).toBe("2.5 hours");
    expect(hoursLabel(60)).toBe("1 hour");
    expect(hoursLabel(100)).toBe("1.67 hours");
    expect(hoursLabel(45)).toBe("45 minutes");
    expect(hoursLabel(1)).toBe("1 minute");
  });
});

describe("VerifyHoursForm", () => {
  it("shows what to confirm and posts a confirmation", async () => {
    const fetchMock = respond(204);
    vi.stubGlobal("fetch", fetchMock);
    render(<VerifyHoursForm token={TOKEN} view={VIEW} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Confirm Jordan's service hours");
    for (const text of [
      "Maple Food Bank",
      "Sorting donations",
      "Oct 3, 2026",
      "2.5 hours",
      "This link expires Oct 20, 2026.",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Confirm these hours" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "We let Jordan know you confirmed 2.5 hours at Maple Food Bank.",
      ),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/verify-hours/${TOKEN}`);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ confirmed: true, note: "" });
  });

  it("declines with a note", async () => {
    const fetchMock = respond(204);
    vi.stubGlobal("fetch", fetchMock);
    render(<VerifyHoursForm token={TOKEN} view={VIEW} />);
    fireEvent.change(screen.getByLabelText("Note to Jordan (optional)"), {
      target: { value: " Only 1 hour that day. " },
    });
    fireEvent.click(screen.getByRole("button", { name: "I can't confirm these" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("We let Jordan know you didn't confirm these hours."),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      confirmed: false,
      note: "Only 1 hour that day.",
    });
  });

  it("explains an expired or used link", async () => {
    vi.stubGlobal("fetch", respond(404, { error: { code: "not_found", message: "Not found" } }));
    render(<VerifyHoursForm token={TOKEN} view={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm these hours" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("This link has expired or was already used."),
    );
    expect((screen.getByRole("button", { name: "Confirm these hours" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("/verify-hours/[token] page", () => {
  it("renders the form, a friendly expired message, or the rate-limit message", async () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    const page = async () => renderToStaticMarkup(await VerifyHoursPage({ params: Promise.resolve({ token: TOKEN }) }));
    expect(await page()).toContain("This link has expired or was already used");
    state.view = VIEW;
    expect(await page()).toContain("Sorting donations");
    state.allowed = false;
    expect(await page()).toContain("Too many tries");
  });
});
