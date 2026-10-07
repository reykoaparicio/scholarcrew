import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

// D17: dev only. pnpm runs next from apps/web, so the monorepo .env is two levels up. Values already set win.
const rootEnv = resolve(process.cwd(), "../../.env");
if (process.env.NODE_ENV === "development" && !process.env.VITEST && existsSync(rootEnv)) {
  const parsed = parseEnv(readFileSync(rootEnv, "utf8")) as Record<string, string | undefined>;
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  transpilePackages: [
    "@scholarcrew/ui",
    "@scholarcrew/domain",
    "@scholarcrew/core",
    "@scholarcrew/engines",
    "@scholarcrew/jobs",
    "@scholarcrew/db",
    "@scholarcrew/catalog",
    "@scholarcrew/agents",
  ],
  serverExternalPackages: ["pg-boss", "postgres"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Helper links and invite links carry tokens in the URL; never send them to other sites.
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default config;
