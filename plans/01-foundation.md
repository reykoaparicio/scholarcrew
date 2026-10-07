# Plan 01: Foundation (Agent A)

This plan creates the repository: git, the pnpm workspace, Turbo, the shared TypeScript and Biome config, the env template, the local Postgres database, the `@scholarcrew/scripts` workspace package (env check, wait-for-db, test database SQL), the README, and CI. It implements no feature IDs directly. It supports SE-05 (no trackers) by keeping the stack to the pinned list in `00-overview.md` section 2, with no analytics or ad SDKs, and the gate checks that.

Read `00-overview.md` sections 3 (conventions, including the Scripts paragraph), 4 (env), 5 (ownership), 13 (verification), and 14 (Biome and Turbo notes) first.

## Files

- Create: `.gitignore`, `.nvmrc`
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `biome.json`
- Create: `.env.example`, `docker-compose.yml`, `scripts/create-test-db.sql`
- Create: `scripts/package.json`, `scripts/tsconfig.json`, `scripts/vitest.config.ts`
- Create: `scripts/src/env-keys.ts`, `scripts/src/check-env.ts`, `scripts/src/check-env-cli.ts`
- Create: `scripts/src/retry.ts`, `scripts/src/wait-for-db.ts`
- Create: `README.md`
- Create: `.github/workflows/ci.yml`
- Test: `scripts/src/check-env.test.ts`, `scripts/src/retry.test.ts`, `scripts/src/repo-config.test.ts`
- Generated, not committed by this plan: `pnpm-lock.yaml` (the integrator commits it when the phase ends, per section 3 "Lockfile")

All commands run from the repo root unless a step says otherwise.

## Tasks

### A1: Initialize the repository

- [ ] **Step 1: Write the ignore file and Node pin, then init git**

The repo root already holds `docs/`, `design/`, and `plans/`. They go in the first commit.

`.gitignore`:

```gitignore
node_modules
.next
dist
.turbo
coverage
.env
.env.local
.env.*.local
playwright-report
test-results
evals/reports
*.log
*.tsbuildinfo
.DS_Store
```

`.nvmrc`:

```
22
```

Run: `git init -b main`
Expected: `Initialized empty Git repository in .../scholarcrew/.git/`

- [ ] **Step 2: Verify the ignore rules**

Run: `git check-ignore node_modules .next dist .turbo coverage .env playwright-report test-results evals/reports debug.log .DS_Store`
Expected: prints all 11 paths, exit 0.

Run: `git check-ignore .env.example; echo "exit=$?"`
Expected: `exit=1` (the template is tracked).

- [ ] **Step 3: Commit**

```bash
git add .gitignore .nvmrc docs design plans
git commit -m "chore(repo): initialize repository with docs, design, and plans"
git log --oneline
```

Expected: one commit. `git status --short` prints nothing.

### A2: Workspace root config

- [ ] **Step 1: Write the root config files**

`package.json`:

```json
{
  "name": "scholarcrew",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.33.0",
  "engines": { "node": ">=22.9" },
  "scripts": {
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test --concurrency=1",
    "lint": "biome check .",
    "format": "biome check --write .",
    "dev": "turbo run dev",
    "db:up": "docker compose up -d db",
    "db:wait": "pnpm --filter @scholarcrew/scripts wait-for-db",
    "db:generate": "pnpm --filter @scholarcrew/db generate",
    "db:migrate": "pnpm --filter @scholarcrew/db migrate",
    "db:migrate:test": "pnpm --filter @scholarcrew/db migrate:test",
    "db:seed": "pnpm --filter @scholarcrew/db seed",
    "e2e": "pnpm --filter @scholarcrew/e2e e2e",
    "evals": "pnpm --filter @scholarcrew/evals evals"
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "@types/node": "^22.15.0",
    "turbo": "^2.5.0",
    "typescript": "^5.8.3"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
  - apps/*
  - scripts
  - e2e
  - evals

# pnpm 10 skips dependency install scripts unless they are listed here.
onlyBuiltDependencies:
  - "@biomejs/biome"
  - esbuild
```

`turbo.json` (Turbo 2 runs tasks in strict env mode, so every section 4 key plus `CI` is passed through; without this, Vitest loses `TEST_DATABASE_URL` in CI):

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalPassThroughEnv": [
    "DATABASE_URL",
    "TEST_DATABASE_URL",
    "APP_URL",
    "ENCRYPTION_KEY",
    "ENCRYPTION_KEYS",
    "ANTHROPIC_API_KEY",
    "SCHOLARCREW_FAKE_MODEL",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_FAMILY",
    "STRIPE_PRICE_SEASON",
    "ENABLE_DEV_ROUTES",
    "CATALOG_ALLOWED_DOMAINS",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM",
    "NEXT_TELEMETRY_DISABLED",
    "CI"
  ],
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] },
    "typecheck": {},
    "test": { "cache": false },
    "lint": {},
    "dev": { "cache": false, "persistent": true }
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "skipLibCheck": true,
    "jsx": "preserve",
    "noEmit": true
  }
}
```

`biome.json` (exactly as in section 14):

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignore": ["**/drizzle/**", "**/.next/**", "**/dist/**", "design/**", "plans/**", "docs/**", "evals/reports/**", "**/playwright-report/**", "**/test-results/**"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 120 },
  "organizeImports": { "enabled": true },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "double", "trailingCommas": "all", "semicolons": "always" } }
}
```

