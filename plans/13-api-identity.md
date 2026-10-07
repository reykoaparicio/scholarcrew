# Plan 13: API identity and web server core (Agent M)

This plan creates the `apps/web` package (manifest, TypeScript, Next.js and Vitest config, test wiring), the server helpers every route and page uses (`getDeps`, `route`, `json`, `body`, `query`, `errorResponse`, session cookies, page actors), the edge middleware that bounces signed-out visitors to `/sign-in`, and every `/api/v1` route that section 10 of `00-overview.md` assigns to owner 13. Routes are thin: parse input with the domain schema, call one `@scholarcrew/core` service with the request's `Actor`, and return its result. Feature IDs: ID-01 and ID-02 (magic-link routes, session cookie, sign out, 401 on dead sessions, page redirect), ID-04 (route auth modes, admin gate), ID-05/ME-09 (delete account route clears the cookie; the next request is 401), ID-06 (Origin check on every cookie-authenticated mutation), SE-04 (upload, invite, sponsor-code and export limits; sign-in limits run in core), SE-05 (no tracker dependencies, security headers), ME-08 (export request and download), HL-01 and HL-04 (helper link create and revoke), BI-02..BI-05 (checkout, portal, webhook, sponsor codes), EX-01/EX-02 (extension token routes and bearer auth for plan 14).

Rules this plan follows on top of `00-overview.md`:

- `process.env` is read in `src/server/deps.ts` and edge middleware (CSP development mode) (and, under `next dev` only, `next.config.ts` loads the repo-root `.env` file into it, see M2; D17). `next start` gets the same file through `node --env-file-if-exists=../../.env` (D12). Everything else gets config from `deps.config`.
- Request bodies are read through a byte cap, never with an unbounded `req.text()`/`req.formData()`: JSON 256 KB (`JSON_BODY_LIMIT`), 64 KB on `auth: "none"` routes (`PUBLIC_BODY_LIMIT`), uploads 10 MB plus 64 KB multipart overhead. A declared `Content-Length` over the cap is refused before reading; without one, the stream is cancelled as soon as it passes the cap. Both answer 413 with code `invalid_input` (`PayloadTooLargeError`).
- Route files export only HTTP method handlers plus `runtime = "nodejs"` and `dynamic = "force-dynamic"`. Helpers live in `src/server/**`.
- Route handlers read the session cookie from `req.headers.get("cookie")`, never `next/headers`, so route tests run under plain Vitest by calling `GET`/`POST` with a `Request` and `{ params: Promise.resolve(...) }` (00-overview section 14).
- Route order inside `route()`: CSRF origin check, then auth, then rate limit, then the handler. Errors from any step go through `errorResponse`.
- Creates return 201 (`json(x, 201)`), job starts return 202 (`json(job, 202)`), `undefined` returns 204, and everything else returns 200 (R3A-6). Every JSON response has `Cache-Control: no-store`. A 429 carries `Retry-After` in seconds (R3A-11).
- Tests use `createTestDeps()` from `@scholarcrew/core/shared` through `useTestDeps()` (fixed clock `2026-10-06T15:00:00.000Z`, memory jobs, dev-outbox email, fake Stripe), and `factories` from `@scholarcrew/db/testing`. The database is truncated before every test.
- Additions to the section 9.7 contract (no contract name changes): `RouteCtx.scopes` (API token scopes, `[]` unless auth is `bearer`), `requireScope(ctx, scope)`, `fileResponse(bytes, contentType, filename)`, route option `cors: "extension"` plus `extensionPreflight(req)` (plan 20 needs CORS on plan 14's bearer routes), an optional third `maxBytes` parameter on `body()` (default `JSON_BODY_LIMIT`), `readBytesCapped(req, maxBytes, message?)`, `readTextCapped(req, maxBytes, message?)`, `PayloadTooLargeError`, `JSON_BODY_LIMIT`, `PUBLIC_BODY_LIMIT`, `studentIdParam(ctx)` (the optional `?studentId=` on plan 14's read routes, D23), `clientIp(req)`, `setDepsForTests`, `resetDepsForTests`, `buildDeps`, `createLazyJobsClient`, `devRoutesEnabled`, `stripeSecretKey` in `deps.ts`, and `parseCookie` in `cookies.ts`. Test helpers add `chunkedRequest` and `exhaustAllowance`.

## Files

Create:

- `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/next-env.d.ts`, `apps/web/vitest.config.ts`
- `apps/web/test/global-setup.ts`, `apps/web/test/setup.ts`, `apps/web/test/helpers.ts`
- `apps/web/src/server/deps.ts`, `apps/web/src/server/http.ts`, `apps/web/src/server/cookies.ts`, `apps/web/src/server/session.ts`, `apps/web/src/server/protected.ts`
- `apps/web/src/middleware.ts`
- `apps/web/src/server/csp.ts`
- Routes, all under `apps/web/src/app/api/v1/`:
  - `auth/magic-link/route.ts`, `auth/verify/route.ts`, `auth/sign-out/route.ts`, `auth/sign-out-all/route.ts`
  - `me/route.ts`, `profile/route.ts`, `onboarding/route.ts`
  - `facts/route.ts`, `facts/[id]/route.ts`, `facts/[id]/confirm/route.ts`, `facts/[id]/reject/route.ts`
  - `decisions/route.ts`, `decisions/[id]/route.ts`
  - `sensitive-facts/route.ts`, `sensitive-facts/share-income/route.ts`
  - `family/route.ts`, `family/invites/route.ts`, `family/invites/[id]/route.ts`, `family/invites/accept/route.ts`, `family/invites/preview/route.ts`, `family/members/[userId]/route.ts`, `family/leave/route.ts`, `family/share-settings/route.ts`, `family/budget/route.ts`, `family/tasks/route.ts`, `family/tasks/[id]/route.ts`
  - `helper-links/route.ts`, `helper-links/[id]/route.ts`
  - `notifications/route.ts`, `notifications/[id]/read/route.ts`, `notification-prefs/route.ts`
  - `billing/route.ts`, `billing/checkout/route.ts`, `billing/portal/route.ts`, `billing/webhook/route.ts`, `billing/sponsor-code/route.ts`
  - `documents/route.ts`, `documents/[id]/route.ts`, `documents/[id]/download/route.ts`
  - `account/route.ts`, `account/export/route.ts`, `account/exports/[id]/route.ts`, `account/exports/latest/route.ts`
  - `extension/tokens/route.ts`, `extension/tokens/[id]/route.ts`
  - `dev/outbox/latest/route.ts`

Modify:

- `apps/web/test/setup.ts` (M3, whole file: adds `resetDepsForTests` and env/global unstubbing)

Test:

- `apps/web/test/config.test.ts`, `apps/web/test/middleware.test.ts`
- `apps/web/src/server/deps.test.ts`, `apps/web/src/server/http.test.ts`, `apps/web/src/server/session.test.ts`
- `apps/web/src/app/api/v1/auth/auth.test.ts`, `profile/profile.test.ts`, `facts/memory.test.ts`, `family/family.test.ts`, `helper-links/helper-links.test.ts`, `billing/billing.test.ts`, `documents/documents.test.ts`, `account/account.test.ts`

Not created here (owned by plan 16/18): layouts, pages, `src/lib/**`, components. This plan's gate is tests and typecheck, not `next build`.

## Tasks
### M1: Package scaffold and test wiring

Config-only task.

- [ ] **Step 1: Create the package files**

`apps/web/package.json`:

```json
{
  "name": "@scholarcrew/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "node --env-file-if-exists=../../.env node_modules/next/dist/bin/next start -p 3000",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scholarcrew/agents": "workspace:*",
    "@scholarcrew/catalog": "workspace:*",
    "@scholarcrew/core": "workspace:*",
    "@scholarcrew/db": "workspace:*",
    "@scholarcrew/domain": "workspace:*",
    "@scholarcrew/engines": "workspace:*",
    "@scholarcrew/jobs": "workspace:*",
    "@scholarcrew/ui": "workspace:*",
    "next": "^15.5.0",
    "pg-boss": "^10.1.0",
    "postgres": "^3.4.7",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.0",
    "@testing-library/react": "^16.3.0",
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "jsdom": "^26.1.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

`pg-boss` and `postgres` are listed at the versions plans 05 and 03 pin because `next.config.ts` marks them `serverExternalPackages`: Next emits a plain `require("pg-boss")` from `apps/web/.next/server`, which pnpm's strict layout only resolves when `apps/web` depends on the package itself. `start` loads the repo-root `.env` with `--env-file-if-exists` (D12), so `next start` works with or without the file; `dev` gets the same file from `next.config.ts` (M2).

`apps/web/tsconfig.json` (the `next` plugin, `@/*` for app code, `@test/*` for the shared test helpers; Next's suggested options are set up front so `next dev` doesn't rewrite the file):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "allowJs": false,
    "esModuleInterop": true,
    "noEmit": true,
    "incremental": true,
    "tsBuildInfoFile": ".next/cache/tsconfig.tsbuildinfo",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@test/*": ["./test/*"]
    }
  },
  "include": ["next-env.d.ts", "next.config.ts", "vitest.config.ts", "src", "test", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next-env.d.ts` (Next regenerates this file; it's committed so `tsc` works before the first `next dev`):

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

`apps/web/vitest.config.ts` (node by default; a component test opts in with a `// @vitest-environment jsdom` first line):

```ts
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
```

`apps/web/test/global-setup.ts`:

```ts
import { setupTestDatabase } from "@scholarcrew/db/testing";

export default setupTestDatabase;
```

`apps/web/test/setup.ts` (M3 replaces it once `src/server/deps.ts` exists):

```ts
import { getTestDb, resetDb } from "@scholarcrew/db/testing";
import { beforeEach } from "vitest";

beforeEach(async () => {
  await resetDb(getTestDb());
});
```

- [ ] **Step 2: Link the package**

Run: `pnpm install`
Expected: the workspace links `@scholarcrew/web` to the eight `@scholarcrew/*` packages and installs `next` 15.5.x, `pg-boss` 10.x, `postgres` 3.4.x, `react` 19.1.x, `jsdom`, and the testing libraries; `Done`. Don't commit `pnpm-lock.yaml` (the integrator owns it).

- [ ] **Step 3: Typecheck the scaffold**

Run: `pnpm --filter @scholarcrew/web typecheck`
Expected: `tsc --noEmit` prints nothing and exits 0 (inputs are `next-env.d.ts`, `vitest.config.ts`, and `test/*.ts`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/next-env.d.ts apps/web/vitest.config.ts apps/web/test/global-setup.ts apps/web/test/setup.ts
git commit -m "feat(web): package scaffold, tsconfig, vitest wiring"
```

### M2: Next.js config, security headers, no trackers

- [ ] **Step 1: Write the failing test**

`apps/web/test/config.test.ts`:

```ts
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
const TRACKER = /analytics|gtag|tag-?manager|segment|mixpanel|amplitude|posthog|hotjar|fullstory|logrocket|clarity|pixel|rum/i;

describe("next.config", () => {
  it("transpiles every workspace package the app depends on", () => {
    const workspace = Object.keys(manifest.dependencies ?? {}).filter((n) => n.startsWith("@scholarcrew/"));
    expect(workspace).toHaveLength(8);
    for (const name of workspace) expect(config.transpilePackages).toContain(name);
  });

  it("keeps the database and queue drivers out of the bundle, as direct dependencies", () => {
    expect(config.serverExternalPackages).toEqual(expect.arrayContaining(["pg-boss", "postgres"]));
    // pnpm only resolves an external require() from apps/web for packages apps/web depends on.
    for (const name of config.serverExternalPackages ?? []) expect(Object.keys(manifest.dependencies ?? {})).toContain(name);
    expect(config.poweredByHeader).toBe(false);
  });

  it("loads the root .env only if it exists: next.config under next dev, --env-file-if-exists for next start (D12, D17)", () => {
    expect(manifest.scripts?.start).toBe("node --env-file-if-exists=../../.env node_modules/next/dist/bin/next start -p 3000");
    expect(Object.values(manifest.scripts ?? {}).join("\n")).not.toContain("--env-file=");
    const source = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
    expect(source).toContain('process.env.NODE_ENV === "development"');
    expect(source).toContain("existsSync(rootEnv)");
  });

  it("enables HSTS only in production", async () => {
    const previous = process.env.NODE_ENV;
    try {
      for (const mode of ["test", "production"]) {
        process.env.NODE_ENV = mode;
        const rules = await config.headers?.();
        const headers = rules?.[0]?.headers ?? [];
        expect(headers.some((h) => h.key === "Strict-Transport-Security")).toBe(mode === "production");
      }
    } finally { process.env.NODE_ENV = previous; }
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
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test`
Expected: FAIL `test/config.test.ts` with `Failed to resolve import "../next.config"`.

- [ ] **Step 3: Write the implementation**

`apps/web/next.config.ts` (section 14 settings, plus `@scholarcrew/catalog` and `@scholarcrew/agents` because the app depends on them as source packages, plus the repo-root `.env` under `next dev`, which Next doesn't read on its own because it only loads `.env` files from `apps/web`; `next start` gets the file from its script, and hosted deployments inject env vars directly):

```ts
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
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
        ],
      },
    ];
  },
};

export default config;
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 6 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/next.config.ts apps/web/test/config.test.ts
git commit -m "feat(web): next config with security headers and dev-only root env loading"
```

### M3: Server deps from env, lazy send-only jobs client

- [ ] **Step 1: Write the failing test**

`apps/web/src/server/deps.test.ts`:

```ts
import { createTestDeps } from "@scholarcrew/core/shared";
import { devOutbox, eq } from "@scholarcrew/db";
import { getTestDb, testDatabaseUrl } from "@scholarcrew/db/testing";
import { type JobsClient, createMemoryJobsClient } from "@scholarcrew/jobs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDeps,
  createLazyJobsClient,
  devRoutesEnabled,
  getDeps,
  resetDepsForTests,
  setDepsForTests,
  stripeSecretKey,
} from "./deps";

const KEY = "ab".repeat(32);
const BASE = { DATABASE_URL: testDatabaseUrl(), APP_URL: "http://localhost:3000/", ENCRYPTION_KEY: KEY };

const opened: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of opened.splice(0)) await close();
});

function build(env: Record<string, string | undefined>) {
  const built = buildDeps(env);
  opened.push(built.close);
  return built.deps;
}

describe("buildDeps", () => {
  it("accepts a rotating keyring and rejects unsafe production configuration before opening a pool", () => {
    const second = "12" + "ab".repeat(31);
    expect(build({ ...BASE, ENCRYPTION_KEYS: `2:${second},1:${KEY}` }).config.keyring.primary.id).toBe(2);
    expect(() => build({ ...BASE, NODE_ENV: "production" })).toThrow(/key/i);
    expect(() => build({ ...BASE, ENCRYPTION_KEYS: `2:${second}`, NODE_ENV: "production" })).toThrow("RESEND_API_KEY is required in production");
  });

  it("builds the core config from env", () => {
    const deps = build({
      ...BASE,
      STRIPE_PRICE_FAMILY: "price_f",
      STRIPE_PRICE_SEASON: "price_s",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
    });
    expect(deps.config).toEqual({
      appUrl: "http://localhost:3000",
      keyring: { primary: { id: 1, key: Buffer.from(KEY, "hex") }, byId: new Map([[1, Buffer.from(KEY, "hex")]]) },
      sessionDays: 30,
      stripePriceFamily: "price_f",
      stripePriceSeason: "price_s",
      stripeWebhookSecret: "whsec_x",
    });
    expect(deps.stripe).toBeNull();
    expect(Math.abs(deps.clock.now().getTime() - Date.now())).toBeLessThan(5_000);
  });

  it("creates a Stripe gateway only when a secret key is set", () => {
    expect(build({ ...BASE, STRIPE_SECRET_KEY: "sk_test_123" }).stripe).not.toBeNull();
    expect(build({ ...BASE, STRIPE_SECRET_KEY: "" }).stripe).toBeNull();
  });

  it("writes email to dev_outbox when there is no Resend key", async () => {
    const deps = build(BASE);
    await deps.email.send({ to: "Maya@Example.test", subject: "Hi", text: "Body" });
    const rows = await getTestDb().select().from(devOutbox).where(eq(devOutbox.to, "maya@example.test"));
    expect(rows).toHaveLength(1);
  });

  it("sends email through Resend when the key is set", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const deps = build({ ...BASE, RESEND_API_KEY: "re_123", EMAIL_FROM: "Crew <crew@example.test>" });
    await deps.email.send({ to: "maya@example.test", subject: "Hi", text: "Body" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.resend.com/emails");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("Crew <crew@example.test>");
  });

  it("rejects missing or malformed settings before opening a pool", () => {
    expect(() => buildDeps({ ...BASE, DATABASE_URL: "" })).toThrow("Missing environment variable DATABASE_URL");
    expect(() => buildDeps({ ...BASE, APP_URL: undefined })).toThrow("Missing environment variable APP_URL");
    expect(() => buildDeps({ ...BASE, APP_URL: "not a url" })).toThrow("APP_URL must be an absolute URL");
    expect(() => buildDeps({ ...BASE, ENCRYPTION_KEY: "abc" })).toThrow("ENCRYPTION_KEY must be 64 hex characters");
  });
});

describe("createLazyJobsClient", () => {
  it("starts the sender once, on the first enqueue", async () => {
    const inner = createMemoryJobsClient();
    const start = vi.fn(async (): Promise<JobsClient> => inner);
    const jobs = createLazyJobsClient(start);
    expect(start).not.toHaveBeenCalled();
    await Promise.all([jobs.enqueue("sweep.weekly", {}), jobs.enqueue("sweep.weekly", {})]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(inner.sent).toHaveLength(2);
  });

  it("tries to start again after a failed start", async () => {
    const inner = createMemoryJobsClient();
    const start = vi
      .fn<() => Promise<JobsClient>>()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(inner);
    const jobs = createLazyJobsClient(start);
    await expect(jobs.enqueue("sweep.weekly", {})).rejects.toThrow("db down");
    await jobs.enqueue("sweep.weekly", {});
    expect(start).toHaveBeenCalledTimes(2);
    expect(inner.sent).toHaveLength(1);
  });
});

describe("getDeps", () => {
  it("returns the test override and never reads env under Vitest", () => {
    const deps = createTestDeps();
    setDepsForTests(deps);
    expect(getDeps()).toBe(deps);
    resetDepsForTests();
    expect(() => getDeps()).toThrow("useTestDeps");
  });
});

describe("env switches", () => {
  it("enables dev routes only with ENABLE_DEV_ROUTES=1 outside production", () => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "1");
    vi.stubEnv("NODE_ENV", "test");
    expect(devRoutesEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(devRoutesEnabled()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_ROUTES", "");
    expect(devRoutesEnabled()).toBe(false);
  });

  it("reads the Stripe secret key for webhook verification", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", " sk_test_9 ");
    expect(stripeSecretKey()).toBe("sk_test_9");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test`
Expected: FAIL `src/server/deps.test.ts` with `Failed to resolve import "./deps"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/server/deps.ts`:

```ts
import { createStripeGateway } from "@scholarcrew/core/billing";
import { parseKeyring, assertProductionKeyring } from "@scholarcrew/core/crypto";
import { type CoreDeps, devOutboxEmailSender, resendEmailSender, systemClock } from "@scholarcrew/core/shared";
import { createDb } from "@scholarcrew/db";
import {
  type JobName,
  type JobPayload,
  type JobsClient,
  createJobsClient,
  createPgBoss,
  ensureQueues,
} from "@scholarcrew/jobs";

type Env = Record<string, string | undefined>;

export const SESSION_DAYS = 30;
const DEFAULT_EMAIL_FROM = "ScholarCrew <crew@scholarcrew.example>";

function read(env: Env, key: string): string {
  return env[key]?.trim() ?? "";
}

function required(env: Env, key: string): string {
  const value = read(env, key);
  if (!value) throw new Error(`Missing environment variable ${key}`);
  return value;
}

function appUrlFrom(env: Env): string {
  const raw = required(env, "APP_URL");
  try {
    new URL(raw);
  } catch {
    throw new Error("APP_URL must be an absolute URL");
  }
  return raw.replace(/\/+$/, "");
}


/** Starts the real client on the first enqueue; a failed start is retried on the next one. */
export function createLazyJobsClient(start: () => Promise<JobsClient>): JobsClient {
  let ready: Promise<JobsClient> | null = null;
  const client = (): Promise<JobsClient> => {
    if (!ready) {
      ready = start().catch((e: unknown) => {
        ready = null;
        throw e;
      });
    }
    return ready;
  };
  return {
    async enqueue<N extends JobName>(
      name: N,
      payload: JobPayload<N>,
      opts?: { singletonKey?: string; startAfterSeconds?: number },
    ): Promise<string | null> {
      return (await client()).enqueue(name, payload, opts);
    },
  };
}

