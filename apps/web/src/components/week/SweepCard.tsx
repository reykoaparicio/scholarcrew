import { plural, usd } from "@/lib/format";
import type { SweepSummary } from "@scholarcrew/domain";
import { Button, Card, Eyebrow, Who } from "@scholarcrew/ui";
import styles from "./week.module.css";

function weekday(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(new Date(iso));
}

/** WK-05: the last Scout sweep. */
export function SweepCard({ sweep, timeZone }: { sweep: SweepSummary | null; timeZone: string }) {
  if (!sweep) {
    return (
      <Card>
        <Eyebrow>
          <Who role="scout" /> · Weekly sweep
        </Eyebrow>
        <p className={styles.mSub}>Scout runs your first sweep soon.</p>
      </Card>
    );
  }
  return (
    <Card>
      <Eyebrow>
        <Who role="scout" /> · <span>{`${weekday(sweep.ranAt, timeZone)}'s sweep`}</span>
      </Eyebrow>
      <p
        className={styles.mLine}
      >{`${plural(sweep.newMatches, "new match", "new matches")} worth ${usd(sweep.totalUsd)}`}</p>
      <p className={styles.mSub}>
        {`${sweep.reuseCount} reuse your essays · ${sweep.hiddenScams} hidden for charging a fee`}
      </p>
      <Button variant="soft" iconEnd="arrow" href="/scholarships">
        Review matches
      </Button>
    </Card>
  );
}
