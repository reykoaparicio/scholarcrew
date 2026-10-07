"use client";

import { api, errorMessage } from "@/lib/api";
import { INCOME_OPTIONS, SENSITIVE_OPTIONS, SENSITIVE_ORDER } from "@/lib/sensitive";
import { TIME_ZONES } from "@/lib/time";
import {
  ALLOWED_UPLOAD_MIMES,
  type CollegeSummary,
  type DocumentKind,
  type DocumentMeta,
  MAX_UPLOAD_BYTES,
  type Page,
  type SensitiveKind,
  US_STATES,
} from "@scholarcrew/domain";
import { Button, Select, TextArea, TextInput, Toggle } from "@scholarcrew/ui";
import { useState } from "react";
import { MAX_ONBOARDING_COLLEGES, type OnboardingDraft, type StepErrors } from "./model";
import styles from "./onboarding.module.css";

export interface StepProps {
  draft: OnboardingDraft;
  errors: StepErrors;
  update: (patch: Partial<OnboardingDraft>) => void;
}

const STATE_OPTIONS = US_STATES.map((s) => ({ value: s, label: s }));

export function AboutStep({ draft, errors, update }: StepProps) {
  return (
    <div className={styles.fields}>
      <TextInput
        label="What should we call you?"
        value={draft.displayName}
        error={errors.displayName}
        maxLength={80}
        onChange={(e) => update({ displayName: e.target.value })}
      />
      <TextInput
        label="Birth year"
        hint="ScholarCrew is for students 13 and older."
        inputMode="numeric"
        value={draft.birthYear}
        error={errors.birthYear}
        maxLength={4}
        onChange={(e) => update({ birthYear: e.target.value })}
      />
      <TextInput
        label="High school graduation year"
        inputMode="numeric"
        value={draft.classYear}
        error={errors.classYear}
        maxLength={4}
        onChange={(e) => update({ classYear: e.target.value })}
      />
      <TextInput
        label="High school"
        value={draft.highSchool}
        error={errors.highSchool}
        maxLength={200}
        onChange={(e) => update({ highSchool: e.target.value })}
      />
      <Select
        label="State"
        placeholder="Pick a state"
        options={STATE_OPTIONS}
        value={draft.state}
        error={errors.state}
        onChange={(e) => update({ state: e.target.value })}
      />
      <TextInput
        label="County"
        hint="Local scholarships are often by county."
        value={draft.county}
        error={errors.county}
        maxLength={100}
        onChange={(e) => update({ county: e.target.value })}
      />
      <TextInput
        label="City (optional)"
        value={draft.city}
        maxLength={100}
        onChange={(e) => update({ city: e.target.value })}
      />
      <Select
        label="Time zone"
        options={TIME_ZONES}
        value={draft.timeZone}
        error={errors.timeZone}
        onChange={(e) => update({ timeZone: e.target.value })}
      />
    </div>
  );
}

export function GradesStep({ draft, errors, update }: StepProps) {
  return (
    <div className={styles.fields}>
      <TextInput
        label="Unweighted GPA (optional)"
        hint="Like 3.72. Skip it if you're not sure."
        inputMode="decimal"
        value={draft.gpa}
        error={errors.gpa}
        onChange={(e) => update({ gpa: e.target.value })}
      />
      <TextArea
        label="Intended majors"
        hint="Separate with commas. Up to 5. Undecided is fine."
        rows={2}
        value={draft.majors}
        error={errors.majors}
        onChange={(e) => update({ majors: e.target.value })}
      />
      <TextArea
        label="Interests"
        hint="Up to 10, like robotics, programming, teaching kids."
        rows={2}
        value={draft.interests}
        error={errors.interests}
        onChange={(e) => update({ interests: e.target.value })}
      />
    </div>
  );
}

