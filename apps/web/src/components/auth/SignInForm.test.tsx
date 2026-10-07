// @vitest-environment jsdom
import type { UserActor } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import SignInPage from "../../app/sign-in/page";
import { CheckEmail } from "./CheckEmail";
import { SignInForm } from "./SignInForm";
import { FAMILY_JOIN_NOTE, LINK_ERROR, signInNotice } from "./messages";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
const session = vi.hoisted(() => ({ actor: null as UserActor | null }));

vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/server/session", () => ({ getPageActor: async () => session.actor }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  sessionStorage.clear();
  session.actor = null;
});

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

describe("signInNotice", () => {
  it("explains a used link and an invite waiting after sign in", () => {
    expect(signInNotice({ error: "link" })).toEqual({ error: LINK_ERROR, note: null });
    expect(signInNotice({ next: "/family/join?token=abc" })).toEqual({ error: null, note: FAMILY_JOIN_NOTE });
    expect(signInNotice({})).toEqual({ error: null, note: null });
    expect(signInNotice({ error: "other", next: "/week" }).error).toBeNull();
  });
});

describe("SignInForm", () => {
  it("checks the email before sending", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "maya@" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(screen.getByText("Enter a valid email address, like you@example.com.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the link and goes to check-email", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " Maya@Example.test " } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeTruthy();
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/sign-in/check-email"));
    expect(sessionStorage.getItem("sc_signin_email")).toBe("maya@example.test");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/auth/magic-link");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: '{"email":"maya@example.test"}' });
  });

  it("shows the rate limit and lets the user try again later", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { code: "rate_limited", message: "Too many requests" } }, 429)),
    );
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "maya@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    await waitFor(() =>
      expect(screen.getByText("Too many sign-in links were requested. Wait 15 minutes, then try again.")).toBeTruthy(),
    );
    expect((screen.getByRole("button", { name: "Email me a sign-in link" }) as HTMLButtonElement).disabled).toBe(false);
    expect(nav.router.push).not.toHaveBeenCalled();
  });
});

describe("CheckEmail", () => {
  it("waits a minute before offering to resend", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem("sc_signin_email", "maya@example.test");
    render(<CheckEmail />);
    expect(screen.getByText("maya@example.test")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Resend in 1:00" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: "Resend link" }));
    await waitFor(() => expect(screen.getByText("Sent. Check your inbox again.")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Resend in 1:00" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Use a different email" }).getAttribute("href")).toBe("/sign-in");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ body: '{"email":"maya@example.test"}' });
  });

  it("sends you back to sign in when no address was saved", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<CheckEmail />);
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/sign-in"));
    expect(screen.queryByText("Check your email")).toBeNull();
  });
});

describe("/sign-in page", () => {
  it("sends signed-in users to their home and shows the link error and age notice otherwise", async () => {
    session.actor = { kind: "user", userId: "u1", role: "student" };
    await expect(SignInPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/week");
    session.actor = { kind: "user", userId: "u2", role: "admin" };
    await expect(SignInPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/admin");
    session.actor = null;
    const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ error: "link" }) }));
    expect(html).toContain("That sign-in link has expired or was already used.");
    expect(html).toContain("You need to be 13 or older.");
    expect(html).toContain('href="/terms"');
  });
});
