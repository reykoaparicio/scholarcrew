"use client";

import { api, errorMessage, isLimit } from "@/lib/api";
import { useJobStream } from "@/lib/sse";
import {
  type Conversation,
  type CrewJob,
  type CrewRole,
  type Message,
  TERMINAL_JOB_STATUSES,
} from "@scholarcrew/domain";
import { Button, Chip } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { JobProgress } from "./JobProgress";
import { ReplyCard } from "./ReplyCard";
import styles from "./crew.module.css";
import { rememberJob } from "./jobMemory";

export const DEFAULT_CHIPS: Array<{ role: CrewRole; text: string }> = [
  { role: "scout", text: "@Scout new matches" },
  { role: "quill", text: "@Quill essay help" },
  { role: "aid", text: "@Aid FAFSA checklist" },
  { role: "ledger", text: "@Ledger compare schools" },
];

/** A context room that doesn't exist yet; the first send creates (or reopens) it (CR-08, D35). */
export interface LazyRoom {
  room: "scholarship" | "college" | "essay";
  roomRefId: string;
}

export interface ThreadProps {
  /** null with `openRoom` set: the room is created on the first send. */
  conversation: Conversation | null;
  messages: Message[];
  prefill?: string;
  chips?: Array<{ role: CrewRole; text: string }>;
  compact?: boolean;
  readOnlyCards?: boolean;
  /** userId → name, shown above bubbles in the family room. */
  authors?: Record<string, string>;
  /** The signed-in user; with `authors`, other people's messages sit on the left with their initial. */
  viewerId?: string;
  placeholder?: string;
  emptyText?: string;
  timeZone?: string;
  openRoom?: LazyRoom;
  /** Messages only: no chips or composer, and action cards render read-only (parents' shared views). */
  readOnly?: boolean;
}

/** A conversation: bubbles, crew replies, live job progress, mention chips, and the composer. */
export function Thread({
  conversation,
  messages,
  prefill,
  chips = DEFAULT_CHIPS,
  compact = false,
  readOnlyCards = false,
  authors,
  viewerId,
  placeholder = "Message your crew… mention @Scout, @Quill, @Aid, or @Ledger",
  emptyText = "Ask anything about scholarships, essays, colleges, or paying for school.",
  timeZone = "America/Chicago",
  openRoom,
  readOnly = false,
}: ThreadProps) {
  const router = useRouter();
  const [earlier, setEarlier] = useState<Message[]>([]);
  const [hasEarlier, setHasEarlier] = useState(messages.length >= 50);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [lastSent, setLastSent] = useState("");
  const [room, setRoom] = useState<Conversation | null>(conversation);
  const [text, setText] = useState(prefill ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, setPending] = useState<Message | null>(null);
  const { job, error: streamError } = useJobStream(jobId);
  const current = room ?? conversation;
  const canSend = !readOnly && (current !== null || openRoom !== undefined);

  useEffect(() => {
    if (!job || !TERMINAL_JOB_STATUSES.includes(job.status)) return;
    if (job.status === "failed") setFailure("Your crew couldn't finish this one. Try asking again in a minute.");
    setJobId(null);
    router.refresh();
  }, [job, router]);

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || sending || !canSend) return;
      setLastSent(trimmed);
      setSending(true);
      setError(null);
      setLimited(false);
      setFailure(null);
      try {
        let target = current;
        if (!target && openRoom) {
          target = await api<Conversation>("/conversations", {
            method: "POST",
            body: { room: openRoom.room, roomRefId: openRoom.roomRefId, familyId: null, title: "" },
          });
          setRoom(target);
        }
        if (!target) return;
        const res = await api<{ message: Message; job: CrewJob }>(`/conversations/${target.id}/messages`, {
          method: "POST",
          body: { body: trimmed },
        });
        setPending(res.message);
        setText("");
        setJobId(res.job.id);
        rememberJob(res.job, trimmed);
        router.refresh();
      } catch (e) {
        setError(errorMessage(e));
        setLimited(isLimit(e));
      } finally {
        setSending(false);
      }
    },
    [canSend, current, openRoom, router, sending],
  );

  const history = [...earlier, ...messages].filter(
    (message, i, all) => all.findIndex((other) => other.id === message.id) === i,
  );
  const shown = pending && !history.some((m) => m.id === pending.id) ? [...history, pending] : history;
  async function loadEarlier() {
    const first = shown[0];
    if (!current || !first || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const page = await api<Message[]>(
        `/conversations/${current.id}/messages?before=${encodeURIComponent(first.id)}&limit=50`,
      );
      setEarlier((previous) => [...page, ...previous]);
      setHasEarlier(page.length === 50);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingEarlier(false);
    }
  }
  const lastCrew = [...shown].reverse().find((m) => m.authorKind === "crew");
  const showChips = !readOnly && chips.length > 0 && lastCrew?.reply?.safety !== "crisis";
  const busy = sending || (jobId !== null && streamError === null);

  return (
    <div className={styles.thread}>
      {hasEarlier && current ? (
        <Button variant="line" disabled={loadingEarlier} onClick={() => void loadEarlier()}>
          Show earlier messages
        </Button>
      ) : null}
      {shown.length === 0 && !jobId ? <p className={styles.muted}>{emptyText}</p> : null}
      {shown.map((m) =>
        m.authorKind === "user" ? (
          viewerId && authors && m.authorUserId && m.authorUserId !== viewerId ? (
            <div key={m.id} className={styles.otherRow}>
              <span className={styles.avatar} aria-hidden="true">
                {(authors[m.authorUserId] ?? "?").charAt(0).toUpperCase()}
              </span>
              <div className={styles.otherBubble}>
                <span className={styles.author}>{authors[m.authorUserId] ?? "Family member"}</span>
                {m.body}
              </div>
            </div>
          ) : (
            <div key={m.id} className={styles.bubble}>
              {authors && m.authorUserId && authors[m.authorUserId] ? (
                <span className={styles.author}>{authors[m.authorUserId]}</span>
              ) : null}
              {m.body}
            </div>
          )
        ) : (
          <ReplyCard
            key={m.id}
            message={m}
            compact={compact}
            readOnly={readOnly || readOnlyCards}
            timeZone={timeZone}
          />
        ),
      )}
      {jobId ? <JobProgress job={job} error={streamError} /> : null}
      {failure ? (
        <p className={styles.error} role="alert">
          {failure}
          {!readOnly && lastSent ? (
            <Button variant="line" disabled={busy} onClick={() => void send(lastSent)}>
              Send again
            </Button>
          ) : null}
        </p>
      ) : null}
      {showChips ? (
        <div className={styles.chips}>
          {chips.map((c) => (
            <Chip key={c.text} dot={c.role} onClick={() => setText(c.text)}>
              {c.text}
            </Chip>
          ))}
        </div>
      ) : null}
      {readOnly ? null : (
        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <textarea
            className={styles.composerInput}
            aria-label="Message your crew"
            placeholder={placeholder}
            value={text}
            rows={1}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
          />
          <Button variant="primary" type="submit" disabled={busy || !canSend || text.trim() === ""}>
            Send
          </Button>
        </form>
      )}
      {error ? (
        <div className={styles.row}>
          <p className={styles.error} role="alert">
            {error}
          </p>
          {limited ? (
            <Button variant="soft" size="sm" href="/settings">
              See plans
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
