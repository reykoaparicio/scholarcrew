import { dateShort, daysLabel, instantShort, usd } from "@/lib/format";
import type { ApplicationItem, College, CollegeListEntry } from "@scholarcrew/domain";
import { Badge, Button, Card, Eyebrow, Icon, Who } from "@scholarcrew/ui";
import shared from "../scholarships/shared.module.css";
import { FIT_LABEL, ITEM_STATUS_OPTIONS, OUTSIDE_POLICY_NOTE, PLAN_LABEL, testPolicyLabel } from "./colleges";
import styles from "./colleges.module.css";

const STATUS_TEXT = Object.fromEntries(ITEM_STATUS_OPTIONS.map((o) => [o.value, o.label])) as Record<
  ApplicationItem["status"],
  string
>;

/**
 * Mockup 05's side panel on the list page: the next-deadline school's checklist, money, and testing at a glance.
 * Editing lives on /colleges/[entryId], which this links to.
 */
export function CollegeSummary({
  entry,
  college,
  items,
  days,
  timeZone,
  readOnly,
}: {
  entry: CollegeListEntry;
  college: College;
  items: ApplicationItem[] | null;
  days: number | null;
  timeZone: string;
  readOnly: boolean;
}) {
  return (
    <Card padding="lg">
      <div className={shared.roomTop}>
        <Eyebrow>
          <Who role="atlas" size="sm" /> <span>{`· ${college.name}`}</span>
        </Eyebrow>
        <Badge tone="neutral">{FIT_LABEL[entry.fit]}</Badge>
      </div>
      <h2 className={styles.panelTitle}>
        {`${PLAN_LABEL[entry.plan]}${entry.deadline ? ` · ${dateShort(entry.deadline)}` : ""}`}
      </h2>
      <p className={styles.sub}>
        {[
          days !== null ? (days >= 0 ? `${daysLabel(days)} left` : "Deadline passed") : null,
          college.verifiedAt
            ? `requirements verified ${instantShort(college.verifiedAt, timeZone)}`
            : "requirements not verified yet",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <h3 className={styles.sectionTitle}>{`Checklist · ${entry.itemsDone} of ${entry.itemsTotal}`}</h3>
      {items ? (
        <ul className={styles.summaryItems}>
          {items.map((item) => (
            <li
              key={item.id}
              className={
                item.status === "done" ? styles.itemDone : item.status === "in_progress" ? styles.itemHalf : undefined
              }
            >
              <span className={styles.itemIcon} aria-hidden="true">
                {item.status === "done" ? <Icon name="check" /> : null}
              </span>
              <span className={styles.itemLabel}>{item.label}</span>
              <span className={styles.itemStatus}>{STATUS_TEXT[item.status]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={shared.muted}>Not shared.</p>
      )}
      <h3 className={styles.sectionTitle}>Money</h3>
      <ul className={styles.kv}>
        <li>
          <span>Gap / yr</span>
          <b>{entry.gapUsd === null ? "Not estimated" : usd(entry.gapUsd)}</b>
        </li>
        <li>
          <span>Aid priority</span>
          <b>
            {college.aidPriorityDate ? `Submit the FAFSA by ${dateShort(college.aidPriorityDate)}` : "No date listed"}
          </b>
        </li>
        <li>
          <span>Outside $</span>
          <b>{OUTSIDE_POLICY_NOTE[college.outsidePolicy]}</b>
        </li>
      </ul>
      <h3 className={styles.sectionTitle}>Testing</h3>
      <p className={styles.panelText}>{`${testPolicyLabel(college.testPolicy, college.superscore)}.`}</p>
      <div className={styles.balanceActions}>
        <Button variant="primary" href={`/colleges/${entry.id}`}>
          {readOnly ? "See details" : "Open checklist"}
        </Button>
        {readOnly ? null : (
          <Button
            variant="line"
            href={`/crew?prefill=${encodeURIComponent(`@Atlas what should I do next for ${college.name}?`)}`}
          >
            {`Ask about ${college.name}`}
          </Button>
        )}
      </div>
    </Card>
  );
}
