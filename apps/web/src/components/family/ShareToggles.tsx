"use client";

import { api, errorMessage } from "@/lib/api";
import { DEFAULT_SHARED, SHARE_CATEGORIES, type ShareCategory, type ShareSettings } from "@scholarcrew/domain";
import { Card, Toggle } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./family.module.css";

export const SHARE_LABELS: Record<ShareCategory, string> = {
  deadlines: "Deadlines and calendar",
  colleges: "College list",
  costs: "Costs, offers, and the gap",
  scholarships: "Scholarships (names and amounts)",
  activities: "Activities and service",
  essays: "Essays and drafts",
  chats: "Crew chats",
  stories: "Story Bank",
  sensitive: "Sensitive match reasons (scholarship board only, never in chat)",
};

function names(list: string[]): string {
  return list.length > 0 ? list.join(" and ") : "your family";
}

/** FA-02: the student turns sharing on or off per category. */
export function ShareToggles({ settings, parentNames }: { settings: ShareSettings; parentNames: string[] }) {
  const [cats, setCats] = useState<Record<ShareCategory, boolean>>({ ...DEFAULT_SHARED, ...settings.categories });
  const [error, setError] = useState<string | null>(null);
  const who = names(parentNames);

  async function set(category: ShareCategory, enabled: boolean) {
    const before = cats;
    setCats({ ...cats, [category]: enabled });
    setError(null);
    try {
      const saved = await api<ShareSettings>("/family/share-settings", {
        method: "PUT",
        body: { categories: { [category]: enabled } },
      });
      setCats({ ...DEFAULT_SHARED, ...saved.categories });
    } catch (e) {
      setCats(before);
      setError(errorMessage(e));
    }
  }

  return (
    <Card title={`What I share with ${who}`}>
      {SHARE_CATEGORIES.map((category) => (
        <div key={category} className={styles.trow}>
          <Toggle
            checked={cats[category]}
            label={SHARE_LABELS[category]}
            onChange={(next) => void set(category, next)}
          />
        </div>
      ))}
      <p
        className={styles.muted}
      >{`${parentNames.length > 0 ? who : "Your family"} sees only what's on. Turning something off hides it right away.`}</p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
