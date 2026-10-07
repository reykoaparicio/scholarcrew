"use client";

import { api, errorMessage } from "@/lib/api";
import type { CostSummary } from "@scholarcrew/domain";
import { Button, Card, Select, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";

function dollars(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n <= 200_000 ? n : null;
}

/** MO-02: a school's own net price calculator result replaces the Scorecard estimate; a confirmed award letter outranks both (08 source order, R2P-6). */
export function CalculatorForm({ colleges }: { colleges: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [collegeId, setCollegeId] = useState(colleges[0]?.id ?? "");
  const [coa, setCoa] = useState("");
  const [grants, setGrants] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const costOfAttendanceUsd = dollars(coa);
    const grantsUsd = dollars(grants);
    if (costOfAttendanceUsd === null || grantsUsd === null) return setError("Enter whole dollars, up to $200,000.");
    setError(null);
    try {
      await api<CostSummary>("/costs/calculator", {
        method: "PUT",
        body: { collegeId, costOfAttendanceUsd, grantsUsd },
      });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (colleges.length === 0) return null;
  return (
    <Card title="Ran a school's net price calculator?">
      <form className={shared.form} onSubmit={save}>
        <Select
          label="College"
          options={colleges.map((c) => ({ value: c.id, label: c.name }))}
          value={collegeId}
          onChange={(e) => setCollegeId(e.target.value)}
        />
        <TextInput
          label="Cost to attend for a year"
          inputMode="numeric"
          value={coa}
          onChange={(e) => setCoa(e.target.value)}
        />
        <TextInput
          label="Grants and scholarships it showed"
          inputMode="numeric"
          value={grants}
          onChange={(e) => setGrants(e.target.value)}
        />
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className={shared.muted}>
            Saved. Ledger uses this instead of the Scorecard estimate until you confirm an award letter.
          </p>
        ) : null}
        <Button variant="primary" type="submit">
          Save result
        </Button>
      </form>
    </Card>
  );
}
