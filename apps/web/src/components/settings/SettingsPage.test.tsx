// @vitest-environment jsdom
import SettingsPage from "@/app/(app)/settings/page";
import type { BillingView, MeResponse, NotificationPrefs, PlanId } from "@scholarcrew/domain";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingReturnNotice } from "./BillingReturnNotice";

const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  getPrefs: vi.fn(),
  getSubscription: vi.fn(),
  getUsage: vi.fn(),
  listApiTokens: vi.fn(),
  listDocuments: vi.fn(),
  latestExport: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/notifications", () => ({ getPrefs: m.getPrefs }));
vi.mock("@scholarcrew/core/billing", () => ({ getSubscription: m.getSubscription, getUsage: m.getUsage }));
vi.mock("@scholarcrew/core/apitokens", () => ({ listApiTokens: m.listApiTokens }));
vi.mock("@scholarcrew/core/documents", () => ({ listDocuments: m.listDocuments }));
vi.mock("@scholarcrew/core/account", () => ({ latestExport: m.latestExport }));
vi.mock("next/navigation", () => ({ useRouter: () => m.router, usePathname: () => "/settings" }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const billing = (plan: PlanId): BillingView => ({
  subscription: { plan, status: "active", currentPeriodEnd: null, managedByStripe: plan !== "free", sponsor: null },
  usage: { month: "2026-10", crewRequests: 3, limit: plan === "free" ? 20 : 300, costMicros: 0 },
});

describe("BillingReturnNotice (R2I-19)", () => {
  it("after checkout, polls GET /billing until the plan changes, then refreshes and stops", async () => {
    const plans: PlanId[] = ["free", "family"];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(billing(plans.shift() ?? "family")));
    vi.stubGlobal("fetch", fetchMock);
    render(<BillingReturnNotice status="success" pollMs={5} />);
    expect(screen.getByRole("status").textContent).toBe("Payment received. Your plan updates in a minute.");
    await waitFor(() => expect(m.router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/billing");
    expect(screen.getByRole("status").textContent).toBe("Payment received. Your plan is updated.");
    await pause(40);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after five checks while the plan still reads free", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(billing("free")));
    vi.stubGlobal("fetch", fetchMock);
    render(<BillingReturnNotice status="success" pollMs={5} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    await pause(40);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(m.router.refresh).not.toHaveBeenCalled();
  });

  it("says checkout was canceled and never polls", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(billing("free")));
    vi.stubGlobal("fetch", fetchMock);
    render(<BillingReturnNotice status="cancel" pollMs={5} />);
    expect(screen.getByRole("status").textContent).toBe("Checkout canceled.");
    await pause(40);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Settings page", () => {
  const prefs: NotificationPrefs = {
    digestDay: 0,
    digestHour: 16,
    emailEnabled: true,
    smsEnabled: false,
    phoneSet: false,
    quietStartHour: 21,
    quietEndHour: 7,
  };

  function signedInAs(role: "student" | "parent") {
    const id = role === "student" ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222";
    const me: MeResponse = {
      user: {
        id,
        email: `${role}@example.test`,
        displayName: role === "student" ? "Maya Rivera" : "Dana Rivera",
        role,
        birthYear: null,
        timeZone: "America/Chicago",
        status: "active",
        createdAt: "2026-10-01T15:00:00.000Z",
      },
      profile: null,
      onboardingComplete: true,
      family: null,
      plan: "free",
    };
    m.requireAppActor.mockResolvedValue({ actor: { kind: "user", userId: id, role }, me, deps: {} });
    m.getPrefs.mockResolvedValue(prefs);
    m.getSubscription.mockResolvedValue(billing("free").subscription);
    m.getUsage.mockResolvedValue(billing("free").usage);
    m.listApiTokens.mockResolvedValue([]);
    m.listDocuments.mockResolvedValue([]);
    m.latestExport.mockResolvedValue(null);
  }

  it("gives parents an editable name and time zone, and no extension card (R2I-3)", async () => {
    signedInAs("parent");
    render(await SettingsPage({ searchParams: Promise.resolve({}) }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Dana Rivera");
    expect((screen.getByLabelText("Time zone") as HTMLSelectElement).value).toBe("America/Chicago");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByText("Parent")).toBeTruthy();
    expect(screen.queryByText("Browser extension")).toBeNull();
    expect(m.listApiTokens).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the checkout notice from ?billing= and ignores other values (R2I-19)", async () => {
    signedInAs("student");
    render(await SettingsPage({ searchParams: Promise.resolve({ billing: "cancel" }) }));
    expect(screen.getByRole("status").textContent).toBe("Checkout canceled.");
    cleanup();
    render(await SettingsPage({ searchParams: Promise.resolve({ billing: "maybe" }) }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });
});
