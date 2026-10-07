import { displayNameOf } from "@/components/shell/nav";
import { AskBar } from "@/components/week/AskBar";
import { ComingUp } from "@/components/week/ComingUp";
import { CrewWorking } from "@/components/week/CrewWorking";
import { GapCard } from "@/components/week/GapCard";
import { NextStepHero } from "@/components/week/NextStepHero";
import { PlanList } from "@/components/week/PlanList";
import { PlanWeekButton } from "@/components/week/PlanWeekButton";
import { SweepCard } from "@/components/week/SweepCard";
import { weekSubline } from "@/components/week/summary";
import styles from "@/components/week/week.module.css";
import { requireAppActor } from "@/lib/pageActor";
import { greeting } from "@/lib/time";
import { getFamily } from "@scholarcrew/core/family";
import { getThisWeek } from "@scholarcrew/core/plan";
import { type ThisWeekView, isAppError } from "@scholarcrew/domain";
import { Button, Card, EmptyState } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

function Explain({ title, children }: { title: string; children: string }) {
  return (
    <Card padding="lg">
      <EmptyState
        title={title}
        icon="users"
        action={
          <Button variant="soft" href="/family">
            Open Family
          </Button>
        }
      >
        {children}
      </EmptyState>
    </Card>
  );
}

export default async function WeekPage() {
  const { actor, me, deps } = await requireAppActor(["student", "parent"]);
  const isParent = me.user.role === "parent";
  let studentId = actor.userId;
  let studentName = "";
  if (isParent) {
    const family = await getFamily(deps, actor);
    const student = family?.members.find((member) => member.memberRole === "student");
    if (!student) {
      return (
        <Explain title="Your student's week shows up here">
          Once you join your student's family, you'll see the plan and deadlines they share with you.
        </Explain>
      );
    }
    studentId = student.userId;
    studentName = student.displayName;
  }

  let view: ThisWeekView;
  try {
    view = await getThisWeek(deps, actor, studentId);
  } catch (e) {
    if (isParent && isAppError(e) && e.code === "not_found") {
      return (
        <Explain title={`${studentName || "Your student"} isn't sharing deadlines right now`}>
          They can turn sharing back on from their Family page.
        </Explain>
      );
    }
    throw e;
  }

  const name = isParent ? (displayNameOf(me).split(" ")[0] ?? "") : view.greetingName;
  const subline = weekSubline(view);
  return (
    <>
      <div className={styles.head}>
        <h1>{`${greeting(new Date(), me.user.timeZone)}, ${name}.`}</h1>
        <p className={styles.sub}>{isParent ? `Shared by ${view.greetingName} · ${subline}` : subline}</p>
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          {view.crewWorking && view.plan.items.length === 0 ? <CrewWorking /> : null}
          {view.nextStep ? <NextStepHero item={view.nextStep} weekStart={view.weekStart} readOnly={isParent} /> : null}
          <PlanList plan={view.plan} readOnly={isParent} />
          {isParent ? null : <PlanWeekButton />}
          {isParent ? null : <AskBar />}
        </div>
        <div className={styles.col}>
          <GapCard gap={view.gap} />
          <ComingUp deadlines={view.deadlines} />
          {isParent && !view.sweep ? null : <SweepCard sweep={view.sweep} timeZone={me.user.timeZone} />}
        </div>
      </div>
    </>
  );
}