/** The web process only sends: role "sender" turns off pg-boss maintenance and cron. */
async function startSender(databaseUrl: string): Promise<JobsClient> {
  const boss = createPgBoss(databaseUrl, { role: "sender" });
  await boss.start();
  await ensureQueues(boss);
  return createJobsClient(boss);
}

/** Validates every setting before opening the database pool. */
export function buildDeps(env: Env): { deps: CoreDeps; close(): Promise<void> } {
  const databaseUrl = required(env, "DATABASE_URL");
  const appUrl = appUrlFrom(env);
  const keyring = parseKeyring(env);
  if (env.NODE_ENV === "production") {
    assertProductionKeyring(keyring);
    if (!read(env, "RESEND_API_KEY")) throw new Error("RESEND_API_KEY is required in production");
    if (!read(env, "EMAIL_FROM")) throw new Error("EMAIL_FROM is required in production");
  }
  const resendKey = read(env, "RESEND_API_KEY");
  const stripeKey = read(env, "STRIPE_SECRET_KEY");
  const { db, close } = createDb(databaseUrl, { max: 10 });
  const deps: CoreDeps = {
    db,
    jobs: createLazyJobsClient(() => startSender(databaseUrl)),
    clock: systemClock(),
    email: resendKey ? resendEmailSender(resendKey, read(env, "EMAIL_FROM") || DEFAULT_EMAIL_FROM) : devOutboxEmailSender(db),
    config: {
      appUrl,
      keyring,
      sessionDays: SESSION_DAYS,
      stripePriceFamily: read(env, "STRIPE_PRICE_FAMILY"),
      stripePriceSeason: read(env, "STRIPE_PRICE_SEASON"),
      stripeWebhookSecret: read(env, "STRIPE_WEBHOOK_SECRET"),
    },
    stripe: stripeKey ? createStripeGateway(stripeKey) : null,
  };
  return { deps, close };
}

// Next dev re-evaluates modules on every edit; keep one pool per process on globalThis.
const cache = globalThis as typeof globalThis & { __scholarcrewDeps?: CoreDeps };
let override: CoreDeps | null = null;

export function getDeps(): CoreDeps {
  if (override) return override;
  if (process.env.VITEST) {
    throw new Error("getDeps() has no test deps. Call useTestDeps() from @test/helpers.");
  }
  if (!cache.__scholarcrewDeps) cache.__scholarcrewDeps = buildDeps(process.env).deps;
  return cache.__scholarcrewDeps;
}

export function setDepsForTests(deps: CoreDeps): void {
  override = deps;
}

export function resetDepsForTests(): void {
  override = null;
}

/** GET /api/v1/dev/* exists only with ENABLE_DEV_ROUTES=1 and never in production. */
export function devRoutesEnabled(): boolean {
  return process.env.ENABLE_DEV_ROUTES === "1" && process.env.NODE_ENV !== "production";
}

/** parseStripeWebhook needs the secret key; CoreConfig doesn't carry it. */
export function stripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY?.trim() ?? "";
}
```

Modify `apps/web/test/setup.ts` (whole file):

```ts
import { resetDepsForTests } from "@/server/deps";
import { getTestDb, resetDb } from "@scholarcrew/db/testing";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(async () => {
  await resetDb(getTestDb());
});

afterEach(() => {
  resetDepsForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 17 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/deps.ts apps/web/src/server/deps.test.ts apps/web/test/setup.ts
git commit -m "feat(web): deps from env with a lazy send-only pg-boss client"
```

### M4: Route wrapper, errors, CSRF, auth modes, rate limits, test helpers

- [ ] **Step 1: Write the test helpers and the failing test**

`apps/web/test/helpers.ts` (shared by every web test):

```ts
import { resetDepsForTests, setDepsForTests } from "@/server/deps";
import { SESSION_COOKIE } from "@scholarcrew/core/auth";
import { randomToken, sha256Hex } from "@scholarcrew/core/crypto";
import { type CoreDeps, type FakeStripeGateway, TEST_NOW, createTestDeps } from "@scholarcrew/core/shared";
import { type Db, desc, devOutbox, eq, sessions, usageCounters, type users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type ErrorBody, PLAN_LIMITS } from "@scholarcrew/domain";
import { afterEach, beforeEach } from "vitest";

export const APP_ORIGIN = "http://localhost:3000";
export type TestDeps = ReturnType<typeof createTestDeps>;
type UserRow = typeof users.$inferSelect;

/** A fresh createTestDeps() per test, installed as getDeps(). Call once at the top of a test file. */
export function useTestDeps(overrides: Partial<CoreDeps> = {}): () => TestDeps {
  let current: TestDeps | null = null;
  beforeEach(() => {
    current = createTestDeps(overrides);
    setDepsForTests(current);
  });
  afterEach(() => {
    resetDepsForTests();
    current = null;
  });
  return () => {
    if (!current) throw new Error("useTestDeps() deps exist only inside a test");
    return current;
  };
}

export function fakeStripe(deps: CoreDeps): FakeStripeGateway {
  if (!deps.stripe) throw new Error("These deps have no Stripe gateway");
  return deps.stripe as FakeStripeGateway;
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  cookie?: string;
  origin?: string | null;
  headers?: Record<string, string>;
};

/** A Request to /api/v1<path>. Mutations carry the app Origin unless `origin` is given (null sends none). */
export function request(path: string, o: RequestOptions = {}): Request {
  const method = (o.method ?? "GET").toUpperCase();
  const headers = new Headers(o.headers);
  if (o.cookie) headers.set("cookie", o.cookie);
  const safe = method === "GET" || method === "HEAD";
  const origin = o.origin === undefined ? (safe ? null : APP_ORIGIN) : o.origin;
  if (origin) headers.set("origin", origin);
  let body: BodyInit | undefined;
  if (o.body instanceof FormData || typeof o.body === "string") {
    body = o.body;
  } else if (o.body !== undefined) {
    body = JSON.stringify(o.body);
    headers.set("content-type", "application/json");
  }
  return new Request(`${APP_ORIGIN}/api/v1${path}`, { method, headers, body });
}

/**
 * A streamed request with no Content-Length header, like a chunked upload: `count` copies of `chunk`.
 * `pulled()` counts the chunks the stream handed out, so a test can prove the server stopped reading early.
 */
export function chunkedRequest(
  path: string,
  o: { chunk: Uint8Array; count: number; method?: string; cookie?: string; origin?: string | null; headers?: Record<string, string> },
): { req: Request; pulled: () => number } {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= o.count) {
        controller.close();
        return;
      }
      sent += 1;
      controller.enqueue(o.chunk);
    },
  });
  const headers = new Headers(o.headers);
  if (o.cookie) headers.set("cookie", o.cookie);
  const origin = o.origin === undefined ? APP_ORIGIN : o.origin;
  if (origin) headers.set("origin", origin);
  // Node's Request needs duplex: "half" for a stream body; the DOM RequestInit type doesn't list it.
  const init = { method: o.method ?? "POST", headers, body: stream, duplex: "half" } as RequestInit;
  return { req: new Request(`${APP_ORIGIN}/api/v1${path}`, init), pulled: () => sent };
}

/** Uses up a free user's crew allowance for TEST_NOW's month, so job-starting routes answer 402. */
export async function exhaustAllowance(db: Db, userId: string): Promise<void> {
  await db.insert(usageCounters).values({
    userId,
    month: TEST_NOW.slice(0, 7),
    crewRequests: PLAN_LIMITS.free.crewRequestsPerMonth,
    costMicros: 0,
  });
}

export function params<P>(p: P): { params: Promise<P> } {
  return { params: Promise.resolve(p) };
}

export const NO_PARAMS = params<Record<string, never>>({});

/** Inserts a session that lives 30 days from TEST_NOW and returns the Cookie header value. */
export async function signIn(db: Db, userId: string): Promise<string> {
  const token = randomToken(32);
  const now = new Date(TEST_NOW);
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256Hex(token),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + 30 * 86_400_000),
  });
  return `${SESSION_COOKIE}=${token}`;
}

export async function signedInStudent(db: Db, o?: { email?: string }): Promise<{ user: UserRow; cookie: string }> {
  const { user } = await factories.student(db, o);
  return { user, cookie: await signIn(db, user.id) };
}

export async function signedInParent(db: Db, o?: { email?: string }): Promise<{ user: UserRow; cookie: string }> {
  const user = await factories.parent(db, o);
  return { user, cookie: await signIn(db, user.id) };
}

export async function signedInAdmin(db: Db): Promise<{ user: UserRow; cookie: string }> {
  const user = await factories.admin(db);
  return { user, cookie: await signIn(db, user.id) };
}

/** Newest dev_outbox message to `to`. */
export async function latestEmail(db: Db, to: string): Promise<{ subject: string; text: string }> {
  const rows = await db
    .select()
    .from(devOutbox)
    .where(eq(devOutbox.to, to.toLowerCase()))
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`No email to ${to}`);
  return { subject: row.subject, text: row.text };
}

/** The `token=` query value in an email body. */
export function tokenFrom(text: string): string {
  const match = /token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) throw new Error("No token in email text");
  return match[1];
}

/** "sc_session=<token>" taken from a response's Set-Cookie header. */
export function sessionCookieFrom(res: Response): string {
  const match = new RegExp(`${SESSION_COOKIE}=([^;]*)`).exec(res.headers.get("set-cookie") ?? "");
  if (!match?.[1]) throw new Error("No session cookie in the response");
  return `${SESSION_COOKIE}=${match[1]}`;
}

export async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export async function errorOf(res: Response): Promise<ErrorBody["error"]> {
  return ((await res.json()) as ErrorBody).error;
}
```

`apps/web/src/server/http.test.ts`:

```ts
import { createApiToken } from "@scholarcrew/core/apitokens";
import { fixedClock } from "@scholarcrew/core/shared";
import { eq, rateLimits } from "@scholarcrew/db";
import { AppError, type Actor, userActor } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  chunkedRequest,
  errorOf,
  params,
  readJson,
  request,
  signedInAdmin,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseCookie } from "./cookies";
import { setDepsForTests } from "./deps";
import {
  JSON_BODY_LIMIT,
  PUBLIC_BODY_LIMIT,
  PayloadTooLargeError,
  type RouteAuth,
  body,
  errorResponse,
  extensionPreflight,
  fileResponse,
  json,
  query,
  readTextCapped,
  requireScope,
  route,
  studentIdParam,
} from "./http";

const deps = useTestDeps();

const whoAmI = (auth: RouteAuth) => route({ auth }, async ({ actor }) => actor);
const mutate = (auth: RouteAuth, csrf?: boolean) => route({ auth, csrf }, async () => undefined);

describe("json and errorResponse", () => {
  it("writes JSON with a status and no caching", async () => {
    const res = json({ a: 1 }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("maps AppError to its status, with details only when present", async () => {
    const withDetails = errorResponse(new AppError("conflict", "Taken", { field: "email" }));
    expect(withDetails.status).toBe(409);
    expect(await withDetails.json()).toEqual({ error: { code: "conflict", message: "Taken", details: { field: "email" } } });
    expect(await errorResponse(new AppError("not_found", "Gone")).json()).toEqual({
      error: { code: "not_found", message: "Gone" },
    });
  });

  it("maps a ZodError to invalid_input with the issues", async () => {
    const res = errorResponse(z.number().safeParse("x").error);
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error.code).toBe("invalid_input");
    expect(Array.isArray(error.details)).toBe(true);
  });

  it("hides unknown errors behind a 500 and logs one JSON line", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse(new Error("db exploded"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong" } });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({ level: "error", error: "Error: db exploded" });
  });

  it("sends Retry-After on rate_limited from details.retryAfterSeconds (R3A-11)", async () => {
    const message = "Too many requests. Try again in 10 minutes.";
    const limited = errorResponse(new AppError("rate_limited", message, { retryAfterSeconds: 600 }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("600");
    expect(await limited.json()).toEqual({ error: { code: "rate_limited", message, details: { retryAfterSeconds: 600 } } });
    expect(errorResponse(new AppError("conflict", "Taken", { retryAfterSeconds: 5 })).headers.get("retry-after")).toBeNull();
    expect(errorResponse(new AppError("rate_limited", "Slow down")).headers.get("retry-after")).toBeNull();
  });
});

describe("route results", () => {
  it("returns 204 for undefined, passes a Response through, and awaits params", async () => {
    const nothing = route({ auth: "none" }, async () => undefined);
    expect((await nothing(request("/x"), NO_PARAMS)).status).toBe(204);
    const teapot = route({ auth: "none" }, async () => new Response("short and stout", { status: 418 }));
    expect((await teapot(request("/x"), NO_PARAMS)).status).toBe(418);
    const echo = route<{ id: string }>({ auth: "none" }, async (ctx) => ({
      id: ctx.params.id,
      q: ctx.url.searchParams.get("q"),
    }));
    const res = await echo(request("/things/abc?q=1"), params({ id: "abc" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "abc", q: "1" });
  });

  it("maps errors thrown by the handler", async () => {
    const limited = route({ auth: "none" }, async () => {
      throw new AppError("limit_reached", "Upgrade for more");
    });
    const res = await limited(request("/x"), NO_PARAMS);
    expect(res.status).toBe(402);
    expect((await errorOf(res)).code).toBe("limit_reached");
  });
});

describe("auth modes", () => {
  it("user: 401 without a live session, the user actor with one", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const handler = whoAmI("user");
    expect((await handler(request("/me"), NO_PARAMS)).status).toBe(401);
    const unknown = await handler(request("/me", { cookie: "sc_session=nope" }), NO_PARAMS);
    expect((await errorOf(unknown)).code).toBe("unauthenticated");
    const ok = await handler(request("/me", { cookie }), NO_PARAMS);
    expect(await readJson<Actor>(ok)).toEqual(userActor(user.id, "student"));
  });

  it("user: an expired session is 401", async () => {
    const { cookie } = await signedInStudent(deps().db);
    setDepsForTests({ ...deps(), clock: fixedClock("2026-11-06T15:00:00.000Z") });
    expect((await whoAmI("user")(request("/me", { cookie }), NO_PARAMS)).status).toBe(401);
  });

  it("admin: 401 signed out, not_found for non-admins, the actor for admins", async () => {
    const handler = whoAmI("admin");
    const student = await signedInStudent(deps().db);
    const admin = await signedInAdmin(deps().db);
    expect((await handler(request("/admin"), NO_PARAMS)).status).toBe(401);
    const denied = await handler(request("/admin", { cookie: student.cookie }), NO_PARAMS);
    expect(denied.status).toBe(404);
    expect((await errorOf(denied)).code).toBe("not_found");
    const ok = await handler(request("/admin", { cookie: admin.cookie }), NO_PARAMS);
    expect(await readJson<Actor>(ok)).toEqual(userActor(admin.user.id, "admin"));
  });

  it("optional: the public actor signed out, the user signed in", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const handler = whoAmI("optional");
    expect(await readJson<Actor>(await handler(request("/s"), NO_PARAMS))).toEqual({ kind: "public" });
    expect(await readJson<Actor>(await handler(request("/s", { cookie }), NO_PARAMS))).toEqual(
      userActor(user.id, "student"),
    );
  });

  it("bearer: resolves API tokens, ignores cookies, and exposes scopes", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const created = await createApiToken(deps(), userActor(user.id, "student"), { label: "Laptop", scopes: ["autofill"] });
    const autofill = route({ auth: "bearer" }, async (ctx) => {
      requireScope(ctx, "autofill");
      return { actor: ctx.actor, scopes: ctx.scopes };
    });
    const savePage = route({ auth: "bearer" }, async (ctx) => {
      requireScope(ctx, "save_page");
      return null;
    });
    const auth = { authorization: `Bearer ${created.secret}` };
    const ok = await autofill(request("/extension/autofill-profile", { headers: auth }), NO_PARAMS);
    expect(await ok.json()).toEqual({ actor: userActor(user.id, "student"), scopes: ["autofill"] });
    const wrongScope = await savePage(request("/extension/save-page", { method: "POST", headers: auth }), NO_PARAMS);
    expect(wrongScope.status).toBe(403);
    const bad = { authorization: "Bearer sct_not-a-real-token" };
    expect((await autofill(request("/x", { headers: bad }), NO_PARAMS)).status).toBe(401);
    expect((await autofill(request("/x"), NO_PARAMS)).status).toBe(401);
    expect((await autofill(request("/x", { cookie }), NO_PARAMS)).status).toBe(401);
  });
});

describe("CSRF origin check", () => {
  it("blocks cookie-authenticated mutations without the app Origin", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const handler = mutate("user");
    const evil = await handler(request("/profile", { method: "PATCH", cookie, origin: "https://evil.example" }), NO_PARAMS);
    expect(evil.status).toBe(403);
    expect((await errorOf(evil)).code).toBe("forbidden");
    expect((await handler(request("/profile", { method: "PATCH", cookie, origin: null }), NO_PARAMS)).status).toBe(403);
    expect((await handler(request("/profile", { method: "PATCH", cookie }), NO_PARAMS)).status).toBe(204);
    const read = whoAmI("user");
    expect((await read(request("/me", { cookie, origin: "https://evil.example" }), NO_PARAMS)).status).toBe(200);
  });

  it("skips the check for csrf: false, public routes, and bearer routes", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    expect((await mutate("user", false)(request("/x", { method: "POST", cookie, origin: null }), NO_PARAMS)).status).toBe(204);
    const evil = { method: "POST", origin: "https://evil.example" };
    expect((await mutate("none")(request("/x", evil), NO_PARAMS)).status).toBe(204);
    const created = await createApiToken(deps(), userActor(user.id, "student"), { label: "Ext", scopes: ["save_page"] });
    const headers = { authorization: `Bearer ${created.secret}` };
    expect((await mutate("bearer")(request("/x", { ...evil, headers }), NO_PARAMS)).status).toBe(204);
  });
});

describe("rate limits", () => {
  it("keys anonymous callers by the right-most X-Forwarded-For hop, so a spoofed first hop doesn't help", async () => {
    const handler = route({ auth: "none", rate: { key: "t", limit: 2, windowSeconds: 60 } }, async () => undefined);
    // The proxy appends the address it saw; anything before it came from the client.
    const fromA = (spoof: string) =>
      request("/x", { method: "POST", headers: { "x-forwarded-for": `${spoof}, 203.0.113.5` } });
    expect((await handler(fromA("198.51.100.1"), NO_PARAMS)).status).toBe(204);
    expect((await handler(fromA("198.51.100.2"), NO_PARAMS)).status).toBe(204);
    const limited = await handler(fromA("198.51.100.3"), NO_PARAMS);
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe("rate_limited");
    const [row] = await deps().db.select().from(rateLimits).where(eq(rateLimits.key, "t:203.0.113.5"));
    expect(row?.count).toBe(3);
    const fromB = request("/x", { method: "POST", headers: { "x-real-ip": "198.51.100.7" } });
    expect((await handler(fromB, NO_PARAMS)).status).toBe(204);
  });

  it("keys signed-in callers by user id and falls back to 'unknown' without IP headers", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const byUser = route({ auth: "user", rate: { key: "u", limit: 5, windowSeconds: 60 } }, async () => undefined);
    await byUser(request("/x", { method: "POST", cookie }), NO_PARAMS);
    const anon = route({ auth: "none", rate: { key: "n", limit: 5, windowSeconds: 60 } }, async () => undefined);
    await anon(request("/x", { method: "POST" }), NO_PARAMS);
    const keys = (await deps().db.select().from(rateLimits)).map((r) => r.key).sort();
    expect(keys).toEqual(["n:unknown", `u:${user.id}`]);
  });
});

