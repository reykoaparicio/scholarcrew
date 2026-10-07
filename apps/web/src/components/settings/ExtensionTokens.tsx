"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { ApiToken, ApiTokenCreated } from "@scholarcrew/domain";
import { Badge, Button, Card, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./settings.module.css";

/** EX-01: connect the browser extension. The secret is shown once and never stored in the page. */
export function ExtensionTokens({ tokens: initial, timeZone }: { tokens: ApiToken[]; timeZone: string }) {
  const [tokens, setTokens] = useState(initial.filter((t) => t.revokedAt === null));
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<ApiTokenCreated>("/extension/tokens", { method: "POST", body: { label: label.trim() } });
      setTokens((t) => [res.token, ...t]);
      setSecret(res.secret);
      setCopied(false);
      setLabel("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(t: ApiToken) {
    setError(null);
    try {
      await api(`/extension/tokens/${t.id}`, { method: "DELETE" });
      setTokens((list) => list.filter((x) => x.id !== t.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError("Copy didn't work. Select the code and copy it yourself.");
    }
  }

  return (
    <Card title="Browser extension" aside={tokens.length > 0 ? <Badge tone="good">Connected</Badge> : undefined}>
      {tokens.length > 0 ? (
        <ul className={styles.list}>
          {tokens.map((t) => (
            <li key={t.id}>
              <div>
                <b>{t.label}</b>
                <p className={styles.muted}>
                  {`Connected ${instantShort(t.createdAt, timeZone)} · expires ${instantShort(t.expiresAt, timeZone)}${t.lastUsedAt ? ` · last used ${instantShort(t.lastUsedAt, timeZone)}` : " · not used yet"}`}
                </p>
                {/* R2I-20: the secret's prefix only; the id has nothing to do with the secret. */}
                <span className={styles.token}>sct_••••</span>
              </div>
              <Button
                variant="line"
                size="sm"
                className={styles.crit}
                aria-label={`Disconnect ${t.label}`}
                onClick={() => void revoke(t)}
              >
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No browsers connected.</p>
      )}
      {secret ? (
        <div className={styles.secret}>
          <p>Copy this code into the extension now. You won't see it again.</p>
          <code className={styles.token}>{secret}</code>
          <div className={styles.row}>
            <Button variant="primary" size="sm" onClick={() => void copy(secret)}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="line" size="sm" onClick={() => setSecret(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
      <p className={styles.muted}>
        Suggests answers from your profile on scholarship forms. You check each one; it never clicks submit.
      </p>
      <form
        className={styles.inline}
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) void create();
        }}
      >
        <TextInput
          label="Browser name"
          placeholder="Chrome on my laptop"
          value={label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button variant="line" size="sm" type="submit" disabled={busy || label.trim() === ""}>
          Connect a browser
        </Button>
      </form>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