- [ ] **Step 2: Install and see the tools link**

Run: `nvm use && corepack enable && pnpm install`
Expected: `devDependencies: + @biomejs/biome 1.9.4, + @types/node 22.x, + turbo 2.x, + typescript 5.x`, then `Done`. `pnpm-lock.yaml` appears; leave it uncommitted.

Run: `pnpm exec biome --version && pnpm exec turbo --version && pnpm exec tsc --version`
Expected: `Version: 1.9.4`, `2.x.y`, `Version 5.x.y`.

- [ ] **Step 3: Lint passes**

Run: `pnpm lint`
Expected: `Checked 4 files in <n>ms. No fixes applied.` and exit 0. Nothing under `design/`, `docs/`, or `plans/` is listed.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json biome.json
git commit -m "chore(repo): pnpm workspace, turbo, typescript, biome"
```

### A3: Env template and local Postgres

- [ ] **Step 1: Write the env template, compose file, and test database SQL**

`.env.example` (every section 4 key, in section 4 order; `repo-config.test.ts` in A4 enforces this):

```dotenv
# ScholarCrew environment. Copy to .env (never commit .env), then run:
#   pnpm --filter @scholarcrew/scripts check-env
# Key meanings: plans/00-overview.md section 4.

# Postgres from docker-compose.yml (pnpm db:up). Tests truncate every table in TEST_DATABASE_URL.
DATABASE_URL=postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew
TEST_DATABASE_URL=postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew_test
APP_URL=http://localhost:3000

# Placeholder only; check-env rejects it. Replace it with the output of: openssl rand -hex 32
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
# Optional keyring: first id encrypts; keep older ids until rotation completes.
ENCRYPTION_KEYS=

# SCHOLARCREW_FAKE_MODEL=1 uses the scripted model client (no API calls).
# Set it to 0 and fill in ANTHROPIC_API_KEY to use Claude.
ANTHROPIC_API_KEY=
SCHOLARCREW_FAKE_MODEL=1

# With RESEND_API_KEY empty, email goes to the dev_outbox table instead of being sent.
RESEND_API_KEY=
EMAIL_FROM="ScholarCrew <crew@scholarcrew.example>"

# Billing stays off in development until these are set.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_FAMILY=
STRIPE_PRICE_SEASON=

# 1 enables /api/v1/dev/* (dev and e2e only). Leave it unset in production.
ENABLE_DEV_ROUTES=1

# Comma-separated domain list for catalog research.
CATALOG_ALLOWED_DOMAINS=

# SMS reminders (R3). Empty in development.
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
```

`docker-compose.yml` (the healthcheck uses TCP on purpose: during first init Postgres listens only on its Unix socket while it runs the init scripts, so "healthy" means `scholarcrew_test` already exists):

```yaml
name: scholarcrew

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: scholarcrew
      POSTGRES_PASSWORD: scholarcrew
      POSTGRES_DB: scholarcrew
    ports:
      - "54320:5432"
    volumes:
      - scholarcrew-pgdata:/var/lib/postgresql/data
      - ./scripts/create-test-db.sql:/docker-entrypoint-initdb.d/01-create-test-db.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -U scholarcrew -d scholarcrew"]
      interval: 2s
      timeout: 3s
      retries: 30

volumes:
  scholarcrew-pgdata:
```

`scripts/create-test-db.sql`:

```sql
-- Postgres runs this once, when the data volume is first created (docker-compose.yml mounts it
-- into /docker-entrypoint-initdb.d). The test suites migrate this database and truncate it between tests.
CREATE DATABASE scholarcrew_test;
```

- [ ] **Step 2: Validate the compose file**

Run: `docker compose config --quiet`
Expected: no output, exit 0.

- [ ] **Step 3: Start Postgres and find both databases**

```bash
cp .env.example .env
docker compose up -d --wait db
docker compose exec -T db psql -U scholarcrew -lqt | cut -d '|' -f1 | grep -w scholarcrew_test
```

Expected: `Container scholarcrew-db-1  Healthy`, then the grep prints ` scholarcrew_test ` and exits 0.

- [ ] **Step 4: Commit**

```bash
git add .env.example docker-compose.yml scripts/create-test-db.sql
git commit -m "chore(repo): env template and local postgres"
```

### A4: Scripts package and env check

- [ ] **Step 1: Create the package files**

`scripts/package.json`:

```json
{
  "name": "@scholarcrew/scripts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "check-env": "tsx --env-file-if-exists=../.env src/check-env-cli.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "wait-for-db": "tsx --env-file-if-exists=../.env src/wait-for-db.ts"
  },
  "dependencies": { "postgres": "^3.4.7" },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "tsx": "^4.20.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

`scripts/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src"]
}
```

`scripts/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
```

Run: `pnpm install`
Expected: workspace links `@scholarcrew/scripts`; installs `postgres` 3.4.x, `tsx` 4.x, `vitest` 3.x.

- [ ] **Step 2: Write the failing tests**

