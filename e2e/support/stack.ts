import { type ChildProcess, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createDb, runMigrations } from "@scholarcrew/db";
import { seedDev } from "@scholarcrew/db/seed";
import { resetDb } from "@scholarcrew/db/testing";
import postgres from "postgres";
import { BASE_URL, E2E_PORT, REPO_ROOT, adminDatabaseUrl, assertE2eDatabase, childEnv, e2eDatabaseUrl } from "./env";

const WORKER_READY_TIMEOUT_MS = 120_000;
/** Inside Playwright's 15 s gracefulShutdown, so the stack exits on its own before Playwright gives up on it. */
const STOP_TIMEOUT_MS = 10_000;
const children: ChildProcess[] = [];
let stopping = false;
let stopped: Promise<void> | null = null;

function log(msg: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: "info", msg, ...fields }));
}

/** Creates the e2e database if needed, migrates it, empties it, and loads the fictional seed. */
export async function prepareDatabase(url: string, adminUrl: string): Promise<void> {
  assertE2eDatabase(url);
  const name = new URL(url).pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Unsafe e2e database name: ${name}`);
  const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined });
  try {
    const found = await admin`select 1 from pg_database where datname = ${name}`;
    if (found.length === 0) await admin.unsafe(`create database ${name}`);
    // Connections a crashed run left behind (its worker, its web server) would hold locks the pgboss drop waits on.
    await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${name} and pid <> pg_backend_pid()`;
  } finally {
    await admin.end({ timeout: 5 });
  }
  await runMigrations(url);
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await sql.unsafe("drop schema if exists pgboss cascade");
  } finally {
    await sql.end({ timeout: 5 });
  }
  const { db, close } = createDb(url, { max: 2 });
  try {
    // Plan 03's truncate of every schema table; it never touches the migrations table or pgboss.
    await resetDb(db);
    await seedDev(db);
  } finally {
    await close();
  }
}

function start(args: string[], env: NodeJS.ProcessEnv, pipeStdout: boolean): ChildProcess {
  const child = spawn("pnpm", args, {
    cwd: REPO_ROOT,
    env,
    detached: true,
    stdio: ["ignore", pipeStdout ? "pipe" : "inherit", "inherit"],
  });
  children.push(child);
  return child;
}

/** Resolves on the worker's {"msg":"worker.ready"} line and keeps echoing its logs. */
function waitForWorker(worker: ChildProcess): Promise<void> {
  return new Promise((resolveReady, reject) => {
    const stdout = worker.stdout;
    if (!stdout) {
      reject(new Error("The worker has no stdout pipe"));
      return;
    }
    const timer = setTimeout(
      () => reject(new Error("The worker didn't log worker.ready in time")),
      WORKER_READY_TIMEOUT_MS,
    );
    worker.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`The worker exited before it was ready (code ${String(code)})`));
    });
    createInterface({ input: stdout }).on("line", (line) => {
      process.stdout.write(`${line}\n`);
      try {
        const parsed = JSON.parse(line) as { msg?: unknown };
        if (parsed.msg === "worker.ready") {
          clearTimeout(timer);
          resolveReady();
        }
      } catch {
        // Not a JSON log line (pnpm banner, tsx output); keep reading.
      }
    });
  });
}

/** True while any process in the group still exists (signal 0 only checks). */
function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // The process group is already gone.
  }
}

/**
 * SIGTERMs every child's process group (pnpm, tsx, and node inside it), waits until every group is empty
 * or STOP_TIMEOUT_MS passes, then SIGKILLs the groups that are still running. A leftover worker would keep
 * scholarcrew_e2e busy, and a leftover next dev would keep port 3100, so the next run would fail.
 */
function stopAll(): Promise<void> {
  stopped ??= (async () => {
    stopping = true;
    const pids = children.map((c) => c.pid).filter((pid): pid is number => pid !== undefined);
    for (const pid of pids) signalGroup(pid, "SIGTERM");
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    let alive = pids.filter(groupAlive);
    while (alive.length > 0 && Date.now() < deadline) {
      await new Promise((resolveTick) => setTimeout(resolveTick, 100));
      alive = alive.filter(groupAlive);
    }
    for (const pid of alive) signalGroup(pid, "SIGKILL");
    log("e2e.stopped", { killed: alive.length });
  })();
  return stopped;
}

async function shutdown(code: number): Promise<void> {
  await stopAll();
  process.exit(code);
}

async function main(): Promise<void> {
  const url = e2eDatabaseUrl();
  await prepareDatabase(url, adminDatabaseUrl());
  log("e2e.database_ready", { database: new URL(url).pathname.slice(1) });
  const env = childEnv(url);
  const worker = start(["--filter", "@scholarcrew/worker", "start"], env, true);
  await waitForWorker(worker);
  const production = process.env.E2E_PRODUCTION === "1";
  const webEnv = production
    ? { ...env, NODE_ENV: "production", RESEND_API_KEY: "re_local_audit_no_delivery", EMAIL_FROM: "audit@example.test" }
    : env;
  const web = start(
    ["--filter", "@scholarcrew/web", "exec", "next", production ? "start" : "dev", "-p", String(E2E_PORT)],
    webEnv,
    false,
  );
  log("e2e.web_starting", { url: BASE_URL });
  for (const child of [worker, web]) {
    child.on("exit", (code) => {
      if (stopping) return;
      log("e2e.child_exited", { pid: child.pid, code });
      void shutdown(1);
    });
  }
}

process.on("SIGTERM", () => void shutdown(0));
process.on("SIGINT", () => void shutdown(0));

main().catch((e: unknown) => {
  console.error(JSON.stringify({ level: "error", msg: "e2e.stack_failed", error: String(e) }));
  void shutdown(1);
});
