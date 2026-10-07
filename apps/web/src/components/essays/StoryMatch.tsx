"use client";

import { api, errorMessage } from "@/lib/api";
import type { Story, StoryReuseCheck, StoryUse } from "@scholarcrew/domain";
import { Badge, Button, Card, Eyebrow, Tag, Who } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./essays.module.css";
import { rankStories } from "./text";

/** ES-06 suggestions with ES-07 reuse tracking: link records the use; a repeat target asks first. */
export function StoryMatch({
  essayId,
  prompt,
  stories,
  target,
  readOnly,
}: {
  essayId: string;
  prompt: string;
  stories: Story[];
  target: { collegeId: string | null; scholarshipId: string | null };
  readOnly: boolean;
}) {
  const router = useRouter();
  const [warning, setWarning] = useState<{ storyId: string; message: string } | null>(null);
  const [linked, setLinked] = useState<string[]>(() =>
    stories.filter((s) => s.uses.some((u) => u.essayId === essayId)).map((s) => s.id),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ranked = rankStories(prompt, stories);

  async function link(storyId: string) {
    await api<StoryUse>("/stories/link", { body: { storyId, essayId } });
    setLinked((ids) => [...ids, storyId]);
    setWarning(null);
    router.refresh();
  }

  async function use(storyId: string, force: boolean) {
    setBusy(storyId);
    setError(null);
    try {
      if (!force) {
        const body: { storyId: string; collegeId?: string; scholarshipId?: string } = { storyId };
        if (target.collegeId) body.collegeId = target.collegeId;
        if (target.scholarshipId) body.scholarshipId = target.scholarshipId;
        const check = await api<StoryReuseCheck>("/stories/reuse-check", { body });
        if (check.alreadyUsedForTarget) {
          setWarning({
            storyId,
            message: check.message ?? "You've already used this story for this same school or scholarship.",
          });
          return;
        }
      }
      await link(storyId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <Eyebrow>
        <Who role="quill" size="sm" /> <span>· Best match</span>
      </Eyebrow>
      {ranked.length === 0 ? (
        <p className={styles.meta}>
          No story in your bank matches this prompt's themes yet. Add one from the Story Bank.
        </p>
      ) : null}
      <div className={styles.stories}>
        {ranked.map(({ story, matched }) => (
          <article key={story.id} aria-label={story.title}>
            <p className={styles.storyTitle}>{story.title}</p>
            <div className={styles.tags}>
              {story.themes.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
            <p className={styles.meta}>{`Matches the prompt: ${matched.join(", ")}`}</p>
            <p className={styles.meta}>
              {story.uses.length === 0
                ? "Not used yet"
                : `Used for ${story.uses.map((u) => u.essayTitle).join(" and ")}`}
            </p>
            {linked.includes(story.id) ? (
              <Badge tone="good">Linked to this essay</Badge>
            ) : readOnly ? null : (
              <Button variant="soft" size="sm" disabled={busy !== null} onClick={() => void use(story.id, false)}>
                Use this story
              </Button>
            )}
            {warning?.storyId === story.id ? (
              <div className={styles.warn} role="alert">
                <p>{warning.message}</p>
                <Button variant="line" size="sm" onClick={() => void use(story.id, true)}>
                  Use it anyway
                </Button>{" "}
                <Button variant="line" size="sm" onClick={() => setWarning(null)}>
                  Pick another
                </Button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {error ? (
        <p className={styles.footnote} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
