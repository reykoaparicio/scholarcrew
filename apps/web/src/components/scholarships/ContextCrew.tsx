"use client";

import { Thread } from "@/components/crew/Thread";
import { api, errorMessage } from "@/lib/api";
import type { Conversation, CrewRole, Message } from "@scholarcrew/domain";
import { Badge, Button, Card, Eyebrow, Who } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./shared.module.css";

export type ContextRoom = "scholarship" | "college" | "essay";

export interface ContextCrewProps {
  room: ContextRoom;
  refId: string;
  title: string;
  lead: CrewRole;
  placeholder: string;
  chips: Array<{ role: CrewRole; text: string }>;
  timeZone: string;
  /** The open room for this object, or null when the student hasn't asked here yet. */
  conversation: Conversation | null;
  messages: Message[];
}

const ROOM_LABEL: Record<ContextRoom, string> = {
  scholarship: "Crew room · this scholarship",
  college: "Crew room · this college",
  essay: "Crew room · this essay",
};

/** CR-08: a room bound to one object. The header is this plan's; the conversation is plan 16's Thread (D35). */
export function ContextCrew({
  room,
  refId,
  title,
  lead,
  placeholder,
  chips,
  timeZone,
  conversation,
  messages,
}: ContextCrewProps) {
  const router = useRouter();
  const [opened, setOpened] = useState<Conversation | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = conversation ?? opened;

  async function open() {
    setOpening(true);
    setError(null);
    try {
      setOpened(await api<Conversation>("/conversations", { method: "POST", body: { room, roomRefId: refId } }));
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOpening(false);
    }
  }

  return (
    <Card padding="lg">
      <div className={styles.room}>
        <Eyebrow>{ROOM_LABEL[room]}</Eyebrow>
        <div className={styles.roomTop}>
          <span className={styles.roomTitle}>{title}</span>
          <Badge tone="neutral" icon="lock">
            Private
          </Badge>
        </div>
        <p className={styles.muted}>Your crew reads this first in this room.</p>
        {current ? (
          <Thread
            conversation={current}
            messages={conversation ? messages : []}
            chips={chips}
            compact
            placeholder={placeholder}
            emptyText={`Ask anything about this ${room}.`}
            timeZone={timeZone}
          />
        ) : (
          <div className={styles.actions}>
            <Who role={lead} size="sm" />
            <Button variant="primary" size="sm" icon="chat" disabled={opening} onClick={() => void open()}>
              Ask your crew here
            </Button>
          </div>
        )}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
