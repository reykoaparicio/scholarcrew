import { SignInForm } from "@/components/auth/SignInForm";
import styles from "@/components/auth/auth.module.css";
import { signInNotice } from "@/components/auth/messages";
import { type SearchParams, firstParam } from "@/components/public/params";
import { getPageActor } from "@/server/session";
import { Eyebrow, Icon } from "@scholarcrew/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · ScholarCrew",
  description: "Sign in or create an account with a one-time email link. No password.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await getPageActor();
  if (actor) redirect(actor.role === "admin" ? "/admin" : "/week");
  const sp = await searchParams;
  const notice = signInNotice({ error: firstParam(sp, "error"), next: firstParam(sp, "next") });
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <Eyebrow>Enter your email</Eyebrow>
        <h1 className={styles.title}>Sign in or create an account</h1>
        <p className={styles.sub}>Same steps either way. We email you a link, so there's no password to remember.</p>
        {notice.error ? (
          <p className={styles.alert} role="alert">
            <Icon name="alert" />
            <span>{notice.error}</span>
          </p>
        ) : null}
        {notice.note ? (
          <p className={styles.note}>
            <Icon name="info" />
            <span>{notice.note}</span>
          </p>
        ) : null}
        <SignInForm />
        <div className={styles.divider} />
        <div className={styles.agegate}>
          <Icon name="info" />
          <span>
            <b>You need to be 13 or older.</b> We ask for your birth year next. If you're under 13, we can't open an
            account for you, and we'll tell you why.
          </span>
        </div>
        <p className={styles.small}>
          <b>Parents:</b> sign in with your own email. Your account stays separate from your student's, and you see only
          what they share.
        </p>
        <p className={styles.fine}>
          By continuing, you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy policy</a>.
        </p>
      </div>
    </div>
  );
}
