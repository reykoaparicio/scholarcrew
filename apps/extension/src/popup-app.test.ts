import { readFileSync } from "node:fs";
import { URL as NodeURL, fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECONNECT_MESSAGE } from "./api";
import { NOT_CONNECTED_MESSAGE, type PopupRequest, type PopupRequestType, SAVED_MESSAGE } from "./messages";
import { type SendMessage, mountPopup } from "./popup-app";
import { DEFAULT_APP_URL } from "./settings";
import { createMemoryStorage } from "./test/fake-storage";

const POPUP_HTML = readFileSync(fileURLToPath(new NodeURL("../popup.html", import.meta.url)), "utf8");
const TOKEN = "sct_Ab3dE6gH9jK2mN5p";
const CONNECTED = { ok: true, displayName: "Maya Torres", email: "maya@example.com" };
const PREVIEW = {
  ok: true,
  url: "https://rotary.example/award?ref=mail",
  title: "Rotary Award",
  selectedText: "Due March 1. Open to Travis County seniors.",
};
const SAVED = { ok: true, name: "Lakeview Rotary Award", message: SAVED_MESSAGE };

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

function press(id: string): void {
  $(id).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function submit(id: string): void {
  $(id).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function fakeSend(replies: Partial<Record<PopupRequestType, unknown>>) {
  const sent: string[] = [];
  const messages: PopupRequest[] = [];
  const send: SendMessage = async (message) => {
    sent.push(message.type);
    messages.push(message);
    return replies[message.type];
  };
  return { send, sent, messages };
}

async function open(stored: Record<string, unknown>, replies: Partial<Record<PopupRequestType, unknown>>) {
  const storage = createMemoryStorage(stored);
  const fake = fakeSend(replies);
  await mountPopup(document, { storage, send: fake.send }).ready;
  return { storage, sent: fake.sent, messages: fake.messages };
}

async function openPreview(): Promise<void> {
  press("save-page");
  await vi.waitFor(() => expect($("preview").hidden).toBe(false));
}

beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(POPUP_HTML, "text/html").body.innerHTML;
});

describe("connection status", () => {
  it("asks for a token when none is stored and disables the actions", async () => {
    const { sent } = await open({}, {});
    expect($("status").textContent).toBe(NOT_CONNECTED_MESSAGE);
    expect($<HTMLButtonElement>("autofill").disabled).toBe(true);
    expect($<HTMLButtonElement>("save-page").disabled).toBe(true);
    expect($<HTMLDetailsElement>("settings").open).toBe(true);
    expect($<HTMLInputElement>("app-url").value).toBe(DEFAULT_APP_URL);
    expect(sent).toEqual([]);
  });

  it("shows who is connected and never echoes the stored token", async () => {
    const { sent } = await open({ token: TOKEN }, { status: CONNECTED });
    expect(sent).toEqual(["status"]);
    expect($("status").textContent).toBe("Connected as Maya Torres (maya@example.com).");
    expect($<HTMLButtonElement>("autofill").disabled).toBe(false);
    expect($<HTMLInputElement>("token").value).toBe("");
    expect(document.body.innerHTML).not.toContain(TOKEN);
  });

  it("shows the reconnect message when the token stops working", async () => {
    await open({ token: TOKEN }, { status: { ok: false, error: RECONNECT_MESSAGE } });
    expect($("status").textContent).toBe(RECONNECT_MESSAGE);
    expect($<HTMLButtonElement>("save-page").disabled).toBe(true);
  });

  it("says so when the background worker doesn't answer", async () => {
    await open({ token: TOKEN }, {});
    expect($("status").textContent).toContain("didn't answer");
  });
});

describe("settings", () => {
  it("rejects a token without the sct_ prefix and stores nothing", async () => {
    const { storage } = await open({}, {});
    $<HTMLInputElement>("token").value = "abc123456789";
    submit("token-form");
    await vi.waitFor(() => expect($("settings-message").textContent).toContain("Tokens start with sct_"));
    expect(storage.data).toEqual({});
  });

  it("saves a pasted token, clears the field, and connects", async () => {
    const { storage, sent } = await open({}, { status: CONNECTED });
    $<HTMLInputElement>("token").value = ` ${TOKEN} `;
    submit("token-form");
    await vi.waitFor(() => expect($("status").textContent).toBe("Connected as Maya Torres (maya@example.com)."));
    expect(storage.data.token).toBe(TOKEN);
    expect($<HTMLInputElement>("token").value).toBe("");
    expect($("settings-message").textContent).toBe("Token saved.");
    expect(sent).toEqual(["status"]);
  });

  it("clears the token", async () => {
    const { storage } = await open({ token: TOKEN }, { status: CONNECTED });
    press("clear-token");
    await vi.waitFor(() => expect($("status").textContent).toBe(NOT_CONNECTED_MESSAGE));
    expect(storage.data.token).toBeUndefined();
    expect($<HTMLButtonElement>("autofill").disabled).toBe(true);
  });

  it("validates and normalizes the app address", async () => {
    const { storage } = await open({}, {});
    $<HTMLInputElement>("app-url").value = "ftp://scholarcrew.example";
    submit("url-form");
    await vi.waitFor(() => expect($("settings-message").textContent).toContain("http:// or https://"));
    expect(storage.data.appUrl).toBeUndefined();
    $<HTMLInputElement>("app-url").value = "https://scholarcrew.example/";
    submit("url-form");
    await vi.waitFor(() => expect($("settings-message").textContent).toBe("App address saved."));
    expect(storage.data.appUrl).toBe("https://scholarcrew.example");
    expect($<HTMLInputElement>("app-url").value).toBe("https://scholarcrew.example");
  });
});

