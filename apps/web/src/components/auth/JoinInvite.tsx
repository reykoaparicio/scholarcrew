"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { FamilyMemberRole, FamilyView } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import styles from "./auth.module.css";
import { INVITE_GONE, joinErrorMessage } from "./messages";

/** GET /family/invites/preview (D37). Never includes the invitee's email. */
type InvitePreviewData = { inviterFirstName: string; memberRole: FamilyMemberRole; expiresAt: string };

type PreviewState =
  | { kind: "loading" }
  | { kind: "ready"; preview: InvitePreviewData }
  | { kind: "gone" }
  | { kind: "error"; message: string };

/**
 * Checks the invite before anything else. While loading, when ready, or when the check itself fails
 * (rate limit, network), it shows `children`; for an unknown, expired, or used invite it shows only the
 * generic message.
 */
export function InvitePreview({ token, children }: { token: string; children: ReactNode }) {
  const [state, setState] = useState<PreviewState>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    api<InvitePreviewData>(`/family/invites/preview?token=${encodeURIComponent(token)}`, { method: "GET" })
      .then((preview) => {
        if (live) setState({ kind: "ready", preview });
      })
      .catch((e: unknown) => {
        if (!live) return;
        const gone = e instanceof ApiError && (e.code === "not_found" || e.code === "invalid_input");
        setState(gone ? { kind: "gone" } : { kind: "error", message: errorMessage(e) });
      });
    return () => {
      live = false;
    };
  }, [token]);

  if (state.kind === "gone") {
    return (
      <p className={styles.alert} role="alert">
        {INVITE_GONE}
      </p>
    );
  }
  return (
    <>
      {state.kind === "loading" ? <p className={styles.sub}>Checking your invite…</p> : null}
      {state.kind === "ready" ? (
        <p className={styles.note}>
          {`${state.preview.inviterFirstName} invited you to join as a ${state.preview.memberRole}. The invite expires ${instantShort(state.preview.expiresAt, "America/Chicago")}.`}
        </p>
      ) : null}
      {state.kind === "error" ? <output className={styles.note}>{state.message}</output> : null}
      {children}
    </>
  );
}

export function JoinInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api<FamilyView>("/family/invites/accept", { body: { token } });
      router.push("/family");
    } catch (e) {
      setError(joinErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.row}>
        <Button variant="primary" onClick={accept} disabled={busy}>
          {busy ? "Joining…" : "Accept invite"}
        </Button>
        <Button variant="line" href="/week">
          Not now
        </Button>
      </div>
    </>
  );
}
