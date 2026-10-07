import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_TEST_DATABASE_URL, parseEnvFile, resolveTestDatabaseUrl, testDatabaseUrl } from "./env";

const saved = process.env.TEST_DATABASE_URL;

afterEach(() => {
  if (saved === undefined) Reflect.deleteProperty(process.env, "TEST_DATABASE_URL");
  else process.env.TEST_DATABASE_URL = saved;
});

describe("parseEnvFile", () => {
  it("reads KEY=VALUE lines and skips comments and blank lines", () => {
    const text = [
      "# local settings",
      "",
      "DATABASE_URL=postgres://a@localhost/x",
      "  APP_URL = http://localhost:3000  ",
    ].join("\n");
    expect(parseEnvFile(text)).toEqual({
      DATABASE_URL: "postgres://a@localhost/x",
      APP_URL: "http://localhost:3000",
    });
  });

  it("strips matching quotes and keeps = inside values", () => {
    const text = ['EMAIL_FROM="ScholarCrew <crew@scholarcrew.example>"', "TOKEN=a=b=c", "NAME='Maple'", "BROKEN"].join(
      "\r\n",
    );
    expect(parseEnvFile(text)).toEqual({
      EMAIL_FROM: "ScholarCrew <crew@scholarcrew.example>",
      TOKEN: "a=b=c",
      NAME: "Maple",
    });
  });
});

describe("resolveTestDatabaseUrl", () => {
  it("prefers TEST_DATABASE_URL from the environment", () => {
    const fileText = "TEST_DATABASE_URL=postgres://file/db";
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: "postgres://env/db" }, fileText)).toBe("postgres://env/db");
  });

  it("falls back to the repo-root .env file", () => {
    expect(resolveTestDatabaseUrl({}, "DATABASE_URL=x\nTEST_DATABASE_URL=postgres://file/db\n")).toBe(
      "postgres://file/db",
    );
  });

  it("falls back to the local docker default", () => {
    expect(resolveTestDatabaseUrl({}, null)).toBe(DEFAULT_TEST_DATABASE_URL);
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: "" }, "OTHER=1")).toBe(DEFAULT_TEST_DATABASE_URL);
    expect(DEFAULT_TEST_DATABASE_URL).toBe("postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew_test");
  });
});

describe("testDatabaseUrl", () => {
  it("returns TEST_DATABASE_URL from the process when it's set", () => {
    process.env.TEST_DATABASE_URL = "postgres://u:p@db:5432/from_process";
    expect(testDatabaseUrl()).toBe("postgres://u:p@db:5432/from_process");
  });
});
