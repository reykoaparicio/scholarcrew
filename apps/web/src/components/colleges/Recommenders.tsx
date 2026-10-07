"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { RecRequest, RecRequestPatch, RecStatus, Recommender } from "@scholarcrew/domain";
import { Button, Card, Select, TextArea, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";
import { type PastRequest, REC_STATUS_LABEL } from "./colleges";
import styles from "./colleges.module.css";

/** R2P-11: "Asked" is shown for a new request but can't be picked; the other three go to `PATCH /recommendations/:id`. */
const STATUS_CHOICES: RecStatus[] = ["requested", "confirmed", "submitted", "declined"];

function linkText(link: PastRequest["link"], timeZone: string): string {
  if (!link) return "No helper link";
  if (link.state === "revoked") return "Helper link turned off";
  if (link.state === "expired") return "Helper link expired";
  return `Helper link open until ${instantShort(link.expiresAt, timeZone)}`;
}

/** CO-07: track recommenders, past requests (D33), and send a request with a scoped brag-sheet link (HL-02). */
export function Recommenders({
  recommenders,
  entryId,
  past,
  timeZone,
}: {
  recommenders: Recommender[];
  entryId: string;
  past: PastRequest[];
  timeZone: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [recommenderId, setRecommenderId] = useState(recommenders[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<Recommender>("/recommenders", {
        body: { name: name.trim(), email: email.trim(), relationship: relationship.trim() },
      });
      setName("");
      setEmail("");
      setRelationship("");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function request(event: FormEvent) {
    event.preventDefault();
    const who = recommenders.find((r) => r.id === recommenderId);
    if (!who) return setError("Add a recommender first.");
    setBusy(true);
    setError(null);
    try {
      await api<RecRequest>("/recommenders/requests", {
        body: { recommenderId, collegeListId: entryId, message: message.trim() },
      });
      setSent(who.name);
      setMessage("");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function setRecStatus(id: string, value: string) {
    if (value !== "confirmed" && value !== "submitted" && value !== "declined") return;
    const body: RecRequestPatch = { status: value };
    setBusy(true);
    setError(null);
    try {
      await api<RecRequest>(`/recommendations/${id}`, { method: "PATCH", body });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Recommenders">
      <ul className={styles.kv}>
        {recommenders.map((r) => (
          <li key={r.id}>
            <span>{r.name}</span>
            <span className={styles.sub}>{r.relationship || r.email}</span>
          </li>
        ))}
      </ul>
      {past.length > 0 ? (
        <>
          <h3 className={styles.sectionTitle}>Letters you asked for</h3>
          <ul className={styles.kv} aria-label="Letters you asked for">
            {past.map((p) => (
              <li key={p.id}>
                <div>
                  <div>
                    {[p.recommenderName, p.requestedAt ? `asked ${instantShort(p.requestedAt, timeZone)}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div className={styles.sub}>{linkText(p.link, timeZone)}</div>
                </div>
                {/* Native select so "Asked" can be shown but disabled; the UI kit's Select has no disabled options. No path creates `draft`. */}
                <select
                  aria-label={`${p.recommenderName} letter status`}
                  className={styles.statusSelect}
                  value={p.status === "draft" ? "requested" : p.status}
                  disabled={busy}
                  onChange={(e) => void setRecStatus(p.id, e.target.value)}
                >
                  {STATUS_CHOICES.map((s) => (
                    <option key={s} value={s} disabled={s === "requested"}>
                      {REC_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {recommenders.length > 0 ? (
        <form aria-label="Ask for a letter" className={shared.form} onSubmit={request}>
          <Select
            label="Recommender"
            options={recommenders.map((r) => ({ value: r.id, label: r.name }))}
            value={recommenderId}
            onChange={(e) => setRecommenderId(e.target.value)}
          />
          <TextArea
            label="Message"
            rows={3}
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button variant="primary" type="submit" disabled={busy}>
            Send request
          </Button>
        </form>
      ) : null}
      {sent ? (
        <output className={styles.picked}>
          {`Request sent to ${sent}. We created a helper link that shows only your activities and stories, expires in 30 days, and emailed it to them. Manage it under `}
          <a href="/family">Family → Helper links</a>.
        </output>
      ) : null}
      <h3 className={styles.sectionTitle}>Add a recommender</h3>
      <form aria-label="Add a recommender" className={shared.form} onSubmit={add}>
        <TextInput label="Name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        <TextInput
          label="Email"
          type="email"
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextInput
          label="How they know you (optional)"
          maxLength={120}
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
        />
        <Button variant="line" type="submit" icon="plus" disabled={busy}>
          Add recommender
        </Button>
      </form>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
