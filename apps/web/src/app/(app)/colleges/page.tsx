import { AddCollegeButton, CollegeTable } from "@/components/colleges/CollegeTable";
import { listBalance, withGaps } from "@/components/colleges/colleges";
import styles from "@/components/colleges/colleges.module.css";
import { NotShared } from "@/components/scholarships/NotShared";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { plural } from "@/lib/format";
import { getCollegeList } from "@scholarcrew/core/colleges";
import { getCosts } from "@scholarcrew/core/money";
import { Button, Card, EmptyState, Eyebrow, Who } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function CollegesPage() {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="colleges" />;
  const list = await readShared(() => getCollegeList(v.deps, v.actor, studentId));
  if (!list) return <NotShared studentName={v.studentName} what="colleges" />;
  const costs = (await readShared(() => getCosts(v.deps, v.actor, studentId))) ?? [];
  const entries = withGaps(list, costs);
  const early = entries.filter((e) => e.plan === "EA" || e.plan === "ED" || e.plan === "REA").length;
  const balance = listBalance(entries);
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Colleges</h1>
          <p className={shared.sub}>
            {`${plural(entries.length, "school")} · ${plural(early, "early deadline")} · gap = estimated yearly cost after free money`}
          </p>
        </div>
        {v.isParent ? null : (
          <div className={shared.actions}>
            <AddCollegeButton count={entries.length} />
            <Button variant="primary" icon="chat" href="/crew">
              Ask Atlas
            </Button>
          </div>
        )}
      </div>
      <div className={shared.form}>
        <Card>
          {entries.length === 0 ? (
            <EmptyState title="No schools yet" icon="columns">
              Add the colleges you're thinking about. Atlas checks deadlines and requirements for each one.
            </EmptyState>
          ) : (
            <CollegeTable entries={entries} />
          )}
        </Card>
        {balance.length > 0 ? (
          <Card>
            <Eyebrow>
              <Who role="atlas" size="sm" /> <span>· About your list</span>
            </Eyebrow>
            <div className={styles.balance}>
              {balance.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <div className={shared.actions}>
              <Button variant="line" href="/money">
                Compare all costs
              </Button>
            </div>
          </Card>
        ) : null}
        <p className={shared.muted}>
          Gaps are estimates from College Scorecard net price for your income range until you run each school's own
          calculator.
        </p>
      </div>
    </>
  );
}
