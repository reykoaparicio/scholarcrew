"use client";

import { api, errorMessage } from "@/lib/api";
import { plural } from "@/lib/format";
import type { Conversation } from "@scholarcrew/domain";
import { Button, Card, Modal } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./memory.module.css";

/** New chat, temporary chat (CR-07/ME-06), new season (ME-07), and the way to delete the account (ME-09). */
export function StartFresh() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function chat(room: "my_crew" | "temporary") {
    setBusy(true);
    try {
      const conv = await api<Conversation>("/conversations", { method: "POST", body: { room } });
      router.push(`/crew/${conv.id}`);
    } catch (e) {
      setMessage(errorMessage(e));
      setBusy(false);
    }
  }

  async function newSeason() {
    setBusy(true);
    try {
      const { archived } = await api<{ archived: number }>("/college-list/archive-season", { method: "POST" });
      setMessage(
        `Archived ${plural(archived, "college")} from last season. Your stories, essays, and records are still here.`,
      );
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Start fresh">
      <div className={styles.row}>
        <Button variant="line" disabled={busy} onClick={() => void chat("my_crew")}>
          New chat
        </Button>
        <Button variant="line" disabled={busy} onClick={() => void chat("temporary")}>
          Temporary chat
        </Button>
        <Button variant="line" disabled={busy} onClick={() => setConfirming(true)}>
          New season
        </Button>
        <Button variant="line" href="/settings#delete">
          Delete account
        </Button>
      </div>
      <p className={`${styles.muted} ${styles.freshNote}`}>
        Temporary chats load no memory, save nothing, and are deleted after 24 hours. New season archives senior-year
        admissions and keeps your stories and records.
      </p>
      {message ? <p className={styles.note}>{message}</p> : null}
      <Modal
        open={confirming}
        title="Start a new season?"
        onClose={() => setConfirming(false)}
        footer={
          <Button variant="primary" disabled={busy} onClick={() => void newSeason()}>
            Archive this season
          </Button>
        }
      >
        <p>
          This archives your college list, application checklists, and award letters for this season. Stories, essays,
          activities, and facts stay.
        </p>
      </Modal>
    </Card>
  );
}
