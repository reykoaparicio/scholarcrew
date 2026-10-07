import { AddTeammate } from "@/components/crew/AddTeammate";
import { BackgroundJobs } from "@/components/crew/BackgroundJobs";
import { RoomButtons } from "@/components/crew/RoomButtons";
import { Thread } from "@/components/crew/Thread";
import styles from "@/components/crew/crew.module.css";
import { ROOM_TITLES, roomBadge, roomFacts } from "@/components/crew/roomFacts";
import { OPTIONAL_CREW, enabledOptionalCrew } from "@/components/shell/nav";
import { instantShort } from "@/lib/format";
import { type AppPageContext, requireAppActor } from "@/lib/pageActor";
import { getMessages, listConversations } from "@scholarcrew/core/crew";
import { getFamily } from "@scholarcrew/core/family";
import { listFacts } from "@scholarcrew/core/memory";
import { lastSweep } from "@scholarcrew/core/scholarships";
import { CREW_ROLES, type Conversation } from "@scholarcrew/domain";
import { Badge, Card, Eyebrow, Who } from "@scholarcrew/ui";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string | undefined {
  const value = Array.isArray(v) ? v[0] : v;
  return value?.trim() ? value.slice(0, 4000) : undefined;
}

function firstName(name: string, email: string): string {
  return name.trim().split(" ")[0] || email;
}

/** E-16-2: a parent's crew chat. Only family rooms; plan 08 never opens a student's private rooms to parents. */
async function parentRoom(ctx: AppPageContext, conversation: Conversation): Promise<ReactElement> {
  const { actor, me, deps } = ctx;
  const [messages, family] = await Promise.all([getMessages(deps, actor, conversation.id), getFamily(deps, actor)]);
  const members = family?.members ?? [];
  const authors = Object.fromEntries(members.map((x) => [x.userId, firstName(x.displayName, x.email)]));
  const student = members.find((x) => x.memberRole === "student");
  const studentName = student ? firstName(student.displayName, student.email) : "Your student";
  const badge = roomBadge("family");
  const title = conversation.title || ROOM_TITLES.family;
  return (
    <div className={styles.grid}>
      <div className={styles.thread}>
        <div className={styles.roomHead}>
          <div>
            <h1>{title}</h1>
            <div className={styles.crewLine}>
              <Who role="compass" />
              <Badge tone="neutral" icon={badge.icon}>
                {badge.label}
              </Badge>
            </div>
          </div>
        </div>
        <Thread
          conversation={conversation}
          messages={messages}
          chips={[]}
          readOnlyCards
          authors={authors}
          placeholder="Ask the crew about your shared plans…"
          emptyText="Ask a question here and the crew answers with only what you've both shared."
          timeZone={me.user.timeZone}
        />
      </div>
      <div className={styles.side}>
        <Card title="In this room">
          {roomFacts("family", { parentNames: [], title }).map((f) => (
            <div key={f.label} className={styles.kv}>
              <span>{f.label}</span>
              <b>{f.value}</b>
            </div>
          ))}
        </Card>
        <Card>
          <Eyebrow>Private chats</Eyebrow>
          <p className={styles.footNote}>
            {`${studentName}'s private chats stay private. This family room is the crew chat you share.`}
          </p>
        </Card>
      </div>
    </div>
  );
}

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAppActor(["student", "parent"]);
  const { actor, me, deps } = ctx;
  const { conversationId } = await params;
  const sp = await searchParams;
  const conversations = await listConversations(deps, actor);
  const conversation = conversations.find((c) => c.id === conversationId);
  if (!conversation) notFound();
  if (me.user.role === "parent") {
    if (conversation.room !== "family") notFound();
    return parentRoom(ctx, conversation);
  }
  if (conversation.room === "family") redirect("/family#family-room");

  const [messages, facts, family, sweep] = await Promise.all([
    getMessages(deps, actor, conversation.id),
    listFacts(deps, actor, actor.userId),
    getFamily(deps, actor),
    lastSweep(deps, actor, actor.userId),
  ]);
  const enabled = enabledOptionalCrew(facts);
  const crew = CREW_ROLES.filter((r) => (r !== "prep" && r !== "impact") || enabled.includes(r));
  const parentNames = (family?.members ?? [])
    .filter((m) => m.memberRole === "parent")
    .map((m) => m.displayName.split(" ")[0] || m.email);
  const badge = roomBadge(conversation.room);
  const title = conversation.title || ROOM_TITLES[conversation.room];
  const others = conversations.filter((c) => c.id !== conversation.id && c.room !== "family").slice(0, 6);
  const tz = me.user.timeZone;

  return (
    <div className={styles.grid}>
      <div className={styles.thread}>
        <div className={styles.roomHead}>
          <div>
            <h1>{title}</h1>
            <div className={styles.crewLine}>
              {crew.map((role) => (
                <Who key={role} role={role} />
              ))}
              <Badge tone="neutral" icon={badge.icon}>
                {badge.label}
              </Badge>
            </div>
          </div>
          <RoomButtons />
        </div>
        <Thread
          key={conversation.id}
          conversation={conversation}
          messages={messages}
          prefill={first(sp.prefill) ?? first(sp.ask)}
          timeZone={tz}
        />
      </div>
      <div className={styles.side}>
        <BackgroundJobs sweep={sweep} timeZone={tz} />
        <Card title="In this room">
          {roomFacts(conversation.room, { parentNames, title }).map((f) => (
            <div key={f.label} className={styles.kv}>
              <span>{f.label}</span>
              <b>{f.value}</b>
            </div>
          ))}
          <AddTeammate missing={OPTIONAL_CREW.filter((r) => !enabled.includes(r))} />
        </Card>
        {others.length > 0 ? (
          <Card title="Your chats">
            <ul className={styles.convs}>
              {others.map((c) => (
                <li key={c.id}>
                  <a href={`/crew/${c.id}`}>
                    <span>{c.title || ROOM_TITLES[c.room]}</span>
                    <span className={styles.muted}>
                      {c.room === "temporary"
                        ? "Temporary"
                        : c.lastMessageAt
                          ? instantShort(c.lastMessageAt, tz)
                          : "New"}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card>
          <Eyebrow>How your crew answers</Eyebrow>
          <p className={styles.footNote}>
            Compass asks only the specialists it needs, merges their work into one reply, and shows what it used. Money
            math is calculated by code, not guessed.
          </p>
        </Card>
      </div>
    </div>
  );
}