describe("actions", () => {
  it("starts autofill and tells the student to review the proposals", async () => {
    const { sent } = await open({ token: TOKEN }, { status: CONNECTED, autofill: { ok: true, proposals: 9 } });
    press("autofill");
    await vi.waitFor(() =>
      expect($("action-result").textContent).toBe("Review 9 proposed values on the page, then fill the ones you want."),
    );
    expect(sent).toEqual(["status", "autofill"]);
  });

  it("reports when no fields match", async () => {
    await open({ token: TOKEN }, { status: CONNECTED, autofill: { ok: true, proposals: 0 } });
    press("autofill");
    await vi.waitFor(() => expect($("action-result").textContent).toBe("No fields on this page match your profile."));
  });

  it("previews exactly what will be sent and sends nothing to ScholarCrew yet", async () => {
    const { sent } = await open({ token: TOKEN }, { status: CONNECTED, "save-preview": PREVIEW, "save-page": SAVED });
    expect($("preview").hidden).toBe(true);
    await openPreview();
    expect($("preview-url").textContent).toBe("https://rotary.example/award?ref=mail");
    expect($<HTMLInputElement>("preview-title").value).toBe("Rotary Award");
    expect($("preview-selection").textContent).toBe("Due March 1. Open to Travis County seniors.");
    expect($<HTMLInputElement>("include-selection").checked).toBe(true);
    expect($("action-result").textContent).toBe("Check what will be sent, then click Send to Scout.");
    expect(sent).toEqual(["status", "save-preview"]);
  });

  it("sends only after Send to Scout, with the edited title and the checkbox choice", async () => {
    const { sent, messages } = await open(
      { token: TOKEN },
      { status: CONNECTED, "save-preview": PREVIEW, "save-page": SAVED },
    );
    await openPreview();
    $<HTMLInputElement>("preview-title").value = "Lakeview Rotary Award 2027";
    $<HTMLInputElement>("include-selection").checked = false;
    expect(sent).toEqual(["status", "save-preview"]);
    press("send-page");
    await vi.waitFor(() =>
      expect($("action-result").textContent).toBe("Saved. It's on your board as unverified. (Lakeview Rotary Award)"),
    );
    expect(sent).toEqual(["status", "save-preview", "save-page"]);
    expect(messages[2]).toEqual({ type: "save-page", title: "Lakeview Rotary Award 2027", includeSelection: false });
    expect($("preview").hidden).toBe(true);
  });

  it("leaves Include selected text unchecked and disabled when nothing is selected", async () => {
    await open({ token: TOKEN }, { status: CONNECTED, "save-preview": { ...PREVIEW, selectedText: "" } });
    await openPreview();
    expect($("preview-selection").textContent).toBe("No text selected.");
    expect($<HTMLInputElement>("include-selection").checked).toBe(false);
    expect($<HTMLInputElement>("include-selection").disabled).toBe(true);
  });

  it("Cancel closes the preview without sending", async () => {
    const { sent } = await open({ token: TOKEN }, { status: CONNECTED, "save-preview": PREVIEW, "save-page": SAVED });
    await openPreview();
    press("cancel-save");
    expect($("preview").hidden).toBe(true);
    expect($("action-result").textContent).toBe("");
    expect(sent).toEqual(["status", "save-preview"]);
  });

  it("shows the background's error text instead of a preview", async () => {
    await open({ token: TOKEN }, { status: CONNECTED, "save-preview": { ok: false, error: RECONNECT_MESSAGE } });
    press("save-page");
    await vi.waitFor(() => expect($("action-result").textContent).toBe(RECONNECT_MESSAGE));
    expect($("preview").hidden).toBe(true);
  });
});
