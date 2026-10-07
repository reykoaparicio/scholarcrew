import { cx } from "@/lib/cx";
import { dateShort, daysLabel, instantShort, minutesLabel, usd } from "@/lib/format";
import { type Board, type BoardCard, SCAM_FLAG_TEXT } from "@scholarcrew/domain";
import { Badge, Button, Icon, Progress } from "@scholarcrew/ui";
import { type CardAction, cardActions, cardAmount } from "./board";
import styles from "./scholarships.module.css";

const SCAM_REASONS: ReadonlySet<string> = new Set(Object.values(SCAM_FLAG_TEXT));

export function ScholarshipCard({
  card,
  timeZone,
  readOnly,
  pending,
  onAction,
}: {
  card: BoardCard;
  timeZone: string;
  readOnly: boolean;
  pending: boolean;
  onAction: (action: CardAction) => void;
}) {
  const { scholarship: s, application: a } = card;
  const won = a.stage === "won";
  const days = card.daysUntilDeadline;
  const soon =
    days !== null &&
    days >= 0 &&
    days <= 14 &&
    (a.stage === "matched" || a.stage === "planned" || a.stage === "drafting");
  let dateChip = null;
  if (won) dateChip = <Badge tone="good">Won</Badge>;
  else if (a.stage === "submitted" && a.submittedAt)
    dateChip = <span className={styles.date}>{`Sent ${instantShort(a.submittedAt, timeZone)}`}</span>;
  else if (s.deadline)
    dateChip = (
      <span className={cx(styles.date, soon && styles.dateWarn)}>
        {soon && days !== null ? `${dateShort(s.deadline)} · ${daysLabel(days)}` : dateShort(s.deadline)}
      </span>
    );
  const verified = s.verifiedAt && !s.unverified ? `Verified ${instantShort(s.verifiedAt, timeZone)}` : null;
  return (
    <article className={styles.card} aria-label={s.name}>
      <div className={styles.top}>
        <span className={styles.amount}>{cardAmount(card)}</span>
        {s.renewable && !won ? <Badge tone="navy">Renewable</Badge> : null}
        {dateChip}
      </div>
      <a className={styles.name} href={`/scholarships/${s.slug}`}>
        {s.name}
      </a>
      <p className={styles.meta}>
        {won
          ? a.outcomeRenewable
            ? "Renewable · counts every year you keep it"
            : "One-time · counts toward year 1"
          : `${s.localLabel} · ~${minutesLabel(s.estMinutes)}`}
      </p>
      {!won && card.reasons[0] ? <p className={styles.fits}>{`Fits: ${card.reasons[0].text}`}</p> : null}
      {card.progress !== null ? <Progress value={card.progress} label="Draft progress" /> : null}
      <div className={styles.foot}>
        {won ? (
          a.thankYouSent ? (
            <Badge tone="good">Thank-you note sent</Badge>
          ) : (
            <span className={styles.meta}>Send a thank-you note</span>
          )
        ) : card.reuseStoryTitle ? (
          <span className={styles.reuse}>
            <Icon name="reuse" />
            {card.reuseStoryTitle}
          </span>
        ) : (
          <span className={styles.meta}>New writing</span>
        )}
        {won ? null : verified ? (
          <Badge tone="good">{verified}</Badge>
        ) : (
          <Badge tone="neutral" icon="info">
            Unverified
          </Badge>
        )}
      </div>
      {readOnly ? null : (
        <div className={styles.cardActions}>
          {cardActions(a).map((action, position) => (
            <Button
              key={action.key}
              size="sm"
              variant={position === 0 ? "soft" : "line"}
              disabled={pending}
              onClick={() => onAction(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}

/**
 * SC-06: flagged listings stay visible with the reason, struck through and out of the plan.
 * R2P-4: 07 also moves open cards on retired or under-review listings here (`RETIRED_TEXT`, `UNDER_REVIEW_TEXT`).
 * Their detail page 404s, so only a scam reason (`SCAM_FLAG_TEXT`) gets the "Flagged" badge and the link.
 */
export function FlaggedCard({ scholarship, reason }: Board["flagged"][number]) {
  const scam = SCAM_REASONS.has(reason);
  return (
    <article
      className={cx(styles.card, styles.flagged)}
      aria-label={`${scholarship.name} (${scam ? "flagged" : "not available"})`}
    >
      <div className={styles.top}>
        <span className={cx(styles.amount, styles.struck)}>{usd(scholarship.amountMaxUsd)}</span>
        <Badge tone={scam ? "crit" : "neutral"}>{scam ? "Flagged" : "Not available"}</Badge>
      </div>
      <span className={styles.name}>{scholarship.name}</span>
      <p className={styles.reason}>{reason}</p>
      <div className={styles.foot}>
        <span className={styles.meta}>Hidden from your plan</span>
        {scam ? <a href={`/scholarships/${scholarship.slug}`}>Why flagged?</a> : null}
      </div>
    </article>
  );
}
