"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import { TIME_ZONES, timeZoneLabel } from "@/lib/time";
import type { Profile } from "@scholarcrew/domain";
import { Button, Card, Icon, Select, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./settings.module.css";

export function AccountCard({
  displayName,
  email,
  timeZone,
  roleLine,
  editable,
  navigate = (url: string) => window.location.assign(url),
}: {
  displayName: string;
  email: string;
  timeZone: string;
  roleLine: string;
  editable: boolean;
  navigate?: (url: string) => void;
}) {
  const [name, setName] = useState(displayName);
  const [zone, setZone] = useState(timeZone);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      await api<Profile>("/profile", { method: "PATCH", body: { displayName: name.trim(), timeZone: zone } });
      setStatus("Saved");
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function signOut(everywhere = false) {
    setSignOutError(null);
    try {
      await api(everywhere ? "/auth/sign-out-all" : "/auth/sign-out", { method: "POST" });
    } catch (e) {
      // R3A-13: 13 always clears the cookie on 204. Leave only when that happened, or when the
      // session is already gone; otherwise the session is still live, so stay and say why.
      if (!(e instanceof ApiError && e.code === "unauthenticated")) {
        setSignOutError(errorMessage(e));
        return;
      }
    }
    navigate("/sign-in");
  }

  return (
    <Card title="Account" aside={<Icon name="users" />}>
      {editable ? (
        <div className={styles.form}>
          <TextInput label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <Select label="Time zone" options={TIME_ZONES} value={zone} onChange={(e) => setZone(e.target.value)} />
          <div className={styles.row}>
            <Button variant="primary" size="sm" disabled={busy || name.trim() === ""} onClick={() => void save()}>
              Save
            </Button>
            {status ? <span className={styles.muted}>{status}</span> : null}
          </div>
        </div>
      ) : (
        <>
          <div className={styles.kv}>
            <span>Name</span>
            <b>{displayName}</b>
          </div>
          <div className={styles.kv}>
            <span>Time zone</span>
            <b>{timeZoneLabel(timeZone)}</b>
          </div>
        </>
      )}
      <div className={styles.kv}>
        <span>Email</span>
        <b>{email}</b>
      </div>
      <div className={styles.kv}>
        <span>Sign-in</span>
        <b>Email link · no password</b>
      </div>
      <div className={styles.kv}>
        <span>Account</span>
        <b>{roleLine}</b>
      </div>
      <Button variant="line" size="sm" onClick={() => void signOut()}>
        Sign out
      </Button>
      <Button variant="line" size="sm" onClick={() => void signOut(true)}>
        Sign out everywhere
      </Button>
      {signOutError ? (
        <p className={styles.error} role="alert">
          {signOutError}
        </p>
      ) : null}
    </Card>
  );
}
