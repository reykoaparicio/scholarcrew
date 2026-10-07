"use client";

import { api, errorMessage } from "@/lib/api";
import { Button, Modal, Select, TextArea } from "@scholarcrew/ui";
import { useState } from "react";
import { REPORT_REASONS } from "./detail";
import shared from "./shared.module.css";

/** SC-08: reports become admin tasks. */
export function ReportModal({
  scholarshipId,
  open,
  onClose,
}: { scholarshipId: string; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!reason) return setError("Pick what's wrong.");
    setSending(true);
    setError(null);
    try {
      await api(`/scholarships/${scholarshipId}/report`, { body: { reason, details: details.trim() } });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Report a problem"
      onClose={onClose}
      footer={
        sent ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <Button variant="primary" disabled={sending} onClick={() => void send()}>
            Send report
          </Button>
        )
      }
    >
      {sent ? (
        <p>Thanks. An admin will check this listing.</p>
      ) : (
        <div className={shared.form}>
          <Select
            label="What's wrong?"
            placeholder="Pick a reason"
            options={REPORT_REASONS}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <TextArea
            label="Details (optional)"
            rows={3}
            maxLength={1000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
          {error ? (
            <p className={shared.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
