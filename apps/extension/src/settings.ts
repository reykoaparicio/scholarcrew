export const DEFAULT_APP_URL = "http://localhost:3000";
export const TOKEN_PREFIX = "sct_";

const TOKEN_PATTERN = /^sct_[A-Za-z0-9_-]{8,200}$/;

/** Plain http is allowed only here, so the bearer token never crosses a network in cleartext. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The subset of chrome.storage.local this extension uses. */
export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/**
 * The part of chrome.storage.local that limits which contexts can read it (Chrome 102+).
 * Method syntax keeps the parameter bivariant, so chrome's own AccessLevel type is assignable.
 */
export interface AccessLevelArea {
  setAccessLevel?(options: { accessLevel: string }): Promise<void>;
}

export interface Settings {
  appUrl: string;
  token: string | null;
}

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

export function normalizeAppUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new SettingsError("Enter the app address, like https://scholarcrew.example.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SettingsError("The app address must start with http:// or https://.");
  }
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new SettingsError("Use https:// for anything but your own computer.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new SettingsError("Use just the site address, like https://scholarcrew.example, with no path.");
  }
  return url.origin;
}

export function validateToken(input: string): string {
  const token = input.trim();
  if (!token.startsWith(TOKEN_PREFIX)) {
    throw new SettingsError("Tokens start with sct_. Copy it from Settings → Browser extension in ScholarCrew.");
  }
  if (!TOKEN_PATTERN.test(token)) {
    throw new SettingsError("That token looks incomplete. Copy the whole token from Settings → Browser extension.");
  }
  return token;
}

export async function loadSettings(storage: StorageArea): Promise<Settings> {
  const raw = await storage.get(["appUrl", "token"]);
  let appUrl = DEFAULT_APP_URL;
  if (typeof raw.appUrl === "string") {
    try {
      appUrl = normalizeAppUrl(raw.appUrl);
    } catch {
      appUrl = DEFAULT_APP_URL;
    }
  }
  let token: string | null = null;
  if (typeof raw.token === "string") {
    try {
      token = validateToken(raw.token);
    } catch {
      token = null;
    }
  }
  return { appUrl, token };
}

export async function saveAppUrl(storage: StorageArea, input: string): Promise<string> {
  const appUrl = normalizeAppUrl(input);
  await storage.set({ appUrl });
  return appUrl;
}

export async function saveToken(storage: StorageArea, input: string): Promise<void> {
  const token = validateToken(input);
  await storage.set({ token });
}

export async function clearToken(storage: StorageArea): Promise<void> {
  await storage.remove(["token"]);
}

/** Hides storage (and the token) from content scripts. Returns false, never throws, when that isn't possible. */
export async function restrictToTrustedContexts(area: AccessLevelArea): Promise<boolean> {
  if (typeof area.setAccessLevel !== "function") return false;
  try {
    await area.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    return true;
  } catch {
    return false;
  }
}
