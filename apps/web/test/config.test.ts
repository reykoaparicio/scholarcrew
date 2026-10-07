import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../next.config";

type Manifest = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as Manifest;
const allDeps = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });

// SE-05: no third-party analytics, ad, or session-replay SDKs.
const TRACKER =
  /analytics|gtag|tag-?manager|segment|mixpanel|amplitude|posthog|hotjar|fullstory|logrocket|clarity|pixel|rum/i;

describe("next.config", () => {
  it("transpiles every workspace package the app depends on", () => {
    const workspace = Object.keys(manifest.dependencies ?? {}).filter((n) => n.startsWith("@scholarcrew/"));
    expect(workspace).toHaveLength(8);
    for (const name of workspace) expect(config.transpilePackages).toContain(name);
  });

  it("keeps the database and queue drivers out of the bundle, as direct dependencies", () => {
    expect(config.serverExternalPackages).toEqual(expect.arrayContaining(["pg-boss", "postgres"]));
    // pnpm only resolves an external require() from apps/web for packages apps/web depends on.
    for (const name of config.serverExternalPackages ?? [])
      expect(Object.keys(manifest.dependencies ?? {})).toContain(name);
    expect(config.poweredByHeader).toBe(false);
  });

  it("loads the root .env only if it exists: next.config under next dev, --env-file-if-exists for next start (D12, D17)", () => {
    expect(manifest.scripts?.start).toBe(
      "node --env-file-if-exists=../../.env node_modules/next/dist/bin/next start -p 3000",
    );
    expect(Object.values(manifest.scripts ?? {}).join("\n")).not.toContain("--env-file=");
    const source = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
    expect(source).toContain('process.env.NODE_ENV === "development"');
    expect(source).toContain("existsSync(rootEnv)");
  });

  it("enables HSTS only in production", async () => {
    const previous = process.env.NODE_ENV;
    try {
      for (const mode of ["test", "production"]) {
        (process.env as Record<string, string | undefined>).NODE_ENV = mode;
        const rules = await config.headers?.();
        const headers = rules?.[0]?.headers ?? [];
        expect(headers.some((h) => h.key === "Strict-Transport-Security")).toBe(mode === "production");
      }
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previous;
    }
  });

  it("sends security headers on every path", async () => {
    const rules = (await config.headers?.()) ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0]?.source).toBe("/:path*");
    const headers = Object.fromEntries((rules[0]?.headers ?? []).map((h) => [h.key, h.value]));
    expect(headers).toEqual({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    });
  });
});

describe("dependencies", () => {
  it("include no tracker SDKs", () => {
    expect(allDeps.filter((name) => TRACKER.test(name))).toEqual([]);
  });
});
