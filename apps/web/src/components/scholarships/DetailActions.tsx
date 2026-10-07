"use client";

import { api, errorMessage } from "@/lib/api";
import type { Essay, ScholarshipApplication } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReportModal } from "./ReportModal";
import shared from "./shared.module.css";

const OPEN_STAGES = ["matched", "planned", "drafting"];

/** Header actions: save, mark submitted, report. Parents only get Report. */
export function DetailActions({
  scholarshipId,
  application,
  readOnly,
}: {
  scholarshipId: string;
  application: Pick<ScholarshipApplication, "id" | "stage"> | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(call: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await call();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={shared.actions}>
      {readOnly ? null : application === null ? (
        <Button
          variant="primary"
          icon="bookmark"
          disabled={busy}
          onClick={() => void run(() => api("/scholarship-applications", { body: { scholarshipId } }))}
        >
          Save to my board
        </Button>
      ) : OPEN_STAGES.includes(application.stage) ? (
        <Button
          variant="line"
          disabled={busy}
          onClick={() =>
            void run(() =>
              api(`/scholarship-applications/${application.id}`, { method: "PATCH", body: { stage: "submitted" } }),
            )
          }
        >
          Mark submitted
        </Button>
      ) : null}
      <Button variant="line" icon="alert" onClick={() => setReporting(true)}>
        Report a problem
      </Button>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
      <ReportModal scholarshipId={scholarshipId} open={reporting} onClose={() => setReporting(false)} />
    </div>
  );
}

/** Creates an essay bound to this prompt, moves a saved card to drafting, and opens Essay Studio. */
export function StartEssayButton({
  scholarshipId,
  title,
  prompt,
  wordLimit,
  application,
}: {
  scholarshipId: string;
  title: string;
  prompt: string;
  wordLimit: number | null;
  application: Pick<ScholarshipApplication, "id" | "stage"> | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      // R3V-15/R3A-19: a 200-character listing name plus " essay 2" would fail EssayInput.title's max(200).
      const essay = await api<Essay>("/essays", {
        body: {
          title: title.slice(0, 200),
          prompt,
          wordLimit,
          targetType: "scholarship",
          targetScholarshipId: scholarshipId,
        },
      });
      if (application && (application.stage === "matched" || application.stage === "planned")) {
        await api(`/scholarship-applications/${application.id}`, { method: "PATCH", body: { stage: "drafting" } });
      }
      router.push(`/essays/${essay.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="primary" size="sm" icon="pen" disabled={busy} onClick={() => void start()}>
        Start essay
      </Button>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