`scripts/src/check-env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkEnv } from "./check-env";

const KEY_FORMAT = "ENCRYPTION_KEY must be 64 hex characters (32 bytes)";
const APP_URL_FORMAT = "APP_URL must be an http or https URL like http://localhost:3000";
const APP_URL_ORIGIN = "APP_URL must be an origin with no path or trailing slash";
const SAME_DATABASE = "TEST_DATABASE_URL must differ from DATABASE_URL (tests truncate every table)";
const FAKE_MODEL_VALUE = "SCHOLARCREW_FAKE_MODEL must be 0 or 1";

const valid: Record<string, string | undefined> = {
  DATABASE_URL: "postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew",
  TEST_DATABASE_URL: "postgres://scholarcrew:scholarcrew@localhost:54320/scholarcrew_test",
  APP_URL: "http://localhost:3000",
  ENCRYPTION_KEY: "0123456789abcdef".repeat(4),
  SCHOLARCREW_FAKE_MODEL: "1",
};

describe("checkEnv", () => {
  it("accepts a complete local setup", () => {
    expect(checkEnv(valid)).toEqual({ ok: true, missing: [], problems: [] });
  });

  it("lists every missing required key, in order", () => {
    const result = checkEnv({});
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["DATABASE_URL", "TEST_DATABASE_URL", "APP_URL", "ENCRYPTION_KEY"]);
    expect(result.problems).toEqual([]);
  });

  it("treats blank and undefined values as missing", () => {
    const result = checkEnv({ ...valid, DATABASE_URL: "   ", TEST_DATABASE_URL: undefined, APP_URL: "" });
    expect(result.missing).toEqual(["DATABASE_URL", "TEST_DATABASE_URL", "APP_URL"]);
    expect(result.problems).toEqual([]);
  });

  it("requires ENCRYPTION_KEY to be exactly 64 hex characters", () => {
    for (const bad of ["abc", "g".repeat(64), "a".repeat(63), "a".repeat(65)]) {
      expect(checkEnv({ ...valid, ENCRYPTION_KEY: bad }).problems).toEqual([KEY_FORMAT]);
    }
    expect(checkEnv({ ...valid, ENCRYPTION_KEY: "ABCDEF0123456789".repeat(4) }).ok).toBe(true);
    expect(checkEnv({ ...valid, ENCRYPTION_KEY: undefined, ENCRYPTION_KEYS: `2:${valid.ENCRYPTION_KEY}` }).ok).toBe(true);
    expect(checkEnv({ ...valid, ENCRYPTION_KEYS: `2:${"0".repeat(64)}` }).ok).toBe(false);
    expect(checkEnv({ ...valid, ENCRYPTION_KEYS: `2:${valid.ENCRYPTION_KEY},2:${valid.ENCRYPTION_KEY}` }).ok).toBe(false);
  });

  it("rejects the .env.example placeholder key without echoing it", () => {
    const placeholder = "0".repeat(64);
    const result = checkEnv({ ...valid, ENCRYPTION_KEY: placeholder });
    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("openssl rand -hex 32");
    expect(result.problems.join(" ")).not.toContain(placeholder);
  });

  it("requires APP_URL to be a bare http(s) origin", () => {
    const problemsFor = (appUrl: string) => checkEnv({ ...valid, APP_URL: appUrl }).problems;
    expect(problemsFor("not a url")).toEqual([APP_URL_FORMAT]);
    expect(problemsFor("localhost:3000")).toEqual([APP_URL_FORMAT]);
    expect(problemsFor("ftp://localhost:3000")).toEqual([APP_URL_FORMAT]);
    expect(problemsFor("http://localhost:3000/")).toEqual([APP_URL_ORIGIN]);
    expect(problemsFor("https://scholarcrew.example/app")).toEqual([APP_URL_ORIGIN]);
    expect(problemsFor("https://scholarcrew.example")).toEqual([]);
  });

  it("requires ANTHROPIC_API_KEY only when the fake model is off", () => {
    expect(checkEnv({ ...valid, SCHOLARCREW_FAKE_MODEL: "0" }).missing).toEqual(["ANTHROPIC_API_KEY"]);
    expect(checkEnv({ ...valid, SCHOLARCREW_FAKE_MODEL: "0", ANTHROPIC_API_KEY: "sk-ant-test" }).ok).toBe(true);
    expect(checkEnv({ ...valid, SCHOLARCREW_FAKE_MODEL: "1", ANTHROPIC_API_KEY: "" }).ok).toBe(true);
    expect(checkEnv({ ...valid, SCHOLARCREW_FAKE_MODEL: undefined }).ok).toBe(true);
  });

  it("rejects SCHOLARCREW_FAKE_MODEL values other than 0 or 1", () => {
    const result = checkEnv({ ...valid, SCHOLARCREW_FAKE_MODEL: "true" });
    expect(result.problems).toEqual([FAKE_MODEL_VALUE]);
  });

  it("refuses a test database URL equal to the dev database URL", () => {
    const result = checkEnv({ ...valid, TEST_DATABASE_URL: valid.DATABASE_URL });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([SAME_DATABASE]);
  });

  it("reports missing keys and bad values together", () => {
    const result = checkEnv({ APP_URL: "nope", ENCRYPTION_KEY: "123" });
    expect(result.missing).toEqual(["DATABASE_URL", "TEST_DATABASE_URL"]);
    expect(result.problems).toEqual([KEY_FORMAT, APP_URL_FORMAT]);
  });

  it("requires TEST_DATABASE_URL only outside production", () => {
    expect(checkEnv({ ...valid, TEST_DATABASE_URL: undefined, NODE_ENV: "production" })).toEqual({
      ok: true,
      missing: [],
      problems: [],
    });
    expect(checkEnv({ ...valid, TEST_DATABASE_URL: undefined, NODE_ENV: "development" }).missing).toEqual([
      "TEST_DATABASE_URL",
    ]);
  });
});
```

