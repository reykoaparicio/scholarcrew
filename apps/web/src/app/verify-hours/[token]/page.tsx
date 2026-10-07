import { VerifyHoursForm } from "@/components/public/VerifyHoursForm";
import { VERIFY_HOURS_RATE, allowPageRequest } from "@/components/public/pageRate";
import styles from "@/components/public/verify.module.css";
import { getDeps } from "@/server/deps";
import { getVerificationRequest } from "@scholarcrew/core/impact";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm service hours · ScholarCrew",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1>{title}</h1>
        <p className={styles.sub}>{body}</p>
      </div>
    </div>
  );
}

export default async function VerifyHoursPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await allowPageRequest(VERIFY_HOURS_RATE))) {
    return (
      <Message
        title="Too many tries"
        body="This link was opened too many times in the last hour. Wait an hour, then open it again from your email."
      />
    );
  }
  const view = await getVerificationRequest(getDeps(), token);
  if (!view) {
    return (
      <Message
        title="This link has expired or was already used"
        body="Confirmation links work once and expire after 14 days. If the student still needs you to confirm these hours, they can send a new request."
      />
    );
  }
  return (
    <div className={styles.wrap}>
      <VerifyHoursForm token={token} view={view} />
    </div>
  );
}
