import { describe, expect, it } from "vitest";
import { type FetchLike, RECONNECT_MESSAGE } from "./api";
import { NOT_CONNECTED_MESSAGE, SAVED_MESSAGE, UNKNOWN_REQUEST } from "./messages";
import { type BackgroundDeps, type TabInfo, createRouter, isTrustedSender } from "./router";
import { createMemoryStorage } from "./test/fake-storage";
import { PROFILE, SUMMARY } from "./test/profile";

const APP = "https://scholarcrew.example";
const TOKEN = "sct_Ab3dE6gH9jK2mN5p";
const TAB: TabInfo = { id: 7, url: "https://rotary.example/award", title: "Rotary Award" };
const FRAGMENT_TAB: TabInfo = {
  id: 7,
  url: "https://rotary.example/award?ref=mail#access_token=abc123",
  title: "Inbox (3) · Rotary Award",
};
const SAVE = { type: "save-page", title: "Rotary Award", includeSelection: true } as const;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface SetupOptions {
  token?: string | null;
  tab?: TabInfo | null;
  responses?: Array<Response | Error>;
  selection?: string | Error;
  contentReply?: unknown;
  injectError?: Error;
}

function setup(options: SetupOptions = {}) {
  const token = options.token === undefined ? TOKEN : options.token;
  const storage = createMemoryStorage(token ? { appUrl: APP, token } : { appUrl: APP });
  const responses = [...(options.responses ?? [])];
  const log: string[] = [];
  const fetched: Array<{ url: string; init: RequestInit }> = [];
  const sent: unknown[] = [];
  const fetch: FetchLike = async (url, init) => {
    log.push("fetch");
    fetched.push({ url, init });
    const next = responses.shift();
    if (next === undefined) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return next;
  };
  const deps: BackgroundDeps = {
    storage,
    fetch,
    getActiveTab: async () => (options.tab === undefined ? TAB : options.tab),
    injectContentScript: async (tabId) => {
      log.push(`inject:${tabId}`);
      if (options.injectError) throw options.injectError;
    },
    sendToTab: async (tabId, message) => {
      log.push(`send:${tabId}`);
      sent.push(message);
      return options.contentReply === undefined ? { ok: true, proposals: 9 } : options.contentReply;
    },
    readSelection: async (tabId) => {
      log.push(`select:${tabId}`);
      if (options.selection instanceof Error) throw options.selection;
      return options.selection ?? "";
    },
  };
  return { route: createRouter(deps), log, fetched, sent };
}

describe("router basics", () => {
  it("rejects unknown messages, the old save-page shape, and a popup-supplied URL", async () => {
    const s = setup();
    expect(await s.route({ type: "submit-form" })).toEqual({ ok: false, error: UNKNOWN_REQUEST });
    expect(await s.route("status")).toEqual({ ok: false, error: UNKNOWN_REQUEST });
    expect(await s.route({ type: "save-page" })).toEqual({ ok: false, error: UNKNOWN_REQUEST });
    expect(await s.route({ ...SAVE, url: "https://evil.example" })).toEqual({ ok: false, error: UNKNOWN_REQUEST });
    expect(s.log).toEqual([]);
  });

  it("asks for a token before calling the API", async () => {
    const s = setup({ token: null });
    for (const message of [{ type: "status" }, { type: "autofill" }, { type: "save-preview" }, SAVE]) {
      expect(await s.route(message)).toEqual({ ok: false, error: NOT_CONNECTED_MESSAGE });
    }
    expect(s.log).toEqual([]);
  });

  it("only trusts the extension's own pages", () => {
    expect(isTrustedSender({ id: "ext" }, "ext")).toBe(true);
    expect(isTrustedSender({ id: "other" }, "ext")).toBe(false);
    expect(isTrustedSender({ id: "ext", tab: { id: 3 } }, "ext")).toBe(false);
    expect(isTrustedSender({}, "ext")).toBe(false);
  });
});

describe("status", () => {
  it("reports who the token belongs to", async () => {
    const s = setup({ responses: [json(200, PROFILE)] });
    expect(await s.route({ type: "status" })).toEqual({
      ok: true,
      displayName: "Maya Torres",
      email: "maya@example.com",
    });
    expect(s.fetched[0]?.url).toBe(`${APP}/api/v1/extension/autofill-profile`);
  });

  it("asks the student to reconnect on 401", async () => {
    const s = setup({ responses: [json(401, { error: { code: "unauthenticated", message: "x" } })] });
    expect(await s.route({ type: "status" })).toEqual({ ok: false, error: RECONNECT_MESSAGE });
  });
});

