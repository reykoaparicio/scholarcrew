import { SavePageInput } from "@scholarcrew/domain";
import { type ApiClient, ApiError, type FetchLike, createApiClient } from "./api";
import {
  type AutofillResponse,
  type BackgroundResponse,
  type ContentRequest,
  ContentResponse,
  NOT_CONNECTED_MESSAGE,
  PopupRequest,
  SAVED_MESSAGE,
  SELECTION_LIMIT,
  type SavePageResponse,
  type SavePreviewResponse,
  type StatusResponse,
  TITLE_LIMIT,
  UNKNOWN_REQUEST,
  failure,
} from "./messages";
import { SettingsError, type StorageArea, loadSettings } from "./settings";

const NOT_A_PAGE = "Open the scholarship's web page in this tab first.";
const CANT_SAVE = "This page can't be saved from the extension. Add it in ScholarCrew instead.";

export interface TabInfo {
  id: number;
  url: string;
  title: string;
}

/** Everything the router needs from chrome.*, injected so it can be tested without a browser. */
export interface BackgroundDeps {
  storage: StorageArea;
  fetch: FetchLike;
  getActiveTab(): Promise<TabInfo | null>;
  injectContentScript(tabId: number): Promise<void>;
  sendToTab(tabId: number, message: ContentRequest): Promise<unknown>;
  readSelection(tabId: number): Promise<string>;
}

export interface SenderLike {
  id?: string;
  tab?: unknown;
}

/** Only the popup (an extension page, so no tab) may drive the background. */
export function isTrustedSender(sender: SenderLike, extensionId: string): boolean {
  return sender.id === extensionId && sender.tab === undefined;
}

function isWebPage(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function errorText(e: unknown): string {
  if (e instanceof ApiError || e instanceof SettingsError) return e.message;
  return "Something went wrong. Try again.";
}

export function createRouter(deps: BackgroundDeps): (message: unknown) => Promise<BackgroundResponse> {
  async function connect(): Promise<ApiClient | null> {
    const settings = await loadSettings(deps.storage);
    if (!settings.token) return null;
    return createApiClient({ appUrl: settings.appUrl, token: settings.token, fetch: deps.fetch });
  }

  async function webTab(): Promise<TabInfo | null> {
    const tab = await deps.getActiveTab();
    return tab && isWebPage(tab.url) ? tab : null;
  }

  /**
   * The page exactly as it would be saved: the URL's #fragment removed (it can carry tokens),
   * the title trimmed with the hostname as fallback, and the selection read only when included.
   */
  async function draftPage(tab: TabInfo, title: string, includeSelection: boolean): Promise<SavePageInput | null> {
    const url = new URL(tab.url);
    url.hash = "";
    let selectedText = "";
    if (includeSelection) {
      try {
        selectedText = (await deps.readSelection(tab.id)).trim().slice(0, SELECTION_LIMIT);
      } catch {
        selectedText = "";
      }
    }
    const cleanTitle = (title.trim() || url.hostname).slice(0, TITLE_LIMIT);
    const input = SavePageInput.safeParse({ url: url.href, title: cleanTitle, selectedText });
    return input.success ? input.data : null;
  }

  async function status(): Promise<StatusResponse> {
    const api = await connect();
    if (!api) return failure(NOT_CONNECTED_MESSAGE);
    const profile = await api.getAutofillProfile();
    return { ok: true, displayName: profile.displayName, email: profile.email };
  }

  async function autofill(): Promise<AutofillResponse> {
    const api = await connect();
    if (!api) return failure(NOT_CONNECTED_MESSAGE);
    const tab = await webTab();
    if (!tab) return failure("Open a scholarship form in this tab first. Autofill works on web pages only.");
    const profile = await api.getAutofillProfile();
    let reply: unknown;
    try {
      await deps.injectContentScript(tab.id);
      reply = await deps.sendToTab(tab.id, { type: "show-review", profile });
    } catch {
      return failure("ScholarCrew can't fill forms on this page.");
    }
    const parsed = ContentResponse.safeParse(reply);
    if (!parsed.success) return failure("The page didn't respond. Reload it and try again.");
    return parsed.data;
  }

  /** Shows the student what Save to Scout would send. Makes no API call. */
  async function savePreview(): Promise<SavePreviewResponse> {
    const api = await connect();
    if (!api) return failure(NOT_CONNECTED_MESSAGE);
    const tab = await webTab();
    if (!tab) return failure(NOT_A_PAGE);
    const draft = await draftPage(tab, tab.title, true);
    if (!draft) return failure(CANT_SAVE);
    return { ok: true, url: draft.url, title: draft.title, selectedText: draft.selectedText };
  }

  /** Runs only after the student clicks "Send to Scout"; re-reads the tab rather than trusting the popup. */
  async function savePage(title: string, includeSelection: boolean): Promise<SavePageResponse> {
    const api = await connect();
    if (!api) return failure(NOT_CONNECTED_MESSAGE);
    const tab = await webTab();
    if (!tab) return failure(NOT_A_PAGE);
    const draft = await draftPage(tab, title, includeSelection);
    if (!draft) return failure(CANT_SAVE);
    const summary = await api.savePage(draft);
    return { ok: true, name: summary.name, message: SAVED_MESSAGE };
  }

  function handle(request: PopupRequest): Promise<BackgroundResponse> {
    switch (request.type) {
      case "status":
        return status();
      case "autofill":
        return autofill();
      case "save-preview":
        return savePreview();
      case "save-page":
        return savePage(request.title, request.includeSelection);
    }
  }

  return async (message) => {
    const parsed = PopupRequest.safeParse(message);
    if (!parsed.success) return failure(UNKNOWN_REQUEST);
    try {
      return await handle(parsed.data);
    } catch (e) {
      return failure(errorText(e));
    }
  };
}
