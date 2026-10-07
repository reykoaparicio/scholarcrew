import { AidChecklists, AidHelpCards } from "@/components/money/AidChecklists";
import { CalculatorForm } from "@/components/money/CalculatorForm";
import { CostCards } from "@/components/money/CostCards";
import styles from "@/components/money/money.module.css";
import { NotShared } from "@/components/scholarships/NotShared";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { getAidChecklists, listAidDeadlines } from "@scholarcrew/core/aid";
import { getCollegeList } from "@scholarcrew/core/colleges";
import { getCosts } from "@scholarcrew/core/money";
import { Button } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function MoneyPage() {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="costs" />;
  const costs = await readShared(() => getCosts(v.deps, v.actor, studentId));
  if (!costs) return <NotShared studentName={v.studentName} what="costs" />;
  // R2P-13: the calculator picker lists every current-season college, not only the ones that already have an estimate.
  const [checklists, deadlines, list] = await Promise.all([
    readShared(() => getAidChecklists(v.deps, v.actor, studentId)),
    readShared(() => listAidDeadlines(v.deps, v.actor, studentId)),
    v.isParent ? Promise.resolve(null) : readShared(() => getCollegeList(v.deps, v.actor, studentId)),
  ]);
  const calculatorColleges = (list ?? []).map((e) => ({ id: e.collegeId, name: e.college.name }));
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Money</h1>
          <p className={shared.sub}>
            Year-1 cost after free money for each school · Ledger does the math, labeled by source
          </p>
        </div>
        <div className={shared.actions}>
          <Button variant="line" icon="clip" href="/money/offers">
            Compare award letters
          </Button>
          {v.isParent ? null : (
            <Button variant="primary" icon="chat" href="/crew">
              Ask Ledger
            </Button>
          )}
        </div>
      </div>
      <div className={styles.stack}>
        <CostCards costs={costs} />
        {v.isParent ? null : <CalculatorForm colleges={calculatorColleges} />}
        <h2>Financial aid forms</h2>
        <AidChecklists checklists={checklists ?? []} deadlines={deadlines ?? []} readOnly={v.isParent} />
        <AidHelpCards readOnly={v.isParent} />
      </div>
    </>
  );
}
