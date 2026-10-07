import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkEnv } from "./check-env";
import { ENV_KEYS } from "./env-keys";

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function parseDotenv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    const name = match?.[1];
    const value = match?.[2];
    if (name !== undefined && value !== undefined) {
      values[name] = value.replace(/^"(.*)"$/, "$1");
    }
  }
  return values;
}

describe(".env.example", () => {
  const example = parseDotenv(readRepoFile(".env.example"));

  it("lists exactly the section 4 keys, in order", () => {
    expect(Object.keys(example)).toEqual([...ENV_KEYS]);
  });

  it("passes the env check once the placeholder key is replaced", () => {
    expect(checkEnv(example).ok).toBe(false);
    const fixed = { ...example, ENCRYPTION_KEY: "ab".repeat(32) };
    expect(checkEnv(fixed)).toEqual({ ok: true, missing: [], problems: [] });
  });
});

describe("turbo.json", () => {
  it("passes every env key and CI through to tasks", () => {
    const turbo = JSON.parse(readRepoFile("turbo.json")) as { globalPassThroughEnv: string[] };
    expect(turbo.globalPassThroughEnv).toEqual(expect.arrayContaining([...ENV_KEYS, "CI"]));
  });
});

describe("CI workflow", () => {
  it("sets every env key in both jobs, with the fake model on", () => {
    const ci = readRepoFile(".github/workflows/ci.yml");
    for (const name of ENV_KEYS) {
      expect(ci.match(new RegExp(`^ +${name}: `, "gm")), name).toHaveLength(2);
    }
    expect(ci.match(/^ +SCHOLARCREW_FAKE_MODEL: "1"$/gm)).toHaveLength(2);
  });
});
