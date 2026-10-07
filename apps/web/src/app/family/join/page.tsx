import { InvitePreview, JoinInvite } from "@/components/auth/JoinInvite";
import styles from "@/components/auth/auth.module.css";
import { type SearchParams, firstParam } from "@/components/public/params";
import { getDeps } from "@/server/deps";
import { getPageActor } from "@/server/session";
import { getMe } from "@scholarcrew/core/profile";
import { AcceptInviteInput } from "@scholarcrew/domain";
import { Button, Icon } from "@scholarcrew/ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join your family · ScholarCrew",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function JoinCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export default async function JoinPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const token = (firstParam(await searchParams, "token") ?? "").trim();
  // A missing or cut-off link (fails AcceptInviteInput) gets this card before any lookup or sign-in prompt.
  if (!AcceptInviteInput.safeParse({ token }).success) {
    return (
      <JoinCard title="This invite link is incomplete">
        <p className={styles.sub}>
          Open the link from your invite email again. If it still doesn't work, ask for a new invite.
        </p>
      </JoinCard>
    );
  }
  const actor = await getPageActor();
  if (!actor) {
    // 13 leaves /family/join public (F-18-1), so the invitee sees who sent it before signing in (D37).
    return (
      <JoinCard title="You've been invited to a family">
        <InvitePreview token={token}>
          <p className={styles.sub}>
            Sign in or create an account with the email address the invite was sent to. Then open the invite link in
            your email again to accept it.
          </p>
          <Button variant="primary" href={`/sign-in?next=${encodeURIComponent("/family/join")}`}>
            Sign in
          </Button>
        </InvitePreview>
      </JoinCard>
    );
  }
  const me = await getMe(getDeps(), actor);
  if (me.family) {
    return (
      <JoinCard title="You're already in a family">
        <p className={styles.sub}>Leave your current family from the Family page before joining another one.</p>
        <Button variant="primary" href="/family">
          Go to Family
        </Button>
      </JoinCard>
    );
  }
  return (
    <JoinCard title="Join your family on ScholarCrew">
      <p className={styles.sub}>
        You're signed in as <b>{me.user.email}</b>. The invite has to be for this email address.
      </p>
      <InvitePreview token={token}>
        <ul className={styles.bul}>
          <li>
            <Icon name="users" />
            <span>Your student chooses what you can see, one category at a time.</span>
          </li>
          <li>
            <Icon name="lock" />
            <span>Essays, chats, stories, and sensitive facts stay private unless your student shares them.</span>
          </li>
          <li>
            <Icon name="check" />
            <span>You can leave the family any time from the Family page.</span>
          </li>
        </ul>
        <JoinInvite token={token} />
      </InvitePreview>
    </JoinCard>
  );
}
