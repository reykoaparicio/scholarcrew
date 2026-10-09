"use client";

import { instantLong } from "@/components/public/dates";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { CatalogReport, ReportStatus } from "@scholarcrew/domain";
import { Badge, Button, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./admin.module.css";
import { ADMIN_TZ } from "./labels";
import { REASON_LABELS } from "./review";

const STATUS_TEXT: Record<ReportStatus, string> = { open: "Open", resolved: "Resolved", rejected: "Rejected" };

/** AD-04: resolve or reject each open report with a note. Closing a report also closes its review task. */
export function ReportsTable({ reports }: { reports: CatalogReport[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(reports);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  // R3A-21: reports the server says are already closed (409); their buttons stay disabled.
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  async function close(r: CatalogReport, status: "resolved" | "rejected") {
    const note = (notes[r.id] ?? "").trim();
    if (!note) {
      setErrors((e) => ({ ...e, [r.id]: "Add a note first." }));
      return;
    }
    setBusyId(r.id);
    setErrors((e) => ({ ...e, [r.id]: "" }));
    try {
      const updated = await api<CatalogReport>(`/admin/reports/${r.id}/resolve`, { body: { status, note } });
      setRows((all) => all.map((x) => (x.id === r.id ? updated : x)));
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict") {
        // Another admin closed it, or our earlier resolve landed and its response was lost.
        setErrors((all) => ({ ...all, [r.id]: e.message }));
        setClosed((all) => ({ ...all, [r.id]: true }));
        router.refresh();
        return;
      }
      setErrors((all) => ({ ...all, [r.id]: errorMessage(e) }));
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) return <p className={styles.sub}>No reports here.</p>;
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the table.
    <section className={styles.tableScroll} tabIndex={0} aria-label="Scrollable data table">
      <table className={styles.fields} aria-label="Reports">
        <thead>
          <tr>
            <th scope="col">Listing</th>
            <th scope="col">Reason</th>
            <th scope="col">Details</th>
            <th scope="col">Reported</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <a href={`/admin/scholarships/${r.scholarshipId}`}>{r.scholarshipName}</a>
              </td>
              <td>{REASON_LABELS[r.reason]}</td>
              <td>{r.details || "No details"}</td>
              <td>{instantLong(r.createdAt, ADMIN_TZ)}</td>
              <td>
                {r.status === "open" ? (
                  <div className={styles.stack}>
                    <TextInput
                      className={styles.noteField}
                      label={`Note for report on ${r.scholarshipName}`}
                      placeholder="Note for the record"
                      maxLength={1000}
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    />
                    {errors[r.id] ? (
                      <p role="alert" className={styles.alert}>
                        {errors[r.id]}
                      </p>
                    ) : null}
                    <div className={styles.row}>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busyId === r.id || closed[r.id] === true}
                        aria-label={`Resolve report on ${r.scholarshipName}`}
                        onClick={() => close(r, "resolved")}
                      >
                        Resolve
                      </Button>
                      <Button
                        variant="line"
                        size="sm"
                        disabled={busyId === r.id || closed[r.id] === true}
                        aria-label={`Reject report on ${r.scholarshipName}`}
                        onClick={() => close(r, "rejected")}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Badge tone={r.status === "resolved" ? "good" : "neutral"}>{STATUS_TEXT[r.status]}</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
