"use client";

import { api, errorMessage } from "@/lib/api";
import type { ApplicationPatch, Board, BoardCard, ScholarshipApplication } from "@scholarcrew/domain";
import { Badge, Button, Chip, Kanban } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddLocalModal } from "./AddLocalModal";
import { FlaggedCard, ScholarshipCard } from "./ScholarshipCard";
import { WonModal } from "./WonModal";
import { BOARD_FILTERS, type BoardFilter, type CardAction, type ColumnKey, boardColumns, totalsLine } from "./board";
import styles from "./scholarships.module.css";
import shared from "./shared.module.css";

const EMPTY: Record<ColumnKey, string> = {
  matched: "Scout adds new matches every Sunday.",
  working: "Save a match here, or ask Compass to plan your week.",
  submitted: "Nothing sent yet.",
  won: "Ledger subtracts every win from your gap automatically.",
  lostOrSkipped: "Nothing here.",
};

/** SC-03 board with filters; every change is a PATCH and a server refresh. */
export function BoardView({ board, readOnly, timeZone }: { board: Board; readOnly: boolean; timeZone: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [showClosed, setShowClosed] = useState(false);
  const [won, setWon] = useState<BoardCard | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch(card: BoardCard, p: ApplicationPatch) {
    await api<ScholarshipApplication>(`/scholarship-applications/${card.application.id}`, { method: "PATCH", body: p });
    router.refresh();
  }

  async function onAction(card: BoardCard, action: CardAction) {
    if (action.patch === null) {
      setWon(card);
      return;
    }
    setPending(card.application.id);
    setError(null);
    try {
      await patch(card, action.patch);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const flagged = filter === "all" ? board.flagged : [];
  const columns = boardColumns(board, filter, showClosed).map((col) => ({
    key: col.key,
    title: col.title,
    count: col.cards.length + (col.key === "matched" ? flagged.length : 0),
    children: (
      <>
        {col.cards.map((c) => (
          <ScholarshipCard
            key={c.application.id}
            card={c}
            timeZone={timeZone}
            readOnly={readOnly}
            pending={pending === c.application.id}
            onAction={(action) => void onAction(c, action)}
          />
        ))}
        {col.key === "matched" ? flagged.map((f) => <FlaggedCard key={f.scholarship.id} {...f} />) : null}
        {col.cards.length === 0 || col.key === "won" ? <p className={styles.colNote}>{EMPTY[col.key]}</p> : null}
      </>
    ),
  }));

  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Scholarships</h1>
          <p className={shared.sub}>{totalsLine(board.totals)}</p>
          {!readOnly && board.privateCount > 0 ? (
            <p className={shared.sub}>{`${board.privateCount} more matches use details you keep private`}</p>
          ) : null}
        </div>
        {readOnly ? null : (
          <div className={shared.actions}>
            <Button variant="line" icon="plus" onClick={() => setAdding(true)}>
              Add a local scholarship
            </Button>
            <Button variant="primary" icon="chat" href="/crew">
              Ask Scout
            </Button>
          </div>
        )}
      </div>
      <div className={styles.toolbar}>
        {BOARD_FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
        <Chip active={showClosed} onClick={() => setShowClosed((v) => !v)}>
          Lost and skipped
        </Chip>
        <span className={styles.spacer} />
        <Badge tone="good">No-fee scholarships only</Badge>
      </div>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
      <Kanban columns={columns} />
      {readOnly ? null : (
        <>
          <WonModal
            key={won?.application.id ?? "none"}
            card={won}
            onClose={() => setWon(null)}
            onSave={async (p) => {
              if (won) await patch(won, p);
              setWon(null);
            }}
          />
          <AddLocalModal open={adding} onClose={() => setAdding(false)} onAdded={() => router.refresh()} />
        </>
      )}
    </>
  );
}
