import type { Page } from "@playwright/test";
import { api } from "./api";

export type Probe = [method: string, path: string, body?: unknown];

/** Runs every probe as the page's user. Returns one line per probe that didn't get 404 not_found (empty = isolated). */
export async function probeAll(page: Page, probes: Probe[]): Promise<string[]> {
  const leaks: string[] = [];
  for (const [method, path, body] of probes) {
    const r = await api<unknown>(page, method, path, body);
    const error = typeof r.body === "object" && r.body !== null && "error" in r.body ? r.body.error : null;
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (r.status !== 404 || code !== "not_found") leaks.push(`${method} ${path} returned ${r.status} ${code}`.trim());
  }
  return leaks;
}
