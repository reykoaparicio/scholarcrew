"use client";

import { dateShort, internalHref } from "@/lib/format";
import Link from "next/link";

import { ApiError, api, errorMessage } from "@/lib/api";
import type { ActionCard, ActionReceipt } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./crew.module.css";

export function cardSummary(card: ActionCard): string | null {
  if (card.kind === "confirm_fact") {
    const words = card.fact.key.replace(/_/g, " ").trim();
    const key = words.charAt(0).toUpperCase() + words.slice(1);
    const value = Array.isArray(card.fact.value) ? card.fact.value.join(", ") : String(card.fact.value);
    return `Save to memory: ${key} = ${value} · ${({ crew: "visible to your crew", crew_family: "visible to your crew and family", scout_only: "used for matching only", private: "private" } as const)[card.fact.visibility]}`;
  }
  if (card.kind === "record_decision") return `Log decision: ${card.decision.summary}`;
  if (card.kind === "add_plan_item")
    return `${card.item.title}${card.item.dueOn ? ` · due ${dateShort(card.item.dueOn)}` : ""}`;
  return null;
}

const APPLIED_LABEL: Record<Exclude<ActionCard["kind"], "open_link">, string> = {
  add_plan_item: "Added to your week",
  save_scholarship: "Saved to your board",
  add_college: "Added to your list",
  start_essay: "Essay started",
  record_decision: "Decision saved",
  confirm_fact: "Remembered",
};

/** R3A-15: 08 answers 409 `conflict` while another apply of the same card still holds its claim. */
export const ALREADY_APPLYING = "Already being added…";

/** CR-05: nothing changes until a click; applied cards stay applied (the server is idempotent too). */
export function ActionButtons({
  messageId,
  cards,
  applied,
  readOnly = false,
}: {
  messageId: string;
  cards: ActionCard[];
  applied: string[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState<string[]>([]);
  const [applying, setApplying] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (cards.length === 0) return null;

  async function apply(card: ActionCard) {
    setPending(card.id);
    setError(null);
    try {
      await api<ActionReceipt>("/actions/apply", { method: "POST", body: { messageId, cardId: card.id } });
      setDone((d) => (d.includes(card.id) ? d : [...d, card.id]));
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict") {
        // Another tab or a retried call is applying this card; the refresh picks up appliedCardIds.
        setApplying((a) => (a.includes(card.id) ? a : [...a, card.id]));
        router.refresh();
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setPending(null);
    }
  }

  // Apply buttons first (the first one primary), then links; plan items already show in the reply's step list.
  const ordered = [...cards.filter((c) => c.kind !== "open_link"), ...cards.filter((c) => c.kind === "open_link")];
  const summaries = ordered.flatMap((card) => {
    if (card.kind === "add_plan_item" || applied.includes(card.id) || done.includes(card.id)) return [];
    const summary = cardSummary(card);
    return summary ? [{ id: card.id, summary }] : [];
  });

  return (
    <div className={styles.actionBlock}>
      {summaries.map((s) => (
        <p key={s.id} className={styles.actionSummary}>
          {s.summary}
        </p>
      ))}
      <div className={styles.actions}>
        {ordered.map((card, position) => {
          const variant = position === 0 ? "primary" : "line";
          if (card.kind === "open_link") {
            const href = internalHref(
              card.href,
              typeof window === "undefined" ? "https://scholarcrew.test" : window.location.origin,
            );
            return href ? (
              <Link key={card.id} href={href} className={styles.linkButton}>
                {card.label}
              </Link>
            ) : (
              <span key={card.id}>{card.label}</span>
            );
          }
          if (applied.includes(card.id) || done.includes(card.id)) {
            return (
              <Button key={card.id} variant="soft" icon="check" disabled>
                {APPLIED_LABEL[card.kind]}
              </Button>
            );
          }
          if (applying.includes(card.id)) {
            return (
              <Button key={card.id} variant={variant} disabled>
                {card.label}
              </Button>
            );
          }
          return (
            <Button
              key={card.id}
              variant={variant}
              disabled={readOnly || pending !== null}
              onClick={() => void apply(card)}
            >
              {pending === card.id
                ? "Saving…"
                : card.kind === "confirm_fact"
                  ? "Save to memory"
                  : card.kind === "record_decision"
                    ? "Log this decision"
                    : card.label}
            </Button>
          );
        })}
      </div>
      {applying.length > 0 ? <output className={styles.muted}>{ALREADY_APPLYING}</output> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
