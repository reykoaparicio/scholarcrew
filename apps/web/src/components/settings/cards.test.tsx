// @vitest-environment jsdom
import type { BillingView, NotificationPrefs, Profile } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountCard } from "./AccountCard";
import { NotificationsCard, hourLabel } from "./NotificationsCard";
import { PlanCard, resetLabel } from "./PlanCard";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/settings" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const prefs: NotificationPrefs = {
  digestDay: 0,
  digestHour: 16,
  emailEnabled: true,
  smsEnabled: false,
  phoneSet: false,
  quietStartHour: 21,
  quietEndHour: 7,
};

const billing = (o: Partial<BillingView["subscription"]> = {}): BillingView => ({
  subscription: { plan: "free", status: "active", currentPeriodEnd: null, managedByStripe: false, sponsor: null, ...o },
  usage: { month: "2026-10", crewRequests: 12, limit: 20, costMicros: 0 },
});

/** PATCH /profile returns the saved Profile (R3A-18). */
const profile: Profile = {
  userId: "11111111-1111-4111-8111-111111111111",
  classYear: 2027,
  highSchool: "Maple High School",
  state: "TX",
  county: "Maple",
  city: "",
  gpaUnweighted: 3.72,
  gpaWeighted: null,
  intendedMajors: [],
  interests: [],
  onboardingCompletedAt: "2026-10-01T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
};

describe("helpers", () => {
  it("labels hours and the usage reset date", () => {
    expect(hourLabel(0)).toBe("12 a.m.");
    expect(hourLabel(12)).toBe("12 p.m.");
    expect(hourLabel(16)).toBe("4 p.m.");
    expect(hourLabel(21)).toBe("9 p.m.");
    expect(resetLabel("2026-10")).toBe("Nov 1");
    expect(resetLabel("2026-12")).toBe("Jan 1");
  });
});

describe("AccountCard", () => {
  it("signs out everywhere through the dedicated route", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AccountCard
        displayName="Maya"
        email="maya@example.test"
        timeZone="America/Chicago"
        roleLine="Student"
        editable={true}
        navigate={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    await waitFor(() => expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/auth/sign-out-all"));
  });

  it("saves the display name and time zone", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(profile));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AccountCard
        displayName="Maya R."
        email="maya@example.test"
        timeZone="America/Chicago"
        roleLine="Student · Maple High School"
        editable
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Maya Rivera" } });
    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "America/Denver" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/profile");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ displayName: "Maya Rivera", timeZone: "America/Denver" }),
    });
  });

  it("lets a parent set a first name and time zone (R2I-3)", async () => {
    // 06 updateProfile creates a blank profile row when there is none, so a parent also gets a Profile back.
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({
        ...profile,
        classYear: null,
        highSchool: "",
        state: "",
        county: "",
        gpaUnweighted: null,
        onboardingCompletedAt: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AccountCard displayName="" email="dana@example.test" timeZone="America/Chicago" roleLine="Parent" editable />,
    );
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Dana Rivera " } });
    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "America/New_York" } });
    fireEvent.click(save);
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ displayName: "Dana Rivera", timeZone: "America/New_York" }),
    });
    expect(screen.getByText("Parent")).toBeTruthy();
  });

  it("stays put and shows the message when sign-out fails, and leaves on success or a dead session (R3A-13)", async () => {
    const navigate = vi.fn();
    let status = 500;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        status === 204
          ? new Response(null, { status: 204 })
          : status === 401
            ? json({ error: { code: "unauthenticated", message: "Sign in again" } }, 401)
            : json({ error: { code: "internal", message: "Something went wrong" } }, 500),
      ),
    );
    render(
      <AccountCard
        displayName="Maya R."
        email="maya@example.test"
        timeZone="America/Chicago"
        roleLine="Student"
        editable
        navigate={navigate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong");
    expect(navigate).not.toHaveBeenCalled();
    status = 401;
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/sign-in"));
    navigate.mockClear();
    status = 204;
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/sign-in"));
  });
});

describe("NotificationsCard", () => {
  it("saves each change right away (NO-04)", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      json({ ...prefs, ...JSON.parse(String(init?.body)) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<NotificationsCard prefs={prefs} timeZone="America/Chicago" />);
    expect(screen.getByRole("button", { name: "Sun" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Wed" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Wed" }).getAttribute("aria-pressed")).toBe("true"));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"digestDay":3}' });
    fireEvent.click(screen.getByRole("switch", { name: "Email me (digest, deadline reminders, new matches)" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe('{"emailEnabled":false}');
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Quiet hours start"), { target: { value: "22" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe('{"quietStartHour":22}');
    expect(screen.getByText("Emails never include sensitive facts or essays.")).toBeTruthy();
  });

  it("turning email off shows the deadline reminders as off, in the app only (R2I-8)", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      json({ ...prefs, ...JSON.parse(String(init?.body)) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<NotificationsCard prefs={prefs} timeZone="America/Chicago" />);
    expect(screen.getByText("On")).toBeTruthy();
    expect(screen.getByText("7, 3, and 1 day before")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Email me (digest, deadline reminders, new matches)" }));
    await waitFor(() => expect(screen.getByText("In the app only")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe('{"emailEnabled":false}');
    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.queryByText("On")).toBeNull();
    expect(screen.queryByText("7, 3, and 1 day before")).toBeNull();
  });

  it("needs a valid phone number before text reminders can switch on (NO-05, R3)", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const patch = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const { phone, ...rest } = patch;
      return json({ ...prefs, phoneSet: phone !== undefined ? phone !== null : true, ...rest });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<NotificationsCard prefs={prefs} timeZone="America/Chicago" />);
    const sms = screen.getByRole("switch", { name: "Text me 1-day reminders" }) as HTMLButtonElement;
    expect(sms.disabled).toBe(true);
    expect(screen.getByText("Add a phone number first")).toBeTruthy();
    expect(screen.getByText("Texts wait until your quiet hours end.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "512-555-0123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save number" }));
    expect(screen.getByText("Use the format +15125550123")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "+15125550123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save number" }));
    await waitFor(() =>
      expect((screen.getByRole("switch", { name: "Text me 1-day reminders" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe('{"phone":"+15125550123"}');
    fireEvent.click(screen.getByRole("switch", { name: "Text me 1-day reminders" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe('{"smsEnabled":true}');
  });
});

describe("PlanCard", () => {
  it("shows usage and starts checkout for a free plan", async () => {
    const navigate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ url: "https://checkout.stripe.test/session" })),
    );
    render(<PlanCard billing={billing()} navigate={navigate} />);
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("of 20")).toBeTruthy();
    expect(screen.getByText("Resets Nov 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Get the Family plan" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.test/session"));
  });

  it("opens the Stripe portal for paid plans and redeems sponsor codes", async () => {
    const navigate = vi.fn();
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith("/portal") ? json({ url: "https://billing.stripe.test/portal" }) : json(billing().subscription),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<PlanCard billing={billing({ plan: "family", managedByStripe: true })} navigate={navigate} />);
    expect(screen.queryByRole("button", { name: "Get the Family plan" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://billing.stripe.test/portal"));
    fireEvent.change(screen.getByLabelText("Sponsor code"), { target: { value: "MAPLE-2027" } });
    fireEvent.click(screen.getByRole("button", { name: "Redeem" }));
    expect(await screen.findByText("Code applied.")).toBeTruthy();
    expect(fetchMock.mock.calls.find(([url]) => url === "/api/v1/billing/sponsor-code")?.[1]?.body).toBe(
      '{"code":"MAPLE-2027"}',
    );
    expect(router.refresh).toHaveBeenCalled();
  });
});
