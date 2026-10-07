export interface RememberedJob {
  id: string;
  label: string;
  at: string;
}

const KEY = "sc:jobs";
export const JOBS_EVENT = "sc:jobs";

function isRemembered(x: unknown): x is RememberedJob {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.label === "string" && typeof r.at === "string";
}

export function recalledJobs(): RememberedJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isRemembered).slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function rememberJob(job: { id: string }, label: string, at = new Date().toISOString()): void {
  if (typeof window === "undefined") return;
  const next = [{ id: job.id, label: label.slice(0, 80), at }, ...recalledJobs().filter((j) => j.id !== job.id)].slice(
    0,
    5,
  );
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked or full: the panel just won't list this job.
  }
  window.dispatchEvent(new Event(JOBS_EVENT));
}
