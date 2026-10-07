import "./zod-config";

import { createRouter, isTrustedSender } from "./router";
import { type StorageArea, restrictToTrustedContexts } from "./settings";

// Before anything reads the token: hide chrome.storage.local from content scripts. A no-op where unsupported.
void restrictToTrustedContexts(chrome.storage.local);

const storage: StorageArea = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};

const route = createRouter({
  storage,
  fetch: (url, init) => fetch(url, init),
  async getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || tab.id === undefined) return null;
    return { id: tab.id, url: tab.url ?? "", title: tab.title ?? "" };
  },
  async injectContentScript(tabId) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  },
  sendToTab: (tabId, message) => chrome.tabs.sendMessage(tabId, message),
  async readSelection(tabId) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString() ?? "",
    });
    return typeof result?.result === "string" ? result.result : "";
  },
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isTrustedSender(sender, chrome.runtime.id)) return false;
  route(message).then(sendResponse, () => sendResponse({ ok: false, error: "Something went wrong. Try again." }));
  return true;
});
