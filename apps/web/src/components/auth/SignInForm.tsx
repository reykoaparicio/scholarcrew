"use client";

import { api } from "@/lib/api";
import { Button, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import styles from "./auth.module.css";
import { BAD_EMAIL, EMAIL_PATTERN, SIGNIN_EMAIL_KEY, sendErrorMessage } from "./messages";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(value)) {
      setError(BAD_EMAIL);
      return;
    }
    setError(null);
    setSending(true);
    try {
      await api("/auth/magic-link", { body: { email: value } });
      // The address stays out of the URL (history, autocomplete, access logs); this tab's storage only.
      sessionStorage.setItem(SIGNIN_EMAIL_KEY, value);
      router.push("/sign-in/check-email");
    } catch (err) {
      setError(sendErrorMessage(err));
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <TextInput
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error ?? undefined}
      />
      <Button type="submit" variant="primary" disabled={sending} className={styles.full}>
        {sending ? "Sending…" : "Email me a sign-in link"}
      </Button>
      <p className={styles.fineCenter}>The link works once and expires in 15 minutes.</p>
    </form>
  );
}
