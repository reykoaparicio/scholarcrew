"use client";

import { api, errorMessage } from "@/lib/api";
import { dateShort, instantShort } from "@/lib/format";
import type { ServiceLog } from "@scholarcrew/domain";
import { Badge, Button, Card, EmptyState, Table, TextArea, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";
import { VERIFICATION_VIEW, hoursLabel, parseHours } from "./impact";
import styles from "./impact.module.css";

const EMPTY = {
  organization: "",
  activity: "",
  servedOn: "",
  hours: "",
  supervisorName: "",
  supervisorEmail: "",
  reflection: "",
};

function LogForm() {
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!f.organization.trim() || !f.activity.trim()) return setError("Add where you served and what you did.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.servedOn)) return setError("Pick the date you served.");
    const minutes = parseHours(f.hours);
    if (minutes === null) return setError("Hours are a number between 0 and 24, like 1.5.");
    setBusy(true);
    setError(null);
    try {
      await api<ServiceLog>("/service-logs", {
        body: {
          organization: f.organization.trim(),
          activity: f.activity.trim(),
          servedOn: f.servedOn,
          minutes,
          supervisorName: f.supervisorName.trim(),
          supervisorEmail: f.supervisorEmail.trim(),
          reflection: f.reflection.trim(),
        },
      });
      setF(EMPTY);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Log hours">
      <form aria-label="Log hours" className={shared.form} onSubmit={save} noValidate>
        <TextInput label="Organization" maxLength={200} value={f.organization} onChange={set("organization")} />
        <TextInput label="What you did" maxLength={200} value={f.activity} onChange={set("activity")} />
        <TextInput label="Date" type="date" value={f.servedOn} onChange={set("servedOn")} />
        <TextInput label="Hours" inputMode="decimal" value={f.hours} onChange={set("hours")} />
        <TextInput
          label="Supervisor name (optional)"
          maxLength={120}
          value={f.supervisorName}
          onChange={set("supervisorName")}
        />
        <TextInput
          label="Supervisor email (optional)"
          type="email"
          maxLength={254}
          value={f.supervisorEmail}
          onChange={set("supervisorEmail")}
        />
        <TextArea
          label="Reflection (optional)"
          hint="A sentence or two about one moment. It can become a Story Bank entry later."
          rows={3}
          maxLength={2000}
          value={f.reflection}
          onChange={set("reflection")}
        />
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button variant="primary" type="submit" disabled={busy}>
          Save hours
        </Button>
      </form>
    </Card>
  );
}

/** R2P-10: a `requested` log whose supervisor link lapsed (14 days) can be sent again. */
const LINK_EXPIRED_VIEW = { tone: "neutral", icon: "clock", label: "Link expired" } as const;

function linkExpired(l: ServiceLog, nowMs: number): boolean {
  return (
    l.verification === "requested" && l.verificationExpiresAt !== null && Date.parse(l.verificationExpiresAt) <= nowMs
  );
}

/**
 * IM-01 log, IM-02 supervisor confirmation by email link (14 days, no account), IM-05 story starter.
 * `now` is the server clock (ISO), so the expired check renders the same on the server and in the browser.
 */
export function ServiceLogs({
  logs,
  readOnly,
  timeZone,
  now,
}: { logs: ServiceLog[]; readOnly: boolean; timeZone: string; now: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const sorted = [...logs].sort((a, b) => b.servedOn.localeCompare(a.servedOn));
  const nowMs = Date.parse(now);

  async function call(path: string, method: "POST" | "DELETE") {
    setError(null);
    try {
      await api(path, { method });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className={styles.col}>
      <Card
        title="Service hours"
        aside={<span className={styles.sub}>Supervisors confirm by email link, no account needed</span>}
      >
        {sorted.length === 0 ? (
          <EmptyState title="No hours yet" icon="clock">
            Log each time you serve. Only hours a supervisor confirms count toward scholarship requirements.
          </EmptyState>
        ) : (
          <Table
            caption="Service hours"
            rows={sorted}
            rowKey={(l) => l.id}
            columns={[
              { key: "date", header: "Date", render: (l) => dateShort(l.servedOn) },
              {
                key: "what",
                header: "Where and what",
                render: (l) => (
                  <>
                    {l.organization} <span className={styles.sub}>{`· ${l.activity}`}</span>
                  </>
                ),
              },
              { key: "hours", header: "Hours", align: "right", render: (l) => hoursLabel(l.minutes) },
              { key: "supervisor", header: "Supervisor", render: (l) => l.supervisorName || "—" },
              {
                key: "status",
                header: "Status",
                render: (l) => {
                  const expired = linkExpired(l, nowMs);
                  const view = expired ? LINK_EXPIRED_VIEW : VERIFICATION_VIEW[l.verification];
                  const canAsk =
                    !readOnly && (l.verification === "self_reported" || l.verification === "declined" || expired);
                  return (
                    <>
                      <Badge tone={view.tone} icon={view.icon}>
                        {view.label}
                      </Badge>
                      {l.verification === "verified" && l.verifiedAt ? (
                        <span className={styles.sub}>{` · ${instantShort(l.verifiedAt, timeZone)}`}</span>
                      ) : null}
                      {l.verification === "requested" && !expired ? (
                        <span className={styles.sub}> · link sent</span>
                      ) : null}
                      {l.verification === "declined" && l.verifierNote ? (
                        <span className={styles.sub}>{`“${l.verifierNote}”`}</span>
                      ) : null}
                      {canAsk && l.supervisorEmail ? (
                        <Button
                          variant="line"
                          size="sm"
                          onClick={() => void call(`/service-logs/${l.id}/verify`, "POST")}
                        >
                          Ask to confirm
                        </Button>
                      ) : null}
                      {canAsk && !l.supervisorEmail ? (
                        <span className={styles.sub}> · add a supervisor email to ask</span>
                      ) : null}
                    </>
                  );
                },
              },
              {
                key: "actions",
                header: "",
                render: (l) => (
                  <>
                    {l.reflection && !readOnly ? (
                      <a href={`/essays/stories?fromLog=${l.id}`}>Start a story from this</a>
                    ) : null}
                    {readOnly ? null : (
                      <Button
                        variant="line"
                        size="sm"
                        aria-label={`Delete ${l.organization} on ${dateShort(l.servedOn)}`}
                        onClick={() => void call(`/service-logs/${l.id}`, "DELETE")}
                      >
                        Delete
                      </Button>
                    )}
                  </>
                ),
              },
            ]}
          />
        )}
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
      </Card>
      {readOnly ? null : <LogForm />}
    </div>
  );
}