`scripts/src/repo-config.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @scholarcrew/scripts test`
Expected: FAIL with `Failed to resolve import "./check-env" from "src/check-env.test.ts"` (and the same for `./check-env` in `repo-config.test.ts`).

- [ ] **Step 4: Write the implementation**

`scripts/src/env-keys.ts`:

```ts
/** Every key in .env.example, in the order of plans/00-overview.md section 4. */
export const ENV_KEYS = [
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "APP_URL",
  "ENCRYPTION_KEY",
  "ENCRYPTION_KEYS",
  "ANTHROPIC_API_KEY",
  "SCHOLARCREW_FAKE_MODEL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_FAMILY",
  "STRIPE_PRICE_SEASON",
  "ENABLE_DEV_ROUTES",
  "CATALOG_ALLOWED_DOMAINS",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM",
] as const;
```

`scripts/src/check-env.ts`:

```ts
export interface EnvCheckResult {
  ok: boolean;
  missing: string[];
  problems: string[];
}

/** TEST_DATABASE_URL is dropped from this list when NODE_ENV is "production" (no test database there). */
const REQUIRED = ["DATABASE_URL", "TEST_DATABASE_URL", "APP_URL", "ENCRYPTION_KEY"] as const;

/** The value shipped in .env.example. Real setups replace it with `openssl rand -hex 32`. */
const PLACEHOLDER_KEY = "0".repeat(64);

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function encryptionKeyProblem(key: string): string | null {
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    return "ENCRYPTION_KEY must be 64 hex characters (32 bytes)";
  }
  if (key === PLACEHOLDER_KEY) {
    return "ENCRYPTION_KEY is still the placeholder; generate one with openssl rand -hex 32";
  }
  return null;
}

/** The web app compares the request Origin header to APP_URL, so APP_URL must be a bare origin. */
function appUrlProblem(value: string): string | null {
  const url = parseUrl(value);
  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return "APP_URL must be an http or https URL like http://localhost:3000";
  }
  if (url.origin !== value) {
    return "APP_URL must be an origin with no path or trailing slash";
  }
  return null;
}

/** Pure check over an env map. Messages name keys but never include their values. */
export function checkEnv(env: Record<string, string | undefined>): EnvCheckResult {
  const required: readonly string[] =
    env.NODE_ENV === "production" ? REQUIRED.filter((name) => name !== "TEST_DATABASE_URL") : REQUIRED;
  const missing: string[] = required.filter((name) => name === "ENCRYPTION_KEY"
    ? !present(env.ENCRYPTION_KEY) && !present(env.ENCRYPTION_KEYS) : !present(env[name]));
  const problems: string[] = [];

  const ring = env.ENCRYPTION_KEYS;
  if (present(ring)) {
    const seen = new Set<number>();
    for (const entry of ring.split(",")) {
      const match = /^(\d+):([0-9a-fA-F]{64})$/.exec(entry.trim());
      const id = match ? Number(match[1]) : 0;
      if (!match || id < 1 || id > 32767 || seen.has(id)) {
        problems.push("ENCRYPTION_KEYS must contain unique positive smallint ids and 64 hex character keys");
        break;
      }
      seen.add(id);
      if (encryptionKeyProblem(match[2]!) !== null || /^(..)(?:\1){31}$/i.test(match[2]!)) {
        problems.push("ENCRYPTION_KEYS contains a placeholder key; generate one with openssl rand -hex 32");
        break;
      }
    }
  }
  const key = env.ENCRYPTION_KEY;
  if (!present(ring) && present(key)) {
    const problem = encryptionKeyProblem(key);
    if (problem !== null) {
      problems.push(problem);
    }
  }

  const appUrl = env.APP_URL;
  if (present(appUrl)) {
    const problem = appUrlProblem(appUrl);
    if (problem !== null) {
      problems.push(problem);
    }
  }

  const dbUrl = env.DATABASE_URL;
  if (present(dbUrl) && dbUrl.trim() === env.TEST_DATABASE_URL?.trim()) {
    problems.push("TEST_DATABASE_URL must differ from DATABASE_URL (tests truncate every table)");
  }

  const fakeModel = env.SCHOLARCREW_FAKE_MODEL;
  if (present(fakeModel) && fakeModel !== "0" && fakeModel !== "1") {
    problems.push("SCHOLARCREW_FAKE_MODEL must be 0 or 1");
  }
  if (fakeModel === "0" && !present(env.ANTHROPIC_API_KEY)) {
    missing.push("ANTHROPIC_API_KEY");
  }

  return { ok: missing.length === 0 && problems.length === 0, missing, problems };
}
```

`scripts/src/check-env-cli.ts`:

```ts
import { checkEnv } from "./check-env";

const { ok, missing, problems } = checkEnv(process.env);

if (ok) {
  console.log(JSON.stringify({ level: "info", msg: "env ok" }));
} else {
  console.error(JSON.stringify({ level: "error", msg: "env check failed", missing, problems }));
  process.exitCode = 1;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @scholarcrew/scripts test && pnpm --filter @scholarcrew/scripts typecheck && pnpm lint`
