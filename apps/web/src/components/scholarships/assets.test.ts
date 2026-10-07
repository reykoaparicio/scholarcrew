import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const AREAS = ["scholarships", "essays", "colleges", "money", "prep", "impact"];
const DIRS = AREAS.flatMap((a) => [`app/(app)/${a}`, `components/${a}`]);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = DIRS.flatMap((d) => walk(join(SRC, d))).filter(
  (f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
);

describe("SE-05 asset rules for the pipeline screens", () => {
  it("loads no third-party scripts, fonts, analytics, or remote assets", () => {
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/next\/script|next\/font|<script|@import|@font-face|url\(/);
      expect(text, file).not.toMatch(/gtag|googletagmanager|analytics|segment\.io|posthog|mixpanel|hotjar/i);
      if (file.endsWith(".css")) expect(text, file).not.toMatch(/https?:\/\//);
    }
  });
});
