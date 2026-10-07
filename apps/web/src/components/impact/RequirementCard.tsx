import type { RequirementProgress } from "@scholarcrew/domain";
import { Badge, Card, Progress, Who } from "@scholarcrew/ui";
import { progressView } from "./impact";
import styles from "./impact.module.css";

/** IM-03: confirmed hours against each saved scholarship's requirement. */
export function RequirementCard({ progress }: { progress: RequirementProgress[] }) {
  return (
    <Card title="Hours a scholarship asks for" aside={<Who role="impact" size="sm" />}>
      {progress.length === 0 ? <p className={styles.sub}>No saved scholarship asks for service hours yet.</p> : null}
      {progress.map((p) => {
        const view = progressView(p);
        return (
          <div key={p.scholarshipId} className={styles.req}>
            <div className={styles.reqHead}>
              <span>{p.scholarshipName}</span>
              <Badge tone={view.met ? "good" : "warn"} icon={view.met ? "check" : "clock"}>
                {view.status}
              </Badge>
            </div>
            <p className={styles.sub}>{`${p.requiredHours} confirmed hours required`}</p>
            <Progress value={view.value} label={`${p.scholarshipName} confirmed hours`} />
            <p className={styles.sub}>{view.detail}</p>
          </div>
        );
      })}
      <p className={styles.sub}>Only confirmed hours count.</p>
    </Card>
  );
}
