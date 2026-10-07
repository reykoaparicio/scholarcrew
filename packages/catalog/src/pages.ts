import { createHash } from "node:crypto";
import type { VerificationReport } from "@scholarcrew/domain";
import type { CatalogDeps, FetchedPage } from "./types";

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isReadableType(contentType: string): boolean {
  return /^\s*text\/(?:html|plain)\b/i.test(contentType);
}

/** fetchPage, but a thrown error (DNS, timeout, reset) becomes null so one bad host can't stop a run. */
export async function fetchSafely(deps: CatalogDeps, url: string): Promise<FetchedPage | null> {
  try {
    return await deps.fetchPage(url);
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    console.log(JSON.stringify({ level: "warn", msg: "catalog fetch failed", url, error: name }));
    return null;
  }
}

/** Why a page can't be extracted, or null when it can. */
export function pageProblem(page: FetchedPage | null): string | null {
  if (page === null) return "Page couldn't be fetched (network error or timeout).";
  if (page.status === 415 || (page.status < 400 && !isReadableType(page.contentType))) {
    return `Page isn't HTML or plain text (${page.contentType || "unknown type"}).`;
  }
  if (page.status >= 400) return `Page unavailable (HTTP ${page.status}).`;
  if (page.text.trim() === "") return "Page has no readable text.";
  return null;
}

/** A failed report with one missing_field issue: what an admin sees when there's no draft to check. */
export function problemReport(message: string, field: string | null = "url"): VerificationReport {
  return { ok: false, issues: [{ code: "missing_field", field, message }], scamFlags: [] };
}
