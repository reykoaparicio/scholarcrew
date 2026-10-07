"use client";

import { api, errorMessage } from "@/lib/api";
import { COMPOSITE_RANGE, type TestKind, type TestScore } from "@scholarcrew/domain";
import { Button, Modal, Select, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";
import { SECTIONS } from "./prep";

const TESTS = (["ACT", "SAT", "PSAT"] as const).map((value) => ({ value, label: value }));

/** PR-01: official or practice scores with optional section scores. */
export function AddScoreModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [test, setTest] = useState<TestKind>("ACT");
  const [takenOn, setTakenOn] = useState("");
  const [official, setOfficial] = useState("official");
  const [composite, setComposite] = useState("");
  const [sections, setSections] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const range = COMPOSITE_RANGE[test];
    const n = Number(composite);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(takenOn)) return setError("Pick the test date.");
    if (!/^\d+$/.test(composite) || n < range.min || n > range.max) {
      return setError(`${test} composites run from ${range.min} to ${range.max}.`);
    }
    const parsed: Record<string, number> = {};
    for (const section of SECTIONS[test]) {
      const raw = sections[section.key]?.trim();
      if (!raw) continue;
      if (!/^\d+$/.test(raw) || Number(raw) > 800) return setError(`Check the ${section.label} score.`);
      parsed[section.key] = Number(raw);
    }
    setBusy(true);
    setError(null);
    try {
      await api<TestScore>("/test-scores", {
        body: { test, takenOn, official: official === "official", composite: n, sections: parsed },
      });
      router.refresh();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Add a score" onClose={onClose}>
      <form className={shared.form} onSubmit={save} noValidate>
        <Select
          label="Test"
          options={TESTS}
          value={test}
          onChange={(e) => {
            setTest(e.target.value as TestKind);
            setSections({});
          }}
        />
        <TextInput label="Test date" type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} />
        <Select
          label="Type"
          options={[
            { value: "official", label: "Official" },
            { value: "practice", label: "Practice" },
          ]}
          value={official}
          onChange={(e) => setOfficial(e.target.value)}
        />
        <TextInput
          label="Composite"
          inputMode="numeric"
          value={composite}
          onChange={(e) => setComposite(e.target.value)}
        />
        {SECTIONS[test].map((section) => (
          <TextInput
            key={section.key}
            label={section.label}
            inputMode="numeric"
            value={sections[section.key] ?? ""}
            onChange={(e) => setSections({ ...sections, [section.key]: e.target.value })}
          />
        ))}
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button variant="primary" type="submit" disabled={busy}>
          Save score
        </Button>
      </form>
    </Modal>
  );
}
