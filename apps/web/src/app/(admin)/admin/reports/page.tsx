import { ReportsTable } from "@/components/admin/ReportsTable";
import styles from "@/components/admin/admin.module.css";
import { type SearchParams, firstParam } from "@/components/public/params";
import { cx } from "@/lib/cx";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { listReports } from "@scholarcrew/core/admin";
import { ReportStatus } from "@scholarcrew/domain";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor(["admin"]);
  const key = firstParam(await searchParams, "status") ?? "open";
  const parsed = ReportStatus.safeParse(key);
  const status = key === "all" ? undefined : parsed.success ? parsed.data : "open";
  const reports = await listReports(getDeps(), actor, status);
  const current = status ?? "all";
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Reports</h1>
          <p className={styles.sub}>
            Students report wrong deadlines, dead links, wrong amounts, and scams. Close each one with a note.
          </p>
        </div>
        <div className={styles.chips}>
          {FILTERS.map((f) => (
            <a
              key={f.key}
              href={f.key === "open" ? "/admin/reports" : `/admin/reports?status=${f.key}`}
              className={cx(styles.chip, current === f.key && styles.chipOn)}
            >
              {f.label}
            </a>
          ))}
        </div>
      </div>
      <ReportsTable key={current} reports={reports} />
    </>
  );
}
