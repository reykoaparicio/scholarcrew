"use client";

import { api, errorMessage, isLimit } from "@/lib/api";
import type { CrewJob } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useState } from "react";
import { JobReply } from "../scholarships/JobReply";
import shared from "../scholarships/shared.module.css";

/** MO-08: Aid outlines the appeal (points, documents, who to contact); the student writes the letter. */
export function AppealButton({
  offerId,
  collegeName,
  timeZone,
}: { offerId: string; collegeName: string; timeZone: string }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    setLimited(false);
    try {
      const job = await api<CrewJob>(`/offers/${offerId}/appeal`, { method: "POST" });
      setJobId(job.id);
    } catch (e) {
      setError(errorMessage(e));
      // The 402 comes from this POST; JobReply only follows a job that started.
      setLimited(isLimit(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={shared.form}>
      <Button variant="soft" disabled={busy || jobId !== null} onClick={() => void start()}>
        {`Draft an appeal outline for ${collegeName}`}
      </Button>
      <JobReply jobId={jobId} workingText="Aid is outlining your appeal…" timeZone={timeZone} />
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
      {limited ? (
        <Button variant="soft" size="sm" href="/settings">
          See plans
        </Button>
      ) : null}
    </div>
  );
}
