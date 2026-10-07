import type { Page } from "@playwright/test";

/** Globals that common analytics, session-recording, and ad SDKs install on window. */
export const TRACKER_GLOBALS = [
  "gtag",
  "dataLayer",
  "ga",
  "analytics",
  "posthog",
  "mixpanel",
  "hj",
  "_hjSettings",
  "fbq",
  "_paq",
  "Intercom",
  "FS",
  "amplitude",
  "plausible",
  "clarity",
] as const;

/** Records every HTTP request whose origin isn't the app's (data: and blob: URLs aside). Returns the live list. */
export function recordOffOrigin(page: Page, origin: string): string[] {
  const off: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    if (new URL(url).origin !== origin) off.push(url);
  });
  return off;
}

/** src attributes of scripts and iframes that point anywhere but the app. */
export async function externalSources(page: Page, origin: string): Promise<string[]> {
  const sources = await page
    .locator("script[src], iframe[src]")
    .evaluateAll((elements) => elements.map((e) => e.getAttribute("src") ?? ""));
  return sources.filter((src) => new URL(src, origin).origin !== origin);
}

export async function trackerGlobals(page: Page): Promise<string[]> {
  return page.evaluate((names) => names.filter((name) => name in window), [...TRACKER_GLOBALS]);
}
