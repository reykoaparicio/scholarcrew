import { Thread } from "@/components/crew/Thread";
import { FamilyTasks } from "@/components/family/FamilyTasks";
import { HelperLinks } from "@/components/family/HelperLinks";
import { Members } from "@/components/family/Members";
import { ParentSpace } from "@/components/family/ParentSpace";
import { ShareToggles } from "@/components/family/ShareToggles";
import styles from "@/components/family/family.module.css";
import { requireAppActor } from "@/lib/pageActor";
import { createConversation, getMessages } from "@scholarcrew/core/crew";
import { getBudget, getFamily, getShareSettings, listTasks } from "@scholarcrew/core/family";
import { listHelperLinks } from "@scholarcrew/core/helpers";
import { Badge, Button, Card, Icon } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

function firstName(name: string, email: string): string {
  return name.trim().split(" ")[0] || email;
}

function BillingNote() {
  return (
    <Card title="Billing">
      <p className={styles.small}>
        Whoever pays for the Family plan, paying doesn't unlock essays, chats, or sensitive facts.
      </p>
    </Card>
  );
}

export default async function FamilyPage() {
  const { actor, me, deps } = await requireAppActor(["student", "parent"]);
  const isStudent = me.user.role === "student";
  const myRole = isStudent ? "student" : "parent";
  const tz = me.user.timeZone;
  const nowIso = new Date().toISOString();
  const [family, links] = await Promise.all([
    getFamily(deps, actor),
    isStudent ? listHelperLinks(deps, actor) : Promise.resolve([]),
  ]);

  if (!family) {
    return (
      <>
        <div className={styles.head}>
          <div>
            <h1>Family</h1>
            <p className={styles.sub}>
              {isStudent
                ? "Invite a parent to plan together. You choose what they can see."
                : "You're not in a family yet. Ask your student to send you an invite."}
            </p>
          </div>
        </div>
        <div className={styles.grid}>
          <Members family={null} myUserId={actor.userId} myRole={myRole} timeZone={tz} />
          {isStudent ? <HelperLinks links={links} timeZone={tz} nowIso={nowIso} /> : null}
        </div>
      </>
    );
  }

  const student = family.members.find((x) => x.memberRole === "student") ?? null;
  const parents = family.members.filter((x) => x.memberRole === "parent");
  const parentNames = parents.map((p) => firstName(p.displayName, p.email));
  const everyone = family.members.map((x) => firstName(x.displayName, x.email)).join(" + ");
  const authors = Object.fromEntries(family.members.map((x) => [x.userId, firstName(x.displayName, x.email)]));
  const [tasks, budget, share, room] = await Promise.all([
    listTasks(deps, actor),
    getBudget(deps, actor),
    isStudent ? getShareSettings(deps, actor, actor.userId) : Promise.resolve(null),
    student
      ? createConversation(deps, actor, { room: "family", roomRefId: null, familyId: family.id, title: "" })
      : Promise.resolve(null),
  ]);
  const messages = room ? await getMessages(deps, actor, room.id) : [];

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1>Family</h1>
          <p className={styles.sub}>
            {`${everyone} · each of you controls what you share · paying for the plan doesn't unlock private data`}
          </p>
        </div>
        <div className={styles.row}>
          {isStudent ? (
            <Button variant="line" icon="plus" href="#invite">
              Invite another parent
            </Button>
          ) : null}
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          {isStudent && share ? <ShareToggles settings={share} parentNames={parentNames} /> : null}
          {isStudent ? (
            <p className={styles.sub}>
              Matches that use details you keep private are visible only to you, even when sensitive sharing is on.
            </p>
          ) : null}
          {isStudent ? null : (
            <ParentSpace
              studentId={student?.userId ?? null}
              studentName={student ? firstName(student.displayName, student.email) : ""}
              budget={budget}
            />
          )}
        </div>
        <div className={styles.col}>
          <FamilyTasks tasks={tasks} myUserId={actor.userId} />
          <div id="family-room" className={styles.room}>
            <Card title="Family room" aside={<Badge tone="neutral">Shared items only</Badge>}>
              {room ? (
                <Thread
                  key={room.id}
                  conversation={room}
                  messages={messages}
                  chips={[]}
                  compact
                  readOnlyCards={!isStudent}
                  authors={authors}
                  placeholder="Ask the crew about your shared plans…"
                  emptyText="Ask a question here and the crew answers with only what you've both shared."
                  timeZone={tz}
                />
              ) : (
                <p className={styles.muted}>The family room opens once a student joins.</p>
              )}
              <p className={styles.muted}>Answers here use only what you've both shared.</p>
            </Card>
          </div>
        </div>
        <div className={styles.col}>
          {isStudent && parentNames.length > 0 ? (
            <Card title={`${parentNames.join(" and ")}'s private space`} aside={<Icon name="lock" />}>
              <p className={styles.small}>
                {
                  "Tax returns, exact income, and their FAFSA details stay with them. You see only what they choose to share, like the income range used for matching."
                }
              </p>
            </Card>
          ) : null}
          <BillingNote />
          {isStudent ? <HelperLinks links={links} timeZone={tz} nowIso={nowIso} /> : null}
          <Members family={family} myUserId={actor.userId} myRole={myRole} timeZone={tz} />
        </div>
      </div>
    </>
  );
}
