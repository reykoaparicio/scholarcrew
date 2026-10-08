"use client";

import { calendarLong, instantLong } from "@/components/public/dates";
import { api, errorMessage } from "@/lib/api";
import { safeHref } from "@/lib/format";
import {
  type AidDeadline,
  AidDeadlineInput,
  type AidRule,
  AidRuleInput,
  STATE_NAMES,
  USState,
  US_STATES,
} from "@scholarcrew/domain";
import { Button, Card, Select, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./admin.module.css";
import { ADMIN_TZ } from "./labels";

type Plan<T> = { ok: true; input: T } | { ok: false; errors: string[] };

export interface RateForm {
  subsidized: string;
  unsubsidized: string;
  parent_plus: string;
  sourceUrl: string;
}

export interface DeadlineForm {
  id: string | null;
  state: string;
  program: string;
  deadline: string;
  note: string;
  sourceUrl: string;
}

const EMPTY_DEADLINE: DeadlineForm = { id: null, state: "", program: "", deadline: "", note: "", sourceUrl: "" };

const RATE_FIELDS = [
  { key: "subsidized", label: "Subsidized rate (%)" },
  { key: "unsubsidized", label: "Unsubsidized rate (%)" },
  { key: "parent_plus", label: "Parent PLUS rate (%)" },
] as const;

const FALLBACK_ERROR = "Check the form and try again.";
const FIELD_ERRORS: Record<string, string> = {
  subsidized: "Subsidized rate: use a percentage from 0 to 30.",
  unsubsidized: "Unsubsidized rate: use a percentage from 0 to 30.",
  parent_plus: "Parent PLUS rate: use a percentage from 0 to 30.",
  sourceUrl: "Source URL: paste the full link to the official page.",
  program: "Program: give it a name (up to 80 characters).",
  deadline: "Deadline: pick a date or leave it blank.",
  note: "Note: keep it under 300 characters.",
  state: "State: pick a state or Federal.",
  awardYear: "Award year: use YYYY-YY.",
};

const STATE_OPTIONS = [
  { value: "", label: "Federal" },
  ...US_STATES.map((s) => ({ value: s, label: `${STATE_NAMES[s]} (${s})` })),
];

/** One plain message per field, from the innermost named path segment (value.parent_plus → parent_plus). */
function aidErrors(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): string[] {
  const out = new Set<string>();
  for (const issue of issues) {
    const key = [...issue.path].reverse().find((p): p is string => typeof p === "string" && p in FIELD_ERRORS);
    out.add(key ? (FIELD_ERRORS[key] ?? FALLBACK_ERROR) : FALLBACK_ERROR);
  }
  return [...out];
}

function percent(text: string): number {
  const t = text.trim();
  return t === "" ? Number.NaN : Number(t);
}

export function loanRateInput(awardYear: string, f: RateForm): Plan<AidRuleInput> {
  const parsed = AidRuleInput.safeParse({
    awardYear,
    key: "federal_loan_rates",
    value: {
      subsidized: percent(f.subsidized),
      unsubsidized: percent(f.unsubsidized),
      parent_plus: percent(f.parent_plus),
    },
    sourceUrl: f.sourceUrl.trim(),
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, errors: aidErrors(parsed.error.issues) };
}

export function deadlineInput(awardYear: string, f: DeadlineForm): Plan<AidDeadlineInput> {
  const parsed = AidDeadlineInput.safeParse({
    ...(f.id ? { id: f.id } : {}),
    awardYear,
    state: f.state === "" ? null : f.state,
    program: f.program,
    deadline: f.deadline === "" ? null : f.deadline,
    note: f.note.trim(),
    sourceUrl: f.sourceUrl.trim(),
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, errors: aidErrors(parsed.error.issues) };
}

export function stateLabel(state: string | null): string {
  if (state === null) return "Federal";
  const s = USState.safeParse(state);
  return s.success ? STATE_NAMES[s.data] : state;
}

/** Soonest first; deadlines with no fixed date go last. */
function byDate(a: AidDeadline, b: AidDeadline): number {
  return (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31") || a.program.localeCompare(b.program);
}

function rateFormOf(rule: AidRule | null): RateForm {
  if (!rule) return { subsidized: "", unsubsidized: "", parent_plus: "", sourceUrl: "" };
  const v = rule.value;
  return {
    subsidized: String(v.subsidized),
    unsubsidized: String(v.unsubsidized),
    parent_plus: String(v.parent_plus),
    sourceUrl: rule.sourceUrl,
  };
}

function formOf(d: AidDeadline): DeadlineForm {
  return {
    id: d.id,
    state: d.state ?? "",
    program: d.program,
    deadline: d.deadline ?? "",
    note: d.note,
    sourceUrl: d.sourceUrl,
  };
}

function Messages({ errors, done }: { errors: string[]; done: string | null }) {
  return (
    <>
      {errors.length > 0 ? (
        <div role="alert" className={styles.alert}>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {done ? <output className={styles.ok}>{done}</output> : null}
    </>
  );
}

/** R2P-1 (MO-09, AID-03): the award year's federal loan rates and its FAFSA and state aid deadlines. */
export function AidRulesEditor({
  awardYear,
  rule,
  deadlines,
}: { awardYear: string; rule: AidRule | null; deadlines: AidDeadline[] }) {
  const router = useRouter();
  const [rates, setRates] = useState<RateForm>(() => rateFormOf(rule));
  const [verifiedAt, setVerifiedAt] = useState<string | null>(rule?.verifiedAt ?? null);
  const [rateErrors, setRateErrors] = useState<string[]>([]);
  const [rateDone, setRateDone] = useState<string | null>(null);
  const [rows, setRows] = useState<AidDeadline[]>(() => [...deadlines].sort(byDate));
  const [form, setForm] = useState<DeadlineForm>(EMPTY_DEADLINE);
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [rowDone, setRowDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveRates() {
    setRateDone(null);
    const plan = loanRateInput(awardYear, rates);
    if (!plan.ok) {
      setRateErrors(plan.errors);
      return;
    }
    setBusy(true);
    setRateErrors([]);
    try {
      const saved = await api<AidRule>("/admin/aid-rules", { method: "PUT", body: plan.input });
      setVerifiedAt(saved.verifiedAt);
      setRateDone(`Loan rates saved for ${awardYear}.`);
      router.refresh();
    } catch (e) {
      setRateErrors([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  }

  async function saveDeadline() {
    setRowDone(null);
    const plan = deadlineInput(awardYear, form);
    if (!plan.ok) {
      setRowErrors(plan.errors);
      return;
    }
    setBusy(true);
    setRowErrors([]);
    try {
      const saved = await api<AidDeadline>("/admin/aid-deadlines", { method: "PUT", body: plan.input });
      setRows((all) => [...all.filter((d) => d.id !== saved.id), saved].sort(byDate));
      setRowDone(form.id ? `Saved ${saved.program}.` : `Added ${saved.program}.`);
      setForm(EMPTY_DEADLINE);
      router.refresh();
    } catch (e) {
      setRowErrors([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: AidDeadline) {
    setBusy(true);
    setRowErrors([]);
    setRowDone(null);
    try {
      await api(`/admin/aid-deadlines/${d.id}`, { method: "DELETE" });
      setRows((all) => all.filter((x) => x.id !== d.id));
      if (form.id === d.id) setForm(EMPTY_DEADLINE);
      setRowDone(`Deleted ${d.program}.`);
      router.refresh();
    } catch (e) {
      setRowErrors([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  }

  function edit(d: AidDeadline) {
    setForm(formOf(d));
    setRowErrors([]);
    setRowDone(null);
  }

  return (
    <div className={styles.stack}>
      <Card title="Federal loan rates">
        <p className={styles.sub}>
          {verifiedAt
            ? `Interest rates for ${awardYear} loans. Last checked ${instantLong(verifiedAt, ADMIN_TZ)}.`
            : `No rates saved for ${awardYear} yet, so award letters show no loan payment estimates.`}
        </p>
        <Messages errors={rateErrors} done={rateDone} />
        <div className={styles.formGrid}>
          {RATE_FIELDS.map((f) => (
            <TextInput
              key={f.key}
              label={f.label}
              inputMode="decimal"
              value={rates[f.key]}
              onChange={(e) => setRates({ ...rates, [f.key]: e.target.value })}
            />
          ))}
          <TextInput
            label="Rates source URL"
            className={styles.wide}
            value={rates.sourceUrl}
            onChange={(e) => setRates({ ...rates, sourceUrl: e.target.value })}
          />
        </div>
        <div className={styles.row}>
          <Button variant="primary" size="sm" disabled={busy} onClick={saveRates}>
            Save loan rates
          </Button>
        </div>
      </Card>

      <Card title="Aid deadlines">
        <Messages errors={rowErrors} done={rowDone} />
        {rows.length === 0 ? (
          <p className={styles.sub}>{`No deadlines for ${awardYear} yet.`}</p>
        ) : (
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the table.
          <section className={styles.tableScroll} tabIndex={0} aria-label="Scrollable data table">
            <table className={styles.fields} aria-label="Aid deadlines">
              <thead>
                <tr>
                  <th scope="col">Applies to</th>
                  <th scope="col">Program</th>
                  <th scope="col">Deadline</th>
                  <th scope="col">Note</th>
                  <th scope="col">Source</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const where = stateLabel(d.state);
                  const href = safeHref(d.sourceUrl);
                  return (
                    <tr key={d.id}>
                      <td>{where}</td>
                      <td>{d.program}</td>
                      <td>{d.deadline ? calendarLong(d.deadline) : "No fixed date"}</td>
                      <td>{d.note || "None"}</td>
                      <td>{href ? <a href={href}>Source</a> : d.sourceUrl}</td>
                      <td>
                        <div className={styles.row}>
                          <Button
                            variant="line"
                            size="sm"
                            disabled={busy}
                            aria-label={`Edit ${d.program} (${where})`}
                            onClick={() => edit(d)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="line"
                            size="sm"
                            disabled={busy}
                            aria-label={`Delete ${d.program} (${where})`}
                            onClick={() => void remove(d)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
        <h3>{form.id ? "Edit deadline" : "Add a deadline"}</h3>
        <div className={styles.formGrid}>
          <Select
            label="State"
            hint="Federal for FAFSA and other national deadlines"
            options={STATE_OPTIONS}
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
          />
          <TextInput
            label="Program"
            value={form.program}
            onChange={(e) => setForm({ ...form, program: e.target.value })}
          />
          <TextInput
            label="Deadline"
            type="date"
            hint="Leave blank if there's no fixed date"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
          />
          <TextInput label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <TextInput
            label="Deadline source URL"
            className={styles.wide}
            value={form.sourceUrl}
            onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
          />
        </div>
        <div className={styles.row}>
          <Button variant="primary" size="sm" disabled={busy} onClick={saveDeadline}>
            {form.id ? "Save deadline" : "Add deadline"}
          </Button>
          {form.id ? (
            <Button variant="line" size="sm" disabled={busy} onClick={() => setForm(EMPTY_DEADLINE)}>
              Cancel edit
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
