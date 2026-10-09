import { ContextCrew } from "@/components/scholarships/ContextCrew";
import { DetailActions, StartEssayButton } from "@/components/scholarships/DetailActions";
import { UNKNOWN_AMOUNT } from "@/components/scholarships/board";
import {
  NO_DEADLINE,
  STAGE_LABEL,
  amountLabel,
  areaLabel,
  ruleText,
  sourceBadges,
} from "@/components/scholarships/detail";
import styles from "@/components/scholarships/scholarships.module.css";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { safeHref } from "@/lib/format";
import { dateWithWeekday, daysLabel, minutesLabel, plural } from "@/lib/format";
import { getMessages, listConversations } from "@scholarcrew/core/crew";
import { getBoard, getScholarship } from "@scholarcrew/core/scholarships";
import {
  type Board,
  type Conversation,
  type MatchReason,
  type Message,
  SCAM_FLAG_TEXT,
  type ScholarshipApplication,
} from "@scholarcrew/domain";
import { daysUntil } from "@scholarcrew/engines";
import { Badge, Card, Icon } from "@scholarcrew/ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const LOCATION_RULES = new Set(["state_in", "county_in", "city_in"]);

/** Mockup 10's label legend: every status pairs an icon with its label. */
const SOURCE_LEGEND = [
  { label: "Verified", tone: "good", icon: "check", text: "Matches its source as of the date shown" },
  { label: "Stale", tone: "warn", icon: "clock", text: "Changed or 30+ days old · re-checking" },
  { label: "Unverified", tone: "neutral", icon: "info", text: "Not reviewed yet, or details not posted" },
  { label: "Flagged", tone: "crit", icon: "alert", text: "Fee or scam signs; hidden" },
] as const;

function allCards(b: Board) {
  return [...b.matched, ...b.working, ...b.submitted, ...b.won, ...b.lostOrSkipped];
}

function deadlineSub(days: number | null): string {
  // Same pair as 18 R4 `deadlineLabel`: "Not posted" over "Check the sponsor's page" (R3V-8).
  if (days === null) return "Check the sponsor's page";
  if (days < 0) return "Closed";
  if (days === 0) return "Due today";
  return `${daysLabel(days)} left`;
}

