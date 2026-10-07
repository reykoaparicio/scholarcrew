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
  const missing: string[] = required.filter((name) =>
    name === "ENCRYPTION_KEY" ? !present(env.ENCRYPTION_KEY) && !present(env.ENCRYPTION_KEYS) : !present(env[name]),
  );
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
      if (encryptionKeyProblem(match[2] ?? "") !== null || /^(..)(?:\1){31}$/i.test(match[2] ?? "")) {
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
