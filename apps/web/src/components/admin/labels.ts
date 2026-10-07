import { calendarLong } from "@/components/public/dates";
import type { CatalogStatus, IsoDate } from "@scholarcrew/domain";

/** Admin screens show instants on one calendar: `instantLong(iso, ADMIN_TZ)` / `instantShort(iso, ADMIN_TZ)`. */
export const ADMIN_TZ = "America/Chicago";

export const CATALOG_STATUS_LABELS: Record<CatalogStatus, string> = {
  draft: "Draft",
  published: "Published",
  stale: "Needs re-check",
  retired: "Retired",
  flagged: "Flagged",
};

/** A listing deadline with its year ("Feb 1, 2027"); `null` is "Not posted", like the public directory. */
export function adminDeadline(d: IsoDate | null): string {
  return d ? calendarLong(d) : "Not posted";
}
