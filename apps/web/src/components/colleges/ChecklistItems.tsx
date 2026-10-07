"use client";

import { api, errorMessage } from "@/lib/api";
import { dateShort } from "@/lib/format";
import type { ApplicationItem, Essay, ItemStatus } from "@scholarcrew/domain";
import { Button, Select } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import shared from "../scholarships/shared.module.css";
import { ITEM_STATUS_OPTIONS } from "./colleges";
import styles from "./colleges.module.css";

/**
 * CO-03: each item can be to do, in progress, done, or not needed.
 * R2P-17: a supplement with no draft gets "Start essay" (students only), which creates a college essay,
 * links it to the item, and opens Essay Studio.
 */
export function ChecklistItems({
  items,
  collegeId,
  readOnly,
}: { items: ApplicationItem[]; collegeId: string; readOnly: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  async function setStatus(id: string, status: ItemStatus) {
    setError(null);
    try {
      await api<ApplicationItem>(`/application-items/${id}`, { method: "PATCH", body: { status } });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function startEssay(item: ApplicationItem) {
    setError(null);
    setStarting(item.id);
    try {
      const essay = await api<Essay>("/essays", {
        method: "POST",
        body: {
          title: item.label.slice(0, 200),
          prompt: item.label,
          targetType: "college",
          targetCollegeId: collegeId,
        },
      });
      await api<ApplicationItem>(`/application-items/${item.id}`, { method: "PATCH", body: { essayId: essay.id } });
      router.push(`/essays/${essay.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setStarting(null);
    }
  }

  return (
    <>
      <ul className={styles.items}>
        {items.map((i) => (
          <li key={i.id}>
            <div>
              <div>{i.label}</div>
              <div className={styles.sub}>
                {i.dueOn ? `Due ${dateShort(i.dueOn)}` : "No date"}
                {i.essayId ? (
                  <>
                    {" · "}
                    <a href={`/essays/${i.essayId}`}>Open draft</a>
                  </>
                ) : null}
              </div>
              {!readOnly && i.kind === "supplement" && !i.essayId ? (
                <Button
                  variant="line"
                  size="sm"
                  icon="pen"
                  disabled={starting !== null}
                  onClick={() => void startEssay(i)}
                >
                  {starting === i.id ? "Starting…" : "Start essay"}
                </Button>
              ) : null}
            </div>
            {readOnly ? (
              <span>{ITEM_STATUS_OPTIONS.find((o) => o.value === i.status)?.label}</span>
            ) : (
              <Select
                label={`${i.label} status`}
                options={ITEM_STATUS_OPTIONS}
                value={i.status}
                onChange={(e) => void setStatus(i.id, e.target.value as ItemStatus)}
              />
            )}
          </li>
        ))}
      </ul>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