describe("body and query", () => {
  const Input = z.strictObject({ name: z.string().min(1), n: z.number().default(1) });
  const handler = route({ auth: "none" }, async ({ req }) => body(req, Input));

  it("parses JSON bodies with the schema and rejects bad ones", async () => {
    const ok = await handler(request("/x", { method: "POST", body: { name: "Maya" } }), NO_PARAMS);
    expect(await ok.json()).toEqual({ name: "Maya", n: 1 });
    const notJson = await handler(request("/x", { method: "POST", body: "{nope" }), NO_PARAMS);
    expect(notJson.status).toBe(400);
    expect((await errorOf(notJson)).message).toBe("Request body must be JSON");
    expect((await handler(request("/x", { method: "POST" }), NO_PARAMS)).status).toBe(400);
    const wrong = await errorOf(await handler(request("/x", { method: "POST", body: { name: "" } }), NO_PARAMS));
    expect(wrong.code).toBe("invalid_input");
    expect(Array.isArray(wrong.details)).toBe(true);
  });

  it("parses query strings with the schema", () => {
    const Q = z.strictObject({ page: z.coerce.number().int().min(1) });
    expect(query(new URL("http://localhost:3000/x?page=2"), Q)).toEqual({ page: 2 });
    expect(() => query(new URL("http://localhost:3000/x?page=0"), Q)).toThrow(AppError);
  });

  it("caps JSON bodies with 413, with or without Content-Length (SE-04)", async () => {
    expect(JSON_BODY_LIMIT).toBe(256 * 1024);
    expect(PUBLIC_BODY_LIMIT).toBe(64 * 1024);
    const big = JSON.stringify({ name: "x".repeat(300 * 1024) });
    const declared = await handler(
      request("/x", { method: "POST", body: big, headers: { "content-length": String(big.length) } }),
      NO_PARAMS,
    );
    expect(declared.status).toBe(413);
    expect(await errorOf(declared)).toEqual({ code: "invalid_input", message: "Request body is too large" });
    expect((await handler(request("/x", { method: "POST", body: big }), NO_PARAMS)).status).toBe(413);
    // Chunked: no Content-Length at all. The reader stops a few chunks past the cap instead of buffering 2 MB.
    const { req, pulled } = chunkedRequest("/x", { chunk: new Uint8Array(64 * 1024).fill(0x20), count: 32, origin: null });
    expect((await handler(req, NO_PARAMS)).status).toBe(413);
    expect(pulled()).toBeLessThan(32);
    const publicRoute = route({ auth: "none" }, async (ctx) => body(ctx.req, Input, PUBLIC_BODY_LIMIT));
    const overPublic = JSON.stringify({ name: "x".repeat(PUBLIC_BODY_LIMIT) });
    expect((await publicRoute(request("/x", { method: "POST", body: overPublic }), NO_PARAMS)).status).toBe(413);
    expect((await handler(request("/x", { method: "POST", body: overPublic }), NO_PARAMS)).status).toBe(200);
  });

  it("reads raw text through the same cap with the caller's message (webhook, CSV import)", async () => {
    expect(await readTextCapped(request("/x", { method: "POST", body: "a,b\n1,2" }), 16)).toBe("a,b\n1,2");
    expect(await readTextCapped(request("/x"), 16)).toBe("");
    await expect(readTextCapped(request("/x", { method: "POST", body: "x".repeat(17) }), 16, "Too big")).rejects.toMatchObject({
      status: 413,
      code: "invalid_input",
      message: "Too big",
    });
    const { req, pulled } = chunkedRequest("/x", { chunk: new TextEncoder().encode("0123456789"), count: 100 });
    await expect(readTextCapped(req, 25)).rejects.toBeInstanceOf(PayloadTooLargeError);
    expect(pulled()).toBeLessThan(100);
  });

  it("studentIdParam defaults to the caller, takes a valid id, and ignores other params (D23)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const other = "00000000-0000-4000-8000-000000000000";
    const echo = route({ auth: "user" }, async (ctx) => ({ studentId: studentIdParam(ctx) }));
    expect(await readJson(await echo(request("/x?week=2026-10-05", { cookie }), NO_PARAMS))).toEqual({ studentId: user.id });
    expect(await readJson(await echo(request(`/x?studentId=${other}`, { cookie }), NO_PARAMS))).toEqual({ studentId: other });
    expect((await echo(request("/x?studentId=nope", { cookie }), NO_PARAMS)).status).toBe(400);
  });
});

