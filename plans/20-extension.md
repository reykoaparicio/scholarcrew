# Plan 20: Browser extension (Agent T)

`@scholarcrew/extension` is a Chrome Manifest V3 extension (release R3). It does two things. **Autofill (EX-01):** on the student's click it injects a content script into the active tab, finds form fields that match the student's profile (`GET /api/v1/extension/autofill-profile`), and shows an in-page review panel; the student checks the values to use and clicks "Fill selected". It never submits a form, never clicks a page button, and never sends page contents anywhere. **Save to Scout (EX-02, which feeds SC-07):** it first shows the student exactly what would be sent (the active tab's URL with its `#fragment` removed, an editable title, and the selected text behind an "Include selected text" box), and only when the student clicks "Send to Scout" does it post those values to `POST /api/v1/extension/save-page`, which files them as an unverified local scholarship that an admin reviews. The same call puts the listing on the student's board as `planned` (07 `submitLocalScholarship`, R2C-12). Both routes take `Authorization: Bearer <secret>`, where the secret is the token the student creates in Settings → Browser extension (plan 13 routes, plan 16 screen).

Read `00-overview.md` sections 2, 3, 5, and 10, and `02-domain.md` (`AutofillProfile`, `SavePageInput`, `ScholarshipSummary`, `Activity`, `ErrorBody`, `ErrorCode`, `USState`, `STATE_NAMES`) first. All domain types are imported from `@scholarcrew/domain`.

Design notes:

- Permissions are exactly `storage`, `activeTab`, `scripting`. No `host_permissions`, no `content_scripts` entry: the content script is injected with `chrome.scripting.executeScript` only after the student clicks a popup button, which `activeTab` allows for the current tab.
- Settings live in `chrome.storage.local`: `appUrl` (default `http://localhost:3000`, must be a bare origin; `https:` everywhere, plain `http:` only for `localhost`, `127.0.0.1`, and `[::1]` so the token never crosses a network in cleartext) and `token` (starts with `sct_`). The token is never shown back in the popup.
- At service-worker start, `background.ts` calls `restrictToTrustedContexts(chrome.storage.local)`, which runs `setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })` so content scripts can't read storage (and the token) even after a renderer compromise. The helper returns `false` instead of throwing when the API is missing or refuses. At execution, confirm that `@types/chrome` 0.0.326 types `setAccessLevel` on `chrome.storage.local` and that Chrome 120 accepts it for `local` (not only `session`). If either doesn't, keep the call (it's a no-op), record the risk here, and rely on the `autofill.test.ts` source scan that keeps `chrome.storage` out of page-side files.
- Save to Scout is two steps. `save-preview` reads the tab and returns `{ ok: true, url, title, selectedText }` with `url.hash` cleared and the title and selection trimmed and capped; it makes no API call. The popup shows those values, an editable title, and an "Include selected text" box (checked only when the selection is non-empty). Only "Send to Scout" sends `{ type: "save-page", title, includeSelection }`; the router re-reads the tab, clears the hash again, and sends `selectedText: ""` without reading the selection when `includeSelection` is false. The popup can't supply a URL: `save-page` is a strict object.
- API calls happen only in the background service worker, with `credentials: "omit"`. The content script gets the profile in a `show-review` message and makes no network calls.
- Responses are parsed with non-strict copies of the domain schemas (R3A-4, round 3): `AutofillProfileResponse = z.object({ ...AutofillProfile.shape, activities: z.array(z.object(Activity.shape)) })` and `ScholarshipSummaryResponse = z.object(ScholarshipSummary.shape)`. openapi says new response fields can appear within v1, so unknown keys are stripped instead of failing every installed extension. Field types and enums are 02's, unchanged. The stripped profile still passes the strict `AutofillProfile` in `ContentRequest`.
- The review panel is a closed shadow root, so page scripts can't read proposed values before the student fills them. All text is set with `textContent`.
- Already-filled fields are proposed with an unchecked "Replace" box; `fillField` refuses to overwrite a non-empty field unless `replace` is true.
- Values are set through the element prototype's native `value` setter (so React-controlled inputs see the change), then `input` and `change` are dispatched with `bubbles: true`.
- Extension pages and content scripts block `eval` under MV3's CSP, and Zod 4 reads `globalConfig.jitless` when each schema is constructed. ES imports run before the importing module's body, so an inline `z.config` call would run after `@scholarcrew/domain` had already built its schemas. Instead `src/zod-config.ts` holds only `z.config({ jitless: true })`, and `import "./zod-config";` is the first import of `background.ts`, `content.ts`, and `popup.ts`, followed by a blank line so Biome's import sorting (which sorts within blank-line-separated groups) never moves it.
- All three bundles are IIFE (classic scripts): the service worker isn't declared `type: module`, and files injected with `executeScript` must be classic scripts.
- Relies on 13 `route({ auth: "bearer", cors: "extension" })` and `extensionPreflight` (D11/D16), and on 06 secrets `sct_` + 43 base64url characters. `validateToken` accepts `sct_` + 8–200 base64url characters, a superset of what 06 issues.
- Testable logic lives in plain modules with injected dependencies (`StorageArea`, `FetchLike`, `BackgroundDeps`, `PopupDeps`). `background.ts`, `content.ts`, and `popup.ts` only wire real `chrome.*` APIs and have no tests of their own.

## Files

- Create: `apps/extension/package.json`
- Create: `apps/extension/tsconfig.json`
- Create: `apps/extension/vitest.config.ts`
- Create: `apps/extension/manifest.json`
- Create: `apps/extension/popup.html`
- Create: `apps/extension/popup.css`
- Create: `apps/extension/scripts/build.ts`
- Create: `apps/extension/src/settings.ts`
- Create: `apps/extension/src/api.ts`
- Create: `apps/extension/src/fields.ts`
- Create: `apps/extension/src/fill.ts`
- Create: `apps/extension/src/panel.ts`
- Create: `apps/extension/src/messages.ts`
- Create: `apps/extension/src/autofill.ts`
- Create: `apps/extension/src/router.ts`
- Create: `apps/extension/src/popup-app.ts`
- Create: `apps/extension/src/background.ts`
- Create: `apps/extension/src/content.ts`
- Create: `apps/extension/src/popup.ts`
- Create: `apps/extension/src/zod-config.ts`
- Create: `apps/extension/src/test/fake-storage.ts`
- Create: `apps/extension/src/test/profile.ts`
- Create: `apps/extension/src/test/form.ts`
- Test: `apps/extension/src/manifest.test.ts`
- Test: `apps/extension/src/settings.test.ts`
- Test: `apps/extension/src/api.test.ts`
- Test: `apps/extension/src/fields.test.ts`
- Test: `apps/extension/src/fill.test.ts`
- Test: `apps/extension/src/panel.test.ts`
- Test: `apps/extension/src/autofill.test.ts`
- Test: `apps/extension/src/router.test.ts`
- Test: `apps/extension/src/popup-app.test.ts`

All paths are under `apps/extension/**`, owned by plan 20 in `00-overview.md` section 5. `dist/` is ignored by the root `.gitignore` (plan 01) and by Biome.

## Tasks

### T1: Package scaffold and manifest

- [ ] **Step 1: Create the package files**

`apps/extension/package.json`:

```json
{
  "name": "@scholarcrew/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsx scripts/build.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scholarcrew/domain": "workspace:*",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.326",
    "@types/node": "^22.15.0",
    "esbuild": "^0.25.0",
    "jsdom": "^26.1.0",
    "tsx": "^4.20.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

`apps/extension/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["chrome", "node"] },
  "include": ["src", "scripts", "vitest.config.ts"]
}
```

`apps/extension/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "jsdom" },
});
```

Run: `pnpm install`
Expected: workspace links `@scholarcrew/extension` and `@scholarcrew/domain`, installs esbuild 0.25.x, @types/chrome 0.0.326, jsdom 26.x.

- [ ] **Step 2: Write the failing test**

`apps/extension/src/manifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";

describe("manifest.json", () => {
  it("is MV3 named ScholarCrew", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("ScholarCrew");
  });

  it("asks for exactly storage, activeTab, and scripting", () => {
    expect(manifest.permissions).toHaveLength(3);
    expect([...manifest.permissions].sort()).toEqual(["activeTab", "scripting", "storage"]);
  });

  it("asks for no host access and runs no content script on its own", () => {
    const keys = Object.keys(manifest);
    for (const key of [
      "host_permissions",
      "optional_host_permissions",
      "optional_permissions",
      "content_scripts",
      "externally_connectable",
      "web_accessible_resources",
    ]) {
      expect(keys).not.toContain(key);
    }
  });

  it("points at the built background worker and popup", () => {
    expect(manifest.background).toEqual({ service_worker: "background.js" });
    expect(manifest.action.default_popup).toBe("popup.html");
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/extension test`
Expected: FAIL with `Failed to resolve import "../manifest.json" from "src/manifest.test.ts"`.

- [ ] **Step 4: Write the manifest**

`apps/extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "ScholarCrew",
  "version": "0.1.0",
  "description": "Fill scholarship forms from your ScholarCrew profile after you review each value, and save pages to Scout.",
  "minimum_chrome_version": "120",
  "permissions": ["storage", "activeTab", "scripting"],
  "background": { "service_worker": "background.js" },
  "action": { "default_title": "ScholarCrew", "default_popup": "popup.html" }
}
```

- [ ] **Step 5: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/extension test`
Expected: PASS, 1 file, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/package.json apps/extension/tsconfig.json apps/extension/vitest.config.ts apps/extension/manifest.json apps/extension/src/manifest.test.ts
git commit -m "feat(extension): package scaffold and MV3 manifest"
```

### T2: Settings in chrome.storage.local

- [ ] **Step 1: Write the failing test**

`apps/extension/src/test/fake-storage.ts`:

```ts
import type { StorageArea } from "../settings";

export interface MemoryStorage extends StorageArea {
  data: Record<string, unknown>;
}

export function createMemoryStorage(initial: Record<string, unknown> = {}): MemoryStorage {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    async get(keys) {
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in data) out[key] = data[key];
      }
      return out;
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const key of keys) Reflect.deleteProperty(data, key);
    },
  };
}
```

`apps/extension/src/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_URL,
  SettingsError,
  clearToken,
  loadSettings,
  normalizeAppUrl,
  restrictToTrustedContexts,
  saveAppUrl,
  saveToken,
  validateToken,
} from "./settings";
import { createMemoryStorage } from "./test/fake-storage";

