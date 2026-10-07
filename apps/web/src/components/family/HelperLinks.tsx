"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import {
  HELPER_SCOPES,
  type HelperLink,
  type HelperLinkCreated,
  type HelperRole,
  type HelperScope,
} from "@scholarcrew/domain";
import { Button, Card, Select, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./family.module.css";

export const SCOPE_LABELS: Record<HelperScope, string> = {
  deadlines: "Deadlines and application status",
  colleges: "College list",
  activities: "Activities (brag sheet)",
  stories: "Story summaries",
  scholarships: "Scholarships",
};

const ROLE_OPTIONS: Array<{ value: HelperRole; label: string }> = [
  { value: "recommender", label: "Recommender" },
  { value: "counselor", label: "Counselor" },
  { value: "mentor", label: "Mentor" },
];

const DAYS_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

function roleLabel(r: HelperRole): string {
  return ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;
}

/** HL-01/HL-04: read-only links for recommenders and counselors, limited to HelperScope. */
export function HelperLinks({ links, timeZone, nowIso }: { links: HelperLink[]; timeZone: string; nowIso: string }) {
  const now = new Date(nowIso);
  const [items, setItems] = useState(links.filter((l) => l.revokedAt === null && new Date(l.expiresAt) > now));
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<HelperRole>("recommender");
  const [scope, setScope] = useState<HelperScope[]>([]);
  const [days, setDays] = useState("30");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleScope(s: HelperScope) {
    setScope((list) =>
      list.includes(s) ? list.filter((x) => x !== s) : HELPER_SCOPES.filter((x) => x === s || list.includes(x)),
    );
  }

  async function create() {
    setError(null);
    try {
      const res = await api<HelperLinkCreated>("/helper-links", {
        method: "POST",
        body: { label: label.trim(), helperRole: role, scope, expiresInDays: Number(days) },
      });
      setItems((list) => [res.link, ...list]);
      setUrl(res.url);
      setCopied(false);
      setOpen(false);
      setLabel("");
      setScope([]);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function revoke(l: HelperLink) {
    setError(null);
    try {
      await api(`/helper-links/${l.id}`, { method: "DELETE" });
      setItems((list) => list.filter((x) => x.id !== l.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError("Copy didn't work. Select the link and copy it yourself.");
    }
  }

  return (
    <Card
      title="Helper links"
      aside={
        <Button variant="line" size="sm" onClick={() => setOpen(!open)}>
          {open ? "Cancel" : "New helper link"}
        </Button>
      }
    >
      {items.length === 0 ? <p className={styles.muted}>No helper links yet.</p> : null}
      {items.map((l) => (
        <div key={l.id} className={styles.kvRow}>
          <div>
            <b>{l.label}</b>
            <p className={styles.muted}>
              {`${roleLabel(l.helperRole)} · sees ${l.scope.map((s) => SCOPE_LABELS[s].toLowerCase()).join(", ")} · until ${instantShort(l.expiresAt, timeZone)}`}
            </p>
          </div>
          <Button variant="line" size="sm" aria-label={`Revoke ${l.label}`} onClick={() => void revoke(l)}>
            Revoke
          </Button>
        </div>
      ))}
      {url ? (
        <div className={styles.secret}>
          <p>
            Send this link to your helper. It's shown once, and anyone with it can see what you checked until it
            expires.
          </p>
          <code className={styles.code}>{url}</code>
          <div className={styles.row}>
            <Button variant="primary" size="sm" onClick={() => void copy(url)}>
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button variant="line" size="sm" onClick={() => setUrl(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
      {open ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim() && scope.length > 0) void create();
          }}
        >
          <TextInput
            label="Name"
            placeholder="Ms. Patel"
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Select
            label="Role"
            options={ROLE_OPTIONS}
            value={role}
            onChange={(e) => setRole(e.target.value as HelperRole)}
          />
          <fieldset className={styles.fieldset}>
            <legend>What they can see</legend>
            {HELPER_SCOPES.map((s) => (
              <label key={s} className={styles.checkRow}>
                <input type="checkbox" value={s} checked={scope.includes(s)} onChange={() => toggleScope(s)} />
                {SCOPE_LABELS[s]}
              </label>
            ))}
          </fieldset>
          <Select label="Link lasts" options={DAYS_OPTIONS} value={days} onChange={(e) => setDays(e.target.value)} />
          <p className={styles.muted}>Helper links never show essays, chats, money, or sensitive facts.</p>
          <Button variant="primary" size="sm" type="submit" disabled={label.trim() === "" || scope.length === 0}>
            Create link
          </Button>
        </form>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
