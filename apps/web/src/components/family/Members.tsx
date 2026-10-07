"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { FamilyMemberRole, FamilyView } from "@scholarcrew/domain";
import { Button, Card, Modal, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./family.module.css";

type Member = FamilyView["members"][number];

/** FA-01 invites, FA-07 leave or remove. Removing or leaving ends access right away. */
export function Members({
  family,
  myUserId,
  myRole,
  timeZone,
  onLeft = () => window.location.assign("/week"),
}: {
  family: FamilyView | null;
  myUserId: string;
  myRole: FamilyMemberRole;
  timeZone: string;
  onLeft?: () => void;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(family?.members ?? []);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function invite() {
    setStatus(null);
    try {
      await api("/family/invites", { method: "POST", body: { email: email.trim() } });
      setStatus(`Invite sent to ${email.trim()}. The link works once and expires in 7 days.`);
      setEmail("");
      router.refresh();
    } catch (e) {
      setStatus(errorMessage(e));
    }
  }

  async function cancelInvite(id: string) {
    try {
      await api(`/family/invites/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setStatus(errorMessage(e));
    }
  }

  async function remove(m: Member) {
    try {
      await api(`/family/members/${m.userId}`, { method: "DELETE" });
      setMembers((list) => list.filter((x) => x.userId !== m.userId));
      setRemoving(null);
      router.refresh();
    } catch (e) {
      setStatus(errorMessage(e));
      setRemoving(null);
    }
  }

  async function leave() {
    try {
      await api("/family/leave", { method: "POST" });
      onLeft();
    } catch (e) {
      setStatus(errorMessage(e));
      setLeaving(false);
    }
  }

  return (
    <div id="invite">
      <Card title="People in your family">
        {members.map((m) => (
          <div key={m.userId} className={styles.kvRow}>
            <div>
              <b>{m.userId === myUserId ? `${m.displayName || m.email} (you)` : m.displayName || m.email}</b>
              <p className={styles.muted}>{m.memberRole === "student" ? "Student" : "Parent"}</p>
            </div>
            {myRole === "student" && m.memberRole === "parent" ? (
              <Button
                variant="line"
                size="sm"
                aria-label={`Remove ${m.displayName || m.email}`}
                onClick={() => setRemoving(m)}
              >
                Remove
              </Button>
            ) : null}
          </div>
        ))}
        {(family?.pendingInvites ?? []).map((i) => (
          <div key={i.id} className={styles.kvRow}>
            <div>
              <b>{i.email}</b>
              <p className={styles.muted}>{`Invite sent · expires ${instantShort(i.expiresAt, timeZone)}`}</p>
            </div>
            {myRole === "student" ? (
              <Button variant="line" size="sm" onClick={() => void cancelInvite(i.id)}>
                Cancel invite
              </Button>
            ) : null}
          </div>
        ))}
        {myRole === "student" ? (
          <form
            className={styles.inline}
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) void invite();
            }}
          >
            <TextInput
              label="Invite a parent by email"
              type="email"
              value={email}
              maxLength={254}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button variant="line" size="sm" type="submit" disabled={email.trim() === ""}>
              Send invite
            </Button>
          </form>
        ) : (
          <p
            className={styles.muted}
          >{`Ask ${members.find((m) => m.memberRole === "student")?.displayName || "your student"} to invite another parent.`}</p>
        )}
        {status ? <p className={styles.muted}>{status}</p> : null}
        {family ? (
          <div className={styles.row}>
            <Button variant="line" size="sm" onClick={() => setLeaving(true)}>
              Leave family room
            </Button>
          </div>
        ) : null}
      </Card>
      <Modal
        open={removing !== null}
        title={`Remove ${removing?.displayName || removing?.email || "this parent"}?`}
        onClose={() => setRemoving(null)}
        footer={
          <Button variant="primary" onClick={() => (removing ? void remove(removing) : undefined)}>
            Remove
          </Button>
        }
      >
        <p>Their access ends right away. Anything they already exported or downloaded can't be recalled.</p>
      </Modal>
      <Modal
        open={leaving}
        title="Leave the family room?"
        onClose={() => setLeaving(false)}
        footer={
          <Button variant="primary" onClick={() => void leave()}>
            Leave
          </Button>
        }
      >
        <p>You'll stop seeing shared items right away. Anything already exported can't be recalled.</p>
      </Modal>
    </div>
  );
}
