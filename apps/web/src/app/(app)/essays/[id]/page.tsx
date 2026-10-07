import { EssayWorkspace } from "@/components/essays/EssayWorkspace";
import { HistoryModal } from "@/components/essays/HistoryModal";
import { StoryMatch } from "@/components/essays/StoryMatch";
import styles from "@/components/essays/essays.module.css";
import { ContextCrew } from "@/components/scholarships/ContextCrew";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { dateShort, instantShort, usd } from "@/lib/format";
import { getMessages, listConversations } from "@scholarcrew/core/crew";
import { getEssay, listStories } from "@scholarcrew/core/essays";
import { getScholarship } from "@scholarcrew/core/scholarships";
import type { Conversation, Message, ScholarshipDetail, Story } from "@scholarcrew/domain";
import { Button, Card, Eyebrow, Icon, Tag } from "@scholarcrew/ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EssayStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await loadViewer();
  const essay = await readShared(() => getEssay(v.deps, v.actor, id));
  if (!essay) notFound();
  const scholarshipId = essay.targetScholarshipId;
  const listing: ScholarshipDetail | null = scholarshipId
    ? await readShared(() => getScholarship(v.deps, v.actor, scholarshipId))
    : null;
  const stories: Story[] = v.isParent ? [] : await listStories(v.deps, v.actor, v.actor.userId);
  // CR-08: the essay's own room, looked up the same way as the scholarship and college rooms. Students only.
  let room: { conversation: Conversation | null; messages: Message[] } | null = null;
  if (!v.isParent) {
    const existing =
      (await listConversations(v.deps, v.actor)).find((c) => c.room === "essay" && c.roomRefId === essay.id) ?? null;
    room = { conversation: existing, messages: existing ? await getMessages(v.deps, v.actor, existing.id) : [] };
  }
  const limitText = essay.wordLimit
    ? `${essay.wordLimit} words max`
    : essay.charLimit
      ? `${essay.charLimit} characters max`
      : "No length limit";
  const sub = [limitText];
  if (listing?.deadline) sub.push(`due ${dateShort(listing.deadline)}`);
  if (listing) sub.push(usd(listing.amountMaxUsd));

  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>{essay.title}</h1>
          <p className={shared.sub}>{sub.join(" · ")}</p>
        </div>
        <div className={shared.actions}>
          <span className={styles.integrity}>
            <Icon name="pen" /> Quill coaches · you write
          </span>
          {v.isParent ? null : <HistoryModal essayId={essay.id} timeZone={v.timeZone} />}
        </div>
      </div>
      <div className={styles.studio}>
        <div className={styles.col}>
          <Card>
            <Eyebrow>Prompt</Eyebrow>
            <p className={styles.prompt}>{essay.prompt || "No prompt yet. Paste it in when you have it."}</p>
            <p className={styles.meta}>{limitText}</p>
            {listing?.deadline ? <p className={styles.meta}>{`Due ${dateShort(listing.deadline)}`}</p> : null}
            {listing?.verifiedAt ? (
              <p className={styles.meta}>
                <Icon name="check" /> {`Verified ${instantShort(listing.verifiedAt, v.timeZone)} from the listing`}
              </p>
            ) : null}
            {essay.targetLabel ? <p className={styles.meta}>{`For ${essay.targetLabel}`}</p> : null}
          </Card>
          {v.isParent ? null : (
            <StoryMatch
              essayId={essay.id}
              prompt={essay.prompt}
              stories={stories}
              target={{ collegeId: essay.targetCollegeId, scholarshipId: essay.targetScholarshipId }}
              readOnly={false}
            />
          )}
          {v.isParent ? null : (
            <Card
              title="Story Bank"
              aside={
                <Button variant="line" size="sm" icon="plus" href="/essays/stories">
                  Add a story
                </Button>
              }
            >
              <ul className={styles.stories}>
                {stories
                  .filter((s) => s.archivedAt === null)
                  .slice(0, 5)
                  .map((s) => (
                    <li key={s.id}>
                      <p className={styles.storyTitle}>{s.title}</p>
                      <div className={styles.tags}>
                        {s.themes.map((t) => (
                          <Tag key={t}>{t}</Tag>
                        ))}
                      </div>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
          {room ? (
            <ContextCrew
              room="essay"
              refId={essay.id}
              title={essay.title}
              lead="quill"
              placeholder="Ask Quill about this essay…"
              chips={[
                { role: "quill", text: "@Quill what is this prompt really asking?" },
                { role: "quill", text: "@Quill which story fits this prompt?" },
              ]}
              timeZone={v.timeZone}
              conversation={room.conversation}
              messages={room.messages}
            />
          ) : null}
        </div>
        <EssayWorkspace essay={essay} readOnly={v.isParent} />
      </div>
    </>
  );
}
