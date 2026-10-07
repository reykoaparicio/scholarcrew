import { AccountCard } from "@/components/settings/AccountCard";
import { BillingReturnNotice } from "@/components/settings/BillingReturnNotice";
import { DataCard } from "@/components/settings/DataCard";
import { DocumentsCard } from "@/components/settings/DocumentsCard";
import { ExtensionTokens } from "@/components/settings/ExtensionTokens";
import { NotificationsCard } from "@/components/settings/NotificationsCard";
import { PlanCard } from "@/components/settings/PlanCard";
import styles from "@/components/settings/settings.module.css";
import { requireAppActor } from "@/lib/pageActor";
import { latestExport } from "@scholarcrew/core/account";
import { listApiTokens } from "@scholarcrew/core/apitokens";
import { getSubscription, getUsage } from "@scholarcrew/core/billing";
import { listDocuments } from "@scholarcrew/core/documents";
import { getPrefs } from "@scholarcrew/core/notifications";
import { Button } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor, me, deps } = await requireAppActor(["student", "parent"]);
  const isStudent = me.user.role === "student";
  const isParent = me.user.role === "parent";
  const sp = await searchParams;
  const billingReturn = sp.billing === "success" || sp.billing === "cancel" ? sp.billing : null;
  const [prefs, subscription, usage, tokens, docs, latest] = await Promise.all([
    getPrefs(deps, actor),
    getSubscription(deps, actor),
    getUsage(deps, actor),
    isStudent ? listApiTokens(deps, actor) : Promise.resolve([]),
    listDocuments(deps, actor),
    latestExport(deps, actor),
  ]);
  const tz = me.user.timeZone;
  const roleLine = isStudent ? `Student${me.profile?.highSchool ? ` · ${me.profile.highSchool}` : ""}` : "Parent";

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1>Settings</h1>
          <p className={styles.sub}>Your account, reminders, plan, and data · changes save right away</p>
        </div>
        <div className={styles.row}>
          <Button variant="line" href="/privacy">
            Privacy policy
          </Button>
          <Button variant="line" href="/ai-policy">
            AI use policy
          </Button>
        </div>
      </div>
      {billingReturn ? <BillingReturnNotice status={billingReturn} /> : null}
      <div className={styles.grid}>
        <div className={styles.col}>
          {/* R2I-3: parents set their own name and time zone too (admins never reach (app) pages). The raw
              name, not displayNameOf's email fallback, so a parent with no name sees an empty field. */}
          <AccountCard
            displayName={me.user.displayName.trim()}
            email={me.user.email}
            timeZone={tz}
            roleLine={roleLine}
            editable={isStudent || isParent}
          />
          <NotificationsCard prefs={prefs} timeZone={tz} />
        </div>
        <div className={styles.col}>
          <PlanCard billing={{ subscription, usage }} />
        </div>
        <div className={styles.col}>
          {isStudent ? <ExtensionTokens tokens={tokens} timeZone={tz} /> : null}
          <DocumentsCard documents={docs} timeZone={tz} />
          <DataCard latest={latest} timeZone={tz} nowIso={new Date().toISOString()} />
        </div>
      </div>
    </>
  );
}
