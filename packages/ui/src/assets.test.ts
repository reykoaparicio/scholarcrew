import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { URL as NodeURL, fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new NodeURL(".", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.test\.tsx?$/.test(entry.name) ? [] : [path];
  });
}

describe("SE-05: no third-party assets in the UI kit", () => {
  const files = sourceFiles(SRC);

  it("scans every source file", () => {
    expect(files.some((file) => file.endsWith("tokens.css"))).toBe(true);
    expect(files.length).toBeGreaterThan(50);
  });

  it("never references remote URLs, font files, CSS imports, scripts, or images", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/https?:\/\//);
      expect(text, file).not.toMatch(/@import|@font-face|url\(/);
      expect(text, file).not.toMatch(/<script|<img|<link/i);
    }
  });

  it("uses the system font stack", () => {
    const tokens = readFileSync(join(SRC, "tokens.css"), "utf8");
    expect(tokens).toMatch(/font: 14px\s*\/\s*1\.45 system-ui, -apple-system, "Segoe UI", sans-serif;/);
  });
});
