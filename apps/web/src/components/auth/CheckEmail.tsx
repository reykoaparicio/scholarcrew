"use client";

import { api } from "@/lib/api";
import { Button, Icon } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./auth.module.css";
import { EMAIL_PATTERN, SIGNIN_EMAIL_KEY, sendErrorMessage } from "./messages";

const RESEND_SECONDS = 60;

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Reads the address SignInForm saved in sessionStorage; without one, goes back to /sign-in. */
export function CheckEmail() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [left, setLeft] = useState(RESEND_SECONDS);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = (sessionStorage.getItem(SIGNIN_EMAIL_KEY) ?? "").trim().toLowerCase();
    if (EMAIL_PATTERN.test(saved)) setEmail(saved);
    else router.replace("/sign-in");
  }, [router]);

  useEffect(() => {
    const timer = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function resend() {
    if (!email) return;
    setSending(true);
    setError(null);
    setNote(null);
    try {
      await api("/auth/magic-link", { body: { email } });
      setNote("Sent. Check your inbox again.");
      setLeft(RESEND_SECONDS);
    } catch (err) {
      setError(sendErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (!email) return null;

  return (
    <>
      <span className={styles.mail}>
        <Icon name="doc" />
      </span>
      <h1 className={styles.title}>Check your email</h1>
      <p className={styles.sub}>
        We sent a sign-in link to <b>{email}</b>.
      </p>
      <ul className={styles.bul}>
        <li>
          <Icon name="check" />
          <span>Open it on this device to sign in here.</span>
        </li>
        <li>
          <Icon name="clock" />
          <span>It works once and expires in 15 minutes.</span>
        </li>
        <li>
          <Icon name="search" />
          <span>Not there? Check spam or promotions. School email can take a few minutes.</span>
        </li>
      </ul>
      <div className={styles.row}>
        <Button variant="line" disabled={left > 0 || sending} onClick={resend}>
          {left > 0 ? `Resend in ${clock(left)}` : "Resend link"}
        </Button>
        <a href="/sign-in" className={styles.small}>
          Use a different email
        </a>
      </div>
      {note ? <output className={styles.note}>{note}</output> : null}
      {error ? (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.divider} />
      <p className={styles.fine}>On a shared computer? Sign out when you're done.</p>
      <p className={styles.fine}>
        We'll never ask for your password to other sites, like StudentAid.gov or a college portal.
      </p>
    </>
  );
}
