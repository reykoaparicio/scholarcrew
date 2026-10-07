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
  o: {
    chunk: Uint8Array;
    count: number;
    method?: string;
    cookie?: string;
    origin?: string | null;
    headers?: Record<string, string>;
  },
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
