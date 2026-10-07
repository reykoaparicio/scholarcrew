"use client";

import { OPTIONAL_CREW_FACT, type OptionalCrew } from "@/components/shell/nav";
import { api, errorMessage } from "@/lib/api";
import { Chip } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./crew.module.css";

const LABELS: Record<OptionalCrew, string> = { prep: "Prep · tests", impact: "Impact · service" };

/** Switches on Prep or Impact by saving the confirmed fact the shell and plan 12's port read (visibility crew, D43). */
export function AddTeammate({ missing }: { missing: OptionalCrew[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  if (missing.length === 0) return null;

  async function add(role: OptionalCrew) {
    setError(null);
    try {
      await api("/facts", { method: "POST", body: { key: OPTIONAL_CREW_FACT[role], value: true, visibility: "crew" } });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div id="add-teammate" className={styles.addmate}>
      <span className={styles.muted}>Add a teammate</span>
      {missing.map((role) => (
        <Chip key={role} dot={role} onClick={() => void add(role)}>
          {LABELS[role]}
        </Chip>
      ))}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
