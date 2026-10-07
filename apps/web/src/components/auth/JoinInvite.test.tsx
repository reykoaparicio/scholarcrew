// @vitest-environment jsdom
import type { MeResponse, UserActor } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import JoinPage from "../../app/family/join/page";
import { InvitePreview, JoinInvite } from "./JoinInvite";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
const state = vi.hoisted(() => ({ actor: null as UserActor | null, inFamily: false }));

vi.mock("next/navigation", () => ({ useRouter: () => nav.router }));
vi.mock("@/server/session", () => ({ getPageActor: async () => state.actor }));
vi.mock("@/server/deps", () => ({ getDeps: () => ({}) }));
vi.mock("@scholarcrew/core/profile", () => ({
  getMe: async (): Promise<MeResponse> => ({
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "dana@example.test",
      displayName: "Dana",
      role: "parent",
      birthYear: null,
      timeZone: "America/Chicago",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    profile: null,
    onboardingComplete: true,
    family: state.inFamily ? { id: "22222222-2222-4222-8222-222222222222", role: "parent" } : null,
    plan: "free",
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.actor = null;
  state.inFamily = false;
});

const TOKEN = "invite-token-abcdefghijklmnop";

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

describe("JoinInvite", () => {
  it("accepts the invite and goes to Family", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({}, 200));
    vi.stubGlobal("fetch", fetchMock);
    render(<JoinInvite token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept invite" }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/family"));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/family/invites/accept");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ token: TOKEN }) });
  });

  it("explains an invalid or expired invite", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { code: "not_found", message: "This invite is invalid or has expired" } }, 404),
      ),
    );
    render(<JoinInvite token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept invite" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Ask for a new invite."));
    expect((screen.getByRole("button", { name: "Accept invite" }) as HTMLButtonElement).disabled).toBe(false);
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it("shows conflicts from the service as written", async () => {
    const message = "You're already in a family. Leave it before joining another.";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { code: "conflict", message } }, 409)),
    );
    render(<JoinInvite token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept invite" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(message));
  });
});

describe("/family/join page", () => {
  const params = (token?: string) => ({ searchParams: Promise.resolve(token ? { token } : {}) });
  const page = async (token?: string) => renderToStaticMarkup(await JoinPage(params(token)));

  it("asks signed-out visitors to sign in and checks the invite first", async () => {
    const html = await page(TOKEN);
    expect(html).toContain("You&#x27;ve been invited to a family");
    expect(html).toContain("Checking your invite…");
    expect(html).toContain('href="/sign-in?next=%2Ffamily%2Fjoin"');
  });

  it("shows who sent a live invite to a signed-out visitor (D37)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ inviterFirstName: "Maya", memberRole: "parent", expiresAt: "2026-10-13T15:00:00.000Z" }, 200),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(await JoinPage(params(TOKEN)));
    await waitFor(() =>
      expect(screen.getByText("Maya invited you to join as a parent. The invite expires Oct 13.")).toBeTruthy(),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/family/invites/preview?token=${TOKEN}`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in?next=%2Ffamily%2Fjoin");
  });

  it("shows only the generic card for an unknown invite", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { code: "not_found", message: "This invite is invalid or has expired" } }, 404),
      ),
    );
    const { container } = render(await JoinPage(params(TOKEN)));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "This invite is invalid or has expired. Ask for a new invite.",
      ),
    );
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(container.innerHTML).not.toContain("invited you to join");
    expect(container.innerHTML).not.toContain(TOKEN);
  });

  it("handles a missing or cut-off token, an existing family, and a ready invite", async () => {
    expect(await page()).toContain("This invite link is incomplete");
    expect(await page("short-token")).toContain("This invite link is incomplete");
    state.actor = { kind: "user", userId: "11111111-1111-4111-8111-111111111111", role: "parent" };
    expect(await page()).toContain("This invite link is incomplete");
    state.inFamily = true;
    expect(await page(TOKEN)).toContain("You&#x27;re already in a family");
    state.inFamily = false;
    const html = await page(TOKEN);
    expect(html).toContain("Join your family on ScholarCrew");
    expect(html).toContain("dana@example.test");
    expect(html).toContain("Checking your invite…");
    expect(html).toContain("Accept invite");
  });
});

describe("InvitePreview", () => {
  it("keeps its children while the check is rate limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { code: "rate_limited", message: "Too many requests" } }, 429)),
    );
    render(
      <InvitePreview token={TOKEN}>
        <p>child content</p>
      </InvitePreview>,
    );
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Too many requests"));
    expect(screen.getByText("child content")).toBeTruthy();
  });
});
