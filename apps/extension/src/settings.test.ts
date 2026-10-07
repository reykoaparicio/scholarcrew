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
