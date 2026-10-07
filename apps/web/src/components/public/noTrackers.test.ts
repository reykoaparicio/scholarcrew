import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const OWNED_DIRS = [
  "app/(public)",
  "app/(admin)",
  "app/h",
  "app/verify-hours",
  "app/sign-in",
  "app/family/join",
  "components/public",
  "components/admin",
  "components/auth",
];
const OWNED_FILES = ["app/robots.ts", "app/sitemap.ts"];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = [
  ...OWNED_FILES.map((f) => join(SRC, f)).filter((f) => existsSync(f)),
  ...OWNED_DIRS.flatMap((d) => walk(join(SRC, d))).filter((f) => !/\.test\.tsx?$/.test(f)),
];

describe("SE-05: public and admin pages load nothing from third parties", () => {
  it("finds the owned files", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it("has no third-party scripts, fonts, trackers, or CSS imports", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/next\/script|next\/font|<script|@import|@font-face|\burl\(/);
      expect(text, file).not.toMatch(
        /googletagmanager|gtag\(|segment\.io|posthog|mixpanel|hotjar|fullstory|plausible/i,
      );
    }
  });

  it("keeps remote URLs out of styles and layouts", () => {
    for (const file of files.filter((f) => f.endsWith(".css") || f.endsWith("layout.tsx"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/https?:\/\//);
    }
  });
});
