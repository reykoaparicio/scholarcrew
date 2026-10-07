"use client";

import { api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { instantShort } from "@/lib/format";
import type { Notification } from "@scholarcrew/domain";
import { Icon } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import styles from "./shell.module.css";

function isInternal(link: string): boolean {
  return /^\/(?!\/)/.test(link);
}

/**
 * NO-01: the top-bar bell. Lists /api/v1/notifications, marks items read, follows internal links. Opening moves
 * focus into the panel; Escape closes it and refocuses the bell; a click outside closes it.
 */
export function NotificationBell({ timeZone = "America/Chicago" }: { timeZone?: string }) {
  const router = useRouter();
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const readLocally = useRef(new Map<string, string>());
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = await api<Notification[]>("/notifications");
      setItems(loaded.map((n) => ({ ...n, readAt: readLocally.current.get(n.id) ?? n.readAt })));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>("button") ?? panel)?.focus();
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && event.target instanceof Node && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const unread = items.filter((n) => n.readAt === null);

  async function markRead(n: Notification) {
    if (n.readAt !== null) return;
    const at = new Date().toISOString();
    readLocally.current.set(n.id, at);
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, readAt: at } : x)));
    try {
      await api(`/notifications/${n.id}/read`, { method: "POST" });
    } catch (e) {
      readLocally.current.delete(n.id);
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, readAt: n.readAt } : x)));
      setError(errorMessage(e));
    }
  }

  async function openItem(n: Notification) {
    await markRead(n);
    if (isInternal(n.link)) {
      setOpen(false);
      router.push(n.link);
    }
  }

  async function markAll() {
    for (const n of unread) await markRead(n);
  }

  return (
    <div ref={wrapRef} className={styles.bellWrap}>
      <button
        ref={bellRef}
        type="button"
        className={styles.bell}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread.length > 0 ? `Notifications, ${unread.length} unread` : "Notifications"}
        onClick={() => {
          if (!open) void load();
          setOpen(!open);
        }}
      >
        <Icon name="bell" />
        {unread.length > 0 ? <span className={styles.pip} /> : null}
      </button>
      {open ? (
        <section
          ref={panelRef}
          id={panelId}
          tabIndex={-1}
          className={styles.panel}
          aria-label="Notifications"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setOpen(false);
            bellRef.current?.focus();
          }}
        >
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Notifications</h2>
            {unread.length > 0 ? (
              <button type="button" className={styles.linkBtn} onClick={() => void markAll()}>
                Mark all read
              </button>
            ) : null}
          </div>
          {error ? <p className={styles.panelError}>{error}</p> : null}
          {items.length === 0 ? (
            <p className={styles.panelEmpty}>Nothing new. Your crew sends one weekly digest, not a stream of pings.</p>
          ) : (
            <ul className={styles.panelList}>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cx(styles.note, n.readAt === null && styles.unread)}
                    onClick={() => void openItem(n)}
                  >
                    <span className={styles.noteTitle}>
                      {n.readAt === null ? <span className={styles.srOnly}>Unread: </span> : null}
                      {n.title}
                    </span>
                    <span className={styles.noteBody}>{n.body}</span>
                    <span className={styles.noteTime}>{instantShort(n.createdAt, timeZone)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
