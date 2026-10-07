import { plural } from "@/lib/format";
import type { Story } from "@scholarcrew/domain";
import { Button, Card } from "@scholarcrew/ui";
import styles from "./memory.module.css";

function usedLabel(n: number): string {
  if (n === 0) return "not used yet";
  return n === 1 ? "used once" : `used ${n} times`;
}

export function StoryBankCard({ stories }: { stories: Story[] }) {
  const live = stories.filter((s) => s.archivedAt === null);
  const essays = new Set(live.flatMap((s) => s.uses.map((u) => u.essayId)));
  const top = [...live].sort((a, b) => b.uses.length - a.uses.length).slice(0, 4);
  return (
    <Card
      title="Story Bank"
      aside={
        <span
          className={styles.muted}
        >{`${plural(live.length, "story", "stories")} · used in ${plural(essays.size, "essay")}`}</span>
      }
    >
      {top.length === 0 ? (
        <p className={styles.muted}>No stories yet. Quill builds them with you from a short interview.</p>
      ) : (
        <ul>
          {top.map((s) => (
            <li key={s.id} className={styles.srow}>
              <b>{s.title}</b>
              <span>{usedLabel(s.uses.length)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.row}>
        <Button variant="soft" size="sm" iconEnd="arrow" href="/essays/stories">
          {top.length === 0 ? "Start a story interview" : "Open Story Bank"}
        </Button>
      </div>
    </Card>
  );
}
