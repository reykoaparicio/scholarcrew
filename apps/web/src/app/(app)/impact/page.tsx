import { ActivitiesEditor } from "@/components/impact/ActivitiesEditor";
import { RequirementCard } from "@/components/impact/RequirementCard";
import { ServiceLogs } from "@/components/impact/ServiceLogs";
import { logTotals } from "@/components/impact/impact";
import styles from "@/components/impact/impact.module.css";
import { NotShared } from "@/components/scholarships/NotShared";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { plural } from "@/lib/format";
import { getRequirementProgress, listActivities, listServiceLogs } from "@scholarcrew/core/impact";
import { Button } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function ImpactPage() {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="activities" />;
  const [logs, activities, progress] = await Promise.all([
    readShared(() => listServiceLogs(v.deps, v.actor, studentId)),
    readShared(() => listActivities(v.deps, v.actor, studentId)),
    readShared(() => getRequirementProgress(v.deps, v.actor, studentId)),
  ]);
  if (!logs || !activities) return <NotShared studentName={v.studentName} what="activities" />;
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Service and activities</h1>
          <p className={shared.sub}>
            {`${logTotals(logs)} · ${plural(activities.length, "activity", "activities")} · Impact helps you log and describe, never pads hours`}
          </p>
        </div>
        {v.isParent ? null : (
          <Button
            variant="primary"
            icon="chat"
            href={`/crew?prefill=${encodeURIComponent("@Impact suggest local service that fits my interests and requirement gaps")}`}
          >
            Ask Impact for ideas
          </Button>
        )}
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          <ServiceLogs logs={logs} readOnly={v.isParent} timeZone={v.timeZone} now={v.deps.clock.now().toISOString()} />
          <ActivitiesEditor activities={activities} readOnly={v.isParent} />
        </div>
        <RequirementCard progress={progress ?? []} />
      </div>
    </>
  );
}
