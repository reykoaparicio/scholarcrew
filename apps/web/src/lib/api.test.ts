import { describe, expect, it, vi } from "vitest";
import { ApiError, api, apiUrl, errorMessage, isLimit } from "./api";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

/** A typed fetch mock so mock.calls[n][1] is the RequestInit. */
function fetchReturning(make: () => Response) {
  return vi.fn(async (_url: string, _init?: RequestInit) => make());
}

describe("apiUrl", () => {
  it("prefixes short paths and keeps full ones", () => {
    expect(apiUrl("/plan-items/1")).toBe("/api/v1/plan-items/1");
    expect(apiUrl("me")).toBe("/api/v1/me");
    expect(apiUrl("/api/v1/me")).toBe("/api/v1/me");
  });
});

describe("api", () => {
  it("GETs JSON with cookies and no body", async () => {
    const fetchMock = fetchReturning(() => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api<{ ok: boolean }>("/me")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/me", {
      method: "GET",
      headers: { Accept: "application/json" },
      body: undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  it("sends JSON bodies and defaults the method to POST", async () => {
    const fetchMock = fetchReturning(() => jsonResponse({ id: "x" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    await api("/plan-items/1", { method: "PATCH", body: { status: "done" } });
    await api("/actions/apply", { body: { messageId: "m", cardId: "c" } });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: '{"status":"done"}',
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
  });

  it("passes FormData through without a JSON content type", async () => {
    const fetchMock = fetchReturning(() => jsonResponse({ id: "d" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.append("kind", "transcript");
    await api("/documents", { method: "POST", body: form });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBe(form);
    expect(init?.headers).toEqual({ Accept: "application/json" });
  });

  it("returns undefined for 204", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(api("/facts/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("maps the error body to ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { code: "limit_reached", message: "You've used all 20 crew requests this month" } }, 402),
      ),
    );
    const err = await api("/conversations/c/messages", { body: { body: "hi" } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      code: "limit_reached",
      status: 402,
      message: "You've used all 20 crew requests this month",
    });
    expect(errorMessage(err)).toBe("You've used all 20 crew requests this month");
  });

  it("falls back when the error isn't an ErrorBody", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })),
    );
    await expect(api("/me")).rejects.toMatchObject({
      code: "internal",
      status: 502,
      message: "Something went wrong (502). Try again.",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 })),
    );
    await expect(api("/me")).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>too large</html>", { status: 413 })),
    );
    await expect(api("/documents", { body: new FormData() })).rejects.toMatchObject({
      code: "invalid_input",
      status: 413,
      message: "That's too big to upload. Files can be up to 10 MB.",
    });
  });

  it("spots allowance errors with isLimit", () => {
    expect(isLimit(new ApiError("limit_reached", "Used up", 402))).toBe(true);
    expect(isLimit(new ApiError("invalid_input", "Too many colleges", 400))).toBe(false);
    expect(isLimit(new Error("limit_reached"))).toBe(false);
  });

  it("reports network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(api("/me")).rejects.toMatchObject({ code: "network", status: 0 });
    expect(errorMessage(new Error("boom"))).toBe("Something went wrong. Try again.");
  });
});
