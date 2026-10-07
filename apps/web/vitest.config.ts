import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));
const testDir = fileURLToPath(new URL("./test", import.meta.url));

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": src, "@test": testDir } },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
