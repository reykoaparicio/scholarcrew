"use client";

import { api, errorMessage } from "@/lib/api";
import { useJobStream } from "@/lib/sse";
import { type DocumentMeta, MAX_UPLOAD_BYTES, type OfferWithLines, TERMINAL_JOB_STATUSES } from "@scholarcrew/domain";
import { Button, Card, Select, StatusPill, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import shared from "../scholarships/shared.module.css";

type Phase = "idle" | "uploading" | "parsing" | "ready" | "failed" | "slow";

/** R2P-8: the parser (12 L8) reads PDFs only, so the award-letter form takes only PDFs. */
const LETTER_MIME = "application/pdf";

/**
 * R2P-8: removes a failed or unconfirmed letter (`DELETE /offers/:id`, 204). Confirmed letters stay;
 * the core answers 409 and the message is shown. The uploaded document stays in Settings → Documents.
 */
export function RemoveOfferButton({ offerId, collegeName }: { offerId: string; collegeName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api<void>(`/offers/${offerId}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <Button
        variant="line"
        size="sm"
        aria-label={`Remove the ${collegeName} letter`}
        disabled={busy}
        onClick={() => void remove()}
      >
        Remove
      </Button>
      {error ? (
        <span className={shared.error} role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * MO-04: upload the letter as a document, create the offer (which queues the parse), then wait for Aid.
 * D31: with `parseJobId`, follow the job's SSE stream and read the offer once it ends; otherwise (or if the stream
 * drops) poll the offer.
 */
export function UploadLetter({
  colleges,
  awardYear,
  pollMs = 2000,
  maxPolls = 60,
}: {
  colleges: Array<{ id: string; name: string }>;
  awardYear: string;
  pollMs?: number;
  maxPolls?: number;
}) {
  const router = useRouter();
  const [collegeId, setCollegeId] = useState(colleges[0]?.id ?? "");
  const [year, setYear] = useState(awardYear);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [offerId, setOfferId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { job, error: streamError } = useJobStream(jobId);

  // The job ended or the stream dropped: hand over to the poller, which reads the offer's status.
  useEffect(() => {
    if (!jobId) return;
    if ((job && TERMINAL_JOB_STATUSES.includes(job.status)) || streamError) {
      setJobId(null);
      setPolling(true);
    }
  }, [jobId, job, streamError]);

  useEffect(() => {
    if (phase !== "parsing" || !offerId || !polling) return;
    let live = true;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      polls += 1;
      try {
        const current = await api<OfferWithLines>(`/offers/${offerId}`);
        if (!live) return;
        if (current.status === "needs_review" || current.status === "confirmed") {
          setPhase("ready");
          router.refresh();
          return;
        }
        if (current.status === "failed") {
          setPhase("failed");
          return;
        }
      } catch (e) {
        if (live) setError(errorMessage(e));
      }
      if (!live) return;
      if (polls >= maxPolls) setPhase("slow");
      else timer = setTimeout(() => void tick(), pollMs);
    };
    timer = setTimeout(() => void tick(), pollMs);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [phase, offerId, polling, pollMs, maxPolls, router]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return setError("Pick the award letter file.");
    if (file.type !== LETTER_MIME) return setError("Upload the award letter as a PDF. Aid can only read PDFs.");
    // Checked before sending: the server refuses anything past 10 MB with a 413.
    if (file.size > MAX_UPLOAD_BYTES)
      return setError("This file is over 10 MB. Save just the award pages as a PDF and try again.");
    if (!/^\d{4}-\d{2}$/.test(year)) return setError("Use the award year format 2027-28.");
    setError(null);
    setPhase("uploading");
    try {
      const form = new FormData();
      form.append("kind", "award_letter");
      form.append("file", file);
      const doc = await api<DocumentMeta>("/documents", { method: "POST", body: form });
      const created = await api<OfferWithLines>("/offers", {
        body: { collegeId, documentId: doc.id, awardYear: year },
      });
      setOfferId(created.id);
      setPolling(created.parseJobId === null);
      setJobId(created.parseJobId);
      setPhase("parsing");
    } catch (e) {
      setError(errorMessage(e));
      setPhase("idle");
    }
  }

  // R2P-8 retry: remove the failed offer, then the same form takes a clearer PDF. The file input is keyed by the
  // offer id, so clearing `offerId` also clears the picked file.
  async function removeAndRetry() {
    if (!offerId) return;
    setError(null);
    try {
      await api<void>(`/offers/${offerId}`, { method: "DELETE" });
      setOfferId(null);
      setJobId(null);
      setPolling(false);
      setFile(null);
      setPhase("idle");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (colleges.length === 0) return null;
  return (
    <Card title="Add an award letter">
      <form className={shared.form} onSubmit={upload} noValidate>
        <Select
          label="College"
          options={colleges.map((c) => ({ value: c.id, label: c.name }))}
          value={collegeId}
          onChange={(e) => setCollegeId(e.target.value)}
        />
        <TextInput label="Award year" value={year} maxLength={7} onChange={(e) => setYear(e.target.value)} />
        <input
          key={offerId ?? "new"}
          type="file"
          aria-label="Award letter file"
          accept={LETTER_MIME}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p className={shared.muted}>Upload the award letter as a PDF (up to 10 MB).</p>
        <Button variant="primary" type="submit" icon="clip" disabled={phase === "uploading" || phase === "parsing"}>
          Upload letter
        </Button>
      </form>
      {phase === "uploading" ? <p className={shared.muted}>Uploading…</p> : null}
      {phase === "parsing" ? (
        <div className={shared.working} aria-live="polite">
          <StatusPill status="working" />
          <span>Aid is reading your letter…</span>
        </div>
      ) : null}
      {phase === "slow" ? (
        <p className={shared.muted}>Aid is still reading. We'll notify you when it's ready to review.</p>
      ) : null}
      {phase === "ready" && offerId ? (
        <p>
          Aid labeled every line. <a href={`/money/offers/${offerId}`}>Review the lines</a>
        </p>
      ) : null}
      {phase === "failed" ? (
        <div className={shared.form}>
          <p className={shared.error} role="alert">
            Aid couldn't read this letter. Upload a clearer PDF, or compare it by hand in the offer tool.
          </p>
          <Button variant="line" size="sm" onClick={() => void removeAndRetry()}>
            Remove and try again
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
