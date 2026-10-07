"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort, plural } from "@/lib/format";
import type { CrewJob, JobKind, SweepSummary } from "@scholarcrew/domain";
import { Card, Icon, StatusPill } from "@scholarcrew/ui";
import { useEffect, useState } from "react";
import styles from "./crew.module.css";
import { JOBS_EVENT, recalledJobs } from "./jobMemory";

const ACTIVE_JOBS = "/jobs?active=1&limit=10";
/** While something is running, re-read the list this often. */
const REFRESH_MS = 15_000;

const KIND_LABELS: Record<JobKind, string> = {
  crew_request: "Answering your message",
  weekly_plan: "Planning your week",
  essay_review: "Reviewing your essay",
  offer_parse: "Reading an award letter",
  appeal_outline: "Outlining an appeal",
  retake_analysis: "Checking a retake",
};

/** D28: queued and working jobs from GET /jobs?active=1, from any tab, plus the standing sweep and watcher rows. */
export function BackgroundJobs({ sweep, timeZone }: { sweep: SweepSummary | null; timeZone: string }) {
  const [jobs, setJobs] = useState<CrewJob[]>([]);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      try {
        const list = await api<CrewJob[]>(ACTIVE_JOBS);
        if (!alive) return;
        setJobs(list);
        setLabels(new Map(recalledJobs().map((j) => [j.id, j.label])));
        setError(null);
        if (list.length > 0) timer = setTimeout(() => void load(), REFRESH_MS);
      } catch (e) {
        if (alive) setError(errorMessage(e));
      }
    };
    void load();
    const onChange = () => {
      void load();
    };
    window.addEventListener(JOBS_EVENT, onChange);
    return () => {
      alive = false;
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener(JOBS_EVENT, onChange);
    };
  }, []);

  return (
    <Card title="Working in the background">
      <ul className={styles.jobs}>
        {jobs.map((job) => {
          const asked = labels.get(job.id);
          return (
            <li key={job.id}>
              <span className={styles.ji}>
                <Icon name={job.status === "working" ? "spin" : "clock"} />
              </span>
              <div>
                <b>Your crew</b> · <span>{asked ? `“${asked}”` : KIND_LABELS[job.kind]}</span>
              </div>
              <StatusPill status={job.status} />
            </li>
          );
        })}
        <li>
          <span className={sweep ? styles.jiOk : styles.ji}>
            <Icon name={sweep ? "check" : "clock"} />
          </span>
          <div>
            <b>Weekly sweep</b>
            <span>
              {sweep
                ? ` found ${plural(sweep.newMatches, "new match", "new matches")} · ${instantShort(sweep.ranAt, timeZone)}`
                : " · runs every Sunday"}
            </span>
          </div>
          <StatusPill status={sweep ? "ready" : "on"} />
        </li>
        <li>
          <span className={styles.ji}>
            <Icon name="clock" />
          </span>
          <div>
            <b>Deadline watcher</b>
            <span> · reminders 7, 3, and 1 day before</span>
          </div>
          <StatusPill status="on" />
        </li>
      </ul>
      {error ? <p className={styles.error}>{error}</p> : null}
      <p className={styles.footNote}>
        This keeps running after you close the tab. You get one weekly digest, not eight bots pinging you.
      </p>
    </Card>
  );
}
