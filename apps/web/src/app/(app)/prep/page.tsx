import { RetakeForm, type RetakeInputs } from "@/components/prep/RetakeForm";
import { ScoresCard } from "@/components/prep/ScoresCard";
import { StudyPlan } from "@/components/prep/StudyPlan";
import { bestOfficial } from "@/components/prep/prep";
import styles from "@/components/prep/prep.module.css";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, todayIn } from "@/components/scholarships/viewer";
import { getCollege, getCollegeList } from "@scholarcrew/core/colleges";
import { getSuperscores, listTestScores } from "@scholarcrew/core/prep";
import { Button, Card, EmptyState } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function PrepPage() {
  const v = await loadViewer();
  // Test scores have no share category (07: owner only), so parents get a plain note instead of NotShared,
  // which would point at a sharing switch that doesn't exist.
  if (v.isParent) {
    return (
      <Card padding="lg">
        <EmptyState title="Test scores stay private to your student" icon="lock">
          ScholarCrew doesn't share test scores with family members. Ask your student how testing is going.
        </EmptyState>
      </Card>
    );
  }
  const studentId = v.actor.userId;
  const scores = await listTestScores(v.deps, v.actor, studentId);
  const superscores = await getSuperscores(v.deps, v.actor, studentId);
  const list = await getCollegeList(v.deps, v.actor, studentId);
  const colleges = await Promise.all(list.map((e) => getCollege(v.deps, v.actor, e.collegeId)));
  const inputs: RetakeInputs = {
    colleges: colleges
      .map((c) => ({ id: c.id, name: c.name, meritTiers: c.meritTiers }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    gpa: v.me.profile?.gpaUnweighted ?? null,
    currentAct: bestOfficial(scores, "ACT"),
    currentSat: bestOfficial(scores, "SAT"),
  };
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Test prep</h1>
          <p className={shared.sub}>Prep runs the numbers with code, and you decide</p>
        </div>
        <Button variant="primary" icon="chat" href="/crew">
          Ask Prep
        </Button>
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          <ScoresCard scores={scores} superscores={superscores} readOnly={false} />
          <RetakeForm inputs={inputs} timeZone={v.timeZone} />
        </div>
        <StudyPlan today={todayIn(v.deps.clock.now(), v.timeZone)} />
      </div>
    </>
  );
}
