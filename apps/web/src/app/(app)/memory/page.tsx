import { DecisionsCard } from "@/components/memory/DecisionsCard";
import { CandidatesCard, FactsCard } from "@/components/memory/FactsCard";
import { SensitiveToggles } from "@/components/memory/SensitiveToggles";
import { StartFresh } from "@/components/memory/StartFresh";
import { StoryBankCard } from "@/components/memory/StoryBankCard";
import styles from "@/components/memory/memory.module.css";
import { requireAppActor } from "@/lib/pageActor";
import { listStories } from "@scholarcrew/core/essays";
import { listDecisions, listFacts, listSensitiveFacts } from "@scholarcrew/core/memory";
import { Button } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const { actor, me, deps } = await requireAppActor(["student"]);
  const [facts, decisions, sensitive, stories] = await Promise.all([
    listFacts(deps, actor, actor.userId),
    listDecisions(deps, actor, actor.userId),
    listSensitiveFacts(deps, actor),
    listStories(deps, actor, actor.userId),
  ]);
  const tz = me.user.timeZone;
  return (
    <>
      <div className={styles.head}>
        <div>
          <h1>What your crew remembers</h1>
          <p className={styles.sub}>
            Private to you · edit or forget anything · sensitive facts are never guessed from your chats
          </p>
        </div>
        <div className={styles.row}>
          <Button variant="line" href="/settings#data">
            Export everything
          </Button>
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          <FactsCard facts={facts.filter((f) => f.status === "confirmed")} timeZone={tz} />
          <CandidatesCard candidates={facts.filter((f) => f.status === "candidate")} />
          <DecisionsCard decisions={decisions} timeZone={tz} />
        </div>
        <div className={styles.col}>
          <SensitiveToggles facts={sensitive} />
          <StoryBankCard stories={stories} />
          <StartFresh />
        </div>
      </div>
    </>
  );
}