describe("cookies, files, and extension CORS", () => {
  it("reads one cookie from a Cookie header", () => {
    expect(parseCookie("a=1; sc_session=abc%3D; b=2", "sc_session")).toBe("abc=");
    expect(parseCookie("a=1", "sc_session")).toBeNull();
    expect(parseCookie(null, "sc_session")).toBeNull();
  });

  it("sends file downloads as uncached attachments", async () => {
    const res = fileResponse(Buffer.from("hello"), "text/plain", "résumé \"final\".txt");
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename=\"r_sum_ _final_.txt\"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%22final%22.txt",
    );
    expect(await res.text()).toBe("hello");
    const quoted = fileResponse(Buffer.from("x"), "application/pdf", "Maya's essay (final).pdf");
    expect(quoted.headers.get("content-disposition")).toBe(
      "attachment; filename=\"Maya's essay (final).pdf\"; filename*=UTF-8''Maya%27s%20essay%20%28final%29.pdf",
    );
  });

  it("adds CORS headers for chrome-extension origins only", async () => {
    const handler = route({ auth: "none", cors: "extension" }, async () => ({ ok: true }));
    const ext = await handler(request("/x", { headers: { origin: "chrome-extension://abcdefgh" } }), NO_PARAMS);
    expect(ext.headers.get("access-control-allow-origin")).toBe("chrome-extension://abcdefgh");
    const web = await handler(request("/x", { headers: { origin: "https://evil.example" } }), NO_PARAMS);
    expect(web.headers.get("access-control-allow-origin")).toBeNull();
    const preflight = extensionPreflight(request("/x", { method: "OPTIONS", origin: "chrome-extension://abcdefgh" }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type");
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test`
Expected: FAIL `src/server/http.test.ts` with `Failed to resolve import "./cookies"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/server/cookies.ts`:

```ts
import { SESSION_COOKIE } from "@scholarcrew/core/auth";

const DAY_SECONDS = 86_400;
// ID-02. Browsers accept Secure cookies on http://localhost, so dev and e2e use the same attributes.
const ATTRIBUTES = "Path=/; HttpOnly; Secure; SameSite=Lax";

/** One cookie's value from a Cookie request header, or null. */
export function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    const raw = part.slice(at + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/** Set-Cookie value for a new session. */
export function sessionCookie(token: string, maxAgeDays: number): string {
  return `${SESSION_COOKIE}=${token}; ${ATTRIBUTES}; Max-Age=${Math.floor(maxAgeDays * DAY_SECONDS)}`;
}

/** Set-Cookie value that removes the session cookie. */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`;
}
```

`apps/web/src/server/http.ts`:

```ts
import { resolveApiToken } from "@scholarcrew/core/apitokens";
import { SESSION_COOKIE, getSessionUser } from "@scholarcrew/core/auth";
import { consumeRateLimit } from "@scholarcrew/core/ratelimit";
import { type CoreDeps, errorLabel } from "@scholarcrew/core/shared";
import {
  type Actor,
  type ApiTokenScope,
  AppError,
  Id,
  PUBLIC_ACTOR,
  forbidden,
  invalidInput,
  isAppError,
  notFound,
  unauthenticated,
  userActor,
} from "@scholarcrew/domain";
import { ZodError, type ZodType, z } from "zod";
import { parseCookie } from "./cookies";
import { getDeps } from "./deps";

export type RouteAuth = "user" | "admin" | "optional" | "none" | "bearer";

export interface RouteCtx<P> {
  req: Request;
  params: P;
  actor: Actor;
  deps: CoreDeps;
  ip: string;
  url: URL;
  /** API token scopes when auth is "bearer"; empty otherwise. */
  scopes: ApiTokenScope[];
}

export interface RouteOptions {
  auth: RouteAuth;
  csrf?: boolean;
  rate?: { key: string; limit: number; windowSeconds: number };
  /** Adds CORS headers for chrome-extension:// origins (plan 14's bearer routes for the extension). */
  cors?: "extension";
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-z]{1,64}$/;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function errorResponse(e: unknown): Response {
  if (isAppError(e)) {
    const error =
      e.details === undefined
        ? { code: e.code, message: e.message }
        : { code: e.code, message: e.message, details: e.details };
    const res = json({ error }, e.status);
    // R3A-11: 06 consumeRateLimit puts the seconds until the window ends in details.retryAfterSeconds.
    const details = e.details as { retryAfterSeconds?: unknown } | undefined;
    const wait = e.code === "rate_limited" ? details?.retryAfterSeconds : undefined;
    if (typeof wait === "number" && Number.isFinite(wait)) {
      res.headers.set("retry-after", String(Math.max(1, Math.ceil(wait))));
    }
    return res;
  }
  if (e instanceof ZodError) {
    return json({ error: { code: "invalid_input", message: "Check your input and try again", details: e.issues } }, 400);
  }
  const error = errorLabel(e);
  console.error(JSON.stringify({ level: "error", msg: "unhandled route error", error }));
  return json({ error: { code: "internal", message: "Something went wrong" } }, 500);
}

/** Default cap for JSON bodies. The largest domain input (an essay version, 50,000 characters) fits. */
export const JSON_BODY_LIMIT = 256 * 1024;
/** Cap for JSON bodies on `auth: "none"` routes (magic link, verify-hours, the public offer tool). */
export const PUBLIC_BODY_LIMIT = 64 * 1024;
const TOO_LARGE = "Request body is too large";

/** invalid_input, sent as 413: the request body passed its byte cap. */
export class PayloadTooLargeError extends AppError {
  override readonly status = 413;

  constructor(message = TOO_LARGE) {
    super("invalid_input", message);
    this.name = "PayloadTooLargeError";
  }
}

/**
 * Reads the body into memory, never more than `maxBytes`. A declared Content-Length over the cap is
 * refused before anything is read; without one (chunked), the stream is cancelled once it passes the cap.
 */
export async function readBytesCapped(
  req: Request,
  maxBytes: number,
  message = TOO_LARGE,
): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(req.headers.get("content-length") ?? "0") > maxBytes) throw new PayloadTooLargeError(message);
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new PayloadTooLargeError(message);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/** UTF-8 text of a body read through `readBytesCapped` (the Stripe webhook, the CSV import). */
export async function readTextCapped(req: Request, maxBytes: number, message = TOO_LARGE): Promise<string> {
  return new TextDecoder().decode(await readBytesCapped(req, maxBytes, message));
}

/** Parses a JSON body with a domain schema. Over `maxBytes` is 413; bad JSON or a schema mismatch is invalid_input. */
export async function body<T>(req: Request, schema: ZodType<T>, maxBytes = JSON_BODY_LIMIT): Promise<T> {
  const text = await readTextCapped(req, maxBytes);
  let raw: unknown;
  try {
    raw = text.length === 0 ? undefined : JSON.parse(text);
  } catch {
    throw invalidInput("Request body must be JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw invalidInput("Check your input and try again", parsed.error.issues);
  return parsed.data;
}

export function query<T>(url: URL, schema: ZodType<T>): T {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw invalidInput("Check the query parameters", parsed.error.issues);
  return parsed.data;
}

// Non-strict on purpose: read routes also take `week`, `page`, and other params.
const StudentIdQuery = z.object({ studentId: Id.optional() });

/** D23: the optional `?studentId=` on read routes (parents read shared data). Defaults to the caller. */
export function studentIdParam(ctx: { actor: Actor; url: URL }): string {
  const { studentId } = query(ctx.url, StudentIdQuery);
  if (studentId) return studentId;
  if (ctx.actor.kind !== "user") throw unauthenticated();
  return ctx.actor.userId;
}

/**
 * The right-most X-Forwarded-For entry, which the proxy in front appended (earlier entries come from the
 * client and can be anything), else X-Real-IP, else "unknown".
 */
export function clientIp(req: Request): string {
  const hops = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  const nearest = hops.at(-1);
  if (nearest) return nearest;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function requireScope(ctx: { scopes: ApiTokenScope[] }, scope: ApiTokenScope): void {
  if (!ctx.scopes.includes(scope)) throw forbidden("This token can't do that");
}

/** RFC 8187 `filename*`: encodeURIComponent leaves ' ( ) * as is, and none of them is an attr-char (R3A-25). */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** A download: attachment, never cached, never sniffed. */
export function fileResponse(bytes: Buffer, contentType: string, filename: string): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": contentDisposition(filename),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

function withExtensionCors(req: Request, res: Response): Response {
  const origin = req.headers.get("origin");
  if (!origin || !EXTENSION_ORIGIN.test(origin)) return res;
  const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
  for (const [key, value] of Object.entries(corsHeaders(origin))) out.headers.set(key, value);
  return out;
}

/** OPTIONS handler for extension routes: 204, with CORS headers only for chrome-extension:// origins. */
export function extensionPreflight(req: Request): Response {
  const origin = req.headers.get("origin");
  const headers = origin && EXTENSION_ORIGIN.test(origin) ? corsHeaders(origin) : {};
  return new Response(null, { status: 204, headers });
}

async function authenticate(
  deps: CoreDeps,
  req: Request,
  auth: RouteAuth,
): Promise<{ actor: Actor; scopes: ApiTokenScope[] }> {
  if (auth === "none") return { actor: PUBLIC_ACTOR, scopes: [] };
  if (auth === "bearer") {
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
    const resolved = match?.[1] ? await resolveApiToken(deps, match[1]) : null;
    if (!resolved) throw unauthenticated("This token is invalid or was revoked");
    return { actor: resolved.actor, scopes: resolved.scopes };
  }
  const token = parseCookie(req.headers.get("cookie"), SESSION_COOKIE);
  const user = token ? await getSessionUser(deps, token) : null;
  if (!user) {
    if (auth === "optional") return { actor: PUBLIC_ACTOR, scopes: [] };
    throw unauthenticated();
  }
  // ID-04: admin routes look like they don't exist to everyone else.
  if (auth === "admin" && user.role !== "admin") throw notFound();
  return { actor: userActor(user.id, user.role), scopes: [] };
}

/**
 * Wraps a Next.js route handler: CSRF origin check (ID-06), auth, rate limit, then the handler.
 * undefined → 204, a Response passes through, anything else → json(). Errors → errorResponse.
 */
export function route<P = Record<string, never>>(
  opts: RouteOptions,
  handler: (ctx: RouteCtx<P>) => Promise<Response | unknown>,
): (req: Request, ctx: { params: Promise<P> }) => Promise<Response> {
  const cookieAuth = opts.auth === "user" || opts.auth === "admin" || opts.auth === "optional";
  return async (req, ctx) => {
    let res: Response;
    try {
      const deps = getDeps();
      if ((opts.csrf === true || (cookieAuth && opts.csrf !== false)) && !SAFE_METHODS.has(req.method.toUpperCase())) {
        if (req.headers.get("origin") !== new URL(deps.config.appUrl).origin) {
          throw forbidden("This request didn't come from ScholarCrew");
        }
      }
      const { actor, scopes } = await authenticate(deps, req, opts.auth);
      const ip = clientIp(req);
      if (opts.rate) {
        const who = actor.kind === "user" ? actor.userId : ip;
        await consumeRateLimit(deps, {
          key: `${opts.rate.key}:${who}`,
          limit: opts.rate.limit,
          windowSeconds: opts.rate.windowSeconds,
        });
      }
      const params = (ctx?.params ? await ctx.params : {}) as P;
      const result = await handler({ req, params, actor, deps, ip, url: new URL(req.url), scopes });
      if (result === undefined) res = new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      else if (result instanceof Response) res = result;
      else res = json(result);
    } catch (e) {
      res = errorResponse(e);
    }
    return opts.cors === "extension" ? withExtensionCors(req, res) : res;
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 3 files, 41 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/cookies.ts apps/web/src/server/http.ts apps/web/src/server/http.test.ts apps/web/test/helpers.ts
git commit -m "feat(web): route wrapper with origin check, auth modes, rate limits, test helpers"
```

### M5: Session cookies and page actors

- [ ] **Step 1: Write the failing test**

`apps/web/src/server/session.test.ts`:

```ts
import { userActor } from "@scholarcrew/domain";
import { signedInAdmin, signedInStudent, useTestDeps } from "@test/helpers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionCookie, getPageActor, requirePageActor, sessionCookie } from "./session";

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "sc_session" && jar.value !== undefined ? { name, value: jar.value } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error("not_found");
  },
}));

const deps = useTestDeps();

function useCookie(cookie: string | undefined): void {
  jar.value = cookie?.split("=")[1];
}

beforeEach(() => {
  jar.value = undefined;
});

describe("session cookies", () => {
  it("sets a 30-day HttpOnly, Secure, SameSite=Lax cookie and clears it", () => {
    expect(sessionCookie("tok", 30)).toBe("sc_session=tok; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000");
    expect(clearSessionCookie()).toBe("sc_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  });
});

describe("page actors", () => {
  it("getPageActor reads the cookie through next/headers", async () => {
    expect(await getPageActor()).toBeNull();
    useCookie("sc_session=not-a-session");
    expect(await getPageActor()).toBeNull();
    const { user, cookie } = await signedInStudent(deps().db);
    useCookie(cookie);
    expect(await getPageActor()).toEqual(userActor(user.id, "student"));
  });

  it("requirePageActor redirects signed-out visitors and hides pages from other roles", async () => {
    await expect(requirePageActor()).rejects.toThrow("redirect:/sign-in");
    const student = await signedInStudent(deps().db);
    useCookie(student.cookie);
    expect(await requirePageActor()).toEqual(userActor(student.user.id, "student"));
    await expect(requirePageActor(["admin"])).rejects.toThrow("not_found");
    const admin = await signedInAdmin(deps().db);
    useCookie(admin.cookie);
    expect(await requirePageActor(["admin"])).toEqual(userActor(admin.user.id, "admin"));
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test`
Expected: FAIL `src/server/session.test.ts` with `Failed to resolve import "./session"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/server/session.ts`:

```ts
import { SESSION_COOKIE, getSessionUser } from "@scholarcrew/core/auth";
import { type Role, type UserActor, userActor } from "@scholarcrew/domain";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDeps } from "./deps";

export { clearSessionCookie, sessionCookie } from "./cookies";

/** The signed-in user for a server component, or null. */
export async function getPageActor(): Promise<UserActor | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await getSessionUser(getDeps(), token);
  return user ? userActor(user.id, user.role) : null;
}

/** ID-02/ID-04: signed out → /sign-in; signed in with the wrong role → the 404 page. */
export async function requirePageActor(roles?: Role[]): Promise<UserActor> {
  const actor = await getPageActor();
  if (!actor) redirect("/sign-in");
  if (roles && roles.length > 0 && !roles.includes(actor.role)) notFound();
  return actor;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 4 files, 44 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/session.ts apps/web/src/server/session.test.ts
git commit -m "feat(web): session cookie values and page actor helpers"
```

### M6: Edge middleware for signed-out visitors

- [ ] **Step 1: Write the failing test**

`apps/web/test/middleware.test.ts`:

```ts
import { SESSION_COOKIE } from "@scholarcrew/core/auth";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { PROTECTED_PREFIXES, SESSION_COOKIE_NAME, isProtectedPath } from "../src/server/protected";
import { config, middleware } from "../src/middleware";

const at = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, cookie ? { headers: { cookie } } : undefined);

describe("middleware", () => {
  it("forwards unique nonces and emits a restrictive CSP", () => {
    const a = middleware(at("/", "sc_session=anything"));
    const b = middleware(at("/crew", "sc_session=anything"));
    const nonce = a.headers.get("x-middleware-request-x-nonce");
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]{22,}$/);
    expect(nonce).not.toBe(b.headers.get("x-middleware-request-x-nonce"));
    const csp = a.headers.get("Content-Security-Policy");
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(a.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  });

  it("redirects signed-out visitors on app pages to sign in with the path to come back to", () => {
    const res = middleware(at("/essays/123?tab=draft"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/sign-in?next=%2Fessays%2F123%3Ftab%3Ddraft");
    expect(middleware(at("/week")).headers.get("location")).toBe("http://localhost:3000/sign-in?next=%2Fweek");
    expect(middleware(at("/admin/tasks", "sc_session=")).status).toBe(307);
  });

  it("lets a request with a session cookie through and forwards the path to layouts (D30)", () => {
    const res = middleware(at("/week", "sc_session=anything"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/week");
    const spoofed = new NextRequest("http://localhost:3000/onboarding", {
      headers: { cookie: "sc_session=anything", "x-pathname": "/week" },
    });
    expect(middleware(spoofed).headers.get("x-middleware-request-x-pathname")).toBe("/onboarding");
  });

  it("ignores public paths and look-alike prefixes", () => {
    for (const path of ["/", "/sign-in", "/directory/TX", "/h/token", "/weekly", "/api/v1/me", "/family/join"]) {
      expect(isProtectedPath(path)).toBe(false);
      expect(middleware(at(path)).headers.get("x-middleware-next")).toBe("1");
    }
    // D37: /family/join shows the invite preview before sign-in; the rest of /family needs a session.
    expect(isProtectedPath("/family")).toBe(true);
    expect(isProtectedPath("/family/joined")).toBe(true);
  });

  it("protects the listed prefixes and applies CSP to document requests", () => {
    expect(PROTECTED_PREFIXES).toEqual([
      "/week",
      "/crew",
      "/scholarships",
      "/essays",
      "/colleges",
      "/money",
      "/prep",
      "/impact",
      "/memory",
      "/family",
      "/settings",
      "/onboarding",
      "/admin",
    ]);
    expect(config.matcher[0]?.source).toBe("/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)");
    expect(config.matcher[0]?.missing).toEqual([{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }]);
    expect(SESSION_COOKIE_NAME).toBe(SESSION_COOKIE);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test`
Expected: FAIL `test/middleware.test.ts` with `Failed to resolve import "../src/server/protected"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/server/protected.ts` (edge-safe: no imports, so the middleware bundle never pulls in the database client):

```ts
/** Same value as SESSION_COOKIE in @scholarcrew/core/auth (a test keeps them equal). */
export const SESSION_COOKIE_NAME = "sc_session";

/** App pages that need a signed-in user. */
export const PROTECTED_PREFIXES = [
  "/week",
  "/crew",
  "/scholarships",
  "/essays",
  "/colleges",
  "/money",
  "/prep",
  "/impact",
  "/memory",
  "/family",
  "/settings",
  "/onboarding",
  "/admin",
] as const;

/** Pages under a protected prefix that signed-out visitors may open. /family/join previews the invite (D37). */
export const PUBLIC_EXCEPTIONS = ["/family/join"] as const;

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  if (PUBLIC_EXCEPTIONS.some((p) => under(pathname, p))) return false;
  return PROTECTED_PREFIXES.some((p) => under(pathname, p));
}
```

`apps/web/src/server/csp.ts` (edge-safe, no imports):

```ts
export function buildCsp(nonce: string, { dev }: { dev: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    ...(!dev ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
```

`apps/web/src/middleware.ts` (edge runtime: only checks that the cookie exists; pages and routes validate the session):

```ts
import { type NextRequest, NextResponse } from "next/server";
import { buildCsp } from "./server/csp";
import { SESSION_COOKIE_NAME, isProtectedPath } from "./server/protected";

export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV !== "production" });
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  let response: NextResponse;
  if (isProtectedPath(pathname) && !req.cookies.get(SESSION_COOKIE_NAME)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next({ request: { headers } });
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [{
    source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
    missing: [
      { type: "header", key: "next-router-prefetch" },
      { type: "header", key: "purpose", value: "prefetch" },
    ],
  }],
};
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 5 files, 49 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/protected.ts apps/web/src/server/csp.ts apps/web/src/middleware.ts apps/web/test/middleware.test.ts
git commit -m "feat(web): edge middleware redirects signed-out visitors and forwards x-pathname"
```

### M7: Magic-link sign in, verify, sign out, /me, dev outbox

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/auth/auth.test.ts`:

```ts
import { setDepsForTests } from "@/server/deps";
import { invite } from "@scholarcrew/core/family";
import { fixedClock } from "@scholarcrew/core/shared";
import { eq, sessions } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type MeResponse, userActor } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  latestEmail,
  readJson,
  request,
  sessionCookieFrom,
  signedInStudent,
  tokenFrom,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it, vi } from "vitest";
import { GET as latestOutbox } from "../dev/outbox/latest/route";
import { GET as getMe } from "../me/route";
import { POST as requestLink } from "./magic-link/route";
import { POST as signOut } from "./sign-out/route";
import { POST as signOutAll } from "./sign-out-all/route";
import { GET as verify } from "./verify/route";

const deps = useTestDeps();
const CLEARED_COOKIE = "sc_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

function askForLink(email: string, ip = "203.0.113.9"): Promise<Response> {
  return requestLink(
    request("/auth/magic-link", { method: "POST", body: { email }, headers: { "x-forwarded-for": ip } }),
    NO_PARAMS,
  );
}

function openLink(token: string): Promise<Response> {
  return verify(request(`/auth/verify?token=${token}`, { headers: { "user-agent": "vitest" } }), NO_PARAMS);
}

describe("magic-link sign in", () => {
  it("ends the browser's old session before setting the newly verified session", async () => {
    const old = await signedInStudent(deps().db);
    await askForLink("fresh@example.test");
    const token = tokenFrom((await latestEmail(deps().db, "fresh@example.test")).text);
    const response = await verify(request(`/auth/verify?token=${token}`, { cookie: old.cookie }), NO_PARAMS);
    expect(response.status).toBe(303);
    expect((await getMe(request("/me", { cookie: old.cookie }), NO_PARAMS)).status).toBe(401);
    expect((await getMe(request("/me", { cookie: sessionCookieFrom(response) }), NO_PARAMS)).status).toBe(200);
  });

  it("rejects a cross-origin magic-link request", async () => {
    const response = await requestLink(request("/auth/magic-link", { method: "POST", origin: "https://evil.test", body: { email: "student@example.test" } }), NO_PARAMS);
    expect(response.status).toBe(403);
  });

  it("signs a new user in: request, dev outbox, verify, cookie, /me", async () => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "1");
    expect((await askForLink("Maya@Example.test")).status).toBe(204);

    const outbox = await latestOutbox(request("/dev/outbox/latest?to=maya@example.test"), NO_PARAMS);
    expect(outbox.status).toBe(200);
    const mail = await readJson<{ subject: string; text: string }>(outbox);
    expect(mail.subject).toBe("Your ScholarCrew sign-in link");
    expect(mail.text).toContain("http://localhost:3000/api/v1/auth/verify?token=");

    const verified = await openLink(tokenFrom(mail.text));
    expect(verified.status).toBe(303);
    expect(verified.headers.get("location")).toBe("http://localhost:3000/onboarding");
    expect(verified.headers.get("set-cookie")).toMatch(
      /^sc_session=[A-Za-z0-9_-]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/,
    );
    expect(verified.headers.get("cache-control")).toBe("no-store");

    const me = await getMe(request("/me", { cookie: sessionCookieFrom(verified) }), NO_PARAMS);
    expect(me.status).toBe(200);
    const body = await readJson<MeResponse>(me);
    expect(body.user.email).toBe("maya@example.test");
    expect(body.onboardingComplete).toBe(false);

    const reused = await openLink(tokenFrom(mail.text));
    expect(reused.status).toBe(303);
    expect(reused.headers.get("location")).toBe("http://localhost:3000/sign-in?error=link");
    expect(reused.headers.get("set-cookie")).toBeNull();
  });

  it("sends an onboarded student to /week", async () => {
    await factories.student(deps().db, { email: "lena@example.test" });
    await askForLink("lena@example.test");
    const verified = await openLink(tokenFrom((await latestEmail(deps().db, "lena@example.test")).text));
    expect(verified.headers.get("location")).toBe("http://localhost:3000/week");
  });

  it("signs a new parent invitee in as a parent and sends them to /week (R2I-2)", async () => {
    const student = await signedInStudent(deps().db);
    // Core call: the /family/invites route is M10's, and this test runs at M7.
    await invite(deps(), userActor(student.user.id, "student"), { email: "dana@example.test" });
    await askForLink("dana@example.test");
    const verified = await openLink(tokenFrom((await latestEmail(deps().db, "dana@example.test")).text));
    expect(verified.status).toBe(303);
    expect(verified.headers.get("location")).toBe("http://localhost:3000/week");
    const me = await readJson<MeResponse>(await getMe(request("/me", { cookie: sessionCookieFrom(verified) }), NO_PARAMS));
    expect(me.user.role).toBe("parent");
    expect(me.onboardingComplete).toBe(true);
  });

  it("sends bad or missing tokens back to sign in", async () => {
    for (const path of ["/auth/verify?token=nope", "/auth/verify"]) {
      const res = await verify(request(path), NO_PARAMS);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("http://localhost:3000/sign-in?error=link");
    }
  });

  it("rejects malformed requests", async () => {
    const bad = await askForLink("not-an-email");
    expect(bad.status).toBe(400);
    expect((await errorOf(bad)).code).toBe("invalid_input");
    const empty = await requestLink(request("/auth/magic-link", { method: "POST" }), NO_PARAMS);
    expect(empty.status).toBe(400);
    const huge = await askForLink(`${"a".repeat(70_000)}@example.test`);
    expect(huge.status).toBe(413);
  });

  it("limits links to 5 per 15 minutes per email (SE-04)", async () => {
    for (let i = 1; i <= 5; i += 1) {
      expect((await askForLink("sam@example.test", `198.51.100.${i}`)).status).toBe(204);
    }
    const limited = await askForLink("sam@example.test", "198.51.100.99");
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe("rate_limited");
    // R3A-11: seconds until the window ends, from the limiter's details.
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
  });

  it("limits links to 5 per 15 minutes per IP (SE-04)", async () => {
    for (let i = 1; i <= 5; i += 1) {
      expect((await askForLink(`kid${i}@example.test`, "192.0.2.10")).status).toBe(204);
    }
    expect((await askForLink("kid6@example.test", "192.0.2.10")).status).toBe(429);
  });
});

describe("sessions", () => {
  it("sign out everywhere ends sessions and clears the current cookie", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await signOutAll(request("/auth/sign-out-all", { method: "POST", cookie }), NO_PARAMS);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toBe(CLEARED_COOKIE);
    expect((await getMe(request("/me", { cookie }), NO_PARAMS)).status).toBe(401);
  });

  it("returns 401 from /me without a session", async () => {
    const res = await getMe(request("/me"), NO_PARAMS);
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("unauthenticated");
  });

  it("sign out deletes the session server-side and clears the cookie", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const evil = await signOut(request("/auth/sign-out", { method: "POST", cookie, origin: "https://evil.example" }), NO_PARAMS);
    expect(evil.status).toBe(403);
    const res = await signOut(request("/auth/sign-out", { method: "POST", cookie }), NO_PARAMS);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toBe(CLEARED_COOKIE);
    expect((await getMe(request("/me", { cookie }), NO_PARAMS)).status).toBe(401);
  });

  it("sign out still clears the cookie for an expired or missing session (R3A-13)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    setDepsForTests({ ...deps(), clock: fixedClock("2026-11-06T15:00:00.000Z") });
    const expired = await signOut(request("/auth/sign-out", { method: "POST", cookie }), NO_PARAMS);
    expect(expired.status).toBe(204);
    expect(expired.headers.get("set-cookie")).toBe(CLEARED_COOKIE);
    expect(await deps().db.select().from(sessions).where(eq(sessions.userId, user.id))).toEqual([]);
    const none = await signOut(request("/auth/sign-out", { method: "POST" }), NO_PARAMS);
    expect(none.status).toBe(204);
    expect(none.headers.get("set-cookie")).toBe(CLEARED_COOKIE);
  });
});

