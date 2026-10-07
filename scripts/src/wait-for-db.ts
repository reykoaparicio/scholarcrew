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
