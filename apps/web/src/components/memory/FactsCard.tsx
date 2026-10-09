"use client";

import { api, errorMessage } from "@/lib/api";
import type { FactVisibility, MemoryFact } from "@scholarcrew/domain";
import { Button, Card, Icon, Modal, Select, Table, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  SCOUT_ONLY_HINT,
  VISIBILITY_LABELS,
  factLabel,
  factSource,
  inlineLabel,
  textToValue,
  valueToText,
  visibilityOptionsFor,
} from "./labels";
import styles from "./memory.module.css";

/** ME-01/ME-02: every fact with its source, date, and audience; edit supersedes, forget deletes. */
export function FactsCard({ facts: initial, timeZone }: { facts: MemoryFact[]; timeZone: string }) {
  const router = useRouter();
  const [facts, setFacts] = useState(initial);
  const [editing, setEditing] = useState<MemoryFact | null>(null);
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<FactVisibility>("crew");
  const [error, setError] = useState<string | null>(null);

  function startEdit(f: MemoryFact) {
    setEditing(f);
    setText(valueToText(f.value));
    setVisibility(f.visibility);
    setError(null);
  }

  async function save() {
    if (!editing) return;
    try {
      const updated = await api<MemoryFact>(`/facts/${editing.id}`, {
        method: "PATCH",
        body: { value: textToValue(editing.value, text), visibility },
      });
      setFacts((list) => list.map((f) => (f.id === editing.id ? updated : f)));
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function forget(f: MemoryFact) {
    setError(null);
    try {
      await api(`/facts/${f.id}`, { method: "DELETE" });
      setFacts((list) => list.filter((x) => x.id !== f.id));
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card title="Profile facts" aside={<span className={styles.muted}>Every fact shows where it came from</span>}>
      {facts.length === 0 ? (
        <p className={styles.muted}>Nothing saved yet. Facts appear here as you tell your crew about yourself.</p>
      ) : (
        <Table
          rows={facts}
          rowKey={(f) => f.id}
          caption="Profile facts"
          columns={[
            {
              key: "fact",
              header: "Fact",
              render: (f) => (
                <span>
                  <b>{factLabel(f.key)}</b>
                  <span className={styles.value}>{f.valueText}</span>
                </span>
              ),
            },
            {
              key: "source",
              header: "Source",
              render: (f) => <span className={styles.src}>{factSource(f, timeZone)}</span>,
            },
            {
              key: "vis",
              header: "Used by",
              render: (f) => <span className={styles.vis}>{VISIBILITY_LABELS[f.visibility]}</span>,
            },
            {
              key: "acts",
              header: <span className={styles.srOnly}>Actions</span>,
              align: "right",
              render: (f) => (
                <span className={styles.acts}>
                  <button
                    type="button"
                    className={styles.link}
                    aria-label={`Edit ${factLabel(f.key)}`}
                    onClick={() => startEdit(f)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={styles.link}
                    aria-label={`Forget ${factLabel(f.key)}`}
                    onClick={() => void forget(f)}
                  >
                    Forget
                  </button>
                </span>
              ),
            },
          ]}
        />
      )}
      {error && !editing ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Modal
        open={editing !== null}
        title={editing ? `Edit ${factLabel(editing.key)}` : "Edit"}
        onClose={() => setEditing(null)}
        footer={
          <Button variant="primary" onClick={() => void save()} disabled={text.trim() === ""}>
            Save
          </Button>
        }
      >
        <div className={styles.form}>
          <TextInput label="Value" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />
          <Select
            label="Who can use it"
            options={editing ? visibilityOptionsFor(editing.key, editing.visibility) : []}
            hint={visibility === "scout_only" ? SCOUT_ONLY_HINT : undefined}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as FactVisibility)}
          />
          <p className={styles.muted}>Saving replaces the old fact. Your crew sees the new one right away.</p>
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>
      </Modal>
    </Card>
  );
}

/** ME-03: crew guesses wait here; they're never used as facts until confirmed. */
export function CandidatesCard({ candidates: initial }: { candidates: MemoryFact[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function decide(f: MemoryFact, action: "confirm" | "reject") {
    setError(null);
    setItems((list) => list.filter((x) => x.id !== f.id));
    try {
      await api<MemoryFact>(`/facts/${f.id}/${action}`, { method: "POST" });
      router.refresh();
    } catch (e) {
      setItems((list) => [f, ...list]);
      setError(errorMessage(e));
    }
  }

  return (
    <Card
      title="Waiting for your OK"
      aside={<span className={styles.muted}>Unconfirmed guesses expire in 30 days</span>}
    >
      {items.length === 0 ? (
        <p className={styles.muted}>Nothing waiting. Your crew asks before it remembers a guess.</p>
      ) : (
        <ul>
          {items.map((f) => (
            <li key={f.id} className={styles.cand}>
              <Icon name="spark" />
              <span className={styles.candText}>{`Remember ${inlineLabel(f.key)}: ${f.valueText}?`}</span>
              <Button
                variant="soft"
                size="sm"
                aria-label={`Remember ${factLabel(f.key)}`}
                onClick={() => void decide(f, "confirm")}
              >
                Remember
              </Button>
              <Button
                variant="line"
                size="sm"
                aria-label={`No to ${factLabel(f.key)}`}
                onClick={() => void decide(f, "reject")}
              >
                No
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