const TOKEN = "sct_Ab3dE6gH9jK2mN5p";

describe("normalizeAppUrl", () => {
  it("accepts http and https origins and returns the bare origin", () => {
    expect(normalizeAppUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeAppUrl("  https://scholarcrew.example/ ")).toBe("https://scholarcrew.example");
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])(
    "allows plain http on this computer: %j",
    (input) => {
      expect(normalizeAppUrl(input)).toBe(input);
    },
  );

  it.each(["http://scholarcrew.example", "http://192.168.1.20:3000", "http://localhost.scholarcrew.example"])(
    "requires https for %j",
    (input) => {
      expect(() => normalizeAppUrl(input)).toThrow("Use https:// for anything but your own computer.");
    },
  );

  it.each([
    "not a url",
    "",
    "ftp://scholarcrew.example",
    "javascript:alert(1)",
    "chrome-extension://abc",
    "https://scholarcrew.example/settings",
    "https://scholarcrew.example/?x=1",
    "https://user:pw@scholarcrew.example",
  ])("rejects %j", (input) => {
    expect(() => normalizeAppUrl(input)).toThrow(SettingsError);
  });
});

describe("validateToken", () => {
  it("trims and accepts an sct_ token", () => {
    expect(validateToken(`  ${TOKEN}\n`)).toBe(TOKEN);
  });

  it("explains the prefix when it's missing", () => {
    expect(() => validateToken("abc123456789")).toThrow("Tokens start with sct_");
  });

  it.each(["sct_", "sct_short", "sct_has space inside", `sct_${"a".repeat(201)}`])("rejects %j", (input) => {
    expect(() => validateToken(input)).toThrow(SettingsError);
  });
});

describe("stored settings", () => {
  it("defaults to the local app and no token", async () => {
    expect(await loadSettings(createMemoryStorage())).toEqual({ appUrl: DEFAULT_APP_URL, token: null });
    expect(DEFAULT_APP_URL).toBe("http://localhost:3000");
  });

  it("ignores corrupted stored values", async () => {
    const storage = createMemoryStorage({ appUrl: "javascript:alert(1)", token: 42 });
    expect(await loadSettings(storage)).toEqual({ appUrl: DEFAULT_APP_URL, token: null });
  });

  it("saves a normalized app URL and a validated token", async () => {
    const storage = createMemoryStorage();
    expect(await saveAppUrl(storage, "https://scholarcrew.example/")).toBe("https://scholarcrew.example");
    await saveToken(storage, ` ${TOKEN} `);
    expect(storage.data).toEqual({ appUrl: "https://scholarcrew.example", token: TOKEN });
    expect(await loadSettings(storage)).toEqual({ appUrl: "https://scholarcrew.example", token: TOKEN });
  });

  it("doesn't write invalid input", async () => {
    const storage = createMemoryStorage({ token: TOKEN });
    await expect(saveToken(storage, "nope")).rejects.toThrow(SettingsError);
    await expect(saveAppUrl(storage, "ftp://x.example")).rejects.toThrow(SettingsError);
    expect(storage.data).toEqual({ token: TOKEN });
  });

  it("clears the token and keeps the app URL", async () => {
    const storage = createMemoryStorage({ appUrl: "https://scholarcrew.example", token: TOKEN });
    await clearToken(storage);
    expect(storage.data).toEqual({ appUrl: "https://scholarcrew.example" });
  });
});

