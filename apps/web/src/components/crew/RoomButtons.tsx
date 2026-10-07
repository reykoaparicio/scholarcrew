"use client";

import { api, errorMessage } from "@/lib/api";
import type { Conversation, RoomKind } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./crew.module.css";

/** New chat and Temporary chat (CR-07: loads no memory, saves nothing, deleted after 24 hours). */
export function RoomButtons() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(room: Extract<RoomKind, "my_crew" | "temporary">) {
    setBusy(true);
    setError(null);
    try {
      const conv = await api<Conversation>("/conversations", { method: "POST", body: { room } });
      router.push(`/crew/${conv.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className={styles.row}>
      <Button variant="line" disabled={busy} onClick={() => void start("my_crew")}>
        New chat
      </Button>
      <Button variant="line" disabled={busy} onClick={() => void start("temporary")}>
        Temporary chat
      </Button>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