/** `slug` may be a slug or an id: renewal reminders (12, SC-11) link to `/scholarships/<slug>`, and `getScholarship` takes either. */
export default async function ScholarshipDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = await loadViewer();
  const detail = await readShared(() => getScholarship(v.deps, v.actor, slug));
  if (!detail) notFound();

  let application: ScholarshipApplication | null = detail.application;
  let reasons: MatchReason[] = detail.application?.matchReasons ?? [];
  const studentId = v.studentId;
  if (v.isParent) {
    const b = studentId ? await readShared(() => getBoard(v.deps, v.actor, studentId)) : null;
    const found = b ? allCards(b).find((c) => c.scholarship.id === detail.id) : undefined;
    application = found?.application ?? null;
    // R4Z-4: core excludes all private matches from the parent view.
    reasons = found?.reasons ?? [];
  }

  let room: { conversation: Conversation | null; messages: Message[] } | null = null;
  if (!v.isParent) {
    const existing =
      (await listConversations(v.deps, v.actor)).find((c) => c.room === "scholarship" && c.roomRefId === detail.id) ??
      null;
    room = { conversation: existing, messages: existing ? await getMessages(v.deps, v.actor, existing.id) : [] };
  }
  const renewalNote = application?.stage === "won" && detail.renewable && !v.isParent;

  const days = detail.deadline ? daysUntil(detail.deadline, v.deps.clock.now(), v.timeZone) : null;
  const req = detail.requirements;
  const sendList = [
    ...req.essays.map((e, i) => ({
      key: `essay-${i}`,
      label: "Essay",
      note: e.wordLimit ? `${e.wordLimit} words max` : "No word limit",
    })),
    ...(req.transcript ? [{ key: "transcript", label: "Transcript", note: "" }] : []),
    ...(req.recommendations > 0
      ? [{ key: "recs", label: plural(req.recommendations, "recommendation letter"), note: "" }]
      : []),
    ...(req.serviceHours ? [{ key: "hours", label: `${req.serviceHours} service hours`, note: "" }] : []),
    ...req.other.map((o, i) => ({ key: `other-${i}`, label: o, note: "" })),
  ];

  // SC-04: pair each listing rule with the matcher's reason for it (reason codes are the rule types).
  // The matcher drops a rule's reason when its text repeats the area reason ("You live in Maple County"), so
  // location rules also accept the local_* codes.
  const reasonFor = (type: string): MatchReason | undefined =>
    reasons.find((r) => r.code === type) ??
    (LOCATION_RULES.has(type) ? reasons.find((r) => r.code.startsWith("local_")) : undefined);
  const ruleRows = detail.eligibility.map((rule, i) => {
    const reason = reasonFor(rule.type);
    const you = reason
      ? reason.text
      : rule.type === "custom"
        ? "Only you know this · you confirm it on the form"
        : application
          ? "Not confirmed yet"
          : "—";
    return { key: `${rule.type}-${i}`, rule: ruleText(rule), you, met: reason !== undefined, reason };
  });
  const checkable = ruleRows.filter((r, i) => detail.eligibility[i]?.type !== "custom");
  const metCount = checkable.filter((r) => r.met).length;
  const used = new Set(ruleRows.flatMap((r) => (r.reason ? [r.reason.code] : [])));
  const extraReasons = reasons.filter((r) => !used.has(r.code));

  return (
    <>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <a href="/scholarships">Scholarships</a>
        <span>›</span>
        <span>{application ? STAGE_LABEL[application.stage] : "Catalog"}</span>
      </nav>
      <div className={shared.head}>
        <div>
          <h1>{detail.name}</h1>
          <p className={shared.sub}>{`${areaLabel(detail.localArea)} · from ${detail.provider}`}</p>
        </div>
        <DetailActions scholarshipId={detail.id} application={application} readOnly={v.isParent} />
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          <section className={styles.stats} aria-label="At a glance">
            <div className={styles.stat}>
              <div className={styles.statLabel}>Amount</div>
              <div className={styles.statValue}>
                {detail.status === "draft" ? UNKNOWN_AMOUNT : amountLabel(detail.amountMinUsd, detail.amountMaxUsd)}
              </div>
              <div className={shared.muted}>
                {detail.renewable ? `Renewable · ${detail.renewalTerms || "see terms"}` : "One-time · not renewable"}
              </div>
              {renewalNote ? (
                <div className={shared.muted}>You won this. We'll remind you 30 days before each renewal date.</div>
              ) : null}
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Deadline</div>
              <div className={styles.statValue}>{detail.deadline ? dateWithWeekday(detail.deadline) : NO_DEADLINE}</div>
              <div className={shared.muted}>{deadlineSub(days)}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Your time</div>
              <div className={styles.statValue}>{`~${minutesLabel(detail.estMinutes)}`}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Stage</div>
              <div className={styles.statValue}>{application ? STAGE_LABEL[application.stage] : "Not saved"}</div>
            </div>
          </section>
          <Card title="What to send">
            <ul className={styles.list}>
              {sendList.map((item) => (
                <li key={item.key}>
                  <b>{item.label}</b>
                  <span className={shared.muted}>{item.note}</span>
                </li>
              ))}
            </ul>
            {req.recommendations === 0 ? <p className={shared.muted}>No recommendation letters.</p> : null}
          </Card>
          {req.essays.map((e, i) => (
            <Card key={e.prompt} title={req.essays.length > 1 ? `Essay prompt ${i + 1}` : "Essay prompt"}>
              <p className={styles.prompt}>{e.prompt}</p>
              <p className={shared.muted}>{e.wordLimit ? `${e.wordLimit} words max` : "No word limit"}</p>
              {v.isParent ? null : (
                <StartEssayButton
                  scholarshipId={detail.id}
                  title={req.essays.length > 1 ? `${detail.name} essay ${i + 1}` : `${detail.name} essay`}
                  prompt={e.prompt}
                  wordLimit={e.wordLimit}
                  application={application}
                />
              )}
            </Card>
          ))}
          <Card
            title="Who can apply · why you match"
            aside={
              checkable.length > 0 && metCount === checkable.length ? (
                <Badge tone="good" icon="check">
                  {`You meet all ${plural(checkable.length, "rule")} we can check`}
                </Badge>
              ) : undefined
            }
          >
            {detail.eligibility.length === 0 ? (
              <p className={shared.muted}>The listing doesn't post any rules beyond its area.</p>
            ) : (
              <table className={styles.rules}>
                <thead>
                  <tr>
                    <th scope="col" aria-label="Status" />
                    <th scope="col">The listing says</th>
                    <th scope="col">You</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleRows.map((row) => (
                    <tr key={row.key}>
                      <td className={row.met ? styles.ruleMet : styles.ruleOpen}>
                        <Icon name={row.met ? "check" : "info"} />
                      </td>
                      <td>{row.rule}</td>
                      <td>{row.you}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {extraReasons.length > 0 ? (
              <ul className={styles.list}>
                {extraReasons.map((r) => (
                  <li key={r.code}>
                    <span>
                      <Icon name="check" /> {r.text}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {application && reasons.length === 0 ? (
              <p className={shared.muted}>You don't match any listed rule yet.</p>
            ) : null}
            {!application && !v.isParent ? <p className={shared.muted}>Save it to see how you match.</p> : null}
          </Card>
          <Card title="Source">
            <div className={styles.source}>
              {sourceBadges(detail, v.timeZone).map((b) => (
                <Badge key={b.label} tone={b.tone}>
                  {b.label}
                </Badge>
              ))}
              {safeHref(detail.sourceUrl) ? (
                <a href={safeHref(detail.sourceUrl) ?? undefined} target="_blank" rel="noopener noreferrer">
                  {detail.sourceUrl.replace(/^https?:\/\//, "")} <Icon name="ext" />
                </a>
              ) : null}
            </div>
            {detail.scamFlags.map((f) => (
              <p key={f} className={shared.error}>
                {SCAM_FLAG_TEXT[f]}
              </p>
            ))}
            <dl className={styles.legend}>
              {SOURCE_LEGEND.map((item) => (
                <div key={item.label}>
                  <dt>
                    <Badge tone={item.tone} icon={item.icon}>
                      {item.label}
                    </Badge>
                  </dt>
                  <dd>{item.text}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
        {room ? (
          <ContextCrew
            room="scholarship"
            refId={detail.id}
            title={detail.name}
            lead="scout"
            placeholder="Ask about this scholarship…"
            chips={[
              { role: "quill", text: "@Quill check my outline" },
              { role: "ledger", text: "@Ledger what if I win?" },
            ]}
            timeZone={v.timeZone}
            conversation={room.conversation}
            messages={room.messages}
          />
        ) : null}
      </div>
    </>
  );
}