describe("restrictToTrustedContexts", () => {
  it("asks storage to hide itself from content scripts", async () => {
    const calls: unknown[] = [];
    const area = {
      setAccessLevel: async (options: { accessLevel: string }) => {
        calls.push(options);
      },
    };
    expect(await restrictToTrustedContexts(area)).toBe(true);
    expect(calls).toEqual([{ accessLevel: "TRUSTED_CONTEXTS" }]);
  });

  it("returns false when the browser lacks the API or refuses the call", async () => {
    expect(await restrictToTrustedContexts({})).toBe(false);
    const refusing = {
      setAccessLevel: async () => {
        throw new Error("This is only supported for session storage");
      },
    };
    expect(await restrictToTrustedContexts(refusing)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/extension test src/settings.test.ts`
Expected: FAIL with `Failed to resolve import "./settings" from "src/settings.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/extension/src/settings.ts`:

```ts
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
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/extension test src/settings.test.ts`
Expected: PASS, 1 file, 28 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/settings.ts apps/extension/src/settings.test.ts apps/extension/src/test/fake-storage.ts
git commit -m "feat(extension): validated app URL and token settings"
```

### T3: API client

- [ ] **Step 1: Write the failing test**

`apps/extension/src/test/profile.ts`:

```ts
import type { Activity, AutofillProfile, ScholarshipSummary } from "@scholarcrew/domain";

function activity(id: string, position: number, name: string, role: string, description: string): Activity {
  return {
    id,
    position,
    name,
    role,
    organization: "",
    description,
    hoursPerWeek: 4,
    weeksPerYear: 30,
    grades: [10, 11],
    category: "Community service",
  };
}

export const PROFILE: AutofillProfile = {
  displayName: "Maya Torres",
  email: "maya@example.com",
  highSchool: "Lakeview High School",
  classYear: 2027,
  city: "Austin",
  state: "TX",
  gpa: 3.8,
  intendedMajors: ["Biology", "Public Health"],
  activities: [
    activity("2b7e4c1a-5d3f-4e8a-9b6c-7d8e9f0a1b2c", 2, "Food bank", "Shift lead", "Run the Saturday sorting crew"),
    activity("8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f", 1, "Robotics club", "Captain", "Lead a 12-person build team"),
  ],
};

export const SUMMARY: ScholarshipSummary = {
  id: "6a1d5c2e-3b4f-4a8e-9c7d-1e2f3a4b5c6d",
  slug: "lakeview-rotary-award",
  name: "Lakeview Rotary Award",
  provider: "Lakeview Rotary Club",
  amountMinUsd: 1000,
  amountMaxUsd: 1000,
  renewable: false,
  deadline: "2027-03-01",
  localLabel: "Austin, TX",
  status: "draft",
  verifiedAt: null,
  scamFlags: [],
  unverified: true,
  estMinutes: 30,
};
```

`apps/extension/src/api.test.ts`:

```ts
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
    const f = fakeFetch(json(200, { ...PROFILE, pronouns: "she/her", activities: [{ ...first, verified: true }, ...rest] }));
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
    const err = await caught(createApiClient({ appUrl: APP, token: TOKEN, fetch: f.fn }).savePage({ url: "https://source.test/award", title: "Award", selectedText: "" }));
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
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/extension test src/api.test.ts`
Expected: FAIL with `Failed to resolve import "./api" from "src/api.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/extension/src/api.ts`:

```ts
import {
  Activity,
  AutofillProfile,
  ErrorBody,
  type ErrorCode,
  type SavePageInput,
  ScholarshipSummary,
} from "@scholarcrew/domain";
import { z } from "zod";

export const RECONNECT_MESSAGE = "Your token expired. Create a new one in Settings.";

/**
 * R3A-4: responses are parsed with non-strict copies of the domain schemas. openapi lets v1 add response
 * fields, so an unknown key is stripped, never rejected. Field types and enums stay as strict as 02's.
 */
export const AutofillProfileResponse = z.object({
  ...AutofillProfile.shape,
  activities: z.array(z.object(Activity.shape)),
});
export const ScholarshipSummaryResponse = z.object(ScholarshipSummary.shape);

export type ApiErrorCode = ErrorCode | "network" | "bad_response";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;

  constructor(code: ApiErrorCode, message: string, status: number | null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  appUrl: string;
  token: string;
  fetch: FetchLike;
}

export interface ApiClient {
  getAutofillProfile(): Promise<AutofillProfile>;
  savePage(input: SavePageInput): Promise<ScholarshipSummary>;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const base = `${options.appUrl.replace(/\/+$/, "")}/api/v1/extension`;
  const doFetch = options.fetch;

  async function call<T>(method: "GET" | "POST", path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${options.token}`,
    };
    const init: RequestInit = { method, headers, credentials: "omit" };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, init);
    } catch {
      throw new ApiError("network", `Can't reach ScholarCrew at ${options.appUrl}. Check the app address.`, null);
    }
    if (res.status === 401) throw new ApiError("unauthenticated", RECONNECT_MESSAGE, 401);
    if (res.status === 429 && path === "/save-page") throw new ApiError("rate_limited", "You've saved 10 pages today. Try again tomorrow.", 429);
    const json = await readJson(res);
    if (!res.ok) {
      const error = ErrorBody.safeParse(json);
      if (error.success) throw new ApiError(error.data.error.code, error.data.error.message, res.status);
      throw new ApiError("internal", `ScholarCrew returned ${res.status}.`, res.status);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(
        "bad_response",
        "ScholarCrew sent a reply this extension doesn't understand. Update the extension.",
        res.status,
      );
    }
    return parsed.data;
  }

  return {
    getAutofillProfile: () => call("GET", "/autofill-profile", undefined, AutofillProfileResponse),
    savePage: (input) => call("POST", "/save-page", input, ScholarshipSummaryResponse),
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/extension test src/api.test.ts`
Expected: PASS, 1 file, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/api.ts apps/extension/src/api.test.ts apps/extension/src/test/profile.ts
git commit -m "feat(extension): bearer API client with schema validation and error mapping"
```

### T4: Field detection and matching

Rules are checked in order against each descriptor text, label first. One deliberate change from the plain keyword order: graduation-year rules run before high-school rules so "High school graduation year" maps to `classYear`. A descriptor that names another person (parent, guardian, counselor, teacher, recommender, reference, emergency contact, sibling) matches nothing, so "Parent email" never gets the student's email.

- [ ] **Step 1: Write the failing test**

`apps/extension/src/test/form.ts`:

```ts
export const FORM_HTML = `
<form id="application" action="/apply" method="post">
  <h1>Lakeview Rotary Award application</h1>
  <label for="full-name">Full name</label>
  <input id="full-name" name="applicant_name" type="text">
  <label>Email address <input type="email" name="contact"></label>
  <input type="text" name="hs" aria-label="High school name">
  <span id="grad-label">High school graduation year</span>
  <input type="number" name="q4" aria-labelledby="grad-label">
  <input type="text" name="gpa_unweighted" placeholder="Unweighted GPA (4.0 scale)">
  <label for="city">City</label>
  <input id="city" type="text" value="Springfield">
  <label for="state">State</label>
  <select id="state" name="state">
    <option value="">Choose a state</option>
    <option value="IL">Illinois</option>
    <option value="TX">Texas</option>
  </select>
  <input type="text" id="intendedMajor">
  <label for="acts">List your extracurricular activities</label>
  <textarea id="acts" name="acts"></textarea>
  <label for="parent-email">Parent or guardian email</label>
  <input id="parent-email" type="email">
  <label for="essay">Why do you deserve this scholarship?</label>
  <textarea id="essay"></textarea>
  <input type="hidden" name="email" value="">
  <label for="pw">Create a password</label>
  <input id="pw" type="password" name="password">
  <label for="resume">Resume</label>
  <input id="resume" type="file">
  <div style="display: none"><label for="ghost-email">Email</label><input id="ghost-email" type="email"></div>
  <label for="old-city">City</label>
  <input id="old-city" type="text" disabled>
  <label><input type="checkbox" name="agree"> I agree to the terms</label>
  <button type="submit">Submit application</button>
  <input type="submit" value="Send">
</form>`;

/** Ids or names of the fields detectFields should return for FORM_HTML, in DOM order. */
export const VISIBLE_FIELDS = [
  "full-name",
  "contact",
  "hs",
  "q4",
  "gpa_unweighted",
  "city",
  "state",
  "intendedMajor",
  "acts",
  "parent-email",
  "essay",
];

export function mountForm(): HTMLFormElement {
  document.body.innerHTML = FORM_HTML;
  const form = document.getElementById("application");
  if (!(form instanceof HTMLFormElement)) throw new Error("fixture form missing");
  return form;
}

export function control<T extends Element = HTMLInputElement>(idOrName: string): T {
  const el = document.getElementById(idOrName) ?? document.querySelector(`[name="${idOrName}"]`);
  if (!el) throw new Error(`missing field ${idOrName}`);
  return el as T;
}

export function fieldKey(el: Element): string {
  return el.id || el.getAttribute("name") || "";
}
```

`apps/extension/src/fields.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { type DetectedField, detectFields, formatActivity, matchField, profileValue } from "./fields";
import { VISIBLE_FIELDS, fieldKey, mountForm } from "./test/form";
import { PROFILE } from "./test/profile";

function only(html: string): DetectedField {
  document.body.innerHTML = html;
  const fields = detectFields(document);
  expect(fields).toHaveLength(1);
  const [field] = fields;
  if (!field) throw new Error("no field");
  return field;
}

describe("detectFields on the fixture form", () => {
  beforeEach(() => {
    mountForm();
  });

  it("returns visible, enabled text-like fields in DOM order", () => {
    expect(detectFields(document).map((f) => fieldKey(f.element))).toEqual(VISIBLE_FIELDS);
  });

  it("ignores hidden, password, file, checkbox, submit, display:none, and disabled fields", () => {
    const keys = detectFields(document).map((f) => fieldKey(f.element));
    for (const ignored of ["email", "pw", "resume", "agree", "ghost-email", "old-city"]) {
      expect(keys).not.toContain(ignored);
    }
  });

  it("maps each field to a profile key and leaves unknown fields unmatched", () => {
    const matched = Object.fromEntries(detectFields(document).map((f) => [fieldKey(f.element), matchField(f)]));
    expect(matched).toEqual({
      "full-name": "displayName",
      contact: "email",
      hs: "highSchool",
      q4: "classYear",
      gpa_unweighted: "gpa",
      city: "city",
      state: "state",
      intendedMajor: "intendedMajors",
      acts: "activities",
      "parent-email": null,
      essay: null,
    });
  });

  it("uses readable labels for display", () => {
    const labels = detectFields(document).map((f) => f.label);
    expect(labels.slice(0, 5)).toEqual([
      "Full name",
      "Email address",
      "High school name",
      "High school graduation year",
      "Unweighted GPA (4.0 scale)",
    ]);
    expect(labels[7]).toBe("intended major");
  });
});

describe("descriptor sources", () => {
  it("reads label[for]", () => {
    expect(only(`<label for="a">Student name</label><input id="a">`).texts[0]).toBe("student name");
  });

  it("reads a wrapping label without the option text of the control inside it", () => {
    const field = only(`<label>Home state <select><option>Texas</option></select></label>`);
    expect(field.texts[0]).toBe("home state");
    expect(field.label).toBe("Home state");
  });

  it("reads aria-label and every aria-labelledby id", () => {
    expect(only(`<input aria-label="Cumulative GPA">`).texts).toEqual(["cumulative gpa"]);
    const field = only(`<span id="x">Field</span><span id="y">of study</span><input aria-labelledby="x y">`);
    expect(field.texts).toEqual(["field of study"]);
  });

  it("splits camelCase and snake_case names and ids, then reads the placeholder", () => {
    const field = only(`<input name="grad_year" id="studentGradYear" placeholder="YYYY">`);
    expect(field.texts).toEqual(["grad year", "student grad year", "yyyy"]);
    expect(field.label).toBe("YYYY");
  });

  it("skips readonly fields and fields under a hidden ancestor", () => {
    document.body.innerHTML = `<input aria-label="City" readonly><div hidden><input aria-label="State"></div>`;
    expect(detectFields(document)).toEqual([]);
  });
});

describe("matchField keywords", () => {
  it.each([
    ["E-mail", "email"],
    ["Your name", "displayName"],
    ["Student name", "displayName"],
    ["Class of", "classYear"],
    ["Grad year", "classYear"],
    ["School name", "highSchool"],
    ["Cumulative GPA", "gpa"],
    ["City of residence", "city"],
    ["Intended majors", "intendedMajors"],
    ["Field of study", "intendedMajors"],
    ["Extracurriculars", "activities"],
    ["First name", null],
    ["Name", null],
    ["Parent email", null],
    ["Counselor name", null],
    ["Are you a United States citizen?", null],
    ["Personal statement", null],
  ])("%j → %j", (text, key) => {
    expect(matchField(only(`<input aria-label="${text}">`))).toBe(key);
  });
});

describe("profileValue", () => {
  it("formats numbers and lists", () => {
    expect(profileValue(PROFILE, "gpa", false)).toBe("3.80");
    expect(profileValue(PROFILE, "classYear", false)).toBe("2027");
    expect(profileValue(PROFILE, "intendedMajors", false)).toBe("Biology, Public Health");
    expect(profileValue(PROFILE, "email", false)).toBe("maya@example.com");
  });

  it("puts one activity per line, in position order", () => {
    expect(profileValue(PROFILE, "activities", true)).toBe(
      "Robotics club — Captain: Lead a 12-person build team\nFood bank — Shift lead: Run the Saturday sorting crew",
    );
    expect(profileValue(PROFILE, "activities", false)).toBe(
      "Robotics club — Captain: Lead a 12-person build team; Food bank — Shift lead: Run the Saturday sorting crew",
    );
  });

  it("returns null when the profile has nothing to offer", () => {
    const empty = { ...PROFILE, highSchool: " ", gpa: null, classYear: null, intendedMajors: [], activities: [] };
    for (const key of ["highSchool", "gpa", "classYear", "intendedMajors", "activities"] as const) {
      expect(profileValue(empty, key, true)).toBeNull();
    }
  });

  it("drops an empty role or description from an activity line", () => {
    const [first] = PROFILE.activities;
    if (!first) throw new Error("fixture");
    expect(formatActivity({ ...first, role: "", description: "" })).toBe("Food bank");
    expect(formatActivity({ ...first, role: "" })).toBe("Food bank: Run the Saturday sorting crew");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/extension test src/fields.test.ts`
Expected: FAIL with `Failed to resolve import "./fields" from "src/fields.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/extension/src/fields.ts`:

```ts
import type { Activity, AutofillProfile } from "@scholarcrew/domain";

export type ProfileKey =
  | "email"
  | "displayName"
  | "highSchool"
  | "classYear"
  | "gpa"
  | "city"
  | "state"
  | "intendedMajors"
  | "activities";

export type FillableElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export interface DetectedField {
  element: FillableElement;
  /** Human-readable name shown in the review panel. */
  label: string;
  /** Normalized descriptor texts, most reliable first. */
  texts: string[];
}

const SKIPPED_INPUT_TYPES = new Set([
  "hidden",
  "password",
  "file",
  "submit",
  "button",
  "reset",
  "image",
  "checkbox",
  "radio",
]);

const OTHER_PERSON = /\b(parents?|guardian|mother|father|counselor|teacher|recommender|reference|emergency|siblings?)\b/;

const RULES: ReadonlyArray<{ key: ProfileKey; pattern: RegExp }> = [
  { key: "email", pattern: /\be ?mail\b/ },
  { key: "displayName", pattern: /\b(full name|your name|student name)\b/ },
  { key: "classYear", pattern: /\b(graduation year|year of graduation|class of|grad year)\b/ },
  { key: "highSchool", pattern: /\b(high school|school name)\b/ },
  { key: "gpa", pattern: /\bgpa\b/ },
  { key: "city", pattern: /\bcity\b/ },
  { key: "state", pattern: /\bstate\b/ },
  { key: "intendedMajors", pattern: /\b(intended majors?|majors?|field of study)\b/ },
  { key: "activities", pattern: /\b(activities|extracurriculars?)\b/ },
];

export function isSelect(el: FillableElement): el is HTMLSelectElement {
  return el.tagName === "SELECT";
}

export function isTextArea(el: FillableElement): el is HTMLTextAreaElement {
  return el.tagName === "TEXTAREA";
}

function isInput(el: FillableElement): el is HTMLInputElement {
  return el.tagName === "INPUT";
}

export function normalizeText(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isVisible(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.hasAttribute("hidden")) return false;
    if (view) {
      const style = view.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
  }
  return true;
}

function isFillable(el: FillableElement): boolean {
  if (el.disabled) return false;
  if (isInput(el) && (SKIPPED_INPUT_TYPES.has(el.type) || el.readOnly)) return false;
  if (isTextArea(el) && el.readOnly) return false;
  return isVisible(el);
}

function labelText(label: Element): string {
  const clone = label.cloneNode(true);
  if (!(clone instanceof Element)) return "";
  for (const inner of clone.querySelectorAll("input, select, textarea, button")) inner.remove();
  return clone.textContent ?? "";
}

/** Raw descriptor sources in priority order, paired with whether they're readable enough to display. */
function descriptorSources(el: FillableElement, doc: Document): Array<{ text: string; readable: boolean }> {
  const sources: Array<{ text: string; readable: boolean }> = [];
  if (el.id) {
    for (const label of doc.querySelectorAll("label")) {
      if (label.htmlFor === el.id) sources.push({ text: labelText(label), readable: true });
    }
  }
  const wrapping = el.closest("label");
  if (wrapping) sources.push({ text: labelText(wrapping), readable: true });
  sources.push({ text: el.getAttribute("aria-label") ?? "", readable: true });
  const labelledBy = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  const labelledText = labelledBy.map((id) => doc.getElementById(id)?.textContent ?? "").join(" ");
  sources.push({ text: labelledText, readable: true });
  sources.push({ text: el.getAttribute("name") ?? "", readable: false });
  sources.push({ text: el.id, readable: false });
  sources.push({ text: el.getAttribute("placeholder") ?? "", readable: true });
  return sources;
}

function describeField(el: FillableElement, doc: Document): DetectedField {
  const sources = descriptorSources(el, doc);
  const texts: string[] = [];
  for (const source of sources) {
    const normalized = normalizeText(source.text);
    if (normalized && !texts.includes(normalized)) texts.push(normalized);
  }
  const readable = sources.find((s) => s.readable && collapse(s.text) !== "");
  const label = readable ? collapse(readable.text) : (texts[0] ?? "Unnamed field");
  return { element: el, label, texts };
}

export function detectFields(doc: Document): DetectedField[] {
  const fields: DetectedField[] = [];
  for (const el of doc.querySelectorAll<FillableElement>("input, select, textarea")) {
    if (isFillable(el)) fields.push(describeField(el, doc));
  }
  return fields;
}

export function matchField(field: DetectedField): ProfileKey | null {
  for (const text of field.texts) {
    if (OTHER_PERSON.test(text)) return null;
    for (const rule of RULES) {
      if (rule.pattern.test(text)) return rule.key;
    }
  }
  return null;
}

export function formatActivity(activity: Activity): string {
  let line = activity.name;
  if (activity.role) line = `${line} — ${activity.role}`;
  if (activity.description) line = `${line}: ${activity.description}`;
  return line;
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The value to propose for a key, or null when the profile has nothing for it. */
export function profileValue(profile: AutofillProfile, key: ProfileKey, multiline: boolean): string | null {
  switch (key) {
    case "email":
      return orNull(profile.email);
    case "displayName":
      return orNull(profile.displayName);
    case "highSchool":
      return orNull(profile.highSchool);
    case "classYear":
      return profile.classYear === null ? null : String(profile.classYear);
    case "gpa":
      return profile.gpa === null ? null : profile.gpa.toFixed(2);
    case "city":
      return orNull(profile.city);
    case "state":
      return orNull(profile.state);
    case "intendedMajors":
      return orNull(profile.intendedMajors.join(", "));
    case "activities": {
      const lines = [...profile.activities].sort((a, b) => a.position - b.position).map(formatActivity);
      return orNull(lines.join(multiline ? "\n" : "; "));
    }
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/extension test src/fields.test.ts`
Expected: PASS, 1 file, 30 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/fields.ts apps/extension/src/fields.test.ts apps/extension/src/test/form.ts
git commit -m "feat(extension): detect form fields and match them to profile keys"
```

### T5: Proposals and filling

- [ ] **Step 1: Write the failing test**

`apps/extension/src/fill.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { detectFields } from "./fields";
import { applyProposals, buildProposals, fillField, findOption } from "./fill";
import { control, fieldKey, mountForm } from "./test/form";
import { PROFILE } from "./test/profile";

function eventsOn(target: EventTarget): string[] {
  const seen: string[] = [];
  for (const type of ["input", "change"]) {
    target.addEventListener(type, (e) => seen.push(`${e.type}:${fieldKey(e.target as Element)}:${e.bubbles}`));
  }
  return seen;
}

describe("buildProposals", () => {
  beforeEach(() => {
    mountForm();
  });

  it("proposes a value for every matched field the profile can fill", () => {
    const proposals = buildProposals(detectFields(document), PROFILE);
    expect(proposals.map((p) => [fieldKey(p.field.element), p.key, p.display])).toEqual([
      ["full-name", "displayName", "Maya Torres"],
      ["contact", "email", "maya@example.com"],
      ["hs", "highSchool", "Lakeview High School"],
      ["q4", "classYear", "2027"],
      ["gpa_unweighted", "gpa", "3.80"],
      ["city", "city", "Austin"],
      ["state", "state", "Texas"],
      ["intendedMajor", "intendedMajors", "Biology, Public Health"],
      [
        "acts",
        "activities",
        "Robotics club — Captain: Lead a 12-person build team\nFood bank — Shift lead: Run the Saturday sorting crew",
      ],
    ]);
    expect(new Set(proposals.map((p) => p.id)).size).toBe(9);
  });

  it("marks already-filled fields and keeps their current value", () => {
    const proposals = buildProposals(detectFields(document), PROFILE);
    const city = proposals.find((p) => p.key === "city");
    expect(city).toMatchObject({ filled: true, currentValue: "Springfield", value: "Austin" });
    expect(proposals.filter((p) => p.filled)).toHaveLength(1);
  });

  it("uses the option value for selects", () => {
    const state = buildProposals(detectFields(document), PROFILE).find((p) => p.key === "state");
    expect(state).toMatchObject({ value: "TX", display: "Texas", filled: false });
  });

  it("matches a state code to an option that only has the state name", () => {
    document.body.innerHTML = `<select aria-label="State"><option value="">Pick</option><option value="texas">Texas</option></select>`;
    const [proposal] = buildProposals(detectFields(document), PROFILE);
    expect(proposal).toMatchObject({ value: "texas", display: "Texas" });
  });

  it("skips selects with no matching option, empty profile values, and fields that already match", () => {
    document.body.innerHTML = `
      <select aria-label="State"><option value="IL">Illinois</option></select>
      <input aria-label="GPA">
      <input aria-label="Email" value="maya@example.com">`;
    expect(buildProposals(detectFields(document), { ...PROFILE, gpa: null })).toEqual([]);
  });
});

describe("fillField", () => {
  beforeEach(() => {
    mountForm();
  });

  it("sets the value and dispatches bubbling input then change", () => {
    const form = control<HTMLFormElement>("application");
    const seen = eventsOn(form);
    expect(fillField(control("full-name"), "Maya Torres", { replace: false })).toBe(true);
    expect(control("full-name").value).toBe("Maya Torres");
    expect(seen).toEqual(["input:full-name:true", "change:full-name:true"]);
  });

  it("leaves an already-filled field alone unless replace is set", () => {
    const seen = eventsOn(control("city"));
    expect(fillField(control("city"), "Austin", { replace: false })).toBe(false);
    expect(control("city").value).toBe("Springfield");
    expect(seen).toEqual([]);
    expect(fillField(control("city"), "Austin", { replace: true })).toBe(true);
    expect(control("city").value).toBe("Austin");
  });

  it("picks a select option by value or text, case-insensitively", () => {
    const state = control<HTMLSelectElement>("state");
    expect(findOption(state, "tx")?.value).toBe("TX");
    expect(findOption(state, "illinois")?.value).toBe("IL");
    expect(findOption(state, "Ohio")).toBeNull();
    expect(fillField(state, "texas", { replace: false })).toBe(true);
    expect(state.value).toBe("TX");
  });

  it("does nothing to a select when no option matches", () => {
    const state = control<HTMLSelectElement>("state");
    const seen = eventsOn(state);
    expect(fillField(state, "Ohio", { replace: false })).toBe(false);
    expect(state.value).toBe("");
    expect(seen).toEqual([]);
  });

  it("writes through the native value setter so framework-controlled inputs see it", () => {
    const input = control("full-name");
    const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => nativeValue?.get?.call(input),
      set: () => {
        throw new Error("instance setter used");
      },
    });
    expect(fillField(input, "Maya Torres", { replace: false })).toBe(true);
    expect(nativeValue?.get?.call(input)).toBe("Maya Torres");
  });
});

