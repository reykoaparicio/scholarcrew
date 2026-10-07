import { ChecklistItems } from "@/components/colleges/ChecklistItems";
import { CollegeTable } from "@/components/colleges/CollegeTable";
import { Recommenders } from "@/components/colleges/Recommenders";
import {
  FIT_LABEL,
  OUTSIDE_POLICY_NOTE,
  PLAN_LABEL,
  type PastRequest,
  bestOfficial,
  meritRows,
  pastRequests,
  testPolicyLabel,
  withGaps,
} from "@/components/colleges/colleges";
import styles from "@/components/colleges/colleges.module.css";
import { ContextCrew } from "@/components/scholarships/ContextCrew";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { dateShort, daysLabel, instantShort, usd } from "@/lib/format";
import {
  getCollege,
  getCollegeList,
  listApplicationItems,
  listRecRequests,
  listRecommenders,
} from "@scholarcrew/core/colleges";
import { getMessages, listConversations } from "@scholarcrew/core/crew";
import { listHelperLinks } from "@scholarcrew/core/helpers";
import { getCosts } from "@scholarcrew/core/money";
import { listTestScores } from "@scholarcrew/core/prep";
import { getProfile } from "@scholarcrew/core/profile";
import type { Conversation, Message, Recommender } from "@scholarcrew/domain";
import { daysUntil } from "@scholarcrew/engines";
import { Badge, Card, Eyebrow, Who } from "@scholarcrew/ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CollegeDetailPage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) notFound();
  const list = await readShared(() => getCollegeList(v.deps, v.actor, studentId));
  const entry = list?.find((e) => e.id === entryId);
  if (!list || !entry) notFound();
  const [college, items, costs, profile, scores] = await Promise.all([
    getCollege(v.deps, v.actor, entry.collegeId),
    readShared(() => listApplicationItems(v.deps, v.actor, entry.id)),
    readShared(() => getCosts(v.deps, v.actor, studentId)),
    readShared(() => getProfile(v.deps, v.actor, studentId)),
    readShared(() => listTestScores(v.deps, v.actor, studentId)),
  ]);
  const entries = withGaps(list, costs ?? []);
  const gap = entries.find((e) => e.id === entry.id)?.gapUsd ?? null;
  const act = bestOfficial(scores ?? [], "ACT");
  const sat = bestOfficial(scores ?? [], "SAT");
  const merit = meritRows(college.meritTiers, profile?.gpaUnweighted ?? null, act, sat);
  const days = entry.deadline ? daysUntil(entry.deadline, v.deps.clock.now(), v.timeZone) : null;
  // Students only: recommenders, past requests (GET /recommendations' service, D33), and their helper links.
  let recommenders: Recommender[] = [];
  let past: PastRequest[] = [];
  let room: { conversation: Conversation | null; messages: Message[] } | null = null;
  if (!v.isParent) {
    const [recs, requests, links, conversations] = await Promise.all([
      listRecommenders(v.deps, v.actor),
      listRecRequests(v.deps, v.actor),
      listHelperLinks(v.deps, v.actor),
      listConversations(v.deps, v.actor),
    ]);
    recommenders = recs;
    past = pastRequests(requests, links, recs, entry.id, v.deps.clock.now());
    const existing = conversations.find((c) => c.room === "college" && c.roomRefId === college.id) ?? null;
    room = { conversation: existing, messages: existing ? await getMessages(v.deps, v.actor, existing.id) : [] };
  }

  const scoreNote =
    act !== null || sat !== null
      ? `Your best official ${[act !== null ? `ACT ${act}` : null, sat !== null ? `SAT ${sat}` : null].filter(Boolean).join(" and ")}.`
      : "No official scores yet.";

  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Colleges</h1>
          <p className={shared.sub}>
            <a href="/colleges">All schools</a> · {entry.college.name}
          </p>
        </div>
      </div>
      <div className={styles.layout}>
        <Card>
          <CollegeTable entries={entries} selectedId={entry.id} />
        </Card>
        <div className={shared.form}>
          <Card padding="lg">
            <div className={shared.roomTop}>
              <Eyebrow>
                <Who role="atlas" size="sm" /> <span>{`· ${college.name}`}</span>
              </Eyebrow>
              <Badge tone="neutral">{FIT_LABEL[entry.fit]}</Badge>
            </div>
            <h2>{`${PLAN_LABEL[entry.plan]}${entry.deadline ? ` · ${dateShort(entry.deadline)}` : ""}`}</h2>
            <p className={styles.sub}>
              {[
                days !== null ? (days >= 0 ? `${daysLabel(days)} left` : "Deadline passed") : null,
                college.verifiedAt
                  ? `requirements verified ${instantShort(college.verifiedAt, v.timeZone)}`
                  : "requirements not verified yet",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <h3 className={styles.sectionTitle}>{`Checklist · ${entry.itemsDone} of ${entry.itemsTotal}`}</h3>
            {items ? (
              <ChecklistItems items={items} collegeId={entry.collegeId} readOnly={v.isParent} />
            ) : (
              <p className={shared.muted}>Not shared.</p>
            )}
            <h3 className={styles.sectionTitle}>Money</h3>
            <ul className={styles.kv}>
              <li>
                <span>Gap / yr</span>
                <b>{gap === null ? "Not estimated" : usd(gap)}</b>
              </li>
              {merit.length === 0 ? (
                <li>
                  <span>Merit aid</span>
                  <b>No automatic merit tiers on file</b>
                </li>
              ) : (
                merit.map((m) => (
                  <li key={m.label}>
                    <span>{m.label}</span>
                    <b>{m.qualifies ? `${m.text} · you qualify` : m.text}</b>
                  </li>
                ))
              )}
              <li>
                <span>Aid priority</span>
                <b>
                  {college.aidPriorityDate
                    ? `Submit the FAFSA by ${dateShort(college.aidPriorityDate)}`
                    : "No priority date listed"}
                </b>
              </li>
              <li>
                <span>Outside $</span>
                <b>{OUTSIDE_POLICY_NOTE[college.outsidePolicy]}</b>
              </li>
            </ul>
            <h3 className={styles.sectionTitle}>Testing</h3>
            <p>{`${testPolicyLabel(college.testPolicy, college.superscore)}. ${scoreNote}`}</p>
          </Card>
          {v.isParent ? null : (
            <Recommenders recommenders={recommenders} entryId={entry.id} past={past} timeZone={v.timeZone} />
          )}
          {room ? (
            <ContextCrew
              room="college"
              refId={college.id}
              title={college.name}
              lead="atlas"
              placeholder={`Ask about ${college.name}…`}
              chips={[
                { role: "ledger", text: "@Ledger what will it really cost?" },
                { role: "prep", text: "@Prep should I send my scores?" },
              ]}
              timeZone={v.timeZone}
              conversation={room.conversation}
              messages={room.messages}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
