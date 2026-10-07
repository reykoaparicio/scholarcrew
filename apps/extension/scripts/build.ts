import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const STATIC_FILES = ["manifest.json", "popup.html", "popup.css"];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// IIFE everywhere: the service worker is a classic script, and executeScript injects classic scripts.
await build({
  entryPoints: {
    background: join(root, "src/background.ts"),
    content: join(root, "src/content.ts"),
    popup: join(root, "src/popup.ts"),
  },
  outdir: dist,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  charset: "utf8",
  legalComments: "none",
  logLevel: "info",
});

for (const file of STATIC_FILES) {
  await copyFile(join(root, file), join(dist, file));
}

console.log(
  JSON.stringify({
    level: "info",
    msg: "extension built",
    dist,
    files: ["background.js", "content.js", "popup.js", ...STATIC_FILES],
  }),
);
