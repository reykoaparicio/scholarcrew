import type { Page } from "@playwright/test";
import type { DocumentMeta } from "@scholarcrew/domain";

export interface ApiResult<T> {
  status: number;
  body: T;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

function assertOnApp(page: Page): void {
  if (page.url() === "about:blank") throw new Error("Open an app page before calling the API from the browser");
}

/** JSON when the body is JSON (every API response and error), otherwise the raw text (file downloads). */
function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Calls /api/v1 from inside the page, so the session cookie and Origin go out exactly as the app sends them. */
export async function api<T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  assertOnApp(page);
  const out = await page.evaluate(
    async (a) => {
      const init: RequestInit = {
        method: a.method,
        headers: a.json === null ? {} : { "content-type": "application/json" },
      };
      if (a.json !== null) init.body = a.json;
      const res = await fetch(a.url, init);
      return { status: res.status, text: await res.text() };
    },
    { method, url: `/api/v1${path}`, json: body === undefined ? null : JSON.stringify(body) },
  );
  return { status: out.status, body: parseBody(out.text) as T };
}

/** Like api(), but throws with the response body unless the status is 2xx. */
export async function apiOk<T>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  const r = await api<T>(page, method, path, body);
  if (r.status < 200 || r.status > 299)
    throw new Error(`${method} ${path} returned ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body;
}

export interface UploadInput {
  kind: "award_letter" | "transcript" | "score_report" | "essay" | "resume" | "other";
  filename: string;
  mime: string;
  content: string;
}

/** POST /api/v1/documents as multipart (kind, file) from inside the page. */
export async function uploadDocument(page: Page, file: UploadInput): Promise<DocumentMeta> {
  assertOnApp(page);
  const out = await page.evaluate(async (f) => {
    const form = new FormData();
    form.append("kind", f.kind);
    form.append("file", new File([f.content], f.filename, { type: f.mime }));
    const res = await fetch("/api/v1/documents", { method: "POST", body: form });
    return { status: res.status, text: await res.text() };
  }, file);
  if (out.status !== 201) throw new Error(`POST /documents returned ${out.status}: ${out.text}`);
  return JSON.parse(out.text) as DocumentMeta;
}
