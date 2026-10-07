import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout, { metadata } from "../../app/layout";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const OWNED_DIRS = [
  "app/(app)",
  "components/shell",
  "components/week",
  "components/crew",
  "components/onboarding",
  "components/settings",
  "components/memory",
  "components/family",
  "lib",
];
const OWNED_FILES = ["app/layout.tsx", "app/globals.css", "app/not-found.tsx"];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = [
  ...OWNED_FILES.map((f) => join(SRC, f)),
  ...OWNED_DIRS.flatMap((d) => walk(join(SRC, d))).filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx")),
];

describe("root layout", () => {
  it("renders an English document titled ScholarCrew with no scripts", async () => {
    expect(metadata.title).toBe("ScholarCrew");
    const html = renderToStaticMarkup(await RootLayout({ children: createElement("p", null, "hello") }));
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<p>hello</p>");
    expect(html).not.toMatch(/<script|<link/i);
  });
});

describe("SE-05 asset rules", () => {
  it("finds the owned files", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it("loads no third-party scripts, fonts, analytics, or remote assets", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/next\/script|next\/font|<script|@import|@font-face|url\(/);
      expect(text, file).not.toMatch(/gtag|googletagmanager|analytics|segment\.io|posthog|mixpanel|hotjar/i);
    }
  });

  it("keeps remote URLs out of layouts and styles", () => {
    for (const file of files.filter((f) => f.endsWith(".css") || f.endsWith("layout.tsx"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/https?:\/\//);
    }
  });
});