Expected: `Test Files  2 passed (2)`, `Tests  14 passed (14)`; `tsc --noEmit` prints nothing; Biome `No fixes applied.`

Run: `pnpm typecheck && pnpm test`
Expected: Turbo runs `@scholarcrew/scripts#typecheck` and `@scholarcrew/scripts#test`, `Tasks: 1 successful, 1 total` each.

Run: `pnpm --filter @scholarcrew/scripts check-env; echo "exit=$?"`
Expected (`.env` from A3 still has the placeholder): `{"level":"error","msg":"env check failed","missing":[],"problems":["ENCRYPTION_KEY is still the placeholder; generate one with openssl rand -hex 32"]}` and `exit=1`.

```bash
KEY=$(openssl rand -hex 32) && sed -i.bak "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$KEY/" .env && rm .env.bak
pnpm --filter @scholarcrew/scripts check-env
```

Expected: `{"level":"info","msg":"env ok"}`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/package.json scripts/tsconfig.json scripts/vitest.config.ts scripts/src
git commit -m "feat(scripts): env check"
```

### A5: Wait for the database

- [ ] **Step 1: Write the failing test**

`scripts/src/retry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { errorText, waitUntilReady } from "./retry";

function failTimes(times: number) {
  let calls = 0;
  const probe = async () => {
    calls += 1;
    if (calls <= times) {
      throw new Error(`refused ${calls}`);
    }
  };
  return { probe, calls: () => calls };
}

async function run(probe: () => Promise<void>, attempts: number) {
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };
  const result = await waitUntilReady(probe, { attempts, delayMs: 1000, sleep });
  return { result, sleeps };
}

