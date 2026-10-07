import {
  type Failure,
  NOT_CONNECTED_MESSAGE,
  type PopupRequest,
  type PopupRequestType,
  type ResponseMap,
  TITLE_LIMIT,
  failure,
} from "./messages";
import { SettingsError, type StorageArea, clearToken, loadSettings, saveAppUrl, saveToken } from "./settings";

export type SendMessage = (message: PopupRequest) => Promise<unknown>;

export interface PopupDeps {
  storage: StorageArea;
  send: SendMessage;
}

const NO_ANSWER = "ScholarCrew's background worker didn't answer. Close and reopen the popup.";
const PREVIEW_PROMPT = "Check what will be sent, then click Send to Scout.";

async function ask<K extends PopupRequestType>(
  send: SendMessage,
  message: PopupRequest & { type: K },
): Promise<ResponseMap[K] | Failure> {
  try {
    const reply = await send(message);
    if (reply !== null && typeof reply === "object" && "ok" in reply) return reply as ResponseMap[K];
    return failure(NO_ANSWER);
  } catch {
    return failure(NO_ANSWER);
  }
}

function byId<T extends HTMLElement = HTMLElement>(doc: Document, id: string): T {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`popup.html is missing #${id}`);
  return el as T;
}

export function mountPopup(doc: Document, deps: PopupDeps): { ready: Promise<void> } {
  const status = byId(doc, "status");
  const autofillButton = byId<HTMLButtonElement>(doc, "autofill");
  const saveButton = byId<HTMLButtonElement>(doc, "save-page");
  const result = byId(doc, "action-result");
  const settingsBox = byId<HTMLDetailsElement>(doc, "settings");
  const tokenForm = byId<HTMLFormElement>(doc, "token-form");
  const tokenInput = byId<HTMLInputElement>(doc, "token");
  const clearButton = byId<HTMLButtonElement>(doc, "clear-token");
  const urlForm = byId<HTMLFormElement>(doc, "url-form");
  const urlInput = byId<HTMLInputElement>(doc, "app-url");
  const settingsMessage = byId(doc, "settings-message");
  const preview = byId(doc, "preview");
  const previewUrl = byId(doc, "preview-url");
  const previewTitle = byId<HTMLInputElement>(doc, "preview-title");
  const previewSelection = byId(doc, "preview-selection");
  const includeSelection = byId<HTMLInputElement>(doc, "include-selection");
  const sendButton = byId<HTMLButtonElement>(doc, "send-page");
  const cancelSaveButton = byId<HTMLButtonElement>(doc, "cancel-save");

  function hidePreview(): void {
    preview.hidden = true;
    previewUrl.textContent = "";
    previewTitle.value = "";
    previewSelection.textContent = "";
    includeSelection.checked = false;
    includeSelection.disabled = false;
  }

  function setConnected(connected: boolean): void {
    autofillButton.disabled = !connected;
    saveButton.disabled = !connected;
    if (!connected) {
      settingsBox.open = true;
      hidePreview();
    }
  }

  async function refresh(): Promise<void> {
    const settings = await loadSettings(deps.storage);
    urlInput.value = settings.appUrl;
    if (!settings.token) {
      status.textContent = NOT_CONNECTED_MESSAGE;
      setConnected(false);
      return;
    }
    status.textContent = "Checking connection…";
    const reply = await ask(deps.send, { type: "status" });
    if (reply.ok) {
      status.textContent = `Connected as ${reply.displayName} (${reply.email}).`;
      setConnected(true);
    } else {
      status.textContent = reply.error;
      setConnected(false);
    }
  }

  function on(target: EventTarget, type: "click" | "submit", handler: () => Promise<void>): void {
    target.addEventListener(type, (event) => {
      event.preventDefault();
      handler().catch(() => {
        result.textContent = "Something went wrong. Try again.";
      });
    });
  }

  function showSettingsError(e: unknown): void {
    settingsMessage.textContent = e instanceof SettingsError ? e.message : "Couldn't save that setting.";
  }

  on(tokenForm, "submit", async () => {
    settingsMessage.textContent = "";
    try {
      await saveToken(deps.storage, tokenInput.value);
    } catch (e) {
      showSettingsError(e);
      return;
    }
    tokenInput.value = "";
    settingsMessage.textContent = "Token saved.";
    await refresh();
  });

  on(clearButton, "click", async () => {
    await clearToken(deps.storage);
    tokenInput.value = "";
    result.textContent = "";
    settingsMessage.textContent = "Token cleared.";
    await refresh();
  });

  on(urlForm, "submit", async () => {
    settingsMessage.textContent = "";
    let saved: string;
    try {
      saved = await saveAppUrl(deps.storage, urlInput.value);
    } catch (e) {
      showSettingsError(e);
      return;
    }
    urlInput.value = saved;
    settingsMessage.textContent = "App address saved.";
    await refresh();
  });

  on(autofillButton, "click", async () => {
    hidePreview();
    result.textContent = "Looking for fields…";
    const reply = await ask(deps.send, { type: "autofill" });
    if (!reply.ok) {
      result.textContent = reply.error;
    } else if (reply.proposals === 0) {
      result.textContent = "No fields on this page match your profile.";
    } else {
      const noun = reply.proposals === 1 ? "value" : "values";
      result.textContent = `Review ${reply.proposals} proposed ${noun} on the page, then fill the ones you want.`;
    }
  });

  // Step 1: show exactly what would be sent. The background reads the tab but calls no API.
  on(saveButton, "click", async () => {
    hidePreview();
    result.textContent = "Reading this page…";
    const reply = await ask(deps.send, { type: "save-preview" });
    if (!reply.ok) {
      result.textContent = reply.error;
      return;
    }
    const hasSelection = reply.selectedText !== "";
    previewUrl.textContent = reply.url;
    previewTitle.value = reply.title;
    previewSelection.textContent = hasSelection ? reply.selectedText : "No text selected.";
    includeSelection.checked = hasSelection;
    includeSelection.disabled = !hasSelection;
    preview.hidden = false;
    result.textContent = PREVIEW_PROMPT;
  });

  // Step 2: only this button sends anything to ScholarCrew.
  on(sendButton, "click", async () => {
    if (preview.hidden) return;
    const title = previewTitle.value.slice(0, TITLE_LIMIT);
    const include = includeSelection.checked;
    hidePreview();
    result.textContent = "Saving…";
    const reply = await ask(deps.send, { type: "save-page", title, includeSelection: include });
    result.textContent = reply.ok ? `${reply.message} (${reply.name})` : reply.error;
  });

  on(cancelSaveButton, "click", async () => {
    hidePreview();
    result.textContent = "";
  });

  return { ready: refresh() };
}
