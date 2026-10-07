import { describe, expect, it } from "vitest";
import { checkEnv } from "./check-env";

const KEY_FORMAT = "ENCRYPTION_KEY must be 64 hex characters (32 bytes)";
const APP_URL_FORMAT = "APP_URL must be an http or https URL like http://localhost:3000";
const APP_URL_ORIGIN = "APP_URL must be an origin with no path or trailing slash";
const SAME_DATABASE = "TEST_DATABASE_URL must differ from DATABASE_URL (tests truncate every table)";
const FAKE_MODEL_VALUE = "SCHOLARCREW_FAKE_MODEL must be 0 or 1";

const valid: Record<string, string | undefined> = {
  DATABASE_URL: "postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew",
  TEST_DATABASE_URL: "postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew_test",
  APP_URL: "http://localhost:3000",
  ENCRYPTION_KEY: "0123456789abcdef".repeat(4),
  SCHOLARCREW_FAKE_MODEL: "1",
};

describe("checkEnv", () => {
  it("accepts a complete local setup", () => {
    expect(checkEnv(valid)).toEqual({ ok: true, missing: [], problems: [] });
  });

  it("lists every missing required key, in order", () => {
    const result = checkEnv({});
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["DATABASE_URL", "TEST_DATABASE_URL", "APP_URL", "ENCRYPTION_KEY"]);
    expect(result.problems).toEqual([]);
  });

  it("treats blank and undefined values as missing", () => {
    const result = checkEnv({ ...valid, DATABASE_URL: "   ", TEST_DATABASE_URL: undefined, APP_URL: "" });
    expect(result.missing).toEqual(["DATABASE_URL", "TEST_DATABASE_URL", "APP_URL"]);
    expect(result.problems).toEqual([]);
  });

  it("requires ENCRYPTION_KEY to be exactly 64 hex characters", () => {
    for (const bad of ["abc", "g".repeat(64), "a".repeat(63), "a".repeat(65)]) {
      expect(checkEnv({ ...valid, ENCRYPTION_KEY: bad }).problems).toEqual([KEY_FORMAT]);
    }
    expect(checkEnv({ ...valid, ENCRYPTION_KEY: "ABCDEF0123456789".repeat(4) }).ok).toBe(true);
    expect(checkEnv({ ...valid, ENCRYPTION_KEY: undefined, ENCRYPTION_KEYS: `2:${valid.ENCRYPTION_KEY}` }).ok).toBe(
      true,
    );
    expect(checkEnv({ ...valid, ENCRYPTION_KEYS: `2:${"0".repeat(64)}` }).ok).toBe(false);
    expect(checkEnv({ ...valid, ENCRYPTION_KEYS: `2:${valid.ENCRYPTION_KEY},2:${valid.ENCRYPTION_KEY}` }).ok).toBe(
      false,
    );
  });

  it("rejects the .env.example placeholder key without echoing it", () => {
    const placeholder = "0".repeat(64);
    const result = checkEnv({ ...valid, ENCRYPTION_KEY: placeholder });
    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("openssl rand -hex 32");
    expect(result.problems.join(" ")).not.toContain(placeholder);
  });

  it("requires APP_URL to be a bare http(s) origin", () => {
    const problemsFor = (appUrl: string) => checkEnv({ ...valid, APP_URL: appUrl }).problems;
    expect(problemsFor("not a url")).toEqual([APP_URL_FORMAT]);
    expect(problemsFor("localhost:3000")).toEqual([APP_URL_FORMAT]);
    expect(problemsFor("ftp://localhost:3000")).toEqual([APP_URL_FORMAT]);
    expect(problemsFor("http://localhost:3000/")).toEqual([APP_URL_ORIGIN]);
    expect(problemsFor("https://scholarcrew.example/app")).toEqual([APP_URL_ORIGIN]);
    expect(problemsFor("https://scholarcrew.example")).toEqual([]);
  });

  it("requires ANTHROPIC_API_KEY only when the fake model is off", () => {
    expect(checkEnv({ ...valid, SCHOLARCREW_FAKE_MODEL: "0" }).missing).toEqual(["ANTHROPIC_API_KEY"]);
    expect(checkEnv({ ...valid, SCHOLARCREW_FAKE_MODEL: "0", ANTHROPIC_API_KEY: "sk-ant-test" }).ok).toBe(true);
    expect(checkEnv({ ...valid, SCHOLARCREW_FAKE_MODEL: "1", ANTHROPIC_API_KEY: "" }).ok).toBe(true);
    expect(checkEnv({ ...valid, SCHOLARCREW_FAKE_MODEL: undefined }).ok).toBe(true);
  });

  it("rejects SCHOLARCREW_FAKE_MODEL values other than 0 or 1", () => {
    const result = checkEnv({ ...valid, SCHOLARCREW_FAKE_MODEL: "true" });
    expect(result.problems).toEqual([FAKE_MODEL_VALUE]);
  });

  it("refuses a test database URL equal to the dev database URL", () => {
    const result = checkEnv({ ...valid, TEST_DATABASE_URL: valid.DATABASE_URL });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([SAME_DATABASE]);
  });

  it("reports missing keys and bad values together", () => {
    const result = checkEnv({ APP_URL: "nope", ENCRYPTION_KEY: "123" });
    expect(result.missing).toEqual(["DATABASE_URL", "TEST_DATABASE_URL"]);
    expect(result.problems).toEqual([KEY_FORMAT, APP_URL_FORMAT]);
  });

  it("requires TEST_DATABASE_URL only outside production", () => {
    expect(checkEnv({ ...valid, TEST_DATABASE_URL: undefined, NODE_ENV: "production" })).toEqual({
      ok: true,
      missing: [],
      problems: [],
    });
    expect(checkEnv({ ...valid, TEST_DATABASE_URL: undefined, NODE_ENV: "development" }).missing).toEqual([
      "TEST_DATABASE_URL",
    ]);
  });
});
