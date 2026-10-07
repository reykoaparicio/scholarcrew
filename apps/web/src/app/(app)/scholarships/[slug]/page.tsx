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
          <Card title="Who can apply · why you match">
            <h3 className={shared.muted}>The listing says</h3>
            <ul className={styles.list}>
              {detail.eligibility.map((rule) => (
                <li key={ruleText(rule)}>{ruleText(rule)}</li>
              ))}
            </ul>
            <h3 className={shared.muted}>Why you match</h3>
            {reasons.length === 0 ? (
              <p className={shared.muted}>
                {application ? "You don't match any listed rule yet." : "Save it to see how you match."}
              </p>
            ) : (
              <ul className={styles.list}>
                {reasons.map((r) => (
                  <li key={r.code}>
                    <span>
                      <Icon name="check" /> {r.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
            <p className={shared.muted}>
              Verified: matches its source as of the date shown. Stale: changed or 30+ days old, being re-checked.
              Unverified: not reviewed yet. Flagged: fee or scam signs, hidden from your plan.
            </p>
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
