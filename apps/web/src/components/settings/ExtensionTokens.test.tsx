// @vitest-environment jsdom
import type { ApiToken } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionTokens } from "./ExtensionTokens";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const token = (o: Partial<ApiToken> = {}): ApiToken => ({
  id: "11111111-1111-4111-8111-111111114f2a",
  label: "Chrome on my laptop",
  scopes: ["autofill", "save_page"],
  expiresAt: "2027-04-04T15:00:00.000Z",
  createdAt: "2026-10-01T15:00:00.000Z",
  lastUsedAt: "2026-10-04T15:00:00.000Z",
  revokedAt: null,
  ...o,
});

/** The real secret format (06 F15): `sct_` + base64url. The list never shows any part of it after creation. */
const SECRET = "sct_q9f8e7d6c5b4a39281706ZxYwVuTsRqP";

describe("ExtensionTokens", () => {
  it("lists active tokens without secrets and hides revoked ones", () => {
    render(
      <ExtensionTokens
        tokens={[
          token(),
          token({
            id: "22222222-2222-4222-8222-222222222222",
            label: "Old laptop",
            revokedAt: "2026-10-02T00:00:00.000Z",
          }),
        ]}
        timeZone="America/Chicago"
      />,
    );
    expect(screen.getByText("Chrome on my laptop")).toBeTruthy();
    expect(screen.getByText("Connected Oct 1 · expires Apr 4 · last used Oct 4")).toBeTruthy();
    expect(screen.getByText("sct_••••")).toBeTruthy();
    expect(screen.queryByText(/4f2a/)).toBeNull();
    expect(screen.queryByText("Old laptop")).toBeNull();
  });

  it("shows a new secret once with a copy button", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const created = token({ id: "33333333-3333-4333-8333-333333339999", label: "Work Chromebook", lastUsedAt: null });
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ token: created, secret: SECRET }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ExtensionTokens tokens={[]} timeZone="America/Chicago" />);
    fireEvent.change(screen.getByLabelText("Browser name"), { target: { value: "Work Chromebook" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect a browser" }));
    expect(await screen.findByText(SECRET)).toBeTruthy();
    expect(screen.getByText("Copy this code into the extension now. You won't see it again.")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ label: "Work Chromebook" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText(SECRET)).toBeNull();
    expect(screen.getByText("Work Chromebook")).toBeTruthy();
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("disconnects a browser", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ExtensionTokens tokens={[token()]} timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Chrome on my laptop" }));
    await waitFor(() => expect(screen.queryByText("Chrome on my laptop")).toBeNull());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/extension/tokens/${token().id}`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });
});
