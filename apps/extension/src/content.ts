import "./zod-config";

import { handleContentMessage } from "./autofill";

const flags = globalThis as typeof globalThis & { scholarcrewContentLoaded?: boolean };

if (!flags.scholarcrewContentLoaded) {
  flags.scholarcrewContentLoaded = true;
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    sendResponse(handleContentMessage(document, message));
    return false;
  });
}
