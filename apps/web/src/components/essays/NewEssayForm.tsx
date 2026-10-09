"use client";

import { cx } from "@/lib/cx";

import { api, errorMessage } from "@/lib/api";
import type { Essay, EssayTarget } from "@scholarcrew/domain";
import { Button, Card, Select, TextArea, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";
import styles from "./essays.module.css";

type Option = { id: string; name: string };

/** The "For" select's value: "general", "college:<collegeId>", or "scholarship:<scholarshipId>". */
function targetOf(value: string): {
  targetType: EssayTarget;
  targetCollegeId: string | null;
  targetScholarshipId: string | null;
} {
  if (value.startsWith("college:"))
    return { targetType: "college", targetCollegeId: value.slice("college:".length), targetScholarshipId: null };
  if (value.startsWith("scholarship:")) {
    return {
      targetType: "scholarship",
      targetCollegeId: null,
      targetScholarshipId: value.slice("scholarship:".length),
    };
  }
  return { targetType: "general", targetCollegeId: null, targetScholarshipId: null };
}

/** ES-01 (D47): start an essay from any prompt, optionally tied to a listed college or saved scholarship. */
export function NewEssayForm({ colleges, scholarships }: { colleges: Option[]; scholarships: Option[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [limit, setLimit] = useState("");
  const [target, setTarget] = useState("general");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    const name = title.trim();
    if (!name) return setError("Give the essay a title.");
    const raw = limit.trim().replace(/,/g, "");
    const wordLimit = raw === "" ? null : /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (wordLimit !== null && !(wordLimit >= 1 && wordLimit <= 5000)) {
      return setError("Word limits are whole numbers from 1 to 5,000. Leave it blank if there's none.");
    }
    setBusy(true);
    setError(null);
    try {
      const essay = await api<Essay>("/essays", {
        method: "POST",
        body: { title: name, prompt: prompt.trim(), wordLimit, ...targetOf(target) },
      });
      router.push(`/essays/${essay.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const options = [
    { value: "general", label: "General (not for one school)" },
    ...colleges.map((c) => ({ value: `college:${c.id}`, label: `College · ${c.name}` })),
    ...scholarships.map((s) => ({ value: `scholarship:${s.id}`, label: `Scholarship · ${s.name}` })),
  ];
  return (
    <Card title="Start a new essay">
      <form
        id="new-essay"
        aria-label="New essay"
        className={cx(shared.form, styles.newForm)}
        onSubmit={create}
        noValidate
      >
        <TextInput label="Title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Select label="For" options={options} value={target} onChange={(e) => setTarget(e.target.value)} />
        <TextArea
          className={styles.newWide}
          label="Prompt"
          hint="Paste it exactly as the school or scholarship wrote it."
          rows={4}
          maxLength={4000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <TextInput
          label="Word limit (optional)"
          inputMode="numeric"
          maxLength={5}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
        {error ? (
          <p className={cx(shared.error, styles.newWide)} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.newWide}>
          <Button variant="primary" type="submit" icon="pen" disabled={busy}>
            Create essay
          </Button>
        </div>
      </form>
    </Card>
  );
}