describe("GET /dev/outbox/latest", () => {
  it("exists only with ENABLE_DEV_ROUTES=1 outside production", async () => {
    await askForLink("ana@example.test");
    const read = () => latestOutbox(request("/dev/outbox/latest?to=ana@example.test"), NO_PARAMS);
    vi.stubEnv("ENABLE_DEV_ROUTES", "");
    expect((await read()).status).toBe(404);
    vi.stubEnv("ENABLE_DEV_ROUTES", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect((await read()).status).toBe(404);
    vi.stubEnv("NODE_ENV", "test");
    expect((await read()).status).toBe(200);
    expect((await latestOutbox(request("/dev/outbox/latest?to=nobody@example.test"), NO_PARAMS)).status).toBe(404);
    expect((await latestOutbox(request("/dev/outbox/latest"), NO_PARAMS)).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test`
Expected: FAIL `src/app/api/v1/auth/auth.test.ts` with `Failed to resolve import "../dev/outbox/latest/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/auth/magic-link/route.ts` (core `requestMagicLink` enforces 5 per 15 minutes per IP and per email; the body is public, so it gets the small cap):

```ts
import { PUBLIC_BODY_LIMIT, body, route } from "@/server/http";
import { requestMagicLink } from "@scholarcrew/core/auth";
import { MagicLinkRequest } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "none", csrf: true }, async ({ req, deps, ip }) => {
  const input = await body(req, MagicLinkRequest, PUBLIC_BODY_LIMIT);
  await requestMagicLink(deps, { email: input.email, ip });
});
```

`apps/web/src/app/api/v1/auth/verify/route.ts`:

```ts
import { parseCookie, sessionCookie } from "@/server/cookies";
import { route } from "@/server/http";
import { SESSION_COOKIE, signOut, verifyMagicLink } from "@scholarcrew/core/auth";
import { getMe } from "@scholarcrew/core/profile";
import { isAppError, userActor } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function seeOther(location: string, setCookie?: string): Response {
  const headers = new Headers({ location, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  if (setCookie) headers.set("set-cookie", setCookie);
  return new Response(null, { status: 303, headers });
}

export const GET = route({ auth: "none" }, async ({ req, deps, url }) => {
  let verified: Awaited<ReturnType<typeof verifyMagicLink>>;
  try {
    verified = await verifyMagicLink(deps, {
      token: url.searchParams.get("token") ?? "",
      userAgent: req.headers.get("user-agent") ?? "",
    });
  } catch (e) {
    if (isAppError(e)) return seeOther(`${deps.config.appUrl}/sign-in?error=link`);
    throw e;
  }
  const previous = parseCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (previous) await signOut(deps, previous);
  const me = await getMe(deps, userActor(verified.user.id, verified.user.role));
  // R2I-2: only students onboard. A new account made from a pending parent invite is a parent, so getMe
  // reports onboardingComplete and the parent lands on /week (18's FAMILY_JOIN_NOTE says to reopen the invite).
  const next = me.onboardingComplete ? "/week" : "/onboarding";
  return seeOther(`${deps.config.appUrl}${next}`, sessionCookie(verified.sessionToken, deps.config.sessionDays));
});
```

`apps/web/src/app/api/v1/auth/sign-out-all/route.ts`:

```ts
import { clearSessionCookie } from "@/server/cookies";
import { route } from "@/server/http";
import { signOutEverywhere } from "@scholarcrew/core/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor }) => {
  await signOutEverywhere(deps, actor);
  return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookie(), "cache-control": "no-store" } });
});
```

`apps/web/src/app/api/v1/auth/sign-out/route.ts`:

```ts
import { clearSessionCookie, parseCookie } from "@/server/cookies";
import { route } from "@/server/http";
import { SESSION_COOKIE, signOut } from "@scholarcrew/core/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// R3A-13: "optional" still runs the Origin check, and an expired or unknown session still gets its
// cookie cleared (the middleware only checks that the cookie exists). Always 204.
export const POST = route({ auth: "optional" }, async ({ req, deps }) => {
  const token = parseCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (token) await signOut(deps, token);
  return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookie(), "cache-control": "no-store" } });
});
```

`apps/web/src/app/api/v1/me/route.ts`:

```ts
import { route } from "@/server/http";
import { getMe } from "@scholarcrew/core/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => getMe(deps, actor));
```

`apps/web/src/app/api/v1/dev/outbox/latest/route.ts` (e2e reads magic links here):

```ts
import { devRoutesEnabled } from "@/server/deps";
import { query, route } from "@/server/http";
import { desc, devOutbox, eq } from "@scholarcrew/db";
import { notFound } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.strictObject({ to: z.string().trim().min(3).max(254) });

export const GET = route({ auth: "none" }, async ({ deps, url }) => {
  if (!devRoutesEnabled()) throw notFound();
  const { to } = query(url, Query);
  const [row] = await deps.db
    .select({ subject: devOutbox.subject, text: devOutbox.text })
    .from(devOutbox)
    .where(eq(devOutbox.to, to.toLowerCase()))
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  if (!row) throw notFound("No email for that address");
  return row;
});
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 6 files, 63 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/auth apps/web/src/app/api/v1/me apps/web/src/app/api/v1/dev
git commit -m "feat(web): magic-link, verify, sign-out, me, and dev outbox routes"
```

### M8: Profile and onboarding routes

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/profile/profile.test.ts`:

```ts
import { profiles } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { MeResponse, Profile } from "@scholarcrew/domain";
import { NO_PARAMS, errorOf, readJson, request, signIn, signedInParent, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as getMe } from "../me/route";
import { POST as onboard } from "../onboarding/route";
import { GET as getProfile, PATCH as patchProfile } from "./route";

const deps = useTestDeps();

const ONBOARDING = {
  displayName: "Maya",
  birthYear: 2009,
  classYear: 2027,
  highSchool: "Maple High School",
  state: "TX",
  county: "Maple",
  gpaUnweighted: 3.72,
  intendedMajors: ["Mechanical engineering"],
  interests: ["robotics"],
};

async function newStudent(): Promise<{ id: string; cookie: string }> {
  const user = await factories.user(deps().db, { role: "student", displayName: "" });
  await deps().db.insert(profiles).values({ userId: user.id });
  return { id: user.id, cookie: await signIn(deps().db, user.id) };
}

describe("GET and PATCH /profile", () => {
  it("returns the signed-in user's profile", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const res = await getProfile(request("/profile", { cookie }), NO_PARAMS);
    expect(res.status).toBe(200);
    const profile = await readJson<Profile>(res);
    expect(profile.userId).toBe(user.id);
    expect(profile.state).toBe("TX");
    expect(profile.gpaUnweighted).toBe(3.72);
  });

  it("updates fields and returns the new profile", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await patchProfile(
      request("/profile", { method: "PATCH", cookie, body: { highSchool: "Lakeside High", gpaUnweighted: 3.9 } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(200);
    expect(await readJson<Profile>(res)).toMatchObject({ highSchool: "Lakeside High", gpaUnweighted: 3.9 });
    const again = await readJson<Profile>(await getProfile(request("/profile", { cookie }), NO_PARAMS));
    expect(again.highSchool).toBe("Lakeside High");
  });

  it("rejects invalid patches with 400 invalid_input", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const patch = (body: unknown) => patchProfile(request("/profile", { method: "PATCH", cookie, body }), NO_PARAMS);
    const gpa = await patch({ gpaUnweighted: 7 });
    expect(gpa.status).toBe(400);
    const error = await errorOf(gpa);
    expect(error.code).toBe("invalid_input");
    expect(Array.isArray(error.details)).toBe(true);
    expect((await patch({ nickname: "M" })).status).toBe(400);
    expect((await patch("not json")).status).toBe(400);
  });

  it("refuses a patch from another origin (ID-06)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await patchProfile(
      request("/profile", { method: "PATCH", cookie, origin: "https://evil.example", body: { city: "Austin" } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /onboarding", () => {
  it("completes onboarding and queues the first plan and sweep", async () => {
    const { cookie } = await newStudent();
    const res = await onboard(request("/onboarding", { method: "POST", cookie, body: ONBOARDING }), NO_PARAMS);
    expect(res.status).toBe(200);
    const me = await readJson<MeResponse>(res);
    expect(me.onboardingComplete).toBe(true);
    expect(me.profile?.county).toBe("Maple");
    expect(deps().jobs.sent.map((j) => j.name)).toEqual(["plan.weekly", "sweep.student"]);
  });

  it("blocks under-13 users and ends their session (ID-03)", async () => {
    const { cookie } = await newStudent();
    const res = await onboard(
      request("/onboarding", { method: "POST", cookie, body: { ...ONBOARDING, birthYear: 2016 } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(403);
    // R3A-17: the reason tells 16's onboarding page this is the age block, not a failed Origin check.
    expect(await errorOf(res)).toEqual({
      code: "forbidden",
      message: "ScholarCrew is for students 13 and older",
      details: { reason: "underage" },
    });
    expect((await getMe(request("/me", { cookie }), NO_PARAMS)).status).toBe(401);
  });

  it("rejects incomplete answers", async () => {
    const { cookie } = await newStudent();
    const res = await onboard(request("/onboarding", { method: "POST", cookie, body: { displayName: "Maya" } }), NO_PARAMS);
    expect(res.status).toBe(400);
    expect(deps().jobs.sent).toEqual([]);
  });

  it("is for students only", async () => {
    const { cookie } = await signedInParent(deps().db);
    const res = await onboard(request("/onboarding", { method: "POST", cookie, body: ONBOARDING }), NO_PARAMS);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test`
Expected: FAIL `src/app/api/v1/profile/profile.test.ts` with `Failed to resolve import "../onboarding/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/profile/route.ts`:

```ts
import { body, route } from "@/server/http";
import { assertUser } from "@scholarcrew/core/access";
import { getProfile, updateProfile } from "@scholarcrew/core/profile";
import { ProfilePatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => {
  assertUser(actor);
  return getProfile(deps, actor, actor.userId);
});

export const PATCH = route({ auth: "user" }, async ({ req, deps, actor }) =>
  updateProfile(deps, actor, await body(req, ProfilePatch)),
);
```

`apps/web/src/app/api/v1/onboarding/route.ts`:

```ts
import { body, route } from "@/server/http";
import { completeOnboarding } from "@scholarcrew/core/profile";
import { OnboardingInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  completeOnboarding(deps, actor, await body(req, OnboardingInput)),
);
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 7 files, 71 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/profile apps/web/src/app/api/v1/onboarding
git commit -m "feat(web): profile and onboarding routes"
```

### M9: Memory routes: facts, candidates, decisions, sensitive facts

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/facts/memory.test.ts`:

```ts
import { createCandidate } from "@scholarcrew/core/memory";
import { factories } from "@scholarcrew/db/testing";
import { type Decision, type MemoryFact, type SensitiveFactSummary, systemActor } from "@scholarcrew/domain";
import { NO_PARAMS, params, readJson, request, signIn, signedInParent, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as listDecisions, POST as recordDecision } from "../decisions/route";
import { DELETE as deleteDecision } from "../decisions/[id]/route";
import { POST as shareIncome } from "../sensitive-facts/share-income/route";
import { GET as listSensitive, PUT as setSensitive } from "../sensitive-facts/route";
import { POST as confirmFact } from "./[id]/confirm/route";
import { POST as rejectFact } from "./[id]/reject/route";
import { DELETE as forgetFact, PATCH as patchFact } from "./[id]/route";
import { GET as listFacts, POST as createFact } from "./route";

const deps = useTestDeps();
const SYSTEM = systemActor("test");

async function facts(cookie: string): Promise<MemoryFact[]> {
  return readJson<MemoryFact[]>(await listFacts(request("/facts", { cookie }), NO_PARAMS));
}

async function familyOfTwo() {
  const student = await signedInStudent(deps().db);
  const parent = await signedInParent(deps().db);
  await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
  return { student, parent };
}

describe("facts", () => {
  it("creates, lists, edits, and forgets a fact", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const created = await createFact(
      request("/facts", { method: "POST", cookie, body: { key: "intended_major", value: "mechanical engineering" } }),
      NO_PARAMS,
    );
    expect(created.status).toBe(201);
    const fact = await readJson<MemoryFact>(created);
    expect(fact).toMatchObject({ key: "intended_major", status: "confirmed", visibility: "crew", source: "user_stated" });
    expect(await facts(cookie)).toHaveLength(1);

    const edited = await patchFact(
      request(`/facts/${fact.id}`, { method: "PATCH", cookie, body: { value: "civil engineering" } }),
      params({ id: fact.id }),
    );
    expect(edited.status).toBe(200);
    const next = await readJson<MemoryFact>(edited);
    expect(next.id).not.toBe(fact.id);
    expect((await facts(cookie)).map((f) => f.value)).toEqual(["civil engineering"]);

    const forgotten = await forgetFact(request(`/facts/${next.id}`, { method: "DELETE", cookie }), params({ id: next.id }));
    expect(forgotten.status).toBe(204);
    expect(await facts(cookie)).toEqual([]);
  });

  it("rejects bad keys and patches", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const bad = await createFact(request("/facts", { method: "POST", cookie, body: { key: "Intended Major", value: "x" } }), NO_PARAMS);
    expect(bad.status).toBe(400);
    const fact = await readJson<MemoryFact>(
      await createFact(request("/facts", { method: "POST", cookie, body: { key: "dream_school", value: "Rice" } }), NO_PARAMS),
    );
    const patch = await patchFact(
      request(`/facts/${fact.id}`, { method: "PATCH", cookie, body: { visibility: "everyone" } }),
      params({ id: fact.id }),
    );
    expect(patch.status).toBe(400);
  });

  it("keeps facts private to their owner", async () => {
    const { student, parent } = await familyOfTwo();
    const other = await signedInStudent(deps().db);
    const fact = await readJson<MemoryFact>(
      await createFact(
        request("/facts", { method: "POST", cookie: student.cookie, body: { key: "dream_school", value: "Rice" } }),
        NO_PARAMS,
      ),
    );
    const id = params({ id: fact.id });
    const patch = request(`/facts/${fact.id}`, { method: "PATCH", cookie: other.cookie, body: { value: "UT" } });
    expect((await patchFact(patch, id)).status).toBe(404);
    expect((await forgetFact(request(`/facts/${fact.id}`, { method: "DELETE", cookie: other.cookie }), id)).status).toBe(404);
    expect(await facts(parent.cookie)).toEqual([]);
    expect(await facts(student.cookie)).toHaveLength(1);
  });

  it("confirms and rejects crew candidates", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const input = { visibility: "crew" as const, source: "crew_inferred" as const, sourceRef: null };
    const keep = await createCandidate(deps(), SYSTEM, user.id, { key: "favorite_subject", value: "chemistry", ...input });
    const drop = await createCandidate(deps(), SYSTEM, user.id, { key: "sport", value: "chess", ...input });
    const confirmed = await confirmFact(request(`/facts/${keep.id}/confirm`, { method: "POST", cookie }), params({ id: keep.id }));
    expect((await readJson<MemoryFact>(confirmed)).status).toBe("confirmed");
    const rejected = await rejectFact(request(`/facts/${drop.id}/reject`, { method: "POST", cookie }), params({ id: drop.id }));
    expect((await readJson<MemoryFact>(rejected)).status).toBe("rejected");
    expect((await facts(cookie)).map((f) => f.key)).toEqual(["favorite_subject"]);
  });
});

describe("decisions", () => {
  it("records, lists, and deletes decisions; others get 404", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const res = await recordDecision(
      request("/decisions", { method: "POST", cookie, body: { summary: "Apply ED to Rice" } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(201);
    const decision = await readJson<Decision>(res);
    expect(decision.rationale).toBe("");
    expect(await readJson<Decision[]>(await listDecisions(request("/decisions", { cookie }), NO_PARAMS))).toHaveLength(1);
    const id = params({ id: decision.id });
    expect((await deleteDecision(request(`/decisions/${decision.id}`, { method: "DELETE", cookie: other.cookie }), id)).status).toBe(404);
    expect((await deleteDecision(request(`/decisions/${decision.id}`, { method: "DELETE", cookie }), id)).status).toBe(204);
    expect(await readJson<Decision[]>(await listDecisions(request("/decisions", { cookie }), NO_PARAMS))).toEqual([]);
  });
});

describe("sensitive facts", () => {
  it("stores opt-ins and returns owner summaries for all eight kinds", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const put = (body: unknown) => setSensitive(request("/sensitive-facts", { method: "PUT", cookie, body }), NO_PARAMS);
    const res = await put({ kind: "first_gen", enabled: true });
    expect(res.status).toBe(200);
    expect(await readJson<SensitiveFactSummary>(res)).toMatchObject({ kind: "first_gen", enabled: true, hasValue: false });
    expect((await put({ kind: "first_gen", enabled: true, value: ["x"] })).status).toBe(400);
    const all = await readJson<SensitiveFactSummary[]>(await listSensitive(request("/sensitive-facts", { cookie }), NO_PARAMS));
    expect(all).toHaveLength(8);
    expect(all.find((s) => s.kind === "first_gen")?.enabled).toBe(true);
  });

  it("never shows a student's opt-ins to a parent; a parent can share an income range in", async () => {
    const { student, parent } = await familyOfTwo();
    await setSensitive(
      request("/sensitive-facts", { method: "PUT", cookie: student.cookie, body: { kind: "first_gen", enabled: true } }),
      NO_PARAMS,
    );
    const parentView = await readJson<SensitiveFactSummary[]>(
      await listSensitive(request("/sensitive-facts", { cookie: parent.cookie }), NO_PARAMS),
    );
    expect(parentView.every((s) => !s.enabled)).toBe(true);

    const share = (cookie: string) =>
      shareIncome(
        request("/sensitive-facts/share-income", { method: "POST", cookie, body: { studentId: student.user.id, range: "48_75k" } }),
        NO_PARAMS,
      );
    expect((await share(parent.cookie)).status).toBe(204);
    const studentView = await readJson<SensitiveFactSummary[]>(
      await listSensitive(request("/sensitive-facts", { cookie: student.cookie }), NO_PARAMS),
    );
    expect(studentView.find((s) => s.kind === "income_range")).toMatchObject({ enabled: true, sharedByParent: true });

    const stranger = await factories.parent(deps().db);
    expect((await share(await signIn(deps().db, stranger.id))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test`
Expected: FAIL `src/app/api/v1/facts/memory.test.ts` with `Failed to resolve import "../decisions/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/facts/route.ts`:

```ts
import { body, json, route } from "@/server/http";
import { assertUser } from "@scholarcrew/core/access";
import { createFact, listFacts } from "@scholarcrew/core/memory";
import { FactInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => {
  assertUser(actor);
  return listFacts(deps, actor, actor.userId);
});

export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  json(await createFact(deps, actor, await body(req, FactInput)), 201),
);
```

`apps/web/src/app/api/v1/facts/[id]/route.ts`:

```ts
import { body, route } from "@/server/http";
import { forgetFact, updateFact } from "@scholarcrew/core/memory";
import { FactPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ req, deps, actor, params }) =>
  updateFact(deps, actor, params.id, await body(req, FactPatch)),
);

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await forgetFact(deps, actor, params.id);
});
```

`apps/web/src/app/api/v1/facts/[id]/confirm/route.ts`:

```ts
import { route } from "@/server/http";
import { confirmCandidate } from "@scholarcrew/core/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  confirmCandidate(deps, actor, params.id),
);
```

`apps/web/src/app/api/v1/facts/[id]/reject/route.ts`:

```ts
import { route } from "@/server/http";
import { rejectCandidate } from "@scholarcrew/core/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  rejectCandidate(deps, actor, params.id),
);
```

`apps/web/src/app/api/v1/decisions/route.ts`:

```ts
import { body, json, route } from "@/server/http";
import { assertUser } from "@scholarcrew/core/access";
import { listDecisions, recordDecision } from "@scholarcrew/core/memory";
import { DecisionInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => {
  assertUser(actor);
  return listDecisions(deps, actor, actor.userId);
});

export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  json(await recordDecision(deps, actor, await body(req, DecisionInput)), 201),
);
```

`apps/web/src/app/api/v1/decisions/[id]/route.ts`:

```ts
import { route } from "@/server/http";
import { deleteDecision } from "@scholarcrew/core/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await deleteDecision(deps, actor, params.id);
});
```

`apps/web/src/app/api/v1/sensitive-facts/route.ts`:

```ts
import { body, route } from "@/server/http";
import { listSensitiveFacts, setSensitiveFact } from "@scholarcrew/core/memory";
import { SensitiveFactInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listSensitiveFacts(deps, actor));

export const PUT = route({ auth: "user" }, async ({ req, deps, actor }) =>
  setSensitiveFact(deps, actor, await body(req, SensitiveFactInput)),
);
```

`apps/web/src/app/api/v1/sensitive-facts/share-income/route.ts`:

```ts
import { body, route } from "@/server/http";
import { shareIncomeRangeToStudent } from "@scholarcrew/core/memory";
import { ShareIncomeInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ req, deps, actor }) => {
  await shareIncomeRangeToStudent(deps, actor, await body(req, ShareIncomeInput));
});
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 8 files, 78 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/facts apps/web/src/app/api/v1/decisions apps/web/src/app/api/v1/sensitive-facts
git commit -m "feat(web): memory, decisions, and sensitive fact routes"
```

### M10: Family routes: invites, members, share settings, budget, tasks

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/family/family.test.ts`:

```ts
import { createTask } from "@scholarcrew/core/family";
import { TEST_NOW } from "@scholarcrew/core/shared";
import { rateLimits } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import {
  type FamilyBudget,
  type FamilyTask,
  type FamilyView,
  type ShareSettings,
  systemActor,
} from "@scholarcrew/domain";
import {
  NO_PARAMS,
  latestEmail,
  params,
  readJson,
  request,
  signIn,
  signedInParent,
  signedInStudent,
  tokenFrom,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { PUT as putBudget, GET as getBudget } from "./budget/route";
import { POST as accept } from "./invites/accept/route";
import { GET as preview } from "./invites/preview/route";
import { POST as invite } from "./invites/route";
import { DELETE as revokeInvite } from "./invites/[id]/route";
import { POST as leave } from "./leave/route";
import { DELETE as removeMember } from "./members/[userId]/route";
import { GET as getFamily } from "./route";
import { GET as getShares, PUT as putShares } from "./share-settings/route";
import { PATCH as patchTask } from "./tasks/[id]/route";
import { GET as listTasks } from "./tasks/route";

const deps = useTestDeps();

async function familyOfTwo() {
  const student = await signedInStudent(deps().db);
  const parent = await signedInParent(deps().db);
  const family = await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
  return { student, parent, family };
}

const post = (path: string, cookie: string, body?: unknown) => request(path, { method: "POST", cookie, body });

describe("invites", () => {
  it("invites a parent by email and the parent joins", async () => {
    const student = await signedInStudent(deps().db);
    const parent = await signedInParent(deps().db, { email: "rosa@example.test" });
    expect((await invite(post("/family/invites", student.cookie, { email: "rosa@example.test" }), NO_PARAMS)).status).toBe(204);
    const mail = await latestEmail(deps().db, "rosa@example.test");
    expect(mail.text).toContain("http://localhost:3000/family/join?token=");
    const joined = await accept(post("/family/invites/accept", parent.cookie, { token: tokenFrom(mail.text) }), NO_PARAMS);
    expect(joined.status).toBe(200);
    const view = await readJson<FamilyView>(joined);
    expect(view.myRole).toBe("parent");
    expect(view.members).toHaveLength(2);
    const studentView = await readJson<FamilyView>(await getFamily(request("/family", { cookie: student.cookie }), NO_PARAMS));
    expect(studentView.members.map((m) => m.memberRole).sort()).toEqual(["parent", "student"]);
  });

  it("reserves invites and pending-invite cancellation to the student", async () => {
    const { student, parent } = await familyOfTwo();
    expect((await invite(post("/family/invites", parent.cookie, { email: "new@example.test" }), NO_PARAMS)).status).toBe(403);
    expect((await invite(post("/family/invites", student.cookie, { email: "new@example.test", memberRole: "student" }), NO_PARAMS)).status).toBe(400);
    await invite(post("/family/invites", student.cookie, { email: "new@example.test" }), NO_PARAMS);
    const family = await readJson<FamilyView>(await getFamily(request("/family", { cookie: student.cookie }), NO_PARAMS));
    const pending = family.pendingInvites[0]!;
    const path = `/family/invites/${pending.id}`;
    expect((await revokeInvite(request(path, { method: "DELETE", cookie: parent.cookie }), params({ id: pending.id }))).status).toBe(404);
    expect((await revokeInvite(request(path, { method: "DELETE", cookie: student.cookie }), params({ id: pending.id }))).status).toBe(204);
    const after = await readJson<FamilyView>(await getFamily(request("/family", { cookie: student.cookie }), NO_PARAMS));
    expect(after.pendingInvites).toEqual([]);
  });

  it("rejects bad invites and bad tokens", async () => {
    const student = await signedInStudent(deps().db);
    const parent = await signedInParent(deps().db);
    expect((await invite(post("/family/invites", student.cookie, { email: student.user.email }), NO_PARAMS)).status).toBe(400);
    expect((await invite(post("/family/invites", student.cookie, { email: "nope" }), NO_PARAMS)).status).toBe(400);
    expect((await accept(post("/family/invites/accept", parent.cookie, { token: "x" }), NO_PARAMS)).status).toBe(400);
    const unknown = { token: "A".repeat(43) };
    expect((await accept(post("/family/invites/accept", parent.cookie, unknown), NO_PARAMS)).status).toBe(404);
  });

  it("limits invites to 20 a day per user (SE-04)", async () => {
    const student = await signedInStudent(deps().db);
    const statuses: number[] = [];
    for (let i = 1; i <= 21; i += 1) {
      const res = await invite(post("/family/invites", student.cookie, { email: `p${i}@example.test` }), NO_PARAMS);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 4)).toEqual([204, 204, 204, 204]);
    expect(statuses.slice(0, 20)).not.toContain(429);
    expect(statuses[20]).toBe(429);
  });

  it("previews an invite without a session and hides the invitee's email (D37)", async () => {
    const student = await signedInStudent(deps().db);
    const parent = await signedInParent(deps().db, { email: "rosa@example.test" });
    await invite(post("/family/invites", student.cookie, { email: "rosa@example.test" }), NO_PARAMS);
    const token = tokenFrom((await latestEmail(deps().db, "rosa@example.test")).text);
    const peek = (t: string, ip = "203.0.113.40") =>
      preview(request(`/family/invites/preview?token=${t}`, { headers: { "x-forwarded-for": ip } }), NO_PARAMS);
    const res = await peek(token);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ inviterFirstName: "Test", memberRole: "parent", expiresAt: "2026-10-13T15:00:00.000Z" });
    expect(text).not.toContain("rosa@example.test");
    expect((await peek("A".repeat(43))).status).toBe(404);
    expect((await peek("")).status).toBe(400);
    await accept(post("/family/invites/accept", parent.cookie, { token }), NO_PARAMS);
    expect((await peek(token)).status).toBe(404);
    await deps()
      .db.insert(rateLimits)
      .values({ key: "family.invite-preview:203.0.113.41", windowStart: new Date(TEST_NOW), count: 30 });
    expect((await peek(token, "203.0.113.41")).status).toBe(429);
  });
});

describe("share settings", () => {
  it("lets the student edit, the parent read, and everyone else get 404", async () => {
    const { student, parent } = await familyOfTwo();
    const mine = await readJson<ShareSettings>(await getShares(request("/family/share-settings", { cookie: student.cookie }), NO_PARAMS));
    expect(mine.categories.essays).toBe(false);
    expect(mine.categories.deadlines).toBe(true);
    const put = (cookie: string) =>
      putShares(request("/family/share-settings", { method: "PUT", cookie, body: { categories: { essays: true } } }), NO_PARAMS);
    expect((await readJson<ShareSettings>(await put(student.cookie))).categories.essays).toBe(true);
    const path = `/family/share-settings?studentId=${student.user.id}`;
    const parentView = await readJson<ShareSettings>(await getShares(request(path, { cookie: parent.cookie }), NO_PARAMS));
    expect(parentView.categories.essays).toBe(true);
    expect((await put(parent.cookie)).status).toBe(404);
    const stranger = await signIn(deps().db, (await factories.parent(deps().db)).id);
    expect((await getShares(request(path, { cookie: stranger }), NO_PARAMS)).status).toBe(404);
    expect((await getShares(request("/family/share-settings?studentId=nope", { cookie: parent.cookie }), NO_PARAMS)).status).toBe(400);
  });
});

describe("budget and tasks", () => {
  it("lets a parent share the budget and the student read it", async () => {
    const { student, parent } = await familyOfTwo();
    const put = (cookie: string, annualUsd: number) =>
      putBudget(request("/family/budget", { method: "PUT", cookie, body: { annualUsd } }), NO_PARAMS);
    const shared = await put(parent.cookie, 12000);
    expect(shared.status).toBe(200);
    expect((await readJson<FamilyBudget>(shared)).annualUsd).toBe(12000);
    const read = await readJson<FamilyBudget>(await getBudget(request("/family/budget", { cookie: student.cookie }), NO_PARAMS));
    expect(read.annualUsd).toBe(12000);
    expect((await put(student.cookie, 9000)).status).toBe(403);
    expect((await put(parent.cookie, -5)).status).toBe(400);
  });

  it("lists family tasks and lets the assignee finish one", async () => {
    const { student, parent, family } = await familyOfTwo();
    const task = await createTask(deps(), systemActor("test"), {
      familyId: family.id,
      assigneeId: parent.user.id,
      studentId: student.user.id,
      kind: "fafsa_contributor",
      title: "Create your StudentAid.gov account",
    });
    const list = await readJson<FamilyTask[]>(await listTasks(request("/family/tasks", { cookie: parent.cookie }), NO_PARAMS));
    expect(list.map((t) => t.id)).toEqual([task.id]);
    const done = await patchTask(
      request(`/family/tasks/${task.id}`, { method: "PATCH", cookie: parent.cookie, body: { status: "done" } }),
      params({ id: task.id }),
    );
    expect((await readJson<FamilyTask>(done)).status).toBe("done");
    const missing = "00000000-0000-4000-8000-000000000000";
    const res = await patchTask(
      request(`/family/tasks/${missing}`, { method: "PATCH", cookie: parent.cookie, body: { status: "done" } }),
      params({ id: missing }),
    );
    expect(res.status).toBe(404);
  });
});

describe("membership", () => {
  it("lets the student remove a parent, and members leave", async () => {
    const { student, parent } = await familyOfTwo();
    const removed = await removeMember(
      request(`/family/members/${parent.user.id}`, { method: "DELETE", cookie: student.cookie }),
      params({ userId: parent.user.id }),
    );
    expect(removed.status).toBe(204);
    expect(await readJson<FamilyView | null>(await getFamily(request("/family", { cookie: parent.cookie }), NO_PARAMS))).toBeNull();
    expect((await leave(post("/family/leave", student.cookie), NO_PARAMS)).status).toBe(204);
    expect(await readJson<FamilyView | null>(await getFamily(request("/family", { cookie: student.cookie }), NO_PARAMS))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test`
Expected: FAIL `src/app/api/v1/family/family.test.ts` with `Failed to resolve import "./budget/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/family/route.ts`:

```ts
import { route } from "@/server/http";
import { getFamily } from "@scholarcrew/core/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** FamilyView, or null when the user isn't in a family. */
export const GET = route({ auth: "user" }, async ({ deps, actor }) => getFamily(deps, actor));
```

`apps/web/src/app/api/v1/family/invites/route.ts` (each invite emails an address the caller chose, so it's limited):

```ts
import { body, route } from "@/server/http";
import { invite } from "@scholarcrew/core/family";
import { InviteInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InviteBody = InviteInput;

export const POST = route(
  { auth: "user", rate: { key: "family.invite", limit: 20, windowSeconds: 86_400 } },
  async ({ req, deps, actor }) => {
    await invite(deps, actor, await body(req, InviteBody));
  },
);
```

`apps/web/src/app/api/v1/family/invites/[id]/route.ts`:

```ts
import { route } from "@/server/http";
import { revokeInvite } from "@scholarcrew/core/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await revokeInvite(deps, actor, params.id);
});
```

`apps/web/src/app/api/v1/family/invites/accept/route.ts`:

```ts
import { body, route } from "@/server/http";
import { acceptInvite } from "@scholarcrew/core/family";
import { AcceptInviteInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  acceptInvite(deps, actor, await body(req, AcceptInviteInput)),
);
```

`apps/web/src/app/api/v1/family/invites/preview/route.ts` (D37: `/family/join` shows who invited you before sign-in; the token is the credential, so it's limited per IP like the other token routes):

```ts
import { query, route } from "@/server/http";
import { previewInvite } from "@scholarcrew/core/family";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.strictObject({ token: z.string().min(1).max(200) });

/** { inviterFirstName, memberRole, expiresAt }; unknown, expired, or used tokens are 404. Never the invitee's email. */
export const GET = route(
  { auth: "none", rate: { key: "family.invite-preview", limit: 30, windowSeconds: 3600 } },
  async ({ deps, url }) => previewInvite(deps, query(url, Query).token),
);
```

`apps/web/src/app/api/v1/family/members/[userId]/route.ts`:

```ts
import { route } from "@/server/http";
import { removeMember } from "@scholarcrew/core/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ userId: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await removeMember(deps, actor, params.userId);
});
```

`apps/web/src/app/api/v1/family/leave/route.ts`:

```ts
import { route } from "@/server/http";
import { leaveFamily } from "@scholarcrew/core/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor }) => {
  await leaveFamily(deps, actor);
});
```

`apps/web/src/app/api/v1/family/share-settings/route.ts` (`studentId` defaults to the caller, so a student's settings screen needs no id; `studentIdParam` is the same parser plan 14's read routes use):

```ts
import { body, route, studentIdParam } from "@/server/http";
import { getShareSettings, updateShareSettings } from "@scholarcrew/core/family";
import { ShareSettingsInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  getShareSettings(deps, actor, studentIdParam({ actor, url })),
);

export const PUT = route({ auth: "user" }, async ({ req, deps, actor }) =>
  updateShareSettings(deps, actor, await body(req, ShareSettingsInput)),
);
```

`apps/web/src/app/api/v1/family/budget/route.ts`:

```ts
import { body, route } from "@/server/http";
import { getBudget, setBudget } from "@scholarcrew/core/family";
import { FamilyBudgetInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** FamilyBudget, or null before a parent shares one. */
export const GET = route({ auth: "user" }, async ({ deps, actor }) => getBudget(deps, actor));

export const PUT = route({ auth: "user" }, async ({ req, deps, actor }) =>
  setBudget(deps, actor, await body(req, FamilyBudgetInput)),
);
```

`apps/web/src/app/api/v1/family/tasks/route.ts`:

```ts
import { route } from "@/server/http";
import { listTasks } from "@scholarcrew/core/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listTasks(deps, actor));
```

`apps/web/src/app/api/v1/family/tasks/[id]/route.ts`:

```ts
import { body, route } from "@/server/http";
import { updateTask } from "@scholarcrew/core/family";
import { FamilyTaskPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ req, deps, actor, params }) =>
  updateTask(deps, actor, params.id, await body(req, FamilyTaskPatch)),
);
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 9 files, 87 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/family
git commit -m "feat(web): family invite, membership, share settings, budget, and task routes"
```

### M11: Helper links, notifications, notification preferences

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/helper-links/helper-links.test.ts`:

```ts
import { resolveHelperToken } from "@scholarcrew/core/helpers";
import { notify } from "@scholarcrew/core/notifications";
import {
  type HelperLink,
  type HelperLinkCreated,
  type Notification,
  type NotificationPrefs,
  systemActor,
} from "@scholarcrew/domain";
import { NO_PARAMS, params, readJson, request, signedInParent, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { POST as markRead } from "../notifications/[id]/read/route";
import { GET as listNotifications } from "../notifications/route";
import { GET as getPrefs, PATCH as patchPrefs } from "../notification-prefs/route";
import { DELETE as revokeLink } from "./[id]/route";
import { GET as listLinks, POST as createLink } from "./route";

const deps = useTestDeps();
const LINK = { label: "Ms. Rivera", helperRole: "recommender", scope: ["deadlines", "activities"] };

const create = (cookie: string, body: unknown) =>
  createLink(request("/helper-links", { method: "POST", cookie, body }), NO_PARAMS);

describe("helper links", () => {
  it("creates a scoped read-only link and shows the URL only once (HL-01)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await create(cookie, LINK);
    expect(res.status).toBe(201);
    const created = await readJson<HelperLinkCreated>(res);
    expect(created.url.startsWith("http://localhost:3000/h/")).toBe(true);
    expect(created.link).toMatchObject({ scope: ["deadlines", "activities"], expiresAt: "2026-11-05T15:00:00.000Z" });
    const listed = await listLinks(request("/helper-links", { cookie }), NO_PARAMS);
    const text = await listed.text();
    expect((JSON.parse(text) as HelperLink[]).map((l) => l.id)).toEqual([created.link.id]);
    expect(text).not.toContain(created.url.split("/h/")[1] ?? "missing");
  });

  it("refuses private scopes, long expiry, and non-students", async () => {
    const { cookie } = await signedInStudent(deps().db);
    expect((await create(cookie, { ...LINK, scope: ["essays"] })).status).toBe(400);
    expect((await create(cookie, { ...LINK, expiresInDays: 120 })).status).toBe(400);
    const parent = await signedInParent(deps().db);
    expect((await create(parent.cookie, LINK)).status).toBe(403);
  });

  it("revoking kills the token at once (HL-04); others get 404", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const created = await readJson<HelperLinkCreated>(await create(cookie, LINK));
    const token = created.url.split("/h/")[1] ?? "";
    expect(await resolveHelperToken(deps(), token)).not.toBeNull();
    const id = params({ id: created.link.id });
    const path = `/helper-links/${created.link.id}`;
    expect((await revokeLink(request(path, { method: "DELETE", cookie: other.cookie }), id)).status).toBe(404);
    expect((await revokeLink(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
    expect(await resolveHelperToken(deps(), token)).toBeNull();
  });
});

describe("notifications", () => {
  it("lists notifications and marks one read", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const sent = await notify(deps(), systemActor("test"), {
      userId: user.id,
      kind: "new_matches",
      title: "3 new matches",
      body: "Scout found 3 scholarships worth $4,500.",
      dedupeKey: "matches:test",
    });
    const id = sent?.id ?? "";
    const list = async (c: string) =>
      readJson<Notification[]>(await listNotifications(request("/notifications", { cookie: c }), NO_PARAMS));
    expect((await list(cookie)).map((n) => n.readAt)).toEqual([null]);
    const read = (c: string) => markRead(request(`/notifications/${id}/read`, { method: "POST", cookie: c }), params({ id }));
    expect((await read(other.cookie)).status).toBe(404);
    expect((await read(cookie)).status).toBe(204);
    expect((await list(cookie)).map((n) => n.readAt)).toEqual(["2026-10-06T15:00:00.000Z"]);
  });

  it("reads and updates preferences without echoing the phone number", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const prefs = await readJson<NotificationPrefs>(await getPrefs(request("/notification-prefs", { cookie }), NO_PARAMS));
    expect(prefs).toEqual({
      digestDay: 0,
      digestHour: 16,
      emailEnabled: true,
      smsEnabled: false,
      phoneSet: false,
      quietStartHour: 21,
      quietEndHour: 7,
    });
    const patch = (body: unknown) =>
      patchPrefs(request("/notification-prefs", { method: "PATCH", cookie, body }), NO_PARAMS);
    const res = await patch({ digestHour: 9, phone: "+15125550100" });
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ digestHour: 9, phoneSet: true });
    expect(text).not.toContain("5125550100");
    expect((await patch({ digestHour: 24 })).status).toBe(400);
    expect((await patch({ smsEnabled: true, phone: null })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test`
Expected: FAIL `src/app/api/v1/helper-links/helper-links.test.ts` with `Failed to resolve import "../notifications/[id]/read/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/helper-links/route.ts`:

```ts
import { body, json, route } from "@/server/http";
import { createHelperLink, listHelperLinks } from "@scholarcrew/core/helpers";
import { HelperLinkInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listHelperLinks(deps, actor));

/** The URL (with the token) is in this response only; the list never includes it. */
export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  json(await createHelperLink(deps, actor, await body(req, HelperLinkInput)), 201),
);
```

`apps/web/src/app/api/v1/helper-links/[id]/route.ts`:

```ts
import { route } from "@/server/http";
import { revokeHelperLink } from "@scholarcrew/core/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await revokeHelperLink(deps, actor, params.id);
});
```

`apps/web/src/app/api/v1/notifications/route.ts`:

```ts
import { route } from "@/server/http";
import { listNotifications } from "@scholarcrew/core/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listNotifications(deps, actor));
```

`apps/web/src/app/api/v1/notifications/[id]/read/route.ts`:

```ts
import { route } from "@/server/http";
import { markRead } from "@scholarcrew/core/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await markRead(deps, actor, params.id);
});
```

`apps/web/src/app/api/v1/notification-prefs/route.ts`:

```ts
import { body, route } from "@/server/http";
import { getPrefs, updatePrefs } from "@scholarcrew/core/notifications";
import { NotificationPrefsPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => getPrefs(deps, actor));

export const PATCH = route({ auth: "user" }, async ({ req, deps, actor }) =>
  updatePrefs(deps, actor, await body(req, NotificationPrefsPatch)),
);
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 10 files, 92 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/helper-links apps/web/src/app/api/v1/notifications apps/web/src/app/api/v1/notification-prefs
git commit -m "feat(web): helper link, notification, and notification preference routes"
```

### M12: Billing routes, Stripe webhook, sponsor codes

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/billing/billing.test.ts`:

```ts
import { createHmac } from "node:crypto";
import { setDepsForTests } from "@/server/deps";
import { sponsorCodes, subscriptions } from "@scholarcrew/db";
import type { BillingView, Subscription } from "@scholarcrew/domain";
import { NO_PARAMS, errorOf, fakeStripe, readJson, request, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { POST as checkout } from "./checkout/route";
import { POST as portal } from "./portal/route";
import { GET as getBilling } from "./route";
import { POST as redeem } from "./sponsor-code/route";
import { POST as webhook } from "./webhook/route";

const deps = useTestDeps();

function stripeSignature(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
}

function webhookRequest(payload: string, signature?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["stripe-signature"] = signature;
  return request("/billing/webhook", { method: "POST", origin: null, body: payload, headers });
}

function checkoutCompleted(userId: string): string {
  return JSON.stringify({
    id: "evt_test_1",
    created: 1791298800,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        mode: "subscription",
        payment_status: "paid",
        client_reference_id: userId,
        customer: "cus_test_1",
        subscription: "sub_test_1",
      },
    },
  });
}

async function billing(cookie: string): Promise<BillingView> {
  return readJson<BillingView>(await getBilling(request("/billing", { cookie }), NO_PARAMS));
}

describe("GET /billing", () => {
  it("returns the subscription and this month's usage", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const view = await billing(cookie);
    expect(view.subscription).toMatchObject({ plan: "free", status: "active", managedByStripe: false });
    expect(view.usage).toEqual({ month: "2026-10", crewRequests: 0, limit: 20, costMicros: 0 });
  });
});

describe("checkout and portal", () => {
  it("starts Stripe Checkout with the plan's price (BI-02, BI-03)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const start = (plan: string) => checkout(request("/billing/checkout", { method: "POST", cookie, body: { plan } }), NO_PARAMS);
    const family = await start("family");
    expect(await family.json()).toEqual({ url: "https://checkout.stripe.test/session/1" });
    await start("season_pass");
    const calls = fakeStripe(deps()).checkouts;
    expect(calls[0]).toMatchObject({
      priceId: "price_family_test",
      mode: "subscription",
      clientReferenceId: user.id,
      customerEmail: user.email,
      successUrl: "http://localhost:3000/settings?billing=success",
    });
    expect(calls[1]).toMatchObject({ priceId: "price_season_test", mode: "payment" });
    expect((await start("free")).status).toBe(400);
  });

  it("explains when billing isn't configured", async () => {
    const { cookie } = await signedInStudent(deps().db);
    setDepsForTests({ ...deps(), stripe: null });
    const res = await checkout(request("/billing/checkout", { method: "POST", cookie, body: { plan: "family" } }), NO_PARAMS);
    expect(res.status).toBe(500);
    expect(await errorOf(res)).toEqual({ code: "internal", message: "Billing isn't set up" });
  });

  it("opens the customer portal only for Stripe customers (BI-04)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const open = () => portal(request("/billing/portal", { method: "POST", cookie }), NO_PARAMS);
    expect((await open()).status).toBe(400);
    await deps().db.insert(subscriptions).values({ ownerId: user.id, plan: "family", status: "active", stripeCustomerId: "cus_1" });
    expect(await (await open()).json()).toEqual({ url: "https://billing.stripe.test/portal/1" });
    expect(fakeStripe(deps()).portals[0]?.customerId).toBe("cus_1");
  });
});

describe("POST /billing/webhook", () => {
  it("rejects missing and bad signatures with 400", async () => {
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "ping", data: { object: {} } });
    expect((await webhook(webhookRequest(payload), NO_PARAMS)).status).toBe(400);
    const bad = await webhook(webhookRequest(payload, "t=1,v1=deadbeef"), NO_PARAMS);
    expect(bad.status).toBe(400);
    expect((await errorOf(bad)).code).toBe("invalid_input");
  });

  it("applies a signed checkout.session.completed event", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const payload = checkoutCompleted(user.id);
    const res = await webhook(webhookRequest(payload, stripeSignature(payload, "whsec_test")), NO_PARAMS);
    expect(res.status).toBe(204);
    expect((await billing(cookie)).subscription).toMatchObject({ plan: "family", status: "active", managedByStripe: true });
  });

  it("doesn't exist while STRIPE_WEBHOOK_SECRET is empty, so events signed with an empty key do nothing", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    setDepsForTests({ ...deps(), config: { ...deps().config, stripeWebhookSecret: "" } });
    const payload = checkoutCompleted(user.id);
    const res = await webhook(webhookRequest(payload, stripeSignature(payload, "")), NO_PARAMS);
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe("not_found");
    expect((await billing(cookie)).subscription).toMatchObject({ plan: "free", managedByStripe: false });
  });
});

describe("POST /billing/sponsor-code", () => {
  it("grants the sponsor's plan once (BI-05)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    await deps().db.insert(sponsorCodes).values({
      code: "MAPLE-2026",
      sponsorName: "Maple ISD",
      plan: "family",
      seatsTotal: 5,
      expiresAt: new Date("2027-06-01T00:00:00.000Z"),
    });
    const use = (code: string, c = cookie) =>
      redeem(request("/billing/sponsor-code", { method: "POST", cookie: c, body: { code } }), NO_PARAMS);
    const res = await use("MAPLE-2026");
    expect(res.status).toBe(200);
    expect((await readJson<Subscription>(res)).plan).toBe("family");
    expect((await use("MAPLE-2026")).status).toBe(409);
    const other = await signedInStudent(deps().db);
    expect((await use("NOPE-1234", other.cookie)).status).toBe(404);
  });

  it("limits code guesses to 10 an hour (SE-04)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await redeem(
        request("/billing/sponsor-code", { method: "POST", cookie, body: { code: `GUESS-${i}` } }),
        NO_PARAMS,
      );
      statuses.push(res.status);
    }
    expect(statuses).toEqual([404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 429]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test`
Expected: FAIL `src/app/api/v1/billing/billing.test.ts` with `Failed to resolve import "./checkout/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/billing/route.ts`:

```ts
import { route } from "@/server/http";
import { getSubscription, getUsage } from "@scholarcrew/core/billing";
import type { BillingView } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }): Promise<BillingView> => {
  const subscription = await getSubscription(deps, actor);
  const usage = await getUsage(deps, actor);
  return { subscription, usage };
});
```

`apps/web/src/app/api/v1/billing/checkout/route.ts`:

```ts
import { body, route } from "@/server/http";
import { createCheckout } from "@scholarcrew/core/billing";
import { CheckoutInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  createCheckout(deps, actor, await body(req, CheckoutInput)),
);
```

`apps/web/src/app/api/v1/billing/portal/route.ts`:

```ts
import { route } from "@/server/http";
import { createPortal } from "@scholarcrew/core/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor }) => createPortal(deps, actor));
```

`apps/web/src/app/api/v1/billing/webhook/route.ts` (Stripe calls it; the signature over the raw body is the auth, so without a webhook secret the route refuses to exist rather than verify against an empty HMAC key):

```ts
import { stripeSecretKey } from "@/server/deps";
import { JSON_BODY_LIMIT, readTextCapped, route } from "@/server/http";
import { applyStripeEvent, parseStripeWebhook } from "@scholarcrew/core/billing";
import { invalidInput, notFound, systemActor } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "none", csrf: false }, async ({ req, deps }) => {
  if (!deps.config.stripeWebhookSecret) throw notFound();
  const signature = req.headers.get("stripe-signature");
  if (!signature) throw invalidInput("Missing Stripe signature");
  const raw = await readTextCapped(req, JSON_BODY_LIMIT);
  const event = parseStripeWebhook(raw, signature, deps.config.stripeWebhookSecret, stripeSecretKey());
  await applyStripeEvent(deps, systemActor("stripe_webhook"), event);
});
```

`apps/web/src/app/api/v1/billing/sponsor-code/route.ts` (codes are guessable strings, so attempts are limited per user):

```ts
import { body, route } from "@/server/http";
import { redeemSponsorCode } from "@scholarcrew/core/billing";
import { SponsorCodeInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(
  { auth: "user", rate: { key: "billing.sponsor", limit: 10, windowSeconds: 3600 } },
  async ({ req, deps, actor }) => {
    const { code } = await body(req, SponsorCodeInput);
    return redeemSponsorCode(deps, actor, code);
  },
);
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 11 files, 101 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/billing
git commit -m "feat(web): billing, checkout, portal, Stripe webhook, and sponsor code routes"
```

### M13: Document upload, metadata, download, delete

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/documents/documents.test.ts`:

```ts
import { setDepsForTests } from "@/server/deps";
import { fixedClock } from "@scholarcrew/core/shared";
import { documents } from "@scholarcrew/db";
import { type DocumentMeta, MAX_UPLOAD_BYTES } from "@scholarcrew/domain";
import { NO_PARAMS, chunkedRequest, errorOf, params, readJson, request, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as download } from "./[id]/download/route";
import { DELETE as deleteDocument, GET as getDocument } from "./[id]/route";
import { GET as listDocuments, POST as upload } from "./route";

const deps = useTestDeps();

function form(kind: string | null, file: File | null): FormData {
  const data = new FormData();
  if (kind !== null) data.set("kind", kind);
  if (file) data.set("file", file);
  return data;
}

const send = (cookie: string, body: FormData | string) =>
  upload(request("/documents", { method: "POST", cookie, body }), NO_PARAMS);

describe("documents", () => {
  it("rejects declared PDF and image types that disagree with the content", async () => {
    const { cookie } = await signedInStudent(deps().db);
    expect((await send(cookie, form("other", new File(["plain text"], "fake.pdf", { type: "application/pdf" })))).status).toBe(400);
    expect((await send(cookie, form("other", new File(["plain text"], "fake.png", { type: "image/png" })))).status).toBe(400);
    expect(await deps().db.select().from(documents)).toEqual([]);
  });

  it("uploads, reads, downloads, and deletes a document", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await send(cookie, form("transcript", new File(["Maya transcript"], "transcript.txt", { type: "text/plain" })));
    expect(res.status).toBe(201);
    const meta = await readJson<DocumentMeta>(res);
    expect(meta).toMatchObject({ kind: "transcript", filename: "transcript.txt", mime: "text/plain", sizeBytes: 15, parseStatus: "none" });
    const id = params({ id: meta.id });

    expect((await readJson<DocumentMeta>(await getDocument(request(`/documents/${meta.id}`, { cookie }), id))).id).toBe(meta.id);

    const file = await download(request(`/documents/${meta.id}/download`, { cookie }), id);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("text/plain");
    expect(file.headers.get("content-disposition")).toBe("attachment; filename=\"transcript.txt\"; filename*=UTF-8''transcript.txt");
    expect(file.headers.get("cache-control")).toBe("no-store");
    expect(await file.text()).toBe("Maya transcript");

    expect((await deleteDocument(request(`/documents/${meta.id}`, { method: "DELETE", cookie }), id)).status).toBe(204);
    expect((await getDocument(request(`/documents/${meta.id}`, { cookie }), id)).status).toBe(404);
  });

  it("keeps binary files byte for byte", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0x10, 0x80]);
    const meta = await readJson<DocumentMeta>(
      await send(cookie, form("award_letter", new File([bytes], "aid.pdf", { type: "application/pdf" }))),
    );
    const file = await download(request(`/documents/${meta.id}/download`, { cookie }), params({ id: meta.id }));
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });

  it("rejects files over 10 MB with 413, from Content-Length before reading and from the file size", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.pdf", { type: "application/pdf" });
    const res = await send(cookie, form("other", big));
    expect(res.status).toBe(413);
    expect((await errorOf(res)).message).toBe("Files can be up to 10 MB");
    const small = form("other", new File(["x"], "a.txt", { type: "text/plain" }));
    const declared = await upload(
      request("/documents", { method: "POST", cookie, body: small, headers: { "content-length": String(MAX_UPLOAD_BYTES + 70_000) } }),
      NO_PARAMS,
    );
    expect(declared.status).toBe(413);
    expect(await deps().db.select().from(documents)).toEqual([]);
  });

  it("stops reading a chunked upload with no Content-Length once it passes the cap", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const { req, pulled } = chunkedRequest("/documents", {
      cookie,
      chunk: new Uint8Array(1024 * 1024),
      count: 20,
      headers: { "content-type": "multipart/form-data; boundary=scholarcrew" },
    });
    const res = await upload(req, NO_PARAMS);
    expect(res.status).toBe(413);
    expect((await errorOf(res)).message).toBe("Files can be up to 10 MB");
    expect(pulled()).toBeLessThan(20);
    expect(await deps().db.select().from(documents)).toEqual([]);
  });

  it("lists only the caller's own documents, newest first (D27)", async () => {
    const owner = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const txt = (name: string) => new File([name], name, { type: "text/plain" });
    const older = await readJson<DocumentMeta>(await send(owner.cookie, form("transcript", txt("old.txt"))));
    setDepsForTests({ ...deps(), clock: fixedClock("2026-10-06T16:00:00.000Z") });
    const newer = await readJson<DocumentMeta>(await send(owner.cookie, form("resume", txt("new.txt"))));
    await send(other.cookie, form("other", txt("theirs.txt")));
    const list = await readJson<DocumentMeta[]>(await listDocuments(request("/documents", { cookie: owner.cookie }), NO_PARAMS));
    expect(list.map((d) => d.id)).toEqual([newer.id, older.id]);
    expect((await listDocuments(request("/documents"), NO_PARAMS)).status).toBe(401);
  });

  it("rejects missing files, unknown kinds, unsupported types, and non-multipart bodies", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const txt = () => new File(["x"], "a.txt", { type: "text/plain" });
    expect((await send(cookie, form("transcript", null))).status).toBe(400);
    expect((await send(cookie, form(null, txt()))).status).toBe(400);
    expect((await send(cookie, form("selfie", txt()))).status).toBe(400);
    expect((await send(cookie, form("other", new File(["PK"], "a.zip", { type: "application/zip" })))).status).toBe(400);
    expect((await send(cookie, JSON.stringify({ kind: "other" }))).status).toBe(400);
  });

  it("is owner-only: other users get 404", async () => {
    const owner = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const meta = await readJson<DocumentMeta>(
      await send(owner.cookie, form("resume", new File(["cv"], "cv.txt", { type: "text/plain" }))),
    );
    const id = params({ id: meta.id });
    expect((await getDocument(request(`/documents/${meta.id}`, { cookie: other.cookie }), id)).status).toBe(404);
    expect((await download(request(`/documents/${meta.id}/download`, { cookie: other.cookie }), id)).status).toBe(404);
    const del = request(`/documents/${meta.id}`, { method: "DELETE", cookie: other.cookie });
    expect((await deleteDocument(del, id)).status).toBe(404);
  });

  it("limits uploads to 20 an hour per user (SE-04)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const res = await send(cookie, form("other", new File([`note ${i}`], `n${i}.txt`, { type: "text/plain" })));
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 201)).toHaveLength(20);
    expect(statuses[20]).toBe(429);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test`
Expected: FAIL `src/app/api/v1/documents/documents.test.ts` with `Failed to resolve import "./[id]/download/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/documents/route.ts` (the body is read through a byte cap of 10 MB plus multipart overhead, so a chunked request with no `Content-Length` can't make the process buffer more than that; `File.size` is checked again after parsing):

```ts
import { PayloadTooLargeError, json, readBytesCapped, route } from "@/server/http";
import { listDocuments, uploadDocument } from "@scholarcrew/core/documents";
import { DocumentKind, MAX_UPLOAD_BYTES, invalidInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Room for the multipart boundary and part headers on top of the file itself.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const TOO_BIG = "Files can be up to 10 MB";

/** D27: the caller's own uploads, newest first (Settings and the offer upload picker). */
export const GET = route({ auth: "user" }, async ({ deps, actor }) => listDocuments(deps, actor));

export const POST = route(
  { auth: "user", rate: { key: "documents.upload", limit: 20, windowSeconds: 3600 } },
  async ({ req, deps, actor }) => {
    const raw = await readBytesCapped(req, MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES, TOO_BIG);
    let form: FormData;
    try {
      const contentType = req.headers.get("content-type") ?? "";
      form = await new Response(raw, { headers: { "content-type": contentType } }).formData();
    } catch {
      throw invalidInput("Send the file as multipart form data");
    }
    const kind = DocumentKind.safeParse(form.get("kind"));
    if (!kind.success) throw invalidInput("Choose a document type");
    const file = form.get("file");
    if (!(file instanceof File)) throw invalidInput("Attach a file");
    if (file.size > MAX_UPLOAD_BYTES) throw new PayloadTooLargeError(TOO_BIG);
    const mime = (file.type.split(";")[0] ?? "").trim().toLowerCase();
    const bytes = Buffer.from(await file.arrayBuffer());
    return json(await uploadDocument(deps, actor, { kind: kind.data, filename: file.name, mime, bytes }), 201);
  },
);
```

`apps/web/src/app/api/v1/documents/[id]/route.ts`:

```ts
import { route } from "@/server/http";
import { deleteDocument, getDocument } from "@scholarcrew/core/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  getDocument(deps, actor, params.id),
);

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await deleteDocument(deps, actor, params.id);
});
```

`apps/web/src/app/api/v1/documents/[id]/download/route.ts`:

```ts
import { fileResponse, route } from "@/server/http";
import { readDocumentBytes } from "@scholarcrew/core/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  const { meta, bytes } = await readDocumentBytes(deps, actor, params.id);
  return fileResponse(bytes, meta.mime, meta.filename);
});
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 12 files, 110 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/documents
git commit -m "feat(web): encrypted document upload, download, and delete routes"
```

### M14: Account export, account deletion, extension tokens

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/account/account.test.ts`:

```ts
import { setDepsForTests } from "@/server/deps";
import { createApiToken, resolveApiToken } from "@scholarcrew/core/apitokens";
import { buildExport } from "@scholarcrew/core/account";
import { fixedClock } from "@scholarcrew/core/shared";
import { type ApiToken, type ApiTokenCreated, type ExportRecord, systemActor, userActor } from "@scholarcrew/domain";
import { NO_PARAMS, errorOf, params, readJson, request, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { DELETE as revokeToken } from "../extension/tokens/[id]/route";
import { GET as listTokens, POST as createToken } from "../extension/tokens/route";
import { GET as getMe } from "../me/route";
import { POST as requestExport } from "./export/route";
import { GET as getExport } from "./exports/[id]/route";
import { GET as getLatestExport } from "./exports/latest/route";
import { DELETE as deleteAccount } from "./route";

const deps = useTestDeps();

const askForExport = (cookie: string) => requestExport(request("/account/export", { method: "POST", cookie }), NO_PARAMS);

describe("account export (ME-08)", () => {
  it("records the request and queues the export job", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await askForExport(cookie);
    expect(res.status).toBe(201);
    const record = await readJson<ExportRecord>(res);
    expect(record).toMatchObject({ status: "queued", downloadUrl: null });
    expect(deps().jobs.sent).toEqual([{ name: "account.export", payload: { exportId: record.id } }]);
  });

  it("serves the file once it's ready, only to its owner", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const record = await readJson<ExportRecord>(await askForExport(cookie));
    const id = params({ id: record.id });
    const path = `/account/exports/${record.id}`;

    const pending = await getExport(request(path, { cookie }), id);
    expect(pending.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect((await readJson<ExportRecord>(pending)).status).toBe("queued");

    await buildExport(deps(), systemActor("test"), record.id);
    const file = await getExport(request(path, { cookie }), id);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toBe(
      "attachment; filename=\"scholarcrew-export-2026-10-06.json\"; filename*=UTF-8''scholarcrew-export-2026-10-06.json",
    );
    expect(file.headers.get("cache-control")).toBe("no-store");
    const contents = await readJson<{ generatedAt: string; markdown: string }>(file);
    expect(contents.generatedAt).toBe("2026-10-06T15:00:00.000Z");
    expect(typeof contents.markdown).toBe("string");

    expect((await getExport(request(path, { cookie: other.cookie }), id)).status).toBe(404);
  });

  it("serves the Markdown alone with ?format=md and refuses other formats (R3E-11)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const record = await readJson<ExportRecord>(await askForExport(cookie));
    const id = params({ id: record.id });
    const path = `/account/exports/${record.id}`;
    await buildExport(deps(), systemActor("test"), record.id);

    const md = await getExport(request(`${path}?format=md`, { cookie }), id);
    expect(md.status).toBe(200);
    expect(md.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(md.headers.get("content-disposition")).toBe(
      "attachment; filename=\"scholarcrew-export-2026-10-06.md\"; filename*=UTF-8''scholarcrew-export-2026-10-06.md",
    );
    expect(await md.text()).toMatch(/^# ScholarCrew export/);

    const asJson = await getExport(request(`${path}?format=json`, { cookie }), id);
    expect(asJson.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const pdf = await getExport(request(`${path}?format=pdf`, { cookie }), id);
    expect(pdf.status).toBe(400);
    expect((await errorOf(pdf)).code).toBe("invalid_input");
  });

  it("limits export requests to 5 a day (SE-04)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await askForExport(cookie)).status);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it("returns the caller's newest unexpired export, or null (D27)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const latest = async (c: string) =>
      readJson<ExportRecord | null>(await getLatestExport(request("/account/exports/latest", { cookie: c }), NO_PARAMS));
    expect(await latest(cookie)).toBeNull();
    await askForExport(cookie);
    setDepsForTests({ ...deps(), clock: fixedClock("2026-10-06T16:00:00.000Z") });
    const newer = await readJson<ExportRecord>(await askForExport(cookie));
    expect((await latest(cookie))?.id).toBe(newer.id);
    expect(await latest(other.cookie)).toBeNull();
    expect((await getLatestExport(request("/account/exports/latest"), NO_PARAMS)).status).toBe(401);
  });
});

describe("DELETE /account (ID-05)", () => {
  it("revokes the session and extension tokens at once and clears the cookie", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const token = await createApiToken(deps(), userActor(user.id, "student"), {
      label: "Laptop",
      scopes: ["autofill"],
    });
    const evil = await deleteAccount(request("/account", { method: "DELETE", cookie, origin: "https://evil.example" }), NO_PARAMS);
    expect(evil.status).toBe(403);
    expect((await getMe(request("/me", { cookie }), NO_PARAMS)).status).toBe(200);

    const res = await deleteAccount(request("/account", { method: "DELETE", cookie }), NO_PARAMS);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toBe("sc_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
    expect((await getMe(request("/me", { cookie }), NO_PARAMS)).status).toBe(401);
    expect(await resolveApiToken(deps(), token.secret)).toBeNull();
  });
});

describe("extension tokens", () => {
  it("returns the secret once, lists tokens without it, and revokes them", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const res = await createToken(
      request("/extension/tokens", { method: "POST", cookie, body: { label: "Chrome on laptop" } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(201);
    const created = await readJson<ApiTokenCreated>(res);
    expect(created.secret).toMatch(/^sct_[A-Za-z0-9_-]{8,200}$/);
    expect(created.token.scopes).toEqual(["autofill", "save_page"]);
    expect(await resolveApiToken(deps(), created.secret)).not.toBeNull();

    const listed = await (await listTokens(request("/extension/tokens", { cookie }), NO_PARAMS)).text();
    expect((JSON.parse(listed) as ApiToken[]).map((t) => t.id)).toEqual([created.token.id]);
    expect(listed).not.toContain(created.secret);

    const id = params({ id: created.token.id });
    const path = `/extension/tokens/${created.token.id}`;
    expect((await revokeToken(request(path, { method: "DELETE", cookie: other.cookie }), id)).status).toBe(404);
    expect((await revokeToken(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
    expect(await resolveApiToken(deps(), created.secret)).toBeNull();
    const after = await readJson<ApiToken[]>(await listTokens(request("/extension/tokens", { cookie }), NO_PARAMS));
    expect(after[0]?.revokedAt).toBe("2026-10-06T15:00:00.000Z");

    const blank = await createToken(request("/extension/tokens", { method: "POST", cookie, body: { label: "" } }), NO_PARAMS);
    expect(blank.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test`
Expected: FAIL `src/app/api/v1/account/account.test.ts` with `Failed to resolve import "../extension/tokens/[id]/route"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/v1/account/route.ts`:

```ts
import { clearSessionCookie } from "@/server/cookies";
import { route } from "@/server/http";
import { deleteAccount } from "@scholarcrew/core/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Blocks the account and deletes its sessions now; the purge job hard-deletes rows within 7 days. */
export const DELETE = route({ auth: "user" }, async ({ deps, actor }) => {
  await deleteAccount(deps, actor);
  return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookie(), "cache-control": "no-store" } });
});
```

`apps/web/src/app/api/v1/account/export/route.ts` (each export is a full data dump job, so requests are limited):

```ts
import { json, route } from "@/server/http";
import { requestExport } from "@scholarcrew/core/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(
  { auth: "user", rate: { key: "account.export", limit: 5, windowSeconds: 86_400 } },
  async ({ deps, actor }) => json(await requestExport(deps, actor), 201),
);
```

`apps/web/src/app/api/v1/account/exports/[id]/route.ts` (ExportRecord while it's being built, the JSON + Markdown file once it's ready; `?format=md` serves the Markdown alone, R3E-11):

```ts
import { fileResponse, query, route } from "@/server/http";
import { getExport } from "@scholarcrew/core/account";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Non-strict: only `format` is read. A missing format is the JSON file; anything but json or md is 400.
const ExportQuery = z.object({ format: z.enum(["json", "md"]).default("json") });

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params, url }) => {
  const { format } = query(url, ExportQuery);
  const { record, bytes } = await getExport(deps, actor, params.id);
  if (!bytes) return record;
  const name = `scholarcrew-export-${record.createdAt.slice(0, 10)}`;
  if (format === "md") {
    const { markdown } = JSON.parse(bytes.toString("utf8")) as { markdown: string };
    return fileResponse(Buffer.from(markdown, "utf8"), "text/markdown; charset=utf-8", `${name}.md`);
  }
  return fileResponse(bytes, "application/json; charset=utf-8", `${name}.json`);
});
```

`apps/web/src/app/api/v1/account/exports/latest/route.ts` (a static segment next to `[id]`, which Next matches first):

```ts
import { route } from "@/server/http";
import { latestExport } from "@scholarcrew/core/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** D27: Settings shows the newest export that hasn't expired (any status), or null. */
export const GET = route({ auth: "user" }, async ({ deps, actor }) => latestExport(deps, actor));
```

`apps/web/src/app/api/v1/extension/tokens/route.ts`:

```ts
import { body, json, route } from "@/server/http";
import { createApiToken, listApiTokens } from "@scholarcrew/core/apitokens";
import { ApiTokenInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listApiTokens(deps, actor));

/** The secret is in this response only; core stores its sha256. */
export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  json(await createApiToken(deps, actor, await body(req, ApiTokenInput)), 201),
);
```

`apps/web/src/app/api/v1/extension/tokens/[id]/route.ts`:

```ts
import { route } from "@/server/http";
import { revokeApiToken } from "@scholarcrew/core/apitokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await revokeApiToken(deps, actor, params.id);
});
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 13 files, 117 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/account apps/web/src/app/api/v1/extension/tokens
git commit -m "feat(web): account export, account deletion, and extension token routes"
```

### M15: Gate

- [ ] **Step 1: Format, then run the gate**

Run: `pnpm format && pnpm --filter @scholarcrew/web typecheck && pnpm db:up && pnpm db:wait && pnpm db:migrate:test && pnpm --filter @scholarcrew/web test && pnpm lint`
Expected: Biome rewrites only formatting and import order; `tsc --noEmit` prints nothing; `Test Files 13 passed (13)`, `Tests 117 passed (117)`; `pnpm lint` reports no errors.

- [ ] **Step 2: Check the route conventions**

Run: `test "$(find apps/web/src/app/api/v1 -name route.ts | wc -l | tr -d ' ')" = 46 && find apps/web/src/app/api/v1 -name route.ts | while IFS= read -r f; do grep -q '^export const runtime = "nodejs";$' "$f" && grep -q '^export const dynamic = "force-dynamic";$' "$f" || echo "missing segment config: $f"; done`
Expected: exits 0 and prints nothing (46 route files, all with both segment exports). `tr` strips the padding macOS `wc` adds, and `read -r` keeps `[id]` paths intact under zsh.

Run: `! grep -rln "process.env" apps/web/src --include='*.ts' --include='*.tsx' | grep -v '^apps/web/src/server/deps.ts$'`
Expected: exits 0 and prints nothing. The `!` turns grep's "no match" exit 1 into the passing 0.

- [ ] **Step 3: Commit any formatting changes**

```bash
git add apps/web
git commit -m "chore(web): format plan 13 files"
```

Skip the commit if `git status --short apps/web` prints nothing.

## Success Criteria

- [ ] `pnpm --filter @scholarcrew/web typecheck` exits 0.
- [ ] `pnpm db:up && pnpm db:wait && pnpm db:migrate:test && pnpm --filter @scholarcrew/web test` exits 0 with 13 files and 117 tests passing.
- [ ] `pnpm lint` exits 0.
- [ ] All 46 route files under `apps/web/src/app/api/v1` that this plan owns export `runtime = "nodejs"` and `dynamic = "force-dynamic"` and nothing but HTTP method handlers besides those (both M15 Step 2 commands exit 0 and print nothing).
- [ ] `process.env` appears only in `apps/web/src/server/deps.ts` under `src/` (plus `next.config.ts`, which loads the root `.env` under `next dev` only).

## Testing Requirements

Command: `pnpm --filter @scholarcrew/web test` (Vitest, node environment, `fileParallelism: false`, `globalSetup` migrates `TEST_DATABASE_URL`, `setupFiles` truncates every table before each test and resets the deps override, env stubs, and spies after each). Expected: `Test Files 13 passed (13)`, `Tests 117 passed (117)`.

What the tests prove:

- `test/config.test.ts` (6): every workspace dependency is in `transpilePackages`; `pg-boss` and `postgres` are server-external and direct dependencies; `next start` loads the root `.env` with `--env-file-if-exists` and `next.config.ts` loads it only under `next dev` (D12, D17); security headers on `/:path*`; no tracker SDK in the manifest (SE-05).
- `src/server/deps.test.ts` (11): config from env (trailing slash trimmed, 32-byte key, 30-day sessions, price ids, webhook secret); Stripe gateway only with a key; dev-outbox email without a Resend key and Resend with one; missing or malformed `DATABASE_URL`, `APP_URL`, `ENCRYPTION_KEY` throw before a pool opens; the lazy jobs client starts pg-boss once and retries a failed start; `getDeps()` refuses env under Vitest; `devRoutesEnabled` needs `ENABLE_DEV_ROUTES=1` and a non-production `NODE_ENV`.
- `src/server/http.test.ts` (24): `json` headers; `AppError`, `ZodError`, and unknown errors map to the section 3 body and status (unknown → 500 "Something went wrong" plus one JSON log line); `rate_limited` with `details.retryAfterSeconds` sends `Retry-After` and other codes don't (R3A-11); 204/passthrough/json results and awaited params; `user` (401 without a live session, 401 after expiry), `admin` (401 / `not_found` / actor), `optional`, `bearer` (token actor and scopes, cookies ignored, `requireScope` 403); the Origin check on cookie-authenticated mutations (ID-06) and its exemptions; rate-limit keys by the right-most `X-Forwarded-For` hop (a rotated first hop lands in the same bucket), `X-Real-IP`, `unknown`, or user id, with 429 after the limit; `body` and `query` validation; JSON bodies over 256 KB (64 KB with `PUBLIC_BODY_LIMIT`) are 413 whether the size is declared, undeclared, or chunked, and a chunked body stops being read past the cap; `readTextCapped` with a custom message; `studentIdParam` defaults, valid ids, 400 on a bad id (D23); `parseCookie`; download headers with a safe filename and an RFC 8187 `filename*` that escapes `'()*` (R3A-25); extension CORS.
- `src/server/session.test.ts` (3): exact Set-Cookie values (ID-02); `getPageActor` reads `next/headers`; `requirePageActor` redirects to `/sign-in` and 404s the wrong role.
- `test/middleware.test.ts` (5): redirect to `/sign-in?next=<path+query>` without a cookie; pass-through with one, forwarding `x-pathname` and overwriting a client-sent value (D30); public paths, look-alikes, and `/family/join` (D37) pass; the matcher equals the prefix list and the cookie name equals core's.
- `auth.test.ts` (14): the full magic-link flow through routes (request → dev outbox → verify → cookie → `/me`), single-use links, `/onboarding` vs `/week` (a new parent invitee is created as a parent and lands on `/week`, R2I-2), bad tokens → `/sign-in?error=link`, a 70 KB magic-link body is 413 (public cap), per-email and per-IP limits (SE-04) with a numeric `Retry-After`, 401 without a session, sign out deletes the session, an expired or missing session still gets 204 and the clearing cookie (R3A-13), the dev route's env gate.
- `profile.test.ts` (8): profile read and patch, 400 `invalid_input` with issue details, origin check on a real route, onboarding queues `plan.weekly` and `sweep.student`, the under-13 block is 403 with `details.reason: "underage"` and ends the session (ID-03, R3A-17), student-only onboarding.
- `memory.test.ts` (7): fact create/edit/forget (forget removes the history), validation, owner-only facts, candidate confirm/reject, decisions, sensitive opt-ins as summaries only, parents never see a student's opt-ins and can share an income range in.
- `family.test.ts` (9): invite by email and accept, bad invites and tokens, invite limit, the signed-out invite preview (inviter first name, role, expiry, never the invitee's email; 404 once used or unknown; 400 without a token; 429 past 30 an hour per IP; D37), share settings (student edits, parent reads, others 404), budget (parent writes, student reads), tasks, remove member and leave.
- `helper-links.test.ts` (5): scoped link with the URL returned once (HL-01), private scopes and long expiry rejected, revoke kills the token at once (HL-04), notifications list and mark-read, prefs without echoing the phone.
- `billing.test.ts` (9): billing view, checkout prices and modes through the fake gateway (BI-02, BI-03), unconfigured billing, portal (BI-04), webhook with missing/bad signatures → 400 and a correctly signed event applied, the webhook is 404 and changes nothing while `STRIPE_WEBHOOK_SECRET` is empty (even for an event signed with an empty key), sponsor codes once (BI-05) and the guess limit.
- `documents.test.ts` (9): multipart upload → metadata → download round trip (text and binary), oversize → 413 (from a declared `Content-Length` before reading, and from the file size), a chunked upload with no `Content-Length` is cut off past 10 MB plus overhead with 413 and no row, bad parts → 400, the owner's list newest first and nobody else's (D27), owner-only, upload limit (SE-04).
- `account.test.ts` (7): export request queues `account.export`, the file downloads only when ready and only for its owner (ME-08), `?format=md` serves the Markdown alone and another format is 400 (R3E-11), the export limit, the latest unexpired export or null, own only (D27), delete account clears the cookie and the next request is 401 with tokens revoked (ID-05), extension token secret returned once, listed without the secret, revoked.

## Review Checklist

- [ ] `src/server/http.ts` exports `RouteAuth`, `RouteCtx`, `route`, `json`, `body`, `query`, `errorResponse` with the section 9.7 signatures; additions (`scopes`, `requireScope`, `fileResponse`, `cors`, `extensionPreflight`, `clientIp`, `studentIdParam`, `readBytesCapped`, `readTextCapped`, `PayloadTooLargeError`, `JSON_BODY_LIMIT`, `PUBLIC_BODY_LIMIT`, and `body()`'s optional `maxBytes`) don't change them.
- [ ] `src/server/session.ts` exports `getPageActor`, `requirePageActor`, `sessionCookie`, `clearSessionCookie`; `deps.ts` exports `getDeps(): CoreDeps`.
- [ ] `route()` checks Origin before auth for `user`, `admin`, and `optional` on every method except GET/HEAD/OPTIONS unless `csrf: false`; bearer and public routes skip it unless `csrf: true` forces the check (magic-link).
- [ ] Admin routes answer `not_found` to signed-in non-admins and 401 to signed-out callers.
- [ ] Rate-limit keys are `${key}:${userId}` for signed-in callers and `${key}:${ip}` otherwise, where `ip` is the right-most `X-Forwarded-For` entry; the deployment's proxy appends the client IP to `X-Forwarded-For` (or sets `X-Real-IP`).
- [ ] Every 429 `rate_limited` carries `Retry-After` (whole seconds from `details.retryAfterSeconds`), set in `errorResponse`.
- [ ] `POST /auth/sign-out` is `auth: "optional"` (Origin check kept) and always answers 204 with the clearing cookie.
- [ ] No route reads `next/headers`; only `session.ts` does.
- [ ] `middleware.ts` imports only `next/server`, `src/server/csp.ts`, and `src/server/protected.ts` (edge-safe).
- [ ] The web process creates pg-boss with role `sender` only, on first enqueue, and calls `ensureQueues` once.
- [ ] Downloads (documents, exports) send `Content-Disposition: attachment`, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`.
- [ ] The webhook is 404 while `STRIPE_WEBHOOK_SECRET` is empty, reads the raw body with `readTextCapped`, and never parses JSON before `parseStripeWebhook`.
- [ ] No route calls `req.text()`, `req.json()`, `req.formData()`, or `req.arrayBuffer()`; bodies go through `body()`, `readTextCapped`, or `readBytesCapped`, so a declared or streamed body past its cap is 413 before more than the cap is in memory. Uploads cap at `MAX_UPLOAD_BYTES` plus 64 KB, then check `File.size`.
- [ ] `/family/join` is the only page under a protected prefix that signed-out visitors reach (D37), and every pass-through carries `x-pathname` (D30).
- [ ] Secrets (session tokens, helper URLs, API token secrets, phone numbers) appear only in the one response that creates them and never in logs.
- [ ] `GET /dev/outbox/latest` is 404 unless `ENABLE_DEV_ROUTES === "1"` and `NODE_ENV !== "production"`.
