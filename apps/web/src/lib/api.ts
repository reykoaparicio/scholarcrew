import { ErrorBody } from "@scholarcrew/domain";

export class ApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** "/plan-items/1" → "/api/v1/plan-items/1"; paths already under /api/ are kept. */
export function apiUrl(path: string): string {
  if (path.startsWith("/api/")) return path;
  return `/api/v1${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Same-origin JSON call. The method defaults to GET, or POST when a body is given.
 * FormData bodies are sent as multipart. 204 resolves to undefined. Errors throw ApiError.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (init.body instanceof FormData) {
    body = init.body;
  } else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { method, headers, body, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError("network", "Can't reach ScholarCrew right now. Check your connection and try again.", 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const parsed = ErrorBody.safeParse(data);
    if (parsed.success) {
      const e = parsed.data.error;
      throw new ApiError(e.code, e.message, res.status, e.details);
    }
    const code = res.status === 401 ? "unauthenticated" : "internal";
    // A proxy can cut an upload off at 413 before plan 13's ErrorBody is written.
    if (res.status === 413)
      throw new ApiError("invalid_input", "That's too big to upload. Files can be up to 10 MB.", 413);
    throw new ApiError(code, `Something went wrong (${res.status}). Try again.`, res.status);
  }
  return data as T;
}

/** Message to show the user for any thrown value. */
export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : "Something went wrong. Try again.";
}

/** CR-10/BI-02: the monthly allowance is used up (402 limit_reached); show a "See plans" link. */
export function isLimit(e: unknown): boolean {
  return e instanceof ApiError && e.code === "limit_reached";
}
