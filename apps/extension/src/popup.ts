import "./zod-config";

import { mountPopup } from "./popup-app";
import type { StorageArea } from "./settings";

const storage: StorageArea = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};

mountPopup(document, { storage, send: (message) => chrome.runtime.sendMessage(message) });
