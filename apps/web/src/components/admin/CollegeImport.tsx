"use client";

import { ApiError, errorMessage } from "@/lib/api";
import { ErrorBody, ImportResult } from "@scholarcrew/domain";
import { Button, Table, TextArea } from "@scholarcrew/ui";
import { type ChangeEvent, useState } from "react";
import styles from "./admin.module.css";

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const TOO_BIG = "The CSV is over 5 MB. Split it and import each part.";

/** api() only sends JSON or FormData; the import route takes the raw CSV as text/csv (plan 14, N12). */
async function postCsv(text: string): Promise<ImportResult> {
  let res: Response;
  try {
    res = await fetch("/api/v1/admin/colleges/import", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "text/csv" },
      body: text,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("network", "Can't reach ScholarCrew right now. Check your connection and try again.", 0);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ErrorBody.safeParse(data);
    if (parsed.success) throw new ApiError(parsed.data.error.code, parsed.data.error.message, res.status);
    // R3A-22: a proxy can cut the body off at 413 before 14's ErrorBody is written (as OfferTool handles it).
    if (res.status === 413) throw new ApiError("invalid_input", TOO_BIG, 413);
    throw new ApiError("internal", `The import failed (${res.status}). Try again.`, res.status);
  }
  return ImportResult.parse(data);
}

type ErrorRow = { line: number; message: string };

export function CollegeImport() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) {
      setError(TOO_BIG);
      return;
    }
    setText(await file.text());
  }

  async function submit() {
    if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) {
      setError(TOO_BIG);
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await postCsv(text));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.stack}>
      <TextArea
        label="College Scorecard CSV"
        hint="Paste the extract, header row first"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={styles.row}>
        <label htmlFor="college-csv-file">Or choose a CSV file</label>
        <input id="college-csv-file" type="file" accept=".csv,text/csv" onChange={pickFile} />
      </div>
      {error ? (
        <p role="alert" className={styles.alert}>
          {error}
        </p>
      ) : null}
      <div className={styles.row}>
        <Button variant="primary" disabled={busy || text.trim() === ""} onClick={submit}>
          {busy ? "Importing…" : "Import colleges"}
        </Button>
      </div>
      {result ? (
        <div className={styles.stack}>
          <output className={styles.ok}>
            {`Inserted ${result.inserted} · Updated ${result.updated} · Skipped ${result.skipped}`}
          </output>
          {result.errors.length > 0 ? (
            <Table<ErrorRow>
              caption="Rows that weren't imported"
              columns={[
                { key: "line", header: "Line" },
                { key: "message", header: "Problem" },
              ]}
              rows={result.errors}
              rowKey={(r) => `${r.line}:${r.message}`}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