describe("autofill", () => {
  it("fetches the profile, injects the content script, and hands it the profile", async () => {
    const s = setup({ responses: [json(200, PROFILE)] });
    expect(await s.route({ type: "autofill" })).toEqual({ ok: true, proposals: 9 });
    expect(s.log).toEqual(["fetch", "inject:7", "send:7"]);
    expect(s.sent).toEqual([{ type: "show-review", profile: PROFILE }]);
  });

  it("refuses non-web tabs before touching the API", async () => {
    const s = setup({ tab: { id: 2, url: "chrome://newtab/", title: "New Tab" } });
    const res = await s.route({ type: "autofill" });
    expect(res.ok).toBe(false);
    expect(s.log).toEqual([]);
  });

  it("doesn't inject when the token is rejected", async () => {
    const s = setup({ responses: [json(401, {})] });
    expect(await s.route({ type: "autofill" })).toEqual({ ok: false, error: RECONNECT_MESSAGE });
    expect(s.log).toEqual(["fetch"]);
  });

  it("explains when the page can't be scripted", async () => {
    const s = setup({ responses: [json(200, PROFILE)], injectError: new Error("Cannot access contents of the page") });
    expect(await s.route({ type: "autofill" })).toEqual({
      ok: false,
      error: "ScholarCrew can't fill forms on this page.",
    });
  });

  it("rejects a malformed reply from the content script", async () => {
    const s = setup({ responses: [json(200, PROFILE)], contentReply: { ok: true, proposals: "lots" } });
    expect(await s.route({ type: "autofill" })).toEqual({
      ok: false,
      error: "The page didn't respond. Reload it and try again.",
    });
  });
});

describe("save-preview", () => {
  it("returns the url without its fragment, the title, and the trimmed selection, and calls no API", async () => {
    const s = setup({ tab: FRAGMENT_TAB, selection: "  Due March 1.  " });
    expect(await s.route({ type: "save-preview" })).toEqual({
      ok: true,
      url: "https://rotary.example/award?ref=mail",
      title: "Inbox (3) · Rotary Award",
      selectedText: "Due March 1.",
    });
    expect(s.log).toEqual(["select:7"]);
    expect(s.fetched).toEqual([]);
  });
});

describe("save-page", () => {
  it("posts the url, the student's title, and the selection and returns the saved name", async () => {
    const s = setup({ responses: [json(201, SUMMARY)], selection: "  Due March 1. Open to Travis County seniors.  " });
    expect(await s.route({ ...SAVE, title: "  Lakeview Rotary Award 2027 " })).toEqual({
      ok: true,
      name: "Lakeview Rotary Award",
      message: SAVED_MESSAGE,
    });
    expect(SAVED_MESSAGE).toBe("Saved. It's on your board as unverified.");
    expect(s.fetched[0]?.url).toBe(`${APP}/api/v1/extension/save-page`);
    expect(JSON.parse(String(s.fetched[0]?.init.body))).toEqual({
      url: "https://rotary.example/award",
      title: "Lakeview Rotary Award 2027",
      selectedText: "Due March 1. Open to Travis County seniors.",
    });
  });

  it("strips the fragment from the url it sends", async () => {
    const s = setup({ tab: FRAGMENT_TAB, responses: [json(201, SUMMARY)] });
    expect((await s.route(SAVE)).ok).toBe(true);
    expect(JSON.parse(String(s.fetched[0]?.init.body)).url).toBe("https://rotary.example/award?ref=mail");
  });

  it("sends an empty selection, without reading it, when includeSelection is false", async () => {
    const s = setup({ responses: [json(201, SUMMARY)], selection: "Due March 1" });
    expect((await s.route({ ...SAVE, includeSelection: false })).ok).toBe(true);
    expect(JSON.parse(String(s.fetched[0]?.init.body)).selectedText).toBe("");
    expect(s.log).toEqual(["fetch"]);
  });

  it("caps the selection at 2000 characters and falls back to the hostname for a blank title", async () => {
    const s = setup({ responses: [json(201, SUMMARY)], selection: "x".repeat(2500) });
    await s.route({ ...SAVE, title: "   " });
    const body = JSON.parse(String(s.fetched[0]?.init.body));
    expect(body.selectedText).toHaveLength(2000);
    expect(body.title).toBe("rotary.example");
  });

  it("saves with an empty selection when the selection can't be read", async () => {
    const s = setup({ responses: [json(201, SUMMARY)], selection: new Error("no access") });
    expect((await s.route(SAVE)).ok).toBe(true);
    expect(JSON.parse(String(s.fetched[0]?.init.body)).selectedText).toBe("");
  });

  it("refuses non-web tabs and over-long URLs without calling the API", async () => {
    const chromeTab = setup({ tab: { id: 2, url: "chrome://settings/", title: "Settings" } });
    expect((await chromeTab.route({ type: "save-preview" })).ok).toBe(false);
    expect((await chromeTab.route(SAVE)).ok).toBe(false);
    expect(chromeTab.log).toEqual([]);
    const longTab = setup({ tab: { id: 2, url: `https://x.example/${"a".repeat(2100)}`, title: "Long" } });
    expect((await longTab.route({ type: "save-preview" })).ok).toBe(false);
    expect((await longTab.route(SAVE)).ok).toBe(false);
    expect(longTab.fetched).toEqual([]);
  });

  it("names the app URL when ScholarCrew can't be reached", async () => {
    const s = setup({ responses: [new TypeError("Failed to fetch")] });
    const res = await s.route(SAVE);
    expect(res.ok).toBe(false);
    expect(res.ok ? "" : res.error).toContain(APP);
  });
});