export function OptInsStep({ draft, errors, update }: StepProps) {
  const set = (kind: SensitiveKind, next: { enabled: boolean; value: string }) =>
    update({ sensitive: { ...draft.sensitive, [kind]: next } });
  return (
    <div className={styles.optins}>
      {SENSITIVE_ORDER.map((kind) => {
        const option = SENSITIVE_OPTIONS[kind];
        const state = draft.sensitive[kind];
        return (
          <div key={kind} className={styles.optin}>
            <Toggle
              checked={state.enabled}
              label={option.label}
              detail={option.detail}
              onChange={(enabled) => set(kind, { enabled, value: enabled ? state.value : "" })}
            />
            {state.enabled && option.value === "income" ? (
              <Select
                label="Income range"
                placeholder="Pick a range"
                options={INCOME_OPTIONS}
                value={state.value}
                error={errors.income_range}
                onChange={(e) => set(kind, { enabled: true, value: e.target.value })}
              />
            ) : null}
            {state.enabled && option.value === "list" ? (
              <TextInput
                label={`${option.label}: which ones? (optional)`}
                hint="Separate with commas. Up to 5."
                value={state.value}
                onChange={(e) => set(kind, { enabled: true, value: e.target.value })}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const UPLOAD_KINDS: Array<{ value: DocumentKind; label: string }> = [
  { value: "transcript", label: "Transcript" },
  { value: "essay", label: "Past essay" },
  { value: "resume", label: "Resume" },
  { value: "other", label: "Something else" },
];

export function UploadsStep({
  uploads,
  onUploaded,
}: { uploads: DocumentMeta[]; onUploaded: (d: DocumentMeta) => void }) {
  const [kind, setKind] = useState<DocumentKind>("transcript");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!(ALLOWED_UPLOAD_MIMES as readonly string[]).includes(file.type)) {
      setError("Upload a PDF, text file, PNG, or JPEG.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("That file is over 10 MB.");
      return;
    }
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    setBusy(true);
    try {
      onUploaded(await api<DocumentMeta>("/documents", { method: "POST", body: form }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.fields}>
      <Select
        label="What is it?"
        options={UPLOAD_KINDS}
        value={kind}
        onChange={(e) => setKind(e.target.value as DocumentKind)}
      />
      <label className={styles.file}>
        <span>Choose a file</span>
        <input
          type="file"
          accept="application/pdf,text/plain,image/png,image/jpeg,.pdf,.txt,.png,.jpg,.jpeg"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </label>
      <p className={styles.hint}>
        PDF, text, or image, 10 MB max. Files are encrypted, and you can download or delete them in Settings.
      </p>
      <p className={styles.note}>
        Past essays are saved as documents. To turn one into Story Bank stories, paste it into a Quill story interview
        in Essays after setup.
      </p>
      {busy ? <p className={styles.hint}>Uploading…</p> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {uploads.length > 0 ? (
        <ul className={styles.list}>
          {uploads.map((d) => (
            <li key={d.id}>
              <b>{d.filename}</b>
              <span className={styles.hint}>{UPLOAD_KINDS.find((k) => k.value === d.kind)?.label ?? d.kind}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function CollegesStep({ draft, errors, update }: StepProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CollegeSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = draft.colleges.length >= MAX_ONBOARDING_COLLEGES;

  async function search() {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setError(null);
    try {
      const page = await api<Page<CollegeSummary>>(`/colleges?q=${encodeURIComponent(term)}&pageSize=8`);
      setResults(page.items);
      if (page.items.length === 0) setError("No colleges matched. Try a shorter name.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className={styles.fields}>
      <form
        className={styles.search}
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <TextInput label="Search colleges" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
        <Button variant="soft" type="submit" disabled={searching}>
          Search
        </Button>
      </form>
      {error ? <p className={styles.hint}>{error}</p> : null}
      {results.length > 0 ? (
        <ul className={styles.list}>
          {results.map((c) => {
            const added = draft.colleges.some((p) => p.id === c.id);
            return (
              <li key={c.id}>
                <span>
                  <b>{c.name}</b> <span className={styles.hint}>{[c.city, c.state].filter(Boolean).join(", ")}</span>
                </span>
                <Button
                  variant="line"
                  size="sm"
                  disabled={added || full}
                  aria-label={`Add ${c.name}`}
                  onClick={() => update({ colleges: [...draft.colleges, { id: c.id, name: c.name, state: c.state }] })}
                >
                  {added ? "Added" : "Add"}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div>
        <p className={styles.label}>{`Your list · ${draft.colleges.length} of ${MAX_ONBOARDING_COLLEGES}`}</p>
        {draft.colleges.length === 0 ? (
          <p className={styles.hint}>No colleges yet. You can add them later on the Colleges page.</p>
        ) : (
          <ul className={styles.list}>
            {draft.colleges.map((c) => (
              <li key={c.id}>
                <span>
                  <b>{c.name}</b> <span className={styles.hint}>{c.state}</span>
                </span>
                <Button
                  variant="line"
                  size="sm"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => update({ colleges: draft.colleges.filter((p) => p.id !== c.id) })}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {errors.colleges ? <p className={styles.error}>{errors.colleges}</p> : null}
      </div>
      <TextInput
        label="Parent or guardian email (optional)"
        hint="We'll send an invite that works once and expires in 7 days. You can also do this later from Family."
        type="email"
        value={draft.parentEmail}
        error={errors.parentEmail}
        maxLength={254}
        onChange={(e) => update({ parentEmail: e.target.value })}
      />
    </div>
  );
}
