"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { ExportRecord } from "@scholarcrew/domain";
import { Button, Card, Icon, Modal, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./settings.module.css";

/** R3E-11: 13 M14 serves the same export's Markdown as its own download. */
export function markdownExportUrl(id: string): string {
  return `/api/v1/account/exports/${id}?format=md`;
}

function exportLine(
  r: ExportRecord,
  now: Date,
  timeZone: string,
): { text: string; href: string | null; markdownHref: string | null } {
  const made = instantShort(r.createdAt, timeZone);
  if (r.status === "queued")
    return { text: "Preparing your export. It's usually ready in about 10 minutes.", href: null, markdownHref: null };
  if (r.status === "failed")
    return { text: `Last: ${made} · that export failed. Request a new one.`, href: null, markdownHref: null };
  if (!r.downloadUrl || (r.expiresAt && new Date(r.expiresAt) <= now)) {
    return { text: `Last: ${made} · link expired`, href: null, markdownHref: null };
  }
  return {
    text: `Ready ${made}${r.expiresAt ? ` · link works until ${instantShort(r.expiresAt, timeZone)}` : ""}`,
    href: r.downloadUrl,
    markdownHref: markdownExportUrl(r.id),
  };
}

/** ME-08 export and ID-05/ME-09 delete account. */
export function DataCard({
  latest,
  timeZone,
  nowIso,
  onDeleted = () => window.location.assign("/"),
}: {
  latest: ExportRecord | null;
  timeZone: string;
  nowIso: string;
  onDeleted?: () => void;
}) {
  const [record, setRecord] = useState(latest);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const line = record ? exportLine(record, new Date(nowIso), timeZone) : null;

  async function requestExport() {
    setError(null);
    try {
      setRecord(await api<ExportRecord>("/account/export", { method: "POST" }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  /** D27: GET /account/exports/latest returns the newest unexpired export, or null. */
  async function checkAgain() {
    setError(null);
    try {
      setRecord(await api<ExportRecord | null>("/account/exports/latest"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    try {
      await api("/account", { method: "DELETE" });
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
    }
  }

  return (
    <div id="data">
      <Card title="Your data" aside={<Icon name="lock" />}>
        <p className={styles.setL}>Export everything</p>
        <p className={styles.muted}>
          JSON and Markdown copies of your profile, essays, stories, and records. Ready in about 10 minutes; the link
          lasts 24 hours.
        </p>
        <div className={styles.row}>
          <Button variant="line" size="sm" disabled={record?.status === "queued"} onClick={() => void requestExport()}>
            Request export
          </Button>
          {record?.status === "queued" ? (
            <Button variant="line" size="sm" onClick={() => void checkAgain()}>
              Check again
            </Button>
          ) : null}
        </div>
        {line ? (
          <p className={styles.muted}>
            {line.href ? (
              <>
                <a href={line.href}>Download export</a>
                {" · "}
              </>
            ) : null}
            {line.markdownHref ? (
              <>
                <a href={line.markdownHref}>Download as Markdown</a>
                {" · "}
              </>
            ) : null}
            {line.text}
          </p>
        ) : null}
        <div className={styles.divider} />
        <div id="delete">
          <p className={styles.setL}>Delete account</p>
          <p className={styles.muted}>
            Signs you out everywhere and hides your data right away. It's permanently deleted within 7 days. Things you
            shared in the family room are removed too. Exports you already downloaded can't be recalled.
          </p>
          <Button variant="line" size="sm" className={styles.crit} onClick={() => setConfirming(true)}>
            Delete my account…
          </Button>
        </div>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </Card>
      <Modal
        open={confirming}
        title="Delete your account?"
        onClose={() => {
          setConfirming(false);
          setTyped("");
        }}
        footer={
          <Button
            variant="line"
            className={styles.crit}
            disabled={typed !== "DELETE" || deleting}
            onClick={() => void deleteAccount()}
          >
            Delete account
          </Button>
        }
      >
        <p>This signs you out on every device and can't be undone after 7 days.</p>
        <TextInput
          label="Type DELETE to confirm"
          value={typed}
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
        />
      </Modal>
    </div>
  );
}
