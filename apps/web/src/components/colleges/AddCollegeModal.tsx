"use client";

import { api, errorMessage } from "@/lib/api";
import type { AppPlan, CollegeListEntry, CollegeSummary, Fit, Page } from "@scholarcrew/domain";
import { Button, Modal, Select, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";
import { FIT_LABEL, PLAN_LABEL, limitMessage } from "./colleges";
import styles from "./colleges.module.css";

const FITS = (Object.keys(FIT_LABEL) as Fit[]).map((value) => ({ value, label: FIT_LABEL[value] }));
const PLANS = (Object.keys(PLAN_LABEL) as AppPlan[]).map((value) => ({ value, label: PLAN_LABEL[value] }));

/** CO-01 search plus CO-02 add with fit and plan; the 25-school cap shows before and after the request. */
export function AddCollegeModal({ open, count, onClose }: { open: boolean; count: number; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CollegeSummary[] | null>(null);
  const [picked, setPicked] = useState<CollegeSummary | null>(null);
  const [fit, setFit] = useState<Fit>("target");
  const [plan, setPlan] = useState<AppPlan>("RD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = limitMessage(count);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const page = await api<Page<CollegeSummary>>(`/colleges?q=${encodeURIComponent(q.trim())}`);
      setResults(page.items);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await api<CollegeListEntry>("/college-list", { body: { collegeId: picked.id, fit, plan } });
      router.refresh();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Add a school" onClose={onClose}>
      {full ? (
        <p>{full}</p>
      ) : (
        <div className={shared.form}>
          <form className={shared.form} onSubmit={search}>
            <TextInput label="Search colleges" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
            <Button variant="line" type="submit" icon="search" disabled={busy}>
              Search
            </Button>
          </form>
          {results && results.length === 0 ? <p className={shared.muted}>No colleges match that name.</p> : null}
          {results && results.length > 0 && !picked ? (
            <ul className={styles.options}>
              {results.map((c) => (
                <li key={c.id}>
                  <Button variant="line" size="sm" onClick={() => setPicked(c)}>
                    {`${c.name} · ${c.city}, ${c.state}`}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {picked ? (
            <>
              <p className={styles.picked}>{`${picked.name} · ${picked.city}, ${picked.state}`}</p>
              <Select label="Fit" options={FITS} value={fit} onChange={(e) => setFit(e.target.value as Fit)} />
              <Select label="Plan" options={PLANS} value={plan} onChange={(e) => setPlan(e.target.value as AppPlan)} />
              <Button variant="primary" disabled={busy} onClick={() => void add()}>
                Add to my list
              </Button>
            </>
          ) : null}
          {error ? (
            <p className={shared.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
