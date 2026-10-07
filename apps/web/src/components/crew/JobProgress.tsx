import type { CrewJob, JobStatus } from "@scholarcrew/domain";
import { StatusPill, Who } from "@scholarcrew/ui";
import styles from "./crew.module.css";

const HEADLINE: Record<JobStatus, string> = {
  queued: "Your crew got your message",
  working: "Your crew is on it",
  ready: "Reply ready",
  needs_input: "Your crew needs one more thing",
  failed: "Your crew couldn't finish this one",
};

/** CR-06: queued → working → ready, with the latest progress events. */
export function JobProgress({ job, error }: { job: CrewJob | null; error: string | null }) {
  const status = job?.status ?? "queued";
  const events = (job?.progress ?? []).slice(-3);
  return (
    <div className={styles.progress} aria-live="polite">
      <div className={styles.progressHead}>
        <StatusPill status={status} />
        <span>{HEADLINE[status]}</span>
      </div>
      {events.length > 0 ? (
        <ul>
          {events.map((e) => (
            <li key={`${e.at}:${e.role}:${e.text}`}>
              {e.role === "system" ? <b>ScholarCrew</b> : <Who role={e.role} size="sm" />}
              <span>{e.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