describe("applyProposals", () => {
  it("fills only the selected proposals and returns how many changed", () => {
    mountForm();
    const proposals = buildProposals(detectFields(document), PROFILE);
    const selected = new Set(proposals.filter((p) => p.key === "email" || p.key === "state").map((p) => p.id));
    expect(applyProposals(proposals, selected)).toBe(2);
    expect(control("contact").value).toBe("maya@example.com");
    expect(control<HTMLSelectElement>("state").value).toBe("TX");
    expect(control("full-name").value).toBe("");
    expect(control("city").value).toBe("Springfield");
  });

  it("replaces a filled field when its proposal is selected", () => {
    mountForm();
    const proposals = buildProposals(detectFields(document), PROFILE);
    const city = proposals.find((p) => p.key === "city");
    if (!city) throw new Error("no city proposal");
    expect(applyProposals(proposals, new Set([city.id]))).toBe(1);
    expect(control("city").value).toBe("Austin");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/extension test src/fill.test.ts`
Expected: FAIL with `Failed to resolve import "./fill" from "src/fill.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/extension/src/fill.ts`:

```ts
import { type AutofillProfile, STATE_NAMES, USState } from "@scholarcrew/domain";
import {
  type DetectedField,
  type FillableElement,
  type ProfileKey,
  isSelect,
  isTextArea,
  matchField,
  profileValue,
} from "./fields";

export interface Proposal {
  id: string;
  field: DetectedField;
  key: ProfileKey;
  /** What gets written (the option value for selects). */
  value: string;
  /** What the student sees in the review panel (the option text for selects). */
  display: string;
  currentValue: string;
  filled: boolean;
}

/** Profiles store two-letter codes; many forms list full state names (STATE_NAMES from the domain, D41). */
export function findOption(select: HTMLSelectElement, value: string): HTMLOptionElement | null {
  const trimmed = value.trim();
  const wanted = new Set([trimmed.toLowerCase()]);
  const code = USState.safeParse(trimmed.toUpperCase());
  if (code.success) wanted.add(STATE_NAMES[code.data].toLowerCase());
  for (const option of select.options) {
    if (option.disabled) continue;
    if (wanted.has(option.value.trim().toLowerCase()) || wanted.has(option.text.trim().toLowerCase())) return option;
  }
  return null;
}

export function buildProposals(fields: DetectedField[], profile: AutofillProfile): Proposal[] {
  const proposals: Proposal[] = [];
  for (const field of fields) {
    const key = matchField(field);
    if (key === null) continue;
    const raw = profileValue(profile, key, isTextArea(field.element));
    if (raw === null) continue;
    let value = raw;
    let display = raw;
    if (isSelect(field.element)) {
      const option = findOption(field.element, raw);
      if (!option) continue;
      value = option.value;
      display = option.text.trim();
    }
    const currentValue = field.element.value;
    if (currentValue === value) continue;
    proposals.push({
      id: `p${proposals.length}`,
      field,
      key,
      value,
      display,
      currentValue,
      filled: currentValue.trim() !== "",
    });
  }
  return proposals;
}

function setNativeValue(el: FillableElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
}

/** Writes one value. Never touches a non-empty field unless replace is true. Never submits. */
export function fillField(el: FillableElement, value: string, options: { replace: boolean }): boolean {
  if (el.value.trim() !== "" && !options.replace) return false;
  let next = value;
  if (isSelect(el)) {
    const option = findOption(el, value);
    if (!option) return false;
    next = option.value;
  }
  setNativeValue(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export function applyProposals(proposals: Proposal[], selected: ReadonlySet<string>): number {
  let count = 0;
  for (const proposal of proposals) {
    if (!selected.has(proposal.id)) continue;
    if (fillField(proposal.field.element, proposal.value, { replace: proposal.filled })) count += 1;
  }
  return count;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/extension test src/fill.test.ts`
Expected: PASS, 1 file, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/fill.ts apps/extension/src/fill.test.ts
git commit -m "feat(extension): build fill proposals and fill fields with input and change events"
```

### T6: In-page review panel

- [ ] **Step 1: Write the failing test**

`apps/extension/src/panel.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { detectFields } from "./fields";
import { type Proposal, buildProposals } from "./fill";
import { PANEL_HOST_ID, type PanelHandle, showReviewPanel } from "./panel";
import { control, mountForm } from "./test/form";
import { PROFILE } from "./test/profile";

function press(panel: PanelHandle, text: string): void {
  const button = [...panel.root.querySelectorAll("button")].find((b) => b.textContent === text);
  if (!button) throw new Error(`no button ${text}`);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function box(panel: PanelHandle, proposal: Proposal | undefined): HTMLInputElement {
  const el = panel.root.querySelector(`input[data-proposal-id="${proposal?.id}"]`);
  if (!(el instanceof HTMLInputElement)) throw new Error("no checkbox");
  return el;
}

function formValues(form: HTMLFormElement): string[] {
  return [...form.elements].map((el) => (el as HTMLInputElement).value);
}

describe("review panel", () => {
  let form: HTMLFormElement;
  let proposals: Proposal[];

  beforeEach(() => {
    form = mountForm();
    proposals = buildProposals(detectFields(document), PROFILE);
  });

  it("lists every proposal with its field and value inside a closed shadow root", () => {
    const panel = showReviewPanel(document, proposals);
    expect(panel.host.id).toBe(PANEL_HOST_ID);
    expect(panel.host.shadowRoot).toBeNull();
    const rows = [...panel.root.querySelectorAll(".row")];
    expect(rows).toHaveLength(9);
    expect(rows[0]?.querySelector(".field")?.textContent).toBe("Full name");
    expect(rows[0]?.querySelector(".value")?.textContent).toBe("Maya Torres");
    expect(panel.root.textContent).toContain("Nothing is submitted");
  });

  it("checks empty fields and leaves filled ones on an unchecked Replace box", () => {
    const panel = showReviewPanel(document, proposals);
    const city = proposals.find((p) => p.key === "city");
    expect(box(panel, city).checked).toBe(false);
    const cityRow = box(panel, city).closest(".row");
    expect(cityRow?.querySelector(".choice")?.textContent).toBe("Replace");
    expect(cityRow?.querySelector(".note")?.textContent).toBe("Now: “Springfield”");
    for (const p of proposals.filter((x) => !x.filled)) expect(box(panel, p).checked).toBe(true);
  });

  it("Cancel closes the panel and changes nothing", () => {
    const before = formValues(form);
    const events: string[] = [];
    form.addEventListener("input", () => events.push("input"));
    form.addEventListener("change", () => events.push("change"));
    const panel = showReviewPanel(document, proposals);
    press(panel, "Cancel");
    expect(document.getElementById(PANEL_HOST_ID)).toBeNull();
    expect(formValues(form)).toEqual(before);
    expect(events).toEqual([]);
  });

  it("Fill selected fills the checked fields and keeps the filled city", () => {
    const panel = showReviewPanel(document, proposals);
    box(panel, proposals.find((p) => p.key === "gpa")).checked = false;
    press(panel, "Fill selected");
    expect(control("full-name").value).toBe("Maya Torres");
    expect(control<HTMLSelectElement>("state").value).toBe("TX");
    expect(control("gpa_unweighted").value).toBe("");
    expect(control("city").value).toBe("Springfield");
    expect(panel.root.querySelector(".status")?.textContent).toBe(
      "Filled 7 fields. Check the form, then submit it yourself.",
    );
    expect(panel.root.querySelectorAll(".row")).toHaveLength(0);
    press(panel, "Close");
    expect(document.getElementById(PANEL_HOST_ID)).toBeNull();
  });

  it("replaces a filled field only when Replace is ticked", () => {
    const panel = showReviewPanel(document, proposals);
    box(panel, proposals.find((p) => p.key === "city")).checked = true;
    press(panel, "Fill selected");
    expect(control("city").value).toBe("Austin");
    expect(panel.root.querySelector(".status")?.textContent).toBe(
      "Filled 9 fields. Check the form, then submit it yourself.",
    );
  });

  it("says so when nothing matches and offers only Close", () => {
    const panel = showReviewPanel(document, []);
    expect(panel.root.textContent).toContain("No fields on this page match your profile.");
    expect([...panel.root.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Close"]);
    press(panel, "Close");
    expect(document.getElementById(PANEL_HOST_ID)).toBeNull();
  });

  it("replaces an open panel instead of stacking a second one", () => {
    showReviewPanel(document, proposals);
    showReviewPanel(document, proposals);
    expect(document.querySelectorAll(`#${PANEL_HOST_ID}`)).toHaveLength(1);
  });

  it("renders page-provided labels as text, never as HTML", () => {
    const [first] = proposals;
    if (!first) throw new Error("fixture");
    const hostile = { ...first, field: { ...first.field, label: `<img src=x onerror="alert(1)">` } };
    const panel = showReviewPanel(document, [hostile]);
    expect(panel.root.querySelector("img")).toBeNull();
    expect(panel.root.querySelector(".field")?.textContent).toBe(`<img src=x onerror="alert(1)">`);
  });

  it("uses type=button for every panel button", () => {
    const panel = showReviewPanel(document, proposals);
    for (const b of panel.root.querySelectorAll("button")) expect(b.type).toBe("button");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/extension test src/panel.test.ts`
Expected: FAIL with `Failed to resolve import "./panel" from "src/panel.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/extension/src/panel.ts`:

```ts
import { type Proposal, applyProposals } from "./fill";

export const PANEL_HOST_ID = "scholarcrew-review";

export interface PanelHandle {
  host: HTMLElement;
  root: ShadowRoot;
  close(): void;
}

const PANEL_CSS = `
:host { all: initial; }
.panel {
  position: fixed; top: 16px; right: 16px; z-index: 2147483647;
  box-sizing: border-box; width: 360px; max-height: calc(100vh - 32px); overflow: auto;
  padding: 16px; background: #ffffff; color: #1f2933;
  border: 1px solid #d0d7de; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.title { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
.lede, .empty, .status { margin: 0 0 12px; color: #52606d; }
.status { color: #1f2933; }
.rows { list-style: none; margin: 0 0 12px; padding: 0; }
.row { border-top: 1px solid #e4e7eb; padding: 8px 0; }
.row label { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
.row input { margin-top: 3px; }
.text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.field { font-weight: 600; }
.value { white-space: pre-line; overflow-wrap: anywhere; }
.choice, .note { font-size: 12px; color: #52606d; }
.actions { display: flex; gap: 8px; justify-content: flex-end; }
button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid #1f6feb; cursor: pointer; }
.primary { background: #1f6feb; color: #ffffff; }
.secondary { background: #ffffff; color: #1f6feb; }
`;

function el(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeButton(doc: Document, text: string, kind: "primary" | "secondary"): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = kind;
  button.textContent = text;
  return button;
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function closeReviewPanel(doc: Document): void {
  doc.getElementById(PANEL_HOST_ID)?.remove();
}

/**
 * Shows the review panel. Filling happens only when the student presses "Fill selected".
 * The panel never submits a form, never clicks page buttons, and never makes network requests.
 */
export function showReviewPanel(doc: Document, proposals: Proposal[]): PanelHandle {
  closeReviewPanel(doc);
  const host = doc.createElement("div");
  host.id = PANEL_HOST_ID;
  const root = host.attachShadow({ mode: "closed" });
  const close = () => host.remove();

  const style = doc.createElement("style");
  style.textContent = PANEL_CSS;
  const panel = el(doc, "section", "panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "ScholarCrew autofill review");
  panel.append(
    el(doc, "h2", "title", "Review before filling"),
    el(doc, "p", "lede", "Nothing is submitted. Check each value and fill the ones you want."),
  );
  const actions = el(doc, "div", "actions");

  if (proposals.length === 0) {
    panel.append(el(doc, "p", "empty", "No fields on this page match your profile."));
    const closeButton = makeButton(doc, "Close", "secondary");
    closeButton.addEventListener("click", close);
    actions.append(closeButton);
  } else {
    const list = el(doc, "ul", "rows");
    const boxes = new Map<string, HTMLInputElement>();
    for (const proposal of proposals) {
      const box = doc.createElement("input");
      box.type = "checkbox";
      box.checked = !proposal.filled;
      box.dataset.proposalId = proposal.id;
      boxes.set(proposal.id, box);
      const text = el(doc, "span", "text");
      text.append(
        el(doc, "span", "field", proposal.field.label),
        el(doc, "span", "value", proposal.display),
        el(doc, "span", "choice", proposal.filled ? "Replace" : "Fill"),
      );
      if (proposal.filled) text.append(el(doc, "span", "note", `Now: “${shorten(proposal.currentValue, 80)}”`));
      const label = doc.createElement("label");
      label.append(box, text);
      const row = el(doc, "li", "row");
      row.append(label);
      list.append(row);
    }
    const status = el(doc, "p", "status");
    status.setAttribute("role", "status");
    const fillButton = makeButton(doc, "Fill selected", "primary");
    const cancelButton = makeButton(doc, "Cancel", "secondary");
    fillButton.addEventListener("click", () => {
      const selected = new Set<string>();
      for (const [id, box] of boxes) {
        if (box.checked) selected.add(id);
      }
      const count = applyProposals(proposals, selected);
      list.remove();
      fillButton.remove();
      cancelButton.textContent = "Close";
      status.textContent = `Filled ${count} ${count === 1 ? "field" : "fields"}. Check the form, then submit it yourself.`;
    });
    cancelButton.addEventListener("click", close);
    panel.append(list, status);
    actions.append(fillButton, cancelButton);
  }

  panel.append(actions);
  root.append(style, panel);
  (doc.body ?? doc.documentElement).append(host);
  return { host, root, close };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/extension test src/panel.test.ts`
Expected: PASS, 1 file, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/panel.ts apps/extension/src/panel.test.ts
git commit -m "feat(extension): shadow-DOM review panel with fill selected and cancel"
```

### T7: Messages, content script, and the no-submit guarantee

- [ ] **Step 1: Write the failing test**

`apps/extension/src/autofill.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleContentMessage, startAutofill } from "./autofill";
import { PANEL_HOST_ID, type PanelHandle } from "./panel";
import { control, mountForm } from "./test/form";
import { PROFILE } from "./test/profile";

function press(panel: PanelHandle, text: string): void {
  const button = [...panel.root.querySelectorAll("button")].find((b) => b.textContent === text);
  if (!button) throw new Error(`no button ${text}`);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("handleContentMessage", () => {
  beforeEach(() => {
    mountForm();
  });

  it("shows the review panel for a valid show-review message and reports the count", () => {
    expect(handleContentMessage(document, { type: "show-review", profile: PROFILE })).toEqual({
      ok: true,
      proposals: 9,
    });
    expect(document.getElementById(PANEL_HOST_ID)).not.toBeNull();
    expect(control("full-name").value).toBe("");
  });

  it.each([
    [{ type: "fill-everything" }],
    [{ type: "show-review", profile: { ...PROFILE, email: "nope" } }],
    [{ type: "show-review", profile: PROFILE, autoFill: true }],
    [null],
  ])("rejects %j without touching the page", (message) => {
    expect(handleContentMessage(document, message)).toEqual({ ok: false, error: "Unknown request" });
    expect(document.getElementById(PANEL_HOST_ID)).toBeNull();
  });
});

describe("never submits, clicks, or sends page contents", () => {
  const spies = {
    submit: vi.fn(),
    requestSubmit: vi.fn(),
    click: vi.fn(),
    fetch: vi.fn(),
    xhrOpen: vi.fn(),
    beacon: vi.fn(),
  };

  beforeEach(() => {
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(spies.submit);
    vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(spies.requestSubmit);
    vi.spyOn(HTMLElement.prototype, "click").mockImplementation(spies.click);
    vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(spies.xhrOpen);
    vi.stubGlobal("fetch", spies.fetch);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: spies.beacon });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const spy of Object.values(spies)) spy.mockReset();
  });

  it("fills every field, including replacements, with no submit, click, or network call", () => {
    const form = mountForm();
    let submitEvents = 0;
    form.addEventListener("submit", () => {
      submitEvents += 1;
    });
    const { proposals, panel } = startAutofill(document, PROFILE);
    expect(proposals).toBe(9);
    for (const box of panel.root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) box.checked = true;
    press(panel, "Fill selected");
    press(panel, "Close");
    expect(control("city").value).toBe("Austin");
    expect(submitEvents).toBe(0);
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });

  it("has no source line that submits a form or clicks an element", () => {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sources).toContain("content.ts");
    for (const file of sources) {
      const code = readFileSync(join(dir, file), "utf8");
      expect(code, file).not.toMatch(/\.submit\(|requestSubmit|\.click\(|dispatchEvent\(new (Mouse|Submit)Event/);
    }
  });

  it("keeps network and storage access out of everything that runs in the page", () => {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    const pageSide = ["content.ts", "autofill.ts", "fields.ts", "fill.ts", "panel.ts", "messages.ts", "zod-config.ts"];
    for (const file of pageSide) {
      const code = readFileSync(join(dir, file), "utf8");
      expect(code, file).not.toMatch(/\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket|chrome\.storage|\.\/api"/);
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/extension test src/autofill.test.ts`
Expected: FAIL with `Failed to resolve import "./autofill" from "src/autofill.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/extension/src/messages.ts`:

```ts
import { AutofillProfile } from "@scholarcrew/domain";
import { z } from "zod";

export const TITLE_LIMIT = 200;
export const SELECTION_LIMIT = 2000;

/** Popup → background. save-page carries no URL: the background always re-reads it from the tab. */
export const PopupRequest = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("status") }),
  z.strictObject({ type: z.literal("autofill") }),
  z.strictObject({ type: z.literal("save-preview") }),
  z.strictObject({ type: z.literal("save-page"), title: z.string().max(TITLE_LIMIT), includeSelection: z.boolean() }),
]);
export type PopupRequest = z.infer<typeof PopupRequest>;
export type PopupRequestType = PopupRequest["type"];

export interface Failure {
  ok: false;
  error: string;
}
export type StatusResponse = { ok: true; displayName: string; email: string } | Failure;
export type AutofillResponse = { ok: true; proposals: number } | Failure;
export type SavePreviewResponse = { ok: true; url: string; title: string; selectedText: string } | Failure;
export type SavePageResponse = { ok: true; name: string; message: string } | Failure;

export interface ResponseMap {
  status: StatusResponse;
  autofill: AutofillResponse;
  "save-preview": SavePreviewResponse;
  "save-page": SavePageResponse;
}
export type BackgroundResponse = ResponseMap[PopupRequestType];

/** Background → content script. */
export const ContentRequest = z.strictObject({ type: z.literal("show-review"), profile: AutofillProfile });
export type ContentRequest = z.infer<typeof ContentRequest>;

export const ContentResponse = z.union([
  z.strictObject({ ok: z.literal(true), proposals: z.number().int().min(0) }),
  z.strictObject({ ok: z.literal(false), error: z.string() }),
]);
export type ContentResponse = z.infer<typeof ContentResponse>;

export const SAVED_MESSAGE = "Saved. It's on your board as unverified.";
export const NOT_CONNECTED_MESSAGE =
  "Not connected. Create a token in ScholarCrew under Settings → Browser extension, then paste it here.";
export const UNKNOWN_REQUEST = "Unknown request";

export function failure(error: string): Failure {
  return { ok: false, error };
}
```

`apps/extension/src/autofill.ts`:

```ts
import type { AutofillProfile } from "@scholarcrew/domain";
import { detectFields } from "./fields";
import { buildProposals } from "./fill";
import { ContentRequest, type ContentResponse, UNKNOWN_REQUEST } from "./messages";
import { type PanelHandle, showReviewPanel } from "./panel";

export function startAutofill(doc: Document, profile: AutofillProfile): { proposals: number; panel: PanelHandle } {
  const proposals = buildProposals(detectFields(doc), profile);
  const panel = showReviewPanel(doc, proposals);
  return { proposals: proposals.length, panel };
}

export function handleContentMessage(doc: Document, message: unknown): ContentResponse {
  const parsed = ContentRequest.safeParse(message);
  if (!parsed.success) return { ok: false, error: UNKNOWN_REQUEST };
  return { ok: true, proposals: startAutofill(doc, parsed.data.profile).proposals };
}
```

`apps/extension/src/zod-config.ts` (imported first by every entry file, so it runs before any domain schema is built):

```ts
import { z } from "zod";

z.config({ jitless: true });
```

`apps/extension/src/content.ts` (injected by `chrome.scripting.executeScript` only after the student clicks "Autofill this page"):

```ts
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
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/extension test src/autofill.test.ts`
Expected: PASS, 1 file, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/messages.ts apps/extension/src/autofill.ts apps/extension/src/zod-config.ts apps/extension/src/content.ts apps/extension/src/autofill.test.ts
git commit -m "feat(extension): content script review flow that never submits or sends page data"
```

### T8: Background message router

- [ ] **Step 1: Write the failing test**

`apps/extension/src/router.test.ts`:

```ts
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
    expect(await s.route({ type: "status" })).toEqual({ ok: true, displayName: "Maya Torres", email: "maya@example.com" });
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
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/extension test src/router.test.ts`
Expected: FAIL with `Failed to resolve import "./router" from "src/router.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/extension/src/router.ts`:

```ts
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
```

`apps/extension/src/background.ts` (service worker; wiring only):

```ts
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
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/extension test src/router.test.ts && pnpm --filter @scholarcrew/extension typecheck`
Expected: PASS, 1 file, 18 tests; `tsc --noEmit` exits 0 (this is the first typecheck that covers `background.ts` and `content.ts` against `@types/chrome`, including `restrictToTrustedContexts(chrome.storage.local)`; this is where the `setAccessLevel` design note gets confirmed).

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/router.ts apps/extension/src/router.test.ts apps/extension/src/background.ts
git commit -m "feat(extension): background router for status, autofill, and previewed save to Scout"
```

### T9: Popup

The popup is plain HTML with a script that wires `mountPopup`. It writes settings to storage itself and asks the background for everything that needs the network or the tab. "Save to Scout" only asks for a preview; nothing goes to ScholarCrew until the student clicks "Send to Scout". This task also adds the check that every entry file imports `./zod-config` first, because `popup.ts` is the last entry file to exist.

- [ ] **Step 1: Write the failing test**

`apps/extension/src/popup-app.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECONNECT_MESSAGE } from "./api";
import { NOT_CONNECTED_MESSAGE, type PopupRequest, type PopupRequestType, SAVED_MESSAGE } from "./messages";
import { type SendMessage, mountPopup } from "./popup-app";
import { DEFAULT_APP_URL } from "./settings";
import { createMemoryStorage } from "./test/fake-storage";

const POPUP_HTML = readFileSync(fileURLToPath(new URL("../popup.html", import.meta.url)), "utf8");
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
      expect($("action-result").textContent).toBe(
        "Saved. It's on your board as unverified. (Lakeview Rotary Award)",
      ),
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
```

Append this block to the end of `apps/extension/src/autofill.test.ts` (it uses the `readFileSync`, `join`, and `fileURLToPath` imports already at the top of that file):

```ts
describe("zod is configured before any schema is built", () => {
  it('makes import "./zod-config" the first import of every entry file, with no inline z.config', () => {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    expect(readFileSync(join(dir, "zod-config.ts"), "utf8")).toContain("z.config({ jitless: true });");
    for (const file of ["background.ts", "content.ts", "popup.ts"]) {
      const code = readFileSync(join(dir, file), "utf8");
      const firstImport = code.split("\n").find((line) => line.startsWith("import "));
      expect(firstImport, file).toBe('import "./zod-config";');
      expect(code, file).not.toContain("z.config(");
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/extension test src/popup-app.test.ts src/autofill.test.ts`
Expected: FAIL. `popup-app.test.ts` fails with `ENOENT: no such file or directory, open '.../apps/extension/popup.html'`; in `autofill.test.ts` the 8 existing tests pass and the new one fails with `ENOENT: no such file or directory, open '.../apps/extension/src/popup.ts'`.

- [ ] **Step 3: Write the implementation**

`apps/extension/popup.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>ScholarCrew</title>
    <link rel="stylesheet" href="popup.css">
  </head>
  <body>
    <main class="popup">
      <h1>ScholarCrew</h1>
      <p id="status" class="status" role="status">Checking connection…</p>
      <div class="actions">
        <button id="autofill" type="button" disabled>Autofill this page</button>
        <button id="save-page" type="button" disabled>Save to Scout</button>
      </div>
      <p id="action-result" class="result" role="status"></p>
      <section id="preview" class="preview" aria-label="What Save to Scout will send" hidden>
        <p class="preview-label">Page address</p>
        <p id="preview-url" class="preview-text"></p>
        <label for="preview-title">Title</label>
        <input id="preview-title" type="text" maxlength="200" spellcheck="false">
        <p class="preview-label">Selected text</p>
        <p id="preview-selection" class="preview-text"></p>
        <label class="check"><input id="include-selection" type="checkbox"> Include selected text</label>
        <div class="row">
          <button id="send-page" type="button">Send to Scout</button>
          <button id="cancel-save" type="button" class="secondary">Cancel</button>
        </div>
      </section>
      <p class="hint">Autofill shows every value for you to check first. Nothing is ever submitted for you.</p>
      <details id="settings">
        <summary>Connection settings</summary>
        <form id="token-form">
          <label for="token">Extension token (from Settings → Browser extension)</label>
          <input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="sct_…">
          <div class="row">
            <button type="submit">Save token</button>
            <button id="clear-token" type="button" class="secondary">Clear token</button>
          </div>
        </form>
        <form id="url-form">
          <label for="app-url">App address</label>
          <input id="app-url" type="url" spellcheck="false">
          <div class="row">
            <button type="submit">Save address</button>
          </div>
        </form>
        <p id="settings-message" class="settings-message" role="alert"></p>
      </details>
    </main>
    <script src="popup.js"></script>
  </body>
</html>
```

`apps/extension/popup.css`:

```css
body {
  margin: 0;
  width: 320px;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #1f2933;
  background: #ffffff;
}

.popup {
  padding: 16px;
}

h1 {
  margin: 0 0 8px;
  font-size: 18px;
}

.status,
.result,
.hint,
.settings-message {
  margin: 0 0 12px;
}

.hint,
.settings-message {
  font-size: 12px;
  color: #52606d;
}

.actions,
.row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

label {
  display: block;
  margin: 8px 0 4px;
  font-weight: 600;
}

input {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 8px;
  margin-bottom: 8px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  font: inherit;
}

.preview {
  margin-bottom: 12px;
  padding-top: 8px;
  border-top: 1px solid #e4e7eb;
}

.preview-label {
  margin: 8px 0 4px;
  font-weight: 600;
}

.preview-text {
  max-height: 96px;
  margin: 0 0 8px;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-line;
  color: #52606d;
}

label.check {
  display: flex;
  gap: 8px;
  align-items: center;
  font-weight: 400;
}

label.check input {
  width: auto;
  margin: 0;
}

button {
  padding: 6px 12px;
  border: 1px solid #1f6feb;
  border-radius: 8px;
  background: #1f6feb;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}

button.secondary {
  background: #ffffff;
  color: #1f6feb;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}
```

`apps/extension/src/popup-app.ts`:

```ts
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
```

`apps/extension/src/popup.ts` (popup entry; wiring only):

```ts
import "./zod-config";

import { mountPopup } from "./popup-app";
import type { StorageArea } from "./settings";

const storage: StorageArea = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};

mountPopup(document, { storage, send: (message) => chrome.runtime.sendMessage(message) });
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/extension test src/popup-app.test.ts src/autofill.test.ts && pnpm --filter @scholarcrew/extension typecheck`
Expected: PASS, 2 files, 24 tests; `tsc --noEmit` exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/popup.html apps/extension/popup.css apps/extension/src/popup-app.ts apps/extension/src/popup.ts apps/extension/src/popup-app.test.ts apps/extension/src/autofill.test.ts
git commit -m "feat(extension): popup for token, app address, autofill, and previewed save to Scout"
```

### T10: Build script

Config task: no unit test. The proof is a clean build that produces a loadable `dist/`.

- [ ] **Step 1: Write the build script**

`apps/extension/scripts/build.ts`:

```ts
import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const STATIC_FILES = ["manifest.json", "popup.html", "popup.css"];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// IIFE everywhere: the service worker is a classic script, and executeScript injects classic scripts.
await build({
  entryPoints: {
    background: join(root, "src/background.ts"),
    content: join(root, "src/content.ts"),
    popup: join(root, "src/popup.ts"),
  },
  outdir: dist,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  charset: "utf8",
  legalComments: "none",
  logLevel: "info",
});

for (const file of STATIC_FILES) {
  await copyFile(join(root, file), join(dist, file));
}

console.log(
  JSON.stringify({
    level: "info",
    msg: "extension built",
    dist,
    files: ["background.js", "content.js", "popup.js", ...STATIC_FILES],
  }),
);
```

- [ ] **Step 2: Run the build and see the output**

Run: `pnpm --filter @scholarcrew/extension build && ls apps/extension/dist`
Expected: esbuild prints the three bundles, then the `extension built` JSON line; `ls` lists `background.js content.js manifest.json popup.css popup.html popup.js`.

Run: `test -f apps/extension/dist/manifest.json && pnpm --filter @scholarcrew/extension typecheck`
Expected: exits 0 (the typecheck now covers `scripts/build.ts`).

- [ ] **Step 3: Commit**

```bash
git add apps/extension/scripts/build.ts
git commit -m "feat(extension): esbuild bundle of background, content, and popup into dist"
```

## Success Criteria

All commands exit 0 from the repo root:

- [ ] `pnpm --filter @scholarcrew/extension typecheck`
- [ ] `pnpm --filter @scholarcrew/extension test`
- [ ] `pnpm --filter @scholarcrew/extension build && test -f apps/extension/dist/manifest.json`
- [ ] `pnpm lint`
- [ ] `! grep -rnE "\.submit\(|requestSubmit|\.click\(" apps/extension/src --include=*.ts --exclude=*.test.ts` (prints nothing).

## Testing Requirements

- Command: `pnpm --filter @scholarcrew/extension test`
- Expected: 9 test files, 136 tests (manifest 4, settings 28, api 11, fields 30, fill 12, panel 9, autofill 9, router 18, popup-app 15), all passing, no network (every `fetch` is an injected fake, `chrome.*` is never touched by tests).
- What the tests prove:
  - **Manifest** (`manifest.test.ts`): MV3, exactly `storage`, `activeTab`, `scripting`; no `host_permissions`, optional permissions, `content_scripts`, `externally_connectable`, or `web_accessible_resources`.
  - **Settings** (`settings.test.ts`): app URL must be a bare origin (rejects ftp, `javascript:`, paths, queries, credentials); plain `http:` is accepted only for `localhost`, `127.0.0.1`, and `[::1]` and anything else gets "Use https:// for anything but your own computer."; token must start with `sct_`; corrupted stored values fall back to defaults; invalid input never reaches storage; `restrictToTrustedContexts` calls `setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })` and returns `false` instead of throwing when the API is missing or refuses.
  - **API** (`api.test.ts`): bearer header, `credentials: "omit"`, exact URLs under `/api/v1/extension/`; responses validated with `AutofillProfileResponse` and `ScholarshipSummaryResponse`, the non-strict copies of 02's `AutofillProfile` (with `Activity`) and `ScholarshipSummary`, so a field a newer server adds is stripped, at the top level and on an activity, while a wrong known field (an unknown `status`, a bad email) is still `bad_response` (R3A-4); `ErrorBody` mapped to `ApiError` code and message; 401 always becomes "Your token expired. Create a new one in Settings."; network failures name the app URL.
  - **Fields** (`fields.test.ts`): on a realistic form, detection keeps 11 visible, enabled fields and drops hidden, password, file, checkbox, submit, `display: none`, `hidden`-ancestor, disabled, and readonly fields; every descriptor source (label[for], wrapping label, aria-label, aria-labelledby, name, id, placeholder) works; keyword rules map 9 fields and leave the essay and "Parent or guardian email" alone.
  - **Fill** (`fill.test.ts`): proposals carry select option values (by value, text, or state name via the domain's `STATE_NAMES`), skip empty profile values and fields that already match; `fillField` dispatches bubbling `input` then `change`, uses the native setter, and won't overwrite a filled field without `replace`.
  - **Panel** (`panel.test.ts`): closed shadow root; empty fields checked, filled fields on an unchecked "Replace"; Cancel removes the panel with zero value changes and zero events; Fill selected fills only checked rows; page labels render as text.
  - **No-submit guarantee** (`autofill.test.ts`): with spies on `HTMLFormElement.prototype.submit`, `requestSubmit`, `HTMLElement.prototype.click`, `fetch`, `XMLHttpRequest.prototype.open`, and `navigator.sendBeacon`, a full fill (including replacements) calls none of them and fires no `submit` event; a source scan finds no submit or click calls anywhere in `src/` and no network or storage access in page-side files; `background.ts`, `content.ts`, and `popup.ts` each have `import "./zod-config";` as their first import and no inline `z.config`.
  - **Router** (`router.test.ts`): no token means no API call; autofill fetches, then injects, then sends `show-review`; non-web tabs and over-long URLs never reach the API; `save-preview` returns the URL with its `#fragment` removed, the title, and the trimmed selection without calling the API; `save-page` rejects the old `{ type }`-only shape and any popup-supplied URL, strips the fragment, uses the student's title (hostname when blank), caps the selection at 2000 characters, sends `selectedText: ""` without reading the selection when `includeSelection` is false, and returns the summary name with "Saved. It's on your board as unverified."; only the extension's own pages (no `sender.tab`) are trusted.
  - **Popup** (`popup-app.test.ts`, against the real `popup.html`): not-connected state, connected state that never echoes the token, token and app-address validation, clear token, autofill results, a silent background; "Save to Scout" renders the preview (URL, editable title, selection, "Include selected text" checked only when there is a selection) and sends nothing to ScholarCrew until "Send to Scout", which sends `{ type: "save-page", title, includeSelection }`; Cancel sends nothing.
- Manual smoke check (after the gate, with plans 13, 14, and 16 running locally): `pnpm dev`, create a token in Settings → Browser extension, load `apps/extension/dist` with chrome://extensions → Load unpacked, paste the token, open any page with a form, click "Autofill this page", review, click "Fill selected", confirm nothing submitted; then select text on a scholarship page, click "Save to Scout", check that the preview shows the address without any `#fragment`, the title, and the selection, and click "Send to Scout".

## Review Checklist

- [ ] `manifest.json` has exactly three permissions and nothing that grants host access or always-on scripts.
- [ ] No file under `apps/extension/src` (outside tests) calls `submit()`, `requestSubmit()`, or `click()`, or dispatches a synthetic mouse or submit event.
- [ ] Page-side files (`content.ts`, `autofill.ts`, `fields.ts`, `fill.ts`, `panel.ts`, `messages.ts`, `zod-config.ts`) make no network or storage calls; only `router.ts` (background) uses the API client.
- [ ] Domain types and tables (`AutofillProfile`, `SavePageInput`, `ScholarshipSummary`, `Activity`, `ErrorBody`, `ErrorCode`, `USState`, `STATE_NAMES`) are imported from `@scholarcrew/domain`, never redefined; `fill.ts` has no local state-name table (D41). The two response schemas in `api.ts` are built from the domain `.shape`s, not copied (R3A-4).
- [ ] Already-filled fields need an explicit "Replace" tick, and `fillField` enforces it independently of the panel.
- [ ] The panel uses a closed shadow root, sets text with `textContent` only, and its buttons are `type="button"` outside any page form.
- [ ] The background ignores messages with `sender.tab` set or a foreign `sender.id`; the content script ignores messages from other extensions.
- [ ] The token is never logged, rendered, or sent anywhere except the `Authorization` header to the configured app origin, with `credentials: "omit"`; the app origin is `https:` unless it is `localhost`, `127.0.0.1`, or `[::1]`.
- [ ] `background.ts` calls `restrictToTrustedContexts(chrome.storage.local)` at start, and the executor has confirmed (or recorded in the design notes as a risk) that `@types/chrome` 0.0.326 and Chrome 120 support `setAccessLevel` on `local`.
- [ ] Save to Scout first shows a preview (URL with `u.hash = ""`, title, selection, "Include selected text" checked only when non-empty) and posts nothing until "Send to Scout"; it sends only `url`, `title`, and `selectedText` (≤2000 chars, `""` when not included), the router re-reads the tab instead of trusting a URL from the popup, and the success text is exactly "Saved. It's on your board as unverified." plus the returned name.
- [ ] `src/zod-config.ts` is the only file that calls `z.config({ jitless: true })`, and `import "./zod-config";` is the first import of `background.ts`, `content.ts`, and `popup.ts`; all bundles are IIFE.