describe("waitUntilReady", () => {
  it("returns after the first successful probe without sleeping", async () => {
    const { result, sleeps } = await run(failTimes(0).probe, 30);
    expect(result).toEqual({ ok: true, attempts: 1 });
    expect(sleeps).toEqual([]);
  });

  it("sleeps between attempts until the probe succeeds", async () => {
    const flaky = failTimes(2);
    const { result, sleeps } = await run(flaky.probe, 30);
    expect(result).toEqual({ ok: true, attempts: 3 });
    expect(flaky.calls()).toBe(3);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("gives up after the last attempt and reports the last error", async () => {
    const down = failTimes(100);
    const { result, sleeps } = await run(down.probe, 30);
    expect(result).toEqual({ ok: false, attempts: 30, lastError: "refused 30" });
    expect(down.calls()).toBe(30);
    expect(sleeps).toHaveLength(29);
  });

  it("makes no attempts when attempts is 0", async () => {
    const never = failTimes(0);
    const { result, sleeps } = await run(never.probe, 0);
    expect(result).toEqual({ ok: false, attempts: 0, lastError: "no attempts made" });
    expect(never.calls()).toBe(0);
    expect(sleeps).toEqual([]);
  });
});

describe("errorText", () => {
  it("uses the message, then the error code, then the error name", () => {
    const refused = Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" });
    expect(errorText(new Error("connect ECONNREFUSED"))).toBe("connect ECONNREFUSED");
    expect(errorText(refused)).toBe("ECONNREFUSED");
    expect(errorText(new AggregateError([], ""))).toBe("AggregateError");
    expect(errorText("plain string")).toBe("plain string");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @scholarcrew/scripts test`
Expected: FAIL with `Failed to resolve import "./retry" from "src/retry.test.ts"`.

- [ ] **Step 3: Write the implementation**

`scripts/src/retry.ts`:

```ts
export interface WaitOptions {
  attempts: number;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
}

export type WaitResult = { ok: true; attempts: number } | { ok: false; attempts: number; lastError: string };

/** Node reports a refused dual-stack connect as an AggregateError with an empty message. */
export function errorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  if (error.message !== "") {
    return error.message;
  }
  const code = "code" in error ? error.code : undefined;
  return typeof code === "string" ? code : error.name;
}

/** Calls probe until it resolves. Sleeps delayMs between attempts, never after the last one. */
export async function waitUntilReady(probe: () => Promise<void>, opts: WaitOptions): Promise<WaitResult> {
  let lastError = "no attempts made";
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      await probe();
      return { ok: true, attempts: attempt };
    } catch (error) {
      lastError = errorText(error);
    }
    if (attempt < opts.attempts) {
      await opts.sleep(opts.delayMs);
    }
  }
  return { ok: false, attempts: opts.attempts, lastError };
}
```

`scripts/src/wait-for-db.ts`:

```ts
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";
import { waitUntilReady } from "./retry";

const OPTIONS = { attempts: 30, delayMs: 1000, sleep: (ms: number) => delay(ms) };

function log(entry: Record<string, unknown>): void {
  const line = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === "") {
    log({ level: "error", msg: "DATABASE_URL is not set in .env" });
    return 1;
  }

  // A fresh client per attempt, closed every time, so a failed connect never leaves a socket open.
  const probe = async () => {
    const sql = postgres(url, { max: 1, connect_timeout: 2 });
    try {
      await sql`select 1`;
    } finally {
      await sql.end({ timeout: 1 });
    }
  };

  const result = await waitUntilReady(probe, OPTIONS);
  if (result.ok) {
    log({ level: "info", msg: "database ready", attempts: result.attempts });
    return 0;
  }
  const { attempts, lastError } = result;
  log({ level: "error", msg: "database not reachable", attempts, error: lastError });
  return 1;
}

process.exitCode = await main();
```

- [ ] **Step 4: Run the tests to verify they pass, then try it for real**

Run: `pnpm --filter @scholarcrew/scripts test && pnpm --filter @scholarcrew/scripts typecheck && pnpm lint`
Expected: `Test Files  3 passed (3)`, `Tests  19 passed (19)`; `tsc --noEmit` prints nothing; Biome `No fixes applied.`

Run: `pnpm db:up && pnpm db:wait`
Expected: `{"level":"info","msg":"database ready","attempts":1}`, exit 0.

Run: `docker compose stop db && pnpm db:wait; echo "exit=$?"`
Expected: after about 30 seconds, `{"level":"error","msg":"database not reachable","attempts":30,"error":"ECONNREFUSED"}` (or `connect ECONNREFUSED 127.0.0.1:54320`), then `exit=1`. The database URL and password never appear.

Run: `docker compose start db && pnpm db:wait`
Expected: `database ready` within a few attempts.

- [ ] **Step 5: Commit**

```bash
git add scripts/src
git commit -m "feat(scripts): wait-for-db"
```

### A6: README

- [ ] **Step 1: Write the README**

`README.md`:

````markdown
# ScholarCrew

ScholarCrew is a website where a high school student, and their parents if the student invites them, get a crew of AI specialists that plans scholarships, essays, college applications, and the cost of college. This repo holds the whole product: a Next.js web app, a background worker, shared TypeScript packages, and the Postgres schema.

## Prerequisites

- Node 22.9 or later (the scripts use `--env-file-if-exists`). The major version is pinned in `.nvmrc`; with nvm, run `nvm install` once.
- pnpm 10.33.0 through Corepack, which ships with Node. The version is pinned in `package.json`.
- Docker with Compose v2, for the local Postgres 16 database.
- `openssl`, to generate an encryption key.

## Setup

Run these from the repo root:

```bash
nvm use
corepack enable
pnpm install
cp .env.example .env
KEY=$(openssl rand -hex 32) && sed -i.bak "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$KEY/" .env && rm .env.bak
pnpm --filter @scholarcrew/scripts check-env
pnpm db:up
pnpm db:wait
pnpm db:migrate
pnpm db:migrate:test
pnpm db:seed
pnpm dev
```

Copy `.env.example` to `.env` before you run any `db:*` or `dev` script. The scripts load it with Node's `--env-file-if-exists` flag, so hosts that inject env vars without a `.env` file still work. `check-env` tells you which keys are missing or malformed and never prints their values.

The web app runs at http://localhost:3000. The defaults keep everything on your machine:

- `SCHOLARCREW_FAKE_MODEL=1` makes the crew use a scripted model, so you don't need an Anthropic key. Set it to `0` and fill in `ANTHROPIC_API_KEY` to use Claude.
- With `RESEND_API_KEY` empty, email is written to the `dev_outbox` table instead of being sent. With `ENABLE_DEV_ROUTES=1`, open `http://localhost:3000/api/v1/dev/outbox/latest?to=you@example.com` to read your latest sign-in link.
- Stripe and Twilio keys stay empty in development. Checkout and SMS are off until you set them.
- Postgres listens on `localhost:54320`. `scholarcrew` is the dev database and `scholarcrew_test` is the test database. Tests empty every table in the test database, so never point `TEST_DATABASE_URL` at data you want to keep.

## Common commands

| Command | What it does |
|---|---|
| `pnpm dev` | Runs the web app and the worker in watch mode. |
| `pnpm lint` | Checks lint and formatting with Biome. |
| `pnpm format` | Applies Biome fixes and formatting. |
| `pnpm typecheck` | Runs `tsc --noEmit` in every package. |
| `pnpm test` | Runs Vitest in every package. |
| `pnpm build` | Builds every package that has a build step. |
| `pnpm db:up` | Starts Postgres in Docker. |
| `pnpm db:wait` | Waits up to 30 seconds for Postgres to accept connections. |
| `pnpm db:generate` | Generates a Drizzle migration after a schema change. |
| `pnpm db:migrate` | Applies migrations to the dev database. |
| `pnpm db:migrate:test` | Applies migrations to the test database. |
| `pnpm db:seed` | Loads fictional sample data into the dev database. |
| `pnpm e2e` | Runs the Playwright flows. Install the browser once with `pnpm --filter @scholarcrew/e2e exec playwright install chromium`. |
| `pnpm evals` | Runs the model evals against the real API. They need `ANTHROPIC_API_KEY` and cost money. |
| `pnpm --filter <package> test` | Runs one package's tests, for example `pnpm --filter @scholarcrew/domain test`. |

To start over with empty databases, run `docker compose down -v`, then `pnpm db:up`. Postgres runs `scripts/create-test-db.sql` only when it first creates the data volume. If your volume is older than that file, create the test database once with `docker compose exec db createdb -U scholarcrew scholarcrew_test`.

## Where things live

- `docs/product/features.md`: the feature spec. Every feature has an ID such as `CR-01`.
- `design/`: concept mockups as PNGs, plus the static HTML and CSS they were drawn from.
- `plans/`: the implementation plans. Start with `plans/00-overview.md`, which covers the architecture, conventions, and package contracts.
- `packages/`: shared code (domain schemas, database, calculators, jobs, services, agents, catalog, UI kit).
- `apps/`: the web app, the worker, and the Chrome extension.
- `e2e/` and `evals/`: Playwright flows and model evals.
- `scripts/`: the env check, the database wait script, and the test database SQL.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, the web build, and the Playwright flows on every push and pull request.

## Privacy

The app ships no third-party analytics or ad SDKs. Never commit `.env`. Turborepo and Next.js send anonymous usage telemetry by default; turn it off with `pnpm exec turbo telemetry disable` and by exporting `NEXT_TELEMETRY_DISABLED=1` in your shell. CI turns both off.
````

- [ ] **Step 2: Run the README commands that exist so far**

Run: `pnpm --filter @scholarcrew/scripts check-env && pnpm db:up && pnpm db:wait && pnpm db:migrate && pnpm lint`
Expected: `env ok`, `database ready`, then `No projects matched the filters` for `db:migrate` (exit 0; `@scholarcrew/db` arrives in plan 03), then Biome `No fixes applied.`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(repo): readme"
```

### A7: CI workflow

- [ ] **Step 1: Write the failing test**

Replace `scripts/src/repo-config.test.ts` with the full file below (adds the `CI workflow` block):

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @scholarcrew/scripts test`
Expected: FAIL in `repo-config.test.ts` with `ENOENT: no such file or directory, open '.../.github/workflows/ci.yml'`; `Tests  1 failed | 19 passed (20)`.

- [ ] **Step 3: Write the workflow**

`.github/workflows/ci.yml` (web build, extension build, Playwright install, and e2e go through `pnpm --filter`, so they print `No projects matched the filters` and pass until plans 13, 19, and 20 add those packages; `.env` is copied so scripts run the same way they do locally; they pass `--env-file-if-exists`, and Node keeps the job env values over the file's):

```yaml
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: scholarcrew
          POSTGRES_PASSWORD: scholarcrew
          POSTGRES_DB: scholarcrew
        ports:
          - "5432:5432"
        options: >-
          --health-cmd "pg_isready -h 127.0.0.1 -U scholarcrew -d scholarcrew"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 12
    env:
      DATABASE_URL: postgres://scholarcrew:scholarcrew@localhost:5432/scholarcrew
      TEST_DATABASE_URL: postgres://scholarcrew:scholarcrew@localhost:5432/scholarcrew_test
      APP_URL: http://localhost:3000
      ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      ANTHROPIC_API_KEY: ""
      SCHOLARCREW_FAKE_MODEL: "1"
      RESEND_API_KEY: ""
      EMAIL_FROM: "ScholarCrew <crew@scholarcrew.example>"
      STRIPE_SECRET_KEY: ""
      STRIPE_WEBHOOK_SECRET: ""
      STRIPE_PRICE_FAMILY: ""
      STRIPE_PRICE_SEASON: ""
      ENABLE_DEV_ROUTES: "1"
      CATALOG_ALLOWED_DOMAINS: ""
      TWILIO_ACCOUNT_SID: ""
      TWILIO_AUTH_TOKEN: ""
      TWILIO_FROM: ""
      TURBO_TELEMETRY_DISABLED: "1"
      NEXT_TELEMETRY_DISABLED: "1"
    steps:
      - uses: actions/checkout@v4
      - name: Create the test database
        run: psql "$DATABASE_URL" -c "CREATE DATABASE scholarcrew_test"
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Create .env for local-style scripts
        run: cp .env.example .env
      - run: pnpm --filter @scholarcrew/scripts check-env
      - run: pnpm db:migrate
      - run: pnpm db:migrate:test
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm --filter @scholarcrew/web build
      - run: pnpm --filter @scholarcrew/extension build

  e2e:
    needs: check
    runs-on: ubuntu-latest
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: scholarcrew
          POSTGRES_PASSWORD: scholarcrew
          POSTGRES_DB: scholarcrew
        ports:
          - "5432:5432"
        options: >-
          --health-cmd "pg_isready -h 127.0.0.1 -U scholarcrew -d scholarcrew"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 12
    env:
      DATABASE_URL: postgres://scholarcrew:scholarcrew@localhost:5432/scholarcrew
      TEST_DATABASE_URL: postgres://scholarcrew:scholarcrew@localhost:5432/scholarcrew_test
      APP_URL: http://localhost:3000
      ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      ANTHROPIC_API_KEY: ""
      SCHOLARCREW_FAKE_MODEL: "1"
      RESEND_API_KEY: ""
      EMAIL_FROM: "ScholarCrew <crew@scholarcrew.example>"
      STRIPE_SECRET_KEY: ""
      STRIPE_WEBHOOK_SECRET: ""
      STRIPE_PRICE_FAMILY: ""
      STRIPE_PRICE_SEASON: ""
      ENABLE_DEV_ROUTES: "1"
      CATALOG_ALLOWED_DOMAINS: ""
      TWILIO_ACCOUNT_SID: ""
      TWILIO_AUTH_TOKEN: ""
      TWILIO_FROM: ""
      TURBO_TELEMETRY_DISABLED: "1"
      NEXT_TELEMETRY_DISABLED: "1"
    steps:
      - uses: actions/checkout@v4
      - name: Create the test database
        run: psql "$DATABASE_URL" -c "CREATE DATABASE scholarcrew_test"
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Create .env for local-style scripts
        run: cp .env.example .env
      - run: pnpm db:migrate
      - run: pnpm db:migrate:test
      - name: Install the Playwright browser
        run: pnpm --filter @scholarcrew/e2e exec playwright install --with-deps chromium
      - run: pnpm e2e
      - name: Upload the Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: e2e/playwright-report
          if-no-files-found: ignore
```

- [ ] **Step 4: Run the tests and lint the workflow**

Run: `pnpm --filter @scholarcrew/scripts test && pnpm lint`
Expected: `Test Files  3 passed (3)`, `Tests  20 passed (20)`; Biome `No fixes applied.`

Run: `docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.7 -color`
Expected: no output, exit 0.

CI goes green on GitHub once the integrator commits `pnpm-lock.yaml` at the end of phase 1 (`--frozen-lockfile` needs it).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml scripts/src/repo-config.test.ts
git commit -m "feat(repo): github actions ci"
```

## Success Criteria

Every command exits 0 on a machine with Node 22, Corepack, and Docker, after `cp .env.example .env` and the key generation line from the README.

- [ ] `pnpm install`
- [ ] `pnpm --filter @scholarcrew/scripts typecheck`
- [ ] `pnpm --filter @scholarcrew/scripts test` → 3 files, 20 tests passed
- [ ] `pnpm lint` → `No fixes applied.`, no errors
- [ ] `pnpm typecheck && pnpm test` → Turbo runs the scripts package, `1 successful, 1 total`
- [ ] `pnpm --filter @scholarcrew/scripts check-env` → `{"level":"info","msg":"env ok"}`
- [ ] `docker compose up -d db && pnpm db:wait` → `{"level":"info","msg":"database ready","attempts":<n>}`
- [ ] `docker compose exec -T db psql -U scholarcrew -lqt | cut -d '|' -f1 | grep -w scholarcrew_test` → prints `scholarcrew_test`
- [ ] `docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.7 -color` → no output
- [ ] `! grep -rlE --include=package.json --exclude-dir=node_modules '"(@vercel/analytics|@segment/|posthog|mixpanel|react-ga|@amplitude/|@fullstory/|hotjar)' .` → no tracker packages (SE-05)
- [ ] `git status --short` → only `?? pnpm-lock.yaml` (`.env` is ignored)

## Testing Requirements

- Command: `pnpm --filter @scholarcrew/scripts test`
- Expected: 3 test files, 20 tests, all passing, no network and no database.
- `check-env.test.ts` (11) proves: the four required keys are reported in order, and `TEST_DATABASE_URL` is required only when `NODE_ENV` isn't `production`; blank and undefined count as missing; `ENCRYPTION_KEY` must be exactly 64 hex characters and the all-zero placeholder is rejected without echoing it; `APP_URL` must be a bare http(s) origin (plan 13 compares it to the `Origin` header); `ANTHROPIC_API_KEY` is required only when `SCHOLARCREW_FAKE_MODEL=0`; other fake-model values are rejected; the test database URL can't equal the dev one; missing keys and bad values are reported together.
- `retry.test.ts` (5) proves: success on the first try sleeps zero times; retries sleep `delayMs` between attempts only; failure after the last attempt carries the last error; zero attempts never calls the probe; an `AggregateError` with an empty message reports its code.
- `repo-config.test.ts` (4) proves: `.env.example` has exactly the section 4 keys in order and passes `checkEnv` once the key is replaced; `turbo.json` passes every key plus `CI` through; both CI jobs set every key with the fake model on.
- Manual: `pnpm db:wait` prints `database ready` against the compose database, and exits 1 with `database not reachable` after 30 attempts when the container is stopped.

## Review Checklist

- [ ] Root `package.json` scripts match section 3 "Scripts" exactly (14 scripts). The only root devDependencies are biome (exact `1.9.4`), `@types/node`, turbo, and typescript.
- [ ] `biome.json` matches section 14 byte for byte, and `pnpm lint` lists nothing under `design/`, `docs/`, or `plans/`.
- [ ] `turbo.json` has the section 14 tasks plus `dev` (`cache: false`, `persistent: true`), and `globalPassThroughEnv` covers every section 4 key plus `CI`.
- [ ] `.env.example`, `turbo.json`, and both CI jobs agree on the key list (enforced by `repo-config.test.ts`).
- [ ] Both healthchecks use `pg_isready -h 127.0.0.1` (TCP), so "healthy" can't fire while init scripts are still running.
- [ ] `scripts/create-test-db.sql` is mounted into `/docker-entrypoint-initdb.d/`, and the README explains the old-volume case.
- [ ] Neither CLI prints an env value. `check-env` prints key names and fixed messages; `wait-for-db` never prints `DATABASE_URL`.
- [ ] `process.env` is read only in the two CLI entry points; `checkEnv` is pure.
- [ ] CI steps for packages that don't exist yet (`@scholarcrew/db`, `@scholarcrew/web`, `@scholarcrew/e2e`) go through `pnpm --filter` or root scripts, so phase 1 CI passes.
- [ ] No commit includes `pnpm-lock.yaml` or `.env`.
