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
    return json(
      { error: { code: "invalid_input", message: "Check your input and try again", details: e.issues } },
      400,
    );
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
