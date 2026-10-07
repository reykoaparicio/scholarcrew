"use client";

import { cx } from "@/lib/cx";
import { dateShort, usd } from "@/lib/format";
import { type ActionCard, CREW_NAMES, type Message, type PlanItemInput } from "@scholarcrew/domain";
import { Badge, Eyebrow, Icon, Who } from "@scholarcrew/ui";
import { ActionButtons } from "./ActionButtons";
import { CrisisReply } from "./CrisisReply";
import { Receipt } from "./Receipt";
import styles from "./crew.module.css";

type PlanCard = Extract<ActionCard, { kind: "add_plan_item" }>;

function stepMeta(item: PlanItemInput): string {
  const parts: string[] = [];
  if (item.valueUsd) parts.push(usd(item.valueUsd));
  if (item.dueOn) parts.push(`due ${dateShort(item.dueOn)}`);
  return parts.length > 0 ? `· ${parts.join(" · ")}` : "";
}

/** CR-03: one coordinated reply naming its contributors, with steps, receipt, at most one question, and cards. */
export function ReplyCard({
  message,
  readOnly = false,
  compact = false,
  timeZone = "America/Chicago",
}: {
  message: Message;
  readOnly?: boolean;
  compact?: boolean;
  timeZone?: string;
}) {
  const reply = message.reply;
  if (!reply) {
    return (
      <div className={cx(styles.reply, compact && styles.replySm)}>
        <p className={styles.replyText}>{message.body}</p>
      </div>
    );
  }
  if (reply.safety === "crisis") return <CrisisReply reply={reply} />;
  const [lead, ...others] = reply.contributors;
  const steps = reply.actionCards.filter((c): c is PlanCard => c.kind === "add_plan_item");
  return (
    <article
      className={cx(styles.reply, compact && styles.replySm)}
      aria-label={`Reply from ${lead ? CREW_NAMES[lead] : "your crew"}`}
    >
      <Eyebrow>
        {lead ? <Who role={lead} /> : null}
        {others.length > 0 ? <span>{`· with ${others.map((r) => CREW_NAMES[r]).join(", ")}`}</span> : null}
        {reply.safety === "partial" ? <Badge tone="neutral">Partial answer</Badge> : null}
      </Eyebrow>
      <p className={styles.replyText}>{reply.text}</p>
      {steps.length > 0 ? (
        <ol className={styles.steps}>
          {steps.map((card, n) => (
            <li key={card.id} className={cx(styles.step, card.item.weekStart !== null && styles.later)}>
              <span className={styles.stepN}>{card.item.weekStart !== null ? "→" : n + 1}</span>
              <div>
                <b>{card.item.title}</b> <span className={styles.stepMeta}>{stepMeta(card.item)}</span>
              </div>
              <span className={styles.stepTime}>{card.item.minutes} min</span>
            </li>
          ))}
        </ol>
      ) : null}
      <Receipt items={reply.receipt} timeZone={timeZone} />
      {reply.question ? (
        <p className={styles.question}>
          <Icon name="info" />
          <span>{reply.question}</span>
        </p>
      ) : null}
      <ActionButtons
        messageId={message.id}
        cards={reply.actionCards}
        applied={message.appliedCardIds}
        readOnly={readOnly}
      />
    </article>
  );
}
