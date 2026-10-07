"use client";

import { api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import type { Activity, ActivityInput } from "@scholarcrew/domain";
import { Badge, Button, Card, TextArea, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";
import { MAX_ACTIVITIES, activityCounter } from "./impact";
import styles from "./impact.module.css";

const GRADES = [9, 10, 11, 12];

function whole(text: string, max: number): number | null {
  if (text.trim() === "") return 0;
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n <= max ? n : null;
}

function ActivitySlot({ position, activity }: { position: number; activity: Activity | null }) {
  const router = useRouter();
  const [name, setName] = useState(activity?.name ?? "");
  const [role, setRole] = useState(activity?.role ?? "");
  const [organization, setOrganization] = useState(activity?.organization ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [hours, setHours] = useState(activity ? String(activity.hoursPerWeek) : "");
  const [weeks, setWeeks] = useState(activity ? String(activity.weeksPerYear) : "");
  const [grades, setGrades] = useState<number[]>(activity?.grades ?? []);
  const [category, setCategory] = useState(activity?.category ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const counter = activityCounter(description);

  async function save(event: FormEvent) {
    event.preventDefault();
    const hoursPerWeek = whole(hours, 80);
    const weeksPerYear = whole(weeks, 52);
    if (!name.trim()) return setError("Give the activity a name.");
    if (hoursPerWeek === null || weeksPerYear === null)
      return setError("Use whole numbers: up to 80 hours a week and 52 weeks a year.");
    const input: ActivityInput = {
      position,
      name: name.trim(),
      role: role.trim(),
      organization: organization.trim(),
      description,
      hoursPerWeek,
      weeksPerYear,
      grades: [...grades].sort((a, b) => a - b),
      category: category.trim(),
    };
    setBusy(true);
    setError(null);
    try {
      await api<Activity>("/activities", { method: "PUT", body: input });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!activity) return;
    setError(null);
    try {
      await api(`/activities/${activity.id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <form aria-label={`Activity ${position}`} className={styles.slot} onSubmit={save} noValidate>
      <div className={shared.form}>
        <TextInput label="Activity name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        <TextInput label="Your role" maxLength={50} value={role} onChange={(e) => setRole(e.target.value)} />
        <TextInput
          label="Organization"
          maxLength={100}
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
        />
        <TextInput
          label="Hours per week"
          inputMode="numeric"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
        <TextInput
          label="Weeks per year"
          inputMode="numeric"
          value={weeks}
          onChange={(e) => setWeeks(e.target.value)}
        />
        <fieldset className={styles.grades}>
          <legend>Grades</legend>
          {GRADES.map((g) => (
            <label key={g}>
              <input
                type="checkbox"
                aria-label={`Grade ${g}`}
                checked={grades.includes(g)}
                onChange={(e) => setGrades(e.target.checked ? [...grades, g] : grades.filter((x) => x !== g))}
              />{" "}
              {g}
            </label>
          ))}
        </fieldset>
        <TextInput label="Category" maxLength={60} value={category} onChange={(e) => setCategory(e.target.value)} />
      </div>
      <div className={cx(shared.form, counter.state === "over" && styles.over)}>
        <TextArea label="Description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className={styles.counter}>
          <span>{counter.label}</span>
          {/* Only the near/over note is announced, when it changes; the running count would speak on every keystroke. */}
          <span aria-live="polite">
            {counter.note ? <Badge tone={counter.state === "over" ? "crit" : "warn"}>{counter.note}</Badge> : null}
          </span>
        </div>
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={shared.actions}>
          <Button variant="primary" type="submit" disabled={busy || counter.state === "over"}>
            Save activity
          </Button>
          {activity ? (
            <Button variant="line" onClick={() => void remove()}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

/** IM-04: up to 10 activities; descriptions are 150 characters, counted exactly. */
export function ActivitiesEditor({ activities, readOnly }: { activities: Activity[]; readOnly: boolean }) {
  const sorted = [...activities].sort((a, b) => a.position - b.position);
  const used = new Set(sorted.map((a) => a.position));
  const nextFree = Array.from({ length: MAX_ACTIVITIES }, (_, i) => i + 1).find((p) => !used.has(p)) ?? null;
  return (
    <Card
      title="Activities list"
      aside={
        <span
          className={styles.sub}
        >{`${sorted.length} of ${MAX_ACTIVITIES} · 150 characters each, counted exactly`}</span>
      }
    >
      {readOnly ? (
        <ul>
          {sorted.map((a) => (
            <li key={a.id} className={styles.slot}>
              <div>
                <b>{a.name}</b>
                <div className={styles.sub}>{[a.role, a.organization].filter(Boolean).join(" · ")}</div>
                <div className={styles.sub}>{`${a.hoursPerWeek} h/wk · ${a.weeksPerYear} wk/yr`}</div>
              </div>
              <p>{a.description}</p>
            </li>
          ))}
        </ul>
      ) : (
        <>
          {sorted.map((a) => (
            <ActivitySlot key={a.id} position={a.position} activity={a} />
          ))}
          {nextFree !== null ? (
            <ActivitySlot key={`new-${nextFree}-${sorted.length}`} position={nextFree} activity={null} />
          ) : null}
        </>
      )}
    </Card>
  );
}
