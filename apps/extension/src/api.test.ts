import { describe, expect, it } from "vitest";
import { ApiError, type FetchLike, RECONNECT_MESSAGE, createApiClient } from "./api";
import { PROFILE, SUMMARY } from "./test/profile";

const APP = "https://scholarcrew.example";
const TOKEN = "sct_Ab3dE6gH9jK2mN5p";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeFetch(...responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next === undefined) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return next;
  };
  return { fn, calls };
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error("expected an ApiError");
}

describe("getAutofillProfile", () => {
  it("sends the bearer token without cookies and returns the validated profile", async () => {
    const f = fakeFetch(json(200, PROFILE));
    const client = createApiClient({ appUrl: APP, token: TOKEN, fetch: f.fn });
    expect(await client.getAutofillProfile()).toEqual(PROFILE);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.url).toBe("https://scholarcrew.example/api/v1/extension/autofill-profile");
    expect(f.calls[0]?.init.method).toBe("GET");
    expect(f.calls[0]?.init.credentials).toBe("omit");
    expect(f.calls[0]?.init.headers).toEqual({ Accept: "application/json", Authorization: `Bearer ${TOKEN}` });
  });

  it("rejects a profile that doesn't match the schema", async () => {
    const f = fakeFetch(json(200, { ...PROFILE, email: "not-an-email" }));
    const err = await caught(createApiClient({ appUrl: APP, token: TOKEN, fetch: f.fn }).getAutofillProfile());
    expect(err.code).toBe("bad_response");
    expect(err.status).toBe(200);
  });

  it("accepts and strips fields a newer server adds, at the top level and on an activity (R3A-4)", async () => {
    const [first, ...rest] = PROFILE.activities;
    if (!first) throw new Error("PROFILE has no activities");
    const f = fakeFetch(
      json(200, { ...PROFILE, pronouns: "she/her", activities: [{ ...first, verified: true }, ...rest] }),
    );
    const profile = await createApiClient({ appUrl: APP, token: TOKEN, fetch: f.fn }).getAutofillProfile();
    expect(profile).toEqual(PROFILE);
    expect(profile).not.toHaveProperty("pronouns");
    expect(profile.activities[0]).not.toHaveProperty("verified");
  });

  it("maps 401 to the reconnect message whatever the body says", async () => {
    const f = fakeFetch(json(401, { error: { code: "unauthenticated", message: "Token revoked" } }));
    const err = await caught(createApiClient({ appUrl: APP, token: TOKEN, fetch: f.fn }).getAutofillProfile());
    expect(err.code).toBe("unauthenticated");
    expect(err.message).toBe(RECONNECT_MESSAGE);
    expect(err.message).toBe("Your token expired. Create a new one in Settings.");
  });

  it("explains the daily save-page limit", async () => {
    const f = fakeFetch(json(429, { error: { code: "rate_limited", message: "Rate limited" } }));
    const err = await caught(
      createApiClient({ appUrl: APP, token: TOKEN, fetch: f.fn }).savePage({
        url: "https://source.test/award",
        title: "Award",
        selectedText: "",
      }),
    );
    expect(err.message).toBe("You've saved 10 pages today. Try again tomorrow.");
  });

  it("maps an ErrorBody to its code and message", async () => {
    const f = fakeFetch(json(429, { error: { code: "rate_limited", message: "Slow down for a minute." } }));
    const err = await caught(createApiClient({ appUrl: APP, token: TOKEN, fetch: f.fn }).getAutofillProfile());
    expect(err).toMatchObject({ code: "rate_limited", message: "Slow down for a minute.", status: 429 });
  });

  it("maps a non-JSON failure to internal", async () => {
    const f = fakeFetch(new Response("<html>Bad gateway</html>", { status: 502 }));
    const err = await caught(createApiClient({ appUrl: APP, token: TOKEN, fetch: f.fn }).getAutofillProfile());
    expect(err).toMatchObject({ code: "internal", message: "ScholarCrew returned 502.", status: 502 });
  });

  it("maps a network failure to a can't-reach message naming the app URL", async () => {
    const f = fakeFetch(new TypeError("Failed to fetch"));
    const err = await caught(createApiClient({ appUrl: APP, token: TOKEN, fetch: f.fn }).getAutofillProfile());
    expect(err.code).toBe("network");
    expect(err.status).toBeNull();
    expect(err.message).toContain("https://scholarcrew.example");
  });
});

describe("savePage", () => {
  const input = { url: "https://rotary.example/award", title: "Rotary Award", selectedText: "Due March 1" };

  it("posts the page as JSON and returns the validated summary", async () => {
    const f = fakeFetch(json(201, SUMMARY));
    const client = createApiClient({ appUrl: APP, token: TOKEN, fetch: f.fn });
    expect(await client.savePage(input)).toEqual(SUMMARY);
    expect(f.calls[0]?.url).toBe("https://scholarcrew.example/api/v1/extension/save-page");
    expect(f.calls[0]?.init.method).toBe("POST");
    expect(f.calls[0]?.init.headers).toEqual({
      Accept: "application/json",
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(f.calls[0]?.init.body))).toEqual(input);
  });

  it("accepts a summary with a field a newer server adds and strips it, but still checks known fields (R3A-4)", async () => {
    const f = fakeFetch(json(201, { ...SUMMARY, extra: true }), json(201, { ...SUMMARY, status: "archived" }));
    const client = createApiClient({ appUrl: APP, token: TOKEN, fetch: f.fn });
    const summary = await client.savePage(input);
    expect(summary).toEqual(SUMMARY);
    expect(summary).not.toHaveProperty("extra");
    expect((await caught(client.savePage(input))).code).toBe("bad_response");
  });

  it("passes invalid_input through from the server", async () => {
    const f = fakeFetch(json(400, { error: { code: "invalid_input", message: "That URL can't be saved." } }));
    const err = await caught(createApiClient({ appUrl: APP, token: TOKEN, fetch: f.fn }).savePage(input));
    expect(err).toMatchObject({ code: "invalid_input", message: "That URL can't be saved.", status: 400 });
  });
});
