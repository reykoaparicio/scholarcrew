"use client";

import { api, errorMessage } from "@/lib/api";
import { dateShort, usd } from "@/lib/format";
import { type Page, SCAM_FLAG_TEXT, type ScholarshipSummary } from "@scholarcrew/domain";
import { Badge, Button, Card } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./scholarships.module.css";
import shared from "./shared.module.css";

/** SC-01: catalog search results; flagged listings show the reason and can't be saved. */
export function SearchResults({
  query,
  results,
  savedIds,
  readOnly,
}: {
  query: string;
  results: Page<ScholarshipSummary>;
  savedIds: string[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(id: string) {
    setPending(id);
    setError(null);
    try {
      await api("/scholarship-applications", { body: { scholarshipId: id } });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card title={`${results.total} results for "${query}"`} className={styles.results}>
      {results.items.length === 0 ? (
        <p className={shared.muted}>No published scholarships match that search yet.</p>
      ) : null}
      <ul>
        {results.items.map((s) => {
          const flag = s.scamFlags[0];
          return (
            <li key={s.id} className={styles.result} aria-label={s.name}>
              <div>
                <a className={styles.name} href={`/scholarships/${s.slug}`}>
                  {s.name}
                </a>
                <p className={styles.meta}>
                  {[
                    usd(s.amountMaxUsd),
                    s.localLabel,
                    s.deadline ? `due ${dateShort(s.deadline)}` : "no deadline listed",
                  ].join(" · ")}
                </p>
                {flag ? <p className={shared.error}>{SCAM_FLAG_TEXT[flag]}</p> : null}
              </div>
              {flag ? (
                <Badge tone="crit">Flagged</Badge>
              ) : savedIds.includes(s.id) ? (
                <Badge tone="good">On your board</Badge>
              ) : readOnly ? null : (
                <Button size="sm" variant="soft" disabled={pending !== null} onClick={() => void save(s.id)}>
                  Save
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
